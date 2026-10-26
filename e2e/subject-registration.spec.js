import { test, expect } from '@playwright/test';

// R-4 (one registration of a discipline): Disciplinas, Cadastro and Plano used to carry three different forms (name + colour in one,
// name only in the others, three different messages). They now open the SAME registration (src/subject-create-form.js): the same
// fields, the same colour choice, the same validation and the same messages. Local-database mode, like the other screens' specs.

const DOORS = [
  {
    name: 'Disciplinas',
    open: async (page) => { await page.goto('/#subjects'); },
    trigger: '#subjects-show-create-btn', form: '#subjects-create-form', input: '#subjects-new-name', message: '#subjects-create-message',
  },
  {
    name: 'Cadastro',
    open: async (page) => { await page.goto('/#register'); },
    trigger: '#show-subject-form', form: '#new-subject-form', input: '#new-subject-input', message: '#subject-message',
  },
  {
    name: 'Plano',
    open: async (page) => { await page.goto('/#plan'); await page.locator('#plan-new-unit-btn').click(); },
    trigger: '#plan-show-subject-form', form: '#plan-new-subject-form', input: '#plan-new-subject-input', message: '#plan-unit-form-message',
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
});

test('the three doors open the same registration: the same label, the same colour choices, the same button', async ({ page }) => {
  const shapes = [];
  for (const door of DOORS) {
    await door.open(page);
    await expect(page.locator(door.form)).toBeHidden();
    await page.locator(door.trigger).click();
    const form = page.locator(door.form);
    await expect(form).toBeVisible();
    await expect(page.locator(door.trigger)).toHaveAttribute('aria-expanded', 'true');
    await expect(form.getByLabel('Nome da nova disciplina')).toBeFocused();
    shapes.push({
      swatches: await form.locator('.color-swatch').count(),
      selected: await form.locator('.color-swatch.is-selected').count(),
      submit: (await form.locator('button[type="submit"]').innerText()).trim(),
    });
  }
  expect(shapes[0].swatches).toBeGreaterThan(1);
  expect(shapes[0].selected).toBe(1);
  expect(shapes[0].submit).toBe('Adicionar');
  expect(shapes[1]).toEqual(shapes[0]);
  expect(shapes[2]).toEqual(shapes[0]);
});

test('an empty name and a repeated name get the same answer in every door', async ({ page }) => {
  // the first discipline, through Disciplinas
  await DOORS[0].open(page);
  await page.locator(DOORS[0].trigger).click();
  await page.locator(DOORS[0].input).fill('Anatomia Registro');
  await page.locator(`${DOORS[0].form} button[type="submit"]`).click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Anatomia Registro' })).toBeVisible({ timeout: 5000 });

  for (const door of DOORS) {
    await door.open(page);
    await page.locator(door.trigger).click();
    // empty: refused in place, the form stays open
    await page.locator(`${door.form} button[type="submit"]`).click();
    await expect(page.locator(door.message), `${door.name}: empty name`).not.toBeEmpty();
    await expect(page.locator(door.form)).toBeVisible();
    // repeated: the same sentence everywhere
    await page.locator(door.input).fill('anatomia registro');
    await page.locator(`${door.form} button[type="submit"]`).click();
    await expect(page.locator(door.message), `${door.name}: repeated name`).toHaveText('Já existe uma disciplina com esse nome.', { timeout: 5000 });
    await expect(page.locator(door.form)).toBeVisible();
  }
});

test('a discipline created in Cadastro or Plano gets the colour chosen in the form, and the form closes and clears', async ({ page }) => {
  const colorOf = async (name) => page.locator('.subject-catalog-card', { hasText: name }).evaluate((el) => el.style.getPropertyValue('--subject-color'));

  await DOORS[0].open(page);
  await page.locator(DOORS[0].trigger).click();
  await page.locator(DOORS[0].input).fill('Cor Padrao');
  await page.locator(`${DOORS[0].form} button[type="submit"]`).click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Cor Padrao' })).toBeVisible({ timeout: 5000 });
  const defaultColor = await colorOf('Cor Padrao');

  for (const [door, name] of [[DOORS[1], 'Cor Cadastro'], [DOORS[2], 'Cor Plano']]) {
    await door.open(page);
    await page.locator(door.trigger).click();
    await page.locator(door.input).fill(name);
    await page.locator(`${door.form} .color-swatch`).nth(3).click();
    await expect(page.locator(`${door.form} .color-swatch`).nth(3)).toHaveClass(/is-selected/);
    await page.locator(`${door.form} button[type="submit"]`).click();
    await expect(page.locator(door.form), `${door.name}: closes after creating`).toBeHidden({ timeout: 5000 });
    await page.locator(door.trigger).click();
    await expect(page.locator(door.input), `${door.name}: opens clean`).toHaveValue('');
    await expect(page.locator(`${door.form} .color-swatch`).nth(0)).toHaveClass(/is-selected/);
  }

  await page.goto('/#subjects');
  for (const name of ['Cor Cadastro', 'Cor Plano']) {
    await expect(page.locator('.subject-catalog-card', { hasText: name })).toBeVisible({ timeout: 5000 });
    expect(await colorOf(name), `${name} keeps the chosen colour`).not.toBe(defaultColor);
  }
});

test('the colour choice is ONE stop of the keyboard and the arrows change it (a radio group, not eight buttons in a row)', async ({ page }) => {
  await DOORS[1].open(page);
  await page.locator(DOORS[1].trigger).click();
  const swatches = page.locator(`${DOORS[1].form} .color-swatch`);
  expect(await swatches.count()).toBeGreaterThan(2);
  await expect(page.locator(`${DOORS[1].form} [role="radiogroup"]`)).toHaveCount(1);
  // exactly one swatch can be reached by Tab: the selected one
  await expect(page.locator(`${DOORS[1].form} .color-swatch[tabindex="0"]`)).toHaveCount(1);
  await expect(swatches.nth(0)).toHaveAttribute('aria-checked', 'true');
  await swatches.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(swatches.nth(1)).toBeFocused();
  await expect(swatches.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(swatches.nth(0)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator(`${DOORS[1].form} .color-swatch[tabindex="0"]`)).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // wraps to the last
  await expect(swatches.nth((await swatches.count()) - 1)).toBeFocused();
});
