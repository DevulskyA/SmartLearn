import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T23: ports the one-save acceptance (T03/AC-03/AC-04) to real server
// transactions. Every scenario here is a real fault a real client can hit
// against the real HTTP surface — no debug endpoint, no in-process mock of
// the product code under test:
//   - duplicate intent (double-click): two concurrent identical requests
//     under the same operationKey must collapse into the ONE result T15's
//     idempotency guard already stores, not two units/32 reviews.
//   - response-lost-after-commit: the server commits but the client never
//     sees the response (route.fetch() + route.abort() after) — a retry
//     with the same (unrenewed) key must replay the original result.
//   - mid-transaction failure: a real UNIQUE(user_id, name) constraint
//     (migrations/004-learning-domain.sql) fires INSIDE the same
//     db.transaction() as the unit+16-reviews insert
//     (learning-units.js's resolveOrCreateSubject) — proving the
//     transaction leaves zero partial rows when it aborts partway.
//   - render-failure-after-successful-save: the POST succeeds but the
//     follow-up GET the UI uses to refresh the screen fails — the draft
//     must not be resubmitted and no duplicate must appear on reload.

const SERVER_PORT = 13961;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;
let dbPath;

async function waitForReady(deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('atomic-save E2E: real server did not become ready in time');
}

function startServer() {
  return spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
}

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-atomic-save-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = startServer();
  await waitForReady();
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function enableRemoteMode(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
}

function uniqueEmail(label) {
  return `as-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function registerAndLogin(page, email, password) {
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
}

async function fillNewUnitForm(page, { subjectName, title, studyDate }) {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill(subjectName);
  await page.locator('#plan-study-date').fill(studyDate);
  await page.locator('#plan-study-title').fill(title);
}

async function countReviewTasksForUnitTitle(page, title) {
  return page.evaluate(async ([base, t]) => {
    const units = await fetch(`${base}/v1/learning-units`, { credentials: 'include' }).then(r => r.json());
    const unit = units.units.find(u => u.title === t);
    if (!unit) return { unitCount: 0, reviewCount: 0 };
    const matchingUnits = units.units.filter(u => u.title === t).length;
    const reviews = await fetch(`${base}/v1/review-tasks?unitId=${unit.id}`, { credentials: 'include' }).then(r => r.json());
    return { unitCount: matchingUnits, reviewCount: reviews.reviewTasks.length };
  }, [API_BASE, title]);
}

test('duplicate intent under the same operation key (double-click) collapses into one unit, not two', async ({ page }) => {
  const email = uniqueEmail('dbl');
  await enableRemoteMode(page);
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  const title = 'Aula Duplo Clique E2E';
  const operationKey = 'e2e-double-click-key';
  const payload = {
    newSubjectName: 'Disciplina Duplo Clique E2E',
    newSubjectColor: 'DISC-BLUE',
    sourceText: '',
    studyDate: '2026-02-01',
    title,
    summaryBody: null,
    operationKey,
  };

  // Two concurrent, byte-identical requests — exactly what a double-click
  // that escapes the button's own disabled-state race would send. The
  // idempotency guard (T15/server/src/services/idempotency.js), not the
  // button's disabled attribute, is what must prevent a second unit.
  const [resA, resB] = await page.evaluate(async ([base, body]) => {
    const { csrfToken } = await fetch(`${base}/v1/auth/me`, { credentials: 'include' }).then(r => r.json());
    const send = () => fetch(`${base}/v1/learning-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify(body),
    }).then(r => r.json());
    return Promise.all([send(), send()]);
  }, [API_BASE, payload]);

  expect(resA.unit.id).toBe(resB.unit.id);

  const { unitCount, reviewCount } = await countReviewTasksForUnitTitle(page, title);
  expect(unitCount, 'exactly one unit for the duplicated intent').toBe(1);
  expect(reviewCount, 'exactly 16 reviews, not 32').toBe(16);
});

