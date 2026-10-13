// All the 8-bit art is generated in code: characters are composed from parts,
// monsters and props come from little pixel templates.

import { heroFrame, heroFrameCount, hasHeroFrames } from './hero.js';
import { MOB_FRAMES } from './mob-frames.js';
export { loadHeroSheet } from './hero.js';

// Monster art (assets/mobs.png, built from tools/mobs.png by tools/build-mobs.py):
// walk cycles facing left and right, at twice game size.
let mobAtlas = null;
export function loadMobSheet() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { mobAtlas = img; resolve(); };
    img.onerror = () => reject(new Error('Could not load the monster sprites.'));
    img.src = 'assets/mobs.png';
  });
}

export const SKINS = ['#ffdcb4', '#f0c08c', '#d8a070', '#b87848', '#8c5430', '#5c3418'];
// Young adventurers off to fight monsters and dragons.
// (Saved characters keep their numbers, so each list keeps its length.)
export const HAIR_STYLES = ['Spiky', 'Bald']; // look.bald: 0 or 1
export const HAIR_COLORS = ['#2a2224', '#5a361e', '#8a5228', '#c4562a', '#e0b048', '#f0e0b0', '#4a78d0', '#e07aa8'];
export const OUTFITS = ['Adventurer', 'Squire', 'Apprentice', 'Ranger', 'Dragonhide', 'Royal', 'Ninja', 'Classic Ninja'];
// Storybook colours: red, blue, green, gold, teal, purple, orange, cream
export const OUTFIT_COLORS = ['#c8402e', '#3a6ec0', '#4a9a3e', '#e0a830', '#2a9a9a', '#7a4ab0', '#e07028', '#e6e0cc', '#3a3a46'];
export const EXTRAS = ['None', 'Goggles', 'Headband', 'Cap', 'Beanie'];

export const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 1, outfit: 0, outfitColor: 0, extra: 0, bald: 0 };

