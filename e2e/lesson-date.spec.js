import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// "Data da aula" (the day the class was given) is a different fact from "Data do estudo" (the anchor of the 16 reviews). Real server, real database.

const SERVER_PORT = serverPort(13998);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-lesson-date-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'lesson-date E2E' });
});
test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function openPlanForm(page) {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await signInRegistered(page, { email: `lesson-date-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('Fisiologia Renal');
}

test('the plan form keeps the two dates apart: lesson date is saved, shown on the row, and the reviews still follow the study date', async ({ page }) => {
  await openPlanForm(page);
  await expect(page.locator('label[for="plan-study-date"]')).toHaveText('Data do estudo');
  await expect(page.locator('label[for="plan-lesson-date"]')).toHaveText('Data da aula (opcional)');
  await page.locator('#plan-study-date').fill('2026-11-10');
  await page.locator('#plan-lesson-date').fill('2026-11-03');
  await page.locator('#plan-study-title').fill('Filtração glomerular');
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#screen-plan').getByText('Filtração glomerular')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#screen-plan .plan-unit-meta').first()).toContainText('aula em');

  // what the server actually stored (the page's own session, same origin rules as the app)
  const stored = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  const unit = stored.units.find((u) => u.title === 'Filtração glomerular');
  expect(unit.studyDate).toBe('2026-11-10');
  expect(unit.lessonDate).toBe('2026-11-03');
});

test('a lesson date later than the study date is refused with a clear message and nothing is saved', async ({ page }) => {
  await openPlanForm(page);
  await page.locator('#plan-study-date').fill('2026-11-10');
  await page.locator('#plan-lesson-date').fill('2026-11-12');
  await page.locator('#plan-study-title').fill('Não deve ser salvo');
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#plan-unit-form-message')).toContainText('não pode ser posterior', { timeout: 3000 });
  await expect(page.locator('#screen-plan').getByText('Não deve ser salvo')).toHaveCount(0);
});

test('without a lesson date the lesson is saved exactly as before and the row does not mention one', async ({ page }) => {
  await openPlanForm(page);
  await page.locator('#plan-study-date').fill('2026-11-10');
  await page.locator('#plan-study-title').fill('Reabsorção tubular');
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#screen-plan').getByText('Reabsorção tubular')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#screen-plan .plan-unit-meta').first()).not.toContainText('aula em');
});
