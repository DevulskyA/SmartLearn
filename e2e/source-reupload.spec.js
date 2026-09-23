import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// Sending the SAME PDF again (a normal thing to do) dedupes to the same source, whose trechos already carry a
// rascunho. The server refuses to replace them (HAS_EXISTING_DRAFT). The student must land on those trechos with
// an honest message, not on a dead-end error. Same real-server-child-process + REMOTE_MODE pattern as
// e2e/source-proposals.spec.js.

const SERVER_PORT = 13977;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-reupload-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('source-reupload E2E: real server did not become ready in time');
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
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `reupload-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('sending the same PDF again lands on its existing trechos and their rascunho, never on a dead-end error', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const file = { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Introdução à fisiologia renal', 'A taxa de filtração glomerular é de 120 mL/min.']) };
  await page.setInputFiles('#sources-file-input', file);
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado', { timeout: 10000 });

  // Same bytes again: the server has a rascunho on this source's trechos and refuses to replace them.
  await page.setInputFiles('#sources-file-input', file);
  await expect(page.locator('#sources-message')).toContainText('Este PDF já foi processado', { timeout: 10000 });
  await expect(page.locator('#sources-message')).toContainText('1 trecho existente');
  await expect(page.locator('#sources-message')).not.toContainText('Não foi possível');
  await expect(page.locator('.source-proposal-item')).toHaveCount(1);

  // Nothing was replaced or lost: the trecho is the same one, and its rascunho is still there.
  const proposalId = await page.locator('.source-proposal-item').first().getAttribute('data-proposal-id');
  const drafts = await page.evaluate(async ({ base, id }) => (await fetch(`${base}/v1/proposals/${id}/drafts`, { credentials: 'include' })).json(), { base: API_BASE, id: proposalId });
  expect(drafts.drafts).toHaveLength(1);
  expect(drafts.drafts[0].status).toBe('DRAFT');
});
