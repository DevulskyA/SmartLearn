import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// RESILIENCE-1: a dropped connection at each remaining step. Leaving "Estudar agora" in the middle (reload, navigation, dropped connection) must neither lose
// what was already judged nor leave misleading evidence behind. Measured against a real server.

const SERVER_PORT = 13994;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-resilience-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('resilience E2E: real server did not become ready in time');
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
  const email = `resil-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function apiCall(page, path, body, method = 'POST') {
  return page.evaluate(async ({ base, path, body, method }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body, method });
}
const getJson = (page, path) => page.evaluate(async ({ base, path }) => (await fetch(`${base}${path}`, { credentials: 'include' })).json(), { base: API_BASE, path });


async function startExamOver(page, title, questions) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `R ${title}`, title, studyDate: '2030-01-01' });
  for (const i of questions) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  for (let n = 0; n < questions.length; n += 1) {
    await page.locator('#exam-answer-input').fill(`r${n + 1}`);
    if (n < questions.length - 1) await page.locator('#exam-next-btn').click();
  }
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });
  return unit;
}
const examState = async (page, examId) => (await getJson(page, `/v1/exams/${examId}`)).exam;
// POST /v1/exams resumes the open exam and returns it: the cheapest way to learn its id
const currentExamId = (page) => page.evaluate(async (base) => {
  const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
  const units = (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units;
  const res = await fetch(`${base}/v1/exams`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify({ unitId: units[units.length - 1].id }) });
  return (await res.json()).exam.id;
}, API_BASE);

test('exam correction: a judgment that cannot be saved is refused visibly and the retry saves it once', async ({ page }) => {
  const unit = await startExamOver(page, 'Corr rede', [1, 2]);
  const items = page.locator('.exam-review-item');
  await page.route('**/v1/exams/*/items/*/judgment', (route) => route.abort());
  await items.nth(0).locator('.exam-correct-btn').click();
  await expect(page.locator('#exam-message')).toContainText('Não foi possível registrar essa correção');
  await expect(items.nth(0).locator('.exam-review-chip')).toHaveText('A julgar'); // the screen did not claim a judgment the server lacks
  await page.unroute('**/v1/exams/*/items/*/judgment');
  await items.nth(0).locator('.exam-correct-btn').click();
  await expect(items.nth(0).locator('.exam-review-chip')).toHaveText('Acerto');
  const exam = await examState(page, await currentExamId(page));
  expect(exam.items[0].outcome).toBe('CORRECT');
  expect(exam.items[1].outcome).toBeNull();
});

test('exam result: registering it while offline changes nothing and can be repeated once — exactly one evidence row', async ({ page }) => {
  const unit = await startExamOver(page, 'Reg rede', [1, 2]);
  const items = page.locator('.exam-review-item');
  await items.nth(0).locator('.exam-correct-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await expect(page.locator('#exam-finalize-btn')).toBeVisible();
  const evidenceOf = async () => (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  await page.route('**/v1/exams/*/finalize', (route) => route.abort());
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-finalize-btn')).toBeEnabled();
  await expect(page.locator('#exam-final-note')).toBeHidden(); // no "registered" claim
  expect(await evidenceOf()).toHaveLength(0);
  await page.unroute('**/v1/exams/*/finalize');
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toContainText('Resultado registrado');
  expect(await evidenceOf()).toHaveLength(1);
});

test('Estudar agora: if the attempt could not be STARTED when revealing, judging does not pretend — it retries the start, and the retry links the attempt', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Rev rede', title: 'Aula rev rede', studyDate: '2030-01-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Rev ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula rev rede' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.route('**/v1/exercises/*/attempts', (route) => route.abort());
  await page.locator('#study-now-reveal-btn').click(); // the attempt cannot be started
  // the connection is still down: the judgment is NOT accepted (no progress, plain message, server empty)
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  expect(Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat()).toHaveLength(0);

  // the connection returns: the SAME button starts the attempt, registers the judgment and moves on
  await page.unroute('**/v1/exercises/*/attempts');
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  expect(Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat()).toHaveLength(1);
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const evidence = (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([2, 1]);
});
