import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as settings from '../src/services/settings.js';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, resolveSupportedLocale, localeFromHint } from '../../shared/locales.js';

// T-F10-01 (R-13): `uiLocale` (interface) and `generationLocale` (language of the pedagogical content) are independent
// preferences. generationLocale is initialized ONCE from the best hint, never changes by itself afterwards, and moves only
// by an explicit action of the student. Reading never writes.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-langprefs-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

const rows = (db) => db.prepare('SELECT COUNT(*) AS n FROM user_settings').get().n;

test('the supported locales are an extensible list that starts with pt-BR, es and en', () => {
  assert.deepEqual([...SUPPORTED_LOCALES].sort(), ['en', 'es', 'pt-BR']);
  assert.equal(DEFAULT_LOCALE, 'pt-BR');
  assert.equal(resolveSupportedLocale('pt-br'), 'pt-BR', 'case is normalized');
  assert.equal(resolveSupportedLocale('es'), 'es');
  assert.equal(resolveSupportedLocale('fr'), null);
  assert.equal(resolveSupportedLocale('es-MX'), null, 'an explicit choice must be an exact supported code');
  assert.equal(resolveSupportedLocale(undefined), null);
});

test('hints (system locale) map to a supported locale by language; anything else falls back to the default', () => {
  assert.equal(localeFromHint('es-MX'), 'es');
  assert.equal(localeFromHint('en-US'), 'en');
  assert.equal(localeFromHint('pt'), 'pt-BR');
  assert.equal(localeFromHint('pt-BR'), 'pt-BR');
  assert.equal(localeFromHint('fr-FR'), null);
  assert.equal(localeFromHint(''), null);
  assert.equal(localeFromHint(null), null);
});

test('a user who never touched settings: nothing persisted, effective defaults are pt-BR, and READING WRITES NOTHING', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp1@example.com');
    const s = settings.get(db, userId);
    assert.equal(s.uiLocale, null);
    assert.equal(s.generationLocale, null);
    assert.equal(s.effectiveUiLocale, 'pt-BR');
    assert.equal(s.effectiveGenerationLocale, 'pt-BR');
    settings.get(db, userId);
    assert.equal(rows(db), 0, 'GET never fabricates a row');
  } finally { cleanup(); }
});

test('changing uiLocale does NOT change generationLocale (persisted pt-BR stays pt-BR when the interface goes to Spanish)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp2@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const after = settings.updateLanguage(db, userId, { uiLocale: 'es' });
    assert.equal(after.uiLocale, 'es');
    assert.equal(after.effectiveUiLocale, 'es');
    assert.equal(after.generationLocale, 'pt-BR');
    assert.equal(after.effectiveGenerationLocale, 'pt-BR');
    const back = settings.updateLanguage(db, userId, { uiLocale: 'en' });
    assert.equal(back.generationLocale, 'pt-BR');
  } finally { cleanup(); }
});

test('generationLocale is initialized ONCE: the first ensure persists the hint, later hints (system region, UI language) are ignored', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp3@example.com');
    assert.equal(settings.ensureGenerationLocale(db, userId, 'es-MX'), 'es');
    assert.equal(settings.get(db, userId).generationLocale, 'es');
    assert.equal(settings.ensureGenerationLocale(db, userId, 'en-US'), 'es', 'a different hint later changes nothing');
    settings.updateLanguage(db, userId, { uiLocale: 'en' });
    assert.equal(settings.ensureGenerationLocale(db, userId, 'en'), 'es', 'neither does the interface language');
    assert.equal(settings.get(db, userId).generationLocale, 'es');
  } finally { cleanup(); }
});

test('the first ensure without a usable hint falls back to the persisted uiLocale, then to pt-BR', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = makeUser(db, 'lp4a@example.com');
    settings.updateLanguage(db, a, { uiLocale: 'es' });
    assert.equal(settings.ensureGenerationLocale(db, a, undefined), 'es');
    const b = makeUser(db, 'lp4b@example.com');
    assert.equal(settings.ensureGenerationLocale(db, b, 'fr-FR'), 'pt-BR');
  } finally { cleanup(); }
});

test('an explicit change of generationLocale works, normalizes case, and an unsupported locale is refused without changing anything', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp5@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const changed = settings.updateLanguage(db, userId, { generationLocale: 'EN' });
    assert.equal(changed.generationLocale, 'en');
    for (const bad of [{ generationLocale: 'fr' }, { uiLocale: 'de' }, { generationLocale: 'es-MX' }, { generationLocale: '' }, { generationLocale: 7 }]) {
      assert.throws(() => settings.updateLanguage(db, userId, bad), (e) => e.code === 'VALIDATION_FAILED', JSON.stringify(bad));
    }
    assert.equal(settings.get(db, userId).generationLocale, 'en');
    assert.throws(() => settings.updateLanguage(db, userId, {}), (e) => e.code === 'VALIDATION_FAILED', 'nothing to update');
  } finally { cleanup(); }
});

test('language preferences and the timezone are independent of each other and of the fixed review schedule', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp6@example.com');
    const tz = settings.updateTimezone(db, userId, 'America/Sao_Paulo');
    const lang = settings.updateLanguage(db, userId, { uiLocale: 'es', generationLocale: 'en' });
    assert.equal(lang.timezone, tz.timezone);
    assert.deepEqual(lang.reviewSchedule, tz.reviewSchedule);
    const tz2 = settings.updateTimezone(db, userId, 'America/New_York');
    assert.equal(tz2.uiLocale, 'es');
    assert.equal(tz2.generationLocale, 'en');
  } finally { cleanup(); }
});

