import { listPages } from './source-extraction.js';
import { planUnits } from './outline-units.js';

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

function findOwnedSource(db, userId, sourceId) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
}

function findOwnedProposal(db, userId, proposalId) {
  return db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
}

/** Concatenates the real, unmodified text of every page in [pageStart,
 * pageEnd] for one source — the proposal's "content" is always computed
 * live from source_pages, never duplicated into content_proposals itself,
 * so the source stays the one place that text is stored. */
function chunkText(db, userId, sourceId, pageStart, pageEnd) {
  const rows = db.prepare(`
    SELECT text FROM source_pages
    WHERE user_id = ? AND source_id = ? AND page_status = 'OK' AND page_index BETWEEN ? AND ?
    ORDER BY page_index
  `).all(userId, sourceId, pageStart, pageEnd);
  return rows.map((r) => r.text).join('\n\n');
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
export function chunkSource(db, userId, sourceId, { maxPagesPerChunk = DEFAULT_MAX_PAGES_PER_CHUNK, maxCharsPerChunk = DEFAULT_MAX_CHARS_PER_CHUNK, discardDrafts = false } = {}) {
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
  const outline = db.prepare('SELECT level, title, page_index AS pageIndex FROM source_outline WHERE user_id = ? AND source_id = ? ORDER BY ordinal').all(userId, sourceId);
  const chunks = planUnits(pages.map((p) => ({ pageIndex: p.pageIndex, chars: (p.text ?? '').length })), outline, { maxPages: maxPagesPerChunk, maxChars: maxCharsPerChunk });

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
      INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    chunks.forEach((chunk, index) => {
      insert.run(userId, sourceId, index, chunk.pageStart, chunk.pageEnd, (chunk.title ?? defaultTitle(source, chunk.pageStart, chunk.pageEnd)).slice(0, 300), now, now);
    });
  });
  run();

  return listProposals(db, userId, sourceId);
}

export function listProposals(db, userId, sourceId) {
  if (!findOwnedSource(db, userId, sourceId)) throw new ProposalError('NOT_FOUND', 'Fonte não encontrada.');
  const rows = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? ORDER BY chunk_index').all(userId, sourceId);
  return rows.map((row) => ({
    ...toSummaryDto(row),
    excerpt: chunkText(db, userId, sourceId, row.page_start, row.page_end).slice(0, EXCERPT_LENGTH),
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
    excerpt: chunkText(db, userId, row.source_id, row.page_start, row.page_end),
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
