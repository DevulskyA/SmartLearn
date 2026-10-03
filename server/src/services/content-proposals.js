import { listPages } from './source-extraction.js';
import { planUnits, readableTitle, acronymsIn } from './outline-units.js';
import { planSectionUnits, findTopicSections, textOfSpans } from './section-spans.js';
import { classifyUnit } from './unit-kind.js';
import { segmentsForProposal, parseSpans } from './proposal-scope.js';

export class ProposalError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const DEFAULT_MAX_PAGES_PER_CHUNK = 10;
// A chunk must always be draftable: it closes early when the next page would push its text past this size
// (kept under the draft input limit, config.aiMaxInputChars = 50_000 by default). One page above the limit still
// becomes its own chunk — pages are never dropped.
const DEFAULT_MAX_CHARS_PER_CHUNK = 45_000;
const EXCERPT_LENGTH = 200;
// Headings read from font sizes can be very fine (a slide per heading): those units are merged up to this size.
const DEFAULT_MIN_CHARS_PER_DETECTED_UNIT = 3500;

function findOwnedSource(db, userId, sourceId) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
}

function findOwnedProposal(db, userId, proposalId) {
  return db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
}

/** The proposal's approved source text: its spans (or, for a legacy proposal, every page of its range), unmodified. Computed
 * live from source_pages, never duplicated into content_proposals, so the source stays the one place that text is stored. */
function proposalText(db, userId, row) {
  return segmentsForProposal(db, userId, row).map((s) => s.text).join('\n\n');
}

// SMARTLEARN_PRODUCT_FIRST_V1 Slice 4/5: found doing a real manual
// journey — the default proposal title (and therefore, if never
// manually edited, the study unit's own title later) was the RAW
// uploaded filename including its extension, e.g. "insuficiencia-
// cardiaca.pdf — páginas 1-3". A raw filename as the first thing a
// student sees on their study screen reads as unfinished. Still fully
// editable either way (this only changes the DEFAULT).
function stripKnownExtension(filename) {
  return filename.replace(/\.(pdf|PDF)$/, '');
}

function defaultTitle(source, pageStart, pageEnd) {
  const range = pageStart === pageEnd ? `página ${pageStart}` : `páginas ${pageStart}-${pageEnd}`;
  return `${stripKnownExtension(source.original_name)} — ${range}`;
}

function proposalChars(db, userId, row) {
  const spans = parseSpans(row);
  if (spans) return spans.reduce((n, sp) => n + (sp.end - sp.start), 0);
  return db.prepare(`
    SELECT COALESCE(SUM(LENGTH(text)), 0) AS n FROM source_pages
    WHERE user_id = ? AND source_id = ? AND page_status = 'OK' AND page_index BETWEEN ? AND ?
  `).get(userId, row.source_id, row.page_start, row.page_end).n;
}

function toSummaryDto(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind ?? 'CONTENT',
    generatable: (row.kind ?? 'CONTENT') === 'CONTENT',
    topic: row.topic ?? null,
  };
}

/**
 * Chunks an already-extracted source's pages into inspectable proposals of
 * up to `maxPagesPerChunk` pages each (design.md §8: "default maximum of
 * 10 pages" — a provisional chunking heuristic, not an assertion of
 * optimal learning). Sequential by page order: chunk boundaries partition
 * EVERY page exactly once, so no page is ever silently dropped. Re-running
 * this on the same source replaces its prior chunking wholesale (a
 * derived projection over source_pages, not itself historical fact) —
 * any proposal a user had already retitled is superseded, which is
 * intentional: a stale chunking scheme should not linger next to a fresh
 * one for the same source.
 */
