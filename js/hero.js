// Heroes are drawn at twice the world's resolution (each pixel here is half a world
// pixel), so they're made of finer pixels than the scenery. Viking-era look:
// earthy dyed wool, leather, fur, iron and mail, with coloured (not black) outlines
// and cool shadows / warm highlights for a crisper, modern pixel-art feel.
//
// Canvas 56x62. Body coordinates below are written for a 40-wide frame and shifted
// right by X0 so swords can swing out past the body. Front layout: head x14..25
// y8..20, torso y23..36, legs y37..53, shoes y54..58; feet at the bottom centre.
//
// dir: 0 down (front), 1 up (back), 2 side (facing right; left is a mirror image).
// pose: 'walk' (frames 0..3), 'idle' (0..1, breathing), 'atk' (0..2: wind-up, slash, follow-through).

export const HERO_W = 56, HERO_H = 62;
const X0 = 8;
const EYE = '#1e1822', WHITE = '#ece6e0', MOUTH = '#7a3e3a';
const IRON = '#8f969e', IRON_D = '#565c66', IRON_L = '#c4cad0';
const STEEL = '#d8dee6', STEEL_D = '#8a93a2', BRASS = '#c99a3c', BRASS_D = '#8a6420', GRIP = '#4a3020';
const LEATHER = '#7a5634', FUR = '#6f655a', WRAP = '#c2b294', WOAD = '#3e66b4';

// cool shadows, warm highlights
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
const dk = (c, t = 0.3) => mix(c, '#1a1426', t);
const lt = (c, t = 0.2) => mix(c, '#fff0d4', t);

