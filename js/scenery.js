// Top-down (three-quarter view) scenery: the painted ground with water banks and
// cobblestone paths, plus trees, mushrooms, the cottage and other props.
// Everything is drawn procedurally, pixel by pixel.
import { mulberry32 } from './util.js';
import { MAP, T, O } from './world.js';
import { mk, outline } from './sprites.js';

export const TILE = 16;

const C = {
  grass: '#62b23c', grassD: '#4e9a30', grassDD: '#3e8428', grassL: '#7cc84a',
  dirt: '#c8904a', dirtD: '#a8743c', dirtL: '#dcaa60',
  sand: '#e2b866', sandD: '#c89a50', sandL: '#f0cc80',
  water: '#3aa4e0', waterD: '#2c88c8', waterL: '#62c4f0', foam: '#b8e8fc',
  bank: '#8c5c2c', bankD: '#6c4420', bankShadow: '#2a78b4',
  stone: '#b4aca0', stoneD: '#8c8478', stoneL: '#d4ccc0',
};

// ---------------------------------------------------------------- ground

export function paintGround(world) {
  const S = TILE;
  const { c, g } = mk(MAP * S, MAP * S);
  const at = (x, y) => (x < 0 || y < 0 || x >= MAP || y >= MAP ? T.GRASS : world.ground[y * MAP + x]);
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

  for (let ty = 0; ty < MAP; ty++) {
    for (let tx = 0; tx < MAP; tx++) {
      const t = at(tx, ty);
      const rnd = mulberry32(world.seed ^ (tx * 7919 + ty * 104729));
      const X = tx * S, Y = ty * S;
      if (t === T.WATER) {
        paintWater(g, px, rnd, X, Y, at, tx, ty);
        roundCorners(g, X, Y, (dx, dy) => at(tx + dx, ty + dy) !== T.WATER, C.sand, 8);
        continue;
      }

      const base = t === T.GRASS ? C.grass : t === T.DIRT ? C.dirt : t === T.SAND ? C.sand : C.sand;
      g.fillStyle = base; g.fillRect(X, Y, S, S);
      if (t === T.GRASS) {
        for (let i = 0; i < 26; i++) px(X + ((rnd() * S) | 0), Y + ((rnd() * S) | 0), rnd() < 0.6 ? C.grassD : C.grassL);
        // little "v" grass tufts
        const tufts = (rnd() * 3) | 0;
        for (let i = 0; i < tufts; i++) {
          const x = X + 1 + ((rnd() * 12) | 0), y = Y + 2 + ((rnd() * 12) | 0);
          px(x, y, C.grassDD); px(x + 2, y, C.grassDD); px(x + 1, y + 1, C.grassDD);
          px(x, y - 1, C.grassL); px(x + 2, y - 1, C.grassL);
        }
        if (rnd() < 0.07) {
          const fc = ['#f8f0a0', '#ffffff', '#f8a040', '#f86890'][(rnd() * 4) | 0];
          const x = X + 3 + ((rnd() * 9) | 0), y = Y + 3 + ((rnd() * 9) | 0);
          px(x, y, fc); px(x + 1, y + 1, fc); px(x - 1, y + 1, fc); px(x, y + 2, fc); px(x, y + 1, '#f8d838');
        }
      } else if (t === T.DIRT || t === T.SAND) {
        const d = t === T.DIRT ? C.dirtD : C.sandD, l = t === T.DIRT ? C.dirtL : C.sandL;
        for (let i = 0; i < 18; i++) px(X + ((rnd() * S) | 0), Y + ((rnd() * S) | 0), rnd() < 0.5 ? d : l);
        if (rnd() < 0.3) { const x = X + ((rnd() * 13) | 0), y = Y + ((rnd() * 13) | 0); px(x, y, C.stoneD); px(x + 1, y, C.stone); }
      } else if (t === T.PATH) {
        for (let i = 0; i < 10; i++) px(X + ((rnd() * S) | 0), Y + ((rnd() * S) | 0), C.sandD);
        // cobblestones
        const n = 2 + ((rnd() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const w = 4 + ((rnd() * 3) | 0), h = 3 + ((rnd() * 2) | 0);
          const x = X + ((rnd() * (S - w)) | 0), y = Y + ((rnd() * (S - h)) | 0);
          g.fillStyle = C.stoneD; g.fillRect(x + 1, y + 1, w - 1, h);
          g.fillStyle = C.stone; g.fillRect(x, y, w - 1, h - 1);
          g.fillStyle = C.stoneL; g.fillRect(x + 1, y, w - 3, 1);
        }
      }
      if (t !== T.GRASS) roundCorners(g, X, Y, (dx, dy) => at(tx + dx, ty + dy) === T.GRASS, C.grass, 7);
      // Ragged grass edges spilling onto dirt / path / sand
      if (t !== T.GRASS) {
        const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of sides) {
          if (at(tx + dx, ty + dy) !== T.GRASS) continue;
          for (let i = 0; i < S; i++) {
            const depth = rnd() < 0.5 ? 1 : rnd() < 0.5 ? 2 : 0;
            for (let k = 0; k < depth; k++) {
              const x = dx === 0 ? X + i : dx < 0 ? X + k : X + S - 1 - k;
              const y = dy === 0 ? Y + i : dy < 0 ? Y + k : Y + S - 1 - k;
              px(x, y, k === depth - 1 ? C.grassD : C.grass);
            }
          }
        }
      }
    }
  }
  return c;
}

