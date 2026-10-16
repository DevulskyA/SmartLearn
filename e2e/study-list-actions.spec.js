import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// CHARACTERIZATION of the saved-studies list ("Gerenciar estudos" in Cadastro): the one click handler on #study-list in src/app.js
// dispatches on data-action. This spec pins what each action does TODAY, through the real UI, against a real server (and, for the one
// outcome the server mode cannot produce, against the local browser store), so that moving each action into its own function
// cannot change a message, a focus target, a request or what is persisted without failing here.
//
// Actions covered: toggle-exercises, add-exercise, delete-exercise, edit-exercise, save-exercise-edit, cancel-exercise-edit,
// edit-study, cancel-study, save-study (9 of the 9 the handler dispatches).

const SERVER_PORT = serverPort(13953);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-study-list-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('study-list-actions E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// the server tests run in remote mode with a registered account; the local-store test at the end opts out of the sign-in
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith('LOCAL STORE')) return;
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `studylist-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

/** Creates a study through the Cadastro form (creating the subject first when `subject` is given) and returns its row's id. */
async function createStudy(page, { subject, date, source = '', content }) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  if (subject) {
    await page.locator('#show-subject-form').click();
    await page.locator('#new-subject-input').fill(subject);
    await page.locator('#new-subject-form button[type="submit"]').click();
    // creating the subject finishes by resetting the register forms: filling the study form before that loses the text
    await expect(page.locator('#new-subject-input')).toBeHidden({ timeout: 8000 });
  }
  await page.locator('#study-date').fill(date);
  await page.locator('#study-source-text').fill(source);
  await page.locator('#study-content').fill(content);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const row = page.locator('.study-row', { hasText: content });
  await expect(row).toHaveCount(1);
  return row.getAttribute('data-study-id');
}

const rowOf = (page, studyId) => page.locator(`.study-row[data-study-id="${studyId}"]`);
const sectionOf = (row) => row.locator('.study-exercises-section');
const toggleOf = (row) => row.locator('[data-action="toggle-exercises"]');

/** Opens the exercises section of a row (after a page reload the row is closed again). */
async function openExercises(row) {
  await toggleOf(row).click();
  await expect(sectionOf(row)).toBeVisible();
}

/** What the SERVER holds for this study's exercises (the persisted state), as { question, answer, hint, explanation, archived }. */
async function serverExercises(page, studyId) {
  const body = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/learning-units/${id}/exercises`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: studyId });
  return body.exercises.map((e) => ({
    question: e.currentVersion?.question ?? null,
    answer: e.currentVersion?.answer ?? null,
    hint: e.currentVersion?.hint ?? null,
    explanation: e.currentVersion?.explanation ?? null,
    archived: Boolean(e.archivedAt),
  })).filter((e) => !e.archived);
}

/** What the SERVER holds for this study: { title, sourceText, studyDate }. */
async function serverStudy(page, studyId) {
  const body = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/learning-units/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: studyId });
  return { title: body.unit.title, sourceText: body.unit.sourceText, studyDate: body.unit.studyDate };
}

/** Fills the "add exercise" form of a row (inputs are optional so a test can leave fields empty). */
async function fillAddForm(row, { question, answer, hint, why }) {
  const form = row.locator('.exercise-add-form');
  if (question !== undefined) await form.locator('.exercise-question-input').fill(question);
  if (answer !== undefined) await form.locator('.exercise-answer-input').fill(answer);
  if (hint !== undefined) await form.locator('.exercise-hint-input').fill(hint);
  if (why !== undefined) await form.locator('.exercise-why-input').fill(why);
}

async function addExercise(row, fields) {
  await fillAddForm(row, fields);
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(row.locator('.exercise-question', { hasText: fields.question })).toBeVisible({ timeout: 5000 });
}

/** Counts the requests the page sends to the server for a URL pattern + method (to prove "no request was made"). */
function countRequests(page, pattern, method) {
  const seen = [];
  page.on('request', (req) => { if (pattern.test(req.url()) && req.method() === method) seen.push(req.url()); });
  return seen;
}

