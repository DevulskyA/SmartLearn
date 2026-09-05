export async function fetchWithRetry(url, options, retries = 1, delayMs = 200) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function checkBrokerReachable(baseUrl = 'http://127.0.0.1:57321', timeoutMs = 500) {
  try {
    const resp = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function wrapBrokerAsDatabase(transport) {
  return {
    async select(sql, params = []) {
      return transport.query(sql, params);
    },
    async execute(sql, params = []) {
      const data = await transport.transaction([{ sql, params: params ?? [] }]);
      const r = data.results?.[0] ?? {};
      return { lastInsertId: r.last_insert_id ?? 0, rowsAffected: r.rows_affected ?? 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Offline write buffer — IndexedDB `pending_writes` store
// ---------------------------------------------------------------------------

const IDB_NAME = 'smartlearn-offline';
const IDB_VERSION = 1;
const IDB_STORE = 'pending_writes';

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueOfflineTransaction(statements) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).add({ statements, queuedAt: Date.now() });
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function drainPendingWrites() {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingWrite(key) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Background sync — flush pending_writes when broker is reachable again
// ---------------------------------------------------------------------------

export async function syncPendingWrites(baseUrl = 'http://127.0.0.1:57321') {
  const db = await openOfflineDb();
  const entries = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).openCursor();
    const rows = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { rows.push({ key: cursor.primaryKey, value: cursor.value }); cursor.continue(); }
      else resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });

  let synced = 0;
  for (const { key, value } of entries) {
    try {
      const resp = await fetch(`${baseUrl}/api/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements: value.statements }),
      });
      if (resp.ok) {
        await clearPendingWrite(key);
        synced++;
      }
    } catch {
      break; // Still offline; stop and retry next time.
    }
  }
  return synced;
}

export function registerOnlineSync(baseUrl = 'http://127.0.0.1:57321') {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => syncPendingWrites(baseUrl));
}

// ---------------------------------------------------------------------------

export function createBrokerStore(baseUrl = 'http://127.0.0.1:57321') {
  async function post(path, body) {
    const resp = await fetchWithRetry(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.status.toString());
      throw new Error(`Broker error ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  return {
    async transaction(statements) {
      try {
        return await post('/api/transaction', { statements });
      } catch (err) {
        // On network failure, buffer the write for background sync (T3.4).
        if (err instanceof TypeError) {
          await queueOfflineTransaction(statements);
          return { results: [], queued: true };
        }
        throw err;
      }
    },
    async query(sql, params = []) {
      const data = await post('/api/query', { sql, params });
      return data.rows;
    },
  };
}
