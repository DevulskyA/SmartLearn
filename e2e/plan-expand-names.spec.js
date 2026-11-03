import { test, expect } from '@playwright/test';

// Every "Expandir detalhes" button in Plano names its own lesson, so a screen
// reader list of buttons is not N identical entries.

test('Plano: each expand button has a distinct accessible name that includes its lesson title', async ({ page }) => {
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
  await page.locator('[data-screen="plan"]').click();

  const buttons = page.locator('.plan-expand-btn');
  await expect(buttons.first()).toBeVisible();
  const names = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(names.length).toBeGreaterThan(1);
  for (const name of names) expect(name).toMatch(/^Expandir detalhes: .+/);
  expect(new Set(names).size).toBe(names.length);

  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute('aria-label', /^Recolher detalhes: .+/);
});
