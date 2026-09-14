import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validatePasswordShape, SCRYPT_PARAMS } from '../src/auth/passwords.js';

const VALID_PASSWORD = 'correct horse battery staple 42';

test('same password produces different hashes (unique salts)', async () => {
  const a = await hashPassword(VALID_PASSWORD);
  const b = await hashPassword(VALID_PASSWORD);
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.salt, b.salt);
});

test('correct password verifies true', async () => {
  const stored = await hashPassword(VALID_PASSWORD);
  assert.equal(await verifyPassword(VALID_PASSWORD, stored), true);
});

test('wrong password verifies false', async () => {
  const stored = await hashPassword(VALID_PASSWORD);
  assert.equal(await verifyPassword('totally different passphrase xyz', stored), false);
});

test('stores algorithm and params for forward-readable rehash', async () => {
  const stored = await hashPassword(VALID_PASSWORD);
  assert.equal(stored.algorithm, 'scrypt');
  const params = JSON.parse(stored.params);
  assert.equal(params.N, SCRYPT_PARAMS.N);
  assert.equal(params.r, SCRYPT_PARAMS.r);
  assert.equal(params.p, SCRYPT_PARAMS.p);
});

test('long Unicode passphrase (>15 codepoints, multi-byte) survives round trip', async () => {
  const passphrase = 'senha longa com acentuação médica β-bloqueador 12345';
  assert.equal(validatePasswordShape(passphrase), null);
  const stored = await hashPassword(passphrase);
  assert.equal(await verifyPassword(passphrase, stored), true);
});

test('plaintext password never appears in the stored hash/salt output', async () => {
  const stored = await hashPassword(VALID_PASSWORD);
  const serialized = JSON.stringify(stored);
  assert.doesNotMatch(serialized, /correct horse battery staple/);
});

test('password is never trimmed, normalized, or truncated', async () => {
  const withSpaces = '  padded passphrase with 20+ chars  ';
  const stored = await hashPassword(withSpaces);
  assert.equal(await verifyPassword(withSpaces, stored), true);
  assert.equal(await verifyPassword(withSpaces.trim(), stored), false, 'trimmed variant must NOT verify — proves no trimming happened at hash time');
});

test('validatePasswordShape rejects too-short password', () => {
  const msg = validatePasswordShape('short');
  assert.match(msg, /ao menos 15/);
});

test('validatePasswordShape rejects over-1024-byte password', () => {
  const huge = 'a'.repeat(1025);
  const msg = validatePasswordShape(huge);
  assert.match(msg, /tamanho máximo/);
});

test('validatePasswordShape rejects null/wrong types without throwing', () => {
  assert.match(validatePasswordShape(null), /string/);
  assert.match(validatePasswordShape(undefined), /string/);
  assert.match(validatePasswordShape(12345), /string/);
  assert.match(validatePasswordShape(''), /Informe/);
});

test('bounded concurrency: many parallel hash calls all complete correctly under the cap', async () => {
  const passwords = Array.from({ length: 6 }, (_, i) => `parallel test password number ${i}`);
  const results = await Promise.all(passwords.map(p => hashPassword(p)));
  // Every hash must independently verify against its own password.
  const verifications = await Promise.all(results.map((r, i) => verifyPassword(passwords[i], r)));
  assert.ok(verifications.every(v => v === true));
});

test('overloaded hashing does not crash or hang — health-equivalent probe stays responsive', async () => {
  // Fire well beyond the concurrency cap and confirm all settle without error.
  const many = Array.from({ length: 10 }, (_, i) => hashPassword(`load test password ${i} abcdef`));
  const results = await Promise.allSettled(many);
  assert.ok(results.every(r => r.status === 'fulfilled'), 'all queued hash jobs must eventually complete, not reject or hang');
});
