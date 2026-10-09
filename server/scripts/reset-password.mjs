#!/usr/bin/env node
// T11: operator CLI for issuing a password-reset token. Requires shell
// access to the server (explicit operational authorization) — there is no
// HTTP endpoint that issues a token to a remote, unauthenticated caller.
//
// Usage: node server/scripts/reset-password.mjs <email> [--db path/to.db]

import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { config } from '../src/config.js';
import { issueResetToken, RESET_TOKEN_LIFETIME_MS } from '../src/auth/reset-tokens.js';

async function main() {
  const [, , email, ...rest] = process.argv;
  if (!email) {
    console.error('Usage: node server/scripts/reset-password.mjs <email>');
    process.exit(1);
  }
  const dbPathFlagIndex = rest.indexOf('--db');
  const dbPath = dbPathFlagIndex >= 0 ? rest[dbPathFlagIndex + 1] : config.dbPath;

  const db = openDb(dbPath);
  runMigrations(db);

  const normalized = email.trim().toLowerCase();
  const token = issueResetToken(db, normalized);
  db.close();

  if (!token) {
    console.error(`No account found for ${normalized}.`);
    process.exit(1);
  }

  console.log('Reset token issued. This value is shown ONLY ONCE — record it now.');
  console.log(`Token: ${token}`);
  console.log(`Expires in ${RESET_TOKEN_LIFETIME_MS / 60000} minutes.`);
  console.log('Give this token to the account owner through a trusted out-of-band channel.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
