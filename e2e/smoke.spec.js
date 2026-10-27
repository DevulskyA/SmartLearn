import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// SMOKE: the shortest honest answer to "does the main thing still work?". ONE server, ONE browser page, ONE sign-in and ONE draft shared by
// short steps that follow each other (the way a student uses it), instead of every check paying for its own sign-in + upload + generation.
// A failed step stops the rest (serial): the step name says where the line broke. It does not replace the isolated specs, which stay the
// proof before integration; it is what to run after every small change (`npm run test:e2e:smoke`, about a minute).

const SERVER_PORT = serverPort(13982);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const FIG_LINE = /\[\[fig:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\]\]/;
const SUMMARY = '## Fisiologia renal\nA TFG vale \\(TFG = U \\cdot V / P\\) em mL/min.\n\n\n\nSegundo parágrafo.\n\n- primeiro\n- segundo\n\n\\[\n\\ce{H2O}\n\\]\n\n| Fase | Efeito |\n|---|---|\n| Filtração | sobe |';

test.describe.configure({ mode: 'serial' });

let serverProcess;
let dataDir;
let context;
let page;
const outside = [];

test.beforeAll(async ({ browser }) => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-smoke-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), SMARTLEARN_MEDIA_DIR: join(dataDir, 'media'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try { ready = (await fetch(`${API_BASE}/health/ready`)).status === 200; } catch { /* not up yet */ }
    if (!ready) await new Promise((r) => setTimeout(r, 150));
  }
  if (!ready) throw new Error('smoke: real server did not become ready in time');
  context = await browser.newContext({ baseURL: VITE_ORIGIN });
  await context.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  page = await context.newPage();
  page.on('request', (req) => { const u = new URL(req.url()); if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname)) outside.push(req.url()); });
});

test.afterAll(async () => {
  await context?.close();
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const editor = () => page.locator('.lesson-editor');
const input = () => editor().locator('.lesson-summary-input');
const surface = () => editor().locator('.summary-visual-content');
const savedMessage = () => editor().locator('[data-panel="summary"] .lesson-message');
const saveSummary = async () => { await editor().locator('[data-action="save-summary"]').click(); await expect(savedMessage()).toContainText('Resumo salvo'); };

test('1. the app boots and the student signs in', async () => {
  await signInRegistered(page, { email: `smoke-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
});

test('2. a PDF becomes a draft and the lesson editor opens on the Resumo', async () => {
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(editor()).toBeVisible({ timeout: 10000 });
  await expect(input()).toBeVisible(); // the text editor is the default
});

test('3. a summary with a formula, a list and a table is saved from the text editor', async () => {
  await input().fill(SUMMARY);
  await saveSummary();
});

test('4. the visual editor opens it without changing one byte, and draws the formulas, the list and the table-as-text', async () => {
  await editor().locator('.summary-mode-btn[data-mode="visual"]').click();
  await expect(surface()).toBeVisible();
  await expect(surface().locator('h2')).toHaveText('Fisiologia renal');
  await expect(surface().locator('.katex')).toHaveCount(2);
  await expect(surface().locator('li')).toHaveCount(2);
  await expect(surface().locator('table td', { hasText: 'sobe' })).toHaveCount(1);
  await expect(input()).toHaveValue(SUMMARY);
  await expect(editor().locator('[data-action="save-summary"]')).toBeDisabled();
});

test('5. a visual edit changes only its own block, undo restores the original bytes, and the edit is saved', async () => {
  await surface().locator('p', { hasText: 'Segundo parágrafo' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Com ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('negrito');
  await page.keyboard.press('Control+b');
  const edited = SUMMARY.replace('Segundo parágrafo.', 'Segundo parágrafo. Com **negrito**');
  await expect(input()).toHaveValue(edited);
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Control+z');
  await expect(input()).toHaveValue(SUMMARY);
  await page.keyboard.press('Control+y');
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Control+y');
  await expect(input()).toHaveValue(edited);
  await saveSummary();
});

test('6. a formula is typed in place and a hostile paste stays plain text', async () => {
  await surface().locator('p', { hasText: 'Segundo parágrafo' }).click();
  await page.keyboard.press('End');
  await editor().locator('[data-visual="formula"]').click();
  await expect(surface().locator('.summary-math-field')).toBeFocused();
  await page.keyboard.type('x^2');
  await page.keyboard.press('Enter');
  await expect(input()).toHaveValue(/Com \*\*negrito\*\*\\\(x\^2\\\)/);
  await surface().evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>Colado <a href="https://evil.example/x">link</a><img src="https://evil.example/p.png" onerror="window.__pwned=1"></p>');
    data.setData('text/plain', 'Colado link');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(surface().locator('a, img, script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('7. an image becomes a private figure, drawn in the editor', async () => {
  await editor().locator('.summary-visual-toolbar .summary-image-picker').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-alt').fill('Esquema da barreira');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect(input()).toHaveValue(FIG_LINE);
  await expect.poll(() => surface().locator('figure.summary-figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);
  await saveSummary();
});

test('8. after a reload and reopening, the very same text comes back in both editors', async () => {
  const saved = await input().inputValue();
  await page.locator('[data-action="lesson-back"]').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'aula.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 15000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(editor()).toBeVisible({ timeout: 10000 });
  await expect(surface().locator('figure.summary-figure img')).toHaveAttribute('alt', 'Esquema da barreira'); // the visual mode is remembered
  await editor().locator('.summary-mode-btn[data-mode="text"]').click();
  await expect(input()).toHaveValue(saved);
});

test('9. the lesson is accepted and the summary is drawn in the Plano, in Estudar agora and in Hoje', async () => {
  await editor().locator('.source-draft-subject-input').fill('Fisiologia');
  await editor().locator('.source-draft-date-input').fill('2020-01-01');
  await editor().locator('[data-action="accept-draft"]').click();
  // a critical finding on the summary asks the reviewer to confirm they checked it against the source: that is the product's own gate
  const ack = editor().locator('[data-action="ack-summary-findings"]');
  if (await ack.isVisible({ timeout: 3000 }).catch(() => false)) { await ack.check(); await editor().locator('[data-action="accept-draft"]').click(); }
  await expect(editor().locator('.source-draft-result')).toContainText('Aula criada', { timeout: 15000 });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row').first();
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.plan-summary-body .katex').first()).toBeAttached();
  await expect(row.locator('.plan-summary-body figure img')).toHaveCount(1);
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-summary-body .katex').first()).toBeAttached();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('.review-summary-text').first().locator('.katex').first()).toBeAttached({ timeout: 10000 });
});

test('10. nothing was requested outside this machine during the whole run', async () => {
  expect(outside).toEqual([]);
});
