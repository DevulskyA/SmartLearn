import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { summaryExtensions } from '../src/summary-visual-schema.js';
import { markdownToDoc, docToMarkdown, serializeVerified } from '../shared/summary-doc.js';
import { CORPUS } from './summary-corpus.js';

// The converter produces documents; the editor's schema decides what a document may hold. These tests keep the two in agreement WITHOUT a
// browser: a node or attribute the converter emits and the schema does not know made the editor refuse to open (the "Invalid JSON content" bug).
const schema = getSchema(summaryExtensions());
const load = (source) => { const parsed = markdownToDoc(source); return { ...parsed, node: schema.nodeFromJSON(parsed.doc) }; };

test('every document the converter produces is valid for the editor schema and keeps all its bookkeeping through the editor model', () => {
  for (const [name, source] of Object.entries(CORPUS)) {
    const { node, lead, tail } = load(source);
    node.check();
    assert.equal(docToMarkdown(node.toJSON(), { lead, tail }), source, name);
  }
});

test('the schema has no link, image, script or HTML node, and formatting is limited to bold, italic, strike and code', () => {
  assert.deepEqual(Object.keys(schema.marks).sort(), ['bold', 'code', 'italic', 'strike']);
  for (const forbidden of ['image', 'link', 'script', 'iframe', 'html']) assert.equal(schema.nodes[forbidden], undefined, forbidden);
  assert.equal(schema.nodes.mathInline.spec.marks, '', 'a formula atom carries no formatting');
});

test('edits made through the editor model: only the edited block changes, list spacing survives, a split block never merges back', () => {
  // an edit inside a loose list keeps the list loose
  let { node, lead, tail } = load('- a\n\n- b');
  let state = EditorState.create({ doc: node });
  const at = (doc, text) => { let found = -1; doc.descendants((n, pos) => { if (n.isText && n.text.includes(text) && found === -1) found = pos + n.text.indexOf(text) + text.length; }); return found; };
  state = state.apply(state.tr.insertText('2', at(state.doc, 'b')));
  assert.equal(serializeVerified(state.doc.toJSON(), { lead, tail }).text, '- a\n\n- b2');

  // splitting a paragraph in the middle (Enter): two paragraphs, the neighbours untouched
  ({ node, lead, tail } = load('Primeira metade segunda metade\n\n## Título\nfim'));
  state = EditorState.create({ doc: node });
  state = state.apply(state.tr.split(at(state.doc, 'Primeira metade')));
  const result = serializeVerified(state.doc.toJSON(), { lead, tail });
  assert.equal(result.text, 'Primeira metade\n\nsegunda metade\n\n## Título\nfim'); // the heading and its tight separator are the original bytes

  // typing in a heading that is followed by a tight line: the next block is not swallowed
  ({ node, lead, tail } = load('# Título\ntexto colado'));
  state = EditorState.create({ doc: node });
  state = state.apply(state.tr.insertText(' novo', at(state.doc, 'Título')));
  assert.equal(serializeVerified(state.doc.toJSON(), { lead, tail }).text, '# Título novo\n\ntexto colado');
});
