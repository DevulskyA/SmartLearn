import { test } from "node:test";
import assert from "node:assert/strict";
import { groupFindings, questionState, reviewOverview, keptQuestionCount, sourceLine, elapsedLabel, summaryBlocks, copyTextOf, issueLabel } from "../src/lesson-view-model.js";

const draft = {
  summary: "Primeiro parágrafo.\n\nSegundo parágrafo.",
  sourceScope: { documentName: "Costanzo.pdf", approvedPages: [267, 273], sourceChars: 23317 },
  questions: [
    { id: "q1", question: "P1?", answer: "R1", explanation: "E1", status: "PROPOSED" },
    { id: "q2", question: "P2?", answer: "R2", explanation: null, status: "FLAGGED" },
    { id: "q3", question: "P3?", answer: "R3", status: "REJECTED" },
    { id: "q4", question: "P4?", answer: "R4", status: "ACCEPTED" },
  ],
  audit: {
    findings: [
      { entityType: "SUMMARY", entityId: "summary", severity: "MEDIUM", issue: "SUMMARY_UNSUPPORTED_TERM" },
      { entityType: "QUESTION", entityId: "q2", severity: "MEDIUM", issue: "QUESTION_LOW_SOURCE_SUPPORT" },
      { entityType: "QUESTION", entityId: "q2", severity: "HIGH", issue: "QUESTION_UNSUPPORTED_VALUE" },
      { entityType: "QUESTION", entityId: "q1", severity: "LOW", issue: "QUESTION_LITERAL_COPY" },
    ],
  },
};

test("findings are grouped by the entity they are about, and LOW (advisory) findings are not counted", () => {
  const g = groupFindings(draft);
  assert.equal(g.summary.length, 1);
  assert.equal(g.byQuestion.get("q2").length, 2);
  assert.equal(g.byQuestion.has("q1"), false);
});

test("a question state always carries a WORD (not only a symbol) and its finding count", () => {
  assert.deepEqual(questionState({ status: "PROPOSED" }, 0), { key: "proposed", symbol: "•", label: "Proposta", count: 0 });
  assert.equal(questionState({ status: "PROPOSED" }, 2).label, "Sinalizada");
  assert.equal(questionState({ status: "PROPOSED" }, 2).count, 2);
  assert.equal(questionState({ status: "REJECTED" }, 3).count, 0);
  assert.equal(questionState({ status: "ACCEPTED" }, 0).label, "Aceita");
});

test("review overview counts pending items per entity, ignoring rejected questions", () => {
  const o = reviewOverview(draft);
  assert.equal(o.questions, 4);
  assert.equal(o.flagged, 1);
  assert.equal(o.summaryFindings, 1);
  assert.equal(o.pending, 2);
  assert.equal(o.accepted, 1);
  assert.equal(o.rejected, 1);
  assert.equal(keptQuestionCount(draft), 3);
});

test("the source line is read from the recorded scope, in pt-BR number format", () => {
  assert.equal(sourceLine(draft), "Costanzo.pdf · fonte aprovada: PDF páginas 267–273 · 23.317 caracteres");
  assert.equal(sourceLine({ sourceScope: { approvedPages: [5, 5] } }), "fonte aprovada: PDF página 5");
  assert.equal(sourceLine({}), "");
});

test("elapsed time reads mm:ss and h:mm:ss", () => {
  assert.equal(elapsedLabel(0), "00:00");
  assert.equal(elapsedLabel(192_000), "03:12");
  assert.equal(elapsedLabel(3_727_000), "1:02:07");
  assert.equal(elapsedLabel(-5), "00:00");
});

test("summary blocks keep headings and paragraphs apart", () => {
  const blocks = summaryBlocks("## Ideia central\nA filtração é...\n\nSegundo parágrafo\ncontinua aqui.");
  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "Ideia central" },
    { type: "paragraph", text: "A filtração é..." },
    { type: "paragraph", text: "Segundo parágrafo\ncontinua aqui." },
  ]);
  assert.deepEqual(summaryBlocks(""), []);
});

test("COPY: copying the summary returns only the summary; copying a question only its own content", () => {
  assert.equal(copyTextOf(draft, "summary"), draft.summary);
  assert.equal(copyTextOf(draft, "q1"), "P1?\n\nR1\n\nE1");
  assert.equal(copyTextOf(draft, "q2"), "P2?\n\nR2");
  const UI_WORDS = /Corrigir|Sinalizada|Salvar|Ver trecho|Gerar rascunho|Nova disciplina|Aceitar e criar|Pouco apoio|Termo que não aparece/;
  for (const part of ["summary", "q1", "q2", "q3", "q4"]) assert.doesNotMatch(copyTextOf(draft, part), UI_WORDS);
  assert.equal(copyTextOf(draft, "nope"), "");
});

test("issue labels fall back to the code for an unknown issue", () => {
  assert.equal(issueLabel("QUESTION_DUPLICATE"), "Questão repetida");
  assert.equal(issueLabel("SOMETHING_NEW"), "SOMETHING_NEW");
});

// T-F3-04: what the student is told about a generation job (pure; the server owns the state, this only words it).
import { jobIsActive, latestJobsByProposal, jobPhaseLabel, jobElapsedMs, jobFailureMessage, jobListStatus } from "../src/lesson-view-model.js";

