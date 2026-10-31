import { Board, FLEET, SIZE, COLS, shipDef, cellsFor, coordName } from './game.js';
import { Net, normalizeCode } from './net.js';
import { play, toggleMute, isMuted } from './sound.js';

const $ = (sel) => document.querySelector(sel);
const EMOTES = ['👏', '😅', '🔥', '😱', '🎯', '🏴‍☠️'];
const DEFAULT_NAMES = ['Capitaine Nemo', 'Amiral Tempête', 'Corsaire Rouge', 'Mousse Intrépide', 'Vieux Loup de Mer'];

const state = {
  net: null,
  role: null,           // 'host' | 'guest'
  name: '',
  oppName: 'Adversaire',
  bonus: false,         // rejouer après un tir touché
  phase: 'lobby',       // lobby | wait | placement | battle | over
  board: new Board(),
  enemy: new Array(SIZE * SIZE).fill(null), // null | 'miss' | 'hit' | 'sunk' | 'pending'
  enemySunk: new Set(),
  enemyReveal: [],
  selected: null,
  dir: 'h',
  hover: null,
  ready: false,
  oppReady: false,
  myTurn: false,
  pending: false,
  rematchMe: false,
  rematchOpp: false,
  unread: 0,
};

/* ---------------------------------------------------------------- utilitaires */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function setPhase(phase) {
  state.phase = phase;
  document.body.dataset.phase = phase;
}

function toast(text, kind = '') {
  const t = el('div', `toast ${kind}`, text);
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3300);
}

function setBanner(text, kind = '') {
  const b = $('#banner');
  b.textContent = text;
  b.className = `banner ${kind}`;
}

