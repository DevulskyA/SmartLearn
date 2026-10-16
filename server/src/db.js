import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(dbPath) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  // T08 / design.md §2: strengthened from NORMAL to FULL now that this
  // database holds authoritative user identity data. A planned durability
  // upgrade for the new scope, not a correction of the PR-1 foundation's
  // earlier NORMAL choice (which had no user data yet).
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  return db;
}
