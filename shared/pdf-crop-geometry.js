// Geometry of a PDF region selection (pure, no DOM, so it is testable in Node).
// A rectangle is stored NORMALIZED to the page as the student saw it: x, y, w, h are fractions (0..1) of the displayed page width/height,
// origin top-left, in the page's displayed orientation. `rotation` records the page's own /Rotate (0/90/180/270) at that moment, so the
// same region can be found again whatever the zoom or the screen was.
export const MIN_FRACTION = 0.02;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Normalized rectangle from two corner points in CSS pixels of a page shown at `width` x `height`. */
export function rectFromPoints(a, b, width, height) {
  const x0 = clamp(Math.min(a.x, b.x) / width, 0, 1);
  const x1 = clamp(Math.max(a.x, b.x) / width, 0, 1);
  const y0 = clamp(Math.min(a.y, b.y) / height, 0, 1);
  const y1 = clamp(Math.max(a.y, b.y) / height, 0, 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const isUsableRect = (rect) => Boolean(rect) && rect.w >= MIN_FRACTION && rect.h >= MIN_FRACTION;

/** Moves the rectangle by (dx, dy) fractions, never outside the page. */
export function moveRect(rect, dx, dy) {
  return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
}

/** Grows/shrinks the rectangle from its bottom-right corner, never outside the page and never below the minimum. */
export function resizeRect(rect, dw, dh) {
  return { ...rect, w: clamp(rect.w + dw, MIN_FRACTION, 1 - rect.x), h: clamp(rect.h + dh, MIN_FRACTION, 1 - rect.y) };
}

/** The integer pixel box of the rectangle inside a rendered bitmap (at least 1x1, always inside it). */
export function pixelBox(rect, bitmapWidth, bitmapHeight) {
  const sx = clamp(Math.round(rect.x * bitmapWidth), 0, bitmapWidth - 1);
  const sy = clamp(Math.round(rect.y * bitmapHeight), 0, bitmapHeight - 1);
  const sw = clamp(Math.round(rect.w * bitmapWidth), 1, bitmapWidth - sx);
  const sh = clamp(Math.round(rect.h * bitmapHeight), 1, bitmapHeight - sy);
  return { sx, sy, sw, sh };
}

/** Page rotation as the server stores it: 0, 90, 180 or 270 (PDF /Rotate can be any multiple of 90, also negative). */
export const normalizeRotation = (degrees) => (((Math.round((Number(degrees) || 0) / 90) * 90) % 360) + 360) % 360;