function fx(cell, kind) {
  const f = el('span', `fx fx-${kind}`);
  cell.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

function shake(node) {
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}

function floatEmote(emoji) {
  const e = el('div', 'float-emote', emoji);
  e.style.left = `${20 + Math.random() * 60}%`;
  document.body.appendChild(e);
  setTimeout(() => e.remove(), 2200);
}

/* ---------------------------------------------------------------- grilles */

function buildGrid(root) {
  root.innerHTML = '';
  root.appendChild(el('div', 'label corner'));
  for (let x = 0; x < SIZE; x++) root.appendChild(el('div', 'label col', COLS[x]));
  const cells = [];
  for (let y = 0; y < SIZE; y++) {
    root.appendChild(el('div', 'label row', y + 1));
    cells[y] = [];
    for (let x = 0; x < SIZE; x++) {
      const b = el('button', 'cell');
      b.type = 'button';
      b.dataset.x = x;
      b.dataset.y = y;
      b.setAttribute('aria-label', coordName(x, y));
      root.appendChild(b);
      cells[y][x] = b;
    }
  }
  return cells;
}

const meCells = buildGrid($('#grid-me'));
const enemyCells = buildGrid($('#grid-enemy'));

function cellFromEvent(e) {
  const c = e.target.closest('.cell');
  return c ? [Number(c.dataset.x), Number(c.dataset.y)] : null;
}

function paintShip(cells, ship, extra = '') {
  ship.cells.forEach(([x, y], i) => {
    const c = cells[y][x];
    c.classList.add('ship', ship.dir);
    if (i === 0) c.classList.add('bow');
    if (i === ship.cells.length - 1) c.classList.add('stern');
    if (extra) c.classList.add(extra);
  });
}

function renderMe() {
  const { board } = state;
  meCells.flat().forEach((c) => { c.className = 'cell'; });

  for (const ship of board.ships) {
    paintShip(meCells, ship, board.isSunk(ship) ? 'sunk' : '');
    if (state.phase === 'placement' && ship.id === state.selected) {
      ship.cells.forEach(([x, y]) => meCells[y][x].classList.add('lifted'));
    }
  }
  for (const [key, res] of board.shots) {
    const [x, y] = key.split(',').map(Number);
    meCells[y][x].classList.add(res);
  }

  if (state.phase === 'placement' && state.selected && state.hover) {
    const [hx, hy] = state.hover;
    const ok = board.canPlace(state.selected, hx, hy, state.dir);
    for (const [x, y] of cellsFor(hx, hy, shipDef(state.selected).size, state.dir)) {
      if (x < SIZE && y < SIZE) meCells[y][x].classList.add('preview', ok ? 'ok' : 'bad');
    }
  }
}

function renderEnemy() {
  enemyCells.flat().forEach((c, i) => {
    c.className = 'cell';
    if (state.enemy[i]) c.classList.add(state.enemy[i]);
  });
  for (const ship of state.enemyReveal) paintShip(enemyCells, ship, 'ghost');
  const canFire = state.phase === 'battle' && state.myTurn && !state.pending;
  $('#enemy-wrap').classList.toggle('can-fire', canFire);
}

function pips(n) {
  const p = el('span', 'pips');
  for (let i = 0; i < n; i++) p.appendChild(el('i'));
  return p;
}

function renderFleets() {
  const me = $('#fleet-me');
  const enemy = $('#fleet-enemy');
  me.innerHTML = '';
  enemy.innerHTML = '';
  for (const def of FLEET) {
    const ship = state.board.ships.find((s) => s.id === def.id);
    const mine = el('li', ship && state.board.isSunk(ship) ? 'down' : '');
    mine.append(pips(def.size), el('span', '', def.name));
    me.appendChild(mine);

    const theirs = el('li', state.enemySunk.has(def.id) ? 'down' : '');
    theirs.append(pips(def.size), el('span', '', def.name));
    enemy.appendChild(theirs);
  }
}

function renderDock() {
  const list = $('#dock-ships');
  list.innerHTML = '';
  for (const def of FLEET) {
    const li = el('li');
    const b = el('button', 'dock-ship');
    b.type = 'button';
    b.dataset.id = def.id;
    if (state.board.isPlaced(def.id)) b.classList.add('placed');
    if (state.selected === def.id) b.classList.add('selected');
    b.disabled = state.ready;
    b.append(pips(def.size), el('span', '', def.name));
    li.appendChild(b);
    list.appendChild(li);
  }
  $('#btn-ready').disabled = !state.board.allPlaced || state.ready;
  ['#btn-rotate', '#btn-random', '#btn-clear'].forEach((s) => { $(s).disabled = state.ready; });
}

function render() {
  renderMe();
  renderEnemy();
  renderFleets();
  if (state.phase === 'placement') renderDock();
}

/* ---------------------------------------------------------------- placement */

const nextUnplaced = () => FLEET.find((s) => !state.board.isPlaced(s.id))?.id ?? null;

function enterPlacement() {
  setPhase('placement');
  state.board = new Board();
  state.enemy.fill(null);
  state.enemySunk.clear();
  state.enemyReveal = [];
  state.ready = false;
  state.oppReady = false;
  state.myTurn = false;
  state.pending = false;
  state.rematchMe = false;
  state.rematchOpp = false;
  state.selected = FLEET[0].id;
  state.dir = 'h';
  $('#me-title').textContent = 'Placez votre flotte';
  $('#dock-wait').classList.add('hidden');
  $('#name-me').textContent = state.name;
  $('#name-opp').textContent = state.oppName;
  hideModal();
  showScreen('screen-game');
  setBanner(`Déployez votre flotte, ${state.name} !`);
  render();
}

function rotate() {
  if (state.phase !== 'placement' || state.ready) return;
  state.dir = state.dir === 'h' ? 'v' : 'h';
  renderMe();
}

function onPlaceClick(x, y) {
  if (state.phase !== 'placement' || state.ready) return;
  const { board } = state;
  if (state.selected && board.place(state.selected, x, y, state.dir)) {
    play('place');
    state.selected = nextUnplaced();
  } else {
    const ship = board.shipAt(x, y);
    if (ship) {
      state.selected = ship.id;
      state.dir = ship.dir;
    } else if (state.selected) {
      shake(meCells[y][x]);
    }
  }
  render();
}

function onReady() {
  if (!state.board.allPlaced) return;
  state.ready = true;
  state.selected = null;
  state.net.send({ type: 'ready' });
  const w = $('#dock-wait');
  w.textContent = state.oppReady ? 'Lancement…' : `En attente de ${state.oppName}…`;
  w.classList.remove('hidden');
  setBanner(state.oppReady ? 'Le combat commence !' : `En attente de ${state.oppName}…`, 'wait');
  render();
  maybeStart();
}

function maybeStart() {
  if (state.role !== 'host' || !state.ready || !state.oppReady || state.phase !== 'placement') return;
  const first = Math.random() < 0.5 ? 'host' : 'guest';
  state.net.send({ type: 'start', first });
  beginBattle(first === 'host');
}

/* ---------------------------------------------------------------- combat */

function beginBattle(myFirst) {
  setPhase('battle');
  state.myTurn = myFirst;
  state.pending = false;
  $('#me-title').textContent = 'Votre flotte';
  toast(myFirst ? 'Vous tirez en premier !' : `${state.oppName} tire en premier.`, 'info');
  updateTurnBanner();
  render();
}

function updateTurnBanner() {
  if (state.phase !== 'battle') return;
  if (state.myTurn) {
    setBanner('🎯 À vous de tirer !', 'my-turn');
    play('turn');
  } else {
    setBanner(`⏳ ${state.oppName} vise…`, 'their-turn');
  }
}

function fire(x, y) {
  const i = y * SIZE + x;
  if (state.phase !== 'battle' || !state.myTurn || state.pending || state.enemy[i]) return;
  state.pending = true;
  state.enemy[i] = 'pending';
  state.net.send({ type: 'shot', x, y });
  play('fire');
  renderEnemy();
}

function onShot({ x, y }) {
  if (state.phase !== 'battle' || !Number.isInteger(x) || !Number.isInteger(y)) return;
  const r = state.board.receiveShot(x, y);
  if (!r) return;
  state.net.send({ type: 'result', x, y, ...r });

  const cell = meCells[y][x];
  if (r.hit) {
    fx(cell, 'explosion');
    shake($('#me-wrap'));
    play(r.sunk ? 'sunk' : 'hit');
    if (r.sunk) toast(`💥 Votre ${r.sunk.name} a été coulé !`, 'bad');
  } else {
    fx(cell, 'splash');
    play('splash');
  }

  if (r.over) return endGame(false);
  state.myTurn = !(r.hit && state.bonus);
  render();
  updateTurnBanner();
}

function onResult({ x, y, hit, sunk, over }) {
  const i = y * SIZE + x;
  state.pending = false;
  state.enemy[i] = hit ? 'hit' : 'miss';
  const cell = enemyCells[y][x];

  if (hit) {
    fx(cell, 'explosion');
    setTimeout(() => play(sunk ? 'sunk' : 'hit'), 120);
  } else {
    fx(cell, 'splash');
    setTimeout(() => play('splash'), 120);
  }
  if (sunk) {
    state.enemySunk.add(sunk.id);
    for (const [sx, sy] of sunk.cells) state.enemy[sy * SIZE + sx] = 'sunk';
    toast(`🔥 Coulé ! ${sunk.name} ennemi par le fond.`, 'good');
  } else if (hit) {
    toast(`Touché en ${coordName(x, y)} !`, 'good');
  }

  if (over) return endGame(true);
  state.myTurn = hit && state.bonus;
  render();
  updateTurnBanner();
}

function endGame(won) {
  setPhase('over');
  state.myTurn = false;
  state.net.send({
    type: 'reveal',
    ships: state.board.ships.map(({ id, x, y, dir }) => ({ id, x, y, dir })),
  });
  render();
  setBanner(won ? '🏆 Victoire !' : '⚓ Défaite…', won ? 'my-turn' : 'their-turn');
  setTimeout(() => {
    play(won ? 'win' : 'lose');
    if (won) confetti();
    showModal({
      icon: won ? '🏆' : '🌊',
      title: won ? 'Victoire !' : 'Défaite…',
      text: won
        ? `Toute la flotte de ${state.oppName} repose au fond de l'océan.`
        : `${state.oppName} a coulé toute votre flotte.`,
      rematch: true,
    });
  }, 1100);
}

function onReveal({ ships }) {
  if (!Array.isArray(ships)) return;
  state.enemyReveal = ships
    .filter((s) => shipDef(s.id))
    .map((s) => ({ ...s, cells: cellsFor(s.x, s.y, shipDef(s.id).size, s.dir) }));
  renderEnemy();
}

function confetti() {
  const colors = ['#2de2e6', '#ffd166', '#ff6b6b', '#ffffff', '#7bf1a8'];
  for (let i = 0; i < 80; i++) {
    const c = el('i', 'confetti');
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.animationDuration = `${2 + Math.random() * 2}s`;
    c.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

/* ---------------------------------------------------------------- modal / revanche */

function showModal({ icon, title, text, rematch }) {
  $('#modal-icon').textContent = icon;
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  const btn = $('#btn-rematch');
  btn.classList.toggle('hidden', !rematch);
  btn.disabled = state.rematchMe;
  btn.textContent = state.rematchMe ? 'En attente…' : '🔁 Revanche';
  $('#modal').classList.remove('hidden');
}

function hideModal() {
  $('#modal').classList.add('hidden');
}

function requestRematch() {
  state.rematchMe = true;
  state.net.send({ type: 'rematch' });
  const btn = $('#btn-rematch');
  btn.disabled = true;
  btn.textContent = 'En attente…';
  checkRematch();
}

function checkRematch() {
  if (state.rematchMe && state.rematchOpp) {
    toast('Nouvelle partie !', 'info');
    enterPlacement();
  }
}

/* ---------------------------------------------------------------- chat */

function addChat(who, text, mine) {
  const li = el('li', mine ? 'mine' : '');
  li.append(el('b', '', who), el('span', '', text));
  const log = $('#chat-log');
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
  if (EMOTES.includes(text)) floatEmote(text);
  if (!mine && $('#chat').classList.contains('collapsed')) {
    state.unread++;
    const badge = $('#chat-badge');
    badge.textContent = state.unread;
    badge.classList.remove('hidden');
  }
}

function sendChat(text) {
  text = text.trim().slice(0, 140);
  if (!text || !state.net) return;
  state.net.send({ type: 'chat', text });
  addChat(state.name, text, true);
}

/* ---------------------------------------------------------------- réseau */

function onMessage(msg) {
  switch (msg?.type) {
    case 'hello':
      state.oppName = String(msg.name || 'Adversaire').slice(0, 16);
      if (state.role === 'guest') state.bonus = !!msg.bonus;
      $('#name-opp').textContent = state.oppName;
      toast(`${state.oppName} a rejoint la partie !`, 'info');
      if (state.bonus && state.role === 'guest') toast('Règle : on rejoue après un tir touché.', 'info');
      if (state.phase === 'placement' && !state.ready) setBanner(`Déployez votre flotte, ${state.name} !`);
      break;
    case 'ready':
      state.oppReady = true;
      if (state.phase === 'placement') {
        toast(`${state.oppName} est prêt au combat.`, 'info');
        if (state.ready) $('#dock-wait').textContent = 'Lancement…';
      }
      maybeStart();
      break;
    case 'start':
      if (state.role === 'guest' && state.phase === 'placement') beginBattle(msg.first === 'guest');
      break;
    case 'shot':
      onShot(msg);
      break;
    case 'result':
      onResult(msg);
      break;
    case 'reveal':
      onReveal(msg);
      break;
    case 'chat':
      addChat(state.oppName, String(msg.text || '').slice(0, 140), false);
      play('message');
      break;
    case 'rematch':
      state.rematchOpp = true;
      if (state.phase === 'over' && !state.rematchMe) {
        $('#modal-text').textContent = `${state.oppName} veut une revanche !`;
      }
      checkRematch();
      break;
  }
}

function setupNet() {
  state.net?.destroy();
  const net = new Net();
  state.net = net;

  net.on('hosting', (code) => {
    $('#wait-title').textContent = 'Partie créée !';
    $('#wait-code').textContent = code;
    $('#wait-code-box').classList.remove('hidden');
    const url = new URL(location.href);
    url.search = `?partie=${code}`;
    state.shareUrl = url.toString();
  });

  net.on('connected', () => {
    net.send({ type: 'hello', name: state.name, bonus: state.bonus });
    enterPlacement();
  });

  net.on('message', onMessage);

  net.on('error', (message) => {
    if (state.phase === 'wait' || state.phase === 'lobby') {
      goHome();
      $('#lobby-error').textContent = message;
    } else {
      toast(message, 'bad');
    }
  });

  net.on('disconnected', () => {
    if (state.phase === 'lobby') return;
    setBanner('📡 Liaison perdue', 'their-turn');
    showModal({
      icon: '📡',
      title: 'Liaison perdue',
      text: `La connexion avec ${state.oppName} a été interrompue.`,
      rematch: false,
    });
    setPhase('over');
  });

  return net;
}

function readName() {
  let name = $('#input-name').value.trim().slice(0, 16);
  if (!name) {
    name = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    $('#input-name').value = name;
  }
  try { localStorage.setItem('bn-name', name); } catch { /* ignore */ }
  state.name = name;
}

function startHost() {
  readName();
  state.role = 'host';
  state.bonus = $('#opt-bonus').checked;
  state.oppName = 'Adversaire';
  setPhase('wait');
  $('#lobby-error').textContent = '';
  $('#wait-title').textContent = 'Ouverture du port…';
  $('#wait-code-box').classList.add('hidden');
  showScreen('screen-wait');
  setupNet().host();
}

function startJoin() {
  const code = normalizeCode($('#input-code').value);
  if (code.length < 4) {
    $('#lobby-error').textContent = 'Entrez le code de la partie.';
    $('#input-code').focus();
    return;
  }
  readName();
  state.role = 'guest';
  state.oppName = 'Adversaire';
  setPhase('wait');
  $('#lobby-error').textContent = '';
  $('#wait-title').textContent = `Recherche de la partie ${code}…`;
  $('#wait-code-box').classList.add('hidden');
  showScreen('screen-wait');
  setupNet().join(code);
}

function goHome() {
  state.net?.destroy();
  state.net = null;
  hideModal();
  setPhase('lobby');
  $('#chat-log').innerHTML = '';
  state.unread = 0;
  $('#chat-badge').classList.add('hidden');
  history.replaceState(null, '', location.pathname);
  showScreen('screen-lobby');
}

/* ---------------------------------------------------------------- événements */

$('#btn-host').addEventListener('click', startHost);
$('#btn-join').addEventListener('click', startJoin);
$('#input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') startJoin(); });
$('#input-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('#btn-cancel').addEventListener('click', goHome);
$('#btn-home').addEventListener('click', goHome);
$('#btn-rematch').addEventListener('click', requestRematch);

$('#btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    toast('Lien copié !', 'info');
  } catch {
    prompt('Copiez ce lien :', state.shareUrl);
  }
});
if (navigator.share) {
  $('#btn-share').classList.remove('hidden');
  $('#btn-share').addEventListener('click', () => {
    navigator.share({
      title: 'Bataille Navale',
      text: `${state.name} vous défie à la bataille navale ! Code : ${$('#wait-code').textContent}`,
      url: state.shareUrl,
    }).catch(() => {});
  });
}

