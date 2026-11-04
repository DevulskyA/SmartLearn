import { test, expect } from '@playwright/test';

// "Apagar base local" wipes this device's own database, so it is offered only in local mode. The remote-mode half (the card is not
// shown against the server) lives in e2e/feature-parity.spec.js; this is the local half, so hiding it can never become unconditional.
test('Configurações (local mode): the "Apagar base local" card and its button are available', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.app-nav [data-screen="settings"]').click();
  await expect(page.locator('#screen-settings')).toBeVisible();
  await expect(page.locator('#reset-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apagar base local' })).toBeVisible();
  await expect(page.locator('#reset-database')).toBeVisible();
  await expect(page.locator('#reset-database')).toBeEnabled();
});