test('toggle-exercises opens and closes the exercises section, and renders the exercise list only when it opens', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Toggle', date: '2030-01-01', content: 'Aula toggle' });
  const row = rowOf(page, studyId);
  // the section is rendered but hidden, and nothing was loaded into it yet
  await expect(sectionOf(row)).toBeHidden();
  await expect(row.locator('.exercise-item')).toHaveCount(0);

  // an exercise exists on the server; the list is NOT shown until the section opens
  await openExercises(row);
  await addExercise(row, { question: 'Q toggle?', answer: 'R toggle' });
  await toggleOf(row).click();
  await expect(sectionOf(row)).toBeHidden();

  // reload: the row starts closed again with no exercise rendered; opening renders it from the server
  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = rowOf(page, studyId);
  await expect(sectionOf(reloaded)).toBeHidden();
  await expect(reloaded.locator('.exercise-item')).toHaveCount(0);
  await toggleOf(reloaded).click();
  await expect(sectionOf(reloaded)).toBeVisible();
  await expect(reloaded.locator('.exercise-item')).toHaveCount(1);
  await expect(reloaded.locator('.exercise-question')).toHaveText('Q toggle?');
  await expect(reloaded.locator('.exercise-answer')).toHaveText('R toggle');

  // closing again hides it; the rendered list stays in the DOM (it is only re-rendered when the section opens)
  await toggleOf(reloaded).click();
  await expect(sectionOf(reloaded)).toBeHidden();
  await toggleOf(reloaded).click();
  await expect(sectionOf(reloaded)).toBeVisible();
  await expect(reloaded.locator('.exercise-item')).toHaveCount(1);
});

test('add-exercise: an empty question shows the error, focuses the question and creates nothing', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Add vazio', date: '2030-01-01', content: 'Aula add vazio' });
  const row = rowOf(page, studyId);
  await openExercises(row);
  const posts = countRequests(page, /\/v1\/learning-units\/\d+\/exercises/, 'POST');

  // answer and hint filled but the question is blank (whitespace only counts as blank)
  await fillAddForm(row, { question: '   ', answer: 'só resposta', hint: 'só dica', why: 'só porquê' });
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  const message = row.locator('.exercise-form-message');
  await expect(message).toHaveText('Informe o enunciado do exercício.');
  await expect(message).toHaveClass(/is-error/);
  await expect(row.locator('.exercise-add-form .exercise-question-input')).toBeFocused();
  // nothing was typed away and nothing was created
  await expect(row.locator('.exercise-add-form .exercise-answer-input')).toHaveValue('só resposta');
  await expect(row.locator('.exercise-add-form .exercise-hint-input')).toHaveValue('só dica');
  await expect(row.locator('.exercise-add-form .exercise-why-input')).toHaveValue('só porquê');
  await expect(row.getByRole('button', { name: 'Adicionar exercício' })).toBeEnabled();
  await expect(row.locator('.exercise-item')).toHaveCount(0);
  expect(posts).toHaveLength(0);
  expect(await serverExercises(page, studyId)).toEqual([]);
});

test('add-exercise: a filled form saves, clears the inputs, shows the success message and the item with hint and "Por quê"', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Add ok', date: '2030-01-01', content: 'Aula add ok' });
  const row = rowOf(page, studyId);
  await openExercises(row);

  // first an error, so the success must also clear the error class
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(row.locator('.exercise-form-message')).toHaveClass(/is-error/);

  await fillAddForm(row, { question: '  Qual o enunciado?  ', answer: '  A resposta  ', hint: ' Uma dica ', why: ' Um porquê ' });
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  const message = row.locator('.exercise-form-message');
  await expect(message).toHaveText('Exercício adicionado.');
  await expect(message).not.toHaveClass(/is-error/);
  for (const sel of ['.exercise-question-input', '.exercise-answer-input', '.exercise-hint-input', '.exercise-why-input']) {
    await expect(row.locator(`.exercise-add-form ${sel}`)).toHaveValue('');
  }
  await expect(row.getByRole('button', { name: 'Adicionar exercício' })).toBeEnabled();

  // the list shows the item, trimmed, with the hint and the "Por quê" formatted by the catalog
  await expect(row.locator('.exercise-item')).toHaveCount(1);
  await expect(row.locator('.exercise-question')).toHaveText('Qual o enunciado?');
  await expect(row.locator('.exercise-answer')).toHaveText('A resposta');
  await expect(row.locator('.exercise-hint')).toHaveText('Dica: Uma dica');
  await expect(row.locator('.exercise-why')).toHaveText('Por quê: Um porquê');

  // persisted on the server...
  expect(await serverExercises(page, studyId)).toEqual([
    { question: 'Qual o enunciado?', answer: 'A resposta', hint: 'Uma dica', explanation: 'Um porquê', archived: false },
  ]);
  // ...and rendered again from it after a reload
  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = rowOf(page, studyId);
  await openExercises(reloaded);
  await expect(reloaded.locator('.exercise-question')).toHaveText('Qual o enunciado?');
  await expect(reloaded.locator('.exercise-hint')).toHaveText('Dica: Uma dica');
  await expect(reloaded.locator('.exercise-why')).toHaveText('Por quê: Um porquê');

  // a second item with only question and answer has no hint and no "Por quê" blocks (and an empty answer is allowed)
  await addExercise(reloaded, { question: 'Só pergunta?', answer: '' });
  const second = reloaded.locator('.exercise-item', { hasText: 'Só pergunta?' });
  await expect(second.locator('.exercise-hint')).toHaveCount(0);
  await expect(second.locator('.exercise-why')).toHaveCount(0);
  expect((await serverExercises(page, studyId)).map((e) => [e.question, e.answer, e.hint, e.explanation])).toEqual([
    ['Qual o enunciado?', 'A resposta', 'Uma dica', 'Um porquê'],
    ['Só pergunta?', '', null, null],
  ]);
});

