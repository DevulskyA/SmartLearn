import test from 'node:test';
import assert from 'node:assert/strict';
import { missingTokens, tokensOf } from '../scripts/check-state-ids.mjs';

test('tokensOf picks upper-case identifiers with a separator and ignores plain words', () => {
  assert.deepEqual([...tokensOf('See ARCH-01, AI_PROVIDER_DECISION and PV1-01_STATUS; plain WORDS and Mixed_case stay out.')].sort(), ['AI_PROVIDER_DECISION', 'ARCH-01', 'PV1-01_STATUS']);
});

test('a decision token that leaves the live STATE and is not archived is reported', () => {
  assert.deepEqual(missingTokens('KEEP_ME and DROP_ME and ARCH-01', 'KEEP_ME', ['ARCH-01']), ['DROP_ME']);
});

test('a token found only in an archive counts as preserved', () => {
  assert.deepEqual(missingTokens('OLD_DECISION', 'nothing here', ['archived OLD_DECISION']), []);
});
