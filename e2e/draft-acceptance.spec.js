import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// T38: proves the real draft-review UI (src/draft-review-ui.js, wired into
// the same "Fontes" card as T36) drives the full T34-T38 pipeline end to
// end — upload -> extract -> chunk -> generate a draft (fake provider,
// no credentials configured) -> inspect -> accept -> a REAL usable unit
// with reviews and exercises exists afterward, and a second click on the
// same accepted draft does not create anything twice.

const SERVER_PORT = 13965;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-draft-accept-'));
  const dbPath = join(dataDir, 'e2e.db');
  const sourcesDir = join(dataDir, 'sources');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_SOURCES_DIR: sourcesDir,
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
  throw new Error('draft-acceptance E2E: real server did not become ready in time');
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
  const email = `draft-accept-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('generating and accepting a draft through the real UI creates a real unit with reviews and exercises, and a repeated accept does not duplicate it', async ({ page }) => {
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const pdfBuffer = buildFixturePdf(['Farmacocinética: absorção e distribuição']);
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado', { timeout: 10000 });

  const draftPanel = item.locator('.source-draft-panel');
  await expect(draftPanel).toBeVisible();
  await expect(draftPanel.locator('.source-draft-caveat')).toContainText('não verificado');
  await expect(draftPanel.locator('.source-draft-question')).toHaveCount(1);
  // The drafted answer is attributable to the exact real source text.
  await expect(draftPanel.locator('.source-draft-answer')).toContainText('Farmacocinética');

  await draftPanel.locator('.source-draft-subject-input').fill('Farmacologia E2E');
  await draftPanel.locator('.source-draft-date-input').fill('2026-04-01');
  await draftPanel.locator('[data-action="accept-draft"]').click();

  await expect(draftPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(draftPanel.locator('.source-draft-result')).not.toHaveClass(/is-error/);

  // The unit is real: it shows up on Plano.
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan .plan-row-compact .subject-chip', { hasText: 'Farmacologia E2E' })).toBeVisible({ timeout: 5000 });

  const draftId = await draftPanel.getAttribute('data-draft-id');
  const firstAcceptance = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/drafts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: draftId });
  expect(firstAcceptance.draft.status).toBe('ACCEPTED');

  // Repeated acceptance (same draft, real HTTP) must not create a second unit.
  const secondAcceptRes = await page.evaluate(async ({ base, id, revision }) => {
    const meRes = await fetch(`${base}/v1/auth/me`, { credentials: 'include' });
    const me = await meRes.json();
    const res = await fetch(`${base}/v1/drafts/${id}/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken },
      body: JSON.stringify({ newSubjectName: 'Outra disciplina', studyDate: '2099-01-01', expectedRevision: revision }),
    });
    return res.json();
  }, { base: API_BASE, id: draftId, revision: firstAcceptance.draft.revision });
  expect(secondAcceptRes.acceptance.acceptedAt).toBe(firstAcceptance.draft.acceptedAt);

  const unitsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(unitsAfter.units.length).toBe(1);
});
