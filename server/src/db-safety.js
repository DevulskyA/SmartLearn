import { resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';

function isInside(child, parent) {
  const rel = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * A server started with NODE_ENV=test is, by definition, disposable-data
 * territory: refuse to run it against any database that is not inside the OS
 * temp directory, so no test/e2e mis-wiring can ever point at (and later
 * "clean up") a database someone actually uses.
 */
export function assertTestDbIsDisposable(nodeEnv, dbPath, tempRoot = tmpdir()) {
  if (nodeEnv !== 'test') return;
  if (!isInside(dbPath, tempRoot)) {
    throw new Error(
      `REFUSING TO START: NODE_ENV=test but SMARTLEARN_DB_PATH (${resolve(dbPath)}) is outside the OS temp directory (${resolve(tempRoot)}). ` +
      'Test databases must be disposable; point SMARTLEARN_DB_PATH at a temp directory.',
    );
  }
}
