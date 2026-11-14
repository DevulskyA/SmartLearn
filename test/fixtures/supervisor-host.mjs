// A "supervisor" process for test/process-supervisor.test.js: starts process-tree.mjs under spawnSupervised, forwards its output,
// prints "RUN <runId> <helperPid>", and lives until it is killed (the test kills it to prove the tree dies with it).
import { fileURLToPath } from 'node:url';
import { spawnSupervised } from '../../scripts/process-supervisor.mjs';

const tree = fileURLToPath(new URL('./process-tree.mjs', import.meta.url));
const { child, runId } = spawnSupervised({ exe: process.execPath, args: [tree], stdio: ['ignore', 'pipe', 'inherit'], label: 'host-fixture', dir: process.env.SL_TEST_REGISTRY });
console.log(`RUN ${runId} ${child.pid}`);
child.stdout.on('data', (buf) => process.stdout.write(buf));
child.on('exit', () => process.exit(0));