// Round off a tile's outside corners where both neighbours are a different terrain.
function roundCorners(g, X, Y, other, color, r) {
  const S = TILE;
  g.fillStyle = color;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (!other(dx, 0) || !other(0, dy)) continue;
    const ox = dx < 0 ? X : X + S - r, oy = dy < 0 ? Y : Y + S - r;
    const ccx = dx < 0 ? X + r : X + S - r, ccy = dy < 0 ? Y + r : Y + S - r;
    for (let y = oy; y < oy + r; y++) {
      for (let x = ox; x < ox + r; x++) {
        if (Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy) > r) g.fillRect(x, y, 1, 1);
      }
    }
  }
}

function paintWater(g, px, rnd, X, Y, at, tx, ty) {
  const S = TILE;
  const land = (dx, dy) => at(tx + dx, ty + dy) !== T.WATER;
  g.fillStyle = C.water; g.fillRect(X, Y, S, S);
  if (rnd() < 0.4) { g.fillStyle = C.waterD; g.fillRect(X + ((rnd() * 8) | 0), Y + 4 + ((rnd() * 8) | 0), 6, 3); }
  for (let i = 0; i < 3; i++) {
    const x = X + ((rnd() * 12) | 0), y = Y + 3 + ((rnd() * 12) | 0);
    g.fillStyle = C.waterL; g.fillRect(x, y, 3, 1);
  }
  // Banks: a dirt "cliff" where land is above, foam where land is beside or below
  if (land(0, -1)) {
    g.fillStyle = C.bank; g.fillRect(X, Y, S, 3);
    g.fillStyle = C.bankD; g.fillRect(X, Y + 3, S, 1);
    g.fillStyle = C.bankShadow; g.fillRect(X, Y + 4, S, 2);
    for (let i = 0; i < S; i += 3) px(X + i + ((rnd() * 2) | 0), Y + 1, C.bankD);
  }
  g.fillStyle = C.foam;
  if (land(-1, 0)) g.fillRect(X, Y, 1, S);
  if (land(1, 0)) g.fillRect(X + S - 1, Y, 1, S);
  if (land(0, 1)) g.fillRect(X, Y + S - 1, S, 1);
  // Lily pads
  if (!land(0, -1) && rnd() < 0.08) {
    const x = X + 4 + ((rnd() * 6) | 0), y = Y + 5 + ((rnd() * 6) | 0);
    g.fillStyle = '#2c8c3c'; g.fillRect(x, y + 1, 6, 3); g.fillRect(x + 1, y, 4, 5);
    g.fillStyle = '#58c048'; g.fillRect(x + 1, y + 1, 4, 2); g.fillRect(x + 2, y, 2, 1);
    g.fillStyle = C.water; g.fillRect(x + 3, y, 1, 2);
    if (rnd() < 0.4) { px(x + 1, y + 1, '#f8a0c0'); px(x + 2, y + 1, '#ffffff'); }
  }
}

// ---------------------------------------------------------------- prop sprites

function blob(g, pal, cx, cy, circles, rnd, light = [-0.5, -0.6]) {
  // Fill the union of circles with lit / mid / dark shading and some leafy texture.
  const inside = (x, y) => circles.some(([ox, oy, r]) => (x - ox) ** 2 + (y - oy) ** 2 <= r * r);
  const W = g.canvas.width, H = g.canvas.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const nx = (x - cx), ny = (y - cy);
      const l = Math.hypot(nx, ny) || 1;
      const dot = (nx / l) * light[0] + (ny / l) * light[1];
      const edge = !inside(x + 2, y + 2);
      let col = pal.mid;
      if (dot > 0.35 && l > 3) col = pal.light;
      if (dot < -0.3 || edge) col = pal.dark;
      const r = rnd();
      if (r < 0.12) col = col === pal.light ? pal.mid : pal.dark;
      else if (r < 0.18 && col !== pal.dark) col = pal.light;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  }
}