const OUTLINE = '#141018';

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Give every opaque shape a 1px dark outline, the classic 8-bit look.
export function outline(c, color = OUTLINE) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  g.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a(x, y)) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function flipped(src) {
  const { c, g } = mk(src.width, src.height);
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

function whiteOf(src) {
  const { c, g } = mk(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawTemplate(g, rows, pal, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col; g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

function fromTemplate(rows, pal, margin = 1, doOutline = true) {
  const w = Math.max(...rows.map((r) => r.length));
  const { c, g } = mk(w + margin * 2, rows.length + margin * 2);
  drawTemplate(g, rows, pal, margin, margin);
  return doOutline ? outline(c) : c;
}

// ---------------------------------------------------------------- characters

const charCache = new Map();
export const RUN_FRAME_MS = 85; // how long each frame of the run cycle shows

// Which way each sheet frame faces; anything else is mirrored to fit.
const NATIVE = {
  front: 'down', back: 'up', side: 'right', sideL: 'left',
  idleF: 'down', idleB: 'up', idleR: 'right', idleL: 'left', dash: 'right', dashL: 'left',
  atkF: 'down', atkB: 'up', atk: 'right', atkL: 'left', hurt: 'left', down: 'right', dizzy: 'down', win: 'down',
};

// Heroes (see hero.js). Returns { img, ox, oy, w, h, hurt() }: draw img at
// w x h at (footX - ox, footY - oy).
// pose: 'walk' (frame = any running count; RUN_FRAME_MS per frame), 'dash' (frame 0..4), 'idle', 'atk' (frame = swing progress
// 0..1), 'hurt', 'down' or 'win'.
export function charSprite(look, facing, frame = 0, pose = 'walk') {
  if (OUTFITS[look.outfit] === 'Classic Ninja') return classicNinja(look, facing, frame, pose);
  const left = facing === 3 || (facing === 1 && pose !== 'walk' && pose !== 'idle');
  let kind;
  // running: a 4-frame run cycle per direction; standing: one still frame per direction
  if (pose === 'walk') kind = facing === 0 ? 'front' : facing === 1 ? 'back' : left ? 'sideL' : 'side';
  else if (pose === 'idle') kind = facing === 0 ? 'idleF' : facing === 1 ? 'idleB' : left ? 'idleL' : 'idleR';
  else if (pose === 'atk') kind = ['atkF', 'atkB', 'atk', 'atkL'][facing] || 'atk'; // a swing for each direction
  else if (pose === 'dash') kind = facing === 3 ? 'dashL' : 'dash'; // frame = which dash frame
  else kind = pose;
  const base = kind;
  // the Ninja outfit (hooded, or on a bald head) and the bald head have their own frame sets
  const ninja = OUTFITS[look.outfit] === 'Ninja';
  const set = ninja ? (look.bald ? 'baldninja:' : 'ninja:') : look.bald ? 'bald:' : '';
  if (set && hasHeroFrames(set + kind)) kind = set + kind;
  const n = heroFrameCount(kind);
  const index = pose === 'atk' ? Math.min(n - 1, Math.floor(frame * n)) : pose === 'dash' ? Math.min(n - 1, frame) : ((frame % n) + n) % n;
  const native = NATIVE[base];
  const flip = (native === 'left' || native === 'right') && native !== (left ? 'left' : 'right');
  const key = `${look.skin}${look.hairColor}${look.outfit}${look.outfitColor}${look.bald ? 'b' : ''}|${kind}|${index}|${flip ? 1 : 0}`;
  let s = charCache.get(key);
  if (!s) {
    const colors = {
      skin: SKINS[look.skin] || SKINS[0],
      hair: HAIR_COLORS[look.hairColor] || HAIR_COLORS[0],
      outfitColor: OUTFIT_COLORS[look.outfitColor] || OUTFIT_COLORS[0],
      outfit: OUTFITS[look.outfit] || OUTFITS[0],
      bald: !!look.bald,
    };
    const f = heroFrame(colors, kind, index, flip);
    let red = null;
    s = {
      img: f.img, ox: f.ox, oy: f.oy, w: f.img.width, h: f.img.height,
      // red-tinted copy for the moment a hero gets hit
      hurt() { return red || (red = tinted(f.img, 'rgba(255,40,40,0.6)')); },
    };
    charCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------- Classic Ninja
// One of the game's original characters (drawn in code, before the sprite sheets): a
// small ninja with a headband and mask. Drawn at 1.5x so it matches the other heroes
// (3 detail pixels per art pixel, still crisp). Facing left is the right side mirrored.
const CLASSIC_SCALE = 1.5;
const CLASSIC_HAIR = {
  down: ['..H.H.H.H.', '..HHHHHHH.', '.HHHHHHHH.', '..HHhHhH..', '..H....H..'],
  up: ['..H.H.H.H.', '..HHHHHHH.', '.HHHHHHHH.', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..hHHHHh..'],
  side: ['.H.H.H....', '.HHHHHHH..', 'HHHHHHHHH.', '.HHHHH....', '..HHH.....', '..hH......'],
};
// dir: 0 down, 1 up, 2 side (facing right). frame 0..3 (walk).
function buildClassicNinja(look, dir, frame) {
  const OY = 2;
  const { c, g } = mk(14, 21);
  const p = (x, y, col) => { g.fillStyle = col; g.fillRect(x + 1, y + OY, 1, 1); };
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 1, y + OY, w, h); };
  const skin = SKINS[look.skin] || SKINS[0], skinD = shade(skin, -0.15);
  const hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0], hairD = shade(hair, -0.3);
  const out = OUTFIT_COLORS[look.outfitColor] || OUTFIT_COLORS[0];
  const cloth = '#2c2c3c', clothD = '#1a1a26';
  const lift = frame === 1 ? 1 : frame === 3 ? 2 : 0;
  const side = dir === 2;
  // legs
  if (!side) {
    const lY = lift === 1 ? -1 : 0, rY = lift === 2 ? -1 : 0;
    r(4, 13 + lY, 2, 3, cloth); r(4, 16 + lY, 2, 1, clothD);
    r(6, 13 + rY, 2, 3, cloth); r(6, 16 + rY, 2, 1, clothD);
  } else if (lift) {
    r(3, 13, 2, 3, cloth); r(2, 16, 3, 1, clothD);
    r(7, 13, 2, 3, shade(cloth, -0.15)); r(7, 16, 3, 1, clothD);
  } else {
    r(5, 13, 2, 3, cloth); r(5, 16, 3, 1, clothD);
  }
  // torso and arms
  r(3, 8, 6, 5, cloth); r(3, 12, 6, 1, clothD);
  if (!side) {
    const swing = lift === 1 ? 1 : lift === 2 ? -1 : 0;
    r(2, 8, 1, 3 + Math.max(0, swing), cloth); p(2, 11 + Math.max(0, swing), skin);
    r(9, 8, 1, 3 + Math.max(0, -swing), cloth); p(9, 11 + Math.max(0, -swing), skin);
  }
  // head
  r(3, 2, 6, 6, skin); r(3, 7, 6, 1, skinD);
  if (dir === 0) { p(4, 5, '#201828'); p(7, 5, '#201828'); }
  if (side) p(7, 5, '#201828');
  // belt and mask
  r(3, 11, 6, 1, out);
  if (dir === 0) r(3, 6, 6, 2, cloth);
  if (side) r(5, 6, 4, 2, cloth);
  if (side) { const hx = lift === 1 ? 7 : lift === 2 ? 4 : 5; r(5, 8, 2, 3, shade(cloth, -0.1)); r(hx, 11, 2, 1, skin); }
  // hair (spiky, or none when bald)
  if (!look.bald) {
    CLASSIC_HAIR[dir === 0 ? 'down' : dir === 1 ? 'up' : 'side'].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'H') p(x + 1, y, hair);
        else if (row[x] === 'h') p(x + 1, y, hairD);
      }
    });
  }
  // headband, with its tails flying behind
  r(3, 3, 6, 1, out);
  if (dir === 1) { p(5, 4, out); p(6, 4, out); }
  if (side) { p(2, 3, out); p(1, 4, out); }
  return outline(c);
}

