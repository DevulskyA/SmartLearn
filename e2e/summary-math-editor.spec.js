import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Scientific summary (delivery A) through the lesson editor and every other screen that shows the Resumo Mestre: the draft summary with
// formulas is saved, survives a reload, is accepted into a lesson, and is drawn in the Plano, in Estudar agora and in Hoje.

const SERVER_PORT = serverPort(13972);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const SUMMARY = 'Relação \\(C=C_0 e^{-kt}\\) com custo de R$ 5 e US$ 3.\n\n\\[\n\\ce{H2O}\n\\]\n\n| Fase | Efeito |\n|---|---|\n| Absorção | sobe |';

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-math-editor-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('math editor E2E: real server did not become ready in time');
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
  await signInRegistered(page, { email: `math-ed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

async function openDraft(page) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

test('lesson editor: a formula inserted through the dialog is saved, survives a reload and is drawn in the reading view', async ({ page }) => {
  const editor = await openDraft(page);
  const input = editor.locator('.lesson-summary-input');
  await input.fill(SUMMARY);
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');

  // add one more formula through the visual dialog, at the end of the text
  await input.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
  await editor.getByRole('button', { name: 'Inserir fórmula' }).click();
  await page.locator('dialog.math-dialog .math-dialog-advanced').evaluate((el) => { el.open = true; });
  await page.locator('dialog.math-dialog .math-dialog-latex').fill('\\alpha + \\beta');
  await page.locator('dialog.math-dialog .math-dialog-display input').check();
  await page.locator('dialog.math-dialog .math-dialog-confirm').click();
  const typed = (await input.inputValue()).trim();
  expect(typed.startsWith(SUMMARY)).toBe(true);
  expect(typed.endsWith('\\[\n\\alpha + \\beta\n\\]')).toBe(true);
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
  await expect(read.locator('.katex')).toHaveCount(3);
  await expect(read.locator('table.summary-table tbody tr')).toHaveCount(1);
  await expect(read).toContainText('R$ 5 e US$ 3');
});

test('accepted lesson: the summary is stored byte for byte and drawn in Plano, Estudar agora and Hoje', async ({ page }) => {
  const editor = await openDraft(page);
  await editor.locator('.lesson-summary-input').fill(SUMMARY);
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  await editor.locator('.source-draft-subject-input').fill('Fisiologia');
  await editor.locator('.source-draft-date-input').fill('2020-01-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 15000 });

  // the stored text is exactly what the student wrote (nothing rewrote it on accept)
  const units = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units, API_BASE);
  expect(units).toHaveLength(1);
  expect(units[0].summaryBody).toBe(SUMMARY);

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row').first();
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.plan-summary-body .katex')).toHaveCount(2);
  await expect(row.locator('.plan-summary-body table.summary-table')).toHaveCount(1);
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  await expect(page.locator('#study-now-summary-body .katex')).toHaveCount(2);
  await expect(page.locator('#study-now-summary-body table.summary-table')).toHaveCount(1);

  await page.locator('[data-screen="today"]').click();
  const hoje = page.locator('.review-summary-text').first();
  await expect(hoje.locator('.katex').first()).toBeAttached({ timeout: 10000 });
});

test('a legacy summary (plain text, parentheses, dollars, a pseudo-link) is shown as written and never rewritten', async ({ page }) => {
  const editor = await openDraft(page);
  const legacy = 'Resumo antigo (ver cap. 3): custo US$ 20 ou $5; \\ não é fórmula; [[fig]] e [[fig:xyz]] ficam texto.\n\nSegunda linha com *ênfase*.';
  await editor.locator('.lesson-summary-input').fill(legacy);
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  await editor.locator('[data-action="toggle-summary-read"]').click();
  const read = editor.locator('.lesson-summary-read');
  await expect(read.locator('.katex, .summary-math-error')).toHaveCount(0);
  await expect(read).toContainText('US$ 20 ou $5');
  await expect(read).toContainText('[[fig:xyz]]'); // an invalid figure token is plain text, not a vanished block
  await editor.locator('[data-action="toggle-summary-read"]').click();
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(legacy);
});
