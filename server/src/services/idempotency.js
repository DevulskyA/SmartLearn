import { createHash } from 'node:crypto';

export class IdempotencyConflictError extends Error {
  constructor() {
    super('This operation key was already used with a different payload.');
    this.code = 'IDEMPOTENCY_CONFLICT';
  }
}

export function canonicalHash(payload) {
  // Stable stringify: sort keys so the same logical payload always hashes
  // the same way regardless of property insertion order.
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Reads any previously stored result for (userId, operation, operationKey).
 * Returns { cached: true, result } if a matching-payload record exists,
 * throws IdempotencyConflictError if the key exists with a DIFFERENT
 * payload, or returns { cached: false } if there's no record yet (or no
 * operationKey was supplied — idempotency is opt-in per call).
 *
 * Deliberately a plain read, not a transaction wrapper: the caller is
 * responsible for calling recordIdempotency() INSIDE its own db.transaction
 * alongside the actual side effects, so the idempotency record and the
 * operation it guards commit or roll back together atomically. A wrapper
 * that ran the operation and recorded it as two separate steps would reopen
 * exactly the "injected failure leaves partial state" gap T15 exists to close.
 */
export function checkIdempotency(db, { userId, operation, operationKey, payload }) {
  if (!operationKey) return { cached: false };

  const payloadHash = canonicalHash(payload);
  const existing = db.prepare(
    'SELECT payload_hash, result_json FROM idempotency_keys WHERE user_id = ? AND operation = ? AND operation_key = ?'
  ).get(userId, operation, operationKey);

  if (!existing) return { cached: false, payloadHash };
  if (existing.payload_hash !== payloadHash) throw new IdempotencyConflictError();
  return { cached: true, result: JSON.parse(existing.result_json) };
}

/** Must be called inside the same db.transaction() as the guarded operation. */
export function recordIdempotency(db, { userId, operation, operationKey, payloadHash, result }) {
  if (!operationKey) return;
  db.prepare(
    'INSERT INTO idempotency_keys (user_id, operation, operation_key, payload_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, operation, operationKey, payloadHash, JSON.stringify(result), new Date().toISOString());
}
