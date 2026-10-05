import * as drafts from '../services/generated-drafts.js';
import { acceptDraft, previewAcceptance, AcceptDraftError } from '../services/accept-draft.js';
import { config } from '../config.js';

function handleError(err, reply) {
  if (err instanceof drafts.DraftError || err instanceof AcceptDraftError) {
    const statusByCode = {
      NOT_FOUND: 404,
      INPUT_TOO_LARGE: 413, NO_USABLE_TEXT: 409,
      INVALID_DRAFT: 502,
      LANGUAGE_MISMATCH: 502,
      BUDGET_EXCEEDED: 429,
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
      SCOPE_VIOLATION: 409,
      NOT_GENERATABLE: 409,
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
      body: { type: 'object', properties: { promptVersion: { type: 'string' }, regenerate: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const draft = await drafts.createDraft(db, request.actor.userId, id, {
        regenerate: request.body?.regenerate === true,
        // Deliberately NO locale hint from the browser: the first generation initializes generationLocale from the interface
        // the student is actually using (pt-BR today), never from an Accept-Language header that may disagree with it.
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
      });
      reply.status(draft.reused ? 200 : 201);
      return { draft };
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

  // T-F2-01: replacing the whole question list by position was removed — it could not tell a reorder from a
  // replacement, so a REJECTED status could land on the wrong question. Edit one entity at a time instead.
  app.patch('/drafts/:id', async (request, reply) => {
    reply.status(410);
    return {
      error: {
        code: 'ENDPOINT_REMOVED',
        message: 'Esta operação foi removida. Use PATCH /drafts/:id/summary para o resumo e PATCH ou DELETE /drafts/:id/questions/:questionId para uma questão.',
      },
    };
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

  app.post('/drafts/:id/questions', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['question', 'answer', 'sourceSpans'],
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          explanation: { type: ['string', 'null'] },
          hint: { type: ['string', 'null'] },
          questionType: { type: ['string', 'null'] },
          sourceSpans: { type: 'array', items: { type: 'object', required: ['pageIndex'], properties: { pageIndex: { type: 'integer' } } } },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const draft = drafts.addQuestion(db, request.actor.userId, id, request.body);
      reply.status(201);
      return { draft };
    } catch (err) { return handleError(err, reply); }
  });

  // `order` is a static segment, so it wins over `:questionId`; real question ids are always `q<n>`, never "order".
  app.patch('/drafts/:id/questions/order', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['order'], properties: { order: { type: 'array', items: { type: 'string' } }, expectedRevision: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.reorderQuestions(db, request.actor.userId, id, request.body.order, { expectedRevision: request.body.expectedRevision }) };
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

  // Read-only: what accepting would create, computed by the same preparation as the acceptance (nothing is written).
  app.get('/drafts/:id/accept-preview', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' }, newSubjectName: { type: 'string' }, newSubjectColor: { type: 'string' },
          studyDate: { type: 'string' }, expectedRevision: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    const q = request.query;
    const asInteger = (value, field) => {
      if (value === undefined) return undefined;
      const n = Number(value);
      if (!Number.isInteger(n)) throw new AcceptDraftError('VALIDATION_FAILED', `${field} deve ser um número inteiro.`, field);
      return n;
    };
    try {
      return {
        preview: previewAcceptance(db, request.actor.userId, id, {
          subjectId: asInteger(q.subjectId, 'subjectId'),
          newSubjectName: q.newSubjectName,
          newSubjectColor: q.newSubjectColor,
          studyDate: q.studyDate,
          expectedRevision: asInteger(q.expectedRevision, 'expectedRevision'),
        }),
      };
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
