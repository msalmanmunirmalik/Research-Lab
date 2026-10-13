import { createRequire } from 'module';
import { spawn, type ChildProcess } from 'child_process';
import { request as httpRequest } from 'http';
import { createConnection, type Connection } from 'mysql2/promise';
import { hash } from 'bcrypt';

const nodeRequire = createRequire(process.cwd() + '/package.json');
const dotenv = nodeRequire('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config();

const DB = 'researchlab_sprint7_idor';
const PORT = '5017';
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'NewPass123';

jest.setTimeout(180000);

type User = { id: string; email: string; token: string };

let adminConn: Connection;
let server: ChildProcess | null = null;
let serverLog = '';

function mysqlConfig(database?: string) {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    socketPath: process.env.MYSQL_SOCKET || undefined,
    database,
    multipleStatements: true,
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${err.slice(-2000)}`));
    });
  });
}

async function waitForHealth(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    try {
      const response = await api(null, 'GET', '/api/health');
      if (response.status === 200) return;
    } catch {
      /* server still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`IDOR API did not become healthy\n${serverLog.slice(-2000)}`);
}

function api(token: string | null, method: string, path: string, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{ status: number; json: any; text: string }>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: Number(PORT),
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function insertUser(id: string, email: string, username: string): Promise<void> {
  const passwordHash = await hash(PASSWORD, 4);
  await adminConn.query(
    `INSERT INTO users (id, email, username, password_hash, first_name, last_name, role, status, email_verified)
     VALUES (?, ?, ?, ?, 'Idor', 'User', 'student', 'active', 1)`,
    [id, email, username, passwordHash]
  );
}

async function login(email: string): Promise<string> {
  const response = await api(null, 'POST', '/api/auth/login', { email, password: PASSWORD });
  if (response.status !== 200 || !response.json.token) {
    throw new Error(`login failed ${response.status} ${response.text.slice(0, 200)}`);
  }
  return response.json.token;
}

beforeAll(async () => {
  const root = await createConnection(mysqlConfig());
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(
    `CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  await root.end();

  const env = { ...process.env, MYSQL_DB: DB, PORT };
  await run('pnpm', ['db:migrate'], env);

  adminConn = await createConnection(mysqlConfig(DB));
  await insertUser('idor-owner', 'idor-owner@example.com', 'idor_owner');
  await insertUser('idor-member', 'idor-member@example.com', 'idor_member');
  await insertUser('idor-other', 'idor-other@example.com', 'idor_other');
  await insertUser('idor-none', 'idor-none@example.com', 'idor_none');
  await adminConn.query(
    `INSERT INTO labs (id, name, institution, department) VALUES (?, 'Lab A', 'Institute', 'Biology'), (?, 'Lab B', 'Institute', 'Chemistry')`,
    ['lab-a', 'lab-b']
  );
  await adminConn.query(
    `INSERT INTO lab_members (id, lab_id, user_id, role, is_active) VALUES
      ('mem-owner', 'lab-a', 'idor-owner', 'student', 1),
      ('mem-member', 'lab-a', 'idor-member', 'student', 1),
      ('mem-other', 'lab-b', 'idor-other', 'student', 1)`
  );

  server = spawn('pnpm', ['exec', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk: Buffer) => {
    serverLog += String(chunk);
    if (serverLog.length > 12000) serverLog = serverLog.slice(-8000);
  };
  server.stdout?.on('data', capture);
  server.stderr?.on('data', capture);
  await waitForHealth();
});

afterAll(async () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
  if (adminConn) await adminConn.end();
  const root = await createConnection(mysqlConfig());
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.end();
});

async function expectHidden(token: string, path: string, title: string, allowed: Array<number>) {
  const response = await api(token, 'GET', path);
  expect(allowed).toContain(response.status);
  expect(response.text).not.toContain(title);
}

