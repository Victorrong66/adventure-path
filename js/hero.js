// Heroes come from sprite sheets (assets/hero.png, built from tools/hero-sheet.png
// tools/hero-anim.png and tools/hero-run.png by tools/build-hero.py) and are recoloured per player:
// the cloak takes the outfit colour, hair and skin take the player's picks, and
// the leather/tunic is tinted by the outfit type.
//
// The atlas's alpha channel marks what each pixel is: 255 keep, 254 cloak,
// 253 hair, 252 skin, 251 tunic (all fully opaque when drawn).
import { HERO_FRAMES } from './hero-frames.js';

let atlas = null; // ImageData of the whole sheet
let roleLum = null; // average brightness of each recolourable part

export function loadHeroSheet() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      atlas = g.getImageData(0, 0, c.width, c.height);
      roleLum = averageLum(atlas.data);
      resolve();
    };
    img.onerror = () => reject(new Error('Could not load the hero sprites.'));
    img.src = 'assets/hero.png';
  });
}

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

function averageLum(d) {
  const sum = {}, n = {};
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 251 || a > 254) continue;
    sum[a] = (sum[a] || 0) + lum(d[i], d[i + 1], d[i + 2]);
    n[a] = (n[a] || 0) + 1;
  }
  const out = {};
  for (const k in sum) out[k] = sum[k] / n[k];
  return out;
}

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Tunic / leather tint for each outfit type (null keeps the sheet's own brown).
const TUNIC = {
  Adventurer: null, Squire: '#9aa4b0', Apprentice: '#6a4a9a',
  Ranger: '#4e5c34', Dragonhide: '#2a8a7a', Royal: '#a8302a', Ninja: '#2a2a34',
};

// One frame, recoloured for `look` = { skin, hair, outfitColor (hex), outfit (name) }.
// kind: 'front' | 'back' | 'side' | 'sideL' (4-frame runs: towards you, away, right, left),
// 'idleF' | 'idleB' | 'idleR' | 'idleL' (standing),
// 'atkF' | 'atkB' | 'atk' | 'atkL' (5-frame swings: towards you, away, right, left),
// 'hurt', 'down', 'win'.
// Returns { img, ox, oy } with the feet at (ox, oy).
export const heroFrameCount = (kind) => HERO_FRAMES[kind].length;

export function heroFrame(look, kind, index, flip) {
  const list = HERO_FRAMES[kind];
  const [sx, sy, w, h, footX] = list[index % list.length];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const out = g.createImageData(w, h);
  const targets = {
    254: rgb(look.outfitColor), 253: rgb(look.hair), 252: rgb(look.skin),
    251: TUNIC[look.outfit] ? rgb(TUNIC[look.outfit]) : null,
  };
  const src = atlas.data, dst = out.data, AW = atlas.width;
  const roles = new Uint8Array(w * h); // what each output pixel is (alpha role), 0 = empty
  const ninja = look.outfit === 'Ninja';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((sy + y) * AW + sx + x) * 4, o = (y * w + (flip ? w - 1 - x : x)) * 4;
      const a = src[i + 3];
      if (!a) continue;
      let r = src[i], gg = src[i + 1], b = src[i + 2];
      const t = targets[a];
      if (t) {
        // keep the sheet's shading: scale the new colour by how light this pixel is
        const k = Math.min(1.6, lum(r, gg, b) / (roleLum[a] || 0.5));
        const nr = Math.min(255, t[0] * k), ng = Math.min(255, t[1] * k), nb = Math.min(255, t[2] * k);
        if (a === 251 && !ninja) { r = (r + nr) / 2; gg = (gg + ng) / 2; b = (b + nb) / 2; } // tint leather gently
        else { r = nr; gg = ng; b = nb; }
      }
      dst[o] = r; dst[o + 1] = gg; dst[o + 2] = b; dst[o + 3] = 255;
      roles[o >> 2] = a;
    }
  }
  if (ninja) ninjaMask(dst, roles, w, h); // (before going bald, while only the face is skin)
  if (look.bald) makeBald(dst, roles, w, h, rgb(look.skin));
  g.putImageData(out, 0, 0);
  // frames are anchored on the head, so the hero doesn't wobble while walking
  return { img: c, ox: flip ? w - 1 - footX : footX, oy: h - 1 };
}

