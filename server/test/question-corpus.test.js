import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeItem, canReuseText } from '../src/corpus/item.js';
import { openCorpus, loadCorpusFiles } from '../src/corpus/corpus-index.js';
import { resolveNeed } from '../src/corpus/resolve-need.js';

// RAW_FILE -> PARSE -> NORMALIZE -> ITEM -> METADATA -> INDEX -> RETRIEVE, and then REUSE / DERIVE / GENERATE. Fixtures are synthetic: no
// real exam text is used, and no model is called.

const ITEMS = [
  { id: 'a1', usage_status: 'OFFICIAL_PUBLIC', exam: 'Simulado A', year: 2025, topic: 'Fisiologia renal', competency: 'Fluxo sanguíneo renal', item_type: 'MECHANISM',
    stem: 'Qual arteríola controla principalmente a resistência na autorregulação do fluxo sanguíneo renal?', key: 'A arteríola aferente.', explanation: 'A resistência é controlada sobretudo na aferente.' },
  { id: 'r1', usage_status: 'REFERENCE_ONLY', exam: 'Simulado B', year: 2026, topic: 'Farmacologia', competency: 'Anti-hipertensivos', item_type: 'APPLICATION',
    stem: 'Paciente hipertenso com tosse seca após iniciar inibidor da ECA. Qual a conduta mais adequada?', key: 'Trocar por bloqueador do receptor de angiotensina.' },
  { id: 'u1', topic: 'Cardiologia', competency: 'Ausculta cardíaca', item_type: 'RECALL', stem: 'Qual valva gera o primeiro componente da primeira bulha?' },
  { id: 'l1', usage_status: 'LICENSED', topic: 'Neurologia', competency: 'AVC', item_type: 'SINGLE_BEST_ANSWER',
    stem: 'Qual exame de imagem deve ser feito primeiro no AVC agudo?', options: ['Tomografia sem contraste', 'Ressonância', 'Angiografia', 'Ultrassom'], key: 'A' },
];

function withCorpus(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'sl-corpus-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(join(root, name), content);
    }
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
const jsonl = (items) => items.map((i) => JSON.stringify(i)).join('\n');

test('normalization: only a stem is required, rights default to UNKNOWN, ids are stable, a derived item needs its parent', () => {
  const bare = normalizeItem({ stem: 'Uma pergunta?' }, { sourceFile: 'a.jsonl' });
  assert.equal(bare.ok, true);
  assert.equal(bare.item.usage_status, 'UNKNOWN');
  assert.equal(bare.item.origin, 'original');
  assert.equal(normalizeItem({ stem: 'Uma pergunta?' }, { sourceFile: 'a.jsonl' }).item.id, bare.item.id, 'same file and stem -> same id');
  assert.equal(normalizeItem({ stem: 'x', usage_status: 'whatever' }).item.usage_status, 'UNKNOWN');
  assert.equal(normalizeItem({ stem: '  ' }).ok, false);
  assert.equal(normalizeItem({ stem: 'x', origin: 'derived' }).ok, false, 'derived without parent_id/relationship');
  assert.equal(normalizeItem({ stem: 'x', origin: 'derived', parent_id: 'a1', relationship: 'VARIANT' }).ok, true);
});

test('rights: only OFFICIAL_PUBLIC or LICENSED with an answer key may be reused as text; REFERENCE_ONLY and UNKNOWN never', () => {
  const norm = (o) => normalizeItem(o).item;
  assert.equal(canReuseText(norm({ stem: 'x', usage_status: 'OFFICIAL_PUBLIC', key: 'a' })), true);
  assert.equal(canReuseText(norm({ stem: 'x', usage_status: 'LICENSED', key: 'a' })), true);
  assert.equal(canReuseText(norm({ stem: 'x', usage_status: 'OFFICIAL_PUBLIC' })), false, 'no key to grade against');
  assert.equal(canReuseText(norm({ stem: 'x', usage_status: 'REFERENCE_ONLY', key: 'a' })), false);
  assert.equal(canReuseText(norm({ stem: 'x', key: 'a' })), false, 'UNKNOWN fails closed');
});

test('RAW_FILE -> INDEX: files are read under the root (JSONL and JSON, nested), bad records are refused with file, line and reason', () => {
  withCorpus({
    'a/exam1.jsonl': `${jsonl(ITEMS.slice(0, 2))}\n{not json}\n{"topic":"sem stem"}`,
    'b/exam2.json': JSON.stringify({ items: ITEMS.slice(2) }),
    '.hidden/skip.jsonl': jsonl([{ stem: 'never read' }]),
  }, (root) => {
    const { items, rejected } = loadCorpusFiles(root);
    assert.equal(items.length, 4);
    assert.deepEqual(rejected.map((r) => r.error).sort(), ['invalid JSON', 'missing stem']);
    assert.ok(rejected.every((r) => r.file && r.line));
    const corpus = openCorpus({ root });
    assert.equal(corpus.status, 'READY');
    assert.equal(corpus.size, 4);
  });
});

