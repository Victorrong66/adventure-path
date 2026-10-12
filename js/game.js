// A running game session. The host runs the Sim and streams snapshots to friends;
// a client predicts its own movement and draws everything else from snapshots.
import { Sim, WEAPONS, PASSIVES, SHOP, slashCooldown, ENEMY_TYPES, PROJ_KINDS, PICKUP_KINDS } from './sim.js';
import { World } from './world.js';
import { screenToWorldDir, facingFromScreen, escapeHtml } from './util.js';
import { storeWorld, loadMobFace, saveMobFace, loadRelay, encodeRelay } from './save.js';
import { setMobFace, processFacePhoto } from './sprites.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const NET_RATE = 1 / 15;
const MAX_PLAYERS = 8;

export class Game {
  constructor({ mode, profile, renderer, audio, input, onExit }) {
    this.mode = mode;
    this.profile = profile;
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.onExit = onExit;
    this.running = false;
    this.acc = 0;
    this.netT = 0;
    this.saveT = 0;
    this.netEvents = [];
    this.dashT = 0;
    this.dashCd = 0;
    this.lastMove = [0, 1];
    this.attackCd = 0;
    this.shopOpen = false;
    this.lastChoicesKey = '';
    this.lastShopKey = '';
    this.announceTimer = null;
  }

  // ---------------------------------------------------------------- host

  async startHost(save, peerSetup) {
    this.save = save;
    this.sim = new Sim(save);
    this.world = this.sim.world;
    this.sim.onSave = () => this.persist();
    this.myId = 'h';
    this.sim.addPlayer('h', this.profile);
    // The face from Settings wins; older saves may carry one from the in-game menu.
    const setting = loadMobFace();
    this.face = setting === undefined ? save.mobFace || null : setting;
    await setMobFace(this.face).catch(() => { this.face = null; return setMobFace(null); });
    this.sim.events = [];
    this.conns = new Map();
    this.lastSeen = new Map();
    this.nextPid = 1;
    const { peer, code } = await peerSetup((conn) => this.onConnection(conn));
    this.peer = peer;
    this.code = code;
    this.begin();
    this.chatLine(null, `World "${save.name}" is open! Room code: ${code}`);
  }

  onConnection(conn) {
    const id = 'p' + this.nextPid++;
    this.lastSeen.set(id, performance.now());
    conn.on('data', (d) => { this.lastSeen.set(id, performance.now()); this.onClientData(id, conn, d); });
    conn.on('close', () => this.dropClient(id));
    conn.on('error', () => this.dropClient(id));
    conn.on('iceStateChanged', (s) => { if (s === 'failed' || s === 'closed') this.dropClient(id); });
  }

