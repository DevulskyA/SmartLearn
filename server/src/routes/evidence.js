import * as evidence from '../services/evidence.js';
import * as exerciseReview from '../services/exercise-review.js';
import { unitSignals } from '../services/unit-signals.js';
import { knowledgeMap } from '../services/knowledge-map.js';

function handleError(err, reply) {
  if (err instanceof evidence.EvidenceError || err instanceof exerciseReview.ExerciseReviewError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
  }
  throw err;
}

export function registerEvidenceRoutes(app, db) {
  // EXPERIMENTAL (knowledge/gaps), read-only; no screen uses it. See unit-signals.js.
  app.get('/unit-signals', async (request) => unitSignals(db, request.actor.userId));
  // EXPERIMENTAL: the same observed evidence per section of the source (sustained links only). See knowledge-map.js.
  app.get('/knowledge-map', async (request) => knowledgeMap(db, request.actor.userId));

  app.post('/learning-evidence', {
    schema: {
      body: {
        type: 'object',
        required: ['unitId', 'type', 'evidenceDate'],
        properties: {
          unitId: { type: 'integer' },
          type: { type: 'string', enum: ['INITIAL_PRACTICE', 'EXTERNAL'] },
          questionsCount: { type: 'integer' },
          correctCount: { type: 'integer' },
          evidenceDate: { type: 'string' },
          attemptIds: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  }, async (request, reply) => {
    try {
      reply.status(201);
      return { evidence: evidence.create(db, request.actor.userId, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/learning-evidence/:id/attempts', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return exerciseReview.getAttemptDetails(db, request.actor.userId, id);
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/learning-evidence', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          unitId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          includeSuperseded: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (request, reply) => {
    const { unitId, from, to, includeSuperseded } = request.query;
    let parsedUnitId;
    if (unitId !== undefined) {
      parsedUnitId = Number(unitId);
      if (!Number.isInteger(parsedUnitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    }
    try {
      return { evidence: evidence.list(db, request.actor.userId, { unitId: parsedUnitId, dateFrom: from, dateTo: to, includeSuperseded: includeSuperseded === 'true' }) };
    } catch (err) { return handleError(err, reply); }
  });
}
