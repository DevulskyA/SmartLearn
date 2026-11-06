import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// A document already uploaded can be removed from Materiais while nothing was derived from it. The server decides (409 + nothing
// deleted otherwise, covered by server/test/source-remove.test.js); the screen asks first, shows the server's reason on a refusal
// and never drops the row on its own.
const SERVER_PORT = serverPort(13945);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-source-remove-'));
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
  await waitForServerReady(API_BASE, { label: 'source-remove E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('Materiais: a refused removal says why and keeps the document; a confirmed one removes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `rm-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]:visible').first().click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('[data-screen="settings"]:visible').first().click();
  await page.locator('[data-screen="materials"]:visible').first().click();

  const row = page.locator('.source-existing-item', { hasText: 'fisiologia-renal.pdf' });
  await expect(row).toBeVisible({ timeout: 5000 });
  const remove = row.locator('[data-action="remove-source"]');

  // 1) the server refuses (a lesson already came from it): the reason is shown, the document stays
  await page.route('**/v1/sources/*', (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SOURCE_HAS_UNITS', message: 'Esta fonte já gerou aulas ou questões. Remova-as antes de apagar a fonte; nada foi apagado.' } }) })
    : route.fallback()));
  await remove.click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#sources-message')).toContainText('nada foi apagado', { timeout: 5000 });
  await expect(row).toBeVisible();

  // 2) cancelling the confirmation removes nothing
  await page.unroute('**/v1/sources/*');
  await remove.click();
  await page.locator('#confirm-dialog-cancel').click();
  await expect(row).toBeVisible();

  // 3) confirming removes it from the screen and from the server
  await remove.click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#sources-message')).toHaveText('Documento removido.', { timeout: 5000 });
  await expect(row).toHaveCount(0);
  const remaining = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/sources`, { credentials: 'include' })).json()).sources.length, API_BASE);
  expect(remaining).toBe(0);
});
