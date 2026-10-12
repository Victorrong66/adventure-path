// Small shared helpers.

// One world unit (a tile) is 16x16 pixels; the camera looks straight down at a
// slight angle (a "three-quarter" view), so world x/y map directly to screen x/y.
export const TILE = 16;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const r2 = (v) => Math.round(v * 100) / 100;

export function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function uid(n = 10) {
  let s = '';
  for (let i = 0; i < n; i++) s += ID_CHARS[(Math.random() * ID_CHARS.length) | 0];
  return s;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Convert a screen-space direction into a normalized world-space direction.
// In the top-down view these are the same axes.
export function screenToWorldDir(ux, uy) {
  if (!ux && !uy) return [0, 0];
  const l = Math.hypot(ux, uy) || 1;
  return [ux / l, uy / l];
}

// Facing from a screen-space vector: 0 down, 1 up, 2 right, 3 left.
export function facingFromScreen(sx, sy, prev = 0) {
  if (!sx && !sy) return prev;
  if (Math.abs(sx) > Math.abs(sy) * 0.9) return sx > 0 ? 2 : 3;
  return sy > 0 ? 0 : 1;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
