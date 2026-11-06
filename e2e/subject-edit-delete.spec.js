import { test, expect } from '@playwright/test';

// Gap J06 of the functional UI test: creating a discipline was covered, changing the colour of an existing one and deleting one were not.
// Local-database mode, like subject-registration.spec.js. The rules under test: a colour change persists; deleting an empty discipline asks
// first and persists; a discipline that has lessons cannot be deleted (it can be archived instead).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
});

const card = (page, name) => page.locator('.subject-catalog-card', { hasText: name });
const colorOf = (page, name) => card(page, name).evaluate((el) => el.style.getPropertyValue('--subject-color'));

async function createSubject(page, name) {
  await page.goto('/#subjects');
  await page.locator('#subjects-show-create-btn').click();
  await page.locator('#subjects-new-name').fill(name);
  await page.locator('#subjects-create-form button[type="submit"]').click();
  await expect(card(page, name)).toBeVisible({ timeout: 5000 });
}

test('changing the colour of an existing discipline persists after a reload', async ({ page }) => {
  await createSubject(page, 'Cor Mutavel');
  const before = await colorOf(page, 'Cor Mutavel');

  await card(page, 'Cor Mutavel').getByRole('button', { name: 'Editar' }).click();
  const swatches = card(page, 'Cor Mutavel').locator('.subject-catalog-edit .color-swatch');
  await swatches.nth(4).click();
  await expect(swatches.nth(4)).toHaveClass(/is-selected/);
  await card(page, 'Cor Mutavel').getByRole('button', { name: 'Salvar' }).click();

  await expect.poll(() => colorOf(page, 'Cor Mutavel')).not.toBe(before);
  const after = await colorOf(page, 'Cor Mutavel');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.goto('/#subjects'); // a reload lands on Plano: Disciplinas is a panel reached again by its link
  await expect(card(page, 'Cor Mutavel')).toBeVisible({ timeout: 5000 });
  expect(await colorOf(page, 'Cor Mutavel'), 'the new colour survives a reload').toBe(after);
});

test('deleting an empty discipline asks first, and cancelling keeps it', async ({ page }) => {
  await createSubject(page, 'Para Excluir');

  await card(page, 'Para Excluir').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog-cancel').click();
  await expect(card(page, 'Para Excluir')).toBeVisible();

  await card(page, 'Para Excluir').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog-ok').click();
  await expect(card(page, 'Para Excluir')).toHaveCount(0);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.goto('/#subjects');
  await expect(page.locator('#subjects-show-create-btn')).toBeVisible(); // the panel is open, so an absent card means deleted, not unseen
  await expect(card(page, 'Para Excluir')).toHaveCount(0);
});

test('a discipline that has lessons cannot be deleted, and says why', async ({ page }) => {
  await createSubject(page, 'Com Aula');
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /state|smartlearn/i.test(k) && localStorage.getItem(k)?.includes('Com Aula'));
    const state = JSON.parse(localStorage.getItem(key));
    const subject = state.subjects.find((s) => s.name === 'Com Aula');
    state.learningUnits = [...(state.learningUnits ?? []), { id: 9001, subjectId: subject.id, title: 'Aula existente', studyDate: '2026-01-01', createdAt: new Date().toISOString() }];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.goto('/#subjects');

  await card(page, 'Com Aula').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
  await expect(card(page, 'Com Aula').locator('.subject-catalog-delete-msg')).not.toHaveText('');
  await expect(card(page, 'Com Aula')).toBeVisible();
});