test('add-exercise: a server failure shows the failure message, keeps what was typed and re-enables the button', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Add falha', date: '2030-01-01', content: 'Aula add falha' });
  const row = rowOf(page, studyId);
  await openExercises(row);

  await page.route(/\/v1\/learning-units\/\d+\/exercises$/, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await fillAddForm(row, { question: 'Pergunta que falha', answer: 'Resposta que falha', hint: 'Dica que falha', why: 'Porquê que falha' });
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  const message = row.locator('.exercise-form-message');
  await expect(message).toHaveText('Não foi possível salvar o exercício.');
  await expect(message).toHaveClass(/is-error/);
  await expect(row.getByRole('button', { name: 'Adicionar exercício' })).toBeEnabled();
  await expect(row.locator('.exercise-add-form .exercise-question-input')).toHaveValue('Pergunta que falha');
  await expect(row.locator('.exercise-add-form .exercise-answer-input')).toHaveValue('Resposta que falha');
  await expect(row.locator('.exercise-add-form .exercise-hint-input')).toHaveValue('Dica que falha');
  await expect(row.locator('.exercise-add-form .exercise-why-input')).toHaveValue('Porquê que falha');
  await expect(row.locator('.exercise-item')).toHaveCount(0);
  expect(await serverExercises(page, studyId)).toEqual([]);

  // with the network back, the same typed text saves with one more click and the error state goes away
  await page.unroute(/\/v1\/learning-units\/\d+\/exercises$/);
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(message).toHaveText('Exercício adicionado.');
  await expect(message).not.toHaveClass(/is-error/);
  await expect(row.locator('.exercise-question')).toHaveText('Pergunta que falha');
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Pergunta que falha']);
});

test('delete-exercise removes exactly that exercise (it is archived, the other stays); a failure leaves it', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Delete', date: '2030-01-01', content: 'Aula delete' });
  const row = rowOf(page, studyId);
  await openExercises(row);
  await addExercise(row, { question: 'Fica?', answer: 'Fica' });
  await addExercise(row, { question: 'Sai?', answer: 'Sai' });
  await expect(row.locator('.exercise-item')).toHaveCount(2);
  const leaving = row.locator('.exercise-item', { hasText: 'Sai?' });
  const leavingId = await leaving.getAttribute('data-exercise-id');

  // failure first: the click re-enables the button, the item stays on screen and on the server
  const archive = /\/v1\/exercises\/\d+$/;
  await page.route(archive, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
  await leaving.getByRole('button', { name: 'Remover' }).click();
  await expect(leaving.getByRole('button', { name: 'Remover' })).toBeEnabled();
  await expect(row.locator('.exercise-item')).toHaveCount(2);
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Fica?', 'Sai?']);
  await page.unroute(archive);

  // success: only that exercise goes, no confirmation dialog
  page.once('dialog', (dialog) => { throw new Error(`unexpected dialog: ${dialog.message()}`); });
  await leaving.getByRole('button', { name: 'Remover' }).click();
  await expect(row.locator('.exercise-item')).toHaveCount(1);
  await expect(row.locator('.exercise-question')).toHaveText('Fica?');
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Fica?']);
  // the server keeps the row archived instead of deleting it
  const all = await page.evaluate(async ({ base, id, exerciseId }) => {
    const res = await fetch(`${base}/v1/exercises/${exerciseId}`, { credentials: 'include' });
    return { status: res.status, body: await res.json().catch(() => null), unit: id };
  }, { base: API_BASE, id: studyId, exerciseId: leavingId });
  expect(all.status).toBe(200);
  expect(all.body.exercise.archivedAt).toBeTruthy();

  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = rowOf(page, studyId);
  await openExercises(reloaded);
  await expect(reloaded.locator('.exercise-item')).toHaveCount(1);
  await expect(reloaded.locator('.exercise-question')).toHaveText('Fica?');
});

