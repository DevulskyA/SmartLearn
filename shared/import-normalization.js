// T25: normalize a real legacy local export (v1/v2/v3 shapes actually
// produced by src/db.js's exportAll()/importAll(), not invented shapes —
// see db.js's migrateV1ImportData/buildImportStatements and the v1/v2/v3
// fixtures in test/learning-evidence.test.js and test/learning-units.test.js
// this module was built against) into ONE canonical, source-agnostic
// representation that later tasks (T26 preview, T27 commit) consume.
// Read-only and pure: no I/O, no ID minting, no account/tenant context.
// IDs from the source stay as `legacy*Id` fields — mapping them onto real
// server IDs is explicitly T26's job (design.md §6: "record old->new ID
// mapping"), not this one's.
//
// Per design.md §6, unknown versions, invalid counts/dates, duplicate IDs,
// cross-entity dangling references, and fields that cannot be preserved
// without guessing (e.g. exercise provenance) reject the WHOLE import —
// never a partial success. All such problems are collected and reported
// together (not just the first one found), so a real preview can show a
// user everything wrong with a source in one pass. Purely cosmetic gaps
// (a missing subject color, a missing bookkeeping timestamp) are filled
// with a safe, disclosed default and recorded in `warnings` instead.

import { validateNamingField } from './text-validation.js';

export class ImportNormalizationError extends Error {
  constructor(issues) {
    super('Import inválido: ' + issues.map((i) => i.message).join(' | '));
    this.name = 'ImportNormalizationError';
    this.issues = issues;
  }
}

const EXERCISE_PROVENANCE_VALUES = ['MANUAL', 'SOURCE', 'AI_GENERATED'];
const EVIDENCE_CONTEXT_VALUES = ['INITIAL_PRACTICE', 'REVIEW', 'EXTERNAL'];

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, mo, d] = value.split('-').map(Number);
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Round-trip through Date rather than trusting the string: JS silently
  // overflows an invalid day (e.g. 2026-02-30 -> 2026-03-02) instead of
  // failing, so compare the formatted result back to the input (same
  // technique as shared/review-schedule.js's own calendar validation).
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toISOString().slice(0, 10) === value;
}

function detectSourceVersion(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ImportNormalizationError([{ code: 'INVALID_INPUT', message: 'O arquivo de origem precisa ser um objeto JSON válido.' }]);
  }
  if (raw.schemaVersion == null && Array.isArray(raw.studyRecords)) return 1;
  const version = raw.schemaVersion;
  if (version == null || !Number.isInteger(version) || version < 1 || version > 3) {
    throw new ImportNormalizationError([{
      code: 'UNSUPPORTED_VERSION',
      message: 'schemaVersion não suportado para normalização: ' + version + '. Versões suportadas: 1, 2, 3 (ou v1 legado via studyRecords).',
    }]);
  }
  return version;
}

// v1's studyRecords/sources shape -> the same subjects/learningUnits/
// reviewTasks shape v2/v3 already use, exactly mirroring db.js's
// migrateV1ImportData so both import paths agree on what "v1" means.
function adaptV1(raw) {
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  const sourceMap = new Map(sources.map((s) => [s.id, s.name ?? '']));
  const learningUnits = (Array.isArray(raw.studyRecords) ? raw.studyRecords : []).map((sr) => ({
    id: sr.id,
    subjectId: sr.subject_id ?? sr.subjectId,
    sourceText: sourceMap.get(sr.source_id ?? sr.sourceId) ?? sr.source_text ?? sr.sourceText ?? '',
    studyDate: sr.study_date ?? sr.studyDate,
    title: sr.content ?? sr.title ?? '',
    summaryBody: sr.summary_body ?? sr.summaryBody ?? null,
    createdAt: sr.created_at ?? sr.createdAt,
    updatedAt: sr.updated_at ?? sr.updatedAt,
  }));
  const reviewTasks = (Array.isArray(raw.reviewTasks) ? raw.reviewTasks : []).map((rt) => ({
    ...rt,
    unitId: rt.study_record_id ?? rt.studyRecordId ?? rt.unit_id ?? rt.unitId,
  }));
  return {
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    learningUnits,
    reviewTasks,
    exercises: [],
    learningEvidence: null, // none in v1 — synthesize (nothing) from reviewTasks below
  };
}

