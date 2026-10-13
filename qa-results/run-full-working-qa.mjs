/**
 * Full working QA smoke - routes, API CRUD, DB connectivity.
 * Run: node qa-results/run-full-working-qa.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:5002';
const FE = process.env.FE_URL || 'http://127.0.0.1:5173';
const EMAIL = process.env.DEMO_AUTH_EMAIL || 'researcher@researchlab.com';
const PASSWORD = process.env.DEMO_AUTH_PASSWORD || 'researcher123';

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/cookies',
  '/cookie-preferences',
  '/privacy-rights',
  '/terms',
  '/support',
];

const PROTECTED_ROUTES = [
  '/dashboard',
  '/lab-notebook',
  '/lab-workspace',
  '/experiment-tracker',
  '/protocols',
  '/data-results',
  '/research-databank',
  '/marketplace',
  '/marketplace/supplier',
  '/marketplace/provider',
  '/negative-results',
  '/project-management',
  '/pi-review-dashboard',
  '/data-analysis',
  '/data-analytics',
  '/collaboration-networking',
  '/events-opportunities',
  '/grants-fundings',
  '/profile',
  '/settings',
  '/conference-news',
  '/notifications',
  '/help-forum',
  '/current-trends',
];

const REDIRECT_ROUTES = [
  ['/home', '/dashboard'],
  ['/professional-protocols', '/protocols'],
  ['/research-tools', '/dashboard'],
  ['/research-assistant', '/dashboard'],
  ['/my-portfolio', '/profile'],
  ['/scientist-passport', '/profile'],
  ['/supplier-marketplace', '/marketplace'],
];

const report = {
  startedAt: new Date().toISOString(),
  api: [],
  crud: [],
  publicRoutes: [],
  protectedRoutes: [],
  redirects: [],
  forms: [],
  summary: {},
};

async function api(method, pathName, { token, body } = {}) {
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html or empty */
  }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 200) };
}

function record(list, name, ok, detail = {}) {
  list.push({ name, ok, ...detail });
}

