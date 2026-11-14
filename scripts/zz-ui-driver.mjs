// Test-only driver (untracked on purpose): keeps ONE isolated native SmartLearn (Tauri + WebView2) open and lets a tester act on it one
// command at a time, like a person: list what is on screen, click, type, press keys, take a screenshot, read console errors.
//   node scripts/zz-ui-driver.mjs start            launches the isolated app + a control server, prints the state
//   node scripts/zz-ui-driver.mjs <command> ...    talks to the running one (snap, text, click, fill, type, select, key, shot, console, ...)
// Same isolation rules as scripts/desktop-study-journey.mjs: throwaway data under the OS temp dir, no model, never the human datastore.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, openSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(tmpdir(), 'sl-ui-driver-state.json');
const [, , cmd, ...args] = process.argv;

function batchOutputLine(ok, line, last, output, command) {
  let detail;
  if (last || !ok) detail = `\n${output}`;
  else if (command === 'snap' || command === 'text') detail = '';
  else detail = ` -> ${output.split('\n').pop().slice(0, 100)}`;
  return `${ok ? 'ok ' : 'ERR '}${line}${detail}`;
}

const slowLine = (entry) => `#${entry.n} ${entry.ms}ms ${entry.line.slice(0, 50)}`;

if (cmd !== 'daemon') {
  if (cmd === 'start') {
    if (existsSync(STATE)) { console.log(readFileSync(STATE, 'utf8')); console.log('already started'); process.exit(0); }
    const log = openSync(join(tmpdir(), 'sl-ui-driver.log'), 'a');
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'daemon'], { cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true }).unref();
    for (let i = 0; i < 240; i += 1) {
      if (existsSync(STATE)) { console.log(readFileSync(STATE, 'utf8')); process.exit(0); }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.error('driver did not start in 120 s; see', join(tmpdir(), 'sl-ui-driver.log'));
    process.exit(1);
  }
  if (!existsSync(STATE)) { console.error('no driver running; run: node scripts/zz-ui-driver.mjs start'); process.exit(1); }
  const { ctl } = JSON.parse(readFileSync(STATE, 'utf8'));
  if (cmd === 'batch') {
    // batch <file>: one command per line (quote args with "..."), run back to back in ONE call; only the last snap/text prints in full,
    // every other line prints one short result line. Stops at the first ERROR unless the file's first line is "# keep-going".
    // Why: a model round trip costs ~3 s and ~10k tokens per call, a driver command ~0.3 s; one batch replaces 10-30 round trips.
    if (!args[0]) { console.error('usage: batch <file>'); process.exit(1); }
    const lines = readFileSync(args[0], 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const keepGoing = /^#\s*keep-going/.test(readFileSync(args[0], 'utf8').trimStart());
    const t0 = Date.now(); let failed = 0;
    const SLOW_MS = 700; const slow = [];
    const fullLog = []; // complete output of every line goes to lotes/logs/<batch>.log; the model reads only the compact lines printed to the console
    for (const [i, line] of lines.entries()) {
      const lineStart = Date.now();
      const parts = [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
      const [c, ...a] = parts;
      const r = await fetch(`http://127.0.0.1:${ctl}/cmd`, { method: 'POST', body: JSON.stringify({ cmd: c, args: a, quiet: i < lines.length - 1, evidence: join(dirname(args[0]), 'falhas', `${args[0].replace(/^.*[\\/]/, '').replace(/\.txt$/, '')}-L${i + 1}`) }) }).catch((e) => { console.error('driver unreachable:', e.message); process.exit(1); });
      const out = await r.text();
      const last = i === lines.length - 1;
      if (Date.now() - lineStart > SLOW_MS && !/^(wait|restart)\b/.test(line)) slow.push({ n: i + 1, ms: Date.now() - lineStart, line });
      console.log(batchOutputLine(r.ok, line, last, out, c));
      fullLog.push(`${r.ok ? 'ok ' : 'ERR'} ${line}\n${out}`);
      if (!r.ok) { failed += 1; if (!keepGoing) break; }
    }
    // Slow-line report: every line is expected to take well under a second (the app is local and instant). Anything slower is a defect
    // of the test (wrong target, missing wait target), never normal: it is named so the test gets fixed instead of tolerated.
    if (slow.length) console.log(`SLOW LINES (>${SLOW_MS} ms): ${slow.map(slowLine).join(' | ')}`);
    console.log(`batch: ${lines.length} lines, ${failed} failed, ${Date.now() - t0} ms`);
    try { const ld = join(dirname(args[0]), 'logs'); mkdirSync(ld, { recursive: true }); writeFileSync(join(ld, `${args[0].replace(/^.*[\\/]/, '').replace(/\.txt$/, '')}.log`), `${fullLog.join('\n')}\n`); } catch { /* the log never breaks a test */ }
    // Measured runtime baseline (rule: every test has a measured time and any deviation is a problem). `batch <file> --record` stores the time of a
    // clean run next to the batches; later runs outside [0.5x - 0.5 s, 1.5x + 0.5 s] are flagged: slower means a slow target or a regressed app,
    // faster means steps were skipped or something failed silently.
    const baselineFile = join(dirname(args[0]), 'baseline.json');
    const key = args[0].replace(/^.*[\\/]/, '');
    const total = Date.now() - t0;
    let baselines = {}; try { baselines = JSON.parse(readFileSync(baselineFile, 'utf8')); } catch { /* none yet */ }
    if (args[1] === '--record') {
      if (failed) console.log('NOT RECORDED: the run had failures; a baseline comes only from a clean run.');
      else { baselines[key] = { ms: total, lines: lines.length }; writeFileSync(baselineFile, JSON.stringify(baselines, null, 1)); console.log(`BASELINE RECORDED ${key}: ${total} ms, ${lines.length} lines`); }
    } else if (!baselines[key]) console.log(`NO BASELINE for ${key}: run once clean with --record. An unmeasured test cannot detect a slowdown.`);
    else {
      const b = baselines[key];
      if (b.lines !== lines.length || total > b.ms * 1.5 + 500 || total < b.ms * 0.5 - 500) { console.log(`PERF DEVIATION ${key}: ${total} ms vs baseline ${b.ms} ms (${b.lines} lines, now ${lines.length}). Investigate: slower = slow target or regression; faster = skipped steps.`); process.exitCode = 5; }
    }
    // A line over 1.5 s is a test defect (it waited on a target that never came): the run fails with its own exit code even if every command "passed".
    const hardSlow = slow.filter((s) => s.ms > 1500);
    if (hardSlow.length) { console.log(`BATCH REJECTED AS SLOW: ${hardSlow.length} line(s) over 1500 ms. Fix those lines' targets; do not accept this run.`); process.exit(4); }
    process.exit(failed ? 2 : (process.exitCode ?? 0));
  }
  // Speed guard: a model round trip costs ~3 s and ~10k tokens, a driver command ~0.3 s. Many single calls in a row means the work should be a batch.
  const pace = join(tmpdir(), 'sl-ui-driver-pace.json');
  try {
    const now = Date.now();
    const recent = [...JSON.parse(existsSync(pace) ? readFileSync(pace, 'utf8') : '[]'), now].filter((t) => now - t < 60000);
    writeFileSync(pace, JSON.stringify(recent));
    if (recent.length > 16 && cmd !== 'batch') {
      console.error(`SPEED BLOCK: ${recent.length} separate calls in 60 s. Refused. Write the steps to a file and run: node scripts/zz-ui-driver.mjs batch <file>.`);
      process.exit(3);
    }
    if (recent.length >= 8 && cmd !== 'batch') console.error(`SPEED WARNING: ${recent.length} separate calls in 60 s. Write the steps to a file and run: node scripts/zz-ui-driver.mjs batch <file> (one call, ~0.2 s per step).`);
  } catch { /* the guard never blocks a command */ }
  const res = await fetch(`http://127.0.0.1:${ctl}/cmd`, { method: 'POST', body: JSON.stringify({ cmd, args }) }).catch((e) => { console.error('driver unreachable:', e.message); process.exit(1); });
  console.log(await res.text());
  process.exit(res.ok ? 0 : 2);
}

// ---------------------------------------------------------------- daemon
const { chromium } = await import('@playwright/test');
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target');
const exe = resolve(process.env.SL_JOURNEY_EXE ?? join(targetDir, 'debug', 'smartlearn.exe'));
const GIT_EXE = resolve(process.env.SL_GIT_EXE ?? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'));
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const POWERSHELL_EXE = join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const TASKKILL_EXE = join(SYSTEM_ROOT, 'System32', 'taskkill.exe');
// windowsHide on EVERY helper process: the daemon has no console, so each console child (git, node, powershell, taskkill) would otherwise pop a black window on the person's screen
const git = (...a) => execFileSync(GIT_EXE, a, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const identity = JSON.parse(execFileSync(process.execPath, ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const title = `SmartLearn DEV - v${identity.version} - ${head}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok, fail) => { const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', fail); });
const ps = (command) => execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', `${command}; exit 0`], { encoding: 'utf8', windowsHide: true }).trim();

if (!existsSync(exe)) throw new Error(`debug executable missing: ${exe}`);
if (ps('Get-Process -Name smartlearn -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }').split(/\r?\n/).map((p) => p.trim().toLowerCase()).includes(exe.toLowerCase())) throw new Error('that smartlearn.exe is already running (someone else\'s)');
const work = mkdtempSync(join(tmpdir(), 'sl-ui-driver-'));
if (work.toLowerCase().startsWith(join(homedir(), 'SmartLearn-DevData').toLowerCase())) throw new Error('refusing the human datastore');
const baseEnv = {
  ...process.env, SMARTLEARN_LOCAL_AUTHORITY: 'true', SMARTLEARN_DB_PATH: join(work, 'app.db'), SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head, SMARTLEARN_BUILD_CONTENT: identity.inputsHash, SMARTLEARN_BUILD_MODE: 'DEV', SMARTLEARN_WINDOW_TITLE: title,
  SMARTLEARN_DEV_PERSISTENT_SESSION: 'true', WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
};
for (const k of ['SMARTLEARN_AI_PROVIDER', 'SMARTLEARN_AI_CONSENT', 'SMARTLEARN_AI_API_KEY', 'SMARTLEARN_AI_MODEL', 'SMARTLEARN_AI_API_URL']) delete baseEnv[k];

let app; let browser; let page; let cdp;
const events = []; // console errors, page errors, failed or >=400 requests, dialogs
let dialogPolicy = 'accept';
const note = (kind, text) => events.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(text).slice(0, 300)}`);

async function waitForMoverReady(mover, ready) {
  for (let i = 0; i < 100 && !existsSync(ready) && mover.exitCode === null; i += 1) await sleep(100);
}

async function waitForCdp() {
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok) return; } catch { /* not yet */ }
    if (app.exitCode !== null) throw new Error(`exe exited early (${app.exitCode})`);
    if (Date.now() > deadline) throw new Error('CDP not up in 90 s');
    await sleep(300);
  }
}

async function findDesktopPage() {
  for (let i = 0; i < 150; i += 1) {
    const found = browser.contexts().flatMap((context) => context.pages()).find((candidate) => /^http:\/\/127\.0\.0\.1:\d+\//.test(candidate.url()));
    if (found) return found;
    await sleep(300);
  }
  return undefined;
}

async function launch() {
  cdp = await freePort();
  // The mover starts FIRST and signals when it is compiled and watching: the app creates its window hidden on the primary display and shows it
  // ~0.5 s later, and a mover that starts after the app loses that race (the window flashed over the display the person works on).
  const ready = join(work, 'mover-ready'); rmSync(ready, { force: true });
  const mover = spawn(POWERSHELL_EXE, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'move-window-to-small-display.ps1'), '-ReadyFile', ready], { stdio: 'ignore', windowsHide: true });
  mover.on('error', () => {});
  await waitForMoverReady(mover, ready);
  app = spawn(exe, [], { env: { ...baseEnv, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdp}` }, stdio: 'ignore', windowsHide: false });
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
  page = undefined;
  page = await findDesktopPage();
  if (!page) throw new Error('window page not found');
  page.on('pageerror', (e) => note('pageerror', e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) note(`console.${m.type()}`, m.text()); });
  page.on('requestfailed', (r) => note('requestfailed', `${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) note(`http${r.status()}`, `${r.request().method()} ${r.url()}`); });
  page.on('dialog', async (d) => { note('dialog', `${d.type()}: ${d.message()} -> ${dialogPolicy}`); await (dialogPolicy === 'accept' ? d.accept() : d.dismiss()); });
  await page.waitForLoadState('networkidle').catch(() => {});
}
async function shutdown() {
  const pid = app.pid;
  const kids = ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.ProcessId }`).split(/\r?\n/).filter(Boolean);
  await browser?.close().catch(() => {});
  if (app.exitCode === null) taskKill(['/PID', String(pid)]);
  for (const t = Date.now() + 20000; app.exitCode === null && Date.now() < t;) await sleep(300);
  if (app.exitCode === null) taskKill(['/PID', String(pid), '/T', '/F']);
  await sleep(1500);
  for (const k of kids) taskKill(['/PID', k, '/T', '/F']);
}

function taskKill(args) {
  try { execFileSync(TASKKILL_EXE, args, { stdio: 'ignore', windowsHide: true }); } catch { /* process already gone or window refused */ }
}

const ACTION_METHODS = ['click', 'dblclick', 'hover', 'fill', 'check', 'uncheck', 'selectOption', 'setInputFiles'];

function proxyGet(target, property, action) {
  if (ACTION_METHODS.includes(property)) return action(property);
  const value = target[property];
  return typeof value === 'function' ? value.bind(target) : value;
}

const loc = (target) => {
  if (/^\d+$/.test(target)) {
    const l = page.locator(`[data-uid="${target}"]`);
    const guard = (fn) => async (...x) => {
      if (!(await l.count())) throw new Error(`controle [${target}] não existe mais (tela mudou): rode snap e use o número novo`);
      return l[fn](...x);
    };
    return new Proxy(l, { get: (proxyTarget, property) => proxyGet(proxyTarget, property, guard) });
  }
  if (target.startsWith('css:')) return page.locator(target.slice(4)).first();
  if (target.startsWith('label:')) return page.getByLabel(target.slice(6), { exact: false }).filter({ visible: true }).first(); // a form field by its visible label, like a student finds it
  // A text target means the control a student would press: a button/link/tab with that text wins over a heading or paragraph that merely
  // contains it (otherwise "Criar conta" hits the page title, not the button). Plain text is the fallback.
  const wanted = target.replace(/"/g, '\\"');
  const controls = page.locator(`button:has-text("${wanted}"), a:has-text("${wanted}"), [role=button]:has-text("${wanted}"), [role=tab]:has-text("${wanted}"), [role=menuitem]:has-text("${wanted}"), summary:has-text("${wanted}"), label:has-text("${wanted}")`).filter({ visible: true }).first();
  const plain = page.getByText(target, { exact: false }).filter({ visible: true }).first();
  const pick = (fn) => async (...x) => ((await controls.count()) ? controls : plain)[fn](...x);
  return new Proxy(plain, { get: (proxyTarget, property) => proxyGet(proxyTarget, property, pick) });
};
const snapshot = async (full = false) => page.evaluate(({ full }) => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=link],[role=checkbox],[role=switch],[role=option],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const controlName = (el, tag) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const labelled = labelledBy ? clean(document.getElementById(labelledBy)?.textContent) : '';
    const fieldLabel = el.id ? clean(document.querySelector(`label[for="${el.id}"]`)?.textContent) : '';
    const placeholder = tag === 'input' || tag === 'textarea' ? el.placeholder : '';
    return clean(el.getAttribute('aria-label') || labelled || fieldLabel || placeholder || el.innerText || el.title || el.value).slice(0, 70);
  };
  const controlValue = (el, tag) => {
    if (el.type === 'password') return el.value ? '***' : '';
    const value = tag === 'select' ? el.selectedOptions[0]?.text : el.value;
    return clean(value).slice(0, 40);
  };
  const controlState = (el, tag) => {
    const state = [];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') state.push('disabled');
    if (el.checked) state.push('checked');
    for (const attr of ['aria-expanded', 'aria-selected', 'aria-current', 'aria-pressed']) {
      const value = el.getAttribute(attr);
      if (value && value !== 'false') state.push(`${attr.slice(5)}=${value}`);
    }
    if (['input', 'textarea', 'select'].includes(tag) && el.type !== 'checkbox' && el.type !== 'radio') {
      state.push(`value="${controlValue(el, tag)}"`); // secrets never reach logs or evidence files
    }
    if (tag === 'a') state.push(`href=${el.getAttribute('href')}`);
    return state;
  };
  const controlLine = (el, index) => {
    const tag = el.tagName.toLowerCase();
    const name = controlName(el, tag);
    const state = controlState(el, tag);
    const role = el.getAttribute('role') || (tag === 'input' ? `input:${el.type}` : tag);
    const details = state.length ? ` (${state.join(', ')})` : '';
    el.setAttribute('data-uid', String(index));
    return `[${index}] ${role} "${name}"${details}`;
  };
  const visibleControls = (scope) => {
    const lines = [];
    let index = 0;
    for (const el of scope.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      lines.push(controlLine(el, index));
      index++;
    }
    return lines;
  };
  const modal = [...document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]')].filter(visible).pop();
  const scope = modal ?? document;
  document.querySelectorAll('[data-uid]').forEach((e) => e.removeAttribute('data-uid'));
  const lines = visibleControls(scope);
  const heads = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((h) => clean(h.textContent)).slice(0, 8);
  const alerts = [...document.querySelectorAll('[role=alert],[role=status],[aria-live],.toast,.banner')].filter(visible).map((a) => clean(a.textContent)).filter(Boolean).slice(0, 6);
  const text = clean((modal ?? document.body).innerText);
  return [`URL ${location.href}`, `TITLE ${document.title}`, modal ? 'MODAL OPEN (only its controls are listed)' : '', `HEADINGS ${heads.join(' | ')}`, `ALERTS ${alerts.join(' | ') || '-'}`, '--- controls', ...lines, '--- text', full ? text.slice(0, 9000) : text.slice(0, 700)].filter((l) => l !== '').join('\n');
}, { full });
let quiet = false; // inside a batch only the last line reports the screen; the others skip the 250 ms settle pause (Playwright already waits for each target)
const brief = async () => {
  if (quiet) return 'ok';
  await sleep(250);
  return page.evaluate(() => `now: ${location.hash || location.pathname} | ${[...document.querySelectorAll('h1,h2')].filter((h) => h.getBoundingClientRect().width).map((h) => h.textContent.trim()).slice(0, 2).join(' | ')} | alerts: ${[...document.querySelectorAll('[role=alert],[role=status]')].map((a) => a.textContent.trim()).filter(Boolean).slice(0, 3).join(' | ') || '-'}`);
};

const commandHandlers = new Map([
  ['snap', () => snapshot(false)],
  ['text', () => snapshot(true)],
  ['click', async (a) => { await loc(a[0]).click({ timeout: 1200 }); return `clicked\n${await brief()}`; }],
  ['dblclick', async (a) => { await loc(a[0]).dblclick({ timeout: 1200 }); return `double-clicked\n${await brief()}`; }],
  ['hover', async (a) => { await loc(a[0]).hover({ timeout: 1200 }); return 'hovered'; }],
  ['fill', async (a) => { await loc(a[0]).fill(a.slice(1).join(' '), { timeout: 1200 }); return 'filled'; }],
  ['type', async (a) => { await loc(a[0]).click({ timeout: 1200 }); await page.keyboard.type(a.slice(1).join(' '), { delay: 8 }); return 'typed'; }],
  ['select', async (a) => { await loc(a[0]).selectOption({ label: a.slice(1).join(' ') }, { timeout: 1200 }).catch(async () => loc(a[0]).selectOption(a.slice(1).join(' '), { timeout: 1200 })); return `selected\n${await brief()}`; }],
  ['check', async (a) => { await loc(a[0]).check({ timeout: 1200 }); return 'checked'; }],
  ['uncheck', async (a) => { await loc(a[0]).uncheck({ timeout: 1200 }); return 'unchecked'; }],
  ['key', async (a) => { await page.keyboard.press(a[0]); return `pressed\n${await brief()}`; }],
  ['upload', async (a) => { await loc(a[0]).setInputFiles(a[1], { timeout: 1200 }); return 'file set'; }],
  ['shot', async (a) => { await page.screenshot({ path: a[0] }); return `saved ${a[0]}`; }],
  // size <width> <height>: resizes the real window (outer size, physical pixels) so narrow-window behaviour (390 px phone width) can be tested.
  ['size', async (a) => {
    const [w, h] = [Number(a[0]), Number(a[1])];
    if (!(w >= 300 && h >= 300)) throw new Error('uso: size <largura> <altura> (mínimo 300)');
    ps(`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class SlW { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }'; $h = (Get-Process -Id ${app.pid}).MainWindowHandle; [SlW]::ShowWindow($h, 9) | Out-Null; [SlW]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, ${w}, ${h}, 0x0002 -bor 0x0004) | Out-Null`);
    await sleep(300);
    const viewport = await page.evaluate(() => `${innerWidth}x${innerHeight}`);
    return `window ${viewport} (viewport)`;
  }],
  // noscroll: fails if the page scrolls sideways (content wider than the window), the classic narrow-window defect
  ['noscroll', async () => {
    const metrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (metrics.sw > metrics.iw + 1) throw new Error(`rolagem horizontal: conteúdo ${metrics.sw}px em janela de ${metrics.iw}px`);
    return `sem rolagem horizontal (${metrics.sw}/${metrics.iw})`;
  }],
  ['wait', async (a) => { await sleep(Number(a[0] ?? 500)); return 'waited'; }],
  // expect <texto>: passes the instant the text is visible (max 3 s), fails with the cause otherwise. Use it instead of wait/sleep: it is exact and as fast as the app.
  ['expect', async (a) => { await page.getByText(a.join(' '), { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => { throw new Error(`texto esperado não apareceu: "${a.join(' ')}"`); }); return 'seen'; }],
  // ensure <opener> <target>: open a toggle panel only if it is closed (a second click on the opener would close it); makes batches independent of leftover state.
  ['ensure', async (a) => {
    const selector = a[1].startsWith('css:') ? a[1].slice(4) : a[1];
    if (!(await page.locator(selector).first().isVisible())) await loc(a[0]).click({ timeout: 1200 });
    return 'open';
  }],
  ['gone', async (a) => { await page.getByText(a.join(' '), { exact: false }).first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { throw new Error(`texto ainda visível: "${a.join(' ')}"`); }); return 'gone'; }],
  ['reload', async () => { await page.reload({ waitUntil: 'networkidle' }); return `reloaded\n${await brief()}`; }],
  ['back', async () => { await page.goBack().catch(() => {}); return `back\n${await brief()}`; }],
  ['forward', async () => { await page.goForward().catch(() => {}); return `forward\n${await brief()}`; }],
  ['goto', async (a) => { await page.evaluate((hash) => { location.hash = hash; }, a[0]); return `hash set\n${await brief()}`; }],
  ['dialog', (a) => { dialogPolicy = a[0] === 'dismiss' ? 'dismiss' : 'accept'; return `dialogs will be ${dialogPolicy}ed`; }],
  ['console', (a) => {
    const out = events.join('\n') || '(no console errors, page errors or failed requests)';
    if (a[0] === 'clear') events.length = 0;
    return out;
  }],
  ['restart', async () => { await shutdown(); await launch(); writeState(); return `app closed and reopened on the SAME data\n${await brief()}`; }],
  ['quit', () => {
    setTimeout(async () => {
      await shutdown(); try { rmSync(STATE); } catch { /* gone */ }
      // the instance's data is throwaway: remove it with the instance (only our own prefix under the OS temp dir, never anything else)
      if (resolve(dirname(work)).toLowerCase() === resolve(tmpdir()).toLowerCase() && /^sl-ui-driver-/.test(work.split(/[\\/]/).pop())) { try { rmSync(work, { recursive: true, force: true }); } catch { /* still locked: the guard sweeps it later */ } }
      process.exit(0);
    }, 50);
    return 'closing';
  }],
]);