// Selective outline: each edge pixel takes a deep shade of the colour it borders.
function outline(c) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : (y * w + x) * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (d[i + 3]) continue;
      for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]]) {
        const j = at(nx, ny);
        if (j < 0 || !d[j + 3]) continue;
        out[i] = d[j] * 0.22 + 18 * 0.78; out[i + 1] = d[j + 1] * 0.22 + 12 * 0.78; out[i + 2] = d[j + 2] * 0.22 + 22 * 0.78; out[i + 3] = 255;
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
  const atk = pose === 'atk', walk = pose === 'walk';
  const by = walk && frame % 2 === 1 ? -1 : pose === 'idle' && frame === 1 ? 1 : 0;

  const fill = (x, y, w, h, col) => { if (col) { g.fillStyle = col; g.fillRect(x + X0, y, w, h); } };
  const R = (x, y, w, h, col) => fill(x, y + by, w, h, col); // upper body (bobs)
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const L = fill; // legs
  const clr = (x, y) => g.clearRect(x + X0, y + by, 1, 1);
  const line = (x0, y0, x1, y1, w, col, upper = true) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n - (w - 1) / 2), y = Math.round(y0 + ((y1 - y0) * i) / n - (w - 1) / 2);
      (upper ? R : fill)(x, y, w, w, col);
    }
  };

  const skin = look.skin, skinD = dk(skin, 0.22), skinDD = dk(skin, 0.4), skinL = lt(skin, 0.2);
  const hair = look.hair, hairD = dk(hair, 0.38), hairL = lt(hair, 0.25);
  const out = look.outfitColor, outD = dk(out, 0.3), outDD = dk(out, 0.5), outL = lt(out, 0.18);
  const outfit = look.outfit, style = look.style, beard = look.beard;

  // Base clothing for each outfit
  let torso = out, torsoD = outD, torsoL = outL, sleeve = out, sleeveD = outD;
  let pants = dk(out, 0.45), shoes = '#4a3222', wraps = WRAP, belt = '#4e3420', buckle = IRON_L;
  let bareArms = false;
  switch (outfit) {
    case 'Raider': torso = LEATHER; torsoD = dk(LEATHER); torsoL = lt(LEATHER); pants = '#5b4b3c'; break;
    case 'Huscarl': torso = IRON; torsoD = IRON_D; torsoL = IRON_L; sleeve = IRON; sleeveD = IRON_D; pants = '#4d4740'; break;
    case 'Skald': pants = '#4a3e36'; wraps = lt(out, 0.45); belt = '#3a2818'; buckle = BRASS; break;
    case 'Berserker': torso = skin; torsoD = skinD; torsoL = skinL; bareArms = true; pants = out; wraps = '#4a3a2c'; break;
    case 'Jarl': pants = '#3c3430'; belt = '#2e2018'; buckle = BRASS; wraps = '#d8ccb4'; break;
    case 'Hunter': torso = '#6b4a2e'; torsoD = dk('#6b4a2e'); torsoL = lt('#6b4a2e'); sleeve = '#8a7a5a'; sleeveD = dk('#8a7a5a'); pants = '#5a5040'; break;
  }
  const pantsD = dk(pants), wrapsD = dk(wraps, 0.35), shoesL = lt(shoes, 0.2);

  const hand = (x, y) => { R(x, y, 3, 3, skin); R(x + 2, y, 1, 3, skinD); P(x, y + 2, skinD); };
  // Viking sword from a hand at (hx, hy), pointing at angle a (degrees, 0 = right, 90 = down)
  const sword = (hx, hy, a) => {
    const r = (a * Math.PI) / 180, cx = Math.cos(r), cy = Math.sin(r);
    const px = -cy, py = cx; // perpendicular
    const at = (t, s = 0) => [Math.round(hx + 1 + cx * t + px * s), Math.round(hy + 1 + cy * t + py * s)];
    for (let t = -3; t <= -1; t++) { const [x, y] = at(t); P(x, y, GRIP); }
    { const [x, y] = at(-4); P(x, y, BRASS); }
    for (let s = -2; s <= 2; s++) { const [x, y] = at(1, s); P(x, y, s ? BRASS_D : BRASS); }
    for (let t = 2; t <= 13; t++) {
      const [x, y] = at(t); P(x, y, STEEL);
      const [x2, y2] = at(t, 1); if (t < 13) P(x2, y2, STEEL_D);
    }
  };

  // ------------------------------------------------------------------ behind the body
  if ((outfit === 'Skald' || outfit === 'Jarl') && !back) {
    const cl = outfit === 'Jarl' ? outD : '#3a3230';
    if (front) { R(10, 23, 3, 22, cl); R(27, 23, 3, 22, dk(cl, 0.2)); }
    else R(11, 23, 5, 24, cl);
  }
  if (style === 'Long' && front) { R(12, 11, 3, 18, hairD); R(25, 11, 3, 18, hairD); }

  // ------------------------------------------------------------------ legs (trousers + leg wraps)
  const wrapRows = (x, y0, y1, w) => {
    for (let y = y0; y <= y1; y++) for (let i = 0; i < w; i++) L(x + i, y, 1, 1, (i + y) % 3 === 0 ? wrapsD : wraps);
  };
  const legFront = (x, lift) => {
    const bottom = 53 - lift;
    L(x, 37, 5, 8, pants); L(x + 4, 37, 1, 8, pantsD); L(x + 1, 39, 1, 4, lt(pants, 0.12));
    wrapRows(x, 45, bottom, 5);
    const sx = x < 20 ? x - 1 : x, sy = 54 - lift;
    L(sx, sy, 6, 4, shoes); L(sx, sy, 6, 1, shoesL); L(sx, sy + 4, 6, 1, dk(shoes, 0.4));
  };
  const legSide = (xTop, xBot, dark, heel = 0) => {
    const p = dark ? dk(pants, 0.25) : pants, w = dark ? dk(wraps, 0.3) : wraps, s = dark ? dk(shoes, 0.25) : shoes;
    L(xTop, 37, 5, 8, p); L(xTop, 37, 1, 8, dk(p));
    for (let y = 45; y <= 53; y++) for (let i = 0; i < 5; i++) L(xBot + i, y, 1, 1, (i + y) % 3 === 0 ? dk(w, 0.35) : w);
    L(xBot, 54 - heel, 7, 4, s); L(xBot, 54 - heel, 7, 1, lt(s, 0.2)); L(xBot, 58 - heel, 7, 1, dk(s, 0.4));
  };
  if (!side) {
    L(19, 37, 2, 3, pantsD);
    const lift = walk ? frame : 0;
    legFront(14, lift === 1 ? 2 : 0);
    legFront(21, lift === 3 ? 2 : 0);
  } else if ((walk && frame % 2 === 1) || atk) {
    legSide(16, atk ? 13 : 12, true, 1);
    legSide(19, 21, false);
  } else legSide(17, 17, false);

  // ------------------------------------------------------------------ arms behind
  const swing = walk ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
  const armCol = bareArms ? skin : sleeve, armColD = bareArms ? skinD : sleeveD;
  const armFront = (x, d, isRight) => {
    const len = 9 + d;
    R(x, 24, 3, len, armCol); R(isRight ? x + 2 : x, 24, 1, len, armColD);
    if (outfit === 'Huscarl') { R(x, 30, 3, len - 6, out); R(isRight ? x + 2 : x, 30, 1, len - 6, outD); }
    if (bareArms) { R(x, 27, 3, 1, WOAD); P(x + 1, 29, WOAD); R(x, 31, 3, 1, BRASS); }
    if (outfit === 'Hunter') R(x, 29 + Math.max(0, d), 3, 3, LEATHER);
    if (outfit === 'Jarl') R(x, 31 + Math.max(0, d), 3, 1, BRASS);
    hand(x, 24 + len);
  };
  if (side && (swing || atk)) {
    const bx = atk ? 14 : swing > 0 ? 22 : 15;
    R(bx, 25, 3, 7, dk(armCol, 0.25)); R(bx, 32, 3, 3, skinD);
  }

  // ------------------------------------------------------------------ torso
  if (!side) {
    R(13, 23, 14, 1, torso); R(12, 24, 16, 12, torso); R(12, 36, 16, 1, torsoD);
    R(12, 24, 1, 10, torsoL); R(25, 24, 3, 12, torsoD); R(27, 24, 1, 12, dk(torsoD, 0.2));
  } else {
    R(15, 23, 9, 1, torso); R(14, 24, 11, 12, torso); R(14, 36, 11, 1, torsoD);
    R(14, 24, 2, 12, torsoD); R(23, 25, 1, 9, torsoL);
  }
  const bodyX = side ? 14 : 12, bodyW = side ? 11 : 16;

  // Outfit body details
  switch (outfit) {
    case 'Raider':
      // leather tunic skirt + laced neck
      R(bodyX, 36, bodyW, 3, torso); R(bodyX, 38, bodyW, 1, torsoD);
      if (front) { R(19, 24, 2, 4, dk(torso, 0.4)); P(18, 25, WRAP); P(21, 26, WRAP); P(18, 27, WRAP); }
      break;
    case 'Huscarl':
      // mail byrnie down to the thigh, coloured tunic hem below
      R(bodyX, 36, bodyW, 4, torso);
      for (let y = 24; y < 40; y++) for (let x = bodyX; x < bodyX + bodyW; x++) if ((x + y) % 2 === 0) P(x, y, (x - bodyX) > bodyW - 4 ? IRON_D : dk(IRON, 0.15));
      R(bodyX, 40, bodyW, 2, out); R(bodyX, 41, bodyW, 1, outD);
      break;
    case 'Skald':
      // long tunic to the knee with tablet-woven trim
      R(bodyX, 36, bodyW, 8, torso); R(bodyX + bodyW - 3, 36, 3, 8, torsoD);
      for (let x = bodyX; x < bodyX + bodyW; x++) { P(x, 42, x % 2 ? BRASS : '#a8382a'); P(x, 43, outDD); }
      if (front) { for (let x = 17; x <= 22; x++) P(x, 23, x % 2 ? BRASS : '#a8382a'); R(19, 24, 2, 3, BRASS); }
      break;
    case 'Berserker':
      // bare chest: woad marks, leather harness
      if (front) {
        R(16, 26, 1, 4, WOAD); R(23, 26, 1, 4, WOAD); R(17, 29, 2, 1, WOAD); R(21, 29, 2, 1, WOAD); P(20, 27, WOAD); P(19, 27, WOAD);
        line(13, 24, 26, 34, 1, LEATHER); P(19, 29, IRON_L);
      } else if (side) { R(18, 26, 1, 5, WOAD); line(15, 24, 23, 34, 1, LEATHER); }
      else { R(17, 27, 6, 1, WOAD); R(19, 25, 2, 6, WOAD); line(13, 24, 26, 34, 1, LEATHER); }
      R(bodyX, 33, bodyW, 4, out); R(bodyX, 33, bodyW, 1, dk(out, 0.4)); // waist wrap
      break;
    case 'Jarl':
      R(bodyX, 36, bodyW, 3, torso);
      for (let x = bodyX; x < bodyX + bodyW; x++) P(x, 38, BRASS);
      if (front) { R(18, 23, 4, 1, BRASS); R(19, 24, 2, 5, outD); }
      break;
    case 'Hunter':
      // leather jerkin, laced
      R(bodyX, 36, bodyW, 2, torso);
      if (front) for (let y = 24; y < 34; y += 2) { P(19, y, WRAP); P(20, y + 1, WRAP); }
      break;
  }
  if (belt && outfit !== 'Berserker') {
    if (!side) { R(12, 34, 16, 2, belt); R(12, 35, 16, 1, dk(belt, 0.3)); R(19, 34, 2, 2, buckle); P(20, 35, dk(buckle)); }
    else { R(14, 34, 11, 2, belt); R(22, 34, 2, 2, buckle); }
    if (front) { R(14, 36, 1, 3, belt); P(14, 38, buckle); } // strap end
  }


  // ------------------------------------------------------------------ things worn on the back
  if (back && outfit === 'Huscarl') {
    // round shield slung on the back: painted halves, iron rim and boss
    for (let y = 22; y <= 42; y++) {
      const hw = Math.round(Math.sqrt(Math.max(0, 100 - (y - 32) ** 2)));
      R(20 - hw, y, hw, 1, outD); R(20, y, hw, 1, out);
      P(20 - hw, y, IRON_D); P(20 + hw - 1, y, IRON_D);
    }
    R(18, 30, 4, 4, IRON); R(19, 30, 2, 1, IRON_L); R(18, 33, 4, 1, IRON_D);
  }
  if (back && (outfit === 'Skald' || outfit === 'Jarl')) {
    const cl = outfit === 'Jarl' ? outD : '#3a3230';
    R(11, 22, 18, 25, cl); R(25, 22, 4, 25, dk(cl, 0.25));
    for (let x = 13; x < 25; x += 4) R(x, 25, 1, 20, dk(cl, 0.18));
    if (outfit === 'Jarl') R(11, 22, 18, 3, '#e6e2da');
  }
  if (back && outfit === 'Hunter') {
    R(23, 17, 4, 19, LEATHER); R(26, 17, 1, 19, dk(LEATHER)); R(23, 17, 4, 1, dk(LEATHER, 0.4));
    for (const x of [23, 25]) { R(x, 13, 1, 4, '#d8d0c0'); P(x, 13, '#a8382a'); }
  }

  // ------------------------------------------------------------------ head
  const HX = side ? 15 : 14, HW = side ? 11 : 12;
  R(HX + 1, 8, HW - 2, 1, skin); R(HX, 9, HW, 11, skin); R(HX + 1, 20, HW - 2, 1, skinD);
  if (!side) {
    R(25, 10, 1, 10, skinD); R(24, 16, 1, 3, skinD); R(14, 17, 1, 3, skinD);
    R(13, 13, 1, 3, skin); P(13, 15, skinD); R(26, 13, 1, 3, skinD);
    R(17, 21, 6, 2, skinD); R(18, 22, 4, 1, skinDD);
  } else {
    P(26, 15, skin); P(26, 16, skinD);
    R(18, 13, 2, 3, skinD); P(18, 13, skin);
    R(16, 10, 1, 10, skinD);
    R(18, 21, 5, 2, skinD);
  }
  if (front) {
    const brow = style === 'Shaved' ? skinDD : hairD;
    R(15, 13, 3, 1, brow); R(22, 13, 3, 1, brow); P(17, 12, brow); P(22, 12, brow);
    P(15, 15, WHITE); R(16, 14, 1, 2, EYE);
    P(24, 15, WHITE); R(23, 14, 1, 2, EYE);
    P(20, 16, skinD); P(20, 17, skinDD); P(19, 17, skinD);
    R(19, 19, 2, 1, MOUTH);
    if (outfit === 'Berserker') { R(15, 16, 3, 1, WOAD); R(22, 16, 3, 1, WOAD); } // war paint
  } else if (side) {
    R(22, 13, 3, 1, style === 'Shaved' ? skinDD : hairD);
    R(23, 14, 1, 2, EYE); P(24, 15, WHITE);
    P(24, 19, MOUTH);
    if (outfit === 'Berserker') R(22, 16, 3, 1, WOAD);
  }

  // Beard
  if (beard !== 'None' && !back) {
    if (front) {
      R(17, 18, 6, 1, hair); R(16, 19, 2, 1, hair); R(22, 19, 2, 1, hair); // moustache
      R(14, 17, 1, 3, hairD); R(25, 17, 1, 3, hairD);
      R(15, 20, 10, 2, hair); R(16, 22, 8, 1, hair); R(17, 23, 6, 1, hairD);
      P(18, 21, hairD); P(21, 21, hairD); P(19, 19, MOUTH); P(20, 19, MOUTH); R(16, 20, 2, 1, hairL);
      if (beard === 'Braided') { R(18, 24, 4, 6, hair); for (let y = 24; y < 30; y += 2) { P(18, y, hairD); P(21, y + 1, hairD); } R(18, 27, 4, 1, BRASS); R(19, 30, 2, 1, hairD); }
    } else {
      R(20, 18, 6, 1, hair); R(18, 17, 2, 4, hair); R(19, 20, 7, 2, hair); R(20, 22, 5, 1, hairD); P(24, 19, MOUTH);
      if (beard === 'Braided') { R(21, 23, 3, 6, hair); P(21, 24, hairD); P(23, 26, hairD); R(21, 26, 3, 1, BRASS); }
    }
  }

  // ------------------------------------------------------------------ hair & headgear
  drawHair(style, front ? 'front' : back ? 'back' : 'side', R, P, hair, hairD, hairL, skin);

  if (outfit === 'Huscarl') {
    // spangenhelm with a nasal guard
    const hx = side ? 14 : 13, hw = side ? 13 : 14;
    R(hx + 3, 4, hw - 6, 1, IRON); R(hx + 1, 5, hw - 2, 2, IRON); R(hx, 7, hw, 4, IRON);
    R(hx, 10, hw, 2, IRON_D); R(hx + 2, 5, 2, 2, IRON_L); R(hx + hw - 3, 6, 2, 4, IRON_D);
    if (!side) R(19, 4, 2, 7, IRON_D); else R(20, 4, 2, 7, IRON_D);
    if (front) { R(19, 12, 2, 4, IRON); P(19, 12, IRON_L); }
    if (side) { R(25, 12, 2, 4, IRON); R(13, 12, 3, 4, IRON_D); }
    for (let x = hx; x < hx + hw; x += 2) P(x, 11, IRON_L); // rivets
  }
  if (outfit === 'Berserker') {
    // bear pelt over head and shoulders
    const pel = '#5a4434', pelD = dk(pel, 0.35), pelL = lt(pel, 0.18);
    if (!side) {
      R(13, 4, 14, 8, pel); R(12, 6, 16, 5, pel); R(13, 3, 3, 2, pel); R(24, 3, 3, 2, pel); P(14, 3, pelD); P(25, 3, pelD);
      R(10, 21, 20, 4, pel); R(9, 23, 3, 8, pel); R(28, 23, 3, 8, pel);
      for (let x = 10; x < 30; x += 3) P(x, 25, pelD);
      R(14, 5, 3, 1, pelL); R(12, 10, 16, 1, pelD);
      if (front) { R(17, 10, 6, 3, pel); R(18, 12, 4, 1, '#2a2220'); P(17, 11, '#e8e0c8'); P(22, 11, '#e8e0c8'); }
      if (back) { R(11, 11, 18, 14, pel); for (let y = 13; y < 25; y += 3) for (let x = 12 + (y % 2); x < 28; x += 3) P(x, y, pelD); }
    } else {
      R(13, 4, 13, 8, pel); R(14, 3, 3, 2, pel); R(25, 8, 3, 4, pel); P(27, 10, '#2a2220');
      R(11, 9, 6, 14, pel); R(11, 21, 15, 4, pel); R(14, 5, 3, 1, pelL); R(13, 11, 4, 1, pelD);
    }
  }
  if (outfit === 'Raider') {
    // fur mantle on the shoulders
    const furD = dk(FUR, 0.35), furL = lt(FUR, 0.25);
    if (!side) { R(11, 21, 18, 4, FUR); for (let x = 11; x < 29; x += 2) P(x, 25, FUR); for (let x = 12; x < 29; x += 3) { P(x, 22, furL); P(x + 1, 24, furD); } }
    else { R(13, 21, 13, 4, FUR); for (let x = 13; x < 26; x += 2) P(x, 25, FUR); for (let x = 14; x < 26; x += 3) P(x, 22, furL); }
  }
  if (outfit === 'Jarl') {
    // white fur collar and twin brooches
    const fw = '#e6e2da', fwD = '#b8b2a8';
    if (!side) { R(11, 21, 18, 3, fw); for (let x = 11; x < 29; x += 2) { P(x, 24, fw); P(x + 1, 22, fwD); } }
    else { R(13, 21, 12, 3, fw); for (let x = 13; x < 25; x += 2) P(x, 24, fw); }
    if (front) { R(13, 25, 3, 3, BRASS); P(14, 26, BRASS_D); R(24, 25, 3, 3, BRASS); P(25, 26, BRASS_D); }
  }
  if (outfit === 'Skald' && !back) {
    // cloak pinned at the shoulder with a round brooch
    if (front) { R(24, 22, 5, 3, '#3a3230'); R(25, 24, 3, 3, BRASS); P(26, 25, BRASS_D); }
    else { R(14, 22, 4, 3, '#3a3230'); R(18, 23, 3, 3, BRASS); P(19, 24, BRASS_D); }
  }
  if (outfit === 'Hunter') {
    // short hooded capelet, hood down
    if (!side) { R(11, 21, 18, 5, out); R(11, 25, 18, 1, outD); for (let x = 12; x < 28; x += 4) P(x, 23, outD); if (back) { R(14, 17, 12, 5, out); R(15, 17, 10, 1, outL); } }
    else { R(13, 21, 13, 5, out); R(13, 25, 13, 1, outD); R(12, 15, 5, 7, out); }
  }

  // ------------------------------------------------------------------ arms in front, and the sword swing
  if (atk) {
    // shoulder, hand and blade angle for each swing frame
    const f = Math.min(2, frame);
    const SW = {
      0: [[29, 25, 31, 16, -100], [29, 25, 34, 26, -8], [29, 25, 31, 33, 62]],
      1: [[28, 25, 33, 25, 15], [28, 25, 29, 14, -90], [28, 25, 22, 13, -150]],
      2: [[21, 25, 17, 15, -120], [21, 25, 28, 26, -5], [21, 25, 26, 33, 50]],
    }[dir][f];
    const [sx0, sy0, hx, hy, ang] = SW;
    if (!side) armFront(9, 0, false);
    line(sx0 + 1, sy0 + 1, hx + 1, hy + 1, 3, armCol);
    if (outfit === 'Huscarl') line(Math.round((sx0 + hx) / 2) + 1, Math.round((sy0 + hy) / 2) + 1, hx + 1, hy + 1, 3, out);
    hand(hx, hy);
    sword(hx, hy, ang);
  } else if (!side) {
    armFront(9, swing, false);
    armFront(28, -swing, true);
  } else {
    const hx = swing > 0 ? 16 : swing < 0 ? 22 : 19;
    R(19, 24, 3, 5, armCol); R(19, 24, 1, 5, armColD);
    R(Math.round((19 + hx) / 2), 29, 3, 4, armCol);
    if (outfit === 'Hunter') R(Math.round((19 + hx) / 2), 29, 3, 3, LEATHER);
    hand(hx, 33);
  }

  return outline(c);
}

