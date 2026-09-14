import { test, expect } from '@playwright/test';

// P0-3 regression: a prior session dropped "Disciplina" (alphabetical) and
// "Última atividade" (recency) sorting from Estatísticas without
// authorization ("Deliberate capability drop" — see .specs/EXECUTION.md
// SEQUENCE_E_ESTATISTICAS_PROGRESS item 2) when the old sort dropdown was
// replaced by header-click sorting. This restores both, reusing the exact
// same header-click mechanism (sortMatrixRows/wireSortableHeaders) — no new
// toolbar/dropdown. Recency shares the existing Prática <th> as a second,
// visually subordinate button instead of a new column, so it doesn't widen
// the table (relevant to P1-2's overflow concerns).

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

test('sorting by Última atividade (recency) works and puts the no-evidence discipline last regardless of direction', async ({ page }) => {
  const recencyBtn = page.locator('#subject-kpi-head .th-sort-btn[data-sort-key="recency"]');
  const chipsInOrder = () => page.locator('#subject-kpi-list tr.matrix-row .subject-cell').allTextContents();

  // First click: ascending (least-recently-active real evidence first).
  await recencyBtn.click();
  await expect(recencyBtn).toHaveClass(/is-active/);
  let order = await chipsInOrder();
  expect(order[order.length - 1]).toBe('Bioquímica'); // never practiced — always last

  // Second click: descending — the most recently practiced discipline
  // (Neurologia, evidence a few days ago in the fixture) leads.
  await recencyBtn.click();
  order = await chipsInOrder();
  expect(order[0]).toBe('Neurologia');
  expect(order[order.length - 1]).toBe('Bioquímica');
});

test('Última atividade and Prática are independent sort keys sharing one header cell', async ({ page }) => {
  const practiceBtn = page.locator('#subject-kpi-head .th-sort-btn[data-sort-key="practice"]');
  const recencyBtn = page.locator('#subject-kpi-head .th-sort-btn[data-sort-key="recency"]');

  await practiceBtn.click();
  await expect(practiceBtn).toHaveClass(/is-active/);
  await expect(recencyBtn).not.toHaveClass(/is-active/);

  await recencyBtn.click();
  await expect(recencyBtn).toHaveClass(/is-active/);
  await expect(practiceBtn).not.toHaveClass(/is-active/);
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

test('recência sort is available in Por conteúdo too, sharing the Prática header the same way', async ({ page }) => {
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();
  const recencyBtn = page.locator('#unit-stats-head .th-sort-btn[data-sort-key="recency"]');
  await recencyBtn.click();
  await expect(recencyBtn).toHaveClass(/is-active/);
});
