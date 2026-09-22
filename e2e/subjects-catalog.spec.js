import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// FIX_PLAN P1-1: a failed Arquivar/Excluir on Disciplinas must never fail silently. Found by the
// final engineering audit (.specs/quick/final-engineering-audit-v1/AUDIT.md F-02): both handlers
// had a bare `catch {}` -- the click did nothing and the student had no way to know whether it
// worked. Real server, real route abort (not a product-code mock) so this proves the actual
// network-failure path a user can hit.

const SERVER_PORT = 13962;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-subjects-catalog-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
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
  const email = `subj-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  await page.locator('[data-screen="subjects"]').click();
  await page.locator('#subjects-show-create-btn').click();
  await page.locator('#subjects-new-name').fill('Cardiologia');
  await page.locator('#subjects-create-save-btn').click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Cardiologia' })).toBeVisible({ timeout: 5000 });
});

test('a failed Arquivar tells the student, instead of doing nothing', async ({ page }) => {
  await page.route('**/v1/subjects/*', (route) => (route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()));
  const card = page.locator('.subject-catalog-card', { hasText: 'Cardiologia' });
  await card.getByRole('button', { name: 'Arquivar' }).click();
  await expect(card.locator('.subject-catalog-delete-msg')).toContainText(/não foi possível/i, { timeout: 5000 });
  // ...and it did not silently succeed: still shows "Arquivar" (still active), not "Reativar"
  await expect(card.getByRole('button', { name: 'Arquivar' })).toBeVisible();
});

test('a failed Excluir tells the student, instead of doing nothing', async ({ page }) => {
  await page.route('**/v1/subjects/*', (route) => (route.request().method() === 'DELETE' ? route.abort('failed') : route.continue()));
  const card = page.locator('.subject-catalog-card', { hasText: 'Cardiologia' });
  await card.getByRole('button', { name: 'Excluir' }).click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(card.locator('.subject-catalog-delete-msg')).toContainText(/não foi possível/i, { timeout: 5000 });
  await expect(card).toBeVisible();
});
