import * as reviews from '../services/reviews.js';
import { dailyPlan } from '../services/daily-plan-experiment.js';
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

  // EXPERIMENTAL (HG-09 / D-12 option 3), read-only; no screen uses it. See reviews.obligations().
  app.get('/review-obligations', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string' }, timezone: { type: 'string', maxLength: 64 }, recovery: { type: 'string' } } } },
  }, async (request, reply) => {
    const { date, timezone, recovery } = request.query;
    try {
      return reviews.obligations(db, request.actor.userId, { date, timezoneOverride: timezone, recovery });
    } catch (err) { return handleError(err, reply); }
  });

  // EXPERIMENTAL (HG-14 prototype), read-only: today's plan by the minutes the student has. `exams` = "subjectId:YYYY-MM-DD,..." (optional).
  app.get('/daily-plan-experiment', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string' }, timezone: { type: 'string', maxLength: 64 }, availableMinutes: { type: 'string' }, perReviewMinutes: { type: 'string' }, exams: { type: 'string', maxLength: 400 } } } },
  }, async (request, reply) => {
    const { date, timezone, availableMinutes, perReviewMinutes, exams } = request.query;
    const minutes = Number(availableMinutes);
    if (availableMinutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'availableMinutes', message: 'availableMinutes deve ser um número não negativo.' } };
    }
    const perReview = perReviewMinutes === undefined ? undefined : Number(perReviewMinutes);
    if (perReview !== undefined && !(Number.isFinite(perReview) && perReview > 0)) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'perReviewMinutes', message: 'perReviewMinutes deve ser um número positivo.' } };
    }
    const examMap = {};
    for (const pair of String(exams ?? '').split(',').filter(Boolean)) {
      const [subjectId, day] = pair.split(':');
      if (!/^\d+$/.test(subjectId ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) {
        reply.status(400);
        return { error: { code: 'VALIDATION_FAILED', field: 'exams', message: 'exams deve ser "subjectId:AAAA-MM-DD,...".' } };
      }
      examMap[Number(subjectId)] = day;
    }
    return dailyPlan(db, request.actor.userId, { date, timezoneOverride: timezone, availableMinutes: minutes, perReviewMinutes: perReview, exams: examMap });
  });

  // EXPERIMENTAL (HG-09 / D-12 option 3), D4b: do the one review a unit requires, with D-13 (recovery) and D-14 (anchor) as named parameters.
  // Defaults = today's calendar. No screen uses it.
  app.post('/review-obligations/:unitId/complete', {
    schema: {
      params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          date: { type: 'string' }, timezone: { type: 'string', maxLength: 64 },
          profile: { type: 'string' }, recovery: { type: 'string' }, anchor: { type: 'string' },
          questionsCount: { type: 'integer' }, correctCount: { type: 'integer' }, operationKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const unitId = Number(request.params.unitId);
    if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    const { timezone, ...rest } = request.body ?? {};
    try {
      return reviews.completeObligation(db, request.actor.userId, unitId, { ...rest, timezoneOverride: timezone });
    } catch (err) { return handleError(err, reply); }
  });

  // EXPERIMENTAL: pause / resume the reviews of one unit (append-only fact, idempotent; completes and re-dates nothing).
  for (const action of ['pause', 'resume']) {
    app.post(`/review-obligations/:unitId/${action}`, {
      schema: { params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } } },
    }, async (request, reply) => {
      const unitId = Number(request.params.unitId);
      if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
      try {
        return (action === 'pause' ? reviews.pauseUnit : reviews.resumeUnit)(db, request.actor.userId, unitId);
      } catch (err) { return handleError(err, reply); }
    });
  }

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
