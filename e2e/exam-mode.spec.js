import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// EXAM-1: Modo Prova. A whole exam can be taken without EVER receiving or seeing the gabarito, explanation,
// hint or a score before submitting. The proof is at the wire (every /v1/exams response while in progress)
// AND in the DOM, and the correction data exists on the server only after the submit.

const SERVER_PORT = 13987;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const SECRETS = ['GABARITO-SECRETO-1', 'GABARITO-SECRETO-2', 'GABARITO-SECRETO-3', 'PORQUE-SECRETO-1', 'DICA-SECRETA-1'];

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-exam-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('exam E2E: real server did not become ready in time');
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
  const email = `exam-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body, method });
}

test('a complete exam: answer, navigate without losing answers, resume, submit -> nothing pedagogical is received or shown before the submit', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Renal', title: 'Aula da prova', studyDate: '2026-04-01' });
  for (const i of [1, 2, 3]) {
    await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, {
      question: `Enunciado ${i}?`, answer: `GABARITO-SECRETO-${i}`, explanation: i === 1 ? 'PORQUE-SECRETO-1' : null, hint: i === 1 ? 'DICA-SECRETA-1' : null, provenance: 'MANUAL',
    });
  }

  // wire evidence: every response of the exam API while taking the exam
  const examBodies = [];
  page.on('response', async (res) => {
    if (res.url().includes('/v1/exams')) { try { examBodies.push({ url: res.url(), method: res.request().method(), body: await res.text() }); } catch { /* navigation */ } }
  });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula da prova' });
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.plan-exercise-item')).toHaveCount(3, { timeout: 5000 });
  await row.locator('[data-action="plan-exam"]').click();

  // taking the exam: several questions, one at a time, with navigation
  await expect(page.locator('#screen-exam')).toBeVisible();
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 3');
  await expect(page.locator('#exam-question-text')).toHaveText('Enunciado 1?');
  await expect(page.locator('#exam-nav button')).toHaveCount(3);

  // nothing pedagogical in the DOM while taking it
  const forbiddenInDom = async () => {
    const text = await page.locator('#screen-exam').innerText();
    const html = await page.locator('#screen-exam').innerHTML();
    for (const secret of SECRETS) { expect(text).not.toContain(secret); expect(html).not.toContain(secret); }
    expect(text).not.toMatch(/gabarito|resposta correta|por quê|dica|acertos|corretas|nota|explicação/i);
  };
  await forbiddenInDom();

  // answer Q1, go to Q2 (answer it), back to Q1: nothing lost
  await page.locator('#exam-answer-input').fill('minha resposta 1');
  await page.locator('#exam-next-btn').click();
  await expect(page.locator('#exam-question-text')).toHaveText('Enunciado 2?');
  await expect(page.locator('#exam-answer-input')).toHaveValue('');
  await page.locator('#exam-answer-input').fill('minha resposta 2');
  await page.locator('#exam-nav button[data-index="0"]').click();
  await expect(page.locator('#exam-answer-input')).toHaveValue('minha resposta 1');
  await expect(page.locator('#exam-nav button[data-index="0"]')).toHaveClass(/is-answered/);
  await expect(page.locator('#exam-nav button[data-index="2"]')).not.toHaveClass(/is-answered/);
  await forbiddenInDom();

  // leaving and coming back RESUMES the same exam with the answers kept
  await page.reload();
  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'Aula da prova' });
  await row2.locator('.plan-expand-btn').click();
  await row2.locator('[data-action="plan-exam"]').click();
  await expect(page.locator('#exam-answer-input')).toHaveValue('minha resposta 1');
  await page.locator('#exam-next-btn').click();
  await expect(page.locator('#exam-answer-input')).toHaveValue('minha resposta 2');

  // submit: a two-step confirmation that says what is unanswered; the third question stays blank on purpose
  await page.locator('#exam-submit-btn').click();
  await expect(page.locator('#exam-submit-warning')).toContainText('1 questão sem resposta');
  await page.locator('#exam-submit-cancel-btn').click();
  await expect(page.locator('#exam-submit-btn')).toBeVisible();
  await page.locator('#exam-submit-btn').click();

  // WIRE proof: nothing pedagogical arrived at any point before the submit call
  const beforeSubmit = examBodies.filter((b) => !b.url.endsWith('/submit'));
  expect(beforeSubmit.length).toBeGreaterThan(3);
  for (const b of beforeSubmit) for (const secret of SECRETS) expect(b.body, `${b.method} ${b.url} leaked ${secret}`).not.toContain(secret);

  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#exam-submitted-text')).toContainText('2 de 3 questões respondidas');
  await expect(page.locator('#exam-taking')).toBeHidden();

  // the exam is closed on the server, the answers are locked, and the correction data now EXISTS server-side
  const after = await page.evaluate(async (base) => {
    const units = await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json();
    const exam = await (await fetch(`${base}/v1/exams/1`, { credentials: 'include' })).json();
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const late = await fetch(`${base}/v1/exams/${exam.exam.id}/items/${exam.exam.items[0].id}/answer`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: JSON.stringify({ answer: 'tarde' }) });
    return { units: units.units.length, status: exam.exam.status, answers: exam.exam.items.map((i) => i.answer), studentAnswers: exam.exam.items.map((i) => i.studentAnswer), lateStatus: late.status };
  }, API_BASE);
  expect(after.status).toBe('SUBMITTED');
  expect(after.answers).toEqual(['GABARITO-SECRETO-1', 'GABARITO-SECRETO-2', 'GABARITO-SECRETO-3']);
  expect(after.studentAnswers).toEqual(['minha resposta 1', 'minha resposta 2', null]);
  expect(after.lateStatus).toBe(409);
});

test('EXAM-2: after submitting, the result teaches — answer next to gabarito, the why, right/wrong told apart, score only when every item is judged', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Correcao', title: 'Aula correcao', studyDate: '2026-04-01' });
  const specs = [
    ['Enunciado A?', 'Resposta A', 'Porque A explica.'],
    ['Enunciado B?', 'Resposta B', 'Porque B explica.'],
    ['Enunciado C?', 'Resposta C', null],
  ];
  for (const [question, answer, explanation] of specs) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question, answer, explanation, provenance: 'MANUAL' });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula correcao' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  await page.locator('#exam-answer-input').fill('minha A');
  await page.locator('#exam-next-btn').click();
  await page.locator('#exam-answer-input').fill('minha B');
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });

  // the correction: the student's answer beside the gabarito, the why (only where it exists), no score yet
  const items = page.locator('.exam-review-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('.exam-review-student')).toHaveText('minha A');
  await expect(items.nth(0).locator('.exam-review-correct')).toHaveText('Resposta A');
  await expect(items.nth(0).locator('.exam-review-why')).toHaveText('Porque A explica.');
  await expect(items.nth(2).locator('.exam-review-student')).toHaveText('Sem resposta');
  await expect(items.nth(2).locator('.exam-review-why')).toHaveCount(0);
  await expect(page.locator('#exam-result-score')).toBeHidden();
  await expect(page.locator('#exam-submitted-text')).toContainText('0 de 3 corrigidas');
  await expect(items.locator('.exam-review-chip')).toHaveText(['A julgar', 'A julgar', 'A julgar']);

  // judge item by item: right and wrong are told apart by chip + attribute, and there is no score until the last one
  await items.nth(0).locator('.exam-correct-btn').click();
  await expect(items.nth(0)).toHaveAttribute('data-outcome', 'CORRECT');
  await expect(items.nth(0).locator('.exam-review-chip')).toHaveText('Acerto');
  await expect(items.nth(0).locator('.exam-correct-btn')).toBeFocused();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await expect(items.nth(1).locator('.exam-review-chip')).toHaveText('Erro');
  await expect(page.locator('#exam-result-score')).toBeHidden();
  await items.nth(2).locator('.exam-wrong-btn').click();
  await expect(page.locator('#exam-result-score')).toHaveText('1/3 corretas — 33,3%');
  await expect(page.locator('#exam-counts')).toHaveText('Acertos: 1 · Erros: 2');

  // changing one's mind updates the result; leaving and coming back resumes the SAME correction
  await items.nth(2).locator('.exam-correct-btn').click();
  await expect(page.locator('#exam-result-score')).toHaveText('2/3 corretas — 66,7%');
  await page.reload();
  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'Aula correcao' });
  await row2.locator('.plan-expand-btn').click();
  await row2.locator('[data-action="plan-exam"]').click();
  await expect(page.locator('#exam-result-score')).toHaveText('2/3 corretas — 66,7%');
  await expect(page.locator('.exam-review-item').nth(1)).toHaveAttribute('data-outcome', 'INCORRECT');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('mobile 375: the exam fits without horizontal scroll and its controls are touch-sized', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Mobile', title: 'Prova mobile', studyDate: '2026-04-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Q${i}?`, answer: `R${i}`, provenance: 'MANUAL' });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="plan"]:visible').first().click();
  const row = page.locator('.plan-row', { hasText: 'Prova mobile' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const sel of ['#exam-next-btn', '#exam-submit-btn', '#exam-nav button[data-index="0"]']) {
    expect((await page.locator(sel).boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
});
