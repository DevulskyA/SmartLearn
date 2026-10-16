// T-F6-02: every port an e2e run uses is derived from the run, so two runs (or a leftover process from an earlier one) cannot
// collide. `scripts/e2e.mjs` picks a free Vite port and a free block of server ports and passes them through the environment;
// run directly (`npx playwright test`) the historical defaults apply (Vite 5199, server ports exactly as written in the specs).
export const VITE_PORT = Number(process.env.E2E_VITE_PORT || 5199);
export const VITE_ORIGIN = `http://localhost:${VITE_PORT}`;
const OFFSET = Number(process.env.E2E_PORT_OFFSET || 0);
// Playwright runs spec files in parallel workers; each worker gets its own 1000-port lane so two files never share a server port.
const LANE = 1000 * Number(process.env.TEST_PARALLEL_INDEX || 0);
/** The server/stub port a spec asks for (its historical number) moved into this run's block and this worker's lane. */
export const serverPort = (historical) => historical + OFFSET + LANE;
