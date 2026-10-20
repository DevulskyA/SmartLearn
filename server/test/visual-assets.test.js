// Private visual assets of the Resumo Mestre: real-byte validation and re-encoding, owner-only access, idempotent creation, safe file/row
// ordering, protection against deleting what is still referenced, and the checks that run when a summary is saved or accepted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as assets from '../src/services/visual-assets.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function env() {
  const root = mkdtempSync(join(tmpdir(), 'sl-assets-'));
  const db = openDb(join(root, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const mediaDir = join(root, 'media');
  const sourcesDir = join(root, 'sources');
  return { root, db, mediaDir, sourcesDir, cleanup: () => { db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return Number(db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid);
};
const raster = (format, { width = 40, height = 30, color = '#2563eb' } = {}) => sharp({ create: { width, height, channels: 3, background: color } })[format]().toBuffer();
const input = (buffer, extra = {}) => ({ buffer, alt: 'Esquema', caption: 'Figura 1', operationKey: `k-${Math.random().toString(36).slice(2)}`, ...extra });
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
const code = (c) => (e) => e.code === c;

test('PNG, JPEG and WebP are accepted by their real bytes and stored re-encoded, with real MIME and dimensions', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const expected = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    for (const format of Object.keys(expected)) {
      const { asset } = await assets.create(e.db, u, input(await raster(format)), { mediaDir: e.mediaDir });
      assert.equal(asset.mime, expected[format]);
      assert.deepEqual([asset.width, asset.height], [40, 30]);
      assert.equal(asset.kind, 'STUDENT_IMAGE');
      const { bytes } = assets.readFile(e.db, u, asset.id, e.mediaDir);
      assert.equal((await sharp(bytes).metadata()).format, format);
    }
    assert.equal(filesIn(e.mediaDir).length, 3);
  } finally { e.cleanup(); }
});

test('SVG, HTML, PDF, GIF, truncated and renamed files are refused; nothing reaches the disk or the table', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const png = await raster('png');
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).gif().toBuffer();
    const bad = [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<html><script>alert(1)</script></html>'),
      Buffer.from('%PDF-1.7 not an image'),
      gif,
      png.subarray(0, 30), // truncated PNG
      Buffer.concat([Buffer.from('GIF89a'), png]), // wrong magic with an image inside
      Buffer.from('plain text'),
    ];
    for (const buffer of bad) await assert.rejects(() => assets.create(e.db, u, input(buffer), { mediaDir: e.mediaDir }), (err) => err.code === 'UNSUPPORTED_FILE_TYPE' || err.code === 'VALIDATION_FAILED');
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 0);
    assert.deepEqual(filesIn(e.mediaDir), []);
  } finally { e.cleanup(); }
});

test('limits: too many bytes, too many pixels (decompression bomb) and too large a side (scaled down); alt text is required', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const limits = { ...assets.DEFAULT_LIMITS, maxUploadBytes: 5_000, maxPixels: 100_000, maxSide: 64 };
    const big = Buffer.concat([await raster('png'), Buffer.alloc(6_000)]);
    await assert.rejects(() => assets.create(e.db, u, input(big), { mediaDir: e.mediaDir, limits }), code('FILE_TOO_LARGE'));
    const bomb = await raster('png', { width: 2000, height: 2000 }); // 4 MP of one color: tiny file, huge decode
    await assert.rejects(() => assets.create(e.db, u, input(bomb), { mediaDir: e.mediaDir, limits: { ...limits, maxUploadBytes: 1_000_000 } }), code('UNSUPPORTED_FILE_TYPE'));
    const wide = await raster('png', { width: 300, height: 100 }); // 30k pixels: allowed, but wider than maxSide
    const { asset } = await assets.create(e.db, u, input(wide), { mediaDir: e.mediaDir, limits: { ...limits, maxUploadBytes: 1_000_000 } });
    assert.deepEqual([asset.width, asset.height], [64, 21]);
    for (const alt of ['', '   ', undefined, 'x'.repeat(301)]) {
      await assert.rejects(() => assets.create(e.db, u, input(wide, { alt }), { mediaDir: e.mediaDir }), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'alt');
    }
    const quota = { ...assets.DEFAULT_LIMITS, quotaBytes: 10 };
    const red = await raster('png', { color: '#ff0000' });
    await assert.rejects(() => assets.create(e.db, u, input(red), { mediaDir: e.mediaDir, limits: quota }), code('QUOTA_EXCEEDED'));
  } finally { e.cleanup(); }
});

