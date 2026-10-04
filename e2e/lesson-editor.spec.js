import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// LESSON EDITOR (VALID-4 defect register): a draft is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, each its own area, each saved on
// its own, and the rest of the book is never a vertical continuation of the lesson being edited. Real server, FAKE provider:
// no model is ever called by this spec.

const SERVER_PORT = 13971;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const UI_WORDS = /Corrigir|Salvar|Ver trecho|Gerar rascunho|Aceitar e criar|Criar nova disciplina|Voltar às unidades/;

let serverProcess;
let dataDir;
let dbPath;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-lesson-'));
  dbPath = join(dataDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('lesson-editor E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
});

async function openLesson(page, name = 'aula.pdf') {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const pdf = buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']);
  await page.setInputFiles('#sources-file-input', { name, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
}

test('the draft opens as a lesson editor with four separate areas; the rest of the book is not part of it', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  await expect(page.locator('#sources-card')).toBeHidden();
  await expect(editor.locator('[role="tab"]')).toHaveText([/Resumo/, /Questões/, /Fonte/, /Revisão/]);
  await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText('Resumo');
  // nothing from the index/other units can live inside the editor
  await expect(editor.locator('.source-proposal-item')).toHaveCount(0);
  await expect(editor.locator('.source-topic-item')).toHaveCount(0);
  await expect(editor.locator('[data-action="generate-draft"]')).toHaveCount(0);
  await expect(editor.locator('[data-action="generate-topic"]')).toHaveCount(0);
  // each area is its own panel
  await expect(editor.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(1);
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await expect(editor.locator('.lesson-qitem')).toHaveCount(3);
  await editor.getByRole('tab', { name: /Fonte/ }).click();
  await expect(editor.locator('[data-panel="source"]')).toContainText('aula.pdf');
  await expect(editor.locator('[data-panel="source"]')).toContainText('exatamente a fonte aprovada');
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  await expect(editor.locator('[data-panel="review"]')).toBeVisible();
});

test('"Voltar às unidades" leaves the editor and shows the list again', async ({ page }) => {
  await openLesson(page);
  await page.locator('[data-action="lesson-back"]').click();
  await expect(page.locator('.lesson-editor')).toHaveCount(0);
  await expect(page.locator('#sources-card')).toBeVisible();
  await expect(page.locator('.source-proposal-item [data-action="open-draft"]').first()).toBeVisible();
});

test('saving the summary sends ONE request to the summary and touches no question', async ({ page }) => {
  await openLesson(page);
  const calls = [];
  page.on('request', (req) => { if (req.method() !== 'GET' && req.url().includes('/v1/drafts/')) calls.push(`${req.method()} ${new URL(req.url()).pathname.replace(/\/v1\/drafts\/\d+/, '/v1/drafts/:id')}`); });
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const before = await editor.locator('[data-part^="q"]').evaluateAll((els) => els.map((e) => e.value));
  await editor.getByRole('tab', { name: /Resumo/ }).click();
  const input = editor.locator('.lesson-summary-input');
  await input.fill('## Ideia central\nA filtração glomerular forma o ultrafiltrado.\n\n## Medida\nA inulina mede a TFG.');
  await expect(editor.locator('[data-action="save-summary"]')).toBeEnabled();
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  expect(calls).toEqual(['PATCH /v1/drafts/:id/summary']);
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const after = await editor.locator('[data-part^="q"]').evaluateAll((els) => els.map((e) => e.value));
  expect(after).toEqual(before);
});

test('saving ONE question changes only that question and shows immediately, with no reload', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  const summaryBefore = await editor.locator('.lesson-summary-input').inputValue();
  const calls = [];
  page.on('request', (req) => { if (req.method() !== 'GET' && req.url().includes('/v1/drafts/')) calls.push(`${req.method()} ${new URL(req.url()).pathname.replace(/\/v1\/drafts\/\d+/, '/v1/drafts/:id')}`); });

  await editor.getByRole('tab', { name: /Questões/ }).click();
  const list = editor.locator('.lesson-qitem');
  await list.nth(1).click();
  const answer = editor.locator('.lesson-qeditor textarea').nth(1);
  const otherBefore = [];
  await list.nth(0).click();
  otherBefore.push(await editor.locator('.lesson-qeditor textarea').nth(1).inputValue());
  await list.nth(2).click();
  otherBefore.push(await editor.locator('.lesson-qeditor textarea').nth(1).inputValue());

  await list.nth(1).click();
  await answer.fill('Resposta da questão 2 corrigida à mão');
  await expect(editor.locator('.lesson-qitem').nth(1)).toContainText('não salva');
  await editor.locator('[data-action="save-question"]').click();
  await expect(editor.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva');
  await expect(editor.locator('.lesson-qeditor textarea').nth(1)).toHaveValue('Resposta da questão 2 corrigida à mão');
  await expect(editor.locator('.lesson-qitem').nth(1)).not.toContainText('não salva');

  expect(calls).toEqual([expect.stringMatching(/^PATCH \/v1\/drafts\/:id\/questions\/q\d+$/)]);
  await list.nth(0).click();
  expect(await editor.locator('.lesson-qeditor textarea').nth(1).inputValue()).toBe(otherBefore[0]);
  await list.nth(2).click();
  expect(await editor.locator('.lesson-qeditor textarea').nth(1).inputValue()).toBe(otherBefore[1]);
  await editor.getByRole('tab', { name: /Resumo/ }).click();
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(summaryBefore);
});

test('a rejected question does not become an exercise when the lesson is accepted; the others do', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').nth(1).click();
  await editor.locator('[data-action="toggle-reject-question"]').click();
  await expect(editor.locator('.lesson-qitem').nth(1)).toContainText('Rejeitada');
  await expect(editor.locator('.lesson-accept-note')).toContainText('2 questões viram exercícios');
  await editor.locator('.source-draft-subject-input').fill('Fisiologia');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada: 2 exercício(s)', { timeout: 10000 });
});

test('unsaved typing is never lost silently: accepting asks to save first', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  await editor.locator('.lesson-summary-input').fill('Resumo alterado e ainda não salvo');
  await editor.locator('.source-draft-subject-input').fill('Fisiologia');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Salve as alterações pendentes');
});

