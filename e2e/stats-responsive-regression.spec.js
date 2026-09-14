import { test, expect } from '@playwright/test';

// Permanent regression coverage for Estatísticas' two matrix tables (Por
// disciplina / Por conteúdo), which have silently regressed multiple times
// across sessions:
//   - ff7dec2 fixed <768px (phone) silent horizontal overflow.
//   - This PR's own P1-2 fixed 768-900px (sidebar-narrow) overflow.
//   - A later commit (a63a35a) added a visually-STACKED "Recência" sort
//     button under "Prática" with no media-query scoping, changing the
//     header cell's content shape at every width — including the phone
//     breakpoint ff7dec2 had already fixed, silently re-breaking it. That
//     stacking was reverted; Recência is now a second cycle state on the
//     SAME single Prática button (see e2e/stats-sorting.spec.js), so header
//     geometry never changes at any width.
// "Verified live" does not hold across subsequent commits touching shared
// header/column markup — this file exists so a regression here fails CI
// instead of waiting for a person to notice it again. Per standing rule:
// any future change to .matrix-table/<thead>/<th>/.th-sort-btn/column
// widths/table-layout/overflow/identity/practice/trend cells must keep
// every test in this file green across every listed width, on both tabs.

const WIDTHS = [375, 390, 768, 800, 900, 1280];

async function seedUatAndOpenStats(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#subject-kpi-list tr.matrix-row').first()).toBeVisible();
}

async function hasHorizontalScroll(page, scrollSelector) {
  return page.locator(scrollSelector).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
}

// Rough proxy for "how much of a label is visually renderable" without
// exact pixel-to-glyph math: rendered width / (font-size * avg-char-width
// factor). Used only to catch the specific "collapsed to a 1-3 character
// illegible fragment" failure mode, not to assert exact character counts.
async function approxVisibleChars(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize);
    return el.getBoundingClientRect().width / (fontSize * 0.55);
  });
}

for (const width of WIDTHS) {
  test.describe(`viewport ${width}px`, () => {
    test('Por disciplina: no horizontal scroll, exactly 4 columns, header row legible, performance/practice/trend all visible', async ({ page }) => {
      await seedUatAndOpenStats(page, width);
      expect(await hasHorizontalScroll(page, '#subject-kpi-section .table-scroll')).toBe(false);

      const ths = page.locator('#subject-kpi-head th');
      await expect(ths).toHaveCount(4);

      // Long real discipline name never forces overflow.
      const longRow = page.locator('#subject-kpi-list tr.matrix-row', { hasText: 'Patologia' });
      await expect(longRow).toBeVisible();

      // Every real metric stays on-screen for that same row: performance
      // percentage, practice volume, and the trend badge.
      await expect(longRow.locator('.subject-compare-value, .subject-cell + td, td').nth(1)).toBeVisible();
      const perfText = await longRow.locator('td').nth(1).textContent();
      expect(perfText).toMatch(/%/);
      const practiceText = await longRow.locator('td').nth(2).textContent();
      expect(practiceText).toMatch(/q/);
      const trendBadge = longRow.locator('.trend-badge');
      await expect(trendBadge).toBeVisible();

      // Headers never collapse to an illegible fragment.
      for (const key of ['identity', 'performance', 'trend']) {
        const btn = page.locator(`#subject-kpi-head .th-sort-btn[data-sort-key="${key}"]`);
        expect(await approxVisibleChars(btn), `${key} header must stay legible at ${width}px`).toBeGreaterThan(4);
      }
      const practiceRecencyBtn = page.locator('#subject-kpi-head .th-sort-btn-practice-recency');
      expect(await approxVisibleChars(practiceRecencyBtn), `Prática header must stay legible at ${width}px`).toBeGreaterThan(4);
    });

    test('Por conteúdo: no horizontal scroll, exactly 4 columns, identity cell never collapses to a 1-3 character fragment, date/practice/trend all visible', async ({ page }) => {
      await seedUatAndOpenStats(page, width);
      await page.locator('#tab-stats-unit').click();
      await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();
      expect(await hasHorizontalScroll(page, '#view-stats-unit .table-scroll')).toBe(false);

      const ths = page.locator('#unit-stats-head th');
      await expect(ths).toHaveCount(4);

      const identityCell = page.locator('#unit-stats-list .unit-identity-cell').first();
      const chip = identityCell.locator('.subject-cell--compact');
      const titleEl = identityCell.locator('.unit-title');
      expect(await approxVisibleChars(chip), `discipline chip must not collapse to a 1-3 char fragment at ${width}px`).toBeGreaterThan(3);
      expect(await approxVisibleChars(titleEl), `content title must not collapse to a 1-3 char fragment at ${width}px`).toBeGreaterThan(3);

      // Full text always available via title, and it matches the real
      // (untruncated) text node exactly.
      expect(await chip.getAttribute('title')).toBe(await chip.evaluate((el) => el.textContent));
      expect(await titleEl.getAttribute('title')).toBe(await titleEl.evaluate((el) => el.textContent));

      // Performance/practice/trend still visible for that same row.
      const row = identityCell.locator('xpath=ancestor::tr[1]');
      await expect(row.locator('.trend-badge')).toBeVisible();
      const perfText = await row.locator('td').nth(1).textContent();
      expect(perfText).toMatch(/%|Sem evidência/);

      // Headers never collapse.
      for (const key of ['identity', 'performance', 'trend']) {
        const btn = page.locator(`#unit-stats-head .th-sort-btn[data-sort-key="${key}"]`);
        expect(await approxVisibleChars(btn), `${key} header must stay legible at ${width}px`).toBeGreaterThan(4);
      }
    });
  });
}

test('Por conteúdo last-activity date shows a clean cut (not a mid-word fragment) and the full date is available via title, at phone width', async ({ page }) => {
  await seedUatAndOpenStats(page, 375);
  await page.locator('#tab-stats-unit').click();
  const dateEl = page.locator('#unit-stats-list .practice-recent').first();
  await expect(dateEl).toBeVisible();
  const titleAttr = await dateEl.getAttribute('title');
  const fullText = await dateEl.evaluate((el) => el.textContent);
  // title must carry the exact same full date the element's own text node
  // holds — proves the visual cut (white-space:nowrap+ellipsis) is purely
  // a CSS presentation effect, the real string is intact and one hover
  // away, never independently (and possibly inconsistently) computed.
  expect(titleAttr).toBe(fullText);
  expect(titleAttr?.length, 'full date must be available via title').toBeGreaterThan(0);
  expect(await dateEl.evaluate((el) => el.scrollLeft)).toBe(0);
});

test('Prática/Recência header never becomes two stacked controls, at any width, in either table', async ({ page }) => {
  for (const width of WIDTHS) {
    await seedUatAndOpenStats(page, width);
    for (const headId of ['#subject-kpi-head', '#unit-stats-head']) {
      if (headId === '#unit-stats-head') {
        await page.locator('#tab-stats-unit').click();
        await expect(page.locator('#unit-stats-list tr.matrix-row').first()).toBeVisible();
      }
      const combinedTh = page.locator(`${headId} .th-sort-btn-practice-recency`).locator('xpath=..');
      await expect(combinedTh.locator('.th-sort-btn')).toHaveCount(1);
    }
  }
});
