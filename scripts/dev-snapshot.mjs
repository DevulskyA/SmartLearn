#!/usr/bin/env node
// Verified snapshot of the persistent DEV database, for the Desktop launcher and for the operator.
//   node scripts/dev-snapshot.mjs            today's snapshot (once per day), prints "Snapshot: <dir>" or "Snapshot: already taken today"
//   node scripts/dev-snapshot.mjs --list     lists snapshots with their validity
// Read-only on the live database; exit code 1 when a snapshot was needed and could not be verified.
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { devDbPaths } from '../server/src/dev-datastore.js';
import { dailySnapshotIfNeeded, isValidSnapshot } from '../server/src/dev-snapshot.js';

const { dbPath, snapshotsDir } = devDbPaths();
if (process.argv.includes('--list')) {
  const names = existsSync(snapshotsDir) ? readdirSync(snapshotsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const n of names) console.log(`${isValidSnapshot(join(snapshotsDir, n)) ? 'VALID  ' : 'INVALID'} ${n}`);
  if (names.length === 0) console.log('no snapshots');
} else {
  try {
    const snapshot = dailySnapshotIfNeeded(dbPath, snapshotsDir);
    console.log(snapshot ? `Snapshot: ${snapshot.dir} (v${snapshot.manifest.schemaVersion}, sha256 ${snapshot.manifest.sha256.slice(0, 12)}...)` : 'Snapshot: already taken today (or no data yet)');
  } catch (err) {
    console.error(`SNAPSHOT FAILED: ${err.message}`);
    process.exit(1);
  }
}
