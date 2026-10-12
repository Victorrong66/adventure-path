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

// Characters are drawn on a 20x30 canvas (feet at the bottom, room for hats and
// spiky hair on top). Front-facing layout: head x5..14 y6..14, torso y15..21,
// legs y22..26, boots y27..28. Side view faces right; left is a mirror image.
const CW = 20, CH = 30;
const EYE = '#2a1e34';

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (n, s) => (n >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

// Hair for each style and view. H = hair, D = dark, L = highlight.
// Each function gets the pixel helpers and paints over the head.
function drawHair(style, view, r, p, H, D, L) {
  const capFront = () => {
    r(7, 5, 6, 1, H); r(6, 6, 8, 1, H); r(5, 7, 10, 2, H);
    r(5, 9, 1, 2, H); r(14, 9, 1, 2, D);
    r(6, 8, 8, 1, D); p(6, 9, D); p(13, 9, D); // fringe shadow
    r(7, 6, 2, 1, L); p(6, 7, L);
  };
  const capBack = (bottom = 13) => {
    r(7, 5, 6, 1, H); r(6, 6, 8, 1, H); r(5, 7, 10, bottom - 6, H);
    r(5, bottom, 10, 1, D); r(14, 7, 1, bottom - 6, D);
    r(7, 6, 2, 1, L); p(6, 7, L);
  };
  const capSide = (bottom = 12) => {
    r(8, 5, 5, 1, H); r(7, 6, 7, 1, H); r(6, 7, 9, 2, H);
    r(6, 9, 4, bottom - 8, H); r(6, bottom, 4, 1, D); p(13, 9, H); p(14, 9, D);
    r(10, 8, 4, 1, D); r(8, 6, 2, 1, L);
  };
  const front = view === 'front', back = view === 'back';
  switch (style) {
    case 'Short':
      if (front) capFront(); else if (back) capBack(); else capSide();
      break;
    case 'Spiky':
      if (front) { capFront(); for (const x of [5, 8, 11, 14]) { r(x, 3, 1, 2, H); p(x + (x < 14 ? 1 : -1), 4, H); } r(5, 4, 10, 1, H); p(8, 3, L); }
      else if (back) { capBack(); for (const x of [5, 8, 11, 14]) r(x, 3, 1, 2, H); r(5, 4, 10, 1, H); }
      else { capSide(); for (const x of [6, 9, 12]) { r(x, 3, 1, 2, H); p(x - 1, 3, H); } r(6, 4, 8, 1, H); p(4, 5, H); p(5, 6, H); }
      break;
    case 'Long':
      if (front) { capFront(); r(4, 8, 2, 11, H); r(14, 8, 2, 11, H); r(4, 8, 1, 11, D); r(15, 8, 1, 11, D); r(5, 18, 1, 1, D); r(14, 18, 1, 1, D); }
      else if (back) { capBack(18); r(4, 8, 1, 11, D); r(15, 8, 1, 11, D); r(7, 9, 1, 8, D); r(12, 9, 1, 8, D); }
      else { capSide(18); r(5, 8, 1, 10, H); r(5, 9, 1, 9, D); r(8, 10, 1, 7, D); }
      break;
    case 'Ponytail':
      if (front) { capFront(); r(15, 9, 2, 6, H); r(16, 10, 1, 6, D); p(15, 15, D); p(15, 8, '#f04878'); }
      else if (back) { capBack(); r(9, 11, 2, 1, '#f04878'); r(9, 12, 2, 7, H); r(10, 12, 1, 7, D); p(9, 19, D); }
      else { capSide(); p(6, 9, '#f04878'); r(3, 9, 3, 2, H); r(3, 11, 2, 4, H); r(3, 12, 1, 3, D); p(4, 15, D); }
      break;
    case 'Afro': {
      const blob = (x0, x1, y0, y1) => { r(x0 + 3, y0, x1 - x0 - 5, 1, H); r(x0 + 1, y0 + 1, x1 - x0 - 1, 1, H); r(x0, y0 + 2, x1 - x0 + 1, y1 - y0 - 3, H); r(x0 + 1, y1 - 1, x1 - x0 - 1, 1, H); r(x0 + 3, y1, x1 - x0 - 5, 1, D); };
      if (front) {
        blob(3, 16, 2, 9); r(3, 9, 3, 4, H); r(14, 9, 3, 4, H); r(16, 4, 1, 8, D); r(4, 12, 2, 1, D); r(14, 12, 2, 1, D);
        r(6, 9, 8, 1, D); r(6, 3, 3, 1, L); p(5, 4, L); p(10, 5, D); p(13, 6, D); p(7, 7, D);
      } else if (back) { blob(3, 16, 2, 14); r(16, 4, 1, 9, D); r(6, 3, 3, 1, L); p(8, 8, D); p(12, 10, D); p(6, 12, D); }
      else { blob(4, 15, 2, 9); r(4, 9, 6, 4, H); r(5, 13, 4, 1, D); r(10, 9, 5, 1, D); r(6, 3, 3, 1, L); p(8, 6, D); p(12, 5, D); }
      break;
    }
    case 'Mohawk':
      if (front) { r(9, 2, 2, 7, H); p(10, 2, D); r(10, 3, 1, 6, D); p(9, 2, L); r(6, 7, 3, 1, D); r(11, 7, 3, 1, D); }
      else if (back) { r(9, 2, 2, 12, H); r(10, 3, 1, 11, D); r(6, 8, 3, 1, D); r(11, 8, 3, 1, D); }
      else { r(8, 3, 4, 1, H); r(6, 4, 7, 3, H); r(6, 6, 7, 1, D); p(5, 5, H); r(8, 4, 2, 1, L); r(7, 7, 4, 2, D); }
      break;
    case 'Bun':
      if (front) { capFront(); r(9, 2, 2, 1, H); r(8, 3, 4, 2, H); r(10, 3, 2, 2, D); p(8, 3, L); }
      else if (back) { capBack(); r(8, 2, 4, 1, H); r(7, 3, 6, 3, H); r(11, 3, 2, 3, D); r(7, 5, 6, 1, D); p(8, 3, L); }
      else { capSide(); r(4, 4, 2, 1, H); r(3, 5, 4, 3, H); r(3, 7, 4, 1, D); p(4, 5, L); }
      break;
    default: // Bald: a little shine
      break;
  }
}

// Build one frame of a character. dir: 0 down, 1 up, 2 side (facing right). frame 0..3.
function buildChar(look, dir, frame) {
  const { c, g } = mk(CW, CH);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const p = (x, y, col) => r(x, y, 1, 1, col);
  const clear = (x, y) => g.clearRect(x, y, 1, 1);

  const skin = SKINS[look.skin] || SKINS[0];
  const skinD = shade(skin, -0.18);
  const skinL = shade(skin, 0.25);
  const blush = mix(skin, '#ff5c6c', 0.35);
  const hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  const hairD = shade(hair, -0.32);
  const hairL = shade(hair, 0.3);
  const out = OUTFIT_COLORS[look.outfitColor] || OUTFIT_COLORS[0];
  const outD = shade(out, -0.3);
  const outL = shade(out, 0.25);
  const outfit = OUTFITS[look.outfit] || OUTFITS[0];
  const style = HAIR_STYLES[look.hair] || HAIR_STYLES[0];
  const GOLD = '#f0c848', GOLD_D = '#b08020';

  // Colors for each outfit: torso, sleeves, pants, boots, belt
  let torso = out, torsoD = outD, torsoL = outL, sleeve = out, sleeveD = outD, pants = '#6a4a34', boots = '#3a2618', belt = '#5a3a22';
  let shortSleeves = false;
  switch (outfit) {
    case 'Tunic': shortSleeves = true; break;
    case 'Knight': torso = '#b8bcc8'; torsoD = '#7c8090'; torsoL = '#e4e8f0'; sleeve = '#a0a4b0'; sleeveD = '#7c8090'; pants = '#8c90a0'; boots = '#4c5060'; belt = '#5a3a22'; break;
    case 'Wizard': pants = outD; boots = '#3a2a4a'; belt = GOLD; break;
    case 'Ninja': torso = '#2c2c3c'; torsoD = '#1a1a26'; torsoL = '#40405a'; sleeve = '#2c2c3c'; sleeveD = '#1a1a26'; pants = '#2c2c3c'; boots = '#1a1a26'; belt = out; break;
    case 'Hoodie': pants = '#3c5a9c'; boots = '#e8e8f0'; belt = null; break;
    case 'Overalls': torso = '#f0f0e8'; torsoD = '#c8c8c0'; torsoL = '#ffffff'; sleeve = '#f0f0e8'; sleeveD = '#c8c8c0'; pants = out; boots = '#6b4423'; belt = null; break;
  }
  const pantsD = shade(pants, -0.25);
  const bootsL = shade(boots, 0.3);

  const step = frame === 1 ? 1 : frame === 3 ? 2 : 0; // which leg is lifted
  const side = dir === 2, front = dir === 0, back = dir === 1;
  const view = front ? 'front' : back ? 'back' : 'side';

  // ---------------------------------------------------------------- behind the body
  if (outfit === 'Hoodie' && front) { r(4, 6, 12, 9, outD); clear(4, 6); clear(15, 6); }
  if (outfit === 'Hoodie' && back) { r(4, 6, 12, 10, out); }

  // ---------------------------------------------------------------- legs
  const leg = (x, y, w, col, colD, bootCol, bootColL, toe = 0) => {
    r(x, y, w, 27 - y - (y > 22 ? 0 : 0), col);
    r(x + w - 1, y, 1, 27 - y, colD);
    r(x, 27, w + toe, 2, bootCol); r(x, 27, w, 1, bootColL);
  };
  if (!side) {
    const lY = step === 1 ? 1 : 0, rY = step === 2 ? 1 : 0;
    r(9, 22, 2, 1, pantsD);
    // lifted leg: shorter, boot drawn one pixel higher
    g.save(); g.translate(0, -lY); leg(6, 22 + lY, 3, pants, pantsD, boots, bootsL); g.restore();
    g.save(); g.translate(0, -rY); leg(11, 22 + rY, 3, pants, pantsD, boots, bootsL); g.restore();
  } else if (step) {
    leg(6, 22, 3, pantsD, shade(pantsD, -0.2), shade(boots, -0.2), boots, 1);
    leg(10, 22, 3, pants, pantsD, boots, bootsL, 1);
  } else {
    leg(8, 22, 3, pants, pantsD, boots, bootsL, 1);
  }

  // ---------------------------------------------------------------- arms (behind / beside the torso)
  const hand = (x, y) => { r(x, y, 2, 2, skin); p(x + 1, y + 1, skinD); };
  if (!side) {
    const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
    for (const [x, d] of [[3, swing], [15, -swing]]) {
      const len = 4 + Math.max(0, d);
      if (shortSleeves) { r(x, 16, 2, 2, sleeve); r(x, 18, 2, len - 2, skin); r(x + 1, 18, 1, len - 2, skinD); }
      else { r(x, 16, 2, len, sleeve); r(x + (x < 10 ? 0 : 1), 16, 1, len, sleeveD); }
      hand(x, 16 + len);
    }
  } else {
    // back arm peeks out behind the body when swinging
    if (step) { const bx = step === 1 ? 6 : 12; r(bx, 16, 2, 3, sleeveD); r(bx, 19, 2, 2, skinD); }
  }

  // ---------------------------------------------------------------- torso
  if (!side) {
    r(5, 15, 10, 7, torso);
    clear(5, 15); clear(14, 15);
    r(13, 16, 2, 6, torsoD); r(6, 16, 1, 5, torsoL); r(5, 21, 10, 1, torsoD);
  } else {
    r(7, 15, 6, 7, torso);
    r(7, 16, 1, 6, torsoD); r(11, 16, 1, 5, torsoL); r(7, 21, 6, 1, torsoD);
  }
  if (belt) {
    if (!side) { r(5, 20, 10, 1, belt); r(9, 20, 2, 1, outfit === 'Wizard' ? GOLD_D : GOLD); }
    else { r(7, 20, 6, 1, belt); p(12, 20, GOLD); }
  }

  // ---------------------------------------------------------------- head
  const HX = side ? 6 : 5, HW = side ? 9 : 10;
  r(HX, 6, HW, 9, skin);
  clear(HX, 6); clear(HX + HW - 1, 6); clear(HX, 14); clear(HX + HW - 1, 14);
  r(HX + 1, 14, HW - 2, 1, skinD);
  if (!side) {
    r(14, 7, 1, 7, skinD);
    // ears
    r(4, 10, 1, 2, skin); p(4, 11, skinD); r(15, 10, 1, 2, skinD);
  }
  // neck
  if (!side) r(8, 15, 4, 1, skinD); else r(9, 15, 3, 1, skinD);

  if (front) {
    // eyes with a shine, brows, blush, mouth
    r(7, 10, 2, 2, EYE); p(7, 10, '#ffffff');
    r(11, 10, 2, 2, EYE); p(11, 10, '#ffffff');
    const brow = style === 'Bald' ? shade(skin, -0.4) : hairD;
    r(7, 9, 2, 1, brow); r(11, 9, 2, 1, brow);
    p(6, 12, blush); p(13, 12, blush);
    p(10, 12, skinD);
    r(9, 13, 2, 1, mix(skinD, '#802838', 0.45));
  } else if (side) {
    r(12, 10, 2, 2, EYE); p(13, 10, '#ffffff');
    r(12, 9, 2, 1, style === 'Bald' ? shade(skin, -0.4) : hairD);
    p(15, 11, skin); p(15, 12, skinD); // nose
    p(12, 12, blush);
    p(14, 13, mix(skinD, '#802838', 0.45));
    r(8, 10, 2, 2, skinD); p(8, 10, skin); // ear
  }
  if (style === 'Bald') { r(7, 7, 2, 1, skinL); p(6, 8, skinL); }

  // ---------------------------------------------------------------- outfit details
  switch (outfit) {
    case 'Tunic':
      if (front) { r(8, 15, 4, 1, skin); r(9, 16, 2, 1, skin); p(8, 15, skinD); }
      r(side ? 7 : 5, 21, side ? 6 : 10, 1, outD);
      break;
    case 'Knight':
      if (!side) {
        r(8, 15, 4, 7, out); r(11, 15, 1, 7, outD); r(9, 17, 2, 2, GOLD); p(10, 18, GOLD_D);
        r(3, 15, 3, 2, torsoL); r(14, 15, 3, 2, torsoD); p(3, 16, torsoD);
      } else {
        r(10, 15, 3, 7, out); r(12, 15, 1, 7, outD); p(11, 17, GOLD);
        r(8, 15, 3, 2, torsoL);
      }
      break;
    case 'Wizard':
      // long robe over the legs
      if (!side) {
        r(5, 15, 10, 12, out); clear(5, 15); clear(14, 15);
        r(4, 23, 12, 4, out); r(13, 16, 2, 10, outD); r(15, 23, 1, 4, outD); r(6, 16, 1, 9, outL);
        r(4, 26, 12, 1, GOLD); r(5, 20, 10, 1, GOLD); r(9, 20, 2, 1, GOLD_D);
        if (front) { r(9, 15, 2, 1, skin); r(9, 21, 2, 5, outD); }
      } else {
        r(7, 15, 6, 12, out); r(6, 23, 8, 4, out); r(7, 16, 1, 10, outD); r(6, 23, 1, 4, outD);
        r(6, 26, 8, 1, GOLD); r(7, 20, 6, 1, GOLD);
      }
      break;
    case 'Ninja':
      if (front) { r(5, 12, 10, 3, '#2c2c3c'); clear(5, 14); clear(14, 14); r(14, 12, 1, 2, '#1a1a26'); }
      if (side) { r(10, 12, 5, 3, '#2c2c3c'); p(15, 12, '#2c2c3c'); }
      if (!side) { r(5, 21, 10, 1, '#1a1a26'); }
      break;
    case 'Hoodie':
      if (front) { r(7, 18, 6, 2, outD); r(8, 16, 1, 2, '#f0f0f0'); r(11, 16, 1, 2, '#f0f0f0'); r(5, 21, 10, 1, outD); }
      if (back) { r(5, 21, 10, 1, outD); }
      if (side) { r(9, 18, 4, 2, outD); r(7, 21, 6, 1, outD); }
      break;
    case 'Overalls':
      if (!side) {
        r(7, 17, 6, 5, out); r(12, 17, 1, 5, outD); r(7, 15, 1, 2, out); r(12, 15, 1, 2, out);
        if (front) { p(7, 17, GOLD); p(12, 17, GOLD); r(9, 18, 2, 1, outD); }
      } else { r(9, 17, 4, 5, out); r(10, 15, 1, 2, out); p(10, 17, GOLD); }
      break;
  }

  // ---------------------------------------------------------------- hair & hats
  drawHair(style, view, r, p, hair, hairD, hairL);

  if (outfit === 'Hoodie') {
    if (front) { r(5, 5, 10, 3, out); r(4, 7, 1, 7, out); r(15, 7, 1, 7, outD); r(5, 5, 1, 1, outL); clear(4, 6); clear(15, 6); r(6, 7, 8, 1, outD); }
    if (back) { r(5, 5, 10, 10, out); r(14, 6, 1, 9, outD); r(9, 14, 2, 2, outD); }
    if (side) { r(6, 5, 7, 3, out); r(5, 7, 4, 8, out); r(5, 8, 1, 7, outD); r(9, 7, 4, 1, outD); }
  }
  if (outfit === 'Ninja') {
    if (!side) { r(5, 8, 10, 1, out); r(5, 8, 1, 1, outD); }
    if (front) { r(15, 8, 2, 1, out); p(16, 9, outD); }
    if (back) { r(9, 9, 2, 2, out); p(8, 11, outD); p(11, 11, outD); }
    if (side) { r(6, 8, 9, 1, out); r(3, 8, 3, 1, out); r(2, 9, 2, 1, outD); p(4, 10, outD); }
  }
  if (outfit === 'Wizard') {
    const hatD = outD, band = GOLD;
    if (!side) {
      r(3, 7, 14, 2, hatD); r(4, 7, 12, 1, out);
      r(5, 5, 10, 2, out); r(6, 4, 8, 1, out); r(7, 3, 6, 1, out); r(8, 2, 5, 1, out); r(10, 1, 3, 1, out);
      r(5, 6, 10, 1, band);
      r(12, 2, 1, 4, hatD); r(13, 4, 1, 2, hatD);
      if (front) { p(9, 3, '#f8e858'); r(8, 4, 3, 1, '#f8e858'); p(9, 5, '#f8e858'); }
    } else {
      r(4, 7, 13, 2, hatD); r(5, 7, 11, 1, out);
      r(6, 5, 9, 2, out); r(6, 4, 7, 1, out); r(6, 3, 5, 1, out); r(5, 2, 4, 1, out); r(4, 1, 2, 1, out);
      r(6, 6, 9, 1, band); r(6, 3, 1, 3, hatD);
      p(11, 4, '#f8e858');
    }
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
    s = { img, ox: 10, oy: 29 };
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
