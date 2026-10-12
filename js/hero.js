// Heroes are drawn at twice the world's resolution (each pixel here is half a world
// pixel). Style: chunky, readable shapes with no hard outline - forms are separated
// by colour and 2-3 tone shading (cool shadows, warm highlights) - a heroic wide
// stance, big sleeves and gloved fists, and a thick scarf/cape whose tail flows
// behind the hero and waves even when standing still. Viking-era outfits.
//
// Canvas 56x62. Coordinates below are written for a 40-wide frame (centre x = 20)
// and shifted right by X0 so cloth and swords can reach past the body.
//
// dir: 0 down (front), 1 up (back), 2 side (facing right; left is a mirror image).
// pose: 'walk' (frames 0..3), 'idle' (0..3: breathing + cloth waving),
//       'atk' (0..2: wind-up, slash, follow-through).

export const HERO_W = 56, HERO_H = 62;
const X0 = 8;
const IRIS = '#3f78a8', IRIS_D = '#24345a', WHITE = '#f2eee8', MOUTH = '#7a3e3a';
const IRON = '#8f969e', IRON_D = '#5a606a', IRON_L = '#c8ced4';
const STEEL = '#dde3ea', STEEL_D = '#8a93a2', BRASS = '#d0a040', BRASS_D = '#8a6420', GRIP = '#4a3020';
const LEATHER = '#8a5a34', SHIRT = '#8c8a96', SLEEVE = '#d6d2e2', GLOVE = '#4a3a34', WRAP = '#b8a888', WOAD = '#3e66b4';

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
const dk = (c, t = 0.3) => mix(c, '#1c1630', t);
const lt = (c, t = 0.2) => mix(c, '#fff2d8', t);

// Soft edge: a translucent deep shade of the neighbouring colour, only where the
// hero meets the background - keeps heroes readable on grass without a cartoon line.
function softEdge(c) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data, out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]) continue;
      for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (!d[j + 3]) continue;
        out[i] = d[j] * 0.3 + 16 * 0.7; out[i + 1] = d[j + 1] * 0.3 + 14 * 0.7; out[i + 2] = d[j + 2] * 0.3 + 26 * 0.7;
        out[i + 3] = ny > y ? 120 : 150; // a touch heavier along the bottom
        break;
      }
    }
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
  return c;
}

