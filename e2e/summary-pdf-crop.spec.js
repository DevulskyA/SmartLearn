import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Delivery C: "Selecionar do PDF". The student picks an uploaded PDF, drags a rectangle over a page, and the region becomes a figure that
// remembers its source, page, rectangle and rotation. Checked on a normal page and on a page rotated by 90 degrees with real pixel colours:
// a red square sits at the top-left of the unrotated page and a blue one at its bottom-left, so a wrong rotation gives the wrong colour.

const SERVER_PORT = serverPort(13976);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const FIG_LINE = /\[\[fig:([0-9a-f-]{36})\]\]/;
const PASSWORD = 'a genuinely long test password 1';

/** A real, parseable one-page PDF (400x600 pt) with a red square at the top-left and a blue one at the bottom-left of the UNROTATED page. */
function markerPdf({ rotate = 0 } = {}) {
  const content = '1 0 0 rg 0 500 100 100 re f 0 0 1 rg 0 0 100 100 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Rotate ${rotate} /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-pdfcrop-'));
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
  throw new Error('pdf crop E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const mediaFiles = () => {
  const found = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else if (!name.endsWith('.partial')) found.push(full); } };
  try { walk(join(dataDir, 'media')); } catch { /* nothing stored yet */ }
  return found;
};

async function prepare(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `crop-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: PASSWORD });
}
test.beforeEach(async ({ page }) => { await prepare(page); });

/** Uploads a PDF as the signed-in student (the same authenticated route the Materiais screen uses) and returns the source id. */
async function uploadPdf(page, name, buffer) {
  return page.evaluate(async ({ base, name: fileName, bytes }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), fileName);
    const res = await fetch(`${base}/v1/sources`, { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': me.csrfToken }, body: form });
    return (await res.json()).source.id;
  }, { base: API_BASE, name, bytes: [...buffer] });
}

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

/** Drags a rectangle given as fractions of the displayed page. */
async function drag(page, fx0, fy0, fx1, fy1) {
  const canvas = page.locator('.pdf-crop-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((fx0 + fx1) / 2), box.y + box.height * ((fy0 + fy1) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps: 4 });
  await page.mouse.up();
}

const centerColor = (page, id) => page.evaluate(async ({ base, id: figureId }) => {
  const blob = await (await fetch(`${base}/v1/visual-assets/${figureId}/file`, { credentials: 'include' })).blob();
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const [r, g, b] = ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data;
  return { r, g, b, width: bitmap.width, height: bitmap.height };
}, { base: API_BASE, id });

async function pickRegion(page, row, { fx0, fy0, fx1, fy1, alt }) {
  await row.locator('[data-insert="pdf"]').click();
  const dialog = page.locator('dialog.pdf-crop-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.pdf-crop-status')).toContainText('Página 1 de 1', { timeout: 15000 });
  await expect(dialog.locator('.pdf-crop-confirm')).toBeDisabled(); // nothing is selected yet
  await drag(page, fx0, fy0, fx1, fy1);
  await expect(dialog.locator('.pdf-crop-confirm')).toBeEnabled();
  await dialog.locator('.pdf-crop-confirm').click();
  const details = page.locator('dialog.figure-details-dialog');
  await expect(details).toBeVisible();
  await details.locator('.figure-dialog-alt').fill(alt);
  return details;
}

test('a normal page: the dragged region becomes a figure with the right pixels and a record of source, page, rectangle and rotation; the original page opens from it', async ({ page }) => {
  const outside = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname)) outside.push(req.url()); });
  const sourceId = await uploadPdf(page, 'normal.pdf', markerPdf());
  const row = await openPlanSummary(page, 'Recorte normal');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Antes do recorte.\n\nDepois do recorte.');
  await textarea.evaluate((el) => el.setSelectionRange(5, 5));

  const details = await pickRegion(page, row, { fx0: 0.03, fy0: 0.02, fx1: 0.2, fy1: 0.13, alt: 'Quadrado vermelho do PDF' });
  await details.locator('.figure-dialog-confirm').click();
  await expect(page.locator('dialog.pdf-crop-dialog')).toHaveCount(0);

  const typed = await textarea.inputValue();
  expect(typed).toMatch(new RegExp(`^Antes do recorte\\.\\n\\n${FIG_LINE.source}\\n\\nDepois do recorte\\.$`));
  const id = FIG_LINE.exec(typed)[1];
  const color = await centerColor(page, id);
  expect(color.r).toBeGreaterThan(200); expect(color.g).toBeLessThan(60); expect(color.b).toBeLessThan(60);
  expect(color.width / color.height).toBeCloseTo((0.17 * 400) / (0.11 * 600), 1); // the crop keeps the proportions of the region on the 400x600 page

  const meta = await page.evaluate(async ({ base, figureId }) => (await (await fetch(`${base}/v1/visual-assets/${figureId}`, { credentials: 'include' })).json()).asset, { base: API_BASE, figureId: id });
  expect(meta.kind).toBe('PDF_CROP');
  expect(meta.source.sourceId).toBe(sourceId);
  expect(meta.source.pageIndex).toBe(1);
  expect(meta.source.rotation).toBe(0);
  expect(meta.source.rect.x).toBeCloseTo(0.03, 1);
  expect(meta.source.rect.w).toBeCloseTo(0.17, 1);
  expect(meta.source.sourceChecksum).toMatch(/^[0-9a-f]{64}$/);

  // preview and saved screen draw it; the enlarged view goes back to the original page, inside the app
  const preview = row.locator('.summary-preview-body');
  await expect(preview.locator('figure.summary-figure img')).toHaveAttribute('alt', 'Quadrado vermelho do PDF');
  await row.locator('.plan-summary-edit-actions .primary-button').click();
  const body = row.locator('.plan-summary-body');
  await body.locator('figure img').click();
  const viewer = page.locator('dialog.figure-viewer-dialog');
  await viewer.locator('.figure-viewer-source').click();
  const original = page.locator('dialog.original-pdf-dialog');
  await expect(original).toBeVisible();
  await expect(original.locator('iframe')).toHaveAttribute('src', new RegExp(`/v1/sources/${sourceId}/file#page=1$`));
  expect(outside, 'nothing is fetched from outside').toEqual([]);
});

