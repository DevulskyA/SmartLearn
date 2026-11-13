// CATALOG, step 2: may what was made from one edition be reused for another? This is the gate, in front of resolveNeed(): a title or a page number
// that merely coincides is NEVER enough. Pure functions over plain objects (identifications and a verified content map), no I/O.
//
//   SAME_FILE     identical checksum                                          -> reuse
//   SAME_EDITION  same ISBN-13 (a different file of the same edition)         -> reuse, pages may differ, citations must be re-resolved
//   MAPPED        a VERIFIED chapter correspondence between the two editions  -> reuse only the mapped content
//   NO_PROOF      same title, same page count, same year... but nothing verified -> do NOT reuse (generate, or ask for verification)
//
// A mapping is `{ fromEdition, toEdition, verified:boolean, entries:[{ fromTitleKey, toTitleKey, fromPages:[a,b], toPages:[a,b], relation }] }`
// with relation EQUIVALENT | REVISED | REMOVED | NEW. Only verified EQUIVALENT entries carry content over; REVISED needs regeneration.

const sameIsbn = (a, b) => a.isbns.some((i) => b.isbns.includes(i));

/** Do two identified files belong together as the same edition? Never from title/year/pages alone. */
export function sameEditionVerdict(a, b, { sameChecksum = false } = {}) {
  if (sameChecksum) return { relation: 'SAME_FILE', reuse: true };
  if (sameIsbn(a, b)) return { relation: 'SAME_EDITION', reuse: true, recheckCitations: true };
  return { relation: 'NO_PROOF', reuse: false, hint: a.titleKey && a.titleKey === b.titleKey ? 'SAME_TITLE_ONLY' : 'DIFFERENT' };
}

/** Pick the content to carry from an older edition into the one now studied, using a verified map. */
export function reusableAcrossEditions(wanted, mapping) {
  if (!mapping || mapping.verified !== true) return { reuse: false, reason: 'MAPPING_NOT_VERIFIED' };
  const entry = mapping.entries.find((e) => e.toTitleKey === wanted.titleKey && overlaps(e.toPages, wanted.pages));
  if (!entry) return { reuse: false, reason: 'NOT_IN_MAP' };
  if (entry.relation === 'EQUIVALENT') return { reuse: true, relation: 'EQUIVALENT', from: { titleKey: entry.fromTitleKey, pages: entry.fromPages } };
  return { reuse: false, relation: entry.relation, reason: entry.relation === 'REVISED' ? 'CONTENT_CHANGED_REGENERATE' : 'NO_COUNTERPART' };
}
const overlaps = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] <= b[1] && b[0] <= a[1];

/** When several editions could answer, the newest one WITH a validated match; an unvalidated newer edition never wins by being newer. */
export function preferEdition(candidates) {
  const ok = candidates.filter((c) => c.validated === true);
  if (ok.length === 0) return null;
  return ok.reduce((best, c) => ((c.year ?? 0) > (best.year ?? 0) ? c : best));
}

/** Which edition the student must be told about when the source used differs from the file they uploaded. */
export function sourceNotice(uploaded, used) {
  if (!used || (used.isbns?.length && sameIsbn(uploaded, used))) return null;
  return { uploadedYear: uploaded.year ?? null, usedYear: used.year ?? null, usedEdition: used.editionNumber ?? null };
}