// look: { skin, hair, outfitColor (hex), style, outfit, beard (names) }
export function buildHero(look, dir, pose, frame) {
  const c = document.createElement('canvas');
  c.width = HERO_W; c.height = HERO_H;
  const g = c.getContext('2d');
  const front = dir === 0, back = dir === 1, side = dir === 2;
  const atk = pose === 'atk', walk = pose === 'walk', idle = pose === 'idle';
  const by = walk && frame % 2 === 1 ? -1 : idle && (frame === 1 || frame === 2) ? 1 : 0;

  const fill = (x, y, w, h, col) => { if (col && w > 0 && h > 0) { g.fillStyle = col; g.fillRect(x + X0, y, w, h); } };
  const R = (x, y, w, h, col) => fill(x, y + by, w, h, col);
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const L = fill;
  const line = (x0, y0, x1, y1, w, col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= n; i++) R(Math.round(x0 + ((x1 - x0) * i) / n - (w - 1) / 2), Math.round(y0 + ((y1 - y0) * i) / n - (w - 1) / 2), w, w, col);
  };

  const skin = look.skin, skinD = dk(skin, 0.22), skinDD = dk(skin, 0.42), skinL = lt(skin, 0.22);
  const hair = look.hair, hairD = dk(hair, 0.4), hairL = lt(hair, 0.28);
  const out = look.outfitColor, outD = dk(out, 0.32), outDD = dk(out, 0.52), outL = lt(out, 0.22);
  const outfit = look.outfit, style = look.style, beard = look.beard;

  // ------------------------------------------------------------------ outfit palette
  let shirt = SHIRT, vest = LEATHER, sleeve = SLEEVE, glove = GLOVE, pants = '#3c4038', boots = '#7a4a2a', wraps = WRAP;
  let cloth = out; // the flowing scarf / cape
  let bare = false, longTunic = false, mail = false;
  switch (outfit) {
    case 'Raider': break;
    case 'Huscarl': shirt = IRON; vest = null; sleeve = IRON; mail = true; pants = dk(out, 0.5); boots = '#5a3e2a'; break;
    case 'Skald': shirt = out; vest = null; sleeve = lt(out, 0.3); longTunic = true; cloth = '#3e3634'; pants = '#3e3632'; break;
    case 'Berserker': shirt = skin; vest = null; sleeve = skin; bare = true; cloth = '#5e4634'; pants = out; glove = '#3a2c24'; wraps = '#4a3a2c'; break;
    case 'Jarl': shirt = out; vest = null; sleeve = lt(out, 0.25); cloth = dk(out, 0.35); pants = '#3a3230'; boots = '#4e3424'; break;
    case 'Hunter': shirt = '#7a6a4a'; vest = '#5e4630'; sleeve = '#a89a78'; pants = '#4e4a3a'; break;
  }
  const shirtD = dk(shirt, 0.28), shirtL = lt(shirt, 0.18);
  const sleeveD = dk(sleeve, 0.25), sleeveL = lt(sleeve, 0.25);
  const pantsD = dk(pants, 0.3), bootsD = dk(boots, 0.32), bootsL = lt(boots, 0.2), wrapsD = dk(wraps, 0.3);
  const clothD = dk(cloth, 0.3), clothL = lt(cloth, 0.25), clothDD = dk(cloth, 0.5);

  // ------------------------------------------------------------------ the flowing tail
  // Waves with time in idle, streams back when moving. side: trails behind (left).
  const wavePhase = idle ? frame * (Math.PI / 2) : walk ? frame * (Math.PI / 2) + 1 : 2;
  const stream = walk ? 1.25 : atk ? 1.4 : 1;
  const tail = (ax, ay, len, dirX) => {
    // a wide ribbon of cloth: flows out and down, rippling along its length
    let lastX = ax;
    for (let i = 0; i < len; i++) {
      const y = ay + i;
      const ripple = Math.sin(wavePhase + i * 0.5) * (0.4 + i * 0.07);
      const xc = ax + dirX * (Math.min(i, 8) * 0.75 * stream + Math.max(0, i - 8) * 0.25 * stream) + ripple * dirX;
      const w = Math.max(3, 7 - Math.floor(i / 4));
      const x = Math.round(xc - w / 2);
      R(x, y, w, 1, cloth);
      R(dirX < 0 ? x : x + w - 1, y, 1, 1, clothD);      // outer edge in shade
      R(dirX < 0 ? x + w - 1 : x, y, 1, 1, clothL);      // inner edge catches light
      if (i % 5 === 3) R(x + 1, y, w - 2, 1, clothD);    // woven stripe
      lastX = x + (w >> 1);
    }
    // frayed fringe at the end
    for (let k = -1; k <= 1; k += 2) P(lastX + k, ay + len, clothD);
    P(lastX, ay + len + 1, clothD);
  };

  // ------------------------------------------------------------------ behind the body
  if (outfit !== 'Huscarl' || !back) {
    if (front) tail(11, 23, 15, -1);
    else if (back) tail(29, 23, 15, 1);
    else tail(14, 22, 16, -1);
  }
  if (outfit === 'Hunter' && !front) {
    const qx = side ? 11 : 23;
    R(qx, 18, 4, 18, LEATHER); R(qx + 3, 18, 1, 18, dk(LEATHER)); R(qx, 18, 4, 1, dk(LEATHER, 0.45));
    for (const x of [qx, qx + 2]) { R(x, 14, 1, 4, '#ddd4c2'); P(x, 14, '#b03a2a'); }
  }

  // ------------------------------------------------------------------ legs: wide, planted stance
  const step = walk ? frame : 0;
  const legF = (x, lift, out1) => {
    const top = 44, bot = 53 - lift;
    L(x, top, 5, bot - top + 1, wraps);
    for (let y = top; y <= bot; y++) for (let i = 0; i < 5; i++) if ((i + y) % 3 === 0) L(x + i, y, 1, 1, wrapsD);
    L(x + 4, top, 1, bot - top + 1, wrapsD);
    const bx = x + (out1 < 0 ? -2 : 0), byy = 52 - lift;
    L(bx, byy, 7, 6, boots); L(bx, byy, 7, 1, bootsL); L(bx, byy + 5, 7, 1, bootsD); L(out1 < 0 ? bx + 6 : bx, byy + 1, 1, 4, bootsD);
  };
  if (!side) {
    legF(13, step === 1 ? 2 : 0, -1);
    legF(22, step === 3 ? 2 : 0, 1);
  } else {
    const legS = (x, lift, dark) => {
      const w = dark ? dk(wraps, 0.25) : wraps;
      L(x, 44, 5, 9 - lift, w);
      for (let y = 44; y < 53 - lift; y++) for (let i = 0; i < 5; i++) if ((i + y) % 3 === 0) L(x + i, y, 1, 1, dk(w, 0.3));
      const b = dark ? dk(boots, 0.25) : boots;
      L(x, 52 - lift, 8, 6, b); L(x, 52 - lift, 8, 1, lt(b, 0.2)); L(x, 57 - lift, 8, 1, dk(b, 0.35));
    };
    if ((walk && frame % 2 === 1) || atk) { legS(12, 1, true); legS(22, 0, false); }
    else { legS(14, 0, true); legS(20, 0, false); }
  }

  // trousers / shorts
  if (!side) { R(13, 38, 14, 7, pants); R(19, 42, 2, 3, pantsD); R(24, 38, 3, 7, pantsD); L(13, 44, 5, 1, pantsD); L(22, 44, 5, 1, pantsD); }
  else { R(15, 38, 11, 7, pants); R(15, 38, 2, 7, pantsD); }

  // ------------------------------------------------------------------ torso
  const tx = side ? 15 : 12, tw = side ? 11 : 16;
  R(tx, 23, tw, 16, shirt);
  R(tx + 1, 22, tw - 2, 1, shirt);
  if (!side) { R(12, 23, 1, 14, shirtL); R(24, 23, 4, 16, shirtD); } else { R(15, 23, 2, 16, shirtD); R(24, 24, 1, 12, shirtL); }
  if (mail) for (let y = 23; y < 41; y++) for (let x = tx; x < tx + tw; x++) if ((x + y) % 2 === 0) P(x, y, (x - tx) > tw - 5 ? IRON_D : dk(IRON, 0.12));
  if (mail) { R(tx, 39, tw, 2, IRON); R(tx, 41, tw, 1, out); }
  if (longTunic) {
    for (let y = 38; y < 47; y++) R(tx - Math.floor((y - 38) / 4), y, tw + Math.floor((y - 38) / 4) * 2, 1, shirt);
    R(tx + tw - 3, 38, 3, 9, shirtD);
    for (let x = tx - 2; x < tx + tw + 2; x++) { P(x, 45, x % 2 ? BRASS : '#a8382a'); P(x, 46, outDD); }
  }
  if (vest) {
    if (front) { R(12, 25, 6, 13, vest); R(22, 25, 6, 13, dk(vest, 0.15)); R(26, 25, 2, 13, dk(vest, 0.35)); R(12, 25, 1, 13, lt(vest, 0.2)); }
    else if (back) { R(12, 25, 16, 13, vest); R(24, 25, 4, 13, dk(vest, 0.3)); }
    else { R(16, 25, 9, 13, vest); R(16, 25, 2, 13, dk(vest, 0.3)); }
  }
  if (bare) {
    if (front) { R(15, 27, 4, 1, WOAD); R(21, 27, 4, 1, WOAD); P(16, 29, WOAD); P(23, 29, WOAD); R(19, 30, 2, 3, WOAD); line(13, 24, 26, 36, 1, LEATHER); }
    else if (side) { R(19, 27, 1, 5, WOAD); line(16, 24, 24, 36, 1, LEATHER); }
    else { R(17, 28, 6, 1, WOAD); line(13, 24, 26, 36, 1, LEATHER); }
    R(tx, 34, tw, 4, out); R(tx, 34, tw, 1, dk(out, 0.4));
  }
  // belt
  if (!bare) {
    R(tx, 36, tw, 3, '#3a2a20'); R(tx, 38, tw, 1, '#2a1e18');
    if (!side) { R(18, 36, 4, 3, BRASS); P(19, 37, BRASS_D); } else R(22, 36, 3, 3, BRASS);
    if (front) { R(14, 39, 2, 4, '#3a2a20'); P(14, 42, BRASS); }
  }
  if (outfit === 'Jarl' && !side) for (let x = tx; x < tx + tw; x++) P(x, 35, BRASS);
  if (outfit === 'Hunter' && front) for (let y = 26; y < 35; y += 2) { P(19, y, WRAP); P(20, y + 1, WRAP); }

  // ------------------------------------------------------------------ arms (big sleeves, gloved fists)
  const swing = walk ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
  const sleeveCol = bare ? skin : sleeve, sleeveColD = bare ? skinD : sleeveD, sleeveColL = bare ? skinL : sleeveL;
  const fist = (x, y) => { R(x, y, 5, 4, glove); R(x, y, 5, 1, lt(glove, 0.25)); R(x + 4, y + 1, 1, 3, dk(glove, 0.35)); };
  const armF = (x, d, right) => {
    R(x, 23 + d, 6, 10, sleeveCol);
    R(right ? x + 4 : x, 23 + d, 2, 10, sleeveColD); R(right ? x : x + 5, 24 + d, 1, 7, sleeveColL);
    if (mail) for (let y = 24; y < 32; y += 2) for (let i = 0; i < 6; i += 2) P(x + i + (y % 4 ? 1 : 0), y + d, IRON_D);
    if (bare) { R(x, 27 + d, 6, 1, WOAD); R(x, 31 + d, 6, 1, BRASS); }
    R(x, 32 + d, 6, 2, outfit === 'Jarl' ? BRASS : glove); // cuff / bracer
    fist(right ? x : x + 1, 34 + d);
  };
  if (side && (swing || atk)) {
    const bx = atk ? 13 : swing > 0 ? 23 : 13;
    R(bx, 25, 5, 8, dk(sleeveCol, 0.3)); R(bx, 33, 5, 4, dk(glove, 0.3));
  }
  if (atk) {
    const f = Math.min(2, frame);
    const SW = {
      0: [[30, 25, 32, 15, -100], [30, 25, 35, 26, -8], [30, 25, 32, 33, 62]],
      1: [[30, 25, 34, 25, 15], [30, 25, 30, 13, -90], [30, 25, 23, 12, -150]],
      2: [[22, 25, 17, 14, -120], [22, 25, 29, 26, -5], [22, 25, 27, 33, 50]],
    }[dir][f];
    const [sx0, sy0, hx, hy, ang] = SW;
    if (!side) armF(6, 0, false);
    line(sx0 + 1, sy0 + 1, hx + 1, hy + 1, 5, sleeveCol);
    line(Math.round((sx0 + hx * 2) / 3) + 1, Math.round((sy0 + hy * 2) / 3) + 1, hx + 1, hy + 1, 4, glove);
    R(hx - 1, hy - 1, 4, 4, glove); R(hx - 1, hy - 1, 4, 1, lt(glove, 0.25));
    sword(hx, hy, ang);
  } else if (!side) {
    armF(6, swing, false);
    armF(28, -swing, true);
  } else {
    const hx = swing > 0 ? 15 : swing < 0 ? 23 : 19;
    R(19, 23, 6, 8, sleeveCol); R(19, 23, 2, 8, sleeveColD); R(24, 24, 1, 6, sleeveColL);
    R(Math.round((19 + hx) / 2), 30, 6, 3, sleeveCol);
    R(Math.round((19 + hx) / 2), 32, 6, 2, outfit === 'Jarl' ? BRASS : glove);
    fist(hx, 34);
  }

  // ------------------------------------------------------------------ head
  if (!side) {
    R(14, 9, 12, 10, skin); R(15, 19, 10, 2, skin); R(16, 21, 8, 1, skinD);
    R(24, 10, 2, 10, skinD); R(23, 19, 2, 2, skinD); R(14, 17, 1, 2, skinD);
    if (!back) {
      // brows, big clear eyes, nose, mouth
      const brow = style === 'Shaved' ? skinDD : hairD;
      R(15, 12, 4, 1, brow); R(21, 12, 4, 1, brow);
      P(15, 13, WHITE); P(15, 14, WHITE); R(16, 13, 2, 2, IRIS); R(16, 14, 2, 1, IRIS_D); P(17, 13, WHITE);
      P(24, 13, WHITE); P(24, 14, WHITE); R(22, 13, 2, 2, IRIS); R(22, 14, 2, 1, IRIS_D); P(23, 13, WHITE);
      R(19, 15, 2, 2, skinD); P(19, 15, skinL);
      R(18, 18, 4, 1, MOUTH); R(17, 19, 6, 1, skinL);
      if (outfit === 'Berserker') { R(14, 15, 4, 2, WOAD); R(22, 15, 4, 2, WOAD); }
    }
    R(13, 12, 1, 4, skin); R(26, 12, 1, 4, skinD); // ears
  } else {
    R(16, 9, 11, 10, skin); R(17, 19, 9, 2, skin); R(18, 21, 7, 1, skinD);
    R(16, 10, 2, 10, skinD);
    R(27, 14, 1, 3, skin); P(27, 16, skinD); // nose
    R(22, 12, 4, 1, style === 'Shaved' ? skinDD : hairD);
    P(23, 13, WHITE); P(23, 14, WHITE); R(24, 13, 2, 2, IRIS); R(24, 14, 2, 1, IRIS_D);
    R(24, 18, 2, 1, MOUTH);
    R(18, 13, 2, 4, skinD); P(19, 13, skin); // ear
    if (outfit === 'Berserker') R(22, 15, 4, 2, WOAD);
  }

  // ------------------------------------------------------------------ beard
  if (beard !== 'None' && !back) {
    if (front) {
      R(14, 16, 2, 4, hair); R(24, 16, 2, 4, hairD); R(15, 19, 10, 3, hair); R(16, 22, 8, 1, hair); R(17, 23, 6, 1, hairD);
      R(17, 17, 6, 1, hair); R(18, 18, 4, 1, MOUTH); R(16, 19, 2, 1, hairL); P(19, 21, hairD); P(21, 21, hairD);
      if (beard === 'Braided') { R(18, 24, 4, 6, hair); for (let y = 24; y < 30; y += 2) { P(18, y, hairD); P(21, y + 1, hairD); } R(18, 27, 4, 1, BRASS); }
    } else {
      R(18, 16, 3, 5, hair); R(19, 19, 8, 3, hair); R(21, 22, 5, 1, hairD); R(22, 17, 5, 1, hair); P(25, 18, MOUTH);
      if (beard === 'Braided') { R(22, 23, 3, 6, hair); P(22, 24, hairD); P(24, 26, hairD); R(22, 26, 3, 1, BRASS); }
    }
  }

  // ------------------------------------------------------------------ scarf wrap / collar (over the neck)
  const collar = () => {
    if (outfit === 'Jarl') {
      const fw = '#ece8e0', fwD = '#bcb6aa';
      if (!side) { R(11, 20, 18, 4, fw); for (let x = 11; x < 29; x += 2) { P(x, 24, fw); P(x + 1, 21, fwD); } if (front) { R(14, 24, 3, 3, BRASS); R(23, 24, 3, 3, BRASS); } }
      else { R(14, 20, 13, 4, fw); for (let x = 14; x < 27; x += 2) P(x, 24, fw); }
      return;
    }
    if (outfit === 'Berserker') {
      const pel = '#5e4634', pelD = dk(pel, 0.35);
      if (!side) { R(9, 20, 22, 5, pel); for (let x = 9; x < 31; x += 2) P(x, 25, pel); for (let x = 10; x < 30; x += 3) P(x, 22, pelD); }
      else { R(12, 20, 15, 5, pel); for (let x = 12; x < 27; x += 2) P(x, 25, pel); }
      return;
    }
    // thick wrapped scarf (Huscarl: a short cape clasped at the neck)
    if (!side) {
      R(13, 20, 14, 5, cloth); R(13, 21, 14, 1, clothL); R(13, 23, 14, 1, clothD); R(24, 20, 3, 5, clothD);
      if (front) { R(11, 22, 4, 5, cloth); R(11, 25, 4, 1, clothD); P(12, 23, clothL); } // knot
      if (outfit === 'Huscarl') { R(18, 22, 4, 2, BRASS); }
    } else {
      R(15, 20, 12, 5, cloth); R(15, 21, 12, 1, clothL); R(15, 23, 12, 1, clothD); R(13, 21, 3, 4, clothDD);
    }
  };
  collar();

  // ------------------------------------------------------------------ hair & headgear
  drawHair(style, front ? 'front' : back ? 'back' : 'side', R, P, hair, hairD, hairL, skin);

  if (outfit === 'Huscarl') {
    const hx = side ? 15 : 13, hw = side ? 13 : 14;
    R(hx + 3, 3, hw - 6, 1, IRON); R(hx + 1, 4, hw - 2, 2, IRON); R(hx, 6, hw, 5, IRON);
    R(hx, 10, hw, 2, IRON_D); R(hx + 2, 4, 3, 2, IRON_L); R(hx + hw - 4, 5, 3, 5, IRON_D);
    R(side ? 20 : 19, 3, 2, 8, IRON_D);
    for (let x = hx + 1; x < hx + hw; x += 3) P(x, 11, IRON_L);
    if (front) { R(19, 12, 2, 5, IRON); P(19, 12, IRON_L); }
    if (side) { R(26, 11, 2, 5, IRON); R(15, 11, 3, 6, IRON_D); }
  }
  if (outfit === 'Berserker') {
    const pel = '#5e4634', pelD = dk(pel, 0.35), pelL = lt(pel, 0.2);
    if (!side) {
      R(12, 3, 16, 9, pel); R(11, 6, 18, 5, pel); R(12, 1, 4, 3, pel); R(24, 1, 4, 3, pel); R(13, 2, 2, 1, pelD); R(25, 2, 2, 1, pelD);
      R(14, 4, 4, 1, pelL); R(11, 10, 18, 1, pelD);
      if (front) { R(16, 10, 8, 3, pel); R(17, 12, 6, 1, '#2a2220'); P(16, 11, '#ece4cc'); P(23, 11, '#ece4cc'); }
      if (back) { R(11, 10, 18, 12, pel); for (let y = 12; y < 22; y += 3) for (let x = 12 + (y % 2); x < 28; x += 3) P(x, y, pelD); }
    } else {
      R(14, 3, 13, 9, pel); R(15, 1, 4, 3, pel); R(25, 8, 4, 4, pel); P(28, 10, '#2a2220');
      R(12, 8, 7, 14, pel); R(15, 4, 4, 1, pelL); R(14, 11, 4, 1, pelD);
    }
  }
  if (outfit === 'Hunter') {
    // hood up
    if (!side) {
      R(12, 4, 16, 6, out); R(11, 7, 2, 13, out); R(27, 7, 2, 13, outD); R(13, 4, 5, 1, outL); R(12, 9, 16, 1, outD);
      if (back) { R(12, 4, 16, 18, out); R(24, 5, 4, 17, outD); R(18, 19, 4, 4, outD); }
    } else { R(14, 4, 13, 6, out); R(12, 7, 7, 15, out); R(12, 8, 2, 14, outD); R(19, 9, 8, 1, outD); R(15, 4, 5, 1, outL); }
  }

  return softEdge(c);

  // Viking sword from a fist at (hx, hy), pointing at angle a (degrees, 0 = right, 90 = down)
  function sword(hx, hy, a) {
    const r = (a * Math.PI) / 180, cx = Math.cos(r), cy = Math.sin(r), px = -cy, py = cx;
    const at = (t, s = 0) => [Math.round(hx + 1 + cx * t + px * s), Math.round(hy + 1 + cy * t + py * s)];
    for (let t = -3; t <= -1; t++) { const [x, y] = at(t); P(x, y, GRIP); }
    { const [x, y] = at(-4); P(x, y, BRASS); }
    for (let s = -3; s <= 3; s++) { const [x, y] = at(1, s); P(x, y, Math.abs(s) > 1 ? BRASS_D : BRASS); }
    for (let t = 2; t <= 15; t++) {
      const [x, y] = at(t); P(x, y, STEEL);
      const [x2, y2] = at(t, 1); if (t < 15) P(x2, y2, STEEL_D);
      const [x3, y3] = at(t, -1); if (t < 14) P(x3, y3, lt(STEEL, 0.5));
    }
  }
}

