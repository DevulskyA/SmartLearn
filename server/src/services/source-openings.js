import { dm, splitMessage } from '../api-error-messages.js';

const CONTEXTS = new Set(['STUDY', 'REVIEW', 'EDITOR', 'PLAN', 'OTHER']);

export class SourceOpeningError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

/**
 * EXPERIMENTAL return-to-source record: the OBSERVABLE fact that the student opened the original document (optionally at a page). It is not reading,
 * understanding or a correct answer, writes nothing to the learning ledger and creates no evidence. Append-only, owner-controlled, and idempotent per
 * (user, operationKey): delivering the same opening twice stores it once.
 */
export function record(db, userId, { sourceId, pageIndex, context, operationKey } = {}, now = () => new Date()) {
  if (typeof operationKey !== 'string' || operationKey.length < 1 || operationKey.length > 100) throw new SourceOpeningError('VALIDATION_FAILED', 'operationKey é obrigatório.', 'operationKey');
  if (!CONTEXTS.has(context)) throw new SourceOpeningError('VALIDATION_FAILED', 'context não é reconhecido.', 'context');
  const source = db.prepare('SELECT id, page_count FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
  if (!source) throw new SourceOpeningError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  if (pageIndex !== undefined && pageIndex !== null) {
    if (!Number.isInteger(pageIndex) || pageIndex < 1 || (source.page_count && pageIndex > source.page_count)) {
      throw new SourceOpeningError('VALIDATION_FAILED', 'pageIndex deve ser uma página do documento.', 'pageIndex');
    }
  }
  const existing = db.prepare('SELECT * FROM source_openings WHERE user_id = ? AND operation_key = ?').get(userId, operationKey);
  if (existing) return { ...dto(existing), duplicate: true };
  const info = db.prepare('INSERT INTO source_openings (user_id, source_id, page_index, context, opened_at, operation_key) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, sourceId, pageIndex ?? null, context, now().toISOString(), operationKey);
  return { ...dto(db.prepare('SELECT * FROM source_openings WHERE id = ?').get(info.lastInsertRowid)), duplicate: false };
}

export function list(db, userId, { sourceId } = {}) {
  const rows = sourceId === undefined
    ? db.prepare('SELECT * FROM source_openings WHERE user_id = ? ORDER BY id').all(userId)
    : db.prepare('SELECT * FROM source_openings WHERE user_id = ? AND source_id = ? ORDER BY id').all(userId, sourceId);
  return rows.map(dto);
}

function dto(row) {
  return { id: row.id, sourceId: row.source_id, pageIndex: row.page_index, context: row.context, openedAt: row.opened_at };
}
