import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations, pendingMigrations } from '../src/migrations.js';
import { recordSourceEdition, sameWorkEditions, verifiedMap } from '../src/services/catalog.js';
import { reusableAcrossEditions } from '../src/catalog/reuse-gate.js';

// Migration 044 + the catalog service on DISPOSABLE databases with synthetic books: additive migration, ISBN merge, no merge by title alone,
// idempotent linking, per-user privacy of the file link, and a verified map as the only way to carry content across editions.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const NOW = '2026-11-13T12:00:00.000Z';

function tmpDb(upTo = null) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-catalog-'));
  const db = openDb(join(dir, 'test.db'));
  if (upTo === null) runMigrations(db, MIGRATIONS_DIR);
  return { db, dir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const user = (db, email) => db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)").run(email, email, NOW, NOW).lastInsertRowid;
function source(db, userId, name, firstPage = '') {
  const id = db.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, created_at) VALUES (?, ?, ?, 'application/pdf', 1, ?, ?)").run(userId, `${name}.bin`, name, `c-${userId}-${name}`, NOW).lastInsertRowid;
  if (firstPage) db.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at) VALUES (?, ?, 1, ?, ?)').run(userId, id, firstPage, NOW);
  return id;
}
const rows = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

test('migration 044 is additive: data written before it survives, the four catalog tables appear empty, and re-running changes nothing', () => {
  const { db, cleanup } = tmpDb(0);
  try {
    runMigrations(db, MIGRATIONS_DIR);
    // simulate "an earlier version" by checking that nothing but the new tables is introduced by 044
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'catalog_%' OR name = 'source_editions'").all().map((r) => r.name).sort();
    assert.deepEqual(tables, ['catalog_edition_maps', 'catalog_editions', 'catalog_works', 'source_editions']);
    const u = user(db, 'a@x.test');
    const s = source(db, u, 'Costanzo.pdf');
    runMigrations(db, MIGRATIONS_DIR); // idempotent
    assert.equal(pendingMigrations(db, MIGRATIONS_DIR).pending.length, 0);
    assert.equal(rows(db, 'sources'), 1);
    assert.equal(db.prepare('SELECT original_name FROM sources WHERE id = ?').get(s).original_name, 'Costanzo.pdf');
    assert.equal(rows(db, 'catalog_works'), 0);
  } finally { cleanup(); }
});

test('the same ISBN in two uploads (even in two accounts) is ONE edition; each account keeps its own private link to its own file', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test'); const b = user(db, 'b@x.test');
    const sa = source(db, a, 'Costanzo Physiology.pdf', 'Costanzo Physiology. Fifth Edition. Copyright © 2012. ISBN 978-0-306-40615-7');
    const sb = source(db, b, 'costanzo [site].pdf', 'ISBN 0-306-40615-2 Fifth Edition');
    const ra = recordSourceEdition(db, a, sa, { now: () => new Date(NOW) });
    const rb = recordSourceEdition(db, b, sb, { now: () => new Date(NOW) });
    assert.equal(ra.confidence, 'HIGH');
    assert.equal(rb.editionId, ra.editionId, 'same ISBN -> same edition');
    assert.equal(rows(db, 'catalog_editions'), 1);
    assert.equal(rows(db, 'source_editions'), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM source_editions WHERE user_id = ?').get(a).n, 1, 'the link is per account');
    // idempotent
    const again = recordSourceEdition(db, a, sa);
    assert.equal(again.created, false);
    assert.equal(rows(db, 'source_editions'), 2);
  } finally { cleanup(); }
});

