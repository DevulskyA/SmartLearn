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

// EXAM-7: pending exam answers survive closing/reloading the tab.
test('EXAM-7: an answer that could not be sent (and one not yet blurred) survive a reload and reach the server on reopening', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Pendente', title: 'Aula pendente', studyDate: '2030-01-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Pend ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  const openExam = async () => {
    await page.locator('[data-screen="plan"]').click();
    const row = page.locator('.plan-row', { hasText: 'Aula pendente' });
    if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded')) !== 'true') await row.locator('.plan-expand-btn').click();
    await row.locator('[data-action="plan-exam"]').click();
  };
  await openExam();
  await page.route('**/v1/exams/*/items/*/answer', (route) => route.abort());
  await page.locator('#exam-answer-input').fill('pendente 1');
  await page.locator('#exam-next-btn').click(); // fails to send -> pending
  await expect(page.locator('#exam-message')).toContainText('Não foi possível guardar');
  await page.locator('#exam-answer-input').fill('digitando 2'); // typed, never blurred

  await page.unroute('**/v1/exams/*/items/*/answer'); // the connection is back only AFTER the tab is reloaded
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openExam();
  await expect(page.locator('#exam-answer-input')).toHaveValue('pendente 1'); // question 1 restored from the device
  await expect.poll(async () => {
    const exam = await page.evaluate(async (base) => {
      const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
      const units = (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units;
      const res = await fetch(`${base}/v1/exams`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify({ unitId: units[units.length - 1].id }) });
      return (await res.json()).exam;
    }, API_BASE);
    return exam.items.map((i) => i.studentAnswer);
  }, { timeout: 8000 }).toEqual(['pendente 1', 'digitando 2']); // both reached the server without the student retyping anything

  await page.locator('#exam-next-btn').click();
  await expect(page.locator('#exam-answer-input')).toHaveValue('digitando 2');
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.exam-review-item').nth(0).locator('.exam-review-student')).toHaveText('pendente 1');
  const leftovers = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('smartlearn.exam.pending.')));
  expect(leftovers).toEqual([]); // nothing left on the device once everything is saved
});

test('EXAM-7: with browser storage blocked the exam still works exactly as before', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  });
  const unit = await startExamOver(page, 'Sem storage', [1, 2]);
  expect(unit.id).toBeTruthy(); // reaching the correction screen (startExamOver asserts it) proves the flow ran end to end
});

// TODAYUX-1 (kept here to reuse the real-server harness): the daily screen must stay readable on a phone.
test('TODAYUX-1: on a 375px Hoje an overdue review keeps its title and date readable (date on one line, title not squeezed by the status pills)', async ({ page }) => {
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Semiologia Médica Completa', title: 'Ausculta cardíaca: bulhas e sopros', studyDate: '2026-08-01' });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="today"]:visible').first().click();
  const row = page.locator('.review-row').first();
  await expect(row).toBeVisible({ timeout: 8000 });
  const measured = await row.evaluate((el) => {
    const lines = (node) => new Set([...(() => { const r = document.createRange(); r.selectNodeContents(node); return r.getClientRects(); })()].map((c) => Math.round(c.top))).size;
    const meta = el.querySelector('.review-meta');
    const title = el.querySelector('.review-content');
    return { dateLines: lines(meta), titleWidth: title.getBoundingClientRect().width, rowWidth: el.getBoundingClientRect().width };
  });
  expect(measured.dateLines, 'the date must not be broken over several lines').toBe(1);
  expect(measured.titleWidth / measured.rowWidth, 'the title gets most of the card width').toBeGreaterThan(0.6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('TODAYUX-1: on a 375px Plano row the expand chevron stays on the identity line (never orphaned on a line of its own)', async ({ page }) => {
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal Avançada', title: 'Transporte tubular de sódio e água', studyDate: '2026-08-01' });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="plan"]:visible').first().click();
  const row = page.locator('.plan-row').first();
  await expect(row).toBeVisible({ timeout: 8000 });
  const gap = await row.evaluate((el) => {
    const chip = el.querySelector('.subject-chip').getBoundingClientRect();
    const chevron = el.querySelector('.plan-expand-btn').getBoundingClientRect();
    const badges = el.querySelector('.plan-row-badges').getBoundingClientRect();
    return { chevronBelowChip: chevron.top - chip.top, overlapsBadges: badges.right > chevron.left + 1 && badges.bottom > chevron.top && badges.top < chevron.bottom };
  });
  expect(gap.chevronBelowChip, 'the chevron is on the first line, beside the subject chip').toBeLessThan(24);
  expect(gap.overlapsBadges, 'the chevron does not cover the status pills').toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

// REVIEWNET-1: scheduled review in Hoje with an unstable connection.
async function reviewWithTwoItems(page, title) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Rev ${title}`, title, studyDate: '2026-08-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="today"]').click();
  const row = page.locator('.review-row', { hasText: title }).first();
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.review-row-toggle').first().click();
  await expect(row.locator('[data-action="reveal-answer"]').first()).toBeVisible({ timeout: 5000 });
  return { unit, row };
}
const reinforceTotal = async (page) => Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat().length;

test('REVIEWNET-1: a wrong item whose attempt could not be sent is retried when the review is completed, so "para reforçar" agrees with the evidence', async ({ page }) => {
  const { unit, row } = await reviewWithTwoItems(page, 'Aula revrede a');
  await row.locator('[data-action="reveal-answer"]').first().click();
  await page.route('**/v1/attempts/*/submit', (route) => route.abort());
  await row.locator('[data-action="exercise-errei"]').first().click();
  await page.waitForTimeout(600);
  expect(await reinforceTotal(page)).toBe(0); // the server has not heard about it yet
  await page.unroute('**/v1/attempts/*/submit'); // the connection returns before the review is completed
  await row.locator('[data-action="reveal-answer"]').nth(1).click();
  await row.locator('[data-action="exercise-acertei"]').nth(1).click();
  await row.locator('[data-action="review-done"]').check();
  await expect.poll(async () => (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence.length, { timeout: 8000 }).toBe(1);
  const evidence = (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  expect([evidence[0].type, evidence[0].questionsCount, evidence[0].correctCount]).toEqual(['REVIEW', 2, 1]);
  expect(await reinforceTotal(page)).toBe(1); // the wrong item now shows up as "para reforçar"
});

test('REVIEWNET-1: if the connection is STILL down when the review is completed, the student is told which items could not be marked', async ({ page }) => {
  const { row } = await reviewWithTwoItems(page, 'Aula revrede b');
  await row.locator('[data-action="reveal-answer"]').first().click();
  await page.route('**/v1/attempts/*/submit', (route) => route.abort());
  await row.locator('[data-action="exercise-errei"]').first().click();
  await row.locator('[data-action="reveal-answer"]').nth(1).click();
  await row.locator('[data-action="exercise-acertei"]').nth(1).click();
  await page.waitForTimeout(400);
  await row.locator('[data-action="review-done"]').check();
  await expect(page.locator('#review-dashboard-message')).toContainText('não consegui marcar 2 itens');
  await page.unroute('**/v1/attempts/*/submit');
});
