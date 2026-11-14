// REUSE of reviewed AI content between accounts (migration 046). Pure data access: it calls no model and builds no draft (generated-drafts.js does,
// so the reused content goes through the same normalization, audit and human review as any generated draft).
//
// Key: (content_digest, generation_locale). The digest is the SHA-256 of the exact segments sent to the model, so only the SAME text matches:
// another passage of the book, another edition or a re-scan with different text is a miss and is generated normally.
// Consent: nothing is contributed unless the student opted in (reuse_consent). Receiving needs no consent: the receiver already holds the text.
// What is contributed: AI content a student accepted WITHOUT editing it (summary origin GENERATED; questions origin GENERATED, ACCEPTED, never edited).
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export function isReuseGranted(db, userId) {
  return db.prepare('SELECT granted FROM reuse_consent WHERE user_id = ?').get(userId)?.granted === 1;
}

/** Turning it off also withdraws what this student contributed: it stops being offered (copies already received stay with their owners). */
export function setReuseConsent(db, userId, granted, now = () => new Date()) {
  const at = now().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO reuse_consent (user_id, granted, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET granted = excluded.granted, updated_at = excluded.updated_at`).run(userId, granted ? 1 : 0, at);
    if (!granted) db.prepare("UPDATE shared_content SET status = 'WITHDRAWN', updated_at = ? WHERE contributor_user_id = ?").run(at, userId);
  })();
  return { granted: granted === true };
}

/** The edition identity this student's file declares (migration 044), used only to refuse a reuse that two known editions contradict. */
export function bibliographyOf(db, userId, sourceId) {
  const row = db.prepare('SELECT bib_title, bib_edition, bib_year, bib_isbn FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
  return { title: row?.bib_title ?? null, edition: row?.bib_edition ?? null, year: row?.bib_year ?? null, isbn: row?.bib_isbn ?? null };
}

/** Two sources that both declare an ISBN or an edition and disagree are different books: equal text would be a coincidence, not a reason to share. */
function editionsContradict(entry, bib) {
  if (entry.bib_isbn && bib.isbn && !sameText(entry.bib_isbn, bib.isbn)) return true;
  if (entry.bib_edition && bib.edition && !sameText(entry.bib_edition, bib.edition)) return true;
  return false;
}


/** An accepted, unedited, AI-written part of a draft that may be offered to others. Nothing else is ever read from the draft. */
function eligibleParts(content) {
  const summaryOk = content.summaryOrigin === 'GENERATED' && content.summaryEditedAt == null && typeof content.summary === 'string' && content.summary.trim().length > 0;
  const questions = (content.questions ?? [])
    .filter((q) => q.origin === 'GENERATED' && q.status !== 'REJECTED' && q.editedAt == null)
    .map(({ question, questionType, answer, explanation, hint, sourceSpans }) => ({ question, questionType, answer, explanation, hint: hint ?? null, sourceSpans }));
  return { summaryOk, questions };
}

/**
 * Called after a draft was accepted. No-op without consent, without a recorded input digest, or when nothing eligible exists.
 * A summary starts an entry; questions join an existing entry that has none (the first reviewed set wins, it is not rewritten).
 * Returns what was contributed, for the tests; the caller never lets a failure here undo an acceptance.
 */
export function contributeAcceptedDraft(db, userId, draftRow, content, { sourceId, now = () => new Date() } = {}) {
  if (!draftRow.input_sha256 || !isReuseGranted(db, userId)) return { contributed: false };
  const locale = content.generationLocale;
  if (!locale) return { contributed: false };
  const { summaryOk, questions } = eligibleParts(content);
  const at = now().toISOString();
  const existing = db.prepare('SELECT * FROM shared_content WHERE content_digest = ? AND generation_locale = ?').get(draftRow.input_sha256, locale);
  if (existing && existing.status === 'ACTIVE') {
    if (JSON.parse(existing.questions_json).length === 0 && questions.length > 0) {
      db.prepare('UPDATE shared_content SET questions_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(questions), at, existing.id);
      return { contributed: true, sharedId: existing.id, added: 'questions' };
    }
    return { contributed: false, sharedId: existing.id };
  }
  if (!summaryOk) return { contributed: false };
  const bib = bibliographyOf(db, userId, sourceId);
  const summary = JSON.stringify({ summary: content.summary, summarySourceSpans: content.summarySourceSpans ?? [], summaryEvidence: content.summaryEvidence ?? [] });
  const values = [content.sourceLanguage ?? null, bib.title, bib.edition, bib.year, bib.isbn, summary, JSON.stringify(questions),
    draftRow.provider, draftRow.model_version, draftRow.prompt_version, userId, at];
  if (existing) { // a withdrawn entry for the same text is taken over by this contributor
    db.prepare(`UPDATE shared_content SET source_language = ?, bib_title = ?, bib_edition = ?, bib_year = ?, bib_isbn = ?, summary_json = ?, questions_json = ?,
                provider = ?, model_version = ?, prompt_version = ?, contributor_user_id = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(...values, existing.id);
    return { contributed: true, sharedId: existing.id, added: 'summary' };
  }
  const r = db.prepare(`INSERT INTO shared_content (content_digest, generation_locale, source_language, bib_title, bib_edition, bib_year, bib_isbn, summary_json, questions_json,
                        provider, model_version, prompt_version, contributor_user_id, created_at, updated_at, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`)
    .run(draftRow.input_sha256, locale, content.sourceLanguage ?? null, bib.title, bib.edition, bib.year, bib.isbn, summary, JSON.stringify(questions),
      draftRow.provider, draftRow.model_version, draftRow.prompt_version, userId, at, at);
  return { contributed: true, sharedId: Number(r.lastInsertRowid), added: 'summary' };
}

/** The active entry for exactly this text and language, unless the two editions are known to differ. Never returns the contributor. */
export function findShared(db, { digest, locale, bib = {} }) {
  if (!digest || !locale) return null;
  const row = db.prepare("SELECT * FROM shared_content WHERE content_digest = ? AND generation_locale = ? AND status = 'ACTIVE'").get(digest, locale);
  if (!row || editionsContradict(row, bib)) return null;
  return {
    id: row.id, sourceLanguage: row.source_language,
    ...JSON.parse(row.summary_json),
    questions: JSON.parse(row.questions_json),
    generatedBy: { provider: row.provider, modelVersion: row.model_version, promptVersion: row.prompt_version },
  };
}

export function recordReuse(db, sharedId) {
  db.prepare('UPDATE shared_content SET reuse_count = reuse_count + 1 WHERE id = ?').run(sharedId);
}