function classicNinja(look, facing, frame, pose) {
  // the original art only has its 4-frame walk: standing and other poses use frame 0
  const f = pose === 'walk' ? ((frame % 4) + 4) % 4 : 0;
  const key = `classic|${look.skin}${look.hairColor}${look.outfitColor}${look.bald ? 'b' : ''}|${facing}|${f}|${pose === 'down' ? 'd' : ''}`;
  let s = charCache.get(key);
  if (!s) {
    const dir = facing === 3 ? 2 : facing;
    let img = buildClassicNinja(look, dir, f);
    if (facing === 3) img = flipped(img);
    let ox = 7, oy = 19;
    if (pose === 'down') { // knocked out: lying on its side
      const { c, g } = mk(img.height, img.width);
      g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
      img = c; ox = c.width / 2; oy = c.height - 2;
    }
    let red = null;
    const k = CLASSIC_SCALE;
    s = {
      img, ox: ox * k, oy: oy * k, w: img.width * k, h: img.height * k,
      hurt() { return red || (red = tinted(img, 'rgba(255,40,40,0.6)')); },
    };
    charCache.set(key, s);
  }
  return s;
}

function tinted(src, color) {
  const { c, g } = mk(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

export const MERCHANT_LOOK = { skin: 2, hair: 2, hairColor: 5, outfit: 2, outfitColor: 5, extra: 0 };

// ---------------------------------------------------------------- monsters

const MONSTER_TPL = {
  slime: {
    pal: { G: '#3cb83c', W: '#b8f8b8', E: '#103010', d: '#207020' },
    frames: [[
      '....GGGG....',
      '..GGGGGGGG..',
      '.GGWGGGGGGG.',
      '.GWGGGGGGGG.',
      'GGGEGGGGEGGG',
      'GGGEGGGGEGGG',
      'GGGGGGGGGGGG',
      'dGGGGGGGGGGd',
      '.dddddddddd.',
    ], [
      '............',
      '...GGGGGG...',
      '.GGWGGGGGGG.',
      'GGWGGGGGGGGG',
      'GGGEGGGGEGGG',
      'GGGEGGGGEGGG',
      'GGGGGGGGGGGG',
      'dGGGGGGGGGGd',
      'dddddddddddd',
    ]],
  },
  bat: {
    pal: { P: '#7c4cc4', p: '#4c2c84', E: '#f83c3c' },
    frames: [[
      'P............P',
      'PP....pp....PP',
      'PPP..pPPp..PPP',
      '.PPPPPEPEPPPP.',
      '..PPPPPPPPPP..',
      '......pp......',
      '..............',
    ], [
      '..............',
      '......pp......',
      '....pPPPPp....',
      '..PPPPEPEPPP..',
      '.PPPPPPPPPPPP.',
      'PPP...pp...PPP',
      'P............P',
    ]],
  },
  goblin: {
    pal: { G: '#5ca83c', g: '#3c7024', E: '#f8f838', B: '#8c5c2c', b: '#5c3818', w: '#f8f8f8' },
    frames: [[
      'G.GGGGGG.G',
      'GGGGGGGGGG',
      '.GEGGGGEG.',
      '..GGGGGG..',
      '..GgwwgG..',
      '...BBBB...',
      '..BBBBBB.G',
      '.GBBbbBBGG',
      '..BBBBBB..',
      '...g..g...',
      '..gg..gg..',
    ]],
  },
  skeleton: {
    pal: { W: '#e8e8d8', w: '#a8a898', E: '#200808', R: '#f83c3c' },
    frames: [[
      '..WWWWWW..',
      '.WWWWWWWW.',
      '.WEEWWEEW.',
      '.WERWWERW.',
      '.WWWWWWWW.',
      '..WwWwWW..',
      '...WWWW...',
      '..wWWWWw..',
      '.W.WwwW.W.',
      '.W.WWWW.W.',
      '.W.wWWw.W.',
      '....ww....',
      '...W..W...',
      '...W..W...',
      '..WW..WW..',
    ]],
  },
  ghost: {
    pal: { W: '#e8f0ff', w: '#a8b8e0', E: '#202040' },
    frames: [[
      '...WWWW...',
      '..WWWWWW..',
      '.WWWWWWWW.',
      '.WEEWWEEW.',
      '.WEEWWEEW.',
      '.WWWWWWWW.',
      '.WWWwwWWW.',
      '.WWWWWWWW.',
      '.WWWWWWWW.',
      '.WwWWWwWW.',
      '.W.wW.Ww..',
      '....w..w..',
    ]],
  },
  imp: {
    pal: { R: '#d83c2c', r: '#98281c', Y: '#f0e0a0', E: '#f8f838' },
    frames: [[
      '.Y......Y.',
      '.Y.RRRR.Y.',
      '..RRRRRR..',
      '..RERRER..',
      '..RRRRRR..',
      '...RrrR...',
      '.RRRRRRRR.',
      'R.RRRRRR.R',
      '..RRRRRR..',
      '..R....R.r',
      '..r....rr.',
    ]],
  },
  ogre: {
    pal: { O: '#8c9c4c', o: '#5c6c2c', E: '#f83c3c', T: '#f8f8f8', C: '#8c5c2c', c: '#4c3018', L: '#a87c48', K: '#f8d838' },
    frames: [[
      '.....K.K.K.K........',
      '.....KKKKKKK........',
      '....OOOOOOOOO.......',
      '...OOOOOOOOOOO......',
      '...OOEEOOOEEOO......',
      '...OOOOOOOOOOO......',
      '...OOTOOOOOTOO......',
      '....OTOoooOTO.......',
      '..OOOOOOOOOOOOO..C..',
      '.OOOOOOOOOOOOOOO.CC.',
      'OOOOOOOOOOOOOOOOOCCC',
      'OOOOOOOOOOOOOOOOOCCc',
      'OO.OOOOOOOOOOO.OOCc.',
      'OO.OOOOOOOOOOO.OO...',
      'oo.LLLLLLLLLLL.oo...',
      '...LLLLLLLLLLL......',
      '...OOOOO.OOOOO......',
      '...OOOOO.OOOOO......',
      '...OOOO...OOOO......',
      '..oooo.....oooo.....',
    ]],
  },
};

export const MONSTER_TYPES = Object.keys(MONSTER_TPL);

const monsterCache = new Map();
// Returns {img, white, ox, oy} for type, facing (1 right / -1 left), animation frame.
export function monsterSprite(type, facing, frame) {
  const key = `${type}|${facing}|${frame}`;
  let s = monsterCache.get(key);
  if (!s) {
    if (mobFace) {
      s = faceMonsterSprite(type, facing, frame % monsterFrames(type));
      monsterCache.set(key, s);
      return s;
    }
    const sheet = MOB_FRAMES[type] && mobAtlas && MOB_FRAMES[type][facing < 0 ? 'left' : 'right'];
    if (sheet) {
      const [sx, sy, w, h, ax] = sheet[frame % sheet.length];
      const { c, g } = mk(w, h);
      g.drawImage(mobAtlas, sx, sy, w, h, 0, 0, w, h);
      // drawn at half size: w/h and the anchor are in game pixels
      s = { img: c, white: whiteOf(c), w: w / 2, h: h / 2, ox: ax / 2, oy: h / 2 - 0.5 };
      monsterCache.set(key, s);
      return s;
    }
    const tpl = MONSTER_TPL[type];
    const rows = tpl.frames[frame % tpl.frames.length];
    let img = fromTemplate(rows, tpl.pal);
    if (facing < 0) img = flipped(img);
    s = { img, white: whiteOf(img), ox: img.width >> 1, oy: img.height - 1 };
    monsterCache.set(key, s);
  }
  return s;
}
// A monster's named animation from the sheet (e.g. the Ogre King's 'smash', the
// Devil's 'shootL'), frame clamped to the last; null if it has none (or monsters wear
// the photo face). The Ogre King's hurt and death frames face left, so they're mirrored
// to face right.
const ANIM_FACES_LEFT = new Set(['ogre:hurt', 'ogre:die']);
export function monsterAnim(type, anim, facing, frame) {
  const list = !mobFace && mobAtlas && MOB_FRAMES[type] && MOB_FRAMES[type][anim];
  if (!list) return null;
  const i = Math.max(0, Math.min(list.length - 1, frame));
  const flip = ANIM_FACES_LEFT.has(`${type}:${anim}`) && facing > 0;
  const key = `${type}|${anim}|${i}|${flip ? 1 : 0}`;
  let s = monsterCache.get(key);
  if (!s) {
    const [sx, sy, w, h, ax] = list[i];
    const { c, g } = mk(w, h);
    if (flip) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(mobAtlas, sx, sy, w, h, 0, 0, w, h);
    s = { img: c, white: whiteOf(c), w: w / 2, h: h / 2, ox: (flip ? w - 1 - ax : ax) / 2, oy: h / 2 - 0.5 };
    monsterCache.set(key, s);
  }
  return s;
}
export const animFrames = (type, anim) => (MOB_FRAMES[type] && MOB_FRAMES[type][anim] ? MOB_FRAMES[type][anim].length : 0);

export const monsterFrames = (type) => (mobFace ? (type === 'bat' ? 2 : 1)
  : MOB_FRAMES[type] ? Math.max(MOB_FRAMES[type].left.length, MOB_FRAMES[type].right.length) : MONSTER_TPL[type].frames.length);

// ---------------------------------------------------------------- photo-face monsters
// The host can pick a photo; it's shrunk to a 32x32 pixel-art face (only that tiny
// version is kept and shared) and every monster becomes that face with a costume.

let mobFace = null; // 32x32 canvas

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

// Photo file -> small posterized PNG data URL (crops the middle, a little high, where faces usually are).
export async function processFacePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const side = Math.min(w, h) * 0.86;
    const sx = (w - side) / 2, sy = Math.max(0, (h - side) * 0.35);
    // Shrink in steps so the result stays clean
    let src = img, sw = side, ssx = sx, ssy = sy;
    for (const size of [128, 64, 32]) {
      const { c, g } = mk(size, size);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(src, ssx, ssy, sw, sw, 0, 0, size, size);
      src = c; ssx = 0; ssy = 0; sw = size;
    }
    const g = src.getContext('2d');
    const d = g.getImageData(0, 0, 32, 32);
    for (let i = 0; i < d.data.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const v = (d.data[i + k] - 128) * 1.15 + 128; // a bit more contrast
        d.data[i + k] = Math.max(0, Math.min(255, Math.round(v / 32) * 32));
      }
    }
    g.putImageData(d, 0, 0);
    return src.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export async function setMobFace(dataUrl) {
  monsterCache.clear();
  if (!dataUrl) { mobFace = null; return; }
  const img = await loadImage(dataUrl);
  const { c, g } = mk(32, 32);
  g.drawImage(img, 0, 0, 32, 32);
  mobFace = c;
  monsterCache.clear();
}
export const hasMobFace = () => !!mobFace;

function faceHead(size, tint, gray) {
  const { c, g } = mk(size, size);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(mobFace, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / (r * 1.0);
      if (dx * dx + dy * dy > 1) { d.data[i + 3] = 0; continue; }
      d.data[i + 3] = 255;
      if (gray) {
        const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.min(255, l * 1.1 + 30);
      }
    }
  }
  g.putImageData(d, 0, 0);
  if (tint) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.2; g.fillStyle = tint; g.fillRect(0, 0, size, size);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  return c;
}