test('COPY: the editable fields hold only pedagogical content, and the new-discipline control appears once', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  const summary = await editor.locator('.lesson-summary-input').inputValue();
  expect(summary).not.toMatch(UI_WORDS);
  await editor.getByRole('tab', { name: /Questões/ }).click();
  for (const value of await editor.locator('[data-part^="q"]').evaluateAll((els) => els.map((e) => e.value))) expect(value).not.toMatch(UI_WORDS);
  // chips are separate elements separated by real text: never "ConceitoSinalizada"
  for (const text of await editor.locator('.lesson-qitem').allTextContents()) expect(text).not.toMatch(/[a-zà-ú][A-ZÀ-Ú]/);
  expect(await editor.locator('.lesson-accept').getByText('Criar nova disciplina', { exact: true }).count()).toBeLessThanOrEqual(2);
  const options = await editor.locator('.source-draft-subject-select option').allTextContents();
  expect(options.filter((o) => /nova disciplina/i.test(o))).toHaveLength(1);
});

test('topic search finds a section by its heading and generates ONLY that section', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  const pdf = buildFixturePdf(['Fisiologia renal introdução', 'Filtração glomerular: barreira e forças', 'Clearance de inulina mede a TFG', 'Reabsorção tubular proximal']);
  await page.setInputFiles('#sources-file-input', { name: 'renal.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  // give the document an outline the way a real textbook has one (the fixture PDF has none)
  const db = new Database(dbPath);
  const source = db.prepare('SELECT id, user_id FROM sources ORDER BY id DESC LIMIT 1').get();
  const add = db.prepare('INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index) VALUES (?, ?, ?, ?, ?, ?)');
  [[1, 'Fisiologia renal', 1], [2, 'Filtração glomerular', 2], [2, 'Reabsorção tubular', 4]].forEach(([level, title, p], i) => add.run(source.user_id, source.id, i, level, title, p));
  db.close();

  await page.locator('#sources-topic-input').fill('filtração glomerular');
  await page.locator('#sources-topic-form button[type="submit"]').click();
  const hit = page.locator('.source-topic-item').first();
  await expect(hit).toContainText('Filtração glomerular');
  await expect(hit).toContainText('PDF páginas 2–3');
  await hit.locator('[data-action="generate-topic"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await page.locator('.lesson-editor').getByRole('tab', { name: /Fonte/ }).click();
  await expect(page.locator('.lesson-editor [data-panel="source"]')).toContainText('PDF páginas 2–3');
  await expect(page.locator('.lesson-editor [data-panel="source"]')).toContainText('exatamente a fonte aprovada');
  await page.locator('.lesson-editor').getByRole('tab', { name: /Questões/ }).click();
  await expect(page.locator('.lesson-editor .lesson-qitem')).toHaveCount(2); // pages 2 and 3 only
});

test('an unknown topic says so and offers the index instead of inventing a scope', async ({ page }) => {
  await openLesson(page);
  await page.locator('[data-action="lesson-back"]').click();
  await page.locator('#sources-topic-input').fill('assunto que não existe');
  await page.locator('#sources-topic-form button[type="submit"]').click();
  await expect(page.locator('#sources-message')).toContainText('Nenhuma seção');
  await expect(page.locator('.source-topic-item')).toHaveCount(0);
});

test('a processed document is reopened from "Documentos já enviados" without sending the PDF again, and its draft opens in the editor', async ({ page }) => {
  await openLesson(page, 'reaberto.pdf');
  await page.locator('[data-action="lesson-back"]').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  const existing = page.locator('#sources-existing-list .source-existing-item', { hasText: 'reaberto.pdf' });
  await expect(existing).toBeVisible({ timeout: 10000 });
  await existing.locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.lesson-editor .lesson-summary-input')).not.toHaveValue('');
});
