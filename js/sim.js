// The authoritative game simulation. Only the host runs this; everyone else
// receives snapshots of it over the network.
import { World, MAP } from './world.js';
import { r2, shuffle } from './util.js';

export const WEAPONS = {
  sword: { name: 'Sword', desc: 'Longer, stronger, faster slashes' },
  bolt: { name: 'Magic Bolt', desc: 'Fires at the nearest monster' },
  blades: { name: 'Orbit Blades', desc: 'Blades spin around you' },
  aura: { name: 'Holy Aura', desc: 'Burns monsters close to you' },
  zap: { name: 'Lightning', desc: 'Strikes random monsters' },
};
export const PASSIVES = {
  might: { name: 'Might', desc: '+15% damage' },
  vital: { name: 'Vitality', desc: '+20 max HP' },
  swift: { name: 'Swift Feet', desc: '+10% move speed' },
  magnet: { name: 'Magnet', desc: '+1 pickup range' },
  regen: { name: 'Regen', desc: '+0.6 HP per second' },
};
export const SHOP = [
  { id: 'power', name: 'Power Crystal', desc: '+5% damage, forever', base: 30, step: 25, max: 10 },
  { id: 'heart', name: 'Heart Gem', desc: '+10 max HP, forever', base: 25, step: 20, max: 10 },
  { id: 'boots', name: 'Wind Boots', desc: '+4% speed, forever', base: 25, step: 20, max: 10 },
  { id: 'potion', name: 'Potion', desc: 'Heal to full HP', base: 15, step: 0, max: Infinity },
];
export const MAX_LEVEL = 5;
export const SLASH_CD = 0.35;
export const PICK_TIME = 30; // seconds everyone gets to choose a level-up before one is picked for them
export const SHOP_TIME = 45; // seconds someone can keep the shop (and the game) paused

const ENEMY = {
  slime: { hp: 14, spd: 1.1, dmg: 8, r: 0.35, xp: 1, minWave: 1, weight: 10 },
  bat: { hp: 8, spd: 2.5, dmg: 5, r: 0.3, xp: 1, minWave: 2, weight: 6, fly: true },
  goblin: { hp: 24, spd: 1.7, dmg: 10, r: 0.35, xp: 2, minWave: 3, weight: 6 },
  skeleton: { hp: 42, spd: 1.3, dmg: 14, r: 0.38, xp: 3, minWave: 5, weight: 5 },
  ghost: { hp: 30, spd: 1.5, dmg: 12, r: 0.35, xp: 3, minWave: 7, weight: 4, fly: true },
  imp: { hp: 26, spd: 1.4, dmg: 8, r: 0.35, xp: 3, minWave: 9, weight: 3, ranged: true },
  ogre: { hp: 450, spd: 1.25, dmg: 25, r: 0.8, xp: 40, boss: true },
};
export const ENEMY_TYPES = Object.keys(ENEMY);
export const PROJ_KINDS = ['bolt', 'fire'];
export const PICKUP_KINDS = ['xp', 'xp2', 'xp3', 'coin', 'heart', 'gsword'];

// Sword stats by level (1-5): reach in tiles, damage multiplier, seconds between swings.
export const swordReach = (L) => 1.6 + 0.3 * ((L || 1) - 1);
export const slashCooldown = (L) => SLASH_CD - 0.03 * ((L || 1) - 1);
// Giant Sword power-up: a huge blade spins around you for a few seconds.
export const GIANT_TIME = 5;
export const GIANT_LEN = 9;      // absurdly long, in tiles
export const GIANT_WIDTH = 0.6;  // half-width of the blade's hit area, in tiles
export const GIANT_SPIN = 5;     // radians per second
export const giantAngle = (t) => t * GIANT_SPIN;

const BASE_SPEED = 3.2;
const MAX_ENEMIES = 170;
const MAX_PICKUPS = 260;

export const xpFor = (lvl) => 6 + Math.floor(lvl * lvl * 0.9) + lvl * 3;

// Orbit blade positions are deterministic from time so clients can draw them locally.
export function bladePositions(x, y, lvl, t) {
  const n = [0, 1, 2, 3, 3, 4][lvl] || 0;
  const out = [];
  const R = 1.4 + lvl * 0.08;
  for (let i = 0; i < n; i++) {
    const a = t * 3.5 + (i * Math.PI * 2) / n;
    out.push({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R });
  }
  return out;
}
export const auraRadius = (lvl) => (lvl ? 1.0 + lvl * 0.3 : 0);

