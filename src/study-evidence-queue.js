// A failed aggregate must survive another study block and reload. Each API/account has its own queue;
// retries keep the original payload/key, and only an acknowledged item is removed.
export function createStudyEvidenceQueue({ getScope, storage, send, shouldPersist = () => true }) {
  const queues = new Map();
  const flights = new Map();
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
    flush() {
      const scope = getScope();
      if (scope == null) return Promise.resolve();
      if (flights.has(scope)) return flights.get(scope);
      const items = queueFor(scope);
      const flight = (async () => {
        while (items.size && getScope() === scope) {
          const [id, evidence] = items.entries().next().value;
          await send(evidence);
          items.delete(id);
          if (shouldPersist(evidence)) {
            try { storage.removeItem(prefix(scope) + id); } catch { /* A replay remains safe if storage is unavailable. */ }
          }
        }
      })();
      flights.set(scope, flight);
      return flight.finally(() => { flights.delete(scope); });
    },
  };
}
