// History of the summary text of a draft (migration 048). The CURRENT text lives in generated_drafts; this module keeps the texts that were
// replaced, so the student can list, compare and restore an earlier one and never loses what they wrote.
// It owns ONLY the `draft_summary_versions` rows; generated-drafts.js decides when a snapshot is taken and applies a restore through
// reviseSummary (so a restore is validated and itself snapshotted). Nothing here calls a provider or spends credit.

// An autosave can replace the student's own text many times in a minute: snapshots of student text closer than this are folded into the
// newest one. The text the AI wrote, and the first student text that replaced it, are always kept.
export const BURST_WINDOW_MS = 60_000;

const toDto = (row) => ({ version: row.version, origin: row.origin, createdAt: row.created_at, ...(row.summary !== undefined ? { summary: row.summary } : {}) });

/** Keeps the text that is about to be replaced. `force` bypasses the burst rule (a restore always keeps what it replaces). */
export function recordSummaryVersion(db, userId, draftId, { version, summary, origin, force = false, now = () => new Date() }) {
  if (typeof summary !== 'string' || summary.length === 0) return false;
  if (!force && origin === 'HUMAN_EDITED') {
    const newest = db.prepare('SELECT created_at FROM draft_summary_versions WHERE user_id = ? AND draft_id = ? ORDER BY version DESC LIMIT 1').get(userId, draftId);
    if (newest && now().getTime() - Date.parse(newest.created_at) < BURST_WINDOW_MS) return false;
  }
  return db.prepare(`INSERT OR IGNORE INTO draft_summary_versions (user_id, draft_id, version, summary, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, draftId, version, summary, origin === 'HUMAN_EDITED' ? 'HUMAN_EDITED' : 'GENERATED', now().toISOString()).changes === 1;
}

/** Earlier versions, newest first, without their text (the list stays small; a version is fetched on its own). */
export function listSummaryVersions(db, userId, draftId) {
  return db.prepare('SELECT version, origin, created_at FROM draft_summary_versions WHERE user_id = ? AND draft_id = ? ORDER BY version DESC').all(userId, draftId).map(toDto);
}

export function getSummaryVersion(db, userId, draftId, version) {
  const row = db.prepare('SELECT version, origin, created_at, summary FROM draft_summary_versions WHERE user_id = ? AND draft_id = ? AND version = ?').get(userId, draftId, version);
  return row ? toDto(row) : null;
}
