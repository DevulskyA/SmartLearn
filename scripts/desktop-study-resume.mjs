// Interrupted study session in the REAL native Windows Desktop runtime (Tauri + WebView2), driven through CDP.
//
// Question answered: when the student is in the middle of "Estudar agora" and the app is closed (or killed), does the next launch
// offer to CONTINUE from the next question, and does finishing the pass leave exactly ONE evidence row that covers the whole pass?
// e2e/study-resume.spec.js proves this for a browser reload; it cannot prove it for a native restart, where the backend (and so the
// web origin, http://127.0.0.1:<port>) is started again, and the WebView keeps the resume snapshot per origin. Same data rules as
// scripts/desktop-study-journey.mjs: a throwaway directory under the OS temp dir, no model call, no human datastore, no running
// Desktop touched. The harness below is a deliberate small copy of that script's launch/shutdown helpers (the journey is a proven
// instrument and is left untouched).
//
// Usage: node scripts/desktop-study-resume.mjs            -> graceful window close in the middle of the pass
//        SL_RESUME_KILL=1 node scripts/desktop-study-resume.mjs -> forced kill of the whole process tree (crash / power loss)
//        SL_RESUME_SETTLE_MS=10000 (with SL_RESUME_KILL=1)      -> wait that long after the last answer before the kill
// Prints ONE JSON object; exit code 0 only when every step passes. Same build prerequisites as the journey.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target');
const exe = resolve(process.env.SL_JOURNEY_EXE ?? join(targetDir, 'debug', 'smartlearn.exe'));
const FORCED = process.env.SL_RESUME_KILL === '1';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const identity = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const expectedTitle = `SmartLearn DEV - v${identity.version} - ${head}`;

const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  s.on('error', fail);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (command) => execFileSync('powershell', ['-NoProfile', '-Command', `${command}; exit 0`], { encoding: 'utf8' }).trim();
const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

if (!existsSync(exe)) throw new Error(`debug executable missing: ${exe} (run cargo build in src-tauri)`);
const runningSame = ps(`Get-Process -Name smartlearn -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }`).split(/\r?\n/).map((p) => p.trim().toLowerCase()).filter(Boolean);
if (runningSame.includes(exe.toLowerCase())) throw new Error(`refusing to start: ${exe} is already running (it is someone else's Desktop instance)`);
const humanDevData = join(homedir(), 'SmartLearn-DevData').toLowerCase();
const work = mkdtempSync(join(tmpdir(), 'sl-desktop-resume-'));
if (work.toLowerCase().startsWith(humanDevData)) throw new Error('refusing to run against the human DEV datastore');
const dbPath = join(work, 'resume.db');

const baseEnv = {
  ...process.env,
  SMARTLEARN_LOCAL_AUTHORITY: 'true',
  SMARTLEARN_DB_PATH: dbPath,
  SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head,
  SMARTLEARN_BUILD_CONTENT: identity.inputsHash,
  SMARTLEARN_BUILD_MODE: 'DEV',
  SMARTLEARN_WINDOW_TITLE: expectedTitle,
  SMARTLEARN_DEV_PERSISTENT_SESSION: 'true',
  WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
};
for (const key of ['SMARTLEARN_AI_PROVIDER', 'SMARTLEARN_AI_CONSENT', 'SMARTLEARN_AI_API_KEY', 'SMARTLEARN_AI_MODEL', 'SMARTLEARN_AI_API_URL']) delete baseEnv[key];

const result = { head, expectedTitle, exe, mode: FORCED ? 'FORCED_KILL' : 'GRACEFUL_CLOSE', workDirKind: 'throwaway under OS temp, removed at the end', steps: [] };
const consoleErrors = [];
const password = 'a genuinely long test password 1';
const email = `resume-${Date.now()}@example.com`;
const TITLE = 'Sessao nativa interrompida';

let app; let browser; let page; let cdpPort; let closing = false;

