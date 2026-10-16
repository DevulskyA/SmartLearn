import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import * as settings from '../src/services/settings.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F10-02a (R-13): the generation knows three independent languages. sourceLanguage is DETECTED from the approved text;
// generationLocale is the student's persisted preference (never inferred from the source or the interface); the content the
// model returns must be in generationLocale. A draft in another language is a contract failure and is not stored.
// No real model is called: providers here are spies that return canned drafts.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

// Long enough for the conservative detector (>= 40 tokens, dominated by function words of one language).
const TEXT = {
  en: 'The kidney is an organ that filters the blood and the urine is formed in the nephrons, which are the functional units of the kidney. The glomerular filtration rate is the volume of plasma that is filtered into the capillaries of the glomerulus per minute and it can be measured with inulin that is neither reabsorbed nor secreted by the tubules.',
  pt: 'O rim é um órgão que filtra o sangue e a urina é formada nos néfrons, que são as unidades funcionais do rim. A taxa de filtração glomerular é o volume de plasma que é filtrado para os capilares do glomérulo por minuto e pode ser medida com a inulina, que não é reabsorvida nem secretada pelos túbulos.',
  es: 'El riñón es un órgano que filtra la sangre y la orina se forma en las nefronas, que son las unidades funcionales del riñón. La tasa de filtración glomerular es el volumen de plasma que se filtra a los capilares del glomérulo por minuto y se puede medir con la inulina, que no es reabsorbida ni secretada por los túbulos.',
};

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-genlang-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

async function unitIn(db, userId, sourcesDir, sourceLang) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf([TEXT[sourceLang]]), originalName: `fonte-${sourceLang}.pdf`, contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  return proposal;
}

// A provider that records what it was asked and answers with canned content in `lang`.
function providerAnswering(lang, { declare = undefined, short = false } = {}) {
  const provider = {
    name: 'FAKE', live: false, calls: [],
    generate: async (input) => {
      provider.calls.push(input);
      const t = short ? 'Texto curto.' : TEXT[lang];
      return {
        summary: t,
        summarySourceSpans: [{ pageIndex: 1 }],
        questions: [{ question: short ? 'Pergunta curta?' : t, answer: short ? 'Resposta curta.' : t, explanation: null, hint: null, sourceSpans: [{ pageIndex: 1 }] }],
        modelVersion: 'spy-v1',
        promptVersion: '5',
        ...(declare !== undefined ? { language: declare } : {}),
      };
    },
  };
  return provider;
}

const countDrafts = (db) => db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n;

test('English source, generationLocale pt-BR: the provider is asked for pt-BR with sourceLanguage en; Portuguese content is stored with both languages and the original citations', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl1@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const providerImpl = providerAnswering('pt');
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(providerImpl.calls.length, 1);
    assert.equal(providerImpl.calls[0].sourceLanguage, 'en');
    assert.equal(providerImpl.calls[0].generationLocale, 'pt-BR');
    assert.equal(draft.sourceLanguage, 'en');
    assert.equal(draft.generationLocale, 'pt-BR');
    assert.equal(draft.languageCheck, 'VERIFIED');
    assert.deepEqual(draft.questions[0].sourceSpans, [{ pageIndex: 1 }], 'evidence still points at the original page');
    assert.ok(draft.pages.some((p) => p.pageIndex === 1), 'the original page text is still reachable from the draft');
  } finally { cleanup(); }
});

test('content in the WRONG language is refused (LANGUAGE_MISMATCH): nothing is stored', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl2@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const providerImpl = providerAnswering('en');
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl }), (e) => e.code === 'LANGUAGE_MISMATCH');
    assert.equal(countDrafts(db), 0, 'a draft in the wrong language is never promoted as valid');
    const es = providerAnswering('es');
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl: es }), (e) => e.code === 'LANGUAGE_MISMATCH');
    assert.equal(countDrafts(db), 0);
  } finally { cleanup(); }
});

test('the target language is the PREFERENCE, never the source language: Spanish source + pt-BR preference asks for pt-BR', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl3@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'es');
    const providerImpl = providerAnswering('pt');
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(providerImpl.calls[0].sourceLanguage, 'es');
    assert.equal(providerImpl.calls[0].generationLocale, 'pt-BR');
    assert.equal(draft.generationLocale, 'pt-BR');
    // an inferrer "target = language of the source" would accept this Spanish echo; the contract must not
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('es'), regenerate: true }), (e) => e.code === 'LANGUAGE_MISMATCH');
  } finally { cleanup(); }
});

