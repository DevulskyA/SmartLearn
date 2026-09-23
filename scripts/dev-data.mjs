// Durable development data: where the dev database lives and how it is
// snapshotted. The dev database must NOT live inside a git worktree (it is
// git-ignored, so `git worktree remove` or a fresh worktree silently loses
// or empties it). One stable user-level directory serves every worktree.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';

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

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

/**
 * Single writer for the persistent dev database. Two worktrees (or two
 * terminals) must not silently write the same file: the first `dev:remote`
 * takes dev.lock; a second one is REFUSED with a message naming the holder.
 * A lock whose process is dead is stale and is taken over. Returns a release fn.
 */
export function acquireDevLock(dir, { pid = process.pid, root = process.cwd(), now = new Date(), isAlive = pidAlive } = {}) {
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, 'dev.lock');
  if (existsSync(lockPath)) {
    let holder = null;
    try { holder = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { /* corrupt lock: treat as stale */ }
    if (holder && holder.pid !== pid && isAlive(holder.pid)) {
      throw new Error(
        `REFUSING: the persistent dev database (${dir}) is already in use by pid ${holder.pid} from ${holder.root} ` +
        `(since ${holder.startedAt}). Stop that process, or point this worktree at a different database with ` +
        'SMARTLEARN_DEV_DATA_DIR / SMARTLEARN_DB_PATH.',
      );
    }
  }
  writeFileSync(lockPath, JSON.stringify({ pid, root, startedAt: now.toISOString() }));
  return () => {
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (current.pid === pid) rmSync(lockPath, { force: true });
    } catch { /* already gone */ }
  };
}