test('edit-exercise opens a prefilled inline form; save-exercise-edit saves it; cancel restores the original', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Edit ex', date: '2030-01-01', content: 'Aula edit ex' });
  const row = rowOf(page, studyId);
  await openExercises(row);
  await addExercise(row, { question: 'Q original?', answer: 'R original', hint: 'Dica original', why: 'Porquê original' });
  await addExercise(row, { question: 'Outra pergunta?', answer: 'Outra resposta' });
  const item = row.locator('.exercise-item', { hasText: 'Q original?' });
  const edit = row.locator('.exercise-item-edit');

  // opening the editor: the item is replaced by a form prefilled with the RAW values (not "Dica: ..."), question focused
  await item.getByRole('button', { name: 'Editar' }).click();
  await expect(edit).toHaveCount(1);
  await expect(row.locator('.exercise-item')).toHaveCount(2); // the edited item became the form; the other one is untouched
  await expect(edit.locator('.exercise-question-input')).toHaveValue('Q original?');
  await expect(edit.locator('.exercise-answer-input')).toHaveValue('R original');
  await expect(edit.locator('.exercise-hint-input')).toHaveValue('Dica original');
  await expect(edit.locator('.exercise-why-input')).toHaveValue('Porquê original');
  await expect(edit.locator('.exercise-question-input')).toBeFocused();
  await expect(edit.getByRole('button', { name: 'Salvar' })).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Cancelar' })).toBeVisible();

  // cancel: re-renders the list, the original item is back, unchanged, and nothing was saved
  await edit.locator('.exercise-question-input').fill('Texto digitado e descartado');
  await edit.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row.locator('.exercise-item-edit')).toHaveCount(0);
  await expect(row.locator('.exercise-item')).toHaveCount(2);
  const restored = row.locator('.exercise-item', { hasText: 'Q original?' });
  await expect(restored.locator('.exercise-answer')).toHaveText('R original');
  await expect(restored.locator('.exercise-hint')).toHaveText('Dica: Dica original');
  await expect(restored.locator('.exercise-why')).toHaveText('Por quê: Porquê original');
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Q original?', 'Outra pergunta?']);

  // empty (whitespace) question on save: nothing visible happens except the focus returning to the question; no request
  const patches = countRequests(page, /\/v1\/exercises\/\d+$/, 'PATCH');
  await restored.getByRole('button', { name: 'Editar' }).click();
  await edit.locator('.exercise-question-input').fill('   ');
  await edit.locator('.exercise-answer-input').focus(); // so the focus really moves back to the question on save
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(edit.locator('.exercise-question-input')).toBeFocused();
  await expect(edit.locator('.exercise-edit-error')).toHaveCount(0);
  await expect(edit.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  await expect(edit.locator('.exercise-answer-input')).toHaveValue('R original');
  expect(patches).toHaveLength(0);
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Q original?', 'Outra pergunta?']);

  // failure: the message appears inside the form, the form stays open with the typed text, the button is enabled again
  const target = /\/v1\/exercises\/\d+$/;
  await page.route(target, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
  await edit.locator('.exercise-question-input').fill('Q que não salva');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(edit.locator('.exercise-edit-error')).toHaveText('Erro ao salvar. Tente novamente.');
  await expect(edit.locator('.exercise-edit-error')).toHaveClass(/form-error/);
  await expect(edit.locator('.exercise-question-input')).toHaveValue('Q que não salva');
  await expect(edit.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  expect((await serverExercises(page, studyId)).map((e) => e.question)).toEqual(['Q original?', 'Outra pergunta?']);
  // a second failure reuses the same message element instead of stacking another one
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(edit.locator('.exercise-edit-error')).toHaveCount(1);
  await page.unroute(target);

  // success: the new values (trimmed) are shown, the form is gone, the other item is untouched, and it is persisted
  await edit.locator('.exercise-question-input').fill('  Q editada?  ');
  await edit.locator('.exercise-answer-input').fill('R editada');
  await edit.locator('.exercise-hint-input').fill('Dica editada');
  await edit.locator('.exercise-why-input').fill('Porquê editado');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.locator('.exercise-item-edit')).toHaveCount(0);
  const saved = row.locator('.exercise-item', { hasText: 'Q editada?' });
  await expect(saved.locator('.exercise-question')).toHaveText('Q editada?');
  await expect(saved.locator('.exercise-answer')).toHaveText('R editada');
  await expect(saved.locator('.exercise-hint')).toHaveText('Dica: Dica editada');
  await expect(saved.locator('.exercise-why')).toHaveText('Por quê: Porquê editado');
  await expect(row.locator('.exercise-item', { hasText: 'Outra pergunta?' })).toHaveCount(1);
  expect(await serverExercises(page, studyId)).toEqual([
    { question: 'Q editada?', answer: 'R editada', hint: 'Dica editada', explanation: 'Porquê editado', archived: false },
    { question: 'Outra pergunta?', answer: 'Outra resposta', hint: null, explanation: null, archived: false },
  ]);

  // emptying hint and "Por quê" removes them (null), and the item keeps its place in the list
  await saved.getByRole('button', { name: 'Editar' }).click();
  await edit.locator('.exercise-hint-input').fill('');
  await edit.locator('.exercise-why-input').fill('');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.locator('.exercise-item-edit')).toHaveCount(0);
  await expect(row.locator('.exercise-hint')).toHaveCount(0);
  await expect(row.locator('.exercise-why')).toHaveCount(0);
  await expect(row.locator('.exercise-question')).toHaveText(['Q editada?', 'Outra pergunta?']);
  expect((await serverExercises(page, studyId))[0]).toMatchObject({ question: 'Q editada?', hint: null, explanation: null });

  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = rowOf(page, studyId);
  await openExercises(reloaded);
  await expect(reloaded.locator('.exercise-question')).toHaveText(['Q editada?', 'Outra pergunta?']);
});

