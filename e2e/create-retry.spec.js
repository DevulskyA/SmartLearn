import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// E-021 class, creating a record: the server CREATES the exercise but the reply never reaches the page. The student sees the
// failure message and presses "Adicionar exercício" again with the same content. The retry reuses the same operationKey, so the
// server hands back the exercise it already made: ONE exercise, not two.

const SERVER_PORT = serverPort(13946);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-create-retry-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'create-retry E2E' });
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
  const email = `retry-${Date.now()}-${randomUUID()}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

test('CREATERETRY-1: if the server created the exercise but the reply was lost, pressing Add again leaves ONE exercise', async ({ page }) => {
  const title = 'Aula create retry';
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Farmacologia retry');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await expect(page.locator('#new-subject-input')).toBeHidden({ timeout: 8000 });
  await page.locator('#study-date').fill('2030-01-01');
  await page.locator('#study-content').fill(title);
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: title });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();

  let createCalls = 0;
  await page.route('**/v1/learning-units/*/exercises', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    createCalls += 1;
    if (createCalls === 1) { await route.fetch(); await route.abort(); } else { await route.continue(); }
  });

  const question = 'Qual é o mecanismo de ação da aspirina?';
  await studyRow.locator('.exercise-question-input').last().fill(question);
  await studyRow.locator('.exercise-answer-input').last().fill('Inibição irreversível da COX-1 e COX-2');
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.locator('.exercise-form-message')).toHaveClass(/is-error/, { timeout: 5000 });

  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.locator('.exercise-form-message')).not.toHaveClass(/is-error/, { timeout: 5000 });
  expect(createCalls).toBe(2);
  await expect(studyRow.locator('.exercise-question', { hasText: question })).toHaveCount(1); // without the key this is 2
});
