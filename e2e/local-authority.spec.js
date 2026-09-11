import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// LOCAL-01A: Desktop reuses the same remote-store.js/api-client.js HTTP
// pipeline as REMOTE_MODE (see .specs/STATE.md's "ARCHITECTURE
// SUPERSESSION" section) but talks to a backend on THIS computer
// (127.0.0.1 loopback), started by the Tauri wrapper (src-tauri/src/lib.rs)
// — not a cloud server. Its defining behavioral difference from
// REMOTE_MODE: losing Wi-Fi/internet (navigator.onLine === false) must
// never block a mutation or hide live data behind a stale read-only
// snapshot, because the loopback backend is unaffected by that. These
// tests spoof `navigator.onLine` at the DOM level (a plain property
// override) rather than Playwright's `context.setOffline()`, which would
// also cut the real loopback traffic this test needs to still succeed —
// exactly the distinction LOCAL_DESKTOP_AUTHORITY exists to make.

const SERVER_PORT = 13971;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;
let dbPath;

async function waitForReady(deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('local-authority E2E: real server did not become ready in time');
}

function startServer() {
  return spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
}

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-local-authority-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = startServer();
  await waitForReady();
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Spoofs navigator.onLine at the DOM level without touching real network
 * traffic — the opposite of Playwright's context.setOffline(), which would
 * also block the genuine loopback requests these tests need to succeed. */
async function spoofNavigatorOffline(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
  });
}

async function enableRemoteMode(page, { localAuthority = false, apiBase = API_BASE } = {}) {
  await page.addInitScript(({ base, local }) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, { base: apiBase, local: localAuthority });
}

function uniqueEmail(label) {
  return `la-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function registerAndLogin(page, email, password) {
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
}

async function fillPlanUnitForm(page, { subjectName, title, studyDate }) {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill(subjectName);
  await page.locator('#plan-study-date').fill(studyDate);
  await page.locator('#plan-study-title').fill(title);
}

// -- A: REMOTE_AUTHORITY (no LOCAL_AUTHORITY flag) keeps T41's guard -------

test('A: REMOTE_AUTHORITY still refuses a mutation when navigator.onLine is false (LOCAL_AUTHORITY not set)', async ({ page }) => {
  await enableRemoteMode(page, { localAuthority: false });
  await spoofNavigatorOffline(page);
  const email = uniqueEmail('remote-offline');
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  await fillPlanUnitForm(page, { subjectName: 'Remoto Offline', title: 'Bloqueado Sem Local Authority', studyDate: '2020-01-01' });
  await page.locator('#plan-unit-save-btn').click();

  await expect(page.locator('#plan-unit-form-message')).toContainText(/./, { timeout: 5000 });
  await expect(page.locator('#plan-unit-form-message')).toHaveClass(/is-error/);
  await expect(page.locator('#screen-plan').getByText('Bloqueado Sem Local Authority')).toHaveCount(0);
});

// -- B: LOCAL_DESKTOP_AUTHORITY ignores navigator.onLine and really writes -

test('B: LOCAL_DESKTOP_AUTHORITY completes a real mutation against the local backend even when navigator.onLine is false', async ({ page }) => {
  await enableRemoteMode(page, { localAuthority: true });
  await spoofNavigatorOffline(page);
  const email = uniqueEmail('local-offline');
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  await fillPlanUnitForm(page, { subjectName: 'Local Authority', title: 'Unidade Criada Sem Internet', studyDate: '2026-01-05' });
  await page.locator('#plan-unit-save-btn').click();

  const planRowTitle = page.locator('#plan-list .plan-row-compact .plan-unit-title', {
    hasText: 'Unidade Criada Sem Internet',
  });
  await expect(planRowTitle).toBeVisible({ timeout: 5000 });

  // Not a client-side illusion: reload (still navigator.onLine === false,
  // still LOCAL_AUTHORITY) and confirm the unit was genuinely persisted by
  // the real local backend, not merely rendered optimistically.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await expect(planRowTitle).toBeVisible({ timeout: 5000 });

  // F: proves this went through remote-store.js/api-client.js into the real
  // spawned server (the domain authority), not the old local BrowserStore —
  // reading straight from the real server's own /v1 API, sharing the
  // browser session cookie via Playwright's request context (not app.js's
  // DOM at all).
  const apiResponse = await page.request.get(`${API_BASE}/v1/learning-units`);
  expect(apiResponse.ok()).toBe(true);
  const { units } = await apiResponse.json();
  assertTitlePresent(units, 'Unidade Criada Sem Internet');
});

function assertTitlePresent(units, title) {
  expect(Array.isArray(units), 'server response must be a real array of units').toBe(true);
  expect(units.some((u) => u.title === title), `server-side learning_units must contain "${title}"`).toBe(true);
}

// Test E ("an indisponible local process produces an explicit error, never
// an empty state") is NOT provable at this browser/e2e layer: by the time a
// page exists at all, item E's actual guarantee has either already held or
// already failed at the Rust layer (src-tauri/src/lib.rs spawns the local
// backend and waits for it to answer /health/ready BEFORE ever building the
// window — see wait_for_local_backend_ready's own Rust tests). A page-level
// test here would only prove what happens if a backend that answered
// AuthUI.bootstrap() during boot later dies — a real but different case
// from "never started at all," and already covered by this app's ordinary
// NetworkError handling (T40/T42). Item E's actual evidence lives in
// src-tauri/src/lib.rs's Rust test suite.
