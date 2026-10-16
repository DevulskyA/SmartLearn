import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T40: PWA shell + private cache lifecycle, proved against a real spawned
// server and a real browser (mirrors e2e/server-authority.spec.js's own
// pattern) with genuine Playwright network-offline emulation — not a
// mocked fetch. Required evidence per tasks.md T40: cold offline reopen
// after a prior sync displays the app/agenda; a corrupt/partial new fetch
// never replaces a good old snapshot; a second account never sees the
// first's data, including offline.

const SERVER_PORT = serverPort(13961);
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
  throw new Error('offline E2E: real server did not become ready in time');
}

function startServer() {
  return spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
}

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-offline-'));
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
  return `off-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function registerAndLogin(page, email, password) {
  await signInRegistered(page, { email: email, password: password });
}

async function createUnit(page, { subjectName, title, studyDate }) {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill(subjectName);
  await page.locator('#plan-study-date').fill(studyDate);
  await page.locator('#plan-study-title').fill(title);
  await page.locator('#plan-unit-save-btn').click();
}

async function waitForServiceWorkerActive(page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
}

/** Waits for a fresh, successful full-generation sync (the request app.js
 * fires on every REMOTE_MODE boot/login) so IndexedDB is known-populated
 * before the test goes offline. */
async function waitForSnapshotSync(page) {
  await page.waitForResponse(
    (res) => res.url().includes('/v1/agenda-snapshot') && res.status() === 200,
    { timeout: 5000 },
  );
}

test('cold offline reopen after a prior sync displays the app shell and the cached agenda', async ({ page }) => {
  await enableRemoteMode(page);
  const email = uniqueEmail('cold');
  await registerAndLogin(page, email, 'a genuinely long test password 1');
  await waitForServiceWorkerActive(page);

  await createUnit(page, { subjectName: 'Cardiologia Offline', title: 'Debito Cardiaco Offline', studyDate: '2020-01-01' });

  // Force a fresh sync that includes the just-created unit's review tasks
  // (the automatic login-time sync ran before this unit existed).
  const syncResponse = waitForSnapshotSync(page);
  await page.reload();
  await syncResponse; // a 200 here already proves the session survived the reload

  await page.context().setOffline(true);
  await page.reload();

  // The SW-cached shell must load the real app (not the browser's own
  // offline error page) with zero network available at all.
  await expect(page.locator('.app-header .brand')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#offline-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-review-list="overdue"] .review-row').first()).toContainText('Debito Cardiaco Offline', { timeout: 5000 });

  await page.context().setOffline(false);
});

test('a sync attempt that fails partway never replaces the last good snapshot', async ({ page }) => {
  await enableRemoteMode(page);
  const email = uniqueEmail('partial');
  await registerAndLogin(page, email, 'a genuinely long test password 1');
  await waitForServiceWorkerActive(page);

  await createUnit(page, { subjectName: 'Neurologia Offline', title: 'Sinapse Offline', studyDate: '2020-01-01' });
  const syncResponse = waitForSnapshotSync(page);
  await page.reload();
  await syncResponse;

  const goodRevision = await page.evaluate(async () => {
    const { loadSnapshot } = await import('/src/offline-store.js');
    const { getCurrentUser } = await import('/src/auth-ui.js');
    const snap = await loadSnapshot(getCurrentUser().id);
    return snap?.dataRevision ?? null;
  });
  expect(goodRevision).toBeTruthy();

  // Force every /v1/agenda-snapshot response to look like a concurrent
  // change raced this sync (409 REVISION_CHANGED), the whole way through
  // syncSnapshot's own bounded retry budget.
  await page.route('**/v1/agenda-snapshot*', (route) => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'REVISION_CHANGED' } }),
  }));

  const result = await page.evaluate(async () => {
    const { syncSnapshot } = await import('/src/offline-store.js');
    const { getCurrentUser } = await import('/src/auth-ui.js');
    return syncSnapshot(getCurrentUser().id);
  });
  expect(result.ok).toBe(false);

  await page.unroute('**/v1/agenda-snapshot*');

  const revisionAfterFailure = await page.evaluate(async () => {
    const { loadSnapshot } = await import('/src/offline-store.js');
    const { getCurrentUser } = await import('/src/auth-ui.js');
    const snap = await loadSnapshot(getCurrentUser().id);
    return snap?.dataRevision ?? null;
  });
  expect(revisionAfterFailure).toBe(goodRevision);
});

test('a reachable network but a dead SmartLearn server still falls back to the cached snapshot (AC-24)', async ({ page }) => {
  // T42 regression: navigator.onLine reflects only the OS network adapter's
  // link state, not whether the SmartLearn server specifically answers.
  // Every other test in this file uses page.context().setOffline(true),
  // which ALSO flips navigator.onLine false — so none of them can exercise
  // "Wi-Fi/network fully up, but this one server is down/unreachable",
  // which is what native Windows UAT actually reproduced (T42 checkpoint).
  // This test kills a dedicated API server (never touching context.setOffline
  // or navigator.onLine) so the failure the app sees is a genuine fetch()
  // rejection — the same NetworkError path a real dead/restarting/firewalled
  // server produces — while the Vite shell server on :5199 stays up.
  const port = serverPort(13962);
  const base = `http://localhost:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'sl-e2e-serverdown-'));
  const path = join(dir, 'e2e.db');
  const proc = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: path,
      PORT: String(port),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try { if ((await fetch(`${base}/health/ready`)).status === 200) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 150));
    }

    await page.addInitScript((b) => {
      window.__SMARTLEARN_API_BASE__ = b;
      window.__SMARTLEARN_REMOTE_MODE__ = true;
    }, base);

    const email = uniqueEmail('serverdown');
    await registerAndLogin(page, email, 'a genuinely long test password 1');
    await waitForServiceWorkerActive(page);
    await createUnit(page, { subjectName: 'Nefrologia Offline', title: 'Filtracao Offline', studyDate: '2020-01-01' });

    const syncResponse = page.waitForResponse(
      (res) => res.url().includes('/v1/agenda-snapshot') && res.status() === 200,
      { timeout: 5000 },
    );
    await page.reload();
    await syncResponse; // proves the just-created unit is in the stored snapshot

    proc.kill(); // the API server dies; navigator.onLine is never touched
    await new Promise((r) => setTimeout(r, 300));

    await page.reload();
    // Same assertions as the "known offline" test above: shell loads (no
    // browser offline error page), and the offline banner + last-synced
    // snapshot appear — proving this failure mode gets the same read-only
    // fallback as a real navigator.onLine===false cold start.
    await expect(page.locator('.app-header .brand')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-screen="today"]').click();
    await expect(page.locator('#offline-banner')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-review-list="overdue"] .review-row').first()).toContainText('Filtracao Offline', { timeout: 5000 });
  } finally {
    proc.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a second account never sees the first account\'s agenda after switching, even offline', async ({ page }) => {
  await enableRemoteMode(page);
  const emailA = uniqueEmail('switchA');
  const emailB = uniqueEmail('switchB');
  const password = 'a genuinely long test password 1';

  await registerAndLogin(page, emailA, password);
  await waitForServiceWorkerActive(page);
  await createUnit(page, { subjectName: 'Isolamento Offline A', title: 'Conteudo Exclusivo Offline A', studyDate: '2020-01-01' });
  const syncA = waitForSnapshotSync(page);
  await page.reload();
  await syncA; // a 200 here already proves the session survived the reload

  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-logout-btn').click();
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });

  await registerAndLogin(page, emailB, password);

  const syncB = waitForSnapshotSync(page);
  await page.reload();
  await syncB;

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('.app-header .brand')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#offline-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('body')).not.toContainText('Conteudo Exclusivo Offline A');
  await expect(page.locator('[data-review-list="overdue"] .review-row')).toHaveCount(0);

  await page.context().setOffline(false);
});

