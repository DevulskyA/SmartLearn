import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T-F3-04 (R-04 AC-04.3, F-14): the student can leave the screen while a draft is generated and come back to the REAL state:
// "Gerando", then the finished draft, or the explained failure; cancel frees the unit; silence is a calm warning. Real server and
// real UI, with the model endpoint replaced by a local stub that HOLDS each generation call until the spec releases it (a slow
// FAKE provider): no model is ever called by this spec.

const SERVER_PORT = serverPort(13985);
const STUB_PORT = serverPort(13986);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const PAGE_1 = 'Filtração glomerular. A filtração glomerular é determinada pelo balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica capilar de 32 mmHg com a pressão hidrostática da cápsula de Bowman de 18 mmHg, que se opõem. A pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min.';
const PAGE_2 = 'Regulação da filtração. A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular quando a perfusão renal cai. Os inibidores da enzima conversora reduzem essa contração e podem diminuir a taxa de filtração glomerular na estenose bilateral da artéria renal.';
const DRAFT = {
  summary: 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica de 32 mmHg com a pressão da cápsula de Bowman de 18 mmHg, que se opõem; a pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min. A angiotensina II contrai a arteríola eferente, mantendo a pressão hidrostática glomerular.',
  summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }],
  questions: [
    { question: 'Qual é a taxa de filtração glomerular normal?', questionType: 'RECALL', answer: 'Cerca de 125 mL/min.', explanation: 'Resulta do balanço entre a pressão hidrostática capilar, que favorece a filtração, e as pressões oncótica e da cápsula de Bowman, que se opõem.', hint: 'Pense na ordem de grandeza por minuto.', sourceSpans: [{ pageIndex: 1 }] },
    { question: 'O que a angiotensina II faz na arteríola eferente?', questionType: 'MECHANISM', answer: 'Contrai a arteríola eferente.', explanation: 'A eferente contraída mantém a pressão hidrostática glomerular quando a perfusão renal cai, sustentando a taxa de filtração glomerular.', hint: null, sourceSpans: [{ pageIndex: 2 }] },
    { question: 'Por que inibidores da enzima conversora podem diminuir a filtração na estenose bilateral da artéria renal?', questionType: 'APPLICATION', answer: 'Porque reduzem a contração da arteríola eferente.', explanation: 'Sem a contração da eferente a pressão hidrostática glomerular cai quando a perfusão renal já está baixa, e a taxa de filtração glomerular diminui.', hint: null, sourceSpans: [{ pageIndex: 2 }] },
  ],
  modelVersion: 'stub-model-1', promptVersion: '3',
};

let stubServer;
let pending; // generation calls the stub is holding, oldest first: { answer(mode) }
let serverProcess;
let dataDir;
let dbPath;

function startStub() {
  pending = [];
  stubServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const prompt = JSON.parse(Buffer.concat(chunks).toString()).messages[0].content;
      const reply = (status, body) => { if (!res.writableEnded && !res.destroyed) { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); } };
      if (prompt.includes('strict medical content auditor')) return reply(200, { content: [{ type: 'text', text: JSON.stringify({ result: 'PASS', findings: [] }) }] });
      const call = { answer: (mode) => (mode === 'ok' ? reply(200, { content: [{ type: 'text', text: JSON.stringify(DRAFT) }] }) : reply(500, { error: 'boom' })) };
      pending.push(call);
      // the server gave up on the call (cancel / limit), or it was answered: nobody is waiting for it any more
      res.on('close', () => { pending = pending.filter((c) => c !== call); });
    });
  });
  return new Promise((resolve) => stubServer.listen(STUB_PORT, '127.0.0.1', resolve));
}

/** Releases the oldest held generation call: 'ok' answers with a draft, 'fail' with a provider error. */
async function release(mode) {
  await expect.poll(() => pending.length, { message: 'the server must have reached the (held) model call', timeout: 10000 }).toBeGreaterThan(0);
  pending.shift().answer(mode);
}

