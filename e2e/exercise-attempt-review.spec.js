import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Proves the real thing the product asked for: clicking a solved-exercise
// row in Estatísticas' "Exercícios resolvidos" opens the real attempt it
// was scored from — real question, real self-reported outcome — sourced
// from the server (021-practice-evidence-attempt-link.sql's evidence_id
// link + GET /v1/learning-evidence/:id/attempts), not fabricated client-side.
// Setup creates the unit/exercise/attempt/evidence via direct API calls
// (same idiom as e2e/practice.spec.js's fetch-based assertions) instead of
// driving the full Materiais/draft-acceptance pipeline (e2e/draft-
// acceptance.spec.js) — that pipeline is orthogonal to what this test is
// actually proving.

const SERVER_PORT = 13967;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-exercise-review-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('exercise-attempt-review E2E: real server did not become ready in time');
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
  const email = `exreview-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function apiCall(page, base, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const meRes = await fetch(`${base}/v1/auth/me`, { credentials: 'include' });
    const me = await meRes.json();
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base, path, body });
}

test('clicking an Exercícios resolvidos row opens the real question/answer/outcome behind it', async ({ page }) => {
  const { unit } = await apiCall(page, API_BASE, '/v1/learning-units', {
    newSubjectName: 'Farmacologia E2E',
    title: 'Aula de Revisão E2E',
    studyDate: '2024-01-01',
  });
  const { exercise } = await apiCall(page, API_BASE, `/v1/learning-units/${unit.id}/exercises`, {
    question: 'Qual antibiótico inibe a síntese de parede celular?',
    answer: 'Beta-lactâmicos',
    provenance: 'MANUAL',
  });
  const { attempt } = await apiCall(page, API_BASE, `/v1/exercises/${exercise.id}/attempts`, {});
  await apiCall(page, API_BASE, `/v1/attempts/${attempt.id}/submit`, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
  await apiCall(page, API_BASE, '/v1/learning-evidence', {
    unitId: unit.id,
    type: 'INITIAL_PRACTICE',
    questionsCount: 1,
    correctCount: 1,
    evidenceDate: '2024-01-01',
    attemptIds: [attempt.id],
  });

  await page.locator('[data-screen="stats"]').click();
  const row = page.locator('#exercise-notes-body .exercise-row', { hasText: 'Aula de Revisão E2E' });
  await expect(row).toBeVisible({ timeout: 5000 });

  await row.click();
  const dialog = page.locator('#exercise-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Qual antibiótico inibe a síntese de parede celular?')).toBeVisible();
  await expect(dialog.getByText('Gabarito: Beta-lactâmicos')).toBeVisible();
  await expect(dialog.locator('.exercise-attempt-outcome')).toHaveText('Acertou');
  await expect(dialog.locator('.exercise-attempt-item')).toHaveClass(/is-correct/);

  // Native <dialog> Escape-to-close, not a custom keydown handler this
  // feature would have to reinvent.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('an EXTERNAL-context row explains unavailability locally, with no attempts network call', async ({ page }) => {
  const { unit } = await apiCall(page, API_BASE, '/v1/learning-units', {
    newSubjectName: 'Bioquímica E2E',
    title: 'Aula Externa E2E',
    studyDate: '2024-01-02',
  });
  await apiCall(page, API_BASE, '/v1/learning-evidence', {
    unitId: unit.id,
    type: 'EXTERNAL',
    questionsCount: 5,
    correctCount: 4,
    evidenceDate: '2024-01-02',
  });

  await page.locator('[data-screen="stats"]').click();
  const row = page.locator('#exercise-notes-body .exercise-row', { hasText: 'Aula Externa E2E' });
  await expect(row).toBeVisible({ timeout: 5000 });

  const requests = [];
  page.on('request', (req) => { if (req.url().includes('/attempts')) requests.push(req.url()); });

  await row.click();
  const dialog = page.locator('#exercise-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/feito fora do app/)).toBeVisible();
  expect(requests).toHaveLength(0);
});
