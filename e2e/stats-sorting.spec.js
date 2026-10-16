import { test, expect } from '@playwright/test';

// P0-3 regression: a prior session dropped "Disciplina" (alphabetical) and
// "Última atividade" (recency) sorting from Estatísticas without
// authorization ("Deliberate capability drop" — see .specs/EXECUTION.md
// SEQUENCE_E_ESTATISTICAS_PROGRESS item 2) when the old sort dropdown was
// replaced by header-click sorting. This restores both, reusing the exact
// same header-click mechanism (sortMatrixRows/wireSortableHeaders) — no new
// toolbar/dropdown.
//
// Recência shares the exact same single Prática button (not a second
// stacked one — that version was tried and reverted: it changed the header
// cell's content shape at every width, including the phone breakpoint
// commit ff7dec2 had already fixed and locked, silently re-breaking it).
// Clicking the one button cycles: practice-asc -> practice-desc ->
// recency-asc -> recency-desc -> back to practice-asc, with the button's
// own label swapping between "Prática"/"Recência" to name whichever
// dimension is active. Header geometry never changes at any width.

async function seedUatAndOpenStats(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list tr.matrix-row').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await seedUatAndOpenStats(page);
});

test('sorting by Disciplina (alphabetical) works both directions in Por disciplina', async ({ page }) => {
  const identityBtn = page.locator('#subject-kpi-head .th-sort-btn[data-sort-key="identity"]');
  const firstChip = () => page.locator('#subject-kpi-list tr.matrix-row').first().locator('.subject-cell');

  await identityBtn.click();
  await expect(identityBtn).toHaveClass(/is-active/);
  await expect(identityBtn.locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending');
  await expect(firstChip()).toHaveText('Anatomia');

  await identityBtn.click();
  await expect(identityBtn.locator('xpath=..')).toHaveAttribute('aria-sort', 'descending');
  await expect(firstChip()).toHaveText('Semiologia Médica');
});

test('the Prática header cycles practice-asc -> practice-desc -> recency-asc -> recency-desc -> back to practice-asc, label following the active dimension', async ({ page }) => {
  const btn = page.locator('#subject-kpi-head .th-sort-btn-practice-recency');
  const th = btn.locator('xpath=..');
  const chipsInOrder = () => page.locator('#subject-kpi-list tr.matrix-row .subject-cell').allTextContents();

  // Idle state before any click: shows "Prática", not active.
  await expect(btn).toHaveText(/Prática/);
  await expect(btn).not.toHaveClass(/is-active/);

  // Click 1: practice, ascending.
  await btn.click();
  await expect(btn).toHaveAttribute('data-sort-key', 'practice');
  await expect(btn).toHaveText(/Prática/);
  await expect(btn).toHaveClass(/is-active/);
  await expect(th).toHaveAttribute('aria-sort', 'ascending');

  // Click 2: practice, descending — same label, direction flips.
  await btn.click();
  await expect(btn).toHaveAttribute('data-sort-key', 'practice');
  await expect(th).toHaveAttribute('aria-sort', 'descending');

  // Click 3: recency, ascending — label swaps to "Recência". The
  // never-practiced discipline (no lastEvidence) sorts last regardless of
  // direction, same convention as every other nulls-last comparator here.
  await btn.click();
  await expect(btn).toHaveAttribute('data-sort-key', 'recency');
  await expect(btn).toHaveText(/Recência/);
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  let order = await chipsInOrder();
  expect(order[order.length - 1]).toBe('Bioquímica');

  // Click 4: recency, descending — most recently practiced discipline
  // (Neurologia, a few days ago in the fixture) leads.
  await btn.click();
  await expect(btn).toHaveAttribute('data-sort-key', 'recency');
  await expect(th).toHaveAttribute('aria-sort', 'descending');
  order = await chipsInOrder();
  expect(order[0]).toBe('Neurologia');
  expect(order[order.length - 1]).toBe('Bioquímica');

  // Click 5: wraps back to practice, ascending.
  await btn.click();
  await expect(btn).toHaveAttribute('data-sort-key', 'practice');
  await expect(btn).toHaveText(/Prática/);
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
});

test('clicking a different header (Desempenho) deactivates the Prática/Recência button and it reverts to its idle "Prática" label', async ({ page }) => {
  const combinedBtn = page.locator('#subject-kpi-head .th-sort-btn-practice-recency');
  const performanceBtn = page.locator('#subject-kpi-head .th-sort-btn[data-sort-key="performance"]');

  await combinedBtn.click(); // -> practice/asc, active
  await expect(combinedBtn).toHaveClass(/is-active/);

  await performanceBtn.click();
  await expect(performanceBtn).toHaveClass(/is-active/);
  await expect(combinedBtn).not.toHaveClass(/is-active/);
  await expect(combinedBtn).toHaveText(/Prática/); // idle default, not stuck on "Recência"
});

test('sorting by Conteúdo (alphabetical) also works in Por conteúdo, independent of Por disciplina', async ({ page }) => {
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();

  // The default active discipline in the fixture may have only one unit
  // (no order to flip) — Anatomia has two, guaranteeing sorting has real
  // work to do.
  await page.locator('#content-context-plate').click();
  await page.locator('#discipline-switch-list button[data-subject-id]', { hasText: 'Anatomia' }).click();
  await expect(page.locator('#content-context-plate')).toHaveText('Anatomia');
  const rowCount = await page.locator('#unit-stats-list tr.matrix-row').count();
  expect(rowCount).toBeGreaterThan(1);

  const identityBtn = page.locator('#unit-stats-head .th-sort-btn[data-sort-key="identity"]');
  await identityBtn.click();
  await expect(identityBtn).toHaveClass(/is-active/);
  await expect(identityBtn.locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending');

  const before = await page.locator('#unit-stats-list .unit-title').allTextContents();
  await identityBtn.click();
  const after = await page.locator('#unit-stats-list .unit-title').allTextContents();
  expect(after).not.toEqual(before); // direction actually flipped the order
  await expect(identityBtn.locator('xpath=..')).toHaveAttribute('aria-sort', 'descending');
});

test('recência sort is available in Por conteúdo too, cycling the same single Prática button', async ({ page }) => {
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();
  const btn = page.locator('#unit-stats-head .th-sort-btn-practice-recency');
  await btn.click(); // practice/asc
  await btn.click(); // practice/desc
  await btn.click(); // recency/asc
  await expect(btn).toHaveAttribute('data-sort-key', 'recency');
  await expect(btn).toHaveClass(/is-active/);
});

test('header geometry never changes: exactly one sort button per column header, at all times', async ({ page }) => {
  for (const headId of ['#subject-kpi-head', '#unit-stats-head']) {
    if (headId === '#unit-stats-head') {
      await page.locator('#tab-stats-unit').click();
      await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();
    }
    const ths = page.locator(`${headId} th`);
    const count = await ths.count();
    expect(count).toBe(4);
    for (let i = 0; i < count; i++) {
      const buttons = ths.nth(i).locator('.th-sort-btn');
      await expect(buttons).toHaveCount(1);
    }
    // Cycle the combined button through every state and re-check — the
    // geometry claim must hold at every point in the cycle, not just idle.
    const combined = page.locator(`${headId} .th-sort-btn-practice-recency`);
    for (let i = 0; i < 4; i++) {
      await combined.click();
      for (let j = 0; j < count; j++) {
        await expect(ths.nth(j).locator('.th-sort-btn')).toHaveCount(1);
      }
    }
  }
});