export function newWorldSave(name) {
  return {
    id: 'w' + Date.now().toString(36),
    name: name || 'My World',
    seed: (Math.random() * 1e9) | 0,
    wave: 1, checkpoint: 1, bestWave: 0, kills: 0,
    created: Date.now(), updated: Date.now(),
    players: {},
  };
}

export class Sim {
  constructor(save) {
    this.save = save;
    this.world = new World(save.seed);
    this.players = new Map();
    this.enemies = [];
    this.projs = [];
    this.pickups = [];
    this.events = [];
    this.nid = 1;
    this.t = 0;
    this.phase = 'camp';
    this.wave = save.checkpoint || 1;
    this.phaseT = 0;
    this.spawnLeft = 0;
    this.spawnT = 0;
    this.onSave = null;
    this.paused = false;
    this.pickT = 0;
  }

  emit(e) { this.events.push(e); }

  // ------------------------------------------------------------ players

  addPlayer(id, { pid, name, look }) {
    const saved = this.save.players[pid];
    const spot = this.world.campSpot(this.players.size);
    const p = {
      id, pid, name: String(name || 'Hero').slice(0, 12), look,
      x: spot.x, y: spot.y, dir: 0, mv: false, dash: false,
      hp: 100, maxHp: 100, dead: false, inv: 0, reviveP: 0, ready: false, tpn: 0,
      level: 1, xp: 0, xpNext: xpFor(1), gold: 0,
      weapons: { sword: 1, bolt: 1 }, passives: {}, perm: {}, giantT: 0,
      choices: [], pendingLevels: 0, cd: {},
    };
    if (saved) {
      Object.assign(p, {
        level: saved.level || 1, xp: saved.xp || 0, gold: saved.gold || 0,
        weapons: { sword: 1, ...(saved.weapons || { bolt: 1 }) }, passives: { ...(saved.passives || {}) },
        perm: { ...(saved.perm || {}) }, pendingLevels: saved.pendingLevels || 0,
      });
      p.xpNext = xpFor(p.level);
    }
    this.recalc(p);
    p.hp = p.maxHp;
    if (p.pendingLevels > 0) this.rollChoices(p);
    this.players.set(id, p);
    this.storePlayer(p);
    this.emit({ k: 'msg', m: `${p.name} joined the world` });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.storePlayer(p);
    this.players.delete(id);
    this.emit({ k: 'msg', m: `${p.name} left` });
  }

  storePlayer(p) {
    this.save.players[p.pid] = {
      name: p.name, look: p.look, level: p.level, xp: p.xp, gold: p.gold,
      weapons: p.weapons, passives: p.passives, perm: p.perm,
      pendingLevels: p.pendingLevels,
    };
  }

  snapshotSave() {
    for (const p of this.players.values()) this.storePlayer(p);
    this.save.wave = this.wave;
    this.save.updated = Date.now();
    return this.save;
  }

