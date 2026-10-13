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
export const REBOOT_TIME = 4; // seconds someone has to stay by the Reboot Van to reboot a player
export const VAN_REACH = 2.8; // how close counts as "at the van" (from any side; the van is solid)
export const REVIVE_MODES = ['classic', 'van'];

const ENEMY = {
  slime: { hp: 14, spd: 1.1, dmg: 8, r: 0.35, xp: 1, minWave: 1, weight: 10, shot: 'slime', range: 5.5, shotCd: 5, shotSpd: 4 },
  bat: { hp: 8, spd: 2.5, dmg: 5, r: 0.3, xp: 1, minWave: 2, weight: 6, fly: true, shot: 'batbolt', range: 5, shotCd: 4.5, shotSpd: 6 },
  goblin: { hp: 24, spd: 1.7, dmg: 10, r: 0.35, xp: 2, minWave: 3, weight: 6, melee: true },
  skeleton: { hp: 42, spd: 1.3, dmg: 14, r: 0.38, xp: 3, minWave: 5, weight: 5, melee: true },
  ghost: { hp: 30, spd: 1.5, dmg: 12, r: 0.35, xp: 3, minWave: 7, weight: 4, fly: true, shot: 'wisp', range: 6.5, shotCd: 4, shotSpd: 4.5 },
  imp: { hp: 26, spd: 1.4, dmg: 8, r: 0.35, xp: 3, minWave: 9, weight: 3, ranged: true },
  shroomling: { hp: 34, spd: 1.2, dmg: 10, r: 0.35, xp: 2, minWave: 4, weight: 5, shot: 'spore', range: 6, shotCd: 4, shotSpd: 4.5 },
  golem: { hp: 160, spd: 0.75, dmg: 22, r: 0.6, xp: 8, minWave: 8, weight: 2, shot: 'rock', range: 7, shotCd: 5, shotSpd: 4.2 },
  ogre: { hp: 450, spd: 1.25, dmg: 25, r: 0.8, xp: 40, boss: true },
};
export const ENEMY_TYPES = Object.keys(ENEMY);
export const PROJ_KINDS = ['bolt', 'fire', 'plasma', 'slime', 'spore', 'batbolt', 'rock', 'wisp'];
// Monster attacks: melee monsters (goblin, skeleton) stop and swing, landing the hit
// MELEE_HIT seconds in if you're still in reach; shooters pause to fire their
// projectile, which leaves SHOOT_FIRE seconds into the SHOOT_TIME-long attack.
export const MELEE_TIME = 0.55, MELEE_HIT = 0.3, MELEE_REACH = 0.85;
export const SHOOT_TIME = 0.45, SHOOT_FIRE = 0.25;
export const PICKUP_KINDS = ['xp', 'xp2', 'xp3', 'coin', 'heart', 'gsword'];

