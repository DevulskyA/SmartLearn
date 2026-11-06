import test from "node:test";
import assert from "node:assert/strict";

import { lastBackupKey, readLastBackupAt, writeLastBackupAt } from "../src/backup-date.js";

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("backup date: nothing stored reads as null", () => {
  assert.equal(readLastBackupAt("acc-1", memoryStorage()), null);
});

test("backup date: written value is read back, scoped per account", () => {
  const storage = memoryStorage();
  assert.equal(writeLastBackupAt("acc-1", "2026-10-17T12:00:00.000Z", storage), true);
  assert.equal(readLastBackupAt("acc-1", storage), "2026-10-17T12:00:00.000Z");
  assert.equal(readLastBackupAt("acc-2", storage), null);
  assert.notEqual(lastBackupKey("acc-1"), lastBackupKey("acc-2"));
  assert.equal(lastBackupKey(null), lastBackupKey(undefined));
});

test("backup date: a broken or missing storage never throws", () => {
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readLastBackupAt("a", throwing), null);
  assert.equal(writeLastBackupAt("a", "2026-10-17T12:00:00.000Z", throwing), false);
  assert.equal(readLastBackupAt("a", null), null);
  assert.equal(writeLastBackupAt("a", "2026-10-17T12:00:00.000Z", null), false);
});

test("backup date: garbage in storage or as input is ignored", () => {
  const storage = memoryStorage();
  storage.setItem(lastBackupKey("a"), "not a date");
  assert.equal(readLastBackupAt("a", storage), null);
  assert.equal(writeLastBackupAt("a", "nope", storage), false);
});
