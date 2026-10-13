#!/usr/bin/env node
/**
 * Beachhead smoke: health + optional authenticated evidence-chain API walk.
 *
 * Usage:
 *   node scripts/rilos-beachhead-smoke.mjs
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/rilos-beachhead-smoke.mjs
 *
 * Env:
 *   API_BASE          default http://127.0.0.1:5002
 *   SMOKE_EMAIL       if set with SMOKE_PASSWORD, runs create chain
 *   SMOKE_PASSWORD
 *   SMOKE_LAB_ID      optional lab id for creates (omit to skip lab-bound steps)
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {
  /* dotenv optional */
}

const API_BASE = (process.env.API_BASE || process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:5002').replace(
  /\/$/,
  ''
);
const email = process.env.SMOKE_EMAIL || '';
const password = process.env.SMOKE_PASSWORD || '';
const labId = process.env.SMOKE_LAB_ID || '';

const stamp = Date.now();
const failures = [];

async function req(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, text };
}

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  failures.push(label);
}

console.log(`RILOS beachhead smoke → ${API_BASE}`);

const health = await req('GET', '/api/health');
if (health.status === 200) pass('GET /api/health');
else fail('GET /api/health', `status ${health.status}`);

if (!email || !password) {
  console.log('\nAuth chain skipped (set SMOKE_EMAIL + SMOKE_PASSWORD to exercise create path).');
  console.log('Manual UI checklist: docs/RILOS_WORKFLOW_QA_CHECKLIST.md');
  process.exit(failures.length ? 1 : 0);
}

const login = await req('POST', '/api/auth/login', { body: { email, password } });
if (login.status !== 200 || !login.json.token) {
  fail('POST /api/auth/login', `${login.status} ${login.text.slice(0, 160)}`);
  process.exit(1);
}
pass('POST /api/auth/login');
const token = login.json.token;

const me = await req('GET', '/api/auth/me', { token });
if (me.status === 200 && (me.json.user?.id || me.json.id)) pass('GET /api/auth/me');
else fail('GET /api/auth/me', `status ${me.status}`);

const title = `smoke-${stamp}`;

const protocol = await req('POST', '/api/protocols', {
  token,
  body: {
    title: `${title}-protocol`,
    content: '1. Prepare\n2. Run\n3. Record',
    description: 'Beachhead smoke protocol',
    lab_id: labId || undefined,
    privacy_level: labId ? 'lab' : 'private',
  },
});
const protocolId = protocol.json?.protocol?.id;
if (protocol.status === 201 && protocolId) pass('POST /api/protocols');
else fail('POST /api/protocols', `${protocol.status} ${protocol.text.slice(0, 160)}`);

const experiment = await req('POST', '/api/experiments', {
  token,
  body: {
    title: `${title}-experiment`,
    description: 'Beachhead smoke experiment',
    labId: labId || undefined,
    protocolId: protocolId || undefined,
  },
});
const experimentId = experiment.json?.id;
if (experiment.status === 201 && experimentId) pass('POST /api/experiments');
else fail('POST /api/experiments', `${experiment.status} ${experiment.text.slice(0, 160)}`);

const notebook = await req('POST', '/api/lab-notebooks', {
  token,
  body: {
    title: `${title}-notebook`,
    content: 'Observed during beachhead smoke.',
    lab_id: labId || undefined,
    privacy_level: labId ? 'lab' : 'private',
    experiment_id: experimentId || undefined,
    protocol_id: protocolId || undefined,
  },
});
const notebookId = notebook.json?.entry?.id;
if (notebook.status === 201 && notebookId) pass('POST /api/lab-notebooks');
else fail('POST /api/lab-notebooks', `${notebook.status} ${notebook.text.slice(0, 160)}`);

const evidence = await req('POST', '/api/data/results', {
  token,
  body: {
    title: `${title}-evidence`,
    summary: 'Smoke evidence pack',
    lab_id: labId || undefined,
    privacy_level: labId ? 'lab' : 'private',
    experiment_id: experimentId || undefined,
    protocol_id: protocolId || undefined,
    notebook_entry_id: notebookId || undefined,
  },
});
const evidenceId = evidence.json?.id || evidence.json?.result?.id;
if ((evidence.status === 201 || evidence.status === 200) && evidenceId) {
  pass('POST /api/data/results');
} else {
  fail('POST /api/data/results', `${evidence.status} ${evidence.text.slice(0, 160)}`);
}

const reads = [
  protocolId && [`GET /api/protocols/${protocolId}`, `/api/protocols/${protocolId}`],
  experimentId && [`GET /api/experiments/${experimentId}`, `/api/experiments/${experimentId}`],
  notebookId && [`GET /api/lab-notebooks/${notebookId}`, `/api/lab-notebooks/${notebookId}`],
  evidenceId && [`GET /api/data/results/${evidenceId}`, `/api/data/results/${evidenceId}`],
].filter(Boolean);

for (const [label, path] of reads) {
  const got = await req('GET', path, { token });
  if (got.status === 200) pass(label);
  else fail(label, `status ${got.status}`);
}

const demo = await req('POST', '/api/onboarding/demo-chain', { token, body: {} });
if (demo.status === 201 && demo.json?.chain?.evidenceId) {
  const c = demo.json.chain;
  if (c.protocolId && c.experimentId && c.notebookEntryId && c.evidenceId) {
    pass('POST /api/onboarding/demo-chain (linked 4-node chain)');
  } else {
    fail('POST /api/onboarding/demo-chain', 'missing linked ids');
  }
} else {
  fail('POST /api/onboarding/demo-chain', `${demo.status} ${demo.text.slice(0, 160)}`);
}

console.log(failures.length ? `\nFAILED (${failures.length})` : '\nBeachhead API smoke OK');
process.exit(failures.length ? 1 : 0);
