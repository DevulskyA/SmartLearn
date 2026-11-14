// The one wait every E2E spec uses before it talks to the real server it just spawned (it used to be 65 copies of an 8 s loop that
// failed with "real server did not become ready in time" whenever the machine was busy). Under load the deadline is generous
// (30 s, polled every 250 ms) but a server that really is broken still fails: the error names the URL, the time spent, the number of
// attempts and the LAST thing the server said (HTTP status + body, or the connection error), so a failure is diagnosable at once and
// is never reported as a bare timeout.
export const SERVER_READY_TIMEOUT_MS = 30_000;
export const SERVER_READY_POLL_MS = 250;
// one probe may not outlive the deadline by much, and a half-open connection must not swallow the whole budget
const PROBE_TIMEOUT_MS = 2_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plain-words description of why one probe did not succeed (Node's fetch hides the real code in `cause`). */
function describeFailure(err, probeLimitMs) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `no answer within ${probeLimitMs} ms (connection accepted or hung, no HTTP response)`;
  const cause = err?.cause?.code || err?.cause?.message;
  const causeText = cause ? ` (${cause})` : '';
  return `${err?.message || String(err)}${causeText}`;
}

/**
 * Resolves as soon as `GET ${baseUrl}${path}` answers HTTP 200. Rejects after `timeoutMs` with a message that says which URL, how long
 * it waited, how many probes ran and the last response or error.
 * @param {string} baseUrl  e.g. `http://localhost:13961`
 * @param {{ label?: string, path?: string, timeoutMs?: number, pollMs?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function waitForServerReady(baseUrl, { label = 'E2E', path = '/health/ready', timeoutMs = SERVER_READY_TIMEOUT_MS, pollMs = SERVER_READY_POLL_MS, fetchImpl = fetch } = {}) {
  const url = `${baseUrl}${path}`;
  const startedAt = Date.now();
  let attempts = 0;
  let last = 'no probe finished';
  for (;;) {
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    attempts += 1;
    const probeLimit = Math.min(PROBE_TIMEOUT_MS, remaining);
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(probeLimit) });
      if (response.status === 200) return;
      const body = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      const bodyText = body ? ` ${body}` : '';
      last = `HTTP ${response.status}${bodyText}`;
    } catch (err) {
      last = describeFailure(err, probeLimit);
    }
    await sleep(Math.min(pollMs, Math.max(timeoutMs - (Date.now() - startedAt), 0)));
  }
  const elapsed = Date.now() - startedAt;
  throw new Error(`${label}: real server did not become ready in time. GET ${url} did not return HTTP 200 within ${timeoutMs} ms (waited ${elapsed} ms, ${attempts} attempts). Last response: ${last}`);
}
