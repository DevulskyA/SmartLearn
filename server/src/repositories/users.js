// T08: owned accounts repository. Exposes only safe DTOs to callers outside
// the auth module — password hash/salt/params never leave this file except
// through findByEmailWithSecrets, used exclusively by the login path (T09).

function toSafeDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    emailDisplay: row.email_display,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUser(db, { email, emailDisplay, passwordHash, passwordSalt, passwordAlgorithm, passwordParams }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (@email, @emailDisplay, @passwordHash, @passwordSalt, @passwordAlgorithm, @passwordParams, @now, @now)
  `);
  try {
    const result = stmt.run({ email, emailDisplay, passwordHash, passwordSalt, passwordAlgorithm, passwordParams, now });
    return findById(db, result.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      const conflict = new Error('An account with this email already exists.');
      conflict.code = 'EMAIL_CONFLICT';
      throw conflict;
    }
    throw err;
  }
}

export function findById(db, id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return toSafeDto(row);
}

export function findByEmail(db, normalizedEmail) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  return toSafeDto(row);
}

// Used only by the login/password-verification path (T09). Never expose
// this result to an HTTP response or log line.
export function findByEmailWithSecrets(db, normalizedEmail) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) ?? null;
}
