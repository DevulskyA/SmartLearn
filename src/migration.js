export const BROWSER_STORE_KEY = "smartlearn:browser-db";

export function hasBrowserStoreData() {
  try {
    const raw = localStorage.getItem(BROWSER_STORE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return Array.isArray(state?.studyRecords) && state.studyRecords.length > 0;
  } catch {
    return false;
  }
}

export function buildMigrationStatements(state) {
  const stmts = [];
  for (const s of state.subjects ?? []) {
    stmts.push({
      sql: "INSERT OR REPLACE INTO subjects (id, name, created_at, updated_at, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      params: [s.id, s.name, s.createdAt, s.updatedAt, s.isActive ? 1 : 0, s.sortOrder ?? 0],
    });
  }
  for (const src of state.sources ?? []) {
    stmts.push({
      sql: "INSERT OR REPLACE INTO sources (id, name, created_at, updated_at, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      params: [src.id, src.name, src.createdAt, src.updatedAt, src.isActive ? 1 : 0, src.sortOrder ?? 0],
    });
  }
  for (const r of state.studyRecords ?? []) {
    stmts.push({
      sql: "INSERT OR REPLACE INTO study_records (id, subject_id, source_id, study_date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [r.id, r.subjectId, r.sourceId, r.studyDate, r.content, r.createdAt, r.updatedAt],
    });
  }
  for (const t of state.reviewTasks ?? []) {
    stmts.push({
      sql: "INSERT OR REPLACE INTO review_tasks (id, study_record_id, review_number, due_date, completed_at, review_done, questions_done, questions_count, correct_count, score_percent, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        t.id, t.studyRecordId, t.reviewNumber, t.dueDate,
        t.completedAt ?? null, t.reviewDone ? 1 : 0, t.questionsDone ? 1 : 0,
        t.questionsCount ?? null, t.correctCount ?? null, t.scorePercent ?? null,
        t.comment ?? null, t.createdAt, t.updatedAt,
      ],
    });
  }
  return stmts;
}
