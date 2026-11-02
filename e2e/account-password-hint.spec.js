import { test, expect } from '@playwright/test';

// "Alterar senha" shows the same minimum-length hint as the register form, linked to the field.

test('change-password form states the 15-character minimum and links it to the field', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const field = page.locator('#account-new-password');
  await expect(field).toHaveAttribute('minlength', '15');
  await expect(field).toHaveAttribute('aria-describedby', 'account-new-password-hint');
  await expect(page.locator('#account-new-password-hint')).toHaveText(/15 caracteres/);
});
