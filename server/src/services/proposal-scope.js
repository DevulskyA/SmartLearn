// SOURCE SCOPE CONTRACT. Three different things must never be inferred from one another:
//   DOCUMENT_INDEX       what the document contains (every proposal the outline yields)
//   APPROVED_SCOPE       the one unit the student chose: a proposal with its spans (kind CONTENT)
//   AI_PAYLOAD           the exact text handed to a provider
// The payload is built from the approved scope and, before any provider call, re-derived independently from the stored
// pages and compared: payload ⊆ approved scope, or the generation is aborted BEFORE the model is called. The prompt is
// never trusted to limit a payload that is already too big.

export class ScopeViolation extends Error {
  constructor(message) {
    super(message);
    this.code = 'SCOPE_VIOLATION';
  }
}

/** The proposal's spans, or null for a legacy proposal (every character of pages page_start..page_end). */
export function parseSpans(row) {
  if (!row.spans_json) return null;
  try {
    const spans = JSON.parse(row.spans_json);
    return Array.isArray(spans) ? spans : null;
  } catch { return null; }
}

function storedPages(db, userId, sourceId, pageStart, pageEnd) {
  return db.prepare(`
    SELECT page_index AS pageIndex, text FROM source_pages
    WHERE user_id = ? AND source_id = ? AND page_status = 'OK' AND page_index BETWEEN ? AND ?
    ORDER BY page_index
  `).all(userId, sourceId, pageStart, pageEnd);
}

/** Approved text per page: the concatenation (in order) of the approved spans that fall on that page. */
function approvedByPage(row, pages) {
  const textByPage = new Map(pages.map((p) => [p.pageIndex, p.text ?? '']));
  const spans = parseSpans(row);
  const byPage = new Map();
  if (spans === null) {
    for (const [pageIndex, text] of textByPage) byPage.set(pageIndex, text);
    return byPage;
  }
  for (const span of spans) {
    const text = textByPage.get(span.pageIndex);
    if (text === undefined) continue;
    const slice = text.slice(span.start, span.end);
    byPage.set(span.pageIndex, byPage.has(span.pageIndex) ? `${byPage.get(span.pageIndex)}\n${slice}` : slice);
  }
  return byPage;
}

/** The segments (one per page, in order) a provider may receive for this proposal. */
export function segmentsForProposal(db, userId, row) {
  const pages = storedPages(db, userId, row.source_id, row.page_start, row.page_end);
  const byPage = approvedByPage(row, pages);
  return [...byPage].filter(([, text]) => text.length > 0).sort((a, b) => a[0] - b[0]).map(([pageIndex, text]) => ({ pageIndex, text }));
}

/**
 * Proves payload ⊆ approved scope. Re-reads the stored pages (it does not trust the segments it is given) and fails on:
 * a page outside the approved range, text that is not exactly the approved text of its page, or more characters than the
 * approved scope holds. Returns the numbers that are recorded with the draft.
 */
export function assertPayloadWithinScope(db, userId, row, payloadSegments) {
  const pages = storedPages(db, userId, row.source_id, row.page_start, row.page_end);
  const approved = approvedByPage(row, pages);
  const sourceChars = [...approved.values()].reduce((n, t) => n + t.length, 0);
  let payloadChars = 0;
  for (const segment of payloadSegments) {
    if (!approved.has(segment.pageIndex)) {
      throw new ScopeViolation(`O texto enviado ao modelo inclui a página ${segment.pageIndex}, fora do trecho aprovado (${row.page_start}–${row.page_end}). Nada foi enviado.`);
    }
    if (segment.text !== approved.get(segment.pageIndex)) {
      throw new ScopeViolation(`O texto da página ${segment.pageIndex} enviado ao modelo difere do trecho aprovado. Nada foi enviado.`);
    }
    payloadChars += segment.text.length;
  }
  if (payloadChars > sourceChars) {
    throw new ScopeViolation(`O texto enviado ao modelo (${payloadChars} caracteres) é maior que o trecho aprovado (${sourceChars}). Nada foi enviado.`);
  }
  return { sourceChars, payloadChars, pages: [...new Set(payloadSegments.map((s) => s.pageIndex))].sort((a, b) => a - b) };
}
