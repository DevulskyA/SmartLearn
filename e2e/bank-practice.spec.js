import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// PRACTICE FROM THE STUDENT'S OWN BANK: at the end of a block in "Estudar agora" the student can practise questions of OTHER lessons that
// look like this one. It is extra practice: no review task, no aggregate evidence for the borrowed lessons, schedule untouched.

const SERVER_PORT = serverPort(13985);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-bank-practice-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'bank-practice E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  await signInRegistered(page, { email: `bank-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

async function addLesson(page, { subject, title, question, answer, firstOfSubject }) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  if (firstOfSubject) {
    await page.locator('#show-subject-form').click();
    await page.locator('#new-subject-input').fill(subject);
    await page.locator('#new-subject-form button[type="submit"]').click();
  }
  await page.locator('#study-date').fill('2026-04-01');
  await page.locator('#study-content').fill(title);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: title });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  await studyRow.locator('.exercise-question-input').fill(question);
  await studyRow.locator('.exercise-answer-input').fill(answer);
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.getByText(question)).toBeVisible({ timeout: 5000 });
}

async function studyNow(page, title) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
}

const apiGet = (page, path) => page.evaluate(async ({ base, path: p }) => (await fetch(`${base}${p}`, { credentials: 'include' })).json(), { base: API_BASE, path });

test('after a block, a similar question of ANOTHER lesson is offered as extra practice that leaves the review schedule untouched', async ({ page }) => {
  await addLesson(page, { subject: 'Fisiologia Banco', title: 'Filtração glomerular', question: 'Pergunta da aula A sobre filtração glomerular?', answer: 'Resposta A', firstOfSubject: true });
  await addLesson(page, { subject: 'Fisiologia Banco', title: 'Filtração e reabsorção tubular', question: 'Pergunta da aula B sobre filtração tubular?', answer: 'Resposta B', firstOfSubject: false });
  const units = (await apiGet(page, '/v1/learning-units')).units;
  const lessonB = units.find((u) => u.title === 'Filtração e reabsorção tubular');
  const reviewsBefore = JSON.stringify((await apiGet(page, '/v1/review-tasks')).reviewTasks);

  await studyNow(page, 'Filtração glomerular');
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta da aula A sobre filtração glomerular?');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });

  const bankBtn = page.locator('#study-now-bank-btn');
  await expect(bankBtn).toBeVisible({ timeout: 5000 });
  await expect(bankBtn).toHaveText('Praticar mais com o seu banco (1)');
  await expect(page.locator('#study-now-bank-hint')).toBeVisible();

  await bankBtn.click();
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta da aula B sobre filtração tubular?');
  await expect(page.locator('#study-now-progress')).toHaveText('Pergunta 1 de 1 do seu banco');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-answer-text')).toContainText('Resposta B');
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado da prática com o seu banco');
  await expect(page.locator('#study-now-result-text')).toHaveText('1 de 1 corretas');
  await expect(page.locator('#study-now-next-review-text')).toHaveText('Sua agenda de revisões não foi alterada.');
  await expect(bankBtn).toBeHidden();

  // the answer is a real attempt on lesson B, but nothing else moved: no review task attached, no schedule change, no aggregate evidence for B
  expect(JSON.stringify((await apiGet(page, '/v1/review-tasks')).reviewTasks)).toBe(reviewsBefore);
  expect((await apiGet(page, `/v1/learning-evidence?unitId=${lessonB.id}`)).evidence).toEqual([]);
});

test('when no other lesson looks similar, no extra practice is offered', async ({ page }) => {
  await addLesson(page, { subject: 'Solo Banco', title: 'Potencial de ação cardíaco', question: 'Pergunta solitária?', answer: 'Resposta', firstOfSubject: true });
  await studyNow(page, 'Potencial de ação cardíaco');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#study-now-done-btn')).toBeVisible();
  await expect(page.locator('#study-now-bank-btn')).toBeHidden();
});
