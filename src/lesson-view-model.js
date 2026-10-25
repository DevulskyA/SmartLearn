// LESSON EDITOR — pure view-model (no DOM, no network). A lesson is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, and the editor
// shows each as its own area. This module only decides WHAT is shown (labels, grouping, counts); lesson-editor-ui.js draws it.

import { formatNumber } from "./i18n/format.js";
import { t, tn } from "./i18n/index.js";

// A label table whose texts are read from the catalog when a label is read (not once at import), so the active locale applies.
function catalogLabels(makers) {
  const labels = {};
  for (const [code, make] of Object.entries(makers)) Object.defineProperty(labels, code, { get: make, enumerable: true });
  return labels;
}

export const QUESTION_TYPE_LABELS = catalogLabels({
  RECALL: () => t("lesson.questionType.recall"),
  CONCEPT: () => t("lesson.questionType.concept"),
  MECHANISM: () => t("lesson.questionType.mechanism"),
  APPLICATION: () => t("lesson.questionType.application"),
  DISCRIMINATION: () => t("lesson.questionType.discrimination"),
  CLINICAL_REASONING: () => t("lesson.questionType.clinicalReasoning"),
  TRANSFER: () => t("lesson.questionType.transfer"),
});

export const ISSUE_LABELS = catalogLabels({
  SUMMARY_UNSUPPORTED_VALUE: () => t("lesson.issue.summaryUnsupportedValue"),
  SUMMARY_UNSUPPORTED_TERM: () => t("lesson.issue.summaryUnsupportedTerm"),
  SUMMARY_OMITS_CENTRAL_CONCEPT: () => t("lesson.issue.summaryOmitsCentralConcept"),
  SUMMARY_TOO_THIN: () => t("lesson.issue.summaryTooThin"),
  QUESTION_ANSWER_TOO_THIN: () => t("lesson.issue.questionAnswerTooThin"),
  EXPLANATION_MISSING: () => t("lesson.issue.explanationMissing"),
  QUESTION_ANSWER_LEAKED: () => t("lesson.issue.questionAnswerLeaked"),
  HINT_REVEALS_ANSWER: () => t("lesson.issue.hintRevealsAnswer"),
  QUESTION_UNSUPPORTED_VALUE: () => t("lesson.issue.questionUnsupportedValue"),
  QUESTION_UNSUPPORTED_TERM: () => t("lesson.issue.questionUnsupportedTerm"),
  QUESTION_LOW_SOURCE_SUPPORT: () => t("lesson.issue.questionLowSourceSupport"),
  QUESTION_DUPLICATE: () => t("lesson.issue.questionDuplicate"),
  QUESTION_VOLUME_OUT_OF_RANGE: () => t("lesson.issue.questionVolumeOutOfRange"),
  QUESTION_LITERAL_COPY: () => t("lesson.issue.questionLiteralCopy"),
});

export const issueLabel = (issue) => ISSUE_LABELS[issue] ?? issue;

// WHY a point was raised, in the student's terms. A difference of WORDS is its own cause and is never worded as an error: a paraphrase,
// a synonym or a faithful translation raises it too.
const WORDING_ISSUES = new Set(["SUMMARY_UNSUPPORTED_TERM", "SUMMARY_OMITS_CENTRAL_CONCEPT", "QUESTION_UNSUPPORTED_TERM", "QUESTION_LOW_SOURCE_SUPPORT"]);
const TEACHING_ISSUES = new Set([
  "SUMMARY_TOO_THIN", "QUESTION_ANSWER_TOO_THIN", "EXPLANATION_MISSING", "EXPLANATION_ADDS_NOTHING", "QUESTION_ANSWER_LEAKED",
  "HINT_REVEALS_ANSWER", "HINT_REVEALS_VALUE", "QUESTION_DUPLICATE", "QUESTION_VOLUME_OUT_OF_RANGE", "QUESTION_LITERAL_COPY",
]);
const CONTRADICTION_ISSUES = new Set(["UNIT_MISMATCH", "QUALIFIER_LOST", "QUALIFIER_ADDED"]);
const CAUSE_ORDER = ["contradiction", "unsupported", "wording", "notEvaluable", "teaching"];
const CAUSE_LABELS = catalogLabels({
  contradiction: () => t("lesson.cause.contradiction"),
  unsupported: () => t("lesson.cause.unsupported"),
  wording: () => t("lesson.cause.wording"),
  notEvaluable: () => t("lesson.cause.notEvaluable"),
  teaching: () => t("lesson.cause.teaching"),
});

export function findingCause(finding) {
  if (finding.verdict === "CONTRADICTED" || CONTRADICTION_ISSUES.has(finding.issue) || /CONTRADICT/.test(finding.issue ?? "")) return "contradiction";
  if (finding.verdict === "NOT_EVALUABLE") return "notEvaluable";
  if (finding.verdict === "NOT_FOUND") return "unsupported";
  if (WORDING_ISSUES.has(finding.issue)) return "wording";
  if (TEACHING_ISSUES.has(finding.issue)) return "teaching";
  return "unsupported";
}

