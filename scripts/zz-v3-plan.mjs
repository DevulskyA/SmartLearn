// TEMPORARY (not committed): screenshots of the REAL native Desktop (Tauri + WebView2) for the screens changed by R-3, R-4 and R-5.
// Throwaway data only (own folder under the OS temp dir, never the human's SmartLearn-DevData), the server's fake provider (no AI call),
// and the window is closed at the end. Prints ONE JSON object with the PNG paths. Run from the worktree root:
//   $env:CARGO_TARGET_DIR="$env:LOCALAPPDATA\Temp\sl-fw-target"; node scripts/zz-native-shots.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = process.env.CARGO_TARGET_DIR ?? join(process.env.LOCALAPPDATA, 'Temp', 'sl-fw-target');
const exe = resolve(join(target, 'debug', 'smartlearn.exe'));
if (!existsSync(exe)) throw new Error(`executable missing: ${exe}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok, fail) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', fail); });
const running = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Process -Name smartlearn -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }; exit 0'], { encoding: 'utf8' }).toLowerCase();
if (running.includes(exe.toLowerCase())) throw new Error('a smartlearn.exe from this build is already running');
const work = mkdtempSync(join(tmpdir(), 'sl-shots-desktop-'));
if (work.toLowerCase().startsWith(join(homedir(), 'SmartLearn-DevData').toLowerCase())) throw new Error('refusing the human datastore');
const identity = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().replace('claude/', '');
const cdpPort = await freePort();
const env = {
  ...process.env,
  SMARTLEARN_LOCAL_AUTHORITY: 'true',
  SMARTLEARN_DB_PATH: join(work, 'shots.db'),
  SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head,
  SMARTLEARN_BUILD_CONTENT: identity.inputsHash,
  SMARTLEARN_BUILD_MODE: 'DEV',
  SMARTLEARN_WINDOW_TITLE: `SmartLearn DEV - CAPTURAS DESCARTAVEIS [${branch} @ ${head}]`,
  SMARTLEARN_DEV_PERSISTENT_SESSION: 'true',
  WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
};
for (const key of ['SMARTLEARN_AI_PROVIDER', 'SMARTLEARN_AI_CONSENT', 'SMARTLEARN_AI_API_KEY', 'SMARTLEARN_AI_MODEL', 'SMARTLEARN_AI_API_URL']) delete env[key];
const app = spawn(exe, [], { env, stdio: 'ignore', detached: true });
app.unref();
const shots = {};
let browser;
try {
  for (let i = 0; i < 300; i += 1) { try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* not yet */ } await sleep(300); }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  let page;
  for (let i = 0; i < 150 && !page; i += 1) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url())); if (!page) await sleep(300); }
  if (!page) throw new Error('window page not found');
  await page.waitForLoadState('networkidle');
  const snap = async (name) => { const path = join(work, `${name}.png`); await sleep(500); await page.screenshot({ path }); shots[name] = path; };

  const email = `capturas-${Date.now()}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.evaluate(async ({ email, password }) => {
    const res = await fetch(`${window.__SMARTLEARN_API_BASE__}/v1/auth/register`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!res.ok) throw new Error(`register ${res.status}`);
  }, { email, password });
  await page.locator('[data-screen="account"]:visible').first().click();
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 15000 });

  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const resize = async (w, h) => { await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', width: w, height: h } }); await sleep(600); };
  // a lesson so that Hoje/Plano/Estatisticas have content: upload, draft, accept
  await page.locator('[data-screen="materials"]:visible').first().click();
  await page.locator('#sources-card').waitFor({ state: 'visible', timeout: 10000 });
  const PAGES = ['Helicobacter pylori é um bacilo Gram-negativo espiralado que coloniza o estômago humano e produz urease.','A urease quebra a ureia em amônia e dióxido de carbono; a bactéria adere ao epitélio gástrico por adesinas.','A infecção se associa a gastrite crônica, úlcera péptica e câncer gástrico; o tratamento dura 10 a 14 dias.'];
  await page.setInputFiles('#sources-file-input', { name: 'h-pylori.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(PAGES) });
  await page.locator('#sources-message').getByText(/trechos? propostos?/).waitFor({ timeout: 20000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await editor.waitFor({ state: 'visible', timeout: 30000 });
  await editor.locator('.source-draft-subject-input').scrollIntoViewIfNeeded();
  await editor.locator('.source-draft-subject-input').fill('Gastroenterologia');
  await editor.locator('.source-draft-date-input').fill('2026-10-26');
  await editor.locator('[data-action="accept-draft"]').click();
  await editor.locator('.source-draft-result').getByText('Aula criada').waitFor({ timeout: 15000 });
  for (const [w, h] of [[1280, 820], [800, 600]]) { await resize(w, h); await editor.locator('.lesson-head').scrollIntoViewIfNeeded(); await snap('editor-resumo-lendo-' + w); await editor.locator('[data-action="toggle-summary-read"]').click(); await snap('editor-resumo-editando-' + w); await editor.locator('[data-action="toggle-summary-read"]').click(); }
  for (const [w, h] of [[1280, 820], [800, 600]]) {
    await resize(w, h);
    await page.locator("[data-screen=\"plan\"]:visible").first().click(); await sleep(700);
    await page.locator(".plan-row [aria-expanded]").first().click(); await sleep(900);
    await page.locator(".plan-summary-section").first().scrollIntoViewIfNeeded(); await sleep(400);
    await snap("plano-resumo-aceito-" + w);
  }
  console.log(JSON.stringify({ ok: true, head, dataFolder: work, shots }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  try { process.kill(app.pid); } catch { /* already closed */ }
}
process.exit(0);
