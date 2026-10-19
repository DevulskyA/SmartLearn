// The logical (textual) export carries no binaries. A summary that points at a figure must NOT be exported as a token that would restore as a
// missing image: the reference becomes an explicit sentence and the file says what it leaves out. Older exports keep restoring unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { createLogicalExport } from '../src/backup.js';
import * as assets from '../src/services/visual-assets.js';
import * as learningUnits from '../src/services/learning-units.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sl-export-media-'));
  const db = openDb(join(root, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir: join(root, 'sources') }, media: { mediaDir: join(root, 'media') } });
  const post = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers: { origin: ORIGIN, ...headers } });
  async function account(email) {
    await post('/v1/auth/register', { email, password: PASSWORD });
    const login = await post('/v1/auth/login', { email, password: PASSWORD });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
    return { cookie, headers: { cookie, 'x-csrf-token': me.csrfToken }, userId: me.user.id };
  }
  return { root, db, app, post, account, mediaDir: join(root, 'media'), cleanup: async () => { await app.close(); db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('export: each figure reference becomes a plain sentence, the file carries a notice, and no token that restores as a missing image is left', async () => {
  const s = await setup();
  try {
    const a = await s.account('a@example.com');
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#123456' } }).png().toBuffer();
    const { asset } = await assets.create(s.db, a.userId, { buffer: png, alt: 'Esquema da barreira', caption: 'Figura 1. Barreira', operationKey: 'k1' }, { mediaDir: s.mediaDir });
    const body = `Antes.\n\n[[fig:${asset.id}]]\n\nDepois.\n\n\`\`\`\n[[fig:${asset.id}]]\n\`\`\``;
    learningUnits.create(s.db, a.userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-09-01', summaryBody: body });
    const stored = s.db.prepare('SELECT summary_body FROM learning_units').get().summary_body;

    const exported = createLogicalExport(s.db, a.userId);
    const exportedBody = exported.learningUnits[0].summary_body;
    assert.ok(exportedBody.includes('[Figura não incluída nesta exportação: Figura 1. Barreira]'));
    assert.ok(!exportedBody.split('```')[0].includes('[[fig:'), 'no restorable token outside code');
    assert.ok(exportedBody.includes('Antes.') && exportedBody.includes('Depois.'));
    assert.equal(exported.notices.length, 1);
    assert.equal(exported.notices[0].code, 'MEDIA_NOT_INCLUDED');
    assert.equal(exported.notices[0].figures, 1);
    assert.equal(s.db.prepare('SELECT summary_body FROM learning_units').get().summary_body, stored, 'exporting never changes the stored lesson');
    assert.ok(!JSON.stringify(exported).includes(png.toString('base64').slice(0, 40)), 'no image bytes in the file');
  } finally { await s.cleanup(); }
});

test('an export with no figures is exactly what it was before (no notices key); an unknown figure reference is still not left as a token', async () => {
  const s = await setup();
  try {
    const a = await s.account('a@example.com');
    learningUnits.create(s.db, a.userId, { newSubjectName: 'Anatomia', title: 'Ossos', studyDate: '2026-09-01', summaryBody: 'texto simples \\(x^2\\) e R$ 5' });
    const exported = createLogicalExport(s.db, a.userId);
    assert.equal('notices' in exported, false);
    assert.equal(exported.learningUnits[0].summary_body, 'texto simples \\(x^2\\) e R$ 5');
    s.db.prepare('UPDATE learning_units SET summary_body = ?').run('x\n\n[[fig:00000000-0000-4000-8000-000000000000]]\n\ny');
    const dangling = createLogicalExport(s.db, a.userId);
    assert.ok(dangling.learningUnits[0].summary_body.includes('indisponível'));
    assert.equal(dangling.notices[0].figures, 1);
  } finally { await s.cleanup(); }
});

test('restoring such an export into a new account works, shows the limitation as a warning, and the lesson keeps its explicit sentence', async () => {
  const s = await setup();
  try {
    const a = await s.account('a@example.com');
    const b = await s.account('b@example.com');
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#654321' } }).png().toBuffer();
    const { asset } = await assets.create(s.db, a.userId, { buffer: png, alt: 'Esquema', operationKey: 'k1' }, { mediaDir: s.mediaDir });
    learningUnits.create(s.db, a.userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-09-01', summaryBody: `Texto\n\n[[fig:${asset.id}]]` });
    const exported = JSON.parse((await s.app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: a.cookie } })).body);

    const preview = await s.post('/v1/imports/preview', { rawSource: exported }, b.headers);
    assert.equal(preview.statusCode, 200, preview.body);
    const parsed = JSON.parse(preview.body).preview;
    assert.ok(parsed.warnings.some((w) => w.code === 'MEDIA_NOT_INCLUDED'), 'the limitation is announced before the student confirms');
    const commit = await s.post(`/v1/imports/${parsed.id}/commit`, {}, b.headers);
    assert.equal(commit.statusCode, 200, commit.body);
    const restored = s.db.prepare('SELECT summary_body FROM learning_units WHERE user_id = ?').get(b.userId).summary_body;
    assert.ok(restored.includes('[Figura não incluída nesta exportação: Esquema]'));
    assert.ok(!restored.includes('[[fig:'));
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM visual_assets WHERE user_id = ?').get(b.userId).n, 0);
  } finally { await s.cleanup(); }
});
