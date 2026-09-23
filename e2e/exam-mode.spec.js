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

test('EXAM-3: the corrected result enters the history exactly once, shows up as "para reforçar", and leads to a redo that does not inflate the evidence', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Ciclo', title: 'Aula ciclo', studyDate: '2026-04-01' });
  for (const i of [1, 2, 3]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Ciclo ${i}?`, answer: `Certa ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
  const evidenceOf = () => page.evaluate(async ({ base, unitId }) => (await (await fetch(`${base}/v1/learning-evidence?unitId=${unitId}`, { credentials: 'include' })).json()).evidence, { base: API_BASE, unitId: unit.id });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula ciclo' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  for (let i = 0; i < 3; i += 1) {
    await page.locator('#exam-answer-input').fill(`resp ${i + 1}`);
    if (i < 2) await page.locator('#exam-next-btn').click();
  }
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });

  // nothing is history until the correction is finished
  expect(await evidenceOf()).toHaveLength(0);
  const items = page.locator('.exam-review-item');
  await items.nth(0).locator('.exam-correct-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await expect(page.locator('#exam-finalize-btn')).toBeHidden();
  await items.nth(2).locator('.exam-correct-btn').click();
  await expect(page.locator('#exam-result-score')).toHaveText('2/3 corretas — 66,7%');
  await expect(page.locator('#exam-finalize-btn')).toBeVisible();

  // register the result: ONE aggregate evidence row with the right counts; the judgements become final
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toContainText('Resultado registrado no seu histórico (2/3)');
  await expect(page.locator('#exam-finalize-btn')).toBeHidden();
  await expect(items.nth(0).locator('.exam-correct-btn')).toBeDisabled();
  const evidence = await evidenceOf();
  expect(evidence).toHaveLength(1);
  expect(evidence[0]).toMatchObject({ type: 'INITIAL_PRACTICE', questionsCount: 3, correctCount: 2 });

  // the wrong item is a real signal elsewhere (the same one Plano/Hoje use): last attempt wrong = "para reforçar"
  const reinforcement = () => page.evaluate(async (base) => (await (await fetch(`${base}/v1/reinforcement`, { credentials: 'include' })).json()).byUnit, API_BASE);
  expect(Object.values(await reinforcement()).flat()).toHaveLength(1);

  // ...and the result leads on: redo the error right here (a redo is recovery, NOT new evidence)
  await expect(page.locator('#exam-retest-btn')).toHaveText('Refazer erros (1)');
  await page.locator('#exam-retest-btn').click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  await expect(page.locator('#study-now-question-text')).toHaveText('Ciclo 2?');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos', { timeout: 8000 });
  expect(await evidenceOf()).toHaveLength(1);
  expect(Object.values(await reinforcement()).flat()).toHaveLength(0);

  // the history shows it in Plano too, and a NEW exam can be started now that the last one is corrected
  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'Aula ciclo' });
  await row2.locator('.plan-expand-btn').click();
  await expect(row2.locator('.plan-reinforce-chip')).toHaveCount(0);
  await row2.locator('[data-action="plan-exam"]').click();
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 3');
  await expect(page.locator('#exam-answer-input')).toHaveValue('');
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

test('EXAM-5: the Plano history tells a Prova from a study pass, and an exam does not hide "Estudar agora"', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Rotulo', title: 'Aula rotulo', studyDate: '2026-04-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Rot ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });

  // 1) an exam only: the history says "Prova" and the student can still study on demand
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula rotulo' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  await page.locator('#exam-answer-input').fill('a');
  await page.locator('#exam-next-btn').click();
  await page.locator('#exam-answer-input').fill('b');
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  const items = page.locator('.exam-review-item');
  await items.nth(0).locator('.exam-correct-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toBeVisible();

  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'Aula rotulo' });
  await row2.locator('.plan-expand-btn').click();
  const history = row2.locator('.plan-evidence-list li');
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText('Prova: 1/2');
  await expect(history.first()).not.toContainText('Prática inicial');
  await expect(row2.locator('[data-action="plan-study-now"]')).toBeVisible();

  // 2) then a study pass: it is its own line, labeled "Prática inicial", and only NOW does the button go away
  await row2.locator('[data-action="plan-study-now"]').click();
  for (const outcome of ['correct', 'correct']) {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator(`#study-now-${outcome}-btn`).click();
  }
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  await page.locator('#study-now-done-btn').click();
  await page.locator('[data-screen="plan"]').click();
  const row3 = page.locator('.plan-row', { hasText: 'Aula rotulo' });
  await row3.locator('.plan-expand-btn').click();
  const history2 = row3.locator('.plan-evidence-list li');
  await expect(history2).toHaveCount(2);
  await expect(history2.filter({ hasText: 'Prova: 1/2' })).toHaveCount(1);
  await expect(history2.filter({ hasText: 'Prática inicial: 2/2' })).toHaveCount(1);
  await expect(row3.locator('[data-action="plan-study-now"]')).toHaveCount(0);
});

