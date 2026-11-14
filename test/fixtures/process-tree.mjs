// Disposable process tree for test/process-supervisor.test.js: this process spawns a grandchild that listens on a free port and idles.
// Prints "TREE <ownPid> <grandchildPid> <port>" once the grandchild listens. `node process-tree.mjs exit <code>` just exits.
import { spawn } from 'node:child_process';

if (process.argv[2] === 'exit') process.exit(Number(process.argv[3] ?? 0));
const code = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port)});setInterval(()=>{},1000)";
const grandchild = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
grandchild.stdout.once('data', (buf) => {
  console.log(`TREE ${process.pid} ${grandchild.pid} ${String(buf).trim()}`);
});
setTimeout(() => process.exit(0), 120_000);