test('an existing settings row from before this change reads with null locales and stays valid', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lp7@example.com');
    db.prepare('INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'America/Sao_Paulo', '[1,3,7]', new Date().toISOString());
    const s = settings.get(db, userId);
    assert.equal(s.uiLocale, null);
    assert.equal(s.generationLocale, null);
    assert.equal(s.timezone, 'America/Sao_Paulo');
  } finally { cleanup(); }
});

test('HTTP: GET /v1/settings exposes both preferences; PATCH changes them separately; invalid values are 400', async () => {
  const { dir, db } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: join(dir, 'sources'), maxBytes: 1024 * 1024, quotaBytes: 4 * 1024 * 1024 } });
  try {
    const email = 'lp8@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const patch = (payload) => app.inject({ method: 'PATCH', url: '/v1/settings', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload });

    const initial = JSON.parse((await app.inject({ method: 'GET', url: '/v1/settings', headers: { cookie } })).body).settings;
    assert.equal(initial.effectiveUiLocale, 'pt-BR');
    assert.equal(initial.generationLocale, null);

    const ui = JSON.parse((await patch({ uiLocale: 'es' })).body).settings;
    assert.equal(ui.uiLocale, 'es');
    assert.equal(ui.generationLocale, null, 'the interface language did not initialize or move the content language');
    const gen = JSON.parse((await patch({ generationLocale: 'en' })).body).settings;
    assert.equal(gen.generationLocale, 'en');
    assert.equal(gen.uiLocale, 'es');
    assert.equal((await patch({ generationLocale: 'fr' })).statusCode, 400);
    assert.equal((await patch({})).statusCode, 400);
    assert.equal(JSON.parse((await patch({ timezone: 'America/Sao_Paulo' })).body).settings.generationLocale, 'en');
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('migration 031 is additive: a database at schema 30 with an existing settings row upgrades with the row intact and both locales NULL; the manifest checksum matches the file', async () => {
  const { mkdtempSync: mk, readdirSync, copyFileSync, readFileSync } = await import('node:fs');
  const { canonicalChecksum } = await import('../src/migrations.js');
  const dir = mk(join(tmpdir(), 'sl-mig031-'));
  const v30 = join(dir, 'v30');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(v30);
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql') && parseInt(n, 10) <= 30)) copyFileSync(join(MIGRATIONS_DIR, f), join(v30, f));
  const db = openDb(join(dir, 'old.db'));
  try {
    runMigrations(db, v30);
    const userId = makeUser(db, 'mig031@example.com');
    db.prepare('INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'America/Sao_Paulo', '[1,3,7]', '2026-01-01T00:00:00.000Z');
    runMigrations(db, MIGRATIONS_DIR);
    runMigrations(db, MIGRATIONS_DIR); // idempotent
    const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    assert.equal(row.timezone, 'America/Sao_Paulo');
    assert.equal(row.review_schedule, '[1,3,7]');
    assert.equal(row.updated_at, '2026-01-01T00:00:00.000Z');
    assert.equal(row.ui_locale, null);
    assert.equal(row.generation_locale, null);
    const manifest = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'manifest.json'), 'utf8')).find((m) => m.version === 31);
    const sql = readFileSync(join(MIGRATIONS_DIR, '031-language-preferences.sql'), 'utf8');
    assert.equal(manifest.checksum, canonicalChecksum(sql));
    assert.equal(db.prepare('SELECT checksum FROM schema_migrations WHERE version = 31').get().checksum, manifest.checksum);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('both preferences survive closing and reopening the database file (restart)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-langrestart-'));
  const path = join(dir, 'test.db');
  let db = openDb(path);
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const userId = makeUser(db, 'restart@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    settings.updateLanguage(db, userId, { uiLocale: 'es' });
    db.close();
    db = openDb(path);
    const s = settings.get(db, userId);
    assert.equal(s.uiLocale, 'es');
    assert.equal(s.generationLocale, 'pt-BR');
    assert.equal(settings.ensureGenerationLocale(db, userId, 'en'), 'pt-BR');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('importing, extracting and structuring a document never writes the preferences (a Spanish source does not move a pt-BR content language)', async () => {
  const { dir, db, cleanup } = tmpDb();
  try {
    const { acceptUpload } = await import('../src/services/source-storage.js');
    const { extractSource } = await import('../src/services/source-extraction.js');
    const proposals = await import('../src/services/content-proposals.js');
    const { buildFixturePdf } = await import('./pdf-fixtures/build-fixture-pdf.js');
    const userId = makeUser(db, 'lp-import@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const before = JSON.stringify(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId));
    const sourcesDir = join(dir, 'sources');
    const source = acceptUpload(db, userId, { buffer: buildFixturePdf(['el rinon filtra la sangre y la orina se forma en las nefronas de los tubulos']), originalName: 'fisiologia-es.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
    await extractSource(db, userId, source.id, { sourcesDir });
    proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId)), before);
    assert.equal(settings.get(db, userId).generationLocale, 'pt-BR');
  } finally { cleanup(); }
});
