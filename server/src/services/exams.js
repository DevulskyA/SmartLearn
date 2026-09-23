import { citationsForVersion } from './exercises.js';
import * as attemptsService from './attempts.js';
import * as evidenceService from './evidence.js';

// EXAM-1/2/3: Modo Prova. MEASURE first, TEACH after.
//
//   IN_PROGRESS  the student answers; the payload holds ONLY the question and the student's own typed
//                answer. No gabarito, explanation, hint, source, judgement or score is ever returned.
//   SUBMITTED    answers are locked; the correction data (gabarito, explanation, hint, sources) is returned.
//   CORRECTED    (EXAM-2/3) every item judged by the student -> score + one evidence row.
//
// The guarantee is server-side (the response for an IN_PROGRESS exam is built without those fields), so
// it does not depend on the UI hiding anything.

export class ExamError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const MAX_ANSWER_LENGTH = 5000;

function findOwnedUnit(db, userId, unitId) {
  return db.prepare('SELECT id, title FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
}

function findOwnedSubject(db, userId, subjectId) {
  return db.prepare('SELECT id, name FROM subjects WHERE user_id = ? AND id = ?').get(userId, subjectId);
}

/** What the exam is called: the unit title, or the discipline name for a discipline exam. */
function examTitle(db, userId, exam, unit) {
  if (exam.subject_id == null) return unit.title;
  return findOwnedSubject(db, userId, exam.subject_id)?.name ?? unit.title;
}

function findOwnedExam(db, userId, examId) {
  const exam = db.prepare('SELECT * FROM exams WHERE user_id = ? AND id = ?').get(userId, examId);
  if (!exam) throw new ExamError('NOT_FOUND', 'Prova não encontrada.');
  return exam;
}

function itemRows(db, userId, examId) {
  return db.prepare(`
    SELECT i.id, i.position, i.exercise_id, i.exercise_version_id, i.student_answer, i.outcome,
           v.question, v.answer, v.explanation, v.hint, ex.unit_id AS item_unit_id, u.title AS item_unit_title
    FROM exam_items i
    JOIN exercise_versions v ON v.user_id = i.user_id AND v.id = i.exercise_version_id
    JOIN exercises ex ON ex.user_id = i.user_id AND ex.id = i.exercise_id
    JOIN learning_units u ON u.user_id = ex.user_id AND u.id = ex.unit_id
    WHERE i.user_id = ? AND i.exam_id = ?
    ORDER BY i.position
  `).all(userId, examId);
}

/** What the student may see WHILE taking the exam: the question and their own answer. Nothing else. */
function toProgressDto(db, userId, exam, unit, rows) {
  const title = examTitle(db, userId, exam, unit);
  return {
    id: exam.id,
    unitId: exam.unit_id,
    subjectId: exam.subject_id ?? null,
    scope: exam.subject_id == null ? 'UNIT' : 'SUBJECT',
    title,
    unitTitle: title,
    status: exam.status,
    startedAt: exam.started_at,
    questionCount: rows.length,
    answeredCount: rows.filter((r) => r.student_answer != null && r.student_answer.trim() !== '').length,
    items: rows.map((r) => ({ id: r.id, position: r.position, exerciseId: r.exercise_id, question: r.question, studentAnswer: r.student_answer })),
  };
}

function scoreOf(rows) {
  if (rows.length === 0 || rows.some((r) => r.outcome == null)) return null;
  const correct = rows.filter((r) => r.outcome === 'CORRECT').length;
  return { correct, total: rows.length, percent: (correct / rows.length) * 100 };
}

/** After submission: the correction data, still with the exact version that was shown. */
function toCorrectionDto(db, userId, exam, unit, rows) {
  const title = examTitle(db, userId, exam, unit);
  return {
    id: exam.id,
    unitId: exam.unit_id,
    subjectId: exam.subject_id ?? null,
    scope: exam.subject_id == null ? 'UNIT' : 'SUBJECT',
    title,
    unitTitle: title,
    status: exam.status,
    startedAt: exam.started_at,
    submittedAt: exam.submitted_at,
    correctedAt: exam.corrected_at,
    evidenceId: exam.evidence_id,
    evidenceIds: db.prepare('SELECT evidence_id FROM exam_evidence WHERE user_id = ? AND exam_id = ? ORDER BY evidence_id').all(userId, exam.id).map((r) => r.evidence_id),
    questionCount: rows.length,
    score: scoreOf(rows),
    items: rows.map((r) => ({
      id: r.id,
      position: r.position,
      exerciseId: r.exercise_id,
      unitId: r.item_unit_id,
      unitTitle: r.item_unit_title,
      question: r.question,
      studentAnswer: r.student_answer,
      answer: r.answer,
      explanation: r.explanation ?? null,
      hint: r.hint ?? null,
      citations: citationsForVersion(db, userId, r.exercise_version_id),
      outcome: r.outcome,
    })),
  };
}

export function get(db, userId, examId) {
  const exam = findOwnedExam(db, userId, examId);
  const unit = findOwnedUnit(db, userId, exam.unit_id);
  const rows = itemRows(db, userId, examId);
  return exam.status === 'IN_PROGRESS' ? toProgressDto(db, userId, exam, unit, rows) : toCorrectionDto(db, userId, exam, unit, rows);
}

/**
 * Starts an exam over the unit's non-archived exercises, capturing each current exercise VERSION. An
 * exam already in progress for the unit is RESUMED (returned as is), so leaving/reloading never loses it
 * and never creates a second one.
 */
export function start(db, userId, { unitId }, now = () => new Date()) {
  const unit = findOwnedUnit(db, userId, unitId);
  if (!unit) throw new ExamError('NOT_FOUND', 'Aula não encontrada.');

  // An exam that is still open — being taken (IN_PROGRESS) or waiting for its correction (SUBMITTED) — is
  // RESUMED, never duplicated: leaving or reloading loses neither the answers nor the correction so far.
  const existing = db.prepare("SELECT id FROM exams WHERE user_id = ? AND unit_id = ? AND subject_id IS NULL AND status IN ('IN_PROGRESS','SUBMITTED') ORDER BY id DESC LIMIT 1").get(userId, unitId);
  if (existing) return { exam: get(db, userId, existing.id), resumed: true };

  const exercises = db.prepare('SELECT id FROM exercises WHERE user_id = ? AND unit_id = ? AND archived_at IS NULL ORDER BY order_index, id').all(userId, unitId);
  const versions = exercises
    .map((e) => ({ exerciseId: e.id, version: db.prepare('SELECT id FROM exercise_versions WHERE user_id = ? AND exercise_id = ? ORDER BY id DESC LIMIT 1').get(userId, e.id) }))
    .filter((e) => e.version);
  if (versions.length === 0) throw new ExamError('NO_QUESTIONS', 'Esta aula ainda não tem exercícios para uma prova.');

  const nowIso = now().toISOString();
  const run = db.transaction(() => {
    const examId = db.prepare("INSERT INTO exams (user_id, unit_id, status, started_at) VALUES (?, ?, 'IN_PROGRESS', ?)").run(userId, unitId, nowIso).lastInsertRowid;
    const insert = db.prepare('INSERT INTO exam_items (user_id, exam_id, exercise_id, exercise_version_id, position) VALUES (?, ?, ?, ?, ?)');
    versions.forEach((v, position) => insert.run(userId, examId, v.exerciseId, v.version.id, position));
    return examId;
  });
  return { exam: get(db, userId, run()), resumed: false };
}

export const SUBJECT_EXAM_MAX_QUESTIONS = 20;

/**
 * A discipline exam: up to ${SUBJECT_EXAM_MAX_QUESTIONS} questions drawn from ALL the discipline's units.
 * Sampling is deterministic and explainable (no randomness, no scoring model):
 *   1) questions the student got wrong last time ("para reforçar") come first;
 *   2) then the rest, one per unit in turn (round-robin, units by id, questions by their order), so no unit
 *      swallows the exam;
 * and the chosen questions are presented grouped by unit, in stable order. An open discipline exam is RESUMED.
 */
export function startSubject(db, userId, { subjectId }, now = () => new Date()) {
  const subject = findOwnedSubject(db, userId, subjectId);
  if (!subject) throw new ExamError('NOT_FOUND', 'Disciplina não encontrada.');

  const existing = db.prepare("SELECT id FROM exams WHERE user_id = ? AND subject_id = ? AND status IN ('IN_PROGRESS','SUBMITTED') ORDER BY id DESC LIMIT 1").get(userId, subjectId);
  if (existing) return { exam: get(db, userId, existing.id), resumed: true };

  const candidates = db.prepare(`
    SELECT ex.id AS exercise_id, ex.unit_id, ex.order_index,
           (SELECT v.id FROM exercise_versions v WHERE v.user_id = ex.user_id AND v.exercise_id = ex.id ORDER BY v.id DESC LIMIT 1) AS version_id
    FROM exercises ex
    JOIN learning_units u ON u.user_id = ex.user_id AND u.id = ex.unit_id
    WHERE ex.user_id = ? AND u.subject_id = ? AND ex.archived_at IS NULL
    ORDER BY ex.unit_id, ex.order_index, ex.id
  `).all(userId, subjectId).filter((c) => c.version_id != null);
  if (candidates.length === 0) throw new ExamError('NO_QUESTIONS', 'Esta disciplina ainda não tem exercícios para uma prova.');

  const weak = new Set(Object.values(attemptsService.reinforcementByUnit(db, userId)).flat());
  const chosen = candidates.filter((c) => weak.has(c.exercise_id)).slice(0, SUBJECT_EXAM_MAX_QUESTIONS);
  const picked = new Set(chosen.map((c) => c.exercise_id));
  const queues = new Map();
  for (const c of candidates) {
    if (picked.has(c.exercise_id)) continue;
    if (!queues.has(c.unit_id)) queues.set(c.unit_id, []);
    queues.get(c.unit_id).push(c);
  }
  while (chosen.length < SUBJECT_EXAM_MAX_QUESTIONS && [...queues.values()].some((q) => q.length > 0)) {
    for (const q of queues.values()) {
      if (chosen.length >= SUBJECT_EXAM_MAX_QUESTIONS) break;
      if (q.length > 0) chosen.push(q.shift());
    }
  }
  chosen.sort((a, b) => a.unit_id - b.unit_id || a.order_index - b.order_index || a.exercise_id - b.exercise_id);

  const nowIso = now().toISOString();
  const run = db.transaction(() => {
    const examId = db.prepare("INSERT INTO exams (user_id, unit_id, subject_id, status, started_at) VALUES (?, ?, ?, 'IN_PROGRESS', ?)").run(userId, chosen[0].unit_id, subjectId, nowIso).lastInsertRowid;
    const insert = db.prepare('INSERT INTO exam_items (user_id, exam_id, exercise_id, exercise_version_id, position) VALUES (?, ?, ?, ?, ?)');
    chosen.forEach((c, position) => insert.run(userId, examId, c.exercise_id, c.version_id, position));
    return examId;
  });
  return { exam: get(db, userId, run()), resumed: false };
}

/** Saves what the student typed for one item. Only while the exam is IN_PROGRESS; answers are locked afterwards. */
export function saveAnswer(db, userId, examId, itemId, { answer } = {}) {
  const exam = findOwnedExam(db, userId, examId);
  if (exam.status !== 'IN_PROGRESS') throw new ExamError('INVALID_STATE', 'A prova já foi submetida: as respostas não podem mais ser alteradas.');
  if (typeof answer !== 'string') throw new ExamError('VALIDATION_FAILED', 'answer deve ser um texto.', 'answer');
  if (answer.length > MAX_ANSWER_LENGTH) throw new ExamError('VALIDATION_FAILED', `answer excede o máximo de ${MAX_ANSWER_LENGTH} caracteres.`, 'answer');
  const item = db.prepare('SELECT id FROM exam_items WHERE user_id = ? AND exam_id = ? AND id = ?').get(userId, examId, itemId);
  if (!item) throw new ExamError('NOT_FOUND', 'Questão da prova não encontrada.');
  db.prepare('UPDATE exam_items SET student_answer = ? WHERE user_id = ? AND id = ?').run(answer.trim() === '' ? null : answer, userId, itemId);
  return { saved: true, answeredCount: db.prepare("SELECT COUNT(*) AS n FROM exam_items WHERE user_id = ? AND exam_id = ? AND student_answer IS NOT NULL AND TRIM(student_answer) <> ''").get(userId, examId).n };
}

/**
 * The student's own judgement of one item, made AFTER submitting, with the gabarito in front of them
 * (the questions are open-response, so only the student can say "acertei"/"errei" — the same
 * self-report model as Estudar agora). Can be changed until the exam is finalized (EXAM-3).
 */
export function judge(db, userId, examId, itemId, { outcome } = {}) {
  const exam = findOwnedExam(db, userId, examId);
  if (exam.status === 'IN_PROGRESS') throw new ExamError('INVALID_STATE', 'Submeta a prova antes de corrigir.');
  if (exam.status === 'CORRECTED') throw new ExamError('INVALID_STATE', 'A correção desta prova já foi concluída.');
  if (outcome !== 'CORRECT' && outcome !== 'INCORRECT') throw new ExamError('VALIDATION_FAILED', 'outcome deve ser CORRECT ou INCORRECT.', 'outcome');
  const item = db.prepare('SELECT id FROM exam_items WHERE user_id = ? AND exam_id = ? AND id = ?').get(userId, examId, itemId);
  if (!item) throw new ExamError('NOT_FOUND', 'Questão da prova não encontrada.');
  db.prepare('UPDATE exam_items SET outcome = ? WHERE user_id = ? AND id = ?').run(outcome, userId, itemId);
  return get(db, userId, examId);
}

/**
 * Finishes the correction: SUBMITTED -> CORRECTED, and the result ENTERS the longitudinal ledger exactly once.
 * Every judged item becomes a server-owned attempt (self-report, no review task) and ONE aggregate
 * INITIAL_PRACTICE evidence row links them — the same shape "Estudar agora" writes, so Plano, "para reforçar"
 * (last attempt wrong), Estatísticas and the trends all see the exam with no new mechanism. Idempotent:
 * finalizing a CORRECTED exam returns it untouched (no second evidence, no second set of attempts).
 * Does NOT create review_tasks, mastery or any schedule.
 */
export function finalize(db, userId, examId, { evidenceDate } = {}, now = () => new Date()) {
  const exam = findOwnedExam(db, userId, examId);
  if (exam.status === 'CORRECTED') return get(db, userId, examId);
  if (exam.status === 'IN_PROGRESS') throw new ExamError('INVALID_STATE', 'Submeta a prova antes de concluir a correção.');
  const rows = itemRows(db, userId, examId);
  const pending = rows.filter((r) => r.outcome == null).length;
  if (pending > 0) throw new ExamError('INCOMPLETE', `Falta corrigir ${pending} ${pending === 1 ? 'questão' : 'questões'} antes de concluir.`);

  // One evidence row PER UNIT: a discipline exam measures several units, and each unit's history must only
  // count the questions that belong to it. A single-unit exam is the one-group case of the same code.
  const byUnit = new Map();
  for (const r of rows) {
    if (!byUnit.has(r.item_unit_id)) byUnit.set(r.item_unit_id, []);
    byUnit.get(r.item_unit_id).push(r);
  }
  const date = evidenceDate ?? now().toISOString().slice(0, 10);
  const run = db.transaction(() => {
    const evidenceIds = [];
    for (const [unitId, group] of byUnit) {
      const attemptIds = [];
      for (const r of group) {
        const attempt = attemptsService.start(db, userId, { exerciseId: r.exercise_id }, now);
        attemptsService.submit(db, userId, attempt.id, { outcome: r.outcome, assessmentMethod: 'SELF_REPORT' }, now);
        attemptIds.push(attempt.id);
      }
      const evidence = evidenceService.create(db, userId, {
        unitId,
        type: 'INITIAL_PRACTICE',
        questionsCount: group.length,
        correctCount: group.filter((r) => r.outcome === 'CORRECT').length,
        evidenceDate: date,
        attemptIds,
      });
      evidenceIds.push(evidence.id);
    }
    const link = db.prepare('INSERT INTO exam_evidence (user_id, exam_id, evidence_id) VALUES (?, ?, ?)');
    for (const id of evidenceIds) link.run(userId, examId, id);
    db.prepare("UPDATE exams SET status = 'CORRECTED', corrected_at = ?, evidence_id = ? WHERE user_id = ? AND id = ? AND status = 'SUBMITTED'")
      .run(now().toISOString(), evidenceIds[0], userId, examId);
  });
  run();
  return get(db, userId, examId);
}

/** IN_PROGRESS -> SUBMITTED, once. Submitting again returns the same correction data and changes nothing. */
export function submit(db, userId, examId, now = () => new Date()) {
  const exam = findOwnedExam(db, userId, examId);
  if (exam.status === 'IN_PROGRESS') {
    db.prepare("UPDATE exams SET status = 'SUBMITTED', submitted_at = ? WHERE user_id = ? AND id = ? AND status = 'IN_PROGRESS'").run(now().toISOString(), userId, examId);
  }
  return get(db, userId, examId);
}
