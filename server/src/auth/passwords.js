import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// design.md §3 scrypt parameters.
export const SCRYPT_PARAMS = Object.freeze({
  N: 131072,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 256 * 1024 * 1024,
});

export const PASSWORD_MIN_CODEPOINTS = 15;
export const PASSWORD_MAX_UTF8_BYTES = 1024;

// Bound parallel hashing: scrypt with these params is CPU/memory heavy.
// Unbounded concurrent hashing is a trivial DoS vector against health/other
// requests on the same event loop. Cap concurrent jobs; excess callers queue.
const MAX_CONCURRENT_HASH_JOBS = 2;
// Verifier-found defect (Phase 01 independent review): this queue had no
// size cap, so a caller that reaches this pool at all (even one correctly
// past a per-route rate limiter, or via a route that has none) could still
// grow it without bound, backing up every legitimate login/register behind
// an ever-longer wait and growing memory with queued closures. Routes are
// now rate-limited BEFORE calling into this module at all (see auth.js),
// but this cap is a second, independent backstop — bounded memory here does
// not depend on every current and future caller getting its own limiter
// right.
const MAX_QUEUE_LENGTH = 100;
export class HashQueueOverloadedError extends Error {
  constructor() { super('Password hashing queue is overloaded.'); this.code = 'HASH_QUEUE_OVERLOADED'; }
}
let activeJobs = 0;
const queue = [];

function runBounded(fn) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      activeJobs++;
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      } finally {
        activeJobs--;
        const next = queue.shift();
        if (next) next();
      }
    };
    if (activeJobs < MAX_CONCURRENT_HASH_JOBS) {
      task();
    } else if (queue.length >= MAX_QUEUE_LENGTH) {
      reject(new HashQueueOverloadedError());
    } else {
      queue.push(task);
    }
  });
}

export function validatePasswordShape(password) {
  if (typeof password !== 'string') return 'A senha deve ser uma string.';
  if (password.length === 0) return 'Informe a senha.';
  const codepoints = [...password].length;
  if (codepoints < PASSWORD_MIN_CODEPOINTS) {
    return `A senha deve ter ao menos ${PASSWORD_MIN_CODEPOINTS} caracteres.`;
  }
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > PASSWORD_MAX_UTF8_BYTES) {
    return `A senha excede o tamanho máximo permitido.`;
  }
  return null;
}

/**
 * Hashes a password with a fresh random salt. Never trims, normalizes or
 * truncates the input — the exact bytes the user typed are what get hashed.
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await runBounded(() =>
    scryptAsync(Buffer.from(password, 'utf8'), salt, SCRYPT_PARAMS.keylen, {
      N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, maxmem: SCRYPT_PARAMS.maxmem,
    })
  );
  return {
    hash: derivedKey.toString('hex'),
    salt: salt.toString('hex'),
    algorithm: 'scrypt',
    params: JSON.stringify(SCRYPT_PARAMS),
  };
}

/**
 * Verifies a password against stored hash/salt/params using the params that
 * were actually persisted at hash time (forward-readable if params change
 * later), and a constant-time, equal-length comparison.
 */
export async function verifyPassword(password, { hash, salt, params }) {
  const storedParams = JSON.parse(params);
  const saltBuffer = Buffer.from(salt, 'hex');
  const storedHashBuffer = Buffer.from(hash, 'hex');
  const derivedKey = await runBounded(() =>
    scryptAsync(Buffer.from(password, 'utf8'), saltBuffer, storedHashBuffer.length, {
      N: storedParams.N, r: storedParams.r, p: storedParams.p, maxmem: storedParams.maxmem,
    })
  );
  if (derivedKey.length !== storedHashBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedHashBuffer);
}

/**
 * Constant-shape path for an unknown account: performs a real scrypt hash
 * against a fixed dummy salt/password so the response timing for "unknown
 * email" is not distinguishable from "wrong password for a known email".
 */
const DUMMY_SALT = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex').subarray(0, 16);
export async function runDecoyHash() {
  await runBounded(() =>
    scryptAsync(Buffer.from('decoy-password-constant-shape', 'utf8'), DUMMY_SALT, SCRYPT_PARAMS.keylen, {
      N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, maxmem: SCRYPT_PARAMS.maxmem,
    })
  );
}
