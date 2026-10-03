import * as drafts from '../services/generated-drafts.js';
import { acceptDraft, AcceptDraftError } from '../services/accept-draft.js';
import { config } from '../config.js';

function handleError(err, reply) {
  if (err instanceof drafts.DraftError || err instanceof AcceptDraftError) {
    const statusByCode = {
      NOT_FOUND: 404,
      INPUT_TOO_LARGE: 413, NO_USABLE_TEXT: 409,
      INVALID_DRAFT: 502,
      MISSING_CREDENTIALS: 409,
      TIMEOUT: 504,
      PROVIDER_ERROR: 502,
      CODEX_NOT_FOUND: 503,
      CODEX_NOT_AUTHENTICATED: 503,
      CALL_LIMIT_EXCEEDED: 502,
      NETWORK_ERROR: 502,
      VALIDATION_FAILED: 400,
      INVALID_STATE: 409,
      SUBJECT_CONFLICT: 409,
      REVISION_CONFLICT: 409,
      ENTITY_CONFLICT: 409,
      SOURCE_CHANGED: 409,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

/**
 * `aiOptions` lets tests/dev override config.js's provider settings (same
 * pattern as `sources` in routes/sources.js) — production always reads
 * from the real environment-backed config.
 */
export function registerGeneratedDraftRoutes(app, db, aiOptions = {}) {
  app.post('/proposals/:id/drafts', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { promptVersion: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      reply.status(201);
      return {
        draft: await drafts.createDraft(db, request.actor.userId, id, {
          // undefined -> createDraft's own default (the CURRENT prompt version), so a stored draft is labelled with the prompt that really produced it
          promptVersion: request.body?.promptVersion,
          apiUrl: config.aiApiUrl,
          apiKey: config.aiApiKey,
          model: config.aiModel,
          provider: config.aiProvider,
          consentGranted: config.aiConsentGranted,
          budgetCapUsd: config.aiBudgetCapUsd,
          codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
          timeoutMs: config.aiRequestTimeoutMs,
          maxInputChars: config.aiMaxInputChars,
          ...aiOptions,
        }),
      };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/proposals/:id/drafts', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { drafts: drafts.listDrafts(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/drafts/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.getDraft(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/drafts/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['question', 'answer', 'sourceSpans'],
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
                explanation: { type: ['string', 'null'] },
                questionType: { type: ['string', 'null'] },
                hint: { type: ['string', 'null'] },
                sourceSpans: { type: 'array', items: { type: 'object', required: ['pageIndex'], properties: { pageIndex: { type: 'integer' } } } },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.reviseDraft(db, request.actor.userId, id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  // Granular edits: each touches ONE entity of the lesson (the summary, or one question by its stable id).
  app.patch('/drafts/:id/summary', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' }, expectedVersion: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.reviseSummary(db, request.actor.userId, id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/drafts/:id/questions/:questionId', {
    schema: {
      params: { type: 'object', required: ['id', 'questionId'], properties: { id: { type: 'string' }, questionId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          explanation: { type: ['string', 'null'] },
          hint: { type: ['string', 'null'] },
          questionType: { type: ['string', 'null'] },
          sourceSpans: { type: 'array', items: { type: 'object', required: ['pageIndex'], properties: { pageIndex: { type: 'integer' } } } },
          status: { type: 'string' },
          expectedVersion: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.reviseQuestion(db, request.actor.userId, id, request.params.questionId, request.body ?? {}) };
    } catch (err) { return handleError(err, reply); }
  });

  app.delete('/drafts/:id/questions/:questionId', {
    schema: { params: { type: 'object', required: ['id', 'questionId'], properties: { id: { type: 'string' }, questionId: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.deleteQuestion(db, request.actor.userId, id, request.params.questionId) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/drafts/:id/accept', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['studyDate', 'expectedRevision'],
        properties: {
          subjectId: { type: 'integer' },
          newSubjectName: { type: 'string' },
          newSubjectColor: { type: 'string' },
          studyDate: { type: 'string' },
          expectedRevision: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { acceptance: acceptDraft(db, request.actor.userId, id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });
}
