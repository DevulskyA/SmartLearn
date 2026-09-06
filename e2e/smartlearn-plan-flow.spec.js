import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
});

test('fixture is medical (Biologia Celular, Farmacologia)', async ({ page }) => {
  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  const names = parsed.subjects.map(s => s.name);
  expect(names).toContain('Biologia Celular');
  expect(names).toContain('Farmacologia');
});

test('new discipline auto-selects and lesson saves (two-step, no orphan/partial state)', async ({ page }) => {
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('Fisiologia Cardiovascular');
  await page.locator('#plan-new-subject-form button[type="submit"]').click();
  await page.waitForTimeout(400);

  const selectedValue = await page.locator('#plan-subject-select').inputValue();
  expect(selectedValue).not.toBe('');

  await page.locator('#plan-study-title').fill('Sistema de Conducao Cardiaca');
  await page.locator('#plan-study-date').fill('2026-09-06');
  await page.locator('.plan-new-unit-form button:has-text("Salvar")').first().click();
  await page.waitForTimeout(800);

  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  expect(parsed.subjects.map(s => s.name)).toContain('Fisiologia Cardiovascular');
  expect(parsed.learningUnits.length).toBeGreaterThan(0);
});

test('medical unicode ACCEPTED in study title/content field', async ({ page }) => {
  await page.locator('#plan-subject-select').selectOption('1');
  const specialContent = 'pH < 7,35 — O₂ e µg/dL, Na⁺/K⁺-ATPase, β-bloqueador';
  await page.locator('#plan-study-title').fill(specialContent);
  const val = await page.locator('#plan-study-title').inputValue();
  expect(val).toBe(specialContent);
  await page.locator('#plan-study-date').fill('2026-09-06');
  await page.locator('.plan-new-unit-form button:has-text("Salvar")').first().click();
  await page.waitForTimeout(600);
  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  const found = parsed.learningUnits.some(u => u.title === specialContent);
  expect(found).toBe(true);
});

test('BUG: medical unicode REJECTED in discipline name (NAMING_PATTERN too strict vs spec)', async ({ page }) => {
  await page.locator('#plan-show-subject-form').click();
  const specialName = 'Farmacologia — β-bloqueadores e Na⁺/K⁺-ATPase';
  await page.locator('#plan-new-subject-input').fill(specialName);
  await page.locator('#plan-new-subject-form button[type="submit"]').click();
  await page.waitForTimeout(500);

  const screenText = await page.locator('.plan-new-unit-form').first().innerText();
  const hasMessage = /caracteres não permitidos/i.test(screenText);
  expect(hasMessage).toBe(true); // confirms: rejection has clear feedback (not silent)

  const options = await page.locator('#plan-subject-select option').allInnerTexts();
  const created = options.includes(specialName);
  // KNOWN GAP vs Product Constitution section Q: this SHOULD be true, currently false.
  // NAMING_PATTERN in src/naming-validation.js excludes em-dash/Greek/superscript for
  // discipline names specifically, while validateTitleField (content) allows them.
  expect(created).toBe(false); // documents current (non-compliant) behavior
});

test('control char U+2028 in discipline name: rejected with visible message, not persisted', async ({ page }) => {
  await page.locator('#plan-show-subject-form').click();
  const malicious = 'Teste' + String.fromCharCode(0x2028) + 'Malicioso';
  await page.locator('#plan-new-subject-input').fill(malicious);
  await page.locator('#plan-new-subject-form button[type="submit"]').click();
  await page.waitForTimeout(500);

  const screenText = await page.locator('.plan-new-unit-form').first().innerText();
  expect(/caracteres|permitidos/i.test(screenText)).toBe(true);

  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  expect(parsed.subjects.some(s => s.name.includes('Malicioso'))).toBe(false);
});

test('control char U+2028 in study title: rejected with visible message, not persisted', async ({ page }) => {
  await page.locator('#plan-subject-select').selectOption('1');
  const malicious = 'Titulo' + String.fromCharCode(0x2028) + 'Malicioso';
  await page.locator('#plan-study-title').fill(malicious);
  await page.locator('#plan-study-date').fill('2026-09-06');
  await page.locator('.plan-new-unit-form button:has-text("Salvar")').first().click();
  await page.waitForTimeout(500);

  const screenText = await page.locator('.plan-new-unit-form').first().innerText();
  expect(/controle não permitidos/i.test(screenText)).toBe(true);

  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  expect(parsed.learningUnits.some(u => (u.title || '').includes('Malicioso'))).toBe(false);
});

test('duplicate discipline name (case-insensitive) rejected, no duplicate row', async ({ page }) => {
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('biologia celular');
  await page.locator('#plan-new-subject-form button[type="submit"]').click();
  await page.waitForTimeout(400);
  const options = await page.locator('#plan-subject-select option').count();
  expect(options).toBe(3); // blank + Biologia Celular + Farmacologia, no dup added
});

test('future study date allowed (planned study, not a bug)', async ({ page }) => {
  await page.locator('#plan-subject-select').selectOption('1');
  await page.locator('#plan-study-title').fill('Estudo planejado futuro');
  await page.locator('#plan-study-date').fill('2099-01-01');
  await page.locator('.plan-new-unit-form button:has-text("Salvar")').first().click();
  await page.waitForTimeout(600);
  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  expect(parsed.learningUnits.some(u => u.title === 'Estudo planejado futuro')).toBe(true);
});

test('reload persists created data (client-side BrowserStore, not server authority yet)', async ({ page }) => {
  await page.locator('#plan-subject-select').selectOption('1');
  await page.locator('#plan-study-title').fill('Teste persistencia reload');
  await page.locator('#plan-study-date').fill('2026-09-06');
  await page.locator('.plan-new-unit-form button:has-text("Salvar")').first().click();
  await page.waitForTimeout(600);

  await page.reload();
  await page.waitForLoadState('networkidle');
  const storage = await page.evaluate(() => localStorage.getItem('smartlearn:browser-db'));
  const parsed = JSON.parse(storage);
  expect(parsed.learningUnits.some(u => u.title === 'Teste persistencia reload')).toBe(true);
});
