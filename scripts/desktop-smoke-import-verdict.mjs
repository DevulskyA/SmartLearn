// T-F1-09: mechanical smoke of IMPORT-1 (logical-backup restore into an EMPTY account) and VERDICT-1 (volume-weighted study verdict,
// 25% threshold) in the REAL Windows Desktop runtime (src-tauri/target/debug/smartlearn.exe, WebView2), driven through CDP.
//
// DATA RULE: everything lives in a throwaway directory under the OS temp dir (SMARTLEARN_DB_PATH / SMARTLEARN_SOURCES_DIR /
// WEBVIEW2_USER_DATA_FOLDER point there). It NEVER touches C:\Users\<you>\SmartLearn-DevData; it refuses to start if it is pointed at it.
// No AI provider is configured (nothing calls a model). It only observes; it makes no perceptual judgement.
//
// Prerequisites (the repo's own commands): `npm run build` + `npm run package:standalone` (staged resources) and `cargo build` in
// src-tauri, with SMARTLEARN_BUILD_MODE=DEV so the bundle names the build. Usage: node scripts/desktop-smoke-import-verdict.mjs
// Prints one JSON object; exit code 0 only when every mechanical check holds.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exe = join(root, 'src-tauri', 'target', 'debug', 'smartlearn.exe');
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const version = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8' })).version;
const expectedTitle = `SmartLearn DEV - v${version} - ${head}`;

const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  s.on('error', fail);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

if (!existsSync(exe)) throw new Error(`debug executable missing: ${exe} (run cargo build in src-tauri)`);
const humanDevData = join(homedir(), 'SmartLearn-DevData').toLowerCase();
const work = mkdtempSync(join(tmpdir(), 'sl-desktop-smoke-'));
if (work.toLowerCase().startsWith(humanDevData)) throw new Error('refusing to run against the human DEV datastore');

const cdpPort = await freePort();
const env = {
  ...process.env,
  SMARTLEARN_LOCAL_AUTHORITY: 'true',
  SMARTLEARN_DB_PATH: join(work, 'smoke.db'),
  SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head,
  SMARTLEARN_WINDOW_TITLE: expectedTitle,
  WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
};
delete env.SMARTLEARN_AI_PROVIDER; delete env.SMARTLEARN_AI_CONSENT; delete env.SMARTLEARN_DEV_PERSISTENT_SESSION;

