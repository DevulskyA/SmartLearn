import * as flags from '../services/question-flags.js';

function handleError(err, reply) {
  if (err instanceof flags.QuestionFlagError) {
    reply.status(err.code === 'NOT_FOUND' ? 404 : 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
  }
  throw err;
}

// "Questao com problema": an annotation about a question, never a grade nor evidence (see services/question-flags.js).
export function registerQuestionFlagRoutes(app, db) {
  app.get('/question-flags', async (request) => ({ flags: flags.list(db, request.actor.userId) }));

  // Marks the question of an ANSWERED attempt. The attempt must be SUBMITTED and the student's own.
  app.post('/attempts/:id/flag', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', maxLength: 40 }, comment: { type: ['string', 'null'], maxLength: 2000 } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      reply.status(201);
      return { flag: flags.flagFromAttempt(db, request.actor.userId, id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  // Takes the mark back (idempotent).
  app.post('/exercises/:exerciseId/unflag', {
    schema: { params: { type: 'object', required: ['exerciseId'], properties: { exerciseId: { type: 'string' } } } },
  }, async (request, reply) => {
    const exerciseId = Number(request.params.exerciseId);
    if (!Number.isInteger(exerciseId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { flag: flags.clear(db, request.actor.userId, exerciseId) };
    } catch (err) { return handleError(err, reply); }
  });
}