export function chunkSource(db, userId, sourceId, { maxPagesPerChunk = DEFAULT_MAX_PAGES_PER_CHUNK, maxCharsPerChunk = DEFAULT_MAX_CHARS_PER_CHUNK, discardDrafts = false, minCharsPerDetectedUnit = DEFAULT_MIN_CHARS_PER_DETECTED_UNIT } = {}) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new ProposalError('NOT_FOUND', 'Fonte não encontrada.');
  if (source.extraction_status !== 'EXTRACTED') {
    throw new ProposalError('NOT_EXTRACTED', 'A fonte precisa ser extraída com sucesso antes de gerar propostas.');
  }

  // Only pages with usable text become proposals. An EMPTY/FAILED page keeps its diagnosis in source_pages
  // (and stays visible to the student) but is never study material or model input.
  const pages = listPages(db, userId, sourceId).filter((p) => p.pageStatus === 'OK');
  if (pages.length === 0) {
    throw new ProposalError('NOT_EXTRACTED', 'A fonte não tem nenhuma página com texto utilizável.');
  }

  // P1_PRODUCT B (found during PRODUCT-REAL-01): re-chunking a source
  // always deleted its prior content_proposals rows wholesale (see the
  // transaction below) -- if one of those proposals already had an
  // ACCEPTED draft pointing at it, that DELETE hit generated_drafts'
  // (user_id, proposal_id) foreign key and crashed with an unhandled
  // 500 "INTERNAL". Fail closed with an explicit, orientable error
  // instead -- re-chunking a source with no accepted content yet is
  // completely unaffected (proven by the existing "re-chunking a source
  // replaces its prior proposals wholesale" test).
  const hasAcceptedDraft = db.prepare(`
    SELECT 1 FROM generated_drafts
    WHERE user_id = ? AND status = 'ACCEPTED'
      AND proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?)
    LIMIT 1
  `).get(userId, userId, sourceId);
  if (hasAcceptedDraft) {
    throw new ProposalError(
      'HAS_ACCEPTED_CONTENT',
      'Esta fonte já tem conteúdo aceito a partir de uma proposta anterior. Conteúdo aceito nunca é apagado nem reprocessado; os trechos existentes continuam disponíveis em Materiais.',
    );
  }

  // A draft that is not accepted yet still hangs on its proposal (same foreign key). Re-chunking would
  // discard it, so that is only ever done on an explicit request, and only for unaccepted drafts.
  const pendingDrafts = db.prepare(`
    SELECT COUNT(*) AS n FROM generated_drafts
    WHERE user_id = ? AND status <> 'ACCEPTED'
      AND proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?)
  `).get(userId, userId, sourceId).n;
  if (pendingDrafts > 0 && !discardDrafts) {
    throw new ProposalError(
      'HAS_EXISTING_DRAFT',
      `Esta fonte já tem ${pendingDrafts} rascunho(s) ainda não aceito(s). Reprocessar os trechos os descartaria, então nada foi alterado. Continue pelos trechos existentes ou confirme o descarte.`,
    );
  }

  // Units follow the document's own structure when it has one (its outline); page count and size are only safety bounds.
  const outline = db.prepare('SELECT level, title, page_index AS pageIndex, detected FROM source_outline WHERE user_id = ? AND source_id = ? ORDER BY ordinal').all(userId, sourceId);
  const bounds = { maxPages: maxPagesPerChunk, maxChars: maxCharsPerChunk, minChars: outline.some((e) => e.detected) ? minCharsPerDetectedUnit : 0 };
  // With a structure the units are cut at the real heading positions (spans); without one, page-bounded safety chunks.
  const chunks = outline.length > 0
    ? planSectionUnits(pages.map((p) => ({ pageIndex: p.pageIndex, text: p.text ?? '' })), outline, bounds)
    : planUnits(pages.map((p) => ({ pageIndex: p.pageIndex, chars: (p.text ?? '').length })), outline, bounds);
  const pageTextByIndex = new Map(pages.map((p) => [p.pageIndex, p.text ?? '']));

  // The book's outline is often in capitals; a unit title reads like a title, keeping the document's own acronyms.
  const acronyms = acronymsIn(pages.map((p) => p.text ?? ''));

  const now = new Date().toISOString();
  const run = db.transaction(() => {
    if (pendingDrafts > 0) {
      db.prepare(`
        DELETE FROM generated_drafts
        WHERE user_id = ? AND status <> 'ACCEPTED'
          AND proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?)
      `).run(userId, userId, sourceId);
    }
    db.prepare('DELETE FROM content_proposals WHERE user_id = ? AND source_id = ?').run(userId, sourceId);
    const insert = db.prepare(`
      INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at, spans_json, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    chunks.forEach((chunk, index) => {
      const title = chunk.title ? readableTitle(chunk.title, acronyms) : defaultTitle(source, chunk.pageStart, chunk.pageEnd);
      const text = chunk.spans ? textOfSpans(pageTextByIndex, chunk.spans) : '';
      const { kind } = classifyUnit(chunk.title ?? null, text);
      insert.run(userId, sourceId, index, chunk.pageStart, chunk.pageEnd, title.slice(0, 300), now, now, chunk.spans ? JSON.stringify(chunk.spans) : null, kind);
    });
  });
  run();

  return listProposals(db, userId, sourceId);
}

function outlineAndPages(db, userId, sourceId) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new ProposalError('NOT_FOUND', 'Fonte não encontrada.');
  if (source.extraction_status !== 'EXTRACTED') {
    throw new ProposalError('NOT_EXTRACTED', 'A fonte precisa ser extraída com sucesso antes de buscar um assunto.');
  }
  const pages = listPages(db, userId, sourceId).filter((p) => p.pageStatus === 'OK').map((p) => ({ pageIndex: p.pageIndex, text: p.text ?? '' }));
  const outline = db.prepare('SELECT ordinal, level, title, page_index AS pageIndex, detected FROM source_outline WHERE user_id = ? AND source_id = ? ORDER BY ordinal').all(userId, sourceId);
  return { source, pages, outline };
}

const SECTION_EXCERPT = 160;

/**
 * "O que você quer estudar?": the few sections of the document whose heading matches the words typed, each with the exact
 * source text it would own. Nothing is created and nothing is sent anywhere: this only locates candidates.
 */
export function searchTopics(db, userId, sourceId, query) {
  if (typeof query !== 'string' || query.trim().length < 2) {
    throw new ProposalError('VALIDATION_FAILED', 'Informe ao menos duas letras do assunto.', 'q');
  }
  const { pages, outline } = outlineAndPages(db, userId, sourceId);
  const pageText = new Map(pages.map((p) => [p.pageIndex, p.text]));
  return findTopicSections(pages, outline, query).map((m) => {
    const text = textOfSpans(pageText, m.spans);
    const { kind, generatable } = classifyUnit(m.title, text);
    return {
      ordinal: m.ordinal,
      title: m.title,
      level: m.level,
      pageStart: m.pageStart,
      pageEnd: m.pageEnd,
      chars: m.chars,
      kind,
      generatable,
      exact: m.exact,
      excerpt: text.slice(0, SECTION_EXCERPT),
    };
  });
}

function insertApprovedScope(db, userId, source, { title, topic, spans, kind }) {
  const pagesTouched = spans.map((s) => s.pageIndex);
  const pageStart = Math.min(...pagesTouched);
  const pageEnd = Math.max(...pagesTouched);
  const spansJson = JSON.stringify(spans);
  const existing = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? AND spans_json = ?').get(userId, source.id, spansJson);
  if (existing) return toDetail(db, userId, existing);
  const now = new Date().toISOString();
  const next = db.prepare('SELECT COALESCE(MAX(chunk_index), -1) + 1 AS n FROM content_proposals WHERE user_id = ? AND source_id = ?').get(userId, source.id).n;
  const id = db.prepare(`
    INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at, spans_json, kind, topic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, source.id, next, pageStart, pageEnd, title.slice(0, 300), now, now, spansJson, kind, topic ?? null).lastInsertRowid;
  return toDetail(db, userId, findOwnedProposal(db, userId, id));
}

function toDetail(db, userId, row) {
  return { ...toSummaryDto(row), excerpt: proposalText(db, userId, row), chars: proposalChars(db, userId, row), spans: parseSpans(row) };
}

/**
 * The student APPROVES a scope: either a located section (`ordinal`, from searchTopics) or an explicit range of pages with
 * optional character offsets inside the first and last page. The result is an ordinary proposal whose spans are the ONLY
 * text a provider will ever receive for it. Approving the same scope twice returns the same proposal.
 */
export function approveScope(db, userId, sourceId, { ordinal, range, title, topic } = {}) {
  const { source, pages, outline } = outlineAndPages(db, userId, sourceId);
  const pageText = new Map(pages.map((p) => [p.pageIndex, p.text]));

  if (Number.isInteger(ordinal)) {
    const entry = outline.find((e) => e.ordinal === ordinal);
    if (!entry) throw new ProposalError('NOT_FOUND', 'Seção não encontrada neste documento.', 'ordinal');
    const match = findTopicSections(pages, outline, entry.title, { limit: 50 }).find((m) => m.ordinal === ordinal);
    if (!match) throw new ProposalError('NOT_FOUND', 'Esta seção não tem texto utilizável.', 'ordinal');
    const { kind } = classifyUnit(match.title, textOfSpans(pageText, match.spans));
    const acronyms = acronymsIn(pages.map((p) => p.text));
    return insertApprovedScope(db, userId, source, { title: readableTitle(match.title, acronyms), topic: topic ?? match.title, spans: match.spans, kind });
  }

  if (range && Number.isInteger(range.pageStart) && Number.isInteger(range.pageEnd)) {
    const { pageStart, pageEnd } = range;
    if (pageEnd < pageStart) throw new ProposalError('VALIDATION_FAILED', 'A página final vem antes da inicial.', 'range');
    const inRange = pages.filter((p) => p.pageIndex >= pageStart && p.pageIndex <= pageEnd);
    if (inRange.length === 0) throw new ProposalError('VALIDATION_FAILED', 'Nenhuma página com texto neste intervalo.', 'range');
    const first = inRange[0];
    const last = inRange[inRange.length - 1];
    const startOffset = range.startOffset ?? 0;
    const endOffset = range.endOffset ?? last.text.length;
    if (!Number.isInteger(startOffset) || startOffset < 0 || startOffset >= first.text.length) throw new ProposalError('VALIDATION_FAILED', 'Posição inicial fora da página.', 'startOffset');
    if (!Number.isInteger(endOffset) || endOffset <= 0 || endOffset > last.text.length) throw new ProposalError('VALIDATION_FAILED', 'Posição final fora da página.', 'endOffset');
    const spans = inRange.map((p) => ({
      pageIndex: p.pageIndex,
      start: p === first ? startOffset : 0,
      end: p === last ? endOffset : p.text.length,
    })).filter((s) => s.end > s.start);
    if (spans.length === 0) throw new ProposalError('VALIDATION_FAILED', 'O intervalo escolhido não contém texto.', 'range');
    const chosenTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : defaultTitle(source, pageStart, pageEnd);
    const { kind } = classifyUnit(chosenTitle, textOfSpans(pageText, spans));
    return insertApprovedScope(db, userId, source, { title: chosenTitle, topic: topic ?? chosenTitle, spans, kind });
  }

  throw new ProposalError('VALIDATION_FAILED', 'Informe a seção (ordinal) ou o intervalo de páginas (range).', 'scope');
}

export function listProposals(db, userId, sourceId) {
  if (!findOwnedSource(db, userId, sourceId)) throw new ProposalError('NOT_FOUND', 'Fonte não encontrada.');
  const rows = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? ORDER BY chunk_index').all(userId, sourceId);
  return rows.map((row) => ({
    ...toSummaryDto(row),
    excerpt: proposalText(db, userId, row).slice(0, EXCERPT_LENGTH),
    chars: proposalChars(db, userId, row),
  }));
}

/** Full inspection detail: the proposal's ENTIRE source excerpt (not
 * truncated), so a user can review exactly what a future unit would be
 * attributable to before anything is created (AC-19/AC-21). */
export function getProposal(db, userId, proposalId) {
  const row = findOwnedProposal(db, userId, proposalId);
  if (!row) throw new ProposalError('NOT_FOUND', 'Proposta não encontrada.');
  return {
    ...toSummaryDto(row),
    excerpt: proposalText(db, userId, row),
    chars: proposalChars(db, userId, row),
    spans: parseSpans(row),
  };
}

/** Manual correction before acceptance — only the title is editable here;
 * the page range is a structural fact about the source, not something a
 * caller can redefine after the fact (re-run chunkSource for that). */
export function renameProposal(db, userId, proposalId, title) {
  const row = findOwnedProposal(db, userId, proposalId);
  if (!row) throw new ProposalError('NOT_FOUND', 'Proposta não encontrada.');
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new ProposalError('VALIDATION_FAILED', 'O título não pode ser vazio.', 'title');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE content_proposals SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(title.trim(), now, userId, proposalId);
  return getProposal(db, userId, proposalId);
}