const app = spawn(exe, [], { env, stdio: 'ignore', windowsHide: false });
const result = { head, expectedTitle, checks: {} };
let browser;
try {
  // wait for the WebView2 DevTools endpoint
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* not yet */ }
    if (app.exitCode !== null) throw new Error(`smartlearn.exe exited early (${app.exitCode})`);
    if (Date.now() > deadline) throw new Error('CDP endpoint did not come up in 60 s');
    await sleep(300);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  let page;
  for (let i = 0; i < 100 && !page; i += 1) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
    if (!page) await sleep(300);
  }
  if (!page) throw new Error('the Desktop window page was not found over CDP');
  await page.waitForLoadState('networkidle');
  result.appUrl = page.url();
  result.nativeWindowTitle = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${app.pid}).MainWindowTitle`], { encoding: 'utf8' }).trim();
  result.checks.nativeTitleShowsHead = result.nativeWindowTitle === expectedTitle;
  result.isLocalAuthority = await page.evaluate(() => window.__SMARTLEARN_LOCAL_AUTHORITY__ === true);
  result.checks.localAuthority = result.isLocalAuthority;

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

  const password = 'a genuinely long test password 1';
  const stamp = `${Date.now()}`;
  // account A: synthetic study data (the VERDICT-1 shape: one large stable area, one tiny worsening area)
  const emailA = `smoke-a-${stamp}@example.com`;
  await api('POST', '/v1/auth/register', { email: emailA, password });
  await api('POST', '/v1/auth/login', { email: emailA, password });
  const unitWithEvidence = async (subject, title, rows) => {
    const { unit } = await api('POST', '/v1/learning-units', { newSubjectName: subject, title, studyDate: isoDaysAgo(70) });
    for (const [ago, questionsCount, correctCount] of rows) {
      await api('POST', '/v1/learning-evidence', { unitId: unit.id, type: 'EXTERNAL', questionsCount, correctCount, evidenceDate: isoDaysAgo(ago) });
    }
  };
  await unitWithEvidence('Estável Grande', 'Aula grande', [[45, 100, 70], [5, 100, 70]]);
  await unitWithEvidence('Piora Pequena', 'Aula pequena', [[45, 10, 8], [5, 10, 4]]);
  const backup = await api('GET', '/v1/export');
  result.backup = { exportVersion: backup.exportVersion, subjects: backup.subjects.length, units: backup.learningUnits.length, evidence: backup.learningEvidence.length };
  await api('POST', '/v1/auth/logout', {});

  // account B: empty, signed in through the real login form
  const emailB = `smoke-b-${stamp}@example.com`;
  await api('POST', '/v1/auth/register', { email: emailB, password });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]:visible').first().click();
  await page.locator('#account-login-email').fill(emailB);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 10000 });
  result.emptyBefore = (await api('GET', '/v1/export')).subjects.length === 0;
  result.checks.accountBEmptyBeforeRestore = result.emptyBefore;

  // IMPORT-1 through the real UI
  await page.locator('[data-screen="settings"]:visible').first().click();
  await page.locator('#migration-file-input').setInputFiles({ name: 'smartlearn-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('#migration-preview-panel').waitFor({ state: 'visible', timeout: 10000 });
  result.previewCounts = (await page.locator('#migration-counts').innerText()).replace(/\s+/g, ' ');
  result.previewWarnings = (await page.locator('#migration-warnings').innerText()).replace(/\s+/g, ' ');
  result.checks.previewWroteNothing = (await api('GET', '/v1/export')).subjects.length === 0;
  await page.locator('#migration-confirm-btn').click();
  await page.locator('#confirm-dialog-ok').click();
  await page.locator('#migration-result-panel').waitFor({ state: 'visible', timeout: 15000 });
  result.resultSummary = (await page.locator('#migration-result-summary').innerText()).replace(/\s+/g, ' ');
  const after = await api('GET', '/v1/export');
  result.restored = { subjects: after.subjects.length, units: after.learningUnits.length, evidence: after.learningEvidence.length };
  result.checks.restoreCountsMatchBackup = JSON.stringify(result.restored) === JSON.stringify({ subjects: result.backup.subjects, units: result.backup.units, evidence: result.backup.evidence });
  result.checks.restoreSummaryConcluded = /Restauração concluída/.test(result.resultSummary) && /Disciplinas: 2/.test(result.resultSummary);

  // VERDICT-1 on the restored account
  await page.locator('[data-screen="stats"]:visible').first().click();
  await page.locator('#stats-verdict').waitFor({ state: 'visible', timeout: 15000 });
  result.verdict = {
    headline: (await page.locator('#stats-verdict-headline').innerText()).trim(),
    detail: (await page.locator('#stats-verdict-detail').innerText()).replace(/\s+/g, ' ').trim(),
    attention: (await page.locator('#stats-verdict-attention-text').innerText()).replace(/\s+/g, ' ').trim(),
  };
  result.checks.verdictStableByVolume = /Seu desempenho está estável/.test(result.verdict.headline);
  result.checks.verdictDetailVolumes = result.verdict.detail.includes('1 piorando (20 questões)') && result.verdict.detail.includes('1 estável (200 questões)');
  result.checks.verdictNamesSmallWorsening = result.verdict.attention.includes('Aula pequena') && result.verdict.attention.includes('de 80% para 40%');
} finally {
  await browser?.close().catch(() => {});
  // only the process this script started (and its tree: backend + WebView2 children)
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  await sleep(1500);
  rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
result.pass = Object.values(result.checks).every(Boolean);
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
