import { hashPassword, verifyPassword, validatePasswordShape, runDecoyHash } from '../auth/passwords.js';
import { normalizeEmail, validateEmailShape } from '../auth/email.js';
import * as users from '../repositories/users.js';

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

/**
 * Registers /v1/auth/register and /v1/auth/login on the given Fastify
 * instance. Both are marked public (bypass the default-deny actor check —
 * you cannot be authenticated before you have an account/session). Neither
 * issues a session cookie yet: that lands in T10 alongside CSRF wiring.
 */
export function registerAuthRoutes(app, db) {
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

    const emailError = validateEmailShape(email);
    const passwordError = typeof password !== 'string' ? 'A senha deve ser uma string.' : null;
    if (emailError || passwordError) {
      await runDecoyHash(); // constant-shape: still pay the hashing cost
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    const normalized = normalizeEmail(email);
    const record = users.findByEmailWithSecrets(db, normalized);

    if (!record) {
      await runDecoyHash(); // unknown account: same timing shape as a wrong password
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    const valid = await verifyPassword(password, {
      hash: record.password_hash,
      salt: record.password_salt,
      params: record.password_params,
    });

    if (!valid) {
      reply.status(401);
      return { error: { code: 'INVALID_CREDENTIALS' } };
    }

    // T10 adds session issuance + cookie here. For now, confirm identity only.
    return { user: users.findById(db, record.id) };
  });
}
