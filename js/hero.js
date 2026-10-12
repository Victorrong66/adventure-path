// Heroes come from a hand-made sprite sheet (assets/hero.png, built from
// tools/hero-sheet.png by tools/build-hero.py) and are recoloured per player:
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
  Ranger: '#4e5c34', Dragonhide: '#2a8a7a', Royal: '#a8302a',
};

// One frame, recoloured for `look` = { skin, hair, outfitColor (hex), outfit (name) }.
// kind: 'front' | 'side' | 'back' (4 walking frames each), 'atk' (3), 'hurt', 'down'.
// Returns { img, ox, oy } with the feet at (ox, oy).
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
        if (a === 251) { r = (r + nr) / 2; gg = (gg + ng) / 2; b = (b + nb) / 2; } // tint leather gently
        else { r = nr; gg = ng; b = nb; }
      }
      dst[o] = r; dst[o + 1] = gg; dst[o + 2] = b; dst[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  // walking frames stand centred; the sword swing is anchored on the body
  const fx = kind === 'atk' ? footX : Math.floor(w / 2);
  return { img: c, ox: flip ? w - 1 - fx : fx, oy: h - 1 };
}
