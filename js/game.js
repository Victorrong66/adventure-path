// A running game session. The game server runs the Sim and streams snapshots to
// everyone (the host included); each player predicts their own movement and draws
// everything else from snapshots. The host's browser keeps the world save.
import { WEAPONS, PASSIVES, SHOP, BOX_COST, POWERS, slashCooldown, ENEMY_TYPES, PROJ_KINDS, PICKUP_KINDS } from './sim.js';
import { World } from './world.js';
import { screenToWorldDir, facingFromScreen, escapeHtml } from './util.js';
import { storeWorld, loadMobFace, saveMobFace, loadRules } from './save.js';
import { setMobFace, processFacePhoto } from './sprites.js';
import { JOIN_ERRORS } from './net.js';

const $ = (id) => document.getElementById(id);
const INPUT_RATE = 1 / 15;
const IDLE_RATE = 2;

export class Game {
  constructor({ profile, renderer, audio, input, onExit }) {
    this.profile = profile;
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.onExit = onExit;
    this.running = false;
    this.netT = 0;
    this.idleT = 0;
    this.lastInput = '';
    this.dashT = 0;
    this.dashCd = 0;
    this.lastMove = [0, 1];
    this.attackCd = 0;
    this.shopOpen = false;
    this.lastChoicesKey = '';
    this.lastShopKey = '';
    this.announceTimer = null;
  }

  // ---------------------------------------------------------------- connecting

