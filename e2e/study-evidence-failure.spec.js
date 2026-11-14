import { test, expect, request as pwRequest } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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

let creds;
test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `evidencefail-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  creds = { email, password };
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

async function revealStudyQuestion(page) {
  const started = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && /\/v1\/exercises\/\d+\/attempts$/.test(url.pathname) && response.ok();
  });
  await page.locator('#study-now-reveal-btn').click();
  await started;
}

async function judgeStudyQuestion(page, selector) {
  const previousProgress = await page.locator('#study-now-progress').textContent();
  await page.locator(selector).click();
  await expect(async () => {
    const progress = await page.locator('#study-now-progress').textContent();
    const resultVisible = await page.locator('#study-now-result-card').isVisible();
    expect(progress !== previousProgress || resultVisible).toBe(true);
  }).toPass({ timeout: 8000 });
}

async function judgeInlineReviewItem(page, selector) {
  const submitted = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && /\/v1\/attempts\/\d+\/submit$/.test(url.pathname);
  });
  const button = page.locator(selector).first();
  await button.click();
  await expect.poll(() => button.evaluate((element) => element.closest('.review-exercise-item')?.dataset.exerciseAnswered)).toBe('true');
  await submitted;
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
  await revealStudyQuestion(page);
  await expect(page.locator('#study-now-judgment')).toBeVisible();
  await beforeResult();
  await judgeStudyQuestion(page, '#study-now-correct-btn');
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
  expect(await evidenceRows(page, unit.id)).toHaveLength(0);

  await page.unroute('**/v1/learning-evidence');
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-note')).toHaveText('Resultado registrado nas suas estatísticas.');
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
  const rows = await evidenceRows(page, unit.id);
  expect(rows).toHaveLength(1);
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
  expect(await evidenceRows(page, unit.id)).toHaveLength(1); // the server DID record it
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-note')).toHaveText('Resultado registrado nas suas estatísticas.');
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
  expect(await evidenceRows(page, unit.id)).toHaveLength(1);
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
    await revealStudyQuestion(page);
    await judgeStudyQuestion(page, judge);
  }
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado da revisão', { timeout: 8000 });
  await expect(page.locator('#study-now-result-text')).toContainText('2/3 corretas na revisão');
  await expect(page.locator('#study-now-retest-btn')).toBeVisible(); // the wrong one can be redone
  const rows = await evidenceRows(page, unit.id);
  expect(rows).toHaveLength(1);
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
  await judgeInlineReviewItem(page, '.review-exercise-item [data-action="exercise-acertei"]');
  await page.locator('#today-focus-review-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Revisão: questão 1 de 2'); // one of three was already answered
  for (const judge of ['#study-now-incorrect-btn', '#study-now-correct-btn']) {
    await revealStudyQuestion(page);
    await judgeStudyQuestion(page, judge);
  }
  await expect(page.locator('#study-now-result-text')).toContainText('2/3 corretas na revisão', { timeout: 8000 }); // 1 inline + 1 right + 1 wrong
  const rows = await evidenceRows(page, unit.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].questionsCount).toBe(3);
  expect(rows[0].correctCount).toBe(2);
});

test('T-F13-02: with nothing left to answer the focused review is not offered', async ({ page }) => {
  await reviewDueToday(page, 'Aula revisao c', 1);
  await page.locator('.review-row [data-action="toggle-row"]').first().click();
  await page.locator('.review-exercise-item [data-action="reveal-answer"]').first().click();
  await judgeInlineReviewItem(page, '.review-exercise-item [data-action="exercise-acertei"]');
  await page.locator('[data-screen="plan"]').click();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-focus-review-btn')).toBeHidden({ timeout: 8000 });
});

test('T-F13-03: the final screen lists every wrong answer of the review, those given inside the row too, and redoes them together', async ({ page }) => {
  await reviewDueToday(page, 'Aula revisao d');
  await page.locator('.review-row [data-action="toggle-row"]').first().click();
  await page.locator('.review-exercise-item [data-action="reveal-answer"]').first().click();
  await judgeInlineReviewItem(page, '.review-exercise-item [data-action="exercise-errei"]'); // wrong inside the row
  await page.locator('#today-focus-review-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Revisão: questão 1 de 2');
  for (const judge of ['#study-now-incorrect-btn', '#study-now-correct-btn']) { // one more wrong, one right
    await revealStudyQuestion(page);
    await judgeStudyQuestion(page, judge);
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
  expect(await evidenceRows(page, unit.id)).toHaveLength(0);

  await page.unroute('**/v1/learning-evidence'); // the connection is back by the time the student leaves
  await page.locator('#study-now-done-btn').click();
  await expect(page.locator('[data-screen="today"][aria-current="page"], [data-screen="today"].is-active')).toBeVisible();
  await expect(async () => {
    const recorded = (await evidenceRows(page, unit.id)).length === 1;
    const stillOffered = await page.locator('#study-now-evidence-retry-btn').isVisible();
    expect(recorded || stillOffered, 'the unsent result must be sent on the way out or still be offered').toBe(true);
  }).toPass({ timeout: 4000 });
});

// Lote 2026-11-08, item 1: the evidence of a finished block is the only copy of "this block was practiced" until the server has it. It used to live in ONE
// variable that startStudyNow() (via resetStudyNowResult) wiped, and that a late reply of an earlier send cleared again. These tests start another study
// after a failure, with the reply lost, with a slow earlier send, and across accounts. The request body carries the operationKey: it must be the same on
// every resend of one block (that is what makes a resend harmless), and different between blocks.
const bodyOf = (route) => route.request().postDataJSON() ?? {};
const keysFor = (sent, unitId) => sent.filter((s) => s.unitId === unitId).map((s) => s.key);

async function loginAs(page, { email, password }) {
  await page.locator('[data-screen="account"]:visible').first().click();
  if (await page.locator('#account-logged-in-view').isVisible()) {
    await page.locator('#account-logout-btn').click();
    await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 10000 });
  }
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 15000 });
}

test('LOSS-1: evidence that failed BEFORE the write survives leaving and studying another lesson, and is recorded once under its original key', async ({ page }) => {
  const sent = [];
  let offline = true;
  await page.route('**/v1/learning-evidence', async (route) => {
    if (!isEvidencePost(route)) return route.continue();
    sent.push({ unitId: bodyOf(route).unitId, key: bodyOf(route).operationKey });
    return offline ? route.abort() : route.continue();
  });
  const a = await studyOnce(page, 'Aula perda a', async () => {});
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  await page.locator('#study-now-done-btn').click(); // the send on the way out fails too
  offline = false; // the connection is back; the student starts another lesson (this is what used to wipe the pending evidence of A)
  const b = await studyOnce(page, 'Aula perda b', async () => {});
  await expect(async () => { expect((await evidenceRows(page, a.id)).length, 'the first block was recorded after the connection came back').toBe(1); }).toPass({ timeout: 8000 });
  expect(await evidenceRows(page, b.id)).toHaveLength(1);
  const keysA = keysFor(sent, a.id);
  expect(keysA.length, 'A was sent more than once').toBeGreaterThan(1);
  expect(new Set(keysA).size, 'every resend of A carries the same operationKey').toBe(1);
  expect(keysA[0]).toBeTruthy();
  expect(keysFor(sent, b.id)[0]).not.toBe(keysA[0]);
});

test('LOSS-2: evidence recorded by the server whose REPLY was lost is not duplicated by the later resend', async ({ page }) => {
  const sent = [];
  let firstA = true;
  let offline = true;
  await page.route('**/v1/learning-evidence', async (route) => {
    if (!isEvidencePost(route)) return route.continue();
    const { unitId, operationKey } = bodyOf(route);
    sent.push({ unitId, key: operationKey });
    if (firstA) { firstA = false; await route.fetch(); return route.abort(); } // recorded, reply lost
    return offline ? route.abort() : route.continue();
  });
  const a = await studyOnce(page, 'Aula perda c', async () => {});
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  expect((await evidenceRows(page, a.id)).length, 'the server DID record it').toBe(1);
  await page.locator('#study-now-done-btn').click();
  offline = false;
  const b = await studyOnce(page, 'Aula perda d', async () => {});
  await expect(async () => { expect(keysFor(sent, a.id).length, 'A was sent again after the lost reply').toBeGreaterThan(1); }).toPass({ timeout: 8000 });
  expect((await evidenceRows(page, a.id)).length, 'no duplicate row').toBe(1);
  expect(await evidenceRows(page, b.id)).toHaveLength(1);
  expect(new Set(keysFor(sent, a.id)).size).toBe(1);
});

test('LOSS-3: a late reply of an earlier send does not clear the pending evidence of a newer block', async ({ page }) => {
  let releaseA;
  const gateA = new Promise((resolve) => { releaseA = resolve; });
  let aUnit = null;
  let aAttempts = 0;
  let bOffline = true;
  await page.route('**/v1/learning-evidence', async (route) => {
    if (!isEvidencePost(route)) return route.continue();
    const { unitId } = bodyOf(route);
    // A's unit id is only known after studyOnce() created it: the first send of A (aUnit still null) is treated like any offline send
    if (aUnit === null) return route.abort();
    if (unitId === aUnit) {
      aAttempts += 1;
      await gateA; // the send of A on the way out is slow: it answers only after B has finished
      return route.continue();
    }
    return bOffline ? route.abort() : route.continue();
  });
  const unitA = await studyOnce(page, 'Aula perda e', async () => {});
  aUnit = unitA.id;
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  await page.locator('#study-now-done-btn').click(); // exit send of A: held by the gate
  const unitB = await studyOnce(page, 'Aula perda f', async () => {});
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible(); // B failed
  releaseA(); // A's slow send now succeeds and answers
  await expect(async () => { expect(await evidenceRows(page, unitA.id)).toHaveLength(1); }).toPass({ timeout: 8000 });
  await expect(page.locator('#study-now-evidence-retry-btn'), "A's late reply must not hide the retry of B").toBeVisible();
  bOffline = false;
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(async () => { expect((await evidenceRows(page, unitB.id)).length, 'B was recorded by the retry').toBe(1); }).toPass({ timeout: 8000 });
  expect(await evidenceRows(page, unitA.id)).toHaveLength(1);
  expect(aAttempts).toBeGreaterThan(0);
});

test('LOSS-4: pending evidence is never sent under another account, and is sent when its own account is back', async ({ page }) => {
  const first = { ...creds };
  const sent = [];
  let offline = true;
  await page.route('**/v1/learning-evidence', async (route) => {
    if (!isEvidencePost(route)) return route.continue();
    sent.push({ unitId: bodyOf(route).unitId, key: bodyOf(route).operationKey });
    return offline ? route.abort() : route.continue();
  });
  const a = await studyOnce(page, 'Aula perda g', async () => {});
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  const second = { email: `evidencefail-2-${Date.now()}@example.com`, password: first.password };
  // a request context of its own: page.request would carry the signed-in first student's cookies (and be refused)
  const anonymous = await pwRequest.newContext();
  const registered = await anonymous.post(`${API_BASE}/v1/auth/register`, { data: second, headers: { Origin: VITE_ORIGIN } });
  const registeredText = await registered.text();
  await anonymous.dispose();
  expect(registered.ok(), `registering the second student: ${registered.status()} ${registeredText}`).toBeTruthy();
  await loginAs(page, second); // still offline
  const sentBeforeSecondStudy = sent.length;
  offline = false;
  const b = await studyOnce(page, 'Aula perda h', async () => {});
  expect(await evidenceRows(page, b.id)).toHaveLength(1);
  expect(keysFor(sent.slice(sentBeforeSecondStudy), a.id), "the first student's evidence was sent under the second account").toEqual([]);
  // the first student comes back: their pending evidence is sent without studying again
  await loginAs(page, first);
  await expect(async () => { expect(await evidenceRows(page, a.id)).toHaveLength(1); }).toPass({ timeout: 8000 });
});


async function openStudyFromPlan(page, title) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible();
  const start = row.locator('[data-action="plan-study-now"]');
  if (!await start.isVisible()) await row.locator('.plan-expand-btn').click();
  await start.click();
}

test('EVIDENCE-RECOVERY: a new block preserves a failed result without blocking study', async ({ page }) => {
  const sent = [];
  const unit = await studyOnce(page, 'Pending original', async () => {
    await page.route('**/v1/learning-evidence', (route) => {
      if (!isEvidencePost(route)) return route.continue();
      sent.push(route.request().postDataJSON());
      return route.abort();
    });
  });
  const { unit: other } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Other evidence', title: 'Other pending lesson', studyDate: '2030-01-01' });
  await apiCall(page, `/v1/learning-units/${other.id}/exercises`, { question: 'Other?', answer: 'Yes', provenance: 'MANUAL' });
  await openStudyFromPlan(page, other.title);
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 1');
  await expect(page.locator('#study-now-reveal-btn')).toBeVisible();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible();
  await expect(page.locator('#study-now-result-card')).toBeVisible();
  // the original block was sent again when the new one started, always under its first key; the new block is attempted too (a failing
  // item does not hold back the one behind it)
  const ofOriginal = sent.filter((body) => body.unitId === unit.id);
  expect(ofOriginal.length).toBeGreaterThanOrEqual(2);
  expect(new Set(ofOriginal.map((body) => body.operationKey)).size).toBe(1);
  expect(sent.some((body) => body.unitId === other.id)).toBe(true);
  await page.unroute('**/v1/learning-evidence');
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden();
  const originalRows = await evidenceRows(page, unit.id);
  const otherRows = await evidenceRows(page, other.id);
  expect(originalRows).toHaveLength(1);
  expect(otherRows).toHaveLength(1);
  expect(originalRows[0].correctCount).toBe(1);
  expect(otherRows[0].correctCount).toBe(0);
});

test('EVIDENCE-RECOVERY: reload retains a failed result and a lost reply replays once', async ({ page }) => {
  let original;
  const unit = await studyOnce(page, 'Pending reload', async () => {
    await page.route('**/v1/learning-evidence', (route) => {
      if (!isEvidencePost(route)) return route.continue();
      original = route.request().postDataJSON();
      return route.abort();
    });
  });
  await page.reload();
  await expect(page.locator('[data-screen="plan"]')).toBeVisible();
  await openStudyFromPlan(page, unit.title);
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 1');
  await expect(page.locator('#study-now-evidence-note')).toHaveJSProperty('hidden', false);
  await page.unroute('**/v1/learning-evidence');
  const replayed = [];
  let lost = false;
  await page.route('**/v1/learning-evidence', async (route) => {
    if (!isEvidencePost(route)) return route.continue();
    replayed.push(route.request().postDataJSON());
    if (!lost) { lost = true; await route.fetch(); return route.abort(); }
    return route.continue();
  });
  const failedAcknowledgement = page.waitForEvent('console', { predicate: (message) => message.type() === 'error' && message.text().startsWith('Falha ao registrar evidência de prática inicial.') });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await failedAcknowledgement;
  await expect.poll(async () => (await evidenceRows(page, unit.id)).length).toBe(1);
  // Wait until the failed acknowledgement has left the item queued before retrying.
  await expect(page.locator('#study-now-evidence-note')).toHaveJSProperty('hidden', false);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('smartlearn.pending-study-evidence.')).length)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('smartlearn.pending-study-evidence.')).length)).toBe(0);
  expect(replayed).toEqual([original, original]);
  expect(await evidenceRows(page, unit.id)).toHaveLength(1);
});

// A review concluded through the experimental panel carries the stage it practised (expectedReviewTaskId). When the server already holds a
// DIFFERENT conclusion of that stage (another window, another device), the same result can never be applied: it answers 409 IDEMPOTENCY_CONFLICT.
// That pending item must not stay in the queue asking for "send again" forever, nor be dropped without telling the student, nor be counted twice.
test('REJECTED-1: a review result the server can no longer apply is shown as such, leaves the queue, and is not counted twice', async ({ page }) => {
  const unit = await reviewDueToday(page, 'Aula rejeitada a', 3);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('#experiment-switch').check();
  await page.locator('[data-screen="today"]').click();
  const panel = page.locator('#experiment-host .experiment-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  let offline = true;
  const attempts = [];
  await page.route('**/v1/review-obligations/*/complete', (route) => {
    attempts.push(route.request().postDataJSON());
    return offline ? route.abort() : route.continue();
  });
  await panel.locator('li', { hasText: 'Aula rejeitada a' }).getByRole('button', { name: 'Fazer a revisão' }).click();
  for (const judge of ['#study-now-correct-btn', '#study-now-correct-btn', '#study-now-correct-btn']) {
    await revealStudyQuestion(page);
    await judgeStudyQuestion(page, judge);
  }
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible({ timeout: 8000 });
  expect(attempts.length).toBeGreaterThan(0);
  // meanwhile the server receives another conclusion of the same stage, with other numbers (3 questions, 1 correct)
  offline = false;
  await page.unroute('**/v1/review-obligations/*/complete');
  await apiCall(page, `/v1/review-obligations/${unit.id}/complete`, { profile: 'DECIDED', questionsCount: 3, correctCount: 1 });
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-retry-btn'), 'a result that can never be applied must not keep asking to be sent again').toBeHidden({ timeout: 8000 });
  await expect(page.locator('#study-now-evidence-note'), 'the student is told why, not left with a silent drop').toBeVisible();
  await expect(page.locator('#study-now-evidence-note')).not.toHaveClass(/is-error/);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('smartlearn.pending-study-evidence.')).length)).toBe(0);
  const rows = await evidenceRows(page, unit.id);
  expect(rows.length, 'the server keeps the one conclusion it already had').toBe(1);
  expect(rows[0].correctCount).toBe(1);
});

test('REJECTED-2: a review result whose reply was lost after the server recorded it is recognised on retry, once, and counted once', async ({ page }) => {
  const unit = await reviewDueToday(page, 'Aula rejeitada b', 3);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('#experiment-switch').check();
  await page.locator('[data-screen="today"]').click();
  const panel = page.locator('#experiment-host .experiment-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  let lostOnce = false;
  const bodies = [];
  await page.route('**/v1/review-obligations/*/complete', async (route) => {
    bodies.push(route.request().postDataJSON());
    if (!lostOnce) { lostOnce = true; await route.fetch(); return route.abort(); } // the server wrote it; the reply never arrives
    return route.continue();
  });
  await panel.locator('li', { hasText: 'Aula rejeitada b' }).getByRole('button', { name: 'Fazer a revisão' }).click();
  for (const judge of ['#study-now-correct-btn', '#study-now-incorrect-btn', '#study-now-correct-btn']) {
    await revealStudyQuestion(page);
    await judgeStudyQuestion(page, judge);
  }
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeVisible({ timeout: 8000 });
  expect((await evidenceRows(page, unit.id)).length, 'the server DID record it').toBe(1);
  await page.locator('#study-now-evidence-retry-btn').click();
  await expect(page.locator('#study-now-evidence-retry-btn')).toBeHidden({ timeout: 8000 });
  await expect(page.locator('#study-now-evidence-note')).toContainText('Resultado registrado');
  const rows = await evidenceRows(page, unit.id);
  expect(rows.length, 'counted once').toBe(1);
  expect([rows[0].questionsCount, rows[0].correctCount]).toEqual([3, 2]);
  expect(new Set(bodies.map((b) => JSON.stringify(b))).size, 'every send is the same operation').toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('smartlearn.pending-study-evidence.')).length)).toBe(0);
});
