#!/usr/bin/env node
// T19: operator CLI for a consistent whole-database physical backup.
// Requires shell access to the server (explicit operational authorization)
// — there is no HTTP endpoint for this, because a physical backup spans
// every user's rows including other tenants' data and credential hashes,
// which per-user session auth can never legitimately scope down to.
//
// Usage: node server/scripts/backup.mjs <destination.db> [--db path/to/source.db]

import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { config } from '../src/config.js';
import { createPhysicalBackup, verifyPhysicalBackup } from '../src/backup.js';

async function main() {
  const [, , destPath, ...rest] = process.argv;
  if (!destPath) {
    console.error('Usage: node server/scripts/backup.mjs <destination.db> [--db path/to/source.db]');
    process.exit(1);
  }
  const dbPathFlagIndex = rest.indexOf('--db');
  const sourcePath = dbPathFlagIndex >= 0 ? rest[dbPathFlagIndex + 1] : config.dbPath;

  const db = openDb(sourcePath);
  runMigrations(db);

  const { path, tables } = await createPhysicalBackup(db, destPath);
  const { integrityCheck, tableCounts } = verifyPhysicalBackup(db, path);
  db.close();

  console.log(`Physical backup written to ${path}`);
  console.log(`integrity_check: ${integrityCheck}`);
  for (const table of tables) {
    console.log(`  ${table}: ${tableCounts[table].sourceCount} rows (matches source)`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
