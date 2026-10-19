import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// The lesson editor (draft) path of the scientific summary: formula + table typed, a figure inserted through the panel, saved, and the
// same text comes back after a reload with everything drawn in the "read as lesson" view.

const SERVER_PORT = serverPort(13972);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-sci-editor-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('scientific summary editor E2E: real server did not become ready in time');
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
  await signInRegistered(page, { email: `sci-ed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

test('lesson editor: formula, table and an inserted figure are saved, come back after a reload, and are drawn in the reading view', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });

  const input = editor.locator('.lesson-summary-input');
  await input.fill('Texto com $C=C_0 e^{-kt}$.\n\n| Fase | Efeito |\n|---|---|\n| Absorção | sobe |');
  await editor.locator('[data-panel="summary"]').getByRole('button', { name: 'Figura', exact: true }).click();
  await editor.locator('.summary-figure-file').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  await editor.locator('.summary-figure-alt').fill('Esquema');
  await editor.locator('.summary-figure-insert').click();
  await expect(editor.locator('.summary-figure-panel')).toHaveCount(0);
  const typed = (await input.inputValue()).trim(); // saving trims the text, so the stored value has no trailing newline
  expect(typed).toMatch(/!\[Esquema\]\(smartlearn-figure:\d+\)/);

  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');

  await page.locator('[data-action="lesson-back"]').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'aula.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 15000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(typed);

  await editor.locator('[data-action="toggle-summary-read"]').click();
  const read = editor.locator('.lesson-summary-read');
  await expect(read.locator('.katex')).toHaveCount(1);
  await expect(read.locator('table.summary-table tbody tr')).toHaveCount(1);
  await expect.poll(async () => read.locator('figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);
});
