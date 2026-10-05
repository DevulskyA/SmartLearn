// LESSON EDITOR — pure view-model (no DOM, no network). A lesson is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, and the editor
// shows each as its own area. This module only decides WHAT is shown (labels, grouping, counts); lesson-editor-ui.js draws it.

export const QUESTION_TYPE_LABELS = {
  RECALL: "Recordação",
  CONCEPT: "Conceito",
  MECHANISM: "Mecanismo",
  APPLICATION: "Aplicação",
  DISCRIMINATION: "Discriminação",
  CLINICAL_REASONING: "Raciocínio clínico",
  TRANSFER: "Transferência",
};

export const ISSUE_LABELS = {
  SUMMARY_UNSUPPORTED_VALUE: "Valor que a fonte não traz",
  SUMMARY_UNSUPPORTED_TERM: "Termo que não aparece na fonte",
  SUMMARY_OMITS_CENTRAL_CONCEPT: "Pode omitir um conceito central",
  SUMMARY_TOO_THIN: "Resumo curto demais para a fonte",
  QUESTION_ANSWER_TOO_THIN: "Resposta sem explicação suficiente",
  EXPLANATION_MISSING: "Falta explicar por quê",
  QUESTION_ANSWER_LEAKED: "O enunciado já dá a resposta",
  HINT_REVEALS_ANSWER: "A dica entrega a resposta",
  QUESTION_UNSUPPORTED_VALUE: "Valor que a página citada não traz",
  QUESTION_UNSUPPORTED_TERM: "Termo que não aparece na página citada",
  QUESTION_LOW_SOURCE_SUPPORT: "Pouco apoio na página citada",
  QUESTION_DUPLICATE: "Questão repetida",
  QUESTION_LITERAL_COPY: "Resposta copiada da fonte",
};

export const issueLabel = (issue) => ISSUE_LABELS[issue] ?? issue;

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

/** The review state a question shows in the list: a symbol (decorative), a word (always present) and how many findings it has. */
export function questionState(question, findingCount = 0) {
  if (question.status === "REJECTED") return { key: "rejected", symbol: "✕", label: "Rejeitada", count: 0 };
  if (question.status === "ACCEPTED") return { key: "accepted", symbol: "✓", label: "Aceita", count: findingCount };
  if (findingCount > 0) return { key: "flagged", symbol: "⚠", label: "Sinalizada", count: findingCount };
  return { key: "proposed", symbol: "•", label: "Proposta", count: 0 };
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

const nf = new Intl.NumberFormat("pt-BR");

/** "Costanzo Physiology.pdf · fonte aprovada: PDF 267–273 · 23.317 caracteres" — read from what was really sent, not from the title. */
export function sourceLine(draft) {
  const scope = draft?.sourceScope;
  if (!scope) return "";
  const [a, b] = scope.approvedPages ?? [];
  const pages = a === undefined ? "" : a === b ? `PDF página ${a}` : `PDF páginas ${a}–${b}`;
  const parts = [scope.documentName, pages ? `fonte aprovada: ${pages}` : null, Number.isFinite(scope.sourceChars) ? `${nf.format(scope.sourceChars)} caracteres` : null];
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

/** Splits a summary into display blocks: a line starting with "#" is a heading, other consecutive lines form a paragraph. */
export function summaryBlocks(text) {
  const blocks = [];
  for (const raw of String(text ?? "").split(/\n{2,}/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(chunk.split("\n")[0]);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      const rest = chunk.split("\n").slice(1).join("\n").trim();
      if (rest) blocks.push({ type: "paragraph", text: rest });
    } else {
      blocks.push({ type: "paragraph", text: chunk });
    }
  }
  return blocks;
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

const PHASE_LABELS = {
  QUEUED: "Na fila para começar",
  PREPARING: "Preparando o trecho aprovado",
  GENERATING: "Gerando resumo e questões",
  AUDITING: "Conferindo com a fonte",
  REPAIRING: "Corrigindo o que a conferência encontrou",
  SAVING: "Salvando o rascunho",
};
/** The real phase the server reports; one it does not know yet reads as the generic "Gerando", never as raw text. */
export function jobPhaseLabel(job) {
  if (job?.state === "QUEUED") return PHASE_LABELS.QUEUED;
  return PHASE_LABELS[job?.phase] ?? "Gerando resumo e questões";
}

/** Milliseconds since the job started running (since it was created while it still waits in the queue); never negative. */
export function jobElapsedMs(job, nowMs) {
  const from = Date.parse(job?.startedAt ?? "") || Date.parse(job?.createdAt ?? "");
  return Number.isFinite(from) ? Math.max(0, nowMs - from) : 0;
}

const FAILURE_REASONS = {
  PROVIDER_ERROR: "O serviço de IA não respondeu como esperado.",
  TIMEOUT: "A geração passou do tempo limite e foi interrompida.",
  SERVER_RESTARTED: "O servidor foi reiniciado durante a geração.",
  INTERNAL_ERROR: "Houve um erro interno.",
  BUDGET_EXCEEDED: "O limite de uso da geração foi atingido.",
  LANGUAGE_MISMATCH: "O rascunho veio em um idioma diferente do pedido.",
  SCOPE_CHANGED: "O texto do trecho mudou desde que a geração foi pedida.",
};
// Codes whose server text is already an actionable sentence for the student (it says what to do), kept as the reason.
const SERVER_TEXT_CODES = new Set(["BUDGET_EXCEEDED"]);

/** A failed job in plain Portuguese: what happened (from the typed code), that nothing was saved, and that the unit can be tried again. */
export function jobFailureMessage(job) {
  const server = typeof job?.errorMessage === "string" ? job.errorMessage.trim() : "";
  const reason = SERVER_TEXT_CODES.has(job?.errorCode) && /^[\p{Lu}][^\n]{8,300}[.!]$/u.test(server)
    ? server
    : FAILURE_REASONS[job?.errorCode] ?? "A geração não terminou.";
  return `Não foi possível gerar o rascunho. ${reason} Nada foi salvo; você pode tentar de novo.`;
}

/** What a trecho in the list says about its newest job; null when there is nothing to say (no job, or one the student cancelled). */
export function jobListStatus(job) {
  if (!job) return null;
  if (jobIsActive(job)) return { kind: "generating", label: `Gerando… ${jobPhaseLabel(job)}`, stalled: job.state === "STALLED" };
  if (job.state === "SUCCEEDED") return { kind: "ready", label: "Pronto", stalled: false };
  if (job.state === "FAILED") return { kind: "failed", label: "Falhou", stalled: false };
  return null;
}
