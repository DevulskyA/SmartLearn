import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// LOCAL-01B invariant: a fresh checkout must contain the four resource directories (tracked via .gitkeep) so tauri.conf.json's
// bundle.resources always resolves; the generated contents (package:standalone, ~200 MB) must stay ignored.
// Regression: ae81f67 swept the four .gitkeep files out of the index, so a fresh checkout lost the directories and the packaged
// output showed up as an untracked `src-tauri/resources/`.
const DIRS = ['dist-runtime', 'node-runtime', 'server-runtime', 'shared'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

test('the four resource placeholder files are tracked, and nothing else under src-tauri/resources is', () => {
  const tracked = git('ls-files', 'src-tauri/resources').split('\n').filter(Boolean).sort();
  assert.deepEqual(tracked, DIRS.map((d) => `src-tauri/resources/${d}/.gitkeep`));
});

test('generated package contents are ignored but the placeholders are not', () => {
  for (const d of DIRS) {
    assert.doesNotThrow(() => git('check-ignore', '-q', `src-tauri/resources/${d}/generated-file.bin`), `${d} contents must be ignored`);
    assert.throws(() => git('check-ignore', '-q', `src-tauri/resources/${d}/.gitkeep`), `${d}/.gitkeep must not be ignored`);
  }
});