function adaptV2Or3(raw, version) {
  return {
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    learningUnits: Array.isArray(raw.learningUnits) ? raw.learningUnits : [],
    reviewTasks: Array.isArray(raw.reviewTasks) ? raw.reviewTasks : [],
    exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
    // Only v3 ever carried an explicit learningEvidence array (T18's
    // domain). v1/v2 evidence, if any, must be synthesized from completed
    // reviewTasks instead — `null` here is the signal to do that.
    learningEvidence: version === 3 && Array.isArray(raw.learningEvidence) ? raw.learningEvidence : null,
  };
}

function pushIssue(issues, code, message) {
  issues.push({ code, message });
}

function normalizeSubjects(rawSubjects, issues, warnings) {
  const seenIds = new Set();
  const byLegacyId = new Map();
  const out = [];
  for (const row of rawSubjects) {
    if (row.id == null) {
      pushIssue(issues, 'MISSING_ID', 'Disciplina sem id de origem.');
      continue;
    }
    if (seenIds.has(row.id)) {
      pushIssue(issues, 'DUPLICATE_ID', 'Id de disciplina duplicado na origem: ' + row.id + '.');
      continue;
    }
    seenIds.add(row.id);
    const nameError = validateNamingField(row.name, 'o nome da disciplina');
    if (nameError) {
      pushIssue(issues, 'INVALID_NAME', 'Disciplina ' + row.id + ': ' + nameError);
      continue;
    }
    if (row.color == null) warnings.push({ code: 'DEFAULTED_COLOR', message: 'Disciplina ' + row.id + ' sem cor na origem — usando cor padrão.' });
    if (row.sortOrder == null && row.sort_order == null) warnings.push({ code: 'DEFAULTED_SORT_ORDER', message: 'Disciplina ' + row.id + ' sem ordem na origem — usando ordem 0.' });
    const normalized = {
      legacyId: row.id,
      name: row.name,
      color: row.color ?? 'DISC-BLUE',
      isActive: (row.isActive ?? row.is_active ?? true) ? true : false,
      sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    };
    byLegacyId.set(row.id, normalized);
    out.push(normalized);
  }
  return { subjects: out, subjectsByLegacyId: byLegacyId };
}

function normalizeLearningUnits(rawUnits, subjectsByLegacyId, issues, warnings) {
  const seenIds = new Set();
  const byLegacyId = new Map();
  const out = [];
  for (const row of rawUnits) {
    if (row.id == null) {
      pushIssue(issues, 'MISSING_ID', 'Unidade de estudo sem id de origem.');
      continue;
    }
    if (seenIds.has(row.id)) {
      pushIssue(issues, 'DUPLICATE_ID', 'Id de unidade de estudo duplicado na origem: ' + row.id + '.');
      continue;
    }
    seenIds.add(row.id);
    const legacySubjectId = row.subjectId ?? row.subject_id;
    if (!subjectsByLegacyId.has(legacySubjectId)) {
      pushIssue(issues, 'DANGLING_SUBJECT_REF', 'Unidade ' + row.id + ' referencia disciplina inexistente na origem: ' + legacySubjectId + '.');
      continue;
    }
    const studyDate = row.studyDate ?? row.study_date;
    if (!isValidIsoDate(studyDate)) {
      pushIssue(issues, 'INVALID_DATE', 'Unidade ' + row.id + ' tem studyDate inválida: ' + studyDate + '.');
      continue;
    }
    const title = row.title ?? row.content ?? '';
    if (!String(title).trim()) {
      pushIssue(issues, 'MISSING_TITLE', 'Unidade ' + row.id + ' sem título na origem.');
      continue;
    }
    const createdAt = row.createdAt ?? row.created_at;
    const updatedAt = row.updatedAt ?? row.updated_at;
    if (!createdAt || !updatedAt) {
      warnings.push({ code: 'DEFAULTED_TIMESTAMP', message: 'Unidade ' + row.id + ' sem createdAt/updatedAt na origem — usando a data de estudo.' });
    }
    const normalized = {
      legacyId: row.id,
      legacySubjectId,
      sourceText: row.sourceText ?? row.source_text ?? '',
      studyDate,
      title,
      summaryBody: row.summaryBody ?? row.summary_body ?? null,
      createdAt: createdAt ?? (studyDate + 'T00:00:00.000Z'),
      updatedAt: updatedAt ?? createdAt ?? (studyDate + 'T00:00:00.000Z'),
    };
    byLegacyId.set(row.id, normalized);
    out.push(normalized);
  }
  return { learningUnits: out, unitsByLegacyId: byLegacyId };
}

