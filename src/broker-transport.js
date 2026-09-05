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
      return post('/api/transaction', { statements });
    },
    async query(sql, params = []) {
      const data = await post('/api/query', { sql, params });
      return data.rows;
    },
  };
}
