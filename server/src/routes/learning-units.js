import * as learningUnits from '../services/learning-units.js';
import { IdempotencyConflictError } from '../services/idempotency.js';

function handleError(err, reply) {
  if (err instanceof learningUnits.LearningUnitError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, SUBJECT_CONFLICT: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  if (err instanceof IdempotencyConflictError) {
    reply.status(409);
    return { error: { code: err.code } };
  }
  throw err;
}

export function registerLearningUnitRoutes(app, db) {
  app.get('/learning-units', async (request) => {
    return { units: learningUnits.list(db, request.actor.userId) };
  });

  app.get('/learning-units/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { unit: learningUnits.getById(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/learning-units/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          sourceText: { type: ['string', 'null'] },
          summaryBody: { type: ['string', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { unit: learningUnits.updateFields(db, request.actor.userId, id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/learning-units', {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'studyDate'],
        properties: {
          subjectId: { type: 'integer' },
          newSubjectName: { type: 'string' },
          newSubjectColor: { type: 'string' },
          title: { type: 'string' },
          sourceText: { type: ['string', 'null'] },
          summaryBody: { type: ['string', 'null'] },
          studyDate: { type: 'string' },
          operationKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    // "Create requires exactly one of subjectId or newSubjectName" (design.md §4).
    const { subjectId, newSubjectName } = request.body;
    if ((subjectId == null) === (newSubjectName == null)) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'Informe exatamente um de subjectId ou newSubjectName.' } };
    }
    try {
      const result = learningUnits.create(db, request.actor.userId, request.body);
      reply.status(201);
      return result;
    } catch (err) { return handleError(err, reply); }
  });
}
