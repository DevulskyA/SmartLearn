// Summary figures through the logical export/restore: the images come back for the new account under NEW ids, and the
// `smartlearn-figure:ID` references inside the restored summaries are rewritten to them. A fake image refuses the whole restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as figures from '../src/services/summary-figures.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('restore-me')]);

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-restore-fig-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const post = (app, url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers: { origin: ORIGIN, ...headers } });
async function account(app, email) {
  await post(app, '/v1/auth/register', { email, password: PASSWORD });
  const login = await post(app, '/v1/auth/login', { email, password: PASSWORD });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
  return { cookie, csrf: me.csrfToken, userId: me.user.id };
}
const authed = (a) => ({ cookie: a.cookie, 'x-csrf-token': a.csrf });

function seed(db, userId) {
  const t = '2026-03-01T10:00:00.000Z';
  const subject = db.prepare('INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(userId, 'Fisiologia', 'DISC-BLUE', 1, 0, t, t).lastInsertRowid;
  // two figures so the new ids differ from the old ones in a non-trivial way
  figures.create(db, userId, { buffer: Buffer.concat([PNG, Buffer.from('a')]), alt: 'primeira' });
  const fig = figures.create(db, userId, { buffer: PNG, alt: 'Esquema' });
  const body = `Texto $x^2$.\n\n![Esquema](smartlearn-figure:${fig.id} "Figura 1")\n\n![fantasma](smartlearn-figure:999)`;
  db.prepare('INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(userId, subject, 'Filtração', null, body, '2026-03-03', t, t);
  return { oldId: fig.id, body };
}

async function restoreInto(app, target, exported) {
  const preview = await post(app, '/v1/imports/preview', { rawSource: exported }, authed(target));
  assert.equal(preview.statusCode, 200, preview.body);
  const parsed = JSON.parse(preview.body).preview;
  const commit = await post(app, `/v1/imports/${parsed.id}/commit`, {}, authed(target));
  return { parsed, commit };
}

test('export A -> restore B: the figure bytes come back under a new id and the summary points at it', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await account(app, 'a@example.com');
    const b = await account(app, 'b@example.com');
    const { oldId, body } = seed(db, a.userId);
    const exported = JSON.parse((await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: a.cookie } })).body);
    assert.equal(exported.summaryFigures.length, 2);

    const { parsed, commit } = await restoreInto(app, b, exported);
    assert.equal(parsed.counts.summaryFigures, 2);
    assert.equal(commit.statusCode, 200, commit.body);

    const restoredBody = db.prepare('SELECT summary_body FROM learning_units WHERE user_id = ?').get(b.userId).summary_body;
    const newId = Number(/smartlearn-figure:(\d+) "Figura 1"/.exec(restoredBody)[1]);
    assert.notEqual(newId, oldId, 'the reference was rewritten to the new account\'s own figure');
    assert.deepEqual(figures.read(db, b.userId, newId).bytes, PNG);
    assert.equal(restoredBody, body.replace(`smartlearn-figure:${oldId} "Figura 1"`, `smartlearn-figure:${newId} "Figura 1"`), 'only the known reference changed; the unknown one is left as written');
    assert.throws(() => figures.read(db, a.userId, newId), (e) => e.code === 'NOT_FOUND', 'the figure belongs to B, not to A');
  } finally { cleanup(); }
});

test('an export without figures (older files) restores exactly as before: no summaryFigures count', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await account(app, 'a@example.com');
    const b = await account(app, 'b@example.com');
    const t = '2026-03-01T10:00:00.000Z';
    const subject = db.prepare('INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(a.userId, 'Anatomia', 'DISC-BLUE', 1, 0, t, t).lastInsertRowid;
    db.prepare('INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(a.userId, subject, 'Ossos', null, 'texto simples', '2026-03-03', t, t);
    const exported = JSON.parse((await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: a.cookie } })).body);
    delete exported.summaryFigures; // a file written before this feature existed
    const { parsed, commit } = await restoreInto(app, b, exported);
    assert.equal('summaryFigures' in parsed.counts, false);
    assert.equal(commit.statusCode, 200, commit.body);
  } finally { cleanup(); }
});

test('a figure whose bytes are not a real image refuses the whole restore and writes nothing', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await account(app, 'a@example.com');
    const b = await account(app, 'b@example.com');
    seed(db, a.userId);
    const exported = JSON.parse((await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: a.cookie } })).body);
    exported.summaryFigures[1].dataBase64 = Buffer.from('<svg><script>1</script></svg>').toString('base64');
    const { commit } = await restoreInto(app, b, exported);
    assert.notEqual(commit.statusCode, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_units WHERE user_id = ?').get(b.userId).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM summary_figures WHERE user_id = ?').get(b.userId).n, 0);
  } finally { cleanup(); }
});

test('malformed figures in the file are rejected at preview with a readable reason', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await account(app, 'a@example.com');
    const b = await account(app, 'b@example.com');
    seed(db, a.userId);
    const exported = JSON.parse((await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: a.cookie } })).body);
    exported.summaryFigures[0].dataBase64 = 'not base64!!';
    const res = await post(app, '/v1/imports/preview', { rawSource: exported }, authed(b));
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /dataBase64/);
  } finally { cleanup(); }
});
