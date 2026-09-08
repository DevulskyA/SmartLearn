import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T41: "offline is read-only" proved from the WRITE side (e2e/offline.spec.js
// proves the read side). Required evidence per tasks.md T41: an offline
// mutation attempt changes zero server/cache truth and leaves no
// pending_writes trace; an expired online session locks protected
// operations and clears stale identity.

const SERVER_PORT = 13962;
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
  throw new Error('offline-writes E2E: real server did not become ready in time');
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
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-offline-writes-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = startServer();
  await waitForReady();
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function enableRemoteMode(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
}

function uniqueEmail(label) {
  return `ow-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

/** Every IndexedDB object store this origin has ever created, across every
 * database — used to assert offline-store.js never grew a second store
 * (a write queue/outbox) beyond its one documented 'agenda-snapshots'
 * snapshot cache. */
async function listAllObjectStores(page) {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const stores = [];
    for (const { name } of dbs) {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          stores.push(...Array.from(req.result.objectStoreNames));
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
    return stores;
  });
}

test('an offline mutation attempt fails visibly, creates zero server rows, and leaves no persistent write-queue trace', async ({ page }) => {
  await enableRemoteMode(page);
  const email = uniqueEmail('mutate');
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  const storesBefore = await listAllObjectStores(page);

  await page.context().setOffline(true);
  await fillPlanUnitForm(page, { subjectName: 'Nefrologia Offline', title: 'Tentativa Offline Sem Efeito', studyDate: '2020-01-01' });
  await page.locator('#plan-unit-save-btn').click();

  await expect(page.locator('#plan-unit-form-message')).toContainText(/./, { timeout: 5000 });
  await expect(page.locator('#plan-unit-form-message')).toHaveClass(/is-error/);
  // No optimistic/fake success: the attempted unit never appears on Plano.
  await expect(page.locator('#screen-plan').getByText('Tentativa Offline Sem Efeito')).toHaveCount(0);

  // No new IndexedDB object store was created by the failed attempt —
  // there is no write queue/outbox anywhere in this app to have grown one.
  const storesAfter = await listAllObjectStores(page);
  expect(new Set(storesAfter)).toEqual(new Set(storesBefore));

  await page.context().setOffline(false);
  await page.reload();
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan').getByText('Tentativa Offline Sem Efeito')).toHaveCount(0, { timeout: 5000 });
});

test('an expired online session locks protected operations and clears stale client identity', async ({ page }) => {
  await enableRemoteMode(page);
  const email = uniqueEmail('expire');
  await registerAndLogin(page, email, 'a genuinely long test password 1');

  // Simulate real server-side session death (expiry/revocation) without the
  // client knowing yet — clearing the httpOnly session cookie is the exact
  // externally-observable effect of that, at the one boundary the browser
  // (not app.js) controls: Playwright can manage it even though the app's
  // own JS never could.
  await page.context().clearCookies();

  // Merely navigating to a protected data screen already issues a real,
  // authenticated GET (renderPlan's own DB.learningUnits.getAll() etc.) —
  // that alone is enough to surface the 401 and lock the app; a mutation
  // attempt isn't even required to prove the guard fires.
  await page.locator('[data-screen="plan"]').click();

  // The 401 -> smartlearn:unauthenticated -> re-confirm bootstrap -> logout
  // UI chain locks the app: the logged-out view reappears without the user
  // ever clicking "Sair".
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });

  // Stale identity is actually cleared, not just hidden: a fresh reload
  // with no session confirms logged-out state from a cold start too.
  await page.reload();
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });
});