  recalc(p) {
    const ps = p.passives, pm = p.perm;
    const oldMax = p.maxHp;
    p.maxHp = 100 + 20 * (ps.vital || 0) + 10 * (pm.heart || 0);
    if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.maxHp);
    p.spd = BASE_SPEED * (1 + 0.1 * (ps.swift || 0) + 0.04 * (pm.boots || 0));
    p.dmgMul = (1 + 0.15 * (ps.might || 0)) * (1 + 0.05 * (pm.power || 0));
    p.magnet = 1.4 + (ps.magnet || 0);
    p.regen = 0.6 * (ps.regen || 0);
  }

  setInput(id, inp) {
    const p = this.players.get(id);
    if (!p || inp.tpn !== p.tpn) return; // ignore stale positions from before a teleport
    if (!p.dead && Number.isFinite(inp.x) && Number.isFinite(inp.y)) {
      p.x = Math.max(1, Math.min(MAP - 1, inp.x));
      p.y = Math.max(1, Math.min(MAP - 1, inp.y));
    }
    p.dir = inp.dir | 0;
    p.mv = !!inp.mv;
    p.dash = !!inp.dash;
  }

  teleport(p, x, y) {
    p.x = x; p.y = y; p.tpn++;
    this.emit({ k: 'tp', id: p.id, x, y, n: p.tpn });
  }

  action(id, a, v) {
    const p = this.players.get(id);
    if (!p) return;
    if (a === 'ready' && this.phase === 'camp') {
      p.ready = !p.ready;
    } else if (a === 'pick') {
      this.pick(p, v | 0);
    } else if (a === 'buy') {
      this.buy(p, v);
    } else if (a === 'shop') {
      // Shopping pauses the world for everyone (with a time limit).
      p.shopping = !!v && !p.dead;
      p.shopT = SHOP_TIME;
    } else if (a === 'attack') {
      this.slash(p, v);
    }
  }

  // The giant blade sweeps around the player; anything it passes over gets cut.
  giantSword(p, dt) {
    // The tip moves very fast, so check everything the blade swept through since
    // last tick rather than only where it is now.
    const a1 = giantAngle(this.t), a0 = a1 - GIANT_SPIN * dt;
    const dmg = (24 + 4 * p.level) * (1 + 0.15 * ((p.weapons.sword || 1) - 1)) * p.dmgMul;
    for (const e of this.enemies) {
      if (e.dead || (e.giantHitT || 0) > this.t) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const d = Math.hypot(rx, ry);
      if (d < 0.2 || d > GIANT_LEN + e.r) continue;
      // angle of the monster relative to the blade's start angle, wrapped to [0, 2pi)
      const rel = ((Math.atan2(ry, rx) - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const pad = Math.atan2(GIANT_WIDTH + e.r, d);
      if (rel > a1 - a0 + pad && rel < Math.PI * 2 - pad) continue;
      this.hitEnemy(e, dmg);
      e.giantHitT = this.t + 0.3;
      if (!e.boss && !e.dead) {
        if (ENEMY[e.type].fly) { e.x += (rx / d) * 0.4; e.y += (ry / d) * 0.4; } else this.world.move(e, (rx / d) * 0.4, (ry / d) * 0.4, e.r * 0.7);
      }
    }
  }

  // Manual sword slash: hits every monster in an arc in front of the player.
  slash(p, v) {
    if (p.dead || (p.slashAt || 0) > this.t) return;
    let dx = Number(v && v.x) || 0, dy = Number(v && v.y) || 0;
    const l = Math.hypot(dx, dy);
    if (!l) return;
    dx /= l; dy /= l;
    const L = p.weapons.sword || 1;
    p.slashAt = this.t + slashCooldown(L) - 0.05;
    const R = swordReach(L), dmg = (14 + 3 * p.level) * (1 + 0.25 * (L - 1)) * p.dmgMul;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const d = Math.hypot(rx, ry);
      if (d > R + e.r || rx * dx + ry * dy < -0.25 * d) continue;
      this.hitEnemy(e, dmg);
      if (!e.boss && !e.dead) {
        const push = 0.5 / (d || 1);
        if (ENEMY[e.type].fly) { e.x += rx * push; e.y += ry * push; } else this.world.move(e, rx * push, ry * push, e.r * 0.7);
      }
    }
    this.emit({ k: 'slash', id: p.id, x: r2(p.x), y: r2(p.y), a: r2(Math.atan2(dy, dx)), r: r2(R) });
  }

  rollChoices(p) {
    const opts = [];
    for (const k of Object.keys(WEAPONS)) if ((p.weapons[k] || 0) < MAX_LEVEL) opts.push({ k, t: 'w' });
    for (const k of Object.keys(PASSIVES)) if ((p.passives[k] || 0) < MAX_LEVEL) opts.push({ k, t: 'p' });
    shuffle(opts);
    p.choices = opts.slice(0, 3).map((o) => {
      const def = o.t === 'w' ? WEAPONS[o.k] : PASSIVES[o.k];
      const lvl = (o.t === 'w' ? p.weapons[o.k] || 0 : p.passives[o.k] || 0) + 1;
      return { k: o.k, t: o.t, name: def.name, desc: lvl === 1 && o.t === 'w' ? 'NEW! ' + def.desc : def.desc, lvl };
    });
    if (!p.choices.length) p.choices = [{ k: 'gold', t: 'g', name: 'Gold Pouch', desc: '+25 gold', lvl: 0 }];
  }

  pick(p, i) {
    const c = p.choices[i];
    if (!c) return;
    if (c.t === 'w') p.weapons[c.k] = (p.weapons[c.k] || 0) + 1;
    else if (c.t === 'p') p.passives[c.k] = (p.passives[c.k] || 0) + 1;
    else p.gold += 25;
    p.pendingLevels = Math.max(0, p.pendingLevels - 1);
    p.choices = [];
    this.recalc(p);
    if (p.pendingLevels > 0) this.rollChoices(p);
    this.emit({ k: 'sfx', s: 'pick', id: p.id });
  }

  shopCost(p, item) { return item.base + item.step * (p.perm[item.id] || 0); }

  buy(p, itemId) {
    const item = SHOP.find((s) => s.id === itemId);
    if (!item || p.dead) return;
    const m = this.world.merchant;
    if (Math.hypot(p.x - m.x, p.y - m.y) > 2.6) return;
    const owned = p.perm[item.id] || 0;
    const cost = this.shopCost(p, item);
    if (owned >= item.max || p.gold < cost) return;
    p.gold -= cost;
    if (item.id === 'potion') p.hp = p.maxHp;
    else p.perm[item.id] = owned + 1;
    this.recalc(p);
    this.emit({ k: 'sfx', s: 'coin', id: p.id });
  }

  gainXp(v) {
    for (const p of this.players.values()) {
      p.xp += v;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = xpFor(p.level);
        p.pendingLevels++;
        this.emit({ k: 'lvl', id: p.id });
      }
      if (p.pendingLevels > 0 && !p.choices.length) this.rollChoices(p);
    }
  }

  hurtPlayer(p, dmg) {
    if (p.dead || p.inv > 0 || p.dash) return;
    p.hp -= dmg;
    p.inv = 0.5;
    this.emit({ k: 'hurt', id: p.id });
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.reviveP = 0;
      this.emit({ k: 'down', id: p.id, m: `${p.name} is down! Stand next to them to revive.` });
    }
  }

  revive(p, frac) {
    p.dead = false; p.hp = Math.ceil(p.maxHp * frac); p.inv = 1.5; p.reviveP = 0;
    this.emit({ k: 'revive', id: p.id });
  }

  // ------------------------------------------------------------ waves

  startWave() {
    const n = Math.max(1, this.players.size);
    this.phase = 'wave';
    this.spawnLeft = Math.round((8 + this.wave * 5) * (1 + 0.4 * (n - 1)));
    this.spawnT = 1;
    for (const p of this.players.values()) p.ready = false;
    const boss = this.wave % 5 === 0;
    if (boss) {
      const count = Math.max(1, Math.floor(this.wave / 10) + (n > 2 ? 1 : 0));
      for (let i = 0; i < count; i++) this.spawnEnemy('ogre');
    }
    this.emit({ k: 'wave', w: this.wave, boss });
  }

  waveCleared() {
    const w = this.wave;
    for (const p of this.players.values()) {
      p.gold += 4 + w * 2;
      if (p.dead) this.revive(p, 0.3);
    }
    this.save.bestWave = Math.max(this.save.bestWave || 0, w);
    this.projs = this.projs.filter((q) => q.kind !== 'fire');
    this.wave++;
    if (w % 5 === 0) {
      this.save.checkpoint = this.wave;
      this.phase = 'camp';
      this.emit({ k: 'clear', w, m: `Boss defeated! Checkpoint saved at wave ${this.wave}. Rest at camp.` });
    } else {
      this.phase = 'rest';
      this.phaseT = 7;
      this.emit({ k: 'clear', w, m: `Wave ${w} cleared! +${4 + w * 2} gold` });
    }
    this.onSave?.();
  }

  wipe() {
    this.wave = this.save.checkpoint || 1;
    this.phase = 'camp';
    this.enemies = []; this.projs = []; this.pickups = [];
    let i = 0;
    for (const p of this.players.values()) {
      this.revive(p, 1);
      const s = this.world.campSpot(i++);
      this.teleport(p, s.x, s.y);
      p.ready = false;
    }
    this.emit({ k: 'wipe', m: `Your party fell... Back to wave ${this.wave}.` });
    this.onSave?.();
  }

  pickEnemyType() {
    const pool = ENEMY_TYPES.filter((t) => !ENEMY[t].boss && ENEMY[t].minWave <= this.wave);
    let total = 0;
    for (const t of pool) total += ENEMY[t].weight;
    let r = Math.random() * total;
    for (const t of pool) { r -= ENEMY[t].weight; if (r <= 0) return t; }
    return pool[0];
  }

  spawnEnemy(type) {
    const alive = [...this.players.values()].filter((p) => !p.dead);
    const anchor = alive[(Math.random() * alive.length) | 0] || { x: this.world.cx, y: this.world.cy };
    const def = ENEMY[type];
    let x = 0, y = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = 11 + Math.random() * 4;
      x = Math.max(2.6, Math.min(MAP - 2.6, anchor.x + Math.cos(a) * d));
      y = Math.max(2.6, Math.min(MAP - 2.6, anchor.y + Math.sin(a) * d));
      if (!this.world.hit(x, y, def.r) && !this.world.inCamp(x, y)) break;
    }
    const n = Math.max(1, this.players.size);
    const hpMul = (1 + 0.2 * (this.wave - 1)) * (1 + 0.5 * (n - 1));
    const hp = Math.round(def.hp * hpMul);
    this.enemies.push({
      id: this.nid++, type, x, y, hp, maxHp: hp,
      spd: def.spd * (1 + Math.min(0.4, this.wave * 0.015)),
      dmg: Math.round(def.dmg * (1 + 0.08 * (this.wave - 1))),
      r: def.r, dir: 1, flash: 0, cd: 2 + Math.random() * 2, charge: 0, cvx: 0, cvy: 0,
      boss: !!def.boss, dead: false, auraT: 0, bladeT: 0,
    });
  }

  hitEnemy(e, dmg) {
    if (e.dead) return;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 0.12;
    this.emit({ k: 'dmg', x: r2(e.x), y: r2(e.y), v: dmg });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.save.kills = (this.save.kills || 0) + 1;
    const def = ENEMY[e.type];
    this.emit({ k: 'die', x: r2(e.x), y: r2(e.y), t: e.type });
    const xp = def.xp;
    const kind = xp >= 10 ? 'xp3' : xp >= 3 ? 'xp2' : 'xp';
    this.addPickup(kind, e.x, e.y, xp);
    if (e.boss) {
      for (let i = 0; i < 15; i++) this.addPickup('coin', e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2, 3);
      this.addPickup('heart', e.x, e.y + 0.5, 40);
    } else if (Math.random() < 0.14) {
      this.addPickup('coin', e.x + 0.2, e.y, 1 + (this.wave / 6 | 0));
    } else if (Math.random() < 0.015) {
      this.addPickup('heart', e.x, e.y, 30);
    }
    // Rare Giant Sword power-up (the boss always drops one)
    if (e.boss || Math.random() < 0.012) this.addPickup('gsword', e.x - 0.4, e.y + 0.3, GIANT_TIME);
  }

  addPickup(kind, x, y, v) {
    if (this.pickups.length >= MAX_PICKUPS) {
      // Merge the oldest xp gem into the newest instead of dropping value.
      const old = this.pickups.findIndex((k) => k.kind.startsWith('xp'));
      if (old >= 0) { v += this.pickups[old].v; this.pickups.splice(old, 1); }
    }
    this.pickups.push({ id: this.nid++, kind, x, y, v, mag: false });
  }

  nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------ update

  update(dt) {
    const all = [...this.players.values()];
    // Level-up time (and shopping): the whole world waits until every player has
    // picked their upgrade and closed the shop.
    const picking = all.filter((p) => p.choices.length);
    const shopping = all.filter((p) => p.shopping);
    if (picking.length || shopping.length) {
      if (!this.paused) { this.paused = true; this.pickT = PICK_TIME; }
      if (picking.length) {
        this.pickT -= dt;
        if (this.pickT <= 0) {
          for (const p of picking) this.pick(p, (Math.random() * p.choices.length) | 0);
          this.pickT = PICK_TIME;
        }
      } else this.pickT = PICK_TIME;
      for (const p of shopping) {
        p.shopT -= dt;
        if (p.shopT <= 0) { p.shopping = false; this.emit({ k: 'msg', m: `${p.name}'s shopping time ran out` }); }
      }
      return;
    }
    if (this.paused) {
      this.paused = false;
      for (const p of all) p.inv = Math.max(p.inv, 1); // a moment to react when play resumes
    }
    this.t += dt;
    const alive = all.filter((p) => !p.dead);

    // Phase logic
    if (this.phase === 'camp') {
      if (all.length && all.every((p) => p.ready)) this.startWave();
    } else if (this.phase === 'rest') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startWave();
    } else if (this.phase === 'wave') {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.spawnLeft > 0 && this.enemies.length < MAX_ENEMIES) {
        const group = Math.min(this.spawnLeft, 2 + Math.floor(this.wave / 3));
        for (let i = 0; i < group; i++) this.spawnEnemy(this.pickEnemyType());
        this.spawnLeft -= group;
        this.spawnT = Math.max(0.4, 1.6 - this.wave * 0.05);
      }
      if (all.length && !alive.length) { this.wipe(); return; }
    }

    this.updatePlayers(dt, all, alive);
    this.updateEnemies(dt, alive);
    this.updateProjectiles(dt, alive);
    this.updatePickups(dt, alive);

    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.phase === 'wave' && this.spawnLeft === 0 && this.enemies.length === 0) this.waveCleared();
  }

  updatePlayers(dt, all, alive) {
    const world = this.world;
    const fighting = this.enemies.length > 0;
    for (const p of all) {
      p.inv = Math.max(0, p.inv - dt);
      if (p.dead) {
        const helper = alive.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < 1.4);
        if (helper) {
          p.reviveP += dt / 3;
          if (p.reviveP >= 1) { this.revive(p, 0.5); this.emit({ k: 'msg', m: `${helper.name} revived ${p.name}!` }); }
        } else p.reviveP = Math.max(0, p.reviveP - dt / 2);
        continue;
      }
      if (p.regen) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      if (this.phase !== 'wave' && world.inCamp(p.x, p.y)) p.hp = Math.min(p.maxHp, p.hp + 10 * dt);
      if (p.giantT > 0) { p.giantT = Math.max(0, p.giantT - dt); this.giantSword(p, dt); }
      if (!fighting) continue;

      const cd = p.cd;
      const w = p.weapons;
      // Magic bolt
      if (w.bolt) {
        cd.bolt = (cd.bolt || 0) - dt;
        if (cd.bolt <= 0) {
          const target = this.nearestEnemy(p.x, p.y, 9);
          if (target) {
            const L = w.bolt;
            const count = 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0);
            const base = Math.atan2(target.y - p.y, target.x - p.x);
            for (let i = 0; i < count; i++) {
              const a = base + (i - (count - 1) / 2) * 0.2;
              this.projs.push({
                id: this.nid++, kind: 'bolt', x: p.x, y: p.y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10,
                dmg: (9 + 4 * (L - 1)) * p.dmgMul, pierce: 1 + (L >= 4 ? 1 : 0), life: 1.1, hit: new Set(),
              });
            }
            cd.bolt = Math.max(0.25, 0.85 - 0.1 * (L - 1));
            this.emit({ k: 'sfx', s: 'shoot', id: p.id });
          } else cd.bolt = 0.1;
        }
      }
      // Orbit blades
      if (w.blades) {
        const dmg = (6 + 3 * w.blades) * p.dmgMul;
        for (const b of bladePositions(p.x, p.y, w.blades, this.t)) {
          for (const e of this.enemies) {
            if (e.dead || e.bladeT > this.t) continue;
            if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (0.35 + e.r) ** 2) {
              this.hitEnemy(e, dmg);
              e.bladeT = this.t + 0.35;
            }
          }
        }
      }
      // Holy aura
      if (w.aura) {
        cd.aura = (cd.aura || 0) - dt;
        if (cd.aura <= 0) {
          cd.aura = 0.5;
          const R = auraRadius(w.aura);
          for (const e of this.enemies) {
            if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (R + e.r) ** 2) this.hitEnemy(e, (3 + 2 * w.aura) * p.dmgMul);
          }
        }
      }
      // Lightning
      if (w.zap) {
        cd.zap = (cd.zap || 0) - dt;
        if (cd.zap <= 0) {
          cd.zap = 2.6 - 0.3 * w.zap;
          const strikes = 1 + (w.zap >= 3 ? 1 : 0) + (w.zap >= 5 ? 1 : 0);
          const near = this.enemies.filter((e) => !e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 49);
          shuffle(near);
          for (const e of near.slice(0, strikes)) {
            this.emit({ k: 'zap', x: r2(e.x), y: r2(e.y) });
            this.hitEnemy(e, (14 + 8 * w.zap) * p.dmgMul);
          }
        }
      }
    }
  }

  updateEnemies(dt, alive) {
    const world = this.world;
    const enemies = this.enemies;
    // Spatial hash for cheap separation between monsters
    const grid = new Map();
    for (const e of enemies) {
      const k = ((e.x | 0) << 8) | (e.y | 0);
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(e);
    }
    for (const e of enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      const def = ENEMY[e.type];
      let target = null, bd = Infinity;
      for (const p of alive) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d < bd) { bd = d; target = p; }
      }
      let mx = 0, my = 0;
      if (target) {
        const d = Math.sqrt(bd) || 1;
        const ux = (target.x - e.x) / d, uy = (target.y - e.y) / d;
        if (def.ranged) {
          if (d < 3.5) { mx = -ux; my = -uy; } else if (d > 5.5) { mx = ux; my = uy; } else { mx = -uy * 0.6; my = ux * 0.6; }
          e.cd -= dt;
          if (e.cd <= 0 && d < 9) {
            e.cd = 2.4;
            this.projs.push({ id: this.nid++, kind: 'fire', x: e.x, y: e.y, vx: ux * 4.5, vy: uy * 4.5, dmg: e.dmg + 4, life: 2.5, enemy: true });
          }
        } else if (e.boss) {
          e.cd -= dt;
          if (e.charge > 0) {
            e.charge -= dt; mx = e.cvx; my = e.cvy;
          } else {
            mx = ux; my = uy;
            if (e.cd <= 0 && d < 8) { e.charge = 0.7; e.cvx = ux * 4; e.cvy = uy * 4; e.cd = 4.5; this.emit({ k: 'sfx', s: 'roar' }); }
          }
        } else { mx = ux; my = uy; }
        // Contact damage
        if (d < e.r + 0.35) this.hurtPlayer(target, e.dmg);
      }
      // Separation
      let sx = 0, sy = 0;
      const cx = e.x | 0, cy = e.y | 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get((gx << 8) | gy);
          if (!cell) continue;
          for (const o of cell) {
            if (o === e) continue;
            const dx = e.x - o.x, dy = e.y - o.y;
            const min = e.r + o.r;
            const dd = dx * dx + dy * dy;
            if (dd < min * min && dd > 0.0001) {
              const dl = Math.sqrt(dd);
              sx += (dx / dl) * (min - dl); sy += (dy / dl) * (min - dl);
            }
          }
        }
      }
      const vx = mx * e.spd * dt + sx * 0.5, vy = my * e.spd * dt + sy * 0.5;
      // Monsters that get wedged against trees slip through them for a moment
      // (bosses always smash through), so a wave can never get stuck.
      if (def.fly || e.boss || e.slipT > 0) {
        e.slipT = Math.max(0, (e.slipT || 0) - dt);
        e.x = Math.max(1.5, Math.min(MAP - 1.5, e.x + vx));
        e.y = Math.max(1.5, Math.min(MAP - 1.5, e.y + vy));
      } else {
        const ox = e.x, oy = e.y;
        world.move(e, vx, vy, e.r * 0.7);
        const want = Math.hypot(mx, my) * e.spd * dt;
        if (want > 0 && Math.hypot(e.x - ox, e.y - oy) < want * 0.3) e.stuckT = (e.stuckT || 0) + dt;
        else e.stuckT = 0;
        if (e.stuckT > 0.8) { e.stuckT = 0; e.slipT = 1.5; }
      }
      if (Math.abs(vx) > 0.001) e.dir = vx > 0 ? 1 : -1;
    }
  }

  updateProjectiles(dt, alive) {
    for (const q of this.projs) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
      if (q.enemy) {
        for (const p of alive) {
          if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < 0.25) { this.hurtPlayer(p, q.dmg); q.life = 0; break; }
        }
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || q.hit.has(e.id)) continue;
        if ((e.x - q.x) ** 2 + (e.y - q.y) ** 2 < (0.3 + e.r) ** 2) {
          q.hit.add(e.id);
          this.hitEnemy(e, q.dmg);
          if (--q.pierce <= 0) { q.life = 0; break; }
        }
      }
    }
    this.projs = this.projs.filter((q) => q.life > 0);
  }

  updatePickups(dt, alive) {
    let changed = false;
    for (const k of this.pickups) {
      let best = null, bd = Infinity;
      for (const p of alive) {
        const d = (p.x - k.x) ** 2 + (p.y - k.y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      const d = Math.sqrt(bd);
      if (d < best.magnet || k.mag) {
        k.mag = true;
        const s = Math.min(d, (6 + 6 * (1 - d / 8)) * dt);
        k.x += ((best.x - k.x) / (d || 1)) * s;
        k.y += ((best.y - k.y) / (d || 1)) * s;
      }
      if (d < 0.45) {
        k.taken = true; changed = true;
        if (k.kind.startsWith('xp')) { this.gainXp(k.v); this.emit({ k: 'sfx', s: 'xp', id: best.id }); }
        else if (k.kind === 'coin') { best.gold += k.v; this.emit({ k: 'sfx', s: 'coin', id: best.id }); }
        else if (k.kind === 'gsword') {
          best.giantT = Math.min(GIANT_TIME * 2, (best.giantT || 0) + k.v);
          this.emit({ k: 'giant', id: best.id, m: `${best.name} grabbed the GIANT SWORD!` });
        } else if (k.kind === 'heart') { best.hp = Math.min(best.maxHp, best.hp + k.v); this.emit({ k: 'sfx', s: 'heal', id: best.id }); }
      }
    }
    if (changed) this.pickups = this.pickups.filter((k) => !k.taken);
  }

  // ------------------------------------------------------------ network views

  snapshot() {
    const ri = (v) => Math.round(v * 100);
    const pl = [];
    for (const p of this.players.values()) {
      pl.push([p.id, ri(p.x), ri(p.y), p.dir, p.mv ? 1 : 0, Math.ceil(p.hp), p.maxHp, p.dead ? 1 : 0,
        p.level, p.ready ? 1 : 0, p.weapons.blades || 0, p.weapons.aura || 0, Math.round(p.reviveP * 100), p.dash ? 1 : 0, Math.ceil((p.giantT || 0) * 10)]);
    }
    return {
      t: 's', T: Math.round(this.t * 1000) / 1000, ph: this.phase, w: this.wave, cp: this.save.checkpoint,
      pt: Math.ceil(this.phaseT), left: this.spawnLeft + this.enemies.length, k: this.save.kills,
      pz: this.pauseInfo(),
      pl,
      en: this.enemies.map((e) => [e.id, ENEMY_TYPES.indexOf(e.type), ri(e.x), ri(e.y), e.dir, e.flash > 0 ? 1 : 0, Math.max(0, Math.ceil(e.hp)), e.maxHp]),
      pr: this.projs.map((q) => [q.id, PROJ_KINDS.indexOf(q.kind), ri(q.x), ri(q.y), ri(q.vx), ri(q.vy)]),
      pk: this.pickups.map((k) => [k.id, PICKUP_KINDS.indexOf(k.kind), ri(k.x), ri(k.y)]),
    };
  }

  // Who we're waiting on while paused (null when not paused): n = picking a
  // level-up (auto-pick in t seconds), s = shopping (shop closes in st seconds).
  pauseInfo() {
    if (!this.paused) return null;
    const all = [...this.players.values()];
    const n = all.filter((p) => p.choices.length).map((p) => p.name);
    const shoppers = all.filter((p) => p.shopping);
    if (!n.length && !shoppers.length) return null;
    return {
      n, t: Math.max(0, Math.ceil(this.pickT)),
      s: shoppers.map((p) => p.name), st: Math.max(0, Math.ceil(Math.max(...shoppers.map((p) => p.shopT), 0))),
    };
  }

  privateView(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      lv: p.level, xp: p.xp, xn: p.xpNext, g: p.gold, ch: p.choices, w: p.weapons, ps: p.passives,
      pm: p.perm, spd: p.spd, tpn: p.tpn, hp: Math.ceil(p.hp), mhp: p.maxHp, dead: p.dead,
      sh: !!p.shopping, sht: Math.ceil(p.shopT || 0),
    };
  }
}
