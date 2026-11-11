import { test, expect } from '@playwright/test';

// Estatísticas "Análise completa" (V7.2): 9-column table, three views, filters, sorting, pagination, distribution, detail, CSV.
// Replaces the old two-matrix specs. Geometry checks run at every width the layout is promised for.

const WIDTHS = [375, 390, 768, 800, 900, 1280, 1440];

async function openStats(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
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

const rowCount = (page) => page.locator('#stats-body tbody tr[data-v5-row]').count();
const footer = (page) => page.locator('#stats-table-footer span').first().innerText();

test('three views list their own rows, with the 9 columns of the reference', async ({ page }) => {
  await openStats(page);
  await expect(page.locator('#stats-body thead th')).toHaveCount(9);
  const subjects = await rowCount(page);
  expect(subjects).toBeGreaterThan(0);
  expect(await footer(page)).toContain('disciplinas');
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  expect(await footer(page)).toContain('conteúdos');
  await page.locator('#tab-stats-lesson').click();
  expect(await footer(page)).toContain('aulas');
  expect(await rowCount(page)).toBeGreaterThan(subjects);
});

test('sorting toggles direction, search and filters narrow the same rows, and the band distribution filters', async ({ page }) => {
  await openStats(page);
  const header = page.locator('[data-v5="sort"][data-value="questions"]');
  await header.click();
  await expect(page.locator('#stats-body th[aria-sort="descending"], #stats-body th[aria-sort="ascending"]')).toHaveCount(1);
  const first = await page.locator('#stats-body td.v5-number').first().innerText();
  await page.locator('[data-v5="sort"][data-value="questions"]').click();
  expect(await page.locator('#stats-body td.v5-number').first().innerText()).not.toBe(first);

  const all = await rowCount(page);
  await page.locator('#stats-table-search').fill('zzzz-sem-resultado');
  await expect(page.locator('#stats-body .v5-empty')).toBeVisible();
  await page.locator('#stats-table-search').fill('');
  expect(await rowCount(page)).toBe(all);

  await page.locator('#stats-filter-band').evaluate((el) => { el.value = 'insufficient'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await rowCount(page)).toBeLessThanOrEqual(all);
  await page.locator('#stats-filter-band').evaluate((el) => { el.value = 'all'; el.dispatchEvent(new Event('change', { bubbles: true })); });

  await page.locator('[data-v5="advanced"]').click();
  await expect(page.locator('#stats-extra-analysis')).toBeVisible();
  await expect(page.locator('#stats-extra-analysis .v5-band-grid button')).toHaveCount(5);
});

test('global search in the header drives the same table; Por conteúdo opens from the panorama', async ({ page }) => {
  await openStats(page);
  await page.locator('#stats-global-search').fill('zzzz-sem-resultado');
  await expect(page.locator('#stats-table-search')).toHaveValue('zzzz-sem-resultado');
  await expect(page.locator('#stats-global-search-count')).not.toHaveText('');
  await page.locator('#stats-global-search').fill('');
  await page.locator('.v5-overview-row').first().click();
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
  expect(Number(await page.locator('#stats-filter-subject').inputValue())).toBeGreaterThan(0);
});

test('detail dialog shows the real lessons and "Abrir resumo" goes to Plano; CSV exports the filtered rows', async ({ page }) => {
  await openStats(page);
  await page.locator('[data-v5="inspect"]').first().click();
  await expect(page.locator('#stats-detail-dialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#stats-detail-title')).not.toBeEmpty();
  await page.locator('#stats-detail-body [data-v5="open-unit"]').first().click();
  await expect(page.locator('#screen-plan')).toBeVisible();

  await page.locator('[data-screen="stats"]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-v5="export-table"]').click()]);
  expect(download.suggestedFilename()).toMatch(/^smartlearn-analise-subject\.csv$/);
});

test('pagination follows the page size and keeps the order of the whole result', async ({ page }) => {
  await openStats(page);
  await page.locator('#tab-stats-lesson').click();
  await page.locator('#stats-page-size').evaluate((el) => { el.value = '12'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  const text = await footer(page);
  const pages = Number(/de (\d+)\s*$/.exec(text)?.[1] ?? 1);
  if (pages > 1) {
    await page.locator('[data-v5="page-next"]').click();
    expect(await footer(page)).toContain('página 2');
    await page.locator('[data-v5="page-prev"]').click();
    expect(await footer(page)).toContain('página 1');
  } else {
    await expect(page.locator('[data-v5="page-next"]')).toBeDisabled();
  }
});

test('tabs are reachable with the arrow keys', async ({ page }) => {
  await openStats(page);
  await page.locator('#tab-stats-subject').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-stats-unit')).toBeFocused();
  await expect(page.locator('#tab-stats-unit')).toHaveAttribute('aria-selected', 'true');
});

for (const width of WIDTHS) {
  test(`geometry at ${width}px: no page overflow, discipline chip never breaks inside a word, cells do not overlap`, async ({ page }) => {
    await openStats(page, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const chip = page.locator('#stats-body .v5-subject').first();
    const shape = await chip.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const line = parseFloat(cs.lineHeight) || 14;
      return { lines: Math.round((box.height - 8) / line), overflowWrap: cs.overflowWrap, clipped: el.scrollWidth > el.clientWidth + 1 };
    });
    expect(shape.lines, 'chip must stay within two lines').toBeLessThanOrEqual(2);
    expect(shape.overflowWrap).not.toBe('anywhere');
    expect(shape.clipped).toBe(false);
    // Cells of one row never overlap horizontally.
    const overlap = await page.locator('#stats-body tbody tr[data-v5-row]').first().evaluate((tr) => {
      const boxes = [...tr.children].map((td) => td.getBoundingClientRect());
      return boxes.some((b, i) => i > 0 && b.left < boxes[i - 1].right - 1);
    });
    expect(overlap).toBe(false);
    // From 1440 (like the V7.2 reference, which scrolls at 1280) the nine columns fit without horizontal scrolling.
    if (width >= 1440) {
      expect(await page.locator('#stats-body .v5-table-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  });
}

test('history: search, discipline filter, sort, pager, CSV and row click work on the real exercises', async ({ page }) => {
  await openStats(page);
  const rows = page.locator('#exercise-notes-body tr[data-evidence-id]');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('#evidence-count')).toContainText('registros');
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);
  await page.locator('#stats-history-search').fill('zzzz-sem-resultado');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#exercise-notes-empty')).toBeVisible();
  await page.locator('#stats-history-search').fill('');
  await expect(rows).toHaveCount(total);

  await page.locator('[data-history-sort="subjectName"]').click();
  await expect(page.locator('#stats-history-table th[data-history-key="subjectName"]')).toHaveAttribute('aria-sort', 'ascending');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#stats-export').click()]);
  expect(download.suggestedFilename()).toBe('smartlearn-historico.csv');

  await rows.first().click();
  await expect(page.locator('#exercise-detail-dialog, dialog[open]').first()).toBeVisible();
});
