import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T-F4-04 (R-06 AC-06.2, F-34): the lesson editor in narrow windows. At 360x800 (phone) and 768x1024 (tablet) the page never scrolls
// sideways, every control the student must press is a 44px target, and the whole job (read the summary, edit and save it, pick
// and save a question, read the source and the review, go back) is possible. Real server, FAKE provider: no model is called.

const SERVER_PORT = serverPort(13999);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const TARGET = 44;

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-lesson-resp-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('lesson-editor-responsive E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function openLesson(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `resp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const pdf = buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']);
  await page.setInputFiles('#sources-file-input', { name: 'responsivo.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
}

const overflow = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const wide = [...document.querySelectorAll('.lesson-editor, .lesson-editor *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > doc.clientWidth + 0.5 && !el.closest('.lesson-tabs');
  }).slice(0, 5).map((el) => el.tagName.toLowerCase() + '.' + el.className);
  return { scroll: doc.scrollWidth, client: doc.clientWidth, wide };
});

const smallTargets = (page) => page.evaluate((min) => [...document.querySelectorAll('.lesson-editor button, .lesson-editor summary, .lesson-editor input:not([type="hidden"]), .lesson-editor select, .lesson-editor textarea, .lesson-editor a[href]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; }) // a 1x1 clipped native select is the custom select's twin, not a target
  .map((el) => {
    const r = el.getBoundingClientRect();
    const who = el.tagName.toLowerCase() + (el.dataset.action ? '[' + el.dataset.action + ']' : '') + (el.dataset.tab ? '[tab ' + el.dataset.tab + ']' : '') + '.' + String(el.className).split(' ')[0];
    return { who, w: Math.round(r.width), h: Math.round(r.height) };
  })
  .filter((t) => t.h < min - 0.5 || t.w < min - 0.5), TARGET);

for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 1024 }]) {
  const label = `${viewport.width}x${viewport.height}`;

  test(`${label}: no horizontal overflow and 44px targets on every tab of the editor`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLesson(page);
    const editor = page.locator('.lesson-editor');
    const found = [];
    for (const tab of [/Resumo/, /Questões/, /Fonte/, /Revisão/]) {
      await editor.getByRole('tab', { name: tab }).click();
      const o = await overflow(page);
      if (o.scroll > o.client) found.push(`${tab}: overflow ${o.scroll}>${o.client} ${o.wide.join(',')}`);
      for (const s of await smallTargets(page)) found.push(`${tab}: ${s.who} ${s.w}x${s.h}`);
    }
    expect(found).toEqual([]);
  });

  test(`${label}: the whole job is possible: summary, question, source, review, back`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLesson(page);
    const editor = page.locator('.lesson-editor');
    await editor.locator('.lesson-summary-input').fill('Resumo editado em tela estreita');
    await editor.locator('[data-action="save-summary"]').click();
    await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
    await editor.getByRole('tab', { name: /Questões/ }).click();
    await expect(editor.locator('.lesson-qitem')).toHaveCount(3);
    await editor.locator('.lesson-qitem').nth(1).click();
    await editor.locator('.lesson-qeditor textarea').nth(1).fill('Resposta editada em tela estreita');
    await editor.locator('[data-action="save-question"]').click();
    await expect(editor.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva');
    for (const action of ['accept-question', 'toggle-reject-question', 'delete-question']) await expect(editor.locator(`[data-action="${action}"]`)).toBeVisible();
    await editor.getByRole('tab', { name: /Fonte/ }).click();
    await expect(editor.locator('[data-panel="source"]')).toContainText('responsivo.pdf');
    await editor.getByRole('tab', { name: /Revisão/ }).click();
    await expect(editor.locator('[data-panel="review"]')).toBeVisible();
    await editor.locator('[data-action="accept-draft"]').scrollIntoViewIfNeeded();
    await expect(editor.locator('[data-action="accept-draft"]')).toBeInViewport();
    await editor.locator('[data-action="lesson-back"]').click();
    await expect(page.locator('.lesson-editor')).toHaveCount(0);
    await expect(page.locator('#sources-card')).toBeVisible();
    const o = await overflow(page);
    expect(o.scroll).toBeLessThanOrEqual(o.client);
  });
}

for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 1024 }]) {
  test(`${viewport.width}x${viewport.height}: when the question list stacks above the editor, "Voltar à lista de questões" returns to the list and keeps the selection`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLesson(page);
    const editor = page.locator('.lesson-editor');
    await editor.getByRole('tab', { name: /Questões/ }).click();
    await editor.locator('.lesson-qitem').nth(2).click();
    const stacked = await page.evaluate(() => getComputedStyle(document.querySelector('.lesson-questions')).gridTemplateColumns.split(' ').length === 1);
    const back = editor.getByRole('button', { name: 'Voltar à lista de questões' });
    if (viewport.width < 720) expect(stacked).toBe(true);
    if (!stacked) { await expect(back).toBeHidden(); return; } // side by side: the list is already next to the editor
    await expect(back).toBeVisible();
    await expect.poll(async () => (await back.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
    await back.click();
    await expect(editor.locator('.lesson-qitem').nth(2)).toBeFocused();
    await expect(editor.locator('.lesson-qitem').nth(2)).toBeInViewport();
    await expect(editor.locator('.lesson-qitem').nth(2)).toHaveAttribute('aria-current', 'true');
  });
}