async function runApiAndCrud() {
  const health = await api('GET', '/api/health');
  record(report.api, 'GET /api/health', health.ok && health.json?.database === 'MySQL', {
    status: health.status,
    database: health.json?.database,
  });

  const bad = await api('POST', '/api/auth/login', {
    body: { email: 'nope@example.com', password: 'wrongpass99' },
  });
  record(report.api, 'POST /api/auth/login invalid', bad.status === 401, { status: bad.status });

  const login = await api('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.json?.token;
  record(report.api, 'POST /api/auth/login demo', !!token, { status: login.status });

  if (!token) return null;

  const profile = await api('GET', '/api/auth/profile', { token });
  record(report.api, 'GET /api/auth/profile', profile.ok, { status: profile.status });

  // --- Notebook CRUD ---
  const nbList = await api('GET', '/api/lab-notebooks', { token });
  record(report.crud, 'notebook LIST', nbList.ok, { status: nbList.status });

  const stamp = Date.now();
  const nbCreate = await api('POST', '/api/lab-notebooks', {
    token,
    body: {
      title: `QA entry ${stamp}`,
      content: 'Working QA CRUD check',
      entry_type: 'idea',
      status: 'draft',
      tags: ['qa'],
    },
  });
  const nbId = nbCreate.json?.id || nbCreate.json?.entry?.id || nbCreate.json?.data?.id;
  record(report.crud, 'notebook CREATE', nbCreate.ok && !!nbId, {
    status: nbCreate.status,
    id: nbId,
    preview: nbCreate.text,
  });

  if (nbId) {
    const nbGet = await api('GET', `/api/lab-notebooks/${nbId}`, { token });
    record(report.crud, 'notebook READ', nbGet.ok, { status: nbGet.status });

    const nbUpdate = await api('PUT', `/api/lab-notebooks/${nbId}`, {
      token,
      body: {
        title: `QA entry ${stamp} updated`,
        content: 'Updated by working QA',
        entry_type: 'idea',
        status: 'draft',
        tags: ['qa', 'updated'],
      },
    });
    record(report.crud, 'notebook UPDATE', nbUpdate.ok, { status: nbUpdate.status, preview: nbUpdate.text });

    const nbDelete = await api('DELETE', `/api/lab-notebooks/${nbId}`, { token });
    record(report.crud, 'notebook DELETE', nbDelete.ok || nbDelete.status === 204, {
      status: nbDelete.status,
    });
  }

  // --- Protocols CRUD ---
  const protoList = await api('GET', '/api/protocols', { token });
  record(report.crud, 'protocols LIST', protoList.ok, { status: protoList.status });

  const protoCreate = await api('POST', '/api/protocols', {
    token,
    body: {
      title: `QA Protocol ${stamp}`,
      content: '1. Prepare reagents\n2. Run assay\n3. Record results',
      description: 'Working QA protocol',
      category: 'molecular_biology',
      difficulty_level: 'beginner',
      estimated_duration: 30,
      materials: ['buffer'],
      tags: ['qa'],
    },
  });
  const protoId = protoCreate.json?.id || protoCreate.json?.protocol?.id;
  record(report.crud, 'protocols CREATE', protoCreate.ok && !!protoId, {
    status: protoCreate.status,
    id: protoId,
    preview: protoCreate.text,
  });

  if (protoId) {
    const protoGet = await api('GET', `/api/protocols/${protoId}`, { token });
    record(report.crud, 'protocols READ', protoGet.ok, { status: protoGet.status });

    const protoUpdate = await api('PUT', `/api/protocols/${protoId}`, {
      token,
      body: {
        title: `QA Protocol ${stamp} updated`,
        description: 'Updated',
        category: 'molecular_biology',
        materials: ['buffer', 'enzyme'],
        tags: ['qa'],
      },
    });
    record(report.crud, 'protocols UPDATE', protoUpdate.ok, {
      status: protoUpdate.status,
      preview: protoUpdate.text,
    });

    const protoDelete = await api('DELETE', `/api/protocols/${protoId}`, { token });
    record(report.crud, 'protocols DELETE', protoDelete.ok || protoDelete.status === 204, {
      status: protoDelete.status,
    });
  }

  // --- Experiments CRUD ---
  const expList = await api('GET', '/api/experiments', { token });
  record(report.crud, 'experiments LIST', expList.ok, { status: expList.status });

  const expCreate = await api('POST', '/api/experiments', {
    token,
    body: {
      title: `QA Experiment ${stamp}`,
      description: 'Working QA experiment',
      hypothesis: 'It works',
      status: 'planning',
      priority: 'medium',
      category: 'other',
      tags: ['qa'],
    },
  });
  const expId = expCreate.json?.id || expCreate.json?.data?.id;
  record(report.crud, 'experiments CREATE', expCreate.ok && !!expId, {
    status: expCreate.status,
    id: expId,
    preview: expCreate.text,
  });

  if (expId) {
    const expGet = await api('GET', `/api/experiments/${expId}`, { token });
    record(report.crud, 'experiments READ', expGet.ok, { status: expGet.status });

    const expUpdate = await api('PUT', `/api/experiments/${expId}`, {
      token,
      body: { title: `QA Experiment ${stamp} updated`, status: 'planning', priority: 'high' },
    });
    record(report.crud, 'experiments UPDATE', expUpdate.ok, {
      status: expUpdate.status,
      preview: expUpdate.text,
    });

    const expDelete = await api('DELETE', `/api/experiments/${expId}`, { token });
    record(report.crud, 'experiments DELETE', expDelete.ok || expDelete.status === 204, {
      status: expDelete.status,
    });
  }

  // --- Supporting reads ---
  for (const [name, p] of [
    ['labs LIST', '/api/labs'],
    ['labs MINE', '/api/labs/mine'],
    ['settings', '/api/settings'],
    ['recommendations protocols', '/api/recommendations/protocols'],
    ['grants', '/api/grants'],
    ['notifications', '/api/notifications'],
    ['marketplace', '/api/marketplace'],
    ['marketplace suppliers', '/api/marketplace/suppliers'],
    ['negative-results my submissions', '/api/negative-results/my/submissions'],
  ]) {
    const r = await api('GET', p, { token });
    // 404 table-missing still recorded as fail for visibility
    record(report.api, `GET ${p}`, r.ok, { status: r.status, preview: r.text });
  }

  return token;
}

async function dismissOverlays(page) {
  // Cookie banner blocks bottom sidebar clicks
  const candidates = [
    page.getByRole('button', { name: /accept all/i }),
    page.getByRole('button', { name: /accept/i }),
    page.getByRole('button', { name: /got it/i }),
    page.getByRole('button', { name: /agree/i }),
    page.getByRole('button', { name: /necessary only/i }),
  ];
  for (const btn of candidates) {
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      break;
    }
  }
}

