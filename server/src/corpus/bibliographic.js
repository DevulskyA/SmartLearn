// BIBLIOGRAPHIC FIT: how an item's source (ISBN, edition, year) compares with the book/edition a need names. Pure, no I/O, no model.
// Metadata only INDICATES which candidate is the better parent; it never grants a right. Reuse of text still depends on the item's
// usage_status and key (canReuseText), and the private bank is already scoped to one user, so a match never crosses users.

/** ISBN-10/13 with hyphens or spaces -> 13 digits (978 prefix for ISBN-10); null when it is not a 10 or 13 digit ISBN. */
export function isbnKey(value) {
  const d = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(d)) return d;
  if (!/^\d{9}[\dX]$/.test(d)) return null;
  const core = `978${d.slice(0, 9)}`;
  const sum = [...core].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

const editionKey = (v) => {
  const m = String(v ?? '').match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
};
const yearKey = (v) => {
  if (Number.isInteger(v)) return v;
  return /^\d{4}$/.test(String(v ?? '').trim()) ? Number(v) : null;
};

export const FIT = Object.freeze({ NONE_REQUESTED: 'NONE_REQUESTED', UNKNOWN: 'UNKNOWN', MATCH: 'MATCH', OTHER_EDITION: 'OTHER_EDITION', CONFLICT: 'CONFLICT' });

/**
 * @param item  { isbn?, edition?, year? } as stored on the item
 * @param need  { isbn?, edition?, year? } the book/edition the student is working with
 * MATCH = at least one signal agrees and none disagrees; OTHER_EDITION = something disagrees and nothing agrees;
 * CONFLICT = signals disagree with each other (e.g. same ISBN, different edition): metadata is not trustworthy, so it is only reported;
 * UNKNOWN = the need names a book/edition but the item has nothing comparable; NONE_REQUESTED = the need names none.
 */
export function bibliographicFit(item, need) {
  const wanted = { isbn: isbnKey(need?.isbn), edition: editionKey(need?.edition), year: yearKey(need?.year) };
  if (wanted.isbn === null && wanted.edition === null && wanted.year === null) return FIT.NONE_REQUESTED;
  const have = { isbn: isbnKey(item?.isbn), edition: editionKey(item?.edition), year: yearKey(item?.year) };
  let agree = 0;
  let differ = 0;
  for (const k of ['isbn', 'edition', 'year']) {
    if (wanted[k] === null || have[k] === null) continue;
    if (wanted[k] === have[k]) agree += 1; else differ += 1;
  }
  if (agree > 0 && differ > 0) return FIT.CONFLICT;
  if (agree > 0) return FIT.MATCH;
  if (differ > 0) return FIT.OTHER_EDITION;
  return FIT.UNKNOWN;
}

const RANK = { MATCH: 0, UNKNOWN: 1, NONE_REQUESTED: 1, OTHER_EDITION: 2, CONFLICT: 3 };
/** Stable preference among candidates: a book/edition match first, a conflict last. Does not remove anyone. */
export const fitRank = (fit) => RANK[fit] ?? 1;