// Hair for each style and view. R/P paint in upper-body coordinates.
function drawHair(style, view, R, P, H, D, Lt, skin) {
  const capFront = () => {
    R(16, 6, 8, 1, H); R(14, 7, 12, 1, H); R(13, 8, 14, 4, H);
    R(13, 12, 3, 1, H); R(22, 12, 5, 1, H); R(13, 13, 1, 2, D); R(26, 13, 1, 2, D);
    R(24, 8, 3, 4, D); R(16, 12, 1, 1, D);
    R(16, 7, 3, 1, Lt); R(15, 8, 1, 1, Lt);
    for (const x of [17, 20, 23]) R(x, 8, 1, 4, D);
  };
  const capBack = (bottom = 19) => {
    R(16, 6, 8, 1, H); R(14, 7, 12, 1, H); R(13, 8, 14, bottom - 7, H);
    R(13, bottom + 1, 14, 1, D); R(24, 8, 3, bottom - 7, D);
    for (const x of [16, 19, 22]) R(x, 9, 1, bottom - 9, D);
    R(15, 8, 2, 1, Lt);
  };
  const capSide = (bottom = 18) => {
    R(17, 6, 7, 1, H); R(15, 7, 11, 1, H); R(14, 8, 13, 4, H);
    R(23, 12, 4, 1, H); R(14, 12, 6, bottom - 11, H); R(14, bottom + 1, 6, 1, D);
    R(14, 8, 2, bottom - 7, D); for (const x of [17, 20, 23]) R(x, 8, 1, 4, D);
    R(18, 7, 3, 1, Lt);
  };
  const front = view === 'front', back = view === 'back';
  // short stubble: a soft tint of the hair colour with a few darker flecks
  const stubble = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, (i * 3 + j * 5) % 7 === 0 ? mix(skin, H, 0.55) : mix(skin, H, 0.32)); };
  switch (style) {
    case 'Cropped':
      if (front) capFront(); else if (back) capBack(); else capSide();
      break;
    case 'Shaggy':
      if (front) { capFront(); for (const [x, h] of [[13, 4], [15, 3], [24, 3], [26, 4]]) R(x, 12, 1, h, H); for (const x of [14, 18, 21, 25]) { P(x, 5, H); P(x + 1, 6, D); } }
      else if (back) { capBack(21); for (const x of [13, 16, 19, 22, 25]) R(x, 21, 2, 1, H); for (const x of [14, 18, 22]) P(x, 5, H); }
      else { capSide(21); for (const x of [14, 17]) R(x, 21, 2, 1, H); for (const x of [16, 20, 24]) P(x, 5, H); R(26, 12, 1, 3, H); }
      break;
    case 'Long':
      if (front) { capFront(); R(12, 10, 3, 19, H); R(25, 10, 3, 19, H); R(12, 10, 1, 19, D); R(27, 10, 1, 19, D); R(13, 28, 2, 1, D); R(25, 28, 2, 1, D); }
      else if (back) { capBack(28); R(12, 10, 1, 19, D); R(27, 10, 1, 19, D); }
      else { capSide(28); R(13, 12, 1, 16, D); }
      break;
    case 'Braid': {
      const braid = (x, y0, y1) => { for (let y = y0; y <= y1; y++) { R(x, y, 3, 1, H); P(x + ((y % 2) ? 0 : 2), y, D); } R(x, y1 + 1, 3, 1, '#4e3420'); R(x, y1 + 2, 3, 2, H); };
      if (front) { capFront(); braid(25, 13, 28); }
      else if (back) { capBack(); braid(18, 20, 31); }
      else { capSide(); braid(12, 13, 27); }
      break;
    }
    case 'Curls': {
      const blob = (x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) { const k = Math.min(y - y0, y1 - y, 3); const inset = [3, 1, 0, 0][k]; R(x0 + inset, y, x1 - x0 + 1 - inset * 2, 1, H); }
      };
      const curls = (x0, y0, x1, y1) => { for (let y = y0 + 1; y < y1; y += 2) for (let x = x0 + (y % 4 === 1 ? 1 : 3); x < x1; x += 4) { P(x, y, D); P(x + 1, y, Lt); } };
      if (front) { blob(10, 3, 29, 13); R(10, 13, 4, 6, H); R(26, 13, 4, 6, H); R(14, 12, 12, 1, D); curls(10, 3, 29, 18); }
      else if (back) { blob(10, 3, 29, 22); curls(10, 3, 29, 22); }
      else { blob(12, 3, 28, 13); R(12, 13, 8, 7, H); R(20, 12, 7, 1, D); curls(12, 3, 28, 19); }
      break;
    }
    case 'Undercut':
      // shaved sides, long top pulled back into a tail
      if (front) { stubble(13, 8, 14, 4); R(16, 5, 8, 7, H); R(16, 5, 8, 1, Lt); for (const x of [17, 19, 21]) R(x, 6, 1, 6, D); R(23, 5, 1, 7, D); }
      else if (back) { stubble(13, 8, 14, 10); R(16, 5, 8, 9, H); R(17, 14, 6, 2, '#4e3420'); R(17, 16, 6, 7, H); for (let y = 17; y < 23; y += 2) P(18 + (y % 4 === 1 ? 2 : 0), y, D); }
      else { stubble(14, 8, 12, 10); R(15, 5, 11, 4, H); R(14, 6, 3, 6, H); R(11, 9, 4, 2, '#4e3420'); R(9, 11, 5, 8, H); R(15, 5, 10, 1, Lt); for (let y = 12; y < 19; y += 2) P(10, y, D); }
      break;
    case 'Topknot':
      if (front) { capFront(); R(17, 1, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); R(21, 1, 2, 3, D); R(18, 1, 2, 1, Lt); }
      else if (back) { capBack(); R(17, 1, 6, 4, H); R(17, 4, 6, 1, '#4e3420'); R(21, 1, 2, 3, D); }
      else { capSide(); R(16, 1, 6, 4, H); R(16, 4, 6, 1, '#4e3420'); R(20, 1, 2, 3, D); }
      break;
    default: // Shaved
      if (front) stubble(14, 8, 12, 3);
      else if (back) stubble(13, 8, 14, 11);
      else stubble(15, 8, 11, 4);
      break;
  }
}
