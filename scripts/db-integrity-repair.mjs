#!/usr/bin/env node
// Repair of the "lesson listed but its master summary is not there" inconsistency. DRY RUN by default: prints exactly which lessons and how
// many dependent rows would be removed, and changes nothing. `--apply` first writes a backup next to the file, then deletes in one
// transaction. Run it on a COPY, with no server using the file. Usage: node scripts/db-integrity-repair.mjs <db> [--apply]
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync } from 'node:fs';

const path = process.argv[2];
const apply = process.argv.includes('--apply');
if (!path || !existsSync(path)) { console.error('usage: node scripts/db-integrity-repair.mjs <db> [--apply]'); process.exit(2); }

const db = new DatabaseSync(path);
const rows = (sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r }));
const orphans = rows("select u.id, s.name as subject, u.title from learning_units u join subjects s on s.id = u.subject_id where trim(coalesce(u.summary_body, '')) = '' order by u.id");

// every table whose foreign key points at learning_units (all NO ACTION: children go first, in this order)
const children = rows("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
  .flatMap(({ name }) => rows(`pragma foreign_key_list("${name}")`).filter((f) => f.table === 'learning_units').map((f) => ({ table: name, column: f.from })))
  .filter((c) => c.column === 'unit_id');

const plan = orphans.map((unit) => ({ ...unit, dependents: Object.fromEntries(children.map((c) => [c.table, rows(`select count(*) n from "${c.table}" where "${c.column}" = ?`, unit.id)[0].n]).filter(([, n]) => n > 0)) }));
console.log(JSON.stringify({ db: path, mode: apply ? 'APPLY' : 'DRY-RUN', lessonsWithoutSummary: plan }, null, 2));

if (!apply || orphans.length === 0) { if (!apply) console.log('Nothing changed. Re-run with --apply to delete the lessons above (a backup is written first).'); process.exit(0); }

const backup = `${path}.before-repair-${new Date().toISOString().replace(/[:.]/g, '-')}`;
db.exec('pragma wal_checkpoint(TRUNCATE)');
copyFileSync(path, backup);
console.log('Backup:', backup);
db.exec('begin');
try {
  // rows that hang from the lesson's questions go before the questions themselves
  const grandchildren = rows("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
    .flatMap(({ name }) => rows(`pragma foreign_key_list("${name}")`).filter((f) => f.table === 'exercises').map((f) => ({ table: name, column: f.from })));
  for (const unit of orphans) {
    for (const g of grandchildren) db.prepare(`delete from "${g.table}" where "${g.column}" in (select id from exercises where unit_id = ?)`).run(unit.id);
    for (const c of children)db.prepare(`delete from "${c.table}" where "${c.column}" = ?`).run(unit.id);
    db.prepare('delete from learning_units where id = ?').run(unit.id);
  }
  const violations = rows('pragma foreign_key_check');
  if (violations.length) throw new Error(`foreign_key_check failed: ${JSON.stringify(violations.slice(0, 5))}`);
  db.exec('commit');
  console.log(`Removed ${orphans.length} lessons without summary and their dependent rows.`);
} catch (error) {
  db.exec('rollback');
  console.error('Rolled back:', error.message);
  process.exitCode = 1;
}
