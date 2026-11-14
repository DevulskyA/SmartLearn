import * as learningUnits from '../services/learning-units.js';
import { IdempotencyConflictError } from '../services/idempotency.js';

function handleError(err, reply) {
  if (err instanceof learningUnits.LearningUnitError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, SUBJECT_CONFLICT: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
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

  app.get('/learning-units/:id/summary-sources', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { sources: learningUnits.summarySources(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
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
          title: { type: 'string', maxLength: 300 },
          sourceText: { type: ['string', 'null'], maxLength: 500 },
          sourceKind: { type: ['string', 'null'], enum: ['APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO', null] },
          summaryBody: { type: ['string', 'null'], maxLength: 200000 },
          lessonDate: { type: ['string', 'null'], maxLength: 40 },
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
          subjectId: { type: 'integer', minimum: 1 },
          newSubjectName: { type: 'string', maxLength: 100 },
          newSubjectColor: { type: 'string', maxLength: 40 },
          title: { type: 'string', maxLength: 300 },
          sourceText: { type: ['string', 'null'], maxLength: 500 },
          sourceKind: { type: ['string', 'null'], enum: ['APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO', null] },
          summaryBody: { type: ['string', 'null'], maxLength: 200000 },
          studyDate: { type: 'string', maxLength: 40 },
          lessonDate: { type: ['string', 'null'], maxLength: 40 },
          operationKey: { type: 'string', maxLength: 100 },
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
