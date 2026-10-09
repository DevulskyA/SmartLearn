import { DraftError, selectProvider } from '../services/generated-drafts.js';
import * as jobs from '../services/generation-jobs.js';
import { resolveAiSettings } from '../services/generation-job-runner.js';

function handleError(err, reply) {
  if (err instanceof jobs.JobError || err instanceof DraftError) {
    const statusByCode = {
      NOT_FOUND: 404, VALIDATION_FAILED: 400, UNKNOWN_PROVIDER: 400,
      INPUT_TOO_LARGE: 413, NO_USABLE_TEXT: 409, NOT_GENERATABLE: 409, SCOPE_VIOLATION: 409, SCOPE_CHANGED: 409,
      INVALID_TRANSITION: 409, MISSING_CREDENTIALS: 409,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
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
      body: { type: 'object', required: ['proposalId'], properties: { proposalId: { type: 'integer', minimum: 1 }, regenerate: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    try {
      const settings = resolveAiSettings(aiOptions);
      // Selecting only builds the provider description (name, live, how many calls it may make); nothing is sent anywhere.
      const selected = settings.providerImpl ?? selectProvider(settings);
      const provider = { name: selected.name, live: selected.live === true, plannedCalls: 1 + (selected.audit ? 1 : 0) + (selected.repair ? 1 : 0) };
      const { job, created } = jobs.createJob(db, request.actor.userId, request.body.proposalId, {
        provider, regenerate: request.body.regenerate === true, maxInputChars: settings.maxInputChars,
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
