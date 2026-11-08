// N7 native navigation sweep: Configurações, Conta, the "Mais" menu and the way back, in the REAL Tauri/WebView2 window.
// Focused and independent of the 23-step journey: throwaway data, no AI provider, no real generation, no mouse or Computer Use (CDP only).
//   CARGO_TARGET_DIR=C:\Projetos\SmartLearn-journey-target node scripts/desktop-nav-n7.mjs
// Exit 0 = every check passed; 1 = a check failed (message names it); 2 = instrument problem (exe missing, already running, CDP down).
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { verifyServedIdentity } from './desktop-identity.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target');
const exe = resolve(process.env.SL_JOURNEY_EXE ?? join(targetDir, 'debug', 'smartlearn.exe'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const identity = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const expectedTitle = `SmartLearn DEV - v${identity.version} - ${head}`;
const ps = (command) => execFileSync('powershell', ['-NoProfile', '-Command', `${command}; exit 0`], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok, fail) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', fail); });

const instrument = (message) => { console.error(`INSTRUMENT: ${message}`); process.exit(2); };
if (!existsSync(exe)) instrument(`debug executable missing: ${exe}`);
// the exe serves the frontend beside it: it must be the CURRENT content (scripts/desktop-identity.mjs), or this sweep would prove an older build
// SL_EXPECTED_INPUTS_HASH: only for an exe built from ANOTHER checkout of the same content (this sweep may run from a candidate worktree whose sources differ).
// /health/build is NOT evidence of the content served: the backend echoes the SMARTLEARN_BUILD_* variables this script sets itself.
const served = verifyServedIdentity({ exe, expected: process.env.SL_EXPECTED_INPUTS_HASH ?? identity.inputsHash });
if (!served.ok) instrument(`wrong build under test: ${served.reason}`);
const running = ps('Get-Process -Name smartlearn -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }').split(/\r?\n/).map((p) => p.trim().toLowerCase()).filter(Boolean);
if (running.includes(exe.toLowerCase())) instrument(`${exe} is already running (someone else's Desktop instance)`);
const work = mkdtempSync(join(tmpdir(), 'sl-desktop-n7-'));
if (work.toLowerCase().startsWith(join(homedir(), 'SmartLearn-DevData').toLowerCase())) instrument('refusing to run against the human DEV datastore');

const cdpPort = await freePort();
const env = {
  ...process.env,
  SMARTLEARN_LOCAL_AUTHORITY: 'true',
  SMARTLEARN_DB_PATH: join(work, 'n7.db'),
  SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head,
  SMARTLEARN_BUILD_CONTENT: identity.inputsHash,
  SMARTLEARN_BUILD_MODE: 'DEV',
  SMARTLEARN_AI_PROVIDER: '', // empty = no provider configured (config.js: null); this sweep never generates anything
  SMARTLEARN_AI_CONSENT: 'false',
  SMARTLEARN_WINDOW_TITLE: expectedTitle,
  SMARTLEARN_DEV_PERSISTENT_SESSION: 'true',
  WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
};
const app = spawn(exe, [], { env, stdio: 'ignore', windowsHide: false });
// the person works on the larger display: move the window under test onto the smallest one, without stealing focus (same helper as the journey)
spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'move-window-to-small-display.ps1'), '-ProcessId', String(app.pid)], { stdio: 'ignore', windowsHide: true });
const checks = [];
let browser;
const cleanup = async () => {
  await browser?.close().catch(() => {});
  if (app.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(1500);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};
const check = async (name, fn) => {
  const startedAt = Date.now();
  try { const evidence = await fn(); checks.push({ name, status: 'PASS', ms: Date.now() - startedAt, evidence }); }
  catch (error) { checks.push({ name, status: 'FAIL', ms: Date.now() - startedAt, error: String(error?.message ?? error).split('\n')[0] }); throw error; }
};
const expect = (condition, message) => { if (!condition) throw new Error(`expectation failed: ${message}`); };

let exitCode = 0;
try {
  const bootAt = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* not yet */ }
    if (app.exitCode !== null) instrument(`exe exited early (${app.exitCode})`);
    if (Date.now() - bootAt > 30000) instrument(`CDP did not come up in 30 s on ${cdpPort}`);
    await sleep(300);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  let page;
  for (let i = 0; i < 100 && !page; i += 1) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
    if (!page) await sleep(300);
  }
  if (!page) instrument('Desktop window page not found over CDP');
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // A browser "401 (Unauthorized)" console line names no URL, and the signed-out start legitimately answers 401 before login (OBS-J1 in the journey).
  // So 401s are tracked by response: tolerated before sign-in, a failure after it.
  let signedIn = false;
  const late401 = [];
  page.on('response', (r) => { if (r.status() === 401 && signedIn) late401.push(`${r.request().method()} ${r.url().replace(/\?.*$/, '')}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) consoleErrors.push(`console.error: ${m.text()}`); });
  await page.waitForLoadState('networkidle');
  const screenId = () => page.evaluate(() => document.querySelector('.screen:not([hidden])')?.id ?? null);
  const go = async (id) => {
    const direct = page.locator(`.app-nav [data-screen="${id}"]:visible`).first();
    if (!(await direct.count()) && (await page.locator('#mobile-more-toggle').isVisible())) await page.locator('#mobile-more-toggle').click();
    await page.locator(`[data-screen="${id}"]:visible`).first().click();
    await page.locator(`#screen-${id}`).waitFor({ state: 'visible', timeout: 5000 });
  };

  await check('target identity: right exe, title, backend build', async () => {
    const title = ps(`(Get-Process -Id ${app.pid}).MainWindowTitle`);
    expect(title === expectedTitle, `window title "${title}" != "${expectedTitle}"`);
    const build = await page.evaluate(async () => (await fetch('/health/build')).json());
    expect(build.head === head && build.content === identity.inputsHash && build.mode === 'DEV', `backend identity ${JSON.stringify(build)}`);
    return { title, head: build.head, content: build.content.slice(0, 12) };
  });

  await check('synthetic account created and signed in', async () => {
    const email = `n7-${Date.now()}@example.com`;
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
    signedIn = true;
    return { signedIn: true };
  });

  // Wide layout, whatever size the native window opened with
  const initialWidth = await page.evaluate(() => window.innerWidth);
  const phoneLayout = await page.locator('#mobile-more-toggle').isVisible();
  await check(`${phoneLayout ? 'phone' : 'wide'} layout (${initialWidth} px): Materiais -> Configurações -> Conta -> back keeps context`, async () => {
    await go('materials');
    const hashMaterials = await page.evaluate(() => location.hash);
    await go('settings');
    await page.locator('#theme-select').selectOption('night');
    const themeAfterPick = await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.dataset.themeMode);
    await go('account');
    expect(await page.locator('#account-logged-in-view').isVisible(), 'Conta shows the signed-in view');
    // the router uses history.replaceState (src/app.js showScreen): there is no history entry to go back to, so "back" is navigating to the screen again
    await go('settings');
    const themeBack = await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.dataset.themeMode);
    expect(themeBack === themeAfterPick, `theme changed across navigation: ${themeAfterPick} -> ${themeBack}`);
    expect((await page.locator('#theme-select').inputValue()) === 'night', 'theme select lost its value after coming back');
    await go('materials');
    expect((await page.evaluate(() => location.hash)) === hashMaterials, 'returning to Materiais did not restore its address');
    expect(await page.locator('#sources-card').isVisible(), 'Materiais content is back');
    return { hashMaterials, theme: themeBack };
  });

  // Phone layout natively: shrink the real window, then exercise the "Mais" disclosure
  const original = JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'window-rect.ps1'), '-ProcessId', String(app.pid)], { encoding: 'utf8' }).trim().split('\n').pop()).rect;
  const narrow = JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'window-rect.ps1'), '-ProcessId', String(app.pid), '-X', String(original[0]), '-Y', String(original[1]), '-W', '420', '-H', '860'], { encoding: 'utf8' }).trim().split('\n').pop()).rect;
  await sleep(800);
  const widthNow = await page.evaluate(() => window.innerWidth);
  const toggle = page.locator('#mobile-more-toggle');
  const menu = page.locator('#mobile-more-menu');

  await check(`phone layout (${widthNow} px, window ${narrow[2] - narrow[0]}x${narrow[3] - narrow[1]}): "Mais" disclosure opens Configurações and Conta, closes on Escape and on a choice`, async () => {
    expect(await toggle.isVisible(), `the "Mais" button is not visible at ${widthNow} px (the OS may have refused the resize)`);
    await go('today');
    await toggle.click();
    expect((await toggle.getAttribute('aria-expanded')) === 'true', 'aria-expanded true after opening');
    expect(await menu.locator('[data-screen="settings"]').isVisible() && await menu.locator('[data-screen="account"]').isVisible(), 'Configurações and Conta visible in the menu');
    await page.keyboard.press('Escape');
    expect(await menu.isHidden(), 'Escape closes the menu');
    await toggle.click();
    await menu.locator('[data-screen="settings"]').click();
    await page.locator('#screen-settings').waitFor({ state: 'visible', timeout: 5000 });
    expect(await menu.isHidden(), 'choosing an item closes the menu');
    expect((await toggle.getAttribute('aria-current')) === 'page', '"Mais" marks itself current on Configurações');
    return { width: widthNow };
  });

  await check('phone layout: Conta, then back to the previous screen (Hoje) through the bar', async () => {
    await toggle.click();
    await menu.locator('[data-screen="account"]').click();
    await page.locator('#screen-account').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.app-nav > [data-screen="today"]').click();
    await page.locator('#screen-today').waitFor({ state: 'visible', timeout: 5000 });
    expect((await toggle.getAttribute('aria-current')) === 'false', '"Mais" is no longer current on a bar destination (src/app.js writes "false")');
    expect((await screenId()) === 'screen-today', 'back on Hoje');
    return { screen: await screenId() };
  });

  // put the window back where it was (the instance is removed anyway, but leave no surprise)
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'window-rect.ps1'), '-ProcessId', String(app.pid), '-X', String(original[0]), '-Y', String(original[1]), '-W', String(original[2] - original[0]), '-H', String(original[3] - original[1])], { stdio: 'ignore' });

  await check('no console or page errors during the sweep', async () => {
    expect(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    expect(late401.length === 0, `401 after sign-in: ${late401.slice(0, 3).join(' | ')}`);
    return { errors: 0, http401AfterSignIn: 0 };
  });
} catch (error) {
  exitCode = checks.some((c) => c.status === 'FAIL') ? 1 : 1;
  console.error(`FAILED: ${String(error?.message ?? error).split('\n')[0]}`);
} finally {
  await cleanup();
}
for (const c of checks) console.log(`${c.status} ${c.name} (${c.ms} ms)${c.error ? ` :: ${c.error}` : ''}${c.evidence ? ` :: ${JSON.stringify(c.evidence)}` : ''}`);
console.log(`N7 native: ${checks.filter((c) => c.status === 'PASS').length}/${checks.length} passed, head ${head}, humanDevDatastoreTouched=false, AI=none`);
process.exit(exitCode);
