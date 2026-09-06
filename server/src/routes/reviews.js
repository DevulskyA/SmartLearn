import * as reviews from '../services/reviews.js';
import { IdempotencyConflictError } from '../services/idempotency.js';

function handleError(err, reply) {
  if (err instanceof reviews.ReviewError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, ALREADY_COMPLETED: 409 };
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
  app.get('/agenda', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string' } } } },
  }, async (request) => {
    return reviews.agenda(db, request.actor.userId, { date: request.query.date });
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
