import { listPages } from './source-extraction.js';
import { dm, splitMessage } from '../api-error-messages.js';
import { planUnits, readableTitle, acronymsIn } from './outline-units.js';
import { planSectionUnits, findTopicSections, textOfSpans } from './section-spans.js';
import { classifyUnit, effectiveKind } from './unit-kind.js';
import { segmentsForProposal, parseSpans } from './proposal-scope.js';
import { activeJobOfProposals } from './generation-jobs.js';
import { cleanSourceTitle, displayProposalTitle } from './source-title.js';
import { pdfPageOfPrinted, printedOfPdfPage } from '../../../shared/page-numbering.js';
import { MAX_PAGES_PER_LESSON, pageCountOf, findPageConflict } from '../../../shared/lesson-limits.js';

export class ProposalError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
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
// editable either way (this only changes the DEFAULT). The name is now also cleaned
// of site tags and format words by cleanSourceTitle (source-title.js).

function defaultTitle(source, pageStart, pageEnd) {
  const range = pageStart === pageEnd ? `página ${pageStart}` : `páginas ${pageStart}-${pageEnd}`;
  return `${cleanSourceTitle(source.original_name)} — ${range}`;
}

function proposalChars(db, userId, row) {
  const spans = parseSpans(row);
  if (spans) return spans.reduce((n, sp) => n + (sp.end - sp.start), 0);
  return db.prepare(`
    SELECT COALESCE(SUM(LENGTH(text)), 0) AS n FROM source_pages
    WHERE user_id = ? AND source_id = ? AND page_status = 'OK' AND page_index BETWEEN ? AND ?
  `).get(userId, row.source_id, row.page_start, row.page_end).n;
}

/**
 * The newest draft of each proposal of a source (id, status, revision), so the student can reopen it instead of generating again.
 * `acceptedUnitId` is the lesson an ACCEPTED draft became, and only while that lesson still exists (null otherwise), so a link to it is trustworthy.
 * A draft that only adds questions to an existing lesson (target_unit_id) is never "the newest draft": it is reported as the lesson's
 * `lessonQuestions` instead -- AVAILABLE (a lesson accepted as a summary only, still without exercises) or IN_REVIEW (the draft to open).
 */
function latestDraftsByProposal(db, userId, sourceId) {
  const rows = db.prepare(`
    SELECT d.proposal_id AS proposalId, d.id, d.status, d.revision, u.id AS acceptedUnitId, d.draft_json AS draftJson,
           (SELECT COUNT(*) FROM exercises e WHERE e.user_id = d.user_id AND e.unit_id = u.id) AS exerciseCount,
           (SELECT q.id FROM generated_drafts q WHERE q.user_id = d.user_id AND q.target_unit_id = u.id AND q.status = 'DRAFT') AS questionsDraftId
    FROM generated_drafts d
    LEFT JOIN learning_units u ON u.user_id = d.user_id AND u.id = d.accepted_unit_id
    WHERE d.user_id = ? AND d.target_unit_id IS NULL AND d.proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?)
    ORDER BY d.id ASC
  `).all(userId, userId, sourceId);
  return new Map(rows.map((r) => [r.proposalId, {
    id: r.id, status: r.status, revision: r.revision, acceptedUnitId: r.acceptedUnitId ?? null,
    lessonQuestions: lessonQuestionsState(r),
  }]));
}

/** What the student can do about the questions of an accepted lesson (see latestDraftsByProposal); null when nothing applies. */
function lessonQuestionsState(r) {
  if (r.status !== 'ACCEPTED' || r.acceptedUnitId == null) return null;
  if (r.questionsDraftId != null) return { state: 'IN_REVIEW', draftId: r.questionsDraftId };
  if (r.exerciseCount > 0) return null;
  try {
    return JSON.parse(r.draftJson).questionsDeferred === true ? { state: 'AVAILABLE', draftId: null } : null;
  } catch { return null; }
}

