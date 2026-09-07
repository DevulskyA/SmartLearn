// T20: server-authoritative replacement for src/db.js's local BrowserStore/
// SQLite `DB` object. Exports the SAME named `DB` shape wherever the old
// method's semantics still make sense against the real server (subjects,
// settings, exercises, learning-units, learning-evidence) — see the
// contract matrix in test/remote-store.test.js for exactly which methods
// are drop-in-compatible vs. deliberately redesigned.
//
// Everything here is a thin DTO-mapping layer over api-client.js's typed
// requests to the /v1 domain endpoints already built server-side
// (T13-T19). There is no generic "run this SQL" escape hatch and no path
// that can inject an owner id — every request rides the session cookie,
// and the server derives user_id itself.
import { apiRequest, ApiError, NetworkError } from './api-client.js';
import { REVIEW_DAY_OFFSETS } from '../shared/review-schedule.js';

export class RemoteStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RemoteStoreError';
    this.code = code;
  }
}

// -- subjects ---------------------------------------------------------------
// Server subjects DTO ({id,name,color,isActive,sortOrder,createdAt,
// updatedAt}) already matches src/db.js's mapSubject() exactly — no
// adapter needed.

const subjects = {
  async getAll() {
    const { subjects: rows } = await apiRequest('/v1/subjects');
    return rows;
  },
  async getActive() {
    const all = await subjects.getAll();
    return all.filter((s) => s.isActive);
  },
  async create({ name, color }) {
    const { subject } = await apiRequest('/v1/subjects', { method: 'POST', body: { name, color } });
    return subject;
  },
  async update(id, fields) {
    const { subject } = await apiRequest(`/v1/subjects/${id}`, { method: 'PATCH', body: fields });
    return subject;
  },
  async deactivate(id) {
    return subjects.update(id, { isActive: false });
  },
  async deleteIfEmpty(id) {
    await apiRequest(`/v1/subjects/${id}`, { method: 'DELETE' });
  },
  // src/app.js:1534 calls `DB.subjects.delete(id)`, a method that was NEVER
  // defined on the old local DB object — the button silently no-op'd
  // behind an empty catch{}. The only honest server operation available is
  // deleteEmpty (the server never hard-deletes a subject with owned
  // history — design.md's archive-not-delete stance). Routing here fixes
  // the dead call to a real, safely-guarded action instead of leaving it
  // broken; a subject with data now surfaces a real 409 SUBJECT_NOT_EMPTY
  // instead of nothing happening at all.
  async delete(id) {
    return subjects.deleteIfEmpty(id);
  },
};

// -- learning units -----------------------------------------------------------
// Server unitDto ({id,subjectId,title,sourceText,summaryBody,studyDate,
// createdAt,updatedAt}) already matches mapLearningUnit() exactly.

const learningUnits = {
  async getAll() {
    const { units } = await apiRequest('/v1/learning-units');
    return units;
  },
  async getByDate(dateStr) {
    // No server-side date filter exists (nor is one needed at V1 scale) —
    // filtering a full owned list client-side is the smallest sufficient
    // equivalent, not a new server endpoint for a single low-cardinality
    // per-user table.
    const all = await learningUnits.getAll();
    return all.filter((u) => u.studyDate === dateStr);
  },
  async update(id, fields) {
    if ('studyDate' in fields || 'subjectId' in fields) {
      throw new RemoteStoreError('UNSUPPORTED_FIELD', 'Correção de data de estudo e troca de disciplina ainda não são suportadas no modo servidor.');
    }
    const { unit } = await apiRequest(`/v1/learning-units/${id}`, { method: 'PATCH', body: fields });
    return unit;
  },
  async createWithReviews(data) {
    return apiRequest('/v1/learning-units', { method: 'POST', body: data });
  },
};

// -- review tasks -------------------------------------------------------------
// The new schema deliberately does NOT store reviewDone/questionsDone/
// scorePercent as per-task columns (design.md/T16: a review is completed
// atomically, with any question evidence recorded once as an aggregate
// learning_evidence row, never as incrementally-patched task fields —
// heritage.md explicitly rejects "manual checkboxes for derivable facts").
// So the mapped task DTO below synthesizes `reviewDone` from
// `completedAt != null` (the one fact review_tasks itself still owns) and
// leaves questionsCount/correctCount/scorePercent for the caller to read
// from learningEvidence (joined by reviewTaskId) — screens that show a
// per-task score must be adapted to that join, which is T21/T22's job,
// not something RemoteStore can paper over without reintroducing the
// per-task field-patch model the plan rejected.
function mapReviewTask(row) {
  return {
    id: row.id,
    unitId: row.unitId,
    unitTitle: row.unitTitle,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    reviewDone: row.completedAt != null,
    // The fixed schedule is a shared, ordered constant, so a task's
    // 1-based position in it is derivable from its stored offset — no
    // separate reviewNumber column exists or is needed server-side.
    reviewNumber: REVIEW_DAY_OFFSETS.indexOf(row.offsetDays) + 1,
  };
}

