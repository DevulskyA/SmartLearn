import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { looksLikeProse, scanSource, scanAll, toMigrate, BASELINE_PATH } from '../scripts/scan-portuguese-i18n.mjs';

// The scanner is the ratchet that stops new Portuguese text from landing in code instead of src/i18n/locales.
// Fixtures are synthetic; the source strings below are written with plain ASCII or ordinary accents.

test('prose is told apart from identifiers, selectors, URLs, SQL, CSS and SVG data', () => {
  for (const text of ['Salvar alterações', 'Não foi possível concluir a operação.', 'Você está offline', 'Sem disciplina']) assert.equal(looksLikeProse(text), true, text);
  for (const text of ['is-highlighted', '.review-row', '#today-primary-action', 'review-exercise-item hidden', '/v1/subjects', 'https://x.test/a', 'SELECT id FROM subjects', 'position:sticky;top:0;z-index:200;', 'M6 9l6 6 6-6', 'data-review-id', 'application/json']) {
    assert.equal(looksLikeProse(text), false, text);
  }
});

test('a single capitalised word counts only where it is certainly shown', () => {
  assert.equal(looksLikeProse('Salvar'), false);
  assert.equal(looksLikeProse('Salvar', { visibleContext: true }), true);
  assert.equal(looksLikeProse('save', { visibleContext: true }), false);
});

test('text sinks are classified; comments, object keys, imports and t() arguments are never findings', () => {
  const source = [
    "import x from './não-é-texto.js';",
    '// Comentário em português com acentuação não conta',
    'const o = { "chave não conta": 1 };',
    'el.textContent = "Nenhum item para revisar";',
    'el.setAttribute("aria-label", "Fechar janela");',
    'el.setAttribute("class", "caixa de aviso grande");',
    'createTextElement("p", "empty", `Nada por aqui, ${name}`);',
    'el.innerHTML = `<p>Olá, <b>mundo</b> não visto</p>`;',
    'console.error("Falha ao registrar a tentativa");',
    'throw new Error("Falha de rede ao acessar o servidor");',
    't("today.empty", { name });',
    'const hidden = "Texto solto que não é usado em nenhum destino";',
  ].join('\n');
  const found = scanSource(source, 'fixture.js').map((f) => `${f.category}:${f.text}`);
  assert.deepEqual(found, [
    'visible:Nenhum item para revisar',
    'visible:Fechar janela',
    'visible:Nada por aqui,',
    'html:Olá, mundo não visto',
    'diagnostic:Falha ao registrar a tentativa',
    'diagnostic:Falha de rede ao acessar o servidor',
    'visible:Texto solto que não é usado em nenhum destino',
  ]);
});

test('BOM and import attributes parse; a syntax error is reported, not swallowed', () => {
  assert.deepEqual(scanSource('﻿const a = 1;', 'bom.js'), []);
  assert.deepEqual(scanSource('import data from "./d.json" with { type: "json" };', 'attr.js'), []);
  assert.throws(() => scanSource('const = ;', 'broken.js'));
});

test('RATCHET: no client file may have more Portuguese text in code than the committed baseline (migrate, then lower the baseline)', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { byFile } = scanAll();
  const worse = [];
  for (const [file, counts] of Object.entries(byFile)) {
    const now = toMigrate(counts);
    const allowed = baseline[file] ?? 0;
    if (now > allowed) worse.push(`${file}: ${now} > baseline ${allowed}`);
  }
  assert.deepEqual(worse, [], 'new user-visible text must go through t() with a key in src/i18n/locales/pt-BR.js');
});

test('the baseline only lists files that exist and never hides a count that went down to zero', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { byFile } = scanAll();
  for (const [file, allowed] of Object.entries(baseline)) {
    assert.ok(file in byFile, `${file} is in the baseline but no longer a client file`);
    assert.ok(Number.isInteger(allowed) && allowed > 0, `${file}: baseline entries must be positive integers (delete a file once it reaches 0)`);
  }
});
