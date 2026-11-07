import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';

// NEXT-4 / RETESTNET-1: the redo of "Estudar agora" ("Refazer erros") when the connection drops. What the student
// sees, what the server holds and the longitudinal evidence must never disagree.

const SERVER_PORT = serverPort(13998);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-retestnet-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'retest-network E2E' });
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
  const email = `retestnet-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
const getJson = (page, path) => page.evaluate(async ({ base, path }) => (await fetch(`${base}${path}`, { credentials: 'include' })).json(), { base: API_BASE, path });
const reinforceTotal = async (page) => Object.values((await getJson(page, '/v1/reinforcement')).byUnit).flat().length;
const evidenceRows = async (page, unitId) => (await getJson(page, `/v1/learning-evidence?unitId=${unitId}`)).evidence;

/** Read the isolated DB after the UI flow, so a passing screen cannot hide an open or duplicated attempt. */
function readRetestLedger(unitId) {
  const db = new Database(join(dataDir, 'e2e.db'), { readonly: true });
  try {
    const attempts = db.prepare(`
      SELECT a.id, a.status, a.evidence_id, v.exercise_id,
        (SELECT e.outcome FROM learning_events e
          WHERE e.user_id = a.user_id AND e.attempt_id = a.id
          ORDER BY e.sequence DESC LIMIT 1) AS outcome
      FROM exercise_attempts a
      JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
      WHERE a.unit_id = ? ORDER BY a.id
    `).all(unitId);
    const events = db.prepare('SELECT attempt_id, sequence, outcome FROM learning_events WHERE unit_id = ? ORDER BY id').all(unitId);
    const evidence = db.prepare('SELECT id, type, questions_count, correct_count FROM learning_evidence WHERE unit_id = ? ORDER BY id').all(unitId);
    return { attempts, events, evidence };
  } finally {
    db.close();
  }
}

function expectCleanRetestLedger(unitId) {
  const ledger = readRetestLedger(unitId);
  expect(ledger.attempts.filter((attempt) => attempt.status === 'STARTED')).toHaveLength(0);
  expect(ledger.attempts).toHaveLength(3); // two initial answers + one redo of the wrong item
  expect(ledger.events).toHaveLength(3);
  expect(new Set(ledger.events.map((event) => event.attempt_id)).size).toBe(3);
  expect(ledger.events.every((event) => event.sequence === 1)).toBe(true);
  expect(ledger.evidence).toEqual([
    expect.objectContaining({ type: 'INITIAL_PRACTICE', questions_count: 2, correct_count: 1 }),
  ]);

  const byExercise = new Map();
  for (const attempt of ledger.attempts) {
    const group = byExercise.get(attempt.exercise_id) ?? [];
    group.push(attempt);
    byExercise.set(attempt.exercise_id, group);
  }
  expect(byExercise.size).toBe(2);
  const groups = [...byExercise.values()].sort((a, b) => b.length - a.length);
  expect(groups[0]).toHaveLength(2);
  expect(groups[0].map((attempt) => attempt.outcome)).toEqual(['INCORRECT', 'CORRECT']);
  expect(groups[0][0].status).toBe('SUBMITTED');
  expect(groups[0][0].evidence_id).not.toBeNull();
  expect(groups[0][1].status).toBe('SUBMITTED');
  expect(groups[0][1].evidence_id).toBeNull();
  expect(groups[1]).toHaveLength(1);
  expect(groups[1][0].outcome).toBe('CORRECT');
  expect(groups[1][0].status).toBe('SUBMITTED');
  expect(groups[1][0].evidence_id).not.toBeNull();
}

/** Study a 2-question lesson (1st wrong, 2nd right) and open the redo of the wrong one. */
async function openRedo(page, title) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Reteste ${title}`, title, studyDate: '2030-01-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} ${i}?`, answer: `Certa ${i}`, provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible();
  expect(await reinforceTotal(page)).toBe(1); // the wrong item is "para reforçar"
  expect((await evidenceRows(page, unit.id)).length).toBe(1);
  await page.locator('#study-now-retest-btn').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-judgment')).toBeVisible();
  await page.waitForTimeout(400); // the attempt is started on the server when the answer is revealed
  return unit;
}

