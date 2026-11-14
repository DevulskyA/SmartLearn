import { randomUUID } from 'node:crypto';
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
import { startEditingSummary } from './support/summary-editing.js';

import { generateByPages } from './support/materials-flow.js';
// "Versões anteriores" is a button (like Word's version history): the draft never announces a history before the student asks for it,
// says plainly when there is none, and lists the earlier text once the summary was changed. Real server, throwaway database.

const SERVER_PORT = serverPort(13949);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-versions-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), SMARTLEARN_MEDIA_DIR: join(dataDir, 'media'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'summary versions E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('the earlier-versions panel stays closed until the button is pressed, then says there is none, then lists the replaced text', async ({ page, context }) => {
  await context.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `versions-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await generateByPages(page);
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await startEditingSummary(page);

  // the throwaway server has no AI configured: the text comes from the offline test provider and the screen says so
  await expect(editor.locator('.lesson-fake-notice')).toContainText('a IA está desligada neste ambiente');

  const button = editor.locator('[data-action="open-summary-versions"]');
  const panel = editor.locator('.lesson-versions');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Versões anteriores');
  await expect(panel).toBeHidden(); // nothing about a history before the student asks

  await button.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Ainda não há versões anteriores.');

  await editor.locator('.lesson-summary-input').fill('Texto novo do resumo, escrito pelo aluno.');
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-action="show-summary-version"]')).toHaveCount(1, { timeout: 10000 });
  await button.click();
  await expect(panel).toBeHidden();
});

test('the reading view has a left-margin table of contents whose entries move to the heading inside the page', async ({ page, context }) => {
  await context.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `outline-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await generateByPages(page);
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await startEditingSummary(page);
  await editor.locator('.lesson-summary-input').fill('## Filtração\n\nTexto da filtração.\n\n## Clearance\n\nTexto do clearance.');
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled({ timeout: 10000 });
  await editor.locator('[data-action="toggle-summary-read"]').click();
  const outline = editor.locator('.summary-outline');
  await expect(outline).toBeVisible();  await expect(outline.locator('.summary-outline-item')).toHaveText(['Filtração', 'Clearance']);
  await outline.locator('.summary-outline-item', { hasText: 'Clearance' }).click();
  await expect(editor.locator('.lesson-summary-read .summary-heading', { hasText: 'Clearance' })).toBeFocused();
});
