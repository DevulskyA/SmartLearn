import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// STUDYRESUME-1: leaving "Estudar agora" in the middle (reload, navigation, dropped connection) must neither lose
// what was already judged nor leave misleading evidence behind. Measured against a real server.

const SERVER_PORT = 13993;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-study-resume-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('study-resume E2E: real server did not become ready in time');
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
  const email = `resume-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('leaving in the middle: what was judged stays ("para reforçar"), no evidence is written until the session ends, and starting again does not double-count', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Retomada', title: 'Aula retomada', studyDate: '2030-01-01' });
  for (const i of [1, 2, 3]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Ret ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  const evidenceOf = async () => (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  const reinforceCount = async () => Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat().length;
  const open = async () => {
    await page.locator('[data-screen="plan"]').click();
    const row = page.locator('.plan-row', { hasText: 'Aula retomada' });
    if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded')) !== 'true') await row.locator('.plan-expand-btn').click();
    return row;
  };
  const row = await open();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click(); // item 1 judged WRONG
  await page.locator('#study-now-reveal-btn').click();   // item 2 revealed, never judged

  await page.reload(); // the student is interrupted
  await page.waitForLoadState('networkidle');
  const row2 = await open();
  expect(await reinforceCount()).toBe(1);                                   // the judged answer was not lost
  await expect(row2.locator('.plan-reinforce-chip')).toHaveText('1 para reforçar');
  expect(await evidenceOf()).toHaveLength(0);                                // an unfinished session is not evidence
  await expect(row2.locator('[data-action="plan-study-now"]')).toHaveCount(1); // and can be started again

  // starting again is a fresh, complete pass: it must not double-count the interrupted one
  await row2.locator('[data-action="plan-study-now"]').click();
  await page.locator('#study-now-resume-restart').click(); // the interrupted pass is offered for continuing; here the student restarts
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 3');
  for (let i = 0; i < 3; i += 1) {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator('#study-now-correct-btn').click();
  }
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const evidence = await evidenceOf();
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([3, 3]); // only the completed pass counts
  expect(await reinforceCount()).toBe(0); // the last attempt on item 1 is now right
});

test('a dropped connection while judging keeps the student on the question with a plain message; the retry registers it; evidence matches the linked attempts', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Rede Estudo', title: 'Aula rede estudo', studyDate: '2030-01-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Rede ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula rede estudo' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await page.locator('#study-now-reveal-btn').click();

  // the connection drops exactly when the student judges: nothing may advance or be counted silently
  await page.route('**/v1/attempts/*/submit', (route) => route.abort());
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  await expect(page.locator('#study-now-incorrect-btn')).toBeVisible();
  expect(Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat()).toHaveLength(0); // the server saw nothing

  // the connection returns: the SAME button registers it and the session moves on
  await page.unroute('**/v1/attempts/*/submit');
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  await expect(page.locator('#study-now-message')).toHaveText('');
  expect(Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat()).toHaveLength(1);
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const evidence = (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([2, 1]);
});

// STUDYSTATE-1: the session resumes where it stopped.
async function threeItemUnit(page, title) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Sessao ${title}`, title, studyDate: '2030-01-01' });
  for (const i of [1, 2, 3]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  return unit;
}
async function openStudyNow(page, title) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded')) !== 'true') await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
}

test('STUDYSTATE-1: after an interruption the student can CONTINUE from the next question; one evidence row with the whole pass', async ({ page }) => {
  const unit = await threeItemUnit(page, 'Sessao continua');
  await openStudyNow(page, 'Sessao continua');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 3 de 3');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await openStudyNow(page, 'Sessao continua');
  await expect(page.locator('#study-now-resume')).toBeVisible();
  await expect(page.locator('#study-now-resume-text')).toContainText('2 de 3');
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const id of ['#study-now-resume-continue', '#study-now-resume-restart']) expect((await page.locator(id).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#study-now-resume-continue').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 3 de 3');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });

  const evidence = (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([3, 2]); // the WHOLE pass, not just the last question
  expect((await getJson(page, `/v1/learning-evidence/${evidence[0].id}/attempts`)).attempts).toHaveLength(3);
  // the finished session leaves nothing to resume
  const leftovers = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('smartlearn.studynow.')));
  expect(leftovers).toEqual([]);
});

test('STUDYSTATE-1: "Recomeçar" starts a fresh pass and does not double-count the interrupted one', async ({ page }) => {
  const unit = await threeItemUnit(page, 'Sessao recomeca');
  await openStudyNow(page, 'Sessao recomeca');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openStudyNow(page, 'Sessao recomeca');
  await page.locator('#study-now-resume-restart').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 3');
  for (let i = 0; i < 3; i += 1) {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator('#study-now-correct-btn').click();
  }
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const evidence = (await getJson(page, `/v1/learning-evidence?unitId=${unit.id}`)).evidence;
  expect(evidence).toHaveLength(1);
  expect([evidence[0].questionsCount, evidence[0].correctCount]).toEqual([3, 3]);
});

test('STUDYSTATE-1: with browser storage blocked the session simply starts at question 1, as before', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } }); });
  await threeItemUnit(page, 'Sessao sem storage');
  await openStudyNow(page, 'Sessao sem storage');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openStudyNow(page, 'Sessao sem storage');
  await expect(page.locator('#study-now-resume')).toBeHidden();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 3');
});
