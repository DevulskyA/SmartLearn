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
