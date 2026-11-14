import * as drafts from '../services/generated-drafts.js';
import { acceptDraft, previewAcceptance, AcceptDraftError } from '../services/accept-draft.js';
import { config } from '../config.js';

export function handleError(err, reply) {
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
      FINDINGS_UNRESOLVED: 409,
      DECISION_PENDING: 409,
      DISCARD_NEEDS_CONFIRMATION: 409,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
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
        codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort, deferQuestions: config.codexDeferQuestions },
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

  // Discard an unfinished summary (status DRAFT only). `confirmDiscard=true` is required when the student edited it.
  // The book, the unit and any accepted lesson are never touched.
  app.delete('/drafts/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { confirmDiscard: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return drafts.discardDraftById(db, request.actor.userId, id, { confirmDiscard: request.query.confirmDiscard === 'true' });
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

  // Replacement decision (migration 043): a regenerate keeps the previous draft until the student chooses which to keep.
  // GET answers { pending: { newDraftId, previousDraftId, createdAt, expiresAt } | null }; POST applies KEEP_NEW or RESTORE_PREVIOUS
  // to the NEW draft (the one that carries the decision). Neither calls a provider or spends credit.
  app.get('/proposals/:id/decision', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { pending: drafts.loadPendingDecision(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/drafts/:id/decision', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { type: 'string', enum: ['KEEP_NEW', 'RESTORE_PREVIOUS'] }, confirmDiscard: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return drafts.decideReplacement(db, request.actor.userId, id, request.body.decision, { confirmDiscard: request.body.confirmDiscard === true });
    } catch (err) { return handleError(err, reply); }
  });

  // T-F2-03: explicit re-audit with the CURRENT deterministic rules (no model call). Opening a draft never does this.
  app.post('/drafts/:id/reaudit', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return drafts.reauditDraft(db, request.actor.userId, id);
    } catch (err) { return handleError(err, reply); }
  });

  // Granular edits: each touches ONE entity of the lesson (the summary, or one question by its stable id).
  app.patch('/drafts/:id/summary', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['summary'], properties: { summary: { type: 'string', maxLength: 200000 }, expectedVersion: { type: 'integer' } } },
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
          question: { type: 'string', maxLength: 5000 },
          answer: { type: 'string', maxLength: 5000 },
          explanation: { type: ['string', 'null'], maxLength: 5000 },
          hint: { type: ['string', 'null'], maxLength: 5000 },
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

  // A lesson accepted without questions asks for them later: opens (or returns) the draft that will carry them. No model is called here;
  // the questions are written by POST /generation-jobs { draftId } and reviewed before they are added to the lesson.
  app.post('/learning-units/:unitId/questions-draft', {
    schema: { params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } } },
  }, async (request, reply) => {
    const unitId = Number(request.params.unitId);
    if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { draft: drafts.createLessonQuestionsDraft(db, request.actor.userId, unitId) };
    } catch (err) { return handleError(err, reply); }
  });

  // Summary-first drafts: writes the questions after the summary, into the same DRAFT (still to be reviewed before the lesson is accepted).
  app.post('/drafts/:id/generate-questions', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const draft = await drafts.generateDeferredQuestions(db, request.actor.userId, id, {
        provider: config.aiProvider,
        consentGranted: config.aiConsentGranted,
        codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
        timeoutMs: config.aiRequestTimeoutMs,
        ...aiOptions,
      });
      return { draft };
    } catch (err) { return handleError(err, reply); }
  });

  // Per-excerpt corrections (P1-6): propose (one model call), accept one excerpt, dismiss one excerpt. Proposing never changes the summary.
  const correctionParams = { type: 'object', required: ['id', 'key'], properties: { id: { type: 'string' }, key: { type: 'string', pattern: '^[0-9a-f]{10}$' } } };
  app.post('/drafts/:id/corrections', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const draft = await drafts.proposeSummaryCorrections(db, request.actor.userId, id, {
        provider: config.aiProvider,
        consentGranted: config.aiConsentGranted,
        codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
        timeoutMs: config.aiRequestTimeoutMs,
        ...aiOptions,
      });
      return { draft };
    } catch (err) { return handleError(err, reply); }
  });
  app.post('/drafts/:id/corrections/:key/apply', { schema: { params: correctionParams } }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { draft: drafts.applySummaryCorrection(db, request.actor.userId, id, request.params.key) }; } catch (err) { return handleError(err, reply); }
  });
  app.delete('/drafts/:id/corrections/:key', { schema: { params: correctionParams } }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { draft: drafts.dismissSummaryCorrection(db, request.actor.userId, id, request.params.key) }; } catch (err) { return handleError(err, reply); }
  });

  // Meaning-flipping words lost from the summary (deterministic, no AI, no credit).
  app.get('/drafts/:id/fidelity', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { fidelity: drafts.summaryFidelity(db, request.actor.userId, id) }; } catch (err) { return handleError(err, reply); }
  });

  // History of the summary text (migration 048): list earlier versions, read one, restore one. Restoring keeps the text it replaces.
  const versionParams = { type: 'object', required: ['id', 'version'], properties: { id: { type: 'string' }, version: { type: 'string' } } };
  app.get('/drafts/:id/summary-versions', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { versions: drafts.listDraftSummaryVersions(db, request.actor.userId, id) }; } catch (err) { return handleError(err, reply); }
  });
  app.get('/drafts/:id/summary-versions/:version', { schema: { params: versionParams } }, async (request, reply) => {
    const id = Number(request.params.id);
    const version = Number(request.params.version);
    if (!Number.isInteger(id) || !Number.isInteger(version)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { version: drafts.readDraftSummaryVersion(db, request.actor.userId, id, version) }; } catch (err) { return handleError(err, reply); }
  });
  app.post('/drafts/:id/summary-versions/:version/restore', { schema: { params: versionParams } }, async (request, reply) => {
    const id = Number(request.params.id);
    const version = Number(request.params.version);
    if (!Number.isInteger(id) || !Number.isInteger(version)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try { return { draft: drafts.restoreSummaryVersion(db, request.actor.userId, id, version) }; } catch (err) { return handleError(err, reply); }
  });

  // On-demand independent model check of the summary as it is now (the student's own text included). Only reports; never rewrites.
  app.post('/drafts/:id/audit-summary', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const draft = await drafts.auditSummaryWithModel(db, request.actor.userId, id, {
        provider: config.aiProvider,
        consentGranted: config.aiConsentGranted,
        codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
        timeoutMs: config.aiRequestTimeoutMs,
        ...aiOptions,
      });
      return { draft };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/drafts/:id/questions', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['question', 'answer', 'sourceSpans'],
        properties: {
          question: { type: 'string', maxLength: 5000 },
          answer: { type: 'string', maxLength: 5000 },
          explanation: { type: ['string', 'null'], maxLength: 5000 },
          hint: { type: ['string', 'null'], maxLength: 5000 },
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
          subjectId: { type: 'string' }, newSubjectName: { type: 'string', maxLength: 100 }, newSubjectColor: { type: 'string', maxLength: 40 },
          studyDate: { type: 'string' }, lessonDate: { type: 'string' }, expectedRevision: { type: 'string' }, acknowledgeSummaryFindings: { type: 'string' },
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
          lessonDate: q.lessonDate,
          expectedRevision: asInteger(q.expectedRevision, 'expectedRevision'),
          acknowledgeSummaryFindings: q.acknowledgeSummaryFindings === 'true',
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
          newSubjectName: { type: 'string', maxLength: 100 },
          newSubjectColor: { type: 'string', maxLength: 40 },
          studyDate: { type: 'string' },
          lessonDate: { type: ['string', 'null'] },
          sourceKind: { type: ['string', 'null'], enum: ['APOSTILA', 'LIVRO', 'VIDEO', 'OUTRO', null] },
          expectedRevision: { type: 'integer' },
          acknowledgeSummaryFindings: { type: 'boolean' },
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
