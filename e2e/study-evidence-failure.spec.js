import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';

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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('evidence-failure E2E: real server did not become ready in time');
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