function normalizeReviewTasks(rawTasks, unitsByLegacyId, issues) {
  const seenIds = new Set();
  const byLegacyId = new Map();
  const out = [];
  for (const row of rawTasks) {
    if (row.id == null) {
      pushIssue(issues, 'MISSING_ID', 'Revisão sem id de origem.');
      continue;
    }
    if (seenIds.has(row.id)) {
      pushIssue(issues, 'DUPLICATE_ID', 'Id de revisão duplicado na origem: ' + row.id + '.');
      continue;
    }
    seenIds.add(row.id);
    const legacyUnitId = row.unitId ?? row.unit_id;
    if (!unitsByLegacyId.has(legacyUnitId)) {
      pushIssue(issues, 'DANGLING_UNIT_REF', 'Revisão ' + row.id + ' referencia unidade inexistente na origem: ' + legacyUnitId + '.');
      continue;
    }
    const dueDate = row.dueDate ?? row.due_date;
    if (!isValidIsoDate(dueDate)) {
      pushIssue(issues, 'INVALID_DATE', 'Revisão ' + row.id + ' tem dueDate inválida: ' + dueDate + '.');
      continue;
    }
    const normalized = {
      legacyId: row.id,
      legacyUnitId,
      dueDate,
      completedAt: row.completedAt ?? row.completed_at ?? null,
    };
    byLegacyId.set(row.id, { ...normalized, raw: row });
    out.push(normalized);
  }
  return { reviewTasks: out, tasksByLegacyId: byLegacyId };
}

function normalizeExercises(rawExercises, unitsByLegacyId, issues) {
  const seenIds = new Set();
  const out = [];
  for (const row of rawExercises) {
    if (row.id == null) {
      pushIssue(issues, 'MISSING_ID', 'Exercício sem id de origem.');
      continue;
    }
    if (seenIds.has(row.id)) {
      pushIssue(issues, 'DUPLICATE_ID', 'Id de exercício duplicado na origem: ' + row.id + '.');
      continue;
    }
    seenIds.add(row.id);
    const legacyUnitId = row.unitId ?? row.unit_id;
    if (!unitsByLegacyId.has(legacyUnitId)) {
      pushIssue(issues, 'DANGLING_UNIT_REF', 'Exercício ' + row.id + ' referencia unidade inexistente na origem: ' + legacyUnitId + '.');
      continue;
    }
    const provenance = row.provenance;
    if (!EXERCISE_PROVENANCE_VALUES.includes(provenance)) {
      // Provenance cannot be guessed without misrepresenting where the
      // exercise came from (design.md §6: fields that would lose meaning
      // reject the import, they are not silently defaulted).
      pushIssue(issues, 'INVALID_PROVENANCE', 'Exercício ' + row.id + ' tem provenance ausente ou desconhecida: ' + provenance + '.');
      continue;
    }
    out.push({
      legacyId: row.id,
      legacyUnitId,
      question: row.questionText ?? row.question_text ?? '',
      answer: row.answerText ?? row.answer_text ?? '',
      hint: row.hintText ?? row.hint_text ?? null,
      provenance,
      order: row.position ?? 0,
      createdAt: row.createdAt ?? row.created_at ?? null,
      updatedAt: row.updatedAt ?? row.updated_at ?? null,
    });
  }
  return out;
}

