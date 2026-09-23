import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T28: migrates a representative legacy fixture end-to-end through the
// real UI (src/migration-ui.js) against the real T25-T27 server pipeline
// (normalize -> preview -> commit), then proves a full owned export
// round trip afterward and rehearses two failure/recovery paths — a
// cancelled preview and a name-conflict that blocks confirm — leaving
// zero stray rows in either case. Same real-server-child-process pattern
// as e2e/feature-parity.spec.js.
//
// This is a FIXTURE rehearsal against a synthetic test account — per
// .specs/features/smartlearn-v1-consolidated-v2/migration-runbook.md,
// it does NOT constitute authorization to run a real user's own legacy
// export through this flow; that is a separate, explicit human gate.

const SERVER_PORT = 13962;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL('../server/test/import-fixtures/v3-schema.json', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-migration-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('migration E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function registerAndLogin(page) {
  const email = `mig-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
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

function fixtureBuffer() {
  return Buffer.from(readFileSync(FIXTURE_PATH, 'utf8'));
}

test('a fresh test user migrates a representative fixture end-to-end and the result survives a full owned export round trip', async ({ page }) => {
  await registerAndLogin(page);

  // Source bytes stay readable on disk the whole time — this UI never
  // touches the original file, only an in-memory copy of its contents.
  const beforeBytes = readFileSync(FIXTURE_PATH, 'utf8');

  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#migration-card')).toBeVisible({ timeout: 5000 });
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: fixtureBuffer() });

  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#migration-counts')).toContainText('Disciplinas');
  await expect(page.locator('#migration-counts')).toContainText('1');
  await expect(page.locator('#migration-conflicts li')).toHaveCount(0);
  await expect(page.locator('#migration-confirm-btn')).toBeEnabled();

  await page.locator('#migration-confirm-btn').click();
  await page.locator('#confirm-dialog-ok').click();

  await expect(page.locator('#migration-result-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#migration-result-summary')).toContainText('Disciplinas: 1');
  await expect(page.locator('#migration-result-summary')).toContainText('Aulas: 1');

  // The migrated unit is real, owned data — reachable through the normal
  // Plano screen exactly like anything created by hand.
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan').getByText('Farmacocinetica')).toBeVisible({ timeout: 5000 });

  // Full owned export round trip (T19's GET /v1/export, same session/
  // cookie the UI itself uses): the migrated rows are really persisted
  // server-side, not just rendered client-side from the commit response.
  const exported = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/export`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(exported.subjects.some((s) => s.name === 'Farmacologia')).toBe(true);
  expect(exported.learningUnits.some((u) => u.title === 'Farmacocinetica')).toBe(true);
  expect(exported.exercises.length).toBe(1);
  expect(exported.learningEvidence.length).toBe(1);

  const afterBytes = readFileSync(FIXTURE_PATH, 'utf8');
  expect(afterBytes).toBe(beforeBytes);
});

test('recovery rehearsal: cancelling a preview changes nothing, and the account is still migratable afterward', async ({ page }) => {
  await registerAndLogin(page);

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: fixtureBuffer() });
  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });

  await page.locator('#migration-cancel-btn').click();
  await expect(page.locator('#migration-preview-panel')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#migration-message')).toContainText('cancelada', { timeout: 5000 });

  const exportedAfterCancel = await page.evaluate(async (base) => (await fetch(`${base}/v1/export`, { credentials: 'include' })).json(), API_BASE);
  expect(exportedAfterCancel.subjects.length).toBe(0);
  expect(exportedAfterCancel.learningUnits.length).toBe(0);

  // The same account can still complete a real migration afterward — a
  // cancelled attempt leaves no residue that would block a later one.
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: fixtureBuffer() });
  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
  await page.locator('#migration-confirm-btn').click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#migration-result-panel')).toBeVisible({ timeout: 5000 });
});

test('recovery rehearsal: a name conflict blocks confirm and commits nothing', async ({ page }) => {
  await registerAndLogin(page);

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: fixtureBuffer() });
  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
  await page.locator('#migration-confirm-btn').click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#migration-result-panel')).toBeVisible({ timeout: 5000 });

  // Re-uploading the identical fixture into the now-populated account:
  // "Farmacologia" already exists, so this must surface as a blocked
  // conflict, never a silent duplicate or a silent overwrite.
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: fixtureBuffer() });
  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#migration-conflicts li')).toHaveCount(1);
  await expect(page.locator('#migration-confirm-btn')).toBeDisabled();

  const exported = await page.evaluate(async (base) => (await fetch(`${base}/v1/export`, { credentials: 'include' })).json(), API_BASE);
  expect(exported.subjects.length).toBe(1); // only the first, real commit — the blocked second attempt added nothing
});