const reviewTasks = {
  async getAll() {
    const { reviewTasks: rows } = await apiRequest('/v1/review-tasks');
    return rows.map(mapReviewTask);
  },
  async getByUnit(unitId) {
    const { reviewTasks: rows } = await apiRequest(`/v1/review-tasks?unitId=${encodeURIComponent(unitId)}`);
    return rows.map(mapReviewTask);
  },
  async getForToday(dateStr) {
    const agendaResult = await agenda(dateStr);
    return agendaResult.today;
  },
  async getOverdue(dateStr) {
    const agendaResult = await agenda(dateStr);
    return agendaResult.overdue;
  },
  async getCompletedToday(dateStr) {
    const agendaResult = await agenda(dateStr);
    return agendaResult.completedToday;
  },
  async getTomorrow(dateStr) {
    const agendaResult = await agenda(dateStr);
    return agendaResult.tomorrow;
  },
  /**
   * Maps the two coherent partial-update shapes the current UI actually
   * sends (see test/remote-store.test.js's contract matrix) onto the
   * atomic complete()/reopen() endpoints. A bare `{questionsDone}` toggle
   * with no counts has no honest equivalent in the new model (there is no
   * "questions attempted but score unknown" state) — it is rejected
   * explicitly rather than silently doing nothing, so this becomes a
   * visible screen-adaptation item for T21/T22 instead of a silent gap.
   */
  async update(id, fields) {
    if (fields.reviewDone === false) {
      const result = await reopen(id);
      return { id, reopened: result.reopened };
    }
    if ('questionsCount' in fields || 'correctCount' in fields) {
      return complete(id, { questionsCount: fields.questionsCount, correctCount: fields.correctCount });
    }
    if (fields.reviewDone === true) {
      return complete(id, {});
    }
    throw new RemoteStoreError('UNSUPPORTED_PARTIAL_UPDATE', 'Esta combinação de campos não tem equivalente atômico no modo servidor.');
  },
};

async function agenda(dateStr) {
  const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
  const result = await apiRequest(`/v1/agenda${query}`);
  return {
    date: result.date,
    timezone: result.timezone,
    overdue: result.overdue.map(mapReviewTask),
    today: result.today.map(mapReviewTask),
    tomorrow: result.tomorrow.map(mapReviewTask),
    completedToday: result.completedToday.map(mapReviewTask),
  };
}

async function complete(id, { questionsCount, correctCount } = {}) {
  return apiRequest(`/v1/review-tasks/${id}/complete`, { method: 'POST', body: { questionsCount, correctCount } });
}

async function reopen(id) {
  return apiRequest(`/v1/review-tasks/${id}/reopen`, { method: 'POST' });
}

/** src/app.js:2951's combined "complete + record evidence" call — the
 * server's complete() already does both atomically in one transaction
 * (T16), so this is a direct 1:1 mapping, not two sequential requests. */
async function completeReviewWithEvidence({ taskId, questionsCount, correctCount }) {
  return complete(taskId, { questionsCount, correctCount });
}

