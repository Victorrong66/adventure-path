// Chiptune sound effects and music made with the Web Audio API (square / triangle / noise).

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// MIDI note helpers
const A2 = 45, C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57;
const B3 = 59, C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, Gs4 = 68, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79;
const _ = null;

const SONGS = {
  battle: {
    bpm: 140,
    bass: [A2, A2, A3, A2, A2, A2, A3, A2, F3 - 12, F3 - 12, F3, F3 - 12, G3 - 12, G3 - 12, G3, G3 - 12,
      A2, A2, A3, A2, A2, A2, A3, A2, E3 - 12, E3 - 12, E3, E3 - 12, E3 - 12, E3 - 12, E3, E3 - 12],
    lead: [A4, _, C5, _, E5, _, D5, C5, B4, _, G4, _, B4, _, D5, _,
      C5, _, A4, _, C5, _, F5, E5, E5, _, _, _, Gs4, _, B4, _],
  },
  camp: {
    bpm: 96,
    bass: [C3, _, G3, _, C3, _, G3, _, A2, _, E3, _, A2, _, E3, _, F3 - 12, _, C3, _, F3 - 12, _, C3, _, G3 - 12, _, D3, _, G3 - 12, _, B3 - 12, _],
    lead: [E4, _, G4, _, C5, _, G4, _, E4, _, A4, _, C5, _, _, _, F4, _, A4, _, C5, _, A4, _, D4, _, G4, _, B4, _, D5, _],
  },
};

export class Audio8 {
  constructor() {
    this.ctx = null;
    let m = false;
    try { m = localStorage.getItem('vw.muted') === '1'; } catch { /* ignore */ }
    this.muted = m;
    this.song = null;
    this.step = 0;
    this.nextT = 0;
    this.last = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.22;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    setInterval(() => this.schedule(), 50);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('vw.muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.22;
    return this.muted;
  }

  tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur);
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap = { shoot: 70, hit: 50, xp: 40, die: 50, coin: 60 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(1200, 0.06, 'square', 0.05, -700); break;
      case 'hit': this.noise(0.04, 0.08); break;
      case 'die': this.tone(300, 0.12, 'square', 0.08, -220); this.noise(0.08, 0.06); break;
      case 'xp': this.tone(1568, 0.04, 'triangle', 0.08); break;
      case 'coin': this.tone(988, 0.06, 'square', 0.1); this.tone(1319, 0.12, 'square', 0.1, 0, 0.06); break;
      case 'heal': [C5, E5, G5].forEach((n, i) => this.tone(NOTE(n), 0.1, 'triangle', 0.15, 0, i * 0.06)); break;
      case 'hurt': this.tone(180, 0.18, 'sawtooth', 0.15, -100); break;
      case 'zap': this.noise(0.18, 0.18); this.tone(2000, 0.12, 'square', 0.05, -1800); break;
      case 'lvl': [C4, E4, G4, C5, E5].forEach((n, i) => this.tone(NOTE(n), 0.12, 'square', 0.12, 0, i * 0.07)); break;
      case 'pick': this.tone(NOTE(G5), 0.1, 'square', 0.1); this.tone(NOTE(C5 + 12), 0.15, 'square', 0.1, 0, 0.08); break;
      case 'wave': [A3, C4, E4, A4].forEach((n, i) => this.tone(NOTE(n), 0.16, 'square', 0.14, 0, i * 0.12)); break;
      case 'boss': [A2, A2 + 1, A2, A2 + 1].forEach((n, i) => this.tone(NOTE(n + 12), 0.25, 'sawtooth', 0.15, 0, i * 0.25)); break;
      case 'clear': [C4, E4, G4, C5, G4, C5].forEach((n, i) => this.tone(NOTE(n), 0.14, 'square', 0.12, 0, i * 0.1)); break;
      case 'wipe': [E4, D4, C4, B3, A3].forEach((n, i) => this.tone(NOTE(n), 0.25, 'triangle', 0.18, 0, i * 0.18)); break;
      case 'roar': this.tone(120, 0.4, 'sawtooth', 0.15, -60); this.noise(0.3, 0.1); break;
      case 'down': this.tone(440, 0.4, 'square', 0.12, -380); break;
      case 'revive': [C4, G4, C5].forEach((n, i) => this.tone(NOTE(n), 0.12, 'triangle', 0.15, 0, i * 0.08)); break;
      case 'giant': [C4, G4, C5, E5, G5, C5 + 12].forEach((n, i) => this.tone(NOTE(n), 0.12, 'square', 0.13, 0, i * 0.06)); this.noise(0.4, 0.08, 0.3); break;
      case 'slash': this.noise(0.07, 0.1); this.tone(900, 0.07, 'square', 0.05, -600); break;
      case 'dash': this.noise(0.08, 0.06); this.tone(600, 0.08, 'triangle', 0.06, 400); break;
      case 'ui': this.tone(880, 0.04, 'square', 0.08); break;
    }
  }

  playSong(name) {
    if (this.song === name) return;
    this.song = name;
    this.step = 0;
    if (this.ctx) this.nextT = this.ctx.currentTime + 0.1;
  }

  schedule() {
    if (!this.ctx || !this.song) return;
    const s = SONGS[this.song];
    const stepDur = 60 / s.bpm / 2;
    if (this.nextT < this.ctx.currentTime) this.nextT = this.ctx.currentTime + 0.05;
    while (this.nextT < this.ctx.currentTime + 0.2) {
      const i = this.step % s.bass.length;
      const delay = this.nextT - this.ctx.currentTime;
      if (s.bass[i] != null) this.tone(NOTE(s.bass[i]), stepDur * 0.9, 'triangle', 0.35, 0, delay, this.musicGain);
      if (s.lead[i] != null) this.tone(NOTE(s.lead[i]), stepDur * 1.6, 'square', 0.07, 0, delay, this.musicGain);
      if (this.song === 'battle' && i % 4 === 2) this.noiseAt(delay, 0.05);
      this.nextT += stepDur;
      this.step++;
    }
  }

  noiseAt(delay, vol) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.06);
  }
}
