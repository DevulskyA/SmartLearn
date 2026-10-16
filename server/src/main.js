import { config } from './config.js';
import { openDb } from './db.js';
import { runMigrations } from './migrations.js';
import { buildApp } from './app.js';
import { purgeStaleSessions } from './repositories/sessions.js';
import { reconcileOrphans } from './services/generation-budget.js';
import { recoverOrphanJobs } from './services/generation-jobs.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { acquireDevLock, devDbPaths, isDevDatastoreDb } from './dev-datastore.js';
import { dailySnapshotIfNeeded, snapshotBeforeMigration } from './dev-snapshot.js';
import { assertTestDbIsDisposable } from './db-safety.js';
import { validateProductionConfig } from './production-config.js';

// T51: a production launch must have made every deployment decision explicitly
// (absolute data paths, HTTPS origins, proxy trust, ...) — fail closed, before
// any database is opened or created.
if (config.isProduction) {
  const problems = validateProductionConfig(process.env);
  if (problems.length > 0) {
    console.error('SmartLearn refuses to start: invalid production configuration.');
    for (const p of problems) console.error(`  ${p.code}: ${p.detail}`);
    process.exit(1);
  }
}

try {
  assertTestDbIsDisposable(process.env.NODE_ENV, config.dbPath);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
// A relative default silently creates an EMPTY database per working directory
// (per git worktree, in dev): always say which file this process is using.
// T-F1-01: the process that really writes the persistent DEV database holds its single-writer lock for exactly as long as it
// lives (the Desktop's backend child included), so a second writer (dev:remote, another Desktop) is refused naming the holder,
// even when the Desktop is force-closed. Any other database (every test and e2e database) takes no lock.
if (isDevDatastoreDb(config.dbPath)) {
  try {
    const releaseDevLock = acquireDevLock(dirname(resolve(config.dbPath)), { root: process.cwd() });
    process.on('exit', releaseDevLock);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
const dbExisted = existsSync(config.dbPath);
console.log(`SmartLearn database: ${resolve(config.dbPath)} (${dbExisted ? 'existing' : 'NEW, empty'})`);

const db = openDb(config.dbPath);
// T-F1-02: the human's data is never migrated without a verified backup taken first, and gets one verified snapshot per day.
if (isDevDatastoreDb(config.dbPath)) {
  const { snapshotsDir } = devDbPaths();
  try {
    const daily = dailySnapshotIfNeeded(config.dbPath, snapshotsDir);
    if (daily) console.log(`SmartLearn daily snapshot: ${daily.dir}`);
  } catch (err) {
    console.error(`WARNING: daily snapshot failed (continuing): ${err.message}`);
  }
  try {
    const pre = snapshotBeforeMigration(db, config.dbPath, snapshotsDir);
    if (pre) console.log(`SmartLearn pre-migration snapshot: ${pre.dir}`);
  } catch (err) {
    console.error(`REFUSING to migrate: the pre-migration snapshot failed (${err.message}). Nothing was changed.`);
    db.close();
    process.exit(1);
  }
}
runMigrations(db);
// T-F1-06: rows that can never authenticate again (revoked or expired > 30 days ago) are housekeeping, active sessions are untouched.
const purgedSessions = purgeStaleSessions(db);
if (purgedSessions > 0) console.log(`SmartLearn purged ${purgedSessions} stale session row(s)`);
// R-12: a generation reservation left open by a crash may already have reached the model, so it is charged at its estimate (never refunded).
const orphanReservations = reconcileOrphans(db, { maxAgeMs: 30 * 60 * 1000 });
if (orphanReservations > 0) console.log(`SmartLearn settled ${orphanReservations} orphaned generation reservation(s) at their estimate`);
// R-04: no provider call of a previous process survives a restart, so a job left calling the provider can never finish: it is marked failed, never left "generating" forever.
const orphanJobs = recoverOrphanJobs(db);
if (orphanJobs > 0) console.log(`SmartLearn recovered ${orphanJobs} orphaned generation job(s) as FAILED(SERVER_RESTARTED)`);
const app = await buildApp(db, undefined, {
  isProduction: config.isProduction,
  allowedOrigins: config.allowedOrigins,
  trustProxy: config.trustProxy,
  devPersistentSession: process.env.SMARTLEARN_DEV_PERSISTENT_SESSION === 'true',
  staticDir: config.staticDir,
  sources: { sourcesDir: config.sourcesDir, maxBytes: config.sourceMaxBytes, quotaBytes: config.sourceQuotaBytes },
});

try {
  await app.listen({ host: config.host, port: config.port });
  console.log(`SmartLearn server listening on ${config.host}:${config.port}`);
  // R-04: a job that was only QUEUED when the previous process ended never reached a provider; resume it so it cannot block its proposal.
  const resumedJobs = app.generationJobs.resumeQueued();
  if (resumedJobs > 0) console.log(`SmartLearn resumed ${resumedJobs} queued generation job(s)`);
} catch (err) {
  console.error('Server failed to start:', err);
  db.close();
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  try {
    await app.close();
    db.close();
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
