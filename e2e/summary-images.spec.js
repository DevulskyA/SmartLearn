import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Delivery B: private images in the Resumo Mestre. Insert from a file and from the clipboard through the details dialog (description is
// required), see it in the preview and in every screen, enlarge and edit its texts, refuse hostile files, keep it owner-only, keep it
// after a reload and when the lesson is accepted.

const SERVER_PORT = serverPort(13974);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=1</script></svg>');
const FIG_LINE = /\[\[fig:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\]\]/;

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-images-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      SMARTLEARN_MEDIA_DIR: join(dataDir, 'media'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('images E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const PASSWORD = 'a genuinely long test password 1';

async function prepare(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `img-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: PASSWORD });
  return email;
}
test.beforeEach(async ({ page }) => { await prepare(page); });

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

async function insertFromFile(page, row, { name = 'esquema.png', mimeType = 'image/png', buffer = PIXEL_PNG, alt = 'Esquema da barreira', caption = 'Figura 1. Barreira' } = {}) {
  await row.locator('.summary-image-picker').setInputFiles({ name, mimeType, buffer });
  const dialog = page.locator('dialog.figure-details-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('.figure-dialog-alt').fill(alt);
  await dialog.locator('.figure-dialog-caption').fill(caption);
  await dialog.locator('.figure-dialog-confirm').click();
}

test('insert from a file: the description is required, the figure lands at the cursor, shows in the preview, the Plano, after a reload — and its texts can be edited from the enlarged view', async ({ page }) => {
  const outside = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname)) outside.push(req.url()); });
  const row = await openPlanSummary(page, 'Imagem por arquivo');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Antes da figura.\n\nDepois da figura.');
  await textarea.evaluate((el) => el.setSelectionRange(5, 5));

  // the description is mandatory: nothing is uploaded without it
  await row.locator('.summary-image-picker').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog.locator('.figure-dialog-status')).toContainText('Descreva');
  expect(await page.evaluate(async (base) => (await fetch(`${base}/v1/visual-assets/00000000-0000-4000-8000-000000000000`, { credentials: 'include' })).status, API_BASE)).toBe(404);
  await dialog.locator('.figure-dialog-alt').fill('Esquema da barreira');
  await dialog.locator('.figure-dialog-caption').fill('Figura 1. Barreira');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);

  const typed = await textarea.inputValue();
  expect(typed).toMatch(new RegExp(`^Antes da figura\\.\\n\\n${FIG_LINE.source}\\n\\nDepois da figura\\.$`)); // its own block after the cursor line, text intact
  const preview = row.locator('.summary-preview-body');
  await expect(preview.locator('figure.summary-figure img')).toHaveAttribute('alt', 'Esquema da barreira');
  await expect(preview.locator('figcaption')).toHaveText('Figura 1. Barreira');
  await expect.poll(() => preview.locator('figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);

  await row.locator('.plan-summary-edit-actions .primary-button').click();
  const body = row.locator('.plan-summary-body');
  await expect(body.locator('figure.summary-figure img')).toHaveAttribute('alt', 'Esquema da barreira');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await page.locator('.plan-row', { hasText: 'Imagem por arquivo' }).locator('.plan-expand-btn').click();
  const again = page.locator('.plan-row', { hasText: 'Imagem por arquivo' }).locator('.plan-summary-body');
  await expect.poll(() => again.locator('figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);

  // enlarge, then edit only the texts: the summary text is not touched
  const stored = (await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units[0].summaryBody, API_BASE));
  await again.locator('figure img').click();
  const viewer = page.locator('dialog.figure-viewer-dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('Esquema da barreira');
  await viewer.locator('.figure-viewer-edit').click();
  await page.locator('dialog.figure-details-dialog .figure-dialog-caption').fill('Figura 1 revisada');
  await page.locator('dialog.figure-details-dialog .figure-dialog-description').fill('Três camadas: endotélio, membrana basal e epitélio.');
  await page.locator('dialog.figure-details-dialog .figure-dialog-confirm').click();
  await expect(again.locator('figcaption')).toHaveText('Figura 1 revisada');
  const after = (await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units[0].summaryBody, API_BASE));
  expect(after).toBe(stored);
  expect(outside).toEqual([]);
});

test('paste from the clipboard goes through the same dialog; ordinary text paste is untouched', async ({ page }) => {
  const row = await openPlanSummary(page, 'Imagem colada');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Texto.');
  await textarea.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'colada.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PIXEL_PNG.toString('base64'));
  const dialog = page.locator('dialog.figure-details-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('.figure-dialog-alt').fill('Imagem colada');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(textarea).toHaveValue(new RegExp(`^Texto\\.\\n\\n${FIG_LINE.source}\\n$`));

  const before = await textarea.inputValue();
  await textarea.evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/plain', ' colado');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    window.__pasteDefaultPrevented = event.defaultPrevented;
  });
  expect(await page.evaluate(() => window.__pasteDefaultPrevented)).toBe(false);
  await expect(textarea).toHaveValue(before);
});

test('hostile or unsupported files are refused and the text is left exactly as it was', async ({ page }) => {
  const row = await openPlanSummary(page, 'Arquivos hostis');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Intacto.');

  // SVG dressed as a PNG: the server reads the real bytes and refuses it
  await row.locator('.summary-image-picker').setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: SVG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-alt').fill('x');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog.locator('.figure-dialog-status')).not.toHaveText(/^$/);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(textarea).toHaveValue('Intacto.');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();

  // a type the client already knows is unsupported never opens the dialog
  await row.locator('.summary-image-picker').setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(row.locator('.summary-toolbar-message')).toContainText('PNG, JPEG ou WebP');
  await expect(page.locator('dialog.figure-details-dialog')).toHaveCount(0);
  await expect(textarea).toHaveValue('Intacto.');
});

test('owner-only: another student cannot read the figure or save a summary that points at it; an unknown reference is shown as an explicit marker', async ({ page, browser }) => {
  const row = await openPlanSummary(page, 'Isolamento de imagem');
  await insertFromFile(page, row);
  await expect(page.locator('dialog.figure-details-dialog')).toHaveCount(0);
  const line = FIG_LINE.exec(await row.locator('.plan-summary-textarea').inputValue())[0];
  const id = /fig:([^\]]+)\]/.exec(line)[1];
  await row.locator('.plan-summary-edit-actions .primary-button').click();
  await expect(row.locator('.plan-summary-body figure img')).toBeVisible();

  const other = await browser.newContext();
  const stranger = await other.newPage();
  await prepare(stranger);
  const result = await stranger.evaluate(async ({ base, figure }) => {
    const get = async (path) => (await fetch(`${base}${path}`, { credentials: 'include' })).status;
    return { meta: await get(`/v1/visual-assets/${figure}`), file: await get(`/v1/visual-assets/${figure}/file`) };
  }, { base: API_BASE, figure: id });
  expect(result).toEqual({ meta: 404, file: 404 });

  const strangerRow = await openPlanSummary(stranger, 'Aula do estranho');
  const box = strangerRow.locator('.plan-summary-textarea');
  await box.fill(`Tentativa.\n\n${line}`);
  await expect(strangerRow.locator('.summary-preview-body .summary-figure-missing')).toContainText('Figura indisponível');
  await strangerRow.locator('.plan-summary-edit-actions .primary-button').click();
  await expect(strangerRow.locator('.plan-summary-edit-actions .form-message')).toContainText('figura');
  await other.close();
});

test('lesson editor: an image inserted in the draft survives the save and the acceptance and shows in Plano and Estudar agora', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });

  const input = editor.locator('.lesson-summary-input');
  await input.fill('Resumo com figura.');
  await editor.locator('.summary-image-picker').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-alt').fill('Esquema do glomérulo');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);
  const typed = (await input.inputValue()).trim();
  expect(typed).toMatch(new RegExp(`^Resumo com figura\\.\\n\\n${FIG_LINE.source}$`));
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');

  await editor.locator('.source-draft-subject-input').fill('Fisiologia');
  await editor.locator('.source-draft-date-input').fill('2020-01-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 15000 });
  const units = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units, API_BASE);
  expect(units[0].summaryBody).toBe(typed);

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row').first();
  await row.locator('.plan-expand-btn').click();
  await expect.poll(() => row.locator('.plan-summary-body figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);
  await row.locator('[data-action="plan-study-now"]').click();
  await expect.poll(() => page.locator('#study-now-summary-body figure img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);
});
