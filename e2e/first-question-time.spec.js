import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';

// Time to the first question (product principle: "start fast"): from the student, already signed in and looking at the app, to the first question
// of a lesson that has questions. It counts the clicks the student makes and the milliseconds between the last click and the question on screen.
// Measured on a disposable instance, headless; the numbers are written to test-results/first-question-time.json.

const SERVER_PORT = serverPort(13991);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const RUNS = Number(process.env.FIRST_QUESTION_RUNS ?? 5);

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-firstq-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'first-question E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function signIn(page) {
  const email = `firstq-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await page.locator('[data-screen="account"]').click();
    await expect(page.locator('#account-show-register')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 15000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 15000 });
}

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test('FIRST-QUESTION: from a signed-in student to the first question of a lesson', async ({ page }) => {
  await signIn(page);
  const subjects = ['Fisiologia renal', 'Farmacologia básica', 'Anatomia do tórax', 'Bioquímica', 'Microbiologia'];
  const clicks = [];
  const lastClickToQuestion = [];
  const planToQuestion = [];
  for (let run = 0; run < RUNS; run += 1) {
    const title = `Filtração glomerular, aula ${String.fromCharCode(65 + (run % 26))}${Math.floor(run / 26) || ''}`; // letters never contain one another, so the plan row is unambiguous
    const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: run < subjects.length ? subjects[run] : `${subjects[run % subjects.length]} ${Math.floor(run / subjects.length) + 1}`, title, studyDate: '2030-01-01' });
    for (let q = 1; q <= 5; q += 1) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Pergunta ${q} sobre ${title}?`, answer: `Resposta ${q}`, provenance: 'MANUAL' });
    await page.locator('[data-screen="today"]').click(); // the student starts on Hoje
    let count = 0;
    const click = async (locator) => { count += 1; await locator.click(); };
    const t0 = Date.now();
    await click(page.locator('[data-screen="plan"]'));
    const row = page.locator('.plan-row', { hasText: title });
    await expect(row).toBeVisible({ timeout: 8000 });
    if (!await row.locator('[data-action="plan-study-now"]').isVisible()) await click(row.locator('.plan-expand-btn'));
    const beforeStart = Date.now();
    await click(row.locator('[data-action="plan-study-now"]'));
    await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 5', { timeout: 8000 });
    const t1 = Date.now();
    clicks.push(count);
    lastClickToQuestion.push(t1 - beforeStart);
    planToQuestion.push(t1 - t0);
    await page.locator('[data-screen="plan"]').click(); // leave the block unfinished; the next run starts from a calm screen
  }
  const report = { runs: RUNS, clicks, lastClickToQuestionMs: lastClickToQuestion, fromTodayToQuestionMs: planToQuestion, medianLastClickToQuestionMs: median(lastClickToQuestion), medianFromTodayMs: median(planToQuestion) };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'first-question-time.json'), JSON.stringify(report, null, 2));
  console.log(`[first-question] ${JSON.stringify(report)}`);
  expect(Math.max(...clicks), 'the first question is reachable in a handful of clicks').toBeLessThanOrEqual(3);
  // Baseline measured 2026-11-08 (3 batches of 10, headless, local server): 3 clicks; from the last click to the question the first (cold) run takes
  // about 350 ms and the rest 60-100 ms (median 85-87 ms); from Hoje to the question the median is 260-272 ms. The bounds are about 3x the cold
  // run, so only a real slowdown (or a lost fast path) trips them. They say nothing about the Desktop shell, a slower disk or real data volume.
  expect(Math.max(...lastClickToQuestion), 'last click to first question, slowest run (ms)').toBeLessThan(1000);
  expect(median(planToQuestion), 'Hoje to first question, median (ms)').toBeLessThan(1000);
});