// v1/v2 sources never had a first-class learningEvidence array — a
// completed, scored reviewTask (reviewDone + questionsDone + a real
// questionsCount) is the only signal that an evidence fact happened.
// Synthesizes exactly what db.js's own v2-upgrade path already does
// (same fields, same date derivation), so both import paths agree.
function synthesizeEvidenceFromReviewTasks(rawTasks, unitsByLegacyId) {
  const out = [];
  for (const task of rawTasks) {
    const reviewDone = task.reviewDone ?? task.review_done;
    const questionsDone = task.questionsDone ?? task.questions_done;
    const q = task.questionsCount ?? task.questions_count;
    if (!reviewDone || !questionsDone) continue;
    if (q == null || !Number.isFinite(Number(q)) || Number(q) <= 0) continue;
    const legacyUnitId = task.unitId ?? task.unit_id;
    if (!unitsByLegacyId.has(legacyUnitId)) continue; // already reported as DANGLING_UNIT_REF by normalizeReviewTasks
    const c = task.correctCount ?? task.correct_count;
    const evidenceDate = (task.completedAt ?? task.completed_at ?? task.dueDate ?? task.due_date ?? '').slice(0, 10);
    if (!isValidIsoDate(evidenceDate)) continue;
    out.push({
      legacyUnitId,
      legacyReviewTaskId: task.id,
      context: 'REVIEW',
      questionsCount: Number(q),
      correctCount: c != null ? Number(c) : 0,
      evidenceDate,
    });
  }
  return out;
}

