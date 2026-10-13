// Victor's World game server (Cloudflare Workers + Durable Objects).
// Each room code gets its own Durable Object (a tiny server that lives on Cloudflare),
// which runs the game rules from js/sim.js and streams snapshots to everyone in the room.
// The host's browser still owns the save: the room sends it back to the host as it changes.
import { DurableObject } from 'cloudflare:workers';
import { Sim } from '../js/sim.js';

const STEP = 1 / 60;
const TICK_MS = 50; // 20 snapshots a second
const MAX_PLAYERS = 8;
const SILENT_MS = 15000; // drop players we haven't heard from in this long
const EMPTY_MS = 60000; // keep an empty room around this long so people can reconnect
const SAVE_MS = 30000;
const MAX_MSG = 400000;
const MAX_FACE = 64000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{5})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const code = m[1].toUpperCase();
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sim = null;
    this.conns = new Map(); // player id -> conn
    this.nextId = 1;
  }

  async fetch(request) {
    this.code = new URL(request.url).pathname.slice(-5).toUpperCase();
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    const conn = { ws, id: null, pid: null, lastSeen: Date.now() };
    ws.addEventListener('message', (ev) => {
      conn.lastSeen = Date.now();
      if (typeof ev.data !== 'string' || ev.data.length > MAX_MSG) return;
      let d;
      try { d = JSON.parse(ev.data); } catch { return; }
      if (d && typeof d === 'object') this.onMessage(conn, d);
    });
    ws.addEventListener('close', () => this.drop(conn));
    ws.addEventListener('error', () => this.drop(conn));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(conn, msg) {
    try { conn.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* closed */ }
  }

  reject(conn, err) {
    this.send(conn, { t: 'err', err });
    try { conn.ws.close(1000, err); } catch { /* ignore */ }
  }

  onMessage(conn, d) {
    if (d.t === 'hello') return this.hello(conn, d);
    if (!conn.id || !this.sim) return;
    const isHost = conn.pid === this.hostPid;
    if (d.t === 'in') this.sim.setInput(conn.id, d);
    else if (d.t === 'act') this.sim.action(conn.id, d.a, d.v);
    else if (d.t === 'chat') {
      const p = this.sim.players.get(conn.id);
      const m = String(d.m || '').slice(0, 120);
      if (p && m.trim()) this.broadcast({ t: 'chat', from: p.name, m });
    } else if (d.t === 'face' && isHost) {
      this.face = validFace(d.face);
      this.sim.save.mobFace = this.face;
      this.broadcast({ t: 'face', face: this.face });
      this.syncSave();
    } else if (d.t === 'save' && isHost) this.syncSave();
  }

  hello(conn, d) {
    if (conn.id) return;
    const pid = String(d.pid || '').slice(0, 20);
    if (!pid) return this.reject(conn, 'bad');
    if (!this.sim) {
      // Nobody is hosting this code right now: only the host (who brings the save) can open it.
      if (!d.host || !validSave(d.host.save)) return this.reject(conn, 'nohost');
      this.open(d.host.save, pid, d.host.face, d.host.rules);
    } else if (d.host && pid !== this.hostPid) {
      return this.reject(conn, 'taken');
    }
    // Same player coming back (e.g. their connection dropped, or a second tab):
    // the new connection replaces the old one.
    for (const c of this.conns.values()) {
      if (c.pid === pid) { this.reject(c, 'dupe'); this.drop(c); }
    }
    if (this.sim.players.size >= MAX_PLAYERS) return this.reject(conn, 'full');
    const id = 'p' + this.nextId++;
    conn.id = id;
    conn.pid = pid;
    this.conns.set(id, conn);
    this.emptySince = 0;
    const p = this.sim.addPlayer(id, { pid, name: d.name, look: sanitizeLook(d.look) });
    const host = pid === this.hostPid;
    this.send(conn, {
      t: 'welcome', id, host, seed: this.sim.save.seed, name: this.sim.save.name, code: this.code,
      x: p.x, y: p.y, tpn: p.tpn, face: this.face || null,
    });
    this.sendRoster();
    this.syncSave();
  }

  open(save, hostPid, face, rules) {
    save.code = this.code;
    if (rules && typeof rules === 'object') save.rules = { revive: rules.revive === 'van' ? 'van' : 'classic' };
    this.hostPid = hostPid;
    this.face = validFace(face !== undefined ? face : save.mobFace);
    save.mobFace = this.face;
    this.sim = new Sim(save);
    this.sim.onSave = () => this.syncSave();
    this.sim.events = [];
    this.netEvents = [];
    this.acc = 0;
    this.last = Date.now();
    this.saveAt = Date.now();
    this.emptySince = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  close() {
    clearInterval(this.timer);
    this.timer = null;
    this.sim = null;
    this.hostPid = null;
    for (const c of this.conns.values()) try { c.ws.close(1000, 'closed'); } catch { /* ignore */ }
    this.conns.clear();
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    for (const c of [...this.conns.values()]) if (now - c.lastSeen > SILENT_MS) this.drop(c);
    if (!this.conns.size) {
      // Nobody here: freeze the world, and close it if nobody comes back.
      this.emptySince = this.emptySince || now;
      if (now - this.emptySince > EMPTY_MS) this.close();
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 15) {
      this.sim.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 15) this.acc = 0;
    this.netEvents.push(...this.sim.events);
    this.sim.events = [];

    const snap = this.sim.snapshot();
    const evs = this.netEvents;
    snap.fx = evs.filter((e) => e.k !== 'dmg').concat(evs.filter((e) => e.k === 'dmg').slice(-50));
    this.netEvents = [];
    const base = JSON.stringify(snap).slice(0, -1);
    for (const [id, c] of this.conns) this.send(c, `${base},"me":${JSON.stringify(this.sim.privateView(id))}}`);

    if (now - this.saveAt > SAVE_MS) this.syncSave();
  }

  drop(conn) {
    if (!conn.id || this.conns.get(conn.id) !== conn) return;
    this.conns.delete(conn.id);
    try { conn.ws.close(1000, 'bye'); } catch { /* ignore */ }
    if (!this.sim) return;
    this.sim.removePlayer(conn.id);
    this.sendRoster();
    this.syncSave();
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const c of this.conns.values()) this.send(c, s);
  }

  sendRoster() {
    this.broadcast({ t: 'roster', list: [...this.sim.players.values()].map((p) => [p.id, p.name, p.look]) });
  }

  // The save lives in the host's browser: send them the latest copy.
  syncSave() {
    if (!this.sim) return;
    this.saveAt = Date.now();
    const host = [...this.conns.values()].find((c) => c.pid === this.hostPid);
    if (host) this.send(host, { t: 'save', save: this.sim.snapshotSave() });
  }
}

function validSave(s) {
  return s && typeof s === 'object' && typeof s.seed === 'number' && s.players && typeof s.players === 'object';
}

function validFace(f) {
  return typeof f === 'string' && f.startsWith('data:image/png;base64,') && f.length < MAX_FACE ? f : null;
}

function sanitizeLook(l) {
  const n = (v, max) => Math.max(0, Math.min(max, Number(v) | 0));
  l = l || {};
  return { skin: n(l.skin, 5), hair: n(l.hair, 7), hairColor: n(l.hairColor, 7), outfit: n(l.outfit, 7), outfitColor: n(l.outfitColor, 8), extra: n(l.extra, 4), bald: n(l.bald, 1) };
}
