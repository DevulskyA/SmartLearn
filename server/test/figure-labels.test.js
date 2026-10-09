import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFigureLabels } from '../src/pdf/page-text.js';

// SPRINT 05g (FIGURE LABELS). Found on a real page (Kumar & Clark, ch. 6, p. 8 of the chapter): the text of a figure
// (its labels) arrives as twenty short lines in the middle of the prose, right before the caption. Read as prose they
// are noise for the student and for the model. They are kept, word for word, but set apart from the prose as one line.

const PROSE = 'In structural terms, antibodies have four chains: two identical heavy and two identical light chains (Fig. 6.6).';
const LABELS = ['Activation of inflammation genes', 'T cell', 'T cell activation', 'bacteria', 'HLA class II', 'Peptide epitope from pathogen', 'Toll-like receptors', '[Signal 3]', 'Migrate to lymph node'];
const CAPTION = 'Fig. 6.5 Dendritic cell activation of T lymphocytes. (A) Immature dendritic cells (DCs) in the tissues are activated.';

test('the label lines right before a figure caption become one separate line, word for word', () => {
  const out = groupFigureLabels([PROSE, ...LABELS, CAPTION].join('\n'));
  assert.equal(out, [PROSE, '', LABELS.join(' · '), CAPTION].join('\n'));
});

test('two figures on one page are each grouped', () => {
  const second = ['Constant', 'Hypervariable region', 'Complement-binding region', 'Fab antigen binding', 'Light chain, L'];
  const out = groupFigureLabels([PROSE, ...LABELS, CAPTION, ...second, 'Fig. 6.6 Immunoglobulin structure.'].join('\n'));
  assert.equal(out, [PROSE, '', LABELS.join(' · '), CAPTION, '', second.join(' · '), 'Fig. 6.6 Immunoglobulin structure.'].join('\n'));
});

test('nothing is added, dropped or reordered: the words are identical apart from the separators', () => {
  const text = [PROSE, ...LABELS, CAPTION].join('\n');
  const words = (s) => s.replace(/[\s·]+/g, ' ').trim();
  assert.equal(words(groupFigureLabels(text)), words(text));
});

test('a heading, a short list before a caption, a table and a contents page are left exactly as they are', () => {
  const heading = [PROSE, 'Immunoglobulins', PROSE].join('\n');
  assert.equal(groupFigureLabels(heading), heading);

  const few = [PROSE, 'T cell', 'bacteria', 'HLA class II', 'Toll-like receptors', CAPTION].join('\n');
  assert.equal(groupFigureLabels(few), few, 'four short lines are not a figure');

  const table = [PROSE, 'Category', 'Cells', 'Main features', 'Origin', 'Special features', 'Table 6.1 Cells of the immune system'].join('\n');
  assert.equal(groupFigureLabels(table), table, 'a block that precedes a Table title is not figure text');

  const contents = ['Contents', 'Cytokines 81', 'Chemokines 81', 'Complement 82', 'Neutrophils 83', 'Eosinophils 83', 'Monocytes 84'].join('\n');
  assert.equal(groupFigureLabels(contents), contents);
});

test('prose lines are never swallowed into the label block', () => {
  const text = [PROSE, 'The receptor binds the ligand with high affinity in the tissue.', ...LABELS, CAPTION].join('\n');
  const out = groupFigureLabels(text).split('\n');
  assert.equal(out[0], PROSE);
  assert.equal(out[1], 'The receptor binds the ligand with high affinity in the tissue.');
  assert.equal(out[2], '');
});

test('empty input and a caption without labels are safe', () => {
  assert.equal(groupFigureLabels(''), '');
  assert.equal(groupFigureLabels(CAPTION), CAPTION);
});

test('a long axis/legend label (about 50 characters) still belongs to the figure block', () => {
  const labels = ['Light chain, L Constant domainC', 'Heavy chain, H Variable domainV α ε γ γ α γ γ δ μ', 'Fab antigen binding', 'Fc', 'VL', 'CH'];
  const out = groupFigureLabels([PROSE, ...labels, 'Fig. 6.6 Immunoglobulin structure.'].join('\n'));
  assert.equal(out, [PROSE, '', labels.join(' · '), 'Fig. 6.6 Immunoglobulin structure.'].join('\n'));
});
