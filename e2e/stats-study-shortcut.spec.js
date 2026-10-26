import { test, expect } from '@playwright/test';

// R-4 (shortest useful journey): the detail of a content in Estatísticas ends in "Estudar conteúdo", which opens THAT lesson in Plano with its
// Resumo and "Estudar agora" showing. Before, the detail had no action and the student had to leave and look for the lesson by hand.
// Uses the DEV-only UAT fixture (never production data), like the other Estatísticas specs.

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

test('"Estudar conteúdo" in the detail of a content opens exactly that lesson in Plano, expanded', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await page.locator('#tab-stats-unit').click();
  const rows = page.locator('#unit-stats-list tr.matrix-row');
  await expect(rows.first()).toBeVisible();
  // not the first row of the list: the lesson that opens must be the one that was selected, not whatever comes first in Plano
  const picked = rows.nth(Math.min(2, (await rows.count()) - 1));
  await picked.click();
  const title = (await page.locator('#unit-detail-body .unit-detail-title').innerText()).trim();
  expect(title.length).toBeGreaterThan(0);

  await page.locator('#unit-detail-body [data-action="study-unit"]').click();

  await expect(page.locator('#screen-plan')).toBeVisible();
  const open = page.locator('#screen-plan .plan-row', { has: page.locator('.plan-row-detail:visible') });
  await expect(open).toHaveCount(1);
  await expect(open).toContainText(title);
});

test('the shortcut does not exist while no content is selected', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#unit-detail-body [data-action="study-unit"]')).toHaveCount(0);
});