test('edit-study opens an inline form (source, date, content prefilled, content focused); cancel-study restores the row unchanged', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Edit estudo', date: '2030-03-04', source: 'Livro X, cap. 2', content: 'Aula editável' });
  const row = rowOf(page, studyId);
  await expect(row.locator('.study-title')).toHaveText('Edit estudo');
  await expect(row.locator('.study-source-tag')).toHaveText('Livro X, cap. 2');
  const dateTagBefore = await row.locator('.study-date-tag').textContent();
  expect(dateTagBefore).toMatch(/2030/);
  await expect(row.locator('.study-content')).toHaveText('Aula editável');

  await row.getByRole('button', { name: 'Editar' }).first().click();
  await expect(row).toHaveClass(/is-editing/);
  await expect(row.locator('.study-edit-source')).toHaveValue('Livro X, cap. 2');
  await expect(row.locator('.study-edit-date')).toHaveValue('2030-03-04');
  await expect(row.locator('.study-edit-content')).toHaveValue('Aula editável');
  await expect(row.locator('.study-edit-content')).toBeFocused();
  await expect(row.locator('.inline-edit-error')).toHaveText('');
  await expect(row.locator('.study-content')).toHaveCount(0); // the read-only blocks are replaced by the form
  await expect(row.getByRole('button', { name: 'Salvar' })).toBeVisible();
  // the exercises toggle is still offered on the row in edit mode
  await expect(toggleOf(row)).toBeVisible();

  // typing then cancelling discards everything
  await row.locator('.study-edit-source').fill('descartado');
  await row.locator('.study-edit-date').fill('2031-12-31');
  await row.locator('.study-edit-content').fill('descartado também');
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row).not.toHaveClass(/is-editing/);
  await expect(row.locator('.study-edit-content')).toHaveCount(0);
  await expect(row.locator('.study-title')).toHaveText('Edit estudo');
  await expect(row.locator('.study-source-tag')).toHaveText('Livro X, cap. 2');
  await expect(row.locator('.study-date-tag')).toHaveText(dateTagBefore);
  await expect(row.locator('.study-content')).toHaveText('Aula editável');
  expect(await serverStudy(page, studyId)).toEqual({ title: 'Aula editável', sourceText: 'Livro X, cap. 2', studyDate: '2030-03-04' });
});

