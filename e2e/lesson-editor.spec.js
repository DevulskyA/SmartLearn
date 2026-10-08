import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// LESSON EDITOR (VALID-4 defect register): a draft is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, each its own area, each saved on
// its own, and the rest of the book is never a vertical continuation of the lesson being edited. Real server, FAKE provider:
// no model is ever called by this spec.

const SERVER_PORT = serverPort(13971);
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
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
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
  await signInRegistered(page, { email: email, password: password });
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

test('PREVIEW before accepting: shows what will be created, writes nothing, is dropped when the lesson changes, and matches the real acceptance', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').nth(1).click();
  await editor.locator('[data-action="toggle-reject-question"]').click();
  await expect(editor.locator('.lesson-accept-note')).toContainText('2 questões viram exercícios');
  await editor.locator('.source-draft-subject-input').fill('Fisiologia');

  const db = new Database(dbPath, { readonly: true });
  const rows = () => ({ units: db.prepare('SELECT COUNT(*) AS n FROM learning_units').get().n, exercises: db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n, subjects: db.prepare('SELECT COUNT(*) AS n FROM subjects').get().n });
  const before = rows();
  try {
    await editor.locator('[data-action="preview-accept"]').click();
    const panel = editor.locator('.lesson-accept-preview');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Disciplina: Fisiologia (será criada)');
    await expect(panel).toContainText('2 exercícios e 16 revisões agendadas');
    await expect(panel).toContainText('Ficam de fora (rejeitadas): 1');
    await expect(panel.locator('.lesson-accept-preview-exercises li')).toHaveCount(2);
    await expect(panel).toBeFocused();
    expect(rows(), 'the preview wrote nothing').toEqual(before);

    // the lesson changes -> the preview no longer describes it and is dropped
    await editor.locator('.lesson-qitem').nth(1).click();
    await editor.locator('[data-action="toggle-reject-question"]').click();
    await expect(panel).toBeHidden();
    await expect(editor.locator('.lesson-accept-note')).toContainText('3 questões viram exercícios');

    await editor.locator('[data-action="preview-accept"]').click();
    await expect(panel.locator('.lesson-accept-preview-exercises li')).toHaveCount(3);
    await editor.locator('[data-action="accept-draft"]').click();
    await expect(editor.locator('.source-draft-result')).toContainText('Aula criada: 3 exercício(s)', { timeout: 10000 });
  } finally { db.close(); }
});

test('PREVIEW refuses what accepting refuses, with the server message and no panel', async ({ page }) => {
  await openLesson(page);
  const editor = page.locator('.lesson-editor');
  await editor.locator('[data-action="preview-accept"]').click(); // a new subject without a name
  await expect(editor.locator('.lesson-accept-preview')).toBeHidden();
  await expect(editor.locator('.source-draft-result')).toHaveClass(/is-error/);
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

test('RELOAD: a saved question and a saved summary survive a full page reload; untouched questions are unchanged', async ({ page }) => {
  await openLesson(page, 'recarga.pdf');
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const list = editor.locator('.lesson-qitem');
  const answers = async () => {
    const out = [];
    for (let i = 0; i < await list.count(); i += 1) { await list.nth(i).click(); out.push(await editor.locator('.lesson-qeditor textarea').nth(1).inputValue()); }
    return out;
  };
  const before = await answers();
  await list.nth(1).click();
  await editor.locator('.lesson-qeditor textarea').nth(1).fill('Resposta 2 persistida');
  await editor.locator('[data-action="save-question"]').click();
  await expect(editor.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva');
  await editor.getByRole('tab', { name: /Resumo/ }).click();
  await editor.locator('.lesson-summary-input').fill('Resumo persistido após recarga');
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');

  await page.locator('[data-action="lesson-back"]').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'recarga.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(editor.locator('.lesson-summary-input')).toHaveValue('Resumo persistido após recarga');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const after = await answers();
  expect(after[1]).toBe('Resposta 2 persistida');
  expect(after.filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));
});

test('a draft in progress is listed under "Rascunhos em andamento", outside the index, and opens the editor', async ({ page }) => {
  await openLesson(page, 'andamento.pdf');
  await page.locator('[data-action="lesson-back"]').click();
  const box = page.locator('#sources-drafts');
  await expect(box).toBeVisible();
  await expect(box.locator('.source-draft-item')).toHaveCount(1);
  await expect(page.locator('#sources-index').locator('#sources-drafts')).toHaveCount(0);
  await box.getByRole('button', { name: /Abrir rascunho/ }).click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.lesson-editor .lesson-summary-input')).not.toHaveValue('');
});

test('a legacy draft (no stored scope) still names its document and pages in the Fonte tab', async ({ page }) => {
  await openLesson(page, 'legado.pdf');
  await page.locator('[data-action="lesson-back"]').click();
  const db = new Database(dbPath);
  try {
    for (const row of db.prepare('SELECT id, draft_json FROM generated_drafts').all()) {
      const content = JSON.parse(row.draft_json);
      delete content.sourceScope;
      db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), row.id);
    }
  } finally { db.close(); }
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'legado.pdf' }).locator('[data-action="open-source"]').click();
  await page.locator('#sources-drafts').getByRole('button', { name: /Abrir rascunho/ }).first().click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.getByRole('tab', { name: /Fonte/ }).click();
  const panel = editor.locator('[data-panel="source"]');
  await expect(panel).toContainText('antes de o escopo da fonte');
  await expect(panel).toContainText('Documento');
  await expect(panel).toContainText('legado.pdf');
  await expect(panel).toContainText('Páginas da unidade');
});

