import { DraftError, selectProvider, hasReusableContent, reuseOnlyProvider } from '../services/generated-drafts.js';
import * as jobs from '../services/generation-jobs.js';
import { SUPPORTED_LOCALES } from '../../../shared/locales.js';
import { resolveAiSettings } from '../services/generation-job-runner.js';

function handleError(err, reply) {
  if (err instanceof jobs.JobError || err instanceof DraftError) {
    const statusByCode = {
      NOT_FOUND: 404, VALIDATION_FAILED: 400, UNKNOWN_PROVIDER: 400,
      INPUT_TOO_LARGE: 413, NO_USABLE_TEXT: 409, NOT_GENERATABLE: 409, SCOPE_VIOLATION: 409, SCOPE_CHANGED: 409,
      INVALID_TRANSITION: 409, MISSING_CREDENTIALS: 409, DECISION_PENDING: 409, INVALID_STATE: 409, GENERATION_IN_PROGRESS: 409, SOURCE_CHANGED: 409,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
  }
  throw err;
}

/**
 * T-F3-01/02: the generation job. Creating a job validates and records it and hands it to the runner, which does the work outside
 * this request; the request returns the job at once. `aiOptions` overrides config.js's provider settings in tests, same as
 * registerGeneratedDraftRoutes.
 */
export function registerGenerationJobRoutes(app, db, aiOptions = {}, runner) {
  app.post('/generation-jobs', {
    schema: {
      // proposalId: the summary job. draftId: the questions job of that (summary-first or lesson-questions) draft.
      body: { type: 'object', minProperties: 1, properties: { proposalId: { type: 'integer', minimum: 1 }, draftId: { type: 'integer', minimum: 1 }, regenerate: { type: 'boolean' }, targetLocale: { type: 'string', enum: SUPPORTED_LOCALES } } },
    },
  }, async (request, reply) => {
    try {
      const settings = resolveAiSettings(aiOptions);
      // Selecting only builds the provider description (name, live, how many calls it may make); nothing is sent anywhere.
      const { proposalId, draftId } = request.body;
      let selected;
      try {
        selected = settings.providerImpl ?? selectProvider(settings);
      } catch (err) {
        // No AI consent/credentials is not a refusal when reviewed content for exactly this text already exists: that needs no model and no credit.
        const reusable = err instanceof DraftError && err.code === 'MISSING_CREDENTIALS'
          && hasReusableContent(db, request.actor.userId, { proposalId: proposalId ?? null, draftId: draftId ?? null, regenerate: request.body.regenerate === true || request.body.targetLocale !== undefined,
            targetLocale: request.body.targetLocale ?? null, deferQuestions: settings.codex?.deferQuestions === true, maxInputChars: settings.maxInputChars });
        if (!reusable) throw err;
        selected = reuseOnlyProvider(err);
      }
      // callPlan (Codex only) lets the job estimate a split generation as the several calls it really is.
      const provider = {
        name: selected.name, live: selected.live === true, plannedCalls: 1 + (selected.audit ? 1 : 0) + (selected.repair ? 1 : 0),
        callPlan: selected.callPlan, deferQuestions: typeof selected.callPlan === 'function' && settings.codex?.deferQuestions === true,
      };
      if ((proposalId === undefined) === (draftId === undefined)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED', field: 'proposalId' } }; }
      const { job, created } = draftId !== undefined
        ? jobs.createQuestionsJob(db, request.actor.userId, draftId, { provider: { ...provider, plannedCalls: 1 }, maxInputChars: settings.maxInputChars })
        : jobs.createJob(db, request.actor.userId, proposalId, {
          provider, targetLocale: request.body.targetLocale ?? null,
          // a translation is always a new draft beside the previous one: the student decides which to keep
          regenerate: request.body.regenerate === true || request.body.targetLocale !== undefined, maxInputChars: settings.maxInputChars,
        });
      // A job nobody in this process is running (new, or left QUEUED by a crash) is handed to the runner; a running one is left alone.
      if (job.state === 'QUEUED') runner.start({ ...job, userId: request.actor.userId });
      reply.status(created ? 201 : 200);
      return { job };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/generation-jobs', {
    schema: { querystring: { type: 'object', properties: { proposalId: { type: 'string' } } } },
  }, async (request, reply) => {
    try {
      const raw = request.query.proposalId;
      const proposalId = raw === undefined ? null : Number(raw);
      if (proposalId !== null && !Number.isInteger(proposalId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED', field: 'proposalId' } }; }
      return { jobs: jobs.listJobs(db, request.actor.userId, { proposalId }) };
    } catch (err) { return handleError(err, reply); }
  });

  // Stops a generation: the provider's whole process tree is terminated and the job ends CANCELLED. Idempotent; another user's job is 404.
  app.post('/generation-jobs/:id/cancel', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { job: await runner.cancel(request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/generation-jobs/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { job: jobs.getJob(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });
}
