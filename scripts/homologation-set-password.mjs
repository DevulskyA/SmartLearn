#!/usr/bin/env node
// Operator CLI: the account owner types a new password (hidden) straight into the database of the isolated
// Homologacao install. The agent never sees it. Close the app first. Same operator authority as
// server/scripts/reset-password.mjs, but completes the change in one step (no HTTP endpoint, no token).
//
//   node scripts/homologation-set-password.mjs <email> [--db <path>]
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { assertMigrationAuthorizedForPath } from '../server/src/migration-authorization.js';
import { hashPassword, PASSWORD_MIN_CODEPOINTS } from '../server/src/auth/passwords.js';
import * as sessions from '../server/src/repositories/sessions.js';

const email = process.argv[2]?.trim().toLowerCase();
const i = process.argv.indexOf('--db');
const dbPath = i > 0 ? process.argv[i + 1] : join(homedir(), 'SmartLearn-Homologacao-Data', 'smartlearn-homologacao.db');
if (!email) { console.error('Usage: node scripts/homologation-set-password.mjs <email> [--db <path>]'); process.exit(1); }
if (!process.stdin.isTTY) { console.error('Run this in an interactive terminal: the password is typed hidden.'); process.exit(1); }

function askHidden(label) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(label)) process.stdout.write(s); };
    rl.question(label, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const first = await askHidden('Nova senha (qualquer tamanho): ');
const second = await askHidden('Repita a senha: ');
if (first !== second) { console.error('As senhas nao conferem. Nada foi alterado.'); process.exit(1); }
// Operator override: the app minimum belongs to the app's registration/reset screens, not to this CLI.
// Only empty or oversized passwords are refused here.
if (first.length === 0) { console.error('Senha vazia. Nada foi alterado.'); process.exit(1); }
if (Buffer.byteLength(first, 'utf8') > 1024) { console.error('Senha grande demais (mais de 1024 bytes). Nada foi alterado.'); process.exit(1); }
if ([...first].length < PASSWORD_MIN_CODEPOINTS) console.log('Aviso: abaixo do minimo do app (cadastro e reset por token). O login aceita.');

assertMigrationAuthorizedForPath(dbPath);
const db = openDb(dbPath);
runMigrations(db);
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (!user) { console.error(`Nenhuma conta para ${email}. Nada foi alterado.`); db.close(); process.exit(1); }
const { hash, salt, algorithm, params } = await hashPassword(first);
db.prepare('UPDATE users SET password_hash=?, password_salt=?, password_algorithm=?, password_params=?, updated_at=? WHERE id=?')
  .run(hash, salt, algorithm, params, new Date().toISOString(), user.id);
sessions.revokeAllForUser(db, user.id);
db.close();
console.log(`Senha de ${email} alterada em ${dbPath}. Abra a Homologacao e entre.`);
