// LESSON LIMITS (decisão do autor, 2026-11-14): a lesson is what a teacher gives in one class (about 2 hours, usually less), so a book
// scope above this many pages is refused and the student splits it into Part 1, Part 2... Pages vary in density; the text budget
// that splits a range into parts still applies below this cap.
// Derivation: ~130 spoken words/min x 120 min = ~15,600 words = ~31 book pages of ~500 words -> 30.
export const MAX_PAGES_PER_LESSON = 30;

/**
 * About how long a teacher takes to give this much text in class (books have no hours, so it is estimated): ~130 spoken words per
 * minute and ~6 characters per word. A rough guide shown before generating, never a promise; 0 only for no text at all.
 */
export function estimateClassMinutes(chars) {
  if (!(chars > 0)) return 0;
  return Math.max(1, Math.round(chars / 6 / 130));
}

/** Number of pages in an inclusive range. */
export function pageCountOf(pageStart, pageEnd) {
  return pageEnd - pageStart + 1;
}

/**
 * The pages two lessons of the SAME book would have in common, or null when that is allowed. Ranges are inclusive.
 * The only page two lessons may share is ONE boundary page (the first lesson ends on it, the next starts on it, the subject changes
 * in the middle of that page). Anything else (an identical range, two shared pages, a range inside another) is a mistake.
 * @param {{pageStart:number,pageEnd:number}} range the range being added
 * @param {{pageStart:number,pageEnd:number}[]} existing ranges of the book's other lessons
 * @returns {{pageStart:number,pageEnd:number,withIndex:number}|null} the shared pages and the index of the clashing existing range
 */
export function findPageConflict(range, existing) {
  for (let i = 0; i < existing.length; i += 1) {
    const other = existing[i];
    const from = Math.max(range.pageStart, other.pageStart);
    const to = Math.min(range.pageEnd, other.pageEnd);
    if (from > to) continue;
    if (from === to && isBoundaryPage(from, range, other)) continue;
    return { pageStart: from, pageEnd: to, withIndex: i };
  }
  return null;
}

function isBoundaryPage(page, a, b) {
  const aAfterB = b.pageEnd === page && b.pageStart < page && a.pageStart === page && a.pageEnd > page;
  const bAfterA = a.pageEnd === page && a.pageStart < page && b.pageStart === page && b.pageEnd > page;
  return aAfterB || bAfterA;
}

/**
 * Cuts an inclusive page range into the fewest equal parts that each fit the lesson cap (Part 1, Part 2...). A range that already
 * fits is one part. Parts never overlap and together cover the range exactly.
 * @returns {{pageStart:number,pageEnd:number}[]}
 */
export function splitIntoParts(pageStart, pageEnd, max = MAX_PAGES_PER_LESSON) {
  const count = pageCountOf(pageStart, pageEnd);
  if (!(count > 0)) return [];
  const parts = Math.ceil(count / max);
  const size = Math.ceil(count / parts);
  const result = [];
  for (let from = pageStart; from <= pageEnd; from += size) result.push({ pageStart: from, pageEnd: Math.min(pageEnd, from + size - 1) });
  return result;
}
