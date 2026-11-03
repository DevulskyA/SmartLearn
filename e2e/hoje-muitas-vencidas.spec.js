import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// H-01..H-03 (ANALISE-CRITICA-TELAS): with ~18 overdue reviews Hoje reached ~7000 px and "Comecar agora" was far down.
// Real server child process, disposable database.

const SERVER_PORT = serverPort(13955);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-muitas-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('muitas-vencidas E2E: real server did not become ready in time');
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
  const email = `muitas-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
  'Cardiologia: ciclo cardíaco', 'Neuroanatomia: vias motoras', 'Imunologia: resposta adaptativa', 'Microbiologia: gram-positivos',
  'Embriologia: gastrulação', 'Hematologia: hemostasia', 'Endocrinologia: eixo tireoidiano', 'Reumatologia: artrite reumatoide',
];

// Units studied 8..14 days ago have R1 and R2 overdue (2 stages each). 9 + doneCount/2 units; the student then finishes
// doneCount stages today, which leaves exactly 18 overdue stages in 9 units plus doneCount rows in "Feitas hoje".
async function seedManyOverdue(page, doneCount) {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Medicina');
  await page.locator('#new-subject-form button[type="submit"]').click();
  const units = 9 + Math.ceil(doneCount / 2);
  for (let i = 0; i < units; i += 1) {
    await page.locator('#study-date').fill(daysAgo(8 + (i % 7)));
    await page.locator('#study-content').fill(TITLES[i % TITLES.length]);
    await page.locator('#study-form button[type="submit"]').click();
    await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  }
  await page.locator('[data-screen="today"]').click();
  const list = page.locator('[data-review-list="overdue"]');
  await expect(list).toBeVisible();
  if (doneCount) {
    const fold = list.locator('[data-fold-toggle]');
    if (await fold.count()) await fold.click(); // the seeding finishes stages of folded cards too
    await page.evaluate(() => document.querySelectorAll('details.overdue-unit').forEach((d) => { d.open = true; }));
    for (let n = 0; n < doneCount; n += 1) {
      // click, not check(): the row re-renders when the review completes, and check() would retry on the next row (a double completion)
      await list.locator('.review-row [data-action="review-done"]').last().click();
      await expect(page.locator('[data-count-for="doneToday"]')).toHaveText(String(n + 1), { timeout: 5000 });
    }
  }
  // what the student sees when opening Hoje fresh: the cards the seeding opened by hand must not stay open
  await page.reload();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('[data-count-for="overdue"]')).toContainText('18', { timeout: 8000 });
}

// The app scrolls inside <main class="app-main">, not the window: the "page height" is that scroller's scrollHeight and the
// button's position is measured from the scroller's content top.
const measure = (page) => page.evaluate(() => {
  const main = document.querySelector('.app-main');
  main.scrollTop = 0;
  const top = main.getBoundingClientRect().top;
  const r = document.querySelector('#today-primary-action-btn').getBoundingClientRect();
  return {
    pageHeight: main.scrollHeight,
    primaryTop: Math.round(r.top - top),
    primaryBottom: Math.round(r.bottom - top),
    viewport: main.clientHeight,
    blocks: Object.fromEntries([...document.querySelectorAll('#screen-today > *, .review-block')].filter((e) => e.offsetHeight > 0).map((e) => [e.id || e.className.toString().slice(0, 30), e.offsetHeight])),
  };
});


const visibleReviewRows = (page, group) => page.locator(`[data-review-list="${group}"] .review-row:visible`);

test('Hoje with 18 overdue + 12 done stays short on desktop, "Começar agora" is on the first screen, "Ver mais" unfolds everything', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedManyOverdue(page, 12);
  const m = await measure(page);
  console.log('MEDIDA desktop', JSON.stringify(m));
  expect(m.pageHeight, 'Hoje height (px)').toBeLessThanOrEqual(2500);
  expect(m.primaryBottom, '"Começar agora" is on the first screen').toBeLessThanOrEqual(m.viewport);

  const overdue = page.locator('[data-review-list="overdue"]');
  const done = page.locator('[data-review-list="doneToday"]');
  await expect(page.locator('[data-count-for="overdue"]')).toHaveText('18 revisões · 9 conteúdos');
  await expect(page.locator('[data-count-for="doneToday"]')).toHaveText('12');
  // 9 unit cards -> 5 shown + "Ver mais 4 conteúdos"; 12 done rows -> 3 shown + "Ver mais 9 revisões". All of them stay in the DOM.
  const overdueMore = overdue.locator('[data-fold-toggle]');
  const doneMore = done.locator('[data-fold-toggle]');
  await expect(overdueMore).toHaveText('Ver mais 4 conteúdos');
  await expect(overdueMore).toHaveAttribute('aria-expanded', 'false');
  await expect(doneMore).toHaveText('Ver mais 9 revisões');
  await expect(overdue.locator('> details.overdue-unit:visible')).toHaveCount(5);
  await expect(overdue.locator('> details.overdue-unit')).toHaveCount(9);
  await expect(visibleReviewRows(page, 'doneToday')).toHaveCount(3);
  await expect(done.locator('.review-row')).toHaveCount(12);

  // keyboard: the button is a native <button> reachable by Tab and operated by Enter
  await doneMore.focus();
  await page.keyboard.press('Enter');
  await expect(doneMore).toHaveAttribute('aria-expanded', 'true');
  await expect(doneMore).toHaveText('Ver menos');
  await expect(visibleReviewRows(page, 'doneToday')).toHaveCount(12);
  await expect(doneMore).toBeFocused();
  // unfolding survives a re-render (finishing/undoing something re-renders Hoje) and can be undone
  await page.keyboard.press('Enter');
  await expect(visibleReviewRows(page, 'doneToday')).toHaveCount(3);
  await expect(doneMore).toHaveAttribute('aria-expanded', 'false');

  await overdueMore.click();
  await expect(overdue.locator('> details.overdue-unit:visible')).toHaveCount(9);
  await expect(overdueMore).toHaveText('Ver menos');
});

test('Hoje with 18 overdue + 12 done on a phone: "Começar agora" in the first screen and the page stays short', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedManyOverdue(page, 12);
  const m = await measure(page);
  console.log('MEDIDA celular', JSON.stringify(m));
  expect(m.primaryBottom, '"Começar agora" is on the first screen').toBeLessThanOrEqual(m.viewport);
  expect(m.pageHeight, 'Hoje height (px)').toBeLessThanOrEqual(3000);
});

test('"Começar agora" always points at a visible review, and a card the student opened is never folded again by a re-render', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedManyOverdue(page, 0);
  const overdue = page.locator('[data-review-list="overdue"]');
  await expect(overdue.locator('[data-fold-toggle]')).toHaveText('Ver mais 4 conteúdos');
  // "Começar agora" always points at a visible card on a fresh Hoje
  await page.locator('#today-primary-action-btn').click();
  const targetId = await page.locator('#today-primary-action-btn').getAttribute('data-review-id');
  await expect(page.locator(`.review-row[data-review-id="${targetId}"]`)).toBeVisible();
  // a card from the folded part, opened by the student, stays after a re-render caused by finishing the target review
  await overdue.locator('[data-fold-toggle]').click();
  const lastCard = overdue.locator('> details.overdue-unit').last();
  await lastCard.locator('summary').click();
  await page.locator(`.review-row[data-review-id="${targetId}"] [data-action="review-done"]`).check();
  await expect(page.locator('[data-count-for="doneToday"]')).toHaveText('1', { timeout: 5000 });
  await expect(lastCard).toBeVisible();
  await expect(lastCard).toHaveJSProperty('open', true);
});
