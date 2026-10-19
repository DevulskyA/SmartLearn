// T28: legacy-import migration flow against the real server's T25-T27
// pipeline (normalize -> preview -> commit). Self-contained and
// DOM-free, mirroring src/auth-ui.js's separation of concerns — all
// button/file wiring lives in src/app.js, this module only knows how to
// talk to /v1/imports/*. Every function here returns a plain
// {ok, ...} | {ok:false, code, message} shape (never throws ApiError/
// NetworkError to the caller) so app.js's DOM code stays simple.
//
// IMPORTANT: commitImportPreview() applies REAL, DEFINITIVE writes to the
// caller's own account (server/src/services/imports.js's commitImport,
// T27). There is no separate "dry run" flag — the preview step (T26) is
// the only rehearsal a caller gets before data is written. This module
// never distinguishes a "real user" cutover from a "fixture rehearsal"
// itself; that authorization line is a human/process decision recorded
// in .specs/features/smartlearn-v1-consolidated-v2/migration-runbook.md,
// not something client code can determine from a payload's shape.
import { apiRequest, ApiError, NetworkError } from './api-client.js';
import { t } from './i18n/index.js';

function fail(err) {
  if (err instanceof ApiError) {
    return { ok: false, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof NetworkError) {
    return { ok: false, code: 'NETWORK_ERROR', message: t('migration.error.network') };
  }
  throw err;
}

/** Step 1: normalize + report, zero side effects (T25/T26). */
export async function previewImport(rawSource) {
  try {
    const { preview } = await apiRequest('/v1/imports/preview', { method: 'POST', body: { rawSource } });
    return { ok: true, preview };
  } catch (err) { return fail(err); }
}

/** Re-reads an owned, unexpired preview (e.g. after navigating away and back). */
export async function getImportPreview(id) {
  try {
    const { preview } = await apiRequest(`/v1/imports/${id}`);
    return { ok: true, preview };
  } catch (err) { return fail(err); }
}

/** Step 2: apply the previewed rows for real (T27). Idempotent by
 * previewId — calling this twice for the same id is safe and returns the
 * original result, never a duplicate. */
export async function commitImportPreview(id) {
  try {
    const { commit } = await apiRequest(`/v1/imports/${id}/commit`, { method: 'POST' });
    return { ok: true, commit };
  } catch (err) { return fail(err); }
}

// Entity key -> catalog key of its pt-BR label. An unknown entity key is shown as it is.
const ENTITY_LABEL_KEYS = {
  subjects: 'migration.entity.subjects',
  learningUnits: 'migration.entity.learningUnits',
  reviewTasks: 'migration.entity.reviewTasks',
  exercises: 'migration.entity.exercises',
  learningEvidence: 'migration.entity.learningEvidence',
  exerciseVersions: 'migration.entity.exerciseVersions',
  exerciseAttempts: 'migration.entity.exerciseAttempts',
  learningEvents: 'migration.entity.learningEvents',
  exams: 'migration.entity.exams',
  examItems: 'migration.entity.examItems',
  examEvidence: 'migration.entity.examEvidence',
  summaryFigures: 'migration.entity.summaryFigures',
};

export function entityLabel(key) {
  return Object.hasOwn(ENTITY_LABEL_KEYS, key) ? t(ENTITY_LABEL_KEYS[key]) : key;
}

/** A downloadable, self-contained record of what a commit actually did —
 * distinct from the server's own commit response, since a caller who
 * closes the tab immediately after confirming should still be able to
 * keep the exact result for later reference (design.md/T28: "downloadable
 * report"). Deliberately plain JSON, not a claim of learning benefit. */
export function buildMigrationReport({ preview, commit }) {
  return {
    generatedAt: new Date().toISOString(),
    previewId: preview.id,
    sourceVersion: preview.sourceVersion,
    sourceChecksum: preview.checksum,
    counts: commit.counts,
    warnings: preview.warnings ?? [],
    committedAt: commit.committedAt,
  };
}
