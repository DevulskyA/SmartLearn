// Student study journey in the REAL native Windows Desktop runtime (Tauri + WebView2), driven through CDP. It is not a browser
// simulation: the window under test is src-tauri's smartlearn.exe, which starts its own bundled Node/Fastify/SQLite backend.
//
// DATA RULE: everything lives in a throwaway directory under the OS temp dir (database, sources dir, WebView2 profile). The script
// refuses to start if that directory would be the human DEV datastore. NO model is called and NO AI provider is configured: the
// lesson draft is produced by the server's own deterministic fake provider (server/src/ai/fake-provider.js), which is what the
// server uses when SMARTLEARN_AI_PROVIDER is unset (the same path e2e/draft-acceptance.spec.js exercises). The PDF is a real,
// parseable PDF built in code (server/test/pdf-fixtures/build-fixture-pdf.js).
//
// Prerequisites (the repo's own commands, with SMARTLEARN_BUILD_MODE=DEV): `npm run build`, `npm run package:standalone`, `cargo build`
// in src-tauri. The executable is src-tauri/target/debug/smartlearn.exe, or $CARGO_TARGET_DIR/debug/smartlearn.exe when that is set
// (a separate target dir lets this run beside the human's own running Desktop). SL_JOURNEY_EXE overrides it.
// Usage: node scripts/desktop-study-journey.mjs   -> prints ONE JSON object; exit code 0 only when every step passes.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target');
const exe = resolve(process.env.SL_JOURNEY_EXE ?? join(targetDir, 'debug', 'smartlearn.exe'));
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
const work = mkdtempSync(join(tmpdir(), 'sl-desktop-journey-'));
if (work.toLowerCase().startsWith(humanDevData)) throw new Error('refusing to run against the human DEV datastore');
const dbPath = join(work, 'journey.db');

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

const result = { head, expectedTitle, exe, workDirKind: 'throwaway under OS temp, removed at the end', steps: [] };
const consoleErrors = [];
const password = 'a genuinely long test password 1';
const email = `journey-${Date.now()}@example.com`;
const SUBJECT = 'Farmacologia Desktop';
const SUMMARY_EDIT = 'Resumo mestre editado na jornada Desktop: absorção, distribuição e eliminação, com $C=C_0 e^{-kt}$.\n\n| Fase | Efeito |\n|---|---|\n| Absorção | sobe |\n| Eliminação | desce |';
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// the scientific parts of the summary as DRAWN (formula, table, figure that really loaded through the WebView2 CSP)
async function expectScientificSummary(body) {
  await body.locator('.katex').first().waitFor({ timeout: 10000 });
  expect((await body.locator('table.summary-table tbody tr').count()) === 2, 'summary table not drawn');
  const loaded = await body.locator('figure.summary-figure img').evaluate((img) => new Promise((resolve) => {
    if (img.complete) resolve(img.naturalWidth); else { img.addEventListener('load', () => resolve(img.naturalWidth)); img.addEventListener('error', () => resolve(0)); }
  }));
  expect(loaded === 1, `summary figure did not load in the WebView (naturalWidth ${loaded})`);
}
const ANSWER_EDIT = 'Resposta editada na jornada Desktop';
const PAGES = [
  'Farmacocinética descreve absorção, distribuição, metabolismo e excreção dos fármacos no organismo humano durante o tratamento clínico.',
  'Farmacodinâmica estuda o mecanismo de ação dos fármacos nos receptores celulares e a relação entre dose e resposta terapêutica observada.',
  'Interações medicamentosas ocorrem quando um fármaco altera o efeito de outro, por competição metabólica ou por ação em receptores comuns.',
];

let app; let browser; let page; let cdpPort; let closing = false;

// The person works on the larger display: the window under test is moved onto the SMALLEST one as soon as it exists (no focus steal).
// SL_JOURNEY_NO_MOVE=1 leaves it where Windows puts it. Resolves to the mover's JSON line (or an error note), never rejects.
let windowPlacement = null;
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
  windowPlacement = await placement;
  closing = false;
  const tag = () => (closing ? '[while closing] ' : '');
  page.on('pageerror', (error) => consoleErrors.push(`${tag()}pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${tag()}console.error: ${msg.text()}`); });
  await page.waitForLoadState('networkidle');
}

