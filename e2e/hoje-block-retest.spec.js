import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T30: proves the item-level attempt ledger (T29's schema, T30's service
// wired into the existing review-exercise reveal/judge UI) is populated by
// a real practice interaction, not just by direct service calls (already
// covered by server/test/attempts.test.js). Same real-server-child-process
// pattern as e2e/feature-parity.spec.js.

const SERVER_PORT = 13971;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-hoje-block-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('practice E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `practice-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('Hoje block: judgments survive leaving/reloading, the block ends with errors + "Refazer erros", the redo never touches the review evidence', async ({ page }) => {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Bloco Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2020-01-01');
  await page.locator('#study-content').fill('Bloco Unit');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: 'Bloco Unit' });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  for (const [q, a] of [['Pergunta A?', 'Resposta A'], ['Pergunta B?', 'Resposta B']]) {
    await studyRow.locator('.exercise-question-input').fill(q);
    await studyRow.locator('.exercise-answer-input').fill(a);
    await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
    await expect(studyRow.getByText(q)).toBeVisible({ timeout: 5000 });
  }

  await page.locator('[data-screen="today"]').click();
  await page.locator('#today-primary-action-btn').click();
  const reviewId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
  const item = (q) => page.locator(`.review-row[data-review-id="${reviewId}"] .review-exercise-item`, { hasText: q });
  const blockResult = page.locator(`.review-row[data-review-id="${reviewId}"] .review-block-result`);

  await item('Pergunta A?').getByRole('button', { name: 'Ver resposta' }).click();
  await item('Pergunta A?').getByRole('button', { name: 'Errei' }).click();
  await expect(blockResult).toBeHidden();                      // block not finished yet
  await item('Pergunta B?').getByRole('button', { name: 'Ver resposta' }).click();
  await item('Pergunta B?').getByRole('button', { name: 'Acertei' }).click();
  await expect(blockResult).toBeVisible();
  await expect(blockResult).toContainText('Bloco concluído: 1/2 corretas');
  await expect(blockResult.getByRole('button', { name: 'Refazer erros (1)' })).toBeVisible();

  // Leaving Hoje and coming back must NOT drop the judgments.
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="today"]').click();
  await expect(item('Pergunta A?')).toHaveClass(/is-wrong/, { timeout: 5000 });
  await expect(item('Pergunta B?')).toHaveClass(/is-correct/);
  await expect(item('Pergunta A?').getByRole('button', { name: 'Errei' })).toBeDisabled();
  await expect(blockResult).toContainText('Bloco concluído: 1/2 corretas');

  // ...nor does a full reload.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="today"]').click();
  await expect(item('Pergunta A?')).toHaveClass(/is-wrong/, { timeout: 5000 });
  await expect(blockResult.getByRole('button', { name: 'Refazer erros (1)' })).toBeVisible();

  // Redo only the wrong item, through the shared retest flow.
  await blockResult.getByRole('button', { name: 'Refazer erros (1)' }).click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1');
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta A?');
  await expect(page.locator('#study-now-summary-card')).toBeHidden();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos');
  await page.locator('#study-now-done-btn').click();

  // Back on Hoje: the ORIGINAL judgment is still what the review recorded.
  await expect(item('Pergunta A?')).toHaveClass(/is-wrong/, { timeout: 5000 });
  await expect(blockResult).toContainText('Bloco concluído: 1/2 corretas');

  // Ledger: original attempts untouched; the redo is extra, outside the review.
  const judged = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/review-tasks/${id}/attempts`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: reviewId });
  expect(judged.attempts.map((a) => a.outcome).sort()).toEqual(['CORRECT', 'INCORRECT']);

  // Completing the review records the ORIGINAL 1/2, not the redo.
  await page.locator(`.review-row[data-review-id="${reviewId}"] input[data-action="review-done"]`).check();
  const fetchReviewEvidence = async () => {
    const evidence = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/v1/learning-evidence`, { credentials: 'include' });
      return res.json();
    }, API_BASE);
    return evidence.evidence.filter((e) => e.type === 'REVIEW');
  };
  await expect.poll(async () => (await fetchReviewEvidence()).length, { timeout: 5000 }).toBe(1);
  const review = await fetchReviewEvidence();
  expect(review[0].questionsCount).toBe(2);
  expect(review[0].correctCount).toBe(1);
});
