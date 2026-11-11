import { test, expect } from '@playwright/test';

// P0-3 regression, in the V7.2 analysis table: alphabetical (Disciplina, Conteúdo / aula), numeric (Questões, Acertos, Desempenho) and
// recency (Último estudo) sorting must stay available in every view. The order applies to the WHOLE result; missing values stay last.

async function seedUatAndOpenStats(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await window.__seedUatMedical('DESTROY_EXISTING_DATA'); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#stats-body tbody tr[data-v5-row]').first()).toBeVisible();
}

const sortButton = (page, key) => page.locator(`#stats-body [data-v5="sort"][data-value="${key}"]`);
const column = (page, index) => page.locator('#stats-body tbody tr[data-v5-row]').evaluateAll((rows, i) => rows.map((r) => r.children[i].innerText.trim()), index);
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const toNumbers = (list) => list.map((t) => Number(t.replace(/\./g, '')));
const monotonic = (list) => list.every((v, i) => i === 0 || v >= list[i - 1]) || list.every((v, i) => i === 0 || v <= list[i - 1]);

test.beforeEach(async ({ page }) => {
  await seedUatAndOpenStats(page);
});

test('opens sorted by Desempenho, worst first, and says so in aria-sort', async ({ page }) => {
  await expect(page.locator('#stats-body th[aria-sort="ascending"] [data-value="accuracy"]')).toHaveCount(1);
});

test('sorting by Disciplina (alphabetical) works in both directions in Por disciplina', async ({ page }) => {
  await sortButton(page, 'subjectName').click();
  let names = await column(page, 0);
  expect(names).toEqual([...names].sort(collator.compare));
  await sortButton(page, 'subjectName').click();
  names = await column(page, 0);
  expect(names).toEqual([...names].sort(collator.compare).reverse());
});

test('sorting by Questões is numeric and reverses on the second click', async ({ page }) => {
  await sortButton(page, 'questions').click();
  const first = toNumbers(await column(page, 3));
  expect(monotonic(first)).toBe(true);
  await sortButton(page, 'questions').click();
  const second = toNumbers(await column(page, 3));
  expect(monotonic(second)).toBe(true);
  expect(second.join(',')).not.toBe(first.join(','));
});

test('recency: sorting by Último estudo orders the lessons by date, newest first on the first click', async ({ page }) => {
  await page.locator('#tab-stats-lesson').click();
  await page.locator('#stats-page-size').evaluate((el) => { el.value = '100'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await sortButton(page, 'studyDate').click();
  const dates = (await column(page, 2)).filter((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d)).map((d) => d.split('/').reverse().join('-'));
  expect(dates.length).toBeGreaterThan(1);
  expect(dates).toEqual([...dates].sort().reverse());
});

test('sorting by Conteúdo / aula (alphabetical) works in Por conteúdo, independent of the other view', async ({ page }) => {
  await page.locator('#tab-stats-unit').click();
  await sortButton(page, 'title').click();
  const titles = (await page.locator('#unit-stats-list tr[data-v5-row] .v5-content-name strong').allInnerTexts()).map((t) => t.trim());
  expect(titles.length).toBeGreaterThan(1);
  expect(titles).toEqual([...titles].sort(collator.compare));
});

test('header geometry: one sort button per sortable column, none on Prioridade and Ações, one active column at a time', async ({ page }) => {
  await expect(page.locator('#stats-body thead th')).toHaveCount(9);
  await expect(page.locator('#stats-body thead th [data-v5="sort"]')).toHaveCount(7);
  for (const th of await page.locator('#stats-body thead th').all()) expect(await th.locator('button').count()).toBeLessThanOrEqual(1);
  await sortButton(page, 'studyDate').click();
  await expect(page.locator('#stats-body thead th[aria-sort="ascending"], #stats-body thead th[aria-sort="descending"]')).toHaveCount(1);
});
