// Menus, character creator and session start-up.
import { Renderer } from './render.js';
import { Audio8 } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { connectRoom, makeCode, normalizeCode } from './net.js';
import { newWorldSave } from './sim.js';
import { World } from './world.js';
import {
  SKINS, HAIR_STYLES, HAIR_COLORS, OUTFITS, OUTFIT_COLORS, EXTRAS, charSprite,
  processFacePhoto, setMobFace, monsterSprite, RUN_FRAME_MS,
} from './sprites.js';
import {
  loadMobFace, saveMobFace, loadRules, saveRules, loadArena,
  loadProfile, saveProfile, listWorlds, getWorld, storeWorld, deleteWorld, exportWorld, importWorld,
} from './save.js';
import { escapeHtml } from './util.js';
import { loadHeroSheet, loadMobSheet } from './sprites.js';

// The hero sprites must be loaded before anything is drawn.
await Promise.all([loadHeroSheet(), loadMobSheet()]);

const $ = (id) => document.getElementById(id);

const renderer = new Renderer($('game'));
const audio = new Audio8();
const input = new Input();
input.bindTouch($('game'), $('stick'), $('knob'));
input.bindMouse($('game'));
let profile = loadProfile();
let game = null;
let afterCharScreen = 'title';

// Start audio on the first interaction (browsers require a gesture).
const unlock = () => { audio.init(); audio.playSong('camp'); };
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });
document.addEventListener('click', (e) => { if (e.target.closest('.btn')) audio.sfx('ui'); });

// ------------------------------------------------------------------ screens

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (name) $('scr-' + name).classList.remove('hidden');
  if (name === 'title') refreshTitle();
  if (name === 'host') renderWorldList();
  if (name === 'char') openCreator();
  if (name === 'settings') refreshSettings();
}

document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { clearTimeout(rejoinTimer); show('title'); }));

function refreshTitle() {
  $('hello').textContent = profile.created ? `Welcome back, ${profile.name}!` : '';
  $('btn-edit').textContent = profile.created ? 'Edit Character' : 'Create Character';
}

function needCharacter(next) {
  if (profile.created) return true;
  afterCharScreen = next;
  show('char');
  return false;
}

$('btn-host').addEventListener('click', () => { if (needCharacter('host')) show('host'); });
$('btn-join').addEventListener('click', () => { if (needCharacter('join')) { show('join'); $('join-code').focus(); } });
$('btn-edit').addEventListener('click', () => { afterCharScreen = 'title'; show('char'); });
$('btn-arena').addEventListener('click', () => { if (needCharacter('arena')) startArena(); });
$('btn-settings').addEventListener('click', () => show('settings'));

// ------------------------------------------------------------------ settings

async function refreshSettings() {
  const face = loadMobFace() || null;
  $('set-face-preview').classList.toggle('hidden', !face);
  $('set-face-none').classList.toggle('hidden', !!face);
  $('set-face-clear').classList.toggle('hidden', !face);
  $('set-face-demo').classList.toggle('hidden', !face);
  $('set-mute').textContent = audio.muted ? 'Sound: Off' : 'Sound: On';
  const van = loadRules().revive === 'van';
  $('set-revive-classic').classList.toggle('on', !van);
  $('set-revive-van').classList.toggle('on', van);
  $('set-revive-desc').textContent = van
    ? 'A downed player drops their player card. Grab it, drop it off at the Reboot Van and stay by the van while it reboots them.'
    : 'Stand next to a downed player for a few seconds to revive them.';
  if (!face) return;
  $('set-face-preview').src = face;
  // Show what the monsters will look like
  await setMobFace(face);
  const c = $('set-face-demo'), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  let x = 4;
  for (const t of ['slime', 'bat', 'goblin', 'skeleton', 'ghost', 'imp', 'ogre']) {
    const s = monsterSprite(t, 1, 0);
    if (t === 'ghost') g.globalAlpha = 0.75;
    g.drawImage(s.img, x, c.height - 2 - s.img.height);
    g.globalAlpha = 1;
    x += s.img.width + 2;
  }
  await setMobFace(null);
}

