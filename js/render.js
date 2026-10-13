// Draws the world in a top-down three-quarter view at a low resolution and
// scales it up with crisp pixels. The canvas itself is twice that resolution
// (DETAIL), so heroes can be drawn with finer pixels than the scenery.
import { TILE } from './util.js';
import { MAP, O } from './world.js';
import {
  charSprite, monsterSprite, monsterFrames, monsterAnim, animFrames, propSprite, smallSprite, giantSwordSprite,
  drawText, textWidth, drawShadow, MERCHANT_LOOK, RUN_FRAME_MS, vanSprite, boxSprite, BOX_SHAKE, BOX_OPEN, BOX_PRIZES, BOX_GIANT, BOX_BODY,
} from './sprites.js';
import { paintGround, sceneSprite, TALL } from './scenery.js';
import { bladePositions, auraRadius, giantAngle, GIANT_LEN, BOX_COST, BOX_SPIN, BOX_CLAIM, SMASH_TIME, CHARGE_TIME, VAN_REACH, MELEE_TIME, SHOOT_TIME } from './sim.js';

const BG = '#0c1a10';
const DETAIL = 2;
const ATTACK_POSE = 0.42; // seconds a sword swing lasts (wind-up, slash, follow-through)
const WIN_POSE_MS = 2000; // victory pose after a wave is cleared
// which monster's sheet has the art for each monster projectile
const SHOT_ART = { slime: 'slime', spore: 'shroomling', batbolt: 'bat', rock: 'golem', wisp: 'ghost' };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.w = 384; this.h = 216; this.scale = 3;
    this.cam = { x: 0, y: 0 };
    this.fx = [];       // floating damage numbers, particles, lightning
    this.shake = 0;
    this.groundCache = null;
    this.attackAt = new Map(); // player id -> when they last swung (performance.now)
    this.trails = new Map();   // player id -> recent dash positions, for afterimages
    this.winUntil = 0;         // victory pose until this time (performance.now)
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const s = Math.max(2, Math.round(Math.min(innerWidth / 400, innerHeight / 230)));
    this.scale = s;
    this.w = Math.ceil(innerWidth / s);
    this.h = Math.ceil(innerHeight / s);
    this.canvas.width = this.w * DETAIL;
    this.canvas.height = this.h * DETAIL;
    this.canvas.style.width = this.w * s + 'px';
    this.canvas.style.height = this.h * s + 'px';
    this.g.imageSmoothingEnabled = false;
  }

  buildGround(world) {
    if (this.groundCache && this.groundCache.world === world) return;
    this.groundCache = { world, c: paintGround(world) };
  }

  // World -> canvas pixel
  sx(x) { return Math.round(x * TILE - this.cam.x + this.w / 2); }
  sy(x, y) { return Math.round(y * TILE - this.cam.y + this.h / 2); }

  // A hero just swung their sword: show the strike pose for a moment.
  markAttack(id) { this.attackAt.set(id, performance.now()); }

  addFx(f) { this.fx.push(f); if (this.fx.length > 300) this.fx.shift(); }

  event(e, players) {
    switch (e.k) {
      case 'dmg': this.addFx({ t: 'num', x: e.x, y: e.y, v: e.v, life: 0.7, z: 0 }); break;
      case 'die':
        if (animFrames(e.t, 'die')) this.addFx({ t: 'corpse', type: e.t, d: e.d || 1, x: e.x, y: e.y, life: e.t === 'ogre' ? 3 : 1.6, max: e.t === 'ogre' ? 3 : 1.6 });
        for (let i = 0; i < 6; i++) this.addFx({ t: 'part', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, z: 6, vz: 20 + Math.random() * 20, life: 0.5, c: { slime: '#3cb83c', imp: '#d83c2c', shroomling: '#e84838', golem: '#8c8068', bat: '#7c3c6c', goblin: '#7c8c3c' }[e.t] || '#e8e8d8' });
        if (e.t === 'ogre') this.shake = 0.6;
        break;
      case 'zap': this.addFx({ t: 'zap', x: e.x, y: e.y, life: 0.25 }); break;
      case 'slash':
        this.addFx({ t: 'slash', x: e.x, y: e.y, a: e.a, r: e.r || 1.6, life: 0.16, w: e.w });
        if (e.id) this.markAttack(e.id);
        break;
      case 'hurt': {
        const p = players && players.find((pp) => pp.id === e.id);
        if (p) this.addFx({ t: 'flash', id: e.id, life: 0.2 });
        break;
      }
      case 'lvl': this.addFx({ t: 'lvl', id: e.id, life: 1.2 }); break;
      case 'clear': this.winUntil = performance.now() + WIN_POSE_MS; break; // everyone strikes the victory pose
      case 'quake': this.addFx({ t: 'quake', x: e.x, y: e.y, r: e.r, life: 0.35 }); this.shake = Math.max(this.shake, 0.12); break;
    }
  }

  draw(view, dt) {
    const g = this.g;
    g.setTransform(DETAIL, 0, 0, DETAIL, 0, 0);
    g.imageSmoothingEnabled = false;
    const { world, players, enemies, projs, pickups, me, time } = view;
    this.buildGround(world);

    // Camera follows the local player (smoothly)
    const focus = view.focus || me;
    const fx = (focus ? focus.x : world.cx) * TILE;
    const fy = (focus ? focus.y : world.cy) * TILE - 8;
    this.cam.x += (fx - this.cam.x) * Math.min(1, dt * 10);
    this.cam.y += (fy - this.cam.y) * Math.min(1, dt * 10);
    if (Math.abs(fx - this.cam.x) > 200) { this.cam.x = fx; this.cam.y = fy; }
    let shx = 0, shy = 0;
    if (this.shake > 0) { this.shake -= dt; shx = (Math.random() - 0.5) * 4; shy = (Math.random() - 0.5) * 4; }
    const camX = this.cam.x, camY = this.cam.y;
    this.cam.x += shx; this.cam.y += shy;

    g.fillStyle = BG;
    g.fillRect(0, 0, this.w, this.h);
    const gc = this.groundCache;
    g.drawImage(gc.c, Math.round(-this.cam.x + this.w / 2), Math.round(-this.cam.y + this.h / 2));

    // Auras on the ground
    for (const p of players) {
      if (p.dead || !p.au) continue;
      this.drawAura(p.x, p.y, auraRadius(p.au), time);
    }

    // Everything that stands up gets depth-sorted by where its feet are (y)
    const items = [];
    const inView = (x, y) => {
      const px = this.sx(x, y), py = this.sy(x, y);
      return px > -40 && px < this.w + 40 && py > -24 && py < this.h + 70;
    };
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const o = world.obj[y * MAP + x];
        if (!o || o === O.PART) continue;
        const cx = x + 0.5, cy = y + 0.9;
        if (!inView(cx, cy)) continue;
        items.push({ d: cy, k: 'obj', o, x: cx, y: cy, v: world.variant[y * MAP + x] });
      }
    }
    items.push({ d: world.merchant.y, k: 'merchant', x: world.merchant.x, y: world.merchant.y });
    items.push({ d: world.box.y, k: 'box', x: world.box.x, y: world.box.y });
    const cards = view.cards || [];
    const atVan = cards.filter((c) => c.atVan);
    const booting = atVan.reduce((m, c) => Math.max(m, c.boot), 0);
    // a dropped-off card only reboots while someone stands by the van
    const manned = players.some((p) => !p.dead && Math.hypot(p.x - world.van.x, p.y - world.van.y) < VAN_REACH);
    if (view.van) items.push({ d: world.van.y, k: 'van', x: world.van.x, y: world.van.y, on: atVan.length > 0 && manned });
    for (const c of cards) if (!c.carrier && !c.atVan) items.push({ d: c.y + 0.05, k: 'card', e: c });
    for (const k of pickups) if (inView(k.x, k.y)) items.push({ d: k.y - 0.3, k: 'pickup', e: k });
    for (const e of enemies) if (inView(e.x, e.y)) items.push({ d: e.y, k: 'enemy', e });
    for (const p of players) items.push({ d: p.y, k: 'player', e: p });
    for (const q of projs) if (inView(q.x, q.y)) items.push({ d: q.y + 0.2, k: 'proj', e: q });
    for (const p of players) {
      if (p.dead || !p.bl) continue;
      for (const b of bladePositions(p.x, p.y, p.bl, time)) items.push({ d: b.y + 0.2, k: 'blade', x: b.x, y: b.y });
    }
    items.sort((a, b) => a.d - b.d);

    for (const it of items) {
      switch (it.k) {
        case 'obj': this.drawObj(it, time, players, enemies); break;
        case 'merchant': this.drawMerchant(it, time); break;
        case 'van': {
          const s = vanSprite();
          if (!s) break;
          const x = this.sx(it.x, it.y), y = this.sy(it.x, it.y);
          drawShadow(g, x, y - 2, 60);
          g.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
          if (it.on) {
            // rebooting: the whole van glows and pulses
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = 0.25 + 0.2 * Math.sin(time * 10);
            g.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
          }
          break;
        }
        case 'box': this.drawBox(it, view, time); break;
        case 'card': {
          const x = this.sx(it.e.x, it.e.y), y = this.sy(it.e.x, it.e.y);
          drawShadow(g, x, y + 2, 8);
          this.drawCard(it.e, x, y - 10 + Math.round(Math.sin(time * 4) * 1.5), time);
          break;
        }
        case 'pickup': {
          const s = smallSprite(it.e.kind);
          const bob = Math.round(Math.sin(time * 5 + it.e.id) * 1);
          drawShadow(g, this.sx(it.e.x, it.e.y), this.sy(it.e.x, it.e.y), 4);
          g.drawImage(s.img, this.sx(it.e.x, it.e.y) - s.ox, this.sy(it.e.x, it.e.y) - 4 - s.oy + bob);
          break;
        }
        case 'enemy': this.drawEnemy(it.e, time); break;
        case 'player': this.drawPlayer(it.e, view, time); break;
        case 'proj': {
          if (it.e.kind === 'fire' && animFrames('fireball', 'fly')) {
            // the Devil's fireball: its art flies left, so turn it to face where it's going
            const f = monsterAnim('fireball', 'fly', -1, Math.floor(time * 12 + it.e.id) % animFrames('fireball', 'fly'));
            g.save();
            g.translate(this.sx(it.e.x, it.e.y), this.sy(it.e.x, it.e.y) - 6);
            g.rotate(Math.atan2(it.e.vy, it.e.vx) + Math.PI);
            g.drawImage(f.img, -f.w * 0.3, -f.h / 2, f.w, f.h);
            g.restore();
            break;
          }
          const art = SHOT_ART[it.e.kind];
          if (art && animFrames(art, 'shot')) {
            // a monster's projectile (slime blob, spores, bat bolt, rocks, ghost wisp): its
            // art flies right, so turn it to face where it's going
            const f = monsterAnim(art, 'shot', 1, Math.floor(time * 10 + it.e.id) % animFrames(art, 'shot'));
            g.save();
            g.translate(this.sx(it.e.x, it.e.y), this.sy(it.e.x, it.e.y) - 6);
            g.rotate(it.e.kind === 'rock' ? 0 : Math.atan2(it.e.vy, it.e.vx));
            g.drawImage(f.img, -f.w * 0.7, -f.h / 2, f.w, f.h);
            g.restore();
            break;
          }
          const s = smallSprite(it.e.kind);
          g.drawImage(s.img, this.sx(it.e.x, it.e.y) - s.ox, this.sy(it.e.x, it.e.y) - 6 - s.oy);
          break;
        }
        case 'blade': {
          const s = smallSprite('blade');
          g.drawImage(s.img, this.sx(it.x, it.y) - s.ox, this.sy(it.x, it.y) - 6 - s.oy);
          break;
        }
      }
    }

    // Giant swords are so big they're drawn over everything else
    for (const p of players) if (!p.dead && p.gs > 0) this.drawGiantSword(p, time);
    this.drawFx(dt);
    // Shop sign floats above the stall's awning
    const m = world.merchant;
    drawText(g, 'SHOP', this.sx(m.x) - 7, this.sy(m.x, m.y) - 40 + Math.round(Math.sin(time * 3)), '#f8d838');
    if (view.van) {
      const v = world.van, vx = this.sx(v.x), vy = this.sy(v.x, v.y);
      const label = 'REBOOT VAN';
      drawText(g, label, vx - (textWidth(label) >> 1), vy - 66 + Math.round(Math.sin(time * 3 + 1)), '#a8e8ff');
      // cards dropped off at the van float in its hologram while they reboot
      atVan.forEach((c, i) => this.drawCard(c, vx + (i - (atVan.length - 1) / 2) * 14, vy - 38 + Math.round(Math.sin(time * 4 + i)), time));
      if (atVan.length) {
        if (manned) {
          // beam of light up from the hologram while someone reboots
          g.fillStyle = `rgba(168,232,255,${0.18 + 0.1 * Math.sin(time * 12)})`;
          g.fillRect(vx - 6, vy - 200, 12, 200 - 50);
        } else if (Math.floor(time * 2) % 2) {
          const t = 'STAND HERE TO REBOOT';
          drawText(g, t, vx - (textWidth(t) >> 1), vy - 76, '#f8d838');
        }
        g.fillStyle = '#202030'; g.fillRect(vx - 16, vy - 58, 32, 4);
        g.fillStyle = '#a8e8ff'; g.fillRect(vx - 15, vy - 57, Math.round(30 * Math.min(1, booting)), 2);
      }
    }
    // Mystery Box label
    {
      const b = world.box, bx = this.sx(b.x), by = this.sy(b.x, b.y);
      const label = view.bx ? 'MYSTERY BOX' : `MYSTERY BOX ${BOX_COST}G`;
      drawText(g, label, bx - (textWidth(label) >> 1), by - (view.bx ? 74 : 30) + Math.round(Math.sin(time * 3 + 2)), '#f8d838');
    }
    // Cards being carried float over their carrier's head
    for (const c of cards) {
      if (!c.carrier) continue;
      const x = this.sx(c.x, c.y), y = this.sy(c.x, c.y);
      this.drawCard(c, x, y - 52 + Math.round(Math.sin(time * 4) * 1.5), time);
    }
    this.drawNames(players, view);
    this.drawOffscreenAllies(players, me);
    if (view.phase === 'wave' && enemies.length <= 5) this.drawOffscreenEnemies(enemies);
    this.cam.x = camX; this.cam.y = camY;
  }

  // A huge sword spinning around the player, with a faint swirl trail.
  drawGiantSword(p, time) {
    const g = this.g;
    const a = giantAngle(time);
    const cx = this.sx(p.x, p.y), cy = this.sy(p.x, p.y) - 11;
    const len = Math.round(GIANT_LEN * TILE);
    const img = giantSwordSprite(len);
    // swirl trail behind the blade
    for (let i = 1; i <= 7; i++) {
      const ta = a - i * 0.1;
      g.fillStyle = `rgba(255,248,200,${0.36 - i * 0.045})`;
      for (let k = 22; k <= len; k += 5) g.fillRect(Math.round(cx + Math.cos(ta) * k), Math.round(cy + Math.sin(ta) * k), 3, 3);
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    // blink when it's about to run out
    if (img && !(p.gs < 1.2 && Math.floor(time * 10) % 2)) g.drawImage(img.img, 0, -img.h / 2, img.w, img.h);
    g.restore();
  }

  drawAura(x, y, R, t) {
    const g = this.g;
    const pulse = 0.6 + Math.sin(t * 6) * 0.2;
    g.fillStyle = `rgba(248,232,120,${0.18 * pulse})`;
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = this.sx(x + Math.cos(a) * R, y + Math.sin(a) * R);
      const py = this.sy(x + Math.cos(a) * R, y + Math.sin(a) * R);
      g.fillRect(px, py, 2, 1);
    }
    // dithered fill
    const cx = this.sx(x, y), cy = this.sy(x, y);
    const rx = R * TILE, ry = R * TILE;
    g.fillStyle = `rgba(248,232,120,${0.12 * pulse})`;
    for (let py = -ry; py <= ry; py++) {
      const hw = rx * Math.sqrt(Math.max(0, 1 - (py * py) / (ry * ry)));
      for (let px = -hw; px <= hw; px += 2) {
        if (((px | 0) + (py | 0)) & 1) g.fillRect(Math.round(cx + px), Math.round(cy + py), 1, 1);
      }
    }
  }

  drawObj(it, time, players) {
    const g = this.g;
    const x = this.sx(it.x, it.y), y = this.sy(it.x, it.y);
    if (it.o === O.FIRE) {
      const s = propSprite('fire', Math.abs(Math.floor(time * 6)) % 2);
      g.fillStyle = 'rgba(248,168,48,0.10)';
      for (let r = 34; r > 8; r -= 8) { g.beginPath(); g.ellipse(x, y - 4, r, r * 0.75, 0, 0, Math.PI * 2); g.fill(); }
      g.drawImage(s.img, x - s.ox, y - s.img.height + 2);
      return;
    }
    const s = sceneSprite(it.o, it.v);
    if (!s) return;
    if (it.o !== O.FENCE && it.o !== O.HOUSE) drawShadow(g, x, y, Math.min(24, s.img.width - 6));
    // Tall things fade when a player walks behind them, so you never lose your hero.
    let alpha = 1;
    if (TALL.has(it.o)) {
      const halfW = s.img.width / TILE / 2, hgt = (s.oy - 6) / TILE;
      for (const p of players) {
        if (p.y < it.y - 0.2 && p.y > it.y - hgt && Math.abs(p.x - it.x) < halfW) { alpha = 0.5; break; }
      }
    }
    g.globalAlpha = alpha;
    g.drawImage(s.img, x - s.ox, y - s.oy);
    g.globalAlpha = 1;
  }

  // The Mystery Box. Closed when idle. A spin shakes it and opens the lid, then flicks
  // through the prizes, slowing down until it lands on the one the server rolled. The prize then
  // slowly sinks back into the box until it's taken, and the lid closes again.
  drawBox(it, view, time) {
    const g = this.g;
    const x = this.sx(it.x, it.y), y = this.sy(it.x, it.y);
    g.fillStyle = `rgba(248,200,80,${0.10 + 0.05 * Math.sin(time * 3)})`;
    g.beginPath(); g.ellipse(x, y - 2, 20, 8, 0, 0, Math.PI * 2); g.fill();
    drawShadow(g, x, y, 26);
    const bx = view.bx, now = performance.now();
    if (bx) this.boxOpenAt = now; else if (this.boxOpenAt && !this.boxClosedAt) this.boxClosedAt = now;
    if (bx) this.boxClosedAt = 0;
    let frame = 0, sink = 0;
    if (bx && !bx[2]) {
      const t = BOX_SPIN - bx[1] / 10; // seconds since the spin started
      const OPEN = 0.75;
      if (t < 0.3) frame = Math.floor(t * 12) % 2 ? BOX_SHAKE : 0; // rattle
      else if (t < OPEN) frame = BOX_OPEN[Math.min(BOX_OPEN.length - 1, Math.floor((t - 0.3) / (OPEN - 0.3) * BOX_OPEN.length))];
      else {
        // flick through the prizes, slowing down until it stops on the one it rolled
        const done = Math.min(1, (t - OPEN) / (BOX_SPIN - OPEN));
        const n = BOX_PRIZES.length, steps = 15 + ((bx[3] - 15) % n + n) % n; // so the last step is the prize
        frame = BOX_PRIZES[Math.min(steps, Math.floor(Math.pow(done, 0.6) * (steps + 1))) % n];
      }
    } else if (bx) {
      frame = BOX_PRIZES[bx[3]] ?? BOX_GIANT;
      sink = 1 - bx[1] / 10 / BOX_CLAIM; // 0 when it appears, 1 when it's gone
    } else if (this.boxClosedAt) {
      // the lid closes again
      const k = Math.floor((now - this.boxClosedAt) / 70);
      if (k < BOX_OPEN.length) frame = BOX_OPEN[BOX_OPEN.length - 1 - k];
      else { this.boxClosedAt = 0; this.boxOpenAt = 0; }
    }
    const s = boxSprite(frame);
    if (!s) return;
    const left = x - s.ox, top = y - s.oy;
    if (!sink) { g.drawImage(s.img, s.sx, 0, s.sw, s.sh, left, top, s.w, s.h); return; }
    // the chest stays put; everything above it (lid, glow, prize) sinks into it
    const bodyTop = s.sh - BOX_BODY;
    const cut = top + bodyTop / 2;
    const drop = Math.round(sink * (bodyTop / 2 - 4));
    g.save();
    g.beginPath(); g.rect(left - 20, top - 40, s.w + 40, cut - top + 40); g.clip();
    g.drawImage(s.img, s.sx, 0, s.sw, bodyTop, left, top + drop, s.w, bodyTop / 2);
    g.restore();
    g.drawImage(s.img, s.sx, bodyTop, s.sw, BOX_BODY, left, cut, s.w, BOX_BODY / 2);
  }

  // A downed player's card: a little framed portrait of them.
  drawCard(c, x, y, time) {
    const g = this.g;
    const w = 11, h = 13, l = x - (w >> 1), t = y - h;
    const glow = 0.25 + 0.2 * Math.sin(time * 6);
    g.fillStyle = `rgba(168,232,255,${glow})`; g.fillRect(l - 2, t - 2, w + 4, h + 4);
    g.fillStyle = '#141018'; g.fillRect(l - 1, t - 1, w + 2, h + 2);
    g.fillStyle = '#e6e0cc'; g.fillRect(l, t, w, h);
    g.fillStyle = '#3a6ec0'; g.fillRect(l + 1, t + 1, w - 2, h - 4);
    // their head and shoulders, from the front-facing sprite
    const s = charSprite(c.look, 0, 0, 'idle');
    const sh = Math.round(s.img.height * 0.42);
    const dw = w - 2, dh = Math.round(dw * sh / s.img.width);
    g.save();
    g.beginPath(); g.rect(l + 1, t + 1, w - 2, h - 4); g.clip();
    g.drawImage(s.img, 0, 0, s.img.width, sh, l + 1, t + 1, dw, dh);
    g.restore();
    g.fillStyle = '#f8d838'; g.fillRect(l + 2, t + h - 2, w - 4, 1);
  }

  drawMerchant(it, time) {
    const g = this.g;
    const x = this.sx(it.x, it.y), y = this.sy(it.x, it.y);
    drawShadow(g, x, y, 8);
    const s = charSprite(MERCHANT_LOOK, 0, Math.floor(time * 3.5) % 4, 'idle');
    g.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);
  }

  drawEnemy(e, time) {
    const g = this.g;
    const x = this.sx(e.x, e.y), y = this.sy(e.x, e.y);
    const nf = monsterFrames(e.type);
    const frame = nf > 1 ? Math.floor(time * (e.type === 'bat' ? 10 : nf >= 5 ? 8 : 4) + e.id) % nf : 0;
    // special animations: the Ogre King's charge swing, ground smash, flinch and idle;
    // the Devil shooting a fireball
    const since = (performance.now() - (e.stAt || 0)) / 1000;
    const play = (anim, secs) => monsterAnim(e.type, anim, e.dir || 1, Math.floor(since / secs * animFrames(e.type, anim)));
    let s = null;
    if (e.st === 3) s = play('smash', SMASH_TIME);
    else if (e.st === 2) s = play('swing', CHARGE_TIME);
    else if (e.st === 4) s = play((e.dir || 1) < 0 ? 'shootL' : 'shootR', 0.45);
    else if (e.st === 5) s = play((e.dir || 1) < 0 ? 'atkL' : 'atkR', e.type === 'goblin' || e.type === 'skeleton' ? MELEE_TIME : SHOOT_TIME);
    else if (e.flash && animFrames(e.type, 'hurt')) s = monsterAnim(e.type, 'hurt', e.dir || 1, Math.floor(time * 12) % 2);
    else if (e.st === 1) s = monsterAnim(e.type, 'idle', e.dir || 1, Math.floor(time * 6) % Math.max(1, animFrames(e.type, 'idle')));
    s = s || monsterSprite(e.type, e.dir || 1, frame);
    const fly = e.type === 'bat' || e.type === 'ghost';
    const bob = fly ? Math.round(Math.sin(time * 4 + e.id) * 2) - 6 : (nf === 1 ? (Math.floor(time * 4 + e.id) % 2) : 0);
    drawShadow(g, x, y, e.type === 'ogre' ? 18 : e.type === 'golem' ? 16 : 8);
    if (e.type === 'ghost') g.globalAlpha = 0.75;
    const flashWhite = e.flash && !animFrames(e.type, 'hurt');
    g.drawImage(flashWhite ? s.white : s.img, x - s.ox, y - s.oy + bob, s.w || s.img.width, s.h || s.img.height);
    g.globalAlpha = 1;
    if (e.hp < e.maxHp && !e.boss && e.type !== 'ogre') {
      const w = 10;
      g.fillStyle = '#301018'; g.fillRect(x - w / 2, y - s.oy + bob - 4, w, 2);
      g.fillStyle = '#f83c3c'; g.fillRect(x - w / 2, y - s.oy + bob - 4, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2);
    }
  }

  drawPlayer(p, view, time) {
    const g = this.g;
    const x = this.sx(p.x, p.y), y = this.sy(p.x, p.y);
    const now = performance.now();
    if (p.dead) {
      // knocked out on the ground, waiting for a friend to revive them
      const ds = charSprite(p.look, p.dir, 0, 'down');
      drawShadow(g, x, y, 14);
      g.drawImage(ds.img, x - ds.ox, y - ds.oy, ds.w, ds.h);
      if (p.rv > 0) {
        g.fillStyle = '#202030'; g.fillRect(x - 8, y - 16, 16, 3);
        g.fillStyle = '#58d858'; g.fillRect(x - 7, y - 15, Math.round(14 * p.rv / 100), 1);
      }
      return;
    }
    // Pose: sword strike, walking, or breathing in place
    let s;
    const since = now - (this.attackAt.get(p.id) || -1e9);
    const hit = this.fx.some((f) => f.t === 'flash' && f.id === p.id);
    let bob = 0;
    const cheer = this.fx.some((f) => f.t === 'lvl' && f.id === p.id);
    if (hit && since >= ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, 0, 'hurt');
    else if (now < this.winUntil && since >= ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, 0, 'win'); // wave cleared!
    else if (cheer && !p.mv && since >= ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, 0, 'win'); // level up!
    else if (since < ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, since / (ATTACK_POSE * 1000), 'atk');
    else if (p.mv || p.dash) s = charSprite(p.look, p.dir, Math.floor(now / RUN_FRAME_MS));
    else {
      s = charSprite(p.look, p.dir, 0, 'idle');
      bob = Math.floor(now / 500 + (p.id.charCodeAt(1) || 0)) % 2; // breathing
    }

    // Dash: a trail of fading afterimages
    let trail = this.trails.get(p.id);
    if (!trail) this.trails.set(p.id, (trail = []));
    if (p.dash) trail.push({ x: p.x, y: p.y, at: now });
    while (trail.length && now - trail[0].at > 180) trail.shift();
    for (const t of trail) {
      g.globalAlpha = 0.35 * (1 - (now - t.at) / 180);
      g.drawImage(s.img, this.sx(t.x, t.y) - s.ox, this.sy(t.x, t.y) - s.oy, s.w, s.h);
    }
    g.globalAlpha = 1;

    drawShadow(g, x, y, 9);
    if (p.pw && p.pwt > 0 && !(p.pwt < 2 && Math.floor(now / 120) % 2)) {
      // holding a Mystery Box weapon: a ring in its colour (blinks as it runs out)
      g.strokeStyle = p.pw.c; g.globalAlpha = 0.55 + 0.25 * Math.sin(now / 120); g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    // Hit: the hurt pose, flashing red
    const flash = hit && Math.floor(now / 50) % 2 === 0;
    g.drawImage(flash ? s.hurt() : s.img, x - s.ox, y - s.oy + bob, s.w, s.h);
  }

  drawNames(players, view) {
    const g = this.g;
    for (const p of players) {
      if (!p.name) continue;
      const x = this.sx(p.x, p.y), y = this.sy(p.x, p.y);
      const label = p.name || '';
      const col = p.id === view.meId ? '#f8f8f8' : '#a8e8ff';
      drawText(g, label, x - (textWidth(label) >> 1), y - 39, col);
      if (!p.dead) {
        const w = 14;
        g.fillStyle = '#301018'; g.fillRect(x - w / 2, y - 32, w, 2);
        g.fillStyle = p.hp / p.maxHp > 0.3 ? '#58d858' : '#f83c3c';
        g.fillRect(x - w / 2, y - 32, Math.max(0, Math.round((w * p.hp) / p.maxHp)), 2);
      }
      if (view.phase === 'camp' && p.ready) drawText(g, 'READY', x - 9, y - 46, '#f8d838');
      const lv = this.fx.find((f) => f.t === 'lvl' && f.id === p.id);
      if (lv) drawText(g, 'LEVEL UP!', x - 17, y - 50 - Math.round((1.2 - lv.life) * 10), Math.floor(lv.life * 10) % 2 ? '#f8d838' : '#ffffff');
    }
  }

  drawOffscreenAllies(players, me) {
    if (!me) return;
    const g = this.g;
    for (const p of players) {
      if (p.id === me.id) continue;
      const x = this.sx(p.x, p.y), y = this.sy(p.x, p.y);
      if (x > 4 && x < this.w - 4 && y > 4 && y < this.h - 4) continue;
      const cx = this.w / 2, cy = this.h / 2;
      const a = Math.atan2(y - cy, x - cx);
      const ex = Math.max(6, Math.min(this.w - 6, cx + Math.cos(a) * this.w));
      const ey = Math.max(6, Math.min(this.h - 6, cy + Math.sin(a) * this.h));
      g.fillStyle = p.dead ? '#f83c3c' : '#a8e8ff';
      g.fillRect(Math.round(ex) - 2, Math.round(ey) - 2, 4, 4);
      g.fillStyle = '#141018';
      g.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2);
    }
  }

  // When only a few monsters are left, point at the ones off screen.
  drawOffscreenEnemies(enemies) {
    const g = this.g;
    for (const e of enemies) {
      const x = this.sx(e.x, e.y), y = this.sy(e.x, e.y);
      if (x > 0 && x < this.w && y > 0 && y < this.h) continue;
      const cx = this.w / 2, cy = this.h / 2;
      const a = Math.atan2(y - cy, x - cx);
      const k = Math.min((this.w / 2 - 8) / Math.abs(Math.cos(a) || 1e-6), (this.h / 2 - 8) / Math.abs(Math.sin(a) || 1e-6));
      const ex = Math.round(cx + Math.cos(a) * k), ey = Math.round(cy + Math.sin(a) * k);
      g.fillStyle = '#141018';
      g.fillRect(ex - 3, ey - 3, 7, 7);
      g.fillStyle = '#f83c3c';
      g.fillRect(ex - 2, ey - 2, 5, 5);
      g.fillStyle = '#ffffff';
      g.fillRect(ex + Math.round(Math.cos(a) * 2), ey + Math.round(Math.sin(a) * 2), 1, 1);
    }
  }

  drawFx(dt) {
    const g = this.g;
    for (const f of this.fx) {
      f.life -= dt;
      if (f.t === 'num') {
        f.z += dt * 18;
        const x = this.sx(f.x, f.y), y = this.sy(f.x, f.y) - 14 - Math.round(f.z);
        const s = String(f.v);
        drawText(g, s, x - (textWidth(s) >> 1), y, f.v >= 40 ? '#f8d838' : '#ffffff');
      } else if (f.t === 'part') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vz -= 80 * dt; f.z = Math.max(0, f.z + f.vz * dt);
        g.fillStyle = f.c;
        g.fillRect(this.sx(f.x, f.y), this.sy(f.x, f.y) - Math.round(f.z), 2, 2);
      } else if (f.t === 'zap') {
        const x = this.sx(f.x, f.y), y = this.sy(f.x, f.y);
        g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#f8f878';
        let px = x, py = y - 80;
        while (py < y - 4) {
          const nx = px + Math.round((Math.random() - 0.5) * 8), ny = py + 6;
          g.fillRect(Math.min(px, nx), py, Math.abs(nx - px) + 2, 6);
          px = nx; py = ny;
        }
        g.fillStyle = 'rgba(255,255,200,0.5)';
        g.fillRect(x - 6, y - 3, 12, 4);
      } else if (f.t === 'slash') {
        // A crescent sweeping across the front of the player (all the way round with the
        // Battle Axe, wider with the Reaper Scythe), coloured by Mystery Box weapon.
        const prog = 1 - f.life / 0.16;
        const half = f.w === 'axe' ? Math.PI : f.w === 'scythe' ? 2 : 1.3;
        const edge = { sword: '#f8d838', axe: '#f84838', scythe: '#c048f0' }[f.w] || '#f8e878';
        const n = Math.round(half * 11);
        for (let i = 0; i <= n; i++) {
          const a = f.a - half + (2 * half * i) / n;
          if (i / n > prog + 0.35) break;
          for (const r of [f.r * 0.65, f.r * 0.82, f.r]) {
            const px = this.sx(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
            const py = this.sy(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r) - 7;
            g.fillStyle = r === f.r * 0.82 ? '#ffffff' : edge;
            g.fillRect(px, py, 2, 2);
          }
        }
      } else if (f.t === 'burst') {
        // a fireball fizzling out
        const n = animFrames('fireball', 'burst'), k = Math.min(n - 1, Math.floor((1 - f.life / 0.3) * n));
        const s = monsterAnim('fireball', 'burst', -1, k);
        if (s) {
          g.save(); g.translate(this.sx(f.x, f.y), this.sy(f.x, f.y) - 6); g.rotate(f.a + Math.PI);
          g.drawImage(s.img, -s.w * 0.3, -s.h / 2, s.w, s.h); g.restore();
        }
      } else if (f.t === 'corpse') {
        // the Ogre King keels over (then fades away)
        const t = f.max - f.life, n = animFrames(f.type, 'die');
        const s = monsterAnim(f.type, 'die', f.d, Math.min(n - 1, Math.floor(t / 0.9 * n)));
        if (s) {
          g.globalAlpha = Math.min(1, f.life / 0.8) * (f.type === 'ghost' ? 0.75 : 1);
          g.drawImage(s.img, this.sx(f.x, f.y) - s.ox, this.sy(f.x, f.y) - s.oy, s.w, s.h);
          g.globalAlpha = 1;
        }
      } else if (f.t === 'quake') {
        // Thunder Hammer: a ring of lightning blue rushing out along the ground
        const k = 1 - f.life / 0.35, R = f.r * k;
        g.fillStyle = `rgba(120,200,255,${0.9 * (1 - k)})`;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          g.fillRect(this.sx(f.x + Math.cos(a) * R), this.sy(f.x, f.y + Math.sin(a) * R * 0.75) - 2, 3, 2);
        }
      } else if (f.t === 'lvl') {
        // drawn by name pass; a rising sparkle text
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  }
}
