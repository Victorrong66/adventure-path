// Heroes: kids off on an adventure, drawn at the world's own pixel size (chunky,
// like classic indie pixel art). About 18x29 pixels: a small head with a messy
// fringe and two-tone eyes, a big striped scarf whose tail flows behind, pale
// chunky sleeves, dark gloves, a vest over a shirt, shorts and tall boots.
// No hard outline - shapes are separated by colour and 2-3 tone shading.
//
// Canvas 28x34. Coordinates below are for a 20-wide frame (centre between x 9|10)
// shifted right by X0 and down by Y0 so the scarf, hats and sword have room.
// Feet at y 29 (frame) = 31 (canvas).
//
// dir: 0 down (front), 1 up (back), 2 side (facing right; left is a mirror image).
// pose: 'walk' (frames 0..3), 'idle' (0..3: breathing + scarf rippling),
//       'atk' (0..2: wind-up, slash, follow-through).

export const HERO_W = 28, HERO_H = 34;
export const HERO_FOOT = 32; // canvas y just below the soles
const X0 = 4, Y0 = 2;
const IRIS = '#3f86c0', WHITE = '#f4f0ea', MOUTH = '#8a4a40';
const IRON = '#9aa2ac', IRON_D = '#646c78', IRON_L = '#d0d6dc';
const STEEL = '#e2e8ee', STEEL_D = '#8e98a6', BRASS = '#d8a840', BRASS_D = '#94681e', GRIP = '#4a3020';
const LEATHER = '#8a5634', SHIRT = '#8e8c9c', SLEEVE = '#d8d6e8', GLOVE = '#4e3e38', BOOT = '#8a5232', PANTS = '#3a4238';

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
const dk = (c, t = 0.3) => mix(c, '#1c1630', t);
const lt = (c, t = 0.2) => mix(c, '#fff2d8', t);