test('EXAM-4: a discipline exam mixes the units, shows no gabarito before submitting, and the result becomes one evidence row PER unit', async ({ page }) => {
  const a = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Disciplina Prova', title: 'Aula A', studyDate: '2026-04-01' });
  const b = await apiCall(page, '/v1/learning-units', { subjectId: a.unit.subjectId, title: 'Aula B', studyDate: '2026-04-01' });
  for (const [unit, tag] of [[a.unit, 'A'], [b.unit, 'B']]) {
    for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Enun ${tag}${i}?`, answer: `GABARITO-${tag}${i}`, explanation: `PORQUE-${tag}${i}`, provenance: 'MANUAL' });
  }
  const evidenceOf = (unitId) => page.evaluate(async ({ base, unitId }) => (await (await fetch(`${base}/v1/learning-evidence?unitId=${unitId}`, { credentials: 'include' })).json()).evidence, { base: API_BASE, unitId });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula A' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-subject-exam"]').click();
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 4');
  await expect(page.locator('#title-exam')).toHaveText('Prova — Disciplina Prova');
  const seen = new Set();
  for (let i = 0; i < 4; i += 1) {
    seen.add(await page.locator('#exam-question-text').innerText());
    const screen = await page.locator('#screen-exam').innerText();
    expect(screen).not.toMatch(/GABARITO|PORQUE/);
    await page.locator('#exam-answer-input').fill(`r${i + 1}`);
    if (i < 3) await page.locator('#exam-next-btn').click();
  }
  expect([...seen].sort()).toEqual(['Enun A1?', 'Enun A2?', 'Enun B1?', 'Enun B2?']); // both units are in the exam
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });

  // correction: each item says which class it came from; the gabarito/why are there only now
  const items = page.locator('.exam-review-item');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0).locator('.exam-review-unit')).toHaveText('Aula: Aula A');
  await expect(items.nth(3).locator('.exam-review-unit')).toHaveText('Aula: Aula B');
  await expect(items.nth(0).locator('.exam-review-correct')).toHaveText('GABARITO-A1');
  await items.nth(0).locator('.exam-wrong-btn').click();
  for (const i of [1, 2, 3]) await items.nth(i).locator('.exam-correct-btn').click();
  await expect(page.locator('#exam-result-score')).toHaveText('3/4 corretas — 75,0%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toContainText('Resultado registrado no seu histórico (3/4), por aula (2)');
  // one evidence row PER unit, each counting only its own questions
  const evA = await evidenceOf(a.unit.id);
  const evB = await evidenceOf(b.unit.id);
  expect(evA).toHaveLength(1);
  expect(evB).toHaveLength(1);
  expect([evA[0].questionsCount, evA[0].correctCount, evA[0].origin]).toEqual([2, 1, 'EXAM']);
  expect([evB[0].questionsCount, evB[0].correctCount, evB[0].origin]).toEqual([2, 2, 'EXAM']);

  // the wrong item is redone from the result (a redo is recovery, not new evidence), and the history says "Prova"
  await expect(page.locator('#exam-retest-btn')).toHaveText('Refazer erros (1)');
  await page.locator('#exam-retest-btn').click();
  await expect(page.locator('#study-now-question-text')).toHaveText('Enun A1?');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos', { timeout: 8000 });
  expect(await evidenceOf(a.unit.id)).toHaveLength(1);
  await page.locator('[data-screen="plan"]').click();
  const rowB = page.locator('.plan-row', { hasText: 'Aula B' });
  await rowB.locator('.plan-expand-btn').click();
  await expect(rowB.locator('.plan-evidence-list li')).toContainText('Prova: 2/2');
});

test('UX-1: Plano action buttons are spaced apart (also at 375), and once the result is registered the Acertei/Errei buttons are gone', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Visual', title: 'Aula visual', studyDate: '2026-04-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Vis ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });

  const gaps = async () => {
    const boxes = await page.locator('.plan-row', { hasText: 'Aula visual' }).locator('.plan-exercise-actions button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
    expect(boxes.length).toBe(3);
    for (let i = 1; i < boxes.length; i += 1) {
      const horizontal = boxes[i].l - boxes[i - 1].r; // same line: needs a visible gap
      const vertical = boxes[i].t - boxes[i - 1].b;   // wrapped to a new line: needs a gap too
      expect(Math.max(horizontal, vertical)).toBeGreaterThanOrEqual(6);
    }
  };
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('[data-screen="plan"]:visible').first().click();
    const row = page.locator('.plan-row', { hasText: 'Aula visual' });
    // Plano re-renders after it loads: an "expanded?" read taken before that describes a row that is about to be
    // replaced. Retry the read+expand until the three action buttons really exist.
    await expect(async () => {
      if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded', { timeout: 1500 })) !== 'true') await row.locator('.plan-expand-btn').click({ timeout: 1500 });
      await expect(row.locator('.plan-exercise-actions button')).toHaveCount(3, { timeout: 1500 });
    }).toPass({ timeout: 15000 });
    await gaps();
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  const row = page.locator('.plan-row', { hasText: 'Aula visual' });
  await row.locator('[data-action="plan-exam"]').click();
  await page.locator('#exam-answer-input').fill('a');
  await page.locator('#exam-next-btn').click();
  await page.locator('#exam-answer-input').fill('b');
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  const items = page.locator('.exam-review-item');
  await expect(items.nth(0).locator('.exam-judge')).toBeVisible();
  for (const i of [0, 1]) await items.nth(i).locator('.exam-correct-btn').click();
  await expect(items.nth(0).locator('.exam-judge')).toBeVisible(); // still editable until the result is registered
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toBeVisible();
  await expect(items.nth(0).locator('.exam-judge')).toBeHidden(); // final: no buttons that look live but do nothing
  await expect(items.nth(0).locator('.exam-review-chip')).toHaveText('Acerto'); // the outcome is still shown as a label
});

test('ATTEMPT-1: reviewing an exam in Exercícios resolvidos shows what the student wrote next to the gabarito', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Revisao', title: 'Aula revisao', studyDate: '2026-04-01' });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: 'Rev 1?', answer: 'GABARITO-REV-1', provenance: 'MANUAL' });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: 'Rev 2?', answer: 'GABARITO-REV-2', provenance: 'MANUAL' });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula revisao' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();
  await page.locator('#exam-answer-input').fill('<b>o que eu escrevi</b>');
  await page.locator('#exam-next-btn').click(); // the second question stays unanswered
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  const items = page.locator('.exam-review-item');
  await items.nth(0).locator('.exam-wrong-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toBeVisible();

  await page.locator('[data-screen="stats"]').click();
  const statsRow = page.locator('#exercise-notes-body .exercise-row', { hasText: 'Aula revisao' });
  await expect(statsRow).toBeVisible({ timeout: 8000 });
  await statsRow.click();
  const dialog = page.locator('#exercise-detail-dialog');
  await expect(dialog).toBeVisible();
  const attempts = dialog.locator('.exercise-attempt-item');
  await expect(attempts).toHaveCount(2);
  await expect(attempts.nth(0).locator('.exercise-attempt-student')).toHaveText('Sua resposta na prova: <b>o que eu escrevi</b>'); // shown as TEXT, never as HTML
  await expect(attempts.nth(0).locator('.exercise-attempt-answer')).toHaveText('Gabarito: GABARITO-REV-1');
  await expect(attempts.nth(1).locator('.exercise-attempt-student')).toHaveText('Sua resposta na prova: sem resposta');
  await expect(dialog.locator('b')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('EXAM-6: an answer that could not be saved is never lost or silently skipped — it is retried, and submitting is blocked until everything is saved', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Rede', title: 'Aula rede', studyDate: '2026-04-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Rede ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula rede' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').click();

  // the connection drops while answering: saving the answers fails
  await page.route('**/v1/exams/*/items/*/answer', (route) => route.abort());
  await page.locator('#exam-answer-input').fill('resp 1');
  await page.locator('#exam-next-btn').click();
  await expect(page.locator('#exam-message')).toContainText('Não foi possível guardar');
  await page.locator('#exam-answer-input').fill('resp 2');

  // submitting while answers are unsaved is refused with a plain explanation (nothing is silently dropped)
  await page.locator('#exam-submit-btn').click();
  await expect(page.locator('#exam-submit-warning')).toContainText('não foram guardadas');
  await expect(page.locator('#exam-submit-confirm-btn')).toBeHidden();

  // the connection returns: the same click now saves both answers and proceeds to the confirmation
  await page.unroute('**/v1/exams/*/items/*/answer');
  await page.locator('#exam-submit-btn').click();
  await expect(page.locator('#exam-submit-confirm-btn')).toBeVisible({ timeout: 8000 });
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });
  const items = page.locator('.exam-review-item');
  await expect(items.nth(0).locator('.exam-review-student')).toHaveText('resp 1');
  await expect(items.nth(1).locator('.exam-review-student')).toHaveText('resp 2');
});

test('ACCESS-1: the whole exam works with the keyboard alone, and assistive tech gets the question, the progress and distinct button names', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Prova Teclado', title: 'Aula teclado', studyDate: '2026-04-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Teclado ${i}?`, answer: `Certa ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Aula teclado' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-exam"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 2');

  // the answer box is described by the question and the progress (a screen-reader user hears them on focus)
  await page.locator('#exam-answer-input').focus();
  const description = await page.locator('#exam-answer-input').evaluate((el) => el.getAttribute('aria-describedby'));
  expect(description).toBeTruthy();
  const described = await page.locator('#exam-answer-input').evaluate((el) => el.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
  expect(described).toContain('Teclado 1?');
  expect(described).toContain('Questão 1 de 2');

  // keyboard only: type, Tab to "Próxima", Enter; focus lands back in the answer box on the next question
  await page.keyboard.type('resp 1');
  await page.keyboard.press('Tab'); // (Anterior is disabled on the first question) -> Próxima
  await expect(page.locator('#exam-next-btn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-progress')).toHaveText('Questão 2 de 2');
  await expect(page.locator('#exam-answer-input')).toBeFocused();
  await page.keyboard.type('resp 2');

  // the numbered nav is a named list; the current question is marked
  await expect(page.locator('#exam-nav')).toHaveAttribute('aria-label', 'Questões da prova');
  await expect(page.locator('#exam-nav [aria-current="true"]')).toHaveAttribute('aria-label', /questão 2/i);

  // submit and confirm with the keyboard; focus goes to the confirmation, then to the correction heading
  await page.locator('#exam-submit-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-submit-confirm-btn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-submitted-title')).toBeFocused({ timeout: 8000 });

  // each judge button has its OWN accessible name (two "Acertei" in a row tell a screen reader nothing)
  const names = await page.locator('.exam-review-item [data-action="exam-judge"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()));
  expect(new Set(names).size).toBe(names.length);
  expect(names[0]).toMatch(/Acertei.*1/);
  expect(names[1]).toMatch(/Errei.*1/);

  // judge with Space, register with Enter, all from the keyboard
  await page.locator('.exam-review-item').nth(0).locator('.exam-correct-btn').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.exam-review-item').nth(0).locator('.exam-correct-btn')).toBeFocused();
  await page.locator('.exam-review-item').nth(1).locator('.exam-wrong-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-finalize-btn')).toBeVisible();
  await page.locator('#exam-finalize-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exam-final-note')).toContainText('Resultado registrado');
});
