import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createParser, effectiveState, renderTestsSection, headValidation } from '../scripts/test-live-core.mjs';

const TAP = `TAP version 13
# Subtest: suite A
    # Subtest: leaf 1
    ok 1 - leaf 1
      ---
      duration_ms: 1
      ...
    # Subtest: leaf 2
    not ok 2 - leaf 2
      ---
      error: 'boom'
      ...
    # Subtest: leaf 3
    ok 3 - leaf 3 # SKIP
    1..3
not ok 1 - suite A
# Subtest: top-level leaf
ok 2 - top-level leaf
  ---
  ...
1..2
# tests 4
# suites 1
# pass 2
# fail 1
# cancelled 0
# skipped 1
# todo 0
`;

test('tap parser counts leaf tests only (suites are containers) and prefers the runner summary at the end', () => {
  const p = createParser('tap');
  // chunks split mid-line on purpose
  for (let i = 0; i < TAP.length; i += 17) p.feed(TAP.slice(i, i + 17));
  const live = p.snapshot();
  assert.deepEqual(live.counts, { total: null, done: 4, passed: 2, failed: 1, skipped: 1 });
  assert.equal(live.lastTest, 'top-level leaf');
  const fin = p.finish();
  assert.deepEqual(fin.counts, { total: 4, done: 4, passed: 2, failed: 1, skipped: 1 });
});

test('playwright list parser reads total, per-test results and the final summary', () => {
  const out = `Running 5 tests using 1 worker\n  ✓   1 [chromium] › a.spec.js:3:1 › first (1.2s)\n  ✘   2 [chromium] › a.spec.js:9:1 › second (30.0s)\n  -   3 [chromium] › b.spec.js:1:1 › skipped\n  ok  4 [chromium] › b.spec.js:5:1 › fourth (2ms)\n\n  1 failed\n    a.spec.js:9:1\n  1 skipped\n  3 passed (40s)\n`;
  const p = createParser('playwright');
  p.feed(out);
  assert.equal(p.snapshot().counts.total, 5);
  assert.deepEqual(p.snapshot().counts, { total: 5, done: 4, passed: 2, failed: 1, skipped: 1 });
  const fin = p.finish();
  assert.deepEqual(fin.counts, { total: 5, done: 5, passed: 3, failed: 1, skipped: 1 });
});

const base = { suite: 'unit', state: 'PASS', headTested: 'aaaaaaa1', runnerPid: 4242, exitCode: 0, updatedAt: new Date().toISOString(), counts: { total: 3, done: 3, passed: 3, failed: 0, skipped: 0 } };
const dead = () => false;
const live = () => true;

test('effective state: result of the current head is PASS/FAIL; another head is STALE', () => {
  assert.equal(effectiveState(base, { currentHead: 'aaaaaaa1', alive: dead }).state, 'PASS');
  assert.equal(effectiveState({ ...base, state: 'FAIL', exitCode: 1 }, { currentHead: 'aaaaaaa1', alive: dead }).state, 'FAIL');
  const stale = effectiveState(base, { currentHead: 'bbbbbbb2', alive: dead });
  assert.equal(stale.state, 'STALE');
  assert.match(stale.note, /PASS/);
});

test('effective state: RUNNING only while the runner pid is alive; a dead runner is ABORTED, never RUNNING', () => {
  const running = { ...base, state: 'RUNNING', exitCode: null };
  assert.equal(effectiveState(running, { currentHead: 'aaaaaaa1', alive: live }).state, 'RUNNING');
  assert.equal(effectiveState(running, { currentHead: 'aaaaaaa1', alive: dead }).state, 'ABORTED');
  assert.equal(effectiveState({ ...base, state: 'ABORTED', exitCode: 130 }, { currentHead: 'aaaaaaa1', alive: dead }).state, 'ABORTED');
});

