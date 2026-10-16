import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T30: proves the item-level attempt ledger (T29's schema, T30's service
// wired into the existing review-exercise reveal/judge UI) is populated by
// a real practice interaction, not just by direct service calls (already
// covered by server/test/attempts.test.js). Same real-server-child-process
// pattern as e2e/feature-parity.spec.js.

const SERVER_PORT = serverPort(13963);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-practice-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
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
  await signInRegistered(page, { email: email, password: password });
});

test('revealing an answer and judging it in the real review UI creates a server-owned attempt/event with the right assistance and outcome', async ({ page }) => {
  // A unit dated far in the past puts all 16 review tasks in "overdue" on Hoje.
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Practice Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await expect(page.locator('#subject-message')).not.toContainText('possível', { timeout: 5000 });

  await page.locator('#study-date').fill('2020-01-01');
  await page.locator('#study-content').fill('Practice Unit');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });

  const row = page.locator('.study-row', { hasText: 'Practice Unit' });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.getByRole('button', { name: 'Exercícios' }).click();
  await row.locator('.exercise-question-input').fill('Qual a capital da Farmacologia?');
  await row.locator('.exercise-answer-input').fill('Resposta correta');
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(row.getByText('Qual a capital da Farmacologia?')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="today"]').click();

  // Slice 3 (SMARTLEARN_PRODUCT_FIRST_V1): with all 16 reviews overdue,
  // Hoje must lead with one clear primary action, not force the user to
  // scan every row themselves.
  const primaryAction = page.locator('#today-primary-action');
  await expect(primaryAction).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#today-primary-action-text')).toContainText('vencida');
  const primaryReviewId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
  expect(primaryReviewId).toBeTruthy();
  await page.locator('#today-primary-action-btn').click();
  const primaryRow = page.locator(`.review-row[data-review-id="${primaryReviewId}"]`);
  await expect(primaryRow).toHaveClass(/is-highlighted/);

  const exItem = page.locator('.review-exercise-item', { hasText: 'Qual a capital da Farmacologia?' }).first();
  await expect(exItem).toBeVisible({ timeout: 5000 });

  // Every write to the attempt ledger answers late, so the order "answer visible -> id -> reveal recorded -> submit recorded"
  // is forced here instead of depending on how fast the CI machine is (the three waits below are what keep this test honest).
  let delayedWrites = 0;
  await page.route(/\/v1\/(attempts\/|exercises\/\d+\/attempts)/, async (route) => {
    if (route.request().method() !== 'GET') { delayedWrites += 1; await new Promise((resolve) => setTimeout(resolve, 700)); }
    await route.continue();
  });

  await exItem.getByRole('button', { name: 'Ver resposta' }).click();
  await expect(exItem.getByText('Resposta correta')).toBeVisible({ timeout: 5000 });

  // The attempt id comes back from the server (ensureAttemptStarted is async and best-effort) after the answer text is already
  // visible, so wait for the attribute instead of reading it at once; it failed that way once in CI with the code unchanged.
  await expect(exItem).toHaveAttribute('data-attempt-id', /.+/, { timeout: 5000 });
  const attemptId = await exItem.evaluate((el) => el.dataset.attemptId);
  expect(attemptId).toBeTruthy();

  // Revealing the answer must have already been recorded server-side as
  // SOLUTION-level assistance BEFORE any judgment is made.
  // revealSolution is a SECOND request, sent after the id exists, so the server state is polled (same assertion, explicit wait).
  const readAttempt = () => page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/attempts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: attemptId });
  await expect.poll(async () => (await readAttempt()).attempt.maxAssistance, { timeout: 5000 }).toBe('SOLUTION');
  expect((await readAttempt()).attempt.status).toBe('STARTED');

  await exItem.getByRole('button', { name: 'Acertei' }).click();
  await expect(exItem).toHaveClass(/is-correct/, { timeout: 5000 });

  // is-correct is set locally at once; the submit to the server follows, so wait for the server to hold it.
  await expect.poll(async () => (await readAttempt()).attempt.status, { timeout: 5000 }).toBe('SUBMITTED');

  // start + reveal + submit all went through the delay: without this, the forced ordering above would be only an assumption.
  expect(delayedWrites).toBeGreaterThanOrEqual(3);
});
