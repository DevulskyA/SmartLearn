import { config } from './config.js';
import { openDb } from './db.js';
import { runMigrations } from './migrations.js';
import { buildApp } from './app.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { acquireDevLock, isDevDatastoreDb } from './dev-datastore.js';
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
runMigrations(db);
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
