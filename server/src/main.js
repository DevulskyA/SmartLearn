import { config } from './config.js';
import { openDb } from './db.js';
import { runMigrations } from './migrations.js';
import { buildApp } from './app.js';

const db = openDb(config.dbPath);
runMigrations(db);
const app = await buildApp(db, undefined, {
  isProduction: config.isProduction,
  allowedOrigins: config.allowedOrigins,
  trustProxy: config.trustProxy,
  staticDir: config.staticDir,
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
