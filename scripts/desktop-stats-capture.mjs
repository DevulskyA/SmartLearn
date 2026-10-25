// Screenshots of the Estatísticas screen in the REAL native Windows Desktop (Tauri smartlearn.exe + WebView2, driven through CDP) at three
// window sizes, in the light (paper) and night themes, with SYNTHETIC data only.
//
// ISOLATION (same machinery as scripts/desktop-study-journey.mjs): database, sources dir and WebView2 profile live in a throwaway directory
// under the OS temp dir (removed at the end); the script refuses the human DEV datastore and an already-running copy of the same exe. No model
// is called. Data goes in through the app's own HTTP API (subjects/learning-units/learning-evidence), the route the journey uses.
//
// Prerequisites: SMARTLEARN_BUILD_MODE=DEV `npx vite build`, `node scripts/package-standalone.mjs`, `cargo build` in src-tauri (CARGO_TARGET_DIR
// outside the worktrees). Exe = $CARGO_TARGET_DIR/debug/smartlearn.exe (or src-tauri/target), SL_JOURNEY_EXE overrides.
// Usage: node scripts/desktop-stats-capture.mjs  -> ONE JSON line on stdout; exit 0 only if every capture exists and none overflows horizontally.
// PNGs go to %TEMP%\sl-stats-aaa-shots (SL_STATS_SHOTS overrides): <theme>-<WxH>.png (top of the page) and <theme>-<WxH>-scrollN.png (the same page scrolled down screen by screen).
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target');
const exe = resolve(process.env.SL_JOURNEY_EXE ?? join(targetDir, 'debug', 'smartlearn.exe'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const identity = JSON.parse(execFileSync('node', ['scripts/build-identity.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SMARTLEARN_BUILD_MODE: 'DEV' } }));
const expectedTitle = `SmartLearn DEV - v${identity.version} - ${head}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (command) => execFileSync('powershell', ['-NoProfile', '-Command', `${command}; exit 0`], { encoding: 'utf8' }).trim();
const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  s.on('error', fail);
});

if (!existsSync(exe)) throw new Error(`debug executable missing: ${exe} (run cargo build in src-tauri)`);
const running = ps('Get-Process -Name smartlearn -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }').split(/\r?\n/).map((p) => p.trim().toLowerCase()).filter(Boolean);
if (running.includes(exe.toLowerCase())) throw new Error(`refusing to start: ${exe} is already running (someone else's Desktop instance)`);
const work = mkdtempSync(join(tmpdir(), 'sl-stats-capture-'));
if (work.toLowerCase().startsWith(join(homedir(), 'SmartLearn-DevData').toLowerCase())) throw new Error('refusing to run against the human DEV datastore');
const shotsDir = resolve(process.env.SL_STATS_SHOTS ?? join(tmpdir(), 'sl-stats-aaa-shots'));
if (shotsDir.toLowerCase().startsWith(root.toLowerCase())) throw new Error('the screenshots must live outside the repository');
mkdirSync(shotsDir, { recursive: true });

const env0 = {
  ...process.env,
  SMARTLEARN_LOCAL_AUTHORITY: 'true',
  SMARTLEARN_DB_PATH: join(work, 'stats.db'),
  SMARTLEARN_SOURCES_DIR: join(work, 'sources'),
  SMARTLEARN_BUILD_HEAD: head,
  SMARTLEARN_BUILD_CONTENT: identity.inputsHash,
  SMARTLEARN_BUILD_MODE: 'DEV',
  SMARTLEARN_WINDOW_TITLE: expectedTitle,
  SMARTLEARN_DEV_PERSISTENT_SESSION: 'true',
  WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
};
for (const key of ['SMARTLEARN_AI_PROVIDER', 'SMARTLEARN_AI_CONSENT', 'SMARTLEARN_AI_API_KEY', 'SMARTLEARN_AI_MODEL', 'SMARTLEARN_AI_API_URL']) delete env0[key];

// ---- synthetic data: [subject, colour, units: [title, [[daysAgo, questions, correct], ...]]] ----
const SUBJECTS = [
  ['Anatomia', 'DISC-GREEN', [['Membro Superior', [[4, 20, 18], [15, 16, 15], [40, 18, 17], [150, 20, 18], [300, 25, 22]]]]],
  ['Fisiologia', 'DISC-BLUE', [['Homeostase', [[6, 20, 16], [25, 20, 15], [60, 18, 14], [200, 22, 17]]]]],
  ['Farmacologia', 'DISC-ORANGE', [['Farmacocinética', [[3, 20, 12], [20, 15, 9], [100, 20, 13]]]]],
  ['Microbiologia', 'DISC-PURPLE', [['Bactérias Gram-negativas', [[8, 20, 7], [30, 20, 8], [130, 15, 6]]]]],
  ['Bioquímica', 'DISC-TEAL', [['Metabolismo da glicose', [[120, 20, 18], [250, 20, 17]]]]],
  ['Patologia Geral, Especial e Correlações Anatomoclínicas Multissistêmicas', 'DISC-PINK', [['Processos inflamatórios agudos e crônicos com correlação anatomoclínica detalhada', [[12, 20, 11], [45, 18, 11]]]]],
  ['Pediatria', 'DISC-AMBER', [['Crescimento e desenvolvimento', [[2, 12, 4], [70, 20, 9]]]]],
  ['Semiologia Médica', 'DISC-RED', [['Exame físico geral', []]]],
  ['Neurologia', 'DISC-INDIGO', [['Pares cranianos', []]]],
];
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const EXPECTED_TOTAL = SUBJECTS.reduce((s, [, , units]) => s + units.reduce((u, [, ev]) => u + ev.reduce((q, [, n]) => q + n, 0), 0), 0);
// questions the screen must show for a period filter value ('last-30' | 'last-90' | 'last-365' | '' = any)
const expectedFor = (period) => {
  const days = { 'last-30': 30, 'last-90': 90, 'last-365': 365 }[period] ?? Infinity;
  return SUBJECTS.reduce((s, [, , units]) => s + units.reduce((u, [, ev]) => u + ev.filter(([d]) => d <= days).reduce((q, [, n]) => q + n, 0), 0), 0);
};
const SIZES =[[800, 600], [1280, 820], [1920, 1080]];
const THEMES = ['paper', 'night'];

const result = { head, exe, shotsDir, expectedTotalQuestions: EXPECTED_TOTAL, captures: [] };
const consoleErrors = [];
let app; let browser; let page;

function windowRect(pid, set = null) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'window-rect.ps1'), '-ProcessId', String(pid)];
  if (set) args.push('-X', String(set.x), '-Y', String(set.y), '-W', String(set.w), '-H', String(set.h));
  return JSON.parse(execFileSync('powershell', args, { encoding: 'utf8' }).trim().split('\n').pop()).rect;
}
function moveToSmallDisplay(pid) {
  return new Promise((done) => {
    let out = '';
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'move-window-to-small-display.ps1'), '-ProcessId', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (c) => { out += c; });
    child.on('error', () => done(null));
    child.on('close', () => { try { done(JSON.parse(out.trim().split('\n').pop())); } catch { done(null); } });
  });
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

const email = `stats-${Date.now()}@example.com`;
const password = 'a genuinely long test password 1';
async function signIn() {
  await page.locator('[data-screen="account"]:visible').first().click();
  await page.waitForFunction(() => ['#account-logged-in-view', '#account-login-email'].some((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0; }), null, { timeout: 15000 });
  if (await page.locator('#account-logged-in-view').isVisible()) return;
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await page.locator('#account-logged-in-view').waitFor({ state: 'visible', timeout: 15000 });
}

async function openStats() {
  await page.locator('[data-screen="stats"]:visible').first().click();
  await page.locator('#subject-kpi-list tr.matrix-row').first().waitFor({ state: 'visible', timeout: 20000 });
}

// Sets the OUTER window rect so the page viewport (client area) is as close as the OS allows to w x h: one measure-and-correct pass.
async function resizeClient(pid, x, y, w, h) {
  let rect = windowRect(pid, { x, y, w, h });
  for (let i = 0; i < 2; i += 1) {
    await sleep(500);
    const inner = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    const dw = w - inner[0]; const dh = h - inner[1];
    if (dw === 0 && dh === 0) break;
    rect = windowRect(pid, { x, y, w: rect[2] - rect[0] + dw, h: rect[3] - rect[1] + dh });
  }
  await sleep(900); // layout + chart redraw after the resize
  return rect;
}

try {
  const cdpPort = await freePort();
  app = spawn(exe, [], { env: { ...env0, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` }, stdio: 'ignore', windowsHide: false });
  const placement = moveToSmallDisplay(app.pid);
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break; } catch { /* not yet */ }
    if (app.exitCode !== null) throw new Error(`smartlearn.exe exited early (${app.exitCode})`);
    if (Date.now() > deadline) throw new Error('CDP endpoint did not come up in 90 s');
    await sleep(300);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  for (let i = 0; i < 150 && !page; i += 1) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()));
    if (!page) await sleep(300);
  }
  if (!page) throw new Error('the Desktop window page was not found over CDP');
  await placement;
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });
  await page.waitForLoadState('networkidle');
  const title = ps(`(Get-Process -Id ${app.pid}).MainWindowTitle`);
  if (title !== expectedTitle) throw new Error(`native window title "${title}" != "${expectedTitle}"`);

  await api('POST', '/v1/auth/register', { email, password });
  await signIn();
  for (const [name, color, units] of SUBJECTS) {
    for (const [i, [unitTitle, evidence]] of units.entries()) {
      const oldest = Math.max(30, ...evidence.map(([d]) => d + 5));
      const created = await api('POST', '/v1/learning-units', i === 0
        ? { newSubjectName: name, newSubjectColor: color, title: unitTitle, studyDate: isoDaysAgo(oldest) }
        : { subjectId: (await api('GET', '/v1/subjects')).subjects.find((s) => s.name === name).id, title: unitTitle, studyDate: isoDaysAgo(oldest) });
      const unitId = created.unit?.id ?? created.learningUnit?.id ?? created.id;
      if (!Number.isInteger(unitId)) throw new Error(`unit id not found in ${JSON.stringify(created).slice(0, 200)}`);
      for (const [daysAgo, questionsCount, correctCount] of evidence) {
        await api('POST', '/v1/learning-evidence', { unitId, type: 'EXTERNAL', questionsCount, correctCount, evidenceDate: isoDaysAgo(daysAgo) });
      }
    }
  }
  result.seeded = { subjects: SUBJECTS.length, units: SUBJECTS.reduce((s, [, , u]) => s + u.length, 0) };

  for (const theme of THEMES) {
    await page.evaluate((id) => localStorage.setItem('smartlearn:theme', id), theme);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await signIn();
    await openStats();
    const themeNow = await page.evaluate(() => document.documentElement.dataset.theme);
    if (themeNow !== theme) throw new Error(`theme is ${themeNow}, wanted ${theme}`);
    const origin = windowRect(app.pid);
    for (const [w, h] of SIZES) {
      const rect = await resizeClient(app.pid, origin[0], origin[1], w, h);
      const m = await page.evaluate(() => {
        const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
        const rows = [...document.querySelectorAll('#subject-kpi-list tr.matrix-row')];
        const rowQuestions = rows.map((r) => Number((r.querySelector('.practice-compact')?.textContent.match(/\d[\d.]*/)?.[0] ?? '0').replace(/\./g, '')));
        const side = document.querySelector('.stats-side')?.getBoundingClientRect();
        const tablePanel = document.querySelector('#subject-kpi-section')?.getBoundingClientRect();
        const clipped = [...document.querySelectorAll('#screen-stats *')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0 && el.children.length === 0).length;
        return {
          period: document.querySelector('#stats-unit-filter-period')?.value ?? null,
          viewport: [window.innerWidth, window.innerHeight], dpr: window.devicePixelRatio,
          scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
          average: text('#metric-average'), questions: text('#metric-questions'), subjects: text('#metric-subjects'),
          rows: rows.length, tableQuestionsSum: rowQuestions.reduce((a, b) => a + b, 0),
          sideBelowTable: side && tablePanel ? side.top >= tablePanel.bottom - 1 : null,
          tableScrollOverflow: (() => { const t = document.querySelector('#view-stats-subject .table-scroll'); return t ? t.scrollWidth > t.clientWidth + 1 : null; })(),
          textOverflowLeaves: clipped,
        };
      });
      const base = `${theme}-${w}x${h}`;
      const shot = join(shotsDir, `${base}.png`);
      await page.screenshot({ path: shot });
      // the app scrolls inside its shell, so a fullPage shot would not grow: step the real scroller down one screen at a time instead
      const extra = [];
      for (let n = 2; n <= 6; n += 1) {
        const more = await page.evaluate(() => {
          let el = document.querySelector('#screen-stats');
          while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
          const scroller = el ?? document.scrollingElement;
          const before = scroller.scrollTop;
          scroller.scrollTop = before + Math.round(scroller.clientHeight * 0.85);
          return scroller.scrollTop > before;
        });
        if (!more) break;
        await sleep(300);
        const file = join(shotsDir, `${base}-scroll${n}.png`);
        await page.screenshot({ path: file });
        extra.push(file);
      }
      await page.evaluate(() => { let el = document.querySelector('#screen-stats'); while (el) { el.scrollTop = 0; el = el.parentElement; } document.scrollingElement.scrollTop = 0; });
      const full = extra;
      const overflowX = m.scrollWidth > m.clientWidth;
      result.captures.push({
        theme, requested: [w, h], viewport: m.viewport, window: [rect[2] - rect[0], rect[3] - rect[1]], dpr: m.dpr,
        scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, overflowX,
        header: { average: m.average, questions: m.questions, subjects: m.subjects },
        rows: m.rows, tableQuestionsSum: m.tableQuestionsSum,
        period: m.period, expectedForPeriod: expectedFor(m.period),
        reconciled: String(m.tableQuestionsSum) === String(m.questions).replace(/\D/g, '') && m.tableQuestionsSum === expectedFor(m.period),
        sideBelowTable: m.sideBelowTable, tableScrollOverflow: m.tableScrollOverflow, textOverflowLeaves: m.textOverflowLeaves,
        files: [shot, ...full].filter((f) => existsSync(f) && statSync(f).size > 0),
      });
    }
  }
} catch (error) {
  result.fatal = String(error?.message ?? error).split('\n').slice(0, 4).join(' | ');
} finally {
  try { await browser?.close().catch(() => {}); } catch { /* ignore */ }
  try { if (app && app.exitCode === null) execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(1500);
  rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
}
result.consoleErrors = consoleErrors.slice(0, 5);
result.pass = !result.fatal && result.captures.length === SIZES.length * THEMES.length
  && result.captures.every((c) => c.files.length >= 1 && !c.overflowX && c.reconciled);
console.log(JSON.stringify(result));
process.exit(result.pass ? 0 : 1);