test('metadata is stripped (EXIF/GPS never stored) and the EXIF orientation is applied to the pixels', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const withExif = await sharp({ create: { width: 60, height: 20, channels: 3, background: '#00aa00' } }).withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'segredo' } } }).jpeg().toBuffer();
    assert.ok((await sharp(withExif).metadata()).exif, 'the fixture really carries EXIF');
    const { asset } = await assets.create(e.db, u, input(withExif), { mediaDir: e.mediaDir });
    const { bytes } = assets.readFile(e.db, u, asset.id, e.mediaDir);
    assert.equal((await sharp(bytes).metadata()).exif, undefined);
    assert.ok(!bytes.includes(Buffer.from('segredo')));
    assert.deepEqual([asset.width, asset.height], [20, 60], 'orientation 6 = rotated 90 degrees: the stored image is portrait');
  } finally { e.cleanup(); }
});

test('the same operation key never creates a second asset or a second file', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const png = await raster('png');
    const first = await assets.create(e.db, u, input(png, { operationKey: 'same' }), { mediaDir: e.mediaDir });
    const again = await assets.create(e.db, u, input(await raster('png', { color: '#ff0000' }), { operationKey: 'same', alt: 'outro' }), { mediaDir: e.mediaDir });
    assert.equal(first.duplicate, false);
    assert.equal(again.duplicate, true);
    assert.equal(again.asset.id, first.asset.id);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 1);
    assert.equal(filesIn(e.mediaDir).length, 1);
    const other = makeUser(e.db, 'b@example.com');
    const bobs = await assets.create(e.db, other, input(png, { operationKey: 'same' }), { mediaDir: e.mediaDir });
    assert.notEqual(bobs.asset.id, first.asset.id, 'the key is per owner');
  } finally { e.cleanup(); }
});

test('a database failure leaves no file behind (file first, row second, the file is removed when the row cannot be written)', async () => {
  const e = env();
  try {
    const png = await raster('png');
    await assert.rejects(() => assets.create(e.db, 99999, input(png), { mediaDir: e.mediaDir })); // no such user: the row is refused
    assert.deepEqual(filesIn(e.mediaDir), []);
  } finally { e.cleanup(); }
});

test('isolation: another user can neither read, change, delete nor use the figure, and learns nothing about its existence', async () => {
  const e = env();
  try {
    const alice = makeUser(e.db, 'a@example.com');
    const bob = makeUser(e.db, 'b@example.com');
    const { asset } = await assets.create(e.db, alice, input(await raster('png')), { mediaDir: e.mediaDir });
    assert.throws(() => assets.get(e.db, bob, asset.id), code('NOT_FOUND'));
    assert.throws(() => assets.readFile(e.db, bob, asset.id, e.mediaDir), code('NOT_FOUND'));
    assert.throws(() => assets.updateTexts(e.db, bob, asset.id, { alt: 'x' }), code('NOT_FOUND'));
    assert.throws(() => assets.remove(e.db, bob, asset.id, e.mediaDir), code('NOT_FOUND'));
    assert.deepEqual(assets.findUnresolvedRefs(e.db, bob, `[[fig:${asset.id}]]`), [{ id: asset.id, reason: 'UNKNOWN' }]);
    for (const hostile of ['../../etc/passwd', '..%2F..%2Fsecret', 'not-a-uuid', '']) assert.throws(() => assets.get(e.db, alice, hostile), code('NOT_FOUND'));
    assert.equal(assets.get(e.db, alice, asset.id).id, asset.id);
  } finally { e.cleanup(); }
});

