import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import * as sourceStorage from '../server/src/services/source-storage.js';
import { extractSource } from '../server/src/services/source-extraction.js';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { assertLabDatabase, runLab } from '../scripts/prompt-lab/run-generation.mjs';

test('the lab refuses the human datastore, the app-data database and anything outside a SmartLearn-PromptLab directory', () => {
  assert.throws(() => assertLabDatabase(join(homedir(), 'SmartLearn-DevData', 'smartlearn-dev.db')), /PromptLab/);
  assert.throws(() => assertLabDatabase(join(tmpdir(), 'x', 'lab.db')), /PromptLab/);
  assert.throws(() => assertLabDatabase('C:/Users/x/AppData/Roaming/com.devulsky.smartlearn/smartlearn-server/smartlearn.db'), /PromptLab/);
  assert.throws(() => assertLabDatabase(join(homedir(), 'SmartLearn-DevData', 'SmartLearn-PromptLab', 'a.db')), /protected datastore/);
  assert.ok(assertLabDatabase(join(tmpdir(), 'SmartLearn-PromptLab', 'work', 'lab.db')));
});

test('a run caps at 3 without --allow-more and, with the FAKE provider, stores each run outside the repository with measures', async () => {
  const base = mkdtempSync(join(tmpdir(), 'plab-'));
  const dir = join(base, 'SmartLearn-PromptLab', 'work');
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'lab.db');
  const db = openDb(dbPath);
  runMigrations(db);
  const now = new Date().toISOString();
  const userId = db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('dev@smartlearn.local','dev@smartlearn.local','h','s','scrypt','{}',?,?)").run(now, now).lastInsertRowid;
  const sourcesDir = join(base, 'sources');
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtração glomerular: a pressão hidrostática capilar vale 45 mm Hg.', 'A inulina é livremente filtrada e o clearance mede a TFG.']), originalName: 'Livro Teste.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
  await extractSource(db, userId, source.id, { sourcesDir });
  db.prepare("INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index, detected) VALUES (?,?,0,1,'Filtração glomerular',1,0)").run(userId, source.id);
  db.close();
  try {
    await assert.rejects(() => runLab({ dbPath, sourceName: 'Livro', section: 'Filtração glomerular', runs: 4, outDir: join(base, 'out'), provider: 'FAKE' }), /more than 3/);
    const results = await runLab({ dbPath, sourceName: 'Livro', section: 'Filtração glomerular', runs: 2, outDir: join(base, 'out'), provider: 'FAKE', terms: ['PAH'] });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.ok && r.draft.questions.length > 0 && r.summary.questions === r.draft.questions.length));
    assert.ok(existsSync(join(base, 'out', 'run-1.json')) && existsSync(join(base, 'out', 'index.json')));
    assert.equal(JSON.parse(readFileSync(join(base, 'out', 'index.json'), 'utf8')).runs.length, 2);
  } finally { rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
