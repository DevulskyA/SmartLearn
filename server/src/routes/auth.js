import { hashPassword, verifyPassword, validatePasswordShape, runDecoyHash } from '../auth/passwords.js';
import { normalizeEmail, validateEmailShape } from '../auth/email.js';
import {
  generateSessionToken, hashToken, sessionCookieName, sessionCookieOptions,
  SESSION_ABSOLUTE_LIFETIME_MS,
} from '../auth/session-tokens.js';
import { generateCsrfToken } from '../auth/csrf.js';
import { createRateLimiter, DEFAULT_ACCOUNT_MAX_ATTEMPTS, DEFAULT_IP_MAX_ATTEMPTS } from '../auth/rate-limit.js';
import { consumeResetToken } from '../auth/reset-tokens.js';
import * as users from '../repositories/users.js';
import * as sessions from '../repositories/sessions.js';

const registerBodySchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
  },
};

const loginRateLimiter = createRateLimiter();

function issueSession(db, userId, isProduction) {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const csrfToken = generateCsrfToken();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_LIFETIME_MS).toISOString();
  const session = sessions.createSession(db, { tokenHash, userId, issuedAt, expiresAt, csrfToken });
  return { rawToken, session };
}

function setSessionCookie(reply, rawToken, isProduction) {
  reply.setCookie(sessionCookieName(isProduction), rawToken, sessionCookieOptions(isProduction));
}

function clearSessionCookie(reply, isProduction) {
  reply.clearCookie(sessionCookieName(isProduction), { path: '/' });
}

/**
 * Registers auth routes on the given Fastify instance (expected to be the
 * /v1 sub-context with applyDomainEnvelope already applied). `isProduction`
 * controls cookie Secure/name per design.md §3.
 */
export function registerAuthRoutes(app, db, { isProduction = false } = {}) {
  app.post('/auth/register', { config: { public: true }, schema: registerBodySchema }, async (request, reply) => {
    const { email, password } = request.body;

    const emailError = validateEmailShape(email);
    if (emailError) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'email', message: emailError } };
    }
    const passwordError = validatePasswordShape(password);
    if (passwordError) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'password', message: passwordError } };
    }

    const normalized = normalizeEmail(email);
    const { hash, salt, algorithm, params } = await hashPassword(password);

    try {
      const user = users.createUser(db, {
        email: normalized,
        emailDisplay: email,
        passwordHash: hash,
        passwordSalt: salt,
        passwordAlgorithm: algorithm,
        passwordParams: params,
      });
      reply.status(201);
      return { user };
    } catch (err) {
      if (err.code === 'EMAIL_CONFLICT') {
        reply.status(409);
        return { error: { code: 'EMAIL_CONFLICT', field: 'email' } };
      }
      throw err;
    }
  });

  app.post('/auth/login', { config: { public: true }, schema: registerBodySchema }, async (request, reply) => {
    const { email, password } = request.body;
    const ip = request.ip;

    const emailError = validateEmailShape(email);
    const passwordError = typeof password !== 'string' ? 'A senha deve ser uma string.' : null;
    if (emailError || passwordError) {
      await runDecoyHash();
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    const normalized = normalizeEmail(email);
    const accountKey = `acct:${normalized}`;
    const ipKey = `ip:${ip}`;

    if (loginRateLimiter.isBlocked(accountKey, DEFAULT_ACCOUNT_MAX_ATTEMPTS) || loginRateLimiter.isBlocked(ipKey, DEFAULT_IP_MAX_ATTEMPTS)) {
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } }; // generic — never reveal rate-limit state
    }

    const record = users.findByEmailWithSecrets(db, normalized);

    if (!record) {
      await runDecoyHash();
      loginRateLimiter.recordFailure(accountKey);
      loginRateLimiter.recordFailure(ipKey);
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    const valid = await verifyPassword(password, {
      hash: record.password_hash,
      salt: record.password_salt,
      params: record.password_params,
    });

    if (!valid) {
      loginRateLimiter.recordFailure(accountKey);
      loginRateLimiter.recordFailure(ipKey);
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    loginRateLimiter.reset(accountKey);
    loginRateLimiter.reset(ipKey);

    const { rawToken } = issueSession(db, record.id, isProduction);
    setSessionCookie(reply, rawToken, isProduction);

    return { user: users.findById(db, record.id) };
  });

  // Authenticated bootstrap: confirms identity and hands back this
  // session's CSRF token for subsequent mutating requests.
  app.get('/auth/me', async (request) => {
    return { user: users.findById(db, request.actor.userId), csrfToken: request.actor.csrfToken };
  });

  app.post('/auth/logout', async (request, reply) => {
    sessions.revoke(db, request.actor.sessionId);
    clearSessionCookie(reply, isProduction);
    reply.status(204);
    return null;
  });

  // Consumes a token an operator already issued out-of-band (server/scripts/
  // reset-password.mjs) and generated for this account. There is no path
  // that issues a token to a remote caller — this is recovery completion,
  // not recovery initiation. Single-use: a second attempt with the same
  // token fails even if the password value would otherwise be valid.
  app.post('/auth/reset-password', {
    config: { public: true },
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { token, newPassword } = request.body;

    const shapeError = validatePasswordShape(newPassword);
    if (shapeError) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'newPassword', message: shapeError } };
    }

    let userId;
    try {
      userId = consumeResetToken(db, token);
    } catch {
      // Never distinguish "invalid", "used" or "expired" to the caller —
      // all three are handled identically to avoid leaking token state.
      reply.status(400);
      return { error: { code: 'INVALID_RESET_TOKEN' } };
    }

    const { hash, salt, algorithm, params } = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash=?, password_salt=?, password_algorithm=?, password_params=?, updated_at=? WHERE id=?')
      .run(hash, salt, algorithm, params, new Date().toISOString(), userId);

    // A password reset is a recovery event: revoke every existing session,
    // including any the attacker might already hold.
    sessions.revokeAllForUser(db, userId);

    return { ok: true };
  });

  app.post('/auth/password', {
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const record = users.findByIdWithSecrets(db, request.actor.userId);
    if (!record) {
      reply.status(401);
      return { error: { code: 'UNAUTHENTICATED' } };
    }

    const currentValid = await verifyPassword(currentPassword, {
      hash: record.password_hash, salt: record.password_salt, params: record.password_params,
    });
    if (!currentValid) {
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    const shapeError = validatePasswordShape(newPassword);
    if (shapeError) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'newPassword', message: shapeError } };
    }

    const { hash, salt, algorithm, params } = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash=?, password_salt=?, password_algorithm=?, password_params=?, updated_at=? WHERE id=?')
      .run(hash, salt, algorithm, params, new Date().toISOString(), record.id);

    // Password change revokes every OTHER session; the current one stays
    // valid so the user isn't logged out by their own change.
    sessions.revokeAllForUser(db, record.id, { exceptId: request.actor.sessionId });

    return { user: users.findById(db, record.id) };
  });
}
