import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUESTION_TYPE_LABELS, ISSUE_LABELS, issueLabel, questionState, sourceLine, jobPhaseLabel, jobFailureMessage, jobListStatus,
} from "../src/lesson-view-model.js";

// Characterization of the exact pt-BR texts lesson-view-model.js shows (they come from the i18n catalog).

test("question type labels", () => {
  assert.deepEqual({ ...QUESTION_TYPE_LABELS }, {
    RECALL: "Recordação",
    CONCEPT: "Conceito",
    MECHANISM: "Mecanismo",
    APPLICATION: "Aplicação",
    DISCRIMINATION: "Discriminação",
    CLINICAL_REASONING: "Raciocínio clínico",
    TRANSFER: "Transferência",
  });
  assert.equal(QUESTION_TYPE_LABELS.NOPE, undefined);
});

test("issue labels", () => {
  assert.deepEqual({ ...ISSUE_LABELS }, {
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
    QUESTION_VOLUME_OUT_OF_RANGE: "Quantidade de questões fora do esperado",
    QUESTION_LITERAL_COPY: "Resposta copiada da fonte",
  });
  assert.equal(issueLabel("QUESTION_LITERAL_COPY"), "Resposta copiada da fonte");
  assert.equal(issueLabel("NEW_ONE"), "NEW_ONE");
});

test("question states: word and symbol", () => {
  assert.deepEqual(questionState({ status: "REJECTED" }, 2), { key: "rejected", symbol: "✕", label: "Rejeitada", count: 0 });
  assert.deepEqual(questionState({ status: "ACCEPTED" }, 2), { key: "accepted", symbol: "✓", label: "Aceita", count: 2 });
  assert.deepEqual(questionState({ status: "PROPOSED" }, 1), { key: "flagged", symbol: "⚠", label: "Sinalizada", count: 1 });
  assert.deepEqual(questionState({ status: "PROPOSED" }), { key: "proposed", symbol: "•", label: "Proposta", count: 0 });
});

test("source line: pages, single page, characters (always the plural word) and missing parts", () => {
  assert.equal(sourceLine({ sourceScope: { documentName: "A.pdf", approvedPages: [267, 273], sourceChars: 23317 } }), "A.pdf · fonte aprovada: PDF páginas 267–273 · 23.317 caracteres");
  assert.equal(sourceLine({ sourceScope: { documentName: "A.pdf", approvedPages: [5, 5], sourceChars: 1 } }), "A.pdf · fonte aprovada: PDF página 5 · 1 caracteres");
  assert.equal(sourceLine({ sourceScope: { documentName: "A.pdf", approvedPages: [], sourceChars: 0 } }), "A.pdf · 0 caracteres");
  assert.equal(sourceLine({ sourceScope: { documentName: "A.pdf" } }), "A.pdf");
  assert.equal(sourceLine({ sourceScope: { approvedPages: [5, 5] } }), "fonte aprovada: PDF página 5");
});

test("job phase labels and the generic fallback", () => {
  const phase = (state, p) => jobPhaseLabel({ state, phase: p });
  assert.equal(phase("QUEUED", "GENERATING"), "Na fila para começar");
  assert.equal(phase("CALLING_PROVIDER", "QUEUED"), "Na fila para começar");
  assert.equal(phase("CALLING_PROVIDER", "PREPARING"), "Preparando o trecho aprovado");
  assert.equal(phase("CALLING_PROVIDER", "GENERATING"), "Gerando resumo e questões");
  assert.equal(phase("CALLING_PROVIDER", "AUDITING"), "Conferindo com a fonte");
  assert.equal(phase("CALLING_PROVIDER", "REPAIRING"), "Corrigindo o que a conferência encontrou");
  assert.equal(phase("CALLING_PROVIDER", "SAVING"), "Salvando o rascunho");
  assert.equal(phase("CALLING_PROVIDER", "SOMETHING_NEW"), "Gerando resumo e questões");
  assert.equal(jobPhaseLabel(undefined), "Gerando resumo e questões");
});

test("job failure messages: exact sentence per code, unknown code, server text kept only for BUDGET_EXCEEDED", () => {
  const tail = " Nada foi salvo; você pode tentar de novo.";
  const head = "Não foi possível gerar o rascunho. ";
  const reasons = {
    PROVIDER_ERROR: "O serviço de IA não respondeu como esperado.",
    TIMEOUT: "A geração passou do tempo limite e foi interrompida.",
    SERVER_RESTARTED: "O servidor foi reiniciado durante a geração.",
    INTERNAL_ERROR: "Houve um erro interno.",
    BUDGET_EXCEEDED: "O limite de uso da geração foi atingido.",
    LANGUAGE_MISMATCH: "O rascunho veio em um idioma diferente do pedido.",
    SCOPE_CHANGED: "O texto do trecho mudou desde que a geração foi pedida.",
    WHATEVER_NEW: "A geração não terminou.",
  };
  for (const [errorCode, reason] of Object.entries(reasons)) assert.equal(jobFailureMessage({ errorCode, errorMessage: "ProviderRequestError: boom" }), head + reason + tail, errorCode);
  assert.equal(jobFailureMessage(undefined), head + "A geração não terminou." + tail);
  assert.equal(jobFailureMessage({ errorCode: "BUDGET_EXCEEDED", errorMessage: " Limite de crédito da semana atingido. " }), head + "Limite de crédito da semana atingido." + tail);
  assert.equal(jobFailureMessage({ errorCode: "TIMEOUT", errorMessage: "Limite de crédito da semana atingido." }), head + reasons.TIMEOUT + tail, "server text is ignored for other codes");
  assert.equal(jobFailureMessage({ errorCode: "BUDGET_EXCEEDED", errorMessage: "{count} $& {phase}." }), head + reasons.BUDGET_EXCEEDED + tail, "text that fails the shape check falls back to the typed reason");
  assert.equal(jobFailureMessage({ errorCode: "BUDGET_EXCEEDED", errorMessage: "Gastou $& do limite {reason} hoje." }), head + "Gastou $& do limite {reason} hoje." + tail, "special characters in server text survive");
});

test("job list status labels", () => {
  assert.deepEqual(jobListStatus({ state: "CALLING_PROVIDER", phase: "SAVING" }), { kind: "generating", label: "Gerando… Salvando o rascunho", stalled: false });
  assert.deepEqual(jobListStatus({ state: "QUEUED", phase: "QUEUED" }), { kind: "generating", label: "Gerando… Na fila para começar", stalled: false });
  assert.deepEqual(jobListStatus({ state: "SUCCEEDED" }), { kind: "ready", label: "Pronto", stalled: false });
  assert.deepEqual(jobListStatus({ state: "FAILED" }), { kind: "failed", label: "Falhou", stalled: false });
});
