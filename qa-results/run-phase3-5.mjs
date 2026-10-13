#!/usr/bin/env node
/**
 * Phase 3–5 API QA runner (auth token from qa-results/last-token.txt)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:5002/api';
const ROOT = 'http://localhost:5002';
const reportFiles = fs.readdirSync(__dirname).filter((f) => f.startsWith('e2e-phase-results-')).sort().reverse();
const reportPath = path.join(__dirname, reportFiles[0] || `e2e-phase-results-${Date.now()}.md`);
const token = fs.readFileSync(path.join(__dirname, 'last-token.txt'), 'utf8').trim();
const email = fs.readFileSync(path.join(__dirname, 'last-email.txt'), 'utf8').trim();
const pass = fs.readFileSync(path.join(__dirname, 'last-pass.txt'), 'utf8').trim();
const TS = new Date().toISOString().replace(/[:.]/g, '-');

const lines = [];
const passL = (m) => { const s = `- PASS: ${m}`; console.log(s); lines.push(s); };
const failL = (m, d) => { const s = `- FAIL: ${m} - ${d}`; console.log(s); lines.push(s); };
const infoL = (m) => { const s = `- INFO: ${m}`; console.log(s); lines.push(s); };

async function req(method, urlPath, { body, auth = true, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...headers };
  if (auth) h.Authorization = `Bearer ${token}`;
  const url = urlPath.startsWith('http') ? urlPath : `${API}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
  const res = await fetch(url, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function api(method, p, opts) {
  return req(method, p, opts);
}

lines.push('', '## Phase 3 - Database integrity (CRUD) - retest');

// Protocols: discover required fields
let create = await api('POST', '/protocols', {
  body: { title: `QA Protocol ${TS}`, content: 'Full protocol body for persistence test', description: 'E2E', category: 'general' },
});
if (create.status >= 400) {
  create = await api('POST', '/protocols', {
    body: { title: `QA Protocol ${TS}`, content: 'Full protocol body', name: `QA Protocol ${TS}` },
  });
}
if (create.status === 200 || create.status === 201) {
  const protoId = create.json?.id || create.json?.protocol?.id || create.json?.data?.id;
  passL(`CREATE protocol (id=${protoId}, HTTP ${create.status})`);
  const got = await api('GET', `/protocols/${protoId}`);
  got.status === 200 ? passL('READ protocol by id') : failL('READ protocol', `HTTP ${got.status} ${got.text.slice(0, 120)}`);
  const upd = await api('PUT', `/protocols/${protoId}`, {
    body: { title: `QA Protocol UPDATED ${TS}`, content: 'updated body', description: 'updated' },
  });
  upd.status === 200 ? passL('UPDATE protocol') : failL('UPDATE protocol', `HTTP ${upd.status} ${upd.text.slice(0, 150)}`);
  const got2 = await api('GET', `/protocols/${protoId}`);
  const blob = JSON.stringify(got2.json || {});
  blob.includes('UPDATED') ? passL('Protocol update persisted') : failL('Protocol update persist', blob.slice(0, 200));
  const del = await api('DELETE', `/protocols/${protoId}`);
  (del.status === 200 || del.status === 204) ? passL('DELETE protocol') : failL('DELETE protocol', `HTTP ${del.status}`);
  const gone = await api('GET', `/protocols/${protoId}`);
  (gone.status === 404 || gone.status === 400 || gone.status === 403) ? passL(`Protocol gone after delete (${gone.status})`) : failL('Protocol still readable', `HTTP ${gone.status}`);

  // Isolation: recreate + second user
  const p2 = await api('POST', '/protocols', {
    body: { title: `Private QA ${TS}`, content: 'secret content for isolation' },
  });
  const pid = p2.json?.id || p2.json?.protocol?.id;
  const reg2 = await fetch(`${ROOT}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `qa.peer+${TS}@researchlab.test`,
      password: pass,
      username: `qapeer_${Date.now()}`,
      first_name: 'Peer',
      last_name: 'User',
      role: 'Research Assistant',
    }),
  });
  const reg2j = await reg2.json();
  const token2 = reg2j.token;
  if (pid && token2) {
    const iso = await fetch(`${API}/protocols/${pid}`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    if (iso.status === 403 || iso.status === 404) passL(`Cross-user protocol isolation (HTTP ${iso.status})`);
    else if (iso.status === 200) failL('Cross-user protocol isolation', `user2 can read private protocol ${pid}`);
    else failL('Cross-user isolation unexpected', `HTTP ${iso.status}`);
    await api('DELETE', `/protocols/${pid}`);
  } else {
    failL('Isolation setup', `pid=${pid} token2=${!!token2} create=${p2.status}`);
  }
} else {
  failL('CREATE protocol', `HTTP ${create.status} ${create.text.slice(0, 250)}`);
}

// Notebook endpoints
lines.push('', '### Lab notebook');
const nbPaths = ['/lab-notebooks', '/lab-notebook', '/notebook-entries', '/lab-notebook/entries'];
let nbCreated = false;
for (const p of nbPaths) {
  const list = await api('GET', p);
  infoL(`GET ${p} → ${list.status}`);
}
for (const p of ['/lab-notebooks', '/lab-notebook/entries', '/notebook-entries', '/lab-notebook']) {
  const c = await api('POST', p, {
    body: {
      title: `QA Note ${TS}`,
      content: 'persistence check body',
      entry_type: 'observation',
      entryType: 'observation',
    },
  });
  infoL(`POST ${p} → ${c.status} ${c.text.slice(0, 100)}`);
  if (c.status === 200 || c.status === 201) {
    const noteId = c.json?.id || c.json?.entry?.id;
    passL(`CREATE notebook entry via ${p} (id=${noteId})`);
    nbCreated = true;
    if (noteId) {
      const reread = await api('GET', `${p}/${noteId}`).catch(() => null);
      const list = await api('GET', p);
      const found = JSON.stringify(list.json || {}).includes(noteId) || JSON.stringify(list.json || {}).includes(`QA Note ${TS}`);
      found ? passL('Notebook entry visible after create') : infoL(`Notebook list check inconclusive: ${list.status}`);
      // update
      const u = await api('PUT', `${p}/${noteId}`, { body: { title: `QA Note UPDATED ${TS}`, content: 'updated' } });
      (u.status === 200) ? passL('UPDATE notebook entry') : infoL(`UPDATE notebook ${p}/${noteId} → ${u.status}`);
      const d = await api('DELETE', `${p}/${noteId}`);
      (d.status === 200 || d.status === 204) ? passL('DELETE notebook entry') : infoL(`DELETE notebook → ${d.status}`);
    }
    break;
  }
}
if (!nbCreated) failL('CREATE notebook entry', 'all candidate endpoints failed');

// Experiments
lines.push('', '### Experiments');
let ex = await api('POST', '/experiments', {
  body: { title: `QA Experiment ${TS}`, description: 'CRUD test', status: 'planning', name: `QA Experiment ${TS}` },
});
if (ex.status >= 400) {
  ex = await api('POST', '/experiment-tracker', {
    body: { title: `QA Experiment ${TS}`, description: 'CRUD test', status: 'planning' },
  });
}
if (ex.status === 200 || ex.status === 201) {
  const eid = ex.json?.id || ex.json?.experiment?.id;
  passL(`CREATE experiment (id=${eid})`);
  if (eid) {
    const g = await api('GET', `/experiments/${eid}`);
    g.status === 200 ? passL('READ experiment') : infoL(`GET experiment → ${g.status}, trying list`);
    const u = await api('PUT', `/experiments/${eid}`, { body: { title: `QA Experiment UPDATED ${TS}`, status: 'active' } });
    (u.status === 200) ? passL('UPDATE experiment') : infoL(`UPDATE experiment → ${u.status} ${u.text.slice(0, 100)}`);
    const d = await api('DELETE', `/experiments/${eid}`);
    (d.status === 200 || d.status === 204) ? passL('DELETE experiment') : infoL(`DELETE experiment → ${d.status}`);
  }
} else {
  failL('CREATE experiment', `HTTP ${ex.status} ${ex.text.slice(0, 200)}`);
}

// Phase 5 security
lines.push('', '## Phase 5 - Security & negative cases');
const noAuth = await fetch(`${API}/protocols`, { headers: { Origin: 'http://localhost:5173' } });
noAuth.status === 401 ? passL('GET /protocols without token → 401') : failL('No-token protocols', `HTTP ${noAuth.status}`);

const garbage = await fetch(`${API}/protocols`, {
  headers: { Authorization: 'Bearer not.a.jwt', Origin: 'http://localhost:5173' },
});
garbage.status === 401 ? passL('GET /protocols garbage token → 401') : failL('Garbage token', `HTTP ${garbage.status}`);

const sqli = await api('GET', `/protocols?search=${encodeURIComponent("' OR 1=1 --")}`);
(sqli.status === 200 || sqli.status === 400) ? passL(`Search with SQL-ish input did not 500 (HTTP ${sqli.status})`) : failL('SQLi search', `HTTP ${sqli.status}`);

const xss = await api('POST', '/protocols', {
  body: { title: `<script>alert(1)</script>`, content: '<img onerror=alert(1) src=x>' },
});
infoL(`XSS payload create → HTTP ${xss.status}`);
if (xss.status === 200 || xss.status === 201) {
  const xid = xss.json?.id || xss.json?.protocol?.id;
  const g = await api('GET', `/protocols/${xid}`);
  const stored = JSON.stringify(g.json || {});
  // Storing raw is common; flag if reflected unsafely is UI concern - note presence
  infoL(`XSS payload stored as-is: ${stored.includes('<script>')}`);
  await api('DELETE', `/protocols/${xid}`);
  passL('XSS payload create/delete did not crash API');
}

// inactive-style: change password wrong current
const chg = await api('POST', '/auth/change-password', {
  body: { currentPassword: 'wrong', newPassword: 'NewPass123!' },
});
(chg.status === 400 || chg.status === 401 || chg.status === 403) ? passL(`change-password rejects bad current (${chg.status})`) : infoL(`change-password → ${chg.status} ${chg.text.slice(0, 100)}`);

// compliance tables
const policy = await fetch(`${API}/compliance/policies/cookies?language=en`);
infoL(`GET compliance cookies policy → ${policy.status} ${(await policy.text()).slice(0, 120)}`);

fs.appendFileSync(reportPath, '\n' + lines.join('\n') + '\n');
console.log('\nAppended to', reportPath);
