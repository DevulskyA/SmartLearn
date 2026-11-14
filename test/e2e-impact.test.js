import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSpecs, gitChangedPaths, playwrightArgsFor, identifiersOf, CORE_SPECS } from '../scripts/e2e-impact.mjs';
import { guardGlobalRun, compactSummary } from '../scripts/e2e-global.mjs';
import { headValidation, suitesAffectedBy, unaffectedBy } from '../scripts/test-live-core.mjs';

// `--changed` used Playwright's --only-changed (spec FILES that changed). It must select by IMPACT: what a changed product path exercises.
const SPECS = {
  smoke: 'goto("/")', auth: 'sign in', 'first-run': 'welcome',
  'lesson-editor': 'page.locator("#lesson-editor-panel")', 'summary-wysiwyg': 'page.locator("#summary-canvas")', 'materials-library': 'upload',
  'shared-content': 'reuse consent and migration 046', stats: 'estatisticas',
};
const MODULES = {
  'src/lesson-editor-ui.js': '<div id="lesson-editor-panel">',
  'src/summary-render.js': 'export function render() {}',
  'src/summary-visual-editor.js': "import { render } from './summary-render.js'; el.id=\"summary-canvas\"",
};
const pick = (changed) => selectSpecs({ changed, specs: SPECS, modules: MODULES });

test('a localized change selects only the specs that exercise it', () => {
  const s = pick(['src/lesson-editor-ui.js']);
  assert.deepEqual(s.specs, ['lesson-editor']);
  assert.equal(s.escalate, false);
});

test('a change to a shared helper reaches the screens that import it (importer ids)', () => {
  assert.deepEqual(pick(['src/summary-render.js']).specs, ['summary-wysiwyg']);
});

test('a high-risk migration gets the CORE regression plus the specs that name it', () => {
  const s = pick(['server/migrations/046-shared-reuse.sql']);
  for (const core of CORE_SPECS) if (core in SPECS) assert.ok(s.specs.includes(core), `CORE spec ${core}`);
  assert.ok(s.specs.includes('shared-content'));
  assert.ok(!s.specs.includes('stats'), 'unrelated specs stay out');
});

test('documentation, specs folders, unit tests and tooling never trigger an E2E', () => {
  const s = pick(['README.md', '.specs/STATE.md', 'conductor/tracks.md', 'CLAUDE.md', 'test/x.test.js', 'server/test/y.test.js', 'scripts/tasklist.mjs']);
  assert.equal(s.none, true);
  assert.deepEqual(s.specs, []);
});

test('an unknown product path falls back to CORE, never to nothing; build configuration escalates', () => {
  const unknown = pick(['src/zzzzzzzz.js']);
  assert.ok(unknown.specs.includes('smoke') && unknown.none === false);
  const cfg = pick(['package.json']);
  assert.equal(cfg.escalate, true);
  assert.ok(cfg.specs.includes('smoke'));
});

test('a changed spec selects itself; the runner itself selects smoke', () => {
  assert.deepEqual(pick(['e2e/stats.spec.js']).specs, ['stats']);
  assert.deepEqual(pick(['scripts/e2e.mjs']).specs, ['smoke']);
});

test('playwright arguments are spec paths; identifiers come from ids and testids', () => {
  assert.deepEqual(playwrightArgsFor({ specs: ['auth', 'smoke'] }), ['e2e/auth.spec.js', 'e2e/smoke.spec.js']);
  assert.deepEqual([...identifiersOf('<a id="alpha-panel" data-testid="beta-button">x</a> getElementById("gamma-field")')].sort(), ['alpha-panel', 'beta-button', 'gamma-field']);
});

test('gitChangedPaths merges the diff against the base with untracked files, once each', () => {
  const calls = [];
  const run = (_cmd, args) => { calls.push(args[0]); return args[0] === 'diff' ? 'a.js\nb.js\n' : 'b.js\nc.js\n'; };
  assert.deepEqual(gitChangedPaths('.', 'HEAD~1', run), ['a.js', 'b.js', 'c.js']);
  assert.deepEqual(calls, ['diff', 'ls-files']);
});

test('one global run per snapshot: finished or running for the same SHA is refused, another SHA or --force is allowed', () => {
  const sha = 'a'.repeat(40);
  const art = (state, headTested = sha) => ({ state, headTested, runnerPid: 123 });
  assert.equal(guardGlobalRun({ artifact: art('PASS'), sha }).ok, false);
  assert.equal(guardGlobalRun({ artifact: art('FAIL'), sha }).ok, false);
  assert.equal(guardGlobalRun({ artifact: art('RUNNING'), sha, isAlive: () => true }).ok, false);
  assert.equal(guardGlobalRun({ artifact: art('RUNNING'), sha, isAlive: () => false }).ok, true, 'a dead runner left no result');
  assert.equal(guardGlobalRun({ artifact: art('PASS', 'b'.repeat(40)), sha }).ok, true);
  assert.equal(guardGlobalRun({ artifact: art('PASS'), sha, force: true }).ok, true);
  assert.equal(guardGlobalRun({ artifact: null, sha }).ok, true);
});

test('the compact summary carries state, SHA, counts, duration, failures and the evidence path, nothing else', () => {
  const text = compactSummary({ artifact: { state: 'FAIL', counts: { passed: 5, failed: 1, skipped: 0, total: 6 }, durationMs: 90000 }, sha: 'c'.repeat(40), evidenceDir: 'X/ev', failures: ['✘ 3 a.spec.js › boom'] });
  assert.match(text, /GLOBAL E2E FAIL \| SHA cccccccccccc \| 5 passed, 1 failed, 0 skipped of 6 \| 90 s/);
  assert.match(text, /FAIL ✘ 3 a\.spec\.js › boom/);
  assert.match(text, /evidence: X\/ev/);
});

test('freshness: a server test file only stales the server suite; a suite never executed is NOT EXECUTED, not silence', () => {
  assert.deepEqual(suitesAffectedBy('server/test/x.test.js'), ['server']);
  assert.deepEqual(suitesAffectedBy('server/src/a.js').sort(), ['e2e', 'server', 'unit']);
  assert.equal(unaffectedBy(['server/test/x.test.js'], 'e2e'), true);
  const art = (suite) => ({ suite, state: 'PASS', headTested: 'h1', runnerPid: 1 });
  const partial = headValidation([art('unit'), art('server')], { currentHead: 'h1', alive: () => false, required: ['unit', 'server', 'e2e'] });
  assert.equal(partial.proven, false);
  assert.equal(partial.partial, true);
  assert.match(partial.line, /PARCIAL.*NÃO EXECUTADO: e2e/);
  assert.equal(headValidation([art('unit'), art('server')], { currentHead: 'h1', alive: () => false }).proven, true, 'without a required list the old behavior holds');
});
