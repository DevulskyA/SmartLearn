// T-F1-08: what a human copies into a bug report from Configurações > Sobre (DEV channel only): which schema, which database file
// and how many rows of the main tables. Counts only - never row content, so no personal data leaves the machine by accident.
import { resolve } from 'node:path';

const TABLES = ['subjects', 'learning_units', 'review_tasks', 'generated_drafts', 'sources', 'content_proposals', 'sessions'];

export function devDiagnostics(db, dbPath) {
  const counts = {};
  for (const t of TABLES) {
    try { counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { /* table absent in this schema */ }
  }
  let schemaVersion = null;
  try { schemaVersion = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v ?? null; } catch { /* no schema table */ }
  return { schemaVersion, dbPath: resolve(dbPath), counts };
}
