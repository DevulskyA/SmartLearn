import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// BIBLIOGRAPHY end to end over HTTP on a DISPOSABLE database and real (generated) PDFs: upload -> extract -> metadata persisted ->
// student correction -> re-extraction keeps the correction -> database reopened (an app restart) -> still there. No AI, no network.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';

function multipart(boundary, { filename, buffer }) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

async function session(app, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  const csrf = JSON.parse(me.body).csrfToken;
  const headers = { origin: ORIGIN, cookie, 'x-csrf-token': csrf };
  const json = (res) => JSON.parse(res.body);
  return {
    upload: async (filename, buffer) => json(await app.inject({ method: 'POST', url: '/v1/sources', headers: { ...headers, 'content-type': 'multipart/form-data; boundary=bnd4242' }, payload: multipart('bnd4242', { filename, buffer }) })).source,
    extract: (id) => app.inject({ method: 'POST', url: `/v1/sources/${id}/extract`, headers }),
    get: async (id) => json(await app.inject({ method: 'GET', url: `/v1/sources/${id}`, headers })).source,
    list: async () => json(await app.inject({ method: 'GET', url: '/v1/sources', headers })).sources,
    patch: (id, payload) => app.inject({ method: 'PATCH', url: `/v1/sources/${id}/bibliography`, headers, payload }),
  };
}

