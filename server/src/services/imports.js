// T26: owned import preview + proposed ID mapping. Read-only — never
// writes a subject/learningUnit/reviewTask/exercise/learningEvidence row.
// The actual commit (T27, not built yet) is a separate step this module
// does not perform.
import { createHash } from 'node:crypto';
import { normalizeLegacyExport, ImportNormalizationError } from '../../../shared/import-normalization.js';
import { nameKey } from '../../../shared/text-validation.js';
import { config } from '../config.js';

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

function toUtcDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// review_tasks.offset_days is not carried by T25's normalized reviewTask
// (only dueDate/completedAt survive normalization) — recompute it the same
// way the fixed schedule itself is calendar-day arithmetic (shared/
// review-schedule.js), so a migrated task's offset always agrees with its
// own unit's studyDate rather than trusting an unnormalized source field.
function offsetDaysBetween(studyDate, dueDate) {
  return Math.round((toUtcDay(dueDate) - toUtcDay(studyDate)) / 86400000);
}

/**
 * Applies an owned, unexpired, conflict-free preview's normalized data as
 * real owned rows, in ONE bounded transaction (design.md §6/T27: never a
 * partial commit). A previewId is already 1:1 bound to one exact
 * checksum-verified source (T26) — re-committing the SAME previewId, by
 * anyone who owns it, at any time, returns the ORIGINAL result and inserts
 * nothing new, rather than depending on a client-supplied operation key.
 * A nonempty conflict list (a legacy subject name colliding with an
 * existing active subject) is refused outright: resolving/remapping a
 * conflict is out of this task's scope (T28), so this never silently
 * overwrites or skips by name. Every legacy*Id reference is resolved
 * through this commit's OWN freshly-built id maps — a reference that
 * cannot be resolved (a corrupted/edited preview row, or a genuine defect)
 * throws inside the transaction, which better-sqlite3 rolls back
 * atomically; a final per-entity count reconciliation against the
 * preview's own reported counts closes the same gap for a corruption that
 * would otherwise still produce a plausible-looking but wrong row count.
 */
