// The local, recoverable copy of what the student typed in a lesson draft and the server does not have yet. It is written at EVERY change (before
// any request), so closing the window, losing the connection or a failed save never loses the text; it is erased only when the server has it.
// DOM-free: the storage is passed in (the browser's localStorage in the app), and every access tolerates a storage that is missing, full or corrupt.
//
// One record per draft: { v: 1, summary?: { text, baseVersion, at }, questions?: { [questionId]: { fields, baseVersion, at } } }
// `baseVersion` is the version of that entity the student was editing, so a later recovery can tell if the server moved on in the meantime.

const PREFIX = 'smartlearn.draft-recovery.v1.';

export function createRecoveryStore(storage, draftId, { now = () => Date.now() } = {}) {
  const key = `${PREFIX}${draftId}`;
  let usable = Boolean(storage);

  function read() {
    if (!usable) return { v: 1 };
    try {
      const raw = storage.getItem(key);
      if (!raw) return { v: 1 };
      const parsed = JSON.parse(raw);
      return parsed && parsed.v === 1 && typeof parsed === 'object' ? parsed : { v: 1 };
    } catch { return { v: 1 }; } // corrupt or unreadable: behave as if there was no copy
  }
  function write(record) {
    if (!usable) return false;
    try {
      const empty = !record.summary && Object.keys(record.questions ?? {}).length === 0;
      if (empty) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(record));
      return true;
    } catch { usable = false; return false; } // quota or a blocked storage: the screen is told (`available`) and keeps working
  }

  return {
    get available() { return usable; },
    /** The full text of the summary being edited. */
    writeSummary(text, baseVersion) {
      const record = read();
      record.summary = { text, baseVersion, at: now() };
      return write(record);
    },
    /** The fields typed so far in one question (only the fields that were edited). */
    writeQuestion(questionId, fields, baseVersion) {
      const record = read();
      record.questions = { ...(record.questions ?? {}), [questionId]: { fields: { ...fields }, baseVersion, at: now() } };
      return write(record);
    },
    clearSummary() { const record = read(); delete record.summary; return write(record); },
    clearQuestion(questionId) {
      const record = read();
      if (record.questions) delete record.questions[questionId];
      return write(record);
    },
    clearAll() { return write({ v: 1 }); },
    /** What is stored for this draft: { summary?, questions? } (never throws). */
    read() { const { summary, questions } = read(); return { summary, questions: questions ?? {} }; },
  };
}
