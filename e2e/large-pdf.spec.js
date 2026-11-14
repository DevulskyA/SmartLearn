import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

import { generateByPages } from './support/materials-flow.js';
// LARGEPDF-1: a realistic lecture PDF (dozens to ~150 pages) goes from upload to reviewable drafts without
// hanging, dropping pages, or failing silently. The provider is the default deterministic one (this proves the
// SCALE of extraction / proposals / limits, not the quality of a model).

const SERVER_PORT = serverPort(13990);
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
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'large-pdf E2E' });
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
  const email = `large-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

const SENTENCE = 'A filtração glomerular depende da pressão hidrostática capilar e das pressões oncótica e da cápsula de Bowman. ';
const pageText = (n, chars) => `Página ${n}. ${SENTENCE.repeat(Math.ceil(chars / SENTENCE.length))}`.slice(0, chars);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('a 150-page lecture PDF: extracted in bounded time, and a draft of ten chosen pages is reviewable', async ({ page }) => {
  const pages = Array.from({ length: 150 }, (_, i) => pageText(i + 1, 1800));
  const pdf = buildFixturePdf(pages);
  await page.locator('[data-screen="materials"]').click();
  const started = Date.now();
  await page.setInputFiles('#sources-file-input', { name: 'aula-completa.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 60000 });
  const elapsedMs = Date.now() - started;
  console.log(`[LARGEPDF] 150 pages, ${(pdf.length / 1024).toFixed(0)} KB -> proposals in ${elapsedMs} ms`);
  expect(elapsedMs).toBeLessThan(45000);

  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ten pages from the middle become a reviewable draft (chosen by page range)
  await generateByPages(page, { from: 71, to: 80 });
  await page.locator('.lesson-editor').getByRole('tab', { name: /Questões/ }).click();
  await expect(page.locator('.lesson-editor .lesson-qitem').first()).toBeVisible({ timeout: 20000 });
});

test('dense pages: a page range within the model input limit becomes a draft; only one absurdly dense page gets a plain-language explanation', async ({ page }) => {
  // 10 dense pages x 6500 chars = 65000 chars: as one 10-page chunk it would exceed the 50000-char input limit
  const pages = Array.from({ length: 10 }, (_, i) => pageText(i + 1, 6500));
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'capitulo-denso.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(pages) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 30000 });
  await generateByPages(page, { from: 1, to: 2 });
  await page.locator('.lesson-editor').getByRole('tab', { name: /Questões/ }).click();
  await expect(page.locator('.lesson-editor .lesson-qitem').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#sources-message')).toContainText('Resumo gerado');
  await page.locator('[data-action="lesson-back"]').click();

  // a single page above the limit cannot be split: the student is told plainly (not a raw engineering message),
  // and the message is brought into view
  const longList = Array.from({ length: 150 }, (_, n) => pageText(n + 1, n === 149 ? 60000 : 300));
  await page.setInputFiles('#sources-file-input', { name: 'aula-com-pagina-gigante.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(longList) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 30000 });
  const last = page.locator('#sources-range-form');
  await last.scrollIntoViewIfNeeded();
  await expect(page.locator('#sources-message')).toBeVisible();
  await generateByPages(page, { from: 150, to: 150 });
  await expect(page.locator('#sources-message')).toContainText('texto demais', { timeout: 20000 });
  await expect(page.locator('#sources-message')).not.toContainText('excede o limite de');
  await expect(page.locator('#sources-message')).toBeInViewport(); // brought into view, not left off-screen
});
