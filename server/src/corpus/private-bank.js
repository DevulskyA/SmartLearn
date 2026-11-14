// PRIVATE QUESTION BANK: the student's own accepted exercises, read as corpus items so resolveNeed() (REUSE / DERIVE / GENERATE) can serve a
// review from what already exists before asking the AI for more. Nothing here writes, calls a model or needs a migration: it reads
// exercises, their immutable versions, their source citations and the problem flags that already exist. Isolation: every query is
// scoped to one user_id, so an item of another account can never appear.
//
// Mapping (what is stored today -> corpus field):
//   exercise_versions.question / answer / explanation -> stem / key / explanation
//   learning_units.title                              -> topic (the study unit the question came from)
//   exercise_versions.question_type                   -> item_type (cognitive level; the stored data has no multiple-choice/essay field yet)
//   exercise_source_citations (+ sources)             -> source (file name), pages and edition year (the bibliography on the source when known, else a year the file name states)
//   provenance                                        -> provenance + origin (AI_GENERATED -> generated)
// Usage rights: the student's own questions, made from the student's own material, are reusable PRIVATELY, so they are LICENSED here.
// That never makes them public: the bank is built per user and is not shared between accounts.
import { openCorpus } from './corpus-index.js';
import { classifyFreshness } from './freshness.js';

const DAY_MS = 86_400_000;

/** A 4-digit edition year found in a file name ("Costanzo Physiology 2012.pdf"), else null. Metadata for the edition is a protected change. */
export function editionYearOf(fileName) {
  const m = String(fileName ?? '').match(/(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/);
  return m ? Number(m[1]) : null;
}

function rowsFor(db, userId) {
  return db.prepare(`
    SELECT e.id AS exercise_id, e.unit_id, e.created_at AS exercise_created_at, u.title AS unit_title,
           v.id AS version_id, v.question, v.answer, v.explanation, v.question_type, v.provenance
      FROM exercises e
      JOIN learning_units u ON u.user_id = e.user_id AND u.id = e.unit_id
      JOIN exercise_versions v ON v.user_id = e.user_id AND v.exercise_id = e.id
     WHERE e.user_id = ? AND e.archived_at IS NULL
       AND v.id = (SELECT MAX(v2.id) FROM exercise_versions v2 WHERE v2.user_id = e.user_id AND v2.exercise_id = e.id)
       AND COALESCE((SELECT f.action FROM exercise_flag_events f WHERE f.user_id = e.user_id AND f.exercise_id = e.id
                      ORDER BY f.id DESC LIMIT 1), 'CLEAR') <> 'FLAG'
  `).all(userId);
}

function citationsFor(db, userId, versionId) {
  return db.prepare(`
    SELECT c.source_id, c.page_index, s.original_name, s.bib_year
      FROM exercise_source_citations c JOIN sources s ON s.user_id = c.user_id AND s.id = c.source_id
     WHERE c.user_id = ? AND c.exercise_version_id = ? ORDER BY c.page_index
  `).all(userId, versionId);
}

/** The student's reusable questions as normalized corpus items. A question under an open problem flag or archived is not served. */
export function privateBankItems(db, userId) {
  return rowsFor(db, userId).map((row) => {
    const cites = citationsFor(db, userId, row.version_id);
    const pages = cites.map((c) => c.page_index);
    const sourceName = cites[0]?.original_name ?? null;
    const freshness = classifyFreshness({ stem: row.question, explanation: row.explanation, topic: row.unit_title });
    return {
      id: `ex${row.exercise_id}`,
      source: sourceName,
      source_file: cites[0] ? `source#${cites[0].source_id}` : null,
      usage_status: 'LICENSED',
      exam: null,
      year: cites[0]?.bib_year ?? editionYearOf(sourceName),
      topic: row.unit_title,
      competency: null,
      subcompetency: null,
      item_type: row.question_type ?? null,
      stem: row.question,
      options: null,
      key: row.answer ?? null,
      explanation: row.explanation ?? null,
      source_evidence: pages.length > 0 ? `pages ${pages.join(',')}` : null,
      provenance: row.provenance,
      origin: row.provenance === 'AI_GENERATED' ? 'generated' : 'original',
      parent_id: null,
      relationship: null,
      target_complexity: null,
      observed_difficulty: null,
      status: 'ACTIVE',
      version_id: row.version_id,
      unit_id: row.unit_id,
      stability: freshness.stability,
      needs_verification: freshness.needsVerification,
    };
  });
}

/**
 * Exercises already shown RECENTLY. A question answered long ago is NOT excluded for ever: spaced review needs deliberate re-encounters,
 * so only attempts newer than `repeatAfterDays` count as "exposed" (those are the ones a review must not repeat yet).
 */
export function recentlyExposedIds(db, userId, { now = new Date(), repeatAfterDays = 14 } = {}) {
  const since = new Date(now.getTime() - repeatAfterDays * DAY_MS).toISOString();
  return db.prepare(`
    SELECT DISTINCT e.id AS exercise_id
      FROM exercise_attempts a
      JOIN exercise_versions v ON v.user_id = a.user_id AND v.id = a.exercise_version_id
      JOIN exercises e ON e.user_id = v.user_id AND e.id = v.exercise_id
     WHERE a.user_id = ? AND a.started_at >= ?
  `).all(userId, since).map((r) => `ex${r.exercise_id}`);
}

/** The student's bank as a searchable corpus (in memory, rebuilt per call: the bank is small and always current). */
export function openPrivateBank(db, userId) {
  return openCorpus({ items: privateBankItems(db, userId) });
}
