import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('source-proposals E2E: real server did not become ready in time');
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
  const email = `proposals-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

test('uploading a real PDF through the Fontes card produces inspectable proposals attributable to exact pages, and a title can be manually corrected', async ({ page }) => {
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

  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const items = page.locator('.source-proposal-item');
  // Default chunking groups up to 10 pages per proposal (design.md §8) —
  // this 3-page fixture stays entirely within one proposal.
  await expect(items).toHaveCount(1, { timeout: 5000 });

  const firstItem = items.nth(0);
  await expect(firstItem.locator('.source-proposal-range')).toHaveText('Páginas 1–3');

  // Inspection: the excerpt must be the exact original source text, not a
  // fabricated summary — nothing has been generated yet at this task.
  await firstItem.locator('[data-action="toggle-proposal-excerpt"]').click();
  await expect(firstItem.locator('.source-proposal-excerpt')).toHaveText(
    'Introdução à fisiologia renal\n\nSegunda página com conteúdo diferente\n\nTerceira e última página do documento',
    { timeout: 5000 },
  );

  // Manual correction before acceptance.
  const titleInput = firstItem.locator('.source-proposal-title-input');
  await titleInput.fill('Fisiologia renal: aula revisada');
  await firstItem.locator('[data-action="save-proposal-title"]').click();
  await expect(firstItem.getByRole('status')).toHaveText('Título salvo', { timeout: 5000 });

  // Confirm the correction actually persisted server-side, not just in the DOM.
  const proposalId = await firstItem.getAttribute('data-proposal-id');
  const persisted = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/proposals/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: proposalId });
  expect(persisted.proposal.title).toBe('Fisiologia renal: aula revisada');

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
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
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
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const note = page.locator('#sources-coverage-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('1 página sem texto extraível (p. 2)');

  // the status line is overwritten by the very next action; the coverage note must not be
  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="save-proposal-title"]').click();
  await expect(item.getByRole('status')).toHaveText('Título salvo', { timeout: 8000 });
  await expect(note).toBeVisible();
  await expect(note).toContainText('O resumo não cobre essa página');

  // a PDF with every page readable leaves no stale warning behind
  const clean = buildFixturePdf(['Anatomia: sistema nervoso central']);
  await page.setInputFiles('#sources-file-input', { name: 'limpo.pdf', mimeType: 'application/pdf', buffer: clean });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await expect(note).toBeHidden();
});

// T-F4-03 (R-06 AC-06.3, F-32/F-33)
const TWO_UNITS = buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos'], { outline: [{ title: 'Filtração', page: 1 }, { title: 'Barreira', page: 2 }] });

test('F-32: "Rascunhos em andamento" comes BEFORE the topic search when a draft exists; with none it stays out of the way', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'ordem.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  // no draft yet: the block is not there and the search is the first thing of the panel
  await expect(page.locator('#sources-drafts')).toBeHidden();
  await expect(page.locator('#sources-topic-form')).toBeVisible();

  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-action="lesson-back"]').click();

  const drafts = page.locator('#sources-drafts');
  await expect(drafts).toBeVisible();
  const order = await page.evaluate(() => {
    const d = document.querySelector('#sources-drafts');
    const form = document.querySelector('#sources-topic-form');
    const index = document.querySelector('#sources-index');
    return {
      beforeSearch: Boolean(d.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeIndex: Boolean(d.compareDocumentPosition(index) & Node.DOCUMENT_POSITION_FOLLOWING),
      draftsTop: d.getBoundingClientRect().top,
      searchTop: form.getBoundingClientRect().top,
    };
  });
  expect(order.beforeSearch).toBe(true);
  expect(order.beforeIndex).toBe(true);
  expect(order.draftsTop).toBeLessThan(order.searchTop);
});

test('F-33: "Salvar título" confirms with "Título salvo" in a role=status next to the field, keeps the focus, and the confirmation clears when the title is edited again', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'salvar.pdf', mimeType: 'application/pdf', buffer: TWO_UNITS });
  await expect(page.locator('.source-proposal-item')).toHaveCount(2, { timeout: 10000 });
  await page.locator('#sources-index').evaluate((el) => { el.open = true; });
  const item = page.locator('.source-proposal-item').first();
  const status = item.getByRole('status');
  await expect(status).toHaveCount(1); // the live region exists BEFORE the save, so the announcement is not lost
  await expect(status).toHaveText('');
  await item.locator('.source-proposal-title-input').fill('Filtração glomerular revisada');
  const save = item.locator('[data-action="save-proposal-title"]');
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Título salvo', { timeout: 5000 });
  await expect(status).toBeVisible();
  await expect(save).toBeFocused();
  // a second item is untouched
  await expect(page.locator('.source-proposal-item').nth(1).getByRole('status')).toHaveText('');
  const axe = await new AxeBuilder({ page }).include('#sources-card').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
  // editing again withdraws a confirmation that no longer describes the field
  await item.locator('.source-proposal-title-input').fill('Outro título');
  await expect(status).toHaveText('');
});
