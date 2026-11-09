#!/usr/bin/env node
// Operator CLI: change the e-mail of an account directly in a SmartLearn database. Close the app first.
//
//   node scripts/homologation-set-email.mjs <current-email> <new-email> [--db <path>]
//
// Default database: the isolated Homologacao install. Sessions of the account stay valid (the user id does not change).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { assertMigrationAuthorizedForPath } from '../server/src/migration-authorization.js';

const [, , current, next] = process.argv;
const i = process.argv.indexOf('--db');
const dbPath = i > 0 ? process.argv[i + 1] : join(homedir(), 'SmartLearn-Homologacao-Data', 'smartlearn-homologacao.db');
if (!current || !next || next.startsWith('--')) { console.error('Usage: node scripts/homologation-set-email.mjs <current-email> <new-email> [--db <path>]'); process.exit(1); }
if (!/^[^\s@]+@[^\s@]+$/.test(next)) { console.error('E-mail novo invalido. Nada foi alterado.'); process.exit(1); }

assertMigrationAuthorizedForPath(dbPath);
const db = openDb(dbPath);
runMigrations(db);
const from = current.trim().toLowerCase();
const to = next.trim().toLowerCase();
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(from);
if (!user) { console.error(`Nenhuma conta para ${from}. Nada foi alterado.`); db.close(); process.exit(1); }
if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(to, user.id)) { console.error(`${to} ja pertence a outra conta. Nada foi alterado.`); db.close(); process.exit(1); }
db.prepare('UPDATE users SET email = ?, email_display = ?, updated_at = ? WHERE id = ?').run(to, next.trim(), new Date().toISOString(), user.id);
db.close();
console.log(`E-mail alterado: ${from} -> ${to} em ${dbPath}`);