function toSummaryDto(row, latestDraft = null) {
  return {
    latestDraft,
    id: row.id,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: effectiveKind(row),
    generatable: effectiveKind(row) === 'CONTENT',
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
  if (!source) throw new ProposalError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  if (source.extraction_status !== 'EXTRACTED') {
    throw new ProposalError('NOT_EXTRACTED', dm('PROPOSAL_SOURCE_NOT_EXTRACTED'));
  }

  // Only pages with usable text become proposals. An EMPTY/FAILED page keeps its diagnosis in source_pages
  // (and stays visible to the student) but is never study material or model input.
  const pages = listPages(db, userId, sourceId).filter((p) => p.pageStatus === 'OK');
  if (pages.length === 0) {
    throw new ProposalError('NOT_EXTRACTED', dm('PROPOSAL_NO_USABLE_PAGE'));
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

  // A generation job that is still active hangs on one of these proposals (a running provider, or one about to start). Cutting the
  // source again would delete the proposal under it, so nothing changes until the student cancels or the job ends.
  const sourceProposalIds = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?').all(userId, sourceId).map((r) => r.id);
  if (activeJobOfProposals(db, userId, sourceProposalIds)) {
    throw new ProposalError(
      'GENERATION_IN_PROGRESS',
      'Há uma geração em andamento para um trecho desta fonte. Cancele-a (ou espere terminar) antes de reprocessar os trechos. Nada foi alterado.',
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
      // A finished job remembers its draft; the draft is about to be discarded, the job stays as history without the pointer.
      db.prepare(`
        UPDATE generation_jobs SET draft_id = NULL
        WHERE user_id = ? AND draft_id IN (
          SELECT id FROM generated_drafts
          WHERE user_id = ? AND status <> 'ACCEPTED'
            AND proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?))
      `).run(userId, userId, userId, sourceId);
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
  if (!source) throw new ProposalError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  if (source.extraction_status !== 'EXTRACTED') {
    throw new ProposalError('NOT_EXTRACTED', dm('TOPIC_SOURCE_NOT_EXTRACTED'));
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
    throw new ProposalError('VALIDATION_FAILED', dm('TOPIC_QUERY_TOO_SHORT'), 'q');
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

/** One lesson never holds more than a class of ~2 h: above the cap the student splits the book into parts. */
function assertWithinLessonCap(pageStart, pageEnd, field) {
  const count = pageCountOf(pageStart, pageEnd);
  if (count > MAX_PAGES_PER_LESSON) throw new ProposalError('VALIDATION_FAILED', dm('LESSON_TOO_MANY_PAGES', { count, max: MAX_PAGES_PER_LESSON }), field);
}

/** Lessons of the same book never repeat pages: only ONE boundary page may be shared (the subject changes in the middle of it). */
function assertPagesNotAlreadyAdded(db, userId, source, pageStart, pageEnd, numbering) {
  // "Added" = a lesson is being or was made from those pages (a live or accepted draft). A suggestion nobody used (the automatic slices of a
  // PDF with an outline, or a scope approved and never generated) does not block the pages: the student may still choose any range.
  const others = db.prepare(`
    SELECT p.title, p.page_start AS pageStart, p.page_end AS pageEnd FROM content_proposals p
    WHERE p.user_id = ? AND p.source_id = ? AND p.spans_json IS NOT NULL
      AND EXISTS (SELECT 1 FROM generated_drafts d WHERE d.user_id = p.user_id AND d.proposal_id = p.id AND d.status IN ('DRAFT', 'ACCEPTED'))
  `).all(userId, source.id);
  const clash = findPageConflict({ pageStart, pageEnd }, others);
  if (!clash) return;
  const shown = (pdfPage) => printedOfPdfPage(numbering, pdfPage) ?? pdfPage;
  const from = shown(clash.pageStart);
  const to = shown(clash.pageEnd);
  const pages = from === to ? `A página ${from}` : `As páginas ${from} a ${to}`;
  throw new ProposalError('VALIDATION_FAILED', dm('LESSON_PAGES_ALREADY_ADDED', { pages, title: others[clash.withIndex].title }), 'range');
}

function insertApprovedScope(db, userId, source, { title, topic, spans, kind }, numbering = null) {
  const pagesTouched = spans.map((s) => s.pageIndex);
  const pageStart = Math.min(...pagesTouched);
  const pageEnd = Math.max(...pagesTouched);
  const spansJson = JSON.stringify(spans);
  const existing = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? AND spans_json = ?').get(userId, source.id, spansJson);
  if (existing) return toDetail(db, userId, existing);
  assertPagesNotAlreadyAdded(db, userId, source, pageStart, pageEnd, numbering);
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
export function approveScope(db, userId, sourceId, { ordinal, range, title, topic } = {}, { maxCharsPerChunk = DEFAULT_MAX_CHARS_PER_CHUNK, numbering = null } = {}) {
  const { source, pages, outline } = outlineAndPages(db, userId, sourceId);
  // The student types the numbers printed in the book when the document has them (numbering.mode 'printed'), else the PDF's own.
  if (range && numbering?.mode === 'printed' && Number.isInteger(range.pageStart) && Number.isInteger(range.pageEnd)) {
    const pageStart = pdfPageOfPrinted(numbering, range.pageStart);
    const pageEnd = pdfPageOfPrinted(numbering, range.pageEnd);
    const lastPdfPage = pages.length > 0 ? Math.max(...pages.map((p) => p.pageIndex)) : 0;
    if (pageStart < 1 || pageEnd > lastPdfPage) throw new ProposalError('VALIDATION_FAILED', dm('PAGE_RANGE_OUTSIDE_BOOK', { start: range.pageStart, end: range.pageEnd }), 'range');
    range = { ...range, pageStart, pageEnd };
  }
  const pageText = new Map(pages.map((p) => [p.pageIndex, p.text]));

  if (Number.isInteger(ordinal)) {
    return approveOrdinalScope(db, userId, source, pages, outline, pageText, ordinal, topic, numbering);
  }

  if (range && Number.isInteger(range.pageStart) && Number.isInteger(range.pageEnd)) {
    return approvePageRange(db, userId, source, pages, pageText, range, title, topic, maxCharsPerChunk, numbering);
  }

  throw new ProposalError('VALIDATION_FAILED', 'Informe a seção (ordinal) ou o intervalo de páginas (range).', 'scope');
}

function approveOrdinalScope(db, userId, source, pages, outline, pageText, ordinal, topic, numbering) {
  const entry = outline.find((item) => item.ordinal === ordinal);
  if (!entry) throw new ProposalError('NOT_FOUND', dm('SECTION_NOT_FOUND'), 'ordinal');
  const match = findTopicSections(pages, outline, entry.title, { limit: 50 }).find((item) => item.ordinal === ordinal);
  if (!match) throw new ProposalError('NOT_FOUND', dm('SECTION_NO_USABLE_TEXT'), 'ordinal');
  const { kind } = classifyUnit(match.title, textOfSpans(pageText, match.spans));
  const acronyms = acronymsIn(pages.map((page) => page.text));
  const sectionPages = match.spans.map((span) => span.pageIndex);
  assertWithinLessonCap(Math.min(...sectionPages), Math.max(...sectionPages), 'ordinal');
  return insertApprovedScope(db, userId, source, {
    title: readableTitle(match.title, acronyms), topic: topic ?? match.title, spans: match.spans, kind,
  }, numbering);
}

/** Consecutive spans grouped so each group stays within the model input limit. A single span above the limit stays alone
 * (its own, later, "text too large" answer): text is never dropped or cut inside a page. */
export function splitSpansByBudget(spans, budget) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const span of spans) {
    const length = span.end - span.start;
    if (current.length > 0 && size + length > budget) { groups.push(current); current = []; size = 0; }
    current.push(span);
    size += length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function approvePageRange(db, userId, source, pages, pageText, range, title, topic, maxCharsPerChunk, numbering) {
  const { pageStart, pageEnd } = range;
  // titles name the pages with the numbers the student knows (the book's when the PDF has them)
  const shown = (pdfPage) => printedOfPdfPage(numbering, pdfPage) ?? pdfPage;
  if (pageEnd < pageStart) throw new ProposalError('VALIDATION_FAILED', dm('PAGE_RANGE_REVERSED'), 'range');
  assertWithinLessonCap(pageStart, pageEnd, 'range');
  const inRange = pages.filter((page) => page.pageIndex >= pageStart && page.pageIndex <= pageEnd);
  if (inRange.length === 0) throw new ProposalError('VALIDATION_FAILED', dm('PAGE_RANGE_NO_TEXT'), 'range');
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const startOffset = range.startOffset ?? 0;
  const endOffset = range.endOffset ?? last.text.length;
  if (!Number.isInteger(startOffset) || startOffset < 0 || startOffset >= first.text.length) throw new ProposalError('VALIDATION_FAILED', dm('OFFSET_START_OUTSIDE'), 'startOffset');
  if (!Number.isInteger(endOffset) || endOffset <= 0 || endOffset > last.text.length) throw new ProposalError('VALIDATION_FAILED', dm('OFFSET_END_OUTSIDE'), 'endOffset');
  const spans = inRange.map((page) => ({
    pageIndex: page.pageIndex,
    start: page === first ? startOffset : 0,
    end: page === last ? endOffset : page.text.length,
  })).filter((span) => span.end > span.start);
  if (spans.length === 0) throw new ProposalError('VALIDATION_FAILED', dm('RANGE_NO_TEXT'), 'range');
  const chosenTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : null;
  const groups = splitSpansByBudget(spans, maxCharsPerChunk);
  if (groups.length === 1) {
    const only = chosenTitle ?? defaultTitle(source, shown(pageStart), shown(pageEnd));
    const { kind } = classifyUnit(only, textOfSpans(pageText, spans));
    return insertApprovedScope(db, userId, source, { title: only, topic: topic ?? only, spans, kind }, numbering);
  }
  // Too much text for one summary: the range becomes consecutive parts that each fit, all created together or not at all.
  const parts = db.transaction(() => groups.map((group, i) => {
    const first = group[0].pageIndex;
    const last = group[group.length - 1].pageIndex;
    const base = chosenTitle ?? defaultTitle(source, shown(first), shown(last));
    const partTitle = chosenTitle ? `${chosenTitle} (parte ${i + 1} de ${groups.length})` : `${base} (parte ${i + 1} de ${groups.length})`;
    const { kind } = classifyUnit(partTitle, textOfSpans(pageText, group));
    return insertApprovedScope(db, userId, source, { title: partTitle, topic: topic ?? partTitle, spans: group, kind }, numbering);
  }))();
  return { ...parts[0], parts };
}

export function listProposals(db, userId, sourceId) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new ProposalError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  const rows = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? ORDER BY chunk_index').all(userId, sourceId);
  const drafts = latestDraftsByProposal(db, userId, sourceId);
  return rows.map((row) => ({
    ...toSummaryDto(row, drafts.get(row.id) ?? null),
    title: displayProposalTitle(row.title, source.original_name),
    excerpt: proposalText(db, userId, row).slice(0, EXCERPT_LENGTH),
    chars: proposalChars(db, userId, row),
  }));
}

/** Full inspection detail: the proposal's ENTIRE source excerpt (not
 * truncated), so a user can review exactly what a future unit would be
 * attributable to before anything is created (AC-19/AC-21). */
export function getProposal(db, userId, proposalId) {
  const row = findOwnedProposal(db, userId, proposalId);
  if (!row) throw new ProposalError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  const source = findOwnedSource(db, userId, row.source_id);
  return {
    ...toSummaryDto(row),
    title: displayProposalTitle(row.title, source?.original_name),
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
  if (!row) throw new ProposalError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new ProposalError('VALIDATION_FAILED', dm('PROPOSAL_TITLE_EMPTY'), 'title');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE content_proposals SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(title.trim(), now, userId, proposalId);
  return getProposal(db, userId, proposalId);
}