describe('lifecycle IDOR matrix', () => {
  let owner: User;
  let member: User;
  let other: User;
  let none: User;

  beforeAll(async () => {
    owner = { id: 'idor-owner', email: 'idor-owner@example.com', token: await login('idor-owner@example.com') };
    member = { id: 'idor-member', email: 'idor-member@example.com', token: await login('idor-member@example.com') };
    other = { id: 'idor-other', email: 'idor-other@example.com', token: await login('idor-other@example.com') };
    none = { id: 'idor-none', email: 'idor-none@example.com', token: await login('idor-none@example.com') };
  });

  async function matrix(options: {
    label: string;
    title: string;
    create: () => Promise<{ status: number; json: any; text: string }>;
    idOf: (json: any) => string;
    ownerOf: (json: any) => string;
    path: (id: string) => string;
    update: (id: string) => Promise<{ status: number; json: any; text: string }>;
    memberReads: boolean;
  }) {
    const created = await options.create();
    if (created.status !== 201) {
      throw new Error(`${created.status} ${created.text.slice(0, 400)}\n${serverLog.slice(-2500)}`);
    }
    const id = options.idOf(created.json);
    expect(options.ownerOf(created.json)).toBe(owner.id);

    const own = await api(owner.token, 'GET', options.path(id));
    expect(own.status).toBe(200);
    expect(own.text).toContain(options.title);

    const updated = await options.update(id);
    expect(updated.status).toBe(200);

    const sameLab = await api(member.token, 'GET', options.path(id));
    if (options.memberReads) {
      expect(sameLab.status).toBe(200);
      const memberUpdate = await api(member.token, 'PUT', options.path(id), { title: 'should-not-apply', content: 'x' });
      expect(memberUpdate.status).toBe(403);
    } else {
      expect(sameLab.status).toBe(404);
      expect(sameLab.text).not.toContain(options.title);
      const memberUpdate = await api(member.token, 'PUT', options.path(id), { title: 'should-not-apply' });
      expect(memberUpdate.status).toBe(404);
      expect(memberUpdate.text).not.toContain(options.title);
    }

    await expectHidden(other.token, options.path(id), options.title, [403, 404]);
    await expectHidden(none.token, options.path(id), options.title, [403, 404]);
    const missing = await api(owner.token, 'GET', options.path('missing-id'));
    expect(missing.status).toBe(404);
  }

  test('notebook entries, including a comment on another user entry', async () => {
    const title = 'idor-notebook-secret';
    await matrix({
      label: 'notebook',
      title,
      create: () => api(owner.token, 'POST', '/api/lab-notebooks', {
        title,
        content: 'notes',
        lab_id: 'lab-a',
        privacy_level: 'lab',
        user_id: other.id,
      }),
      idOf: (json) => json.entry.id,
      ownerOf: (json) => json.entry.user_id,
      path: (id) => `/api/lab-notebooks/${id}`,
      update: (id) => api(owner.token, 'PUT', `/api/lab-notebooks/${id}`, { title, content: 'notes revised' }),
      memberReads: true,
    });

    const created = await api(owner.token, 'POST', '/api/lab-notebooks', {
      title: 'idor-notebook-comment',
      content: 'notes',
      lab_id: 'lab-a',
      privacy_level: 'lab',
      user_id: other.id,
    });
    const entryId = created.json.entry.id;
    const allowed = await api(member.token, 'POST', `/api/lab-notebooks/${entryId}/comments`, {
      comment_text: 'same-lab note',
      user_id: other.id,
    });
    expect(allowed.status).toBe(201);
    expect(allowed.json.comment.user_id).toBe(member.id);

    const denied = await api(other.token, 'POST', `/api/lab-notebooks/${entryId}/comments`, {
      comment_text: 'cross-lab leak',
      parent_comment_id: allowed.json.comment.id,
    });
    expect([403, 404]).toContain(denied.status);
    expect(denied.text).not.toContain('same-lab note');

    const listed = await api(other.token, 'GET', `/api/lab-notebooks/${entryId}/comments`);
    expect([403, 404]).toContain(listed.status);
    expect(listed.text).not.toContain('same-lab note');
  });

  test('protocols', async () => {
    const title = 'idor-protocol-secret';
    await matrix({
      label: 'protocol',
      title,
      create: () => api(owner.token, 'POST', '/api/protocols', {
        title,
        content: 'steps',
        lab_id: 'lab-a',
        privacy_level: 'lab',
        user_id: other.id,
      }),
      idOf: (json) => json.protocol.id,
      ownerOf: (json) => json.protocol.author_id,
      path: (id) => `/api/protocols/${id}`,
      update: (id) => api(owner.token, 'PUT', `/api/protocols/${id}`, {
        title,
        content: 'steps revised',
        description: 'd',
      }),
      memberReads: true,
    });
  });

  test('experiments stay with the owner or a collaborator', async () => {
    const title = 'idor-experiment-secret';
    await matrix({
      label: 'experiment',
      title,
      create: () => api(owner.token, 'POST', '/api/experiments', {
        title,
        description: 'goal',
        labId: 'lab-a',
        researcher_id: other.id,
        user_id: other.id,
      }),
      idOf: (json) => json.id,
      ownerOf: (json) => json.researcher_id,
      path: (id) => `/api/experiments/${id}`,
      update: (id) => api(owner.token, 'PUT', `/api/experiments/${id}`, { title: `${title} revised` }),
      memberReads: false,
    });
  });

  test('research evidence', async () => {
    const title = 'idor-evidence-secret';
    await matrix({
      label: 'evidence',
      title,
      create: () => api(owner.token, 'POST', '/api/data/results', {
        title,
        summary: 'evidence',
        lab_id: 'lab-a',
        privacy_level: 'lab',
        user_id: other.id,
      }),
      idOf: (json) => json.id,
      ownerOf: (json) => json.user_id,
      path: (id) => `/api/data/results/${id}`,
      update: (id) => api(owner.token, 'PUT', `/api/data/results/${id}`, { title: `${title} revised` }),
      memberReads: true,
    });
  });
});
