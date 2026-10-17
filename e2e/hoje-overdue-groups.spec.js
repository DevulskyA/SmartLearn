import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// P1: a long-absent student saw 34 identical-looking "Vencidas" cards (stages R1..Rn of a few units). Hoje now shows ONE
// card per unit, collapsed when the list is long; every stage keeps its own row and "Revisao feita". Real server child
// process, same pattern as today-primary-action.spec.js.

const SERVER_PORT = serverPort(13954);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-overdue-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('overdue-groups E2E: real server did not become ready in time');
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
  const email = `overdue-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Hoje groups overdue stages by unit, starts collapsed when long, keeps every stage actionable', async ({ page }) => {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Atraso Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  const addUnit = async (title, date) => {
    await page.locator('#study-date').fill(date);
    await page.locator('#study-content').fill(title);
    await page.locator('#study-form button[type="submit"]').click();
    await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  };
  await addUnit('Aula Muito Antiga', daysAgo(100)); // offsets 1,7,15,30,60,90 overdue -> R1 a R6
  await addUnit('Aula Antiga', daysAgo(40));        // offsets 1,7,15,30 overdue -> R1 a R4
  await addUnit('Aula Recente', daysAgo(5));        // only R1 overdue -> stays a plain row

  await page.locator('[data-screen="today"]').click();
  const list = page.locator('[data-review-list="overdue"]');
  const count = page.locator('[data-count-for="overdue"]');

  // BEFORE this change: 11 cards. NOW: 3 cards (2 unit cards + 1 plain row); the counter tells stages from units.
  await expect(count).toHaveText('11 revisões · 3 conteúdos', { timeout: 5000 });
  await expect(list.locator('> *')).toHaveCount(3);
  await expect(list.locator('details.overdue-unit')).toHaveCount(2);
  await expect(list.locator('> .review-row')).toHaveCount(1);
  await expect(list.locator('> .review-row')).toContainText('Aula Recente');

  const muitoAntiga = list.locator('details.overdue-unit', { hasText: 'Aula Muito Antiga' });
  await expect(muitoAntiga.locator('summary')).toContainText('6 revisões atrasadas');
  await expect(muitoAntiga.locator('summary')).toContainText('R1 a R6');
  await expect(muitoAntiga.locator('summary')).toContainText('a mais antiga há 99 dias');
  await expect(list.locator('details.overdue-unit', { hasText: 'Aula Antiga' }).locator('summary')).toContainText('R1 a R4');

  // 11 stages > the collapse threshold: unit cards start closed, their stage rows are not on screen.
  await expect(list.locator('details.overdue-unit[open]')).toHaveCount(0);
  await expect(muitoAntiga.locator('.review-row').first()).toBeHidden();

  // "Começar agora" must still reach its review: it opens the card that holds it.
  await page.locator('#today-primary-action-btn').click();
  const targetId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
  const target = page.locator(`.review-row[data-review-id="${targetId}"]`);
  await expect(target).toBeVisible();
  await expect(target.locator('xpath=ancestor::details[contains(@class,"overdue-unit")]')).toHaveJSProperty('open', true);

  // Each stage keeps its own "Revisão feita"; finishing one re-renders without folding the card the student opened.
  await target.locator('[data-action="review-done"]').check();
  await expect(count).toHaveText('10 revisões · 3 conteúdos', { timeout: 5000 });
  await expect(list.locator('details.overdue-unit[open]')).toHaveCount(1);
  await expect(list.locator(`.review-row[data-review-id="${targetId}"]`)).toHaveCount(0); // it moved on to "feitas hoje"
  await expect(list.locator('details.overdue-unit[open] summary')).toContainText('5 revisões atrasadas');
  await expect(list.locator('details.overdue-unit[open] summary')).toContainText('R2 a R6');
});
