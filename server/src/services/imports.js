// T26: owned import preview + proposed ID mapping. Read-only — never
// writes a subject/learningUnit/reviewTask/exercise/learningEvidence row.
// The actual commit (T27, not built yet) is a separate step this module
// does not perform.
import { createHash } from 'node:crypto';
import { normalizeLegacyExport, ImportNormalizationError } from '../../../shared/import-normalization.js';
import { nameKey } from '../../../shared/text-validation.js';

export class ImportError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Same 30-minute convention as T11's reset tokens (server/src/auth/reset-tokens.js).
export const PREVIEW_LIFETIME_MS = 30 * 60 * 1000;

function sourceChecksum(rawSource) {
  // Re-stringifying the exact payload the server received (not trusting a
  // client-supplied hash) is what makes a later tampered resubmission
  // detectable — see verifyPreview().
  return createHash('sha256').update(JSON.stringify(rawSource)).digest('hex');
}

function buildCounts(normalized) {
  return {
    subjects: normalized.subjects.length,
    learningUnits: normalized.learningUnits.length,
    reviewTasks: normalized.reviewTasks.length,
    exercises: normalized.exercises.length,
    learningEvidence: normalized.learningEvidence.length,
  };
}

// Design.md §6: "Nonempty conflicts never overwrite by name." The only
// independent uniqueness constraint in this schema is subjects(user_id,
// name) (T13) — a name collision with an existing ACTIVE owned subject is
// the one real conflict class. Everything else (units/reviewTasks/
// exercises) has no naming constraint of its own; each is proposed to
// CREATE under whichever legacySubjectId it references, and a caller can
// see a unit is effectively unreachable by cross-referencing that
// legacySubjectId against the subject mapping's own CONFLICT entries —
// this task reports the plan, it does not resolve conflicts.
function buildMappingAndConflicts(db, userId, normalized) {
  const existingByKey = new Map(
    db.prepare('SELECT id, name FROM subjects WHERE user_id = ? AND is_active = 1').all(userId)
      .map((row) => [nameKey(row.name), row]),
  );

  const mapping = [];
  const conflicts = [];

  for (const subject of normalized.subjects) {
    const existing = existingByKey.get(nameKey(subject.name));
    if (existing) {
      conflicts.push({ entity: 'subject', legacyId: subject.legacyId, name: subject.name, existingId: existing.id, reason: 'NAME_ALREADY_EXISTS' });
      mapping.push({ entity: 'subject', legacyId: subject.legacyId, action: 'CONFLICT', existingId: existing.id });
    } else {
      mapping.push({ entity: 'subject', legacyId: subject.legacyId, action: 'CREATE' });
    }
  }
  for (const unit of normalized.learningUnits) {
    mapping.push({ entity: 'learningUnit', legacyId: unit.legacyId, legacySubjectId: unit.legacySubjectId, action: 'CREATE' });
  }
  for (const task of normalized.reviewTasks) {
    mapping.push({ entity: 'reviewTask', legacyId: task.legacyId, legacyUnitId: task.legacyUnitId, action: 'CREATE' });
  }
  for (const exercise of normalized.exercises) {
    mapping.push({ entity: 'exercise', legacyId: exercise.legacyId, legacyUnitId: exercise.legacyUnitId, action: 'CREATE' });
  }

  return { mapping, conflicts };
}

function toDto(row) {
  const report = JSON.parse(row.report_json);
  return {
    id: row.id,
    sourceVersion: row.source_version,
    checksum: row.source_checksum,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...report,
  };
}

function findOwned(db, userId, id) {
  return db.prepare('SELECT * FROM import_previews WHERE id = ? AND user_id = ?').get(id, userId);
}

/** Normalizes rawSource, computes its conflict/mapping report against the
 * caller's OWN current active subjects, and persists a time-limited
 * preview row. Re-submitting the exact same bytes by the same owner
 * renews the existing preview (fresh report/expiry) instead of
 * accumulating a duplicate row (UNIQUE(user_id, source_checksum)). */
export function createPreview(db, userId, rawSource, now = new Date()) {
  let normalized;
  try {
    normalized = normalizeLegacyExport(rawSource);
  } catch (err) {
    if (err instanceof ImportNormalizationError) {
      throw new ImportError('INVALID_SOURCE', err.message, { issues: err.issues });
    }
    throw err;
  }

  const checksum = sourceChecksum(rawSource);
  const { mapping, conflicts } = buildMappingAndConflicts(db, userId, normalized);
  const report = { counts: buildCounts(normalized), warnings: normalized.warnings, conflicts, mapping };
  const reportJson = JSON.stringify(report);
  const normalizedJson = JSON.stringify(normalized);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PREVIEW_LIFETIME_MS).toISOString();

  const existing = db.prepare('SELECT id FROM import_previews WHERE user_id = ? AND source_checksum = ?').get(userId, checksum);
  if (existing) {
    db.prepare('UPDATE import_previews SET source_version = ?, normalized_json = ?, report_json = ?, created_at = ?, expires_at = ? WHERE id = ?')
      .run(normalized.sourceVersion, normalizedJson, reportJson, createdAt, expiresAt, existing.id);
    return toDto(findOwned(db, userId, existing.id));
  }

  const result = db.prepare(`
    INSERT INTO import_previews (user_id, source_checksum, source_version, normalized_json, report_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, checksum, normalized.sourceVersion, normalizedJson, reportJson, createdAt, expiresAt);

  return toDto(findOwned(db, userId, result.lastInsertRowid));
}

/** Reads back an owned, unexpired preview report. A foreign id (owned by a
 * different user) is NOT_FOUND, identical to how subjects.js treats a
 * foreign-owned id — existence is never confirmed to a non-owner. */
export function getPreview(db, userId, id, now = new Date()) {
  const row = findOwned(db, userId, id);
  if (!row) throw new ImportError('NOT_FOUND', 'Prévia de importação não encontrada.');
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    throw new ImportError('PREVIEW_EXPIRED', 'Prévia de importação expirada. Envie o arquivo novamente.');
  }
  return toDto(row);
}

/** The gate a future commit step (T27) must pass before applying anything:
 * owned, unexpired, and bound to the EXACT bytes claimed. Not wired to a
 * route yet (no commit route exists), but independently testable now
 * against this task's own acceptance criteria (stale/tampered rejection). */
export function verifyPreview(db, userId, id, claimedRawSource, now = new Date()) {
  const row = findOwned(db, userId, id);
  if (!row) throw new ImportError('NOT_FOUND', 'Prévia de importação não encontrada.');
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    throw new ImportError('PREVIEW_EXPIRED', 'Prévia de importação expirada. Envie o arquivo novamente.');
  }
  if (sourceChecksum(claimedRawSource) !== row.source_checksum) {
    throw new ImportError('PREVIEW_TAMPERED', 'O arquivo enviado não corresponde à prévia original.');
  }
  return toDto(row);
}
