import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyUnit, UNIT_KIND } from '../src/services/unit-kind.js';

const kindOf = (title, text) => classifyUnit(title, text).kind;

test('ordinary study content is CONTENT and generatable', () => {
  for (const title of ['Glomerular Filtration', 'Measurement of Glomerular Filtration Rate', 'Insuficiência cardíaca', 'Transport Across Cell Membranes', 'Summary of Starling Forces']) {
    const v = classifyUnit(title, 'texto');
    assert.equal(v.kind, UNIT_KIND.CONTENT, title);
    assert.equal(v.generatable, true, title);
  }
});

test('the editorial pages seen in the real Costanzo are not generatable', () => {
  assert.equal(kindOf('Copyright Page'), UNIT_KIND.COPYRIGHT);
  assert.equal(kindOf('Dedication'), UNIT_KIND.DEDICATION);
  assert.equal(kindOf('Preface'), UNIT_KIND.PREFACE);
  assert.equal(kindOf('Acknowledgments'), UNIT_KIND.ACKNOWLEDGMENTS);
  assert.equal(kindOf('Summary'), UNIT_KIND.SUMMARY);
  assert.equal(kindOf('Challenge Yourself'), UNIT_KIND.EXERCISE);
  assert.equal(kindOf('Challenge Yourself Answers'), UNIT_KIND.ANSWER_KEY);
  assert.equal(kindOf('Appendix A'), UNIT_KIND.APPENDIX);
  for (const title of ['Copyright Page', 'Dedication', 'Preface', 'Acknowledgments', 'Summary', 'Challenge Yourself', 'Challenge Yourself Answers']) {
    assert.equal(classifyUnit(title).generatable, false, title);
  }
});

test('Portuguese and Spanish editorial vocabulary is recognised too', () => {
  assert.equal(kindOf('Dedicatória'), UNIT_KIND.DEDICATION);
  assert.equal(kindOf('Prefácio'), UNIT_KIND.PREFACE);
  assert.equal(kindOf('Agradecimentos'), UNIT_KIND.ACKNOWLEDGMENTS);
  assert.equal(kindOf('Gabarito'), UNIT_KIND.ANSWER_KEY);
  assert.equal(kindOf('Referências'), UNIT_KIND.REFERENCE);
  assert.equal(kindOf('Sumário'), UNIT_KIND.FRONT_MATTER);
  assert.equal(kindOf('Exercícios'), UNIT_KIND.EXERCISE);
});

test('a merged unit with any real content stays content; a merged unit of only editorial parts does not', () => {
  assert.equal(kindOf('Menopause · Summary'), UNIT_KIND.CONTENT);
  assert.equal(kindOf('Vitamins · Calcium'), UNIT_KIND.CONTENT);
  assert.equal(kindOf('Summary · Challenge Yourself'), UNIT_KIND.SUMMARY);
});

test('an untitled unit is judged by editorial markers in a SHORT text only', () => {
  assert.equal(kindOf(null, 'Copyright © 2020 Wolters Kluwer. All rights reserved. ISBN 978-1-9751-5001-3'), UNIT_KIND.COPYRIGHT);
  assert.equal(kindOf(null, 'x'.repeat(5000) + ' all rights reserved'), UNIT_KIND.CONTENT);
  assert.equal(kindOf(null, 'A filtração glomerular é a primeira etapa.'), UNIT_KIND.CONTENT);
});

test('a title that merely CONTAINS an editorial word is still content', () => {
  assert.equal(kindOf('Dedicated Transport Proteins'), UNIT_KIND.CONTENT);
  assert.equal(kindOf('The Preface Effect in Drug Dosing'), UNIT_KIND.CONTENT);
});
