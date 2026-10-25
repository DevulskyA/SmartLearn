import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// The Resumo Mestre as a word processor: the student opens a formatted page (visual editor by default) and edits text, tables, formulas and
// figures directly, never Markdown, LaTeX or identifiers. The textarea stays the stored text; the fidelity of the conversion is proven in
// test/summary-doc.test.js and here from the screen.

const SERVER_PORT = serverPort(13941);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-wysiwyg-'));
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

const PAGE_TEXT = '## Fisiologia renal\n\nA filtração é **rápida** e *seletiva* com \\(TFG = U / P\\).\n\n> A barreira filtra por tamanho.\n\n| Fase | Efeito |\n|---|---|\n| Filtração | sobe |\n\n- primeiro\n- segundo\n\n```\nTFG = U * V / P\n```\n\nFim.';

// the text a student READS on the page: everything visible except the literal code block and the hidden accessibility copy of formulas
const readableText = (editor) => surface(editor).evaluate((root) => {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('pre, .katex-mathml').forEach((el) => el.remove());
  return copy.innerText;
});

test('a new student opens the Resumo Mestre in the visual editor: a formatted page, not the text', async ({ page }) => {
  const editor = await openDraft(page);
  await expect(visualButton(editor)).toHaveAttribute('aria-pressed', 'true');
  await expect(surface(editor)).toBeVisible();
  await expect(editor.locator('.lesson-summary-input')).toBeHidden();
  await expect(editor.locator('.summary-visual-toolbar')).toBeVisible();
  await textButton(editor).click(); // the text mode stays available as the advanced option
  await expect(editor.locator('.lesson-summary-input')).toBeVisible();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'aula.pdf' }).locator('[data-action="open-source"]').click();
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(textButton(editor)).toHaveAttribute('aria-pressed', 'true'); // an explicit choice is respected from then on
});

test('the page shows formatting, never Markdown, LaTeX or internal identifiers; opening and closing it changes not one byte', async ({ page }) => {
  const editor = await startWith(page, PAGE_TEXT);
  const input = editor.locator('.lesson-summary-input');
  await expect(surface(editor).locator('h2')).toHaveText('Fisiologia renal');
  await expect(surface(editor).locator('strong')).toHaveText('rápida');
  await expect(surface(editor).locator('em')).toHaveText('seletiva');
  await expect(surface(editor).locator('blockquote')).toContainText('A barreira filtra por tamanho.');
  await expect(surface(editor).locator('table tr')).toHaveCount(2);
  await expect(surface(editor).locator('table th')).toHaveCount(2);
  await expect(surface(editor).locator('.katex')).toHaveCount(1);
  await expect(surface(editor).locator('pre')).toContainText('TFG = U * V / P'); // literal code is the one place where such characters are intended
  await expect(surface(editor).locator('li')).toHaveCount(2);
  const reading = await readableText(editor);
  for (const syntax of ['##', '**', '|---', '| Fase', '\\(', '\\[', '[[fig:', '> A barreira', '```', '- primeiro']) expect(reading, syntax).not.toContain(syntax);
  await surface(editor).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await editor.locator('[data-action="save-summary"]').focus();
  await expect(input).toHaveValue(PAGE_TEXT);
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled();
  expect(outside).toEqual([]);
});

