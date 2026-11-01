// Test-only driver (untracked on purpose): keeps ONE isolated native SmartLearn (Tauri + WebView2) open and lets a tester act on it one
// command at a time, like a person: list what is on screen, click, type, press keys, take a screenshot, read console errors.
//   node scripts/zz-ui-driver.mjs start            launches the isolated app + a control server, prints the state
//   node scripts/zz-ui-driver.mjs <command> ...    talks to the running one (snap, text, click, fill, type, select, key, shot, console, ...)
// Same isolation rules as scripts/desktop-study-journey.mjs: throwaway data under the OS temp dir, no model, never the human datastore.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, appendFileSync, openSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(tmpdir(), 'sl-ui-driver-state.json');
const [, , cmd, ...args] = process.argv;

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
    for (const [i, line] of lines.entries()) {
      const lineStart = Date.now();
      const parts = [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
      const [c, ...a] = parts;
      const r = await fetch(`http://127.0.0.1:${ctl}/cmd`, { method: 'POST', body: JSON.stringify({ cmd: c, args: a, quiet: i < lines.length - 1 }) }).catch((e) => { console.error('driver unreachable:', e.message); process.exit(1); });
      const out = await r.text();
      const last = i === lines.length - 1;
      if (Date.now() - lineStart > SLOW_MS && !/^(wait|restart)\b/.test(line)) slow.push({ n: i + 1, ms: Date.now() - lineStart, line });
      console.log(`${r.ok ? 'ok ' : 'ERR'} ${line}${last || !r.ok ? `\n${out}` : (c === 'snap' || c === 'text' ? '' : ` -> ${out.split('\n').pop().slice(0, 100)}`)}`);
      if (!r.ok) { failed += 1; if (!keepGoing) break; }
    }
    // Slow-line report: every line is expected to take well under a second (the app is local and instant). Anything slower is a defect
    // of the test (wrong target, missing wait target), never normal: it is named so the test gets fixed instead of tolerated.
    if (slow.length) console.log(`SLOW LINES (>${SLOW_MS} ms): ${slow.map((s) => `#${s.n} ${s.ms}ms ${s.line.slice(0, 50)}`).join(' | ')}`);
    console.log(`batch: ${lines.length} lines, ${failed} failed, ${Date.now() - t0} ms`);
    process.exit(failed ? 2 : 0);
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
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const identity = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const title = `SmartLearn DEV - v${identity.version} - ${head}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok, fail) => { const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', fail); });
const ps = (command) => execFileSync('powershell', ['-NoProfile', '-Command', `${command}; exit 0`], { encoding: 'utf8' }).trim();

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

async function launch() {
  cdp = await freePort();
  app = spawn(exe, [], { env: { ...baseEnv, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdp}` }, stdio: 'ignore', windowsHide: false });
  const mover = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'move-window-to-small-display.ps1'), '-ProcessId', String(app.pid)], { stdio: 'ignore' });
  mover.on('error', () => {});
  for (const t = Date.now() + 90000; ;) {
    try { if ((await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok) break; } catch { /* not yet */ }
    if (app.exitCode !== null) throw new Error(`exe exited early (${app.exitCode})`);
    if (Date.now() > t) throw new Error('CDP not up in 90 s');
    await sleep(300);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
  page = undefined;
  for (let i = 0; i < 150 && !page; i += 1) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
    if (!page) await sleep(300);
  }
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
  if (app.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' }); } catch { /* refuse */ } }
  for (const t = Date.now() + 20000; app.exitCode === null && Date.now() < t;) await sleep(300);
  if (app.exitCode === null) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(1500);
  for (const k of kids) { try { execFileSync('taskkill', ['/PID', k, '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}

const loc = (target) => {
  if (/^\d+$/.test(target)) {
    const l = page.locator(`[data-uid="${target}"]`);
    const guard = (fn) => async (...x) => {
      if (!(await l.count())) throw new Error(`controle [${target}] não existe mais (tela mudou): rode snap e use o número novo`);
      return l[fn](...x);
    };
    return new Proxy(l, { get: (t, p) => (['click', 'dblclick', 'hover', 'fill', 'check', 'uncheck', 'selectOption', 'setInputFiles'].includes(p) ? guard(p) : (typeof t[p] === 'function' ? t[p].bind(t) : t[p])) });
  }
  if (target.startsWith('css:')) return page.locator(target.slice(4)).first();
  if (target.startsWith('label:')) return page.getByLabel(target.slice(6), { exact: false }).locator('visible=true').first(); // a form field by its visible label, like a student finds it
  // A text target means the control a student would press: a button/link/tab with that text wins over a heading or paragraph that merely
  // contains it (otherwise "Criar conta" hits the page title, not the button). Plain text is the fallback.
  const wanted = target.replace(/"/g, '\\"');
  const controls = page.locator(`button:has-text("${wanted}"), a:has-text("${wanted}"), [role=button]:has-text("${wanted}"), [role=tab]:has-text("${wanted}"), [role=menuitem]:has-text("${wanted}"), summary:has-text("${wanted}"), label:has-text("${wanted}")`).locator('visible=true').first();
  const plain = page.getByText(target, { exact: false }).locator('visible=true').first();
  const pick = (fn) => async (...x) => ((await controls.count()) ? controls : plain)[fn](...x);
  return new Proxy(plain, { get: (t, p) => (['click', 'dblclick', 'hover', 'fill', 'check', 'uncheck', 'selectOption', 'setInputFiles'].includes(p) ? pick(p) : (typeof t[p] === 'function' ? t[p].bind(t) : t[p])) });
};
const snapshot = async (full = false) => page.evaluate(({ full }) => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=link],[role=checkbox],[role=switch],[role=option],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const modal = [...document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]')].filter(visible).pop();
  const scope = modal ?? document;
  document.querySelectorAll('[data-uid]').forEach((e) => e.removeAttribute('data-uid'));
  const lines = []; let i = 0;
  for (const el of scope.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const labelled = el.getAttribute('aria-labelledby') ? clean(document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) : '';
    const fieldLabel = el.id ? clean(document.querySelector(`label[for="${el.id}"]`)?.textContent) : '';
    const name = clean(el.getAttribute('aria-label') || labelled || fieldLabel || (tag === 'input' || tag === 'textarea' ? el.placeholder : '') || el.innerText || el.title || el.value).slice(0, 70);
    const st = [];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') st.push('disabled');
    if (el.checked) st.push('checked');
    for (const a of ['aria-expanded', 'aria-selected', 'aria-current', 'aria-pressed']) if (el.getAttribute(a) && el.getAttribute(a) !== 'false') st.push(`${a.slice(5)}=${el.getAttribute(a)}`);
    if (['input', 'textarea', 'select'].includes(tag) && el.type !== 'checkbox' && el.type !== 'radio') st.push(`value="${clean(tag === 'select' ? el.selectedOptions[0]?.text : el.value).slice(0, 40)}"`);
    if (tag === 'a') st.push(`href=${el.getAttribute('href')}`);
    el.setAttribute('data-uid', String(i));
    lines.push(`[${i}] ${el.getAttribute('role') || (tag === 'input' ? `input:${el.type}` : tag)} "${name}"${st.length ? ` (${st.join(', ')})` : ''}`);
    i += 1;
  }
  const heads = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((h) => clean(h.textContent)).slice(0, 8);
  const alerts = [...document.querySelectorAll('[role=alert],[role=status],[aria-live],.toast,.banner')].filter(visible).map((a) => clean(a.textContent)).filter(Boolean).slice(0, 6);
  const text = clean((modal ?? document.body).innerText);
  return [`URL ${location.href}`, `TITLE ${document.title}`, modal ? 'MODAL OPEN (only its controls are listed)' : '', `HEADINGS ${heads.join(' | ')}`, `ALERTS ${alerts.join(' | ') || '-'}`, '--- controls', ...lines, '--- text', full ? text.slice(0, 9000) : text.slice(0, 700)].filter((l) => l !== '').join('\n');
}, { full });
let quiet = false; // inside a batch only the last line reports the screen; the others skip the 250 ms settle pause (Playwright already waits for each target)
const brief = async () => { if (quiet) return 'ok'; await sleep(250); return page.evaluate(() => `now: ${location.hash || location.pathname} | ${[...document.querySelectorAll('h1,h2')].filter((h) => h.getBoundingClientRect().width).map((h) => h.textContent.trim()).slice(0, 2).join(' | ')} | alerts: ${[...document.querySelectorAll('[role=alert],[role=status]')].map((a) => a.textContent.trim()).filter(Boolean).slice(0, 3).join(' | ') || '-'}`); };

async function run(c, a) {
  switch (c) {
    case 'snap': return snapshot(false);
    case 'text': return snapshot(true);
    case 'click': await loc(a[0]).click({ timeout: 1200 }); return `clicked\n${await brief()}`;
    case 'dblclick': await loc(a[0]).dblclick({ timeout: 1200 }); return `double-clicked\n${await brief()}`;
    case 'hover': await loc(a[0]).hover({ timeout: 1200 }); return 'hovered';
    case 'fill': await loc(a[0]).fill(a.slice(1).join(' '), { timeout: 1200 }); return 'filled';
    case 'type': await loc(a[0]).click({ timeout: 1200 }); await page.keyboard.type(a.slice(1).join(' '), { delay: 8 }); return 'typed';
    case 'select': await loc(a[0]).selectOption({ label: a.slice(1).join(' ') }, { timeout: 1200 }).catch(async () => loc(a[0]).selectOption(a.slice(1).join(' '), { timeout: 1200 })); return `selected\n${await brief()}`;
    case 'check': await loc(a[0]).check({ timeout: 1200 }); return 'checked';
    case 'uncheck': await loc(a[0]).uncheck({ timeout: 1200 }); return 'unchecked';
    case 'key': await page.keyboard.press(a[0]); return `pressed\n${await brief()}`;
    case 'upload': await loc(a[0]).setInputFiles(a[1], { timeout: 1200 }); return 'file set';
    case 'shot': await page.screenshot({ path: a[0] }); return `saved ${a[0]}`;
    case 'wait': await sleep(Number(a[0] ?? 500)); return 'waited';
    // expect <texto>: passes the instant the text is visible (max 3 s), fails with the cause otherwise. Use it instead of wait/sleep: it is exact and as fast as the app.
    case 'expect': await page.getByText(a.join(' '), { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => { throw new Error(`texto esperado não apareceu: "${a.join(' ')}"`); }); return 'seen';
    case 'gone': await page.getByText(a.join(' '), { exact: false }).first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { throw new Error(`texto ainda visível: "${a.join(' ')}"`); }); return 'gone';
    case 'reload': await page.reload({ waitUntil: 'networkidle' }); return `reloaded\n${await brief()}`;
    case 'back': await page.goBack().catch(() => {}); return `back\n${await brief()}`;
    case 'forward': await page.goForward().catch(() => {}); return `forward\n${await brief()}`;
    case 'goto': await page.evaluate((h) => { location.hash = h; }, a[0]); return `hash set\n${await brief()}`;
    case 'dialog': dialogPolicy = a[0] === 'dismiss' ? 'dismiss' : 'accept'; return `dialogs will be ${dialogPolicy}ed`;
    case 'console': { const out = events.join('\n') || '(no console errors, page errors or failed requests)'; if (a[0] === 'clear') events.length = 0; return out; }
    case 'restart': await shutdown(); await launch(); writeState(); return `app closed and reopened on the SAME data\n${await brief()}`;
    case 'quit': setTimeout(async () => { await shutdown(); try { rmSync(STATE); } catch { /* gone */ } process.exit(0); }, 50); return 'closing';
    default: throw new Error(`unknown command ${c}. commands: snap text click dblclick hover fill type select check uncheck key upload shot wait reload back forward goto dialog console restart quit`);
  }
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
    } catch (e) { verdict = 'ERR'; res.statusCode = 500; res.end(`ERROR ${String(e.message).split('\n')[0]}`); }
    // one line per command (time, duration, verdict): the first place to look when a run feels slow
    try { appendFileSync(join(tmpdir(), 'sl-ui-driver.log'), `${new Date().toISOString().slice(11, 23)} ${String(Date.now() - t0).padStart(5)}ms ${verdict} ${parsed.cmd ?? '?'} ${(parsed.args ?? []).join(' ').slice(0, 60)}\n`); } catch { /* logging never breaks a test */ }
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
ctl = server.address().port;
writeState();
