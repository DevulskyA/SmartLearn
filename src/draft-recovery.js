// The local, recoverable copy of what the student typed in a lesson draft and the server does not have yet. It is written at EVERY change (before
// any request), so closing the window, killing the process, losing the connection or a failed save never loses the text; it is erased only when the
// server has it. DOM-free: the storage is passed in (IndexedDB in the app), and every access tolerates a storage that is missing, full or corrupt.
//
// Why IndexedDB and not localStorage: the browser commits localStorage writes to disk in the background, up to several seconds later, so a process killed
// in that window loses the latest keystrokes (seen in the Desktop journey: the copy was gone after a forced kill). An IndexedDB transaction with
// `durability: "strict"` is only complete once the data has reached the disk, which takes milliseconds.
//
// One record per draft: { v: 1, summary?: { text, baseVersion, at }, questions?: { [questionId]: { fields, baseVersion, at } } }
// `baseVersion` is the version of that entity the student was editing, so a later recovery can tell if the server moved on in the meantime.

const PREFIX = 'smartlearn.draft-recovery.v1.';
const DB_NAME = 'smartlearn-recovery';
const STORE = 'drafts';

/** A tiny async key-value storage over IndexedDB whose writes resolve only after the transaction is durable on disk. null when IndexedDB is not available. */
export function createIndexedDbStorage(factory = globalThis.indexedDB) {
  if (!factory) return null;
  let opened = null;
  const open = () => {
    opened ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('recovery database blocked'));
    });
    return opened;
  };
  const run = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = mode === 'readwrite' ? db.transaction(STORE, mode, { durability: 'strict' }) : db.transaction(STORE, mode);
      let result = null;
      work(transaction.objectStore(STORE), (value) => { result = value; });
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('recovery transaction aborted'));
    });
  };
  return {
    getItem: (key) => run('readonly', (store, set) => { const request = store.get(key); request.onsuccess = () => set(request.result ?? null); }),
    setItem: (key, value) => run('readwrite', (store) => { store.put(value, key); }),
    removeItem: (key) => run('readwrite', (store) => { store.delete(key); }),
  };
}

export function createRecoveryStore(storage, draftId, { now = () => Date.now() } = {}) {
  const key = `${PREFIX}${draftId}`;
  let usable = Boolean(storage);
  let record = { v: 1 };
  // what was stored by an earlier session is read first; every change after that is applied IN ORDER on top of it
  const ready = (async () => {
    if (!usable) return;
    try {
      const raw = await storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.v === 1 && typeof parsed === 'object') record = parsed;
    } catch { /* corrupt or unreadable: behave as if there was no copy */ }
  })();
  let writing = ready;
  let outstanding = 0; // changes asked for and not applied yet: a write is skipped while later changes are queued behind it (a burst becomes one write)

  async function persist() {
    if (outstanding > 0 || !usable) return;
    try {
      const empty = !record.summary && Object.keys(record.questions ?? {}).length === 0;
      if (empty) await storage.removeItem(key);
      else await storage.setItem(key, JSON.stringify(record));
    } catch { usable = false; } // quota or a blocked storage: the screen is told (`available`) and keeps working
  }

  /** Applies `change` to the record after everything before it, then writes the latest state. */
  function mutate(change) {
    outstanding += 1;
    writing = writing.then(() => { change(record); outstanding -= 1; }).then(persist);
    return writing;
  }

  return {
    get available() { return usable; },
    /** Resolves when what an earlier session left has been read (and tells whether a copy can be kept at all). */
    ready,
    /** Resolves when every change made so far is durably written. */
    settled: () => writing,
    /** The full text of the summary being edited. */
    writeSummary(text, baseVersion) { return mutate((r) => { r.summary = { text, baseVersion, at: now() }; }); },
    /** The fields typed so far in one question (only the fields that were edited). */
    writeQuestion(questionId, fields, baseVersion) { return mutate((r) => { r.questions = { ...(r.questions ?? {}), [questionId]: { fields: { ...fields }, baseVersion, at: now() } }; }); },
    clearSummary() { return mutate((r) => { delete r.summary; }); },
    clearQuestion(questionId) { return mutate((r) => { if (r.questions) delete r.questions[questionId]; }); },
    clearAll() { return mutate((r) => { delete r.summary; r.questions = {}; }); },
    /** What is stored for this draft: { summary?, questions? } once every change so far has been applied (never throws). */
    async read() { await writing; return { summary: record.summary, questions: record.questions ?? {} }; },
  };
}
