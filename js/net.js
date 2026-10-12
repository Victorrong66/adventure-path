// Peer-to-peer networking with PeerJS (WebRTC). The host's browser runs the game;
// friends connect straight to it using a short room code. No game server needed.
/* global Peer */
import { loadRelay } from './save.js';

const PREFIX = 'victorsworld-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function peerOptions() {
  // Optional self-hosted PeerJS signalling server: ?peerhost=example.com&peerport=443&peersecure=1
  const q = new URLSearchParams(location.search);
  const o = { debug: 1, config: { iceServers: iceServers() } };
  // ?relayonly=1 forces every connection through the relay (handy for testing a relay)
  if (q.get('relayonly') === '1') o.config.iceTransportPolicy = 'relay';
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport')) || 9000;
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

// Ways for two browsers to find each other. STUN servers help them connect directly;
// TURN relays pass the traffic along when a direct connection is impossible (common on
// mobile data and school or work Wi-Fi).
function iceServers() {
  const list = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    // PeerJS's free public relay
    {
      urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478?transport=tcp'],
      username: 'peerjs', credential: 'peerjsp',
    },
  ];
  // Victor's World's own relay (ExpressTURN free tier), tried before the PeerJS one.
  list.splice(1, 0, {
    urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'],
    username: '000000002107188947', credential: 'DJMBMEgVEpOL48nUKsBdaTONLlk=',
  });
  // A relay set in Settings (or brought in by an invite link) goes first.
  const relay = loadRelay();
  if (relay) list.unshift({ urls: relay.urls, username: relay.username, credential: relay.credential });
  return list;
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function friendlyError(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Could not find that world. Check the code and make sure the host is online.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser does not support WebRTC multiplayer.';
  if (t === 'negotiation-failed' || t === 'webrtc' || /negotiation/i.test((err && err.message) || '')) {
    return 'Found the world, but could not connect to the host from this network. ' +
      'Try both players on Wi-Fi, or set up a Multiplayer Relay in Settings and join with the host\'s invite link.';
  }
  return (err && err.message) || 'Connection failed.';
}

// Host a world. Returns { peer, code }. onConnection(conn) is called for each friend.
export function hostWorld(onConnection, tries = 4) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error('Multiplayer library failed to load.'));
    const code = makeCode();
    const peer = new Peer(PREFIX + code, peerOptions());
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ peer, code }); });
    peer.on('connection', (conn) => onConnection(conn));
    peer.on('error', (err) => {
      if (!opened) {
        peer.destroy();
        if (err.type === 'unavailable-id' && tries > 0) hostWorld(onConnection, tries - 1).then(resolve, reject);
        else reject(new Error(friendlyError(err)));
      } else console.warn('peer error', err);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  });
}

// Join a friend's world. Returns { peer, conn }.
export function joinWorld(code) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error('Multiplayer library failed to load.'));
    const peer = new Peer(peerOptions());
    let done = false;
    const fail = (msg) => { if (done) return; done = true; peer.destroy(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('Timed out connecting to the host. Try both players on Wi-Fi, or set up a Multiplayer Relay in Settings.'), 30000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + normalizeCode(code), { reliable: true, serialization: 'json' });
      conn.on('open', () => { done = true; clearTimeout(timer); resolve({ peer, conn }); });
      conn.on('error', (e) => fail(friendlyError(e)));
    });
    peer.on('error', (err) => { clearTimeout(timer); fail(friendlyError(err)); });
  });
}
