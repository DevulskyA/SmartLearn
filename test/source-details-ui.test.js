// Characterization of the shared "origin" block (moved out of src/app.js): the exact DOM it builds, what it
// leaves out, and when appendSummarySources shows nothing. Uses a tiny fake `document` — the module only needs
// createElement/append/textContent/className.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeEl {
  constructor(tagName) { this.tagName = tagName; this.className = ''; this.textContent = ''; this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  querySelector(selector) {
    assert.equal(selector, ':scope > .summary-source');
    return this.children.find((c) => c.className.split(' ').includes('summary-source')) ?? null;
  }
  remove() { this.removed = true; this.parent.children = this.parent.children.filter((c) => c !== this); }
  /** Shape the e2e specs read: tag, class, text, children. */
  shape() { return { tag: this.tagName, cls: this.className, text: this.textContent, kids: this.children.map((c) => c.shape()) }; }
}
globalThis.document = { createElement: (tag) => new FakeEl(tag) };

const { formatPageList, createSourceDetails, appendSummarySources } = await import('../src/source-details-ui.js');

test('formatPageList: compact, sorted, de-duplicated ranges', () => {
  assert.equal(formatPageList([3]), '3');
  assert.equal(formatPageList([1, 2, 3]), '1–3');
  assert.equal(formatPageList([4, 3, 1, 3]), '1, 3–4');
  assert.equal(formatPageList([1, 3, 5]), '1, 3, 5');
  assert.equal(formatPageList([]), '');
});

test('createSourceDetails: collapsed <details> with a <summary> label, then label+text per page', () => {
  const el = createSourceDetails('Origem do resumo · a.pdf, página 2', [
    { pageIndex: 2, text: 'texto da página' },
  ]);
  assert.deepEqual(el.shape(), {
    tag: 'details', cls: 'study-now-source summary-source', text: '',
    kids: [
      { tag: 'summary', cls: '', text: 'Origem do resumo · a.pdf, página 2', kids: [] },
      { tag: 'p', cls: 'study-now-error-label', text: 'Página 2', kids: [] },
      { tag: 'p', cls: 'study-now-source-text', text: 'texto da página', kids: [] },
    ],
  });
});

test('createSourceDetails: a page without text is left out entirely (no empty label)', () => {
  const el = createSourceDetails('x', [{ pageIndex: 1, text: '' }, { pageIndex: 2 }, { pageIndex: 3, text: 'ok' }]);
  assert.deepEqual(el.children.slice(1).map((c) => c.textContent), ['Página 3', 'ok']);
});

test('appendSummarySources: nothing is shown without an API, without a container, or when the call fails', async () => {
  const container = new FakeEl('div');
  await appendSummarySources(container, 1, null);
  await appendSummarySources(container, 1, undefined);
  await appendSummarySources(container, 1, {}); // API without summarySources (offline store)
  await appendSummarySources(null, 1, { summarySources: async () => [{ pageIndex: 1, sourceName: 'a', pageText: 't' }] });
  await appendSummarySources(container, 1, { summarySources: async () => { throw new Error('offline'); } });
  assert.equal(container.children.length, 0);
});

test('appendSummarySources: no sources = nothing shown; with sources = one origin block, pages listed compactly', async () => {
  const empty = new FakeEl('div');
  await appendSummarySources(empty, 7, { summarySources: async () => [] });
  assert.equal(empty.children.length, 0);

  const container = new FakeEl('div');
  const asked = [];
  await appendSummarySources(container, 7, {
    summarySources: async (id) => { asked.push(id); return [
      { pageIndex: 2, sourceName: 'fisio.pdf', pageText: 'dois' },
      { pageIndex: 1, sourceName: 'fisio.pdf', pageText: 'um' },
    ]; },
  });
  assert.deepEqual(asked, [7]);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[0].textContent, 'Origem do resumo · fisio.pdf, páginas 1–2');
});

test('appendSummarySources: a re-render replaces the previous origin block instead of stacking', async () => {
  const container = new FakeEl('div');
  const api = { summarySources: async () => [{ pageIndex: 1, sourceName: 'a.pdf', pageText: 't' }] };
  await appendSummarySources(container, 1, api);
  const first = container.children[0];
  first.parent = container;
  await appendSummarySources(container, 1, api);
  assert.equal(first.removed, true);
  assert.equal(container.children.filter((c) => c.className.includes('summary-source')).length, 1);
});