test('response lost after the server already committed: a same-key retry replays the original result instead of duplicating', async ({ page }) => {
  const email = uniqueEmail('lost');
  await enableRemoteMode(page);
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  const title = 'Aula Resposta Perdida E2E';
  await fillNewUnitForm(page, { subjectName: 'Disciplina Resposta Perdida E2E', title, studyDate: '2026-02-02' });

  // Let the request actually reach the real server and commit, then drop
  // the response before it reaches the page — indistinguishable, from the
  // client's point of view, from the response being lost on the wire.
  let intercepted = false;
  await page.route('**/v1/learning-units', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue();
    intercepted = true;
    await route.fetch(); // real request reaches the real server and commits
    await route.abort('failed'); // ...but the client never sees it
  });

  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#plan-unit-form-message')).toContainText(/não foi possível/i, { timeout: 5000 });
  // Draft must survive an uncertain-outcome failure — nothing to resubmit
  // means the user would have to retype it from scratch.
  await expect(page.locator('#plan-study-title')).toHaveValue(title);

  await page.unroute('**/v1/learning-units');
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#plan-unit-form-message')).toContainText(/aula salva/i, { timeout: 5000 });

  await page.reload();
  await page.waitForLoadState('networkidle');
  const { unitCount, reviewCount } = await countReviewTasksForUnitTitle(page, title);
  expect(unitCount, 'the retry replayed the original result, it did not create a second unit').toBe(1);
  expect(reviewCount).toBe(16);
});

test('a real mid-transaction failure (duplicate subject name) leaves zero partial rows', async ({ page }) => {
  const email = uniqueEmail('mid');
  await enableRemoteMode(page);
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  const subjectName = 'Disciplina Colisao E2E';
  await fillNewUnitForm(page, { subjectName, title: 'Aula A Colisao E2E', studyDate: '2026-02-03' });
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#plan-unit-form-message')).toContainText(/aula salva/i, { timeout: 5000 });

  // Same subject NAME again: resolveOrCreateSubject's own duplicate check
  // (server/src/services/learning-units.js) throws INSIDE the same
  // db.transaction() as the would-be unit+16-review insert — a real
  // product rule firing mid-transaction, not a test-only fault hook.
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill(subjectName);
  await page.locator('#plan-study-date').fill('2026-02-04');
  const titleB = 'Aula B Colisao E2E';
  await page.locator('#plan-study-title').fill(titleB);
  await page.locator('#plan-unit-save-btn').click();

  await expect(page.locator('#plan-unit-form-message')).toContainText(/não foi possível/i, { timeout: 5000 });
  await expect(page.locator('#plan-study-title')).toHaveValue(titleB);

  await page.reload();
  await page.waitForLoadState('networkidle');
  const { unitCount: unitBCount } = await countReviewTasksForUnitTitle(page, titleB);
  expect(unitBCount, 'the aborted transaction created no orphan unit').toBe(0);

  const subjects = await page.evaluate((base) =>
    fetch(`${base}/v1/subjects`, { credentials: 'include' }).then(r => r.json()), API_BASE);
  const matches = subjects.subjects.filter(s => s.name === subjectName);
  expect(matches.length, 'no duplicate subject was created either').toBe(1);
});

test('render failure after a successful save does not resubmit or duplicate the unit', async ({ page }) => {
  const email = uniqueEmail('render');
  await enableRemoteMode(page);
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  const title = 'Aula Falha De Render E2E';
  await fillNewUnitForm(page, { subjectName: 'Disciplina Falha De Render E2E', title, studyDate: '2026-02-05' });

  // The POST itself is untouched (it must succeed); only the follow-up GET
  // the UI uses to refresh the screen after a successful save is broken.
  await page.route('**/v1/learning-units', (route) => {
    if (route.request().method() === 'GET') return route.abort('failed');
    return route.continue();
  });

  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#plan-unit-form-message')).toContainText(/aula salva.*recarregue/i, { timeout: 5000 });
  // The draft was already committed server-side before the render step ran
  // — it must be cleared, not left sitting there inviting a resubmit.
  await expect(page.locator('#plan-study-title')).toHaveValue('');

  await page.unroute('**/v1/learning-units');
  await page.reload();
  await page.waitForLoadState('networkidle');
  const { unitCount, reviewCount } = await countReviewTasksForUnitTitle(page, title);
  expect(unitCount, 'the save was not silently repeated by the broken render step').toBe(1);
  expect(reviewCount).toBe(16);
});