$('set-face-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const status = $('settings-status');
  status.classList.remove('err');
  try {
    saveMobFace(await processFacePhoto(f));
    status.textContent = 'Saved! Monsters will wear this face when you host.';
    refreshSettings();
  } catch (err) { status.textContent = err.message; status.classList.add('err'); }
});
$('set-face-clear').addEventListener('click', () => {
  saveMobFace(null);
  $('settings-status').textContent = 'Monsters are back to normal.';
  refreshSettings();
});
$('set-mute').addEventListener('click', () => { audio.toggleMute(); refreshSettings(); });
for (const mode of ['classic', 'van']) {
  $('set-revive-' + mode).addEventListener('click', () => {
    saveRules({ ...loadRules(), revive: mode });
    $('settings-status').textContent = 'Saved! This applies the next time you host a world.';
    refreshSettings();
  });
}

// ------------------------------------------------------------------ title background
// The menus sit on top of a live view of a demo world.

const demoWorld = new World(12345);
const demoHeroes = [0, 1, 2, 3].map((i) => ({
  id: 'd' + i, name: '', look: { skin: (i * 2) % 6, hair: (i * 3) % 8, hairColor: (i * 5) % 8, outfit: i % 6, outfitColor: (i * 3 + 1) % 8, extra: i % 3 },
  x: demoWorld.cx + Math.cos(i * 1.6) * 3, y: demoWorld.cy + Math.sin(i * 1.6) * 3, dir: 0, mv: true, hp: 1, maxHp: 1, dead: false, au: 0, bl: i === 1 ? 2 : 0,
}));
let demoT = 0;
function demoFrame(dt) {
  demoT += dt;
  demoHeroes.forEach((h, i) => {
    const a = demoT * 0.4 + i * 1.6;
    const nx = demoWorld.cx + Math.cos(a) * 3.2, ny = demoWorld.cy + Math.sin(a) * 3.2;
    const sdx = nx - h.x, sdy = ny - h.y;
    h.dir = Math.abs(sdx) > Math.abs(sdy) ? (sdx > 0 ? 2 : 3) : (sdy > 0 ? 0 : 1);
    h.x = nx; h.y = ny;
  });
  renderer.draw({ world: demoWorld, players: demoHeroes, enemies: [], projs: [], pickups: [], me: null, meId: null, time: demoT, phase: 'demo' }, dt);
  // Title hero preview
  const tc = $('title-hero').getContext('2d');
  tc.clearRect(0, 0, 28, 34);
  const ts = charSprite(profile.look, 0, 0, 'idle');
  tc.drawImage(ts.img, 14 - ts.ox, 33 - ts.oy - (Math.floor(demoT * 2) % 2));
}
let lastT = performance.now();
(function menuLoop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000));
  lastT = now;
  if (!game) demoFrame(dt);
  requestAnimationFrame(menuLoop);
})(lastT);

// ------------------------------------------------------------------ character creator

let draft = null;
let previewDir = 0;
const DIRS = [0, 2, 1, 3];

function openCreator() {
  draft = { name: profile.name, look: { ...profile.look } };
  $('char-name').value = draft.name;
  buildSwatches('skin', SKINS);
  buildSwatches('hairColor', HAIR_COLORS);
  buildSwatches('outfitColor', OUTFIT_COLORS);
  updateCreator();
}

function buildSwatches(key, colors) {
  const el = $('sw-' + key);
  el.innerHTML = colors.map((c, i) => `<button class="swatch" data-sw="${key}" data-i="${i}" style="background:${c}" aria-label="${key} ${i + 1}"></button>`).join('');
}

function updateCreator() {
  for (const el of document.querySelectorAll('.swatch')) el.classList.toggle('on', draft.look[el.dataset.sw] === Number(el.dataset.i));
  $('lbl-hair').textContent = HAIR_STYLES[draft.look.bald ? 1 : 0];
  $('lbl-outfit').textContent = OUTFITS[draft.look.outfit];
  $('lbl-extra').textContent = EXTRAS[draft.look.extra | 0];
}

