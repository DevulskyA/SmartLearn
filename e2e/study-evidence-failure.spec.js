import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';

// T-F13-01: the aggregate evidence of a first pass ("Estudar agora") is a request of its own, after every answer was
// already accepted. When it fails the student must be told, keep what was answered and be able to send it again.

const SERVER_PORT = serverPort(13989);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-evidencefail-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'evidence-failure E2E' });
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
  const email = `evidencefail-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
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
});

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}
const evidenceRows = (page, unitId) => page.evaluate(async ({ base, unitId }) => (await (await fetch(`${base}/v1/learning-evidence?unitId=${unitId}`, { credentials: 'include' })).json()).evidence, { base: API_BASE, unitId });
const isEvidencePost = (route) => route.request().method() === 'POST' && /\/v1\/learning-evidence$/.test(new URL(route.request().url()).pathname);

/** Study a 1-question lesson up to the result screen; `beforeResult` runs before the last judgment. */
async function studyOnce(page, title, beforeResult) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Evidência ${title}`, title, studyDate: '2030-01-01' });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} 1?`, answer: 'Certa', provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 1');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-judgment')).toBeVisible();
  await page.waitForTimeout(400); // the attempt is started on the server when the answer is revealed
  await beforeResult();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  return unit;
}

test('T-F13-01: when the evidence request fails the result says so, and sending it again records it once', async ({ page }) => {
  let unit;
  unit = await studyOnce(page, 'Aula evidencia a', async () => {
    await page.route('**/v1/learning-evidence', (route) => (isEvidencePost(route) ? route.abort() : route.continue()));
  });
  await expect(page.locator('#study-now-result-text')).toContainText('1/1 corretas');
  await expect(page.locator('#study-now-evidence-note')).toBeVisible();
  await expect(page.locator('#study-now-evidence-note')).toContainText('ainda não entrou nas suas estatísticas');
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  expect((await evidenceRows(page, unit.id)).length).toBe(0);

  await page.unroute('**/v1/learning-evidence');
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-note')).toHaveText('Resultado registrado nas suas estatísticas.');
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
  const rows = await evidenceRows(page, unit.id);
  expect(rows.length).toBe(1);
  expect(rows[0].questionsCount).toBe(1);
  expect(rows[0].correctCount).toBe(1);
});

test('T-F13-01: if the server received the evidence but the reply was lost, sending it again does not duplicate it', async ({ page }) => {
  const unit = await studyOnce(page, 'Aula evidencia b', async () => {
    let lost = false;
    await page.route('**/v1/learning-evidence', async (route) => {
      if (isEvidencePost(route) && !lost) { lost = true; await route.fetch(); await route.abort(); return; }
      await route.continue();
    });
  });
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  expect((await evidenceRows(page, unit.id)).length).toBe(1); // the server DID record it
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-note')).toHaveText('Resultado registrado nas suas estatísticas.');
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
  expect((await evidenceRows(page, unit.id)).length).toBe(1);
});

test('T-F13-01: a first pass whose evidence is recorded shows no warning', async ({ page }) => {
  await studyOnce(page, 'Aula evidencia c', async () => {});
  await expect(page.locator('#study-now-result-text')).toContainText('1/1 corretas');
  await expect(page.locator('#study-now-evidence-note')).toBeHidden();
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
});

// T-F13-02 / T-F13-03: "Revisar uma por vez" opens the unanswered questions of the review Hoje suggests, one at a time, and closes the
// review with the whole block (answers already given inside the row included).
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function reviewDueToday(page, title, questions = 3) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Revisão ${title}`, title, studyDate: yesterday() }); // review 1 falls due today
  for (let i = 1; i <= questions; i += 1) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-focus-review-btn')).toBeVisible({ timeout: 8000 });
  return unit;
}

