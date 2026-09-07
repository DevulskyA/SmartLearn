import { listPages } from './source-extraction.js';

export class ProposalError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const DEFAULT_MAX_PAGES_PER_CHUNK = 10;
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
    WHERE user_id = ? AND source_id = ? AND page_index BETWEEN ? AND ?
    ORDER BY page_index
  `).all(userId, sourceId, pageStart, pageEnd);
  return rows.map((r) => r.text).join('\n\n');
}

function defaultTitle(source, pageStart, pageEnd) {
  const range = pageStart === pageEnd ? `página ${pageStart}` : `páginas ${pageStart}-${pageEnd}`;
  return `${source.original_name} — ${range}`;
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
export function chunkSource(db, userId, sourceId, { maxPagesPerChunk = DEFAULT_MAX_PAGES_PER_CHUNK } = {}) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new ProposalError('NOT_FOUND', 'Fonte não encontrada.');
  if (source.extraction_status !== 'EXTRACTED') {
    throw new ProposalError('NOT_EXTRACTED', 'A fonte precisa ser extraída com sucesso antes de gerar propostas.');
  }

  const pages = listPages(db, userId, sourceId);
  if (pages.length === 0) {
    throw new ProposalError('NOT_EXTRACTED', 'A fonte não tem páginas extraídas.');
  }

  const chunks = [];
  for (let i = 0; i < pages.length; i += maxPagesPerChunk) {
    const slice = pages.slice(i, i + maxPagesPerChunk);
    chunks.push({ pageStart: slice[0].pageIndex, pageEnd: slice[slice.length - 1].pageIndex });
  }

  const now = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare('DELETE FROM content_proposals WHERE user_id = ? AND source_id = ?').run(userId, sourceId);
    const insert = db.prepare(`
      INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    chunks.forEach((chunk, index) => {
      insert.run(userId, sourceId, index, chunk.pageStart, chunk.pageEnd, defaultTitle(source, chunk.pageStart, chunk.pageEnd), now, now);
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
