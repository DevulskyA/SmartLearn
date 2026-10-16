import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MUTATIONS, MARKER_FILE, REPO_ROOT, assertDisposableWorktree, applyMutation, runMutation, runTests, summarize } from '../scripts/mutation-check.mjs';

const MARKER_TEXT = 'disposable worktree created by scripts/mutation-check.mjs; safe to delete\n';

// A throwaway "worktree" that satisfies the guard (temp dir, marker, .git FILE) with a tiny project and a real `node --test` file.
function fakeWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'sl-mutcheck-'));
  writeFileSync(join(root, MARKER_FILE), MARKER_TEXT);
  writeFileSync(join(root, '.git'), 'gitdir: elsewhere\n');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'f.mjs'), 'export const f = () => 1;\nexport const g = () => 2;\n');
  writeFileSync(join(root, 'f.test.mjs'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { f } from './src/f.mjs';\ntest('f is one', () => assert.equal(f(), 1));\n");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const mut = (over) => ({ id: 'T', area: 'fake', why: 'fake', file: 'src/f.mjs', find: 'f = () => 1', replace: 'f = () => 99', cwd: '.', tests: ['f.test.mjs'], ...over });

test('guard: refuses the real repository, an unmarked temp dir, a marked dir without a linked .git, and a dir outside the OS temp dir', () => {
  assert.throws(() => assertDisposableWorktree(REPO_ROOT), /refuses/);
  const plain = mkdtempSync(join(tmpdir(), 'sl-mutcheck-plain-'));
  try {
    assert.throws(() => assertDisposableWorktree(plain), /unmarked/);
    writeFileSync(join(plain, MARKER_FILE), MARKER_TEXT);
    assert.throws(() => assertDisposableWorktree(plain), /not a linked git worktree/);
    writeFileSync(join(plain, '.git'), 'gitdir: x\n');
    assert.doesNotThrow(() => assertDisposableWorktree(plain));
    // same dir, but the "OS temp dir" is somewhere else: it is outside
    assert.throws(() => assertDisposableWorktree(plain, { tmpRoot: REPO_ROOT }), /outside the OS temp dir/);
  } finally { rmSync(plain, { recursive: true, force: true }); }
});

test('runMutation and applyMutation both refuse the real tree before touching anything', () => {
  const before = readFileSync(join(REPO_ROOT, MUTATIONS[0].file), 'utf8');
  let ran = 0;
  assert.throws(() => runMutation(REPO_ROOT, MUTATIONS[0], { run: () => { ran++; return { exitCode: 0, failed: [] }; } }), /refuses/);
  assert.equal(ran, 0, 'no test command may even start against the real tree');
  assert.throws(() => applyMutation(REPO_ROOT, MUTATIONS[0]), /refuses/);
  assert.equal(readFileSync(join(REPO_ROOT, MUTATIONS[0].file), 'utf8'), before);
});

test('a mutation that a test notices is KILLED, with the failing test named, and the file is restored byte for byte', () => {
  const wt = fakeWorktree();
  try {
    const before = readFileSync(join(wt.root, 'src', 'f.mjs'), 'utf8');
    const r = runMutation(wt.root, mut());
    assert.equal(r.status, 'KILLED');
    assert.deepEqual(r.killedBy, ['f is one']);
    assert.equal(readFileSync(join(wt.root, 'src', 'f.mjs'), 'utf8'), before);
  } finally { wt.cleanup(); }
});

test('a mutation no test notices SURVIVES; a mutation that stops the file from loading is BROKEN_MUTANT, never a kill', () => {
  const wt = fakeWorktree();
  try {
    assert.equal(runMutation(wt.root, mut({ find: 'g = () => 2', replace: 'g = () => 3' })).status, 'SURVIVED');
    assert.equal(runMutation(wt.root, mut({ find: 'export const f = () => 1;', replace: 'export const f = (' })).status, 'BROKEN_MUTANT');
  } finally { wt.cleanup(); }
});

test('a red baseline is reported as BASELINE_RED and nothing is mutated', () => {
  const wt = fakeWorktree();
  try {
    writeFileSync(join(wt.root, 'src', 'f.mjs'), 'export const f = () => 5;\n');
    const r = runMutation(wt.root, mut({ find: 'f = () => 5', replace: 'f = () => 6' }));
    assert.equal(r.status, 'BASELINE_RED');
    assert.equal(readFileSync(join(wt.root, 'src', 'f.mjs'), 'utf8'), 'export const f = () => 5;\n');
  } finally { wt.cleanup(); }
});

test('an anchor that is missing or ambiguous aborts instead of silently mutating nothing', () => {
  const wt = fakeWorktree();
  try {
    assert.throws(() => runMutation(wt.root, mut({ find: 'does not exist' })), /exactly once.*found 0/);
    assert.throws(() => runMutation(wt.root, mut({ find: '() =>' })), /exactly once.*found 2/);
    assert.equal(readFileSync(join(wt.root, 'src', 'f.mjs'), 'utf8'), 'export const f = () => 1;\nexport const g = () => 2;\n');
  } finally { wt.cleanup(); }
});

test('summarize: ok only when EVERY mutation was killed (a survivor, a broken mutant or a red baseline all fail the run)', () => {
  const k = { status: 'KILLED' };
  assert.equal(summarize([k, k]).ok, true);
  for (const bad of ['SURVIVED', 'BROKEN_MUTANT', 'BASELINE_RED']) assert.equal(summarize([k, { status: bad }]).ok, false);
  assert.equal(summarize([]).ok, false);
});

test('runTests extracts the NAMES of failing tests (not only the exit code) from a real node --test run', () => {
  const wt = fakeWorktree();
  try {
    writeFileSync(join(wt.root, 'src', 'f.mjs'), 'export const f = () => 2;\n');
    const r = runTests(wt.root, '.', ['f.test.mjs']);
    assert.notEqual(r.exitCode, 0);
    assert.ok(r.failed.includes('f is one'), JSON.stringify(r.failed));
  } finally { wt.cleanup(); }
});

test('catalog drift sensor: every mutation anchor still occurs exactly once in the real source, ids are unique, and each names tests that exist', () => {
  const ids = new Set();
  for (const m of MUTATIONS) {
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`); ids.add(m.id);
    const text = readFileSync(join(REPO_ROOT, m.file), 'utf8');
    assert.equal(text.split(m.find).length - 1, 1, `${m.id}: anchor must occur exactly once in ${m.file}`);
    assert.notEqual(m.find, m.replace, `${m.id}: a no-op mutation proves nothing`);
    assert.ok(m.tests.length > 0);
    for (const t of m.tests) assert.doesNotThrow(() => readFileSync(join(REPO_ROOT, m.cwd, t)), `${m.id}: missing test ${t}`);
  }
  // the five areas the requirement names must all be covered
  const areas = MUTATIONS.map((m) => m.area).join('|');
  for (const needle of ['identidade', 'devPersistent', 'rejeição', 'sanitizador', 'checksum']) assert.match(areas, new RegExp(needle));
});
