import { test } from 'node:test';
import assert from 'node:assert/strict';

// Characterization of the connectivity banner text in offline-ui.js. Browser globals are faked: the banner element, a
// localStorage that remembers one account, and an IndexedDB whose snapshot row the test controls.
const banner = { hidden: true, textContent: '', style: {}, setAttribute() {} };
let snapshot = null;
globalThis.document = { createElement: () => banner, body: { prepend() {} } };
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
globalThis.localStorage = { getItem: () => 'acc-1', setItem() {}, removeItem() {} };
globalThis.indexedDB = {
  open() {
    const req = {};
    const db = {
      objectStoreNames: { contains: () => true },
      close() {},
      transaction() {
        const tx = {};
        tx.objectStore = () => ({
          get() {
            const r = { result: snapshot };
            setTimeout(() => r.onsuccess?.(), 0);
            return r;
          },
        });
        setTimeout(() => tx.oncomplete?.(), 2);
        return tx;
      },
    };
    setTimeout(() => { req.result = db; req.onsuccess?.(); }, 0);
    return req;
  },
};
const { refreshIndicator } = await import('../src/offline-ui.js');

test('offline with a synced snapshot shows the read-only banner with the sync time', async () => {
  const synced = new Date(2026, 9, 15, 9, 5);
  snapshot = { accountId: 'acc-1', syncedAt: synced.toISOString() };
  await refreshIndicator();
  const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.syncedAt));
  assert.equal(banner.hidden, false);
  assert.equal(banner.textContent, `Você está offline — somente leitura. Última sincronização: ${when}.`);
});

test('offline with no synced snapshot says that no agenda is on this device yet', async () => {
  snapshot = null;
  await refreshIndicator();
  assert.equal(banner.hidden, false);
  assert.equal(banner.textContent, 'Você está offline — nenhuma agenda sincronizada neste dispositivo ainda; ações não estão disponíveis.');
});

test('online: the banner is hidden', async () => {
  navigator.onLine = true;
  await refreshIndicator();
  assert.equal(banner.hidden, true);
  navigator.onLine = false;
});
