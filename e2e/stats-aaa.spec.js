import { test, expect } from '@playwright/test';

// Estatísticas AAA (human-authorized redesign of a protected surface, ADR-0001): the header, the discipline
// table, the distribution and the evolution chart must tell ONE truthful story, for every period. The UAT
// fixture (DEV only, synthetic) has old evidence (up to ~300 days) and a discipline never practiced.
// Selectors follow the V7.2 table (#stats-body, tr[data-v5-row]); the contracts are unchanged.

const pageErrors = [];

async function openStats(page, size = { width: 1280, height: 820 }) {
  pageErrors.length = 0;
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 502/.test(m.text())) pageErrors.push(m.text()); });
  await page.setViewportSize(size);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await window.__seedUatMedical('DESTROY_EXISTING_DATA'); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list tr[data-v5-row]').first()).toBeVisible();
}

const num = (text) => Number(String(text).replace(/\D/g, '') || 0);

async function readAll(page) {
  const rows = await page.locator('#subject-kpi-list tr[data-v5-row]').evaluateAll((trs) => trs.map((tr) => ({
    name: tr.querySelector('.v5-subject').textContent,
    perf: tr.querySelector('.v5-grade').textContent,
    band: tr.querySelector('.v5-grade').dataset.band,
    questions: tr.querySelector('td.v5-number').textContent,
  })));
  if (await page.locator('#stats-extra-analysis').isHidden()) await page.locator('[data-v5="advanced"]').click();
  const bands = await page.locator('#stats-extra-analysis .v5-band-grid button').evaluateAll((buttons) => buttons.map((b) => ({ band: b.dataset.band, count: Number(b.querySelector('strong').textContent) })));
  return {
    rows,
    bands,
    headerQuestions: num(await page.locator('#metric-questions').textContent()),
    headerSubjects: num(await page.locator('#metric-subjects').textContent()),
    average: (await page.locator('#metric-average').textContent()).trim(),
  };
}

test('opens on 90 days with worst performance first', async ({ page }) => {
  await openStats(page);
  await expect(page.locator('#stats-unit-filter-period')).toHaveValue('last-90');
  const { rows } = await readAll(page);
  const measured = rows.filter((r) => r.perf !== '—').map((r) => Number(r.perf.replace('%', '').replace(',', '.')));
  expect(measured).toEqual([...measured].sort((a, b) => a - b));
  expect(rows[rows.length - 1].perf).toBe('—');
});

test('header, table and distribution reconcile for every period, and a shorter period never keeps old questions', async ({ page }) => {
  await openStats(page);
  const totals = {};
  for (const period of ['last-30', 'last-90', 'last-365', '']) {
    await page.locator('#stats-unit-filter-period').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, period);
    await expect(page.locator('#subject-kpi-list tr[data-v5-row]').first()).toBeVisible();
    await page.waitForTimeout(250);
    const all = await readAll(page);
    const tableQuestions = all.rows.reduce((s, r) => s + num(r.questions), 0);
    expect(all.headerQuestions, `header questions = table sum (${period || 'any'})`).toBe(tableQuestions);
    expect(all.headerSubjects).toBe(all.rows.length);
    expect(all.bands.reduce((s, b) => s + b.count, 0), 'distribution counts every discipline once').toBe(all.rows.length);
    for (const b of all.bands) expect(b.count, `band ${b.band}`).toBe(all.rows.filter((r) => r.band === b.band).length);
    for (const r of all.rows.filter((x) => x.questions.trim() === '0')) expect(r.perf).toBe('—');
    totals[period || 'any'] = all.headerQuestions;
  }
  expect(totals['last-30']).toBeLessThan(totals['last-90']);
  expect(totals['last-90']).toBeLessThan(totals['last-365']);
  expect(totals['last-365']).toBeLessThanOrEqual(totals.any);
});

test('evolution chart: points follow dates, quiet gaps are not joined, filter follows the panorama click', async ({ page }) => {
  await openStats(page);
  expect(pageErrors, "no script errors while rendering Estatísticas").toEqual([]);
  await expect(page.locator('#evolution-svg')).toBeVisible();
  const dots = page.locator('#evolution-svg .v5-chart-point');
  expect(await dots.count()).toBeGreaterThan(1);
  const geometry = await page.locator('#evolution-svg').evaluate((svg) => ({
    xs: [...svg.querySelectorAll('.v5-chart-point')].map((c) => Number(c.getAttribute('cx'))),
    desc: document.querySelector('#evolution-svg-description').textContent,
  }));
  expect([...geometry.xs]).toEqual([...geometry.xs].sort((a, b) => a - b));
  expect(geometry.desc.length).toBeGreaterThan(10);
  // a click on a discipline of the panorama selects it in the chart filter and opens its contents
  const row = page.locator('.v5-overview-row', { hasText: 'Anatomia' });
  const id = await row.getAttribute('data-id');
  await row.click();
  await expect(page.locator('#evolution-filter-subject')).toHaveValue(id);
  await expect(page.locator('#stats-filter-subject')).toHaveValue(id);
});

test('trend shows percentage points or says the sample is insufficient, and names its window in the tooltip', async ({ page }) => {
  await openStats(page);
  const texts = await page.locator('#subject-kpi-list .v5-trend').allTextContents();
  expect(texts.length).toBeGreaterThan(3);
  for (const text of texts) expect(text.trim()).toMatch(/^([+-]\d+ p\.p\.|Estável|Sem dados)$/);
  expect(await page.locator('#subject-kpi-list .v5-trend[title]').count()).toBe(texts.length);
});

test('no layout surprises: no page overflow at 800/1280/1920, the table scrolls inside its own region, focus is visible', async ({ page }) => {
  for (const size of [{ width: 800, height: 600 }, { width: 1280, height: 820 }, { width: 1920, height: 1080 }]) {
    await openStats(page, size);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `page overflows at ${size.width}`).toBe(false);
    const region = page.locator('#stats-body .v5-table-scroll');
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toHaveAttribute('tabindex', '0');
    const card = await page.locator('#stats-analysis-card').boundingBox();
    const table = await region.boundingBox();
    expect(table.width).toBeGreaterThan(card.width * 0.6);
    await page.locator('#subject-kpi-list [data-v5="inspect"]').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator('#subject-kpi-list [data-v5="inspect"]').first().evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.screenshot({ path: `test-results/stats-aaa-${size.width}x${size.height}.png`, fullPage: true });
  }
});