test('tables are real tables: cells are edited in place, rows and columns added and removed, a new table inserted; the text follows, and it survives save and reopen', async ({ page }) => {
  const editor = await startWith(page, 'Antes.\n\n| Fase | Efeito |\n|---|---|\n| Filtração | sobe |\n\nDepois.');
  const input = editor.locator('.lesson-summary-input');
  const cell = (text) => surface(editor).locator('td, th').filter({ hasText: new RegExp(`^${text}$`) });

  await expect(editor.locator('[data-visual="rowAfter"]')).toBeHidden(); // the table tools appear only inside a table
  await cell('sobe').click();
  await expect(editor.locator('[data-visual="rowAfter"]')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.type(' muito');
  await expect(input).toHaveValue('Antes.\n\n| Fase | Efeito |\n| --- | --- |\n| Filtração | sobe muito |\n\nDepois.');

  await editor.locator('[data-visual="rowAfter"]').click();
  await page.keyboard.type('Reabsorção');
  await page.keyboard.press('Tab');
  await page.keyboard.type('desce');
  await expect(surface(editor).locator('table tr')).toHaveCount(3);
  await expect(input).toHaveValue('Antes.\n\n| Fase | Efeito |\n| --- | --- |\n| Filtração | sobe muito |\n| Reabsorção | desce |\n\nDepois.');

  await editor.locator('[data-visual="colAfter"]').click();
  await expect(surface(editor).locator('table tr').first().locator('th')).toHaveCount(3);
  await page.keyboard.press('Tab'); // into the new column, so that is the one deleted below
  await editor.locator('[data-visual="colDelete"]').click();
  await expect(surface(editor).locator('table tr').first().locator('th')).toHaveCount(2);

  await saveSummary(editor);
  await reopenDraft(page, editor);
  await expect(surface(editor).locator('table tr')).toHaveCount(3);
  await expect(cell('desce')).toHaveCount(1);

  // a new table where the caret is
  await surface(editor).locator('p', { hasText: 'Depois.' }).click();
  await page.keyboard.press('End');
  await editor.locator('[data-visual="table"]').click();
  await expect(surface(editor).locator('table')).toHaveCount(2);
  await page.keyboard.type('Dose');
  await expect(input).toHaveValue(/\| Dose \| {2}\| {2}\|\n\| --- \| --- \| --- \|/);
  expect(outside).toEqual([]);
});

test('markdown with no visual form is preserved and shown as such, with a clear way to edit it in the text mode', async ({ page }) => {
  const source = 'Antes.\n\n    bloco recuado\n    segunda linha\n\nDepois.';
  const editor = await startWith(page, source);
  const input = editor.locator('.lesson-summary-input');
  const raw = surface(editor).locator('.summary-raw');
  await expect(raw).toBeVisible();
  await expect(raw).toContainText('Trecho preservado');
  await expect(input).toHaveValue(source);
  await raw.getByRole('button', { name: 'Editar no código-fonte' }).click();
  await expect(input).toBeVisible();
  await expect.poll(() => input.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('    bloco recuado\n    segunda linha');
  await expect(visualButton(editor)).toHaveAttribute('aria-pressed', 'false');
});

test('the toolbar: every command is separate, named, large enough and reachable by keyboard; groups are labelled', async ({ page }) => {
  const editor = await startWith(page, PAGE_TEXT);
  const toolbar = editor.locator('.summary-visual-toolbar');
  const buttons = toolbar.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(12);
  const visible = [];
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const name = await button.getAttribute('aria-label');
    expect(name, `button ${i} has an accessible name`).toBeTruthy();
    const box = await button.boundingBox();
    expect(box.width, name).toBeGreaterThanOrEqual(44);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    visible.push({ name, ...box });
  }
  // no two commands overlap or touch
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i];
      const b = visible[j];
      const apart = a.x + a.width + 2 <= b.x || b.x + b.width + 2 <= a.x || a.y + a.height + 2 <= b.y || b.y + b.height + 2 <= a.y;
      expect(apart, `${a.name} and ${b.name} are visibly separate`).toBeTruthy();
    }
  }
  const groups = toolbar.locator('[role="group"]');
  for (let i = 0; i < (await groups.count()); i += 1) await expect(groups.nth(i)).toHaveAttribute('aria-label', /.+/);

  // one tab stop for the whole toolbar; the arrows move inside it
  await surface(editor).locator('p', { hasText: 'Fim.' }).click();
  await toolbar.locator('button:not([disabled]), select:not([disabled])').first().focus();
  const first = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  expect(second).not.toBe(first);
  await page.keyboard.press('End');
  const last = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  expect(last).toBeTruthy();
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe(first);
  expect(await toolbar.locator('button[tabindex="0"], select[tabindex="0"]').count()).toBe(1);

  // narrow window: the commands wrap, nothing is cut off and the page does not scroll sideways
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(toolbar).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const edge = await toolbar.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(edge).toBeLessThanOrEqual(1);
});

test('formatting is applied directly to the text and the style list changes the block', async ({ page }) => {
  const editor = await startWith(page, 'Um parágrafo simples.');
  const input = editor.locator('.lesson-summary-input');
  await surface(editor).locator('p').click();
  await editor.locator('[data-visual="style"]').selectOption('2');
  await expect(surface(editor).locator('h2')).toHaveText('Um parágrafo simples.');
  await expect(input).toHaveValue('## Um parágrafo simples.');
  await editor.locator('[data-visual="style"]').selectOption('p');
  await page.keyboard.press('End');
  await page.keyboard.type(' Mais.');
  await page.keyboard.press('Shift+Home');
  await editor.locator('[data-visual="italic"]').click();
  await expect(surface(editor).locator('em')).toHaveCount(1);
  await surface(editor).locator('p').click();
  await editor.locator('[data-visual="quote"]').click();
  await expect(surface(editor).locator('blockquote')).toHaveCount(1);
  await expect(input).toHaveValue(/^> /);
  await editor.locator('[data-visual="quote"]').click();
  await expect(surface(editor).locator('blockquote')).toHaveCount(0);
});
