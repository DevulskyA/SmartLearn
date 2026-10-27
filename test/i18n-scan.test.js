import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { looksLikeProse, scanSource, scanHtml, scanAll, scanServerAndShared, SERVER_PROSE_BASELINE, toMigrate, BASELINE_PATH } from '../scripts/scan-portuguese-i18n.mjs';

// The scanner is the ratchet that stops new Portuguese text from landing in code instead of src/i18n/locales.
// Fixtures are synthetic; the source strings below are written with plain ASCII or ordinary accents.

test('prose is told apart from identifiers, selectors, URLs, SQL, CSS and SVG data', () => {
  for (const text of ['Salvar alterações', 'Não foi possível concluir a operação.', 'Você está offline', 'Sem disciplina']) assert.equal(looksLikeProse(text), true, text);
  for (const text of ['is-highlighted', '.review-row', '#today-primary-action', 'review-exercise-item hidden', '/v1/subjects', 'https://x.test/a', 'SELECT id FROM subjects', 'WHERE id = $2','position:sticky;top:0;z-index:200;', 'M6 9l6 6 6-6', 'data-review-id', 'application/json']) {
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

test('a NEW file that is not in git yet is scanned too: fixed text in it is caught before it is ever committed', () => {
  const rel = `src/zz-i18n-probe-${process.pid}.js`;
  const abs = join(dirname(fileURLToPath(import.meta.url)), '..', rel);
  writeFileSync(abs, [
    "const el = document.createElement('button');",
    "el.textContent = 'Texto fixo de prova';",
    "el.setAttribute('aria-label', 'Rótulo fixo de prova');",
    "el.title = 'Dica fixa de prova';",
    'export default el;',
  ].join('\n'));
  try {
    const { byFile } = scanAll();
    assert.ok(rel in byFile, 'an untracked file under src/ is a client file');
    assert.equal(byFile[rel].visible, 3, 'textContent, aria-label and title with fixed text are all found');
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    assert.ok(toMigrate(byFile[rel]) > (baseline[rel] ?? 0), 'so the RATCHET above would fail on it');
  } finally {
    rmSync(abs, { force: true });
  }
  assert.ok(!(rel in scanAll().byFile), 'and the probe is gone');
});

test('scanHtml: static text with no data-i18n is counted; text the catalog backs, brand names, scripts, styles and comments are not', () => {
  const page = [
    '<title>SmartLearn</title>',
    '<h1 data-i18n="screens.today.title">Hoje</h1>',
    '<button class="x">Salvar alterações</button>',
    '<input placeholder="Escreva o resumo" data-i18n-placeholder="screens.form.summaryPlaceholder">',
    '<input placeholder="Escreva o resumo">',
    '<button aria-label="Alternar tema rápido" data-i18n-aria-label="shell.theme.toggle">T</button>',
    '<!-- Texto de comentário que não aparece -->',
    '<script>const a = "Texto dentro de script";</script>',
    '<style>.a::after { content: "Texto de estilo"; }</style>',
  ].join('\n');
  const found = scanHtml(page, 'p.html');
  assert.deepEqual(found.map((f) => [f.line, f.text]), [[3, 'Salvar alterações'], [5, 'placeholder="Escreva o resumo"']]);
});

test('SERVER+SHARED RATCHET: the Portuguese text carried by server and shared code (outside the client catalog) does not grow past what was measured', () => {
  const { total } = scanServerAndShared();
  assert.ok(total <= SERVER_PROSE_BASELINE, `server/shared carry ${total} Portuguese strings, the frozen baseline is ${SERVER_PROSE_BASELINE}: a new text for the screen needs the contract decision (code + params, text in the client catalog)`);
});
