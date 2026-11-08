import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

test('every dev entry point runs the identity guard (and no name-only guard is left)', () => {
  const root = JSON.parse(read('package.json')).scripts;
  for (const hook of ['predev', 'prebuild', 'prepreview']) assert.match(root[hook], /scripts\/work-target-guard\.mjs/, hook);
  assert.match(JSON.parse(read('server/package.json')).scripts.prestart, /work-target-guard\.mjs/);
  for (const file of ['scripts/dev-remote.mjs', 'scripts/dev-uat.mjs']) {
    const text = read(file);
    assert.match(text, /work-target-guard\.mjs/, file);
    assert.doesNotMatch(text, /claude\/smartlearn-v1-complete/, `${file} still hard-codes a branch name`);
  }
  assert.equal(existsSync(fileURLToPath(new URL('../scripts/require-work-branch.mjs', import.meta.url))), false, 'old name-only guard must be gone');
});
