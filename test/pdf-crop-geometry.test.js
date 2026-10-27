import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rectFromPoints, isUsableRect, moveRect, resizeRect, pixelBox, normalizeRotation, MIN_FRACTION } from '../shared/pdf-crop-geometry.js';

test('a drag in any direction gives the same normalized rectangle, clamped to the page', () => {
  const forward = rectFromPoints({ x: 100, y: 50 }, { x: 300, y: 250 }, 400, 500);
  const backward = rectFromPoints({ x: 300, y: 250 }, { x: 100, y: 50 }, 400, 500);
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward, { x: 0.25, y: 0.1, w: 0.5, h: 0.4 });
  const outside = rectFromPoints({ x: -50, y: -10 }, { x: 900, y: 900 }, 400, 500);
  assert.deepEqual(outside, { x: 0, y: 0, w: 1, h: 1 });
});

test('a click or a sliver is not a usable region', () => {
  assert.equal(isUsableRect(rectFromPoints({ x: 10, y: 10 }, { x: 11, y: 11 }, 400, 500)), false);
  assert.equal(isUsableRect(null), false);
  assert.equal(isUsableRect({ x: 0, y: 0, w: MIN_FRACTION, h: MIN_FRACTION }), true);
});

test('keyboard move and resize never leave the page or shrink below the minimum', () => {
  const rect = { x: 0.9, y: 0.9, w: 0.1, h: 0.1 };
  assert.deepEqual(moveRect(rect, 0.5, 0.5), { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
  assert.deepEqual(moveRect(rect, -2, -2), { x: 0, y: 0, w: 0.1, h: 0.1 });
  assert.ok(Math.abs(resizeRect(rect, 0.5, 0.5).w - 0.1) < 1e-9, 'cannot grow past the right/bottom edge');
  assert.equal(resizeRect({ x: 0, y: 0, w: 0.1, h: 0.1 }, -1, -1).w, MIN_FRACTION);
});

test('the pixel box is whole pixels inside the bitmap, at least 1x1', () => {
  assert.deepEqual(pixelBox({ x: 0.25, y: 0.1, w: 0.5, h: 0.4 }, 800, 1200), { sx: 200, sy: 120, sw: 400, sh: 480 });
  const edge = pixelBox({ x: 1, y: 1, w: 0.5, h: 0.5 }, 100, 100);
  assert.ok(edge.sx + edge.sw <= 100 && edge.sy + edge.sh <= 100 && edge.sw >= 1 && edge.sh >= 1);
});

test('PDF /Rotate values (including negative or non-canonical) become 0, 90, 180 or 270', () => {
  assert.deepEqual([0, 90, 180, 270, 360, -90, 450, undefined].map(normalizeRotation), [0, 90, 180, 270, 0, 270, 90, 0]);
});
