// A summary regenerated over an existing one keeps the previous draft until the student decides which to keep
// (spec .specs/proposals/RESUMO-ATUAL-E-LIXEIRA-2026-11-12.md, migration 043). This module owns ONLY the `draft_replacements` rows and
// the deletion of the draft that loses; generated-drafts.js decides WHEN a replacement is recorded and turns the outcomes into API errors.
//
// Rules this module enforces:
//   - only a draft with status 'DRAFT' is ever deleted. An ACCEPTED draft is a lesson in study (units, reviews, evidence hang from it);
//   - a draft is deleted only after the jobs that point at it lose that pointer (a finished job stays as history);
//   - one decision pending per proposal (primary key); nothing here spends credit or calls a provider.

export const REPLACEMENT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REPLACEMENT_DECISIONS = Object.freeze(['KEEP_NEW', 'RESTORE_PREVIOUS']);

const toDto = (row) => (row ? {
  proposalId: row.proposal_id,
  newDraftId: row.new_draft_id,
  previousDraftId: row.previous_draft_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
} : null);

export function findPending(db, userId, proposalId) {
  return toDto(db.prepare('SELECT * FROM draft_replacements WHERE user_id = ? AND proposal_id = ?').get(userId, proposalId));
}

export function findPendingByNewDraft(db, userId, newDraftId) {
  return toDto(db.prepare('SELECT * FROM draft_replacements WHERE user_id = ? AND new_draft_id = ?').get(userId, newDraftId));
}

