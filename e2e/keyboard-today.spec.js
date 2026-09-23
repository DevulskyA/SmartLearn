import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ACCESS-3: the scheduled review in "Hoje" completed with the KEYBOARD ALONE (Tab / Shift+Tab / Enter / Space).

const SERVER_PORT = 13997;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-kbd-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('keyboard E2E: real server did not become ready in time');
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
  const email = `kbd-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await page.locator('[data-screen="account"]').click();
    await expect(page.locator('#account-show-register')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
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

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

/** A real keyboard focus indicator (outline or ring) on the element that has focus. */
const hasFocusRing = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.activeElement);
  return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (!!cs.boxShadow && cs.boxShadow !== 'none');
});

test('ACCESS-3 Hoje: open a review, reveal, judge and complete it with the keyboard; focus is never lost and the checkbox names its review', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Hoje Teclado', title: 'Aula hoje teclado', studyDate: '2026-08-01' });
  for (const i of [1, 2]) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Hoje pergunta ${i}?`, answer: `Certa ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });

  await page.locator('[data-screen="today"]').click();
  const row = page.locator('.review-row', { hasText: 'Aula hoje teclado' }).first();
  await expect(row).toBeVisible({ timeout: 8000 });

  // open the row from the keyboard
  await row.locator('.review-row-toggle').first().focus();
  await page.keyboard.press('Enter');
  const reveal = row.locator('[data-action="reveal-answer"]');
  await expect(reveal.first()).toBeVisible({ timeout: 5000 });
  await expect(row.locator('.review-row-toggle').first()).toBeFocused(); // still where the user was

  // question 1: reveal, then Tab reaches "Acertei", Enter judges it
  await reveal.first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(row.locator('[data-action="exercise-acertei"]').first()).toBeFocused();
  expect(await hasFocusRing(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(row.locator('.review-exercise-item').first()).toHaveClass(/is-correct/);
  expect(await page.evaluate(() => document.activeElement !== document.body), 'focus must not fall out of the page after judging').toBe(true);

  // question 2: reveal, Tab, Tab -> "Errei"
  await reveal.nth(1).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(row.locator('[data-action="exercise-errei"]').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row.locator('.review-exercise-item').nth(1)).toHaveClass(/is-wrong/);
  await expect(row.locator('[data-action="retest-block"]')).toBeFocused(); // the one obvious next action

  // the "Revisão feita" checkbox says WHICH review (several rows say the same words), and still starts with the visible label
  const done = row.locator('[data-action="review-done"]');
  const name = await done.evaluate((el) => el.getAttribute('aria-label'));
  expect(name).toMatch(/^Revisão feita/);
  expect(name).toContain('Aula hoje teclado');
  await done.focus();
  await page.keyboard.press('Space');
  const doneId = await done.getAttribute('data-review-id');
  // completing re-rendered Hoje: focus is on the SAME review's checkbox (now checked), not lost to the page
  const again = page.locator(`[data-action="review-done"][data-review-id="${doneId}"]`);
  await expect(again).toBeChecked({ timeout: 8000 });
  await expect(again).toBeFocused();
});