test('the section shows tested vs current head, counts, exit code, pid and log path; escapes text', () => {
  const html = renderTestsSection([{ ...base, cmd: 'node --test <x>', log: 'C:/l.log', lastTest: 'a & b', startedAt: base.updatedAt, durationMs: 61000 }], { currentHead: 'bbbbbbb2', alive: dead });
  assert.match(html, /TESTES AO VIVO/);
  assert.match(html, /DESATUALIZADO/);
  assert.doesNotMatch(html, /STALE/);
  assert.match(html, /<details class="tl-box"><summary><strong>TESTES AO VIVO:<\/strong> [^<]*DESATUALIZADO/);
  assert.match(html, /HEAD testado aaaaaaa ≠ HEAD atual/);
  assert.match(html, /3\/3 feitos/);
  assert.match(html, /exit 0/);
  assert.match(html, /pid 4242/);
  assert.match(html, /1m01s/);
  assert.match(html, /log: C:\/l\.log/);
  assert.match(html, /node --test &lt;x&gt;/);
  assert.match(html, /a &amp; b/);
  assert.match(renderTestsSection([], {}), /nenhuma execução registrada/);
});

test('SUITES run the same tests as the project scripts (a narrower discovery would report PASS on fewer tests)', async () => {
  const { readFileSync } = await import('node:fs');
  const { SUITES } = await import('../scripts/test-live-core.mjs');
  const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const server = JSON.parse(readFileSync(new URL('../server/package.json', import.meta.url), 'utf8')).scripts;
  assert.equal(root.test, 'node --test "test/*.test.js"');
  assert.deepEqual(SUITES.unit.args.filter((a) => !a.startsWith('--test-reporter')), ['--test', 'test/*.test.js']);
  assert.equal(server.test, 'node --test');
  assert.deepEqual(SUITES.server.args.filter((a) => !a.startsWith('--test-reporter')), ['--test']);
  // ONE authority for the full e2e: whatever script package.json's test:e2e runs is the one the live runner runs, never the Playwright CLI directly
  assert.equal(root['test:e2e'], 'node scripts/e2e.mjs');
  const governed = root['test:e2e'].match(/^node (\S+)$/)?.[1];
  assert.equal(SUITES.e2e.args[0], governed);
  assert.ok(!SUITES.e2e.args.some((a) => /@playwright\/test\/cli\.js/.test(a)), 'the live runner must not bypass scripts/e2e.mjs');
});

test('commits after a run that only touch conductor/ keep the result valid; any code change makes it STALE', async () => {
  const { onlyConductorDocs } = await import('../scripts/test-live-core.mjs');
  assert.equal(onlyConductorDocs(['conductor/tracks.md', 'conductor\\.view\\tasklist.html']), true);
  // unit tests READ conductor/**/plan.md, so a plan change is a change of what was tested
  assert.equal(onlyConductorDocs(['conductor/tracks.md', 'conductor/tracks/hardening-roadmap-v1/plan.md']), true);
  assert.equal(onlyConductorDocs(['conductor/tracks/content-quality/plan.md']), false);
  // server and e2e never read conductor/, so ANY conductor/ change keeps them valid — but a code change never does
  assert.equal(onlyConductorDocs(['conductor/tracks/hardening-roadmap-v1/plan.md'], 'server'), true);
  assert.equal(onlyConductorDocs(['conductor/tracks/hardening-roadmap-v1/plan.md'], 'e2e'), true);
  assert.equal(onlyConductorDocs(['conductor/tracks/hardening-roadmap-v1/plan.md', 'server/src/app.js'], 'server'), false);
  assert.equal(onlyConductorDocs(['conductor/tracks/hardening-roadmap-v1/plan.md'], 'unit'), true);
  assert.equal(onlyConductorDocs(['conductor/tracks/hardening-roadmap-v1/plan.md', 'scripts/context-check.mjs'], 'unit'), false);
  const srvArt = { suite: 'server', state: 'PASS', headTested: 'aaaaaaa1' };
  assert.equal(effectiveState(srvArt, { currentHead: 'bbbbbbb2', docsOnlySince: (_f, _t, suite) => onlyConductorDocs(['conductor/tracks/x/plan.md'], suite) }).state, 'PASS');
  assert.equal(effectiveState({ ...srvArt, suite: 'unit' }, { currentHead: 'bbbbbbb2', docsOnlySince: (_f, _t, suite) => onlyConductorDocs(['conductor/tracks/x/plan.md'], suite) }).state, 'STALE');
  assert.equal(onlyConductorDocs(['conductor/tracks.md']), true);
  assert.equal(onlyConductorDocs(['conductor/tracks.md', 'src/app.js']), false);
  assert.equal(onlyConductorDocs([]), false); // nothing changed => not "docs only" (heads differ for another reason)
  const art = { suite: 'unit', state: 'PASS', headTested: 'aaaaaaa1', runnerPid: 1, exitCode: 0, updatedAt: new Date().toISOString(), counts: { total: 1, done: 1, passed: 1, failed: 0, skipped: 0 } };
  const docs = effectiveState(art, { currentHead: 'bbbbbbb2', alive: () => false, docsOnlySince: () => true });
  assert.equal(docs.state, 'PASS');
  assert.equal(docs.docsOnly, true);
  assert.equal(effectiveState(art, { currentHead: 'bbbbbbb2', alive: () => false, docsOnlySince: () => false }).state, 'STALE');
  assert.equal(effectiveState(art, { currentHead: 'bbbbbbb2', alive: () => false }).state, 'STALE'); // no resolver => strict
  assert.match(renderTestsSection([{ ...art, cmd: 'x', log: 'l', startedAt: art.updatedAt, durationMs: 1000 }], { currentHead: 'bbbbbbb2', alive: () => false, docsOnlySince: () => true }), /só views geradas depois/);
});

