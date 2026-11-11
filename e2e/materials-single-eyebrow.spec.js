import { test, expect } from '@playwright/test';

// Materiais: the "Fontes" eyebrow appears once (page heading), not again on the PDF card.

test('Materiais shows the "Fontes" eyebrow once', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const eyebrows = page.locator('#screen-materials .eyebrow');
  await expect(eyebrows).toHaveCount(1);
  await expect(eyebrows.first()).toHaveText('Fontes do seu conhecimento');
});
