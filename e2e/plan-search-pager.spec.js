import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// Plano: search and 20-per-page pager over real lessons (real server, real database).

const SERVER_PORT = serverPort(13997);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-plan-pager-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'plan-pager E2E' });
});
test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});


test('search narrows the list and the pager walks 20 lessons per page', async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await signInRegistered(page, { email: `plan-pager-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  await page.evaluate(async (base) => {
    const { apiRequest } = await import('/src/api-client.js');
    const post = (body) => apiRequest('/v1/learning-units', { method: 'POST', body });
    const ids = [];
    for (let i = 1; i <= 25; i += 1) {
      const kind = i % 2 ? 0 : 1;
      const body = { title: `Aula ${String(i).padStart(2, '0')} de ${kind ? 'membro' : 'renal'}`, studyDate: '2026-11-10' };
      if (ids[kind]) body.subjectId = ids[kind]; else body.newSubjectName = kind ? 'Anatomia' : 'Fisiologia';
      const res = await post(body);
      if (!res.unit) throw new Error(JSON.stringify(res));
      ids[kind] = res.unit.subjectId;
    }
  }, API_BASE);
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(20, { timeout: 8000 });
  await expect(page.locator('#plan-page-label')).toHaveText('Página 1 de 2');
  await page.locator('#plan-next').click();
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(5);
  await expect(page.locator('#plan-next')).toBeDisabled();
  await page.locator('#plan-search').fill('membro');
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(12);
  await expect(page.locator('#plan-pager')).toBeHidden();
  await page.locator('#plan-search').fill('zzzz');
  await expect(page.locator('#plan-empty')).toBeVisible();
});
