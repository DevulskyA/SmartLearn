import { test, expect } from '@playwright/test';

// P0-1 regression, in the V7.2 composition: choosing a discipline in the panorama (or the attention list / quick rankings) must open
// Por conteúdo filtered to that discipline, by click and by keyboard (Enter and Space), and the evolution chart follows it.
// Uses the DEV-only UAT fixture (window.__seedUatMedical), so there are several real disciplines to discriminate between.

async function seedUatAndOpenStats(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await window.__seedUatMedical('DESTROY_EXISTING_DATA'); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list tr[data-v5-row]').first()).toBeVisible();
}

const panoramaRow = (page, name) => page.locator('.v5-overview-row', { hasText: name });

async function expectOnlyContentsOf(page, name) {
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-stats-subject')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#stats-filter-subject option:checked')).toHaveText(name);
  const chips = page.locator('#unit-stats-list .v5-subject');
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(chips.nth(i)).toHaveText(name);
}

test.beforeEach(async ({ page }) => {
  await seedUatAndOpenStats(page);
});

test('clicking a discipline in the panorama opens Por conteúdo filtered to that exact discipline', async ({ page }) => {
  await panoramaRow(page, 'Anatomia').click();
  await expectOnlyContentsOf(page, 'Anatomia');
  await expect(page.locator('#unit-stats-list', { hasText: 'Fisiologia' })).toHaveCount(0);
});

test('keyboard activation (Enter and Space) of a discipline opens Por conteúdo the same way as a click', async ({ page }) => {
  const first = panoramaRow(page, 'Neurologia');
  await first.focus();
  await first.press('Enter');
  await expectOnlyContentsOf(page, 'Neurologia');

  await page.locator('#tab-stats-subject').click();
  const second = panoramaRow(page, 'Semiologia Médica');
  await second.focus();
  await second.press(' ');
  await expectOnlyContentsOf(page, 'Semiologia Médica');
});

test('active discipline stays synchronized across the interaction (table filter, evolution filter)', async ({ page }) => {
  const row = panoramaRow(page, 'Farmacologia');
  const subjectId = await row.getAttribute('data-id');
  await row.click();
  await expect(page.locator('#stats-filter-subject')).toHaveValue(subjectId);
  await expect(page.locator('#evolution-filter-subject')).toHaveValue(subjectId);
  await page.locator('#tab-stats-subject').click();
  await expect(page.locator('#evolution-filter-subject')).toHaveValue(subjectId);
});

test('opening a second discipline replaces the first, never shows both at once', async ({ page }) => {
  await panoramaRow(page, 'Anatomia').click();
  await expectOnlyContentsOf(page, 'Anatomia');
  await panoramaRow(page, 'Neurologia').click();
  await expectOnlyContentsOf(page, 'Neurologia');
  await expect(page.locator('#unit-stats-list', { hasText: 'Anatomia' })).toHaveCount(0);
});
