// Networking: everyone (the host included) connects to a room on the game server
// (a Cloudflare Durable Object, see server/worker.js) over a WebSocket. The room is
// picked by the 5-letter code.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

// The game server is normally the same site the game is served from.
// ?server=https://example.com points the game at a different one.
function roomUrl(code) {
  const base = new URLSearchParams(location.search).get('server') || location.origin;
  const u = new URL('/api/room/' + normalizeCode(code), base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.href;
}

// Connect to a room. Resolves with a small connection object:
// { open, send(obj), on('data' | 'close', fn), close() }.
export function connectRoom(code) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(roomUrl(code)); } catch { return reject(new Error('Could not reach the game server.')); }
    const handlers = { data: [], close: [] };
    const conn = {
      get open() { return ws.readyState === WebSocket.OPEN; },
      send(o) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); },
      on(ev, fn) { handlers[ev].push(fn); },
      close() { try { ws.close(); } catch { /* ignore */ } },
    };
    const timer = setTimeout(() => {
      conn.close();
      reject(new Error('Timed out reaching the game server. Check your internet connection.'));
    }, 15000);
    ws.onopen = () => { clearTimeout(timer); resolve(conn); };
    ws.onmessage = (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      for (const fn of handlers.data) fn(d);
    };
    ws.onclose = () => {
      clearTimeout(timer);
      reject(new Error('Could not reach the game server. Check your internet connection.'));
      for (const fn of handlers.close) fn();
    };
  });
}

// Why the server turned us away, in words a player understands.
export const JOIN_ERRORS = {
  nohost: 'That world isn\'t open right now. Ask the host to open it, then try again.',
  taken: 'That room code is being used by another world.',
  full: 'That world is full (8 players max).',
  dupe: 'You joined this world from another tab or device.',
  bad: 'Something went wrong joining. Try again.',
};