function buildFaceMonster(type, frame) {
  const boss = type === 'ogre';
  const size = boss ? 40 : type === 'bat' ? 18 : 21;
  const W = size + 14, H = size + 10;
  const { c, g } = mk(W, H);
  const hx = (W - size) >> 1, hy = H - size - 2;
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const tint = { slime: '#3cb83c', goblin: '#5ca83c', imp: '#d83c2c', ghost: '#a8c8ff' }[type];
  // things behind the head
  if (type === 'bat') {
    const up = frame === 0;
    const wy = up ? hy - 1 : hy + 5;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? hx - 6 : hx + size;
      px(x0, wy + 2, 6, 3, '#7c4cc4');
      px(side < 0 ? x0 : x0 + 3, up ? wy : wy + 5, 3, 2, '#7c4cc4');
      px(x0 + (side < 0 ? 3 : 0), wy + 3, 3, 1, '#4c2c84');
    }
  }
  if (type === 'goblin') { px(hx - 3, hy + 4, 4, 3, '#5ca83c'); px(hx + size - 1, hy + 4, 4, 3, '#5ca83c'); px(hx - 4, hy + 3, 2, 2, '#5ca83c'); px(hx + size + 2, hy + 3, 2, 2, '#5ca83c'); }
  if (type === 'slime') { px(hx - 2, hy + size - 4, size + 4, 5, '#3cb83c'); px(hx - 1, hy + size, size + 2, 2, '#207020'); }
  if (type === 'ghost') { for (let i = 0; i < 4; i++) px(hx + 1 + i * (size / 4), hy + size - 2, 3, 4 + (i % 2) * 2, '#e8f0ff'); }
  g.drawImage(faceHead(size, tint, type === 'skeleton'), hx, hy);
  // things on top of the head
  if (type === 'imp') { px(hx + 1, hy - 3, 2, 4, '#f0e0a0'); px(hx + size - 3, hy - 3, 2, 4, '#f0e0a0'); px(hx, hy - 4, 2, 2, '#f0e0a0'); px(hx + size - 2, hy - 4, 2, 2, '#f0e0a0'); }
  if (type === 'skeleton') { px(hx + 3, hy + size - 3, size - 6, 1, '#f8f8f0'); for (let x = hx + 4; x < hx + size - 4; x += 2) px(x, hy + size - 4, 1, 3, '#202020'); }
  if (boss) {
    const cy = hy - 6;
    px(hx + 5, cy + 3, size - 10, 4, '#f8d838');
    for (let i = 0; i < 4; i++) px(hx + 5 + i * ((size - 12) / 3), cy, 2, 4, '#f8d838');
    px(hx + size / 2 - 1, cy + 4, 2, 2, '#e83c4c');
  }
  return outline(c);
}

