import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';
import AxeBuilder from '@axe-core/playwright';

// The visual editor of the Resumo Mestre (Tiptap / ProseMirror) inside the lesson editor's Resumo tab. The textarea stays the source of
// truth: what is proven here is that the visual path opens, edits, saves, reloads and reopens the SAME text, that an untouched summary is
// never rewritten, and that nothing foreign (HTML, links, remote requests) gets in.

const SERVER_PORT = serverPort(13980);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const FIG_LINE = /\[\[fig:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\]\]/;
// odd on purpose: CRLF is not used here (the textarea normalises it), but gaps of one and of three newlines, a table, a list, two formulas
const LEGACY = '## Fisiologia renal\nA TFG vale \\(TFG = U \\cdot V / P\\) em mL/min.\n\n\n\nSegundo parágrafo, sem marcação.\n\n- primeiro\n- segundo\n\n\\[\n\\ce{H2O}\n\\]\n\n| Fase | Efeito |\n|---|---|\n| Filtração | sobe |';

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-visual-'));
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
  await signInRegistered(page, { email: `visual-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
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
  await editor.locator('.lesson-summary-input').fill(text);
  await saveSummary(editor);
  return editor;
}

test('the text editor is still the default, and opening the visual editor on an untouched summary changes nothing: not one byte, not the save state', async ({ page }) => {
  const editor = await startWith(page, LEGACY);
  const input = editor.locator('.lesson-summary-input');
  await expect(input).toBeVisible(); // default: the original text editor
  await expect(surface(editor)).toHaveCount(0); // and the visual code was not even loaded

  await visualButton(editor).click();
  await expect(surface(editor)).toBeVisible();
  await expect(input).toBeHidden();
  await expect(surface(editor).locator('h2')).toHaveText('Fisiologia renal');
  await expect(surface(editor).locator('.katex')).toHaveCount(2);
  await expect(surface(editor).locator('pre[data-raw]')).toContainText('| Filtração | sobe |'); // the table is carried as text, not dropped
  await expect(surface(editor).locator('li')).toHaveCount(2);

  // walk through the text with the keyboard and focus out: still no edit
  await surface(editor).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await editor.locator('[data-action="save-summary"]').focus();
  await expect(input).toHaveValue(LEGACY);
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled(); // nothing to save: the text is not dirty

  await textButton(editor).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(LEGACY);
  expect(outside).toEqual([]); // works with no request leaving the machine
});

test('editing in the visual editor writes only the edited block; save, reload and reopen give the same text and the same drawing', async ({ page }) => {
  const editor = await startWith(page, LEGACY);
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();

  const second = surface(editor).locator('p', { hasText: 'Segundo parágrafo' });
  await second.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' e mais ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('negrito');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' *itálico* depois'); // typing *x* is the usual shortcut for italic
  const expected = LEGACY.replace('Segundo parágrafo, sem marcação.', 'Segundo parágrafo, sem marcação. e mais **negrito** *itálico* depois');
  await expect(input).toHaveValue(expected); // every other byte of the summary is the original
  await expect(second.locator('em')).toHaveText('itálico');

  await expect(editor.locator('[data-action="save-summary"]')).toBeEnabled();
  await saveSummary(editor);
  await reopenDraft(page, editor);
  await expect(visualButton(editor)).toHaveAttribute('aria-pressed', 'true'); // the choice is remembered, and the editor loads again
  await expect(surface(editor).locator('strong')).toHaveText('negrito');
  await expect(surface(editor).locator('em')).toHaveText('itálico');
  await textButton(editor).click();
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(expected);
  expect(outside).toEqual([]);
});

test('undo returns the text to the original bytes; the keyboard reaches every tool; the toolbar shows the active format', async ({ page }) => {
  const editor = await startWith(page, LEGACY);
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Segundo parágrafo' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(input).not.toHaveValue(LEGACY);
  await page.keyboard.press('Control+z');
  await expect(input).toHaveValue(LEGACY);

  // tools are real buttons in the tab order, with a pressed state
  const bold = editor.locator('[data-visual="bold"]');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+b');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+b');
  await bold.focus();
  await page.keyboard.press('Enter');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.locator('.summary-visual-toolbar')).toHaveAttribute('role', 'toolbar');
  await expect(surface(editor)).toHaveAttribute('role', 'textbox');
});

test('formulas: insert inline and as a block through the dialog, edit an existing one by click and by keyboard; invalid ones stay visible and fixable', async ({ page }) => {
  const editor = await startWith(page, 'Antes.\n\nCom \\(a+b\\) no meio.\n\nDepois.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();

  // inline, at the caret
  await surface(editor).locator('p', { hasText: 'Antes.' }).click();
  await page.keyboard.press('End');
  await editor.locator('[data-visual="formula"]').click();
  await page.locator('dialog.math-dialog .math-dialog-latex').fill('x^2');
  await page.locator('dialog.math-dialog .math-dialog-confirm').click();
  await expect(input).toHaveValue('Antes.\\(x^2\\)\n\nCom \\(a+b\\) no meio.\n\nDepois.');

  // as a block, after the paragraph of the caret
  await surface(editor).locator('p', { hasText: 'Depois.' }).click();
  await editor.locator('[data-visual="formula"]').click();
  await page.locator('dialog.math-dialog .math-dialog-latex').fill('\\alpha + \\beta');
  await page.locator('dialog.math-dialog .math-dialog-display input').check();
  await page.locator('dialog.math-dialog .math-dialog-confirm').click();
  await expect(input).toHaveValue('Antes.\\(x^2\\)\n\nCom \\(a+b\\) no meio.\n\nDepois.\n\n\\[\n\\alpha + \\beta\n\\]');

  // edit one existing formula by clicking it: only its characters change
  await surface(editor).locator('.summary-math-editable').filter({ has: page.locator('annotation', { hasText: /^a\+b$/ }) }).click();
  const dialog = page.locator('dialog.math-dialog');
  await expect(dialog.locator('.math-dialog-latex')).toHaveValue('a+b');
  await dialog.locator('.math-dialog-latex').fill('a-b');
  await dialog.locator('.math-dialog-confirm').click();
  await expect(input).toHaveValue('Antes.\\(x^2\\)\n\nCom \\(a-b\\) no meio.\n\nDepois.\n\n\\[\n\\alpha + \\beta\n\\]');

  // by keyboard: arrow onto the formula, Enter opens the dialog
  await surface(editor).locator('p', { hasText: 'no meio' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowLeft'); // " no meio." is 9 characters: the next step left is the formula itself
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.locator('.math-dialog-latex').fill('a\\times b');
  await dialog.locator('.math-dialog-confirm').click();
  await expect(input).toHaveValue('Antes.\\(x^2\\)\n\nCom \\(a\\times b\\) no meio.\n\nDepois.\n\n\\[\n\\alpha + \\beta\n\\]');

  // an invalid formula from the text is shown as invalid, with the original text and a way to fix it
  await textButton(editor).click();
  await input.fill('Quebrada \\(\\frac{a\\) aqui.');
  await visualButton(editor).click();
  const broken = surface(editor).locator('.summary-math-error');
  await expect(broken).toContainText('Fórmula inválida');
  await expect(broken.locator('.summary-math-original')).toHaveText('\\frac{a');
  await broken.locator('.summary-math-fix').click();
  await dialog.locator('.math-dialog-latex').fill('\\frac{a}{b}');
  await dialog.locator('.math-dialog-confirm').click();
  await expect(input).toHaveValue('Quebrada \\(\\frac{a}{b}\\) aqui.');
  expect(outside).toEqual([]);
});

test('figures: insert an image from the visual editor, see it drawn, save, reload and reopen; the text holds only the reference', async ({ page }) => {
  const editor = await startWith(page, 'Antes da figura.\n\nDepois da figura.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Antes da figura.' }).click();
  await editor.locator('.summary-visual-toolbar .summary-image-picker').setInputFiles({ name: 'esquema.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  const dialog = page.locator('dialog.figure-details-dialog');
  await dialog.locator('.figure-dialog-alt').fill('Esquema da barreira');
  await dialog.locator('.figure-dialog-caption').fill('Figura 1. Barreira');
  await dialog.locator('.figure-dialog-confirm').click();
  await expect(dialog).toHaveCount(0);

  await expect(input).toHaveValue(new RegExp(`^Antes da figura\\.\\n\\n${FIG_LINE.source}\\n\\nDepois da figura\\.$`));
  const figure = surface(editor).locator('figure.summary-figure');
  await expect(figure.locator('img')).toHaveAttribute('alt', 'Esquema da barreira');
  await expect(figure.locator('figcaption')).toHaveText('Figura 1. Barreira');
  await expect.poll(() => figure.locator('img').evaluate((el) => el.complete && el.naturalWidth)).toBe(1);

  const saved = await input.inputValue();
  await saveSummary(editor);
  await reopenDraft(page, editor);
  await expect(surface(editor).locator('figure.summary-figure img')).toHaveAttribute('alt', 'Esquema da barreira');
  await textButton(editor).click();
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(saved);
  expect(outside).toEqual([]);
});

test('hostile content cannot get in: pasted HTML keeps only its text, no link, image or script is created, nothing runs and nothing is requested', async ({ page }) => {
  const editor = await startWith(page, 'Texto inicial.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).click();
  await page.keyboard.press('Control+End');
  await surface(editor).evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>Colado <a href="https://evil.example/x">link</a> <img src="https://evil.example/pixel.png" onerror="window.__pwned=1"><script>window.__pwned=2</script><b onmouseover="window.__pwned=3">forte</b></p>');
    data.setData('text/plain', 'Colado link forte');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(surface(editor)).toContainText('Colado');
  await expect(surface(editor).locator('a, img, script, iframe, [onerror], [onmouseover]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(input).not.toHaveValue(/evil\.example|<script|onerror|onmouseover/);
  await page.waitForTimeout(400);
  expect(outside).toEqual([]);

  // text that merely looks like Markdown or HTML is typed as text and comes back as the same text
  await page.keyboard.type(' <b>não é html</b> [x](http://evil.example) # nem título');
  await expect(input).toHaveValue(/<b>não é html<\/b> \[x\]\(http:\/\/evil\.example\) # nem título/);
  await textButton(editor).click();
  await visualButton(editor).click();
  await expect(surface(editor)).toContainText('<b>não é html</b> [x](http://evil.example) # nem título');
  await expect(surface(editor).locator('a, b, h1')).toHaveCount(0);
});

test('switching modes in both directions keeps one text; edits made in the text editor appear in the visual one', async ({ page }) => {
  const editor = await startWith(page, 'Um.\n\nDois.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Um.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' mais');
  await textButton(editor).click(); // the pending visual edit is written before the text editor shows
  await expect(input).toHaveValue('Um. mais\n\nDois.');
  await input.fill('Um. mais\n\nDois.\n\n## Novo título');
  await visualButton(editor).click();
  await expect(surface(editor).locator('h2')).toHaveText('Novo título');
  await expect(editor.locator('[data-action="save-summary"]')).toBeEnabled();
  await saveSummary(editor);
});

test('a PDF region inserted from the visual editor becomes a figure that remembers its source and page, and is drawn in the editor', async ({ page }) => {
  const editor = await startWith(page, 'Antes do recorte.\n\nDepois do recorte.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Antes do recorte.' }).click();
  await editor.locator('[data-visual="pdf"]').click();
  const dialog = page.locator('dialog.pdf-crop-dialog');
  await expect(dialog.locator('.pdf-crop-status')).toContainText('Página 1 de', { timeout: 15000 });
  const canvas = dialog.locator('.pdf-crop-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 6 });
  await page.mouse.up();
  await dialog.locator('.pdf-crop-confirm').click();
  const details = page.locator('dialog.figure-details-dialog');
  await details.locator('.figure-dialog-alt').fill('Região do PDF');
  await details.locator('.figure-dialog-confirm').click();
  await expect(input).toHaveValue(new RegExp(`^Antes do recorte\.\n\n${FIG_LINE.source}\n\nDepois do recorte\.$`));
  await expect(surface(editor).locator('figure.summary-figure img')).toHaveAttribute('alt', 'Região do PDF');
  const id = FIG_LINE.exec(await input.inputValue())[0].slice(6, -2);
  const meta = await page.evaluate(async ({ base, figureId }) => (await (await fetch(`${base}/v1/visual-assets/${figureId}`, { credentials: 'include' })).json()).asset, { base: API_BASE, figureId: id });
  expect(meta.kind).toBe('PDF_CROP');
  expect(meta.source.pageIndex).toBe(1);
  expect(outside).toEqual([]);
});

test('an edit that Markdown cannot express faithfully is never saved as something else: the editor says so, keeps the last faithful text, refuses to save, and recovers when fixed', async ({ page }) => {
  const editor = await startWith(page, 'Um.');
  const input = editor.locator('.lesson-summary-input');
  const notice = editor.locator('.summary-visual-notice');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Um.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('(a)');
  await page.keyboard.press('Control+b');
  await expect(input).toHaveValue('Um. **(a)**'); // bold ending in punctuation, then the end of the line: fine
  await page.keyboard.type('b'); // "**(a)**b" would be read back as literal asterisks: Markdown cannot close that bold next to a letter
  await expect(notice).toBeVisible();
  await expect(editor.locator('.summary-visual')).toHaveAttribute('data-sync', 'blocked');
  await expect(input).toHaveValue('Um. **(a)**'); // the text still holds the last faithful version
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('nada foi salvo');

  // leaving for the text editor asks first, because the unwritable edit would be dropped
  page.once('dialog', (d) => d.dismiss());
  await textButton(editor).click();
  await expect(visualButton(editor)).toHaveAttribute('aria-pressed', 'true');
  await expect(notice).toBeVisible();

  await surface(editor).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace'); // fixing the edit clears the problem and the text follows the editor again
  await expect(notice).toBeHidden();
  await expect(editor.locator('.summary-visual')).toHaveAttribute('data-sync', 'ok');
  await page.keyboard.type(' c');
  await expect(input).toHaveValue('Um. **(a)** c');
  await saveSummary(editor);
});

test('accessibility: the visual editor, its toolbar and the mode switch have no WCAG A/AA violations, and the whole flow works with the keyboard alone', async ({ page }) => {
  const editor = await startWith(page, LEGACY);
  await visualButton(editor).focus();
  await page.keyboard.press('Enter'); // the mode switch is reachable and operable by keyboard
  await expect(surface(editor)).toBeVisible();
  await expect(visualButton(editor)).toHaveAttribute('aria-pressed', 'true');
  const result = await new AxeBuilder({ page }).include('.lesson-editor').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  // Tab from the toolbar reaches the text, and the tools carry accessible names
  const names = await editor.locator('.summary-visual-toolbar button').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  expect(names).toEqual(['Negrito', 'Itálico', 'Riscado', 'Título', 'Lista', 'Lista numerada', 'Inserir fórmula', 'Inserir imagem', 'Selecionar do PDF', 'Desfazer', 'Refazer']);
  await editor.locator('[data-visual="bold"]').focus();
  let presses = 0;
  while (presses < names.length + 2 && !(await surface(editor).evaluate((el) => el === document.activeElement))) { await page.keyboard.press('Tab'); presses += 1; }
  await expect(surface(editor)).toBeFocused(); // disabled tools (nothing to undo yet) are skipped, so this takes at most one press per tool
  expect(presses).toBeLessThanOrEqual(names.length);
});

test('after the text changed elsewhere the editor starts a fresh history (undo cannot resurrect the old text), and a dropped file never navigates the window away', async ({ page }) => {
  const editor = await startWith(page, 'Um.\n\nDois.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Dois.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(input).toHaveValue('Um.\n\nDois.!');
  await textButton(editor).click();
  await input.fill('Totalmente novo.\n\nOutro.');
  await visualButton(editor).click();
  await expect(surface(editor).locator('p').first()).toHaveText('Totalmente novo.');
  await surface(editor).click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  await expect(input).toHaveValue('Totalmente novo.\n\nOutro.'); // nothing of the previous text came back
  await expect(surface(editor).locator('p').first()).toHaveText('Totalmente novo.');

  // a file dropped on the text: no navigation; an image opens the details dialog, anything else is refused with a message
  const url = page.url();
  await surface(editor).evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'notas.txt', { type: 'text/plain' }));
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: r.x + 20, clientY: r.y + 20, bubbles: true, cancelable: true }));
  });
  await expect(editor.locator('.summary-toolbar-message[role="status"]').last()).toContainText('PNG, JPEG ou WebP');
  expect(page.url()).toBe(url);
  await surface(editor).evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'solto.png', { type: 'image/png' }));
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: r.x + 20, clientY: r.y + 20, bubbles: true, cancelable: true }));
  }, [...PIXEL_PNG]);
  await expect(page.locator('dialog.figure-details-dialog')).toBeVisible();
  await page.locator('dialog.figure-details-dialog .figure-dialog-cancel, dialog.figure-details-dialog button:has-text("Cancelar")').first().click();
  expect(page.url()).toBe(url);
});

// The save round trip takes time. Whatever the student types while it is in flight must survive it, in both editors.
async function holdSummarySave(page) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let reached;
  const arrived = new Promise((resolve) => { reached = resolve; });
  await page.route('**/v1/drafts/*/summary', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.continue(); return; }
    reached();
    await gate; // the request is held here: the server has not answered yet
    await route.continue();
  });
  return { arrived, release };
}

async function serverSummary(page, editor) {
  const id = await editor.getAttribute('data-draft-id');
  return page.evaluate(async ({ base, draftId }) => (await (await fetch(`${base}/v1/drafts/${draftId}`, { credentials: 'include' })).json()).draft.summary, { base: API_BASE, draftId: id });
}

test('typing in the text editor while the save is in flight is kept: the answer neither erases it nor marks it as saved', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  await input.fill('Base. Enviado.');
  const held = await holdSummarySave(page);
  await editor.locator('[data-action="save-summary"]').click();
  await held.arrived;
  await input.press('End');
  await input.pressSequentially(' Digitado durante o envio.');
  held.release();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  await expect(input).toHaveValue('Base. Enviado. Digitado durante o envio.'); // the newer text was not replaced by the saved one
  await expect(editor.locator('[data-action="save-summary"]')).toBeEnabled(); // and it is still unsaved
  await saveSummary(editor);
  expect(await serverSummary(page, editor)).toBe('Base. Enviado. Digitado durante o envio.');
});

test('typing in the visual editor while the save is in flight is kept as well', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Base.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Enviado.');
  await expect(input).toHaveValue('Base. Enviado.');
  const held = await holdSummarySave(page);
  await editor.locator('[data-action="save-summary"]').click();
  await held.arrived;
  await surface(editor).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Durante.');
  await expect(input).toHaveValue('Base. Enviado. Durante.'); // the newer text is already in the text while the answer is still on its way
  held.release();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  await expect(surface(editor)).toContainText('Base. Enviado. Durante.');
  await expect(input).toHaveValue('Base. Enviado. Durante.');
  await expect(editor.locator('[data-action="save-summary"]')).toBeEnabled();
  await saveSummary(editor);
  expect(await serverSummary(page, editor)).toBe('Base. Enviado. Durante.');
});

test('an edit the visual editor could not write is "unsaved" for every way out: Voltar asks first, and so do the preview and the acceptance', async ({ page }) => {
  const editor = await startWith(page, 'Um');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Um' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('(a)'); // "Um**(a)**" cannot be written back faithfully: the very first edit is already unwritable
  await expect(editor.locator('.summary-visual-notice')).toBeVisible();
  await expect(input).toHaveValue('Um'); // so the text never differs from the saved one: only the editor knows there is an edit
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled();

  await editor.locator('.source-draft-subject-input').fill('Fisiologia');
  await editor.locator('.source-draft-date-input').fill('2020-01-01');
  await editor.locator('[data-action="preview-accept"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Salve as alterações pendentes');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Salve as alterações pendentes');
  await expect(editor.locator('.lesson-accept-preview')).toBeHidden();

  let asked = '';
  page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
  await editor.locator('[data-action="lesson-back"]').click();
  expect(asked).toContain('alterações não salvas');
  await expect(editor).toBeVisible(); // the student stayed
  await expect(surface(editor)).toContainText('Um(a)'); // and the unwritten edit is still there to fix
});

test('pasted HTML that imitates the editor\'s own nodes: a malformed figure id becomes plain text, a well-formed foreign one is refused by the server on save, nothing leaks', async ({ page }) => {
  const editor = await startWith(page, 'Início.');
  const input = editor.locator('.lesson-summary-input');
  await visualButton(editor).click();
  await surface(editor).click();
  await page.keyboard.press('Control+End');
  const paste = (html, text) => surface(editor).evaluate((el, [h, t]) => {
    const data = new DataTransfer();
    data.setData('text/html', h);
    data.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [html, text]);

  await paste('<div data-figure-id="../../etc/passwd">falsa</div><span data-math="\href{http://evil.example}{x}">m</span>', 'falsa m');
  await expect(surface(editor).locator('figure.summary-figure')).toHaveCount(0);
  await expect(input).not.toHaveValue(/passwd|\[\[fig/);
  expect(outside).toEqual([]);

  // a well-formed id that is not the student's: it becomes a figure node in the editor, and the server refuses to save it
  await paste('<div data-figure-id="3f2c9a54-7b1d-4e0a-8c55-0d9e6a7b1c42">x</div>', '');
  await expect(input).toHaveValue(/\[\[fig:3f2c9a54-7b1d-4e0a-8c55-0d9e6a7b1c42\]\]/);
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).not.toContainText('Resumo salvo');
  expect(await serverSummary(page, editor)).toBe('Início.');
});

test('leaving the lesson with the visual editor open ends it cleanly: no script error, and a timer that was still pending does not fire into the closed screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const editor = await startWith(page, 'Texto.');
  await visualButton(editor).click();
  await surface(editor).locator('p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' pendente');
  page.once('dialog', (dialog) => dialog.accept()); // leaving with an unsaved change asks first
  await editor.locator('[data-action="lesson-back"]').click();
  await expect(page.locator('.lesson-editor')).toHaveCount(0);
  await page.waitForTimeout(700); // longer than the editor's own write-back delay
  expect(await page.locator('.summary-visual-content').count()).toBe(0);
  expect(errors).toEqual([]);
});