test('save-study validation: an empty date or an empty content shows the message and focuses the empty field (date first); nothing is sent', async ({ page }) => {
  const studyId = await createStudy(page, { subject: 'Valida estudo', date: '2030-03-04', source: 'Fonte V', content: 'Aula valida' });
  const row = rowOf(page, studyId);
  const patches = countRequests(page, /\/v1\/learning-units\/\d+$/, 'PATCH');
  await row.getByRole('button', { name: 'Editar' }).first().click();
  const error = row.locator('.inline-edit-error');

  // empty content only -> focus on the content
  await row.locator('.study-edit-content').fill('   ');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(error).toHaveText('Data e conteúdo são obrigatórios.');
  await expect(row.locator('.study-edit-content')).toBeFocused();

  // empty date only -> focus on the date
  await row.locator('.study-edit-content').fill('Aula valida');
  await row.locator('.study-edit-date').fill('');
  await row.locator('.study-edit-source').focus();
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(error).toHaveText('Data e conteúdo são obrigatórios.');
  await expect(row.locator('.study-edit-date')).toBeFocused();

  // both empty -> the date wins the focus
  await row.locator('.study-edit-content').fill('');
  await row.locator('.study-edit-source').focus();
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.locator('.study-edit-date')).toBeFocused();

  // the form stays open with what was typed, and nothing was sent or changed
  await expect(row).toHaveClass(/is-editing/);
  await expect(row.locator('.study-edit-source')).toHaveValue('Fonte V');
  expect(patches).toHaveLength(0);
  expect(await serverStudy(page, studyId)).toEqual({ title: 'Aula valida', sourceText: 'Fonte V', studyDate: '2030-03-04' });
});

test('save-study in server mode: editing the source and the content (date untouched) saves, and the request carries only the changed fields, never studyDate', async ({ page }) => {
  // The server contract (server/src/services/learning-units.js updateFields) takes title/sourceText/summaryBody only; studyDate is
  // refused on purpose, because correcting a date would have to reproject the pending reviews. So a date nobody changed must not be sent.
  const studyId = await createStudy(page, { subject: 'Estudo salva', date: '2030-03-04', source: 'Fonte S', content: 'Aula salva' });
  const row = rowOf(page, studyId);
  const bodies = [];
  page.on('request', (req) => { if (/\/v1\/learning-units\/\d+$/.test(req.url()) && req.method() === 'PATCH') bodies.push(req.postDataJSON()); });
  await row.getByRole('button', { name: 'Editar' }).first().click();
  await row.locator('.study-edit-source').fill('Fonte nova');
  await row.locator('.study-edit-content').fill('Conteúdo novo');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(row).not.toHaveClass(/is-editing/);
  await expect(row.locator('.study-content')).toHaveText('Conteúdo novo');
  await expect(row.locator('.study-source-tag')).toHaveText('Fonte nova');
  expect(bodies).toEqual([{ sourceText: 'Fonte nova', title: 'Conteúdo novo' }]);
  expect(await serverStudy(page, studyId)).toEqual({ title: 'Conteúdo novo', sourceText: 'Fonte nova', studyDate: '2030-03-04' });
  await page.reload();
  await expect(rowOf(page, studyId).locator('.study-content')).toHaveText('Conteúdo novo');
});

test('save-study in server mode: CHANGING the date is refused by the contract: the failure message, no request, the form stays open and nothing changes', async ({ page }) => {
  // Not a defect: the server does not correct study dates (see the test above). The message is the generic one on purpose; a
  // dedicated message for this case is a product decision (see .specs/LOOP_BACKLOG.md).
  const studyId = await createStudy(page, { subject: 'Estudo falha', date: '2030-03-04', source: 'Fonte F', content: 'Aula falha' });
  const row = rowOf(page, studyId);
  const patches = countRequests(page, /\/v1\/learning-units\/\d+$/, 'PATCH');
  await row.getByRole('button', { name: 'Editar' }).first().click();
  await row.locator('.study-edit-date').fill('2031-01-02');
  await row.locator('.study-edit-source').fill('Fonte nova');
  await row.locator('.study-edit-content').fill('Conteúdo novo');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.locator('.inline-edit-error')).toHaveText('Não foi possível salvar o estudo.');
  await expect(row).toHaveClass(/is-editing/);
  await expect(row.locator('.study-edit-source')).toHaveValue('Fonte nova');
  await expect(row.locator('.study-edit-content')).toHaveValue('Conteúdo novo');
  await expect(row.getByRole('button', { name: 'Salvar' })).toBeEnabled(); // the save button is never disabled by this action
  expect(patches).toHaveLength(0);
  expect(await serverStudy(page, studyId)).toEqual({ title: 'Aula falha', sourceText: 'Fonte F', studyDate: '2030-03-04' });

  // a failure message left by an earlier attempt is replaced by the validation message when the form is then invalid
  await row.locator('.study-edit-content').fill('');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.locator('.inline-edit-error')).toHaveText('Data e conteúdo são obrigatórios.');

  // cancelling after a failed save drops the typed text
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row.locator('.study-content')).toHaveText('Aula falha');
  await expect(row.locator('.study-source-tag')).toHaveText('Fonte F');
});

