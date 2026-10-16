// QUESTION CORPUS: a DERIVED, REGENERABLE index over raw files. The raw files (JSONL or JSON, anywhere under the corpus root) stay the
// source; the index is rebuilt from them on every open and holds nothing that cannot be rebuilt. Metadata filters plus SQLite
// full-text search (FTS5, already in the SQLite this project ships): no vector database.
//
// The root is configuration (SMARTLEARN_QUESTION_CORPUS_ROOT), never a hard-coded path. With no root, an empty folder or no valid item
// the corpus is CORPUS_EMPTY and the rest of the system carries on: nothing here claims that a corpus exists.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { normalizeItem } from './item.js';

const FILE_PATTERN = /\.(jsonl|json)$/i;

function listFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries.sort()) {
    if (name.startsWith('.')) continue; // an index or a scratch folder is never raw material
    const path = join(dir, name);
    let stat;
    try { stat = statSync(path); } catch { continue; }
    if (stat.isDirectory()) listFiles(path, out);
    else if (FILE_PATTERN.test(name)) out.push(path);
  }
  return out;
}

function recordsOf(path) {
  const text = readFileSync(path, 'utf8');
  if (/\.jsonl$/i.test(path)) {
    return text.split(/\r?\n/).map((line, i) => ({ line: i + 1, text: line })).filter((l) => l.text.trim().length > 0).map((l) => {
      try { return { line: l.line, raw: JSON.parse(l.text) }; } catch { return { line: l.line, error: 'invalid JSON' }; }
    });
  }
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [parsed]);
    return list.map((raw, i) => ({ line: i + 1, raw }));
  } catch { return [{ line: 1, error: 'invalid JSON' }]; }
}

/** Every valid item under the root, and every record that was refused (with the file, the line and why). */
export function loadCorpusFiles(root) {
  const items = [];
  const rejected = [];
  const seen = new Set();
  for (const path of root ? listFiles(root) : []) {
    for (const rec of recordsOf(path)) {
      if (rec.error) { rejected.push({ file: path, line: rec.line, error: rec.error }); continue; }
      const result = normalizeItem(rec.raw, { sourceFile: path.slice(root.length).replace(/^[\\/]+/, '') });
      if (!result.ok) { rejected.push({ file: path, line: rec.line, error: result.error }); continue; }
      if (seen.has(result.item.id)) { rejected.push({ file: path, line: rec.line, error: `duplicate id ${result.item.id}` }); continue; }
      seen.add(result.item.id);
      items.push(result.item);
    }
  }
  return { items, rejected };
}

const ftsQuery = (text) => {
  const tokens = String(text ?? '').match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return tokens.length === 0 ? null : tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
};
const same = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * @param root configuration, or null/undefined for "no corpus"
 * @returns {{ status, size, rejected, search(filters), get(id) }}
 */
export function openCorpus({ root = null, items: given = null } = {}) {
  const loaded = given ? { items: given, rejected: [] } : loadCorpusFiles(root);
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE items (rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, json TEXT NOT NULL, topic TEXT, competency TEXT, item_type TEXT, exam TEXT, year INTEGER);
    CREATE VIRTUAL TABLE fts USING fts5(stem, topic, competency, explanation, tokenize = 'unicode61 remove_diacritics 2');
  `);
  const insert = db.prepare('INSERT INTO items (id, json, topic, competency, item_type, exam, year) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO fts (rowid, stem, topic, competency, explanation) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const item of loaded.items) {
      const r = insert.run(item.id, JSON.stringify(item), item.topic, item.competency, item.item_type, item.exam, item.year);
      insertFts.run(r.lastInsertRowid, item.stem, item.topic ?? '', item.competency ?? '', item.explanation ?? '');
    }
  })();

  const byId = new Map(loaded.items.map((item) => [item.id, item]));
  return {
    status: loaded.items.length === 0 ? 'CORPUS_EMPTY' : 'READY',
    size: loaded.items.length,
    rejected: loaded.rejected,
    get: (id) => byId.get(id) ?? null,
    /**
     * Ranked candidates. `query` is free text matched against stem, topic, competency and explanation; the other filters are exact
     * (case-insensitive). `exact` says the item answers the need on every dimension the need names (competency, topic, item type).
     */
    search({ query = null, topic = null, competency = null, itemType = null, exam = null, year = null, excludeIds = [], limit = 10 } = {}) {
      const match = ftsQuery(query ?? [topic, competency].filter(Boolean).join(' '));
      const rows = match
        ? db.prepare('SELECT items.json AS json, bm25(fts) AS rank FROM fts JOIN items ON items.rowid = fts.rowid WHERE fts MATCH ? ORDER BY rank LIMIT 200').all(match)
        : db.prepare('SELECT json, 0 AS rank FROM items LIMIT 200').all();
      const excluded = new Set(excludeIds);
      const out = [];
      for (const row of rows) {
        const item = JSON.parse(row.json);
        if (excluded.has(item.id) || item.status !== 'ACTIVE') continue;
        if (exam && !same(item.exam, exam)) continue;
        if (year && item.year !== year) continue;
        const exact = (competency ? same(item.competency, competency) : true) && (topic ? same(item.topic, topic) : true) && (itemType ? same(item.item_type, itemType) : true) && Boolean(competency || topic);
        out.push({ item, exact, score: Number((-row.rank).toFixed(6)) });
      }
      out.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
      return out.slice(0, limit);
    },
  };
}
