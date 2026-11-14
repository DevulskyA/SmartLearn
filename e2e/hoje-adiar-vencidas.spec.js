import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// HG-09 "Adiar vencidas": a student with 18 overdue reviews moves them to the coming days, a few per day, from Hoje.
// They stay pending (nothing completed, nothing deleted, no evidence). Real server child process, disposable database.

const SERVER_PORT = serverPort(13957);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-adiar-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('adiar-vencidas E2E: real server did not become ready in time');
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
  const email = `adiar-${Date.now()}-${randomUUID()}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TITLES = [
  'Fisiologia renal: filtração glomerular', 'Fisiologia renal: túbulo proximal', 'Farmacologia: antibióticos beta-lactâmicos',
  'Anatomia: plexo braquial', 'Bioquímica: ciclo de Krebs', 'Histologia: tecido epitelial', 'Patologia: inflamação aguda',
  'Cardiologia: ciclo cardíaco', 'Neuroanatomia: vias motoras',
];

// 9 units studied 8..14 days ago: R1 and R2 of each are overdue = 18 overdue reviews.
async function seedEighteenOverdue(page) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Medicina');
  await page.locator('#new-subject-form button[type="submit"]').click();
  for (let i = 0; i < 9; i += 1) {
    await page.locator('#study-date').fill(daysAgo(8 + (i % 7)));
    await page.locator('#study-content').fill(TITLES[i]);
    await page.locator('#study-form button[type="submit"]').click();
    await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  }
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('[data-count-for="overdue"]')).toContainText('18', { timeout: 8000 });
}

// what the server holds, read through the signed-in page itself (same cookie)
const serverTasks = (page) => page.evaluate(async (base) => {
  const res = await fetch(`${base}/v1/review-tasks`, { credentials: 'include' });
  return (await res.json()).reviewTasks;
}, API_BASE);

test('Adiar vencidas: confirms with the count and the dates, moves the 18 to the coming days (max per day), keeps them pending, and does not count as study', async ({ page }) => {
  test.setTimeout(120000);
  await seedEighteenOverdue(page);
  const before = await serverTasks(page);
  const overdueBefore = before.filter((t) => !t.completedAt && t.dueDate < daysAgo(0));
  expect(overdueBefore).toHaveLength(18);

  const open = page.locator('#postpone-overdue-btn');
  const dialog = page.locator('#postpone-dialog');
  await expect(open).toBeVisible();
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#postpone-summary')).toContainText('18 revisões vencidas serão adiadas, no máximo 5 por dia');
  await expect(dialog.locator('#postpone-per-day')).toHaveValue('5');

  // the preview follows the daily maximum, and an invalid one blocks the confirmation
  await dialog.locator('#postpone-per-day').fill('9');
  await expect(dialog.locator('#postpone-summary')).toContainText('no máximo 9 por dia');
  await dialog.locator('#postpone-per-day').fill('0');
  await expect(dialog.locator('#postpone-error')).toBeVisible();
  await expect(dialog.locator('#postpone-confirm')).toBeDisabled();
  await dialog.locator('#postpone-per-day').fill('5');
  await expect(dialog.locator('#postpone-confirm')).toBeEnabled();

  // cancelling changes nothing
  await dialog.locator('#postpone-cancel').click();
  await expect(dialog).toBeHidden();
  expect(await serverTasks(page)).toEqual(before);
  await expect(page.locator('[data-count-for="overdue"]')).toContainText('18');

  // confirming moves them
  await open.click();
  await dialog.locator('#postpone-confirm').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#review-dashboard-message')).toContainText('18 revisões adiadas');
  await expect(page.locator('#block-overdue')).toBeHidden();
  await expect(page.locator('#block-done-today')).toBeHidden();

  const after = await serverTasks(page);
  expect(after).toHaveLength(before.length);
  expect(after.every((t) => !t.completedAt), 'nothing was completed').toBe(true);
  const byDay = new Map();
  for (const old of overdueBefore) {
    const now = after.find((t) => t.id === old.id);
    expect(now.dueDate > daysAgo(0), 'moved to a future day').toBe(true);
    expect(now.offsetDays).toBe(old.offsetDays);
    byDay.set(now.dueDate, (byDay.get(now.dueDate) ?? 0) + 1);
  }
  expect(Math.max(...byDay.values())).toBeLessThanOrEqual(5);
  expect(byDay.size).toBe(4); // 5 + 5 + 5 + 3
  for (const t of before.filter((x) => !overdueBefore.some((o) => o.id === x.id))) {
    expect(after.find((x) => x.id === t.id).dueDate, 'a review that was not overdue keeps its date').toBe(t.dueDate);
  }

  // still moved after a reload, and the button is gone (nothing left to postpone: repeating it is a no-op)
  await page.reload();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#block-overdue')).toBeHidden();
  await expect(page.locator('#postpone-overdue-btn')).toBeHidden();
});