test('only one study is in edit mode at a time: editing a second study re-renders the list and closes the first (typed text is lost)', async ({ page }) => {
  const firstId = await createStudy(page, { subject: 'Dois estudos', date: '2030-05-06', source: 'Fonte 1', content: 'Primeira aula' });
  const secondId = await createStudy(page, { date: '2030-05-07', source: 'Fonte 2', content: 'Segunda aula' });
  expect(secondId).not.toBe(firstId);
  const first = rowOf(page, firstId);
  const second = rowOf(page, secondId);

  await first.getByRole('button', { name: 'Editar' }).first().click();
  await expect(first).toHaveClass(/is-editing/);
  await first.locator('.study-edit-content').fill('Texto não salvo da primeira');
  await second.getByRole('button', { name: 'Editar' }).first().click();

  await expect(second).toHaveClass(/is-editing/);
  await expect(second.locator('.study-edit-content')).toHaveValue('Segunda aula');
  await expect(second.locator('.study-edit-content')).toBeFocused();
  await expect(first).not.toHaveClass(/is-editing/);
  await expect(page.locator('.study-row.is-editing')).toHaveCount(1);
  await expect(first.locator('.study-content')).toHaveText('Primeira aula'); // the unsaved text of the first is gone
  await expect(page.locator('.study-edit-content')).toHaveCount(1);

  // re-rendering the list also collapses an open exercises section on the other rows
  await second.getByRole('button', { name: 'Cancelar' }).click();
  await openExercises(first);
  await second.getByRole('button', { name: 'Editar' }).first().click();
  await expect(sectionOf(first)).toBeHidden();
});

test('LOCAL STORE: save-study success updates the row (new date, source, content) and persists after a reload', async ({ page }) => {
  // The local (non-server) mode keeps studies in the browser store; it is where save-study can succeed. No sign-in in this mode.
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Local');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await expect(page.locator('#new-subject-input')).toBeHidden({ timeout: 8000 });
  await page.locator('#study-date').fill('2030-07-08');
  await page.locator('#study-source-text').fill('Fonte local');
  await page.locator('#study-content').fill('Aula local');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyId = await page.locator('.study-row', { hasText: 'Aula local' }).getAttribute('data-study-id');
  const row = rowOf(page, studyId); // in edit mode the row has no text to find it by
  const dateTagBefore = await row.locator('.study-date-tag').textContent();

  await row.getByRole('button', { name: 'Editar' }).first().click();
  await expect(row.locator('.study-edit-date')).toHaveValue('2030-07-08');
  await row.locator('.study-edit-source').fill('  Fonte local 2  ');
  await row.locator('.study-edit-date').fill('2030-09-10');
  await row.locator('.study-edit-content').fill('  Aula local editada  ');
  await row.getByRole('button', { name: 'Salvar' }).click();

  const saved = rowOf(page, studyId);
  await expect(saved.locator('.study-content')).toHaveText('Aula local editada');
  await expect(saved).not.toHaveClass(/is-editing/);
  await expect(saved.locator('.study-source-tag')).toHaveText('Fonte local 2');
  const dateTagAfter = await saved.locator('.study-date-tag').textContent();
  expect(dateTagAfter).not.toBe(dateTagBefore);
  expect(dateTagAfter).toMatch(/2030/);
  await expect(page.locator('#study-manager-message')).toHaveText('');

  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = rowOf(page, studyId);
  await expect(reloaded.locator('.study-content')).toHaveText('Aula local editada');
  await expect(reloaded.locator('.study-source-tag')).toHaveText('Fonte local 2');
  await expect(reloaded.locator('.study-date-tag')).toHaveText(dateTagAfter);
});
