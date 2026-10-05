import test from 'node:test';
import assert from 'node:assert/strict';
import { findMojibake, findAsciiEllipsis, scanFiles, trackedTextFiles, readUtf8 } from '../scripts/text-integrity.mjs';

// T-F4-07 (F-36): pt-BR accents must never regress into mojibake, and loading messages share one ellipsis. The bad samples are
// built from \u escapes so this file contains no corrupted literal itself.
const C = 'Ã'; // A-tilde, the first character of almost every UTF-8-read-as-Latin-1 pair
const BAD = {
  'c-cedilla + a-tilde read as Latin-1 ("ação")': `a${C}§${C}£o`,
  'e-acute read as Latin-1': `caf${C}©`,
  'E-acute read as cp1252': `${C}‰`,
  'ordinal read as Latin-1': '1\u00C2\u00BA',
  'non-breaking space read as Latin-1': 'a\u00C2\u00A0b',
  'curly quote read as cp1252 (three characters)': '\u00E2\u20AC\u0153',
  'replacement character': 'a\uFFFDb',
};
const GOOD = [
  'Ação, órgão, é, ê, ç, ã, õ, ü, à, ô, í, ú, Á, É, Í, Ó, Ú, Â, Ê, Ô, Ç, Ã, Õ',
  'SÃO PAULO · ÃO · ÂMBITO · Âmbito · ÂNGULO',
  '1º, 2ª, “aspas”, ‘simples’, — travessão, – meia, … reticências, nº, ° graus',
  'Questão 3, sinalizada, 2 pontos · Título salvo · Não foi possível salvar.',
];

for (const [name, text] of Object.entries(BAD)) {
  test(`findMojibake flags: ${name}`, () => {
    const hits = findMojibake(`linha 1\nlinha 2 ${text} fim`);
    assert.equal(hits.length >= 1, true, `expected a hit in ${JSON.stringify(text)}`);
    assert.equal(hits[0].line, 2);
    assert.equal(typeof hits[0].column, 'number');
  });
}

test('findMojibake never flags correct Portuguese (accents, capitals, typographic punctuation)', () => {
  for (const text of GOOD) assert.deepEqual(findMojibake(text), [], text);
});

test('findMojibake counts CRLF and LF lines the same way', () => {
  assert.equal(findMojibake(`a\r\nb\r\n${BAD['replacement character']}`)[0].line, 3);
});

test('scanFiles reports the path of a corrupted file held only in memory (the guard has teeth)', () => {
  const files = { 'src/ok.js': 'const a = "Título salvo";', 'src/bad.js': `const a = "${BAD['c-cedilla + a-tilde read as Latin-1 ("ação")']}";` };
  const hits = scanFiles(Object.keys(files), (p) => files[p], findMojibake);
  assert.deepEqual(hits.map((h) => h.path), ['src/bad.js']);
});

test('the tracked code, UI, server, tests and scripts contain no mojibake', () => {
  const paths = trackedTextFiles();
  // the scan must really cover the screens, the server and the locale file, or "no hits" would prove nothing
  for (const must of ['index.html', 'src/app.js', 'src/materials-ui.js', 'src/i18n/locales/pt-BR.js', 'server/src/main.js']) assert.ok(paths.includes(must), `${must} is scanned`);
  assert.ok(paths.length > 150, `expected many files, got ${paths.length}`);
  const hits = scanFiles(paths, readUtf8, findMojibake);
  assert.deepEqual(hits.map((h) => `${h.path}:${h.line}:${h.column} ${h.kind}`), []);
});

test('findAsciiEllipsis flags "..." closing a message, and only that', () => {
  assert.equal(findAsciiEllipsis('setMessage("Enviando PDF...");').length, 1);
  assert.equal(findAsciiEllipsis('<option value="">Selecione...</option>').length, 1);
  assert.equal(findAsciiEllipsis('placeholder="Escreva o resumo..."').length, 1);
  assert.equal(findAsciiEllipsis('setMessage("Enviando PDF…");').length, 0);
  assert.equal(findAsciiEllipsis('const copy = [...items]; // etc...').length, 0);
  assert.equal(findAsciiEllipsis('fn(...args)').length, 0);
  assert.equal(findAsciiEllipsis('"um... outro"').length, 0);
});

test('loading and progress messages in the app and index.html end with the ellipsis character, never three dots', () => {
  const paths = trackedTextFiles().filter((p) => p === 'index.html' || (/^src\/[^/]+\.js$/.test(p)));
  assert.ok(paths.includes('src/materials-ui.js') && paths.includes('index.html'));
  const hits = scanFiles(paths, readUtf8, findAsciiEllipsis);
  assert.deepEqual(hits.map((h) => `${h.path}:${h.line} ${h.sample}`), []);
});
