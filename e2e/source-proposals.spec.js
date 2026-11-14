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

import { generateByPages } from './support/materials-flow.js';
// T36: proves the real inspection UI (src/source-proposals-ui.js, wired
// into a new "Fontes" card on Configurações) drives the actual T34-T36
// server pipeline end to end — upload -> extract -> chunk -> inspect ->
// manually correct a title — with NOTHING in the real learning domain
// (subjects/units/exercises) ever created by this flow. Same real-
// server-child-process + REMOTE_MODE pattern as e2e/feature-parity.spec.js.

const SERVER_PORT = serverPort(13964);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-proposals-'));
  const dbPath = join(dataDir, 'e2e.db');
  const sourcesDir = join(dataDir, 'sources');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_SOURCES_DIR: sourcesDir,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'source-proposals E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  // PV1-01: Materiais (this same "Fontes" pipeline) is now exclusive to
  // LOCAL_DESKTOP_AUTHORITY, relocated out of Configurações — see
  // e2e/local-authority.spec.js for the origin of this init-script pattern.
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `proposals-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

test('uploading a real PDF through the Fontes card opens it on the page range and creates nothing in the learning domain', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const pdfBuffer = buildFixturePdf([
    'Introdução à fisiologia renal',
    'Segunda página com conteúdo diferente',
    'Terceira e última página do documento',
  ]);
  await page.setInputFiles('#sources-file-input', {
    name: 'fisiologia-renal.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  // The document is open on the page range; no automatic slicing of it is offered.
  await expect(page.locator('#sources-range-form')).toBeVisible();

  // Nothing in the real learning domain was ever created by this flow.
  const domainCheck = await page.evaluate(async (base) => {
    const [units, subjects] = await Promise.all([
      fetch(`${base}/v1/learning-units`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${base}/v1/subjects`, { credentials: 'include' }).then((r) => r.json()),
    ]);
    return { unitsLen: units.units?.length ?? 0, subjectsLen: subjects.subjects?.length ?? 0 };
  }, API_BASE);
  expect(domainCheck.unitsLen).toBe(0);
  expect(domainCheck.subjectsLen).toBe(0);
});

// SCANNED-1: the student learns which pages did NOT become material, and what to do when nothing could be read.
test('SCANNED-1: a PDF with a page that has no text says which page was left out and that the summary does not cover it', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const pdfBuffer = buildFixturePdf(['Farmacocinética: absorção e distribuição', 'figura sem texto', 'Farmacodinâmica: receptores e afinidade'], { emptyPages: [2] });
  await page.setInputFiles('#sources-file-input', { name: 'misto.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await expect(page.locator('#sources-message')).toContainText('1 página sem texto extraível (p. 2)');
  await expect(page.locator('#sources-message')).toContainText('O resumo não cobre essa página');
  await expect(page.locator('#sources-message')).not.toHaveClass(/is-error/);
});

test('SCANNED-1: a PDF that is only images explains the two ways forward instead of stopping at "sem texto"', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const pdfBuffer = buildFixturePdf(['a', 'b'], { emptyPages: [1, 2] });
  await page.setInputFiles('#sources-file-input', { name: 'escaneado.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await expect(page.locator('#sources-message')).toContainText('apenas imagem', { timeout: 10000 });
  await expect(page.locator('#sources-message')).toContainText('texto selecionável');
  await expect(page.locator('#sources-message')).toContainText('criar a aula à mão');
  await expect(page.locator('#sources-message')).toHaveClass(/is-error/);
});

test('SCANNED-2: the note about skipped pages stays next to the proposals while they are on screen, and goes away with the next upload', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const mixed = buildFixturePdf(['Farmacocinética: absorção e distribuição', 'figura sem texto', 'Farmacodinâmica: receptores e afinidade'], { emptyPages: [2] });
  await page.setInputFiles('#sources-file-input', { name: 'misto.pdf', mimeType: 'application/pdf', buffer: mixed });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  const note = page.locator('#sources-coverage-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('1 página sem texto extraível (p. 2)');

  // the status line is overwritten by the very next action; the coverage note must not be
  await page.locator('#sources-range-start').fill('1');
  await page.locator('#sources-range-end').fill('1');
  await page.locator('#sources-range-form [type="submit"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-action="lesson-back"]').click();
  await expect(note).toBeVisible();
  await expect(note).toContainText('O resumo não cobre essa página');

  // a PDF with every page readable leaves no stale warning behind
  const clean = buildFixturePdf(['Anatomia: sistema nervoso central']);
  await page.setInputFiles('#sources-file-input', { name: 'limpo.pdf', mimeType: 'application/pdf', buffer: clean });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await expect(note).toBeHidden();
});

// T-F4-03 (R-06 AC-06.3, F-32/F-33)
const TWO_UNITS = buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos'], { outline: [{ title: 'Filtração', page: 1 }, { title: 'Barreira', page: 2 }] });

test('PBC-2.2: discarding an unfinished draft asks twice; cancelling at either question keeps it, only the second yes removes it', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'descartar.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await generateByPages(page, { from: 1, to: 1 });
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-action="lesson-back"]').click();

  const drafts = page.locator('#sources-drafts');
  const discard = drafts.locator('[data-action="discard-draft"]');
  await expect(discard).toHaveCount(1);
  const dialog = page.locator('#confirm-dialog');

  // cancel at the first question: nothing happens
  await discard.click();
  await expect(dialog).toBeVisible();
  await page.locator('#confirm-dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(discard).toHaveCount(1);

  // yes at the first, cancel at the second (a different question): still nothing happens
  await discard.click();
  await expect(page.locator('#confirm-dialog-message')).toContainText('Descartar o rascunho');
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#confirm-dialog-message')).toContainText('Confirma mesmo?');
  await page.locator('#confirm-dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(discard).toHaveCount(1);

  // yes twice: the draft is gone
  await discard.click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#confirm-dialog-message')).toContainText('Confirma mesmo?');
  await page.locator('#confirm-dialog-ok').click();
  await expect(drafts.locator('[data-action="discard-draft"]')).toHaveCount(0, { timeout: 10000 });
});

test('F-32: "Rascunhos em andamento" comes BEFORE the topic search when a draft exists; with none it stays out of the way', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'ordem.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  // no draft yet: the block is not there and the search is the first thing of the panel
  await expect(page.locator('#sources-drafts')).toBeHidden();
  await expect(page.locator('#sources-topic-form')).toBeVisible();

  await generateByPages(page, { from: 1, to: 1 });
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-action="lesson-back"]').click();

  const drafts = page.locator('#sources-drafts');
  await expect(drafts).toBeVisible();
  const order = await page.evaluate(() => {
    const d = document.querySelector('#sources-drafts');
    const form = document.querySelector('#sources-topic-form');
    return {
      beforeSearch: Boolean(d.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING),
      draftsTop: d.getBoundingClientRect().top,
      searchTop: form.getBoundingClientRect().top,
    };
  });
  expect(order.beforeSearch).toBe(true);
  expect(order.draftsTop).toBeLessThan(order.searchTop);
});