const sndBtn = $('#btn-sound');
sndBtn.textContent = isMuted() ? '🔇' : '🔊';
sndBtn.addEventListener('click', () => { sndBtn.textContent = toggleMute() ? '🔇' : '🔊'; });

// Grille personnelle (placement)
const gridMe = $('#grid-me');
gridMe.addEventListener('click', (e) => {
  const c = cellFromEvent(e);
  if (c) onPlaceClick(...c);
});
gridMe.addEventListener('mouseover', (e) => {
  const c = cellFromEvent(e);
  if (!c || state.phase !== 'placement') return;
  if (state.hover?.[0] === c[0] && state.hover?.[1] === c[1]) return;
  state.hover = c;
  renderMe();
});
gridMe.addEventListener('mouseleave', () => {
  state.hover = null;
  if (state.phase === 'placement') renderMe();
});
gridMe.addEventListener('contextmenu', (e) => {
  if (state.phase !== 'placement') return;
  e.preventDefault();
  rotate();
});

// Grille adverse (tirs)
$('#grid-enemy').addEventListener('click', (e) => {
  const c = cellFromEvent(e);
  if (c) fire(...c);
});

// Chantier naval
$('#dock-ships').addEventListener('click', (e) => {
  const b = e.target.closest('.dock-ship');
  if (!b || state.ready) return;
  state.selected = b.dataset.id;
  const placed = state.board.ships.find((s) => s.id === b.dataset.id);
  if (placed) state.dir = placed.dir;
  render();
});
$('#btn-rotate').addEventListener('click', rotate);
$('#btn-random').addEventListener('click', () => {
  state.board.randomize();
  state.selected = null;
  play('place');
  render();
});
$('#btn-clear').addEventListener('click', () => {
  state.board.clear();
  state.selected = FLEET[0].id;
  render();
});
$('#btn-ready').addEventListener('click', onReady);

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.key === 'r' || e.key === 'R') rotate();
});

// Chat
$('#chat-toggle').addEventListener('click', () => {
  const chat = $('#chat');
  chat.classList.toggle('collapsed');
  if (!chat.classList.contains('collapsed')) {
    state.unread = 0;
    $('#chat-badge').classList.add('hidden');
    $('#chat-input').focus();
  }
});
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat($('#chat-input').value);
  $('#chat-input').value = '';
});
document.querySelectorAll('.emotes button').forEach((b) => {
  b.addEventListener('click', () => sendChat(b.textContent));
});

window.addEventListener('beforeunload', (e) => {
  if (state.phase === 'battle' || state.phase === 'placement') e.preventDefault();
});

/* ---------------------------------------------------------------- démarrage */

try { $('#input-name').value = localStorage.getItem('bn-name') || ''; } catch { /* ignore */ }
const invite = new URLSearchParams(location.search).get('partie');
if (invite) {
  $('#input-code').value = normalizeCode(invite);
  document.querySelector('.lobby-actions .card:last-child').classList.add('highlight');
  ($('#input-name').value ? $('#btn-join') : $('#input-name')).focus();
}
setPhase('lobby');