async function withApp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bibliography-'));
  const dbPath = join(dir, 'test.db');
  const sourcesDir = join(dir, 'sources');
  const opened = [];
  const open = async () => {
    const db = openDb(dbPath);
    runMigrations(db, MIGRATIONS_DIR);
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 } });
    const ctx = { db, app, closed: false, close: async () => { if (ctx.closed) return; ctx.closed = true; await app.close(); db.close(); } };
    opened.push(ctx);
    return ctx;
  };
  try { await fn({ open, dbPath }); } finally { for (const c of opened) await c.close().catch(() => {}); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

const COPYRIGHT_PAGE = 'Costanzo Physiology. Fifth Edition. Copyright 2012 by Elsevier. ISBN 978-0-306-40615-7';
const BOOK_5TH = () => buildFixturePdf([COPYRIGHT_PAGE, 'Capitulo 1 filtracao glomerular'], { info: { title: 'Physiology', author: 'Linda Costanzo', language: 'en-US' } });
const BOOK_7TH = () => buildFixturePdf(['Costanzo Physiology. Seventh Edition. Copyright 2018 by Elsevier. ISBN 978-0-323-79339-1', 'Capitulo 1 filtracao glomerular'], { info: { title: 'Physiology', author: 'Linda Costanzo', language: 'en-US' } });

test('a PDF is registered with its bibliography, which survives an app restart; the student corrects it and a re-extraction never undoes the correction', async () => {
  await withApp(async ({ open }) => {
    let ctx = await open();
    let s = await session(ctx.app, 'bib-a@example.com');
    const uploaded = await s.upload('costanzo.pdf', BOOK_5TH());
    assert.equal((await s.extract(uploaded.id)).statusCode, 200);

    const first = (await s.get(uploaded.id)).bibliography;
    assert.deepEqual({ ...first, origins: undefined }, { title: 'Physiology', authors: 'Linda Costanzo', edition: '5', year: 2012, language: 'en', isbn: '9780306406157', origins: undefined });
    assert.deepEqual(first.origins, { title: 'PDF_METADATA', authors: 'PDF_METADATA', isbn: 'TEXT', edition: 'TEXT', year: 'TEXT', language: 'PDF_METADATA' });
    assert.ok((await s.list()).find((x) => x.id === uploaded.id).bibliography.isbn, 'the list carries it too');

    const patched = await s.patch(uploaded.id, { title: 'Costanzo - Fisiologia', year: 2013, authors: null });
    assert.equal(patched.statusCode, 200);
    const corrected = JSON.parse(patched.body).bibliography;
    assert.equal(corrected.title, 'Costanzo - Fisiologia');
    assert.equal(corrected.year, 2013);
    assert.equal(corrected.authors, null, 'cleared on purpose');
    assert.deepEqual([corrected.origins.title, corrected.origins.year, corrected.origins.authors, corrected.origins.isbn], ['USER', 'USER', 'USER', 'TEXT']);

    // re-extraction recomputes what the student did not touch and leaves what they did
    assert.equal((await s.extract(uploaded.id)).statusCode, 200);
    const afterReextract = (await s.get(uploaded.id)).bibliography;
    assert.equal(afterReextract.title, 'Costanzo - Fisiologia');
    assert.equal(afterReextract.year, 2013);
    assert.equal(afterReextract.authors, null);
    assert.equal(afterReextract.isbn, '9780306406157');

    // restart: close everything, reopen the same database file
    await ctx.close();
    ctx = await open();
    s = await session(ctx.app, 'bib-a@example.com');
    const reopened = (await s.get(uploaded.id)).bibliography;
    assert.deepEqual(reopened, afterReextract, 'identical after a restart');
    await ctx.close();
  });
});

test('two editions of the same title are two sources with their own ISBN, edition and year; checksum, pages and status are untouched by the metadata', async () => {
  await withApp(async ({ open }) => {
    const ctx = await open();
    const s = await session(ctx.app, 'bib-b@example.com');
    const a = await s.upload('Costanzo.pdf', BOOK_5TH());
    const b = await s.upload('Costanzo.pdf', BOOK_7TH());
    await s.extract(a.id);
    await s.extract(b.id);
    const [sa, sb] = [await s.get(a.id), await s.get(b.id)];
    assert.notEqual(a.id, b.id);
    assert.notEqual(sa.checksum, sb.checksum);
    assert.equal(sa.bibliography.title, sb.bibliography.title);
    assert.deepEqual([sa.bibliography.edition, sa.bibliography.year, sa.bibliography.isbn], ['5', 2012, '9780306406157']);
    assert.deepEqual([sb.bibliography.edition, sb.bibliography.year, sb.bibliography.isbn], ['7', 2018, '9780323793391']);
    assert.equal(sa.extractionStatus, 'EXTRACTED');
    assert.equal(sa.pageCount, 2);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM source_pages WHERE source_id = ?').get(a.id).n, 2);
    await ctx.close();
  });
});

test('missing or uncertain metadata never blocks study: a bare PDF is extracted, its fields stay empty or come from the file name, nothing is invented', async () => {
  await withApp(async ({ open }) => {
    const ctx = await open();
    const s = await session(ctx.app, 'bib-c@example.com');
    const bare = await s.upload('apostila renal 2021.pdf', buildFixturePdf(['Pagina sem nenhuma informacao bibliografica']));
    const res = await s.extract(bare.id);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).extraction.status, 'EXTRACTED');
    const bib = (await s.get(bare.id)).bibliography;
    assert.deepEqual({ ...bib, origins: undefined }, { title: 'apostila renal 2021', authors: null, edition: null, year: 2021, language: null, isbn: null, origins: undefined });
    assert.deepEqual(bib.origins, { title: 'FILE_NAME', year: 'FILE_NAME' });

    // junk metadata (word-processor default title, placeholder author) is not taken as truth
    const junk = await s.upload('x.pdf', buildFixturePdf(['conteudo'], { info: { title: 'Microsoft Word - cap3.docx', author: 'admin' } }));
    await s.extract(junk.id);
    const junkBib = (await s.get(junk.id)).bibliography;
    assert.equal(junkBib.authors, null);
    assert.equal(junkBib.origins.title, 'FILE_NAME');

    // a source that was never extracted has an all-empty bibliography and works as before
    const raw = await s.upload('nao-extraido.pdf', buildFixturePdf(['x', 'y']));
    assert.deepEqual((await s.get(raw.id)).bibliography, { title: null, authors: null, edition: null, year: null, language: null, isbn: null, origins: {} });
    await ctx.close();
  });
});