function placeWindowOnSmallDisplay(pid) {
  if (process.env.SL_JOURNEY_NO_MOVE) return Promise.resolve({ moved: false, reason: 'SL_JOURNEY_NO_MOVE' });
  return new Promise((done) => {
    let out = '';
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'move-window-to-small-display.ps1'), '-ProcessId', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', (error) => done({ moved: false, reason: String(error.message) }));
    child.on('close', () => { try { done(JSON.parse(out.trim().split('\n').pop())); } catch { done({ moved: false, reason: `unreadable: ${out.slice(0, 120)}` }); } });
  });
}

async function launch() {
  cdpPort = await freePort();
  const env = { ...baseEnv, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` };
  app = spawn(exe, [], { env, stdio: 'ignore', windowsHide: false });
  const placement = placeWindowOnSmallDisplay(app.pid);
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* not yet */ }
    if (app.exitCode !== null) throw new Error(`smartlearn.exe exited early (${app.exitCode})`);
    if (Date.now() > deadline) throw new Error('CDP endpoint did not come up in 90 s');
    await sleep(300);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  page = undefined;
  for (let i = 0; i < 150 && !page; i += 1) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
    if (!page) await sleep(300);
  }
  if (!page) throw new Error('the Desktop window page was not found over CDP');
  const placed = await placement;
  closing = false;
  const tag = () => (closing ? '[while closing] ' : '');
  page.on('pageerror', (error) => consoleErrors.push(`${tag()}pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${tag()}console.error: ${msg.text()}`); });
  await page.waitForLoadState('networkidle');
  return placed;
}

async function shutdown({ forced }) {
  closing = true;
  const pid = app.pid;
  const children = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.ProcessId }`).split(/\r?\n/).filter(Boolean);
  await browser?.close().catch(() => {});
  browser = undefined;
  let how = 'already gone';
  if (app.exitCode === null) {
    if (forced) {
      try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
      const until = Date.now() + 20000;
      while (app.exitCode === null && Date.now() < until) await sleep(200);
      how = 'forced kill of the process tree (no graceful close, no flush hook)';
    } else {
      try { execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' }); } catch { /* window may refuse */ }
      const until = Date.now() + 20000;
      while (app.exitCode === null && Date.now() < until) await sleep(300);
      how = app.exitCode === null ? 'forced after the graceful close did not exit in 20 s' : 'graceful window close, process exited by itself';
      if (app.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
    }
  }
  await sleep(2000);
  const leftovers = children.filter((child) => ps(`Get-Process -Id ${child} -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`));
  for (const child of leftovers) { try { execFileSync('taskkill', ['/PID', child, '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(1000);
  return { how, backendChildren: children.length, backendLeftoversKilled: leftovers.length };
}

const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const base = window.__SMARTLEARN_API_BASE__;
  const headers = { 'Content-Type': 'application/json' };
  if (!path.startsWith('/v1/auth/register') && !path.startsWith('/v1/auth/login')) {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    if (me.csrfToken) headers['X-CSRF-Token'] = me.csrfToken;
  }
  const res = await fetch(`${base}${path}`, { method, credentials: 'include', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}, { method, path, body });

async function signIn() {
  await page.locator('[data-screen="account"]:visible').first().click();
  await page.waitForFunction(() => ['#account-logged-in-view', '#account-login-email'].some((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0; }), null, { timeout: 15000 });
  if (await page.locator('#account-logged-in-view').isVisible()) return 'session was still valid';
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 15000 });
  return 'signed in through the login form';
}

async function openStudyNow() {
  await page.locator('[data-screen="plan"]:visible').first().click();
  const row = page.locator('.plan-row', { hasText: TITLE });
  await row.waitFor({ state: 'visible', timeout: 10000 });
  if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded')) !== 'true') await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.locator('#screen-study-now').waitFor({ state: 'visible', timeout: 10000 });
}

const originOf = () => new URL(page.url()).origin;
const snapshotKeys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('smartlearn.studynow.')));

/** Rows straight from the throwaway SQLite file (the app must be closed). */
function dbSnapshot() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = (sql) => db.prepare(sql).all().map((r) => ({ ...r }));
    return {
      attempts: rows('SELECT a.id, a.status, e.outcome FROM exercise_attempts a LEFT JOIN learning_events e ON e.attempt_id = a.id ORDER BY a.id'),
      evidence: rows('SELECT id, unit_id AS unitId, type, questions_count AS q, correct_count AS c FROM learning_evidence ORDER BY id'),
    };
  } finally { db.close(); }
}