function faceMonsterSprite(type, facing, frame) {
  let img = buildFaceMonster(type, frame);
  if (facing < 0) img = flipped(img);
  return { img, white: whiteOf(img), ox: img.width >> 1, oy: img.height - 1 };
}

// ---------------------------------------------------------------- props

const PROPS = {
  tomb: {
    pal: { S: '#a0a0b0', s: '#686878', D: '#404050' },
    rows: ['..SSSS..', '.SSSSSS.', '.SSDDSS.', '.SDDDDS.', '.SSDDSS.', '.SSDDSS.', '.SSSSSs.', 'ssssssss'],
  },
};

const FIRE_FRAMES = [
  ['...Y....', '..YOY...', '..YOOY..', '.YOROY..', '.YORROY.', '.ORRRRO.', 'BbBBbBBb', '.bBBbBb.'],
  ['....Y...', '...YOY..', '..YOOY..', '..YORYO.', '.YORROY.', '.ORRRRO.', 'BbBBbBBb', '.bBBbBb.'],
];
const FIRE_PAL = { Y: '#f8f878', O: '#f8a830', R: '#e84818', B: '#7c5028', b: '#5c3818' };

const propCache = new Map();
export function propSprite(name, frame = 0) {
  const key = name + frame;
  let s = propCache.get(key);
  if (!s) {
    const img = name === 'fire'
      ? fromTemplate(FIRE_FRAMES[frame % 2], FIRE_PAL)
      : fromTemplate(PROPS[name].rows, PROPS[name].pal);
    s = { img, ox: img.width >> 1, oy: img.height - 2 };
    propCache.set(key, s);
  }
  return s;
}