document.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-sw]');
  if (sw && draft) { draft.look[sw.dataset.sw] = Number(sw.dataset.i); updateCreator(); }
  const cyc = e.target.closest('[data-cyc]');
  if (cyc && draft) {
    const k = cyc.dataset.cyc === 'hair' ? 'bald' : cyc.dataset.cyc; // the hair style is spiky or bald
    const n = k === 'bald' ? HAIR_STYLES.length : k === 'extra' ? EXTRAS.length : OUTFITS.length;
    draft.look[k] = ((draft.look[k] | 0) + Number(cyc.dataset.d) + n) % n;
    updateCreator();
  }
});
$('rot-left').addEventListener('click', () => { previewDir = (previewDir + 3) % 4; });
$('rot-right').addEventListener('click', () => { previewDir = (previewDir + 1) % 4; });
$('char-random').addEventListener('click', () => {
  const r = (n) => (Math.random() * n) | 0;
  draft.look = { skin: r(SKINS.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), outfit: r(OUTFITS.length), outfitColor: r(OUTFIT_COLORS.length), extra: r(EXTRAS.length), bald: Math.random() < 0.15 ? 1 : 0 };
  updateCreator();
});
$('char-done').addEventListener('click', () => {
  const name = $('char-name').value.trim().slice(0, 12);
  if (!name) { $('char-name').focus(); $('char-name').placeholder = 'Type a name!'; return; }
  profile = { ...profile, name, look: draft.look, created: true };
  saveProfile(profile);
  if (afterCharScreen === 'arena') { show('title'); startArena(); return; }
  show(afterCharScreen);
  if (afterCharScreen === 'join') joinFromInvite();
});

(function previewLoop() {
  const c = $('char-preview');
  if (draft && !$('scr-char').classList.contains('hidden')) {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(90, 186, 60, 8);
    // Show off the poses: walk, breathe, swing
    const t = performance.now() % 3600;
    const s = t < 1800 ? charSprite(draft.look, DIRS[previewDir], Math.floor(t / RUN_FRAME_MS))
      : t < 3000 ? charSprite(draft.look, DIRS[previewDir], Math.floor(t / 140), 'idle')
        : charSprite(draft.look, DIRS[previewDir], (t - 3000) / 600, 'atk');
    g.drawImage(s.img, 120 - s.ox * 5, 190 - s.oy * 5, s.img.width * 5, s.img.height * 5);
  }
  requestAnimationFrame(previewLoop);
})();

// ------------------------------------------------------------------ hosting

function renderWorldList() {
  const worlds = listWorlds();
  $('host-status').textContent = '';
  $('host-status').classList.remove('err');
  $('world-list').innerHTML = worlds.length ? worlds.map((w) => `
    <div class="world">
      <div class="info"><b>${escapeHtml(w.name)}</b>
        <div class="meta">Wave ${w.checkpoint || 1} &middot; Best ${w.bestWave || 0} &middot; ${w.kills || 0} kills &middot; ${Object.keys(w.players || {}).length} heroes</div>
        <div class="meta">Room code: ${escapeHtml(w.code || 'new one when you play')}</div>
        <div class="meta">Saved ${new Date(w.updated || w.created).toLocaleString()}</div>
      </div>
      <button class="btn primary" data-load="${w.id}">Play</button>
      <button class="btn tiny" data-export="${w.id}">Export</button>
      <button class="btn tiny" data-newcode="${w.id}" title="Old codes stop working">New Code</button>
      <button class="btn tiny danger" data-del="${w.id}">Delete</button>
    </div>`).join('') : '<p class="small">No saved worlds yet. Make one below!</p>';
}

$('world-list').addEventListener('click', (e) => {
  const load = e.target.closest('[data-load]');
  const exp = e.target.closest('[data-export]');
  const del = e.target.closest('[data-del]');
  const nc = e.target.closest('[data-newcode]');
  if (load) startHosting(getWorld(load.dataset.load));
  if (nc) {
    const w = getWorld(nc.dataset.newcode);
    if (w) { w.code = makeCode(); storeWorld(w); renderWorldList(); $('host-status').textContent = `New room code: ${w.code}. The old one no longer works.`; }
  }
  if (exp) exportWorld(getWorld(exp.dataset.export));
  if (del) {
    const w = getWorld(del.dataset.del);
    if (w && confirm(`Delete "${w.name}" forever?`)) { deleteWorld(w.id); renderWorldList(); }
  }
});

$('btn-new-world').addEventListener('click', () => {
  const name = $('new-world-name').value.trim() || `${profile.name}'s World`;
  const save = newWorldSave(name.slice(0, 20));
  storeWorld(save);
  startHosting(save);
});

$('import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { await importWorld(f); renderWorldList(); $('host-status').textContent = 'Save imported!'; }
  catch (err) { $('host-status').textContent = err.message; $('host-status').classList.add('err'); }
});

