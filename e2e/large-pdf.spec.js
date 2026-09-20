import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// LARGEPDF-1: a realistic lecture PDF (dozens to ~150 pages) goes from upload to reviewable drafts without
// hanging, dropping pages, or failing silently. The provider is the default deterministic one (this proves the
// SCALE of extraction / proposals / limits, not the quality of a model).

const SERVER_PORT = 13990;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-large-pdf-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('large-pdf E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `large-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
});

const SENTENCE = 'A filtração glomerular depende da pressão hidrostática capilar e das pressões oncótica e da cápsula de Bowman. ';
const pageText = (n, chars) => `Página ${n}. ${SENTENCE.repeat(Math.ceil(chars / SENTENCE.length))}`.slice(0, chars);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('a 150-page lecture PDF: extracted in bounded time, 15 proposals covering every page once, a draft of one chunk is reviewable', async ({ page }) => {
  const pages = Array.from({ length: 150 }, (_, i) => pageText(i + 1, 1800));
  const pdf = buildFixturePdf(pages);
  await page.locator('[data-screen="materials"]').click();
  const started = Date.now();
  await page.setInputFiles('#sources-file-input', { name: 'aula-completa.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 60000 });
  const elapsedMs = Date.now() - started;
  console.log(`[LARGEPDF] 150 pages, ${(pdf.length / 1024).toFixed(0)} KB -> proposals in ${elapsedMs} ms`);
  expect(elapsedMs).toBeLessThan(45000);

  const proposals = page.locator('.source-proposal-item');
  await expect(proposals).toHaveCount(15);
  // every page belongs to exactly one proposal: 1-10, 11-20, ..., 141-150
  const ranges = await proposals.evaluateAll((els) => els.map((e) => e.innerText.match(/p[áa]ginas?\s+(\d+)\s*[–-]\s*(\d+)|p[áa]gina\s+(\d+)/i)?.slice(1, 4).filter(Boolean).join('-')));
  console.log('[LARGEPDF] ranges', JSON.stringify(ranges));
  expect(ranges[0]).toBe('1-10');
  expect(ranges[14]).toBe('141-150');
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // a chunk from the middle becomes a reviewable draft
  const item = proposals.nth(7);
  await item.locator('[data-action="generate-draft"]').click();
  await expect(item.locator('.source-draft-panel .source-draft-question').first()).toBeVisible({ timeout: 20000 });
});

test('dense pages: chunks close before the model input limit, so every proposal can become a draft; only one absurdly dense page gets a plain-language explanation', async ({ page }) => {
  // 10 dense pages x 6500 chars = 65000 chars: as one 10-page chunk it would exceed the 50000-char input limit
  const pages = Array.from({ length: 10 }, (_, i) => pageText(i + 1, 6500));
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'capitulo-denso.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(pages) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 30000 });
  const proposals = page.locator('.source-proposal-item');
  expect(await proposals.count()).toBeGreaterThanOrEqual(2); // split by size, not one impossible chunk
  const first = proposals.first();
  await first.locator('[data-action="generate-draft"]').click();
  await expect(first.locator('.source-draft-panel .source-draft-question').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado');

  // a single page above the limit cannot be split: the student is told plainly (not a raw engineering message),
  // and the message is brought into view even though it sits far above a long list of proposals
  const longList = Array.from({ length: 150 }, (_, n) => pageText(n + 1, n === 149 ? 60000 : 300));
  await page.setInputFiles('#sources-file-input', { name: 'aula-com-pagina-gigante.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(longList) });
  await expect(page.locator('.source-proposal-item')).toHaveCount(16, { timeout: 30000 }); // 15 by pages + the giant page alone
  const last = page.locator('.source-proposal-item').last();
  await last.scrollIntoViewIfNeeded();
  expect(await page.locator('#sources-message').isVisible()).toBe(true);
  await last.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('texto demais', { timeout: 20000 });
  await expect(page.locator('#sources-message')).not.toContainText('excede o limite de');
  await expect(page.locator('#sources-message')).toBeInViewport(); // brought into view, not left off-screen
});

test('TRACKUX-1: on a 375px Materiais the proposals are cards with a full-width title box (the title being edited is readable), not bare bullets', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  const pages = Array.from({ length: 30 }, (_, n) => pageText(n + 1, 1500));
  await page.setInputFiles('#sources-file-input', { name: 'aula-de-fisiologia-renal-completa-com-nome-longo.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(pages) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 30000 });
  await page.setViewportSize({ width: 375, height: 800 });
  const item = page.locator('.source-proposal-item').first();
  const m = await item.evaluate((el) => {
    const input = el.querySelector('.source-proposal-title-input').getBoundingClientRect();
    return { inputWidth: input.width, itemWidth: el.getBoundingClientRect().width, bullet: getComputedStyle(el).listStyleType, border: getComputedStyle(el).borderTopWidth };
  });
  expect(m.bullet, 'no bare bullets').toBe('none');
  expect(m.inputWidth / m.itemWidth, 'the title box uses the card width').toBeGreaterThan(0.85);
  expect(parseFloat(m.border), 'each proposal is a card').toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
