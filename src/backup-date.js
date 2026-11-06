// The date of the last backup export is a property of THIS device's file export (the file went to this device's disk), not of the
// account on the server, and the server settings contract has no field for it (only timezone/uiLocale/generationLocale). So it is
// kept in this browser's localStorage, scoped per account so two accounts on one device never show each other's date. Every storage
// access is wrapped: localStorage can be missing or throw (private window, blocked site data) and the screen must still render.

const KEY_PREFIX = "smartlearn:lastBackupAt:";

export function lastBackupKey(accountId) {
  return `${KEY_PREFIX}${accountId == null || accountId === "" ? "local" : accountId}`;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The ISO timestamp of this device's last export for `accountId`, or null when none is stored (or storage is unavailable). */
export function readLastBackupAt(accountId, storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(lastBackupKey(accountId));
    if (!raw) return null;
    return Number.isNaN(Date.parse(raw)) ? null : raw;
  } catch {
    return null;
  }
}

/** Remembers `iso` as the last export for `accountId`; returns false (and never throws) when it could not be stored. */
export function writeLastBackupAt(accountId, iso, storage = defaultStorage()) {
  try {
    if (!storage || Number.isNaN(Date.parse(iso))) return false;
    storage.setItem(lastBackupKey(accountId), iso);
    return true;
  } catch {
    return false;
  }
}
