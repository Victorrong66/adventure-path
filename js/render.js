// Draws the world in a top-down three-quarter view at a low resolution and
// scales it up with crisp pixels. The canvas itself is twice that resolution
// (DETAIL), so heroes can be drawn with finer pixels than the scenery.
import { TILE } from './util.js';
import { MAP, O } from './world.js';
import {
  charSprite, monsterSprite, monsterFrames, propSprite, smallSprite, giantSwordSprite,
  drawText, textWidth, drawShadow, MERCHANT_LOOK,
} from './sprites.js';
import { paintGround, sceneSprite, TALL } from './scenery.js';
import { bladePositions, auraRadius, giantAngle, GIANT_LEN } from './sim.js';

const BG = '#0c1a10';
const DETAIL = 2;
const ATTACK_POSE = 0.42; // seconds a sword swing lasts (wind-up, slash, follow-through)

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
        for (let i = 0; i < 6; i++) this.addFx({ t: 'part', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, z: 6, vz: 20 + Math.random() * 20, life: 0.5, c: e.t === 'slime' ? '#3cb83c' : e.t === 'imp' ? '#d83c2c' : '#e8e8d8' });
        if (e.t === 'ogre') this.shake = 0.6;
        break;
      case 'zap': this.addFx({ t: 'zap', x: e.x, y: e.y, life: 0.25 }); break;
      case 'slash':
        this.addFx({ t: 'slash', x: e.x, y: e.y, a: e.a, r: e.r || 1.6, life: 0.16 });
        if (e.id) this.markAttack(e.id);
        break;
      case 'hurt': {
        const p = players && players.find((pp) => pp.id === e.id);
        if (p) this.addFx({ t: 'flash', id: e.id, life: 0.2 });
        break;
      }
      case 'lvl': this.addFx({ t: 'lvl', id: e.id, life: 1.2 }); break;
    }
  }

  draw(view, dt) {
    const g = this.g;
    g.setTransform(DETAIL, 0, 0, DETAIL, 0, 0);
    g.imageSmoothingEnabled = false;
    const { world, players, enemies, projs, pickups, me, time } = view;
    this.buildGround(world);

    // Camera follows the local player (smoothly)
    const fx = (me ? me.x : world.cx) * TILE;
    const fy = (me ? me.y : world.cy) * TILE - 8;
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
    if (!(p.gs < 1.2 && Math.floor(time * 10) % 2)) g.drawImage(img, 2, -Math.floor(img.height / 2));
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
    const frame = nf > 1 ? Math.floor(time * (e.type === 'bat' ? 10 : 4) + e.id) % nf : 0;
    const s = monsterSprite(e.type, e.dir || 1, frame);
    const fly = e.type === 'bat' || e.type === 'ghost';
    const bob = fly ? Math.round(Math.sin(time * 4 + e.id) * 2) - 6 : (nf === 1 ? (Math.floor(time * 4 + e.id) % 2) : 0);
    drawShadow(g, x, y, e.type === 'ogre' ? 18 : 8);
    if (e.type === 'ghost') g.globalAlpha = 0.75;
    g.drawImage(e.flash ? s.white : s.img, x - s.ox, y - s.oy + bob);
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
    const now = performance.now();
    // Pose: sword strike, walking, or breathing in place
    let s;
    const since = now - (this.attackAt.get(p.id) || -1e9);
    const hit = this.fx.some((f) => f.t === 'flash' && f.id === p.id);
    let bob = 0;
    const cheer = this.fx.some((f) => f.t === 'lvl' && f.id === p.id);
    if (hit && since >= ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, 0, 'hurt');
    else if (cheer && !p.mv && since >= ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, 0, 'win'); // level up!
    else if (since < ATTACK_POSE * 1000) s = charSprite(p.look, p.dir, since / (ATTACK_POSE * 1000), 'atk');
    else if (p.mv || p.dash) s = charSprite(p.look, p.dir, Math.floor(now / 75));
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
        // A white/yellow crescent sweeping across the front of the player.
        const prog = 1 - f.life / 0.16;
        for (let i = 0; i <= 14; i++) {
          const a = f.a - 1.3 + (2.6 * i) / 14;
          if (i / 14 > prog + 0.35) break;
          for (const r of [f.r * 0.65, f.r * 0.82, f.r]) {
            const px = this.sx(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
            const py = this.sy(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r) - 7;
            g.fillStyle = r === f.r * 0.82 ? '#ffffff' : '#f8e878';
            g.fillRect(px, py, 2, 2);
          }
        }
      } else if (f.t === 'lvl') {
        // drawn by name pass; a rising sparkle text
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  }
}