test('changing uiLocale does not change what the next generation asks for; an EXPLICIT generationLocale change does, and accepted content stays byte-identical', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl4@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const pt = providerAnswering('pt');
    const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl: pt });
    acceptDraft(db, userId, first.id, { newSubjectName: 'Fisiologia', studyDate: '2026-10-05', expectedRevision: first.revision });
    const acceptedRow = () => JSON.stringify(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(first.id));
    const before = acceptedRow();

    settings.updateLanguage(db, userId, { uiLocale: 'es' });
    await drafts.createDraft(db, userId, proposal.id, { providerImpl: pt, regenerate: true });
    assert.equal(pt.calls[1].generationLocale, 'pt-BR', 'the interface language did not move the content language');

    settings.updateLanguage(db, userId, { generationLocale: 'en' });
    const en = providerAnswering('en');
    const second = await drafts.createDraft(db, userId, proposal.id, { providerImpl: en, regenerate: true });
    assert.equal(en.calls[0].generationLocale, 'en');
    assert.equal(second.generationLocale, 'en');
    assert.equal(acceptedRow(), before, 'the lesson accepted in pt-BR is untouched by the new preference and the new generation');
  } finally { cleanup(); }
});

test('a declared `language` must agree with the target: matching passes, a contradiction is refused', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl5@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const ok = await drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('pt', { declare: 'pt-BR' }) });
    assert.equal(ok.languageCheck, 'VERIFIED');
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('pt', { declare: 'en' }), regenerate: true }), (e) => e.code === 'LANGUAGE_MISMATCH');
    assert.equal(countDrafts(db), 1);
  } finally { cleanup(); }
});

test('content too short to detect is not claimed as verified: it is stored with languageCheck UNVERIFIED (never silently VERIFIED)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl6@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('pt', { short: true }) });
    assert.equal(draft.languageCheck, 'UNVERIFIED');
    const declared = await drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('pt', { short: true, declare: 'pt-BR' }), regenerate: true });
    assert.equal(declared.languageCheck, 'VERIFIED', 'a matching declaration is accepted as the verification when detection cannot decide');
  } finally { cleanup(); }
});

test('a legacy draft (stored before languages were recorded) reads with null languages and no languageCheck claim', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl7@example.com');
    const proposal = await unitIn(db, userId, sourcesDir, 'pt');
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('pt') });
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draft.id);
    const old = JSON.parse(row.draft_json);
    delete old.sourceLanguage; delete old.generationLocale; delete old.languageCheck;
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(old), draft.id);
    const legacy = drafts.getDraft(db, userId, draft.id);
    assert.equal(legacy.sourceLanguage, null);
    assert.equal(legacy.generationLocale, null);
    assert.equal(legacy.languageCheck ?? null, null);
  } finally { cleanup(); }
});

test('HTTP: the first generation initializes the preference from the interface in use (NOT from Accept-Language); LANGUAGE_MISMATCH is a 502 with its code and stores nothing', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const state = { provider: providerAnswering('pt') };
  const providerImpl = { name: 'FAKE', live: false, generate: (input) => state.provider.generate(input) };
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const email = 'gl8@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const post = (headers, payload = {}) => app.inject({ method: 'POST', url: `/v1/proposals/${proposal.id}/drafts`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json', ...headers }, payload });

    const first = await post({ 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' });
    assert.equal(first.statusCode, 201);
    assert.equal(JSON.parse(first.body).draft.generationLocale, 'pt-BR', 'a Spanish browser header does not decide the content language');
    assert.equal(settings.get(db, userId).generationLocale, 'pt-BR');

    state.provider = providerAnswering('en');
    const refused = await post({ 'accept-language': 'en-US' }, { regenerate: true });
    assert.equal(refused.statusCode, 502, 'English content for a pt-BR preference; the later header is ignored');
    assert.equal(JSON.parse(refused.body).error.code, 'LANGUAGE_MISMATCH');
    assert.equal(countDrafts(db), 1);
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('the BUILT-IN deterministic test double cannot write in another language: its draft is stored with languageCheck NOT_APPLICABLE (explicit, not VERIFIED), while a real or injected provider stays enforced', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'gl9@example.com');
    settings.ensureGenerationLocale(db, userId, 'pt-BR');
    const proposal = await unitIn(db, userId, sourcesDir, 'en');
    const draft = await drafts.createDraft(db, userId, proposal.id, {}); // no providerImpl: selectProvider gives the built-in double
    assert.equal(draft.provider, 'FAKE');
    assert.equal(draft.languageCheck, 'NOT_APPLICABLE');
    assert.equal(draft.generationLocale, 'pt-BR');
    assert.equal(draft.sourceLanguage, 'en');
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl: providerAnswering('en'), regenerate: true }), (e) => e.code === 'LANGUAGE_MISMATCH', 'an injected provider named FAKE is still enforced');
  } finally { cleanup(); }
});