// T-F4-08: offline Hoje also lists the snapshot's UPCOMING reviews (dueDate > today), read-only. The snapshot is seeded straight
// into the real IndexedDB store (same shape syncSnapshot writes) so the dates are exact; the offline reopen is genuine.
function localDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function openOfflineTodayWithSnapshotItems(page, label, items) {
  await enableRemoteMode(page);
  await registerAndLogin(page, uniqueEmail(label), 'a genuinely long test password 1');
  await waitForServiceWorkerActive(page);
  const syncResponse = waitForSnapshotSync(page);
  await page.reload();
  await syncResponse;
  await page.evaluate(async (seed) => {
    const { loadSnapshot } = await import('/src/offline-store.js');
    const { getCurrentUser } = await import('/src/auth-ui.js');
    const snapshot = await loadSnapshot(getCurrentUser().id);
    snapshot.items = seed;
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('smartlearn-offline', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('agenda-snapshots', 'readwrite');
        tx.objectStore('agenda-snapshots').put(snapshot);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, items);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('.app-header .brand')).toBeVisible({ timeout: 5000 });
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#offline-banner')).toBeVisible({ timeout: 5000 });
}

const snapItem = (id, offset, unitTitle, subjectName) => ({ reviewTaskId: id, dueDate: localDate(offset), unitTitle, subjectName });

test('offline Hoje lists upcoming reviews by date with aula and disciplina, beside overdue and today, read-only', async ({ page }) => {
  await openOfflineTodayWithSnapshotItems(page, 'upc', [
    snapItem(9, 9, 'Aula D9', 'Disc Nove'),
    snapItem(1, -2, 'Aula Atrasada', 'Disc Velha'),
    snapItem(3, 3, 'Aula C3', 'Disc Tres'),
    snapItem(2, 0, 'Aula Hoje', 'Disc Hoje'),
    snapItem(4, 1, 'Aula B1', 'Disc Um'),
    snapItem(5, 3, 'Aula C3b', 'Disc Tres'),
  ]);
  await expect(page.locator('#offline-banner')).toContainText(/última sincronização/i);
  await expect(page.locator('[data-review-list="overdue"] .review-row')).toHaveText(['Aula Atrasada — Disc Velha']);
  await expect(page.locator('[data-review-list="today"] .review-row')).toHaveText(['Aula Hoje — Disc Hoje']);

  const block = page.locator('#block-upcoming');
  await expect(block).toBeVisible();
  await expect(block.getByRole('heading', { name: 'Próximas revisões', level: 2 })).toBeVisible();
  await expect(block.locator('li')).toHaveText(['Aula B1 — Disc Um', 'Aula C3 — Disc Tres', 'Aula C3b — Disc Tres', 'Aula D9 — Disc Nove']);
  await expect(block.locator('h3')).toHaveCount(3);
  await expect(block.locator('ul')).toHaveCount(3);
  await expect(page.locator('#today-load-summary')).toContainText('4 próximas');
  await expect(page.locator('#today-success-state')).toBeHidden();
  await expect(block.getByText('Nada vence hoje')).toBeHidden();
  // read-only: no control that could write anything
  await expect(block.locator('button, a, input, select, textarea, [role="button"]')).toHaveCount(0);
  await expect(page.locator('#review-dashboard button')).toHaveCount(0);
  await page.context().setOffline(false);
});

test('offline Hoje shows no upcoming block when the snapshot has no future review', async ({ page }) => {
  await openOfflineTodayWithSnapshotItems(page, 'noupc', [
    snapItem(1, -1, 'Aula Atrasada', 'Disc Velha'),
    snapItem(2, 0, 'Aula Hoje', 'Disc Hoje'),
  ]);
  await expect(page.locator('[data-review-list="overdue"] .review-row')).toHaveCount(1);
  await expect(page.locator('[data-review-list="today"] .review-row')).toHaveCount(1);
  await expect(page.locator('#block-upcoming')).toBeHidden();
  await expect(page.locator('#today-load-summary')).not.toContainText('próxima');
  await page.context().setOffline(false);
});

test('offline Hoje with only future reviews does not say "tudo em dia" without listing them', async ({ page }) => {
  await openOfflineTodayWithSnapshotItems(page, 'onlyfuture', [snapItem(1, 2, 'Aula Futura', 'Disc Futura')]);
  await expect(page.locator('#today-success-state')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Tudo em dia!' })).toHaveCount(0); // role queries skip hidden elements
  const block = page.locator('#block-upcoming');
  await expect(block).toBeVisible();
  await expect(block).toContainText('Nada vence hoje.');
  await expect(block.locator('li')).toHaveText(['Aula Futura — Disc Futura']);
  await page.context().setOffline(false);
});

test('offline Hoje caps the upcoming list at 20 rows and counts the rest', async ({ page }) => {
  const many = Array.from({ length: 25 }, (_, i) => snapItem(i + 1, i + 1, `Aula ${String(i + 1).padStart(2, '0')}`, 'Disc'));
  await openOfflineTodayWithSnapshotItems(page, 'cap', many.reverse());
  const block = page.locator('#block-upcoming');
  await expect(block.locator('li')).toHaveCount(20);
  await expect(block.locator('li').first()).toContainText('Aula 01');
  await expect(block.locator('li').last()).toContainText('Aula 20');
  await expect(block).toContainText('e mais 5');
  await page.context().setOffline(false);
});

test('axe: offline Hoje with upcoming reviews has no critical/serious violation at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openOfflineTodayWithSnapshotItems(page, 'axe', [
    snapItem(1, 1, 'Aula B1', 'Disc Um'),
    snapItem(2, 4, 'Aula E4', 'Disc Quatro'),
  ]);
  await expect(page.locator('#block-upcoming')).toBeVisible();
  const scrollsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrollsHorizontally).toBe(false);
  const result = await new AxeBuilder({ page }).include('#screen-today').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
  await page.context().setOffline(false);
});
