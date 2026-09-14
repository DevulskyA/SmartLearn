import * as evidence from '../services/evidence.js';

function handleError(err, reply) {
  if (err instanceof evidence.EvidenceError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerEvidenceRoutes(app, db) {
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
        },
      },
    },
  }, async (request, reply) => {
    try {
      reply.status(201);
      return { evidence: evidence.create(db, request.actor.userId, request.body) };
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
        },
      },
    },
  }, async (request, reply) => {
    const { unitId, from, to } = request.query;
    let parsedUnitId;
    if (unitId !== undefined) {
      parsedUnitId = Number(unitId);
      if (!Number.isInteger(parsedUnitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    }
    try {
      return { evidence: evidence.list(db, request.actor.userId, { unitId: parsedUnitId, dateFrom: from, dateTo: to }) };
    } catch (err) { return handleError(err, reply); }
  });
}
