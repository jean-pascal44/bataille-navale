// Effets sonores synthétisés avec la Web Audio API (aucun fichier audio).

let ctx = null;
let muted = false;
try { muted = localStorage.getItem('bn-muted') === '1'; } catch { /* ignore */ }

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(duration) {
  const a = ac();
  const buf = a.createBuffer(1, a.sampleRate * duration, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(node, t, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq, start, dur, type = 'sine', vol = 0.2, endFreq) {
  const a = ac();
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  env(g, t, vol, 0.01, dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst({ dur, freq, endFreq, q = 1, vol = 0.5, type = 'lowpass', delay = 0 }) {
  const a = ac();
  const t = a.currentTime + delay;
  const src = noise(dur + 0.1);
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = a.createGain();
  env(g, t, vol, 0.005, dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.1);
}

const sounds = {
  fire() {
    burst({ dur: 0.35, freq: 400, endFreq: 3000, type: 'bandpass', q: 2, vol: 0.25 });
  },
  splash() {
    burst({ dur: 0.6, freq: 2500, endFreq: 300, type: 'lowpass', vol: 0.35 });
    tone(600, 0, 0.15, 'sine', 0.05, 200);
  },
  hit() {
    burst({ dur: 0.9, freq: 1200, endFreq: 80, vol: 0.8 });
    tone(90, 0, 0.6, 'sine', 0.5, 35);
  },
  sunk() {
    burst({ dur: 1.4, freq: 900, endFreq: 50, vol: 0.9 });
    tone(70, 0, 1.2, 'sawtooth', 0.15, 25);
    tone(440, 0.4, 0.5, 'triangle', 0.08, 110);
  },
  turn() {
    tone(880, 0, 0.12, 'sine', 0.08);
    tone(1320, 0.1, 0.18, 'sine', 0.07);
  },
  place() {
    tone(220, 0, 0.08, 'square', 0.04, 160);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.3, 'triangle', 0.15));
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.3, 0.45, 'sawtooth', 0.06));
  },
  message() {
    tone(1200, 0, 0.08, 'sine', 0.05);
  },
};

export function play(name) {
  if (muted) return;
  try { sounds[name]?.(); } catch { /* audio indisponible */ }
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('bn-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

export const isMuted = () => muted;
