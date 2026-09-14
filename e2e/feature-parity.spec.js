import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T22: proves the remaining screens (Disciplinas, Estatisticas,
// Acompanhamento, Configuracoes, Cadastro/exercises) have a real
// server-mode equivalent — not just Hoje/Plano, which T21 already covers.
// Same real-server-child-process + REMOTE_MODE-flag pattern as
// e2e/server-authority.spec.js.

const SERVER_PORT = 13961;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-feature-parity-'));
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
  throw new Error('feature-parity E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `fp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('Disciplinas: create, rename, archive, reactivate, and delete a subject all work against the real server', async ({ page }) => {
  await page.locator('[data-screen="subjects"]').click();
  await page.locator('#subjects-show-create-btn').click();
  await page.locator('#subjects-new-name').fill('Fisiologia Parity');
  await page.locator('#subjects-create-save-btn').click();
  const card = page.locator('.subject-catalog-card', { hasText: 'Fisiologia Parity' });
  await expect(card).toBeVisible({ timeout: 5000 });

  await card.getByRole('button', { name: 'Editar' }).click();
  await card.locator('.subject-edit-name').fill('Fisiologia Renomeada');
  await card.getByRole('button', { name: 'Salvar' }).click();
  const renamed = page.locator('.subject-catalog-card', { hasText: 'Fisiologia Renomeada' });
  await expect(renamed).toBeVisible({ timeout: 5000 });

  await renamed.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.locator('.subject-catalog-card.is-archived', { hasText: 'Fisiologia Renomeada' })).toBeVisible({ timeout: 5000 });

  await page.locator('.subject-catalog-card.is-archived', { hasText: 'Fisiologia Renomeada' }).getByRole('button', { name: 'Reativar' }).click();
  await expect(page.locator('.subject-catalog-card:not(.is-archived)', { hasText: 'Fisiologia Renomeada' })).toBeVisible({ timeout: 5000 });

  // showConfirm() is an in-page <dialog>, not a native browser confirm()
  // — Playwright's page.on('dialog') never fires for it.
  await page.locator('.subject-catalog-card', { hasText: 'Fisiologia Renomeada' }).getByRole('button', { name: 'Excluir' }).click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Fisiologia Renomeada' })).not.toBeVisible({ timeout: 5000 });
});

test('Estatisticas and Acompanhamento render real server data without error after a unit is created and a review is completed', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('Estatisticas Parity Subject');
  await page.locator('#plan-study-date').fill('2020-01-01');
  await page.locator('#plan-study-title').fill('Conteudo Estatisticas Parity');
  await page.locator('#plan-unit-save-btn').click();
  await expect(page.locator('#screen-plan').getByText('Conteudo Estatisticas Parity')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="today"]').click();
  await page.locator('[data-review-list="overdue"] [data-action="review-done"]').first().check();
  await expect(page.locator('text=1 feita')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#metric-reviews-done')).toHaveText('1', { timeout: 5000 });
  const overdueCount = await page.locator('#metric-reviews-overdue').textContent();
  expect(Number(overdueCount)).toBeGreaterThan(0);

  await page.locator('[data-screen="tracking"]').click();
  await expect(page.locator('#tracking-list')).not.toBeEmpty({ timeout: 5000 });
});

test('Cadastro/exercises: the load-bearing legacy screen remains reachable and its exercise CRUD works against the real server', async ({ page }) => {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#screen-register')).toBeVisible({ timeout: 5000 });

  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Cadastro Parity Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await expect(page.locator('#subject-message')).not.toContainText('possível', { timeout: 5000 });

  await page.locator('#study-content').fill('Conteudo Cadastro Parity');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });

  const row = page.locator('.study-row', { hasText: 'Conteudo Cadastro Parity' });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.getByRole('button', { name: 'Exercícios' }).click();
  await row.locator('.exercise-question-input').fill('Pergunta de paridade?');
  await row.locator('.exercise-answer-input').fill('Resposta de paridade');
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(row.getByText('Pergunta de paridade?')).toBeVisible({ timeout: 5000 });

  await row.getByRole('button', { name: 'Editar', exact: true }).last().click();
  // Scoped to the edit-in-place form specifically — the still-visible
  // "add a new exercise" form below shares the same .exercise-hint-input
  // class, so an unscoped locator is ambiguous.
  await row.locator('.exercise-item-edit .exercise-hint-input').fill('Dica de paridade');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(row.getByText('Dica: Dica de paridade')).toBeVisible({ timeout: 5000 });

  await row.getByRole('button', { name: 'Remover' }).click();
  await expect(row.getByText('Pergunta de paridade?')).not.toBeVisible({ timeout: 5000 });
});

test('Configuracoes: import/reset show a safe explanatory state instead of a dead button; export stays available', async ({ page }) => {
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#export-backup')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#choose-backup-file')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#reset-database')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#reset-message')).toContainText(/não é uma operação suportada/i, { timeout: 5000 });
});
