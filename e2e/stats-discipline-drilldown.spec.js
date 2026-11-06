import { test, expect } from '@playwright/test';

// P0-1 regression: clicking (or keyboard-activating) a discipline row in
// Estatísticas / Por disciplina must open Por conteúdo filtered to that
// discipline — this regressed to only syncing the evolution chart
// (selectSubjectForEvolution), losing the tab switch entirely. The fix
// introduces one semantic action (openSubjectContents in src/app.js) wired
// identically to click, Enter and Space.
//
// Uses the real DEV-only UAT fixture (window.__seedUatMedical, gated by
// import.meta.env.DEV, never touches production data) instead of the
// default 2-subject dev dataset, so there are multiple real disciplines
// with real content to actually discriminate between.

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

function subjectRow(page, name) {
  return page.locator('#subject-kpi-list tr.matrix-row', { has: page.locator('.subject-cell', { hasText: name }) });
}

test.beforeEach(async ({ page }) => {
  await seedUatAndOpenStats(page);
});

test('clicking a discipline row opens Por conteúdo filtered to that exact discipline', async ({ page }) => {
  // Anatomia is not the first (highest-ranked) row by default sort, so
  // clicking it is a real discrimination, not a no-op on an already-active
  // selection.
  const row = subjectRow(page, 'Anatomia');
  await expect(row).toBeVisible();
  await row.click();

  // Tab activation: aria-selected flips on both tabs, only one panel visible.
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-stats-subject')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#view-stats-unit')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#view-stats-subject')).toHaveClass(/is-hidden/);

  // Context switcher trigger shows the clicked discipline.
  await expect(page.locator('#content-context-plate')).toHaveText('Anatomia');

  // Every row shown in Por conteúdo belongs to Anatomia; none belong to a
  // different discipline (e.g. Fisiologia, which also has real content).
  const chips = page.locator('#unit-stats-list .subject-cell--compact');
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(chips.nth(i)).toHaveText('Anatomia');
  }
  await expect(page.locator('#unit-stats-list', { hasText: 'Fisiologia' })).toHaveCount(0);
});

test('keyboard activation (Enter and Space) of a discipline row opens Por conteúdo the same way as a click', async ({ page }) => {
  // Enter on one discipline...
  const row1 = subjectRow(page, 'Neurologia');
  await row1.focus();
  await row1.press('Enter');
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#content-context-plate')).toHaveText('Neurologia');
  const chips1 = page.locator('#unit-stats-list .subject-cell--compact');
  const n1 = await chips1.count();
  expect(n1).toBeGreaterThan(0);
  for (let i = 0; i < n1; i++) await expect(chips1.nth(i)).toHaveText('Neurologia');

  // ...switch back to Por disciplina and use Space on a DIFFERENT discipline,
  // proving Space is wired identically to Enter/click, not a partial path.
  await page.locator('#tab-stats-subject').click();
  await expect(page.locator('#view-stats-subject')).not.toHaveClass(/is-hidden/);
  const row2 = subjectRow(page, 'Semiologia Médica');
  await row2.focus();
  await row2.press(' ');
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#content-context-plate')).toHaveText('Semiologia Médica');
  const chips2 = page.locator('#unit-stats-list .subject-cell--compact');
  const n2 = await chips2.count();
  expect(n2).toBeGreaterThan(0);
  for (let i = 0; i < n2; i++) await expect(chips2.nth(i)).toHaveText('Semiologia Médica');
});

test('active discipline stays synchronized across the interaction (row highlight, context switcher, evolution filter)', async ({ page }) => {
  const row = subjectRow(page, 'Farmacologia');
  const subjectId = await row.getAttribute('data-subject-id');
  await row.click();

  // Context switcher (Por conteúdo) reflects the same discipline.
  await expect(page.locator('#content-context-plate')).toHaveText('Farmacologia');
  // The context-switcher menu, when opened, must list every OTHER active
  // discipline but never repeat the current one (P0-4's canonical rule,
  // reused here as a consistency check on this same interaction).
  await page.locator('#content-context-plate').click();
  await expect(page.locator('#discipline-switch-list button[data-subject-id]', { hasText: 'Farmacologia' })).toHaveCount(0);
  await expect(page.locator('#discipline-switch-list button[data-subject-id]')).not.toHaveCount(0);
  await page.keyboard.press('Escape');

  // Switching back to Por disciplina: the same row is still visually
  // selected and the evolution chart's own subject filter still matches.
  await page.locator('#tab-stats-subject').click();
  await expect(row).toHaveClass(/is-selected/);
  await expect(page.locator('#evolution-filter-subject')).toHaveValue(subjectId);
});

test('opening a second discipline replaces the first — never shows both at once', async ({ page }) => {
  await subjectRow(page, 'Anatomia').click();
  await expect(page.locator('#content-context-plate')).toHaveText('Anatomia');

  await page.locator('#tab-stats-subject').click();
  await subjectRow(page, 'Neurologia').click();
  await expect(page.locator('#content-context-plate')).toHaveText('Neurologia');

  const chips = page.locator('#unit-stats-list .subject-cell--compact');
  const count = await chips.count();
  for (let i = 0; i < count; i++) await expect(chips.nth(i)).toHaveText('Neurologia');
  await expect(page.locator('#unit-stats-list', { hasText: 'Anatomia' })).toHaveCount(0);
});
