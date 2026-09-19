// T38: review an AI-generated draft and accept it into normal study.
// Self-contained and DOM-free, mirroring migration-ui.js/source-proposals-
// ui.js's separation of concerns. Every function here is explicit about
// what it does NOT do: generateDraft() never creates a unit; acceptDraft()
// is the ONLY function in this module with a real, definitive effect
// (creates a real unit/exercises/reviews), and it is idempotent — calling
// it again for an already-accepted draft returns the original result.
import { apiRequest, ApiError, NetworkError } from './api-client.js';

function fail(err) {
  if (err instanceof ApiError) {
    return { ok: false, code: err.code, message: err.message, field: err.field };
  }
  if (err instanceof NetworkError) {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.' };
  }
  throw err;
}

/** Generates a new draft for a proposal. The result is NEVER scientific/
 * medical validation of the content — it is an unverified AI suggestion,
 * always shown with that caveat by the caller (src/app.js). */
export async function generateDraft(proposalId) {
  try {
    const { draft } = await apiRequest(`/v1/proposals/${proposalId}/drafts`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

export async function getDraft(draftId) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}`);
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Saves the reviewer's corrections (summary and/or the full question list). The server re-validates
 * them like any draft, re-runs the deterministic screen, bumps `revision` and returns the new draft —
 * so what gets accepted is exactly what the reviewer last saw. */
export async function reviseDraft(draftId, { summary, questions }) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}`, { method: 'PATCH', body: { summary, questions } });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/**
 * The one real, definitive action in this module: creates a unit +
 * exercises + 16 reviews from the draft's current content. Idempotent by
 * draftId — calling this again for an already-accepted draft returns the
 * exact original result rather than creating anything twice.
 *
 * `expectedRevision` must be the revision the caller actually read (from
 * `generateDraft`/`getDraft`'s own `draft.revision`) — the server rejects
 * the call with `REVISION_CONFLICT` if the draft was edited since, rather
 * than silently publishing content the caller never reviewed.
 */
export async function acceptDraft(draftId, { subjectId, newSubjectName, newSubjectColor, studyDate, expectedRevision }) {
  try {
    const { acceptance } = await apiRequest(`/v1/drafts/${draftId}/accept`, {
      method: 'POST',
      body: { subjectId, newSubjectName, newSubjectColor, studyDate, expectedRevision },
    });
    return { ok: true, acceptance };
  } catch (err) { return fail(err); }
}