test('only the texts can be edited; a referenced figure cannot be deleted, an unreferenced one can (file included)', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const { asset } = await assets.create(e.db, u, input(await raster('png')), { mediaDir: e.mediaDir });
    const edited = assets.updateTexts(e.db, u, asset.id, { alt: 'Novo alt', caption: 'Nova legenda', description: 'Descrição longa' });
    assert.deepEqual([edited.alt, edited.caption, edited.description, edited.sha256 ?? 'x'], ['Novo alt', 'Nova legenda', 'Descrição longa', 'x']);
    assert.throws(() => assets.updateTexts(e.db, u, asset.id, { alt: '' }), (err) => err.code === 'VALIDATION_FAILED');

    const unit = learningUnits.create(e.db, u, { newSubjectName: 'Fisiologia', title: 'Filtração', studyDate: '2026-09-01', summaryBody: `Texto\n\n[[fig:${asset.id}]]\n\nfim` }).unit;
    assert.deepEqual(assets.referencesOf(e.db, u, asset.id), [{ type: 'unit', id: unit.id }]);
    assert.throws(() => assets.remove(e.db, u, asset.id, e.mediaDir), code('ASSET_IN_USE'));
    assert.equal(filesIn(e.mediaDir).length, 1, 'the refused delete touched nothing');
    learningUnits.updateFields(e.db, u, unit.id, { summaryBody: 'sem figura' });
    assets.remove(e.db, u, asset.id, e.mediaDir);
    assert.deepEqual(filesIn(e.mediaDir), []);
    assert.throws(() => assets.get(e.db, u, asset.id), code('NOT_FOUND'));
  } finally { e.cleanup(); }
});

test('integrity: a file changed or removed on disk is never served', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const { asset } = await assets.create(e.db, u, input(await raster('png')), { mediaDir: e.mediaDir });
    const file = join(e.mediaDir, filesIn(e.mediaDir)[0]);
    const original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from('x')]));
    assert.throws(() => assets.readFile(e.db, u, asset.id, e.mediaDir), code('ASSET_INTEGRITY_FAILED'));
    unlinkSync(file);
    assert.throws(() => assets.readFile(e.db, u, asset.id, e.mediaDir), code('ASSET_FILE_MISSING'));
  } finally { e.cleanup(); }
});

test('saving a lesson summary: a figure that does not exist or is not yours is refused, yours is accepted', async () => {
  const e = env();
  try {
    const alice = makeUser(e.db, 'a@example.com');
    const bob = makeUser(e.db, 'b@example.com');
    const mine = (await assets.create(e.db, alice, input(await raster('png')), { mediaDir: e.mediaDir })).asset;
    const theirs = (await assets.create(e.db, bob, input(await raster('png')), { mediaDir: e.mediaDir })).asset;
    const create = (summaryBody) => learningUnits.create(e.db, alice, { newSubjectName: `D${Math.random().toString(36).slice(2, 6)}`, title: 'Aula', studyDate: '2026-09-01', summaryBody });
    assert.throws(() => create(`[[fig:${theirs.id}]]`), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'summaryBody');
    assert.throws(() => create('[[fig:00000000-0000-4000-8000-000000000000]]'), (err) => err.code === 'VALIDATION_FAILED');
    assert.ok(create(`ok\n\n[[fig:${mine.id}]]`).unit.id);
    const unit = create('texto').unit;
    assert.throws(() => learningUnits.updateFields(e.db, alice, unit.id, { summaryBody: `[[fig:${theirs.id}]]` }), (err) => err.code === 'VALIDATION_FAILED');
    assert.equal(learningUnits.getById(e.db, alice, unit.id).summaryBody, 'texto', 'the refused edit changed nothing');
    // text that only LOOKS like a reference is plain text and needs nothing
    assert.ok(create('veja [[fig:xyz]] e `[[fig:00000000-0000-4000-8000-000000000000]]` no meio da linha').unit.id);
  } finally { e.cleanup(); }
});

async function draftEnv(e) {
  const userId = makeUser(e.db, 'd@example.com');
  const upload = (name) => sourceStorage.acceptUpload(e.db, userId, { buffer: buildFixturePdf([`conteudo de teste ${name}`]), originalName: `${name}.pdf`, contentType: 'application/pdf', sourcesDir: e.sourcesDir, ...UPLOAD_DEFAULTS });
  const source = upload('aula');
  const other = upload('outra');
  await extractSource(e.db, userId, source.id, { sourcesDir: e.sourcesDir });
  await extractSource(e.db, userId, other.id, { sourcesDir: e.sourcesDir });
  const [proposal] = proposals.chunkSource(e.db, userId, source.id, { maxPagesPerChunk: 10 });
  const generated = await drafts.createDraft(e.db, userId, proposal.id, {});
  return { userId, source, other, draftId: generated.id };
}

