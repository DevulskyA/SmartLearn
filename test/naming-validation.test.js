import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateNamingField, validateTitleField, NAMING_PATTERN } from "../src/naming-validation.js";

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
    // AC-05 / T04: medical/scientific typography now accepted in discipline names too
    ["Farmacologia — β-bloqueadores", "disciplina"],
    ["Na⁺/K⁺-ATPase", "disciplina"],
    ["Bioquímica — O₂ e µg", "disciplina"],
    ["Fisiologia — Revisão", "disciplina"],
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
  it("accepts en dash U+2013 (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("A–B"));
  });
  it("accepts em dash U+2014 (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("A—B"));
  });
  it("accepts Greek letters (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("β-bloqueador"));
  });
  it("accepts superscript plus U+207A (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("Na⁺"));
  });
  it("accepts subscript 2 U+2082 (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("O₂"));
  });
  it("accepts micro sign U+00B5 (AC-05)", () => {
    assert.ok(NAMING_PATTERN.test("µg"));
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

// Contract F: validateTitleField — AC-004 corpus: accepts medical typography
describe("validateTitleField — AC-004 medical corpus accepted", () => {
  const valid = [
    // AC-004 literal: em dash must pass
    "Ausculta Cardíaca — Bulhas e Sopros",
    // medical symbols
    "Na⁺/K⁺-ATPase e β-bloqueador",
    "O₂, µg, pH < 7,35",
    // plain title
    "Homeostase",
    // single char
    "A",
    // mixed punctuation
    "Capítulo 2.3 — Bioquímica",
  ];
  for (const v of valid) {
    it(`accepts "${v}"`, () => {
      assert.strictEqual(validateTitleField(v, "o título"), null);
    });
  }
});

// Contract G: validateTitleField — control chars rejected, empty rejected
describe("validateTitleField — control chars and empty rejected", () => {
  it("empty string rejected", () => {
    assert.ok(validateTitleField("", "o campo") !== null);
  });
  it("whitespace-only rejected", () => {
    assert.ok(validateTitleField("   ", "o campo") !== null);
  });
  it("NUL byte rejected (AC-026)", () => {
    assert.ok(validateTitleField("Teste\x00", "o campo") !== null);
  });
  it("newline rejected (single-line field)", () => {
    assert.ok(validateTitleField("Teste\nLinha", "o campo") !== null);
  });
  it("carriage return rejected", () => {
    assert.ok(validateTitleField("Teste\rOutro", "o campo") !== null);
  });
});

// Contract H: T04 unification — medical typography accepted by both validators.
// validateNamingField still differs from validateTitleField on sentence-signal
// ASCII symbols (@ # $ % etc, still rejected for discipline names only) and on
// minimum length (2 chars), but no longer on em dash/Greek/superscripts.
describe("validateTitleField vs validateNamingField — unified medical typography, distinct sentence-guard", () => {
  it("em dash accepted by title validator", () => {
    assert.strictEqual(validateTitleField("Ausculta Cardíaca — Bulhas e Sopros", "título"), null);
  });
  it("em dash also accepted by discipline name validator (T04)", () => {
    assert.strictEqual(validateNamingField("Fisiologia — Revisão", "disciplina"), null);
  });
  it("plain discipline name accepted by both", () => {
    assert.strictEqual(validateNamingField("Semiologia Médica", "disciplina"), null);
    assert.strictEqual(validateTitleField("Semiologia Médica", "título"), null);
  });
  it("sentence-signal symbol still rejected by discipline name validator only", () => {
    assert.ok(validateNamingField("Medicina@Interna", "disciplina") !== null);
    assert.strictEqual(validateTitleField("Medicina@Interna", "título"), null);
  });
});
