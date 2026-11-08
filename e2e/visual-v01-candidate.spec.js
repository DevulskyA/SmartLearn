import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// V-01 candidate check (Estatísticas at phone width). It does NOT change the product: the candidate CSS lives in .specs/proposals/V-01-stats-390.css
// and is injected into the page here, so the page is measured WITHOUT it (must show the defect) and WITH it (must not), at 390 and 360 px, and at
// 1280 px the candidate must change nothing (same pixels). Runs only when V01_OUT is set (a folder for the before/after PNGs).
//   V01_OUT=<dir> node scripts/e2e.mjs e2e/visual-v01-candidate.spec.js

const OUT = process.env.V01_OUT;
const SERVER_PORT = serverPort(13992);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const CANDIDATE_CSS = fileURLToPath(new URL('../.specs/proposals/V-01-stats-390.css', import.meta.url));

test.skip(!OUT, 'set V01_OUT to run the V-01 candidate check');

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
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
  // .visually-hidden is screen-reader-only text, clipped to 1 px ON PURPOSE (it also showed up at 1280 px, where nothing is wrong): not a defect
  const leaves = [...document.querySelectorAll('.screen:not([hidden]) *')].filter((el) => el.children.length === 0 && el.textContent.trim() && el.getClientRects().length && !el.closest('.visually-hidden'));
  const clipped = leaves.filter((el) => { const o = getComputedStyle(el).overflow; return o !== 'visible' && el.scrollWidth > el.clientWidth + 1; }).map((el) => `${el.className}: "${el.textContent.trim().slice(0, 24)}"`);
  const cut = leaves.filter((el) => { let n = el; while (n && n !== document.body) { const s = getComputedStyle(n); if (s.overflow !== 'visible' && el.getBoundingClientRect().right > n.getBoundingClientRect().right + 1) return true; n = n.parentElement; } return false; }).map((el) => `${el.className}: "${el.textContent.trim().slice(0, 24)}"`);
  const rows = [...document.querySelectorAll('.matrix-table--cards tbody tr')];
  const overlaps = [];
  for (const row of rows) {
    const boxes = [...row.querySelectorAll('td')].map((td) => td.getBoundingClientRect());
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]; const b = boxes[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`cell ${i + 1} x cell ${j + 1}`);
    }
  }
  // the sort buttons of the phone header row must not run into each other
  const heads = [...document.querySelectorAll('.matrix-table--cards thead th')].map((th) => (th.querySelector('.th-sort-btn') ?? th).getBoundingClientRect());
  for (let i = 0; i < heads.length; i += 1) for (let j = i + 1; j < heads.length; j += 1) {
    const a = heads[i]; const b = heads[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`header ${i + 1} x header ${j + 1}`);
  }
  // a header label wider than its own cell spills onto the next one even when overflow is visible
  for (const th of document.querySelectorAll('.matrix-table--cards thead th')) {
    const btn = th.querySelector('.th-sort-btn');
    if (btn && btn.scrollWidth > th.clientWidth + 1) overlaps.push(`header "${btn.textContent.trim().slice(0, 16)}" wider than its cell`);
  }
  return { clipped: [...new Set(clipped)], cut: [...new Set(cut)], overlaps };
});

test('V-01: Estatísticas at 390/360 px is cut and overlapping without the candidate and clean with it; 1280 px is unchanged', async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await signInRegistered(page, { email: `v01-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  // realistic data: one discipline with evidence, one without, so both the numbers and "Sem evidência"/"Amostra insuficiente" appear
  const a = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal', title: 'Filtração glomerular', studyDate: '2026-08-01' });
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Cardiologia', title: 'Ciclo cardíaco', studyDate: '2026-08-02' });
  const attemptIds = [];
  for (const [index, i] of [1, 2, 3].entries()) {
    const { exercise } = await apiCall(page, `/v1/learning-units/${a.unit.id}/exercises`, { question: `Pergunta ${i}?`, answer: `Resposta ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
    const { attempt } = await apiCall(page, `/v1/exercises/${exercise.id}/attempts`, {});
    await apiCall(page, `/v1/attempts/${attempt.id}/submit`, { outcome: index === 2 ? 'INCORRECT' : 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    attemptIds.push(attempt.id);
  }
  await apiCall(page, '/v1/learning-evidence', { unitId: a.unit.id, type: 'INITIAL_PRACTICE', questionsCount: 3, correctCount: 2, evidenceDate: '2026-08-05', attemptIds });

  const candidate = readFileSync(CANDIDATE_CSS, 'utf8');
  const result = {};
  const png = {};
  for (const width of [390, 360, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const more = page.locator('#mobile-more-toggle');
    await page.locator('[data-screen="stats"]:visible').first().click();
    await expect(page.locator('#screen-stats')).toBeVisible();
    await page.waitForTimeout(500);
    result[`${width}-before`] = await measure(page);
    png[`${width}-before`] = await page.screenshot({ path: join(OUT, `v01-${width}-before.png`) });
    const style = await page.addStyleTag({ content: candidate });
    await page.waitForTimeout(200);
    result[`${width}-after`] = await measure(page);
    png[`${width}-after`] = await page.screenshot({ path: join(OUT, `v01-${width}-after.png`) });
    await style.evaluate((el) => el.remove());
    void more;
  }
  console.log(`V01 ${JSON.stringify(result)}`);
  for (const width of [390, 360]) {
    const before = result[`${width}-before`];
    const after = result[`${width}-after`];
    expect(before.clipped.length + before.cut.length + before.overlaps.length, `${width} px: the defect is reproduced without the candidate (instrument check)`).toBeGreaterThan(0);
    expect(after, `${width} px with the candidate: nothing cut or overlapping`).toEqual({ clipped: [], cut: [], overlaps: [] });
  }
  const hash = (buf) => createHash('sha256').update(buf).digest('hex');
  expect(hash(png['1280-after']), '1280 px is pixel-identical with the candidate').toBe(hash(png['1280-before']));
});
