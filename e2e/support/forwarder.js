// A TCP forwarder the test can cut: the page talks to it instead of the server, and `cut()` makes the server unreachable AT THE NETWORK LEVEL (open
// sockets destroyed, new connections dropped). Unlike a Playwright route or the context's offline mode, this outlives the page: a window that closes
// or dies in the middle of an edit cannot get a last request through, exactly like a real lost connection.
import net from 'node:net';

export async function startForwarder(listenPort, targetPort) {
  let open = true;
  const sockets = new Set();
  const server = net.createServer((client) => {
    if (!open) { client.destroy(); return; }
    const upstream = net.connect(targetPort, 'localhost');
    sockets.add(client);
    sockets.add(upstream);
    const done = () => { client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
    client.on('error', done);
    upstream.on('error', done);
    client.on('close', done);
    upstream.on('close', done);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, 'localhost', resolve); });
  return {
    cut() { open = false; for (const socket of sockets) socket.destroy(); },
    restore() { open = true; },
    async close() { open = false; for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); },
  };
}
