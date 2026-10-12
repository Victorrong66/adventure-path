// All the 8-bit art is generated in code: characters are composed from parts,
// monsters and props come from little pixel templates.

export const SKINS = ['#ffdcb4', '#f0c08c', '#d8a070', '#b87848', '#8c5430', '#5c3418'];
export const HAIR_STYLES = ['Short', 'Spiky', 'Long', 'Ponytail', 'Afro', 'Mohawk', 'Bun', 'Bald'];
export const HAIR_COLORS = ['#201818', '#6c3c1c', '#f0cc5c', '#c04818', '#e8e8f0', '#3c5ce0', '#e86cb0', '#3cac4c'];
export const OUTFITS = ['Tunic', 'Knight', 'Wizard', 'Ninja', 'Hoodie', 'Overalls'];
export const OUTFIT_COLORS = ['#d83c3c', '#3c64d8', '#3ca03c', '#8c3cc8', '#e8902c', '#2ca8a8', '#404050', '#e8e8e8'];

export const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 1, outfit: 0, outfitColor: 1 };

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

// Hair templates: 10 columns starting at sprite x=1. The head covers cols 2..7, rows 2..7.
const HAIR = {
  Short: {
    down: ['', '...HHHH...', '..HHHHHH..', '..HHhHHH..', '..H....H..'],
    up: ['', '...HHHH...', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..hHHHHh..'],
    side: ['', '...HHHH...', '..HHHHHH..', '..HHHHH...', '..HHH.....', '..hH......'],
  },
  Spiky: {
    down: ['..H.H.H.H.', '..HHHHHHH.', '.HHHHHHHH.', '..HHhHhH..', '..H....H..'],
    up: ['..H.H.H.H.', '..HHHHHHH.', '.HHHHHHHH.', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..hHHHHh..'],
    side: ['.H.H.H....', '.HHHHHHH..', 'HHHHHHHHH.', '.HHHHH....', '..HHH.....', '..hH......'],
  },
  Long: {
    down: ['', '...HHHH...', '..HHHHHH..', '.HHHhHHHH.', '.HH....HH.', '.HH....HH.', '.HH....HH.', '.Hh....hH.', '.Hh....hH.', '.h......h.'],
    up: ['', '...HHHH...', '..HHHHHH..', '.HHHHHHHH.', '.HHHHHHHH.', '.HHHHHHHH.', '.HHHHHHHH.', '.HHHHHHHH.', '.hHHHHHHh.', '..hhhhhh..'],
    side: ['', '...HHHH...', '..HHHHHH..', '.HHHHHHH..', '.HHHH.....', '.HHHH.....', '.HHH......', '.HHH......', '.hHh......', '.hh.......'],
  },
  Ponytail: {
    down: ['', '...HHHH...', '..HHHHHH..', '..HHhHHHH.', '..H....HH.', '........H.', '........h.'],
    up: ['', '...HHHH...', '..HHHHHH..', '..HHHHHH..', '..HHhHHH..', '..HHHHHH..', '..hHHHHh..', '....HH....', '....HH....', '....hh....'],
    side: ['', '...HHHH...', '..HHHHHH..', '.HHHHHH...', 'HHHHH.....', 'HH.HH.....', 'Hh.h......', 'h.........'],
  },
  Afro: {
    down: ['..HHHHHH..', '.HHHHHHHH.', 'HHHHHHHHHH', 'HHHhHHhHHH', 'HHh....hHH', '.Hh....hH.', '..h....h..'],
    up: ['..HHHHHH..', '.HHHHHHHH.', 'HHHHHHHHHH', 'HHHHHHHHHH', 'HHHHHHHHHH', '.HHHHHHHH.', '..hHHHHh..', '...hhhh...'],
    side: ['..HHHHHH..', '.HHHHHHHH.', 'HHHHHHHHHH', 'HHHHHHHHH.', 'HHHHH.....', '.HHHh.....', '..hh......'],
  },
  Mohawk: {
    down: ['....HH....', '....HH....', '...hHHh...'],
    up: ['....HH....', '....HH....', '....HH....', '....HH....', '....hh....'],
    side: ['...HHHH...', '..HHHHH...', '..hHHh....'],
  },
  Bun: {
    down: ['....HH....', '...HhhH...', '..HHHHHH..', '..HHhHHH..', '..H....H..'],
    up: ['....HH....', '...HhhH...', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..hHHHHh..'],
    side: ['.HH.......', 'HhhHHH....', '.HHHHHHH..', '..HHHHHH..', '..HHH.....', '..hH......'],
  },
  Bald: { down: [], up: [], side: [] },
};

const WIZ_HAT = {
  front: ['......H...', '.....HH...', '....HHH...', '...HHYHH..', '.hhhhhhhh.'],
  side: ['..H.......', '..HH......', '...HHH....', '..HHHYH...', '.hhhhhhhh.'],
};

// Build one frame of a character. dir: 0 down, 1 up, 2 side (facing right). frame 0..3.
function buildChar(look, dir, frame) {
  const W = 14, H = 21;
  const { c, g } = mk(W, H);
  const OY = 2; // leave room for hats
  const p = (x, y, col) => { g.fillStyle = col; g.fillRect(x + 1, y + OY, 1, 1); };
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 1, y + OY, w, h); };

  const skin = SKINS[look.skin] || SKINS[0];
  const skinD = shade(skin, -0.15);
  const hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  const hairD = shade(hair, -0.3);
  const out = OUTFIT_COLORS[look.outfitColor] || OUTFIT_COLORS[0];
  const outD = shade(out, -0.3);
  const outfit = OUTFITS[look.outfit] || OUTFITS[0];
  const style = HAIR_STYLES[look.hair] || HAIR_STYLES[0];

  let torso = out, torsoD = outD, sleeve = out, pants = '#5a4030', boots = '#2c1c12', accent = '#3a2818';
  switch (outfit) {
    case 'Knight': torso = '#b8bcc8'; torsoD = '#7c8090'; sleeve = '#a0a4b0'; pants = '#8c90a0'; boots = '#4c5060'; accent = out; break;
    case 'Wizard': pants = out; boots = '#3a2a4a'; accent = '#f0d040'; break;
    case 'Ninja': torso = '#2c2c3c'; torsoD = '#1a1a26'; sleeve = '#2c2c3c'; pants = '#2c2c3c'; boots = '#1a1a26'; accent = out; break;
    case 'Hoodie': pants = '#3c5a9c'; boots = '#e8e8e8'; accent = outD; break;
    case 'Overalls': torso = '#f0f0e8'; torsoD = '#c8c8c0'; sleeve = '#f0f0e8'; pants = out; boots = '#6b4423'; accent = out; break;
  }

  const lift = frame === 1 ? 1 : frame === 3 ? 2 : 0;
  const side = dir === 2;

  // Legs
  if (!side) {
    const lY = lift === 1 ? -1 : 0, rY = lift === 2 ? -1 : 0;
    r(4, 13 + lY, 2, 3, pants); r(4, 16 + lY, 2, 1, boots);
    r(6, 13 + rY, 2, 3, pants); r(6, 16 + rY, 2, 1, boots);
  } else if (lift) {
    r(3, 13, 2, 3, pants); r(2, 16, 3, 1, boots);
    r(7, 13, 2, 3, shade(pants, -0.15)); r(7, 16, 3, 1, boots);
  } else {
    r(5, 13, 2, 3, pants); r(5, 16, 3, 1, boots);
  }

  // Hood sits behind the head when seen from the front
  if (outfit === 'Hoodie' && dir === 0) r(2, 3, 8, 5, outD);

  // Torso
  r(3, 8, 6, 5, torso);
  r(3, 12, 6, 1, torsoD);

  // Arms
  if (!side) {
    const swing = lift === 1 ? 1 : lift === 2 ? -1 : 0;
    r(2, 8, 1, 3 + Math.max(0, swing), sleeve); p(2, 11 + Math.max(0, swing), skin);
    r(9, 8, 1, 3 + Math.max(0, -swing), sleeve); p(9, 11 + Math.max(0, -swing), skin);
  }

  // Head
  r(3, 2, 6, 6, skin);
  r(3, 7, 6, 1, skinD);
  if (dir === 0) { p(4, 5, '#201828'); p(7, 5, '#201828'); p(5, 6, skinD); p(6, 6, skinD); }
  if (side) { p(7, 5, '#201828'); p(8, 6, skinD); }

  // Outfit details
  switch (outfit) {
    case 'Tunic':
      r(3, 11, 6, 1, accent);
      if (dir === 0) { p(5, 8, skin); p(6, 8, skin); }
      break;
    case 'Knight':
      if (!side) { r(5, 8, 2, 5, out); p(2, 8, torsoD); p(9, 8, torsoD); } else r(5, 8, 3, 5, out);
      break;
    case 'Wizard':
      r(3, 8, 6, 8, out); r(3, 15, 6, 1, outD); r(3, 11, 6, 1, accent);
      if (!side) { r(4, 16 + (lift === 1 ? -1 : 0), 2, 1, boots); r(6, 16 + (lift === 2 ? -1 : 0), 2, 1, boots); }
      else r(5, 16, 3, 1, boots);
      break;
    case 'Ninja':
      r(3, 11, 6, 1, out);
      if (dir === 0) r(3, 6, 6, 2, '#2c2c3c');
      if (side) r(5, 6, 4, 2, '#2c2c3c');
      break;
    case 'Hoodie':
      r(4, 11, 4, 1, torsoD);
      if (dir === 0) { p(5, 9, '#f0f0f0'); p(6, 9, '#f0f0f0'); }
      break;
    case 'Overalls':
      if (!side) { r(4, 9, 4, 4, out); p(4, 8, out); p(7, 8, out); if (dir === 0) { p(4, 9, '#f0d040'); p(7, 9, '#f0d040'); } }
      else r(4, 9, 5, 4, out);
      break;
  }

  // Side arm in front of the torso
  if (side) {
    const hx = lift === 1 ? 7 : lift === 2 ? 4 : 5;
    r(5, 8, 2, 3, outfit === 'Wizard' ? outD : shade(sleeve, -0.1));
    r(hx, 11, 2, 1, skin);
  }

  // Hair
  const tpl = HAIR[style][dir === 0 ? 'down' : dir === 1 ? 'up' : 'side'];
  tpl.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'H') p(x + 1, y, hair);
      else if (row[x] === 'h') p(x + 1, y, hairD);
    }
  });

  // Hood from behind / side covers the lower back of the head
  if (outfit === 'Hoodie' && dir === 1) r(3, 4, 6, 4, out);
  if (outfit === 'Hoodie' && side) r(2, 3, 3, 5, outD);
  if (outfit === 'Ninja') {
    r(3, 3, 6, 1, out);
    if (dir === 1) { p(5, 4, out); p(6, 4, out); }
    if (side) { p(2, 3, out); p(1, 4, out); }
  }
  if (outfit === 'Wizard') {
    const hat = side ? WIZ_HAT.side : WIZ_HAT.front;
    hat.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === 'H') p(x + 1, y - 2, out);
        else if (ch === 'h') p(x + 1, y - 2, outD);
        else if (ch === 'Y') p(x + 1, y - 2, '#f8e050');
      }
    });
  }
  return outline(c);
}

