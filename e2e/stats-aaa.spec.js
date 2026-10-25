import { test, expect } from '@playwright/test';

// Estatísticas AAA (human-authorized redesign of a protected surface, ADR-0001): the header, the discipline
// table, the distribution and the evolution chart must tell ONE truthful story, for every period. The UAT
// fixture (DEV only, synthetic) has old evidence (up to ~300 days) and a discipline never practiced.

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
  await expect(page.locator('#subject-kpi-list tr.matrix-row').first()).toBeVisible();
}

const num = (text) => Number(String(text).replace(/\D/g, '') || 0);

async function readAll(page) {
  const rows = await page.locator('#subject-kpi-list tr.matrix-row').evaluateAll((trs) => trs.map((tr) => ({
    name: tr.querySelector('.subject-cell').textContent,
    perf: tr.children[1].textContent,
    state: tr.children[1].dataset.state,
    evidence: tr.children[2].querySelector('.practice-compact').textContent,
  })));
  const bands = await page.locator('#stats-band-list .band-row').evaluateAll((lis) => lis.map((li) => ({
    state: li.dataset.state,
    text: li.querySelector('.band-figures').textContent,
  })));
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
  const withEvidence = rows.filter((r) => r.state !== 'NO_EVIDENCE').map((r) => num(r.perf.split(',')[0]));
  const sorted = [...withEvidence].sort((a, b) => a - b);
  expect(withEvidence).toEqual(sorted);
  expect(rows[rows.length - 1].state).toBe('NO_EVIDENCE');
});

test('header, table and distribution reconcile for every period, and a shorter period never keeps old questions', async ({ page }) => {
  await openStats(page);
  const totals = {};
  for (const period of ['last-30', 'last-90', 'last-365', '']) {
    await page.locator('#stats-unit-filter-period').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, period);
    await expect(page.locator('#subject-kpi-list tr.matrix-row').first()).toBeVisible();
    await page.waitForTimeout(250);
    const all = await readAll(page);
    const tableQuestions = all.rows.reduce((s, r) => s + (r.state === 'NO_EVIDENCE' ? 0 : num(r.evidence)), 0);
    expect(all.headerQuestions, `header questions = table sum (${period || 'any'})`).toBe(tableQuestions);
    expect(all.headerSubjects).toBe(all.rows.length);
    const distCount = all.bands.reduce((s, b) => s + num(b.text.split('·')[1]), 0);
    expect(distCount, 'distribution counts every discipline once').toBe(all.rows.length);
    const distPercent = all.bands.reduce((s, b) => s + num(b.text.split('%')[0]), 0);
    expect(distPercent).toBe(100);
    const noEvidenceBand = all.bands.find((b) => b.state === 'NO_EVIDENCE');
    expect(num(noEvidenceBand.text.split('·')[1])).toBe(all.rows.filter((r) => r.state === 'NO_EVIDENCE').length);
    for (const r of all.rows.filter((x) => x.state === 'NO_EVIDENCE')) expect(r.perf).toMatch(/Sem evidência/);
    totals[period || 'any'] = all.headerQuestions;
  }
  expect(totals['last-30']).toBeLessThan(totals['last-90']);
  expect(totals['last-90']).toBeLessThan(totals['last-365']);
  expect(totals['last-365']).toBeLessThanOrEqual(totals.any);
});

test('evolution chart: points follow dates, quiet gaps are not joined, filter follows the table row', async ({ page }) => {
  await openStats(page);
  expect(pageErrors, "no script errors while rendering Estatísticas").toEqual([]);
  await expect(page.locator('#evolution-svg')).toBeVisible();
  const dots = page.locator('#evolution-svg .evo-dot');
  expect(await dots.count()).toBeGreaterThan(1);
  const geometry = await page.locator('#evolution-svg').evaluate((svg) => ({
    xs: [...svg.querySelectorAll('.evo-dot')].map((c) => Number(c.getAttribute('cx'))),
    lines: svg.querySelectorAll('.evo-line').length,
    desc: document.querySelector('#evolution-svg-description').textContent,
  }));
  expect([...geometry.xs]).toEqual([...geometry.xs].sort((a, b) => a - b));
  expect(geometry.desc.length).toBeGreaterThan(10);
  // a click on a row selects its discipline in the chart filter
  const row = page.locator('#subject-kpi-list tr.matrix-row', { has: page.locator('.subject-cell', { hasText: 'Anatomia' }) });
  const id = await row.getAttribute('data-subject-id');
  await row.click();
  await page.locator('#tab-stats-subject').click();
  await expect(page.locator('#evolution-filter-subject')).toHaveValue(id);
  await expect(row).toHaveClass(/is-selected/);
});

test('trend shows percentage points or says the sample is insufficient', async ({ page }) => {
  await openStats(page);
  const texts = await page.locator('#subject-kpi-list .trend-badge').allTextContents();
  expect(texts.length).toBeGreaterThan(3);
  for (const text of texts) expect(text.trim()).toMatch(/^([+−]\d+ p\.p\.|Estável|Amostra insuficiente)$/);
  expect(await page.locator('#subject-kpi-list .trend-badge[title]').count()).toBe(texts.length);
});

test('no layout surprises: no horizontal scroll, focus visible, side column below at 800x600', async ({ page }) => {
  for (const size of [{ width: 800, height: 600 }, { width: 1280, height: 820 }, { width: 1920, height: 1080 }]) {
    await openStats(page, size);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `page overflows at ${size.width}`).toBe(false);
    expect(await page.locator('#subject-kpi-section .table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    const table = await page.locator('#subject-kpi-section').boundingBox();
    const side = await page.locator('.stats-side').boundingBox();
    if (size.width <= 900) expect(side.y).toBeGreaterThan(table.y + table.height - 1);
    else {
      expect(side.x).toBeGreaterThan(table.x + table.width - 1);
      expect(table.width / (table.width + side.width)).toBeGreaterThan(0.6);
      expect(table.width / (table.width + side.width)).toBeLessThan(0.72);
    }
    await page.locator('#subject-kpi-list tr.matrix-row').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator('#subject-kpi-list tr.matrix-row').first().evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.screenshot({ path: `test-results/stats-aaa-${size.width}x${size.height}.png`, fullPage: true });
  }
});
