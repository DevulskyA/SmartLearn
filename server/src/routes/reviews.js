import * as reviews from '../services/reviews.js';
import { IdempotencyConflictError } from '../services/idempotency.js';

function handleError(err, reply) {
  if (err instanceof reviews.ReviewError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, ALREADY_COMPLETED: 409, NOT_COMPLETED: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  if (err instanceof IdempotencyConflictError) {
    reply.status(409);
    return { error: { code: err.code } };
  }
  throw err;
}

export function registerReviewRoutes(app, db) {
  app.get('/review-tasks', {
    schema: { querystring: { type: 'object', properties: { unitId: { type: 'string' } } } },
  }, async (request, reply) => {
    let unitId;
    if (request.query.unitId !== undefined) {
      unitId = Number(request.query.unitId);
      if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    }
    return { reviewTasks: reviews.list(db, request.actor.userId, { unitId }) };
  });

  // `date` is the day the CLIENT calls "today", in the CLIENT's own timezone. For "completed today" to agree with that day the server must
  // read the completion instants in the same timezone, so the client sends it too (CI #48: a browser in UTC at 01:30 UTC saw 2026-10-09 while
  // the saved timezone, America/Sao_Paulo, still said 2026-10-08, and a review completed a moment ago never appeared under "feitas hoje").
  // Without `timezone` the student's saved timezone applies, as before. Any runtime-recognised zone is accepted (UTC, nested names).
  app.get('/agenda', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string' }, timezone: { type: 'string', maxLength: 64 } } } },
  }, async (request, reply) => {
    const { date, timezone } = request.query;
    if (timezone !== undefined) {
      try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); } catch {
        reply.status(400);
        return { error: { code: 'VALIDATION_FAILED', field: 'timezone', message: 'timezone não é reconhecido pelo runtime.' } };
      }
    }
    return reviews.agenda(db, request.actor.userId, { date, timezoneOverride: timezone });
  });

  app.post('/review-tasks/:id/complete', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          questionsCount: { type: 'integer' },
          correctCount: { type: 'integer' },
          operationKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return reviews.complete(db, request.actor.userId, id, request.body);
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/review-tasks/:id/reopen', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return reviews.reopen(db, request.actor.userId, id);
    } catch (err) { return handleError(err, reply); }
  });
}
