// The world map: a top-down grid of ground tiles and props, generated from a seed
// so the host and every client build the exact same map.
import { mulberry32 } from './util.js';

export const MAP = 56;
export const T = { GRASS: 0, DIRT: 1, PATH: 2, SAND: 3, WATER: 4 };
export const O = {
  NONE: 0, OAK: 1, PINE: 2, ROCK: 3, BUSH: 4, FIRE: 5, HOUSE: 6, PART: 7,
  FENCE: 8, MUSHROOM: 9, STUMP: 10, BARREL: 11, STALL: 12,
};

// Bushes are just decoration you can walk through; PART is the invisible rest of a big building.
const SOLID = new Set([O.OAK, O.PINE, O.ROCK, O.FIRE, O.HOUSE, O.PART, O.FENCE, O.MUSHROOM, O.STUMP, O.BARREL, O.STALL]);

export class World {
  constructor(seed) {
    this.seed = seed;
    this.size = MAP;
    this.cx = MAP / 2;
    this.cy = MAP / 2;
    this.campR = 5;
    this.ground = new Uint8Array(MAP * MAP);
    this.obj = new Uint8Array(MAP * MAP);
    this.variant = new Uint8Array(MAP * MAP);
    const rnd = mulberry32(seed);
    const c = Math.floor(this.cx);
    const onPath = (x, y) => Math.abs(x + 0.5 - this.cx) < 1 || Math.abs(y + 0.5 - this.cy) < 1;
    const campD = (x, y) => Math.hypot(x + 0.5 - this.cx, y + 0.5 - this.cy);

    // Ponds with wobbly edges, kept away from camp and the roads
    for (let i = 0, made = 0; i < 40 && made < 6; i++) {
      const px = 6 + rnd() * (MAP - 12), py = 6 + rnd() * (MAP - 12);
      const r = 2.2 + rnd() * (made === 0 ? 4 : 2.6);
      if (Math.hypot(px - this.cx, py - this.cy) < 11 + r) continue;
      if (Math.abs(px - this.cx) < r + 3 || Math.abs(py - this.cy) < r + 3) continue;
      const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
      for (let y = Math.floor(py - r - 2); y <= py + r + 2; y++) {
        for (let x = Math.floor(px - r - 2); x <= px + r + 2; x++) {
          if (x < 3 || y < 3 || x >= MAP - 3 || y >= MAP - 3) continue;
          const a = Math.atan2(y + 0.5 - py, x + 0.5 - px);
          const rr = r * (1 + 0.18 * Math.sin(a * 2 + ph[0]) + 0.12 * Math.sin(a * 3 + ph[1]) + 0.08 * Math.sin(a * 5 + ph[2]));
          if (Math.hypot(x + 0.5 - px, y + 0.5 - py) < rr) this.ground[y * MAP + x] = T.WATER;
        }
      }
      made++;
    }
    // Sandy shores, roads and the camp yard
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const i = y * MAP + x;
        if (this.ground[i] === T.WATER) continue;
        let nearWater = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.groundAt(x + dx, y + dy) === T.WATER) nearWater = true;
        if (nearWater) this.ground[i] = T.SAND;
        if (onPath(x, y)) this.ground[i] = T.PATH;
        if (campD(x, y) < 4.6) this.ground[i] = T.DIRT;
      }
    }

    // Trees, rocks and friends
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const i = y * MAP + x;
        this.variant[i] = (rnd() * 6) | 0;
        if (x < 2 || y < 2 || x >= MAP - 2 || y >= MAP - 2) { this.obj[i] = rnd() < 0.55 ? O.PINE : O.OAK; continue; }
        if (this.ground[i] !== T.GRASS || campD(x, y) < 8.5) continue;
        if (Math.abs(x + 0.5 - this.cx) < 2 || Math.abs(y + 0.5 - this.cy) < 2) continue;
        const r = rnd();
        if (r < 0.035) this.obj[i] = O.OAK;
        else if (r < 0.06) this.obj[i] = O.PINE;
        else if (r < 0.072) this.obj[i] = O.ROCK;
        else if (r < 0.1) this.obj[i] = O.BUSH;
        else if (r < 0.105) this.obj[i] = O.STUMP;
        else if (r < 0.11) this.obj[i] = O.MUSHROOM;
      }
    }

    // Camp: campfire, a cottage with a fenced front yard, barrels and the merchant's stall
    this.set(c, c, O.FIRE);
    const hx = c - 6, hy = c - 6; // the cottage's door tile (bottom middle)
    for (let y = hy - 2; y <= hy + 2; y++) for (let x = hx - 3; x <= hx + 3; x++) {
      if (this.inMap(x, y)) { this.obj[y * MAP + x] = O.NONE; if (this.ground[y * MAP + x] === T.WATER) this.ground[y * MAP + x] = T.GRASS; }
    }
    for (let y = hy - 1; y <= hy; y++) for (let x = hx - 1; x <= hx + 1; x++) this.set(x, y, O.PART);
    this.set(hx, hy, O.HOUSE);
    for (let x = hx - 3; x <= hx + 3; x++) if (x !== hx) this.set(x, hy + 2, O.FENCE);
    this.set(hx + 2, hy, O.BARREL);
    this.set(hx + 3, hy, O.BARREL);
    this.merchant = { x: this.cx + 3.5, y: this.cy + 2.2 };
    this.set(Math.floor(this.merchant.x), Math.floor(this.merchant.y), O.STALL);
    // The Reboot Van parks on the other side of the fire (only drawn in Reboot Van mode).
    this.van = { x: this.cx - 4.2, y: this.cy + 2.6 };
  }

  inMap(x, y) { return x >= 0 && y >= 0 && x < MAP && y < MAP; }
  groundAt(x, y) { return this.inMap(x, y) ? this.ground[y * MAP + x] : T.GRASS; }
  set(x, y, o) { this.obj[y * MAP + x] = o; }
  objAt(tx, ty) { return this.obj[ty * MAP + tx]; }

  blocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return true;
    const i = ty * MAP + tx;
    return this.ground[i] === T.WATER || SOLID.has(this.obj[i]);
  }

  solidAt(x, y) { return this.blocked(Math.floor(x), Math.floor(y)); }

  // Entities collide with their feet, so the box is flatter than it is wide.
  hit(x, y, r) {
    return this.solidAt(x - r, y - r * 0.5) || this.solidAt(x + r, y - r * 0.5) ||
      this.solidAt(x - r, y + r * 0.5) || this.solidAt(x + r, y + r * 0.5);
  }

  // Move an entity with axis-separated collision so it slides along walls.
  move(e, dx, dy, r) {
    const nx = e.x + dx;
    if (!this.hit(nx, e.y, r)) e.x = nx;
    const ny = e.y + dy;
    if (!this.hit(e.x, ny, r)) e.y = ny;
  }

  inCamp(x, y) { return Math.hypot(x - this.cx, y - this.cy) < this.campR; }

  // A free spot around the campfire for (re)spawning players.
  campSpot(i) {
    const a = (i * 2.4) % (Math.PI * 2);
    for (let r = 2; r < 5; r += 0.5) {
      const x = this.cx + Math.cos(a) * r, y = this.cy + Math.sin(a) * r;
      if (!this.hit(x, y, 0.3)) return { x, y };
    }
    return { x: this.cx + 2, y: this.cy + 2 };
  }
}