test('page range: type "de/até" once instead of picking pages one by one; a reversed range is refused, a valid one opens the draft', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'intervalo.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-range-form')).toBeVisible({ timeout: 10000 });
  // pages come first, title search second
  const pagesFirst = await page.evaluate(() => Boolean(document.querySelector('#sources-range-form').compareDocumentPosition(document.querySelector('#sources-topic-form')) & Node.DOCUMENT_POSITION_FOLLOWING));
  expect(pagesFirst).toBe(true);
  await page.locator('#sources-range-start').fill('2');
  await page.locator('#sources-range-end').fill('1');
  await page.locator('#sources-range-form [type="submit"]').click();
  await expect(page.locator('#sources-message')).toContainText(/não pode vir antes/);
  await page.locator('#sources-range-start').fill('1');
  await page.locator('#sources-range-end').fill('1');
  await page.locator('#sources-range-form [type="submit"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
});

test('PBC-2.1: clicking the NAME of a material in the library opens it like the "Abrir" button; selecting the name text does not', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'abrir-pelo-nome.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-range-form')).toBeVisible({ timeout: 10000 });
  await page.locator('#sources-back').click();
  const item = page.locator('.source-existing-item', { hasText: 'abrir-pelo-nome.pdf' });
  await expect(item).toBeVisible();

  // a text selection on the name is not a click: the library stays
  await item.locator('.sl-source-identity').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await item.locator('.sl-source-identity').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#sources-open-bar')).toBeHidden();

  // a plain click on the name opens the material
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await item.locator('.sl-source-identity').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#sources-open-bar')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#sources-open-title')).toHaveText('abrir-pelo-nome.pdf');
  await expect(page.locator('#sources-range-form')).toBeVisible();
});

test('one thing at a time: an open material hides the library, "Voltar à biblioteca" brings it back, and leaving Materiais lands on the library', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'um-de-cada-vez.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-range-form')).toBeVisible({ timeout: 10000 });
  // open material: only it is on screen (name, back link, page range); the library and its heading are out of the way
  await expect(page.locator('#sources-open-bar')).toBeVisible();
  await expect(page.locator('#sources-open-title')).toHaveText('um-de-cada-vez.pdf');
  await expect(page.locator('#sources-range-form')).toBeVisible();
  await expect(page.locator('#sources-existing')).toBeHidden();
  await expect(page.locator('.sl-library-heading')).toBeHidden();
  // back to the library: the material is listed, nothing of the open one remains
  await page.locator('#sources-back').click();
  await expect(page.locator('#sources-open-bar')).toBeHidden();
  await expect(page.locator('#sources-proposals-panel')).toBeHidden();
  await expect(page.locator('.source-existing-item', { hasText: 'um-de-cada-vez.pdf' })).toBeVisible();
  // open it again from the library, leave Materiais and return: it lands on the library, not on the open material
  await page.locator('.source-existing-item', { hasText: 'um-de-cada-vez.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-range-form')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-open-bar')).toBeHidden();
  await expect(page.locator('.source-existing-item', { hasText: 'um-de-cada-vez.pdf' })).toBeVisible();
});