test('draft summary and acceptance: figures must be the student\'s and a PDF crop must come from the draft\'s own source; the reference travels into the accepted lesson', async () => {
  const e = env();
  try {
    const { userId, source, other, draftId } = await draftEnv(e);
    const png = await raster('png');
    const own = (await assets.create(e.db, userId, input(png), { mediaDir: e.mediaDir })).asset;
    const crop = (sourceId, key) => assets.create(e.db, userId, input(png, { operationKey: key, kind: 'PDF_CROP', crop: { sourceId, pageIndex: 1, x: 0.1, y: 0.1, w: 0.5, h: 0.5, rotation: 0 } }), { mediaDir: e.mediaDir });
    const sameSource = (await crop(source.id, 'c1')).asset;
    const otherSource = (await crop(other.id, 'c2')).asset;
    assert.equal(sameSource.source.sourceId, source.id);
    assert.match(sameSource.source.sourceChecksum, /^[0-9a-f]{64}$/);

    const draft = drafts.getDraft(e.db, userId, draftId);
    const revise = (summary) => drafts.reviseSummary(e.db, userId, draftId, { summary, expectedVersion: drafts.getDraft(e.db, userId, draftId).summaryVersion });
    assert.throws(() => revise(`Resumo\n\n[[fig:${otherSource.id}]]`), (err) => err.code === 'VALIDATION_FAILED' && /outra fonte/.test(err.message));
    assert.throws(() => revise('Resumo\n\n[[fig:00000000-0000-4000-8000-000000000000]]'), (err) => err.code === 'VALIDATION_FAILED');
    const body = `Resumo da aula\n\n[[fig:${own.id}]]\n\n[[fig:${sameSource.id}]]`;
    revise(body);
    assert.equal(drafts.getDraft(e.db, userId, draftId).summary, body);
    assert.deepEqual(assets.referencesOf(e.db, userId, own.id).map((r) => r.type), ['draft']);
    assert.throws(() => assets.remove(e.db, userId, own.id, e.mediaDir), code('ASSET_IN_USE'), 'an open draft still uses it');

    const accepted = acceptDraft(e.db, userId, draftId, { newSubjectName: 'Fisiologia', studyDate: '2026-09-01', expectedRevision: drafts.getDraft(e.db, userId, draftId).revision, acknowledgeSummaryFindings: true });
    const unit = learningUnits.getById(e.db, userId, accepted.unit.id);
    assert.equal(unit.summaryBody, body, 'the lesson carries the summary, references included, untouched');
    assert.deepEqual(assets.referencesOf(e.db, userId, own.id).map((r) => r.type), ['unit']);
    assert.equal(draft.summaryVersion >= 1, true);
  } finally { e.cleanup(); }
});

test('a PDF crop needs a real source of the owner, a rectangle inside the page, a valid rotation and an existing page', async () => {
  const e = env();
  try {
    const { userId, source } = await draftEnv(e);
    const intruder = makeUser(e.db, 'x@example.com');
    const png = await raster('png');
    const crop = (user, c, key) => assets.create(e.db, user, input(png, { operationKey: key, kind: 'PDF_CROP', crop: c }), { mediaDir: e.mediaDir });
    const ok = { sourceId: source.id, pageIndex: 1, x: 0, y: 0, w: 1, h: 1, rotation: 90 };
    assert.equal((await crop(userId, ok, 'ok')).asset.source.rotation, 90);
    await assert.rejects(() => crop(intruder, ok, 'intruder'), code('NOT_FOUND'));
    for (const [name, bad] of Object.entries({
      outside: { ...ok, x: 0.8, w: 0.5 }, zero: { ...ok, w: 0 }, negative: { ...ok, x: -0.1 }, rotation: { ...ok, rotation: 45 }, page: { ...ok, pageIndex: 999 }, nan: { ...ok, h: Number.NaN },
    })) await assert.rejects(() => crop(userId, bad, `bad-${name}`), (err) => err.code === 'VALIDATION_FAILED', name);
  } finally { e.cleanup(); }
});

