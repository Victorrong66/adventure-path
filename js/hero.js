// Heroes are drawn at twice the world's resolution (each pixel here is half a world
// pixel). Style: chunky, readable shapes with no hard outline - forms are separated
// by colour and 2-3 tone shading (cool shadows, warm highlights) - a heroic wide
// stance, big sleeves and gloved fists, and a thick scarf/cape whose tail flows
// behind the hero and waves even when standing still. Young adventurers off to
// fight monsters and dragons: kid proportions (short legs and body, so the head
// reads larger) and bright storybook colours.
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
const LEATHER = '#8a5a34', SHIRT = '#8c8a96', SLEEVE = '#d6d2e2', GLOVE = '#4a3a34', WRAP = '#b8a888';

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

// look: { skin, hair, outfitColor (hex), style, outfit, extra (names) }
export function buildHero(look, dir, pose, frame) {
  const c = document.createElement('canvas');
  c.width = HERO_W; c.height = HERO_H;
  const g = c.getContext('2d');
  const front = dir === 0, back = dir === 1, side = dir === 2;
  const atk = pose === 'atk', walk = pose === 'walk', idle = pose === 'idle';
  // KID: the whole upper body sits lower, giving shorter legs and a kid's proportions
  const KID = 3;
  const by = KID + (walk && frame % 2 === 1 ? -1 : idle && (frame === 1 || frame === 2) ? 1 : 0);

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
  const outfit = look.outfit, style = look.style, extra = look.extra;

  // ------------------------------------------------------------------ outfit palette
  let shirt = SHIRT, vest = LEATHER, sleeve = SLEEVE, glove = GLOVE, pants = '#3c4038', boots = '#7a4a2a', wraps = WRAP;
  let cloth = out; // the flowing scarf / cape
  let longTunic = false, plate = false, scales = false;
  switch (outfit) {
    case 'Adventurer': break;
    case 'Squire': shirt = IRON; vest = null; sleeve = out; plate = true; pants = dk(out, 0.45); boots = '#5a3e2a'; break;
    case 'Apprentice': shirt = out; vest = null; sleeve = lt(out, 0.3); longTunic = true; cloth = dk(out, 0.5); pants = '#3e3650'; break;
    case 'Ranger': shirt = '#7a6a4a'; vest = '#5e4630'; sleeve = '#a89a78'; pants = '#4e4a3a'; break;
    case 'Dragonhide': vest = out; scales = true; cloth = dk(out, 0.25); pants = '#4a4038'; break;
    case 'Royal': shirt = out; vest = null; sleeve = lt(out, 0.25); cloth = dk(out, 0.35); pants = '#3a3230'; boots = '#4e3424'; break;
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
  {
    if (front) tail(11, 23, 15, -1);
    else if (back) tail(29, 23, 15, 1);
    else tail(14, 22, 16, -1);
  }
  if (outfit === 'Ranger' && !front) {
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
  if (plate) {
    // tin breastplate: bright highlight band, darker side, rivets, tunic hem below
    R(side ? 21 : 15, 24, 2, 11, IRON_L); R(side ? 15 : 24, 23, side ? 2 : 4, 13, IRON_D);
    for (const y of [25, 33]) for (let x = tx + 1; x < tx + tw - 1; x += 3) P(x, y, IRON_D);
    R(tx, 39, tw, 3, out); R(tx, 41, tw, 1, outD);
  }
  if (scales) {
    for (let y = 26; y < 37; y += 2) for (let x = tx + (y % 4 ? 1 : 0); x < tx + tw; x += 2) P(x, y, dk(out, 0.35));
  }
  if (longTunic) {
    for (let y = 38; y < 47; y++) R(tx - Math.floor((y - 38) / 4), y, tw + Math.floor((y - 38) / 4) * 2, 1, shirt);
    R(tx + tw - 3, 38, 3, 9, shirtD);
    for (let x = tx - 2; x < tx + tw + 2; x++) { P(x, 45, x % 3 ? outDD : BRASS); P(x, 46, outDD); }
    if (!side) { P(16, 30, BRASS); P(23, 33, BRASS); P(15, 40, BRASS); P(25, 42, BRASS); } // little stars
  }
  if (vest) {
    if (front) { R(12, 25, 6, 13, vest); R(22, 25, 6, 13, dk(vest, 0.15)); R(26, 25, 2, 13, dk(vest, 0.35)); R(12, 25, 1, 13, lt(vest, 0.2)); }
    else if (back) { R(12, 25, 16, 13, vest); R(24, 25, 4, 13, dk(vest, 0.3)); }
    else { R(16, 25, 9, 13, vest); R(16, 25, 2, 13, dk(vest, 0.3)); }
  }
  // belt
  {
    R(tx, 36, tw, 3, '#3a2a20'); R(tx, 38, tw, 1, '#2a1e18');
    if (!side) { R(18, 36, 4, 3, BRASS); P(19, 37, BRASS_D); } else R(22, 36, 3, 3, BRASS);
    if (front) { R(14, 39, 2, 4, '#3a2a20'); P(14, 42, BRASS); }
  }
  if (outfit === 'Royal' && !side) for (let x = tx; x < tx + tw; x++) P(x, 35, BRASS);
  if (outfit === 'Ranger' && front) for (let y = 26; y < 35; y += 2) { P(19, y, WRAP); P(20, y + 1, WRAP); }

  // ------------------------------------------------------------------ arms (big sleeves, gloved fists)
  const swing = walk ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
  const sleeveCol = sleeve, sleeveColD = sleeveD, sleeveColL = sleeveL;
  const fist = (x, y) => { R(x, y, 5, 4, glove); R(x, y, 5, 1, lt(glove, 0.25)); R(x + 4, y + 1, 1, 3, dk(glove, 0.35)); };
  const armF = (x, d, right) => {
    R(x, 23 + d, 6, 10, sleeveCol);
    R(right ? x + 4 : x, 23 + d, 2, 10, sleeveColD); R(right ? x : x + 5, 24 + d, 1, 7, sleeveColL);
    if (plate) { R(x, 23 + d, 6, 4, IRON); R(x, 26 + d, 6, 1, IRON_D); R(x + 1, 23 + d, 2, 1, IRON_L); } // pauldron
    R(x, 32 + d, 6, 2, outfit === 'Royal' ? BRASS : glove); // cuff / bracer
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
    R(Math.round((19 + hx) / 2), 32, 6, 2, outfit === 'Royal' ? BRASS : glove);
    fist(hx, 34);
  }

  // ------------------------------------------------------------------ head
  if (!side) {
    R(14, 9, 12, 10, skin); R(15, 19, 10, 2, skin); R(16, 21, 8, 1, skinD);
    R(24, 10, 2, 10, skinD); R(23, 19, 2, 2, skinD); R(14, 17, 1, 2, skinD);
    if (!back) {
      // brows, big clear eyes, nose, mouth
      const brow = style === 'Buzz' ? skinDD : hairD;
      R(15, 12, 4, 1, brow); R(21, 12, 4, 1, brow);
      P(15, 13, WHITE); P(15, 14, WHITE); R(16, 13, 2, 2, IRIS); R(16, 14, 2, 1, IRIS_D); P(17, 13, WHITE);
      P(24, 13, WHITE); P(24, 14, WHITE); R(22, 13, 2, 2, IRIS); R(22, 14, 2, 1, IRIS_D); P(23, 13, WHITE);
      R(19, 15, 2, 2, skinD); P(19, 15, skinL);
      R(19, 18, 2, 1, MOUTH); // a small smile
      P(15, 16, mix(skin, '#ff6070', 0.25)); P(24, 16, mix(skin, '#ff6070', 0.25)); // a little colour in the cheeks
    }
    R(13, 12, 1, 4, skin); R(26, 12, 1, 4, skinD); // ears
  } else {
    R(16, 9, 11, 10, skin); R(17, 19, 9, 2, skin); R(18, 21, 7, 1, skinD);
    R(16, 10, 2, 10, skinD);
    R(27, 14, 1, 3, skin); P(27, 16, skinD); // nose
    R(22, 12, 4, 1, style === 'Buzz' ? skinDD : hairD);
    P(23, 13, WHITE); P(23, 14, WHITE); R(24, 13, 2, 2, IRIS); R(24, 14, 2, 1, IRIS_D);
    R(24, 18, 2, 1, MOUTH);
    R(18, 13, 2, 4, skinD); P(19, 13, skin); // ear
  }

  // ------------------------------------------------------------------ scarf wrap / collar (over the neck)
  const collar = () => {
    if (outfit === 'Royal') {
      const fw = '#ece8e0', fwD = '#bcb6aa';
      if (!side) { R(11, 20, 18, 4, fw); for (let x = 11; x < 29; x += 2) { P(x, 24, fw); P(x + 1, 21, fwD); } if (front) { R(14, 24, 3, 3, BRASS); R(23, 24, 3, 3, BRASS); } }
      else { R(14, 20, 13, 4, fw); for (let x = 14; x < 27; x += 2) P(x, 24, fw); }
      return;
    }
    // thick wrapped scarf
    if (!side) {
      R(13, 20, 14, 5, cloth); R(13, 21, 14, 1, clothL); R(13, 23, 14, 1, clothD); R(24, 20, 3, 5, clothD);
      if (front) { R(11, 22, 4, 5, cloth); R(11, 25, 4, 1, clothD); P(12, 23, clothL); } // knot
    } else {
      R(15, 20, 12, 5, cloth); R(15, 21, 12, 1, clothL); R(15, 23, 12, 1, clothD); R(13, 21, 3, 4, clothDD);
    }
  };
  collar();

  // ------------------------------------------------------------------ hair & headgear
  drawHair(style, front ? 'front' : back ? 'back' : 'side', R, P, hair, hairD, hairL, skin);

  // ------------------------------------------------------------------ extras (over the hair)
  if (extra === 'Goggles') {
    const strap = '#4a3428', rim = BRASS, glass = '#58c0c8', glassL = '#c8f4f0';
    if (!side) {
      R(12, 8, 16, 2, strap);
      if (front) for (const x of [14, 21]) { R(x, 6, 5, 4, rim); R(x + 1, 7, 3, 2, glass); P(x + 1, 7, glassL); }
    } else { R(13, 8, 14, 2, strap); R(21, 6, 5, 4, rim); R(22, 7, 3, 2, glass); P(23, 7, glassL); }
  }
  if (extra === 'Headband') {
    const band = '#d8402e', bandD = dk(band, 0.35);
    if (!side) {
      R(12, 9, 16, 2, band); R(12, 10, 16, 1, bandD);
      if (front) { R(26, 9, 3, 3, band); R(28, 12, 2, 4, bandD); R(27, 12, 1, 3, band); }
      else { R(18, 9, 4, 3, bandD); R(18, 12, 2, 5, band); R(21, 12, 2, 4, bandD); }
    } else {
      R(13, 9, 14, 2, band); R(13, 10, 14, 1, bandD);
      R(10, 9, 4, 2, band); R(8, 11, 3, 1, band); R(7, 12, 2, 1, bandD); R(10, 12, 2, 3, bandD);
    }
  }

  // ------------------------------------------------------------------ headgear
  if (outfit === 'Squire') {
    // a tin pot helmet with a wide brim
    const hx = side ? 14 : 12, hw = side ? 15 : 16;
    R(hx + 3, 2, hw - 6, 1, IRON); R(hx + 2, 3, hw - 4, 2, IRON); R(hx + 1, 5, hw - 2, 4, IRON);
    R(hx - 1, 9, hw + 2, 2, IRON_D); R(hx - 1, 9, hw + 2, 1, IRON);
    R(hx + 3, 3, 3, 2, IRON_L); R(hx + 2, 5, 2, 3, IRON_L); R(hx + hw - 4, 4, 3, 5, IRON_D);
    R(side ? 20 : 19, 2, 2, 7, IRON_D); P(side ? 20 : 19, 2, IRON_L);
  }
  if (outfit === 'Apprentice') {
    // a floppy pointed hat with a star
    if (!side) {
      R(9, 8, 22, 3, outDD); R(10, 8, 20, 1, out);
      R(13, 6, 14, 2, out); R(14, 4, 12, 2, out); R(15, 2, 9, 2, out); R(17, 0, 6, 2, out);
      R(22, 0, 4, 1, out); R(25, 0, 2, 2, out); R(26, 2, 2, 2, outD); // the floppy tip
      R(13, 7, 14, 1, BRASS); R(22, 2, 3, 6, outD);
      if (front) { P(17, 3, '#fff2a0'); R(16, 4, 3, 1, '#fff2a0'); P(17, 5, '#fff2a0'); }
    } else {
      R(10, 8, 21, 3, outDD); R(11, 8, 19, 1, out);
      R(14, 6, 13, 2, out); R(14, 4, 11, 2, out); R(13, 2, 9, 2, out); R(11, 0, 7, 2, out); R(8, 1, 4, 2, out); R(7, 3, 2, 2, outD);
      R(14, 7, 13, 1, BRASS); P(19, 4, '#fff2a0');
    }
  }
  if (outfit === 'Dragonhide') {
    // a scaly dragon hood with little horns and spines
    const hd = out, hdD = dk(out, 0.35), hdL = lt(out, 0.25), horn = '#ece0c0', hornD = '#b8a888';
    if (!side) {
      R(12, 4, 16, 6, hd); R(11, 7, 2, 13, hd); R(27, 7, 2, 13, hdD); R(12, 9, 16, 1, hdD);
      for (let x = 13; x < 27; x += 3) P(x, 6, hdD);
      R(13, 4, 4, 1, hdL);
      R(12, 1, 2, 4, horn); R(11, 0, 2, 2, horn); P(12, 4, hornD);
      R(26, 1, 2, 4, horn); R(27, 0, 2, 2, horn); P(27, 4, hornD);
      if (back) { R(12, 4, 16, 18, hd); R(24, 5, 4, 17, hdD); for (let y = 6; y < 22; y += 3) R(19, y, 2, 2, hdL); }
    } else {
      R(14, 4, 13, 6, hd); R(12, 7, 7, 15, hd); R(12, 8, 2, 14, hdD); R(19, 9, 8, 1, hdD); R(15, 4, 5, 1, hdL);
      R(17, 1, 2, 4, horn); R(16, 0, 2, 2, horn); for (let y = 8; y < 20; y += 3) R(10, y, 2, 2, hdL);
    }
  }
  if (outfit === 'Ranger') {
    // hood up
    if (!side) {
      R(12, 4, 16, 6, out); R(11, 7, 2, 13, out); R(27, 7, 2, 13, outD); R(13, 4, 5, 1, outL); R(12, 9, 16, 1, outD);
      if (back) { R(12, 4, 16, 18, out); R(24, 5, 4, 17, outD); R(18, 19, 4, 4, outD); }
    } else { R(14, 4, 13, 6, out); R(12, 7, 7, 15, out); R(12, 8, 2, 14, outD); R(19, 9, 8, 1, outD); R(15, 4, 5, 1, outL); }
  }
  if (outfit === 'Royal') {
    // a small gold crown
    const cx = side ? 15 : 13, cw = side ? 12 : 14;
    R(cx, 5, cw, 3, BRASS); R(cx, 7, cw, 1, BRASS_D);
    for (let x = cx; x < cx + cw; x += 4) R(x, 3, 2, 2, BRASS);
    P(cx + Math.floor(cw / 2), 6, '#d83048'); P(cx + 2, 6, '#3a8ad8'); P(cx + cw - 3, 6, '#3a8ad8');
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
    case 'Messy':
      if (front) mopFront(); else if (back) mopBack(); else mopSide();
      break;
    case 'Spiky': {
      const spike = (x, y, h, lean = 0) => { for (let i = 0; i < h; i++) R(x - Math.floor(i / 2) + Math.round(lean * (h - i)), y + i, 1 + Math.floor(i / 2) * 2, 1, H); P(x + Math.round(lean * h), y, Lt); };
      if (front) { mopFront(); for (const x of [14, 18, 22, 26]) spike(x, 1, 5); }
      else if (back) { mopBack(); for (const x of [14, 18, 22, 26]) spike(x, 1, 5); }
      else { mopSide(); for (const x of [16, 20, 24]) spike(x, 1, 5, -0.4); spike(12, 5, 4, -0.5); }
      break;
    }
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
    case 'Ponytail':
      if (front) { mopFront(); R(27, 13, 2, 7, H); R(28, 14, 1, 6, D); }
      else if (back) { mopBack(); R(18, 19, 4, 2, '#e04878'); R(18, 21, 4, 9, H); R(21, 21, 1, 9, D); R(19, 30, 2, 2, H); }
      else { mopSide(); P(13, 12, '#e04878'); R(10, 11, 3, 3, H); R(9, 14, 3, 9, H); R(9, 14, 1, 9, D); P(10, 23, H); }
      break;
    case 'Bun':
      if (front) { R(14, 5, 12, 1, H); R(13, 6, 14, 4, H); R(13, 10, 3, 1, H); R(23, 10, 4, 1, H); R(25, 6, 2, 4, D); R(17, 0, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); R(21, 0, 2, 4, D); R(18, 0, 2, 1, Lt); }
      else if (back) { R(14, 5, 12, 1, H); R(13, 6, 14, 12, H); R(24, 6, 3, 12, D); R(17, 0, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); }
      else { R(15, 5, 11, 1, H); R(14, 6, 13, 4, H); R(14, 10, 5, 7, H); R(14, 10, 2, 7, D); R(16, 0, 6, 4, H); R(16, 4, 6, 1, '#4e3420'); R(20, 0, 2, 4, D); }
      break;
    default: // Buzz
      if (front) stubble(14, 7, 12, 3);
      else if (back) stubble(13, 7, 14, 12);
      else stubble(16, 7, 11, 4);
      break;
  }
}
