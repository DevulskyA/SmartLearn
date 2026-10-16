import { createHash } from 'node:crypto';
import { get as getSettings } from './settings.js';

export class AgendaSnapshotError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// Owned pending (not yet completed) review tasks with just enough joined
// context to render an agenda entry offline. Deliberately excludes
// source_text/summary_body (T39: "minimal display records", no reason for
// an offline cache to carry full unit content). completed_at IS NULL means
// this already covers overdue + today + every known future task — the
// client buckets by comparing dueDate against ITS OWN current date, since
// a device that resumes offline days later cannot trust a server-computed
// "today" anyway.
const PENDING_SELECT = `
  SELECT rt.id, rt.unit_id, rt.offset_days, rt.due_date, lu.title, lu.subject_id, s.name as subject_name
  FROM review_tasks rt
  JOIN learning_units lu ON lu.user_id = rt.user_id AND lu.id = rt.unit_id
  JOIN subjects s ON s.user_id = rt.user_id AND s.id = lu.subject_id
  WHERE rt.user_id = ? AND rt.completed_at IS NULL
  ORDER BY rt.due_date ASC, rt.id ASC
`;

function itemDto(row) {
  return {
    reviewTaskId: row.id,
    unitId: row.unit_id,
    unitTitle: row.title,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    dueDate: row.due_date,
    offsetDays: row.offset_days,
  };
}

/**
 * Identifies "the same generation" of the pending set across paged HTTP
 * requests. A page fetched with a stale/mismatched revision must be
 * rejected (AgendaSnapshotError('REVISION_CHANGED')) rather than silently
 * mixed with a newer page — the client relies on this to only ever swap in
 * a COMPLETE, internally-consistent generation (AC-22), never a franken-set
 * spliced from two different moments in time.
 *
 * `rows` is the full ordered (due_date ASC, id ASC) array of currently
 * pending review_task rows for one user. Hashing the ordered id sequence
 * (not row count, not max id) catches every membership OR ordering change —
 * insert, complete, reopen — while staying identical across two reads of
 * an unchanged set.
 */
export function computeDataRevision(rows) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(`${row.id}:${row.due_date};`);
  return hash.digest('hex');
}

/**
 * Returns one page of the caller's current pending-agenda generation.
 * First call: omit cursor/revision. To fetch the next page, pass back the
 * `nextCursor` and `dataRevision` from the previous page's response — if
 * the underlying set changed in between (revision mismatch, or the cursor
 * task is no longer pending), this throws REVISION_CHANGED so the caller
 * restarts from page one instead of stitching together an inconsistent view.
 */
export function getSnapshotPage(db, userId, { cursor, revision, limit } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows = db.prepare(PENDING_SELECT).all(userId);
  const dataRevision = computeDataRevision(rows);

  let startIndex = 0;
  if (cursor !== undefined) {
    if (revision !== dataRevision) {
      throw new AgendaSnapshotError('REVISION_CHANGED', 'A geração da agenda mudou; reinicie a paginação a partir da primeira página.');
    }
    const idx = rows.findIndex((r) => r.id === cursor);
    if (idx === -1) {
      throw new AgendaSnapshotError('REVISION_CHANGED', 'Cursor inválido para a geração atual.');
    }
    startIndex = idx + 1;
  }

  const page = rows.slice(startIndex, startIndex + pageSize);
  const nextCursor = startIndex + pageSize < rows.length ? page[page.length - 1].id : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    dataRevision,
    timezone: getSettings(db, userId).timezone,
    items: page.map(itemDto),
    nextCursor,
  };
}