// -- exercises ----------------------------------------------------------------
// Server exercise DTO is versioned ({id,unitId,orderIndex,archivedAt,
// currentVersion:{question,answer,hint,provenance}}); the old flat DTO
// (mapExercise: questionText/answerText/hintText/position) predates
// versioning. Flattened here so existing screen code reading `.questionText`
// etc. keeps working without also having to learn about exercise_versions
// — a real historical-fidelity upgrade (AC-18) hiding behind a stable read
// shape, not a downgrade of what T17 built.
function mapExercise(row) {
  return {
    id: row.id,
    unitId: row.unitId,
    questionText: row.currentVersion?.question ?? null,
    answerText: row.currentVersion?.answer ?? null,
    hintText: row.currentVersion?.hint ?? null,
    position: row.orderIndex,
    provenance: row.currentVersion?.provenance ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const exercises = {
  async getAll(unitId) {
    const { exercises: rows } = await apiRequest(`/v1/learning-units/${unitId}/exercises`);
    return rows.map(mapExercise);
  },
  async create({ unitId, questionText, answerText, hintText, provenance }) {
    const { exercise } = await apiRequest(`/v1/learning-units/${unitId}/exercises`, {
      method: 'POST',
      body: { question: questionText, answer: answerText, hint: hintText, provenance },
    });
    return mapExercise(exercise);
  },
  async update(id, { questionText, answerText, hintText, provenance }) {
    const { exercise } = await apiRequest(`/v1/exercises/${id}`, {
      method: 'PATCH',
      body: { question: questionText, answer: answerText, hint: hintText, provenance },
    });
    return mapExercise(exercise);
  },
  async delete(id) {
    // The server never hard-deletes an exercise (archive-not-delete, same
    // rationale as subjects) — this is the honest equivalent of the old
    // local hard delete.
    const { exercise } = await apiRequest(`/v1/exercises/${id}`, { method: 'PATCH', body: { isArchived: true } });
    return mapExercise(exercise);
  },
};

// -- learning evidence ----------------------------------------------------------
// Field-name/scale bridge only: old `context` -> new `type`, old
// `scorePercent` (0-100) -> new `score` (0-1 fraction, or null for unknown
// performance — never a fabricated 0, see T18).
function mapEvidence(row) {
  return {
    id: row.id,
    unitId: row.unitId,
    evidenceDate: row.evidenceDate,
    context: row.type,
    questionsCount: row.questionsCount,
    correctCount: row.correctCount,
    scorePercent: row.score != null ? row.score * 100 : null,
    reviewTaskId: row.reviewTaskId ?? null,
    createdAt: row.createdAt,
  };
}

const learningEvidence = {
  async getAll() {
    const { evidence } = await apiRequest('/v1/learning-evidence');
    return evidence.map(mapEvidence);
  },
  async getByUnit(unitId) {
    const { evidence } = await apiRequest(`/v1/learning-evidence?unitId=${encodeURIComponent(unitId)}`);
    return evidence.map(mapEvidence);
  },
  async create({ unitId, context, questionsCount, correctCount, evidenceDate }) {
    if (context === 'REVIEW') {
      throw new RemoteStoreError('UNSUPPORTED_DIRECT_REVIEW_EVIDENCE', 'Evidência de tipo REVIEW só pode ser criada concluindo uma revisão.');
    }
    const { evidence } = await apiRequest('/v1/learning-evidence', {
      method: 'POST',
      body: { unitId, type: context, questionsCount, correctCount, evidenceDate },
    });
    return mapEvidence(evidence);
  },
};

// -- settings ----------------------------------------------------------------
// The old shape (key/appVersion/reviewSchedule/lastBackupAt) predates
// multi-user accounts and had no concept of timezone. Fields the server
// doesn't track are passed through as null rather than invented.

const settings = {
  async get() {
    const { settings: row } = await apiRequest('/v1/settings');
    return { key: 'main', appVersion: null, reviewSchedule: row.reviewSchedule, lastBackupAt: null, timezone: row.timezone };
  },
  async update(fields) {
    if (!('timezone' in fields)) {
      throw new RemoteStoreError('UNSUPPORTED_FIELD', 'Apenas o fuso horário pode ser alterado no modo servidor — o cronograma de revisão é fixo.');
    }
    const { settings: row } = await apiRequest('/v1/settings', { method: 'PATCH', body: { timezone: fields.timezone } });
    return { key: 'main', appVersion: null, reviewSchedule: row.reviewSchedule, lastBackupAt: null, timezone: row.timezone };
  },
};

// -- export / import / reset --------------------------------------------------
// Server-side restore-from-snapshot (import) and whole-account reset
// (clearAll) are explicitly out of this task's scope (see tasks.md T22:
// "Offer legacy export until migration completes" / "Replace dangerous
// local reset affordances... with an explicit supported owned operation").
// These throw a clear, typed, discoverable error NOW rather than a silent
// no-op — the actual server-mode UX for both is T22's decision to make.

async function exportAll() {
  return apiRequest('/v1/export');
}

async function importAll() {
  throw new RemoteStoreError('NOT_YET_SUPPORTED', 'Restaurar um backup ainda não é suportado no modo servidor — use a exportação legada até a migração ser concluída.');
}

async function clearAll() {
  throw new RemoteStoreError('NOT_YET_SUPPORTED', 'Reiniciar todos os dados ainda não é uma operação suportada no modo servidor.');
}

export const DB = {
  // No local schema to initialize — the server owns its own migrations.
  // Kept as a resolved no-op returning DB itself so callers written
  // against `await DB.init()` keep working unchanged.
  async init() {
    return DB;
  },
  subjects,
  learningUnits,
  reviewTasks,
  exercises,
  learningEvidence,
  completeReviewWithEvidence,
  settings,
  exportAll,
  importAll,
  clearAll,
};

export { ApiError, NetworkError };
