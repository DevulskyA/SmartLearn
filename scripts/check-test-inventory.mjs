#!/usr/bin/env node
// T05: deterministic test-discovery check. Fails if any *.test.js file in the
// repo (excluding node_modules, historical evidence/, and dist output) is not
// covered by one of the three known discovery roots: root `npm test`
// (test/*.test.js), `npm --prefix server test` (server/test/*.test.js), or
// Playwright (e2e/*.spec.js). This makes "no silent exclusion" (AC-02/AC-27)
// an executable check instead of a one-time manual audit.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.claude', 'evidence',
  '.specs', // documentation, not executable test code
]);

const KNOWN_ROOTS = [
  { label: 'root unit (npm test)', dir: 'test', ext: '.test.js' },
  { label: 'server unit (npm --prefix server test)', dir: join('server', 'test'), ext: '.test.js' },
  { label: 'E2E (npm run test:e2e)', dir: 'e2e', ext: '.spec.js' },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js'))) {
      out.push(full);
    }
  }
  return out;
}

const allTestFiles = walk(ROOT);

const covered = new Set();
for (const root of KNOWN_ROOTS) {
  const rootDir = join(ROOT, root.dir);
  try {
    if (statSync(rootDir).isDirectory()) {
      for (const f of walk(rootDir)) covered.add(f);
    }
  } catch {
    // root dir doesn't exist yet — fine, just nothing to cover from it
  }
}

const orphans = allTestFiles.filter(f => !covered.has(f));

if (orphans.length > 0) {
  console.error('TEST_INVENTORY_CHECK: FAIL — test files found outside known discovery roots:');
  for (const o of orphans) console.error('  - ' + relative(ROOT, o).split(sep).join('/'));
  console.error('\nKnown roots: ' + KNOWN_ROOTS.map(r => r.dir).join(', '));
  process.exit(1);
}

console.log(`TEST_INVENTORY_CHECK: PASS — ${allTestFiles.length} test files, all covered by known discovery roots.`);
for (const root of KNOWN_ROOTS) {
  const count = allTestFiles.filter(f => f.startsWith(join(ROOT, root.dir) + sep)).length;
  console.log(`  ${root.label}: ${count} files`);
}