const charCache = new Map();
// Returns { img, ox, oy }: draw img at (footX - ox, footY - oy).
export function charSprite(look, facing, frame) {
  const key = `${look.skin}${look.hair}${look.hairColor}${look.outfit}${look.outfitColor}|${facing}|${frame}`;
  let s = charCache.get(key);
  if (!s) {
    const dir = facing === 3 ? 2 : facing;
    let img = buildChar(look, dir, frame);
    if (facing === 3) img = flipped(img);
    s = { img, ox: 7, oy: 19 };
    charCache.set(key, s);
  }
  return s;
}

export const MERCHANT_LOOK = { skin: 2, hair: 2, hairColor: 4, outfit: 2, outfitColor: 3 };

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
    const tpl = MONSTER_TPL[type];
    const rows = tpl.frames[frame % tpl.frames.length];
    let img = fromTemplate(rows, tpl.pal);
    if (facing < 0) img = flipped(img);
    s = { img, white: whiteOf(img), ox: img.width >> 1, oy: img.height - 1 };
    monsterCache.set(key, s);
  }
  return s;
}
export const monsterFrames = (type) => (mobFace ? (type === 'bat' ? 2 : 1) : MONSTER_TPL[type].frames.length);

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
let giantBlade = null;
export function giantSwordSprite(lengthPx) {
  if (giantBlade && giantBlade.width === lengthPx + 2) return giantBlade;
  const W = lengthPx, H = 15, mid = 7;
  const { c, g } = mk(W + 2, H);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 1, y, w, h); };
  r(0, mid - 2, 9, 5, '#7c4c24'); r(0, mid - 2, 9, 1, '#a8743c');     // handle
  for (let x = 1; x < 9; x += 3) r(x, mid - 2, 1, 5, '#5c3418');      // grip wrap
  r(-1, mid - 2, 2, 5, '#f8d838');                                    // pommel
  r(9, 1, 4, 13, '#f8d838'); r(9, 1, 4, 1, '#fff8a0'); r(12, 1, 1, 13, '#c09018'); // guard
  r(10, mid, 2, 1, '#e83c4c');                                        // gem
  const bladeEnd = W - 10;
  r(13, mid - 3, bladeEnd - 13, 7, '#d8dcf0');                        // blade (7px wide)
  r(13, mid - 3, bladeEnd - 13, 1, '#ffffff');
  r(13, mid + 3, bladeEnd - 13, 1, '#8c90a8');
  r(13, mid, bladeEnd - 16, 1, '#b0b4cc');                            // fuller
  for (let x = 20; x < bladeEnd - 4; x += 24) r(x, mid - 2, 2, 1, '#ffffff'); // glints
  for (let i = 0; i < 10; i++) {                                      // tapered tip
    const h = Math.max(1, 7 - Math.round(i * 0.7));
    r(bladeEnd + i, mid - Math.floor(h / 2), 1, h, i > 7 ? '#ffffff' : '#d8dcf0');
  }
  giantBlade = outline(c, '#1c1830');
  return giantBlade;
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