test('RETESTNET-1: a redo answer that never reached the server is not shown as recorded, and retrying works once', async ({ page }) => {
  const unit = await openRedo(page, 'Aula retestnet a');
  await page.route('**/v1/attempts/*/submit', (route) => route.abort());
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1'); // nothing advanced
  expect(await reinforceTotal(page)).toBe(1); // the server still counts the error
  await page.unroute('**/v1/attempts/*/submit');
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado do reteste', { timeout: 8000 });
  await expect(page.locator('#study-now-result-text')).toContainText('1/1 erros corrigidos');
  expect(await reinforceTotal(page)).toBe(0); // now the server has the correction
  expect((await evidenceRows(page, unit.id)).length).toBe(1); // the redo never writes aggregate evidence
  expectCleanRetestLedger(unit.id);
});

test('RETESTNET-1: if the server RECEIVED the redo answer but the reply was lost, the retry completes instead of leaving the student stuck', async ({ page }) => {
  const unit = await openRedo(page, 'Aula retestnet b');
  let lost = false;
  await page.route('**/v1/attempts/*/submit', async (route) => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); return; } // the server handled it; the answer never came back
    await route.continue();
  });
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  expect(await reinforceTotal(page)).toBe(0); // the server DID record the correction
  await page.locator('#study-now-correct-btn').click(); // the student follows the message and taps again
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado do reteste', { timeout: 8000 });
  await expect(page.locator('#study-now-result-text')).toContainText('1/1 erros corrigidos');
  expect((await evidenceRows(page, unit.id)).length).toBe(1);
  expectCleanRetestLedger(unit.id);
});

test('RETESTNET-1: if the reply was lost and the student then taps the OTHER button, what the server holds wins and the screen says so', async ({ page }) => {
  const unit = await openRedo(page, 'Aula retestnet c');
  let lost = false;
  await page.route('**/v1/attempts/*/submit', async (route) => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); return; }
    await route.continue();
  });
  await page.locator('#study-now-correct-btn').click(); // recorded by the server as CORRECT, reply lost
  await expect(page.locator('#study-now-message')).toContainText('Não foi possível registrar');
  expect(await reinforceTotal(page)).toBe(0);
  await page.locator('#study-now-incorrect-btn').click(); // the student changes their mind
  await expect(page.locator('#study-now-result-text')).toContainText('1/1 erros corrigidos', { timeout: 8000 }); // the server's CORRECT stands
  expect(await reinforceTotal(page)).toBe(0);
  expect((await evidenceRows(page, unit.id)).length).toBe(1);
  expectCleanRetestLedger(unit.id);
});

test('RETESTNET-2: if the server CREATED the attempt but the reply to start was lost, the retry gets the same attempt instead of a second one', async ({ page }) => {
  const title = 'Aula retestnet start';
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Reteste ${title}`, title, studyDate: '2030-01-01' });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} 1?`, answer: 'Certa 1', provenance: 'MANUAL' });
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.plan-expand-btn').click();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 1');

  // The server receives and records the first start; the reply never reaches the page.
  let startCalls = 0;
  await page.route('**/v1/exercises/*/attempts', async (route) => {
    startCalls += 1;
    if (startCalls === 1) { await route.fetch(); await route.abort(); } else { await route.continue(); }
  });
  await page.locator('#study-now-reveal-btn').click();
  await expect.poll(() => startCalls, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  await page.locator('#study-now-correct-btn').click(); // the judgment starts the attempt again with the same logical key
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });

  const ledger = readRetestLedger(unit.id);
  expect(startCalls).toBeGreaterThanOrEqual(2);
  expect(ledger.attempts).toHaveLength(1); // without the key this would be 2: an orphan STARTED plus the real one
  expect(ledger.attempts[0].status).toBe('SUBMITTED');
  expect(ledger.attempts.filter((attempt) => attempt.status === 'STARTED')).toHaveLength(0);
});
