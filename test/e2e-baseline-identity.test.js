import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineIdentity, checkDuration } from '../scripts/e2e.mjs';

// Lote 2026-11-08, item 3: a duration baseline is only a fair comparison for the SAME selection of tests on the SAME configuration. Every run with
// arguments used to share the key "full@3w+args" (a single spec, a -g filter and a hand-picked list all compared with each other), so a deviation
// could mean "different tests" instead of "slow target".

const GRAMMAR = /^[a-z0-9-]+@\d+w(\+sel-[0-9a-f]{10})?$/;

test('no arguments: the whole suite keeps the plain key; a named suite keeps its own', () => {
  assert.deepEqual(baselineIdentity({ suite: undefined, workers: 3, args: [] }), { key: 'full@3w' });
  assert.deepEqual(baselineIdentity({ suite: 'smoke', workers: 1, args: [] }), { key: 'smoke@1w' });
});

test('the selection is part of the identity: other files, another filter or another repeat count are other keys', () => {
  const key = (args) => baselineIdentity({ workers: 3, args }).key;
  const one = key(['e2e/a.spec.js']);
  assert.match(one, GRAMMAR);
  assert.notEqual(one, 'full@3w');
  assert.notEqual(key(['e2e/b.spec.js']), one);
  assert.notEqual(key(['e2e/a.spec.js', 'e2e/b.spec.js']), one);
  assert.notEqual(key(['e2e/a.spec.js', '-g', 'LOSS']), one);
  assert.notEqual(key(['e2e/a.spec.js', '-g', 'LOSS']), key(['e2e/a.spec.js', '-g', 'OTHER']));
  assert.notEqual(key(['e2e/a.spec.js', '--repeat-each=3']), one);
  assert.notEqual(key(['e2e/a.spec.js', '--grep', 'x']), key(['e2e/a.spec.js', '--grep-invert', 'x']));
});

test('the same selection spelled differently is the same key: order of files, path separators and the reporter do not matter', () => {
  const key = (args) => baselineIdentity({ workers: 3, args }).key;
  assert.equal(key(['e2e/a.spec.js', 'e2e/b.spec.js']), key(['e2e/b.spec.js', 'e2e/a.spec.js']));
  assert.equal(key(['e2e\\a.spec.js']), key(['e2e/a.spec.js']));
  assert.equal(key(['e2e/a.spec.js', '-g', 'X']), key(['-g', 'X', 'e2e/a.spec.js']));
  assert.equal(key(['e2e/a.spec.js', '--reporter=dot']), key(['e2e/a.spec.js']));
  assert.equal(key(['e2e/a.spec.js', '--reporter', 'line']), key(['e2e/a.spec.js']));
  assert.equal(key(['-g', 'X', 'e2e/a.spec.js']), key(['--grep=X', 'e2e/a.spec.js']), 'short and long spelling of the filter');
});

test('the configuration is part of the identity: workers and suite', () => {
  const sel = ['e2e/a.spec.js'];
  assert.notEqual(baselineIdentity({ workers: 1, args: sel }).key, baselineIdentity({ workers: 3, args: sel }).key);
  assert.notEqual(baselineIdentity({ suite: 'smoke', workers: 1, args: sel }).key, baselineIdentity({ workers: 1, args: sel }).key);
  assert.match(baselineIdentity({ suite: 'smoke', workers: 1, args: sel }).key, /^smoke@1w\+sel-/);
});

test('--changed and --failed select tests from the working tree or the last run: they have no comparable baseline, and say why', () => {
  for (const flag of ['--only-changed', '--last-failed']) {
    const identity = baselineIdentity({ workers: 3, args: [flag] });
    assert.equal(identity.key, null, flag);
    assert.match(identity.reason, /working tree|last run/i);
    assert.equal(baselineIdentity({ workers: 3, args: ['e2e/a.spec.js', flag] }).key, null, 'with a file too');
  }
});

test('checkDuration: a run without a comparable key is neither compared nor recorded, and --record-baseline is refused for it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-baseline-'));
  const file = join(dir, 'baseline.json');
  try {
    writeFileSync(file, JSON.stringify({ 'full@3w': 100 }));
    const lines = [];
    const log = (line) => lines.push(line);
    const result = checkDuration({ seconds: 500, key: null, reason: 'depends on the working tree', code: 0, record: true, file, log });
    assert.equal(result, undefined, 'no deviation can be reported against nothing');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { 'full@3w': 100 }, 'nothing was recorded');
    assert.ok(lines.some((l) => /not recorded|no comparable baseline/i.test(l) && /working tree/.test(l)), lines.join('\n'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checkDuration: compares only against its own key, records only on a green run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-baseline-'));
  const file = join(dir, 'baseline.json');
  try {
    writeFileSync(file, JSON.stringify({ 'full@3w+sel-aaaaaaaaaa': 50 }));
    const lines = [];
    const log = (line) => lines.push(line);
    assert.equal(checkDuration({ seconds: 52, key: 'full@3w+sel-aaaaaaaaaa', code: 0, record: false, file, log }), undefined, 'within 30%');
    assert.equal(checkDuration({ seconds: 120, key: 'full@3w+sel-aaaaaaaaaa', code: 0, record: false, file, log }), true, 'far from its own baseline');
    assert.equal(checkDuration({ seconds: 120, key: 'full@3w+sel-bbbbbbbbbb', code: 0, record: false, file, log }), undefined, 'another selection has no baseline: reported as such, not as a deviation');
    assert.ok(lines.some((l) => /NO BASELINE for full@3w\+sel-bbbbbbbbbb/.test(l)));
    checkDuration({ seconds: 77, key: 'full@3w+sel-bbbbbbbbbb', code: 1, record: true, file, log });
    assert.equal(JSON.parse(readFileSync(file, 'utf8'))['full@3w+sel-bbbbbbbbbb'], undefined, 'a red run records nothing');
    checkDuration({ seconds: 77, key: 'full@3w+sel-bbbbbbbbbb', code: 0, record: true, file, log });
    assert.equal(JSON.parse(readFileSync(file, 'utf8'))['full@3w+sel-bbbbbbbbbb'], 77);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the committed baseline file holds no key of the old ambiguous form ("+args")', () => {
  const recorded = JSON.parse(readFileSync(fileURLToPath(new URL('../e2e/.duration-baseline.json', import.meta.url)), 'utf8'));
  for (const key of Object.keys(recorded)) assert.match(key, GRAMMAR, `ambiguous or malformed baseline key: ${key}`);
});
