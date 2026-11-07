import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// ONE rule for concluding a review (kit de Hoje, H-T03 / H-T05), real server, throwaway database:
//   all questions answered -> the stage concludes by itself (no second "Revisão feita")
//   some answered          -> the stage stays pending, progress visible
//   reading                -> only when the stage has no questions; it records "lida" and never invents a score
//   experimental panel     -> "Fazer a revisão" cannot conclude a stage that has questions without practising them

const SERVER_PORT = serverPort(13943);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-conclusao-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('conclusion-rule E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  const email = `rule-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

const api = (page, path, body) => page.evaluate(async ({ base, path, body }) => {
  const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
  const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
}, { base: API_BASE, path, body });

/** A unit studied long ago (its first reviews are overdue) with `questions` exercises. Returns the unit. */
async function unitWith(page, { subject, title, questions }) {
  const { unit } = await api(page, '/v1/learning-units', { newSubjectName: subject, title, studyDate: '2020-01-01' });
  for (let i = 1; i <= questions; i += 1) {
    await api(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} pergunta ${i}?`, answer: `Resposta ${i}`, provenance: 'MANUAL' });
  }
  return unit;
}

const reviewEvidence = async (page) => (await api(page, '/v1/learning-evidence')).evidence.filter((e) => e.type === 'REVIEW');
const completedTasks = async (page, unitId) => (await api(page, `/v1/review-tasks?unitId=${unitId}`)).reviewTasks.filter((t) => t.completedAt);

/** Opens Hoje and the review the primary action points at; returns the id of that review row. */
async function openPrimaryReview(page) {
  await page.locator('[data-screen="today"]').click();
  const primary = page.locator('#today-primary-action-btn');
  await expect(primary).toBeVisible({ timeout: 8000 });
  await primary.click();
  return primary.getAttribute('data-review-id');
}

const answer = async (row, question, name) => {
  const item = row.locator('.review-exercise-item', { hasText: question });
  await item.getByRole('button', { name: 'Ver resposta' }).click();
  await item.getByRole('button', { name }).click();
};

test('H-T03: answering every question concludes the stage by itself; no second "Revisão feita" is asked', async ({ page }) => {
  const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula total', questions: 2 });
  const reviewId = await openPrimaryReview(page);
  const row = page.locator(`.review-row[data-review-id="${reviewId}"]`);
  await answer(row, 'pergunta 1?', 'Errei');
  expect(await completedTasks(page, unit.id)).toHaveLength(0); // one of two answered: nothing concluded yet
  await answer(row, 'pergunta 2?', 'Acertei');

  const done = page.locator(`[data-review-list="doneToday"] .review-row[data-review-id="${reviewId}"]`);
  await expect(done).toBeVisible({ timeout: 8000 });
  await expect(done.locator('[data-action="review-done"]')).toBeChecked();
  expect((await completedTasks(page, unit.id)).map((t) => t.id)).toEqual([Number(reviewId)]);
  const evidence = await reviewEvidence(page);
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([2, 1]);
  // the retest of the error stays available on the concluded stage, and the first attempt is what the evidence kept
  await expect(done.getByRole('button', { name: 'Refazer erros (1)' })).toBeVisible();
});

test('partial or empty practice never concludes a stage that has questions: it stays pending with its progress visible', async ({ page }) => {
  const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula parcial', questions: 3 });
  const reviewId = await openPrimaryReview(page);
  const row = page.locator(`.review-row[data-review-id="${reviewId}"]`);
  const box = row.locator('[data-action="review-done"]');

  // nothing answered: reading is not a way to conclude a stage that has questions
  await box.click();
  await expect(box).not.toBeChecked();
  await expect(page.locator('#review-dashboard-message')).toContainText('3 questões');
  expect(await completedTasks(page, unit.id)).toHaveLength(0);

  // part answered: progress on the (still collapsed or open) card, stage still pending, checking is refused again
  await answer(row, 'pergunta 1?', 'Acertei');
  await expect(row.locator('.review-progress-chip')).toHaveText('1 de 3 respondidas');
  await box.click();
  await expect(box).not.toBeChecked();
  await expect(page.locator('#review-dashboard-message')).toContainText('2 questões');
  expect(await completedTasks(page, unit.id)).toHaveLength(0);
  expect(await reviewEvidence(page)).toHaveLength(0);

  // the progress survives a reload (the judgments are the server's)
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="today"]').click();
  await expect(async () => {
    if ((await row.locator('.review-row-toggle').getAttribute('aria-expanded')) !== 'true') await row.locator('.review-row-toggle').click();
    await expect(row.locator('.review-exercise-item').first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10000 });
  await expect(row.locator('.review-progress-chip')).toHaveText('1 de 3 respondidas', { timeout: 8000 });
  expect(await completedTasks(page, unit.id)).toHaveLength(0);

  // second of three answered: the same guard must still refuse completion and persist the 2/3 progress.
  await answer(row, 'pergunta 2?', 'Acertei');
  await expect(row.locator('.review-progress-chip')).toHaveText('2 de 3 respondidas');
  await box.click();
  await expect(box).not.toBeChecked();
  await expect(page.locator('#review-dashboard-message')).toContainText('1 questão');
  expect(await completedTasks(page, unit.id)).toHaveLength(0);
  expect(await reviewEvidence(page)).toHaveLength(0);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="today"]').click();
  await expect(async () => {
    if ((await row.locator('.review-row-toggle').getAttribute('aria-expanded')) !== 'true') await row.locator('.review-row-toggle').click();
    await expect(row.locator('.review-exercise-item').first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10000 });
  await expect(row.locator('.review-progress-chip')).toHaveText('2 de 3 respondidas', { timeout: 8000 });
  expect(await completedTasks(page, unit.id)).toHaveLength(0);

  // third answer: only now may the stage conclude and persist one REVIEW evidence row.
  await answer(row, 'pergunta 3?', 'Errei');
  const done = page.locator(`[data-review-list="doneToday"] .review-row[data-review-id="${reviewId}"]`);
  await expect(done).toBeVisible({ timeout: 8000 });
  expect(await completedTasks(page, unit.id)).toHaveLength(1);
  const evidence = await reviewEvidence(page);
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([3, 2]);
});

test('reading concludes only a stage without questions: records "lida", no score and no evidence', async ({ page }) => {
  const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula só leitura', questions: 0 });
  const reviewId = await openPrimaryReview(page);
  const row = page.locator(`.review-row[data-review-id="${reviewId}"]`);
  await row.locator('[data-action="review-done"]').check();
  const done = page.locator(`[data-review-list="doneToday"] .review-row[data-review-id="${reviewId}"]`);
  await expect(done).toBeVisible({ timeout: 8000 });
  expect(await completedTasks(page, unit.id)).toHaveLength(1);
  expect(await reviewEvidence(page)).toHaveLength(0);
  await expect(done.locator('.review-score-pill')).toHaveClass(/is-empty/);
});

test.describe('experimental panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('[data-screen="settings"]').click();
    await page.locator('#experiment-switch').check();
  });

  test('H-T05: "Fazer a revisão" on a stage with questions opens the practice; it concludes only after the questions are answered', async ({ page }) => {
    const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula experimento', questions: 2 });
    await page.locator('[data-screen="today"]').click();
    const panel = page.locator('#experiment-host .experiment-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await panel.locator('li', { hasText: 'Aula experimento' }).getByRole('button', { name: 'Fazer a revisão' }).click();

    // no direct conclusion: the practice screen opens and nothing was completed
    await expect(page.locator('#screen-study-now')).toBeVisible({ timeout: 8000 });
    expect(await completedTasks(page, unit.id)).toHaveLength(0);
    expect(await reviewEvidence(page)).toHaveLength(0);

    for (const n of [1, 2]) {
      await page.locator('#study-now-reveal-btn').click();
      await page.locator(n === 1 ? '#study-now-correct-btn' : '#study-now-incorrect-btn').click();
    }
    await expect(page.locator('#study-now-result-text')).toContainText('1/2', { timeout: 8000 });

    // concluded by the practice: ONE stage, with the evidence of the questions, and the experiment's re-dating from today still applies
    const completed = await completedTasks(page, unit.id);
    expect(completed).toHaveLength(1);
    const evidence = await reviewEvidence(page);
    expect(evidence).toHaveLength(1);
    expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([2, 1]);
    await page.locator('#study-now-done-btn').click();
    await expect(panel.locator('li', { hasText: 'Aula experimento' }).locator('.experiment-unit-status')).toContainText('Nada a revisar hoje', { timeout: 8000 });
  });

  test('the server refuses to conclude a stage that has questions from the experimental route without practice evidence', async ({ page }) => {
    const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula protegida', questions: 1 });
    const res = await api(page, `/v1/review-obligations/${unit.id}/complete`, { profile: 'DECIDED' });
    expect(res.error?.code).toBe('PRACTICE_REQUIRED');
    expect(await completedTasks(page, unit.id)).toHaveLength(0);
  });

  test('a stage without questions is concluded by reading from the panel: no evidence is created', async ({ page }) => {
    const unit = await unitWith(page, { subject: 'Fisiologia', title: 'Aula lida', questions: 0 });
    await page.locator('[data-screen="today"]').click();
    const panel = page.locator('#experiment-host .experiment-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await panel.locator('li', { hasText: 'Aula lida' }).getByRole('button', { name: 'Fazer a revisão' }).click();
    await expect(panel.locator('li', { hasText: 'Aula lida' }).locator('.experiment-unit-status')).toContainText('Nada a revisar hoje', { timeout: 8000 });
    expect(await completedTasks(page, unit.id)).toHaveLength(1);
    expect(await reviewEvidence(page)).toHaveLength(0);
  });
});
