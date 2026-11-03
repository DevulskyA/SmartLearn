import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNamingField, validateTitleField } from "../src/naming-validation.js";

// Characterization: the exact pt-BR text of every message, pinned before the strings move to the catalog.
test("validateNamingField: empty value message", () => {
  assert.equal(validateNamingField("", "a disciplina"), "Informe a disciplina.");
});

test("validateNamingField: too short message", () => {
  assert.equal(validateNamingField("A", "a disciplina"), "a disciplina deve ter ao menos 2 caracteres.");
});

test("validateNamingField: invalid characters message", () => {
  assert.equal(
    validateNamingField("A@B", "o nome da disciplina"),
    "o nome da disciplina contém caracteres não permitidos. Use letras, números, espaços e pontuação básica ( - / . , : ).",
  );
});

test("validateTitleField: empty and whitespace-only message", () => {
  assert.equal(validateTitleField("", "o conteúdo estudado"), "Informe o conteúdo estudado.");
  assert.equal(validateTitleField("   ", "o conteúdo estudado"), "Informe o conteúdo estudado.");
});

test("validateTitleField: control characters message", () => {
  assert.equal(
    validateTitleField("Teste\nLinha", "o conteúdo estudado"),
    "o conteúdo estudado contém caracteres de controle não permitidos.",
  );
});
