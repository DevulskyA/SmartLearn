// A failed aggregate must survive another study block and reload. Each API/account has its own queue;
// retries keep the original payload/key, and only an acknowledged item is removed.
// `isRejected(error)` marks an answer that says the item can NEVER be applied (the server already holds a different conclusion of that stage): the
// item then leaves the queue instead of asking to be sent again forever, and `onRejected(evidence, error)` is told so it can say it to the student.
export function createStudyEvidenceQueue({ getScope, storage, send, shouldPersist = () => true, isRejected = () => false, onRejected = () => {} }) {
  const queues = new Map();
  const sending = new Set();
  const prefix = (scope) => `smartlearn.pending-study-evidence.${encodeURIComponent(scope)}.`;
  const intentId = (evidence) => evidence.operationKey ?? JSON.stringify([evidence.reviewTaskId, evidence.obligationUnitId]);
  function queueFor(scope) {
    if (!queues.has(scope)) queues.set(scope, new Map());
    const items = queues.get(scope);
    try {
      // Separate keys prevent one window's enqueue or acknowledgement from erasing another intent.
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix(scope))) continue;
        const saved = JSON.parse(storage.getItem(key));
        if (saved && typeof saved === 'object' && shouldPersist(saved) && !items.has(intentId(saved))) items.set(intentId(saved), saved);
      }
    } catch { /* Storage unavailable: keep the in-memory queue. */ }
    return items;
  }
  function persist(scope, id, evidence) {
    if (!shouldPersist(evidence)) return;
    try {
      storage.setItem(prefix(scope) + id, JSON.stringify(evidence));
    } catch { /* Storage unavailable: pending items still remain in memory. */ }
  }
  return {
    enqueue(evidence) {
      const scope = getScope();
      if (scope == null) throw new Error('Cannot queue study evidence without its owner');
      const items = queueFor(scope);
      const id = intentId(evidence);
      items.set(id, evidence);
      persist(scope, id, evidence);
    },
    pendingCount() {
      const scope = getScope();
      return scope == null ? 0 : queueFor(scope).size;
    },
    // Sends every item not already being sent. An item whose send is slow or lost must not hold back the others (the result of a new
    // block waits for its own send only), and a failing item must not hide the ones behind it: the first failure is rethrown at the end.
    async flush() {
      const scope = getScope();
      if (scope == null) return;
      const items = queueFor(scope);
      const tried = new Set();
      let failure = null;
      for (;;) {
        if (getScope() !== scope) break;
        const next = [...items].find(([id]) => !tried.has(id) && !sending.has(scope + id));
        if (!next) break;
        const [id, evidence] = next;
        tried.add(id);
        sending.add(scope + id);
        const forget = () => {
          items.delete(id);
          if (shouldPersist(evidence)) {
            try { storage.removeItem(prefix(scope) + id); } catch { /* A replay remains safe if storage is unavailable. */ }
          }
        };
        try {
          await send(evidence);
          forget();
        } catch (error) {
          if (isRejected(error)) { forget(); onRejected(evidence, error); } else failure ??= { error };
        } finally {
          sending.delete(scope + id);
        }
      }
      if (failure) throw failure.error;
    },
  };
}