  onClientData(id, conn, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      if (this.conns.has(id)) return;
      if (this.sim.players.size >= MAX_PLAYERS) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
      // Same player coming back (e.g. their connection dropped): the new
      // connection replaces the old one, which may not have noticed it's dead yet.
      const old = [...this.sim.players.values()].find((p) => p.pid === d.pid && p.id !== 'h');
      if (old) this.dropClient(old.id);
      if (d.pid === this.profile.pid) { conn.send({ t: 'dupe' }); setTimeout(() => conn.close(), 500); return; }
      this.conns.set(id, conn);
      this.sim.addPlayer(id, { pid: String(d.pid).slice(0, 20), name: d.name, look: sanitizeLook(d.look) });
      const p = this.sim.players.get(id);
      conn.send({ t: 'welcome', id, seed: this.save.seed, name: this.save.name, code: this.code, x: p.x, y: p.y, tpn: p.tpn, face: this.face || null });
      this.sendRoster();
      this.persist();
      return;
    }
    if (!this.conns.has(id)) return;
    if (d.t === 'in') this.sim.setInput(id, d);
    else if (d.t === 'act') this.sim.action(id, d.a, d.v);
    else if (d.t === 'chat') {
      const p = this.sim.players.get(id);
      if (p) this.broadcastChat(p.name, String(d.m || '').slice(0, 120));
    }
  }

  dropClient(id) {
    this.lastSeen.delete(id);
    if (!this.conns.has(id)) return;
    const conn = this.conns.get(id);
    this.conns.delete(id);
    try { conn.close(); } catch { /* ignore */ }
    this.sim.removePlayer(id);
    this.sendRoster();
    this.persist();
  }

  sendRoster() {
    const list = [...this.sim.players.values()].map((p) => [p.id, p.name, p.look]);
    for (const c of this.conns.values()) c.send({ t: 'roster', list });
  }

  broadcastChat(from, m) {
    if (!m.trim()) return;
    for (const c of this.conns.values()) c.send({ t: 'chat', from, m });
    this.chatLine(from, m);
  }

  // Host only: change the photo-face the monsters wear, and tell everyone.
  async setFace(face) {
    this.face = face || null;
    this.save.mobFace = this.face;
    saveMobFace(this.face);
    await setMobFace(this.face);
    for (const c of this.conns.values()) c.send({ t: 'face', face });
    this.updateFacePreview();
    this.persist();
  }

  updateFacePreview() {
    const img = $('face-preview');
    if (this.mode === 'host' && this.face) { img.src = this.face; img.classList.remove('hidden'); }
    else img.classList.add('hidden');
    $('menu-face-clear').classList.toggle('hidden', !(this.mode === 'host' && this.face));
  }

  persist() {
    if (this.mode !== 'host') return;
    storeWorld(this.sim.snapshotSave());
  }

  // ---------------------------------------------------------------- client

  async startClient(peer, conn) {
    this.peer = peer;
    this.conn = conn;
    this.roster = new Map();
    this.cl = { players: new Map(), enemies: new Map(), projs: new Map(), pickups: new Map() };
    this.state = { ph: 'camp', w: 1, cp: 1, pt: 0, left: 0, k: 0 };
    this.serverT = 0;
    this.priv = null;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The host did not answer.')), 10000);
      conn.on('data', (d) => {
        if (d.t === 'welcome') {
          clearTimeout(timer);
          this.myId = d.id;
          this.code = d.code;
          this.worldName = d.name;
          setMobFace(d.face || null).catch(() => setMobFace(null));
          this.world = new World(d.seed);
          this.self = { id: d.id, x: d.x, y: d.y, dir: 0, mv: false, dash: false, tpn: d.tpn };
          resolve();
        } else if (d.t === 'full') { clearTimeout(timer); reject(new Error('That world is full (8 players max).')); }
        else if (d.t === 'dupe') { clearTimeout(timer); reject(new Error('You are already in that world in another tab.')); }
        else this.onHostData(d);
      });
      conn.on('close', () => { clearTimeout(timer); reject(new Error('Connection closed.')); this.disconnected(); });
      conn.on('iceStateChanged', (s) => { if (s === 'failed' || s === 'closed') this.disconnected(); });
      conn.send({ t: 'hello', pid: this.profile.pid, name: this.profile.name, look: this.profile.look });
    });
    this.begin();
    this.chatLine(null, `Joined "${this.worldName}"`);
  }

  disconnected() {
    if (!this.running) return;
    this.stop();
    this.onExit('Lost connection to the host.', { rejoin: this.code });
  }

  onHostData(d) {
    if (!this.world) return;
    if (d.t === 'face') { setMobFace(d.face || null).catch(() => setMobFace(null)); return; }
    if (d.t === 'roster') {
      this.roster = new Map(d.list.map(([id, name, look]) => [id, { name, look }]));
      for (const id of this.cl.players.keys()) if (!this.roster.has(id)) this.cl.players.delete(id);
    } else if (d.t === 'chat') {
      this.chatLine(d.from, d.m);
      this.audio.sfx('ui');
    } else if (d.t === 's') {
      this.applySnapshot(d);
    }
  }

  applySnapshot(s) {
    this.lastSnapAt = performance.now();
    this.state = s;
    this.serverT = s.T;
    this.serverTAt = performance.now();
    this.priv = s.me;
    const C = this.cl;
    const seen = new Set();
    for (const a of s.pl) {
      const [id, x, y, dir, mv, hp, maxHp, dead, level, ready, bl, au, rv, dash, gs] = a;
      seen.add(id);
      let p = C.players.get(id);
      if (!p) { p = { id, x: x / 100, y: y / 100 }; C.players.set(id, p); }
      Object.assign(p, { tx: x / 100, ty: y / 100, dir, mv: !!mv, hp, maxHp, dead: !!dead, level, ready: !!ready, bl, au, rv, dash: !!dash, gs: (gs || 0) / 10 });
    }
    for (const id of C.players.keys()) if (!seen.has(id)) C.players.delete(id);

    const syncMap = (map, arr, make) => {
      const ids = new Set();
      for (const a of arr) {
        ids.add(a[0]);
        const cur = map.get(a[0]);
        map.set(a[0], make(a, cur));
      }
      for (const id of map.keys()) if (!ids.has(id)) map.delete(id);
    };
    syncMap(C.enemies, s.en, (a, cur) => {
      const [id, ti, x, y, dir, flash, hp, maxHp] = a;
      const e = cur || { id, x: x / 100, y: y / 100 };
      const type = ENEMY_TYPES[ti];
      return Object.assign(e, { type, tx: x / 100, ty: y / 100, dir, flash, hp, maxHp, boss: type === 'ogre' });
    });
    syncMap(C.projs, s.pr, (a, cur) => {
      const [id, ki, x, y, vx, vy] = a;
      const q = cur || { id };
      return Object.assign(q, { kind: PROJ_KINDS[ki], x: x / 100, y: y / 100, vx: vx / 100, vy: vy / 100 });
    });
    syncMap(C.pickups, s.pk, (a, cur) => {
      const [id, ki, x, y] = a;
      const k = cur || { id, x: x / 100, y: y / 100 };
      return Object.assign(k, { kind: PICKUP_KINDS[ki], tx: x / 100, ty: y / 100 });
    });

    for (const e of s.fx || []) {
      if (e.k === 'tp' && e.id === this.myId) {
        this.self.x = e.x; this.self.y = e.y; this.self.tpn = e.n;
      }
      this.handleEvent(e);
    }
  }

  // ---------------------------------------------------------------- shared

  begin() {
    this.running = true;
    this.lastSnapAt = performance.now();
    this.keepAwake();
    this.onVisible = () => {
      if (document.visibilityState !== 'visible' || !this.running) return;
      this.keepAwake();
      if (this.peer && this.peer.disconnected && !this.peer.destroyed) this.peer.reconnect();
      if (this.mode === 'client') this.lastSnapAt = Math.max(this.lastSnapAt, performance.now() - 6000);
    };
    document.addEventListener('visibilitychange', this.onVisible);
    // Watchdog (timers keep running when frames don't): a client that hears nothing from
    // the host for 10 seconds treats the connection as lost and starts reconnecting.
    this.watchdog = setInterval(() => {
      this.layoutHud();
      if (this.mode === 'client' && this.running && document.visibilityState === 'visible' &&
          performance.now() - this.lastSnapAt > 10000) this.disconnected();
    }, 1000);
    this.last = performance.now();
    $('hud').classList.remove('hidden');
    $('hud-room').innerHTML = `Room <b>${escapeHtml(this.code || '')}</b>`;
    $('hud-name').textContent = this.profile.name;
    document.querySelectorAll('.host-only').forEach((el) => el.classList.toggle('hidden', this.mode !== 'host'));
    this.bindUi();
    if (this.mode === 'host') this.updateFacePreview();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (this.mode === 'host') {
      // Keep the world running even when the host's tab is in the background.
      this.bgTimer = setInterval(() => {
        if (document.hidden && this.running) {
          const now = performance.now();
          const dt = Math.min(0.25, (now - this.last) / 1000);
          this.last = now;
          this.tickHost(dt);
        }
      }, 50);
    }
  }

  // Stop phones from going to sleep mid-game (a sleeping host freezes the whole world).
  async keepAwake() {
    try {
      if (navigator.wakeLock && (!this.wakeLock || this.wakeLock.released)) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not supported or not allowed */ }
  }

  stop() {
    this.running = false;
    clearInterval(this.watchdog);
    document.removeEventListener('visibilitychange', this.onVisible);
    try { this.wakeLock && this.wakeLock.release(); } catch { /* ignore */ }
    cancelAnimationFrame(this.raf);
    clearInterval(this.bgTimer);
    this.unbindUi?.();
    $('hud').classList.add('hidden');
    $('shop').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('choices').classList.add('hidden');
    $('chat-log').innerHTML = '';
    $('chat-history').innerHTML = '';
    this.toggleChat(false);
    if (this.mode === 'host') this.persist();
    try { this.peer && this.peer.destroy(); } catch { /* ignore */ }
    setMobFace(null);
  }

  leave() {
    this.stop();
    this.onExit(null);
  }

  // Me = the object that represents the local player's position.
  get me() {
    if (this.mode === 'host') return this.sim.players.get('h');
    return this.self;
  }

  myStats() {
    if (this.mode === 'host') {
      const v = this.sim.privateView('h');
      return v;
    }
    return this.priv;
  }

  frame(dt) {
    this.handleKeys();
    this.moveLocal(dt);
    if (this.mode === 'host') this.tickHost(dt);
    else this.tickClient(dt);
    const view = this.buildView(dt);
    this.renderer.draw(view, dt);
    this.updateHud(view);
    this.input.endFrame();
  }

  tickHost(dt) {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.sim.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    const evs = this.sim.events;
    this.sim.events = [];
    for (const e of evs) this.handleEvent(e);
    this.netEvents.push(...evs);

    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = NET_RATE;
      if (this.conns.size) {
        const snap = this.sim.snapshot();
        snap.fx = this.netEvents.filter((e) => e.k !== 'dmg').concat(this.netEvents.filter((e) => e.k === 'dmg').slice(-50));
        for (const [id, c] of this.conns) {
          if (!c.open) continue;
          try { c.send({ ...snap, me: this.sim.privateView(id) }); } catch (err) { console.warn(err); }
        }
      }
      this.netEvents = [];
    }
    // Friends whose game went silent (closed tab, lost signal) are dropped so they can rejoin cleanly.
    const now = performance.now();
    for (const [id, t] of this.lastSeen) if (now - t > 12000) this.dropClient(id);
    this.saveT += dt;
    if (this.saveT > 30) { this.saveT = 0; this.persist(); }
  }

  tickClient(dt) {
    const C = this.cl;
    const k = Math.min(1, dt * 14);
    for (const p of C.players.values()) {
      if (p.id === this.myId) continue;
      if (Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > 4) { p.x = p.tx; p.y = p.ty; }
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    }
    for (const e of C.enemies.values()) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
    for (const q of C.projs.values()) { q.x += q.vx * dt; q.y += q.vy * dt; }
    for (const p of C.pickups.values()) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }

    this.netT -= dt;
    if (this.netT <= 0 && this.conn.open) {
      this.netT = 1 / 20;
      const s = this.self;
      this.conn.send({ t: 'in', x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, dir: s.dir, mv: s.mv, dash: s.dash, tpn: s.tpn });
    }
  }

  moveLocal(dt) {
    const me = this.me;
    const stats = this.myStats();
    if (!me || !stats) return;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    const typing = document.activeElement === $('chat-input');
    if (stats.dead || this.pauseInfo()) { me.mv = false; me.dash = false; return; }
    const [ux, uy] = typing || this.shopOpen ? [0, 0] : this.input.move();
    const wantDash = !typing && this.input.dash();
    let [wx, wy] = screenToWorldDir(ux, uy);
    if (wx || wy) this.lastMove = [wx, wy];
    if (wantDash && this.dashCd <= 0) {
      this.dashT = 0.18; this.dashCd = 1.1;
      this.audio.sfx('dash');
    }
    let spd = stats.spd || 3.2;
    if (this.dashT > 0) {
      spd *= 3.4;
      if (!wx && !wy) [wx, wy] = this.lastMove;
    }
    this.world.move(me, wx * spd * dt, wy * spd * dt, 0.28);
    me.mv = !!(wx || wy);
    me.dash = this.dashT > 0;
    me.dir = facingFromScreen(ux, uy, me.dir);
    this.attackLocal(dt, me, typing, ux, uy);
  }

  attackLocal(dt, me, typing, ux, uy) {
    this.attackCd = Math.max(0, this.attackCd - dt);
    const want = typing || this.shopOpen ? false : this.input.attack();
    if (!want || this.attackCd > 0) return;
    // Aim: towards the mouse if clicking, otherwise the way you're moving / facing.
    let sx, sy;
    if (typeof want === 'object') {
      const r = this.renderer;
      sx = want.x / r.scale - r.sx(me.x, me.y);
      sy = want.y / r.scale - (r.sy(me.x, me.y) - 8);
      me.dir = facingFromScreen(sx, sy, me.dir);
    } else if (ux || uy) { sx = ux; sy = uy; } else {
      [sx, sy] = [[0, 1], [0, -1], [1, 0], [-1, 0]][me.dir] || [0, 1];
    }
    const [wx, wy] = screenToWorldDir(sx, sy);
    if (!wx && !wy) return;
    this.attackCd = slashCooldown((this.myStats().w || {}).sword);
    this.audio.sfx('slash');
    this.act('attack', { x: Math.round(wx * 100) / 100, y: Math.round(wy * 100) / 100 });
  }

  pauseInfo() {
    return this.mode === 'host' ? this.sim.pauseInfo() : (this.state && this.state.pz) || null;
  }

  buildView() {
    let players, enemies, projs, pickups, time, phase;
    if (this.mode === 'host') {
      const sim = this.sim;
      players = [...sim.players.values()].map((p) => ({
        id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, mv: p.mv, hp: p.hp, maxHp: p.maxHp,
        dead: p.dead, au: p.weapons.aura || 0, bl: p.weapons.blades || 0, rv: Math.round(p.reviveP * 100), dash: p.dash, ready: p.ready, level: p.level, gs: p.giantT || 0,
      }));
      enemies = sim.enemies; projs = sim.projs; pickups = sim.pickups; time = sim.t; phase = sim.phase;
    } else {
      players = [];
      for (const p of this.cl.players.values()) {
        const r = this.roster.get(p.id);
        if (!r) continue;
        const o = { ...p, name: r.name, look: r.look };
        if (p.id === this.myId) { o.x = this.self.x; o.y = this.self.y; o.dir = this.self.dir; o.mv = this.self.mv; o.dash = this.self.dash; }
        players.push(o);
      }
      enemies = [...this.cl.enemies.values()];
      projs = [...this.cl.projs.values()];
      pickups = [...this.cl.pickups.values()];
      time = this.serverT + (performance.now() - (this.serverTAt || performance.now())) / 1000;
      phase = this.state.ph;
    }
    const me = players.find((p) => p.id === this.myId) || null;
    return { world: this.world, players, enemies, projs, pickups, me, meId: this.myId, time, phase };
  }

  // ---------------------------------------------------------------- events & UI

  handleEvent(e) {
    const players = this.mode === 'host' ? [...this.sim.players.values()] : [...this.cl.players.values()];
    this.renderer.event(e, players);
    const mine = e.id === this.myId;
    switch (e.k) {
      case 'sfx': if (!e.id || mine) this.audio.sfx(e.s); break;
      case 'dmg': this.audio.sfx('hit'); break;
      case 'die': this.audio.sfx('die'); break;
      case 'zap': this.audio.sfx('zap'); break;
      case 'slash': if (!mine) this.audio.sfx('slash'); break;
      case 'hurt': if (mine) this.audio.sfx('hurt'); break;
      case 'lvl': if (mine) { this.audio.sfx('lvl'); } break;
      case 'down': this.audio.sfx('down'); this.chatLine(null, e.m); break;
      case 'revive': if (mine) this.audio.sfx('revive'); break;
      case 'msg': this.chatLine(null, e.m); break;
      case 'giant':
        this.audio.sfx('giant');
        if (mine) this.announce('GIANT SWORD!', 'Spin to win!');
        else this.chatLine(null, e.m);
        break;
      case 'wave':
        this.audio.sfx(e.boss ? 'boss' : 'wave');
        this.announce(e.boss ? `BOSS WAVE ${e.w}` : `WAVE ${e.w}`, e.boss ? 'The Ogre King approaches!' : 'Defeat the swarm!');
        break;
      case 'clear': this.audio.sfx('clear'); this.announce('WAVE CLEAR!', e.m); break;
      case 'wipe': this.audio.sfx('wipe'); this.announce('PARTY WIPED', e.m); break;
    }
  }

  announce(title, sub) {
    const el = $('announce');
    el.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    el.classList.add('show');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // New messages show at the bottom-left for 10 seconds, then fade away.
  // Everything is kept in the chat panel's history.
  chatLine(from, m) {
    const html = from ? `<span class="who">${escapeHtml(from)}:</span> ${escapeHtml(m)}` : `<span class="sys">${escapeHtml(m)}</span>`;
    const log = $('chat-log');
    const div = document.createElement('div');
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => div.classList.add('old'), 10000);
    setTimeout(() => div.remove(), 11000);

    const hist = $('chat-history');
    const h = document.createElement('div');
    h.innerHTML = html;
    hist.appendChild(h);
    while (hist.children.length > 80) hist.firstChild.remove();
    hist.scrollTop = hist.scrollHeight;
    if (from && !this.chatOpen) { this.unread = (this.unread || 0) + 1; this.updateChatButton(); }
  }

  // Keep the wave/status text clear of the stats (left) and player list (right):
  // if it would overlap either, it moves down below them.
  layoutHud() {
    const tc = $('hud-tc');
    tc.style.top = '';
    const r = tc.getBoundingClientRect();
    let below = 0;
    for (const id of ['hud-tl', 'hud-tr']) {
      const o = $(id).getBoundingClientRect();
      if (o.bottom > r.top && o.top < r.bottom && o.right > r.left && o.left < r.right) below = Math.max(below, o.bottom);
    }
    if (below) tc.style.top = Math.round(below + 8) + 'px';
  }

  updateChatButton() {
    $('act-chat').innerHTML = this.unread ? `Chat <span class="badge">(${this.unread})</span>` : 'Chat';
  }

  toggleChat(open) {
    this.chatOpen = open;
    $('chat-panel').classList.toggle('hidden', !open);
    $('chat-log').classList.toggle('hidden', open);
    if (open) {
      this.unread = 0; this.updateChatButton();
      const hist = $('chat-history');
      hist.scrollTop = hist.scrollHeight;
      // Only pop the keyboard up automatically on computers
      if (!document.body.classList.contains('touch')) $('chat-input').focus();
    } else $('chat-input').blur();
  }

  sendChat() {
    const chat = $('chat-input');
    const m = chat.value.trim();
    chat.value = '';
    if (!m) return;
    if (this.mode === 'host') this.broadcastChat(this.profile.name, m);
    else if (this.conn.open) this.conn.send({ t: 'chat', m });
  }

  act(a, v) {
    if (this.mode === 'host') this.sim.action('h', a, v);
    else if (this.conn.open) this.conn.send({ t: 'act', a, v });
  }

  nearMerchant() {
    const me = this.me;
    if (!me || !this.world) return false;
    const m = this.world.merchant;
    return Math.hypot(me.x - m.x, me.y - m.y) < 2.2;
  }

  handleKeys() {
    const inp = this.input;
    if (inp.hit('escape')) {
      if (this.shopOpen) this.toggleShop(false);
      else if (this.chatOpen) this.toggleChat(false);
      else $('menu').classList.toggle('hidden');
    }
    if (inp.hit('enter') && !this.chatOpen) this.toggleChat(true);
    if (inp.hit('m')) this.toggleMute();
    if (inp.hit('r')) this.act('ready');
    if (inp.hit('e')) this.toggleShop(!this.shopOpen);
    for (const n of ['1', '2', '3']) if (inp.hit(n)) this.act('pick', Number(n) - 1);
  }

  toggleMute() {
    const m = this.audio.toggleMute();
    $('menu-mute').textContent = m ? 'Unmute' : 'Mute';
  }

  toggleShop(open) {
    if (open && !this.nearMerchant()) return;
    this.shopOpen = open;
    $('shop').classList.toggle('hidden', !open);
    this.lastShopKey = '';
  }

  bindUi() {
    const handlers = [];
    const on = (id, ev, fn) => { const el = $(id); el.addEventListener(ev, fn); handlers.push(() => el.removeEventListener(ev, fn)); };
    on('act-ready', 'click', () => this.act('ready'));
    on('act-shop', 'click', () => this.toggleShop(true));
    on('act-dash', 'touchstart', (e) => { e.preventDefault(); this.input.touchDash = true; });
    on('act-dash', 'click', () => { this.input.touchDash = true; });
    const atkOn = (e) => { e.preventDefault(); this.input.touchAttack = true; $('act-attack').classList.add('down'); };
    const atkOff = (e) => { e.preventDefault(); this.input.touchAttack = false; $('act-attack').classList.remove('down'); };
    on('act-attack', 'touchstart', atkOn);
    on('act-attack', 'touchend', atkOff);
    on('act-attack', 'touchcancel', atkOff);
    on('act-attack', 'mousedown', atkOn);
    on('act-attack', 'mouseup', atkOff);
    on('act-attack', 'mouseleave', atkOff);
    on('act-menu', 'click', () => $('menu').classList.remove('hidden'));
    on('shop-close', 'click', () => this.toggleShop(false));
    on('menu-resume', 'click', () => $('menu').classList.add('hidden'));
    on('menu-leave', 'click', () => this.leave());
    on('menu-mute', 'click', () => this.toggleMute());
    on('menu-save', 'click', () => { this.persist(); $('menu-status').textContent = 'World saved!'; });
    on('face-file', 'change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f || this.mode !== 'host') return;
      try {
        const face = await processFacePhoto(f);
        await this.setFace(face);
        $('menu-status').textContent = 'Monsters have a new face!';
      } catch (err) { $('menu-status').textContent = err.message; }
    });
    on('menu-face-clear', 'click', async () => {
      await this.setFace(null);
      $('menu-status').textContent = 'Monsters are back to normal.';
    });
    on('menu-export', 'click', async () => {
      this.persist();
      const { exportWorld } = await import('./save.js');
      exportWorld(this.sim.snapshotSave());
    });
    on('menu-invite', 'click', () => {
      const q = new URLSearchParams(location.search);
      q.delete('join'); q.delete('relay');
      q.set('join', this.code);
      const relay = loadRelay();
      if (relay) q.set('relay', encodeRelay(relay));
      const url = `${location.origin}${location.pathname}?${q.toString()}`;
      navigator.clipboard?.writeText(url).then(
        () => { $('menu-status').textContent = 'Invite link copied!'; },
        () => { $('menu-status').textContent = url; },
      );
    });
    on('choice-list', 'click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) this.act('pick', Number(b.dataset.pick));
    });
    on('shop-list', 'click', (e) => {
      const b = e.target.closest('[data-buy]');
      if (b) this.act('buy', b.dataset.buy);
    });
    on('act-chat', 'click', () => this.toggleChat(!this.chatOpen));
    on('chat-close', 'click', () => this.toggleChat(false));
    on('chat-send', 'click', () => this.sendChat());
    on('chat-input', 'keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
      else if (e.key === 'Escape') this.toggleChat(false);
      e.stopPropagation();
    });
    const unload = () => this.persist();
    addEventListener('beforeunload', unload);
    handlers.push(() => removeEventListener('beforeunload', unload));
    this.unbindUi = () => handlers.forEach((h) => h());
  }

  updateHud(view) {
    const st = this.myStats();
    if (!st) return;
    const phase = this.mode === 'host' ? this.sim.phase : this.state.ph;
    const wave = this.mode === 'host' ? this.sim.wave : this.state.w;
    const left = this.mode === 'host' ? this.sim.spawnLeft + this.sim.enemies.length : this.state.left;
    const pt = this.mode === 'host' ? Math.ceil(this.sim.phaseT) : this.state.pt;

    $('hud-lv').textContent = st.lv;
    $('hud-hp').style.width = `${Math.max(0, (100 * st.hp) / st.mhp)}%`;
    $('hud-hp-t').textContent = `${Math.max(0, st.hp)}/${st.mhp}`;
    $('hud-xp').style.width = `${(100 * st.xp) / st.xn}%`;
    $('hud-gold').textContent = st.g;
    const wl = Object.entries(st.w).map(([k, l]) => `${WEAPONS[k].name} ${l}`)
      .concat(Object.entries(st.ps).map(([k, l]) => `${PASSIVES[k].name} ${l}`));
    const wk = wl.join('|');
    if (wk !== this.lastWk) { this.lastWk = wk; $('hud-weapons').innerHTML = wl.map(escapeHtml).join('<br>'); }

    const players = view.players;
    const readyCount = players.filter((p) => p.ready).length;
    $('hud-wave').textContent = `WAVE ${wave}`;
    let phaseText = '';
    if (phase === 'camp') phaseText = `At camp. Press R when ready (${readyCount}/${players.length})`;
    else if (phase === 'rest') phaseText = `Next wave in ${pt}...`;
    else phaseText = `${left} monsters left`;
    if (st.dead) phaseText = 'You are down! A friend can revive you.';
    $('hud-phase').textContent = phaseText;

    const me = view.me;
    const meReady = me && me.ready;
    const readyBtn = $('act-ready');
    readyBtn.classList.toggle('hidden', phase !== 'camp');
    readyBtn.textContent = meReady ? 'Not Ready (R)' : 'Ready (R)';
    $('act-shop').classList.toggle('hidden', !this.nearMerchant());
    if (this.shopOpen && !this.nearMerchant()) this.toggleShop(false);

    const boss = view.enemies.find((e) => e.boss);
    $('boss-bar').classList.toggle('hidden', !boss);
    if (boss) $('boss-hp').style.width = `${(100 * boss.hp) / boss.maxHp}%`;

    const plKey = players.map((p) => `${p.name}${p.level}${p.dead}${Math.ceil(p.hp / 10)}`).join('|');
    if (plKey !== this.lastPl) {
      this.lastPl = plKey;
      $('hud-players').innerHTML = players.map((p) =>
        `<div class="${p.dead ? 'dead' : ''}">${escapeHtml(p.name)} LV${p.level ?? ''} ${p.dead ? 'DOWN' : Math.ceil(p.hp) + 'HP'}</div>`).join('');
      this.layoutHud();
    }

    // Level-up: the game is paused for everyone until every player has picked.
    const ch = st.ch || [];
    const pz = this.pauseInfo();
    const key = JSON.stringify([ch, pz]);
    if (key !== this.lastChoicesKey) {
      this.lastChoicesKey = key;
      const show = ch.length > 0 || !!pz;
      $('choices').classList.toggle('hidden', !show);
      $('choices').classList.toggle('waiting', !ch.length);
      $('choices-title').textContent = ch.length ? 'LEVEL UP! Pick an upgrade' : 'PAUSED';
      $('choice-list').innerHTML = ch.map((c, i) => `
        <button class="btn choice" data-pick="${i}">
          <span class="k">[${i + 1}]</span> <b>${escapeHtml(c.name)}${c.lvl ? ' LV' + c.lvl : ''}</b>
          <span class="d">${escapeHtml(c.desc)}</span>
        </button>`).join('');
      let wait = '';
      if (pz) {
        const others = pz.n.filter((n) => !(ch.length && n === this.profile.name));
        if (!ch.length) wait = `Waiting for ${others.join(', ')} to pick an upgrade...`;
        else if (others.length) wait = `The game is paused until everyone picks. Also waiting for: ${others.join(', ')}`;
        else wait = 'The game is paused until you pick.';
        wait += ` (auto-pick in ${pz.t}s)`;
      }
      $('choices-wait').textContent = wait;
      if (show && this.chatOpen) this.toggleChat(false);
    }

    // Shop
    if (this.shopOpen) {
      const sk = JSON.stringify([st.g, st.pm]);
      if (sk !== this.lastShopKey) {
        this.lastShopKey = sk;
        $('shop-gold').textContent = st.g;
        $('shop-list').innerHTML = SHOP.map((it) => {
          const owned = st.pm[it.id] || 0;
          const cost = it.base + it.step * owned;
          const maxed = owned >= it.max;
          return `<div class="shop-item"><div class="info"><b>${escapeHtml(it.name)}</b>${it.max !== Infinity ? ` (${owned}/${it.max})` : ''}<div class="d">${escapeHtml(it.desc)}</div></div>
            <button class="btn" data-buy="${it.id}" ${maxed || st.g < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + ' gold'}</button></div>`;
        }).join('');
      }
    }

    this.audio.playSong(phase === 'wave' ? 'battle' : 'camp');
  }
}

function sanitizeLook(l) {
  const n = (v, max) => Math.max(0, Math.min(max, Number(v) | 0));
  l = l || {};
  return { skin: n(l.skin, 5), hair: n(l.hair, 7), hairColor: n(l.hairColor, 7), outfit: n(l.outfit, 5), outfitColor: n(l.outfitColor, 7) };
}
