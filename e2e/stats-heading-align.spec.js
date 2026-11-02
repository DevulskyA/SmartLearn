import { test, expect } from '@playwright/test';

// Phone: the Estatísticas title, lede and period selector share the left edge of the KPI cards below.

test('390px: Estatísticas heading is left-aligned with the page content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  const left = (sel) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  const kpiLeft = await left('.stats-kpis');
  expect(await left('#title-stats')).toBe(kpiLeft);
  expect(await left('.stats-lede')).toBe(kpiLeft);
  expect(await left('.stats-heading .select-control')).toBe(kpiLeft);
});