// Bald: hair is part of each frame, so the head is reshaped. The skull is a dome as wide
// as the lower hair rows (spikes stick out at the top and sides), filled with skin and
// outlined; everything of the hair outside it goes. Eyes and brows (drawn in hair
// colours) are kept: hair pixels with skin on both sides.
function makeBald(d, roles, w, h, skin) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? roles[y * w + x] : 0);
  const set = (x, y, c, role) => { const o = (y * w + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = role ? 255 : 0; roles[y * w + x] = role; };
  const dark = (x, y) => { const o = (y * w + x) * 4; return d[o] + d[o + 1] + d[o + 2] < 150; };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const open = (x, y) => N4.some(([a, b]) => !at(x + a, y + b));
  const hair = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== 253) continue;
    let l = false, r = false;
    for (let k = 1; k < 5; k++) { if (at(x - k, y) === 252) l = true; if (at(x + k, y) === 252) r = true; }
    if (!(l && r)) hair.push([x, y]);
  }
  if (!hair.length) return;
  // the hair and its outer outline
  const S = new Set(hair.map(([x, y]) => y * w + x));
  for (const [x, y] of hair) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const qx = x + dx, qy = y + dy;
      if (at(qx, qy) === 255 && dark(qx, qy) && open(qx, qy)) S.add(qy * w + qx);
    }
  }
  const ys = [...S].map((i) => Math.floor(i / w));
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  // skull width: the median span of the lower hair rows
  const spans = [];
  for (let y = Math.ceil(y0 + (y1 - y0) / 2); y <= y1; y++) {
    let a = Infinity, b = -Infinity;
    for (const i of S) if (Math.floor(i / w) === y) { a = Math.min(a, i % w); b = Math.max(b, i % w); }
    if (a <= b) spans.push([a, b]);
  }
  spans.sort((p, q) => (p[1] - p[0]) - (q[1] - q[0]));
  const [a, b] = spans[spans.length >> 1];
  // a circle across the skull (straight sides below its middle, down to the face)
  const cx = (a + b) / 2, rx = (b - a) / 2 - 0.5, yt = y0 + 2, cy = yt + rx;
  const inside = (x, y) => {
    if (y < yt || y > Math.max(y1, cy)) return false;
    if (y >= cy) return Math.abs(x - cx) <= rx;
    return (x - cx) ** 2 + (y - cy) ** 2 <= rx * rx;
  };
  for (const i of [...S]) { const x = i % w, y = Math.floor(i / w); if (!inside(x, y)) { set(x, y, [0, 0, 0], 0); S.delete(i); } }
  // fill the dome (gaps between spikes)
  for (let y = Math.max(0, yt); y <= Math.min(h - 1, Math.floor(Math.max(y1, cy))); y++) {
    for (let x = 0; x < w; x++) if (inside(x, y) && !at(x, y)) { roles[y * w + x] = 253; S.add(y * w + x); }
  }
  // spike tips drawn only in outline: dark pixels above the ears, outside the dome, not
  // touching the face or clothes
  const body = (x, y) => [252, 254, 251].includes(at(x, y));
  for (let y = 0; y <= Math.floor(cy); y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== 255 || !dark(x, y) || inside(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (body(x + dx, y + dy)) { near = true; break; }
    if (!near) set(x, y, [0, 0, 0], 0);
  }
  // the scalp is exactly the face's skin colour: the most common shade among the lighter
  // half of this frame's skin pixels (so not a shadow tone)
  const skinPx = [];
  for (let i = 0; i < w * h; i++) if (roles[i] === 252) skinPx.push(i);
  const L = (i) => lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const mid = skinPx.map(L).sort((p, q) => p - q)[skinPx.length >> 1] || 0;
  const count = new Map();
  for (const i of skinPx) {
    if (L(i) < mid) continue;
    const key = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
    count.set(key, (count.get(key) || 0) + 1);
  }
  let best = -1, tone = skin;
  for (const [key, n] of count) if (n > best) { best = n; tone = [key >> 16, (key >> 8) & 255, key & 255]; }
  for (const i of S) {
    if (roles[i] === 253) set(i % w, Math.floor(i / w), tone, 252);
  }
  // clear specks left floating
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !roles[i]) continue;
    const st = [i], comp = []; seen[i] = 1;
    while (st.length) {
      const j = st.pop(); comp.push(j);
      const x = j % w, y = Math.floor(j / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[n] && roles[n]) { seen[n] = 1; st.push(n); }
      }
    }
    if (comp.length < 8) for (const j of comp) set(j % w, Math.floor(j / w), [0, 0, 0], 0);
  }
  // outline the scalp
  for (const i of S) { const x = i % w, y = Math.floor(i / w); if (at(x, y) && open(x, y)) set(x, y, [30, 22, 26], 255); }
}

// Ninja: a dark cloth mask over the lower half of the face.
function ninjaMask(d, roles, w, h) {
  let top = Infinity, bot = -Infinity;
  for (let y = 0; y < h * 0.5; y++) for (let x = 0; x < w; x++) if (roles[y * w + x] === 252) { top = Math.min(top, y); bot = Math.max(bot, y); }
  if (bot - top < 3) return; // no face in view (seen from behind)
  const from = top + (bot - top) * 0.5;
  for (let y = Math.ceil(from); y <= bot; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (roles[i] !== 252) continue;
    const k = lum(d[o], d[o + 1], d[o + 2]) / 0.7;
    d[o] = Math.min(255, 46 * k); d[o + 1] = Math.min(255, 46 * k); d[o + 2] = Math.min(255, 58 * k);
  }
}
