import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-F6-05 (AC-07.4): lint must fail on a NEW warning, not only on errors. The warning budget is the corrected value, zero.
const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

test('npm run lint runs eslint over the whole repository and fails on any warning (--max-warnings 0)', () => {
  assert.match(pkg.scripts.lint, /^eslint \./, 'lint must cover the whole repository');
  assert.match(pkg.scripts.lint, /--max-warnings[ =]0(\s|$)/, 'the warning budget is 0: a new warning must fail the gate');
});

test('Rust: only the informational MSVC linker message is allowed; no blanket allow hides a real warning', () => {
  const cargo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'Cargo.toml'), 'utf8');
  const lints = cargo.split('[lints.rust]')[1]?.split(/\n\[/)[0] ?? '';
  assert.match(lints, /^linker_messages\s*=\s*"allow"/m, 'the cdylib link.exe info line is the one allowed message');
  const allowed = [...lints.matchAll(/^(\w+)\s*=\s*"allow"/gm)].map((m) => m[1]);
  assert.deepEqual(allowed, ['linker_messages'], 'nothing else may be silenced at the manifest level');
  assert.doesNotMatch(cargo, /\bwarnings\s*=\s*"allow"/);
});
