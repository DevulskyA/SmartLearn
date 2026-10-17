import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Estudar agora records two things on the server for one question: that the solution was revealed (assistance SOLUTION) and then the
// judgment (the attempt is SUBMITTED). An attempt that is already SUBMITTED refuses any later change, so if the student judges while
// the reveal is still being recorded, the order flips and the reveal is lost: the ledger would say the answer was seen with NO help.
// "Assistance is not mastery" (the learning-evidence rule) depends on that record being right.

const SERVER_PORT = serverPort(13952);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-reveal-order-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('reveal-order E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  await signInRegistered(page, { email: `reveal-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

/** Creates a unit with one exercise (optionally with a hint) through the Cadastro form and opens "Estudar agora" from Plano. */
async function openStudyNow(page, { hint } = {}) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Ordem Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2026-04-01');
  await page.locator('#study-content').fill('Ordem Unit');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: 'Ordem Unit' });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  await studyRow.locator('.exercise-question-input').fill('Pergunta ordem?');
  await studyRow.locator('.exercise-answer-input').fill('Resposta ordem');
  if (hint) await studyRow.locator('.exercise-hint-input').fill(hint);
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.getByText('Pergunta ordem?')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Ordem Unit' });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta ordem?');
}

/** What the server holds for the attempt the question area points at: { status, maxAssistance }. */
async function serverAttempt(page) {
  const id = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
  expect(id, 'the question area must point at the server attempt').toBeTruthy();
  return page.evaluate(async ({ base, attemptId }) => {
    const res = await fetch(`${base}/v1/attempts/${attemptId}`, { credentials: 'include' });
    const body = await res.json();
    return { status: body.attempt.status, maxAssistance: body.attempt.maxAssistance };
  }, { base: API_BASE, attemptId: id });
}

for (const outcome of ['study-now-correct-btn', 'study-now-incorrect-btn']) {
  test(`judging right after revealing (${outcome}) still records that the solution was revealed`, async ({ page }) => {
    await openStudyNow(page);
    // Every write to the attempt ledger answers late, as on a slow connection: the judgment must not overtake the reveal.
    let delayed = 0;
    await page.route(/\/v1\/attempts\/\d+\/(reveal-solution|hint)/, async (route) => {
      if (route.request().method() === 'POST') { delayed += 1; await new Promise((resolve) => setTimeout(resolve, 700)); }
      await route.continue();
    });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && /tentativa/i.test(msg.text())) errors.push(msg.text()); });

    await page.locator('#study-now-reveal-btn').click();
    await page.locator(`#${outcome}`).click();
    await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });

    expect(delayed, 'the delay must have applied to the reveal request, or this test measures nothing').toBeGreaterThan(0);
    await expect.poll(async () => (await serverAttempt(page)).status, { timeout: 5000 }).toBe('SUBMITTED');
    expect((await serverAttempt(page)).maxAssistance).toBe('SOLUTION');
    expect(errors, 'no failed attempt call may be logged').toEqual([]);
  });
}

test('revealing and judging with a hint on the exercise records the hint and the reveal, in that order, before the judgment', async ({ page }) => {
  await openStudyNow(page, { hint: 'Uma dica' });
  await page.route(/\/v1\/attempts\/\d+\/(reveal-solution|hint)/, async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await serverAttempt(page)).status, { timeout: 5000 }).toBe('SUBMITTED');
  expect((await serverAttempt(page)).maxAssistance).toBe('SOLUTION');
});

// The Hoje review has its own copy of the same sequence (reveal -> start, hint, reveal-solution; then judge -> submit).
async function openOverdueReview(page) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Hoje Ordem Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2020-01-01');
  await page.locator('#study-content').fill('Hoje Ordem Unit');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: 'Hoje Ordem Unit' });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  await studyRow.locator('.exercise-question-input').fill('Pergunta hoje ordem?');
  await studyRow.locator('.exercise-answer-input').fill('Resposta hoje ordem');
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.getByText('Pergunta hoje ordem?')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-primary-action')).toBeVisible({ timeout: 5000 });
  await page.locator('#today-primary-action-btn').click();
  const exItem = page.locator('.review-exercise-item', { hasText: 'Pergunta hoje ordem?' }).first();
  await expect(exItem).toBeVisible({ timeout: 5000 });
  return exItem;
}

for (const action of ['Acertei', 'Errei']) {
  test(`Hoje review: judging (${action}) right after revealing starts ONE attempt and records the reveal on it before the judgment`, async ({ page }) => {
    const exItem = await openOverdueReview(page);
    let delayed = 0;
    const starts = [];
    await page.route(/\/v1\/exercises\/\d+\/attempts$|\/v1\/attempts\/\d+\/(reveal-solution|hint)/, async (route) => {
      if (route.request().method() === 'POST') {
        delayed += 1;
        if (/\/exercises\/\d+\/attempts$/.test(route.request().url())) starts.push(route.request().url());
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.continue();
    });

    await exItem.getByRole('button', { name: 'Ver resposta' }).click();
    await exItem.getByRole('button', { name: action }).click();
    await expect(exItem).toHaveClass(action === 'Acertei' ? /is-correct/ : /is-wrong/, { timeout: 5000 });

    expect(delayed, 'the delay must have applied, or this test measures nothing').toBeGreaterThan(0);
    await expect.poll(() => exItem.getAttribute('data-attempt-id'), { timeout: 8000 }).toBeTruthy();
    const attemptId = await exItem.getAttribute('data-attempt-id');
    const readAttempt = () => page.evaluate(async ({ base, id }) => {
      const res = await fetch(`${base}/v1/attempts/${id}`, { credentials: 'include' });
      return (await res.json()).attempt;
    }, { base: API_BASE, id: attemptId });
    await expect.poll(async () => (await readAttempt()).status, { timeout: 8000 }).toBe('SUBMITTED');
    expect((await readAttempt()).maxAssistance).toBe('SOLUTION');
    expect(starts, 'one question, one attempt').toHaveLength(1);
  });
}