// Small pickups / projectiles
const SMALL = {
  xp: { pal: { B: '#38b8f8', W: '#c8f0ff', b: '#1c70b8' }, rows: ['.W.', 'WBB', 'BBb', '.b.'] },
  xp2: { pal: { B: '#48d848', W: '#d0ffd0', b: '#208c28' }, rows: ['.W.', 'WBB', 'BBb', '.b.'] },
  xp3: { pal: { B: '#f84860', W: '#ffd0d8', b: '#a01c30' }, rows: ['.W.', 'WBB', 'BBb', '.b.'] },
  coin: { pal: { Y: '#f8d838', y: '#c09018', W: '#fff8c0' }, rows: ['.YY.', 'YWYy', 'YYYy', '.yy.'] },
  heart: { pal: { R: '#f83c50', W: '#ffd0d8' }, rows: ['RR.RR', 'RWRRR', 'RRRRR', '.RRR.', '..R..'] },
  bolt: { pal: { W: '#ffffff', C: '#78e8ff' }, rows: ['.C.', 'CWC', '.C.'] },
  plasma: { pal: { W: '#ffffff', C: '#48e8f8', B: '#2878f8' }, rows: ['.BB.', 'BCWB', 'BWCB', '.BB.'] },
  fire: { pal: { Y: '#f8f878', O: '#f87818' }, rows: ['.O.', 'OYO', '.O.'] },
  gsword: {
    pal: { S: '#f0f0ff', s: '#a0a0c0', G: '#f8d838', B: '#8c5c2c', Y: '#fff8a0' },
    rows: ['....Y', '...SS', '..SSs', '.SSs.', 'GSs..', 'BG...', 'B.G..'],
  },
  blade: { pal: { S: '#e0e0f0', s: '#9090a8' }, rows: ['..S..', '.sSs.', 'SSsSS', '.sSs.', '..S..'] },
};
const smallCache = new Map();
export function smallSprite(name) {
  let s = smallCache.get(name);
  if (!s) {
    const img = fromTemplate(SMALL[name].rows, SMALL[name].pal);
    s = { img, ox: img.width >> 1, oy: img.height >> 1 };
    smallCache.set(name, s);
  }
  return s;
}

