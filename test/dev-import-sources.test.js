import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { importSources } from '../scripts/dev-import-sources.mjs';

const MIGRATIONS = fileURLToPath(new URL('../server/migrations', import.meta.url));

function world() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-import-'));
  const mk = (name) => { const db = openDb(join(dir, `${name}.db`)); runMigrations(db, MIGRATIONS); mkdirSync(join(dir, `${name}-src`)); return db; };
  const src = mk('src');
  const dst = mk('dst');
  const now = '2026-10-03T00:00:00.000Z';
  const user = (db, email) => db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES (?,?,'h','s','scrypt','{}',?,?)`).run(email, email, now, now).lastInsertRowid;
  user(src, 'a@x.com');
  const srcUser = user(src, 'costanzo@x.com');
  // the destination already has history of its own, so ids WILL collide with the source's
  const dev = user(dst, 'dev@smartlearn.local');
  const bytes = Buffer.from('%PDF-1.4 fake costanzo bytes');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(dir, 'src-src', 'f1.pdf'), bytes);
  const sid = src.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, extraction_status, parser_version, page_count, extracted_at, extraction_generation)
    VALUES (?, 'f1.pdf', 'Costanzo.pdf', 'application/pdf', ?, ?, 'UPLOADED', ?, 'EXTRACTED', 'p1', 2, ?, 3)`).run(srcUser, bytes.length, checksum, now, now).lastInsertRowid;
  for (const i of [1, 2]) src.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at) VALUES (?,?,?,?,?)').run(srcUser, sid, i, `texto ${i}`, now);
  src.prepare('INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index, detected) VALUES (?,?,?,?,?,?,?)').run(srcUser, sid, 0, 1, 'Cap', 1, 0);
  const pids = [1, 2].map((i) => src.prepare('INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(srcUser, sid, i, i, i, `Unidade ${i}`, now, now).lastInsertRowid);
  const draftJson = JSON.stringify({ summary: 's', questions: [{ id: 'q1', status: 'REJECTED', question: 'q?' }], audit: { findings: [{ scope: 'summary' }] } });
  src.prepare('INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at, revision, source_extraction_generation, input_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(srcUser, pids[1], 'CODEX', 'codex:default', '5', 'DRAFT', draftJson, now, 4, 3, 'abc');
  // pre-existing destination rows that occupy the same low ids
  const dsid = dst.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at) VALUES (?, 'old.pdf', 'Old.pdf', 'application/pdf', 5, 'zz', 'UPLOADED', ?)").run(dev, now).lastInsertRowid;
  dst.prepare('INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(dev, dsid, 1, 1, 1, 'Velha', now, now);
  return { dir, src, dst, srcUser, dev, draftJson, opts: { srcDb: src, dstDb: dst, srcUserId: srcUser, dstUserEmail: 'dev@smartlearn.local', srcSourcesDir: join(dir, 'src-src'), dstSourcesDir: join(dir, 'dst-src') } };
}
const count = (db, t) => db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
const cleanup = (w) => { w.src.close(); w.dst.close(); rmSync(w.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); };

test('imports the source subgraph under the destination user with remapped ids, keeping the history already there', () => {
  const w = world();
  try {
    const before = { sources: count(w.dst, 'sources'), proposals: count(w.dst, 'content_proposals') };
    const report = importSources(w.opts);
    assert.equal(report.imported.length, 1);
    const r = report.imported[0];
    assert.deepEqual([r.pages, r.outline, r.proposals, r.drafts], [2, 1, 2, 1]);
    assert.equal(count(w.dst, 'sources'), before.sources + 1);
    assert.equal(count(w.dst, 'content_proposals'), before.proposals + 2);
    assert.equal(w.dst.prepare("SELECT title FROM content_proposals WHERE title = 'Velha'").all().length, 1, 'old history intact');
    const s = w.dst.prepare("SELECT * FROM sources WHERE original_name = 'Costanzo.pdf'").get();
    assert.equal(s.user_id, w.dev);
    assert.notEqual(s.id, 1, 'the colliding id was remapped');
    assert.equal(s.extraction_generation, 3);
    const draft = w.dst.prepare('SELECT d.*, p.title FROM generated_drafts d JOIN content_proposals p ON p.id = d.proposal_id AND p.user_id = d.user_id').get();
    assert.equal(draft.title, 'Unidade 2');
    assert.equal(draft.draft_json, w.draftJson, 'draft JSON copied verbatim');
    assert.equal(draft.revision, 4);
    assert.deepEqual(w.dst.pragma('foreign_key_check'), []);
    assert.equal(w.dst.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(readFileSync(join(w.dir, 'dst-src', 'f1.pdf')).length, s.byte_size);
  } finally { cleanup(w); }
});

test('a second run changes nothing (idempotent) and the source database is never written', () => {
  const w = world();
  try {
    importSources(w.opts);
    const snapshot = () => ['sources', 'source_pages', 'source_outline', 'content_proposals', 'generated_drafts'].map((t) => count(w.dst, t)).join(',');
    const after1 = snapshot();
    const report = importSources(w.opts);
    assert.equal(report.imported.length, 0);
    assert.equal(report.skipped.length, 1);
    assert.equal(snapshot(), after1);
    assert.equal(count(w.src, 'sources'), 1);
  } finally { cleanup(w); }
});

test('a corrupt PDF or a missing destination user aborts with nothing written (all or nothing)', () => {
  const w = world();
  try {
    assert.throws(() => importSources({ ...w.opts, dstUserEmail: 'nobody@x.com' }), /does not exist/);
    writeFileSync(join(w.dir, 'src-src', 'f1.pdf'), 'tampered');
    assert.throws(() => importSources(w.opts), /checksum/);
    assert.equal(count(w.dst, 'sources'), 1);
    assert.equal(count(w.dst, 'source_pages'), 0);
    assert.equal(existsSync(join(w.dir, 'dst-src', 'f1.pdf')), false);
  } finally { cleanup(w); }
});

test('an ACCEPTED draft is refused (its lesson lives in tables this import does not copy)', () => {
  const w = world();
  try {
    w.src.prepare("UPDATE generated_drafts SET status = 'ACCEPTED', accepted_at = '2026-10-03T00:00:00.000Z'").run();
    assert.throws(() => importSources(w.opts), /ACCEPTED/);
    assert.equal(count(w.dst, 'sources'), 1, 'rolled back');
    assert.equal(existsSync(join(w.dir, 'dst-src', 'f1.pdf')), false);
  } finally { cleanup(w); }
});