test('VALIDAÇÃO DO HEAD ATUAL: an old PASS never reads as PASS of the current head; nothing recorded is not proven either', () => {
  const art = (suite, headTested, state = 'PASS') => ({ suite, headTested, state, exitCode: state === 'PASS' ? 0 : 1, updatedAt: new Date().toISOString(), counts: { done: 1, total: 1, passed: 1, failed: 0, skipped: 0 } });
  const dead = () => false;
  const none = headValidation([], { currentHead: 'bbbbbbb2' });
  assert.equal(none.proven, false);
  assert.match(none.line, /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA/);
  const old = headValidation([art('unit', 'aaaaaaa1'), art('server', 'aaaaaaa1')], { currentHead: 'bbbbbbb2', alive: dead });
  assert.equal(old.proven, false);
  assert.match(old.line, /^VALIDAÇÃO DO HEAD ATUAL: ⚠ NÃO PROVADA \/ DESATUALIZADA/);
  assert.match(old.line, /unit DESATUALIZADO \(testado aaaaaaa\)/);
  assert.doesNotMatch(old.line, /✓|PASS/);
  const same = headValidation([art('unit', 'bbbbbbb2'), art('server', 'bbbbbbb2')], { currentHead: 'bbbbbbb2', alive: dead });
  assert.equal(same.proven, true);
  assert.match(same.line, /^VALIDAÇÃO DO HEAD ATUAL: ✓ PASS \(unit, server\) no HEAD atual$/);
  // one suite at an old head, or failing, spoils the whole answer
  assert.equal(headValidation([art('unit', 'bbbbbbb2'), art('server', 'aaaaaaa1')], { currentHead: 'bbbbbbb2', alive: dead }).proven, false);
  assert.equal(headValidation([art('unit', 'bbbbbbb2', 'FAIL')], { currentHead: 'bbbbbbb2', alive: dead }).proven, false);
  // commits after the run that only touch conductor/ do not invalidate it; anything else does
  assert.equal(headValidation([art('unit', 'aaaaaaa1')], { currentHead: 'bbbbbbb2', alive: dead, docsOnlySince: () => true }).proven, true);
  assert.equal(headValidation([art('unit', 'aaaaaaa1')], { currentHead: 'bbbbbbb2', alive: dead, docsOnlySince: () => false }).proven, false);
});

test('no text printed to the board or the plan carries the current head sha (it would be stale at the next commit)', () => {
  const art = { suite: 'unit', headTested: 'aaaaaaa1', state: 'PASS', exitCode: 0, updatedAt: new Date().toISOString(), cmd: 'x', log: 'l', startedAt: new Date().toISOString(), durationMs: 1, counts: { done: 1, total: 1, passed: 1, failed: 0, skipped: 0 } };
  const html = renderTestsSection([art], { currentHead: 'ccccccc9', alive: () => false });
  assert.doesNotMatch(html, /ccccccc/);
  assert.doesNotMatch(headValidation([art], { currentHead: 'ccccccc9', alive: () => false }).line, /ccccccc/);
  assert.doesNotMatch(headValidation([{ ...art, headTested: 'ccccccc9' }], { currentHead: 'ccccccc9', alive: () => false }).line, /ccccccc/);
  assert.match(headValidation([art], { currentHead: 'ccccccc9', alive: () => false }).line, /HEAD atual ≠ HEAD testado/);
});