// Messy, chunky hair. R/P paint in upper-body coordinates.
function drawHair(style, view, R, P, H, D, Lt, skin) {
  const front = view === 'front', back = view === 'back';
  // big tousled mass on top with darker clumps and a highlight sweep
  const mopFront = (low = 11) => {
    R(15, 4, 10, 1, H); R(13, 5, 14, 2, H); R(12, 7, 16, low - 6, H);
    R(12, low + 1, 4, 2, H); R(23, low + 1, 5, 2, H); R(12, low + 3, 2, 2, D); R(26, low + 3, 2, 2, D);
    R(16, low + 1, 2, 1, H); R(20, low + 1, 2, 1, D);
    for (const [x, y] of [[14, 7], [18, 6], [22, 8], [25, 6], [16, 9], [21, 10]]) R(x, y, 2, 2, D);
    R(15, 5, 4, 1, Lt); R(14, 6, 2, 1, Lt); R(20, 5, 2, 1, Lt);
    R(26, 7, 2, low - 6, D);
  };
  const mopBack = (low = 20) => {
    R(15, 4, 10, 1, H); R(13, 5, 14, 2, H); R(12, 7, 16, low - 6, H);
    for (const [x, y] of [[15, 9], [20, 8], [17, 14], [22, 13], [14, 18], [20, 19]]) if (y < low) R(x, y, 1, 3, D);
    R(24, 7, 4, low - 6, D); R(15, 5, 4, 1, Lt);
    for (let x = 12; x < 28; x += 3) P(x, low + 1, H);
  };
  const mopSide = (low = 19) => {
    R(16, 4, 10, 1, H); R(14, 5, 13, 2, H); R(13, 7, 15, 5, H); R(26, 12, 2, 1, H);
    R(13, 12, 7, low - 11, H); R(13, 12, 2, low - 11, D);
    for (const [x, y] of [[16, 7], [20, 6], [24, 8], [15, 13], [17, 16]]) R(x, y, 2, 2, D);
    R(18, 5, 4, 1, Lt); R(16, 6, 2, 1, Lt);
    for (let x = 13; x < 20; x += 3) P(x, low + 1, H);
  };
  const stubble = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, (i * 3 + j * 5) % 7 === 0 ? mix(skin, H, 0.55) : mix(skin, H, 0.32)); };
  switch (style) {
    case 'Cropped':
      if (front) { R(14, 5, 12, 1, H); R(13, 6, 14, 4, H); R(13, 10, 3, 1, H); R(22, 10, 5, 1, H); R(25, 6, 2, 4, D); for (const x of [16, 19, 22]) R(x, 7, 1, 3, D); R(15, 6, 3, 1, Lt); }
      else if (back) { R(14, 5, 12, 1, H); R(13, 6, 14, 13, H); R(24, 6, 3, 13, D); for (const x of [16, 19, 22]) R(x, 8, 1, 10, D); }
      else { R(15, 5, 11, 1, H); R(14, 6, 13, 4, H); R(14, 10, 5, 8, H); R(14, 10, 2, 8, D); R(17, 6, 3, 1, Lt); }
      break;
    case 'Shaggy':
      if (front) mopFront(); else if (back) mopBack(); else mopSide();
      break;
    case 'Long':
      if (front) { mopFront(); R(11, 12, 3, 17, H); R(26, 12, 3, 17, H); R(11, 12, 1, 17, D); R(28, 12, 1, 17, D); for (const x of [11, 13, 26, 28]) P(x, 29, H); }
      else if (back) { mopBack(30); }
      else { mopSide(30); }
      break;
    case 'Braid': {
      const braid = (x, y0, y1) => { for (let y = y0; y <= y1; y++) { R(x, y, 3, 1, H); P(x + ((y % 2) ? 0 : 2), y, D); } R(x, y1 + 1, 3, 1, '#4e3420'); R(x - 1, y1 + 2, 5, 2, H); };
      if (front) { mopFront(); braid(27, 14, 30); }
      else if (back) { mopBack(); braid(18, 21, 33); }
      else { mopSide(); braid(11, 14, 29); }
      break;
    }
    case 'Curls': {
      const curls = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) { const k = Math.min(y - y0, y1 - y, 2); R(x0 + [2, 1, 0][k], y, x1 - x0 + 1 - [2, 1, 0][k] * 2, 1, H); } for (let y = y0 + 1; y < y1; y += 2) for (let x = x0 + (y % 4 === 1 ? 1 : 3); x < x1; x += 4) { P(x, y, D); P(x + 1, y, Lt); } };
      if (front) { curls(10, 2, 29, 12); R(10, 12, 4, 7, H); R(26, 12, 4, 7, H); for (let y = 13; y < 19; y += 2) { P(11, y, D); P(27, y, D); } }
      else if (back) curls(10, 2, 29, 22);
      else { curls(12, 2, 28, 12); R(12, 12, 8, 8, H); for (let y = 13; y < 20; y += 2) P(14 + (y % 4 === 1 ? 2 : 0), y, D); }
      break;
    }
    case 'Undercut':
      if (front) { stubble(13, 7, 14, 4); R(16, 3, 8, 8, H); R(16, 3, 8, 1, Lt); for (const x of [17, 19, 21]) R(x, 5, 1, 6, D); R(23, 4, 1, 7, D); }
      else if (back) { stubble(13, 7, 14, 11); R(16, 3, 8, 10, H); R(17, 13, 6, 2, '#4e3420'); R(17, 15, 6, 8, H); for (let y = 16; y < 23; y += 2) P(18 + (y % 4 === 0 ? 2 : 0), y, D); }
      else { stubble(16, 7, 10, 10); R(15, 3, 12, 5, H); R(14, 5, 3, 7, H); R(11, 9, 4, 2, '#4e3420'); R(9, 11, 5, 9, H); R(15, 3, 10, 1, Lt); for (let y = 12; y < 20; y += 2) P(10, y, D); }
      break;
    case 'Topknot':
      if (front) { R(14, 5, 12, 1, H); R(13, 6, 14, 4, H); R(13, 10, 3, 1, H); R(23, 10, 4, 1, H); R(25, 6, 2, 4, D); R(17, 0, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); R(21, 0, 2, 4, D); R(18, 0, 2, 1, Lt); }
      else if (back) { R(14, 5, 12, 1, H); R(13, 6, 14, 12, H); R(24, 6, 3, 12, D); R(17, 0, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); }
      else { R(15, 5, 11, 1, H); R(14, 6, 13, 4, H); R(14, 10, 5, 7, H); R(14, 10, 2, 7, D); R(16, 0, 6, 4, H); R(16, 4, 6, 1, '#4e3420'); R(20, 0, 2, 4, D); }
      break;
    default: // Shaved
      if (front) stubble(14, 7, 12, 3);
      else if (back) stubble(13, 7, 14, 12);
      else stubble(16, 7, 11, 4);
      break;
  }
}
