import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// T36: proves the real inspection UI (src/source-proposals-ui.js, wired
// into a new "Fontes" card on Configurações) drives the actual T34-T36
// server pipeline end to end — upload -> extract -> chunk -> inspect ->
// manually correct a title — with NOTHING in the real learning domain
// (subjects/units/exercises) ever created by this flow. Same real-
// server-child-process + REMOTE_MODE pattern as e2e/feature-parity.spec.js.

const SERVER_PORT = 13964;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-proposals-'));
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
  throw new Error('source-proposals E2E: real server did not become ready in time');
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
  const email = `proposals-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('uploading a real PDF through the Fontes card produces inspectable proposals attributable to exact pages, and a title can be manually corrected', async ({ page }) => {
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const pdfBuffer = buildFixturePdf([
    'Introdução à fisiologia renal',
    'Segunda página com conteúdo diferente',
    'Terceira e última página do documento',
  ]);
  await page.setInputFiles('#sources-file-input', {
    name: 'fisiologia-renal.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const items = page.locator('.source-proposal-item');
  // Default chunking groups up to 10 pages per proposal (design.md §8) —
  // this 3-page fixture stays entirely within one proposal.
  await expect(items).toHaveCount(1, { timeout: 5000 });

  const firstItem = items.nth(0);
  await expect(firstItem.locator('.source-proposal-range')).toHaveText('Páginas 1–3');

  // Inspection: the excerpt must be the exact original source text, not a
  // fabricated summary — nothing has been generated yet at this task.
  await firstItem.locator('[data-action="toggle-proposal-excerpt"]').click();
  await expect(firstItem.locator('.source-proposal-excerpt')).toHaveText(
    'Introdução à fisiologia renal\n\nSegunda página com conteúdo diferente\n\nTerceira e última página do documento',
    { timeout: 5000 },
  );

  // Manual correction before acceptance.
  const titleInput = firstItem.locator('.source-proposal-title-input');
  await titleInput.fill('Fisiologia renal: aula revisada');
  await firstItem.locator('[data-action="save-proposal-title"]').click();
  await expect(page.locator('#sources-message')).toContainText('Título atualizado', { timeout: 5000 });

  // Confirm the correction actually persisted server-side, not just in the DOM.
  const proposalId = await firstItem.getAttribute('data-proposal-id');
  const persisted = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/proposals/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: proposalId });
  expect(persisted.proposal.title).toBe('Fisiologia renal: aula revisada');

  // Nothing in the real learning domain was ever created by this flow.
  const domainCheck = await page.evaluate(async (base) => {
    const [units, subjects] = await Promise.all([
      fetch(`${base}/v1/learning-units`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${base}/v1/subjects`, { credentials: 'include' }).then((r) => r.json()),
    ]);
    return { unitsLen: units.units?.length ?? 0, subjectsLen: subjects.subjects?.length ?? 0 };
  }, API_BASE);
  expect(domainCheck.unitsLen).toBe(0);
  expect(domainCheck.subjectsLen).toBe(0);
});
