import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

const SERVER_PORT = serverPort(13972);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-question-flag-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'question flag E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('marca uma questão julgada como problemática e a remove sem alterar o julgamento', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  await signInRegistered(page, {
    email: `question-flag-${Date.now()}@example.com`,
    password: 'a genuinely long test password 1',
  });

  await page.goto('/#register');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Questões E2E');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2020-01-01');
  await page.locator('#study-content').fill('Aula com questão problemática');
  await page.locator('#study-form button[type="submit"]').click();
  const row = page.locator('.study-row', { hasText: 'Aula com questão problemática' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Exercícios' }).click();
  await row.locator('.exercise-question-input').fill('Qual é a questão?');
  await row.locator('.exercise-answer-input').fill('Resposta');
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();

  await page.locator('[data-screen="today"]').click();
  await page.locator('#today-primary-action-btn').click();
  const exercise = page.locator('.review-exercise-item:visible', { hasText: 'Qual é a questão?' }).first();
  await expect(exercise).toBeVisible();
  await exercise.getByRole('button', { name: 'Ver resposta' }).click();
  await expect(exercise.locator('.review-exercise-answer')).toBeVisible();
  await expect(exercise).toHaveAttribute('data-attempt-id', /.+/);
  await exercise.getByRole('button', { name: 'Acertei' }).click();
  await expect(exercise).toHaveClass(/is-correct/);
  await expect(exercise).toHaveAttribute('data-attempt-id', /.+/);

  const flags = exercise.locator('.question-flag-controls');
  await expect(flags).not.toHaveAttribute('hidden', '');
  const visibleFlags = exercise.locator('.question-flag-controls:visible');
  await visibleFlags.locator('.question-flag-action').evaluate((element) => element.click());
  await visibleFlags.locator('.question-flag-reason:visible').selectOption('CONTENT_ERROR');
  await visibleFlags.locator('.question-flag-comment:visible').fill('A resposta precisa de fonte.');
  await visibleFlags.getByRole('button', { name: 'Salvar marca' }).click();
  await expect(flags).toContainText('Questão marcada como problemática');
  await expect(flags).toContainText('Marca salva.');

  await visibleFlags.getByRole('button', { name: 'Desmarcar questão' }).click();
  await expect(visibleFlags).toContainText('Marca removida.');
  await expect(exercise).toHaveClass(/is-correct/);
});
