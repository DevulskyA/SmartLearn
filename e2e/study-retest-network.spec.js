import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// NEXT-4 / RETESTNET-1: the redo of "Estudar agora" ("Refazer erros") when the connection drops. What the student
// sees, what the server holds and the longitudinal evidence must never disagree.

const SERVER_PORT = 13998;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-retestnet-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('retest-network E2E: real server did not become ready in time');
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
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
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
});