const job = (over) => ({ id: 1, proposalId: 10, state: "CALLING_PROVIDER", phase: "GENERATING", createdAt: "2026-10-05T10:00:00.000Z", startedAt: "2026-10-05T10:00:01.000Z", errorCode: null, errorMessage: null, draftId: null, ...over });

test("jobIsActive: QUEUED, CALLING_PROVIDER and STALLED are active; the three final states are not", () => {
  for (const state of ["QUEUED", "CALLING_PROVIDER", "STALLED"]) assert.equal(jobIsActive(job({ state })), true, state);
  for (const state of ["SUCCEEDED", "FAILED", "CANCELLED"]) assert.equal(jobIsActive(job({ state })), false, state);
  assert.equal(jobIsActive(null), false);
});

test("latestJobsByProposal keeps the newest job of each proposal, whatever the order of the list", () => {
  const map = latestJobsByProposal([job({ id: 3, proposalId: 10 }), job({ id: 5, proposalId: 11 }), job({ id: 4, proposalId: 10, state: "FAILED" }), job({ id: 1, proposalId: 10 })]);
  assert.equal(map.get(10).id, 4);
  assert.equal(map.get(11).id, 5);
  assert.equal(map.size, 2);
});

test("jobPhaseLabel names the real phase in plain Portuguese; an unknown phase falls back to a generic one, never to raw text", () => {
  assert.match(jobPhaseLabel(job({ state: "QUEUED", phase: "QUEUED" })), /fila/i);
  assert.match(jobPhaseLabel(job({ phase: "PREPARING" })), /Preparando/);
  assert.match(jobPhaseLabel(job({ phase: "GENERATING" })), /Gerando/);
  assert.match(jobPhaseLabel(job({ phase: "AUDITING" })), /Conferindo/);
  assert.match(jobPhaseLabel(job({ phase: "REPAIRING" })), /Corrigindo/);
  assert.match(jobPhaseLabel(job({ phase: "SAVING" })), /Salvando/);
  assert.match(jobPhaseLabel(job({ phase: "SOMETHING_NEW" })), /Gerando/);
  assert.doesNotMatch(jobPhaseLabel(job({ phase: "SOMETHING_NEW" })), /SOMETHING_NEW/);
});

test("jobElapsedMs counts from when the job started running (or was created while queued) and never goes negative", () => {
  const now = Date.parse("2026-10-05T10:02:01.000Z");
  assert.equal(jobElapsedMs(job(), now), 120_000);
  assert.equal(jobElapsedMs(job({ startedAt: null }), now), 121_000);
  assert.equal(jobElapsedMs(job({ startedAt: "2026-10-05T11:00:00.000Z" }), now), 0);
  assert.equal(jobElapsedMs(job({ startedAt: "garbage", createdAt: "garbage" }), now), 0);
});

test("jobFailureMessage: a typed error code becomes plain Portuguese; the raw server text is never the only thing shown", () => {
  for (const errorCode of ["PROVIDER_ERROR", "TIMEOUT", "SERVER_RESTARTED", "INTERNAL_ERROR", "BUDGET_EXCEEDED", "LANGUAGE_MISMATCH", "SCOPE_CHANGED", "WHATEVER_NEW"]) {
    const text = jobFailureMessage(job({ state: "FAILED", errorCode, errorMessage: "ProviderRequestError: boom" }));
    assert.match(text, /^Não foi possível gerar o rascunho/, errorCode);
    assert.doesNotMatch(text, /ProviderRequestError|boom|undefined|null/, errorCode);
    assert.match(text, /Nada foi salvo/, errorCode);
  }
  assert.match(jobFailureMessage(job({ state: "FAILED", errorCode: "TIMEOUT" })), /tempo limite/);
  assert.match(jobFailureMessage(job({ state: "FAILED", errorCode: "SERVER_RESTARTED" })), /reiniciad|encerrad/);
  assert.match(jobFailureMessage(job({ state: "FAILED", errorCode: "BUDGET_EXCEEDED", errorMessage: "Limite de crédito da semana atingido." })), /Limite de crédito da semana atingido\./, "an actionable server message in Portuguese is kept");
});

test("jobListStatus: active = Gerando (with the phase), STALLED stays Gerando but is flagged calm, SUCCEEDED = Pronto, FAILED = Falhou, CANCELLED/none = nothing", () => {
  assert.deepEqual(jobListStatus(job({ phase: "AUDITING" })), { kind: "generating", label: "Gerando… Conferindo com a fonte", stalled: false });
  assert.equal(jobListStatus(job({ state: "STALLED" })).kind, "generating");
  assert.equal(jobListStatus(job({ state: "STALLED" })).stalled, true);
  assert.equal(jobListStatus(job({ state: "QUEUED", phase: "QUEUED" })).kind, "generating");
  assert.deepEqual(jobListStatus(job({ state: "SUCCEEDED", draftId: 7 })), { kind: "ready", label: "Pronto", stalled: false });
  assert.equal(jobListStatus(job({ state: "FAILED", errorCode: "TIMEOUT" })).kind, "failed");
  assert.match(jobListStatus(job({ state: "FAILED", errorCode: "TIMEOUT" })).label, /^Falhou/);
  assert.equal(jobListStatus(job({ state: "CANCELLED" })), null);
  assert.equal(jobListStatus(undefined), null);
});
