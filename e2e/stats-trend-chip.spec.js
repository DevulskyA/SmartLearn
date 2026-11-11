import { test, expect } from '@playwright/test';

// A-09 in the V7.2 table: the trend says "+N p.p." / "-N p.p." / "Estável" / "Sem dados", and the comparison window is stated in the tooltip of every chip.

test('Por disciplina: the trend chip names its comparison window in the title', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list .v5-trend').first()).toBeVisible();
  const chips = page.locator('#subject-kpi-list .v5-trend');
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    const title = await chips.nth(i).getAttribute('title');
    expect(title, 'every trend chip explains itself').toMatch(/últimos 30 dias|Sem comparação/i);
  }
  const labels = await chips.allTextContents();
  expect(labels.some((label) => /p\.p\./.test(label))).toBe(true);
});
