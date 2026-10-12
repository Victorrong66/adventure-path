// Saves live in the host's browser (localStorage). Worlds can also be exported
// to a file and imported on another computer, so anyone can take over hosting.
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

// Optional TURN relay for players on strict networks: { urls: [..], username, credential }.
const RELAY_KEY = 'vw.relay';
export function loadRelay() {
  const r = read(RELAY_KEY, null);
  return r && Array.isArray(r.urls) && r.urls.length ? r : null;
}
export function saveRelay(r) {
  try {
    if (r) localStorage.setItem(RELAY_KEY, JSON.stringify(r));
    else localStorage.removeItem(RELAY_KEY);
  } catch { /* ignore */ }
}

// Turn what someone typed into a relay config. Accepts several URLs separated by
// spaces, commas or new lines, with or without the turn: prefix.
export function parseRelay(urlText, username, credential) {
  const urls = String(urlText || '').split(/[\s,]+/).map((u) => u.trim()).filter(Boolean)
    .map((u) => u.replace(/^https?:\/\//i, '').replace(/\/+$/, ''))
    .map((u) => (/^(turns?|stun):/i.test(u) ? u : 'turn:' + u));
  if (!urls.length) return null;
  return { urls, username: String(username || '').trim(), credential: String(credential || '').trim() };
}

// Relay settings travel inside invite links so friends don't have to type them.
export function encodeRelay(r) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/=+$/, '');
}
export function decodeRelay(s) {
  try {
    const r = JSON.parse(decodeURIComponent(escape(atob(s))));
    return r && Array.isArray(r.urls) ? parseRelay(r.urls.join(' '), r.username, r.credential) : null;
  } catch { return null; }
}

export function listWorlds() {
  const all = read(WORLDS_KEY, {});
  return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export function getWorld(id) { return read(WORLDS_KEY, {})[id] || null; }
export function storeWorld(save) {
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
    if (!s || typeof s.seed !== 'number' || typeof s.players !== 'object') throw new Error('Not a Victor\'s World save file.');
    s.id = s.id || 'w' + Date.now().toString(36);
    s.updated = Date.now();
    storeWorld(s);
    return s;
  });
}