async function shutdown({ graceful }) {
  closing = true;
  const pid = app.pid;
  const children = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.ProcessId }`).split(/\r?\n/).filter(Boolean);
  await browser?.close().catch(() => {});
  browser = undefined;
  let how = 'already gone';
  if (app.exitCode === null) {
    if (graceful) { try { execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' }); } catch { /* window may refuse */ } }
    const until = Date.now() + 20000;
    while (app.exitCode === null && Date.now() < until) await sleep(300);
    how = app.exitCode === null ? 'forced after the graceful close did not exit in 20 s' : 'graceful window close, process exited by itself';
    if (app.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  }
  await sleep(2000);
  // only the backend processes this app started
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

/** Rows straight from the throwaway SQLite file (the app must be closed): what the DATABASE holds, not what an API says. */
function dbSnapshot() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = (sql) => db.prepare(sql).all().map((r) => ({ ...r }));
    return {
      units: rows('SELECT id, title, summary_body FROM learning_units ORDER BY id').length,
      exercises: rows('SELECT id FROM exercises ORDER BY id').length,
      attempts: rows(`SELECT a.id, v.exercise_id AS exerciseId, a.status, a.max_assistance AS maxAssistance, a.review_task_id AS reviewTaskId, e.outcome, e.assistance_used AS assistanceUsed
        FROM exercise_attempts a JOIN exercise_versions v ON v.id = a.exercise_version_id LEFT JOIN learning_events e ON e.attempt_id = a.id ORDER BY a.id`),
      evidence: rows('SELECT id, unit_id AS unitId, review_task_id AS reviewTaskId, type, questions_count AS q, correct_count AS c FROM learning_evidence ORDER BY id'),
      summaries: rows('SELECT summary_body AS body FROM learning_units ORDER BY id').map((r) => r.body),
    };
  } finally { db.close(); }
}
const stripVolatile = (value) => JSON.parse(JSON.stringify(value, (key, v) => (/^(exportedAt|generatedAt)$/.test(key) ? undefined : v)));

const state = { halted: false };
async function step(n, name, fn) {
  const entry = { step: n, name, status: 'NOT_RUN', evidence: null };
  result.steps.push(entry);
  if (state.halted) return entry;
  const errorsBefore = consoleErrors.length;
  try {
    entry.evidence = await fn();
    entry.status = 'PASS';
  } catch (error) {
    entry.status = 'FAIL';
    entry.error = String(error?.message ?? error).split('\n').slice(0, 6).join(' | ');
    state.halted = true;
    // what the student's screen held at the moment of the failure (review rows and their visibility), to diagnose without guessing
    entry.dom = await page?.evaluate(() => [...document.querySelectorAll('.review-row')].slice(0, 20).map((r) => ({
      id: r.dataset.reviewId, shown: r.offsetParent !== null, done: r.classList.contains('is-done') || r.dataset.done || null, text: r.innerText.replace(/\s+/g, ' ').slice(0, 70),
    }))).catch(() => null);
    // ...and what the server and the persisted state said at the same instant: three views of one moment (database state via API, DOM, screen counters)
    entry.apiState = await Promise.all([api('GET', '/v1/agenda'), api('GET', '/v1/review-tasks')]).then(([a, t]) => ({
      overdueIds: a.overdue.map((x) => x.id), todayIds: a.today.map((x) => x.id), doneTodayIds: a.completedToday.map((x) => x.id),
      completedTaskIds: t.reviewTasks.filter((x) => x.completedAt).map((x) => x.id), taskCount: t.reviewTasks.length, dates: t.reviewTasks.slice(0, 6).map((x) => [x.id, x.dueDate]),
    })).catch((e) => String(e).slice(0, 120));
    entry.screen = await page?.evaluate(() => ({
      hash: location.hash, primary: document.querySelector('#today-primary-action-text')?.innerText?.slice(0, 120) ?? null,
      counters: [...document.querySelectorAll('[data-count-for]')].map((c) => [c.dataset.countFor, c.textContent.trim()]),
      activeScreen: document.querySelector('.screen:not([hidden])')?.id ?? null, scrollY: Math.round(window.scrollY),
    })).catch(() => null);
  }
  const newErrors = consoleErrors.slice(errorsBefore);
  if (newErrors.length) entry.consoleErrors = newErrors.slice(0, 5);
  // Optional: SL_JOURNEY_SHOTS=<dir> saves one screenshot of the window after every step, so a person (or an agent) can LOOK at what the student saw.
  if (process.env.SL_JOURNEY_SHOTS && page) {
    await page.screenshot({ path: join(process.env.SL_JOURNEY_SHOTS, `step-${String(n).padStart(2, '0')}.png`) }).catch(() => {});
  }
  return entry;
}
const expect = (condition, message) => { if (!condition) throw new Error(`expectation failed: ${message}`); };

const ctx = { attemptIds: {}, studyNow: [], hoje: [] };
try {
  await step(1, 'open the isolated Desktop', async () => {
    await launch();
    const pid = app.pid;
    const procPath = ps(`(Get-Process -Id ${pid}).Path`);
    expect(procPath.toLowerCase() === exe.toLowerCase(), `running process path ${procPath} is not the binary under test ${exe}`);
    return { pid, processPath: procPath, appUrl: page.url(), cdpPort, windowPlacement };
  });

  await step(2, 'confirm frontend, backend and database (title, health, version)', async () => {
    const title = ps(`(Get-Process -Id ${app.pid}).MainWindowTitle`);
    expect(title === expectedTitle, `native window title "${title}" != "${expectedTitle}"`);
    const info = await page.evaluate(async () => {
      const ready = await fetch('/health/ready');
      const build = await (await fetch('/health/build')).json();
      return { readyStatus: ready.status, build, localAuthority: window.__SMARTLEARN_LOCAL_AUTHORITY__ === true, apiBase: window.__SMARTLEARN_API_BASE__ };
    });
    expect(info.readyStatus === 200, `/health/ready ${info.readyStatus}`);
    expect(info.build.head === head && info.build.content === identity.inputsHash && info.build.mode === 'DEV', `backend identity ${JSON.stringify(info.build)}`);
    expect(info.build.provider === null, `an AI provider is configured: ${info.build.provider}`);
    expect(info.localAuthority, 'window is not in LOCAL_AUTHORITY');
    const staged = join(dirname(exe), 'dist-runtime', 'build-info.json');
    const stagedInfo = existsSync(staged) ? JSON.parse(readFileSync(staged, 'utf8')) : null;
    // The build is identified by CONTENT (inputsHash), not by commit: a later commit that changes no build input (this script, docs)
    // leaves the same content. The commit stamped in the bundle must still be HEAD or one of its ancestors.
    const stampedIsHeadOrAncestor = Boolean(stagedInfo) && (() => {
      try { git('merge-base', '--is-ancestor', stagedInfo.commit, 'HEAD'); return true; } catch { return false; }
    })();
    expect(stagedInfo && stagedInfo.inputsHash === identity.inputsHash && stampedIsHeadOrAncestor, `bundled frontend identity ${JSON.stringify(stagedInfo)}`);
    const backend = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${app.pid}" | ForEach-Object { $_.ExecutablePath }`).split(/\r?\n/).filter(Boolean);
    expect(backend.some((p) => p.toLowerCase().startsWith(dirname(exe).toLowerCase())), `backend child not under the binary's own resources: ${backend.join(',')}`);
    const diag = info.build.diagnostics;
    // sign in (account created over HTTP, session through the real login form)
    await api('POST', '/v1/auth/register', { email, password });
    const how = await signIn();
    return { nativeTitle: title, readyStatus: info.readyStatus, version: info.build.version, head: info.build.head, content: info.build.content.slice(0, 12), mode: info.build.mode, provider: info.build.provider, bundledFrontend: { commit: stagedInfo.commit, content: stagedInfo.inputsHash.slice(0, 12) }, backendProcess: backend, apiBase: info.apiBase, diagnostics: diag ?? null, signIn: how, databaseFile: dbPath };
  });

  await step(3, 'open Materiais', async () => {
    await page.locator('[data-screen="materials"]:visible').first().click();
    await page.locator('#sources-card').waitFor({ state: 'visible', timeout: 10000 });
    return { sourcesCardVisible: true };
  });

  await step(4, 'import an authorized test PDF', async () => {
    await page.setInputFiles('#sources-file-input', { name: 'farmacologia-desktop.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(PAGES) });
    await page.locator('#sources-message').getByText(/trechos? propostos?/).waitFor({ timeout: 20000 });
    const message = squash(await page.locator('#sources-message').innerText());
    const sources = await api('GET', '/v1/sources');
    expect(sources.sources.length === 1, `expected 1 source, got ${sources.sources.length}`);
    return { message, source: { name: sources.sources[0].originalFilename ?? sources.sources[0].filename ?? sources.sources[0].name, bytes: sources.sources[0].sizeBytes ?? sources.sources[0].size ?? null }, proposals: await page.locator('.source-proposal-item').count() };
  });

  await step(5, 'create a lesson draft from CONTROLLED data without any model call (server fake provider)', async () => {
    await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
    await page.locator('.lesson-editor').waitFor({ state: 'visible', timeout: 30000 });
    ctx.draftId = await page.locator('.lesson-editor').getAttribute('data-draft-id');
    const draft = (await api('GET', `/v1/drafts/${ctx.draftId}`)).draft;
    expect(String(draft.modelVersion ?? '').startsWith('fake'), `draft was not made by the fake provider: ${draft.modelVersion}`);
    ctx.draftQuestions = draft.questions?.length ?? 0;
    expect(ctx.draftQuestions >= 2, `need at least 2 drafted questions, got ${ctx.draftQuestions}`);
    return { draftId: ctx.draftId, status: draft.status, modelVersion: draft.modelVersion, questions: ctx.draftQuestions, summaryHead: squash(draft.summary).slice(0, 80) };
  });

  await step(6, 'open Resumo and Questões', async () => {
    const editor = page.locator('.lesson-editor');
    await editor.getByRole('tab', { name: /Resumo/ }).click();
    const summary = await editor.locator('.lesson-summary-input').inputValue();
    expect(summary.length > 20, 'summary empty');
    await editor.getByRole('tab', { name: /Questões/ }).click();
    const questions = await editor.locator('.lesson-qitem').count();
    expect(questions === ctx.draftQuestions, `Questões tab shows ${questions}, draft has ${ctx.draftQuestions}`);
    return { summaryChars: summary.length, questionsListed: questions };
  });

  await step(7, 'edit, save, reload, verify (summary + one question)', async () => {
    const editor = page.locator('.lesson-editor');
    await editor.getByRole('tab', { name: /Questões/ }).click();
    await editor.locator('.lesson-qitem').nth(1).click();
    await editor.locator('.lesson-qeditor textarea').nth(1).fill(ANSWER_EDIT);
    await editor.locator('[data-action="save-question"]').click();
    await editor.locator('.lesson-qeditor .lesson-message').getByText('Questão salva').waitFor({ timeout: 10000 });
    await editor.getByRole('tab', { name: /Resumo/ }).click();
    await editor.locator('.lesson-summary-input').fill(SUMMARY_EDIT);
    await editor.locator('[data-panel="summary"]').getByRole('button', { name: 'Figura', exact: true }).click();
    await editor.locator('.summary-figure-file').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
    await editor.locator('.summary-figure-alt').fill('Esquema da jornada');
    await editor.locator('.summary-figure-insert').click();
    await editor.locator('.summary-figure-panel').waitFor({ state: 'detached', timeout: 10000 });
    ctx.summaryFinal = (await editor.locator('.lesson-summary-input').inputValue()).trim(); // saving trims the text
    expect(ctx.summaryFinal.startsWith(SUMMARY_EDIT) && /!\[Esquema da jornada\]\(smartlearn-figure:\d+\)/.test(ctx.summaryFinal), `figure not inserted: ${ctx.summaryFinal}`);
    await editor.locator('[data-action="save-summary"]').click();
    await editor.locator('[data-panel="summary"] .lesson-message').getByText('Resumo salvo').waitFor({ timeout: 10000 });
    await page.locator('[data-action="lesson-back"]').click();
    await page.reload();
    await page.waitForLoadState('networkidle');
    const how = await signIn();
    await page.locator('[data-screen="materials"]:visible').first().click();
    await page.locator('#sources-existing-list .source-existing-item', { hasText: 'farmacologia-desktop.pdf' }).locator('[data-action="open-source"]').click();
    await page.locator('#sources-message').getByText(/trechos? propostos?/).waitFor({ timeout: 15000 });
    await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    const summaryAfter = await editor.locator('.lesson-summary-input').inputValue();
    expect(summaryAfter === ctx.summaryFinal, `summary after reload: ${summaryAfter}`);
    await editor.getByRole('tab', { name: /Questões/ }).click();
    await editor.locator('.lesson-qitem').nth(1).click();
    const answerAfter = await editor.locator('.lesson-qeditor textarea').nth(1).inputValue();
    expect(answerAfter === ANSWER_EDIT, `answer after reload: ${answerAfter}`);
    const draft = (await api('GET', `/v1/drafts/${ctx.draftId}`)).draft;
    expect(draft.summary === ctx.summaryFinal, 'server draft summary differs');
    return { reload: how, summaryPersisted: true, answerPersisted: true, serverDraftRevision: draft.revision };
  });

  await step(8, 'accept the lesson', async () => {
    const editor = page.locator('.lesson-editor');
    await editor.locator('.source-draft-subject-input').fill(SUBJECT);
    await editor.locator('.source-draft-date-input').fill('2020-01-01');
    await editor.locator('[data-action="accept-draft"]').click();
    await editor.locator('.source-draft-result').getByText('Aula criada').waitFor({ timeout: 15000 });
    const units = (await api('GET', '/v1/learning-units')).units;
    expect(units.length === 1, `units ${units.length}`);
    ctx.unit = units[0];
    expect(ctx.unit.summaryBody === ctx.summaryFinal, 'accepted unit does not carry the edited summary');
    const draft = (await api('GET', `/v1/drafts/${ctx.draftId}`)).draft;
    expect(draft.status === 'ACCEPTED', `draft status ${draft.status}`);
    return { result: squash(await editor.locator('.source-draft-result').innerText()), unitId: ctx.unit.id, unitTitle: ctx.unit.title, draftStatus: draft.status };
  });

  await step(9, 'open Resumo Mestre (Plano row and the study screen)', async () => {
    await page.locator('[data-screen="plan"]:visible').first().click();
    const row = page.locator('.plan-row', { hasText: SUBJECT });
    await row.locator('.plan-expand-btn').click();
    const planSummary = squash(await row.locator('.plan-summary-body').innerText());
    expect(planSummary.includes('Resumo mestre editado'), `Plano summary: ${planSummary}`);
    await expectScientificSummary(row.locator('.plan-summary-body'));
    return { planSummary, scientific: 'formula + table + figure drawn' };
  });

  await step(10, 'Estudar agora', async () => {
    const row = page.locator('.plan-row', { hasText: SUBJECT });
    await row.locator('[data-action="plan-study-now"]').click();
    await page.locator('#screen-study-now').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#study-now-question-text').waitFor({ state: 'visible', timeout: 10000 });
    const summary = squash(await page.locator('#study-now-summary-body').innerText());
    return { summaryCardVisible: await page.locator('#study-now-summary-card').isVisible(), summaryBody: summary, firstQuestion: squash(await page.locator('#study-now-question-text').innerText()), progress: squash(await page.locator('#study-now-progress').innerText()) };
  });

  const readAttemptOnServer = (id) => page.evaluate(async (attemptId) => (await (await fetch(`${window.__SMARTLEARN_API_BASE__}/v1/attempts/${attemptId}`, { credentials: 'include' })).json()).attempt, id);
  const pollAttempt = async (id, predicate, label) => {
    let last;
    for (let i = 0; i < 40; i += 1) { last = await readAttemptOnServer(id); if (predicate(last)) return last; await sleep(250); }
    throw new Error(`attempt ${id} never reached ${label}: ${JSON.stringify(last)}`);
  };

  await step(11, 'reveal the answer', async () => {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator('#study-now-answer-text').waitFor({ state: 'visible', timeout: 10000 });
    const answer = squash(await page.locator('#study-now-answer-text').innerText());
    await page.waitForFunction(() => document.querySelector('#study-now-question-area')?.dataset.attemptId, null, { timeout: 10000 });
    const id = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
    const attempt = await pollAttempt(id, (a) => a.maxAssistance === 'SOLUTION', 'maxAssistance=SOLUTION');
    expect(attempt.status === 'STARTED', `status before judgment ${attempt.status}`);
    ctx.studyNow.push({ id, question: squash(await page.locator('#study-now-question-text').innerText()) });
    return { answer, attemptId: id, serverBeforeJudgment: { status: attempt.status, maxAssistance: attempt.maxAssistance } };
  });

  await step(12, 'judge correct and wrong (1st correct, 2nd wrong, last judged IMMEDIATELY after revealing under a slow ledger)', async () => {
    const outcomes = ['correct', 'incorrect'];
    for (let i = 2; i < ctx.draftQuestions; i += 1) outcomes.push('correct');
    ctx.studyOutcomes = outcomes;
    let immediate = null;
    for (let i = 0; i < outcomes.length; i += 1) {
      if (i === outcomes.length - 1) {
        // the LAST question is judged the instant after the reveal click, while the reveal write is still in flight (every write to
        // the ledger answers 700 ms late): the judgment must not overtake the reveal, or the ledger would say "no help" for a seen answer
        const pattern = /\/v1\/attempts\/\d+\/(reveal-solution|hint)/;
        let delayed = 0;
        await page.route(pattern, async (route) => { if (route.request().method() === 'POST') { delayed += 1; await sleep(700); } await route.continue(); });
        await page.locator('#study-now-reveal-btn').click();
        await page.locator(`#study-now-${outcomes[i]}-btn`).click();
        await page.waitForFunction(() => document.querySelector('#study-now-question-area')?.dataset.attemptId, null, { timeout: 10000 });
        const id = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
        ctx.studyNow.push({ id, question: 'immediate-judgment question' });
        const done = await pollAttempt(id, (a) => a.status === 'SUBMITTED', 'SUBMITTED');
        await page.unroute(pattern);
        expect(delayed > 0, 'the delay never applied to the reveal request, so the race was not exercised');
        expect(done.maxAssistance === 'SOLUTION', `Estudar agora attempt ${id} judged right after the reveal lost the reveal: assistance ${done.maxAssistance}`);
        immediate = { attemptId: id, delayedRevealWrites: delayed, status: done.status, maxAssistance: done.maxAssistance };
        continue;
      }
      if (i > 0) {
        await page.locator('#study-now-reveal-btn').click();
        await page.locator('#study-now-answer-text').waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForFunction(() => document.querySelector('#study-now-question-area')?.dataset.attemptId, null, { timeout: 10000 });
        ctx.studyNow.push({ id: await page.locator('#study-now-question-area').getAttribute('data-attempt-id'), question: squash(await page.locator('#study-now-question-text').innerText()) });
      }
      const current = ctx.studyNow[i];
      await pollAttempt(current.id, (a) => a.maxAssistance === 'SOLUTION', 'SOLUTION');
      await page.locator(`#study-now-${outcomes[i]}-btn`).click();
      await pollAttempt(current.id, (a) => a.status === 'SUBMITTED', 'SUBMITTED');
    }
    await page.locator('#study-now-result-card').waitFor({ state: 'visible', timeout: 15000 });
    return { judged: outcomes, immediateJudgmentAfterReveal: immediate, resultText: squash(await page.locator('#study-now-result-text').innerText()) };
  });

  await step(13, 'verify the attempts were really persisted (API now, DATABASE after closing in step 17)', async () => {
    const out = [];
    for (let i = 0; i < ctx.studyNow.length; i += 1) {
      const a = await readAttemptOnServer(ctx.studyNow[i].id);
      expect(a.status === 'SUBMITTED' && a.maxAssistance === 'SOLUTION', `attempt ${a.id}: ${JSON.stringify(a)}`);
      out.push({ id: a.id, status: a.status, maxAssistance: a.maxAssistance, judged: ctx.studyOutcomes[i] });
    }
    const evidence = (await api('GET', '/v1/learning-evidence')).evidence;
    const wrongCount = ctx.studyOutcomes.filter((o) => o === 'incorrect').length;
    expect(evidence.length === 1 && evidence[0].questionsCount === ctx.draftQuestions && evidence[0].correctCount === ctx.draftQuestions - wrongCount, `evidence ${JSON.stringify(evidence)}`);
    ctx.evidenceAfterStudy = evidence.length;
    return { attempts: out, evidence: evidence.map((e) => ({ type: e.type, questions: e.questionsCount, correct: e.correctCount })) };
  });

  await step(19, 'the cited page offers the ORIGINAL PDF: the file is served and the WebView2 click is observed (R4)', async () => {
    const link = page.locator('#study-now-errors-list .study-now-source-open').first();
    await link.waitFor({ state: 'attached', timeout: 10000 });
    const href = await link.getAttribute('href');
    expect(/\/v1\/sources\/\d+\/file#page=\d+$/.test(href ?? ''), `href ${href}`);
    // the file itself, with the session cookie of the window
    const served = await page.evaluate(async (url) => {
      const res = await fetch(url.split('#')[0], { credentials: 'include' });
      return { status: res.status, type: res.headers.get('content-type'), head: new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5)) };
    }, href);
    expect(served.status === 200 && served.head === '%PDF-', `served ${JSON.stringify(served)}`);
    // the real click: it must open the viewer INSIDE the window (an external browser has no session and would get 401)
    const procsBefore = ps('Get-Process msedge,AcroRd32,Acrobat -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }').split(/\r?\n/).filter(Boolean);
    await page.locator('#study-now-errors-list details.study-now-source').first().evaluate((el) => { el.open = true; });
    await link.click();
    const viewer = page.locator('.original-pdf-dialog[open]');
    await viewer.waitFor({ state: 'visible', timeout: 10000 });
    let fileFrame = null;
    for (let i = 0; i < 40 && !fileFrame; i += 1) {
      fileFrame = page.frames().find((f) => /\/v1\/sources\/\d+\/file/.test(f.url())) ?? null;
      if (!fileFrame) await sleep(250);
    }
    expect(fileFrame, 'the viewer frame never loaded the file');
    const title = squash(await viewer.locator('.original-pdf-title').innerText());
    await sleep(1500);
    const procsAfter = ps('Get-Process msedge,AcroRd32,Acrobat -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }').split(/\r?\n/).filter(Boolean);
    const frameUrl = fileFrame.url();
    await viewer.locator('.original-pdf-close').click();
    await page.locator('.original-pdf-dialog[open]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    const closed = (await page.locator('.original-pdf-dialog[open]').count()) === 0;
    const stillOnStudy = await page.locator('#study-now-result-card').isVisible();
    expect(closed && stillOnStudy, `closed ${closed}, study screen ${stillOnStudy}`);
    return {
      href, served, viewerTitle: title, frameUrl,
      newExternalViewerProcesses: procsAfter.filter((p) => !procsBefore.includes(p)).length,
      closedAndBackOnStudy: closed && stillOnStudy,
    };
  });

  await step(15, 'feedback, errors and retest after the study result', async () => {
    const errors = page.locator('#study-now-errors-list .study-now-error-item');
    expect(await errors.count() === 1, `errors listed ${await errors.count()}`);
    const wrongText = squash(await errors.first().innerText());
    expect(await page.locator('#study-now-retest-btn').isVisible() && await page.locator('#study-now-done-btn').isVisible(), 'retest/done buttons missing');
    await page.locator('#study-now-retest-btn').click();
    await page.locator('#study-now-reveal-btn').click();
    await page.locator('#study-now-answer-text').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#study-now-correct-btn').click();
    await page.waitForFunction(() => /corrigidos/.test(document.querySelector('#study-now-result-text')?.textContent ?? ''), null, { timeout: 15000 });
    const retestText = squash(await page.locator('#study-now-result-text').innerText());
    expect(retestText === '1/1 erros corrigidos', `retest result: ${retestText}`);
    const evidence = (await api('GET', '/v1/learning-evidence')).evidence;
    expect(evidence.length === ctx.evidenceAfterStudy, `the retest added evidence rows: ${evidence.length}`);
    await page.locator('#study-now-done-btn').click();
    return { errorShown: wrongText.slice(0, 160), retestResult: retestText, evidenceRowsAfterRetest: evidence.length, retestIsNotEvidence: true };
  });

  await step(14, 'Hoje review: judge IMMEDIATELY after revealing (race of e2e/practice.spec.js:54), one attempt and the right assistance', async () => {
    await page.locator('[data-screen="today"]:visible').first().click();
    await page.locator('#today-primary-action').waitFor({ state: 'visible', timeout: 15000 });
    const primaryText = squash(await page.locator('#today-primary-action-text').innerText());
    const reviewId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
    await page.locator('#today-primary-action-btn').click();
    const row = page.locator(`.review-row[data-review-id="${reviewId}"]`);
    await row.waitFor({ state: 'visible', timeout: 10000 });
    // the unit has several overdue stages (16-review schedule): Hoje must show them as ONE grouped card that holds this review, open
    const grouped = await page.evaluate((id) => {
      const card = document.querySelector(`.review-row[data-review-id="${id}"]`)?.closest('details.overdue-unit');
      if (!card) return null;
      return {
        cards: document.querySelectorAll('details.overdue-unit').length,
        stagesAttr: Number(card.dataset.stages),
        stageRows: card.querySelectorAll('.review-row').length,
        open: card.open,
        meta: card.querySelector('summary .review-meta')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        count: document.querySelector('[data-count-for="overdue"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      };
    }, reviewId);
    expect(grouped !== null, 'Hoje: the review is not inside a grouped details.overdue-unit card');
    expect(grouped.cards === 1 && grouped.stagesAttr > 1 && grouped.stageRows === grouped.stagesAttr, `Hoje grouped card: ${JSON.stringify(grouped)} (expected 1 card holding every overdue stage as its own row)`);
    expect(grouped.count === `${grouped.stagesAttr} revisões · 1 conteúdo`, `Hoje overdue counter must state stages and units: ${JSON.stringify(grouped)}`);
    expect(grouped.open === true && /revisões atrasadas · R1 a R\d+ · a mais antiga há/.test(grouped.meta), `Hoje grouped card must start open with the stage range summary: ${JSON.stringify(grouped)}`);
    // every write to the attempt ledger answers late (as on a slow connection): the judgment must not overtake the reveal
    let delayed = 0; const starts = [];
    await page.route(/\/v1\/exercises\/\d+\/attempts$|\/v1\/attempts\/\d+\/(reveal-solution|hint)/, async (route) => {
      if (route.request().method() === 'POST') {
        delayed += 1;
        if (/\/exercises\/\d+\/attempts$/.test(route.request().url())) starts.push(route.request().url());
        await sleep(600);
      }
      await route.continue();
    });
    const cases = [['Acertei', /is-correct/, 'CORRECT'], ['Errei', /is-wrong/, 'INCORRECT']];
    for (let i = 0; i < cases.length; i += 1) {
      const [label, cls, outcome] = cases[i];
      const item = row.locator('.review-exercise-item').nth(i);
      await item.getByRole('button', { name: 'Ver resposta' }).click();
      await item.getByRole('button', { name: label }).click();
      await page.waitForFunction(({ id, idx, re }) => new RegExp(re).test(document.querySelectorAll(`.review-row[data-review-id="${id}"] .review-exercise-item`)[idx]?.className ?? ''), { id: reviewId, idx: i, re: cls.source }, { timeout: 8000 });
      await page.waitForFunction(({ id, idx }) => document.querySelectorAll(`.review-row[data-review-id="${id}"] .review-exercise-item`)[idx]?.dataset.attemptId, { id: reviewId, idx: i }, { timeout: 10000 });
      const attemptId = await item.getAttribute('data-attempt-id');
      const attempt = await pollAttempt(attemptId, (a) => a.status === 'SUBMITTED', 'SUBMITTED');
      expect(attempt.maxAssistance === 'SOLUTION', `Hoje attempt ${attemptId}: assistance ${attempt.maxAssistance} (the reveal was lost)`);
      ctx.hoje.push({ id: attemptId, outcome, status: attempt.status, maxAssistance: attempt.maxAssistance });
    }
    await page.unroute(/\/v1\/exercises\/\d+\/attempts$|\/v1\/attempts\/\d+\/(reveal-solution|hint)/);
    expect(delayed > 0, 'the delay never applied, so the race was not exercised');
    expect(starts.length === cases.length, `one attempt per question expected, ${starts.length} starts for ${cases.length} questions`);
    // the API collapses repeated attempts per exercise, so it proves outcome/assistance only; "exactly one attempt" is proven on the DATABASE (step 17)
    const taskAttempts = (await api('GET', `/v1/review-tasks/${reviewId}/attempts`)).attempts;
    expect(taskAttempts.length === cases.length && taskAttempts.map((t) => t.outcome).join() === 'CORRECT,INCORRECT' && taskAttempts.every((t) => t.maxAssistance === 'SOLUTION'), `review task attempts via API: ${JSON.stringify(taskAttempts)}`);
    ctx.reviewId = reviewId;
    return { primaryAction: primaryText, reviewId, delayedWrites: delayed, startRequests: starts.length, judged: ctx.hoje, reviewTaskAttemptsViaApi: taskAttempts.map((t) => ({ exerciseId: t.exerciseId, outcome: t.outcome, maxAssistance: t.maxAssistance })) };
  });

  await step(20, 'the student marks the review "Revisão feita" in Hoje: it completes ONCE, leaves the overdue list, shows as done today, creates one honest REVIEW evidence; unchecking is observed', async () => {
    const id = ctx.reviewId;
    const box = page.locator(`[data-action="review-done"][data-review-id="${id}"]`);
    await box.waitFor({ state: 'visible', timeout: 10000 });
    expect(!(await box.isChecked()), 'the box was already checked before the click');
    const agendaBefore = await api('GET', '/v1/agenda');
    const evidenceBefore = (await api('GET', '/v1/learning-evidence')).evidence;
    await box.click();
    await page.locator(`[data-action="review-done"][data-review-id="${id}"]`).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction((rid) => document.querySelector(`[data-action="review-done"][data-review-id="${rid}"]`)?.checked === true, id, { timeout: 15000 });
    const tasks = (await api('GET', '/v1/review-tasks')).reviewTasks;
    const done = tasks.find((t) => String(t.id) === String(id));
    expect(done?.completedAt, 'the server did not record the completion');
    expect(tasks.filter((t) => t.completedAt).length === 1, `exactly ONE review completed, got ${tasks.filter((t) => t.completedAt).length}`);
    const agendaAfter = await api('GET', '/v1/agenda');
    expect(agendaAfter.overdue.length === agendaBefore.overdue.length - 1, `overdue ${agendaBefore.overdue.length} -> ${agendaAfter.overdue.length}`);
    expect(agendaAfter.completedToday.some((t) => String(t.id) === String(id)), 'not listed as done today');
    const evidenceAfter = (await api('GET', '/v1/learning-evidence')).evidence;
    const added = evidenceAfter.filter((e) => !evidenceBefore.some((b) => b.id === e.id));
    expect(added.length === 1 && added[0].type === 'REVIEW', `evidence added: ${JSON.stringify(added.map((e) => [e.type, e.questionsCount, e.correctCount]))}`);
    expect(added[0].questionsCount === 2 && added[0].correctCount === 1, `the evidence must carry what the student judged (2 questions, 1 right): ${added[0].questionsCount}/${added[0].correctCount}`);
    // the same checkbox again: what does the student get? (observed, not assumed)
    await page.locator(`[data-action="review-done"][data-review-id="${id}"]`).click();
    await sleep(2500);
    const tasksAfterUncheck = (await api('GET', '/v1/review-tasks')).reviewTasks;
    const evidenceAfterUncheck = (await api('GET', '/v1/learning-evidence')).evidence;
    const stillChecked = await page.locator(`[data-action="review-done"][data-review-id="${id}"]`).isChecked();
    ctx.afterReviewDone = { completedReviews: tasksAfterUncheck.filter((t) => t.completedAt).length, evidenceRows: evidenceAfterUncheck.length };
    // a student who unchecks by accident checks it again: the SAME review must not count twice in the statistics
    await page.locator(`[data-action="review-done"][data-review-id="${id}"]`).click();
    await page.waitForFunction((rid) => document.querySelector(`[data-action="review-done"][data-review-id="${rid}"]`)?.checked === true, id, { timeout: 15000 });
    const evidenceAfterRecheck = (await api('GET', '/v1/learning-evidence')).evidence;
    ctx.recheck = { evidenceRows: evidenceAfterRecheck.length, reviewRows: evidenceAfterRecheck.filter((e) => e.type === 'REVIEW').length };
    return {
      reviewId: id, completedAt: done.completedAt, overdue: [agendaBefore.overdue.length, agendaAfter.overdue.length], doneToday: true,
      evidence: added.map((e) => ({ type: e.type, questions: e.questionsCount, correct: e.correctCount })),
      afterUncheck: { boxStillChecked: stillChecked, completedReviews: ctx.afterReviewDone.completedReviews, evidenceRows: evidenceAfterUncheck.length, evidenceBeforeUncheck: evidenceAfter.length },
      afterRecheck: ctx.recheck,
    };
  });

  await step(16, 'Hoje, Plano and Estatísticas load without error', async () => {
    const out = {};
    const before = consoleErrors.length;
    await page.locator('[data-screen="today"]:visible').first().click();
    await page.locator('#screen-today').waitFor({ state: 'visible' });
    out.hoje = squash(await page.locator('#screen-today h1').first().innerText());
    await page.locator('[data-screen="plan"]:visible').first().click();
    await page.locator('.plan-row', { hasText: SUBJECT }).waitFor({ state: 'visible', timeout: 10000 });
    out.plano = `${await page.locator('.plan-row').count()} unit row(s)`;
    await page.locator('[data-screen="stats"]:visible').first().click();
    await page.locator('#screen-stats').waitFor({ state: 'visible' });
    await page.locator('#tab-stats-unit').click();
    await page.locator('#unit-stats-list').getByText(/farmacologia-desktop/i).first().waitFor({ timeout: 15000 });
    out.estatisticas = squash(await page.locator('#unit-stats-list').innerText()).slice(0, 160);
    const fresh = consoleErrors.slice(before);
    expect(fresh.length === 0, `console errors while loading the screens: ${fresh.join(' || ')}`);
    return out;
  });

  let snapshotBefore; let exportBefore; let health1;
  await step(17, 'close and reopen the isolated instance (same throwaway data dir)', async () => {
    exportBefore = stripVolatile(await api('GET', '/v1/export'));
    const closing = await shutdown({ graceful: true });
    snapshotBefore = dbSnapshot();
    expect(snapshotBefore.attempts.length === ctx.studyNow.length + ctx.hoje.length + 1, `DB attempts ${snapshotBefore.attempts.length} != ${ctx.studyNow.length} study + ${ctx.hoje.length} hoje + 1 retest`);
    const submitted = snapshotBefore.attempts.filter((a) => a.status === 'SUBMITTED');
    expect(submitted.length === snapshotBefore.attempts.length && submitted.every((a) => a.maxAssistance === 'SOLUTION' && a.assistanceUsed === 'SOLUTION'), `DB attempts not all SUBMITTED with SOLUTION assistance: ${JSON.stringify(snapshotBefore.attempts)}`);
    const outcomes = snapshotBefore.attempts.map((a) => a.outcome);
    const hojeIds = new Set(ctx.hoje.map((h) => Number(h.id)));
    const hojeRows = snapshotBefore.attempts.filter((a) => hojeIds.has(a.id));
    expect(hojeRows.length === 2 && hojeRows.map((a) => a.outcome).join() === 'CORRECT,INCORRECT', `DB Hoje rows ${JSON.stringify(hojeRows)}`);
    const perExercise = {};
    for (const a of snapshotBefore.attempts.filter((x) => String(x.reviewTaskId) === String(ctx.reviewId))) perExercise[a.exerciseId] = (perExercise[a.exerciseId] ?? 0) + 1;
    expect(Object.keys(perExercise).length === 2 && Object.values(perExercise).every((n) => n === 1), `DB: attempts per exercise inside the Hoje review ${JSON.stringify(perExercise)} (expected 2 exercises, 1 attempt each)`);
    ctx.hojePerExercise = perExercise;
    await launch();
    const title = ps(`(Get-Process -Id ${app.pid}).MainWindowTitle`);
    expect(title === expectedTitle, `title after reopen: ${title}`);
    health1 = await page.evaluate(async () => ({ ready: (await fetch('/health/ready')).status, build: await (await fetch('/health/build')).json() }));
    expect(health1.ready === 200 && health1.build.head === head, `health after reopen ${JSON.stringify(health1)}`);
    const how = await signIn();
    return { closing, dbAfterClose: { hojeAttemptsPerExercise: ctx.hojePerExercise, units: snapshotBefore.units, exercises: snapshotBefore.exercises, attempts: snapshotBefore.attempts.length, outcomes, evidenceRows: snapshotBefore.evidence.length }, reopened: { title, newBackendUrl: page.url(), readyStatus: health1.ready, signIn: how } };
  });

  await step(18, 'data and evidence unchanged after the reopen', async () => {
    const exportAfter = stripVolatile(await api('GET', '/v1/export'));
    expect(JSON.stringify(exportAfter) === JSON.stringify(exportBefore), 'the logical export differs after the reopen');
    // the UI still shows the evidence
    await page.locator('[data-screen="stats"]:visible').first().click();
    await page.locator('#tab-stats-unit').click();
    await page.locator('#unit-stats-list').getByText(/farmacologia-desktop/i).first().waitFor({ timeout: 15000 });
    await page.locator('[data-screen="plan"]:visible').first().click();
    const row = page.locator('.plan-row', { hasText: SUBJECT });
    await row.waitFor({ state: 'visible', timeout: 10000 });
    await row.locator('.plan-expand-btn').click();
    const summary = squash(await row.locator('.plan-summary-body').innerText());
    expect(summary.includes('Resumo mestre editado'), 'summary lost after reopen');
    await expectScientificSummary(row.locator('.plan-summary-body'));
    const closing = await shutdown({ graceful: true });
    const snapshotAfter = dbSnapshot();
    expect(JSON.stringify(snapshotAfter) === JSON.stringify(snapshotBefore), 'the database rows differ after the second session');
    return { exportEqual: true, exportBytes: JSON.stringify(exportAfter).length, dbRowsEqual: true, attempts: snapshotAfter.attempts.length, evidenceRows: snapshotAfter.evidence.length, summaryAfterReopen: summary.slice(0, 80), closing };
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
result.pass = !result.fatal && result.steps.length === 20 && result.steps.every((s) => s.status === 'PASS');
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
