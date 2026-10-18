import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// ROBUSTNESS sweep of the core study loop (open lesson -> Estudar agora -> judge -> Hoje review -> done): what the student
// sees and what the server holds when something goes wrong in the middle. One real server per file, one account per test.

const SERVER_PORT = serverPort(13940);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-robustness-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('robustness E2E: real server did not become ready in time');
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
  }, API_BASE);
  const email = `robust-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}
const getJson = (page, path) => page.evaluate(async ({ base, path }) => (await fetch(`${base}${path}`, { credentials: 'include' })).json(), { base: API_BASE, path });

/** A lesson with `n` manual questions. A past `studyDate` makes its reviews overdue, so Hoje lists them. */
async function seedLesson(page, title, { n = 3, studyDate = '2030-01-01' } = {}) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Disc ${title}`, title, studyDate });
  for (let i = 1; i <= n; i++) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Resp ${i}`, provenance: 'MANUAL' });
  return unit;
}

test('ROBUST-1: Revisão feita whose reply was lost: the retry completes the review instead of failing forever on "já concluída"', async ({ page }) => {
  const unit = await seedLesson(page, 'Aula resposta perdida', { n: 1, studyDate: '2020-01-01' });
  await page.locator('[data-screen="today"]').click();
  const first = page.locator('.review-row').first();
  await expect(first).toBeVisible({ timeout: 8000 });
  const reviewId = await first.getAttribute('data-review-id');
  let lost = false;
  await page.route('**/v1/review-tasks/*/complete', async (route) => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); return; } // the server recorded it; the answer never came back
    await route.continue();
  });
  await first.locator('[data-action="review-done"]').check();
  const message = page.locator('#review-dashboard-message');
  await expect(message).toContainText('Não foi possível salvar'); // the student cannot know it was recorded
  const completedCount = async () => (await getJson(page, `/v1/review-tasks?unitId=${unit.id}`)).reviewTasks.filter((r) => r.completedAt || r.completed_at).length;
  expect(await completedCount()).toBe(1); // ...but the server has it
  await page.locator(`.review-row[data-review-id="${reviewId}"] [data-action="review-done"]`).check(); // the student follows the message and taps again
  await expect(message).toHaveText('');
  await expect(page.locator(`.review-row[data-review-id="${reviewId}"]`)).toHaveAttribute('data-group', 'doneToday');
  expect(await completedCount()).toBe(1);
});

/** Opens the lesson in Plano; `beforeStart` runs once the row is expanded, right before "Estudar agora" is pressed. */
async function openStudyNow(page, title, beforeStart) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.plan-expand-btn').click();
  const start = row.locator('[data-action="plan-study-now"]');
  await expect(start).toBeVisible();
  await beforeStart?.();
  await start.click();
}

test('ROBUST-2: if the lesson\'s questions cannot be loaded, the screen says so instead of claiming the lesson has no exercises; opening it again works', async ({ page }) => {
  await seedLesson(page, 'Aula sem rede', { n: 2 });
  await openStudyNow(page, 'Aula sem rede', () => page.route('**/v1/learning-units/*/exercises', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue())));
  const notice = page.locator('#study-now-no-exercises');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Não foi possível carregar');
  await expect(notice).not.toContainText('ainda não tem exercícios');
  await expect(page.locator('#study-now-reveal-btn')).toBeHidden();
  await page.unroute('**/v1/learning-units/*/exercises');
  await openStudyNow(page, 'Aula sem rede');
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  await expect(page.locator('#study-now-no-exercises')).toBeHidden();
});

test('ROBUST-3: reloading (or following a link to) a study or exam screen whose session is gone lands on Plano, not on an empty screen with a dead button; the interrupted pass can be continued', async ({ page }) => {
  await seedLesson(page, 'Aula recarregada', { n: 3 });
  await openStudyNow(page, 'Aula recarregada');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-screen-panel="plan"]')).toBeVisible();
  await expect(page.locator('#study-now-reveal-btn')).toBeHidden();
  expect(await page.evaluate(() => window.location.hash)).toBe('#plan');
  await page.evaluate(() => { window.location.hash = '#exam'; }); // a stale link to a prova that is not open
  await expect(page.locator('[data-screen-panel="plan"]')).toBeVisible();
  await expect(page.locator('[data-screen-panel="exam"]')).toBeHidden();
  await openStudyNow(page, 'Aula recarregada');
  await expect(page.locator('#study-now-resume')).toBeVisible(); // what was judged is not lost: continue from question 2
  await page.locator('#study-now-resume-continue').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
});

test('ROBUST-4: a session that expires in the middle of studying sends the student to Conta WITH an explanation; after signing in again the pass continues where it stopped', async ({ page, context }) => {
  await seedLesson(page, 'Aula sessao expirada', { n: 3 });
  const email = (await getJson(page, '/v1/auth/me')).user.emailDisplay;
  await openStudyNow(page, 'Aula sessao expirada');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
  await context.clearCookies(); // the server no longer knows this browser
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#account-login-form')).toBeVisible();
  await expect(page.locator('#account-login-message')).toContainText('sessão expirou');
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill('a genuinely long test password 1');
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible();
  await openStudyNow(page, 'Aula sessao expirada');
  await expect(page.locator('#study-now-resume')).toBeVisible();
  await page.locator('#study-now-resume-continue').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
});

test('ROBUST-5: while a judgment is on its way to the server the buttons show it is busy and the other button cannot overrule it; one attempt, one outcome', async ({ page }) => {
  await seedLesson(page, 'Aula lenta', { n: 2 });
  await openStudyNow(page, 'Aula lenta');
  const attemptStarted = page.waitForResponse((res) => /\/v1\/attempts\/\d+\/reveal-solution$/.test(res.url()));
  await page.locator('#study-now-reveal-btn').click();
  await attemptStarted;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let submits = 0;
  await page.route('**/v1/attempts/*/submit', async (route) => { submits += 1; await gate; await route.continue(); });
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Registrando');
  await expect(page.locator('#study-now-correct-btn')).toBeDisabled();
  await expect(page.locator('#study-now-incorrect-btn')).toBeDisabled();
  await page.locator('#study-now-incorrect-btn').click({ force: true }); // the student taps the other one while waiting
  release();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  await expect(page.locator('#study-now-message')).toHaveText('');
  expect(submits).toBe(1);
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
  // a failure gives the buttons (and focus) back
  await page.unroute('**/v1/attempts/*/submit');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-judgment')).toBeVisible();
  await page.route('**/v1/attempts/*/submit', (route) => route.abort());
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  await expect(page.locator('#study-now-incorrect-btn')).toBeEnabled();
  await expect(page.locator('#study-now-correct-btn')).toBeEnabled();
  await expect(page.locator('#study-now-incorrect-btn')).toBeFocused();
});