/** Findings grouped by cause, most serious cause first; empty causes are left out: [{ cause, label, findings }]. */
export function groupByCause(findings) {
  const buckets = new Map(CAUSE_ORDER.map((cause) => [cause, []]));
  for (const finding of findings) buckets.get(findingCause(finding)).push(finding);
  return CAUSE_ORDER.filter((cause) => buckets.get(cause).length > 0).map((cause) => ({ cause, label: CAUSE_LABELS[cause], findings: buckets.get(cause) }));
}

const isActionable = (finding) => finding.severity !== "LOW";

/** Findings of the lesson grouped by the entity they are about: { summary: Finding[], byQuestion: Map<questionId, Finding[]>, other: Finding[] }. */
export function groupFindings(draft) {
  const summary = [];
  const other = [];
  const byQuestion = new Map();
  for (const finding of draft?.audit?.findings ?? []) {
    if (!isActionable(finding)) continue;
    if (finding.entityType === "SUMMARY") summary.push(finding);
    else if (finding.entityType === "QUESTION" && finding.entityId) {
      if (!byQuestion.has(finding.entityId)) byQuestion.set(finding.entityId, []);
      byQuestion.get(finding.entityId).push(finding);
    } else other.push(finding);
  }
  return { summary, byQuestion, other };
}

/**
 * The one sentence above the summary about how many of its sentences point at a real passage of the source. When NOT ONE sentence is
 * linked (e.g. a draft generated before sentence-level quotes existed) a bare "confirmado em 0 de N" reads like a failed check; it says
 * plainly that nothing was checked automatically instead.
 */
export function groundingLine(g) {
  if (!g || g.total === 0) return "";
  if (g.supported === 0 && g.orphaned === 0 && g.sentences.every((sentence) => sentence.status === "NOT_LINKED")) return t("editor.grounding.none", { total: g.total });
  if (g.orphaned > 0) return t(g.orphaned === 1 ? "editor.grounding.lineOrphaned.one" : "editor.grounding.lineOrphaned.other", { supported: g.supported, total: g.total, orphaned: g.orphaned });
  return t("editor.grounding.line", { supported: g.supported, total: g.total });
}

/**
 * What the header says about the lesson, read from the REAL state the server reports and never from the automatic check:
 *   accepted  a person accepted it (this window, or the server says ACCEPTED);
 *   pending   still a draft and critical points (HIGH findings, see acceptanceBlockers) wait for the person's explicit decision;
 *   draft     AI output that no person has accepted yet.
 * The automatic check only shows where to look; it is not a medical validation, so it never moves the lesson to a "verified" state.
 */
export function draftState(draft, { accepted = false } = {}) {
  if (accepted || draft?.status === "ACCEPTED") return { key: "accepted", label: t("editor.eyebrow.accepted"), pending: 0 };
  const blockers = draft?.acceptanceBlockers ?? {};
  const pending = (blockers.questions?.length ?? 0) + ((blockers.summary ?? 0) > 0 ? 1 : 0);
  if (pending > 0) return { key: "pending", label: tn("editor.eyebrow.pending", pending), pending };
  return { key: "draft", label: t("editor.eyebrow"), pending: 0 };
}

/** The review state a question shows in the list: a symbol (decorative), a word (always present) and how many findings it has. */
export function questionState(question, findingCount = 0) {
  if (question.status === "REJECTED") return { key: "rejected", symbol: "✕", label: t("lesson.questionState.rejected"), count: 0 };
  if (question.status === "ACCEPTED") return { key: "accepted", symbol: "✓", label: t("lesson.questionState.accepted"), count: findingCount };
  if (findingCount > 0) return { key: "flagged", symbol: "⚠", label: t("lesson.questionState.flagged"), count: findingCount };
  return { key: "proposed", symbol: "•", label: t("lesson.questionState.proposed"), count: 0 };
}

/** Totals for the tab labels and the review overview. */
export function reviewOverview(draft) {
  const groups = groupFindings(draft);
  const questions = draft?.questions ?? [];
  const flagged = questions.filter((q) => (groups.byQuestion.get(q.id)?.length ?? 0) > 0 && q.status !== "REJECTED").length;
  const accepted = questions.filter((q) => q.status === "ACCEPTED").length;
  const rejected = questions.filter((q) => q.status === "REJECTED").length;
  const summaryFindings = groups.summary.length;
  const pending = flagged + (summaryFindings > 0 ? 1 : 0);
  return { questions: questions.length, flagged, accepted, rejected, summaryFindings, pending, total: summaryFindings + [...groups.byQuestion.values()].reduce((n, f) => n + f.length, 0) };
}

/** Questions that will become exercises when the lesson is accepted. */
export const keptQuestionCount = (draft) => (draft?.questions ?? []).filter((q) => q.status !== "REJECTED").length;

const nf = { format: (value) => formatNumber(value) }; // resolved per call so the active locale applies