test('same title WITHOUT an ISBN never merges two editions: it becomes two editions of one work, and only edition number AND year together can merge', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const old = source(db, a, 'Costanzo Physiology 2012.pdf', 'Fifth Edition. Copyright © 2012');
    const recent = source(db, a, 'Costanzo Physiology 2025.pdf', 'Seventh Edition. Copyright © 2025');
    const twin = source(db, a, 'Costanzo Physiology 2012 (copy).pdf', 'Fifth Edition. Copyright © 2012');
    const nameOnly = source(db, a, 'Costanzo Physiology 2020.pdf', '');
    const r1 = recordSourceEdition(db, a, old); const r2 = recordSourceEdition(db, a, recent);
    assert.notEqual(r1.editionId, r2.editionId);
    assert.equal(r1.workId, r2.workId, 'one work, two editions');
    assert.deepEqual(sameWorkEditions(db, r1.editionId).map((e) => e.year), [2025, 2012], 'newest first');
    const r3 = recordSourceEdition(db, a, twin);
    assert.equal(r3.editionId, r1.editionId, 'edition number + year both equal -> same edition');
    assert.equal(r3.confidence, 'MEDIUM');
    const r4 = recordSourceEdition(db, a, nameOnly);
    assert.equal(r4.confidence, 'LOW');
    assert.notEqual(r4.editionId, r1.editionId, 'a year in a file name alone does not merge');
  } finally { cleanup(); }
});

test('only a VERIFIED map is returned, it feeds the reuse gate, and deleting the source removes only the private link', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const s12 = source(db, a, 'Costanzo Physiology 2012.pdf', 'Fifth Edition. Copyright © 2012');
    const s25 = source(db, a, 'Costanzo Physiology 2025.pdf', 'Seventh Edition. Copyright © 2025');
    const e12 = recordSourceEdition(db, a, s12).editionId; const e25 = recordSourceEdition(db, a, s25).editionId;
    const ins = db.prepare('INSERT INTO catalog_edition_maps (from_edition_id, to_edition_id, from_title_key, to_title_key, from_page_start, from_page_end, to_page_start, to_page_end, relation, verified, verified_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    ins.run(e12, e25, 'filtracao glomerular', 'filtracao glomerular', 30, 40, 55, 66, 'EQUIVALENT', 0, null, NOW);
    assert.equal(verifiedMap(db, e12, e25), null, 'an unverified correspondence is not evidence');
    db.prepare('UPDATE catalog_edition_maps SET verified = 1, verified_method = ?').run('MANUAL');
    const map = verifiedMap(db, e12, e25);
    assert.equal(reusableAcrossEditions({ titleKey: 'filtracao glomerular', pages: [58, 60] }, map).reuse, true);
    assert.throws(() => ins.run(e12, e25, 'x', 'x', 1, 2, 3, 4, 'EQUIVALENT', 1, null, NOW), /constraint/i, 'verified needs a method');
    db.prepare('DELETE FROM source_pages WHERE source_id = ?').run(s12); // the product deletes a file's pages first (source-storage.js)
    db.prepare('DELETE FROM sources WHERE id = ?').run(s12);
    assert.equal(rows(db, 'source_editions'), 1, 'the private link follows its file');
    assert.equal(rows(db, 'catalog_editions'), 2, 'the bibliographic record stays');
  } finally { cleanup(); }
});

test('upgrade from version 43 with existing data: nothing is lost or rewritten, and the catalog can be filled afterwards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-catalog-up-'));
  const old = join(dir, 'migrations-043');
  try {
    mkdirSync(old);
    for (const f of readdirSync(MIGRATIONS_DIR)) if (!f.startsWith('044-') && f !== 'manifest.json') copyFileSync(join(MIGRATIONS_DIR, f), join(old, f));
    const manifest = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'manifest.json'), 'utf8')).filter((e) => e.version <= 43);
    writeFileSync(join(old, 'manifest.json'), JSON.stringify(manifest));
    const db = openDb(join(dir, 'up.db'));
    runMigrations(db, old);
    const u = user(db, 'a@x.test');
    const s = source(db, u, 'Costanzo Physiology 2012.pdf', 'Fifth Edition. Copyright © 2012');
    const before = db.prepare('SELECT id, original_name, checksum FROM sources').all();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'catalog_works'").get().n, 0, 'the old schema has no catalog');
    runMigrations(db, MIGRATIONS_DIR);
    assert.deepEqual(db.prepare('SELECT id, original_name, checksum FROM sources').all(), before, 'existing sources are untouched');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(recordSourceEdition(db, u, s).confidence, 'MEDIUM');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