export function commitImport(db, userId, previewId, now = new Date()) {
  const row = findOwned(db, userId, previewId);
  if (!row) throw new ImportError('NOT_FOUND', 'Prévia de importação não encontrada.');
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    throw new ImportError('PREVIEW_EXPIRED', 'Prévia de importação expirada. Envie o arquivo novamente.');
  }
  if (row.committed_at) {
    return JSON.parse(row.commit_result_json);
  }

  const report = JSON.parse(row.report_json);
  if (report.conflicts.length > 0) {
    throw new ImportError(
      'IMPORT_HAS_CONFLICTS',
      'Existem conflitos de nome não resolvidos. Renomeie ou remova os itens conflitantes antes de confirmar a importação.',
      { conflicts: report.conflicts },
    );
  }

  const rowTotal = Object.values(report.counts).reduce((a, b) => a + b, 0);
  const byteLen = Buffer.byteLength(row.normalized_json, 'utf8');
  if (rowTotal > config.importMaxRows || byteLen > config.importMaxBytes) {
    throw new ImportError('IMPORT_TOO_LARGE', 'A importação excede o limite de capacidade configurado.', {
      rowTotal, maxRows: config.importMaxRows, byteLen, maxBytes: config.importMaxBytes,
    });
  }

  const normalized = JSON.parse(row.normalized_json);

  const run = db.transaction(() => {
    const nowIso = now.toISOString();

    const subjectIdMap = new Map();
    const insertSubject = db.prepare(`
      INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    // T25's normalized subject carries no createdAt/updatedAt (the source
    // shape never guaranteed one) — nowIso is the disclosed default,
    // consistent with normalizeSubjects' own DEFAULTED_* warnings.
    for (const s of normalized.subjects) {
      const r = insertSubject.run(userId, s.name, s.color, s.isActive ? 1 : 0, s.sortOrder, nowIso, nowIso);
      subjectIdMap.set(s.legacyId, r.lastInsertRowid);
    }

    const unitIdMap = new Map();
    const unitStudyDateByLegacyId = new Map();
    const insertUnit = db.prepare(`
      INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of normalized.learningUnits) {
      const subjectId = subjectIdMap.get(u.legacySubjectId);
      if (!subjectId) throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Referência de disciplina ausente ao confirmar a importação (unidade ' + u.legacyId + ').');
      const r = insertUnit.run(userId, subjectId, u.title, u.sourceText || null, u.summaryBody, u.studyDate, u.createdAt, u.updatedAt);
      unitIdMap.set(u.legacyId, r.lastInsertRowid);
      unitStudyDateByLegacyId.set(u.legacyId, u.studyDate);
    }

    const taskIdMap = new Map();
    const insertTask = db.prepare(`
      INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const t of normalized.reviewTasks) {
      const unitId = unitIdMap.get(t.legacyUnitId);
      if (!unitId) throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Referência de unidade ausente ao confirmar a importação (revisão ' + t.legacyId + ').');
      const offsetDays = offsetDaysBetween(unitStudyDateByLegacyId.get(t.legacyUnitId), t.dueDate);
      const r = insertTask.run(userId, unitId, offsetDays, t.dueDate, t.completedAt, nowIso);
      taskIdMap.set(t.legacyId, r.lastInsertRowid);
    }

    const exerciseIdMap = new Map();
    const insertExercise = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    const insertVersion = db.prepare('INSERT INTO exercise_versions (user_id, exercise_id, question, answer, hint, provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const e of normalized.exercises) {
      const unitId = unitIdMap.get(e.legacyUnitId);
      if (!unitId) throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Referência de unidade ausente ao confirmar a importação (exercício ' + e.legacyId + ').');
      const createdAt = e.createdAt ?? nowIso;
      const updatedAt = e.updatedAt ?? createdAt;
      const r = insertExercise.run(userId, unitId, e.order, createdAt, updatedAt);
      const exerciseId = r.lastInsertRowid;
      insertVersion.run(userId, exerciseId, e.question, e.answer || null, e.hint, e.provenance, createdAt);
      exerciseIdMap.set(e.legacyId, exerciseId);
    }

    const insertEvidence = db.prepare(`
      INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let evidenceCount = 0;
    for (const ev of normalized.learningEvidence) {
      const unitId = unitIdMap.get(ev.legacyUnitId);
      if (!unitId) throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Referência de unidade ausente ao confirmar a importação (evidência de aprendizagem).');
      let reviewTaskId = null;
      if (ev.legacyReviewTaskId != null) {
        reviewTaskId = taskIdMap.get(ev.legacyReviewTaskId);
        if (!reviewTaskId) throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Referência de revisão ausente ao confirmar a importação (evidência de aprendizagem).');
      }
      insertEvidence.run(userId, unitId, reviewTaskId, ev.context, ev.questionsCount, ev.correctCount, ev.evidenceDate, nowIso);
      evidenceCount++;
    }

    const createdCounts = {
      subjects: subjectIdMap.size,
      learningUnits: unitIdMap.size,
      reviewTasks: taskIdMap.size,
      exercises: exerciseIdMap.size,
      learningEvidence: evidenceCount,
    };
    for (const key of Object.keys(report.counts)) {
      if (createdCounts[key] !== report.counts[key]) {
        throw new ImportError('IMPORT_INTEGRITY_ERROR', 'Contagem de ' + key + ' divergente ao confirmar a importação: esperado ' + report.counts[key] + ', inserido ' + createdCounts[key] + '.');
      }
    }

    const result = {
      previewId: row.id,
      sourceVersion: row.source_version,
      checksum: row.source_checksum,
      counts: createdCounts,
      committedAt: nowIso,
    };

    db.prepare('UPDATE import_previews SET committed_at = ?, commit_result_json = ? WHERE id = ?')
      .run(nowIso, JSON.stringify(result), row.id);

    return result;
  });

  return run();
}