test('T-F13-02: a review is answered one question at a time and closes once, with every answer counted', async ({ page }) => {
  const unit = await reviewDueToday(page, 'Aula revisao a');
  await page.locator('#today-focus-review-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Revisão: questão 1 de 3');
  for (const judge of ['#study-now-correct-btn', '#study-now-correct-btn', '#study-now-incorrect-btn']) {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator(judge).click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado da revisão', { timeout: 8000 });
  await expect(page.locator('#study-now-result-text')).toContainText('2/3 corretas na revisão');
  await expect(page.locator('#study-now-retest-btn')).toBeVisible(); // the wrong one can be redone
  const rows = await evidenceRows(page, unit.id);
  expect(rows.length).toBe(1);
  expect(rows[0].questionsCount).toBe(3);
  expect(rows[0].correctCount).toBe(2);
  await page.locator('#study-now-done-btn').click();
  await expect(page.locator('#block-done-today .review-row')).toHaveCount(1, { timeout: 8000 });
  await expect(page.locator('#today-focus-review-btn')).toBeHidden();
});

test('T-F13-02: answers already given inside the Hoje row are kept: the focused review asks only the rest and counts all', async ({ page }) => {
  const unit = await reviewDueToday(page, 'Aula revisao b');
  await page.locator('.review-row [data-action="toggle-row"]').first().click();
  await page.locator('.review-exercise-item [data-action="reveal-answer"]').first().click();
  await page.locator('.review-exercise-item [data-action="exercise-acertei"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('#today-focus-review-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Revisão: questão 1 de 2'); // one of three was already answered
  for (const judge of ['#study-now-incorrect-btn', '#study-now-correct-btn']) {
    await page.locator('#study-now-reveal-btn').click();
    await page.locator(judge).click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#study-now-result-text')).toContainText('2/3 corretas na revisão', { timeout: 8000 }); // 1 inline + 1 right + 1 wrong
  const rows = await evidenceRows(page, unit.id);
  expect(rows.length).toBe(1);
  expect(rows[0].questionsCount).toBe(3);
  expect(rows[0].correctCount).toBe(2);
});

test('T-F13-02: with nothing left to answer the focused review is not offered', async ({ page }) => {
  await reviewDueToday(page, 'Aula revisao c', 1);
  await page.locator('.review-row [data-action="toggle-row"]').first().click();
  await page.locator('.review-exercise-item [data-action="reveal-answer"]').first().click();
  await page.locator('.review-exercise-item [data-action="exercise-acertei"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-focus-review-btn')).toBeHidden({ timeout: 8000 });
});

test('T-F13-03: the final screen lists every wrong answer of the review, those given inside the row too, and redoes them together', async ({ page }) => {
  await reviewDueToday(page, 'Aula revisao d');
  await page.locator('.review-row [data-action="toggle-row"]').first().click();
  await page.locator('.review-exercise-item [data-action="reveal-answer"]').first().click();
  await page.locator('.review-exercise-item [data-action="exercise-errei"]').first().click(); // wrong inside the row
  await page.waitForTimeout(500);
  await page.locator('#today-focus-review-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Revisão: questão 1 de 2');
  for (const judge of ['#study-now-incorrect-btn', '#study-now-correct-btn']) { // one more wrong, one right
    await page.locator('#study-now-reveal-btn').click();
    await page.locator(judge).click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#study-now-result-text')).toContainText('1/3 corretas na revisão', { timeout: 8000 });
  await expect(page.locator('#study-now-errors-list li')).toHaveCount(2); // the one from the row and the one from this screen
  await expect(page.locator('#study-now-retest-btn')).toContainText('2');
  await expect(page.locator('#study-now-next-review-text')).toContainText('Próxima revisão');
});

// PF-03, first slice: Acompanhar was folded into Plano (reviews done/total, period filter, the shortcut to a due review, old links).
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('PF-03: Plano shows how many of the 16 reviews are done and filters lessons by period', async ({ page }) => {
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Plano periodo', title: 'Aula recente', studyDate: daysAgo(2) });
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Plano periodo antiga', title: 'Aula antiga', studyDate: daysAgo(100) });
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(2, { timeout: 8000 });
  await expect(page.locator('#plan-list .plan-row', { hasText: 'Aula recente' }).locator('.plan-unit-meta')).toContainText('/16 revisões');
  await page.evaluate(() => { const select = document.querySelector('#plan-filter-period'); select.value = 'last-30'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(1, { timeout: 8000 });
  await expect(page.locator('#plan-list .plan-row')).toContainText('Aula recente');
});

test('PF-03: a lesson with a review due has a shortcut to it in Plano, and the old Acompanhar link lands in Plano', async ({ page }) => {
  await reviewDueToday(page, 'Aula atalho', 1);
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('#plan-list .plan-row', { hasText: 'Aula atalho' });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-go-to-review"]').click();
  await expect(page.locator('#screen-today')).toBeVisible();
  await expect(page.locator('.review-row').first()).toBeVisible({ timeout: 8000 });
  await page.evaluate(() => { window.location.hash = '#tracking'; });
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.locator('[data-screen="tracking"]')).toHaveCount(0); // no menu item any more
});

test('PF-03: Disciplinas is a panel of Plano (closed by default, opened by the button or the old #subjects link), not a menu item', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('[data-screen="subjects"]')).toHaveCount(0);
  await expect(page.locator('#plan-subjects-panel')).toBeHidden();
  await page.locator('#plan-manage-subjects-btn').click();
  await expect(page.locator('#plan-subjects-panel')).toBeVisible();
  await expect(page.locator('#plan-manage-subjects-btn')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#plan-manage-subjects-btn').click();
  await expect(page.locator('#plan-subjects-panel')).toBeHidden();
  await page.evaluate(() => { window.location.hash = '#subjects'; });
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.locator('#plan-subjects-panel')).toBeVisible();
});

// H-T04 (kit audit): the evidence request failed and the student leaves the result without sending it again. The result screen was the
// only place with the "send again" control, so leaving must not drop the result silently: it is either sent on the way out or still reachable.
test('H-T04: leaving the result with evidence unsent does not lose it', async ({ page }) => {
  const unit = await studyOnce(page, 'Aula evidencia d', async () => {
    await page.route('**/v1/learning-evidence', (route) => (isEvidencePost(route) ? route.abort() : route.continue()));
  });
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  expect((await evidenceRows(page, unit.id)).length).toBe(0);

  await page.unroute('**/v1/learning-evidence'); // the connection is back by the time the student leaves
  await page.locator('#study-now-done-btn').click();
  await expect(page.locator('[data-screen="today"][aria-current="page"], [data-screen="today"].is-active')).toBeVisible();
  await expect(async () => {
    const recorded = (await evidenceRows(page, unit.id)).length === 1;
    const stillOffered = await page.locator('#study-now-evidence-retry-btn').isVisible();
    expect(recorded || stillOffered, 'the unsent result must be sent on the way out or still be offered').toBe(true);
  }).toPass({ timeout: 4000 });
});