// The Giant Sword power-up: an absurdly long blade pointing right (handle at the left).
// The Giant Sword (assets/giant-sword.png, built by tools/build-sword.py): drawn at
// half size on the detail canvas, stretched to `lengthPx` world pixels long.
const swordImg = new Image();
swordImg.src = 'assets/giant-sword.png';
export function giantSwordSprite(lengthPx) {
  if (!swordImg.complete || !swordImg.naturalWidth) return null;
  return { img: swordImg, w: lengthPx, h: Math.round(swordImg.naturalHeight * lengthPx / swordImg.naturalWidth) };
}

// ---------------------------------------------------------------- pixel font (3x5)

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '!': '010010010000010', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010',
  ':': '000010000010000', '?': '110001010000010', '/': '001001010100100', ' ': '000000000000000',
  "'": '010010000000000', '_': '000000000000111',
};

export function textWidth(s) { return s.length * 4 - 1; }

export function drawText(g, s, x, y, color = '#ffffff', shadow = '#141018') {
  s = String(s).toUpperCase();
  for (const pass of shadow ? [0, 1] : [1]) {
    g.fillStyle = pass ? color : shadow;
    const o = pass ? 0 : 1;
    for (let i = 0; i < s.length; i++) {
      const gl = GLYPHS[s[i]] || GLYPHS['?'];
      for (let k = 0; k < 15; k++) {
        if (gl[k] === '1') g.fillRect(x + i * 4 + (k % 3) + o, y + ((k / 3) | 0) + o, 1, 1);
      }
    }
  }
}

