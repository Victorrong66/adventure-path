// Heroes are drawn at twice the world's resolution (each pixel here is half a world
// pixel), so they're made of finer pixels than the scenery. The canvas is 40x62;
// feet stand at the bottom centre. Front layout: head x14..25 y8..20, torso y23..36,
// legs y37..53, boots y54..58.
//
// dir: 0 down (front), 1 up (back), 2 side (facing right; left is a mirror image).
// pose: 'walk' (frames 0..3), 'idle' (frames 0..1, breathing), 'atk' (sword strike).

export const HERO_W = 40, HERO_H = 62;
const EYE = '#241c30', WHITE = '#f4f0f0', MOUTH = '#8c4a48';
const STEEL = '#dfe6f0', STEEL_D = '#8e98aa', HILT = '#6b4423', GOLD = '#f0c848', GOLD_D = '#b08020';

function canvas() {
  const c = document.createElement('canvas');
  c.width = HERO_W; c.height = HERO_H;
  return c;
}

export function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + ((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

function outlineCanvas(c, color = '#141018') {
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

// look: { skin, hair, hairColor, outfitColor (hex strings), style, outfit (names) }
export function buildHero(look, dir, pose, frame) {
  const c = canvas();
  const g = c.getContext('2d');
  const front = dir === 0, back = dir === 1, side = dir === 2;
  const atk = pose === 'atk';
  const walk = pose === 'walk';
  // Upper-body offset: rises a pixel mid-stride, sinks a pixel when breathing out.
  const by = walk && frame % 2 === 1 ? -1 : pose === 'idle' && frame === 1 ? 1 : 0;

  const fill = (x, y, w, h, col) => { if (col) { g.fillStyle = col; g.fillRect(x, y, w, h); } };
  const R = (x, y, w, h, col) => fill(x, y + by, w, h, col); // upper body
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const L = fill; // legs (not offset)
  const clr = (x, y) => g.clearRect(x, y + by, 1, 1);

  const skin = look.skin, skinD = shadeHex(skin, -0.16), skinDD = shadeHex(skin, -0.3), skinL = shadeHex(skin, 0.22);
  const hair = look.hair, hairD = shadeHex(hair, -0.32), hairL = shadeHex(hair, 0.28);
  const out = look.outfitColor, outD = shadeHex(out, -0.28), outDD = shadeHex(out, -0.45), outL = shadeHex(out, 0.22);
  const outfit = look.outfit, style = look.style;

  let torso = out, torsoD = outD, torsoL = outL, sleeve = out, sleeveD = outD;
  let pants = '#6a4a34', boots = '#3c281a', belt = '#5a3a22', buckle = GOLD;
  let shortSleeves = false;
  switch (outfit) {
    case 'Tunic': shortSleeves = true; break;
    case 'Knight': torso = '#b8bec9'; torsoD = '#7c8494'; torsoL = '#e2e7ef'; sleeve = '#a3a9b6'; sleeveD = '#7c8494'; pants = '#8a909e'; boots = '#4c5262'; break;
    case 'Wizard': pants = outD; boots = '#3a2a4a'; belt = GOLD; buckle = GOLD_D; break;
    case 'Ninja': torso = '#2c2c3a'; torsoD = '#1b1b26'; torsoL = '#3f3f52'; sleeve = '#2c2c3a'; sleeveD = '#1b1b26'; pants = '#2c2c3a'; boots = '#1b1b26'; belt = out; buckle = outD; break;
    case 'Hoodie': pants = '#3d5c9e'; boots = '#ecebf2'; belt = null; break;
    case 'Overalls': torso = '#efeee6'; torsoD = '#c9c8bf'; torsoL = '#ffffff'; sleeve = '#efeee6'; sleeveD = '#c9c8bf'; pants = out; boots = '#6b4423'; belt = null; break;
  }
  const pantsD = shadeHex(pants, -0.25), pantsL = shadeHex(pants, 0.15);
  const bootsD = shadeHex(boots, -0.3), bootsL = shadeHex(boots, 0.28);

  // ------------------------------------------------------------------ helpers
  const hand = (x, y) => { R(x, y, 3, 3, skin); R(x + 2, y, 1, 3, skinD); P(x, y + 2, skinD); };
  const sword = (kind, x, y) => {
    // A short sword held at (x, y): blade pointing down, up or right.
    if (kind === 'down') { R(x - 2, y, 5, 1, GOLD); R(x, y + 1, 1, 11, STEEL); R(x + 1, y + 1, 1, 10, STEEL_D); P(x, y + 12, STEEL_D); }
    if (kind === 'up') { R(x - 2, y, 5, 1, GOLD); R(x, y - 11, 1, 11, STEEL); R(x + 1, y - 10, 1, 10, STEEL_D); P(x, y - 12, STEEL_D); }
    if (kind === 'right') { R(x, y - 2, 1, 5, GOLD); R(x + 1, y, 10, 1, STEEL); R(x + 1, y + 1, 9, 1, STEEL_D); P(x + 11, y, STEEL_D); }
    if (kind === 'diag') { // slashing out and down to the side
      R(x - 1, y + 1, 1, 2, GOLD); R(x, y - 1, 2, 1, GOLD);
      for (let i = 1; i <= 7; i++) { P(x + i, y + i, STEEL); P(x + i, y + i + 1, STEEL_D); }
    }
  };

  // ------------------------------------------------------------------ behind everything
  if (outfit === 'Hoodie' && front) { R(12, 6, 16, 16, outD); clr(12, 6); clr(27, 6); clr(12, 21); clr(27, 21); }
  if (outfit === 'Hoodie' && back) R(12, 6, 16, 19, out);
  if (style === 'Long' && front) { R(12, 11, 3, 20, hairD); R(25, 11, 3, 20, hairD); }
  if (style === 'Ponytail' && front) { R(26, 12, 3, 13, hair); R(28, 13, 1, 12, hairD); P(26, 25, hairD); P(26, 11, '#e8487a'); }

  // ------------------------------------------------------------------ legs
  const legFront = (x, lift) => {
    const top = 37, bottom = 53 - lift;
    L(x, top, 5, bottom - top + 1, pants);
    L(x + 4, top, 1, bottom - top + 1, pantsD);
    L(x + 1, top + 8, 1, 2, pantsL); // knee
    const bx = x < 20 ? x - 1 : x, by2 = 54 - lift;
    L(bx, by2, 6, 5, boots); L(bx, by2, 6, 1, bootsL); L(bx, by2 + 4, 6, 1, bootsD);
  };
  if (!side) {
    L(19, 37, 2, 3, pantsD);
    const lift = walk ? frame : 0;
    legFront(14, lift === 1 ? 2 : 0);
    legFront(21, lift === 3 ? 2 : 0);
  } else {
    const legSide = (xTop, xBot, col, colD, bootCol, bootColL, heel = 0) => {
      L(xTop, 37, 5, 8, col); L(xBot, 45, 5, 9, col);
      L(xTop, 37, 1, 8, colD); L(xBot, 45, 1, 9, colD);
      L(xBot, 54 - heel, 7, 5, bootCol); L(xBot, 54 - heel, 7, 1, bootColL); L(xBot, 58 - heel, 7, 1, shadeHex(bootCol, -0.3));
    };
    if (walk && frame % 2 === 1) {
      // stride: one leg forward, one back (which one swaps between frames 1 and 3)
      const backCol = shadeHex(pants, -0.2), backBoot = shadeHex(boots, -0.2);
      legSide(16, 12, backCol, shadeHex(backCol, -0.25), backBoot, boots, 1);
      legSide(19, 21, pants, pantsD, boots, bootsL);
    } else if (atk) {
      legSide(15, 13, shadeHex(pants, -0.2), pantsD, shadeHex(boots, -0.2), boots);
      legSide(19, 21, pants, pantsD, boots, bootsL);
    } else {
      legSide(17, 17, pants, pantsD, boots, bootsL);
    }
  }

  // ------------------------------------------------------------------ arms behind the body
  const swing = walk ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
  const armFront = (x, d, isRight) => {
    const len = 9 + d;
    if (shortSleeves) { R(x, 24, 3, 4, sleeve); R(x, 28, 3, len - 4, skin); R(isRight ? x + 2 : x, 28, 1, len - 4, skinD); }
    else { R(x, 24, 3, len, sleeve); R(isRight ? x + 2 : x, 24, 1, len, sleeveD); }
    hand(x, 24 + len);
  };
  if (side) {
    // back arm (darker) peeks out when swinging or striking
    if (swing || atk) {
      const bx = atk ? 14 : swing > 0 ? 22 : 15;
      R(bx, 25, 3, 7, sleeveD); R(bx, 32, 3, 3, skinD);
    }
  }

  // ------------------------------------------------------------------ torso
  if (!side) {
    R(13, 23, 14, 1, torso); R(12, 24, 16, 12, torso); R(13, 36, 14, 1, torsoD);
    R(12, 24, 1, 9, torsoL); R(25, 24, 3, 12, torsoD); R(26, 24, 1, 12, shadeHex(torsoD, -0.15));
    R(17, 29, 1, 3, torsoD); // fold
  } else {
    R(15, 23, 9, 1, torso); R(14, 24, 11, 12, torso); R(15, 36, 9, 1, torsoD);
    R(14, 24, 2, 12, torsoD); R(23, 25, 1, 9, torsoL);
  }
  if (belt) {
    if (!side) { R(12, 34, 16, 2, belt); R(12, 35, 16, 1, shadeHex(belt, -0.25)); R(19, 34, 2, 2, buckle); P(20, 35, GOLD_D); }
    else { R(14, 34, 11, 2, belt); R(14, 35, 11, 1, shadeHex(belt, -0.25)); R(22, 34, 2, 2, buckle); }
  }

  // ------------------------------------------------------------------ arms in front
  if (!side) {
    if (atk && front) {
      // right arm (viewer's right) swings the sword out and down
      armFront(9, 0, false);
      R(28, 24, 3, 4, sleeve); R(29, 28, 3, 4, sleeve); R(31, 28, 1, 4, sleeveD); hand(30, 31);
      sword('diag', 32, 33);
    } else if (atk && back) {
      armFront(9, 0, false);
      R(28, 17, 3, 8, sleeve); R(30, 17, 1, 8, sleeveD); hand(28, 14);
      sword('up', 29, 13);
    } else {
      armFront(9, swing, false);
      armFront(28, -swing, true);
    }
  }

  // ------------------------------------------------------------------ head
  const HX = side ? 15 : 14, HW = side ? 11 : 12;
  R(HX + 1, 8, HW - 2, 1, skin); R(HX, 9, HW, 11, skin); R(HX + 1, 20, HW - 2, 1, skinD);
  if (!side) {
    R(25, 10, 1, 10, skinD); R(24, 16, 1, 3, skinD);
    R(13, 13, 1, 3, skin); P(13, 15, skinD); R(26, 13, 1, 3, skinD); // ears
    R(17, 21, 6, 2, skinD); R(18, 22, 4, 1, skinDD); // neck
  } else {
    P(26, 15, skin); P(26, 16, skinD); // nose
    R(18, 13, 2, 3, skinD); P(18, 13, skin); // ear
    R(18, 21, 5, 2, skinD);
  }
  if (front) {
    const brow = style === 'Bald' ? skinDD : hairD;
    R(15, 13, 3, 1, brow); R(22, 13, 3, 1, brow);
    P(15, 15, WHITE); R(16, 14, 1, 2, EYE);
    P(24, 15, WHITE); R(23, 14, 1, 2, EYE);
    P(20, 16, skinD); P(20, 17, skinD);
    R(19, 18, 2, 1, MOUTH);
  } else if (side) {
    R(22, 13, 3, 1, style === 'Bald' ? skinDD : hairD);
    R(23, 14, 1, 2, EYE); P(24, 15, WHITE);
    P(24, 18, MOUTH);
    R(16, 10, 1, 10, skinD);
  }
  if (style === 'Bald') { R(17, 9, 3, 1, skinL); P(16, 10, skinL); }

  // ------------------------------------------------------------------ outfit details
  switch (outfit) {
    case 'Tunic':
      if (front) { R(18, 23, 4, 1, skin); R(19, 24, 2, 2, skin); P(18, 23, skinD); }
      if (!side) { R(12, 36, 16, 2, outD); R(13, 37, 14, 1, outDD); } else { R(14, 36, 11, 2, outD); }
      break;
    case 'Knight':
      if (!side) {
        R(17, 23, 6, 15, out); R(21, 23, 2, 15, outD); R(17, 37, 6, 1, outDD);
        R(19, 26, 2, 6, GOLD); R(18, 28, 4, 1, GOLD); P(20, 31, GOLD_D);
        // shoulder plates
        R(9, 22, 5, 3, torsoL); R(9, 24, 5, 1, torsoD); R(26, 22, 5, 3, torsoD); R(26, 22, 4, 1, torsoL);
      } else {
        R(21, 23, 4, 15, out); R(24, 23, 1, 15, outD); R(22, 27, 2, 4, GOLD);
        R(17, 22, 6, 3, torsoL); R(17, 24, 6, 1, torsoD);
      }
      // chainmail texture on the legs
      for (let y = 38; y < 53; y += 2) for (let x = 13; x < 27; x += 2) {
        const d = g.getImageData(x, y, 1, 1).data;
        if (d[3]) L(x, y, 1, 1, pantsD);
      }
      break;
    case 'Wizard': {
      // long robe over the legs
      const x0 = side ? 14 : 12, w0 = side ? 11 : 16;
      R(x0, 23, w0, 14, out);
      for (let y = 37; y <= 53; y++) {
        const grow = Math.floor((y - 37) / 6);
        L(x0 - grow, y, w0 + grow * 2, 1, out);
        L(x0 + w0 + grow - (side ? 2 : 3), y, side ? 2 : 3, 1, outD);
      }
      L(x0 - 2, 53, w0 + 4, 1, GOLD);
      if (!side) { R(19, 23, 2, 30, outD); R(13, 24, 1, 12, outL); R(18, 23, 4, 1, skin); }
      else { R(14, 24, 2, 29, outD); }
      R(x0, 34, w0, 2, GOLD); R(side ? 22 : 19, 34, 2, 2, GOLD_D);
      break;
    }
    case 'Ninja':
      if (front) { R(14, 16, 12, 5, '#2c2c3a'); R(24, 16, 2, 5, '#1b1b26'); clr(14, 20); clr(25, 20); }
      if (side) { R(20, 16, 7, 5, '#2c2c3a'); }
      // arm wraps
      if (!side) { for (const y of [29, 31]) { R(9, y, 3, 1, '#45455a'); R(28, y, 3, 1, '#45455a'); } }
      break;
    case 'Hoodie':
      if (front) {
        R(17, 23, 1, 6, WHITE); R(22, 23, 1, 6, WHITE); P(17, 29, '#c8c8d0'); P(22, 29, '#c8c8d0');
        R(15, 29, 10, 4, outD); R(15, 29, 10, 1, outDD); R(12, 35, 16, 2, outD);
      }
      if (back) R(12, 35, 16, 2, outD);
      if (side) { R(18, 29, 6, 4, outD); R(14, 35, 11, 2, outD); }
      break;
    case 'Overalls':
      if (!side) {
        R(15, 27, 10, 10, out); R(23, 27, 2, 10, outD);
        R(15, 23, 2, 4, out); R(23, 23, 2, 4, out);
        if (front) { R(15, 27, 2, 1, GOLD); R(23, 27, 2, 1, GOLD); R(18, 30, 4, 3, outD); R(18, 30, 4, 1, outDD); }
      } else { R(18, 27, 7, 10, out); R(18, 23, 2, 4, out); R(18, 27, 2, 1, GOLD); }
      break;
  }

  // ------------------------------------------------------------------ hair & hats
  drawHair(style, front ? 'front' : back ? 'back' : 'side', R, P, hair, hairD, hairL, skin);

  if (outfit === 'Hoodie') {
    if (front) { R(14, 5, 12, 5, out); R(12, 8, 2, 13, out); R(26, 8, 2, 13, outD); R(15, 5, 4, 1, outL); clr(14, 5); clr(25, 5); R(14, 9, 12, 1, outD); }
    if (back) { R(13, 5, 14, 17, out); R(25, 6, 2, 16, outD); R(18, 20, 4, 4, outD); R(15, 6, 4, 1, outL); }
    if (side) { R(15, 5, 10, 5, out); R(12, 9, 7, 13, out); R(12, 10, 2, 12, outD); R(19, 9, 6, 1, outD); R(16, 5, 4, 1, outL); }
  }
  if (outfit === 'Ninja') {
    if (front) { R(13, 11, 14, 2, out); R(13, 12, 14, 1, outD); R(27, 11, 2, 2, outD); R(28, 13, 2, 1, out); R(29, 14, 2, 1, outD); }
    if (back) { R(13, 11, 14, 2, out); R(19, 13, 2, 2, outD); R(18, 15, 1, 4, out); R(21, 15, 1, 5, outD); }
    if (side) { R(14, 11, 13, 2, out); R(14, 12, 13, 1, outD); R(10, 11, 4, 1, out); R(8, 12, 3, 1, outD); P(9, 13, outD); }
  }
  if (outfit === 'Wizard') {
    if (!side) {
      R(9, 8, 22, 2, outD); R(10, 8, 20, 1, out);
      R(13, 6, 14, 2, out); R(14, 5, 12, 1, out); R(15, 4, 10, 1, out); R(16, 3, 8, 1, out); R(17, 2, 6, 1, out); R(19, 1, 4, 1, out); R(22, 0, 3, 1, out);
      R(13, 7, 14, 1, GOLD);
      R(24, 1, 1, 6, outD); R(25, 3, 2, 4, outD);
      if (front) { P(19, 3, '#fff2a0'); R(18, 4, 3, 1, '#fff2a0'); P(19, 5, '#fff2a0'); }
    } else {
      R(10, 8, 21, 2, outD); R(11, 8, 19, 1, out);
      R(14, 6, 13, 2, out); R(14, 5, 11, 1, out); R(14, 4, 9, 1, out); R(13, 3, 8, 1, out); R(12, 2, 6, 1, out); R(10, 1, 5, 1, out); R(8, 0, 4, 1, out);
      R(14, 7, 13, 1, GOLD); R(14, 3, 1, 4, outD);
      P(21, 5, '#fff2a0');
    }
  }

  // ------------------------------------------------------------------ side arm (in front) and strikes
  if (side) {
    if (atk) {
      // arm thrust forward with the blade out front
      R(19, 24, 3, 3, sleeve); R(21, 26, 6, 3, sleeve); R(21, 28, 6, 1, sleeveD); hand(27, 26);
      sword('right', 29, 27);
    } else {
      const hx = swing > 0 ? 16 : swing < 0 ? 22 : 19;
      R(19, 24, 3, 5, sleeve); R(19, 24, 1, 5, sleeveD);
      R(Math.round((19 + hx) / 2), 29, 3, 4, shortSleeves ? skin : sleeve);
      hand(hx, 33);
    }
  }

  return outlineCanvas(c);
}

// Hair for each style and view. R/P paint in upper-body coordinates.
function drawHair(style, view, R, P, H, D, Lt, skin) {
  const capFront = () => {
    R(16, 6, 8, 1, H); R(14, 7, 12, 1, H); R(13, 8, 14, 4, H);
    R(13, 12, 4, 1, H); R(21, 12, 6, 1, H); R(13, 13, 2, 1, D); R(25, 13, 2, 1, D);
    R(17, 12, 4, 1, D); R(24, 8, 3, 5, D);
    R(16, 7, 3, 1, Lt); R(15, 8, 2, 1, Lt);
    R(18, 9, 1, 3, D); R(22, 9, 1, 3, D); // strands
  };
  const capBack = (bottom = 19) => {
    R(16, 6, 8, 1, H); R(14, 7, 12, 1, H); R(13, 8, 14, bottom - 7, H);
    R(13, bottom + 1, 14, 1, D); R(24, 8, 3, bottom - 7, D);
    R(17, 10, 1, bottom - 10, D); R(21, 9, 1, bottom - 9, D);
    R(15, 8, 2, 2, Lt);
  };
  const capSide = (bottom = 18) => {
    R(17, 6, 7, 1, H); R(15, 7, 11, 1, H); R(14, 8, 13, 4, H);
    R(22, 12, 5, 1, H); R(26, 12, 1, 1, D);
    R(14, 12, 6, bottom - 11, H); R(14, bottom + 1, 6, 1, D);
    R(14, 8, 2, bottom - 7, D); R(18, 10, 1, bottom - 10, D);
    R(18, 7, 3, 1, Lt); R(21, 9, 1, 3, D);
  };
  const front = view === 'front', back = view === 'back';
  const spike = (x, y, h) => { for (let i = 0; i < h; i++) R(x - Math.floor(i / 2), y + i, 1 + Math.floor(i / 2) * 2, 1, H); P(x, y, Lt); };
  switch (style) {
    case 'Short':
      if (front) capFront(); else if (back) capBack(); else capSide();
      break;
    case 'Spiky':
      if (front) { capFront(); for (const x of [14, 17, 20, 23, 26]) spike(x, 3, 5); }
      else if (back) { capBack(); for (const x of [14, 17, 20, 23, 26]) spike(x, 3, 5); }
      else { capSide(); for (const x of [16, 19, 22]) spike(x, 3, 5); spike(13, 6, 4); }
      break;
    case 'Long':
      if (front) { capFront(); R(12, 10, 3, 21, H); R(25, 10, 3, 21, H); R(12, 10, 1, 21, D); R(27, 10, 1, 21, D); R(13, 30, 2, 1, D); R(25, 30, 2, 1, D); }
      else if (back) { capBack(30); R(12, 10, 1, 21, D); R(27, 10, 1, 21, D); R(12, 10, 1, 1, H); }
      else { capSide(30); R(13, 12, 1, 18, D); }
      break;
    case 'Ponytail':
      if (front) capFront();
      else if (back) { capBack(); R(19, 18, 2, 2, '#e8487a'); R(18, 20, 4, 9, H); R(19, 29, 2, 3, H); R(21, 20, 1, 9, D); P(20, 31, D); }
      else { capSide(); P(14, 13, '#e8487a'); R(10, 12, 4, 3, H); R(9, 15, 4, 8, H); R(10, 23, 2, 3, H); R(9, 15, 1, 8, D); P(10, 25, D); }
      break;
    case 'Afro': {
      const blob = (x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) {
          const k = Math.min(y - y0, y1 - y, 3);
          const inset = [4, 2, 1, 0][k];
          R(x0 + inset, y, x1 - x0 + 1 - inset * 2, 1, H);
        }
      };
      const curls = (x0, y0, x1, y1) => {
        for (let y = y0 + 1; y < y1; y += 3) for (let x = x0 + ((y / 3) % 2 ? 2 : 0); x < x1; x += 4) P(x, y, D);
      };
      if (front) {
        blob(9, 2, 30, 13); R(9, 13, 5, 6, H); R(26, 13, 5, 6, H); R(10, 19, 3, 1, D); R(27, 19, 3, 1, D);
        R(14, 12, 12, 1, D); curls(10, 2, 30, 12); R(13, 3, 4, 1, Lt); R(11, 5, 2, 1, Lt);
      } else if (back) { blob(9, 2, 30, 22); curls(10, 2, 30, 22); R(13, 3, 4, 1, Lt); }
      else { blob(11, 2, 28, 13); R(11, 13, 9, 7, H); R(12, 20, 7, 1, D); R(20, 12, 8, 1, D); curls(12, 2, 28, 18); R(14, 3, 4, 1, Lt); }
      break;
    }
    case 'Mohawk': {
      const stub = mixHex(skin, H, 0.35);
      if (front) { R(14, 8, 12, 4, stub); R(18, 1, 4, 11, H); R(21, 2, 1, 10, D); R(18, 1, 1, 3, Lt); P(18, 1, H); }
      else if (back) { R(14, 8, 12, 9, stub); R(18, 1, 4, 18, H); R(21, 2, 1, 17, D); }
      else { R(15, 8, 11, 5, stub); R(16, 6, 9, 2, H); R(17, 4, 7, 2, H); R(18, 2, 5, 2, H); R(19, 1, 3, 1, H); R(16, 7, 9, 1, D); R(19, 3, 2, 1, Lt); }
      break;
    }
    case 'Bun':
      if (front) { capFront(); R(17, 2, 6, 1, H); R(16, 3, 8, 3, H); R(21, 3, 3, 3, D); R(17, 3, 2, 1, Lt); }
      else if (back) { capBack(); R(16, 1, 8, 1, H); R(15, 2, 10, 5, H); R(22, 2, 3, 5, D); R(15, 6, 10, 1, D); R(16, 2, 2, 1, Lt); }
      else { capSide(); R(11, 5, 4, 1, H); R(10, 6, 5, 4, H); R(10, 9, 5, 1, D); R(11, 6, 2, 1, Lt); }
      break;
    default: break; // Bald
  }
}