/** "Costanzo Physiology.pdf · fonte aprovada: PDF 267–273 · 23.317 caracteres" — read from what was really sent, not from the title. */
export function sourceLine(draft) {
  const scope = draft?.sourceScope;
  if (!scope) return "";
  const [a, b] = scope.approvedPages ?? [];
  const pages = a === undefined ? "" : a === b ? t("lesson.source.page", { page: a }) : t("lesson.source.pages", { from: a, to: b });
  const parts = [scope.documentName, pages ? t("lesson.source.approved", { pages }) : null, Number.isFinite(scope.sourceChars) ? t("lesson.source.chars", { count: nf.format(scope.sourceChars) }) : null];
  return parts.filter(Boolean).join(" · ");
}

/** "03:12" / "1:02:07" for a running generation or a duration. */
export function elapsedLabel(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}


/** The text a "copy" of one part must contain — never labels, badges, buttons or findings. */
export function copyTextOf(draft, part) {
  if (part === "summary") return String(draft?.summary ?? "");
  const question = (draft?.questions ?? []).find((q) => q.id === part);
  if (!question) return "";
  return [question.question, question.answer, question.explanation].filter(Boolean).join("\n\n");
}

// ---- generation jobs (T-F3-04) -------------------------------------------------------------------------------------------
// The server owns the state of a generation (QUEUED / CALLING_PROVIDER / STALLED / SUCCEEDED / FAILED / CANCELLED) and its real
// phase; this only words it for the student. STALLED is a warning (silence), never a failure.
const ACTIVE_JOB_STATES = ["QUEUED", "CALLING_PROVIDER", "STALLED"];
export const jobIsActive = (job) => ACTIVE_JOB_STATES.includes(job?.state);

/** The newest job of each proposal, from a list in any order (the student can retry a failed or cancelled unit). */
export function latestJobsByProposal(jobs) {
  const latest = new Map();
  for (const job of jobs ?? []) {
    const known = latest.get(job.proposalId);
    if (!known || job.id > known.id) latest.set(job.proposalId, job);
  }
  return latest;
}

const PHASE_LABELS = catalogLabels({
  QUEUED: () => t("lesson.job.phase.queued"),
  PREPARING: () => t("lesson.job.phase.preparing"),
  GENERATING: () => t("lesson.job.phase.generating"),
  AUDITING: () => t("lesson.job.phase.auditing"),
  REPAIRING: () => t("lesson.job.phase.repairing"),
  SAVING: () => t("lesson.job.phase.saving"),
});
/** The real phase the server reports; one it does not know yet reads as the generic "Gerando", never as raw text. */
export function jobPhaseLabel(job) {
  if (job?.state === "QUEUED") return PHASE_LABELS.QUEUED;
  return PHASE_LABELS[job?.phase] ?? PHASE_LABELS.GENERATING;
}

/** Milliseconds since the job started running (since it was created while it still waits in the queue); never negative. */
export function jobElapsedMs(job, nowMs) {
  const from = Date.parse(job?.startedAt ?? "") || Date.parse(job?.createdAt ?? "");
  return Number.isFinite(from) ? Math.max(0, nowMs - from) : 0;
}

const FAILURE_REASONS = catalogLabels({
  PROVIDER_ERROR: () => t("lesson.job.failure.providerError"),
  TIMEOUT: () => t("lesson.job.failure.timeout"),
  SERVER_RESTARTED: () => t("lesson.job.failure.serverRestarted"),
  INTERNAL_ERROR: () => t("lesson.job.failure.internalError"),
  BUDGET_EXCEEDED: () => t("lesson.job.failure.budgetExceeded"),
  LANGUAGE_MISMATCH: () => t("lesson.job.failure.languageMismatch"),
  SCOPE_CHANGED: () => t("lesson.job.failure.scopeChanged"),
});
// Codes whose server text is already an actionable sentence for the student (it says what to do), kept as the reason.
const SERVER_TEXT_CODES = new Set(["BUDGET_EXCEEDED"]);

/** A failed job in plain Portuguese: what happened (from the typed code), that nothing was saved, and that the unit can be tried again. */
export function jobFailureMessage(job) {
  const server = typeof job?.errorMessage === "string" ? job.errorMessage.trim() : "";
  const reason = SERVER_TEXT_CODES.has(job?.errorCode) && /^[\p{Lu}][^\n]{8,300}[.!]$/u.test(server)
    ? server
    : FAILURE_REASONS[job?.errorCode] ?? t("lesson.job.failure.unknown");
  return t("lesson.job.failure.message", { reason });
}

/** What a trecho in the list says about its newest job; null when there is nothing to say (no job, or one the student cancelled). */
export function jobListStatus(job) {
  if (!job) return null;
  if (jobIsActive(job)) return { kind: "generating", label: t("lesson.job.status.generating", { phase: jobPhaseLabel(job) }), stalled: job.state === "STALLED" };
  if (job.state === "SUCCEEDED") return { kind: "ready", label: t("lesson.job.status.ready"), stalled: false };
  if (job.state === "FAILED") return { kind: "failed", label: t("lesson.job.status.failed"), stalled: false };
  return null;
}
