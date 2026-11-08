import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readServedIdentity, verifyServedIdentity } from '../scripts/desktop-identity.mjs';

// Lote 2026-11-08, item 4. The Desktop exe serves the frontend that sits BESIDE it (<exe dir>/dist-runtime), a copy made when the exe was built.
// scripts/launch-desktop-dev.ps1 compares the SOURCE identity (inputsHash) with src-tauri/resources/dist-runtime, which is only the staging area:
// with -NoBuild, or after a failed rebuild, the staging is current while the exe still serves an older copy, and the check passes. On this machine
// src-tauri/target/release (the "SmartLearn Oficial" shortcut) holds 19c3c98f... while the sources and the staging are b23dbf19.... These tests pin
// the check on what the exe really serves.

const HASH_NEW = 'b'.repeat(64);
const HASH_OLD = 'a'.repeat(64);

function fakeExe(buildInfo, { raw } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-served-'));
  mkdirSync(join(dir, 'dist-runtime'));
  if (raw !== undefined) writeFileSync(join(dir, 'dist-runtime', 'build-info.json'), raw);
  else if (buildInfo) writeFileSync(join(dir, 'dist-runtime', 'build-info.json'), JSON.stringify(buildInfo));
  return { exe: join(dir, 'smartlearn.exe'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('an exe whose served frontend has the expected content is accepted, and the answer names what it serves', () => {
  const { exe, cleanup } = fakeExe({ id: 'abc1234+local', commit: 'abc1234', channel: 'DEV', inputsHash: HASH_NEW });
  try {
    const result = verifyServedIdentity({ exe, expected: HASH_NEW });
    assert.equal(result.ok, true);
    assert.equal(result.served.inputsHash, HASH_NEW);
    assert.equal(result.served.id, 'abc1234+local');
  } finally { cleanup(); }
});

test('an exe that serves OLDER content is refused with both identities and the exe in the message (the stale release case)', () => {
  const { exe, cleanup } = fakeExe({ id: '6cbedac+local', commit: '6cbedac', channel: 'DEV', inputsHash: HASH_OLD });
  try {
    const result = verifyServedIdentity({ exe, expected: HASH_NEW });
    assert.equal(result.ok, false);
    assert.match(result.reason, /serves/i);
    assert.ok(result.reason.includes(HASH_OLD.slice(0, 12)), 'names the served content');
    assert.ok(result.reason.includes(HASH_NEW.slice(0, 12)), 'names the expected content');
    assert.ok(result.reason.includes('6cbedac'), 'names the commit the served frontend was built at');
  } finally { cleanup(); }
});

test('fail closed: no build-info, unreadable JSON, a missing inputsHash or a missing folder are all refusals, never a pass', () => {
  for (const [label, make] of [
    ['no build-info.json', () => fakeExe(null)],
    ['not JSON', () => fakeExe(null, { raw: '{ not json' })],
    ['no inputsHash', () => fakeExe({ id: 'x', commit: 'x' })],
    ['empty inputsHash', () => fakeExe({ id: 'x', inputsHash: '' })],
  ]) {
    const { exe, cleanup } = make();
    try {
      const result = verifyServedIdentity({ exe, expected: HASH_NEW });
      assert.equal(result.ok, false, label);
      assert.ok(result.reason.length > 10, label);
    } finally { cleanup(); }
  }
  assert.equal(verifyServedIdentity({ exe: join(tmpdir(), 'sl-no-such-dir-xyz', 'smartlearn.exe'), expected: HASH_NEW }).ok, false, 'missing folder');
  const { exe, cleanup } = fakeExe({ inputsHash: HASH_NEW });
  try {
    assert.equal(verifyServedIdentity({ exe, expected: '' }).ok, false, 'no expected identity is not a match');
    assert.equal(verifyServedIdentity({ exe, expected: undefined }).ok, false);
  } finally { cleanup(); }
});

test('readServedIdentity reads <exe dir>/dist-runtime/build-info.json and nothing else', () => {
  const { exe, cleanup } = fakeExe({ inputsHash: HASH_NEW, channel: 'RELEASE' });
  try {
    const read = readServedIdentity(exe);
    assert.equal(read.info.inputsHash, HASH_NEW);
    assert.match(read.path.replaceAll('\\', '/'), /dist-runtime\/build-info\.json$/);
  } finally { cleanup(); }
});