test('a page rotated by 90 degrees: the region is the one the student SEES (top-left shows what is at the bottom-left of the unrotated page), and the rotation is recorded', async ({ page }) => {
  await uploadPdf(page, 'girado.pdf', markerPdf({ rotate: 90 }));
  const row = await openPlanSummary(page, 'Recorte girado');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Texto.');

  const blueDetails = await pickRegion(page, row, { fx0: 0.02, fy0: 0.03, fx1: 0.14, fy1: 0.2, alt: 'Canto superior esquerdo visto' });
  await blueDetails.locator('.figure-dialog-confirm').click();
  await expect(page.locator('dialog.pdf-crop-dialog')).toHaveCount(0);
  const blueId = FIG_LINE.exec(await textarea.inputValue())[1];
  const blue = await centerColor(page, blueId);
  expect(blue.b).toBeGreaterThan(200); expect(blue.r).toBeLessThan(60);

  const redDetails = await pickRegion(page, row, { fx0: 0.85, fy0: 0.03, fx1: 0.97, fy1: 0.2, alt: 'Canto superior direito visto' });
  await redDetails.locator('.figure-dialog-confirm').click();
  await expect(page.locator('dialog.pdf-crop-dialog')).toHaveCount(0);
  const ids = [...(await textarea.inputValue()).matchAll(new RegExp(FIG_LINE, 'g'))].map((m) => m[1]);
  expect(ids).toHaveLength(2);
  const red = await centerColor(page, ids.find((x) => x !== blueId));
  expect(red.r).toBeGreaterThan(200); expect(red.b).toBeLessThan(60);

  const meta = await page.evaluate(async ({ base, figureId }) => (await (await fetch(`${base}/v1/visual-assets/${figureId}`, { credentials: 'include' })).json()).asset, { base: API_BASE, figureId: blueId });
  expect(meta.source.rotation).toBe(90);
});

