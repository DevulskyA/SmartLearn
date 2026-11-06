import { test, expect } from '@playwright/test';

// A-09: the trend chip says "pontos" (not the unexplained "p.p.") and the comparison window is visible, not only in a tooltip.

test('Por disciplina: trend chip uses plain words and the window is stated on screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list .trend-badge').first()).toBeVisible();
  await expect(page.locator('#subject-trend-note')).toContainText('últimos 30 dias contra os 30 anteriores');
  const labels = await page.locator('#subject-kpi-list .trend-badge').allTextContents();
  for (const label of labels) expect(label).not.toContain('p.p.');
  expect(labels.some((label) => /pontos/.test(label))).toBe(true);
});
