import { test, expect } from '@playwright/test';

// R-4 (shortest useful journey): the detail of a content in Estatísticas ends in "Abrir resumo", which opens THAT lesson in Plano with its
// Resumo and "Estudar agora" showing. When the lesson is gone it says so and stays put. Uses the DEV-only UAT fixture (never production data).

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

test('"Abrir resumo" in the detail of a content opens exactly that lesson in Plano, expanded', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await page.locator('#tab-stats-lesson').click();
  const rows = page.locator('#unit-stats-list tr[data-v5-row]');
  await expect(rows.first()).toBeVisible();
  // not the first row of the list: the lesson that opens must be the one that was selected, not whatever comes first in Plano
  const picked = rows.nth(Math.min(2, (await rows.count()) - 1));
  const title = (await picked.locator('.v5-content-name strong').innerText()).trim();
  expect(title.length).toBeGreaterThan(0);
  await picked.locator('[data-v5="inspect"]').click();
  await expect(page.locator('#stats-detail-dialog')).toHaveJSProperty('open', true);

  await page.locator('#stats-detail-body [data-v5="open-unit"]').first().click();

  await expect(page.locator('#screen-plan')).toBeVisible();
  const open = page.locator('#screen-plan .plan-row', { has: page.locator('.plan-row-detail:visible') });
  await expect(open).toHaveCount(1);
  await expect(open).toContainText(title);
});

test('the detail is closed until a row is inspected', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await expect(page.locator('#stats-detail-dialog')).toHaveJSProperty('open', false);
  await expect(page.locator('#stats-detail-body [data-v5="open-unit"]')).toHaveCount(0);
});

test('a lesson without a summary still opens: its Resumo area is there and empty, nothing breaks', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await page.locator('#tab-stats-lesson').click();
  const row = page.locator('#unit-stats-list tr[data-v5-row]').first();
  const unitId = Number(await row.getAttribute('data-key'));
  expect(unitId).toBeGreaterThan(0);
  // this lesson has no summary at all (the local store is read on every call)
  await page.evaluate((id) => {
    const key = 'smartlearn:browser-db';
    const db = JSON.parse(localStorage.getItem(key));
    db.learningUnits.find((u) => u.id === id).summaryBody = null;
    localStorage.setItem(key, JSON.stringify(db));
  }, unitId);
  await row.locator('[data-v5="inspect"]').click();
  await page.locator('#stats-detail-body [data-v5="open-unit"]').first().click();

  await expect(page.locator('#screen-plan')).toBeVisible();
  const open = page.locator('#screen-plan .plan-row[data-unit-id="' + unitId + '"]');
  await expect(open.locator('.plan-row-detail')).toBeVisible();
  await expect(open.locator('.plan-summary-section')).toBeVisible();
  await expect(open.locator('.plan-summary-body')).toHaveText('');
});

test('when the lesson is no longer there the shortcut says so and stays on Estatísticas: it never opens nothing or another lesson', async ({ page }) => {
  await seedUatAndOpenStats(page);
  await page.locator('#tab-stats-lesson').click();
  const row = page.locator('#unit-stats-list tr[data-v5-row]').first();
  const unitId = Number(await row.getAttribute('data-key'));
  expect(unitId).toBeGreaterThan(0);
  await row.locator('[data-v5="inspect"]').click();
  await expect(page.locator('#stats-detail-body [data-v5="open-unit"]').first()).toBeVisible();

  // the lesson disappears from the data after the detail was drawn (the local store is read on every call)
  await page.evaluate((id) => {
    const key = 'smartlearn:browser-db';
    const db = JSON.parse(localStorage.getItem(key));
    db.learningUnits = db.learningUnits.filter((unit) => unit.id !== id);
    localStorage.setItem(key, JSON.stringify(db));
  }, unitId);

  await page.locator('#stats-detail-body [data-v5="open-unit"]').first().click();
  await expect(page.locator('#stats-detail-body .form-message')).toHaveText('Esta aula não está mais disponível.');
  await expect(page.locator('#screen-plan')).toBeHidden();
  await expect(page.locator('#screen-plan .plan-row-detail:visible')).toHaveCount(0);
});