test('keyboard only: Enter marks a region, arrows move it, Shift+arrows resize it, Enter confirms; Escape cancels with nothing stored', async ({ page }) => {
  await uploadPdf(page, 'teclado.pdf', markerPdf());
  const row = await openPlanSummary(page, 'Recorte teclado');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Texto.');
  const before = mediaFiles().length;

  await row.locator('[data-insert="pdf"]').click();
  const dialog = page.locator('dialog.pdf-crop-dialog');
  await expect(dialog.locator('.pdf-crop-status')).toContainText('Página 1 de 1', { timeout: 15000 });
  await expect(dialog.locator('.pdf-crop-stage')).toBeFocused();
  await page.keyboard.press('Enter');
  const selection = dialog.locator('.pdf-crop-selection');
  await expect(selection).toBeVisible();
  const start = await selection.boundingBox();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = await selection.boundingBox();
  expect(after.x).toBeGreaterThan(start.x);
  expect(after.height).toBeGreaterThan(start.height);
  await page.keyboard.press('Escape'); // first Escape clears the region
  await expect(selection).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.locator('button', { hasText: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  expect(mediaFiles().length).toBe(before);
  await expect(textarea).toHaveValue('Texto.');
});

test('a save whose answer is lost is retried without creating a second figure', async ({ page }) => {
  await uploadPdf(page, 'repetido.pdf', markerPdf());
  const row = await openPlanSummary(page, 'Recorte repetido');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Texto.');
  const before = mediaFiles().length;
  let dropped = false;
  await page.route('**/v1/visual-assets?*', async (route) => {
    if (!dropped && route.request().method() === 'POST') { dropped = true; await route.fetch(); await route.abort(); return; } // the server stored it; the answer never arrives
    await route.continue();
  });
  const details = await pickRegion(page, row, { fx0: 0.03, fy0: 0.02, fx1: 0.2, fy1: 0.13, alt: 'Quadrado' });
  await details.locator('.figure-dialog-confirm').click();
  await expect(details.locator('.figure-dialog-status')).not.toHaveText('', { timeout: 5000 });
  await expect(details.locator('.figure-dialog-confirm')).toBeEnabled();
  await details.locator('.figure-dialog-confirm').click(); // the student tries again
  await expect(page.locator('dialog.pdf-crop-dialog')).toHaveCount(0);
  expect(dropped).toBe(true);
  expect(mediaFiles().length - before).toBe(1);
});

test('with no internet at all (every non-local request is refused): formulas draw with the bundled KaTeX fonts, the MathLive dialog opens, and the PDF picker renders its page', async ({ page }) => {
  const refused = [];
  await page.context().route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => { refused.push(route.request().url()); return route.abort(); });
  await uploadPdf(page, 'offline.pdf', markerPdf());
  const row = await openPlanSummary(page, 'Sem internet');
  const textarea = row.locator('.plan-summary-textarea');
  await textarea.fill('Taxa \\(C=C_0 e^{-kt}\\) e \\(\\ce{H2O}\\).');
  const preview = row.locator('.summary-preview-body');
  await expect(preview.locator('.katex').first()).toBeVisible();
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('1em KaTeX_Main') && [...document.fonts].some((f) => f.family.startsWith('KaTeX') && f.status === 'loaded'); })).toBe(true);

  await row.locator('[data-insert="formula"]').click();
  const math = page.locator('dialog.math-dialog');
  await expect(math.locator('math-field')).toBeVisible({ timeout: 15000 });
  await math.locator('.math-dialog-latex').fill('\\sqrt{x}');
  await expect(math.locator('.math-dialog-preview .katex')).toBeVisible();
  await math.locator('.math-dialog-confirm').click();
  await expect(math).toHaveCount(0);

  await row.locator('[data-insert="pdf"]').click();
  const dialog = page.locator('dialog.pdf-crop-dialog');
  await expect(dialog.locator('.pdf-crop-status')).toContainText('Página 1 de 1', { timeout: 15000 });
  await dialog.locator('button', { hasText: 'Cancelar' }).click();
  expect(refused, 'nothing tried to leave the machine').toEqual([]);
});

test('without any uploaded PDF the picker says so instead of failing', async ({ page }) => {
  const row = await openPlanSummary(page, 'Sem PDF');
  await row.locator('[data-insert="pdf"]').click();
  const dialog = page.locator('dialog.pdf-crop-dialog');
  await expect(dialog.locator('.pdf-crop-status')).toContainText('Nenhum PDF enviado');
  await dialog.locator('button', { hasText: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
});