// ---- HTTP ----
async function httpApp() {
  const e = env();
  const app = await buildApp(e.db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir: e.sourcesDir }, media: { mediaDir: e.mediaDir } });
  const post = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers: { origin: ORIGIN, ...headers } });
  async function account(email) {
    await post('/v1/auth/register', { email, password: PASSWORD });
    const login = await post('/v1/auth/login', { email, password: PASSWORD });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
    return { cookie, headers: { cookie, 'x-csrf-token': me.csrfToken, origin: ORIGIN }, userId: me.user.id };
  }
  return { ...e, app, account, post };
}
function multipart(buffer, filename = 'x.png', type = 'image/png') {
  const boundary = `----sl${Date.now()}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  return { payload: Buffer.concat([head, buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]), contentType: `multipart/form-data; boundary=${boundary}` };
}
const query = (o) => new URLSearchParams(o).toString();

test('HTTP: upload, metadata, file with private headers, edit, idempotent repeat, owner-only, anonymous refused, delete protection', async () => {
  const h = await httpApp();
  try {
    const alice = await h.account('a@example.com');
    const bob = await h.account('b@example.com');
    const png = await raster('png');
    const { payload, contentType } = multipart(png);
    const upload = (account, key, body = { payload, contentType }, extra = {}) => h.app.inject({
      method: 'POST', url: `/v1/visual-assets?${query({ operationKey: key, alt: 'Esquema', caption: 'Figura 1', ...extra })}`, payload: body.payload,
      headers: { ...account.headers, 'content-type': body.contentType },
    });

    const created = await upload(alice, 'k1');
    assert.equal(created.statusCode, 201, created.body);
    const { asset } = JSON.parse(created.body);
    assert.equal(asset.mime, 'image/png');
    const repeated = await upload(alice, 'k1');
    assert.equal(repeated.statusCode, 200);
    assert.equal(JSON.parse(repeated.body).asset.id, asset.id);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 1);

    const file = await h.app.inject({ method: 'GET', url: `/v1/visual-assets/${asset.id}/file`, headers: { cookie: alice.cookie } });
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers['content-type'], 'image/png');
    assert.equal(file.headers['x-content-type-options'], 'nosniff');
    assert.match(file.headers['cache-control'], /private/);
    assert.match(file.headers['content-security-policy'], /default-src 'none'/);
    assert.equal((await sharp(file.rawPayload).metadata()).format, 'png');

    assert.equal((await h.app.inject({ method: 'GET', url: `/v1/visual-assets/${asset.id}/file` })).statusCode, 401, 'anonymous');
    for (const url of [`/v1/visual-assets/${asset.id}`, `/v1/visual-assets/${asset.id}/file`]) {
      assert.equal((await h.app.inject({ method: 'GET', url, headers: { cookie: bob.cookie } })).statusCode, 404, `other user ${url}`);
    }
    assert.equal((await h.app.inject({ method: 'GET', url: '/v1/visual-assets/..%2F..%2Fsecret/file', headers: { cookie: alice.cookie } })).statusCode, 404);

    const patched = await h.app.inject({ method: 'PATCH', url: `/v1/visual-assets/${asset.id}`, payload: { caption: 'Nova legenda' }, headers: alice.headers });
    assert.equal(JSON.parse(patched.body).asset.caption, 'Nova legenda');
    assert.equal((await h.app.inject({ method: 'PATCH', url: `/v1/visual-assets/${asset.id}`, payload: { caption: 'x' }, headers: bob.headers })).statusCode, 404);
    assert.equal((await h.app.inject({ method: 'PATCH', url: `/v1/visual-assets/${asset.id}`, payload: { sha256: 'x' }, headers: alice.headers })).statusCode, 400, 'only the texts are editable');

    // the owner comes from the session: no client-supplied owner is read
    const spoof = await upload(bob, 'k2', { payload, contentType }, { userId: String(alice.userId) });
    assert.equal(spoof.statusCode, 400, 'a client-supplied owner is not even a valid parameter');
    const honest = await upload(bob, 'k3');
    assert.equal(h.db.prepare('SELECT user_id FROM visual_assets WHERE id = ?').get(JSON.parse(honest.body).asset.id).user_id, bob.userId);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM visual_assets WHERE user_id = ?').get(alice.userId).n, 1);

    h.db.prepare('UPDATE visual_assets SET alt_text = alt_text WHERE id = ?').run(asset.id);
    const unit = learningUnits.create(h.db, alice.userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-09-01', summaryBody: `x\n\n[[fig:${asset.id}]]` }).unit;
    const blocked = await h.app.inject({ method: 'DELETE', url: `/v1/visual-assets/${asset.id}`, headers: alice.headers });
    assert.equal(blocked.statusCode, 409);
    assert.equal(JSON.parse(blocked.body).error.code, 'ASSET_IN_USE');
    learningUnits.updateFields(h.db, alice.userId, unit.id, { summaryBody: 'sem figura' });
    assert.equal((await h.app.inject({ method: 'DELETE', url: `/v1/visual-assets/${asset.id}`, headers: alice.headers })).statusCode, 204);
  } finally { await h.app.close(); h.cleanup(); }
});

test('HTTP: a PDF crop travels as query text (source, page, rectangle, rotation), is stored with its provenance, repeats without duplicating, and bad or foreign values are refused', async () => {
  const h = await httpApp();
  try {
    const alice = await h.account('a@example.com');
    const bob = await h.account('b@example.com');
    const checksum = 'c'.repeat(64);
    const sourceId = Number(h.db.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, page_count, created_at) VALUES (?, 'f.pdf', 'aula.pdf', 'application/pdf', 10, ?, 'UPLOADED', 3, '2026-01-01T00:00:00Z')").run(alice.userId, checksum).lastInsertRowid);
    const body = multipart(await raster('png'));
    const send = (account, key, extra) => h.app.inject({
      method: 'POST', url: `/v1/visual-assets?${query({ operationKey: key, alt: 'Recorte', kind: 'PDF_CROP', sourceId, pageIndex: 2, x: 0.1, y: 0.2, w: 0.5, h: 0.3, rotation: 90, ...extra })}`,
      payload: body.payload, headers: { ...account.headers, 'content-type': body.contentType },
    });
    const created = await send(alice, 'c1');
    assert.equal(created.statusCode, 201, created.body);
    const { asset } = JSON.parse(created.body);
    assert.equal(asset.kind, 'PDF_CROP');
    assert.deepEqual(asset.source, { sourceId, pageIndex: 2, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 }, rotation: 90, sourceChecksum: checksum });
    assert.equal((await send(alice, 'c1')).statusCode, 200, 'the same operation answers again');
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 1);
    assert.equal((await send(bob, 'c2')).statusCode, 404, 'a source of someone else');
    for (const [name, extra] of Object.entries({ page: { pageIndex: 9 }, rotation: { rotation: 45 }, outside: { x: 0.8 }, noSource: { sourceId: '' }, text: { x: 'abc' } })) {
      assert.equal((await send(alice, `bad-${name}`, extra)).statusCode, 400, name);
    }
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 1);
  } finally { await h.app.close(); h.cleanup(); }
});

test('HTTP: a hostile upload is refused without touching the disk (SVG with an image extension, oversize), and alt is mandatory', async () => {
  const h = await httpApp();
  try {
    const alice = await h.account('a@example.com');
    const send = (body, extra = {}) => h.app.inject({
      method: 'POST', url: `/v1/visual-assets?${query({ operationKey: `k-${Math.random()}`, alt: 'x', ...extra })}`, payload: body.payload,
      headers: { ...alice.headers, 'content-type': body.contentType },
    });
    const svg = multipart(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'evil.png', 'image/png');
    assert.equal((await send(svg)).statusCode, 400);
    const noAlt = await h.app.inject({ method: 'POST', url: `/v1/visual-assets?${query({ operationKey: 'k' })}`, payload: multipart(await raster('png')).payload, headers: { ...alice.headers, 'content-type': multipart(await raster('png')).contentType } });
    assert.equal(noAlt.statusCode, 400);
    const huge = multipart(Buffer.alloc(9 * 1024 * 1024, 1));
    assert.equal((await send(huge)).statusCode, 413);
    assert.deepEqual(filesIn(h.mediaDir), []);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM visual_assets').get().n, 0);
  } finally { await h.app.close(); h.cleanup(); }
});
