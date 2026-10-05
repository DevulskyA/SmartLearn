import { config } from '../config.js';
import { DraftError, selectProvider } from '../services/generated-drafts.js';
import * as jobs from '../services/generation-jobs.js';

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
 * T-F3-01: the generation job record. Creating a job validates and records; it never calls a provider (T-F3-02 runs it).
 * `aiOptions` overrides config.js's provider settings in tests, same as registerGeneratedDraftRoutes.
 */
export function registerGenerationJobRoutes(app, db, aiOptions = {}) {
  app.post('/generation-jobs', {
    schema: {
      body: { type: 'object', required: ['proposalId'], properties: { proposalId: { type: 'integer', minimum: 1 }, regenerate: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    try {
      const settings = {
        apiUrl: config.aiApiUrl, apiKey: config.aiApiKey, model: config.aiModel, provider: config.aiProvider,
        consentGranted: config.aiConsentGranted, budgetCapUsd: config.aiBudgetCapUsd,
        codex: { command: config.codexCommand, model: config.codexModel, timeoutMs: config.codexTimeoutMs, reasoningEffort: config.codexReasoningEffort },
        maxInputChars: config.aiMaxInputChars,
        ...aiOptions,
      };
      // Selecting only builds the provider description (name, live, how many calls it may make); nothing is sent anywhere.
      const selected = selectProvider(settings);
      const provider = { name: selected.name, live: selected.live === true, plannedCalls: 1 + (selected.audit ? 1 : 0) + (selected.repair ? 1 : 0) };
      const { job, created } = jobs.createJob(db, request.actor.userId, request.body.proposalId, {
        provider, regenerate: request.body.regenerate === true, maxInputChars: settings.maxInputChars,
      });
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
