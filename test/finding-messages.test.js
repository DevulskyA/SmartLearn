import { test } from "node:test";
import assert from "node:assert/strict";
import ptBR from "../src/i18n/locales/pt-BR.js";
import { registerCatalog, setLocale } from "../src/i18n/index.js";
import { findingText } from "../src/lesson-view-model.js";
import { AUDIT_MESSAGE_CODES, auditMessageText } from "../server/src/ai/audit-messages.js";

// Slice 1 of the server-text migration, client side: the sentences of an audit finding come from the catalog when the server sends a
// code the catalog knows, and from the text the server wrote otherwise. Server side of the contract: server/test/audit-messages.test.js.

const finding = (messages, extra = {}) => ({
  issue: "SUMMARY_UNSUPPORTED_VALUE", severity: "HIGH", scope: "summary",
  generatedClaim: "claim do servidor", sourceEvidence: "evidência do servidor", repair: "reparo do servidor", messages, ...extra,
});

test("a code the catalog knows shows the catalog text with its parameters, not the server's text", () => {
  const f = finding({ repair: { code: "REPAIR_SUMMARY_UNSUPPORTED_VALUE", params: { value: "777" } }, evidence: { code: "EVIDENCE_SOURCE_PASSAGE", params: { page: 2, text: "Trecho da fonte." } } });
  assert.equal(findingText(f, "repair"), "O valor 777 não aparece na fonte. Use o valor que a fonte traz ou remova a afirmação.");
  assert.equal(findingText(f, "evidence"), "p. 2: Trecho da fonte.");
});

test("a sentence with no code (the draft's own text, the model's wording) shows what the server sent", () => {
  const f = finding({ repair: { code: "REPAIR_DUPLICATE", params: {} } });
  assert.equal(findingText(f, "claim"), "claim do servidor");
  assert.equal(findingText(f, "evidence"), "evidência do servidor");
});

test("a code the catalog does not know (a newer server) falls back to the server's text, never to the bare code", () => {
  const f = finding({ repair: { code: "REPAIR_FROM_THE_FUTURE", params: { x: 1 } } });
  assert.equal(findingText(f, "repair"), "reparo do servidor");
  assert.equal(findingText(finding({ repair: { code: 42 } }), "repair"), "reparo do servidor", "a malformed message is ignored");
  assert.equal(findingText(finding({ repair: null }), "repair"), "reparo do servidor");
});

test("compatibility: a finding stored before the codes existed (no `messages`) reads exactly as before", () => {
  const { messages, ...old } = finding();
  assert.equal(messages, undefined);
  assert.deepEqual(["claim", "evidence", "repair"].map((slot) => findingText(old, slot)), ["claim do servidor", "evidência do servidor", "reparo do servidor"]);
  assert.equal(findingText({ issue: "X" }, "repair"), "", "a finding with no text at all gives an empty sentence, not 'undefined'");
});

test("the text follows the interface language: another catalog's text is used for the same code", () => {
  registerCatalog("en", { "lesson.audit.REPAIR_DUPLICATE": "[en] Remove or rewrite one of the two." });
  try {
    setLocale("en");
    assert.equal(findingText(finding({ repair: { code: "REPAIR_DUPLICATE", params: {} } }), "repair"), "[en] Remove or rewrite one of the two.");
    assert.equal(findingText(finding({ repair: { code: "REPAIR_LITERAL_COPY", params: {} } }), "repair"), ptBR["lesson.audit.REPAIR_LITERAL_COPY"], "a code this catalog lacks falls back to pt-BR per key");
  } finally {
    registerCatalog("en", undefined);
    setLocale("pt-BR");
  }
});

test("a size in characters arrives as a number and is written the way the interface language writes it", () => {
  const f = finding({ evidence: { code: "EVIDENCE_VOLUME_EXPECTED", params: { chars: 23317, min: 4, max: 78 } } });
  assert.equal(findingText(f, "evidence"), "Para o tamanho desta fonte (23.317 caracteres) o esperado é entre 4 e 78 questões.");
});

test("the catalog and the server table agree: every code has a catalog text, filling exactly the parameters the server sends, and says what the reserve text says", () => {
  const problems = [];
  for (const code of AUDIT_MESSAGE_CODES) {
    const text = ptBR[`lesson.audit.${code}`];
    if (typeof text !== "string") { problems.push(`${code}: missing from the catalog`); continue; }
    const asked = new Set();
    const params = new Proxy({}, { get: (_, name) => { asked.add(name); return 1; } });
    const reserve = auditMessageText(code, params);
    const declared = new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    if ([...declared].sort().join() !== [...asked].sort().join()) problems.push(`${code}: catalog fills {${[...declared]}} but the server sends {${[...asked]}}`);
    if (reserve !== text.replace(/\{\w+\}/g, "1")) problems.push(`${code}: the catalog text and the reserve text differ`);
  }
  assert.deepEqual(problems, []);
});