const state = { halted: false };
async function step(n, name, fn) {
  const entry = { step: n, name, status: 'NOT_RUN', evidence: null };
  result.steps.push(entry);
  if (state.halted) return entry;
  try {
    entry.evidence = await fn();
    entry.status = 'PASS';
  } catch (error) {
    entry.status = 'FAIL';
    entry.error = String(error?.message ?? error).split('\n').slice(0, 6).join(' | ');
    state.halted = true;
  }
  return entry;
}
const expect = (condition, message) => { if (!condition) throw new Error(`expectation failed: ${message}`); };

const ctx = {};
try {
  await step(1, 'open the isolated Desktop, sign in, create a unit with three questions', async () => {
    const placement = await launch();
    const title = ps(`(Get-Process -Id ${app.pid}).MainWindowTitle`);
    expect(title === expectedTitle, `native window title "${title}" != "${expectedTitle}"`);
    await api('POST', '/v1/auth/register', { email, password });
    const how = await signIn();
    const { unit } = await api('POST', '/v1/learning-units', { newSubjectName: 'Sessao nativa', title: TITLE, studyDate: '2030-01-01' });
    for (const i of [1, 2, 3]) await api('POST', `/v1/learning-units/${unit.id}/exercises`, { question: `${TITLE} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
    ctx.unitId = unit.id;
    ctx.originBefore = originOf();
    return { signIn: how, unitId: unit.id, origin: ctx.originBefore, windowPlacement: placement };
  });

  await step(2, 'judge two of three questions in Estudar agora (1st correct, 2nd wrong) and stop at question 3', async () => {
    await openStudyNow();
    const outcomes = ['correct', 'incorrect'];
    for (let i = 0; i < outcomes.length; i += 1) {
      await page.locator('#study-now-reveal-btn').click();
      await page.locator('#study-now-answer-text').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator(`#study-now-${outcomes[i]}-btn`).click();
      await page.waitForFunction((label) => document.querySelector('#study-now-progress')?.textContent.trim() === label, `Questão ${i + 2} de 3`, { timeout: 8000 });
    }
    const evidenceNow = (await api('GET', `/v1/learning-evidence?unitId=${ctx.unitId}`)).evidence;
    expect(evidenceNow.length === 0, `evidence rows written before the pass ended: ${evidenceNow.length}`);
    ctx.keysBefore = await snapshotKeys();
    return { progress: squash(await page.locator('#study-now-progress').innerText()), evidenceRowsSoFar: evidenceNow.length, resumeSnapshotKeysOnDevice: ctx.keysBefore };
  });

  await step(3, FORCED ? 'kill the app abruptly in the middle of the pass' : 'close the app (window close) in the middle of the pass', async () => {
    // WebView2 (Chromium) commits localStorage to disk a few seconds after a write; a kill inside that window loses the newest
    // writes by design of the platform. SL_RESUME_SETTLE_MS waits before the kill: 0 (default) is the harshest case, ~10000 is a
    // crash after the student has been studying for a while.
    if (FORCED) await sleep(Number(process.env.SL_RESUME_SETTLE_MS ?? 0));
    const closingInfo = await shutdown({ forced: FORCED });
    ctx.dbMid = dbSnapshot();
    const submitted = ctx.dbMid.attempts.filter((a) => a.status === 'SUBMITTED');
    expect(submitted.length === 2 && submitted.map((a) => a.outcome).join() === 'CORRECT,INCORRECT', `DB after the interruption: ${JSON.stringify(ctx.dbMid.attempts)}`);
    expect(ctx.dbMid.evidence.length === 0, `DB evidence rows after the interruption: ${ctx.dbMid.evidence.length}`);
    return { closing: closingInfo, judgedAttemptsInDatabase: submitted.length, outcomes: submitted.map((a) => a.outcome), evidenceRows: ctx.dbMid.evidence.length };
  });

  await step(4, 'reopen the app: Estudar agora offers to CONTINUE from question 3 (2 of 3 already answered)', async () => {
    await launch();
    ctx.originAfter = originOf();
    const how = await signIn();
    const keysAfter = await snapshotKeys();
    await openStudyNow();
    const resumeVisible = await page.locator('#study-now-resume').isVisible();
    const resumeText = resumeVisible ? squash(await page.locator('#study-now-resume-text').innerText()) : null;
    expect(resumeVisible, `no "continue" offer after the native restart (origin before ${ctx.originBefore}, after ${ctx.originAfter}; resume keys on device before: ${JSON.stringify(ctx.keysBefore)}, after: ${JSON.stringify(keysAfter)})`);
    expect(/2 de 3/.test(resumeText), `resume text: ${resumeText}`);
    return { signIn: how, originBefore: ctx.originBefore, originAfter: ctx.originAfter, resumeKeysAfter: keysAfter, resumeText };
  });

  await step(5, 'continue, answer the last question: ONE evidence row covering the whole pass (3 questions, 2 correct)', async () => {
    await page.locator('#study-now-resume-continue').click();
    expect(squash(await page.locator('#study-now-progress').innerText()) === 'Questão 3 de 3', 'progress after Continuar');
    await page.locator('#study-now-reveal-btn').click();
    await page.locator('#study-now-answer-text').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#study-now-correct-btn').click();
    await page.locator('#study-now-result-card').waitFor({ state: 'visible', timeout: 15000 });
    const evidence = (await api('GET', `/v1/learning-evidence?unitId=${ctx.unitId}`)).evidence;
    expect(evidence.length === 1 && evidence[0].questionsCount === 3 && evidence[0].correctCount === 2, `evidence ${JSON.stringify(evidence)}`);
    const linked = (await api('GET', `/v1/learning-evidence/${evidence[0].id}/attempts`)).attempts;
    expect(linked.length === 3, `attempts linked to the evidence: ${linked.length}`);
    const leftovers = await snapshotKeys();
    expect(leftovers.length === 0, `resume snapshot left on the device after the pass ended: ${JSON.stringify(leftovers)}`);
    return { evidence: evidence.map((e) => ({ questions: e.questionsCount, correct: e.correctCount })), linkedAttempts: linked.length, resumeKeysLeft: leftovers.length };
  });

  await step(6, 'close: the database holds 3 submitted attempts and 1 evidence row, nothing duplicated', async () => {
    const closingInfo = await shutdown({ forced: false });
    const finalDb = dbSnapshot();
    expect(finalDb.attempts.length === 3 && finalDb.attempts.every((a) => a.status === 'SUBMITTED'), `DB attempts ${JSON.stringify(finalDb.attempts)}`);
    expect(finalDb.evidence.length === 1 && finalDb.evidence[0].q === 3 && finalDb.evidence[0].c === 2, `DB evidence ${JSON.stringify(finalDb.evidence)}`);
    return { closing: closingInfo, attempts: finalDb.attempts.length, evidence: finalDb.evidence };
  });
} catch (error) {
  result.fatal = String(error?.message ?? error);
} finally {
  try { if (browser) await browser.close().catch(() => {}); } catch { /* ignore */ }
  try { if (app && app.exitCode === null) execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(1500);
  rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
result.totalConsoleErrors = consoleErrors.length;
result.consoleErrorSample = consoleErrors.slice(0, 5);
result.steps.sort((a, b) => a.step - b.step);
result.pass = !result.fatal && result.steps.length === 6 && result.steps.every((s) => s.status === 'PASS');
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