function oak(variant) {
  const { c, g } = mk(36, 46);
  const rnd = mulberry32(100 + variant);
  // trunk
  g.fillStyle = '#7a4a24'; g.fillRect(15, 28, 6, 16);
  g.fillStyle = '#5a3418'; g.fillRect(19, 28, 2, 16);
  g.fillStyle = '#9a6434'; g.fillRect(16, 30, 1, 10);
  g.fillStyle = '#7a4a24'; g.fillRect(13, 42, 10, 2);
  g.fillStyle = '#5a3418'; g.fillRect(12, 43, 2, 1); g.fillRect(22, 43, 2, 1);
  const k = variant % 3;
  const circles = [[18, 16, 12 + k], [9, 21, 7], [27, 21, 7], [18, 7, 7], [11, 11, 6], [25, 11, 6], [18, 25, 7]];
  blob(g, { light: '#8ed04c', mid: '#58a83a', dark: '#3a7c2c' }, 18, 16, circles, rnd);
  return outline(c, '#1c3418');
}

function pine(variant) {
  const { c, g } = mk(28, 46);
  const rnd = mulberry32(200 + variant);
  g.fillStyle = '#6a4020'; g.fillRect(12, 34, 4, 10);
  g.fillStyle = '#4a2c14'; g.fillRect(14, 34, 2, 10);
  const tiers = [[3, 9], [9, 14], [16, 19], [23, 24]]; // [top y, half width at bottom * ~]
  for (let ti = tiers.length - 1; ti >= 0; ti--) {
    const [ty, w] = tiers[ti];
    const h = 13;
    for (let y = 0; y < h; y++) {
      const hw = Math.round(((y + 2) / (h + 2)) * (w / 2 + 1)) + (rnd() < 0.3 ? 1 : 0);
      for (let x = -hw; x <= hw; x++) {
        let col = '#2c8c5c';
        if (x < -hw / 3 && y < h - 2) col = '#48a870';
        if (x > hw / 3 || y >= h - 2) col = '#1c6448';
        if (rnd() < 0.1) col = '#1c6448';
        g.fillStyle = col; g.fillRect(14 + x, ty + y, 1, 1);
      }
    }
  }
  g.fillStyle = '#48a870'; g.fillRect(14, 2, 1, 2);
  return outline(c, '#0c2c1c');
}

function mushroom() {
  const { c, g } = mk(30, 42);
  g.fillStyle = '#d8d0c8'; g.fillRect(12, 14, 6, 26);
  g.fillStyle = '#a8a098'; g.fillRect(16, 14, 2, 26);
  g.fillStyle = '#f0ece4'; g.fillRect(13, 16, 1, 20);
  g.fillStyle = '#a8a098'; g.fillRect(10, 38, 10, 2);
  for (let y = 0; y < 14; y++) {
    const t = y / 13;
    const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2 * 0.95)));
    for (let x = -hw; x < hw; x++) {
      let col = '#c83c50';
      if (y < 4 && x < 0) col = '#e86878';
      if (y > 10 || x > hw - 3) col = '#8c2838';
      g.fillStyle = col; g.fillRect(15 + x, 2 + y, 1, 1);
    }
  }
  g.fillStyle = '#6c1c28'; g.fillRect(3, 15, 24, 1);
  g.fillStyle = '#f8f0f0';
  for (const [x, y, w] of [[8, 5, 3], [17, 3, 3], [22, 8, 2], [12, 10, 2], [5, 10, 2], [19, 11, 2]]) {
    g.fillRect(x, y, w, w === 3 ? 2 : 1); g.fillRect(x, y + (w === 3 ? 2 : 1), w - 1, 1);
  }
  return outline(c, '#2c1018');
}

function rock(variant) {
  const { c, g } = mk(18, 14);
  const rnd = mulberry32(300 + variant);
  blob(g, { light: '#c8c4c0', mid: '#9c9894', dark: '#6c6864' }, 9, 7, [[9, 8, 6], [6, 9, 4], [12, 9, 4]], rnd);
  return outline(c, '#2c2828');
}

