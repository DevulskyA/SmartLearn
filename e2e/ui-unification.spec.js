import { test, expect } from '@playwright/test';

// Non-production e2e pages have an isolated UAT data store, never the
// student's own Windows database.
test('Plano filters match title/source, report count, offer reset and preserve subject management', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(async () => window.__seedUatMedical('DESTROY_EXISTING_DATA'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();

  const rows = page.locator('#plan-list .plan-row');
  await expect(rows.first()).toBeVisible();
  const initialCount = await rows.count();
  expect(initialCount).toBeGreaterThan(0);
  await expect(page.locator('#plan-result-count')).toContainText(`de ${initialCount}`);

  const firstTitle = (await rows.first().locator('.plan-unit-title').textContent()).trim();
  const search = page.locator('#plan-search');
  await search.fill(firstTitle);
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);

  await search.fill('__nao_existe_esta_aula_98765__');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#plan-empty')).toContainText('Nenhuma aula corresponde');
  await expect(page.locator('#plan-clear-filters')).toBeVisible();

  await page.locator('#plan-clear-filters').click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(initialCount);
  await expect(page.locator('#plan-clear-filters')).toBeHidden();

  await page.locator('#plan-manage-subjects-btn').click();
  await expect(page.locator('#screen-subjects')).toBeVisible();
});

test('Configurações: keyboard radio interaction updates selection and roving Tab target', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-screen="settings"]').click();
  const options = page.locator('#theme-picker [role="radio"]');
  await expect(options).toHaveCount(5);
  const selected = page.locator('#theme-picker [aria-checked="true"]');
  await expect(selected).toHaveCount(1);
  await selected.focus();
  const originalIndex = await selected.evaluate((el) => [...el.parentElement.children].indexOf(el));
  await page.keyboard.press('ArrowRight');
  const next = options.nth((originalIndex + 1) % 5);
  await expect(next).toHaveAttribute('aria-checked', 'true');
  await expect(next).toHaveAttribute('tabindex', '0');
  await expect(next).toBeFocused();
  await page.keyboard.press('Home');
  await expect(options.first()).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(options.last()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#theme-picker [tabindex="0"]')).toHaveCount(1);
});
