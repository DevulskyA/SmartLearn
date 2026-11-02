// The persistent DEV datastore (the human's data) and its single-writer lock. Lives in the server package so the backend process
// that really writes the database can hold the lock itself (T-F1-01); scripts/dev-data.mjs re-exports it for the launchers.
// The lock exists exactly as long as the writer does: a forced kill leaves a stale file whose pid is dead, which the next
// writer takes over.
import { homedir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { mkdirSync, openSync, writeSync, closeSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';

export function devDataDir(env = process.env, home = homedir()) {
  return env.SMARTLEARN_DEV_DATA_DIR || join(home, 'SmartLearn-DevData');
}

export function devDbPaths(env = process.env, home = homedir()) {
  const dir = devDataDir(env, home);
  return { dir, dbPath: join(dir, 'smartlearn-dev.db'), sourcesDir: join(dir, 'sources'), snapshotsDir: join(dir, 'snapshots') };
}

/** True when `dbPath` is the persistent DEV database (the only file the single-writer lock guards). */
export function isDevDatastoreDb(dbPath, env = process.env, home = homedir()) {
  return canonicalPath(dbPath) === canonicalPath(devDbPaths(env, home).dbPath);
}

// The same file through a junction/symlink, an 8.3 name or another spelling of the folder is still that file: resolve the REAL folder
// (the file itself may not exist yet) and compare case-insensitively like the Windows file system does.
function canonicalPath(path) {
  const absolute = resolve(path);
  try { return join(realpathSync.native(dirname(absolute)), basename(absolute)).toLowerCase(); } catch { return absolute.toLowerCase(); }
}

export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function readHolder(lockPath) {
  try { return JSON.parse(readFileSync(lockPath, 'utf8')); } catch { return null; /* missing or corrupt: no holder */ }
}

const refusal = (dir, holder) => new Error(
  `REFUSING: the persistent dev database (${dir}) is already in use by pid ${holder.pid} from ${holder.root} ` +
  `(since ${holder.startedAt}). Stop that process, or point this worktree at a different database with ` +
  'SMARTLEARN_DEV_DATA_DIR / SMARTLEARN_DB_PATH.',
);

/** Throws the refusal naming the holder when a LIVE process other than `pid` holds the lock; otherwise does nothing. */
export function assertDevLockFree(dir, { pid = process.pid, isAlive = pidAlive } = {}) {
  const holder = readHolder(join(dir, 'dev.lock'));
  if (holder && holder.pid !== pid && isAlive(holder.pid)) throw refusal(dir, holder);
}

/**
 * Single writer for the persistent dev database. The first writer creates dev.lock atomically (exclusive create, so two
 * simultaneous starters cannot both win); a second one is REFUSED with a message naming the holder. A lock whose process is
 * dead (or whose file is corrupt) is stale and is taken over. Returns a release function that only removes its own lock.
 */
export function acquireDevLock(dir, { pid = process.pid, root = process.cwd(), now = new Date(), isAlive = pidAlive } = {}) {
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, 'dev.lock');
  const body = JSON.stringify({ pid, root, startedAt: now.toISOString() });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, body);
      closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const holder = readHolder(lockPath);
      if (holder && holder.pid !== pid && isAlive(holder.pid)) throw refusal(dir, holder);
      rmSync(lockPath, { force: true }); // stale (dead pid / corrupt / ours from an earlier run): take it over and retry the exclusive create
      if (attempt === 4) throw new Error(`could not take the dev lock at ${lockPath}`);
    }
  }
  return () => {
    const current = readHolder(lockPath);
    if (existsSync(lockPath) && current?.pid === pid) rmSync(lockPath, { force: true });
  };
}
