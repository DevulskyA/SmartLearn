#!/usr/bin/env node
// Operator CLI for backups. Requires shell access to the server (explicit
// operational authorization) — there is no HTTP endpoint for this, because a
// backup spans every user's rows including other tenants' data and credential
// hashes, which per-user session auth can never legitimately scope down to.
//
// T19  physical snapshot (database only):
//   node server/scripts/backup.mjs <destination.db> [--db path/to/source.db]
// T50  operational package (database + accepted source files + manifest/checksums):
//   node server/scripts/backup.mjs --package <new-directory> [--db <file>] [--sources <dir>] [--retain-days N]
//   node server/scripts/backup.mjs --verify <package-directory>      (non-destructive; exit 1 on any problem)
//   node server/scripts/backup.mjs --rehearse <package-directory>    (restore into a temp env, prove units/questions/citations resolve, remove the temp env)
// Nothing here ever deletes a backup; --retain-days is only recorded in the manifest.

import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { config } from '../src/config.js';
import { createPhysicalBackup, verifyPhysicalBackup } from '../src/backup.js';
import { createOperationalBackup, verifyOperationalBackup, rehearseRestore } from '../src/operational-backup.js';

const USAGE = [
  'Usage:',
  '  node server/scripts/backup.mjs <destination.db> [--db path/to/source.db]',
  '  node server/scripts/backup.mjs --package <new-directory> [--db <file>] [--sources <dir>] [--retain-days N]',
  '  node server/scripts/backup.mjs --verify <package-directory>',
  '  node server/scripts/backup.mjs --rehearse <package-directory>',
].join('\n');

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function physical(args) {
  const [destPath] = args;
  const sourcePath = flag(args, '--db') ?? config.dbPath;
  const db = openDb(sourcePath);
  runMigrations(db);
  const { path, tables } = await createPhysicalBackup(db, destPath);
  const { integrityCheck, tableCounts } = verifyPhysicalBackup(db, path);
  db.close();
  console.log(`Physical backup written to ${path}`);
  console.log(`integrity_check: ${integrityCheck}`);
  for (const table of tables) console.log(`  ${table}: ${tableCounts[table].sourceCount} rows (matches source)`);
}

async function pack(args) {
  const destDir = args[1];
  if (!destDir) throw new Error(USAGE);
  const retainRaw = flag(args, '--retain-days');
  const db = openDb(flag(args, '--db') ?? config.dbPath);
  runMigrations(db);
  try {
    const manifest = await createOperationalBackup(db, {
      sourcesDir: flag(args, '--sources') ?? config.sourcesDir,
      destDir,
      retainDays: retainRaw === undefined ? null : Number(retainRaw),
    });
    console.log(`Operational backup written to ${destDir}`);
    console.log(`  schema version: ${manifest.schemaVersion}, database sha256: ${manifest.database.sha256}`);
    console.log(`  sources: ${manifest.sources.length} file(s) verified against their checksums`);
    console.log('  sessions: NOT included; password hashes: included -> treat this directory as a secret');
    console.log(`  retention: ${manifest.retention.retainDays ?? 'not set'} day(s), recorded only — nothing is ever deleted automatically`);
    if (manifest.orphanSourceFiles.length > 0) console.log(`  note: ${manifest.orphanSourceFiles.length} file(s) in the sources directory are not referenced by the database and were NOT copied`);
  } finally {
    db.close();
  }
}

function verify(args) {
  const dir = args[1];
  if (!dir) throw new Error(USAGE);
  const problems = verifyOperationalBackup(dir);
  if (problems.length === 0) {
    console.log(`OK: ${dir} is intact (manifest, database, sources)`);
    return;
  }
  for (const p of problems) console.error(`${p.code}: ${p.detail}`);
  process.exit(1);
}

async function rehearse(args) {
  const dir = args[1];
  if (!dir) throw new Error(USAGE);
  const report = await rehearseRestore(dir);
  console.log(`Rehearsal environment: ${report.tempDir} (${report.tempEnvironmentRemoved ? 'removed afterwards' : 'kept'})`);
  console.log(`  units: ${report.counts.learning_units ?? '?'}, exercises: ${report.counts.exercises ?? '?'}, sources checked: ${report.sourcesChecked}, citations checked: ${report.citationsChecked}`);
  if (report.ok) {
    console.log('OK: the backup restores and resolves its units, questions, sources and citations');
    return;
  }
  for (const p of report.problems) console.error(`${p.code}: ${p.detail}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) throw new Error(USAGE);
  if (args[0] === '--package') return pack(args);
  if (args[0] === '--verify') return verify(args);
  if (args[0] === '--rehearse') return rehearse(args);
  return physical(args);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