test('RETRIEVE: full-text search ignores accents and case, metadata filters narrow it, exposure history excludes items', () => {
  const corpus = openCorpus({ items: ITEMS.map((i) => normalizeItem(i).item) });
  const byText = corpus.search({ query: 'arteriola aferente autorregulacao' });
  assert.equal(byText[0].item.id, 'a1');
  assert.equal(corpus.search({ query: 'tosse inibidor ECA' })[0].item.id, 'r1');
  assert.deepEqual(corpus.search({ itemType: 'RECALL', topic: 'Cardiologia' }).map((c) => c.item.id), ['u1']);
  assert.equal(corpus.search({ query: 'arteriola aferente', excludeIds: ['a1'] }).some((c) => c.item.id === 'a1'), false);
  assert.equal(corpus.search({ exam: 'Simulado B' }).every((c) => c.item.exam === 'Simulado B'), true);
});

test('empty corpus: no root, an empty folder and a folder with only bad records are all CORPUS_EMPTY and the engine still answers GENERATE', () => {
  assert.equal(openCorpus({ root: null }).status, 'CORPUS_EMPTY');
  withCorpus({ 'empty.jsonl': '' }, (root) => assert.equal(openCorpus({ root }).status, 'CORPUS_EMPTY'));
  withCorpus({ 'bad.jsonl': '{oops}' }, (root) => {
    const corpus = openCorpus({ root });
    assert.equal(corpus.status, 'CORPUS_EMPTY');
    assert.equal(corpus.rejected.length, 1);
  });
  assert.deepEqual(resolveNeed(openCorpus({ root: null }), { competency: 'X', topic: 'Y' }), { action: 'GENERATE', reason: 'CORPUS_EMPTY', candidates: 0 });
  assert.equal(resolveNeed(null, { topic: 'Y' }).action, 'GENERATE');
});

test('REUSE: an item that fits the need and whose text may be reused is served as it is', () => {
  const corpus = openCorpus({ items: ITEMS.map((i) => normalizeItem(i).item) });
  const r = resolveNeed(corpus, { competency: 'Fluxo sanguíneo renal', topic: 'Fisiologia renal', itemType: 'MECHANISM' });
  assert.equal(r.action, 'REUSE');
  assert.equal(r.item.id, 'a1');
  const licensed = resolveNeed(corpus, { competency: 'AVC', topic: 'Neurologia' });
  assert.equal(licensed.action, 'REUSE');
  assert.equal(licensed.item.id, 'l1');
});

test('exposure: an item the student already saw is not offered again; the need then becomes DERIVE from it or GENERATE', () => {
  const corpus = openCorpus({ items: ITEMS.map((i) => normalizeItem(i).item) });
  const r = resolveNeed(corpus, { competency: 'Fluxo sanguíneo renal', topic: 'Fisiologia renal' }, { exposed: ['a1'] });
  assert.notEqual(r.action, 'REUSE');
  assert.equal(r.action, 'GENERATE');
});

test('REFERENCE_ONLY and UNKNOWN are never copied: a fitting item becomes DERIVE with its parent recorded and copyText false', () => {
  const corpus = openCorpus({ items: ITEMS.map((i) => normalizeItem(i).item) });
  const ref = resolveNeed(corpus, { competency: 'Anti-hipertensivos', topic: 'Farmacologia' });
  assert.deepEqual([ref.action, ref.parent_id, ref.relationship, ref.copyText, ref.reason], ['DERIVE', 'r1', 'REFERENCE_STRUCTURE', false, 'EXACT_FIT_NOT_REUSABLE_REFERENCE_ONLY']);
  const unknown = resolveNeed(corpus, { competency: 'Ausculta cardíaca', topic: 'Cardiologia' });
  assert.deepEqual([unknown.action, unknown.parent_id, unknown.copyText, unknown.reason], ['DERIVE', 'u1', false, 'EXACT_FIT_NOT_REUSABLE_UNKNOWN']);
});

test('DERIVE: a near item (words in common, not the same competency) is a structural parent; GENERATE: nothing close is a gap', () => {
  const corpus = openCorpus({ items: ITEMS.map((i) => normalizeItem(i).item) });
  const near = resolveNeed(corpus, { query: 'resistência arteriolar renal fluxo' });
  assert.equal(near.action, 'DERIVE');
  assert.equal(near.relationship, 'NEAR_STRUCTURE');
  assert.equal(near.copyText, false);
  assert.equal(near.parent_id, 'a1');
  const gap = resolveNeed(corpus, { query: 'hanseníase poliquimioterapia' });
  assert.equal(gap.action, 'GENERATE');
  assert.equal(gap.reason, 'NO_CANDIDATE');
  assert.equal(resolveNeed(corpus, { competency: 'Pediatria', topic: 'Vacinação' }).action, 'GENERATE');
});
