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
