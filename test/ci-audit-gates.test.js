import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// T-F8-05 (final engineering audit P2-3): the dependency audit gates of the CI must exist and must be able to FAIL the build.
// This pins the gates only; what the audits currently find is recorded in the task's evidence, not here (it changes with the
// advisory database, not with our code). `cargo audit` is deliberately NOT a gate (it is not a native cargo subcommand and needs
// its own install in CI) -- an existing, recorded decision (FIX_PLAN.md P2-3), not an oversight.

const ci = readFileSync(fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const steps = ci.split(/\n(?=      - name: )/).slice(1);
const stepRunning = (command) => steps.find((s) => new RegExp(`\\n\\s+run: ${command}\\s*(\\n|$)`).test(s));

test('CI audits the root production dependencies and every server dependency', () => {
  const root = stepRunning('npm audit --omit=dev');
  assert.ok(root, 'a step runs `npm audit --omit=dev`');
  assert.doesNotMatch(root, /working-directory/, 'the root audit runs at the repository root');
  const server = stepRunning('npm audit');
  assert.ok(server, 'a step runs `npm audit`');
  assert.match(server, /working-directory: server/, 'the plain audit runs in server/');
});

test('the audit gates are blocking: no continue-on-error, no `|| true`, no `exit 0` swallowing the result', () => {
  const audits = steps.filter((s) => /run: npm audit/.test(s));
  assert.equal(audits.length, 2);
  for (const step of audits) {
    assert.doesNotMatch(step, /continue-on-error/i);
    assert.doesNotMatch(step, /\|\|\s*(true|:|exit 0)/);
    assert.doesNotMatch(step, /if:\s*always\(\)|if:\s*false/i);
  }
});

test('the audits run on the locked dependency tree (after `npm ci`), before the tests they protect', () => {
  const index = (needle) => ci.indexOf(needle);
  assert.ok(index('run: npm ci') >= 0 && index('run: npm ci') < index('run: npm audit --omit=dev'));
  assert.ok(index('run: npm audit --omit=dev') < index('run: npm test'));
});
