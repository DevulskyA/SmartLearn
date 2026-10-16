// T15: single pure source for the fixed 16-review schedule, shared by
// client and server. design.md §4: "Existing review offsets remain
// [1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390], one shared pure
// source plus compatibility re-exports." heritage.md H-01: this is the
// current schedule contract — the historical spreadsheet's 13-offset
// sequence is NOT restored here.
export const REVIEW_DAY_OFFSETS = Object.freeze([
  1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390,
]);

/**
 * Calendar-day arithmetic in UTC (not elapsed milliseconds), per design.md
 * §4. setUTCDate correctly rolls over month/year boundaries and leap days —
 * no manual leap-year handling needed, JS Date does it natively.
 */
export function generateReviewDates(studyDate) {
  const baseDate = new Date(`${studyDate}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('A data de estudo é inválida.');
  }
  // JS Date silently overflows an invalid calendar day (e.g. "2026-02-30"
  // becomes 2026-03-02) instead of failing — round-trip and compare to
  // catch that, since a real Gregorian calendar validation (design.md §4)
  // must reject Feb 30, not quietly reinterpret it as a different date.
  if (baseDate.toISOString().slice(0, 10) !== studyDate) {
    throw new Error('A data de estudo é inválida.');
  }

  return REVIEW_DAY_OFFSETS.map((offset) => {
    const reviewDate = new Date(baseDate);
    reviewDate.setUTCDate(reviewDate.getUTCDate() + offset);
    return reviewDate.toISOString().slice(0, 10);
  });
}
