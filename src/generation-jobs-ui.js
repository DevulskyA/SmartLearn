// T-F3-04: the generation JOB API (/v1/generation-jobs). DOM-free, like draft-review-ui.js and source-proposals-ui.js: it only
// talks to the server. A job is generated outside the request that created it, so the student can leave and come back; the state
// shown always comes from here, never from a timer that started in the browser.
import { apiRequest, ApiError, NetworkError } from './api-client.js';

function fail(err) {
  if (err instanceof ApiError) return { ok: false, code: err.code, message: err.message, field: err.field };
  if (err instanceof NetworkError) return { ok: false, code: 'NETWORK_ERROR', message: 'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.' };
  throw err;
}

/** Records the job for one approved trecho and hands it to the server; returns at once. An already active job is returned as is. */
export async function createJob(proposalId) {
  try {
    const { job } = await apiRequest('/v1/generation-jobs', { method: 'POST', body: { proposalId } });
    return { ok: true, job };
  } catch (err) { return fail(err); }
}

/** The student's jobs, newest first (all documents): one request tells the state of every trecho. */
export async function listJobs() {
  try {
    const { jobs } = await apiRequest('/v1/generation-jobs');
    return { ok: true, jobs };
  } catch (err) { return fail(err); }
}

/** Stops the job; the server ends the provider's whole process tree and answers with the job as it ended (idempotent). */
export async function cancelJob(jobId) {
  try {
    const { job } = await apiRequest(`/v1/generation-jobs/${jobId}/cancel`, { method: 'POST', body: {} });
    return { ok: true, job };
  } catch (err) { return fail(err); }
}