async function run(c, a) {
  const handler = commandHandlers.get(c);
  if (!handler) throw new Error(`unknown command ${c}. commands: snap text click dblclick hover fill type select check uncheck key upload shot wait reload back forward goto dialog console restart quit`);
  return handler(a);
}
let ctl;
const RETIRES_NUMBERS = new Set(['click', 'dblclick', 'key', 'goto', 'reload', 'back', 'forward', 'select', 'upload', 'dialog', 'restart']);
const writeState = () => writeFileSync(STATE, JSON.stringify({ ctl, cdp, pid: app.pid, work, head, title }));
await launch();
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', async () => {
    const t0 = Date.now();
    let verdict = 'ok';
    let parsed = {};
    try {
      parsed = JSON.parse(body);
      quiet = parsed.quiet === true;
      const out = await run(parsed.cmd, parsed.args);
      // Control numbers belong to the snap that printed them. Anything that can change the screen retires them, so an old [n] fails loudly
      // ("run snap") instead of silently hitting whatever now has that number.
      if (RETIRES_NUMBERS.has(parsed.cmd)) await page.evaluate(() => document.querySelectorAll('[data-uid]').forEach((e) => e.removeAttribute('data-uid'))).catch(() => {});
      res.end(out);
    } catch (e) {
      verdict = 'ERR'; res.statusCode = 500;
      let ref = '';
      // A failing line inside a batch saves its own evidence (screen shot, controls/text, console events) so triage needs zero extra tool calls.
      if (parsed.evidence) {
        try {
          mkdirSync(parsed.evidence, { recursive: true });
          await page.screenshot({ path: join(parsed.evidence, 'falha.png') });
          writeFileSync(join(parsed.evidence, 'tela.txt'), `${await snapshot(false)}\n--- console\n${events.join('\n') || '-'}\n`);
          ref = ` | EVIDENCE ${parsed.evidence}`;
        } catch { /* evidence is best effort: the failure itself is still reported */ }
      }
      res.end(`ERROR ${String(e.message).split('\n')[0]}${ref}`);
    }
    // one line per command (time, duration, verdict): the first place to look when a run feels slow
    try { appendFileSync(join(tmpdir(), 'sl-ui-driver.log'), `${new Date().toISOString().slice(11, 23)} ${String(Date.now() - t0).padStart(5)}ms ${verdict} ${parsed.cmd ?? '?'} ${(parsed.args ?? []).join(' ').slice(0, 60)}\n`); } catch { /* logging never breaks a test */ }
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
ctl = server.address().port;
writeState();
