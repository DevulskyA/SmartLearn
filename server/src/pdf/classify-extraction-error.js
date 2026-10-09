// T35: pure mapping from a pdf.js parse error to one of our own explicit
// extraction statuses. Kept separate from the worker so it is directly
// unit-testable with synthetic errors -- constructing a real,
// genuinely-encrypted PDF fixture (correct RC4/AES per the PDF spec) is
// out of proportion to what this mapping itself needs to prove.
export function classifyExtractionError(err) {
  const name = err && err.name;
  if (name === 'PasswordException') return 'ENCRYPTED';
  if (name === 'InvalidPDFException') return 'EXTRACTION_FAILED';
  return 'EXTRACTION_FAILED';
}

/**
 * C5 (audit): rolls up a document's overall extraction status from its
 * PER-PAGE outcomes. Kept as a small pure function, separate from
 * extract-worker.js's actual pdf.js calls, so the decision rule itself is
 * directly unit-testable against synthetic page-status arrays -- real
 * pdf.js is deliberately lenient (a security property) and does not throw
 * for most malformed content, making a genuine per-page FAILED outcome
 * hard to reproduce with a hand-built fixture; this function's own
 * correctness does not depend on succeeding at that.
 *
 * "Existe algum texto" is deliberately not the bar: a document with at
 * least one OK page is EXTRACTED (usable) even if other pages are EMPTY
 * or FAILED alongside it -- an independently-usable part is never held
 * hostage by an unrelated failure elsewhere in the same document.
 */
export function rollUpExtractionStatus(pages) {
  const hasOk = pages.some((p) => p.status === 'OK');
  if (hasOk) return 'EXTRACTED';
  const hasEmpty = pages.some((p) => p.status === 'EMPTY');
  if (hasEmpty) return 'IMAGE_ONLY_OR_UNREADABLE';
  return 'EXTRACTION_FAILED';
}
