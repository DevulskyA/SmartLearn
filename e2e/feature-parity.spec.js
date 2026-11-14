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

// T22: proves the remaining screens (Disciplinas, Estatisticas,
// Acompanhamento, Configuracoes, Cadastro/exercises) have a real
// server-mode equivalent — not just Hoje/Plano, which T21 already covers.
// Same real-server-child-process + REMOTE_MODE-flag pattern as
// e2e/server-authority.spec.js.

const SERVER_PORT = serverPort(13961);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-feature-parity-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'feature-parity E2E' });
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
  const email = `fp-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

test('Disciplinas: create, rename, archive, reactivate, and delete a subject all work against the real server', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-manage-subjects-btn').click();
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

test('Disciplinas: Enter in the rename field saves and Escape cancels (found by the native UI test, A-07)', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-manage-subjects-btn').click();
  await page.locator('#subjects-show-create-btn').click();
  await page.locator('#subjects-new-name').fill('Teclado Original');
  await page.locator('#subjects-create-save-btn').click();
  const card = page.locator('.subject-catalog-card', { hasText: 'Teclado Original' });
  await expect(card).toBeVisible({ timeout: 5000 });

  await card.getByRole('button', { name: 'Editar' }).click();
  await card.locator('.subject-edit-name').fill('Nome Descartado');
  await card.locator('.subject-edit-name').press('Escape');
  await expect(card.locator('.subject-catalog-edit')).toBeHidden();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Teclado Original' })).toBeVisible();

  await card.getByRole('button', { name: 'Editar' }).click();
  await card.locator('.subject-edit-name').fill('Teclado Renomeado');
  await card.locator('.subject-edit-name').press('Enter');
  await expect(page.locator('.subject-catalog-card', { hasText: 'Teclado Renomeado' })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.subject-catalog-card', { hasText: 'Nome Descartado' })).toHaveCount(0);

  await page.reload();
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-manage-subjects-btn').click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Teclado Renomeado' })).toBeVisible({ timeout: 5000 });
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
  await expect(page.locator('#today-load-summary', { hasText: '1 concluída' })).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#metric-questions')).toBeVisible();

  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#plan-list')).not.toBeEmpty({ timeout: 5000 });
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
  // against the server there is nothing to wipe on this device: the whole "Apagar base local" card (title, sentence, button) is not offered
  await expect(page.locator('#reset-card')).toBeAttached({ timeout: 5000 });
  await expect(page.locator('#reset-card')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#reset-database')).toBeHidden({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'Apagar base local' })).toHaveCount(0);
});

test('Plano: the discipline filter lists a discipline created after the screen was first opened (T-F13-13)', async ({ page }) => {
  const createSubject = async (name) => {
    await page.locator('[data-screen="plan"]').click();
    if (await page.locator('#plan-subjects-panel').isHidden()) await page.locator('#plan-manage-subjects-btn').click(); // the panel stays open between the two calls
    await page.locator('#subjects-show-create-btn').click();
    await page.locator('#subjects-new-name').fill(name);
    await page.locator('#subjects-create-save-btn').click();
    await expect(page.locator('.subject-catalog-card', { hasText: name })).toBeVisible({ timeout: 5000 });
  };
  await createSubject('Disciplina Previa'); // the filter is first built with one discipline in it
  await page.locator('[data-screen="plan"]').click();
  await expect(async () => {
    expect(await page.locator('#plan-filter-subject option').allTextContents()).toContain('Disciplina Previa');
  }).toPass({ timeout: 5000 });
  await createSubject('Disciplina Tardia');
  await page.locator('[data-screen="plan"]').click();
  await expect(async () => {
    const names = await page.locator('#plan-filter-subject option').allTextContents();
    expect(names).toContain('Disciplina Tardia');
  }).toPass({ timeout: 5000 });
});

test('a data screen that cannot load says so and loads when the student tries again (T-F13-11)', async ({ page }) => {
  await page.route('**/v1/learning-units', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
  await page.locator('[data-screen="plan"]').click();
  const error = page.locator('#screen-plan .screen-load-error');
  await expect(error).toBeVisible({ timeout: 8000 });
  await expect(error).toContainText('Não foi possível carregar esta tela');
  await expect(page.locator('#screen-plan')).not.toHaveAttribute('aria-busy', 'true');
  await page.unroute('**/v1/learning-units');
  await error.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(error).toBeHidden({ timeout: 8000 });
});