// A faint translucent edge only where the hero meets the background, heavier at the
// feet, so heroes stay readable on grass without a cartoon outline.
function softEdge(c) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data, out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]) continue;
      for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (!d[j + 3]) continue;
        out[i] = d[j] * 0.25 + 14 * 0.75; out[i + 1] = d[j + 1] * 0.25 + 12 * 0.75; out[i + 2] = d[j + 2] * 0.25 + 24 * 0.75;
        out[i + 3] = ny < y ? 150 : 80;
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
  // upper body bob: up a pixel mid-stride, down a pixel breathing out
  const by = walk && frame % 2 === 1 ? -1 : idle && frame === 2 ? 1 : 0;

  const fill = (x, y, w, h, col) => { if (col && w > 0 && h > 0) { g.fillStyle = col; g.fillRect(x + X0, y + Y0, w, h); } };
  const R = (x, y, w, h, col) => fill(x, y + by, w, h, col);
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const L = fill; // legs don't bob

  const skin = look.skin, skinD = dk(skin, 0.25), skinL = lt(skin, 0.25);
  const hair = look.hair, hairD = dk(hair, 0.4), hairL = lt(hair, 0.3);
  const out = look.outfitColor, outD = dk(out, 0.32), outDD = dk(out, 0.55), outL = lt(out, 0.25);
  const outfit = look.outfit, style = look.style, extra = look.extra;

  // ------------------------------------------------------------------ outfit palette
  let shirt = SHIRT, vest = LEATHER, sleeve = SLEEVE, glove = GLOVE, pants = PANTS, boots = BOOT;
  let cloth = out, robe = false, plate = false, scales = false, furCollar = false;
  switch (outfit) {
    case 'Adventurer': break;
    case 'Squire': shirt = IRON; vest = null; sleeve = out; plate = true; pants = dk(out, 0.45); boots = '#6a4428'; break;
    case 'Apprentice': shirt = out; vest = null; sleeve = lt(out, 0.3); robe = true; cloth = dk(out, 0.5); boots = '#4a3a5a'; break;
    case 'Ranger': shirt = '#7a6a4a'; vest = '#5a4430'; sleeve = '#aa9c7a'; pants = '#4e4a3a'; break;
    case 'Dragonhide': vest = out; scales = true; cloth = dk(out, 0.25); break;
    case 'Royal': shirt = out; vest = null; sleeve = lt(out, 0.25); cloth = dk(out, 0.4); furCollar = true; boots = '#5a3a24'; break;
  }
  const shirtD = dk(shirt, 0.28), shirtL = lt(shirt, 0.2);
  const vestD = vest && dk(vest, 0.3), vestL = vest && lt(vest, 0.2);
  const sleeveD = dk(sleeve, 0.25);
  const gloveD = dk(glove, 0.35), pantsD = dk(pants, 0.3);
  const bootsD = dk(boots, 0.3), bootsL = lt(boots, 0.2);
  const clothD = dk(cloth, 0.3), clothL = lt(cloth, 0.25);

  // ------------------------------------------------------------------ the scarf / cape tail
  const phase = idle ? frame * (Math.PI / 2) : walk ? frame * (Math.PI / 2) + 1 : 2;
  const stream = walk ? 1.3 : atk ? 1.5 : 1;
  const tail = (ax, ay, len, dirX) => {
    for (let i = 0; i < len; i++) {
      const ripple = Math.round(Math.sin(phase + i * 0.7) * (i > 2 ? 1 : 0));
      const x = ax + dirX * Math.round(Math.min(i, 4) * 0.6 * stream + Math.max(0, i - 4) * 0.2 * stream) + ripple * dirX;
      const w = i < 4 ? 3 : 2;
      const x0 = dirX < 0 ? x - w + 1 : x;
      R(x0, ay + i, w, 1, i % 4 === 2 ? clothL : cloth);
      P(dirX < 0 ? x0 : x0 + w - 1, ay + i, clothD);
    }
  };
  if (front) tail(5, 12, 10, -1);
  else if (back) tail(14, 12, 10, 1);
  else tail(7, 11, 10, -1);

  // quiver on the back
  if (outfit === 'Ranger' && !front) {
    const qx = side ? 5 : 12;
    R(qx, 9, 2, 9, LEATHER); P(qx + 1, 9, dk(LEATHER)); R(qx, 7, 1, 2, '#ddd4c2'); P(qx, 7, '#c0402e'); P(qx + 1, 8, '#ddd4c2');
  }

  // ------------------------------------------------------------------ legs and boots
  const step = walk ? frame : 0;
  if (!side) {
    const leg = (x, lift, outward) => {
      L(x, 23, 2, 6 - lift, boots); L(x, 23, 2, 1, bootsL); L(x + 1, 24, 1, 5 - lift, bootsD);
      L(outward < 0 ? x - 1 : x, 29 - lift, 3, 1, bootsD);
    };
    leg(7, step === 1 ? 1 : 0, -1);
    leg(11, step === 3 ? 1 : 0, 1);
  } else {
    const leg = (x, lift, dark) => {
      const b = dark ? dk(boots, 0.25) : boots;
      L(x, 23, 2, 6 - lift, b); L(x, 23, 2, 1, lt(b, 0.2)); L(x, 29 - lift, 3, 1, dk(b, 0.3));
    };
    if ((walk && frame % 2 === 1) || atk) { leg(6, 1, true); leg(11, 0, false); }
    else { leg(8, 0, true); leg(10, 0, false); }
  }

  // ------------------------------------------------------------------ shorts / robe skirt
  if (robe) {
    const x0 = side ? 7 : 6, w0 = side ? 6 : 8;
    R(x0, 21, w0, 2, shirt); R(x0 - 1, 23, w0 + 2, 2, shirt); R(x0 + w0 - 1, 21, 2, 4, outD);
    for (let x = x0 - 1; x < x0 + w0 + 1; x++) P(x, 24, x % 2 ? BRASS : outDD);
  } else if (!side) {
    R(6, 21, 8, 2, pants); R(12, 21, 2, 2, pantsD); R(9, 22, 2, 1, pantsD);
  } else {
    R(7, 21, 6, 2, pants); P(7, 21, pantsD); P(7, 22, pantsD);
  }

  // ------------------------------------------------------------------ torso
  if (!side) {
    R(6, 14, 8, 7, shirt); R(12, 14, 2, 7, shirtD); P(6, 14, shirtL); P(6, 15, shirtL);
    if (vest) { R(6, 14, 3, 7, vest); R(11, 14, 3, 7, vest); R(12, 14, 2, 7, vestD); P(6, 15, vestL); P(6, 16, vestL); if (back) R(6, 14, 8, 7, vest), R(12, 14, 2, 7, vestD); }
    if (front && vest) P(9, 16, shirtD);
  } else {
    R(7, 14, 6, 7, shirt); R(7, 14, 1, 7, shirtD);
    if (vest) { R(7, 14, 5, 7, vest); P(7, 15, vestD); R(7, 16, 1, 5, vestD); }
  }
  if (plate) {
    if (!side) { R(6, 14, 8, 6, IRON); R(7, 15, 1, 4, IRON_L); R(12, 14, 2, 6, IRON_D); R(6, 20, 8, 1, out); }
    else { R(7, 14, 6, 6, IRON); R(11, 15, 1, 4, IRON_L); R(7, 14, 1, 6, IRON_D); R(7, 20, 6, 1, out); }
  }
  if (scales) {
    for (let y = 15; y < 20; y += 2) for (let x = (side ? 7 : 6) + (y % 4 === 1 ? 1 : 0); x < (side ? 12 : 14); x += 2) P(x, y, dk(out, 0.35));
  }
  if (robe && front) { P(7, 16, BRASS); P(12, 18, BRASS); }
  // belt
  if (!robe) {
    if (!side) { R(6, 19, 8, 1, '#3a2a20'); R(9, 19, 2, 1, BRASS); }
    else { R(7, 19, 6, 1, '#3a2a20'); P(11, 19, BRASS); }
  } else if (!side) R(6, 19, 8, 1, BRASS); else R(7, 19, 6, 1, BRASS);
  if (outfit === 'Ranger' && front) { P(9, 15, '#c8b890'); P(10, 17, '#c8b890'); }

  // ------------------------------------------------------------------ arms: chunky pale sleeves, dark fists
  const swing = walk ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
  const fist = (x, y, w = 2) => { R(x, y, w, 2, glove); R(x, y + 2, w, 1, gloveD); };
  const armFront = (x, d, right) => {
    R(x, 14 + d, 2, 5, sleeve); R(right ? x + 1 : x, 15 + d, 1, 4, sleeveD);
    if (plate) { R(x, 14 + d, 2, 2, IRON); P(right ? x : x + 1, 14 + d, IRON_L); }
    if (outfit === 'Royal') R(x, 18 + d, 2, 1, BRASS);
    fist(x, 19 + d);
  };
  if (side && (swing || atk)) {
    const bx = atk ? 6 : swing > 0 ? 11 : 6;
    R(bx, 15, 2, 4, dk(sleeve, 0.3)); R(bx, 19, 2, 2, gloveD);
  }
  if (atk) {
    const f = Math.min(2, frame);
    const SW = {
      0: [[14, 14, 15, 8, -100], [14, 14, 17, 14, -8], [14, 14, 15, 18, 62]],
      1: [[14, 14, 17, 14, 15], [14, 14, 15, 7, -90], [14, 14, 12, 7, -150]],
      2: [[11, 14, 9, 8, -120], [11, 14, 15, 14, -5], [11, 14, 14, 18, 50]],
    }[dir][f];
    const [sx, sy, hx, hy, ang] = SW;
    if (!side) armFront(4, 0, false);
    // arm from shoulder to fist
    const n = Math.max(Math.abs(hx - sx), Math.abs(hy - sy)) * 2 || 1;
    for (let i = 0; i <= n; i++) R(Math.round(sx + ((hx - sx) * i) / n), Math.round(sy + ((hy - sy) * i) / n), 2, 2, sleeve);
    R(hx, hy, 2, 2, glove);
    sword(hx, hy, ang);
  } else if (!side) {
    armFront(4, swing, false);
    armFront(14, -swing, true);
  } else {
    const hx = swing > 0 ? 7 : swing < 0 ? 11 : 9;
    R(9, 14, 2, 4, sleeve); P(9, 15, sleeveD); P(9, 16, sleeveD);
    R(Math.min(9, hx), 17, 2, 2, sleeve);
    if (plate) R(9, 14, 2, 2, IRON);
    fist(hx, 19);
  }

  // ------------------------------------------------------------------ head
  if (!side) {
    R(6, 5, 8, 5, skin); R(7, 10, 6, 1, skin); R(13, 6, 1, 4, skinD); P(12, 10, skinD);
    P(5, 7, skin); P(14, 7, skinD); // ears
    if (front) {
      P(7, 7, WHITE); P(8, 7, IRIS); P(11, 7, IRIS); P(12, 7, WHITE);
      P(10, 8, skinD);
      R(9, 9, 2, 1, MOUTH);
    }
  } else {
    R(8, 5, 6, 5, skin); R(9, 10, 4, 1, skin); P(14, 7, skin); P(14, 8, skinD); // nose
    P(11, 7, WHITE); P(12, 7, IRIS);
    P(12, 9, MOUTH);
    P(9, 7, skinD); P(9, 8, skinD); // ear
  }

  // ------------------------------------------------------------------ scarf wrap / collar
  if (furCollar) {
    const fw = '#eeeae2', fwD = '#bcb6aa';
    if (!side) { R(5, 11, 10, 2, fw); for (let x = 6; x < 14; x += 2) P(x, 12, fwD); if (front) { P(6, 13, BRASS); P(13, 13, BRASS); } }
    else { R(6, 11, 8, 2, fw); P(7, 12, fwD); P(10, 12, fwD); }
  } else if (!side) {
    R(5, 11, 10, 3, cloth); R(5, 12, 10, 1, clothL); R(13, 11, 2, 3, clothD);
    if (front) { R(4, 12, 2, 3, cloth); P(4, 14, clothD); }
  } else {
    R(7, 11, 7, 3, cloth); R(7, 12, 7, 1, clothL); R(6, 12, 2, 2, clothD);
  }

  // ------------------------------------------------------------------ hair
  drawHair(style, front ? 'front' : back ? 'back' : 'side', R, P, hair, hairD, hairL);

  // ------------------------------------------------------------------ extras
  if (extra === 'Goggles') {
    const strap = '#4a3428', glass = '#68c8d0';
    if (!side) {
      R(5, 4, 10, 1, strap);
      if (front) { R(6, 3, 3, 2, BRASS); P(7, 3, glass); R(11, 3, 3, 2, BRASS); P(12, 3, glass); }
    } else { R(7, 4, 7, 1, strap); R(11, 3, 3, 2, BRASS); P(12, 3, glass); }
  }
  if (extra === 'Headband') {
    const band = '#d8402e', bandD = dk(band, 0.35);
    if (!side) { R(5, 5, 10, 1, band); if (front) { P(14, 5, bandD); P(15, 6, band); P(15, 7, bandD); } else { P(9, 6, band); P(10, 7, bandD); } }
    else { R(7, 5, 7, 1, band); P(6, 5, band); P(5, 6, band); P(4, 7, bandD); }
  }

  // ------------------------------------------------------------------ headgear
  if (outfit === 'Squire') {
    // a tin pot helmet with a brim
    const hx = side ? 7 : 5, hw = side ? 8 : 10;
    R(hx + 2, 1, hw - 4, 1, IRON); R(hx + 1, 2, hw - 2, 2, IRON); R(hx - 1, 4, hw + 2, 1, IRON_D);
    P(hx + 2, 2, IRON_L); P(hx + 3, 1, IRON_L); R(hx + hw - 3, 2, 2, 2, IRON_D);
  }
  if (outfit === 'Apprentice') {
    // a floppy pointed hat with a star
    if (!side) {
      R(3, 4, 14, 1, outDD); R(5, 3, 10, 1, out); R(6, 2, 8, 1, out); R(7, 1, 6, 1, out); R(9, 0, 4, 1, out); P(13, 0, outD); P(14, 1, outD);
      R(5, 3, 10, 1, BRASS); P(12, 1, outD); P(12, 2, outD);
      if (front) P(9, 1, '#fff2a0');
    } else {
      R(4, 4, 13, 1, outDD); R(7, 3, 8, 1, out); R(7, 2, 7, 1, out); R(6, 1, 6, 1, out); R(4, 0, 5, 1, out); P(3, 1, outD);
      R(7, 3, 8, 1, BRASS); P(10, 1, '#fff2a0');
    }
  }
  if (outfit === 'Dragonhide') {
    // a scaly dragon hood with horns
    const horn = '#ece0c0';
    if (!side) {
      R(5, 2, 10, 3, out); R(4, 4, 1, 6, out); R(15, 4, 1, 6, outD); R(5, 4, 10, 1, outD); P(7, 3, outD); P(11, 3, outD);
      P(5, 1, horn); P(4, 0, horn); P(14, 1, horn); P(15, 0, horn);
      if (back) { R(5, 2, 10, 9, out); R(13, 2, 2, 9, outD); for (let y = 3; y < 11; y += 2) P(9, y, outL); }
    } else {
      R(7, 2, 8, 3, out); R(5, 4, 4, 7, out); R(5, 5, 1, 6, outD); R(9, 4, 6, 1, outD);
      P(9, 1, horn); P(8, 0, horn); for (let y = 5; y < 11; y += 2) P(4, y, outL);
    }
  }
  if (outfit === 'Ranger') {
    // hood up
    if (!side) {
      R(5, 1, 10, 4, out); R(4, 3, 1, 7, out); R(15, 3, 1, 7, outD); R(5, 4, 10, 1, outD); R(6, 1, 3, 1, outL);
      if (back) { R(5, 1, 10, 10, out); R(13, 1, 2, 10, outD); }
    } else { R(7, 1, 8, 4, out); R(5, 3, 4, 8, out); R(5, 4, 1, 7, outD); R(9, 4, 6, 1, outD); R(8, 1, 3, 1, outL); }
  }
  if (outfit === 'Royal') {
    const cx = side ? 7 : 6, cw = side ? 7 : 8;
    R(cx, 2, cw, 2, BRASS); R(cx, 3, cw, 1, BRASS_D);
    for (let x = cx; x < cx + cw; x += 3) P(x, 1, BRASS);
    P(cx + (cw >> 1), 2, '#d83048');
  }

  return softEdge(c);

  // Sword from a fist at (hx, hy), pointing at angle a (degrees, 0 = right, 90 = down)
  function sword(hx, hy, a) {
    const r = (a * Math.PI) / 180, cx = Math.cos(r), cy = Math.sin(r), px = -cy, py = cx;
    const at = (t, s = 0) => [Math.round(hx + 0.5 + cx * t + px * s), Math.round(hy + 0.5 + cy * t + py * s)];
    { const [x, y] = at(-1); P(x, y, GRIP); }
    for (let s = -1; s <= 1; s++) { const [x, y] = at(1, s); P(x, y, s ? BRASS_D : BRASS); }
    for (let t = 2; t <= 9; t++) { const [x, y] = at(t); P(x, y, t > 7 ? STEEL_D : STEEL); }
  }
}

