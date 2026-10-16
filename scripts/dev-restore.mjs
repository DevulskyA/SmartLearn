#!/usr/bin/env node
// Restore drill: restore a snapshot into a NEW directory and verify it opens with its history intact.
//   node scripts/dev-restore.mjs --snapshot <snapshot dir> --dest <empty dir outside the live datastore>
// It never writes to the live datastore and never replaces the canonical database (that is a separate, confirmed operation).
import { restoreDrill } from '../server/src/dev-restore.js';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const snapshot = arg('snapshot');
const dest = arg('dest');
if (!snapshot || !dest) { console.error('usage: node scripts/dev-restore.mjs --snapshot <dir> --dest <empty dir>'); process.exit(2); }
try {
  const report = restoreDrill(snapshot, dest);
  for (const c of report.checks) console.log(`${c.status}  ${c.name}  (${c.detail})`);
  console.log(report.ok ? `RESTORE DRILL: PASS (restored to ${report.restoredDb})` : 'RESTORE DRILL: FAIL');
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  console.error(String(err.message || err));
  process.exit(2);
}
