// CLI for dev-import-sources.mjs. Usage:
//   node scripts/dev-import-sources-cli.mjs --src-db A.db --src-sources DIR --src-user 3 --dst-db B.db --dst-sources DIR --dst-email dev@smartlearn.local
// The destination is migrated forward with the normal migration runner first. Nothing is ever deleted.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { importSources } from './dev-import-sources.mjs';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (name) => { const v = arg(name); if (!v) { console.error(`missing --${name}`); process.exit(2); } return v; };
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const srcDb = new Database(need('src-db'), { readonly: true, fileMustExist: true });
const dstDb = openDb(need('dst-db'));
runMigrations(dstDb, join(root, 'server', 'migrations'));
const report = importSources({
  srcDb, dstDb, srcUserId: Number(need('src-user')), dstUserEmail: need('dst-email'),
  srcSourcesDir: need('src-sources'), dstSourcesDir: need('dst-sources'),
});
console.log(JSON.stringify(report, null, 1));
dstDb.pragma('wal_checkpoint(TRUNCATE)');
dstDb.close();
srcDb.close();
