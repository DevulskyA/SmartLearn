import * as attempts from '../services/attempts.js';

function handleError(err, reply) {
  if (err instanceof attempts.AttemptError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, ALREADY_SUBMITTED: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerAttemptRoutes(app, db) {
  app.post('/exercises/:exerciseId/attempts', {
    schema: {
      params: { type: 'object', required: ['exerciseId'], properties: { exerciseId: { type: 'string' } } },
      body: { type: 'object', properties: { competencyId: { type: 'integer' }, reviewTaskId: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const exerciseId = Number(request.params.exerciseId);
    if (!Number.isInteger(exerciseId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      reply.status(201);
      return { attempt: attempts.start(db, request.actor.userId, { exerciseId, competencyId: request.body?.competencyId ?? null, reviewTaskId: request.body?.reviewTaskId ?? null }) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/review-task-attempts', {
    schema: { querystring: { type: 'object', required: ['ids'], properties: { ids: { type: 'string', maxLength: 4000 } } } },
  }, async (request, reply) => {
    const ids = request.query.ids.split(',').filter(Boolean).map(Number);
    try {
      const attemptsByReviewTask = attempts.listForReviewTasks(db, request.actor.userId, ids);
      const priorWrongByReviewTask = {};
      for (const id of Object.keys(attemptsByReviewTask)) {
        priorWrongByReviewTask[id] = attempts.priorWrongExercises(db, request.actor.userId, Number(id));
      }
      return { attemptsByReviewTask, priorWrongByReviewTask };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/review-tasks/:id/attempts', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { attempts: attempts.listForReviewTask(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/attempts/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { attempt: attempts.getById(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/attempts/:id/hint', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return attempts.useHint(db, request.actor.userId, id);
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/attempts/:id/reveal-solution', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return attempts.revealSolution(db, request.actor.userId, id);
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/attempts/:id/submit', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['assessmentMethod'],
        properties: {
          outcome: { type: 'string', enum: ['CORRECT', 'INCORRECT', 'UNKNOWN'] },
          assessmentMethod: { type: 'string', enum: ['SELF_REPORT', 'AUTOMATIC'] },
          confidence: { type: ['number', 'null'] },
          operationKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return attempts.submit(db, request.actor.userId, id, request.body);
    } catch (err) { return handleError(err, reply); }
  });
}
