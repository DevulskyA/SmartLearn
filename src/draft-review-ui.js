// T38: review an AI-generated draft and accept it into normal study.
// Self-contained and DOM-free, mirroring migration-ui.js/source-proposals-
// ui.js's separation of concerns. Every function here is explicit about
// what it does NOT do: generateDraft() never creates a unit; acceptDraft()
// is the ONLY function in this module with a real, definitive effect
// (creates a real unit/exercises/reviews), and it is idempotent — calling
// it again for an already-accepted draft returns the original result.
import { apiRequest, ApiError, NetworkError } from './api-client.js';
import { t } from './i18n/index.js';
import { jobFailureMessage } from './lesson-view-model.js';
import * as GenerationJobsUI from './generation-jobs-ui.js';

function fail(err) {
  if (err instanceof ApiError) {
    return { ok: false, code: err.code, message: err.message, field: err.field };
  }
  if (err instanceof NetworkError) {
    return { ok: false, code: 'NETWORK_ERROR', message: t('draftReview.networkError') };
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

/** The pending choice between a new version and the previous one for this trecho ({newDraftId, previousDraftId, ...}), or null. */
export async function getDecision(proposalId) {
  try {
    const { pending } = await apiRequest(`/v1/proposals/${proposalId}/decision`);
    return { ok: true, pending };
  } catch (err) { return fail(err); }
}

/** Keeps the new version (KEEP_NEW) or goes back to the previous one (RESTORE_PREVIOUS). Deleting a version the student edited needs confirmDiscard. */
export async function decideReplacement(draftId, decision, { confirmDiscard = false } = {}) {
  try {
    const result = await apiRequest(`/v1/drafts/${draftId}/decision`, { method: 'POST', body: confirmDiscard ? { decision, confirmDiscard: true } : { decision } });
    return { ok: true, ...result };
  } catch (err) { return fail(err); }
}

/** Discards an unfinished summary. The server refuses when the student edited it unless `confirmDiscard` is true (code DISCARD_NEEDS_CONFIRMATION). */
export async function discardDraft(draftId, { confirmDiscard = false } = {}) {
  try {
    await apiRequest(`/v1/drafts/${draftId}${confirmDiscard ? '?confirmDiscard=true' : ''}`, { method: 'DELETE' });
    return { ok: true };
  } catch (err) {
    // a bare 404 (no message from the draft service) means the server does not know this route yet: say so, never show the raw code
    if (err instanceof ApiError && err.code === 'NOT_FOUND' && (!err.message || err.message === 'NOT_FOUND')) {
      return { ok: false, code: 'ROUTE_MISSING', message: t('materials.draft.discardUnavailable') };
    }
    return fail(err);
  }
}

/** Saves ONLY the summary (the questions are untouched). `expectedVersion` = summaryVersion the caller read. */
export async function reviseSummary(draftId, { summary, expectedVersion }) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/summary`, { method: 'PATCH', body: { summary, expectedVersion } });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Explicit re-audit with the current deterministic rules (no model call). Changes only the audit; `reaudit` says how many findings changed. */
export async function reauditDraft(draftId) {
  try {
    const { draft, reaudit } = await apiRequest(`/v1/drafts/${draftId}/reaudit`, { method: 'POST', body: {} });
    return { ok: true, draft, reaudit };
  } catch (err) { return fail(err); }
}

/** Asks the AI for corrections of what the check found in the summary, as excerpts. Never changes the summary; uses one credit. */
export async function proposeCorrections(draftId) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/corrections`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Accepts ONE proposed excerpt (replaces exactly that text in the summary). */
export async function applyCorrection(draftId, key) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/corrections/${key}/apply`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Dismisses ONE proposed excerpt; the summary is untouched. */
export async function dismissCorrection(draftId, key) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/corrections/${key}`, { method: 'DELETE' });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Meaning-flipping words of the source missing from the summary (deterministic, no AI, no credit). */
export async function summaryFidelity(draftId) {
  try {
    const { fidelity } = await apiRequest(`/v1/drafts/${draftId}/fidelity`);
    return { ok: true, fidelity };
  } catch (err) { return fail(err); }
}

/** Earlier texts of the summary (migration 048), newest first, without the text. */
export async function listSummaryVersions(draftId) {
  try {
    const { versions } = await apiRequest(`/v1/drafts/${draftId}/summary-versions`);
    return { ok: true, versions };
  } catch (err) { return fail(err); }
}

export async function readSummaryVersion(draftId, version) {
  try {
    const { version: found } = await apiRequest(`/v1/drafts/${draftId}/summary-versions/${version}`);
    return { ok: true, version: found };
  } catch (err) { return fail(err); }
}

/** Puts an earlier text back as the current summary; the text it replaces stays in the history. */
export async function restoreSummaryVersion(draftId, version) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/summary-versions/${version}/restore`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Asks the AI to check the summary AS IT IS against the source. Only reports (never rewrites the student's text); uses one credit. */
export async function auditSummary(draftId) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/audit-summary`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

const ACTIVE_JOB_STATES =new Set(['QUEUED', 'CALLING_PROVIDER', 'STALLED']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Summary-first draft (or the draft that adds questions to a lesson): writes the questions into THAT draft, as a background job on the
 * server (same record, credit, consent and cancel as the summary), and waits for it. The state shown always comes from the server, so a
 * job already running (the student left and came back) is joined, not repeated: pass its `jobId`. `onJob(job)` sees every state.
 * The questions still need the student's review before anything reaches a lesson.
 */
export async function generateDraftQuestions(draftId, { jobId = null, onJob = () => {}, pollMs = 1500 } = {}) {
  try {
    let { job } = jobId === null
      ? await apiRequest('/v1/generation-jobs', { method: 'POST', body: { draftId } })
      : await apiRequest(`/v1/generation-jobs/${jobId}`);
    onJob(job);
    while (ACTIVE_JOB_STATES.has(job.state)) {
      await sleep(pollMs);
      ({ job } = await apiRequest(`/v1/generation-jobs/${job.id}`));
      onJob(job);
    }
    if (job.state === 'SUCCEEDED') {
      const { draft } = await apiRequest(`/v1/drafts/${draftId}`);
      return { ok: true, draft };
    }
    if (job.state === 'CANCELLED') return { ok: false, code: 'CANCELLED', message: t('editor.questionsLater.cancelled') };
    return { ok: false, code: job.errorCode, message: jobFailureMessage(job) };
  } catch (err) { return fail(err); }
}

/** The questions job of this draft that is running right now (the student left and came back), or null. */
export async function activeQuestionsJob(draft) {
  const listed = await GenerationJobsUI.listJobs();
  if (!listed.ok) return null;
  return listed.jobs.find((job) => job.kind === 'QUESTIONS' && job.targetDraftId === draft.id && ACTIVE_JOB_STATES.has(job.state)) ?? null;
}

/** Stops the questions job; the server ends the provider's process tree. */
export function cancelQuestionsJob(jobId) {
  return GenerationJobsUI.cancelJob(jobId);
}

/** A lesson accepted without questions asks for them: opens (or returns) the draft that will carry them. No model is called here. */
export async function openLessonQuestions(unitId) {
  try {
    const { draft } = await apiRequest(`/v1/learning-units/${unitId}/questions-draft`, { method: 'POST', body: {} });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

/** Saves ONE question by its stable id (text, citation and/or review status); nothing else in the lesson changes. */
export async function reviseQuestion(draftId, questionId, patch) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/questions/${encodeURIComponent(questionId)}`, { method: 'PATCH', body: patch });
    return { ok: true, draft };
  } catch (err) { return fail(err); }
}

export async function deleteQuestion(draftId, questionId) {
  try {
    const { draft } = await apiRequest(`/v1/drafts/${draftId}/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
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
export async function acceptDraft(draftId, { subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate, sourceKind, expectedRevision, acknowledgeSummaryFindings }) {
  try {
    const { acceptance } = await apiRequest(`/v1/drafts/${draftId}/accept`, {
      method: 'POST',
      body: { subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate: lessonDate ?? null, sourceKind: sourceKind ?? null, expectedRevision, acknowledgeSummaryFindings: acknowledgeSummaryFindings === true },
    });
    return { ok: true, acceptance };
  } catch (err) { return fail(err); }
}

/**
 * READ-ONLY: what accepting this draft would create (subject, unit, exercises with the question each came from, the
 * rejected questions that stay out), computed by the server with the same preparation as the acceptance. Nothing is written.
 */
export async function previewAcceptance(draftId, { subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate, expectedRevision, acknowledgeSummaryFindings }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ subjectId, newSubjectName, newSubjectColor, studyDate, lessonDate, expectedRevision, acknowledgeSummaryFindings: acknowledgeSummaryFindings === true ? 'true' : undefined })) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  try {
    const { preview } = await apiRequest(`/v1/drafts/${draftId}/accept-preview?${params.toString()}`);
    return { ok: true, preview };
  } catch (err) { return fail(err); }
}