// Sword stats by level (1-5): reach in tiles, damage multiplier, seconds between swings.
export const swordReach = (L) => 1.6 + 0.3 * ((L || 1) - 1);
export const slashCooldown = (L) => SLASH_CD - 0.03 * ((L || 1) - 1);
// Giant Sword power-up: a huge blade spins around you for a few seconds.
export const GIANT_TIME = 5;
// The Ogre King's ground smash: how long it takes, when in it the club lands, and its reach
export const SMASH_TIME = 1.2, SMASH_HIT = 0.75, SMASH_R = 2.8; // the club lands on the 4th of 9 frames
export const CHARGE_TIME = 0.7;
// Mystery Box: spend gold, it spins, and out comes the Giant Sword.
export const BOX_COST = 30;
export const BOX_SPIN = 3;       // seconds from opening the box to the prize
export const BOX_SWORD = 10;     // seconds of Giant Sword it gives
export const BOX_CLAIM = 8;      // seconds the prize hovers (sinking) before it's gone
// What the Mystery Box can give (equal odds), in the order of the box art's frames.
// Each is a power-up that lasts t seconds.
export const POWERS = [
  { k: 'sword', name: 'Hero Sword', desc: 'Double damage, longer slashes', t: 15, c: '#f8d838' },
  { k: 'axe', name: 'Battle Axe', desc: 'Slashes hit all around you', t: 12, c: '#f84838' },
  { k: 'hammer', name: 'Thunder Hammer', desc: 'Slams the ground, knocking monsters back', t: 12, c: '#58b8f8' },
  { k: 'scythe', name: 'Reaper Scythe', desc: 'Wide slashes; kills heal you', t: 15, c: '#c048f0' },
  { k: 'blaster', name: 'Plasma Blaster', desc: 'Rapid-fire piercing plasma', t: 10, c: '#48e8f8' },
  { k: 'giant', name: 'Giant Sword', desc: 'An absurdly long spinning blade', t: BOX_SWORD, c: '#f8f0c0' },
];
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
    // How downed players come back: 'classic' (stand next to them) or 'van'
    // (carry their player card to the Reboot Van).
    const rules = save.rules || {};
    this.rules = { revive: REVIVE_MODES.includes(rules.revive) ? rules.revive : 'classic' };
    this.cards = new Map(); // downed player id -> { x, y, carrier, boot }
    if (this.rules.revive === 'van') this.world.setVan(true);
    // Test Arena: a sandbox where monsters only come when someone spawns them
    this.arena = !!save.arena;
    if (this.arena) this.phase = 'arena';
    // Mystery Box: who spun it, 'spin' (spinning) or 'ready' (prize waiting to be
    // taken, sinking back into the box), and seconds left in that stage.
    this.box = { user: null, stage: '', t: 0 };
  }

  emit(e) { this.events.push(e); }

  // Everyone actually playing (people who joined mid-wave wait until it's over).
  party() { return [...this.players.values()].filter((p) => !p.waiting); }

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
    const others = this.party().length;
    this.players.set(id, p);
    this.storePlayer(p);
    if (this.phase === 'wave' && others) {
      // Don't drop someone into the middle of a fight: they jump in once the wave is over.
      p.waiting = true;
      this.emit({ k: 'msg', m: `${p.name} is here and will join when this wave is over` });
    } else this.bringIn(p);
    return p;
  }

  // A player joins the party: they catch up to the party's level and get to pick
  // an upgrade for every level they missed.
  bringIn(p) {
    const wasWaiting = p.waiting;
    p.waiting = false;
    const target = Math.max(0, ...this.party().filter((o) => o !== p).map((o) => o.level));
    let msg = `${p.name} joined the party`;
    if (p.level < target) {
      p.pendingLevels += target - p.level;
      p.level = target; p.xp = 0; p.xpNext = xpFor(target);
      msg += ` and caught up to level ${target}`;
      this.emit({ k: 'lvl', id: p.id });
    }
    this.recalc(p);
    p.hp = p.maxHp;
    if (p.pendingLevels > 0 && !p.choices.length && this.phase !== 'wave') this.rollChoices(p);
    if (wasWaiting) {
      const s = this.world.campSpot(this.players.size);
      this.teleport(p, s.x, s.y);
    }
    this.emit({ k: 'msg', m: msg + '!' });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.storePlayer(p);
    this.players.delete(id);
    this.cards.delete(id);
    for (const c of this.cards.values()) if (c.carrier === id) this.dropCard(c, p);
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
    if (!p || p.waiting || inp.tpn !== p.tpn) return; // ignore stale positions from before a teleport
    if (!p.dead && Number.isFinite(inp.x) && Number.isFinite(inp.y)) {
      p.x = Math.max(1, Math.min(MAP - 1, inp.x));
      p.y = Math.max(1, Math.min(MAP - 1, inp.y));
    }
    // How much of the world this player's screen shows (half-size, in tiles), so
    // monsters can spawn where nobody can see them.
    if (Number.isFinite(inp.vw)) p.vw = Math.max(4, Math.min(40, inp.vw));
    if (Number.isFinite(inp.vh)) p.vh = Math.max(3, Math.min(40, inp.vh));
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
    if (!p || p.waiting) return;
    if (a === 'ready' && this.phase === 'camp') {
      p.ready = !p.ready;
    } else if (a === 'pick') {
      this.pick(p, v | 0);
    } else if (a === 'buy') {
      this.buy(p, v);
    } else if (a === 'box') {
      this.spinBox(p);
    } else if (a === 'arena' && this.arena && v && typeof v === 'object') {
      this.arenaCmd(p, v);
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

  // Test Arena tools (anyone in the arena can use them).
  arenaCmd(p, v) {
    const say = (m) => this.emit({ k: 'msg', m: `${p.name} ${m}` });
    const name = (t) => ({ imp: 'Devil', ogre: 'Ogre King' }[t] || t[0].toUpperCase() + t.slice(1));
    switch (v.c) {
      case 'spawn': {
        if (!ENEMY_TYPES.includes(v.t)) return;
        const n = Math.max(1, Math.min(10, v.n | 0));
        for (let i = 0; i < n; i++) {
          let x = p.x, y = p.y;
          for (let tries = 0; tries < 12; tries++) {
            const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 2.5;
            x = Math.max(2.6, Math.min(MAP - 2.6, p.x + Math.cos(a) * d)); y = Math.max(2.6, Math.min(MAP - 2.6, p.y + Math.sin(a) * d));
            if (!this.world.hit(x, y, ENEMY[v.t].r)) break;
          }
          this.spawnEnemy(v.t, { x, y });
        }
        say(`spawned ${n} ${name(v.t)}${n > 1 ? 's' : ''}`);
        break;
      }
      case 'clear': this.enemies = []; this.projs = this.projs.filter((q) => !q.enemy); say('cleared the monsters'); break;
      case 'gold': p.gold += 100; say('took 100 gold'); break;
      case 'level':
        p.level++; p.xp = 0; p.xpNext = xpFor(p.level); p.pendingLevels++;
        if (!p.choices.length) this.rollChoices(p);
        this.emit({ k: 'lvl', id: p.id });
        break;
      case 'power': {
        const pw = POWERS[v.k | 0];
        if (!pw) return;
        if (pw.k === 'giant') p.giantT = Math.min(BOX_SWORD * 2, (p.giantT || 0) + BOX_SWORD);
        else { p.pw = pw.k; p.pwT = pw.t; }
        say(`took the ${pw.name}`);
        break;
      }
      case 'heal': if (p.dead) this.revive(p, 1); else p.hp = p.maxHp; break;
      case 'god': p.god = !p.god; say(p.god ? 'is now invincible' : 'is no longer invincible'); break;
      case 'down': p.god = false; p.inv = 0; p.dash = false; this.hurtPlayer(p, 1e6); break;
      case 'wave': this.wave = Math.max(1, Math.min(50, this.wave + (v.d > 0 ? 1 : -1))); say(`set the monster level to ${this.wave}`); break;
      case 'mode':
        this.rules.revive = this.rules.revive === 'van' ? 'classic' : 'van';
        this.world.setVan(this.rules.revive === 'van');
        for (const pl of this.players.values()) if (pl.dead) this.revive(pl, 1);
        say(`switched reviving to ${this.rules.revive === 'van' ? 'Reboot Van' : 'Revive in Place'}`);
        break;
    }
  }

  // Mystery Box weapons that work on their own.
  powerTick(p, dt) {
    const cd = p.cd;
    if (p.pw === 'hammer') {
      // Thunder Hammer: slam the ground, hurting and knocking back everything close
      cd.hammer = (cd.hammer || 0) - dt;
      if (cd.hammer > 0) return;
      cd.hammer = 0.8;
      const R = 3.2, dmg = (16 + 4 * p.level) * p.dmgMul;
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rx = e.x - p.x, ry = e.y - p.y, d = Math.hypot(rx, ry);
        if (d > R + e.r) continue;
        hit = true;
        this.hitEnemy(e, dmg, p);
        if (!e.boss && !e.dead) {
          const push = 1.1 / (d || 1);
          if (ENEMY[e.type].fly) { e.x += rx * push; e.y += ry * push; } else this.world.move(e, rx * push, ry * push, e.r * 0.7);
        }
      }
      if (hit) this.emit({ k: 'quake', id: p.id, x: r2(p.x), y: r2(p.y), r: R });
      else cd.hammer = 0.1;
    } else if (p.pw === 'blaster') {
      // Plasma Blaster: rapid piercing shots at the nearest monster
      cd.plasma = (cd.plasma || 0) - dt;
      if (cd.plasma > 0) return;
      const target = this.nearestEnemy(p.x, p.y, 10);
      if (!target) { cd.plasma = 0.1; return; }
      cd.plasma = 0.18;
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      this.projs.push({
        id: this.nid++, kind: 'plasma', x: p.x, y: p.y, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14,
        dmg: (10 + 3 * p.level) * p.dmgMul, pierce: 3, life: 0.9, hit: new Set(), by: p,
      });
      this.emit({ k: 'sfx', s: 'shoot', id: p.id });
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
    // Mystery Box weapons change the slash: reach, damage, how wide it sweeps, knockback
    const pw = p.pw;
    const reach = { sword: 0.8, axe: 0.5, scythe: 0.7 }[pw] || 0;
    const mul = { sword: 2, axe: 1.8, scythe: 1.5 }[pw] || 1;
    const arc = pw === 'axe' ? 2 : pw === 'scythe' ? 0.6 : -0.25; // how far behind you it reaches (axe: all round)
    const R = swordReach(L) + reach, dmg = (14 + 3 * p.level) * (1 + 0.25 * (L - 1)) * p.dmgMul * mul;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const d = Math.hypot(rx, ry);
      if (d > R + e.r || rx * dx + ry * dy < -arc * d) continue;
      this.hitEnemy(e, dmg, p);
      if (!e.boss && !e.dead) {
        const push = (pw === 'axe' ? 0.9 : 0.5) / (d || 1);
        if (ENEMY[e.type].fly) { e.x += rx * push; e.y += ry * push; } else this.world.move(e, rx * push, ry * push, e.r * 0.7);
      }
    }
    this.emit({ k: 'slash', id: p.id, x: r2(p.x), y: r2(p.y), a: r2(Math.atan2(dy, dx)), r: r2(R), w: pw || undefined });
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

  // Press once to spin (costs gold); once the prize shows, press again to take it.
  spinBox(p) {
    const b = this.world.box, box = this.box;
    if (p.dead || Math.hypot(p.x - b.x, p.y - b.y) > 2.2) return;
    if (box.stage === 'ready' && box.user === p.id) {
      const pw = POWERS[box.prize];
      box.user = null; box.stage = ''; box.t = 0;
      if (pw.k === 'giant') {
        p.giantT = Math.min(BOX_SWORD * 2, (p.giantT || 0) + BOX_SWORD);
        this.emit({ k: 'giant', id: p.id, m: `${p.name} took the GIANT SWORD from the Mystery Box!` });
      } else {
        p.pw = pw.k; p.pwT = pw.t;
        this.emit({ k: 'power', id: p.id, p: box.prize, m: `${p.name} took the ${pw.name.toUpperCase()} from the Mystery Box!` });
      }
      return;
    }
    if (box.stage || p.gold < BOX_COST) return;
    p.gold -= BOX_COST;
    box.user = p.id; box.stage = 'spin'; box.t = BOX_SPIN;
    box.prize = (Math.random() * POWERS.length) | 0;
    this.emit({ k: 'box', id: p.id, m: `${p.name} spins the Mystery Box...` });
  }

  updateBox(dt) {
    const box = this.box;
    if (!box.stage) return;
    box.t -= dt;
    if (box.t > 0) return;
    if (box.stage === 'spin') {
      box.stage = 'ready'; box.t = BOX_CLAIM;
      this.emit({ k: 'box', id: box.user, ready: 1, p: box.prize });
    } else {
      const p = this.players.get(box.user);
      box.user = null; box.stage = '';
      this.emit({ k: 'msg', m: `The ${POWERS[box.prize].name} sank back into the Mystery Box${p ? ` (${p.name} didn't take it)` : ''}.` });
    }
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
    for (const p of this.party()) {
      p.xp += v;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = xpFor(p.level);
        p.pendingLevels++;
        this.emit({ k: 'lvl', id: p.id });
      }
      // upgrades are picked between waves: during one, level-ups just add up
      if (p.pendingLevels > 0 && !p.choices.length && this.phase !== 'wave') this.rollChoices(p);
    }
  }

  // Wave over: everyone picks the upgrades they earned (the next wave waits for them).
  offerUpgrades() {
    for (const p of this.party()) if (p.pendingLevels > 0 && !p.choices.length) this.rollChoices(p);
  }

  hurtPlayer(p, dmg) {
    if (p.dead || p.inv > 0 || p.dash || p.god) return;
    p.hp -= dmg;
    p.inv = 0.5;
    this.emit({ k: 'hurt', id: p.id });
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.reviveP = 0;
      if (this.rules.revive === 'van') {
        // Drop their player card; carried cards fall where they went down.
        this.cards.set(p.id, { x: p.x, y: p.y, carrier: null, boot: 0 });
        for (const c of this.cards.values()) if (c.carrier === p.id) this.dropCard(c, p);
        this.emit({ k: 'down', id: p.id, m: `${p.name} is down! Grab their card and take it to the Reboot Van.` });
      } else this.emit({ k: 'down', id: p.id, m: `${p.name} is down! Stand next to them to revive.` });
    }
  }

  dropCard(c, at) {
    c.carrier = null; c.boot = 0; c.x = at.x; c.y = at.y;
  }

  revive(p, frac) {
    this.cards.delete(p.id);
    p.dead = false; p.hp = Math.ceil(p.maxHp * frac); p.inv = 1.5; p.reviveP = 0;
    this.emit({ k: 'revive', id: p.id });
  }

  // ------------------------------------------------------------ waves

  startWave() {
    const n = Math.max(1, this.party().length);
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
    for (const p of this.party()) {
      p.gold += 4 + w * 2;
      if (p.dead) this.revive(p, 0.3);
    }
    for (const p of this.players.values()) if (p.waiting) this.bringIn(p);
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
      this.emit({ k: 'clear', w, m: `Wave ${w} cleared! +${4 + w * 2} gold. The monsters grow stronger...` });
    }
    this.offerUpgrades();
    this.onSave?.();
  }

  wipe() {
    this.wave = this.save.checkpoint || 1;
    this.phase = 'camp';
    this.enemies = []; this.projs = []; this.pickups = [];
    let i = 0;
    for (const p of this.players.values()) {
      if (p.waiting) { this.bringIn(p); continue; }
      this.revive(p, 1);
      const s = this.world.campSpot(i++);
      this.teleport(p, s.x, s.y);
      p.ready = false;
    }
    this.offerUpgrades();
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

  spawnEnemy(type, at = null) {
    const def = ENEMY[type];
    const { x, y } = at || this.spawnSpot(def.r);
    const n = Math.max(1, this.party().length);
    const L = this.wave - 1; // monsters level up with every wave
    const hpMul = (1 + 0.3 * L) * (1 + 0.5 * (n - 1));
    const hp = Math.round(def.hp * hpMul);
    this.enemies.push({
      id: this.nid++, type, x, y, hp, maxHp: hp,
      spd: def.spd * (1 + Math.min(0.4, this.wave * 0.015)),
      dmg: Math.round(def.dmg * (1 + 0.13 * L)),
      r: def.r, dir: 1, flash: 0, cd: 2 + Math.random() * 2, charge: 0, cvx: 0, cvy: 0,
      boss: !!def.boss, dead: false, auraT: 0, bladeT: 0,
    });
  }

  // Somewhere just off every player's screen (never on top of anyone), and not in a
  // wall or the camp.
  spawnSpot(r) {
    const alive = this.party().filter((p) => !p.dead);
    const lo = 2.6, hi = MAP - 2.6;
    // what each player can see, plus a margin (things stand up, and the camera lags a bit)
    const views = alive.map((p) => ({ x: p.x, y: p.y, w: (p.vw || 13) + 1.5, h: (p.vh || 8) + 2.5 }));
    const seen = (x, y) => views.some((v) => Math.abs(x - v.x) < v.w && Math.abs(y - v.y) < v.h);
    const near = (x, y) => alive.some((p) => Math.hypot(p.x - x, p.y - y) < 6);
    const good = (x, y) => !seen(x, y) && !near(x, y) && !this.world.hit(x, y, r) && !this.world.inCamp(x, y);
    // Try just outside a random player's view, so monsters arrive from off-screen
    // close enough to join the fight quickly.
    for (let tries = 0; tries < 30 && views.length; tries++) {
      const v = views[(Math.random() * views.length) | 0];
      const a = Math.random() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const edge = Math.min(Math.abs(c) > 1e-3 ? v.w / Math.abs(c) : 1e9, Math.abs(s) > 1e-3 ? v.h / Math.abs(s) : 1e9);
      const d = edge + 0.5 + Math.random() * 3;
      const x = Math.max(lo, Math.min(hi, v.x + c * d)), y = Math.max(lo, Math.min(hi, v.y + s * d));
      if (good(x, y)) return { x, y };
    }
    // Otherwise anywhere on the map nobody can see.
    let best = null, bestD = -1;
    for (let tries = 0; tries < 60; tries++) {
      const x = lo + Math.random() * (hi - lo), y = lo + Math.random() * (hi - lo);
      if (good(x, y)) return { x, y };
      if (this.world.hit(x, y, r)) continue;
      const d = Math.min(...alive.map((p) => Math.hypot(p.x - x, p.y - y)), 99);
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
    return best || { x: lo, y: lo };
  }

  hitEnemy(e, dmg, by) {
    if (e.dead) return;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 0.12;
    this.emit({ k: 'dmg', x: r2(e.x), y: r2(e.y), v: dmg });
    if (e.hp <= 0) {
      this.killEnemy(e);
      if (by && by.pw === 'scythe' && !by.dead) by.hp = Math.min(by.maxHp, by.hp + 4); // the Reaper Scythe heals on kills
    }
  }

  killEnemy(e) {
    e.dead = true;
    this.save.kills = (this.save.kills || 0) + 1;
    const def = ENEMY[e.type];
    this.emit({ k: 'die', x: r2(e.x), y: r2(e.y), t: e.type, d: e.dir });
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
    const all = this.party();
    // Level-up time. During a wave the whole world waits until every player has picked
    // their upgrade; between waves nobody is paused, the next wave just waits for them.
    // (The shop doesn't pause anything: only the shopper sees it.)
    const picking = all.filter((p) => p.choices.length);
    if (picking.length) {
      if (!this.picking) { this.picking = true; this.pickT = PICK_TIME; }
      this.pickT -= dt;
      if (this.pickT <= 0) {
        for (const p of picking) this.pick(p, (Math.random() * p.choices.length) | 0);
        this.pickT = PICK_TIME;
      }
      if (this.phase === 'wave') { this.paused = true; return; }
    } else this.picking = false;
    if (this.paused) {
      this.paused = false;
      for (const p of all) p.inv = Math.max(p.inv, 1); // a moment to react when play resumes
    }
    this.t += dt;
    const alive = all.filter((p) => !p.dead);

    // Phase logic
    if (this.phase === 'camp') {
      if (all.length && all.every((p) => p.ready) && !picking.length) this.startWave();
    } else if (this.phase === 'rest') {
      if (!picking.length) this.phaseT -= dt;
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
    } else if (this.phase === 'arena' && all.length && !alive.length) {
      // everyone down in the arena: back on your feet at camp, no harm done
      let i = 0;
      for (const p of all) { this.revive(p, 1); const s = this.world.campSpot(i++); this.teleport(p, s.x, s.y); }
      this.emit({ k: 'msg', m: 'Everyone went down: back to camp. (Test Arena)' });
    }

    this.updatePlayers(dt, all, alive);
    this.updateEnemies(dt, alive);
    this.updateProjectiles(dt, alive);
    this.updatePickups(dt, alive);
    if (this.cards.size) this.updateCards(dt, alive);
    this.updateBox(dt);

    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.phase === 'wave' && this.spawnLeft === 0 && this.enemies.length === 0) this.waveCleared();
  }

  updatePlayers(dt, all, alive) {
    const world = this.world;
    const fighting = this.enemies.length > 0;
    for (const p of all) {
      p.inv = Math.max(0, p.inv - dt);
      if (p.dead) {
        if (this.rules.revive === 'van') continue; // they come back at the Reboot Van instead
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
      if (p.pw) {
        p.pwT -= dt;
        if (p.pwT <= 0) { p.pw = null; p.pwT = 0; }
        else if (fighting) this.powerTick(p, dt);
      }
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
            e.cd = 2.4; e.shotAt = this.t;
            this.projs.push({ id: this.nid++, kind: 'fire', x: e.x, y: e.y, vx: ux * 4.5, vy: uy * 4.5, dmg: e.dmg + 4, life: 2.5, enemy: true });
          }
        } else if (e.boss) {
          e.cd -= dt;
          e.smashCd = (e.smashCd ?? 2) - dt;
          if (e.smash > 0) {
            // Ground smash: stand still, raise the club, slam it down on everyone close
            e.smash -= dt;
            if (!e.smashHit && e.smash <= SMASH_HIT) {
              e.smashHit = true;
              for (const p of alive) if (Math.hypot(p.x - e.x, p.y - e.y) < SMASH_R) this.hurtPlayer(p, Math.round(e.dmg * 1.5));
              this.emit({ k: 'quake', x: r2(e.x), y: r2(e.y), r: SMASH_R });
            }
          } else if (e.charge > 0) {
            e.charge -= dt; mx = e.cvx; my = e.cvy;
          } else if (e.smashCd <= 0 && d < 2.6) {
            e.smash = SMASH_TIME; e.smashHit = false; e.smashCd = 4.5;
            this.emit({ k: 'sfx', s: 'roar' });
          } else {
            mx = ux; my = uy;
            if (e.cd <= 0 && d < 8) { e.charge = CHARGE_TIME; e.cvx = ux * 4; e.cvy = uy * 4; e.cd = 4.5; this.emit({ k: 'sfx', s: 'roar' }); }
          }
        } else if (def.melee) {
          // walk up, then stop and swing; the hit lands partway through
          if (e.atk > 0) {
            e.atk -= dt;
            if (!e.atkHit && e.atk <= MELEE_TIME - MELEE_HIT) {
              e.atkHit = true;
              if (d < e.r + MELEE_REACH + 0.35) this.hurtPlayer(target, e.dmg);
            }
          } else {
            mx = ux; my = uy;
            e.cd -= dt;
            if (e.cd <= 0 && d < e.r + MELEE_REACH) {
              e.atk = MELEE_TIME; e.atkHit = false; e.cd = 1.3; e.dir = ux >= 0 ? 1 : -1; mx = my = 0;
            }
          }
        } else if (def.shot) {
          // chase, and every so often stop to shoot
          if (e.atk > 0) {
            e.atk -= dt;
            if (!e.atkHit && e.atk <= SHOOT_TIME - SHOOT_FIRE) {
              e.atkHit = true;
              const v = def.shotSpd;
              this.projs.push({ id: this.nid++, kind: def.shot, x: e.x, y: e.y, vx: ux * v, vy: uy * v, dmg: Math.round(e.dmg * 0.8), life: def.range / v + 0.6, enemy: true });
            }
          } else {
            mx = ux; my = uy;
            e.cd -= dt;
            if (e.cd <= 0 && d < def.range && d > 1.5) {
              e.atk = SHOOT_TIME; e.atkHit = false; e.cd = def.shotCd * (0.8 + Math.random() * 0.4); e.dir = ux >= 0 ? 1 : -1; mx = my = 0;
            }
          }
        } else { mx = ux; my = uy; }
        // Contact damage (melee monsters hurt with their swing instead)
        if (d < e.r + 0.35 && !def.melee) this.hurtPlayer(target, e.dmg);
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
      if (Math.abs(vx) > 0.001 && !(e.atk > 0)) e.dir = vx > 0 ? 1 : -1;
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
          this.hitEnemy(e, q.dmg, q.by);
          if (--q.pierce <= 0) { q.life = 0; break; }
        }
      }
    }
    this.projs = this.projs.filter((q) => q.life > 0);
  }

  // Reboot Van: touch a downed player's card to pick it up and bring it to the van.
  // Dropping it off is enough: the van reboots them on its own while you get back to
  // fighting. A carrier who goes down drops what they carry.
  updateCards(dt, alive) {
    const van = this.world.van;
    for (const [id, c] of this.cards) {
      const p = this.players.get(id);
      if (!p || !p.dead) { this.cards.delete(id); continue; }
      if (c.atVan) {
        // it only reboots while someone stands by the van; walk away and it waits
        if (alive.some((o) => !o.dead && Math.hypot(o.x - van.x, o.y - van.y) < VAN_REACH)) c.boot += dt / REBOOT_TIME;
        if (c.boot >= 1) {
          this.revive(p, 0.5);
          const a = Math.random() * Math.PI;
          this.teleport(p, van.x + Math.cos(a) * 1.2, van.y + 0.6 + Math.sin(a) * 0.4);
          this.emit({ k: 'msg', m: `${p.name} is back from the Reboot Van!` });
        }
        continue;
      }
      let carrier = c.carrier && this.players.get(c.carrier);
      if (c.carrier && (!carrier || carrier.dead)) { this.dropCard(c, carrier || c); carrier = null; }
      if (!carrier) {
        // (alive was listed at the start of the tick: skip anyone downed since, e.g. the
        // card's owner, who is standing right on it)
        const taker = alive.find((o) => !o.dead && o.id !== id && Math.hypot(o.x - c.x, o.y - c.y) < 0.7);
        if (!taker) continue;
        c.carrier = taker.id; carrier = taker;
        this.emit({ k: 'card', id: taker.id, m: `${taker.name} picked up ${p.name}'s card` });
      }
      c.x = carrier.x; c.y = carrier.y;
      if (Math.hypot(carrier.x - van.x, carrier.y - van.y) < VAN_REACH) {
        c.atVan = true; c.carrier = null; c.boot = 0; c.x = van.x; c.y = van.y;
        this.emit({ k: 'card', id: carrier.id, m: `${carrier.name} dropped ${p.name}'s card at the van. Stay by the van to reboot them!` });
      }
    }
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
    const anyone = this.party().some((p) => !p.dead);
    const pl = [];
    for (const p of this.party()) {
      pl.push([p.id, ri(p.x), ri(p.y), p.dir, p.mv ? 1 : 0, Math.ceil(p.hp), p.maxHp, p.dead ? 1 : 0,
        p.level, p.ready ? 1 : 0, p.weapons.blades || 0, p.weapons.aura || 0, Math.round(p.reviveP * 100), p.dash ? 1 : 0, Math.ceil((p.giantT || 0) * 10),
        p.pw ? POWERS.findIndex((w) => w.k === p.pw) + 1 : 0, Math.ceil((p.pwT || 0) * 10)]);
    }
    return {
      t: 's', T: Math.round(this.t * 1000) / 1000, ph: this.phase, w: this.wave, cp: this.save.checkpoint,
      pt: Math.ceil(this.phaseT), left: this.spawnLeft + this.enemies.length, k: this.save.kills,
      pz: this.pauseInfo(),
      pl,
      en: this.enemies.map((e) => [e.id, ENEMY_TYPES.indexOf(e.type), ri(e.x), ri(e.y), e.dir, e.flash > 0 ? 1 : 0, Math.max(0, Math.ceil(e.hp)), e.maxHp, this.enemyState(e, anyone)]),
      pr: this.projs.map((q) => [q.id, PROJ_KINDS.indexOf(q.kind), ri(q.x), ri(q.y), ri(q.vx), ri(q.vy)]),
      pk: this.pickups.map((k) => [k.id, PICKUP_KINDS.indexOf(k.kind), ri(k.x), ri(k.y)]),
      rv: this.rules.revive, ar: this.arena ? 1 : 0,
      bx: this.box.stage ? [this.box.user, Math.ceil(this.box.t * 10), this.box.stage === 'ready' ? 1 : 0, this.box.prize] : 0,
      cd: [...this.cards].map(([id, c]) => [id, ri(c.x), ri(c.y), c.carrier || 0, Math.round(c.boot * 100), c.atVan ? 1 : 0]),
    };
  }

  // What a monster is doing, for its animation: 0 walking, 1 standing (nobody to chase),
  // 2 charging (Ogre King's swing), 3 ground smash, 4 shooting a fireball,
  // 5 attacking (melee swing, or stopping to shoot).
  enemyState(e, anyone) {
    if (e.smash > 0) return 3;
    if (e.charge > 0) return 2;
    if (e.shotAt !== undefined && this.t - e.shotAt < 0.45) return 4;
    if (e.atk > 0) return 5;
    return anyone ? 0 : 1;
  }

  // Who's picking a level-up (null if nobody): n = their names, t = seconds until one
  // is picked for them, p = 1 if the game is paused for it (only during a wave).
  pauseInfo() {
    const n = this.party().filter((p) => p.choices.length).map((p) => p.name);
    if (!n.length) return null;
    return { n, t: Math.max(0, Math.ceil(this.pickT)), p: this.paused ? 1 : 0 };
  }

  privateView(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      lv: p.level, xp: p.xp, xn: p.xpNext, g: p.gold, ch: p.choices, w: p.weapons, ps: p.passives,
      pm: p.perm, spd: p.spd, tpn: p.tpn, hp: Math.ceil(p.hp), mhp: p.maxHp, dead: p.dead,
      wt: !!p.waiting, pn: p.pendingLevels, god: !!p.god,
    };
  }
}
