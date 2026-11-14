import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// V-01 regression (Estatísticas at phone width, fix applied in src/styles.css; see .specs/proposals/V-01-stats-390.md): at 390 and 360 px nothing is cut or overlapping,
// (desktop is untouched by construction: the fix is scoped to max-width 47.999rem). V01_OUT=<dir> additionally saves the PNGs.

const OUT = process.env.V01_OUT;
const SERVER_PORT = serverPort(13992);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-v01-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'v01 candidate' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// relative dates: the default Estatísticas window is the last 90 days, so fixed dates silently age out of it (that hid the numbers in this check once)
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

// text wider than its box (cut) and sibling texts whose boxes collide, inside the visible Estatísticas screen
const measure = (page) => page.evaluate(() => {
  const label = (el) => `${el.className}: "${el.textContent.trim().slice(0, 24)}"`;
  // .visually-hidden is screen-reader-only text, clipped to 1 px ON PURPOSE: not a defect.
  const leaves = [...document.querySelectorAll('.screen:not([hidden]) *')].filter((el) => el.children.length === 0 && el.textContent.trim() && el.getClientRects().length && !el.closest('.table-scroll') && !el.closest('.visually-hidden'));
  const clipped = leaves.filter((el) => {
    const overflow = getComputedStyle(el).overflow;
    return overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1;
  }).map(label);
  const extendsPastClip = (el) => {
    let ancestor = el;
    while (ancestor && ancestor !== document.body) {
      const clips = getComputedStyle(ancestor).overflow !== 'visible';
      if (clips && el.getBoundingClientRect().right > ancestor.getBoundingClientRect().right + 1) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  };
  const cut = leaves.filter(extendsPastClip).map(label);
  const intersects = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const pairOverlaps = (boxes, kind) => {
    const found = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (intersects(boxes[i], boxes[j])) found.push(`${kind} ${i + 1} x ${kind} ${j + 1}`);
      }
    }
    return found;
  };
  const rows = [...document.querySelectorAll('.v5-data-table tbody tr')];
  const cellOverlaps = rows.flatMap((row) => pairOverlaps([...row.querySelectorAll('td')].map((td) => td.getBoundingClientRect()), 'cell'));
  // The sort buttons of the phone header row must not run into each other.
  const headerCells = [...document.querySelectorAll('.v5-data-table thead th')];
  const headers = headerCells.map((th) => (th.querySelector('.v5-th-sort') ?? th).getBoundingClientRect());
  const headerOverlaps = pairOverlaps(headers, 'header');
  // A header label wider than its own cell spills onto the next one even when overflow is visible.
  const wideHeaders = headerCells.flatMap((th) => {
    const button = th.querySelector('.v5-th-sort');
    return button && button.scrollWidth > th.clientWidth + 1 ? [`header "${button.textContent.trim().slice(0, 16)}" wider than its cell`] : [];
  });
  return { clipped: [...new Set(clipped)], cut: [...new Set(cut)], overlaps: [...cellOverlaps, ...headerOverlaps, ...wideHeaders], rows: rows.length };
});

async function waitForStatsContent(page) {
  const rows = page.locator('#screen-stats .v5-data-table tbody tr');
  await expect(rows.filter({ hasText: 'Fisiologia Renal' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Cardiologia' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('V-01: Estatísticas at 390/360 px has nothing cut or overlapping', async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await signInRegistered(page, { email: `v01-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  // realistic data: one discipline with evidence, one without, so both the numbers and "Sem evidência"/"Amostra insuficiente" appear
  const a = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal', title: 'Filtração glomerular', studyDate: daysAgo(10) });
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Cardiologia', title: 'Ciclo cardíaco', studyDate: daysAgo(9) });
  const attemptIds = [];
  for (const [index, i] of [1, 2, 3].entries()) {
    const { exercise } = await apiCall(page, `/v1/learning-units/${a.unit.id}/exercises`, { question: `Pergunta ${i}?`, answer: `Resposta ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
    const { attempt } = await apiCall(page, `/v1/exercises/${exercise.id}/attempts`, {});
    await apiCall(page, `/v1/attempts/${attempt.id}/submit`, { outcome: index === 2 ? 'INCORRECT' : 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    attemptIds.push(attempt.id);
  }
  await apiCall(page, '/v1/learning-evidence', { unitId: a.unit.id, type: 'INITIAL_PRACTICE', questionsCount: 3, correctCount: 2, evidenceDate: daysAgo(5), attemptIds });

  const result = {};
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-screen="stats"]:visible').first().click();
    await expect(page.locator('#screen-stats')).toBeVisible();
    await waitForStatsContent(page);
    result[width] = await measure(page);
    if (OUT) {
      await page.screenshot({ path: join(OUT, `v01-${width}.png`) });
      await page.locator('.v5-data-table').first().screenshot({ path: join(OUT, `v01-${width}-table.png`) });
      console.log(`ROWS ${width} ${JSON.stringify(await page.locator('.v5-data-table tbody tr').allInnerTexts())}`);
    }
    expect(result[width].rows, `${width} px: the discipline cards are present (instrument check)`).toBeGreaterThan(0);
    expect({ clipped: result[width].clipped, cut: result[width].cut, overlaps: result[width].overlaps }, `${width} px: nothing cut or overlapping`).toEqual({ clipped: [], cut: [], overlaps: [] });
  }
});
