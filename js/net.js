// Connexion pair-à-pair WebRTC via PeerJS.
// Le serveur PeerJS public ne sert qu'à la mise en relation (signalisation) ;
// toutes les données de jeu passent ensuite directement entre les navigateurs.

const PREFIX = 'bataille-navale-famille-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const HEARTBEAT_MS = 3000;
const TIMEOUT_MS = 15000;

const PEER_OPTIONS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Si certains joueurs n'arrivent pas à se connecter (réseaux d'entreprise,
      // 4G stricte…), ajoutez ici un serveur TURN, par exemple :
      // { urls: 'turn:mon-serveur:3478', username: 'user', credential: 'pass' },
    ],
  },
};

export function randomCode(len = 5) {
  let s = '';
  const buf = crypto.getRandomValues(new Uint32Array(len));
  for (const n of buf) s += ALPHABET[n % ALPHABET.length];
  return s;
}

export const normalizeCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

export class Net {
  constructor() {
    this.handlers = {};
    this.peer = null;
    this.conn = null;
    this.lastSeen = 0;
    this.timer = null;
  }

  on(evt, fn) {
    (this.handlers[evt] ||= []).push(fn);
    return this;
  }

  emit(evt, ...args) {
    (this.handlers[evt] || []).forEach((fn) => fn(...args));
  }

  host() {
    const code = randomCode();
    this.peer = new Peer(PREFIX + code, PEER_OPTIONS);
    this.peer.on('open', () => this.emit('hosting', code));
    this.peer.on('connection', (conn) => {
      if (this.conn) {
        conn.on('open', () => {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.bind(conn);
    });
    this.peer.on('disconnected', () => {
      // Perte du serveur de signalisation : la partie en cours continue,
      // on tente juste de rester joignable.
      if (!this.peer.destroyed) try { this.peer.reconnect(); } catch { /* ignore */ }
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.peer.destroy();
        this.host();
      } else {
        this.emit('error', this.describe(err));
      }
    });
  }

  join(code) {
    this.peer = new Peer(PEER_OPTIONS);
    this.peer.on('open', () => {
      this.bind(this.peer.connect(PREFIX + normalizeCode(code), { reliable: true }));
    });
    this.peer.on('error', (err) => this.emit('error', this.describe(err)));
    const t = setTimeout(() => {
      if (!this.conn?.open) this.emit('error', 'Connexion impossible : vérifiez le code et votre réseau.');
    }, TIMEOUT_MS);
    this.on('connected', () => clearTimeout(t));
  }

  bind(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastSeen = Date.now();
      this.startHeartbeat();
      this.emit('connected');
    });
    conn.on('data', (msg) => {
      this.lastSeen = Date.now();
      if (msg?.type === 'ping') return;
      if (msg?.type === 'full') {
        this.emit('error', 'Cette partie est déjà complète.');
        return;
      }
      this.emit('message', msg);
    });
    conn.on('close', () => this.lost());
    conn.on('error', () => this.lost());
  }

  startHeartbeat() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.send({ type: 'ping' });
      if (Date.now() - this.lastSeen > TIMEOUT_MS) this.lost();
    }, HEARTBEAT_MS);
  }

  lost() {
    if (!this.conn) return;
    this.conn = null;
    clearInterval(this.timer);
    this.emit('disconnected');
  }

  send(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  destroy() {
    clearInterval(this.timer);
    this.handlers = {};
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.conn = null;
    this.peer = null;
  }

  describe(err) {
    switch (err.type) {
      case 'peer-unavailable': return 'Partie introuvable : vérifiez le code.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed': return 'Impossible de joindre le serveur de mise en relation. Réessayez.';
      case 'browser-incompatible': return 'Ce navigateur ne supporte pas WebRTC.';
      default: return `Erreur réseau (${err.type || err.message}).`;
    }
  }
}
