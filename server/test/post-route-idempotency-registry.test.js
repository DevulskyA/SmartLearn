// Guard for the E-021 class ("a creating POST made twice creates twice"). Every POST route in server/src/routes must be
// classified here. A new POST route fails this test until someone decides how a repeat of it behaves, which is the point:
// the decision can no longer be forgotten.
//
//   KEY       accepts an optional operationKey; same key + same payload returns the first result (asserted by its own test).
//   STATE     naturally idempotent by state or uniqueness (asserted in creator-routes-concurrency.test.js or a unique index).
//   ACTION    acts on an existing record or session and a repeat is harmless. A review judgement, NOT individually probed.
//   UNPROBED  creates or changes records and has NOT been probed for a duplicate yet. This is the open debt, listed on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = fileURLToPath(new URL('../src/routes', import.meta.url));

const REGISTRY = {
  'attempts.js POST /exercises/:exerciseId/attempts': 'KEY',
  'attempts.js POST /attempts/:id/submit': 'KEY',
  'attempts.js POST /attempts/:id/hint': 'UNPROBED',
  'attempts.js POST /attempts/:id/reveal-solution': 'UNPROBED',
  'auth.js POST /auth/register': 'STATE',
  'auth.js POST /auth/login': 'ACTION',
  'auth.js POST /auth/logout': 'ACTION',
  'auth.js POST /auth/password': 'ACTION',
  'auth.js POST /auth/reset-password': 'ACTION',
  'content-proposals.js POST /sources/:id/proposals': 'UNPROBED',
  'content-proposals.js POST /sources/:id/scopes': 'UNPROBED',
  'evidence.js POST /learning-evidence': 'KEY',
  'exams.js POST /exams': 'STATE',
  'exams.js POST /exams/:id/finalize': 'ACTION',
  'exams.js POST /exams/:id/submit': 'UNPROBED',
  'exercises.js POST /learning-units/:unitId/exercises': 'KEY',
  'exercises.js POST /learning-units/:unitId/exercises/reorder': 'ACTION',
  'generated-drafts.js POST /proposals/:id/drafts': 'UNPROBED',
  'generated-drafts.js POST /drafts/:id/questions': 'UNPROBED',
  'generated-drafts.js POST /drafts/:id/reaudit': 'ACTION',
  'generated-drafts.js POST /drafts/:id/accept': 'UNPROBED',
  'generation-jobs.js POST /generation-jobs': 'UNPROBED',
  'generation-jobs.js POST /generation-jobs/:id/cancel': 'ACTION',
  'imports.js POST /imports/preview': 'UNPROBED',
  'imports.js POST /imports/:id/commit': 'UNPROBED',
  'learning-units.js POST /learning-units': 'KEY',
  'question-flags.js POST /attempts/:id/flag': 'ACTION',
  'question-flags.js POST /exercises/:exerciseId/unflag': 'ACTION',
  'reviews.js POST /review-obligations/:unitId/complete': 'KEY',
  'reviews.js POST /review-obligations/:unitId/${action}': 'ACTION',
  'reviews.js POST /review-tasks/:id/complete': 'KEY',
  'reviews.js POST /review-tasks/:id/reopen': 'ACTION',
  'reviews.js POST /review-tasks/postpone-overdue': 'ACTION',
  'sources.js POST /source-openings': 'KEY',
  'sources.js POST /sources': 'UNPROBED',
  'sources.js POST /sources/:id/extract': 'ACTION',
  'subjects.js POST /subjects': 'STATE',
  'subjects.js POST /subjects/reorder': 'ACTION',
  'visual-assets.js POST /visual-assets': 'KEY',
};

const CATEGORIES = new Set(['KEY', 'STATE', 'ACTION', 'UNPROBED']);

function declaredPostRoutes() {
  const found = [];
  for (const file of readdirSync(ROUTES_DIR).filter((name) => name.endsWith('.js')).sort()) {
    const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
    for (const match of source.matchAll(/app\.post\(\s*([`'"])([^`'"]+)\1/g)) found.push({ file, path: match[2] });
  }
  return found;
}

test('every POST route is classified for repeat behaviour, and the registry has no stale entry', () => {
  const declared = declaredPostRoutes().map(({ file, path }) => `${file} POST ${path}`);
  assert.ok(declared.length > 30, 'the route scan found the routes');
  const unclassified = declared.filter((route) => !(route in REGISTRY));
  const stale = Object.keys(REGISTRY).filter((route) => !declared.includes(route));
  assert.deepEqual(unclassified, [], 'new POST routes must be added to REGISTRY with a category (see the header)');
  assert.deepEqual(stale, [], 'REGISTRY entries whose route no longer exists must be removed');
  for (const [route, category] of Object.entries(REGISTRY)) assert.ok(CATEGORIES.has(category), `${route}: unknown category ${category}`);
});

test('every route classified KEY really accepts operationKey in its file', () => {
  for (const [route, category] of Object.entries(REGISTRY)) {
    if (category !== 'KEY') continue;
    const file = route.split(' ')[0];
    const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
    assert.match(source, /operationKey/, `${route} is classified KEY but ${file} never mentions operationKey`);
  }
});