// Each world keeps its room code, so friends can rejoin with the same code next time.
async function startHosting(save) {
  if (!save) return;
  const status = $('host-status');
  status.classList.remove('err');
  status.textContent = 'Opening your world...';
  audio.init();
  if (!save.code) { save.code = makeCode(); storeWorld(save); }
  let err = await tryJoin(save.code, save);
  if (err && err.code === 'taken') {
    // Another world is using this code right now (very unlikely): pick a new one.
    save.code = makeCode();
    storeWorld(save);
    err = await tryJoin(save.code, save);
  }
  if (err) { status.textContent = err.message; status.classList.add('err'); return; }
  showToast(`Room code: ${game.code} — share it with your friends!`, 5000);
}

// The Test Arena: a sandbox world (its own save, never in the world list). Friends
// can join it with its room code like any world.
async function startArena() {
  audio.init();
  const save = loadArena(newWorldSave);
  if (!save.code) { save.code = makeCode(); storeWorld(save); }
  let err = await tryJoin(save.code, save);
  if (err && err.code === 'taken') { save.code = makeCode(); storeWorld(save); err = await tryJoin(save.code, save); }
  if (err) { show('title'); showToast(err.message, 5000); return; }
  showToast(`Test Arena! Press T (or Arena Tools) for tools. Room code: ${game.code}`, 6000);
}

// ------------------------------------------------------------------ joining

$('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join-go').click(); });
let rejoinTimer = null;
let joining = false;

// Join a room (or open it, when hostSave is given). Returns null, or the error.
async function tryJoin(code, hostSave = null) {
  let conn = null;
  try {
    conn = await connectRoom(code);
    const g = new Game({ profile, renderer, audio, input, onExit: endGame });
    await g.start(conn, hostSave);
    game = g;
    show(null);
    return null;
  } catch (err) {
    try { conn && conn.close(); } catch { /* ignore */ }
    return err;
  }
}

$('btn-join-go').addEventListener('click', async () => {
  clearTimeout(rejoinTimer);
  if (joining) return;
  const code = normalizeCode($('join-code').value);
  const status = $('join-status');
  status.classList.remove('err');
  if (code.length !== 5) { status.textContent = 'Codes are 5 letters long.'; status.classList.add('err'); return; }
  status.textContent = 'Connecting...';
  audio.init();
  joining = true;
  const err = await tryJoin(code);
  joining = false;
  if (err) { status.textContent = err.message; status.classList.add('err'); }
});

// After a dropped connection, keep trying to get back in for about a minute.
// The host re-opens the world from their save if the room has closed meanwhile.
function autoRejoin(code, hostSave, attempt = 1) {
  const MAX = 8;
  const status = $('join-status');
  status.classList.remove('err');
  status.textContent = `Connection lost. Reconnecting... (try ${attempt} of ${MAX})`;
  rejoinTimer = setTimeout(async () => {
    if ($('scr-join').classList.contains('hidden')) return; // player left this screen
    joining = true;
    const err = await tryJoin(code, hostSave && (getWorld(hostSave.id) || hostSave));
    joining = false;
    if (!err) { showToast('Reconnected!', 2500); return; }
    if (err.code === 'dupe' || err.code === 'full') { status.textContent = err.message; status.classList.add('err'); return; }
    if (attempt < MAX && !$('scr-join').classList.contains('hidden')) autoRejoin(code, hostSave, attempt + 1);
    else { status.textContent = `${err.message} (Tap Join to try again.)`; status.classList.add('err'); }
  }, Math.min(8000, 1500 * attempt));
}

function endGame(message, opts = {}) {
  game = null;
  if (opts.rejoin) {
    show('join');
    $('join-code').value = opts.rejoin;
    autoRejoin(opts.rejoin, opts.hostSave);
    return;
  }
  show('title');
  if (message) showToast(message, 5000);
}

let toastTimer = null;
function showToast(msg, ms = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// ------------------------------------------------------------------ boot

const joinParam = new URLSearchParams(location.search).get('join');
// Invite links (?join=CODE) take you straight into the friend's world.
// First-timers make a character first, then join automatically.
let inviteCode = joinParam ? normalizeCode(joinParam) : '';
if (inviteCode) { // don't rejoin on reload
  const q = new URLSearchParams(location.search);
  q.delete('join');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
}
function joinFromInvite() {
  if (!inviteCode) return;
  $('join-code').value = inviteCode;
  inviteCode = '';
  $('btn-join-go').click();
}
show('title');
if (inviteCode && needCharacter('join')) { show('join'); joinFromInvite(); }