// Hair: adventurer haircuts drawn as small pixel templates for each view.
// Template column i is frame x = 4 + i; the head is x6..13 (front/back) or
// x8..13 (side, facing right), forehead row 5, eyes row 7.
// H hair, D shade, L highlight, R red tie, T leather tie.
const HAIR = {
  Tousled: {
    front: ['....H..H....', '...HHHHHH...', '..HLLHHHHD..', '.HLHHHDHHHD.', '.HHHDHHHDHD.', '.HH.HHD.HHD.', '.D..H....D..'],
    back: ['....H..H....', '...HHHHHH...', '..HLHHHHHD..', '.HHHHHDHHHD.', '.HHDHHHHHHD.', '.HHHHHDHHHD.', '.HDHHHHHDHD.', '.HHHHHHHHHD.', '..HDHHDHHD..', '..H.H..H.D..'],
    side: ['.....H..H...', '....HHHHHH..', '...HLLHHHHD.', '..HHHHHDHHH.', '..HHDHHHHHD.', '..HHHHD.HHD.', '..HDHH...D..', '..HHD.......', '..DH........', '...D........'],
  },
  Swept: {
    front: ['............', '...HHHHH....', '..HLLHHHH...', '.HLHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHDD.', '.D...HHHD.D.'],
    back: ['............', '...HHHHH....', '..HLHHHHH...', '.HLHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '..HHHHHHHD..'],
    side: ['............', '....HHHHH...', '...HLLHHHH..', '..HHHHHHHHH.', '..HHHHHHHHD.', '..HHHHHHHH..', '..HHHD..HD..', '..HHD.......', '..DHD.......', '...D........'],
  },
  Short: {
    front: ['............', '...HHHHHH...', '..HHLLHHHH..', '.HHHDLLHHHD.', '.HHHHHHHHHD.', '.D.HHHHH..D.'],
    back: ['............', '...HHHHHH...', '..HHLHHHHH..', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '..DHHHHHHD..'],
    side: ['............', '....HHHHHH..', '...HHLLHHHH.', '..HHHHHHHHD.', '..HHHHHHHHD.', '..HHH..HHH..', '..HHD.......', '..HD........', '...D........'],
  },
  Shoulder: {
    front: ['............', '...HHHHHH...', '..HHLHHHHH..', '.HHLHHHHHHD.', '.HHHHDHHHHD.', 'HHHHH.HHHHDD', 'HH........DD', 'HH........DD', 'HH........DD', 'HH........DD', 'HH........DD', 'HD........DD', 'HD........DD', 'D..........D'],
    back: ['............', '...HHHHHH...', '..HHLHHHHH..', '.HHLHHHHHHD.', 'HHHHHHHHHHDD', 'HHHHHDHHHHDD', 'HHHHHHHHHHDD', 'HHDHHHHHDHDD', 'HHHHHHHHHHDD', 'HHHHHDHHHHDD', 'HHHHHHHHHHDD', 'HHDHHHHHDHDD', 'HHHHHHHHHHDD', '.H.H.H.H.H.D'],
    side: ['............', '....HHHHHH..', '...HHLLHHHH.', '..HHHHHHHHD.', '..HHHHHHHHD.', '.HHHHHHHHH..', '.HHHHD...D..', '.HHHD.......', '.HHHD.......', '.HHHD.......', '.HHHD.......', '.HHHD.......', '.HHD........', '..D.........'],
  },
  Braid: {
    front: ['............', '...HHHHHH...', '..HHHLLHHH..', '.HHLHDHHHHD.', '.HHHHDHHHHD.', '.HH.....HHD.', '.D.......HHD', '..........HD', '..........DH', '..........HD', '..........DH', '..........HD', '..........DH', '..........RR', '..........HH'],
    back: ['............', '...HHHHHH...', '..HHLHHHHH..', '.HHLHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '..HHHHHHHD..', '.....HD.....', '.....DH.....', '.....HD.....', '.....DH.....', '.....HD.....', '.....DH.....', '.....RR.....', '.....HH.....'],
    side: ['............', '....HHHHHH..', '...HHLLHHHH.', '..HHHHHHHHD.', '..HHHHHHHHD.', '..HHHH..HH..', '..HHD.......', '.HDD........', '.DH.........', '.HD.........', '.DH.........', '.HD.........', '.DH.........', '.RR.........', '.HH.........'],
  },
  'Tied Back': {
    front: ['............', '...HHHHHH...', '..HLLHHHHH..', '.HLHHHHHHHD.', '.HHHHHHHHHD.', '.HD......DD.', '.D........D.'],
    back: ['............', '...HHHHHH...', '..HLLHHHHH..', '.HLHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '.HHHHHHHHHD.', '..HHHHHHHD..', '....HHHD....', '.....TT.....', '.....HD.....', '.....HD.....', '.....HD.....', '.....DD.....'],
    side: ['............', '....HHHHHH..', '...HLLHHHHH.', '..HHHHHHHHD.', '..HHHHHHHHD.', '..HHHHD.HD..', '..HHHD......', '.TTHD.......', 'HHD.........', 'HD..........', 'HD..........', 'HD..........', 'D...........'],
  },
  Coils: {
    front: ['...HHHHHH...', '..HLHDHLHH..', '.HLHDHHHDHH.', '.HDHHHLHHDH.', '.HHHDHHDHHD.', '.HDH.DH.HDD.'],
    back: ['...HHHHHH...', '..HLHDHLHH..', '.HLHDHHHDHH.', '.HDHHHLHHDH.', '.HHHDHHDHHD.', '.HDHHHDHHDH.', '.HHDHHHHDHD.', '.HDHHDHHHDH.', '..HHDHHDHD..'],
    side: ['....HHHHHH..', '...HLHDHLHH.', '..HLHDHHHDH.', '..HDHHHLHHD.', '..HHHDHHDHD.', '..HDHHD.HD..', '..HHDH......', '..DHD.......', '...D........'],
  },
  Crew: {
    front: ['............', '............', '...HHHHHH...', '..HHLHHHHD..', '..HDHHDHHD..', '..D......D..'],
    back: ['............', '............', '...HHHHHH...', '..HHLHHHHD..', '..HDHHDHHD..', '..HHHHHHHD..', '..HDHHDHHD..', '..HHHHHHHD..', '...DHHHHD...'],
    side: ['............', '............', '....HHHHH...', '...HHLHHHD..', '...HDHHDHD..', '...HHHD.....', '...HDH......', '...DD.......'],
  },
};

function drawHair(style, view, R, P, H, D, Lt) {
  const t = (HAIR[style] || HAIR.Tousled)[view];
  const col = { H, D, L: Lt, R: '#c0402e', T: '#4e3420' };
  t.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (col[row[i]]) P(4 + i, j, col[row[i]]);
  });
}
