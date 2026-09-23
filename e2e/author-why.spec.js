import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// AUTHOR-1: a question the STUDENT wrote teaches like an AI-generated one. The "Por quê (opcional)" field exists
// in the create and edit forms, and what is saved shows up where the answer shows up (Estudar agora after the
// reveal, the error card, the exam correction). Empty = nothing appears (never invented). Everything is reached
// through the UI against a real server.

const SERVER_PORT = 13988;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-author-why-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('author-why E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `author-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function createUnit(page, { subject, title }) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill(subject);
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2030-01-01');
  await page.locator('#study-content').fill(title);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: title });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  return studyRow;
}

async function addExercise(studyRow, { question, answer, why }) {
  await studyRow.locator('.exercise-add-form .exercise-question-input, .exercise-question-input').last().fill(question);
  await studyRow.locator('.exercise-answer-input').last().fill(answer);
  if (why) await studyRow.locator('.exercise-why-input').last().fill(why);
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.locator('.exercise-question', { hasText: question })).toBeVisible({ timeout: 5000 });
}

test('the student writes the "Por quê": it shows in the list, after the reveal, in the error card and in the exam correction; an item without it shows none', async ({ page }) => {
  const studyRow = await createUnit(page, { subject: 'Autoria', title: 'Aula autoria' });
  await expect(studyRow.locator('.exercise-why-input')).toHaveCount(1); // the create form offers it
  await addExercise(studyRow, { question: 'Q com porquê?', answer: 'Resposta com porquê', why: 'Porque eu entendi assim.' });
  await addExercise(studyRow, { question: 'Q sem porquê?', answer: 'Resposta sem porquê' });
  await expect(studyRow.locator('.exercise-why')).toHaveCount(1);
  await expect(studyRow.locator('.exercise-why')).toHaveText('Por quê: Porque eu entendi assim.');
  await expect(studyRow.locator('.exercise-why-input')).toHaveValue(''); // the form is cleared after saving

  // Estudar agora: the WHY only after revealing, only where the student wrote one
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula autoria' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-explanation-text')).toBeHidden();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-explanation-text')).toHaveText('Por quê: Porque eu entendi assim.');
  await page.locator('#study-now-incorrect-btn').click();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-explanation-text')).toBeHidden(); // no invented text for the item without one
  await page.locator('#study-now-incorrect-btn').click();

  // the error card teaches with the student's own WHY (and only for the item that has one)
  const errors = page.locator('#study-now-errors-list .study-now-error-item');
  await expect(errors).toHaveCount(2, { timeout: 8000 });
  await expect(errors.nth(0).locator('.study-now-error-why')).toHaveText('Porque eu entendi assim.');
  await expect(errors.nth(1).locator('.study-now-error-why')).toHaveCount(0);
  await page.locator('#study-now-done-btn').click();

  // exam correction shows it as well, after submitting
  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'Aula autoria' });
  await row2.locator('.plan-expand-btn').click();
  await row2.locator('[data-action="plan-exam"]').click();
  await page.locator('#exam-answer-input').fill('a');
  await page.locator('#exam-next-btn').click();
  await page.locator('#exam-answer-input').fill('b');
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.exam-review-why')).toHaveCount(1);
  await expect(page.locator('.exam-review-why')).toHaveText('Porque eu entendi assim.');
});

test('editing the "Por quê" saves a new version with the new text; clearing it removes the block; the answer and hint survive', async ({ page }) => {
  const studyRow = await createUnit(page, { subject: 'Edicao', title: 'Aula edicao' });
  await addExercise(studyRow, { question: 'Q edita?', answer: 'Resp edita', why: 'Texto antigo' });

  // edit: the field is pre-filled with the current WHY; change it
  await studyRow.locator('[data-action="edit-exercise"]').click();
  await expect(studyRow.locator('.exercise-item-edit .exercise-why-input')).toHaveValue('Texto antigo');
  await studyRow.locator('.exercise-item-edit .exercise-why-input').fill('Texto novo');
  await studyRow.getByRole('button', { name: 'Salvar' }).click();
  await expect(studyRow.locator('.exercise-why')).toHaveText('Por quê: Texto novo', { timeout: 5000 });
  await expect(studyRow.locator('.exercise-answer')).toHaveText('Resp edita');

  // the new text is what Estudar agora shows
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula edicao' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-explanation-text')).toHaveText('Por quê: Texto novo');
  await page.locator('#study-now-correct-btn').click();
  await page.locator('#study-now-done-btn').click();

  // clearing removes it (an emptied field is an explicit "no WHY", not "keep the old one")
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  const row2 = page.locator('.study-row', { hasText: 'Aula edicao' });
  await row2.getByRole('button', { name: 'Exercícios' }).click();
  await row2.locator('[data-action="edit-exercise"]').click();
  await row2.locator('.exercise-item-edit .exercise-why-input').fill('');
  await row2.getByRole('button', { name: 'Salvar' }).click();
  await expect(row2.locator('.exercise-question', { hasText: 'Q edita?' })).toBeVisible({ timeout: 5000 });
  await expect(row2.locator('.exercise-why')).toHaveCount(0);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(await fits()).toBe(true);
  await page.setViewportSize({ width: 375, height: 800 });
  await row2.locator('[data-action="edit-exercise"]').click();
  await expect(row2.locator('.exercise-item-edit .exercise-why-input')).toBeVisible();
  expect(await fits()).toBe(true); // create + edit forms with the new field fit a phone
});
