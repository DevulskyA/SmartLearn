import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';

// T07: strict /v1 domain envelope.
// - default-deny actor resolution: every /v1 route requires request.actor to
//   be set by a real session mechanism (added in T09/T10); until then this
//   module has no session lookup wired in, so every /v1 route is denied
//   with 401 by design, proving the deny-by-default behavior itself.
// - AJV strict mode: unknown body fields and wrong primitive types are
//   REJECTED, never silently stripped or coerced.
// - Errors are always {error:{code,field?,requestId}}, never leak SQL,
//   stack traces, filesystem paths or another actor's resource existence.
// - Health stays outside this envelope (registered directly on the root
//   app before applyDomainEnvelope runs), remains public and minimal.

export const ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL: 'INTERNAL',
});

function errorBody(code, requestId, field) {
  const error = { code, requestId };
  if (field) error.field = field;
  return { error };
}

const ajv = new Ajv({ allErrors: false, removeAdditional: false, coerceTypes: false, useDefaults: false });

const denyAllActorResolver = async () => null;

/**
 * Applies the strict domain envelope directly to a Fastify instance (no
 * plugin encapsulation — routes registered after this call on the same
 * instance see these hooks). Intended to be called once per /v1-scoped app.
 *
 * `resolveActor(request)` is the injection point for the real session-cookie
 * lookup added in T09/T10. It must return the resolved actor or null/undefined
 * — never throw for "no session", and never trust a client-supplied field
 * (body.userId, headers, query) as an access authority. Defaults to a
 * fail-closed resolver so /v1 denies everything until a real one is wired in.
 */
export function applyDomainEnvelope(app, { resolveActor = denyAllActorResolver } = {}) {
  app.setValidatorCompiler(({ schema }) => {
    return ajv.compile({ ...schema, additionalProperties: false });
  });

  app.decorateRequest('actor', null);
  app.decorateRequest('requestId', null);

  app.addHook('onRequest', async (request, reply) => {
    request.requestId = request.headers['x-request-id'] || randomUUID();
    reply.header('x-request-id', request.requestId);
  });

  app.addHook('preHandler', async (request) => {
    request.actor = (await resolveActor(request)) ?? null;
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions?.config?.public) return;
    if (!request.actor) {
      reply.status(401).send(errorBody(ERROR_CODES.UNAUTHENTICATED, request.requestId));
    }
  });

  app.setErrorHandler((err, request, reply) => {
    const requestId = request.requestId;
    if (err.validation) {
      const first = err.validation[0];
      const field = first?.instancePath?.replace(/^\//, '') || first?.params?.additionalProperty;
      reply.status(400).send(errorBody(ERROR_CODES.VALIDATION_FAILED, requestId, field || undefined));
      return;
    }
    if (err.statusCode === 401) {
      reply.status(401).send(errorBody(ERROR_CODES.UNAUTHENTICATED, requestId));
      return;
    }
    // Never leak err.message (may contain SQL/paths) for unexpected errors.
    request.log?.error?.(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.status(status).send(errorBody(status < 500 ? (err.code || ERROR_CODES.FORBIDDEN) : ERROR_CODES.INTERNAL, requestId));
  });

  app.setNotFoundHandler((request, reply) => {
    // /v1 errors are always JSON, never fall through to SPA HTML.
    reply.status(404).send(errorBody(ERROR_CODES.NOT_FOUND, request.requestId));
  });
}
