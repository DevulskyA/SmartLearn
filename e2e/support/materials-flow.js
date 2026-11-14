// Shared steps of the Materiais screen. The only way to start a summary is the page range ("Por páginas", #sources-range-form) or the
// title search; the old "Explorar os conteúdos" list that sliced a book into automatic pieces no longer exists (P1-IDX1).

/** Pages of the document just uploaded: the last page any server-side proposal reaches (read through the app's own API client). */
async function lastPageOfNewestSource(page) {
  return page.evaluate(async () => {
    const ui = await import('/src/source-proposals-ui.js');
    const { sources } = await ui.listSources().then((r) => (r.ok ? r : { sources: [] }));
    const newest = [...sources].sort((a, b) => b.id - a.id)[0];
    if (!newest) return 1;
    const listed = await ui.listProposals(newest.id);
    return listed.ok && listed.proposals.length ? Math.max(...listed.proposals.map((p) => p.pageEnd)) : 1;
  });
}

/** Fills "De … até …" and submits "Preparar resumo". Without `to` it takes the whole (small) fixture document. */
export async function generateByPages(page, { from = 1, to } = {}) {
  const last = to ?? (await lastPageOfNewestSource(page));
  await page.locator('#sources-range-start').fill(String(from));
  await page.locator('#sources-range-end').fill(String(last));
  await page.locator('#sources-range-form [type="submit"]').click();
}

/** The "Continue de onde parou" row of a summary started earlier (the n-th one), by its title when given. */
export function draftRow(page, { title, nth = 0 } = {}) {
  const rows = page.locator('#sources-drafts-list .source-draft-item');
  return title ? rows.filter({ hasText: title }).first() : rows.nth(nth);
}

/** Opens the summary still in progress from the "Continue de onde parou" list. */
export async function openDraftInProgress(page, options) {
  await draftRow(page, options).locator('[data-action="open-draft-in-progress"]').click();
}