async function crawlRoutes(token) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

  for (const route of PUBLIC_ROUTES) {
    pageErrors.length = 0;
    try {
      const res = await page.goto(`${FE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(600);
      await dismissOverlays(page);
      const body = (await page.locator('body').innerText().catch(() => '')).trim();
      const crash = pageErrors.some(
        (e) =>
          /Cannot read|is not a function|undefined is not|TypeError:/.test(e) &&
          !/Failed to fetch/i.test(e)
      );
      const ok = !!res && res.status() < 400 && body.length > 0 && !crash;
      record(report.publicRoutes, route, ok, {
        status: res?.status(),
        errors: pageErrors.slice(0, 3),
        bodyLen: body.length,
      });
    } catch (e) {
      record(report.publicRoutes, route, false, { errors: [String(e.message || e)] });
    }
  }

  // Login for protected
  await page.goto(`${FE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: Date.now(),
      })
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await dismissOverlays(page);
  record(report.forms, 'login form → dashboard', page.url().includes('/dashboard'), {
    url: page.url(),
  });

  for (const route of PROTECTED_ROUTES) {
    pageErrors.length = 0;
    try {
      const res = await page.goto(`${FE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(900);
      await dismissOverlays(page);
      const url = page.url();
      const bouncedToLogin = /\/login/.test(url);
      const body = (await page.locator('body').innerText().catch(() => '')).trim();
      const crash = pageErrors.some((e) =>
        /Cannot read|is not a function|undefined is not|TypeError:/.test(e) &&
        !/Failed to fetch/i.test(e)
      );
      const ok =
        !bouncedToLogin &&
        !!res &&
        res.status() < 400 &&
        body.length > 20 &&
        !crash;
      record(report.protectedRoutes, route, ok, {
        status: res?.status(),
        url,
        errors: pageErrors.slice(0, 3),
        bodyLen: body.length,
      });
    } catch (e) {
      record(report.protectedRoutes, route, false, { errors: [String(e.message || e)] });
    }
  }

  // Redirects (authenticated)
  for (const [from, expectPath] of REDIRECT_ROUTES) {
    try {
      await page.goto(`${FE}${from}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);
      const url = page.url();
      const ok = url.includes(expectPath);
      record(report.redirects, `${from} → ${expectPath}`, ok, { url });
    } catch (e) {
      record(report.redirects, `${from} → ${expectPath}`, false, { errors: [String(e.message || e)] });
    }
  }

  // Sidebar key buttons/links
  await page.goto(`${FE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await dismissOverlays(page);
  const sideLinks = [
    'Personal notebook',
    'Protocol library',
    'Lab workspace',
    'Settings',
  ];
  for (const name of sideLinks) {
    try {
      await dismissOverlays(page);
      const link = page.getByRole('link', { name });
      const visible = await link.isVisible().catch(() => false);
      if (visible) {
        await link.click({ force: true, timeout: 10000 });
        await page.waitForTimeout(700);
        record(report.forms, `sidebar link: ${name}`, !/\/login/.test(page.url()), {
          url: page.url(),
        });
      } else {
        record(report.forms, `sidebar link: ${name}`, false, { reason: 'not visible' });
      }
    } catch (e) {
      record(report.forms, `sidebar link: ${name}`, false, { errors: [String(e.message || e)] });
    }
  }

  // Register form presence
  await page.goto(`${FE}/register`, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  const hasEmail = await page.locator('#email, input[name="email"], input[type="email"]').first().isVisible().catch(() => false);
  const hasPassword = await page.locator('#password, input[name="password"], input[type="password"]').first().isVisible().catch(() => false);
  record(report.forms, 'register form fields', hasEmail && hasPassword, { hasEmail, hasPassword });

  // Notebook new-entry UI
  await page.goto(`${FE}/lab-notebook`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await dismissOverlays(page);
  const newEntry = await page.getByText('New notebook entry').isVisible().catch(() => false);
  const search = await page.getByPlaceholder('Search entries...').isVisible().catch(() => false);
  record(report.forms, 'notebook entry UI', newEntry && search, { newEntry, search });

  // Protocol write button
  await page.goto(`${FE}/protocols`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  const writeBtn = await page.getByRole('button', { name: /Write protocol/i }).first().isVisible().catch(() => false);
  record(report.forms, 'protocols write button', writeBtn, {});

  // Experiments new button
  await page.goto(`${FE}/experiment-tracker`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);
  const newExp = await page.getByRole('button', { name: /New experiment/i }).isVisible().catch(() => false);
  record(report.forms, 'experiments new button', newExp, {});

  await browser.close();
}

function summarize() {
  const all = [
    ...report.api,
    ...report.crud,
    ...report.publicRoutes,
    ...report.protectedRoutes,
    ...report.redirects,
    ...report.forms,
  ];
  const passed = all.filter((x) => x.ok).length;
  const failed = all.filter((x) => !x.ok).length;
  report.summary = {
    total: all.length,
    passed,
    failed,
    verdict: failed === 0 ? 'PASS' : failed <= 5 ? 'PASS_WITH_WARNINGS' : 'FAIL',
    failedItems: all.filter((x) => !x.ok).map((x) => ({ area: guessArea(x), name: x.name, status: x.status, errors: x.errors, preview: x.preview })),
  };
  report.finishedAt = new Date().toISOString();
}

function guessArea(item) {
  if (report.api.includes(item)) return 'api';
  if (report.crud.includes(item)) return 'crud';
  if (report.publicRoutes.includes(item)) return 'public';
  if (report.protectedRoutes.includes(item)) return 'protected';
  if (report.redirects.includes(item)) return 'redirect';
  return 'forms';
}

const token = await runApiAndCrud();
await crawlRoutes(token);
summarize();

const outJson = path.join(__dirname, 'full-working-qa.json');
const outMd = path.join(__dirname, 'FULL_WORKING_QA.md');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const failLines = report.summary.failedItems
  .map((f) => `- **[${f.area}]** ${f.name}${f.status ? ` (HTTP ${f.status})` : ''}${f.errors?.length ? ` - ${f.errors[0]}` : ''}${f.preview ? ` - ${String(f.preview).slice(0, 80)}` : ''}`)
  .join('\n');

fs.writeFileSync(
  outMd,
  `# Full Working QA\n\n**Verdict:** ${report.summary.verdict}  \n**Score:** ${report.summary.passed}/${report.summary.total}  \n**When:** ${report.finishedAt}\n\n## Failures\n\n${failLines || '_None_'}\n\nSee \`full-working-qa.json\` for details.\n`
);

console.log(JSON.stringify(report.summary, null, 2));
console.log('Wrote', outJson);
process.exit(report.summary.verdict === 'FAIL' ? 1 : 0);