function normalizeExplicitEvidence(rawEvidence, unitsByLegacyId, tasksByLegacyId, issues) {
  const out = [];
  const seenReviewTaskLinks = new Set();
  for (const row of rawEvidence) {
    const legacyUnitId = row.unitId ?? row.unit_id;
    if (!unitsByLegacyId.has(legacyUnitId)) {
      pushIssue(issues, 'DANGLING_UNIT_REF', 'Evidência de aprendizagem referencia unidade inexistente na origem: ' + legacyUnitId + '.');
      continue;
    }
    const context = row.context;
    if (!EVIDENCE_CONTEXT_VALUES.includes(context)) {
      pushIssue(issues, 'INVALID_CONTEXT', 'Evidência de aprendizagem tem context inválido: ' + context + '.');
      continue;
    }
    const q = Number(row.questionsCount ?? row.questions_count);
    const c = Number(row.correctCount ?? row.correct_count);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c < 0 || c > q) {
      pushIssue(issues, 'INVALID_COUNTS', 'Evidência de aprendizagem da unidade ' + legacyUnitId + ' tem questionsCount/correctCount inválidos.');
      continue;
    }
    const legacyReviewTaskId = row.reviewTaskId ?? row.review_task_id ?? null;
    if (context === 'REVIEW' && legacyReviewTaskId == null) {
      pushIssue(issues, 'MISSING_REVIEW_TASK_LINK', 'Evidência REVIEW da unidade ' + legacyUnitId + ' não referencia uma revisão de origem.');
      continue;
    }
    if (context !== 'REVIEW' && legacyReviewTaskId != null) {
      pushIssue(issues, 'UNEXPECTED_REVIEW_TASK_LINK', 'Evidência ' + context + ' da unidade ' + legacyUnitId + ' não deveria referenciar uma revisão.');
      continue;
    }
    if (legacyReviewTaskId != null) {
      if (!tasksByLegacyId.has(legacyReviewTaskId)) {
        pushIssue(issues, 'DANGLING_REVIEW_TASK_REF', 'Evidência referencia revisão inexistente na origem: ' + legacyReviewTaskId + '.');
        continue;
      }
      if (seenReviewTaskLinks.has(legacyReviewTaskId)) {
        pushIssue(issues, 'MULTIPLE_EVIDENCE_FOR_TASK', 'Revisão ' + legacyReviewTaskId + ' tem mais de uma evidência de aprendizagem na origem (ambíguo).');
        continue;
      }
      seenReviewTaskLinks.add(legacyReviewTaskId);
    }
    const evidenceDate = row.evidenceDate ?? row.evidence_date;
    if (!isValidIsoDate(evidenceDate)) {
      pushIssue(issues, 'INVALID_DATE', 'Evidência de aprendizagem da unidade ' + legacyUnitId + ' tem evidenceDate inválida: ' + evidenceDate + '.');
      continue;
    }
    out.push({ legacyUnitId, legacyReviewTaskId, context, questionsCount: q, correctCount: c, evidenceDate });
  }
  // Detects the "single missing evidence row" case (design.md §6 /
  // acceptance evidence): a v3 source where a reviewTask was completed and
  // scored but never got its own explicit learningEvidence row is an
  // internally inconsistent source, not a silently-droppable gap — the
  // score would otherwise vanish without a trace.
  for (const [legacyId, entry] of tasksByLegacyId) {
    const row = entry.raw;
    const reviewDone = row.reviewDone ?? row.review_done;
    const questionsDone = row.questionsDone ?? row.questions_done;
    const q = row.questionsCount ?? row.questions_count;
    if (reviewDone && questionsDone && q != null && Number(q) > 0 && !seenReviewTaskLinks.has(legacyId)) {
      pushIssue(issues, 'MISSING_EVIDENCE_ROW', 'Revisão ' + legacyId + ' foi concluída com nota mas não tem evidência de aprendizagem correspondente na origem.');
    }
  }
  return out;
}

/**
 * Normalizes a real legacy local export (v1/v2/v3, as produced by
 * src/db.js) into one canonical, source-agnostic representation.
 * @param {object} raw parsed JSON of the legacy export
 * @returns {{sourceVersion:number, subjects:object[], learningUnits:object[], reviewTasks:object[], exercises:object[], learningEvidence:object[], warnings:object[]}}
 * @throws {ImportNormalizationError} when the source is unsupported, ambiguous, or would lose meaning if partially accepted
 */
export function normalizeLegacyExport(raw) {
  const sourceVersion = detectSourceVersion(raw);
  const adapted = sourceVersion === 1 ? adaptV1(raw) : adaptV2Or3(raw, sourceVersion);

  const issues = [];
  const warnings = [];

  const { subjects, subjectsByLegacyId } = normalizeSubjects(adapted.subjects, issues, warnings);
  const { learningUnits, unitsByLegacyId } = normalizeLearningUnits(adapted.learningUnits, subjectsByLegacyId, issues, warnings);
  const { reviewTasks, tasksByLegacyId } = normalizeReviewTasks(adapted.reviewTasks, unitsByLegacyId, issues);
  const exercises = normalizeExercises(adapted.exercises, unitsByLegacyId, issues);

  const learningEvidence = adapted.learningEvidence === null
    ? synthesizeEvidenceFromReviewTasks(adapted.reviewTasks, unitsByLegacyId)
    : normalizeExplicitEvidence(adapted.learningEvidence, unitsByLegacyId, tasksByLegacyId, issues);

  if (issues.length > 0) {
    throw new ImportNormalizationError(issues);
  }

  return { sourceVersion, subjects, learningUnits, reviewTasks, exercises, learningEvidence, warnings };
}