function bush(variant) {
  const { c, g } = mk(20, 16);
  const rnd = mulberry32(400 + variant);
  blob(g, { light: '#7cc84a', mid: '#4c9c34', dark: '#2c6c24' }, 10, 8, [[10, 8, 6], [5, 10, 4], [15, 10, 4]], rnd);
  if (variant % 2) for (let i = 0; i < 4; i++) { g.fillStyle = '#e83c4c'; g.fillRect(5 + ((rnd() * 10) | 0), 5 + ((rnd() * 7) | 0), 1, 1); }
  return outline(c, '#1c3418');
}

function stump() {
  const { c, g } = mk(16, 12);
  g.fillStyle = '#7a4a24'; g.fillRect(3, 4, 10, 6);
  g.fillStyle = '#5a3418'; g.fillRect(10, 4, 3, 6);
  g.fillStyle = '#c8945c'; g.fillRect(3, 2, 10, 3);
  g.fillStyle = '#a8743c'; g.fillRect(5, 3, 6, 1);
  g.fillStyle = '#7a4a24'; g.fillRect(1, 9, 3, 1); g.fillRect(12, 9, 3, 1);
  return outline(c, '#2c1c10');
}

function barrel() {
  const { c, g } = mk(14, 16);
  g.fillStyle = '#a86c34'; g.fillRect(2, 2, 10, 12);
  g.fillStyle = '#c88c4c'; g.fillRect(3, 2, 3, 12);
  g.fillStyle = '#7c4c24'; g.fillRect(9, 2, 3, 12);
  g.fillStyle = '#4c4c54'; g.fillRect(2, 4, 10, 1); g.fillRect(2, 11, 10, 1);
  g.fillStyle = '#8c5c2c'; g.fillRect(3, 1, 8, 2);
  return outline(c, '#2c1c10');
}

function fence() {
  const { c, g } = mk(18, 16);
  g.fillStyle = '#a8743c'; g.fillRect(1, 4, 16, 3); g.fillRect(1, 9, 16, 2);
  g.fillStyle = '#7c5028'; g.fillRect(1, 6, 16, 1); g.fillRect(1, 10, 16, 1);
  for (const x of [2, 12]) {
    g.fillStyle = '#b8844c'; g.fillRect(x, 1, 4, 13);
    g.fillStyle = '#7c5028'; g.fillRect(x + 3, 1, 1, 13);
    g.fillStyle = '#d0a060'; g.fillRect(x, 1, 4, 1);
  }
  return outline(c, '#2c1c10');
}

