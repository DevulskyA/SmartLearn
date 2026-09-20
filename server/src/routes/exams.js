import * as exams from '../services/exams.js';

function handleError(err, reply) {
  if (err instanceof exams.ExamError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, INVALID_STATE: 409, NO_QUESTIONS: 409, INCOMPLETE: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

const ID = { type: 'string' };

export function registerExamRoutes(app, db) {
  app.post('/exams', {
    schema: { body: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'integer' } } } },
  }, async (request, reply) => {
    try {
      const { exam, resumed } = exams.start(db, request.actor.userId, { unitId: request.body.unitId });
      reply.status(resumed ? 200 : 201);
      return { exam, resumed };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/exams/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: ID } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { exam: exams.get(db, request.actor.userId, id) }; } catch (err) { return handleError(err, reply); }
  });

  app.put('/exams/:id/items/:itemId/answer', {
    schema: {
      params: { type: 'object', required: ['id', 'itemId'], properties: { id: ID, itemId: ID } },
      body: { type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    const itemId = Number(request.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return exams.saveAnswer(db, request.actor.userId, id, itemId, request.body); } catch (err) { return handleError(err, reply); }
  });

  app.put('/exams/:id/items/:itemId/judgment', {
    schema: {
      params: { type: 'object', required: ['id', 'itemId'], properties: { id: ID, itemId: ID } },
      body: { type: 'object', required: ['outcome'], properties: { outcome: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    const itemId = Number(request.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { exam: exams.judge(db, request.actor.userId, id, itemId, request.body) }; } catch (err) { return handleError(err, reply); }
  });

  app.post('/exams/:id/finalize', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: ID } },
      body: { type: 'object', properties: { evidenceDate: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { exam: exams.finalize(db, request.actor.userId, id, request.body ?? {}) }; } catch (err) { return handleError(err, reply); }
  });

  app.post('/exams/:id/submit', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: ID } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { exam: exams.submit(db, request.actor.userId, id) }; } catch (err) { return handleError(err, reply); }
  });
}
