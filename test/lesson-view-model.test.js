import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceSufficiencyNote, draftState, groupFindings, groupByCause, findingCause, questionState, reviewOverview, keptQuestionCount, sourceLine, elapsedLabel, copyTextOf, issueLabel, groundingLine } from "../src/lesson-view-model.js";

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

test("COPY: copying the summary returns only the summary; copying a question only its own content", () => {
  assert.equal(copyTextOf(draft, "summary"), draft.summary);
  assert.equal(copyTextOf(draft, "q1"), "P1?\n\nR1\n\nE1");
  assert.equal(copyTextOf(draft, "q2"), "P2?\n\nR2");
  const UI_WORDS = /Corrigir|Sinalizada|Salvar|Ver trecho|Gerar rascunho|Nova disciplina|Aceitar e criar|Pouco apoio|Termo que não aparece|Poucas palavras em comum|Palavra que a fonte não repete|Palavra que a página citada não repete/;
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

test("groundingLine: a summary with NO linked sentence says nothing was checked instead of a bare '0 de N confirmadas'", () => {
  const unlinked = (n) => ({ total: n, supported: 0, orphaned: 0, sentences: Array.from({ length: n }, () => ({ status: "NOT_LINKED" })) });
  assert.match(groundingLine(unlinked(55)), /Nenhuma das 55 frases do resumo tem trecho da fonte vinculado/);
  assert.match(groundingLine(unlinked(55)), /confira o resumo na fonte/);
  const some = { total: 4, supported: 1, orphaned: 0, sentences: [{ status: "SOURCE_LINKED" }, { status: "NOT_LINKED" }, { status: "NOT_LINKED" }, { status: "NOT_LINKED" }] };
  assert.equal(groundingLine(some), "Trecho da fonte confirmado em 1 de 4 frases do resumo.");
  const stale = { total: 4, supported: 0, orphaned: 2, sentences: [{ status: "NOT_LINKED" }] };
  assert.match(groundingLine(stale), /confirmado em 0 de 4 frases do resumo\. 2 apontamentos antigos/);
  assert.equal(groundingLine({ total: 0, supported: 0, orphaned: 0, sentences: [] }), "");
});

test("findings are grouped by WHY they were raised, most serious cause first; a difference of words is its own cause, never a contradiction", () => {
  const f = (issue, extra = {}) => ({ issue, severity: "MEDIUM", ...extra });
  const groups = groupByCause([
    f("QUESTION_DUPLICATE"),
    f("SUMMARY_UNSUPPORTED_TERM", { blocksRepair: false }),
    f("SUMMARY_UNSUPPORTED_VALUE", { severity: "HIGH" }),
    f("CLAIM_X", { verdict: "CONTRADICTED", severity: "HIGH" }),
    f("QUALIFIER_LOST"),
    f("CLAIM_Y", { verdict: "NOT_EVALUABLE", blocksRepair: false }),
    f("QUESTION_LOW_SOURCE_SUPPORT", { blocksRepair: false }),
  ]);
  assert.deepEqual(groups.map((g) => [g.cause, g.label, g.findings.map((x) => x.issue)]), [
    ["contradiction", "A fonte diz outra coisa", ["CLAIM_X", "QUALIFIER_LOST"]],
    ["unsupported", "A fonte não traz esse ponto", ["SUMMARY_UNSUPPORTED_VALUE"]],
    ["wording", "Só uma diferença de palavras", ["SUMMARY_UNSUPPORTED_TERM", "QUESTION_LOW_SOURCE_SUPPORT"]],
    ["notEvaluable", "Não deu para avaliar", ["CLAIM_Y"]],
    ["teaching", "Como a questão ensina", ["QUESTION_DUPLICATE"]],
  ]);
  assert.deepEqual(groupByCause([]), []);
  assert.equal(findingCause({ issue: "ANSWER_CONTRADICTS_SOURCE" }), "contradiction", "an older model finding without a verdict still reads as a contradiction by its name");
  assert.equal(findingCause({ issue: "SOMETHING_NEW" }), "unsupported", "an unknown issue is never filed under 'only words'");
});

test("the header state follows the REAL state of the draft: draft -> pending critical items -> accepted; the automatic check never changes it", () => {
  const open = (extra = {}) => ({ status: "DRAFT", acceptanceBlockers: { questions: [], summary: 0 }, ...extra });
  assert.deepEqual(draftState(open()), { key: "draft", label: "Rascunho gerado por IA — aguardando sua conferência", pending: 0 });
  assert.equal(draftState({ status: "DRAFT" }).key, "draft", "a draft without the blockers field is still just a draft");
  // critical points waiting for the person: one question, then the summary and two questions
  const one = draftState(open({ acceptanceBlockers: { questions: ["q2"], summary: 0 } }));
  assert.deepEqual(one, { key: "pending", label: "Rascunho gerado por IA — conferência pendente: 1 item crítico", pending: 1 });
  const many = draftState(open({ acceptanceBlockers: { questions: ["q1", "q2"], summary: 3 } }));
  assert.deepEqual(many, { key: "pending", label: "Rascunho gerado por IA — conferência pendente: 3 itens críticos", pending: 3 });
  // resolving them (the server answers with an empty list) brings the draft back to waiting for the person
  assert.equal(draftState(open({ acceptanceBlockers: { questions: [], summary: 0 } })).key, "draft");
  // accepted: by this window, or because the server says so, whatever blockers were left over
  assert.deepEqual(draftState(open({ acceptanceBlockers: { questions: ["q1"], summary: 1 } }), { accepted: true }), { key: "accepted", label: "Aula aceita e adicionada aos seus estudos.", pending: 0 });
  assert.equal(draftState({ status: "ACCEPTED" }).key, "accepted");
  // the automatic audit result (PASS or REPAIR, repaired or not) is not a state of the lesson
  for (const audit of [{ result: "PASS", findings: [] }, { result: "REPAIR", findings: [{ severity: "MEDIUM" }], repaired: true }]) {
    assert.equal(draftState(open({ audit })).key, "draft");
  }
  // no draft state claims the content was verified
  for (const d of [open(), open({ acceptanceBlockers: { questions: ["q"], summary: 0 } })]) assert.doesNotMatch(draftState(d).label, /verificad|validad|aprovad/i);
});

test("the thin-source notice names what the check could not see, in the catalog's words, and says it is not proof of error", () => {
  const draftWith = (finding) => ({ audit: { findings: finding ? [finding] : [] } });
  assert.equal(sourceSufficiencyNote(draftWith(null)), "");
  assert.equal(sourceSufficiencyNote({}), "");
  assert.equal(sourceSufficiencyNote(draftWith({ issue: "QUESTION_DUPLICATE" })), "");
  const thin = sourceSufficiencyNote(draftWith({ issue: "SOURCE_TEXT_INSUFFICIENT", reasons: ["THIN"], sourceChars: 440, pageCount: 3, emptyPages: [], garbledPages: [] }));
  assert.match(thin, /^O texto extraído desta fonte tem 440 caracteres em 3 páginas\./);
  assert.match(thin, /É um aviso, não prova de erro\.$/);
  assert.doesNotMatch(thin, /Sem texto nas páginas|cortada ou ilegível/);
  const one = sourceSufficiencyNote(draftWith({ issue: "SOURCE_TEXT_INSUFFICIENT", reasons: ["EMPTY_PAGES"], sourceChars: 900, pageCount: 1, emptyPages: [1], garbledPages: [] }));
  assert.match(one, /em 1 página\./);
  assert.match(one, /Sem texto nas páginas 1:/);
  const both = sourceSufficiencyNote(draftWith({ issue: "SOURCE_TEXT_INSUFFICIENT", reasons: ["EMPTY_PAGES", "GARBLED"], sourceChars: 5000, pageCount: 4, emptyPages: [2], garbledPages: [3, 4] }));
  assert.match(both, /Sem texto nas páginas 2:/);
  assert.match(both, /cortada ou ilegível nas páginas 3, 4\./);
});
