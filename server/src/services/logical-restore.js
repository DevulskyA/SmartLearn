// IMPORT-1: restore of SmartLearn's own logical export into an EMPTY account.
//
// Decisions (human-approved, option B): restore only into a logically empty
// account, with preview + confirmation + one atomic transaction; no merge;
// materials (PDFs, sources, pages, proposals, drafts, citations) are not part
// of the export and are not restored — the preview says so.
//
// The preview/commit plumbing (import_previews rows, checksum binding, expiry,
// cached result on repeat) is the same as the legacy import's, in imports.js;
// this module only knows how to validate, check emptiness, and write rows.
import { normalizeLogicalExport, LOGICAL_SETS } from '../../../shared/logical-import.js';
import { ImportNormalizationError } from '../../../shared/import-normalization.js';
import { REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { config } from '../config.js';
import { ImportError } from './import-error.js';
import { assertValidTimezone, SettingsError } from './settings.js';

export const LOGICAL_KIND = 'LOGICAL_RESTORE';

// Every table that holds learning data the student owns. A restore needs ALL of
// them empty: it never merges, and it never lets restored rows coexist with
// materials the student already uploaded. Credentials, sessions, settings,
// idempotency keys and import previews are account plumbing, not learning data.
const OWNED_DATA_TABLES = [
  'subjects', 'learning_units', 'review_tasks', 'exercises', 'exercise_versions',
  'learning_evidence', 'exercise_attempts', 'learning_events', 'exams', 'exam_items',
  'exam_evidence', 'competencies', 'sources', 'source_pages', 'source_outline',
  'content_proposals', 'generated_drafts', 'exercise_source_citations', 'unit_summary_citations',
];

function currentSchemaVersion(db) {
  return db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;
}

/** Throws RESTORE_REQUIRES_EMPTY_ACCOUNT, naming what already exists. */
export function assertEmptyAccount(db, userId) {
  const present = {};
  for (const table of OWNED_DATA_TABLES) {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId);
    if (n > 0) present[table] = n;
  }
  if (Object.keys(present).length > 0) {
    throw new ImportError(
      'RESTORE_REQUIRES_EMPTY_ACCOUNT',
      'Esta conta já tem dados. A restauração só é permitida em uma conta vazia, para nunca misturar nem sobrescrever o que já existe. Use uma conta nova.',
      { present },
    );
  }
}

/**
 * The same capacity ceiling the legacy import enforces. Checked at PREVIEW time, so the
 * student learns it before confirming, and again at commit as defense in depth.
 */
export function assertWithinImportCapacity(counts, normalizedJson) {
  const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const byteLen = Buffer.byteLength(normalizedJson, 'utf8');
  if (rowTotal > config.importMaxRows || byteLen > config.importMaxBytes) {
    throw new ImportError('IMPORT_TOO_LARGE', 'A restauração excede o limite de capacidade configurado.', {
      rowTotal, maxRows: config.importMaxRows, byteLen, maxBytes: config.importMaxBytes,
    });
  }
}

/**
 * Validates a logical export and builds the preview. Writes nothing.
 * @returns {{ normalized: object, report: object }} `normalized` is what the
 *   commit step replays; `report` is what the student sees.
 */
export function buildLogicalPreview(db, userId, rawSource) {
  let normalized;
  try {
    normalized = normalizeLogicalExport(rawSource, { currentSchemaVersion: currentSchemaVersion(db) });
  } catch (err) {
    if (err instanceof ImportNormalizationError) {
      throw new ImportError('INVALID_SOURCE', err.message, { issues: err.issues });
    }
    throw err;
  }
  if (normalized.settings.timezone !== null) {
    try {
      assertValidTimezone(normalized.settings.timezone);
    } catch (err) {
      if (err instanceof SettingsError) {
        throw new ImportError('INVALID_SOURCE', err.message, { issues: [{ code: 'INVALID_SETTINGS', message: err.message }] });
      }
      throw err;
    }
  }
  assertEmptyAccount(db, userId);

  const counts = {};
  for (const { key } of LOGICAL_SETS) counts[key] = normalized.sets[key].length;
  const report = {
    kind: LOGICAL_KIND,
    counts,
    warnings: normalized.warnings,
    conflicts: [], // nothing to resolve: the account is empty or the restore is refused
    mapping: [],
  };
  const stored = { kind: LOGICAL_KIND, ...normalized };
  assertWithinImportCapacity(counts, JSON.stringify(stored));
  return { normalized: stored, report };
}

/**
 * Writes the normalized export as owned rows. MUST run inside the caller's
 * transaction: any throw rolls the whole restore back. Re-checks emptiness
 * itself, because the account may have changed since the preview was made.
 * @returns {object} per-set row counts actually inserted
 */
export function restoreLogical(db, userId, normalized, now = new Date()) {
  assertEmptyAccount(db, userId);

  const idMaps = {};
  const inserted = {};
  for (const set of LOGICAL_SETS) {
    const columns = ['user_id', ...set.columns.map((c) => c.name)];
    const insert = db.prepare(`INSERT INTO ${set.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    // Registered before the loop: learning_events.corrects_event_id references
    // events of the same set, inserted earlier (the validator guarantees earlier ids).
    const map = new Map();
    idMaps[set.key] = map;
    for (const row of normalized.sets[set.key]) {
      const values = [userId];
      for (const col of set.columns) {
        const value = row[col.name];
        if (col.ref === null || value === null) {
          values.push(value);
          continue;
        }
        const mapped = idMaps[col.ref]?.get(value);
        if (mapped === undefined) {
          throw new ImportError('IMPORT_INTEGRITY_ERROR', `Referência ausente ao restaurar (${set.key}.${col.name} = ${value}).`);
        }
        values.push(mapped);
      }
      const result = insert.run(...values);
      if (set.hasId) map.set(row.id, Number(result.lastInsertRowid));
    }
    inserted[set.key] = normalized.sets[set.key].length;
  }

  // Only a timezone the student had actually chosen is restored; an export from
  // an account that never touched settings (updatedAt null) restores no row, so
  // the new account reads the same defaults the old one did.
  if (normalized.settings.updatedAt !== null && normalized.settings.timezone !== null) {
    db.prepare(`
      INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at
    `).run(userId, normalized.settings.timezone, JSON.stringify(REVIEW_DAY_OFFSETS), normalized.settings.updatedAt);
  }

  return inserted;
}