  // Join the room on `conn`. Pass the world save to open (or re-open) it as the host.
  async start(conn, hostSave = null) {
    this.conn = conn;
    this.roster = new Map();
    this.cl = { players: new Map(), enemies: new Map(), projs: new Map(), pickups: new Map() };
    this.state = { ph: 'camp', w: 1, cp: 1, pt: 0, left: 0, k: 0 };
    this.serverT = 0;
    this.priv = null;
    this.save = hostSave;
    // The face from Settings wins; older saves may carry one from the in-game menu.
    const setting = loadMobFace();
    const face = setting === undefined ? (hostSave && hostSave.mobFace) || null : setting;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The game server did not answer.')), 10000);
      conn.on('data', (d) => {
        if (d.t === 'welcome') {
          clearTimeout(timer);
          this.myId = d.id;
          this.isHost = !!d.host;
          this.code = d.code;
          this.worldName = d.name;
          this.face = d.face || null;
          setMobFace(this.face).catch(() => setMobFace(null));
          this.world = new World(d.seed);
          this.self = { id: d.id, x: d.x, y: d.y, dir: 0, mv: false, dash: false, tpn: d.tpn };
          resolve();
        } else if (d.t === 'err') {
          clearTimeout(timer);
          const err = new Error(JOIN_ERRORS[d.err] || JOIN_ERRORS.bad);
          err.code = d.err;
          if (this.running && d.err === 'dupe') { this.stop(); this.onExit(err.message); }
          reject(err);
        } else this.onServerData(d);
      });
      conn.on('close', () => { clearTimeout(timer); reject(new Error('Connection closed.')); this.disconnected(); });
      conn.send({
        t: 'hello', pid: this.profile.pid, name: this.profile.name, look: this.profile.look,
        host: hostSave ? { save: hostSave, face, rules: loadRules() } : undefined,
      });
    });
    this.begin();
    if (this.isHost) this.chatLine(null, `World "${this.worldName}" is open! Room code: ${this.code}`);
    else this.chatLine(null, `Joined "${this.worldName}"`);
  }

  disconnected() {
    if (!this.running) return;
    this.stop();
    this.onExit('Lost connection to the game server.', { rejoin: this.code, hostSave: this.isHost ? this.save : null });
  }

  onServerData(d) {
    if (!this.world) return;
    if (d.t === 's') this.applySnapshot(d);
    else if (d.t === 'face') {
      this.face = d.face || null;
      setMobFace(this.face).catch(() => setMobFace(null));
      this.updateFacePreview();
    } else if (d.t === 'save') {
      // The host's browser keeps the world save; the server sends updates.
      if (!this.isHost || !d.save) return;
      this.save = d.save;
      this.persist();
      if (this.onSaved) { this.onSaved(); this.onSaved = null; }
    } else if (d.t === 'roster') {
      this.roster = new Map(d.list.map(([id, name, look]) => [id, { name, look }]));
      for (const id of this.cl.players.keys()) if (!this.roster.has(id)) this.cl.players.delete(id);
    } else if (d.t === 'chat') {
      this.chatLine(d.from, d.m);
      if (d.from !== this.profile.name) this.audio.sfx('ui');
    }
  }

  // Host only: change the photo-face the monsters wear, and tell everyone.
  setFace(face) {
    saveMobFace(face || null);
    this.conn.send({ t: 'face', face: face || null });
  }

  updateFacePreview() {
    const img = $('face-preview');
    if (this.isHost && this.face) { img.src = this.face; img.classList.remove('hidden'); }
    else img.classList.add('hidden');
    $('menu-face-clear').classList.toggle('hidden', !(this.isHost && this.face));
  }

  persist() {
    if (this.isHost && this.save) storeWorld(this.save);
  }

  // Host only: ask the server for the latest save (resolves once it's stored).
  requestSave() {
    return new Promise((resolve) => {
      if (!this.isHost || !this.conn.open) return resolve(this.save);
      const t = setTimeout(() => resolve(this.save), 3000);
      this.onSaved = () => { clearTimeout(t); resolve(this.save); };
      this.conn.send({ t: 'save' });
    });
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
      const [id, x, y, dir, mv, hp, maxHp, dead, level, ready, bl, au, rv, dash, gs, pw, pwt] = a;
      seen.add(id);
      let p = C.players.get(id);
      if (!p) { p = { id, x: x / 100, y: y / 100 }; C.players.set(id, p); }
      Object.assign(p, { tx: x / 100, ty: y / 100, dir, mv: !!mv, hp, maxHp, dead: !!dead, level, ready: !!ready, bl, au, rv, dash: !!dash, gs: (gs || 0) / 10, pw: pw ? POWERS[pw - 1] : null, pwt: (pwt || 0) / 10 });
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

  // ---------------------------------------------------------------- running

  begin() {
    this.running = true;
    this.lastSnapAt = performance.now();
    this.keepAwake();
    this.onVisible = () => {
      if (document.visibilityState !== 'visible' || !this.running) return;
      this.keepAwake();
      this.lastSnapAt = Math.max(this.lastSnapAt, performance.now() - 6000);
    };
    document.addEventListener('visibilitychange', this.onVisible);
    // Watchdog (timers keep running when frames don't): hearing nothing from the
    // server for 10 seconds means the connection is lost, so start reconnecting.
    this.watchdog = setInterval(() => {
      this.layoutHud();
      if (this.running && document.visibilityState === 'visible' &&
          performance.now() - this.lastSnapAt > 10000) this.disconnected();
    }, 1000);
    // Keep telling the server we're here while the tab is in the background.
    this.bgTimer = setInterval(() => { if (document.hidden && this.running) this.conn.send({ t: 'ping' }); }, 5000);
    this.last = performance.now();
    $('hud').classList.remove('hidden');
    $('hud-room').innerHTML = `Room <b>${escapeHtml(this.code || '')}</b>`;
    $('hud-name').textContent = this.profile.name;
    document.querySelectorAll('.host-only').forEach((el) => el.classList.toggle('hidden', !this.isHost));
    this.bindUi();
    this.updateFacePreview();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // Stop phones from going to sleep mid-game.
  async keepAwake() {
    try {
      if (navigator.wakeLock && (!this.wakeLock || this.wakeLock.released)) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not supported or not allowed */ }
  }

  stop() {
    this.running = false;
    clearInterval(this.watchdog);
    clearInterval(this.bgTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    try { this.wakeLock && this.wakeLock.release(); } catch { /* ignore */ }
    cancelAnimationFrame(this.raf);
    this.unbindUi?.();
    $('hud').classList.add('hidden');
    $('shop').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('choices').classList.add('hidden');
    $('chat-log').innerHTML = '';
    $('chat-history').innerHTML = '';
    this.toggleChat(false);
    this.persist();
    this.conn.close();
    setMobFace(null);
  }

  leave() {
    this.stop();
    this.onExit(null);
  }

  // Me = the object that represents the local player's position.
  get me() { return this.self; }

  myStats() { return this.priv; }

  frame(dt) {
    this.handleKeys();
    this.moveLocal(dt);
    this.tickNet(dt);
    const view = this.buildView(dt);
    this.renderer.draw(view, dt);
    this.updateHud(view);
    this.input.endFrame();
  }

  tickNet(dt) {
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

    // Send our position when it changes (15 times a second at most), and a
    // keep-alive every couple of seconds when standing still.
    this.netT -= dt;
    this.idleT -= dt;
    if (this.netT > 0 || !this.conn.open) return;
    const s = this.self;
    const r = this.renderer;
    const msg = {
      t: 'in', x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, dir: s.dir, mv: s.mv, dash: s.dash, tpn: s.tpn,
      vw: Math.ceil(r.w / 2 / 16), vh: Math.ceil(r.h / 2 / 16), // how much we can see, so monsters spawn off-screen
    };
    const key = JSON.stringify(msg);
    if (key === this.lastInput && this.idleT > 0) return;
    this.lastInput = key;
    this.netT = INPUT_RATE;
    this.idleT = IDLE_RATE;
    this.conn.send(msg);
  }

  moveLocal(dt) {
    const me = this.me;
    const stats = this.myStats();
    if (!me || !stats) return;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    const typing = document.activeElement === $('chat-input');
    const pz = this.pauseInfo();
    if (stats.dead || stats.wt || (pz && pz.p) || (stats.ch || []).length) { me.mv = false; me.dash = false; return; }
    const [ux, uy] = typing ? [0, 0] : this.input.move(); // walking away from the stall closes the shop
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
      sy = want.y / r.scale - (r.sy(me.x, me.y) - 12);
      me.dir = facingFromScreen(sx, sy, me.dir);
    } else if (ux || uy) { sx = ux; sy = uy; } else {
      [sx, sy] = [[0, 1], [0, -1], [1, 0], [-1, 0]][me.dir] || [0, 1];
    }
    const [wx, wy] = screenToWorldDir(sx, sy);
    if (!wx && !wy) return;
    this.attackCd = slashCooldown((this.myStats().w || {}).sword);
    this.audio.sfx('slash');
    this.renderer.markAttack(this.myId);
    this.act('attack', { x: Math.round(wx * 100) / 100, y: Math.round(wy * 100) / 100 });
  }

  pauseInfo() {
    return (this.state && this.state.pz) || null;
  }

  buildView() {
    const players = [];
    for (const p of this.cl.players.values()) {
      const r = this.roster.get(p.id);
      if (!r) continue;
      const o = { ...p, name: r.name, look: r.look };
      if (p.id === this.myId) { o.x = this.self.x; o.y = this.self.y; o.dir = this.self.dir; o.mv = this.self.mv; o.dash = this.self.dash; }
      players.push(o);
    }
    const enemies = [...this.cl.enemies.values()];
    const projs = [...this.cl.projs.values()];
    const pickups = [...this.cl.pickups.values()];
    const time = this.serverT + (performance.now() - (this.serverTAt || performance.now())) / 1000;
    const phase = this.state.ph;
    const me = players.find((p) => p.id === this.myId) || null;
    // Reboot Van mode: downed players' cards (on the ground, or carried by a friend)
    const van = this.state.rv === 'van';
    const cards = [];
    for (const [id, x, y, carrier, boot, atVan] of (van && this.state.cd) || []) {
      const r = this.roster.get(id);
      if (!r) continue;
      const by = carrier && players.find((p) => p.id === carrier);
      cards.push({ id, look: r.look, x: by ? by.x : x / 100, y: by ? by.y : y / 100, carrier: by ? carrier : 0, boot: boot / 100, atVan: !!atVan });
    }
    // Waiting to join (a wave is on): the camera watches the party
    const focus = me || players[0] || null;
    const bx = this.state.bx || null; // [spinner id, tenths of a second left]
    return { world: this.world, players, enemies, projs, pickups, me, focus, meId: this.myId, time, phase, van, cards, bx };
  }

  // ---------------------------------------------------------------- events & UI

  handleEvent(e) {
    const players = [...this.cl.players.values()];
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
      case 'box':
        if (e.ready) { if (mine) { this.audio.sfx('lvl'); this.chatLine(null, `The ${POWERS[e.p].name} is yours: grab it before it sinks back in!`); } }
        else { this.audio.sfx('coin'); this.chatLine(null, e.m); }
        break;
      case 'card': if (mine) this.audio.sfx('pick'); this.chatLine(null, e.m); break;
      case 'power': {
        const pw = POWERS[e.p];
        this.audio.sfx('giant');
        if (mine) this.announce(pw.name.toUpperCase() + '!', pw.desc);
        else this.chatLine(null, e.m);
        break;
      }
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
    const r = $('hud-tc-main').getBoundingClientRect(); // chat lines below may overlap freely
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
    if (this.conn.open) this.conn.send({ t: 'chat', m });
  }

  act(a, v) {
    if (this.conn.open) this.conn.send({ t: 'act', a, v });
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
    if (inp.hit('f')) this.spinBox();
    for (const n of ['1', '2', '3']) if (inp.hit(n)) this.act('pick', Number(n) - 1);
  }

  toggleMute() {
    const m = this.audio.toggleMute();
    $('menu-mute').textContent = m ? 'Unmute' : 'Mute';
  }

  // The shop is private: only you see it, and the game keeps going for everyone.
  toggleShop(open) {
    if (open && !this.nearMerchant()) return;
    if (open === this.shopOpen) return;
    if (open && this.myStats() && this.myStats().dead) return;
    this.shopOpen = open;
    $('shop').classList.toggle('hidden', !open);
    this.lastShopKey = '';
  }

  nearBox() {
    const me = this.me, b = this.world.box;
    return !!me && Math.hypot(me.x - b.x, me.y - b.y) < 2.2;
  }

  // One button: spin the box, then take the prize once it shows.
  spinBox() {
    const st = this.myStats();
    const bx = this.state.bx;
    if (!st || st.dead || !this.nearBox()) return;
    if (bx && bx[2] && bx[0] === this.myId) return this.act('box');
    if (bx) return this.chatLine(null, 'Someone else is using the Mystery Box!');
    if (st.g < BOX_COST) return this.chatLine(null, `The Mystery Box costs ${BOX_COST} gold.`);
    this.act('box');
  }

  bindUi() {
    const handlers = [];
    const on = (id, ev, fn) => { const el = $(id); el.addEventListener(ev, fn); handlers.push(() => el.removeEventListener(ev, fn)); };
    on('act-ready', 'click', () => this.act('ready'));
    on('act-shop', 'click', () => this.toggleShop(true));
    on('act-box', 'click', () => this.spinBox());
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
    on('menu-save', 'click', async () => { await this.requestSave(); $('menu-status').textContent = 'World saved!'; });
    on('face-file', 'change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f || !this.isHost) return;
      try {
        const face = await processFacePhoto(f);
        this.setFace(face);
        $('menu-status').textContent = 'Monsters have a new face!';
      } catch (err) { $('menu-status').textContent = err.message; }
    });
    on('menu-face-clear', 'click', async () => {
      this.setFace(null);
      $('menu-status').textContent = 'Monsters are back to normal.';
    });
    on('menu-export', 'click', async () => {
      const { exportWorld } = await import('./save.js');
      exportWorld(await this.requestSave());
    });
    on('menu-invite', 'click', () => {
      const q = new URLSearchParams(location.search);
      q.delete('join'); q.delete('relay');
      q.set('join', this.code);
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
    const { ph: phase, w: wave, left, pt } = this.state;

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
    const pzh = this.pauseInfo();
    if (pzh && !pzh.p && phase !== 'wave') phaseText = `Waiting for ${pzh.n.join(', ')} to pick upgrades...`;
    if (st.wt) phaseText = 'A wave is on! You will join the party as soon as it is over.';
    const meP = view.me;
    if (meP && !st.dead && meP.pw && meP.pwt > 0) phaseText = `${meP.pw.name}: ${Math.ceil(meP.pwt)}s  |  ${phaseText}`;
    const van = this.state.rv === 'van';
    if (st.dead) phaseText = van ? 'You are down! A friend can take your card to the Reboot Van.' : 'You are down! A friend can revive you.';
    else if (van) {
      const carrying = (this.state.cd || []).filter((c) => c[3] === this.myId).length;
      if (carrying) phaseText = `Carrying ${carrying > 1 ? carrying + ' cards' : 'a card'}: bring it to the Reboot Van!`;
    }
    $('hud-phase').textContent = phaseText;

    const me = view.me;
    const meReady = me && me.ready;
    const readyBtn = $('act-ready');
    readyBtn.classList.toggle('hidden', phase !== 'camp');
    readyBtn.textContent = meReady ? 'Not Ready (R)' : 'Ready (R)';
    $('act-shop').classList.toggle('hidden', !this.nearMerchant());
    const boxBtn = $('act-box');
    boxBtn.classList.toggle('hidden', !this.nearBox() || st.dead);
    const bx = this.state.bx;
    const take = !!(bx && bx[2] && bx[0] === this.myId);
    const boxLabel = take ? `Take ${POWERS[bx[3]].name}! (F)` : bx ? (bx[0] === this.myId ? 'Spinning...' : 'Box in use') : `Spin Mystery Box ${BOX_COST}g (F)`;
    if (boxBtn.textContent !== boxLabel) boxBtn.textContent = boxLabel;
    boxBtn.disabled = !take && (!!bx || st.g < BOX_COST);
    boxBtn.classList.toggle('take', take);
    if (this.shopOpen && (!this.nearMerchant() || st.dead)) this.toggleShop(false);

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
      const show = ch.length > 0 || !!(pz && pz.p);
      if (show && this.shopOpen) this.toggleShop(false);
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
        const me = this.profile.name;
        const pickers = pz.n.filter((n) => !(ch.length && n === me));
        if (!pz.p) wait = 'The next wave waits until you pick.';
        else if (!ch.length) wait = `Waiting for ${pickers.join(', ')} to pick an upgrade...`;
        else if (pickers.length) wait = `The game is paused until everyone picks. Also waiting for ${pickers.join(', ')}.`;
        else wait = 'The game is paused until you pick.';
        wait += ` (auto-pick in ${pz.t}s)`;
      }
      $('choices-wait').textContent = wait;
      if (show && this.chatOpen) this.toggleChat(false);
    }

    // Shop
    if (this.shopOpen) {
      $('shop-timer').textContent = phase === 'wave' ? 'Careful: monsters keep moving while you shop!' : '';
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
