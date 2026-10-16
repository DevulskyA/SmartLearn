import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-F6-07: the coverage matrix is a MAP and a map rots silently. This sensor keeps the F6 reconciliation honest:
// every file it cites exists, every acceptance criterion of the spec has a row, and no row claims proof without naming it.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = readFileSync(join(root, '.specs', 'TEST_COVERAGE_MATRIX.md'), 'utf8');
const spec = readFileSync(join(root, '.specs', 'features', 'hardening-roadmap-v1', 'spec.md'), 'utf8');
const marker = '# Reconciliação F6';
const block = matrix.includes(marker) ? matrix.slice(matrix.indexOf(marker)) : '';

const rows = [...block.matchAll(/^\| (AC-\d+\.\d+) \| (.*) \| (.*) \|$/gm)].map((m) => ({ ac: m[1], evidence: m[2], proof: m[3] }));

test('the F6 reconciliation block exists and carries the sensor table and the AC map', () => {
  assert.ok(block.length > 0, `matrix must contain "${marker}"`);
  assert.match(block, /## Sensores criados ou alterados na F6/);
  assert.match(block, /## Mapa requisito → teste/);
});

test('every acceptance criterion R-01..R-13 of the spec has exactly one row in the map', () => {
  const specAcs = [...spec.matchAll(/^- (AC-\d+\.\d+):/gm)].map((m) => m[1]);
  assert.ok(specAcs.length >= 40, `spec should list its criteria (found ${specAcs.length})`);
  const mapped = rows.map((r) => r.ac);
  for (const ac of specAcs) assert.equal(mapped.filter((x) => x === ac).length, 1, `${ac} must appear exactly once in the matrix map`);
  for (const ac of mapped) assert.ok(specAcs.includes(ac), `${ac} is in the matrix but not in spec.md`);
});

test('every file path cited between backticks in the F6 block exists (a rename or deletion turns the matrix red)', () => {
  const cited = [...new Set([...block.matchAll(/`((?:test|server\/test|e2e|scripts|src-tauri\/src|\.specs)\/[A-Za-z0-9_./-]+\.[a-z]+)`/g)].map((m) => m[1]))];
  assert.ok(cited.length >= 30, `expected many citations, found ${cited.length}`);
  for (const p of cited) assert.ok(existsSync(join(root, p)), `cited path does not exist: ${p}`);
});

test('every row states a proof class; NOT_PROVEN and MUTATION-KILLED rows say why/which; no row is blank', () => {
  for (const r of rows) {
    assert.match(r.proof, /^(TESTED|MUTATION-KILLED M\d+[a-z]?(, M\d+[a-z]?)*|HUMAN|NOT_PROVEN)\b/, `${r.ac}: unknown proof class "${r.proof}"`);
    assert.ok(r.evidence.trim().length > 0, `${r.ac}: empty evidence`);
    if (r.proof.startsWith('NOT_PROVEN')) assert.match(r.proof, /\(.{8,}\)/, `${r.ac}: NOT_PROVEN needs a reason in parentheses`);
    if (r.proof.startsWith('TESTED') || r.proof.startsWith('MUTATION')) assert.match(r.evidence, /`[^`]+\.(js|mjs|rs)`/, `${r.ac}: a TESTED row must cite at least one test or script file`);
  }
});

test('every mutation id the matrix cites exists in the mutation catalog', async () => {
  const { MUTATIONS } = await import('../scripts/mutation-check.mjs');
  const ids = new Set(MUTATIONS.map((m) => m.id));
  const cited = [...new Set([...block.matchAll(/\bM(\d+[a-z]?)\b/g)].map((m) => `M${m[1]}`))];
  assert.ok(cited.length > 0);
  for (const id of cited) assert.ok(ids.has(id), `matrix cites ${id}, which is not in scripts/mutation-check.mjs`);
});
