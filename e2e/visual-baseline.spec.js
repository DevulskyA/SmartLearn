import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// Visual baseline: one full-page PNG per main screen at phone (390 px) and desktop (1280 px) width, on the real server and UI with
// realistic data. It is a capture tool, not an assertion suite: it only runs when SCREENSHOT_DIR is set, and fails only if a screen
// does not open. A human (or a later comparison) judges the images.
//   SCREENSHOT_DIR=<dir> node scripts/e2e.mjs e2e/visual-baseline.spec.js

const SERVER_PORT = serverPort(13991);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const OUT = process.env.SCREENSHOT_DIR;
const SCREENS = [
  { id: 'today', name: 'hoje' },
  { id: 'plan', name: 'plano' },
  { id: 'materials', name: 'materiais' },
  { id: 'stats', name: 'estatisticas' },
  { id: 'settings', name: 'configuracoes' },
  { id: 'account', name: 'conta' },
];
const SIZES = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];

test.skip(!OUT, 'set SCREENSHOT_DIR to capture the visual baseline');

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-visual-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'visual baseline' });
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

test('capture every main screen at 390 px and 1280 px', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `visual-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  for (const [subject, title, date] of [['Fisiologia Renal', 'Filtração glomerular', '2026-08-01'], ['Cardiologia', 'Ciclo cardíaco', '2026-08-02']]) {
    const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: subject, title, studyDate: date });
    for (const i of [1, 2, 3]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Pergunta ${i} de ${title}?`, answer: `Resposta ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
  }
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const screen of SCREENS) {
      const tab = page.locator(`[data-screen="${screen.id}"]:visible`).first();
      // on a phone, Configurações and Conta live behind the "Mais" toggle
      const more = page.locator('#mobile-more-toggle');
      if (!(await tab.isVisible()) && await more.isVisible()) await more.click();
      await expect(tab, `navigation to ${screen.id} at ${size.width} px`).toBeVisible();
      await tab.click();
      await expect(page).toHaveURL(new RegExp(`#.*${screen.id}`));
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${size.width}-${screen.name}.png`), fullPage: true });
      // a viewport-only shot too: a fullPage shot repeats fixed bars in the middle of the image, which is not a defect
      await page.screenshot({ path: join(OUT, `${size.width}-${screen.name}-viewport.png`) });
      // elements whose text is wider than their box (clipped) on this screen, for the report
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) *')].filter((el) => el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map((el) => `${el.tagName.toLowerCase()}.${el.className}: "${el.textContent.trim().slice(0, 30)}"`).slice(0, 10));
      if (clipped.length) console.log(`CLIPPED [${size.width} ${screen.name}] ${clipped.join(' | ')}`);
    }
  }
});

test('capture the lesson editor tabs at 390 px and 1280 px', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `visual-editor-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  await page.setViewportSize(SIZES[0]);
  const materials = page.locator('[data-screen="materials"]:visible').first();
  await expect(materials).toBeVisible();
  await materials.click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'editor.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const tab of ['Resumo', 'Questões', 'Fonte', 'Revisão']) {
      const button = editor.getByRole('tab', { name: new RegExp(tab) });
      if (await button.count()) await button.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `${size.width}-editor-${tab.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}-viewport.png`) });
    }
  }
});
