import { config } from './config.js';
import { openDb } from './db.js';
import { runMigrations } from './migrations.js';
import { buildApp } from './app.js';

const db = openDb(config.dbPath);
runMigrations(db);
const app = buildApp(db);

try {
  await app.listen({ host: config.host, port: config.port });
  console.log(`SmartLearn server listening on ${config.host}:${config.port}`);
} catch (err) {
  console.error('Server failed to start:', err);
  process.exit(1);
}
