// The Resumo Mestre of a draft opens as the formatted lesson; tests that type into it start the editing first.
export async function startEditingSummary(page) {
  const start = page.locator('.lesson-editor [data-action="toggle-summary-read"][aria-pressed="true"]');
  if (await start.count()) await start.evaluate((el) => el.click()); // a script click: the keyboard focus stays where it was
}
