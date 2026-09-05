import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchWithRetry,
  createBrokerStore,
  wrapBrokerAsDatabase,
  checkBrokerReachable,
} from "../src/broker-transport.js";

// Helper: build a fake Response-like object
function makeResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

// Swap globalThis.fetch for the duration of the callback, then restore it.
async function withFetch(fakeFetch, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

test("fetchWithRetry returns on first success", async () => {
  let calls = 0;
  await withFetch(async (url) => {
    calls++;
    return makeResponse({ ok: true });
  }, async () => {
    const resp = await fetchWithRetry("http://x/api/health", {});
    assert.ok(resp.ok);
    assert.equal(calls, 1);
  });
});

test("fetchWithRetry retries once on network error then succeeds", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    if (calls === 1) throw new Error("network down");
    return makeResponse({ ok: true });
  }, async () => {
    // retries=1 means: 1 retry allowed → 2 total attempts
    const resp = await fetchWithRetry("http://x/api/health", {}, 1, 0);
    assert.ok(resp.ok);
    assert.equal(calls, 2);
  });
});

test("fetchWithRetry throws after exhausting retries", async () => {
  await withFetch(async () => {
    throw new Error("always fails");
  }, async () => {
    await assert.rejects(
      () => fetchWithRetry("http://x/api/health", {}, 1, 0),
      /always fails/,
    );
  });
});

// ---------------------------------------------------------------------------
// checkBrokerReachable
// ---------------------------------------------------------------------------

test("checkBrokerReachable returns true when health endpoint is ok", async () => {
  await withFetch(async () => makeResponse({}, { ok: true, status: 200 }), async () => {
    const reachable = await checkBrokerReachable("http://127.0.0.1:57321", 500);
    assert.equal(reachable, true);
  });
});

test("checkBrokerReachable returns false when fetch throws", async () => {
  await withFetch(async () => { throw new Error("ECONNREFUSED"); }, async () => {
    const reachable = await checkBrokerReachable("http://127.0.0.1:57321", 500);
    assert.equal(reachable, false);
  });
});

test("checkBrokerReachable returns false when health returns non-ok status", async () => {
  await withFetch(async () => makeResponse({}, { ok: false, status: 503 }), async () => {
    const reachable = await checkBrokerReachable("http://127.0.0.1:57321", 500);
    assert.equal(reachable, false);
  });
});

// ---------------------------------------------------------------------------
// createBrokerStore
// ---------------------------------------------------------------------------

test("createBrokerStore.query posts to /api/query and returns rows", async () => {
  const rows = [{ id: 1, name: "Matemática" }];
  await withFetch(async (url, opts) => {
    assert.ok(url.endsWith("/api/query"), "wrong path");
    assert.equal(opts.method, "POST");
    const body = JSON.parse(opts.body);
    assert.equal(body.sql, "SELECT 1");
    return makeResponse({ rows });
  }, async () => {
    const transport = createBrokerStore("http://127.0.0.1:57321");
    const result = await transport.query("SELECT 1", []);
    assert.deepEqual(result, rows);
  });
});

test("createBrokerStore.transaction posts to /api/transaction and returns results", async () => {
  const results = [{ rows_affected: 1, last_insert_id: 42 }];
  await withFetch(async (url, opts) => {
    assert.ok(url.endsWith("/api/transaction"), "wrong path");
    const body = JSON.parse(opts.body);
    assert.ok(Array.isArray(body.statements));
    return makeResponse({ results });
  }, async () => {
    const transport = createBrokerStore("http://127.0.0.1:57321");
    const result = await transport.transaction([{ sql: "INSERT INTO t VALUES (1)", params: [] }]);
    assert.deepEqual(result, { results });
  });
});

test("createBrokerStore throws on non-ok response", async () => {
  await withFetch(async () => makeResponse({ error: "table not found" }, { ok: false, status: 400 }), async () => {
    const transport = createBrokerStore("http://127.0.0.1:57321");
    await assert.rejects(
      () => transport.query("BAD SQL", []),
      /Broker error 400/,
    );
  });
});

// ---------------------------------------------------------------------------
// wrapBrokerAsDatabase
// ---------------------------------------------------------------------------

test("wrapBrokerAsDatabase.select delegates to transport.query", async () => {
  const rows = [{ v: "test" }];
  const transport = {
    query: async (sql, params) => {
      assert.equal(sql, "SELECT v FROM t");
      assert.deepEqual(params, []);
      return rows;
    },
    transaction: async () => assert.fail("should not call transaction"),
  };
  const db = wrapBrokerAsDatabase(transport);
  const result = await db.select("SELECT v FROM t", []);
  assert.deepEqual(result, rows);
});

test("wrapBrokerAsDatabase.execute wraps in single-statement transaction", async () => {
  const transport = {
    query: async () => assert.fail("should not call query"),
    transaction: async (stmts) => {
      assert.equal(stmts.length, 1);
      assert.equal(stmts[0].sql, "INSERT INTO t VALUES (?)");
      assert.deepEqual(stmts[0].params, ["hello"]);
      return { results: [{ rows_affected: 1, last_insert_id: 7 }] };
    },
  };
  const db = wrapBrokerAsDatabase(transport);
  const result = await db.execute("INSERT INTO t VALUES (?)", ["hello"]);
  assert.equal(result.rowsAffected, 1);
  assert.equal(result.lastInsertId, 7);
});

test("wrapBrokerAsDatabase.execute defaults to zero on missing result fields", async () => {
  const transport = {
    query: async () => [],
    transaction: async () => ({ results: [{}] }),
  };
  const db = wrapBrokerAsDatabase(transport);
  const result = await db.execute("DELETE FROM t WHERE 0=1", []);
  assert.equal(result.rowsAffected, 0);
  assert.equal(result.lastInsertId, 0);
});
