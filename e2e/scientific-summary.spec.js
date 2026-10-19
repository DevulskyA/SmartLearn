import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Resumo Mestre científico: a summary written with formulas, a table and a list is DRAWN as such in the Plano, is kept as plain text
// in summary_body (the textarea shows exactly what was typed), and hostile markup never becomes live DOM.

const SERVER_PORT = serverPort(13970);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const SUMMARY = [
  '## Equação de Starling',
  '',
  'A pressão líquida é $P_{liq}=P_{GC}-P_{BS}-\\pi_{GC}$ e custa $5 e $10.',
  '',
  '$$',
  'TFG = K_f \\times P_{liq}',
  '$$',
  '',
  '| Efeito | RPF | TFG |',
  '|---|:---:|---:|',
  '| Aferente ↓ | ↓ | ↓ |',
  '| Eferente ↓ | ↓ | ↑ |',
  '',
  '- primeiro',
  '- segundo',
  '',
  '<img src=x onerror="window.__pwned=1"> e $\\badmacro{x}$',
].join('\n');

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-sci-summary-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('scientific summary E2E: real server did not become ready in time');
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
  await signInRegistered(page, { email: `sci-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

test('Plano: formulas, table and list are drawn; the text stays canonical; hostile HTML stays inert', async ({ page }) => {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Fisiologia');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2026-04-01');
  await page.locator('#study-content').fill('Filtração glomerular');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Filtração glomerular' });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('.plan-edit-summary-btn').click();
  await row.locator('.plan-summary-textarea').fill(SUMMARY);
  await row.locator('.plan-summary-edit-actions .primary-button').click();

  const body = row.locator('.plan-summary-body');
  await expect(body.locator('.katex')).toHaveCount(2, { timeout: 5000 }); // 1 inline + 1 display; the bad macro is error-marked, not KaTeX
  await expect(body.locator('.summary-math-display .katex')).toHaveCount(1);
  await expect(body.locator('table.summary-table th')).toHaveText(['Efeito', 'RPF', 'TFG']);
  await expect(body.locator('table.summary-table tbody tr')).toHaveCount(2);
  await expect(body.locator('ul.summary-list li')).toHaveText(['primeiro', 'segundo']);
  await expect(body).toContainText('custa $5 e $10');
  await expect(body.locator('.summary-math-error')).toHaveCount(1);

  // hostile HTML is TEXT, never an element, and nothing ran
  await expect(body.locator('img')).toHaveCount(0);
  await expect(body).toContainText('<img src=x onerror=');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();

  // the stored value is exactly what was typed (summary_body stays the canonical plain text)
  await row.locator('.plan-edit-summary-btn').click();
  await expect(row.locator('.plan-summary-textarea')).toHaveValue(SUMMARY);
});
