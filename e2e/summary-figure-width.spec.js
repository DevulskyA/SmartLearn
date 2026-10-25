import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// A figure occurrence can be moved and resized in the summary (Tiptap's own drag and ResizableNodeView on the existing Figure node). The width lives in the
// marker, [[fig:UUID|w=N]]; legacy markers are untouched. What is proven here is what the student sees: one copy after a move, the proportion kept,
// the text saved by itself, and the same page after reopening.

const SERVER_PORT = serverPort(13942);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-figwidth-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), SMARTLEARN_MEDIA_DIR: join(dataDir, 'media'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('visual editor E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const outside = [];
test.beforeEach(async ({ page }) => {
  outside.length = 0;
  page.on('request', (req) => { const u = new URL(req.url()); if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname)) outside.push(req.url()); });
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `visual-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1', summaryMode: null });
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

async function reopenDraft(page, editor) {
  await page.locator('[data-action="lesson-back"]').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'aula.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 15000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(editor).toBeVisible({ timeout: 10000 });
}

async function saveSummary(editor) {
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
}

const visualButton = (editor) => editor.locator('.summary-mode-btn[data-mode="visual"]');
const textButton = (editor) => editor.locator('.summary-mode-btn[data-mode="text"]');
const surface = (editor) => editor.locator('.summary-visual-content');

async function startWith(page, text) {
  const editor = await openDraft(page);
  await textButton(editor).click(); // the plain text is only a way to put the content there; the student then works on the page
  await editor.locator('.lesson-summary-input').fill(text);
  await saveSummary(editor);
  await visualButton(editor).click();
  await expect(surface(editor)).toBeVisible();
  return editor;
}


// A real 400x200 image (so a resize has room and the proportion is 2:1)
function solidPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const BIG_PNG = solidPng(400, 200, [37, 99, 235]);
const MARKER = /\[\[fig:([0-9a-f-]{36})(\|w=\d+)?\]\]/g;
const markers = (text) => [...text.matchAll(MARKER)].map((m) => m[0]);
const savedIndicator = (editor) => editor.locator('[data-panel="summary"] .save-indicator[data-state="saved"]');

// puts the figure after the paragraph `after`, through the toolbar's picker and the details dialog
async function insertFigure(page, editor, after) {
  await surface(editor).locator('p', { hasText: after }).click();
  await page.keyboard.press('End');
  await editor.locator('.summary-visual-toolbar .summary-image-picker').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: BIG_PNG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-alt').fill('Esquema da barreira de filtração');
  await dialog.locator('.figure-dialog-caption').fill('Figura 1. Barreira');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);
  const img = surface(editor).locator('figure.summary-figure img');
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth)).toBe(400);
  // the text follows the page a moment later (the editor writes back after a short pause): wait for the marker before reading it
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(/\[\[fig:[0-9a-f-]{36}\]\]/);
}

test('the student drags a figure to another place and resizes it with the handles: one copy, same proportion, saved by itself, and the same after reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 }); // the whole page is on the screen, so the drop point is reachable by the pointer
  const editor = await startWith(page, 'Um\n\nDois\n\nTres\n\nQuatro');
  const input = editor.locator('.lesson-summary-input');
  await insertFigure(page, editor, 'Um');
  const start = await input.inputValue();
  expect(start).toMatch(/^Um\n\n\[\[fig:[0-9a-f-]{36}\]\]\n\nDois\n\nTres\n\nQuatro$/); // a new figure has no width: the legacy marker
  const id = markers(start)[0].slice(6, 42);

  // drag it below "Tres": one copy, same id, no width written by a move
  const figure = surface(editor).locator('figure.summary-figure img');
  const from = await figure.boundingBox();
  const to = await surface(editor).locator('p', { hasText: 'Tres' }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x + 30, to.y + to.height - 2, { steps: 14 });
  await page.mouse.up();
  await expect(input).not.toHaveValue(start);
  const moved = await input.inputValue();
  expect(markers(moved)).toEqual([`[[fig:${id}]]`]);
  expect(moved.indexOf('[[fig:')).toBeGreaterThan(moved.indexOf('Dois'));
  await expect(surface(editor).locator('figure.summary-figure')).toHaveCount(1);

  // resize with the corner handle: the proportion (2:1) stays, the width lands in the marker
  await surface(editor).locator('figure.summary-figure img').hover();
  const handle = surface(editor).locator('[data-resize-handle="bottom-right"]');
  await expect(handle).toBeVisible();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 120, hb.y - 40, { steps: 10 });
  await page.mouse.up();
  await expect(input).toHaveValue(new RegExp(`\\[\\[fig:${id}\\|w=\\d+\\]\\]`));
  const sized = await input.inputValue();
  const width = Number(/\|w=(\d+)\]\]/.exec(sized)[1]);
  expect(width).toBeGreaterThanOrEqual(40);
  expect(width).toBeLessThan(400);
  const box = await surface(editor).locator('figure.summary-figure img').boundingBox();
  expect(Math.abs(box.width / box.height - 2)).toBeLessThan(0.05);
  expect(Math.abs(box.width - width)).toBeLessThanOrEqual(2);
  expect(markers(sized)).toHaveLength(1);

  // nobody pressed Save: the text is saved by itself after 2.5 s without typing
  await savedIndicator(editor).waitFor({ timeout: 10000 });
  await reopenDraft(page, editor);
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(sized);
  const again = surface(editor).locator('figure.summary-figure');
  await expect(again).toHaveCount(1);
  await expect(again.locator('img')).toHaveAttribute('alt', 'Esquema da barreira de filtração'); // image, caption and provenance are the figure's own record
  await expect(again.locator('figcaption')).toHaveText('Figura 1. Barreira');
  const back = await surface(editor).locator('figure.summary-figure img').boundingBox();
  expect(Math.abs(back.width - width)).toBeLessThanOrEqual(2);
  expect(outside).toEqual([]);
});

test('an old summary is not rewritten, the same image can appear twice at two widths, and a narrow window keeps the image visible without touching the saved width', async ({ page }) => {
  const editor = await startWith(page, 'Antes\n\nDepois');
  const input = editor.locator('.lesson-summary-input');
  await insertFigure(page, editor, 'Antes');
  const legacy = await input.inputValue();
  await saveSummary(editor);
  // opening and closing the visual editor on a legacy marker changes nothing
  await textButton(editor).click();
  await visualButton(editor).click();
  await expect(surface(editor).locator('figure.summary-figure img')).toBeVisible();
  await expect(input).toHaveValue(legacy);
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled();

  const id = markers(legacy)[0].slice(6, 42);
  await textButton(editor).click();
  const twice = `Antes\n\n[[fig:${id}|w=200]]\n\nentre\n\n[[fig:${id}|w=1000]]\n\nDepois`;
  await input.fill(twice);
  await saveSummary(editor);
  await visualButton(editor).click();
  const figures = surface(editor).locator('figure.summary-figure img');
  await expect(figures).toHaveCount(2);
  await expect.poll(async () => Math.round((await figures.nth(0).boundingBox()).width)).toBe(200);
  const wide = await figures.nth(1).boundingBox();
  const area = await surface(editor).boundingBox();
  expect(wide.width).toBeLessThanOrEqual(area.width); // never wider than the page
  await expect(input).toHaveValue(twice); // looking at it changed nothing

  // a much narrower window: the wide one shrinks to fit, the stored width is untouched
  await page.setViewportSize({ width: 360, height: 800 });
  const narrowArea = await surface(editor).boundingBox();
  await expect.poll(async () => (await figures.nth(1).boundingBox()).width).toBeLessThanOrEqual(narrowArea.width);
  await expect(input).toHaveValue(twice);
  expect(markers(await input.inputValue())).toEqual([`[[fig:${id}|w=200]]`, `[[fig:${id}|w=1000]]`]);
});

test('a marker inside code is only text, and a figure that is still used (even resized) cannot be deleted', async ({ page }) => {
  const editor = await startWith(page, 'Antes');
  const input = editor.locator('.lesson-summary-input');
  await insertFigure(page, editor, 'Antes');
  const id = markers(await input.inputValue())[0].slice(6, 42);
  await textButton(editor).click();
  const text = `Antes\n\n\`\`\`\n[[fig:${id}|w=300]]\n\`\`\`\n\n[[fig:${id}|w=300]]`;
  await input.fill(text);
  await saveSummary(editor);
  await visualButton(editor).click();
  await expect(surface(editor).locator('pre')).toContainText(`[[fig:${id}|w=300]]`);
  await expect(surface(editor).locator('figure.summary-figure')).toHaveCount(1); // only the real marker is a figure

  const me = await (await page.request.get(`${API_BASE}/v1/auth/me`)).json();
  const result = await page.request.delete(`${API_BASE}/v1/visual-assets/${id}`, { headers: { Origin: VITE_ORIGIN, 'X-CSRF-Token': me.csrfToken } });
  const body = await result.json().catch(() => null);
  expect(result.status()).toBe(409);
  expect(body?.error?.code).toBe('ASSET_IN_USE');
});
