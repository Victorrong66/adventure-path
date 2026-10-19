// Saves live in the host's browser (localStorage). Worlds can also be exported
// to a file and imported on another computer, so anyone can take over hosting.
// (The game server only holds a world while it's open, and sends the host updates.)
import { uid } from './util.js';
import { DEFAULT_LOOK } from './sprites.js';

const WORLDS_KEY = 'vw.worlds';
const PROFILE_KEY = 'vw.profile';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

export function loadProfile() {
  const p = read(PROFILE_KEY, null);
  if (p && p.pid) return { name: p.name || 'Hero', look: { ...DEFAULT_LOOK, ...p.look }, pid: p.pid, created: true };
  return { name: '', look: { ...DEFAULT_LOOK }, pid: uid(12), created: false };
}
export function saveProfile(p) { write(PROFILE_KEY, { name: p.name, look: p.look, pid: p.pid }); }

// Monster face photo (already shrunk to a tiny pixel face). undefined = never set,
// null = turned off, string = PNG data URL.
const FACE_KEY = 'vw.mobFace';
export function loadMobFace() {
  try {
    const v = localStorage.getItem(FACE_KEY);
    return v === null ? undefined : v === 'none' ? null : v;
  } catch { return undefined; }
}
export function saveMobFace(face) {
  try { localStorage.setItem(FACE_KEY, face || 'none'); } catch { /* ignore */ }
}

// Host game rules (Settings). revive: 'classic' = stand next to a downed friend,
// 'van' = carry their player card to the Reboot Van.
const RULES_KEY = 'vw.rules';
export function loadRules() {
  const r = read(RULES_KEY, {});
  return { revive: r.revive === 'van' ? 'van' : 'classic' };
}
export function saveRules(r) { write(RULES_KEY, r); }

export function listWorlds() {
  const all = read(WORLDS_KEY, {});
  return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export function getWorld(id) { return read(WORLDS_KEY, {})[id] || null; }
// The Test Arena has its own save, kept out of the world list.
const ARENA_KEY = 'vw.arena';
export function loadArena(make) {
  const s = read(ARENA_KEY, null);
  if (s && typeof s.seed === 'number') return s;
  return { ...make('Test Arena'), arena: true };
}
export function storeWorld(save) {
  if (save.arena) return write(ARENA_KEY, save);
  const all = read(WORLDS_KEY, {});
  all[save.id] = save;
  return write(WORLDS_KEY, all);
}
export function deleteWorld(id) {
  const all = read(WORLDS_KEY, {});
  delete all[id];
  write(WORLDS_KEY, all);
}

export function exportWorld(save) {
  const blob = new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${save.name.replace(/[^a-z0-9]+/gi, '_') || 'world'}.vworld.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importWorld(file) {
  return file.text().then((txt) => {
    const s = JSON.parse(txt);
    if (!s || typeof s.seed !== 'number' || typeof s.players !== 'object') throw new Error('Not an Adventure Path save file.');
    s.id = s.id || 'w' + Date.now().toString(36);
    s.updated = Date.now();
    storeWorld(s);
    return s;
  });
}
