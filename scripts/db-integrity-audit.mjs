#!/usr/bin/env node
// Read-only audit of a SmartLearn SQLite file (always open a COPY): physical integrity plus the "screen says X but the content is not there"
// inconsistencies. Changes nothing. Usage: node scripts/db-integrity-audit.mjs <path-to-db>
import { DatabaseSync } from 'node:sqlite';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/db-integrity-audit.mjs <db>'); process.exit(2); }
const db = new DatabaseSync(path, { readOnly: true });
const rows = (sql) => db.prepare(sql).all().map((r) => ({ ...r }));
const findings = [];
const check = (code, description, sql) => { const found = rows(sql); if (found.length) findings.push({ code, description, count: found.length, sample: found.slice(0, 10) }); };

const integrity = rows('pragma integrity_check')[0].integrity_check;
if (integrity !== 'ok') findings.push({ code: 'PHYSICAL', description: 'SQLite integrity_check', count: 1, sample: [integrity] });
check('FOREIGN_KEY', 'rows pointing at rows that do not exist', 'pragma foreign_key_check');
check('UNIT_WITHOUT_SUMMARY', 'lesson listed under its discipline with NO master summary', "select u.id, s.name as subject, u.title from learning_units u join subjects s on s.id = u.subject_id where trim(coalesce(u.summary_body, '')) = ''");
check('SUBJECT_WITHOUT_UNITS', 'discipline with no lesson at all', 'select s.id, s.name from subjects s where not exists (select 1 from learning_units u where u.subject_id = s.id)');
check('UNIT_WITHOUT_EXERCISES', 'lesson with no questions', 'select u.id, u.title from learning_units u where not exists (select 1 from exercises e where e.unit_id = u.id)');
check('REVIEW_WITHOUT_CONTENT', 'review tasks of a lesson that has no summary and no questions', "select u.id, u.title, (select count(*) from review_tasks t where t.unit_id = u.id) as tasks from learning_units u where trim(coalesce(u.summary_body, '')) = '' and not exists (select 1 from exercises e where e.unit_id = u.id) and exists (select 1 from review_tasks t where t.unit_id = u.id)");
check('DRAFT_WITHOUT_PROPOSAL', 'draft whose proposal is gone', 'select d.id from generated_drafts d where not exists (select 1 from content_proposals p where p.id = d.proposal_id)');
check('PROPOSAL_WITHOUT_SOURCE', 'proposal whose document is gone', 'select p.id from content_proposals p where not exists (select 1 from sources s where s.id = p.source_id)');

console.log(JSON.stringify({ db: path, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;
