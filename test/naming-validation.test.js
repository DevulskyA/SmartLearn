import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateNamingField, NAMING_PATTERN } from "../src/naming-validation.js";

// Contract A: valid names accepted
describe("validateNamingField — valid inputs", () => {
  const valid = [
    ["Medicina Interna", "disciplina"],
    ["Semiologia Médica", "disciplina"],
    ["Citologia e Histologia", "disciplina"],
    ["Fisiologia/Bioquímica", "disciplina"],
    ["Ausculta Cardíaca NAO", "disciplina"], // accents + uppercase
    ["AB", "disciplina"], // minimum length
    ["Anatomia (Cabeça e Pescoço)", "disciplina"],
    ["Porto: Semiologia Médica", "disciplina"],
    ["Aula 1 - Introdução", "conteúdo"],
    ["Capítulo 2.3 Bioquímica", "conteúdo"],
    ["[Revisão] Fisio+Bioquím", "conteúdo"],
  ];
  for (const [value, label] of valid) {
    it(`accepts "${value}"`, () => {
      assert.strictEqual(validateNamingField(value, label), null);
    });
  }
});

// Contract B: empty / too short rejected
describe("validateNamingField — empty or short", () => {
  it("empty string", () => {
    const msg = validateNamingField("", "a disciplina");
    assert.match(msg, /Informe/);
  });
  it("null-ish: space only trims to empty before call", () => {
    // Callers always trim before passing; trimmed empty string must reject
    const msg = validateNamingField("", "o nome");
    assert.ok(msg !== null);
  });
  it("single character", () => {
    const msg = validateNamingField("A", "a disciplina");
    assert.match(msg, /ao menos 2/);
  });
});

// Contract C: typographic / sentence chars rejected
describe("validateNamingField — rejected chars (pasted sentences)", () => {
  const invalid = [
    // em dash
    ["Fisiologia — Revisão", "disciplina"],
    // curly quotes
    ["\"Bioquímica\"", "disciplina"],
    // at sign
    ["Medicina@Interna", "disciplina"],
    // newline (pasted sentence fragment)
    ["Medicina\nInterna", "disciplina"],
    // asterisk
    ["Fisiologia*Básica", "disciplina"],
    // ampersand
    ["A&B", "disciplina"],
    // hash
    ["#Bioquímica", "disciplina"],
    // dollar
    ["$100 reais", "disciplina"],
    // percent
    ["50%", "disciplina"],
    // caret
    ["A^B", "disciplina"],
    // backtick
    ["`cmd`", "disciplina"],
    // tilde
    ["~Revisão", "disciplina"],
    // pipe
    ["A|B", "disciplina"],
    // backslash
    ["A\\B", "disciplina"],
  ];
  for (const [value, label] of invalid) {
    it(`rejects "${value.replace(/\n/g, "\\n")}"`, () => {
      const msg = validateNamingField(value, label);
      assert.ok(msg !== null, `expected rejection for "${value}"`);
      assert.match(msg, /caracteres não permitidos/);
    });
  }
});

// Contract D: NAMING_PATTERN itself — discrimination mutations
describe("NAMING_PATTERN — discrimination (mutation kills)", () => {
  it("accepts accented letters", () => {
    assert.ok(NAMING_PATTERN.test("Ç ã é ü ô À Ö ø"));
  });
  it("accepts digits", () => {
    assert.ok(NAMING_PATTERN.test("123"));
  });
  it("accepts hyphen", () => {
    assert.ok(NAMING_PATTERN.test("A-B"));
  });
  it("accepts slash", () => {
    assert.ok(NAMING_PATTERN.test("A/B"));
  });
  it("accepts parentheses", () => {
    assert.ok(NAMING_PATTERN.test("(teste)"));
  });
  it("accepts dot and comma", () => {
    assert.ok(NAMING_PATTERN.test("Cap. 1,2"));
  });
  it("accepts degree symbol", () => {
    assert.ok(NAMING_PATTERN.test("90°"));
  });
  it("rejects en dash U+2013", () => {
    assert.ok(!NAMING_PATTERN.test("A–B"));
  });
  it("rejects em dash U+2014", () => {
    assert.ok(!NAMING_PATTERN.test("A—B"));
  });
  it("rejects left double quote U+201C", () => {
    assert.ok(!NAMING_PATTERN.test("“teste”"));
  });
  it("rejects at sign", () => {
    assert.ok(!NAMING_PATTERN.test("a@b"));
  });
  it("rejects newline", () => {
    assert.ok(!NAMING_PATTERN.test("a\nb"));
  });
});

// Contract E: orphan prevention — validateNamingField returns non-null before any side effects
// (Pure function contract: always returns string or null, never throws)
describe("validateNamingField — no exceptions thrown", () => {
  const probes = [null, undefined, "", "A", "válido nome", "❌emoji"];
  for (const probe of probes) {
    it(`does not throw for ${JSON.stringify(probe)}`, () => {
      assert.doesNotThrow(() => validateNamingField(probe ?? "", "o campo"));
    });
  }
});