test('the correction is validated and isolated: a wrong ISBN digit, a silly year or an unknown field is 400 and changes nothing; another account sees 404', async () => {
  await withApp(async ({ open }) => {
    const ctx = await open();
    const owner = await session(ctx.app, 'bib-d@example.com');
    const other = await session(ctx.app, 'bib-e@example.com');
    const src = await owner.upload('livro.pdf', BOOK_5TH());
    await owner.extract(src.id);
    const before = (await owner.get(src.id)).bibliography;

    for (const bad of [{ isbn: '9780306406158' }, { isbn: 'abc' }, { year: 1200 }, { year: 3000 }, { year: 20.5 }, { edition: 'x'.repeat(41) }, { title: 'y'.repeat(301) }, {}, { color: 'blue' }]) {
      const res = await owner.patch(src.id, bad);
      assert.equal(res.statusCode, 400, JSON.stringify(bad));
    }
    assert.deepEqual((await owner.get(src.id)).bibliography, before, 'nothing changed');

    const ok = await owner.patch(src.id, { isbn: '0-306-40615-2' });
    assert.equal(JSON.parse(ok.body).bibliography.isbn, '9780306406157', 'ISBN-10 is stored as ISBN-13');

    assert.equal((await other.patch(src.id, { title: 'invadido' })).statusCode, 404);
    assert.equal((await owner.get(src.id)).bibliography.title, 'Physiology');
    await ctx.close();
  });
});

test('migration 044 is purely additive: nothing but the eight bibliography columns is added to sources, and a row from before it keeps working', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bibliography-mig-'));
  try {
    const db = openDb(join(dir, 'test.db'));
    // apply everything up to 043 by running all migrations into a copy of the directory without 044
    const { cpSync, readdirSync, readFileSync, writeFileSync } = await import('node:fs');
    const upTo43 = join(dir, 'migrations');
    cpSync(MIGRATIONS_DIR, upTo43, { recursive: true });
    for (const f of readdirSync(upTo43)) if (f.startsWith('044-')) rmSync(join(upTo43, f));
    const manifest = JSON.parse(readFileSync(join(upTo43, 'manifest.json'), 'utf8')).filter((e) => e.version <= 43);
    writeFileSync(join(upTo43, 'manifest.json'), JSON.stringify(manifest));
    runMigrations(db, upTo43);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('m@example.com','m@example.com','h','s','scrypt','{}',?,?)").run(now, now);
    db.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, created_at) VALUES (1,'f','antigo.pdf','application/pdf',10,'abc',?)").run(now);
    const columnsBefore = db.prepare("PRAGMA table_info('sources')").all().map((c) => c.name);
    const rowBefore = db.prepare('SELECT * FROM sources WHERE id = 1').get();

    runMigrations(db, MIGRATIONS_DIR);
    const columnsAfter = db.prepare("PRAGMA table_info('sources')").all().map((c) => c.name);
    assert.deepEqual(columnsAfter.filter((c) => !columnsBefore.includes(c)), ['bib_title', 'bib_authors', 'bib_edition', 'bib_year', 'bib_language', 'bib_isbn', 'bib_origins', 'bib_updated_at']);
    const rowAfter = db.prepare('SELECT * FROM sources WHERE id = 1').get();
    for (const column of columnsBefore) assert.equal(rowAfter[column], rowBefore[column], `${column} unchanged`);
    for (const column of columnsAfter.filter((c) => !columnsBefore.includes(c))) assert.equal(rowAfter[column], null);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('a scanned (image-only) book still gets the title, authors and language its PDF declares; it is never left without a name because it has no text', async () => {
  await withApp(async ({ open }) => {
    const ctx = await open();
    const s = await session(ctx.app, 'bib-scan@example.com');
    const scanned = buildFixturePdf(['p1', 'p2'], { emptyPages: [1, 2], info: { title: 'Fisiologia Medica', author: 'Guyton', language: 'pt-BR' } });
    const uploaded = await s.upload('Guyton 2021.pdf', scanned);
    const res = await s.extract(uploaded.id);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).extraction.status, 'IMAGE_ONLY_OR_UNREADABLE');
    const bib = (await s.get(uploaded.id)).bibliography;
    assert.deepEqual([bib.title, bib.authors, bib.language, bib.year, bib.isbn], ['Fisiologia Medica', 'Guyton', 'pt', 2021, null]);
    assert.equal(bib.origins.year, 'FILE_NAME');
  });
});