test.beforeAll(async () => {
  await startStub();
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-genjobs-'));
  dbPath = join(dataDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
      SMARTLEARN_AI_API_KEY: 'stub-key',
      SMARTLEARN_AI_MODEL: 'stub-model',
      SMARTLEARN_AI_CONSENT: 'true',
      SMARTLEARN_AI_BUDGET_CAP_USD: '5',
      SMARTLEARN_AI_API_URL: `http://127.0.0.1:${STUB_PORT}/v1/messages`,
      SMARTLEARN_AI_TIMEOUT_MS: '120000',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('generation-jobs E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => stubServer?.close(r));
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  pending.length = 0;
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `genjobs-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
});

async function startGeneration(page) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'fisiologia.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
}

const progress = (page) => page.locator('#sources-generation');
const firstItem = (page) => page.locator('.source-proposal-item').first();
const draftCount = () => {
  const db = new Database(dbPath);
  try { return db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n; } finally { db.close(); }
};
const noSeriousAxeViolation = async (page, where) => {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = result.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  expect(found.map((v) => `${where}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), where).toEqual([]);
};

test('leave the screen while it generates, come back (even after a reload) and see Gerando; then the finished draft opens from the list', async ({ page }) => {
  await startGeneration(page);
  await expect(progress(page)).toBeVisible();
  await expect(progress(page)).toContainText('pode levar alguns minutos');
  await expect(progress(page).locator('.sources-generation-phase')).toContainText(/Gerando|Preparando|Na fila/);
  await expect(progress(page).locator('.sources-generation-timer')).toHaveText(/^\d\d:\d\d$/);
  await noSeriousAxeViolation(page, 'progress panel');

  // keyboard: focus lands on the panel; Tab reaches "Continuar em segundo plano", then "Cancelar geração"; Enter on the first goes back to the list
  await expect(progress(page).locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continuar em segundo plano' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancelar geração' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');

  // back on the list the unit says it is still being generated, and it cannot be started a second time
  await expect(progress(page)).toBeHidden();
  await expect(firstItem(page)).toContainText('Gerando…');
  await expect(firstItem(page).locator('[data-action="generate-draft"]')).toHaveCount(0);
  await expect(page.locator('#sources-drafts')).toContainText('Gerando…');
  await expect(firstItem(page).getByRole('button', { name: 'Ver andamento' })).toBeFocused();
  await noSeriousAxeViolation(page, 'Gerando item');

  // leave Materiais and come back: the real state comes from the server
  await page.locator('[data-screen="today"]').first().click();
  await page.locator('[data-screen="materials"]').click();
  await page.locator('[data-action="open-source"]').first().click();
  await expect(firstItem(page)).toContainText('Gerando…');

  // a full reload does not lose it either
  await page.reload();
  await page.locator('[data-screen="materials"]').click();
  await page.locator('[data-action="open-source"]').first().click();
  await expect(firstItem(page)).toContainText('Gerando…');

  // the provider answers; the list follows on its own (no click, no reload) and the draft opens from it
  await release('ok');
  await expect(firstItem(page)).toContainText('Pronto', { timeout: 15000 });
  await expect(page.locator('#sources-drafts')).toContainText('Pronto');
  await firstItem(page).locator('[data-action="open-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
});

test('cancel asks for confirmation, frees the unit, leaves no draft even if the provider answers late, and the unit generates again', async ({ page }) => {
  await startGeneration(page);
  const cancel = progress(page).getByRole('button', { name: 'Cancelar geração' });
  const draftsBefore = draftCount();
  // refusing the confirmation keeps the job running
  page.once('dialog', (dialog) => dialog.dismiss());
  await cancel.click();
  await expect(progress(page)).toBeVisible();
  await expect(progress(page)).toContainText('pode levar alguns minutos');
  // accepting it stops the job; the provider (which ignores the stop) answers late and its draft is thrown away
  page.once('dialog', (dialog) => { expect(dialog.message()).toMatch(/Cancelar/); dialog.accept(); });
  await cancel.click();
  await expect(progress(page).locator('.sources-generation-phase')).toHaveText('Cancelando a geração…');
  await release('ok');
  await expect(progress(page)).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#sources-message')).toContainText('cancelada');
  await expect(firstItem(page)).not.toContainText('Gerando…');
  await expect(firstItem(page).locator('[data-action="generate-draft"]')).toBeEnabled();
  await expect(firstItem(page).locator('[data-action="open-draft"]')).toHaveCount(0);
  await expect(page.locator('#sources-drafts')).toBeHidden();
  expect(draftCount()).toBe(draftsBefore);
  // the unit is free: generating it again works and ends in a draft
  await firstItem(page).locator('[data-action="generate-draft"]').click();
  await release('ok');
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 15000 });
});

test('a failed generation says so in plain Portuguese, in the list too, and the unit can be tried again', async ({ page }) => {
  await startGeneration(page);
  await release('fail');
  await expect(progress(page)).toBeHidden({ timeout: 15000 });
  const message = page.locator('#sources-message');
  await expect(message).toHaveClass(/is-error/);
  await expect(message).toContainText('Não foi possível gerar o rascunho');
  await expect(message).not.toContainText(/boom|ProviderRequestError|undefined/);
  await expect(firstItem(page)).toContainText('Falhou');
  await expect(page.locator('#sources-drafts')).toContainText('Falhou');
  await expect(firstItem(page).locator('[data-action="generate-draft"]')).toHaveText(/Tentar de novo/);
  await noSeriousAxeViolation(page, 'Falhou item');
  await firstItem(page).locator('[data-action="generate-draft"]').click();
  await release('ok');
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 15000 });
});

test('silence from the provider (STALLED) is a calm warning, not an error; staying on the panel, the draft opens by itself when ready', async ({ page }) => {
  await startGeneration(page);
  await expect(progress(page)).toBeVisible();
  const db = new Database(dbPath);
  try {
    // the runner marks STALLED after a long silence; the spec forces the same recorded state instead of waiting minutes
    db.prepare("UPDATE generation_jobs SET state = 'STALLED' WHERE state = 'CALLING_PROVIDER'").run();
  } finally { db.close(); }
  const warning = progress(page).locator('.sources-generation-stalled');
  await expect(warning).toBeVisible({ timeout: 10000 });
  await expect(warning).toContainText('silêncio');
  await expect(warning).not.toHaveClass(/is-error/);
  await expect(progress(page).locator('.is-error')).toHaveCount(0);
  await expect(page.locator('#sources-message')).not.toHaveClass(/is-error/);
  await expect(progress(page).getByRole('button', { name: 'Cancelar geração' })).toBeEnabled();
  await release('ok');
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 15000 });
  await expect(progress(page)).toBeHidden();
});
