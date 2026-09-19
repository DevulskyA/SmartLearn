// Durable development data: where the dev database lives and how it is
// snapshotted. The dev database must NOT live inside a git worktree (it is
// git-ignored, so `git worktree remove` or a fresh worktree silently loses
// or empties it). One stable user-level directory serves every worktree.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';

export function devDataDir(env = process.env, home = homedir()) {
  return env.SMARTLEARN_DEV_DATA_DIR || join(home, 'SmartLearn-DevData');
}

export function devDbPaths(env = process.env, home = homedir()) {
  const dir = devDataDir(env, home);
  return { dir, dbPath: join(dir, 'smartlearn-dev.db'), sourcesDir: join(dir, 'sources'), snapshotsDir: join(dir, 'snapshots') };
}

const dayStamp = (now) => now.toISOString().slice(0, 10);

/**
 * Once per calendar day (and only when there is real data), copy the dev DB
 * (+ its WAL/SHM, so it is consistent even if a stale process still holds it)
 * into snapshots/<date>/, keeping the newest `keep` days. Read-only on the
 * source. Returns the snapshot directory, or null when nothing was done.
 */
export function snapshotDevDbIfNeeded(dbPath, snapshotsDir, { now = new Date(), keep = 7 } = {}) {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) return null;
  const target = join(snapshotsDir, dayStamp(now));
  if (existsSync(target)) return null;
  mkdirSync(target, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, join(target, 'smartlearn-dev.db' + suffix));
  }
  const days = readdirSync(snapshotsDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const old of days.slice(0, Math.max(0, days.length - keep))) rmSync(join(snapshotsDir, old), { recursive: true, force: true });
  return target;
}
