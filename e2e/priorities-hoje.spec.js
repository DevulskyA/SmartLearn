import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T45: Hoje's "Vale reforçar" block comes from the server's explainable
// priorities (GET /v1/priorities). Real server child process, same pattern as
// e2e/plan-study-now.spec.js.

const SERVER_PORT = serverPort(13981);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-priorities-'));
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
  throw new Error('priorities E2E: real server did not become ready in time');
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
  const email = `prio-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

async function createUnitWithExercise(page, { subject, title, studyDate, question }) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill(subject);
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill(studyDate);
  await page.locator('#study-content').fill(title);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: title });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  await studyRow.locator('.exercise-question-input').fill(question);
  await studyRow.locator('.exercise-answer-input').fill('Resposta');
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.getByText(question)).toBeVisible({ timeout: 5000 });
}

// Studied far in the future -> no review is due, so a suggestion here can only
// come from the attempt ledger (and must be explained, not invented).
async function firstPassWrong(page, title) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-retest-btn')).toHaveText('Refazer erros (1)');
}

test('Hoje: with nothing to suggest there is no "Vale reforçar" block (absence of data is not a suggestion)', async ({ page }) => {
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-empty-state')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#block-weak')).toBeHidden();
});

test('Hoje: a not-yet-due unit with a wrong item is suggested with its reason, and "Ver no Plano" opens it', async ({ page }) => {
  await createUnitWithExercise(page, { subject: 'Prio Subject', title: 'Prio Unit', studyDate: '2030-01-01', question: 'Pergunta Prio?' });
  await firstPassWrong(page, 'Prio Unit');

  await page.locator('[data-screen="today"]').click();
  const weak = page.locator('#block-weak');
  await expect(weak).toBeVisible({ timeout: 5000 });
  const suggestion = weak.locator('.weak-practice-row', { hasText: 'Prio Unit' });
  await expect(suggestion).toContainText('Prio Subject');
  await expect(suggestion).toContainText('1 exercício para reforçar');
  await expect(weak.locator('#weak-count')).toHaveText('1');

  await suggestion.getByRole('button', { name: 'Ver no Plano' }).click();
  const row = page.locator('.plan-row', { hasText: 'Prio Unit' });
  await expect(row.locator('.plan-exercise-item .plan-exercise-prior')).toHaveText('Errou na última tentativa', { timeout: 5000 });
});

test('Hoje mobile 375: the suggestion fits without horizontal scroll and its action is a comfortable touch target', async ({ page }) => {
  await createUnitWithExercise(page, { subject: 'Mobile Subject com nome bem comprido para testar quebra', title: 'Unidade com um titulo bastante longo para forcar quebra de linha no celular', studyDate: '2030-01-01', question: 'Pergunta Mobile?' });
  await firstPassWrong(page, 'Unidade com um titulo');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="today"]').click();
  const row = page.locator('#block-weak .weak-practice-row');
  await expect(row).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const box = await row.getByRole('button', { name: 'Ver no Plano' }).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('Hoje: a corrected redo clears the suggestion', async ({ page }) => {
  await createUnitWithExercise(page, { subject: 'Redo Subject', title: 'Redo Unit', studyDate: '2030-01-01', question: 'Pergunta Redo?' });
  await firstPassWrong(page, 'Redo Unit');
  await page.locator('#study-now-retest-btn').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos');
  await page.locator('#study-now-done-btn').click();

  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-empty-state, #today-success-state').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#block-weak')).toBeHidden();
});

test('Hoje: a unit that is already due is explained in its review and never repeated under "Vale reforçar"', async ({ page }) => {
  await createUnitWithExercise(page, { subject: 'Due Subject', title: 'Due Unit', studyDate: '2020-01-01', question: 'Pergunta Due?' });
  await page.locator('[data-screen="today"]').click();
  await page.locator('#today-primary-action-btn').click();
  const reviewId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
  const item = page.locator(`.review-row[data-review-id="${reviewId}"] .review-exercise-item`, { hasText: 'Pergunta Due?' });
  await item.getByRole('button', { name: 'Ver resposta' }).click();
  await item.getByRole('button', { name: 'Errei' }).click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator(`.review-row[data-review-id="${reviewId}"]`)).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#block-weak')).toBeHidden();
});

// CI_STABLE: Hoje renders are async and several can overlap (login, saving a unit, the nav click). A render that STARTED earlier but
// finishes later used to overwrite a newer one with stale data, so a due review silently disappeared from Hoje (hidden primary action).
// Deterministic reproduction with exactly TWO renders: render A's agenda answer is fetched before the unit exists and delivered only after
// render B has already shown the due unit. The unit is created over the API so no UI action starts a third render.
test('Hoje: a slow, stale render never overwrites a newer one - the due review stays on screen', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let heldTaken = false;
  await page.route(/\/v1\/agenda(\?|$)/, async (route) => {
    if (heldTaken) return route.continue();
    heldTaken = true;
    const stale = await route.fetch(); // answered NOW: no unit exists yet
    await held;
    await route.fulfill({ response: stale });
  });
  // render A: its agenda answer is held (repeat the click until the request is really in flight: a click that lands before the nav is wired is lost)
  await expect(async () => {
    await page.locator('[data-screen="today"]').click();
    expect(heldTaken).toBe(true);
  }).toPass({ timeout: 10_000 });
  const call = (path, body) => page.evaluate(async ({ base, path: p, body: b }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${p}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(b) });
    if (!res.ok) throw new Error(`${p} -> ${res.status}`);
    return res.json();
  }, { base: API_BASE, path, body });
  const { unit } = await call('/v1/learning-units', { newSubjectName: 'Stale Subject', title: 'Stale Unit', studyDate: '2020-01-01' });
  await call(`/v1/learning-units/${unit.id}/exercises`, { question: 'Pergunta Stale?', answer: 'Resposta', explanation: 'Porque.', provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="today"]').click(); // render B sees the due unit
  await expect(page.locator('#today-primary-action-btn')).toBeVisible({ timeout: 5000 });
  release(); // the stale answer arrives LAST
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#today-primary-action-btn')).toBeVisible();
  await expect(page.locator('#block-overdue')).toBeVisible();
});