/** Records that `newDraftId` replaced `previousDraftId`. Call inside the transaction that inserts the new draft. */
export function recordReplacement(db, userId, { proposalId, newDraftId, previousDraftId, now = () => new Date() }) {
  const at = now();
  db.prepare(`
    INSERT INTO draft_replacements (user_id, proposal_id, new_draft_id, previous_draft_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, proposalId, newDraftId, previousDraftId, at.toISOString(), new Date(at.getTime() + REPLACEMENT_RETENTION_DAYS * DAY_MS).toISOString());
}

/** Deletes one DRAFT row (and detaches the jobs that point at it). Returns whether anything was deleted; anything else is left alone. */
function deleteDraftOnly(db, userId, draftId) {
  const row = db.prepare('SELECT status FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!row || row.status !== 'DRAFT') return false;
  db.prepare('UPDATE generation_jobs SET draft_id = NULL WHERE user_id = ? AND draft_id = ?').run(userId, draftId);
  return db.prepare("DELETE FROM generated_drafts WHERE user_id = ? AND id = ? AND status = 'DRAFT'").run(userId, draftId).changes === 1;
}

/** True when the student changed this DRAFT (edited the summary, edited or added a question). Only a plain DRAFT row can be discarded. */
function hasStudentEdits(db, userId, draftId) {
  const row = db.prepare("SELECT draft_json FROM generated_drafts WHERE user_id = ? AND id = ? AND status = 'DRAFT'").get(userId, draftId);
  if (!row) return false;
  let content;
  try { content = JSON.parse(row.draft_json); } catch { return true; } // unreadable content: never discard it without asking
  return content?.summaryOrigin === 'HUMAN_EDITED' || Boolean(content?.summaryEditedAt)
    || (Array.isArray(content?.questions) && content.questions.some((q) => (q?.origin && q.origin !== 'GENERATED') || q?.editedAt));
}

const clear = (db, userId, proposalId) => db.prepare('DELETE FROM draft_replacements WHERE user_id = ? AND proposal_id = ?').run(userId, proposalId);

/**
 * Applies the student's decision for the pending replacement that `newDraftId` carries.
 * Returns { outcome: 'NEEDS_CONFIRMATION' } (the draft that would be deleted holds the student's edits; nothing was deleted),
 * { outcome: 'NOT_PENDING' } (nothing pending for that draft), { outcome: 'BLOCKED' } (RESTORE_PREVIOUS while the new draft
 * already became a lesson: nothing is deleted) or { outcome: 'DONE', decision, currentDraftId, deletedDraftId }.
 */
export function applyDecision(db, userId, newDraftId, decision, { confirmDiscard = false } = {}) {
  return db.transaction(() => {
    const pending = findPendingByNewDraft(db, userId, newDraftId);
    if (!pending) return { outcome: 'NOT_PENDING' };
    // The draft that loses is the previous one (KEEP_NEW) or the new one (RESTORE_PREVIOUS). If the student worked on it, nothing is
    // deleted until the decision is repeated with confirmDiscard (checked inside this transaction, before any deletion).
    const loser = decision === 'KEEP_NEW' ? pending.previousDraftId : newDraftId;
    if (!confirmDiscard && hasStudentEdits(db, userId, loser)) return { outcome: 'NEEDS_CONFIRMATION' };
    if (decision === 'KEEP_NEW') {
      // the previous draft is deleted only if it is still a plain draft: if it was accepted meanwhile it is a lesson and stays
      const deleted = deleteDraftOnly(db, userId, pending.previousDraftId);
      clear(db, userId, pending.proposalId);
      return { outcome: 'DONE', decision, currentDraftId: newDraftId, deletedDraftId: deleted ? pending.previousDraftId : null };
    }
    const deleted = deleteDraftOnly(db, userId, newDraftId);
    if (!deleted) return { outcome: 'BLOCKED' };
    clear(db, userId, pending.proposalId);
    return { outcome: 'DONE', decision, currentDraftId: pending.previousDraftId, deletedDraftId: newDraftId };
  }).immediate();
}

/**
 * The student discards one plain DRAFT (the whole unfinished summary). Nothing else is touched: the book, the unit (trecho) and every
 * accepted lesson stay. Outcomes: NOT_FOUND, NOT_DISCARDABLE (already a lesson: it is not a draft any more), IN_DECISION (the draft
 * takes part in a pending replacement: the student decides that first), NEEDS_CONFIRMATION (the student edited it and confirmDiscard
 * was not given; nothing deleted) or DONE { proposalId }.
 */
export function discardDraft(db, userId, draftId, { confirmDiscard = false } = {}) {
  return db.transaction(() => {
    const row = db.prepare('SELECT status, proposal_id FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
    if (!row) return { outcome: 'NOT_FOUND' };
    if (row.status !== 'DRAFT') return { outcome: 'NOT_DISCARDABLE' };
    const inDecision = db.prepare('SELECT 1 FROM draft_replacements WHERE user_id = ? AND (new_draft_id = ? OR previous_draft_id = ?)').get(userId, draftId, draftId);
    if (inDecision) return { outcome: 'IN_DECISION' };
    if (!confirmDiscard && hasStudentEdits(db, userId, draftId)) return { outcome: 'NEEDS_CONFIRMATION' };
    if (!deleteDraftOnly(db, userId, draftId)) return { outcome: 'NOT_DISCARDABLE' };
    return { outcome: 'DONE', proposalId: row.proposal_id };
  }).immediate();
}

/**
 * Settles every replacement whose 30 days passed with no decision: the previous draft is deleted (if it is still a plain draft) and the
 * new one simply stays current. Deterministic: it depends only on `now`. Returns how many decisions were settled.
 */
export function settleExpired(db, { now = () => new Date() } = {}) {
  const nowIso = now().toISOString();
  // the common case (nothing expired) is a read, never a write lock
  if (!db.prepare('SELECT 1 FROM draft_replacements WHERE expires_at <= ? LIMIT 1').get(nowIso)) return 0;
  return db.transaction(() => {
    // read INSIDE the write transaction: a decision taken a moment earlier must never be undone by a stale list
    const due = db.prepare('SELECT user_id, proposal_id, previous_draft_id FROM draft_replacements WHERE expires_at <= ?').all(nowIso);
    for (const item of due) {
      deleteDraftOnly(db, item.user_id, item.previous_draft_id);
      clear(db, item.user_id, item.proposal_id);
    }
    return due.length;
  }).immediate();
}
