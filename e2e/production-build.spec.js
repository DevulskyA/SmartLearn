import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T24: the dev-server e2e suite (playwright.config.js's webServer runs
// `vite --port 5199`, a dev server) never exercises the real production
// artifact (`npm run build`'s dist/) served the way T21's design actually
// ships it: one Fastify process serving both the built SPA (via staticDir)
// and the /v1 API on a single real origin, no Vite involved at all. This
// file is the one place that real topology gets driven end to end against
// a real browser, closing T24's "production-build E2E" done-when criterion.
// Kept intentionally minimal: one real walking-skeleton journey (register,
// create a unit, reload, still there) is enough to prove the packaged
// bundle plus single-origin serving actually works — the identity/
// ownership/parity/no-fallback properties this exercises are already
// independently proven at the HTTP/DTO level (see validation.md's T24 row);
// this test's unique job is proving the BUILD ARTIFACT itself is not broken.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const SERVER_PORT = 13961;
const SERVER_ORIGIN = `http://localhost:${SERVER_PORT}`;

let serverProcess;
let dbDir;
let dbPath;

async function waitForReady(deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SERVER_ORIGIN}/health/ready`);
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('production-build E2E: real server did not become ready in time');
}

test.beforeAll(async () => {
  // Real production artifact, built fresh from this exact candidate — not
  // reused/assumed from a possibly-stale prior build.
  // shell:true is required for npm.cmd resolution on Windows; args are
  // static constants (no interpolated/user-controlled input), so the
  // unescaped-argument concern the Node deprecation warning flags does
  // not apply here.
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
  if (!existsSync(DIST_DIR)) {
    throw new Error(`production-build E2E: expected build output at ${DIST_DIR}, none found`);
  }

  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-production-build-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_STATIC_DIR: DIST_DIR,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      // Single real origin (server serves both the built SPA and /v1) — the
      // browser's own Origin on this origin's mutating requests, no CORS
      // needed at all, matching T21's designed single-process deployment.
      SMARTLEARN_ALLOWED_ORIGINS: SERVER_ORIGIN,
    },
    stdio: 'ignore',
    shell: false,
  });
  await waitForReady();
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function uniqueEmail(label) {
  return `pb-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

test('the real production build, served single-origin with no Vite involved, completes register -> create unit -> reload -> still there', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, SERVER_ORIGIN);

  await page.goto(SERVER_ORIGIN + '/');
  await page.waitForLoadState('networkidle');

  // Proves this is genuinely the built artifact, not an accidental Vite
  // dev/transform response (e.g. an unbundled ESM module graph or the
  // `@vite/client` HMR client script Vite always injects in dev).
  const html = await page.content();
  expect(html).not.toContain('@vite/client');
  await expect(page).toHaveTitle('SmartLearn');

  const email = uniqueEmail('journey');
  const password = 'a-genuinely-long-enough-passphrase';

  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  // Login's authenticated-state flip happens after an async renderAccount()
  // inside the submit handler (src/app.js) — wait for its own visible
  // completion signal (same pattern as e2e/server-authority.spec.js) rather
  // than racing the click against that promise.
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('Production Build Check');
  await page.locator('#plan-study-date').fill('2026-09-10');
  await page.locator('#plan-study-title').fill('Prod bundle journey');
  await page.locator('#plan-unit-save-btn').click();

  // Structural locator, not getByText: the plan list row's own title span
  // is the one place this unit's title is guaranteed to render exactly
  // once — other elements sharing this text (e.g. a review-content heading
  // or summary display) belong to a different part of the screen and must
  // not be conflated with "the unit appears in Plano".
  const planRowTitle = page.locator('#plan-list .plan-row-compact .plan-unit-title', {
    hasText: 'Prod bundle journey',
  });
  await expect(planRowTitle).toBeVisible({ timeout: 5000 });

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await expect(planRowTitle).toBeVisible({ timeout: 5000 });
});