function house() {
  const W = 56, H = 58;
  const { c, g } = mk(W, H);
  // walls
  g.fillStyle = '#e0b478'; g.fillRect(6, 28, 44, 28);
  for (let y = 30; y < 56; y += 4) { g.fillStyle = '#c0945c'; g.fillRect(6, y, 44, 1); }
  g.fillStyle = '#b8844c'; g.fillRect(6, 28, 2, 28); g.fillRect(48, 28, 2, 28);
  g.fillStyle = '#a8743c'; g.fillRect(6, 54, 44, 2);
  // door
  g.fillStyle = '#a83028'; g.fillRect(24, 40, 9, 16);
  g.fillStyle = '#c84838'; g.fillRect(25, 41, 3, 14);
  g.fillStyle = '#801c18'; g.fillRect(31, 40, 2, 16);
  g.fillStyle = '#f8d838'; g.fillRect(30, 48, 1, 1);
  g.fillStyle = '#7c4c24'; g.fillRect(23, 39, 11, 1);
  // windows
  for (const x of [11, 38]) {
    g.fillStyle = '#7c4c24'; g.fillRect(x - 1, 35, 9, 9);
    g.fillStyle = '#68b8e8'; g.fillRect(x, 36, 7, 7);
    g.fillStyle = '#b8e8fc'; g.fillRect(x + 1, 37, 2, 2);
    g.fillStyle = '#7c4c24'; g.fillRect(x + 3, 36, 1, 7); g.fillRect(x, 39, 7, 1);
    g.fillStyle = '#58a83a'; g.fillRect(x - 1, 44, 9, 2);
    g.fillStyle = '#f86890'; g.fillRect(x + 1, 44, 1, 1); g.fillRect(x + 5, 44, 1, 1);
  }
  // roof: scalloped red shingles
  for (let y = 0; y < 30; y++) {
    const inset = Math.max(0, Math.round((10 - y) * 2.2));
    const x0 = 1 + inset, x1 = W - 1 - inset;
    for (let x = x0; x < x1; x++) {
      const row = Math.floor(y / 4), sx = (x + (row % 2) * 3) % 6;
      let col = '#c8402c';
      if (y % 4 === 3 || sx === 0) col = '#902818';
      else if (y % 4 === 0 && sx > 1 && sx < 4) col = '#e86448';
      if (x > W / 2 + 10) col = col === '#e86448' ? '#c8402c' : col === '#c8402c' ? '#a83420' : col;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = '#701c10'; g.fillRect(1, 29, W - 2, 2);
  // chimney
  g.fillStyle = '#8c8478'; g.fillRect(38, 0, 6, 8);
  g.fillStyle = '#b4aca0'; g.fillRect(38, 0, 6, 2);
  // little attic window
  g.fillStyle = '#7c4c24'; g.fillRect(24, 14, 9, 7);
  g.fillStyle = '#68b8e8'; g.fillRect(25, 15, 7, 5);
  g.fillStyle = '#7c4c24'; g.fillRect(28, 15, 1, 5);
  return outline(c, '#2c1410');
}

function stall() {
  const { c, g } = mk(34, 44);
  // posts
  g.fillStyle = '#8c5c2c'; g.fillRect(3, 10, 3, 32); g.fillRect(28, 10, 3, 32);
  // counter
  g.fillStyle = '#b8844c'; g.fillRect(2, 32, 30, 10);
  g.fillStyle = '#8c5c2c'; g.fillRect(2, 32, 30, 2); g.fillRect(2, 40, 30, 2);
  g.fillStyle = '#d0a060'; g.fillRect(2, 32, 30, 1);
  // goods on the counter
  for (const [x, col] of [[7, '#e83c4c'], [12, '#f8d838'], [17, '#58c048'], [22, '#a060e0']]) {
    g.fillStyle = col; g.fillRect(x, 29, 4, 3);
    g.fillStyle = '#ffffff'; g.fillRect(x + 1, 29, 1, 1);
  }
  // striped awning
  for (let x = 0; x < 34; x++) {
    const red = Math.floor(x / 5) % 2 === 0;
    g.fillStyle = red ? '#d83c3c' : '#f8f0e0'; g.fillRect(x, 4, 1, 8);
    g.fillStyle = red ? '#a02828' : '#d8c8b0'; g.fillRect(x, 11, 1, 1);
    if (x % 5 === 2) { g.fillStyle = red ? '#d83c3c' : '#f8f0e0'; g.fillRect(x, 12, 1, 2); }
  }
  g.fillStyle = '#a02828'; g.fillRect(0, 3, 34, 1);
  return outline(c, '#2c1410');
}

const cache = new Map();
function cached(key, fn) {
  let s = cache.get(key);
  if (!s) { s = fn(); cache.set(key, s); }
  return s;
}

// Returns { img, ox, oy }: draw at (footX - ox, footY - oy), where the foot is the base of the prop.
export function sceneSprite(o, variant = 0) {
  switch (o) {
    case O.OAK: return cached('oak' + (variant % 3), () => ({ img: oak(variant % 3), ox: 18, oy: 45 }));
    case O.PINE: return cached('pine' + (variant % 2), () => ({ img: pine(variant % 2), ox: 14, oy: 45 }));
    case O.MUSHROOM: return cached('mush', () => ({ img: mushroom(), ox: 15, oy: 41 }));
    case O.ROCK: return cached('rock' + (variant % 2), () => ({ img: rock(variant % 2), ox: 9, oy: 13 }));
    case O.BUSH: return cached('bush' + (variant % 2), () => ({ img: bush(variant % 2), ox: 10, oy: 15 }));
    case O.STUMP: return cached('stump', () => ({ img: stump(), ox: 8, oy: 11 }));
    case O.BARREL: return cached('barrel', () => ({ img: barrel(), ox: 7, oy: 15 }));
    case O.FENCE: return cached('fence', () => ({ img: fence(), ox: 9, oy: 15 }));
    case O.HOUSE: return cached('house', () => ({ img: house(), ox: 28, oy: 57 }));
    case O.STALL: return cached('stall', () => ({ img: stall(), ox: 17, oy: 43 }));
    default: return null;
  }
}

// Tall props that should turn see-through when someone walks behind them.
export const TALL = new Set([O.OAK, O.PINE, O.MUSHROOM, O.HOUSE]);