export function drawShadow(g, x, y, w) {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  const h = Math.max(2, (w / 3) | 0);
  for (let i = 0; i < h; i++) {
    const t = (i + 0.5) / h * 2 - 1;
    const hw = Math.round((w / 2) * Math.sqrt(1 - t * t));
    g.fillRect(Math.round(x - hw), Math.round(y - h / 2 + i), hw * 2, 1);
  }
}

// The Reboot Van (assets/van.png, built by tools/build-van.py). Its art has pixels half
// the size of a world pixel, so it's drawn at half size on the detail canvas.
const vanImg = new Image();
vanImg.src = 'assets/van.png';
export function vanSprite() {
  if (!vanImg.complete || !vanImg.naturalWidth) return null;
  const w = vanImg.naturalWidth / 2, h = vanImg.naturalHeight / 2;
  return { img: vanImg, w, h, ox: Math.round(w / 2), oy: Math.round(h - 2) };
}

// The Mystery Box (assets/box-prizes.png, built by tools/build-box.py). Frames:
// 0 closed, 1 shaking, 2-6 the lid opening, 7-12 the open box with each prize above
// it (sword, axe, hammer, scythe, blaster, Giant Sword). Drawn at half size on the
// detail canvas, with the middle of the chest's bottom edge at (ox, oy).
export const BOX_SHAKE = 1, BOX_OPEN = [2, 3, 4, 5, 6], BOX_PRIZES = [7, 8, 9, 10, 11, 12], BOX_GIANT = 12;
const BOX_FW = 100;
export const BOX_BODY = 27; // height of the chest's front panel, in sheet pixels
const boxImg = new Image();
boxImg.src = 'assets/box-prizes.png';
export function boxSprite(frame) {
  if (!boxImg.complete || !boxImg.naturalWidth) return null;
  const h = boxImg.naturalHeight;
  return { img: boxImg, sx: frame * BOX_FW, sw: BOX_FW, sh: h, w: BOX_FW / 2, h: h / 2, ox: BOX_FW / 4, oy: h / 2 - 1 };
}

