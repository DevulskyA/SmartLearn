import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CODEMAP.md is the agents' first stop, and a map rots silently. This sensor keeps it honest: every repository path it cites in
// backticks must exist, so a rename or delete names the stale line instead of sending an agent to a ghost file.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = readFileSync(join(root, 'CODEMAP.md'), 'utf8');

const PATH_PREFIXES = ['src/', 'server/', 'shared/', 'scripts/', 'test/', 'e2e/', '.specs/'];
const ROOT_FILES = /^(CLAUDE|AGENTS|CODEMAP|README)\.md$/;

/** Backticked tokens that look like repo paths. `a.js`, `b.js` lists and `x/*.js` globs are expanded to their directory or checked per file. */
function citedPaths(markdown) {
  const out = new Set();
  for (const [, token] of markdown.matchAll(/`([^`\n]+)`/g)) {
    if (/\s/.test(token) || token.includes('<') || token.includes('→')) continue;
    if (ROOT_FILES.test(token) || PATH_PREFIXES.some((p) => token.startsWith(p))) out.add(token.replace(/\/\*[\w.*]*$/, '/'));
  }
  return [...out];
}

test('CODEMAP.md cites paths, and every cited path exists', () => {
  const paths = citedPaths(map);
  assert.ok(paths.length >= 30, `the map should cite its modules (found ${paths.length})`);
  const missing = paths.filter((p) => !existsSync(join(root, p)));
  assert.deepEqual(missing, [], `CODEMAP.md cites paths that no longer exist: ${missing.join(', ')}`);
});

test('bare file names in the module tables resolve inside the folder their section names', () => {
  // Rows such as `draft-prompt.js` under the server "IA" area are written relative to a folder; check the ones that matter by section.
  const sections = [
    ['server/src/ai/', ['draft-prompt.js', 'draft-schema.js', 'draft-audit.js', 'risk-checks.js', 'claim-evidence.js']],
    ['server/src/domain/', ['learning-event.js', 'evidence-profile.js', 'priorities.js']],
    ['server/src/', ['main.js', 'app.js', 'http-contract.js', 'db.js', 'migrations.js']],
    ['server/src/corpus/', ['resolve-need.js']],
    ['server/src/services/', ['generated-drafts.js', 'accept-draft.js']],
    ['scripts/prompt-lab/', ['run-generation.mjs', 'coverage.mjs', 'metrics.mjs']],
  ];
  for (const [dir, files] of sections) {
    for (const f of files) {
      assert.ok(map.includes(f), `${f} should be named in CODEMAP.md`);
      assert.ok(existsSync(join(root, dir, f)), `${dir}${f} must exist`);
    }
  }
});

test('the commands the map tells agents to run exist in package.json', () => {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
  for (const name of ['test', 'test:e2e', 'test:inventory', 'lint', 'context:check', 'context:resume']) {
    assert.ok(scripts[name], `npm script ${name} must exist`);
    assert.ok(map.includes(name), `CODEMAP.md should mention ${name}`);
  }
});
