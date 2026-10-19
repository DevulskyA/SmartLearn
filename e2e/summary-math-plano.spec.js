import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Resumo Mestre científico (delivery A): the controlled Markdown is DRAWN in the Plano, formulas are inserted and re-edited through the
// visual dialog, invalid formulas are flagged without losing the text, hostile HTML stays inert, and nothing is fetched from outside.

const SERVER_PORT = serverPort(13970);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const SUMMARY = [
  '## Equação de Starling',
  '',
  'A pressão líquida é \\(P_{liq}=P_{GC}-P_{BS}-\\pi_{GC}\\) e custa $5 e $10.',
  '',
  '\\[',
  'TFG = K_f \\times P_{liq}',
  '\\]',
  '',
  'Água: \\(\\ce{H2O}\\) e a reação \\(\\ce{2H2 + O2 -> 2H2O}\\).',
  '',
  'Matriz: \\(\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\\), raiz \\(\\sqrt[3]{x}\\), \\(\\alpha_1^2\\).',
  '',
  '| Efeito | RPF | TFG |',
  '|---|:---:|---:|',
  '| Aferente ↓ | ↓ | ↓ |',
  '| Eferente ↓ | ↓ | ↑ |',
  '',
  '- primeiro',
  '- segundo',
  '',
  'Quebrada: \\(\\frac{1}{\\badmacro}\\) segue o texto.',
  '',
  '<img src=x onerror="window.__pwned=1"> [link](javascript:window.__pwned=2)',
].join('\n');

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-math-plano-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('math plano E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `math-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

async function openPlanSummary(page, title) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Fisiologia');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2026-04-01');
  await page.locator('#study-content').fill(title);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('.plan-edit-summary-btn').click();
  return row;
}

test('formulas, chemistry, matrices, table and list are drawn; invalid formulas are flagged with their text; hostile HTML is inert', async ({ page }) => {
  const row = await openPlanSummary(page, 'Filtração glomerular');
  await row.locator('.plan-summary-textarea').fill(SUMMARY);
  await row.locator('.plan-summary-edit-actions .primary-button').click();

  const body = row.locator('.plan-summary-body');
  await expect(body.locator('.katex')).toHaveCount(7, { timeout: 5000 }); // 7 valid formulas (the 8th is the invalid one)
  await expect(body.locator('.summary-math-display .katex')).toHaveCount(1);
  await expect(body.locator('table.summary-table th')).toHaveText(['Efeito', 'RPF', 'TFG']);
  await expect(body.locator('ul.summary-list li')).toHaveText(['primeiro', 'segundo']);
  await expect(body).toContainText('custa $5 e $10'); // money is text, never math
  await expect(body.locator('annotation[encoding="application/x-tex"]').first()).toBeAttached(); // recoverable LaTeX in the MathML

  const bad = body.locator('.summary-math-error');
  await expect(bad).toHaveCount(1);
  await expect(bad).toContainText('Fórmula inválida');
  await expect(bad.locator('.summary-math-original')).toHaveText('\\frac{1}{\\badmacro}');
  await expect(body).toContainText('segue o texto.'); // the text around the broken formula is still there

  await expect(body.locator('img, a, script')).toHaveCount(0);
  await expect(body).toContainText('<img src=x onerror=');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();

  await row.locator('.plan-edit-summary-btn').click();
  await expect(row.locator('.plan-summary-textarea')).toHaveValue(SUMMARY); // the stored text is exactly what was typed
});

test('"Inserir fórmula": the visual dialog inserts at the cursor, keeps the text around, flags bad syntax, and loads nothing from outside', async ({ page }) => {
  const outside = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) outside.push(req.url());
  });
  const row = await openPlanSummary(page, 'Dialogo de formula');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Antes. Depois.');
  await textarea.evaluate((el) => el.setSelectionRange(7, 7));

  await row.getByRole('button', { name: 'Inserir fórmula' }).click();
  const dialog = page.locator('dialog.math-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('math-field')).toBeVisible({ timeout: 10000 });
  await expect(dialog.locator('.math-dialog-confirm')).toBeDisabled(); // nothing typed yet

  await dialog.locator('.math-dialog-latex').fill('\\frac{a}{');
  await expect(dialog.locator('.math-dialog-status')).toContainText('Fórmula inválida');
  await expect(dialog.locator('.math-dialog-confirm')).toBeDisabled();

  await dialog.locator('.math-dialog-latex').fill('');
  await dialog.locator('math-field').click();
  await page.keyboard.type('x^2');
  await expect(dialog.locator('.math-dialog-latex')).toHaveValue(/^x\^\{?2\}?$/);
  await expect(dialog.locator('.math-dialog-status')).toContainText('Sintaxe válida');
  await expect(dialog.locator('.math-dialog-preview .katex')).toHaveCount(1);
  await dialog.locator('.math-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);

  const typed = await textarea.inputValue();
  expect(typed).toMatch(/^Antes\. \\\(x\^\{?2\}?\\\)Depois\.$/);
  expect(outside).toEqual([]);
});

test('clicking a drawn formula re-opens it; confirming rewrites only that formula', async ({ page }) => {
  const row = await openPlanSummary(page, 'Reedicao de formula');
  const textarea = row.locator('.plan-summary-textarea');
  const original = 'Um \\(a+b\\) e outro \\(c+d\\) e igual \\(a+b\\) fim.';
  await textarea.fill(original);
  const preview = row.locator('.summary-preview-body');
  await expect(preview.locator('.summary-math-editable')).toHaveCount(3);

  await preview.locator('.summary-math-editable').nth(2).click();
  const dialog = page.locator('dialog.math-dialog');
  await expect(dialog.locator('.math-dialog-latex')).toHaveValue('a+b');
  await expect(dialog.locator('.math-dialog-display')).toBeHidden(); // an existing formula keeps its form
  await dialog.locator('.math-dialog-latex').fill('\\sqrt{a+b}');
  await dialog.locator('.math-dialog-confirm').click();
  await expect(textarea).toHaveValue('Um \\(a+b\\) e outro \\(c+d\\) e igual \\(\\sqrt{a+b}\\) fim.');

  // an invalid formula offers "Corrigir" in the same preview
  await textarea.fill('Quebrada \\(\\frac{1}{\\nope}\\) fim');
  await preview.locator('.summary-math-fix').click();
  await expect(page.locator('dialog.math-dialog .math-dialog-latex')).toHaveValue('\\frac{1}{\\nope}');
  await page.locator('dialog.math-dialog .math-dialog-latex').fill('\\frac{1}{2}');
  await page.locator('dialog.math-dialog .math-dialog-confirm').click();
  await expect(textarea).toHaveValue('Quebrada \\(\\frac{1}{2}\\) fim');
});