test('T-F2-03: a draft audited by older rules says so on open (nothing written); "Reauditar" updates only the audit and reports what changed', async ({ page }) => {
  await openLesson(page, 'regras.pdf');
  await page.locator('[data-action="lesson-back"]').click();
  const db = new Database(dbPath);
  let before;
  try {
    for (const row of db.prepare('SELECT id, draft_json FROM generated_drafts').all()) {
      const content = JSON.parse(row.draft_json);
      if (content.audit) {
        delete content.audit.rulesVersion;
        delete content.audit.auditedAt;
        content.audit.findings = [{ issue: 'REGRA_ANTIGA', severity: 'LOW', scope: 'summary', generatedClaim: 'x', sourceEvidence: 'y', repair: 'z', source: 'DETERMINISTIC' }];
      }
      db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), row.id);
    }
    before = db.prepare('SELECT id, draft_json, revision FROM generated_drafts ORDER BY id DESC LIMIT 1').get();
  } finally { db.close(); }
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'regras.pdf' }).locator('[data-action="open-source"]').click();
  await page.locator('#sources-drafts').getByRole('button', { name: /Abrir rascunho/ }).first().click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  const review = editor.locator('[data-panel="review"]');
  await expect(review).toContainText('Auditoria com regras antigas');
  const reread = new Database(dbPath, { readonly: true });
  try { expect(reread.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(before.id).draft_json).toBe(before.draft_json); } finally { reread.close(); }
  await review.getByRole('button', { name: 'Reauditar' }).click();
  await expect(review.locator('.lesson-message')).toContainText('Auditoria atualizada com as regras atuais', { timeout: 10000 });
  await expect(review.locator('.lesson-message')).toContainText('1 ponto removido');
  await expect(review.getByRole('button', { name: 'Reauditar' })).toHaveCount(0);
  await expect(review.locator('.lesson-message')).toBeFocused();
  const check = new Database(dbPath, { readonly: true });
  try {
    const after = check.prepare('SELECT draft_json, revision FROM generated_drafts WHERE id = ?').get(before.id);
    const { audit: _a, ...restBefore } = JSON.parse(before.draft_json);
    const { audit, ...restAfter } = JSON.parse(after.draft_json);
    expect(restAfter).toEqual(restBefore);
    expect(after.revision).toBe(before.revision);
    expect(audit.rulesVersion).toBeTruthy();
  } finally { check.close(); }
});

test('at a typical Desktop window width (800 px, sidebar included) the question editor stacks under the list and stays comfortable', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 650 });
  await openLesson(page, 'janela.pdf');
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').first().click();
  const list = await editor.locator('.lesson-qlist').boundingBox();
  const form = await editor.locator('.lesson-qeditor').boundingBox();
  const field = await editor.locator('.lesson-qeditor textarea').nth(1).boundingBox();
  expect(form.y).toBeGreaterThanOrEqual(list.y + list.height - 2); // stacked: the editor starts below the list
  expect(field.width).toBeGreaterThanOrEqual(300); // wide enough to read and edit a sentence
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a critical finding stops the acceptance until the reviewer resolves it: question accepted by hand, summary confirmed against the source', async ({ page }) => {
  await openLesson(page, 'critico.pdf');
  await page.locator('[data-action="lesson-back"]').click();
  const db = new Database(dbPath);
  try {
    for (const row of db.prepare('SELECT id, draft_json FROM generated_drafts').all()) {
      const content = JSON.parse(row.draft_json);
      const finding = (scope) => ({ issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope, generatedClaim: 'x', sourceEvidence: 'y', repair: 'z', source: 'MODEL' });
      content.audit = { ...(content.audit ?? {}), result: 'REPAIR', findings: [finding('summary'), finding('question:0')] };
      db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), row.id);
    }
  } finally { db.close(); }
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'critico.pdf' }).locator('[data-action="open-source"]').click();
  await page.locator('#sources-drafts').getByRole('button', { name: /Abrir rascunho/ }).first().click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.locator('.source-draft-subject-input').fill('Fisiologia');

  // the question with a critical point is still undecided: refused, nothing created
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Não dá para aceitar ainda', { timeout: 10000 });

  // the reviewer accepts that question by hand; the summary point is still unconfirmed
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').first().click();
  await editor.locator('[data-action="accept-question"]').click();
  await expect(editor.locator('[data-action="accept-question"]')).toBeDisabled();
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('resumo', { timeout: 10000 });
  await expect(editor.locator('[data-action="ack-summary-findings"]')).toBeVisible();

  // confirming the summary against the source releases it
  await editor.locator('[data-action="ack-summary-findings"]').check();
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
});

test('the summary says which sentences have a confirmed passage of the source, and lists the ones that do not', async ({ page }) => {
  await openLesson(page, 'trecho.pdf');
  const editor = page.locator('.lesson-editor');
  const grounding = editor.locator('[data-part="summary-grounding"]');
  await expect(grounding).toBeVisible();
  await expect(grounding.locator('.summary-grounding-line')).toContainText(/Trecho da fonte confirmado em \d+ de \d+ frases do resumo/);
});
