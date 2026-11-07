import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// N7 (Constitution §7, §39, §40): no screen may be a dead end. A brand-new student, with no data at all, opens every
// screen and must find at least one visible, enabled thing to do. The time until that first action appears is printed
// as a number (no hard limit: it is an observation for the baseline, not a verdict).

const SERVER_PORT = serverPort(13947);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const SCREENS = ['today', 'plan', 'register', 'stats', 'settings', 'account'];

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-dead-end-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'dead-end sweep E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('DEADEND-1: a brand-new account finds a visible action on every screen', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `deadend-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });

  const timings = {};
  const deadEnds = [];
  for (const screen of SCREENS) {
    const started = Date.now();
    await page.goto(`/#${screen}`);
    const panel = page.locator(`[data-screen-panel="${screen}"]`);
    await expect(panel).toBeVisible({ timeout: 8000 });
    const action = panel.locator('button:visible:not([disabled]), a[href]:visible, input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled])').first();
    try {
      await expect(action).toBeVisible({ timeout: 5000 });
      timings[screen] = Date.now() - started;
    } catch {
      deadEnds.push(screen);
    }
  }
  console.log(`DEADEND time to first visible action (ms): ${JSON.stringify(timings)}`);
  expect(deadEnds, 'screens with no visible action for a new account').toEqual([]);
});
