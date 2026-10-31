// Logique pure du plateau : placement des navires et résolution des tirs.

export const SIZE = 10;
export const COLS = 'ABCDEFGHIJ';

export const FLEET = [
  { id: 'carrier',   name: 'Porte-avions', size: 5 },
  { id: 'battleship', name: 'Cuirassé',    size: 4 },
  { id: 'cruiser',   name: 'Croiseur',     size: 3 },
  { id: 'submarine', name: 'Sous-marin',   size: 3 },
  { id: 'destroyer', name: 'Torpilleur',   size: 2 },
];

export const shipDef = (id) => FLEET.find((s) => s.id === id);
export const coordName = (x, y) => `${COLS[x]}${y + 1}`;

export function cellsFor(x, y, size, dir) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(dir === 'h' ? [x + i, y] : [x, y + i]);
  }
  return cells;
}

const inBounds = ([x, y]) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

export class Board {
  constructor() {
    this.ships = [];          // { id, x, y, dir, cells: [[x,y]], hits: Set<"x,y"> }
    this.shots = new Map();   // "x,y" -> 'hit' | 'miss'
  }

  shipAt(x, y) {
    return this.ships.find((s) => s.cells.some(([cx, cy]) => cx === x && cy === y));
  }

  canPlace(id, x, y, dir) {
    const cells = cellsFor(x, y, shipDef(id).size, dir);
    return cells.every(inBounds) &&
      cells.every(([cx, cy]) => {
        const other = this.shipAt(cx, cy);
        return !other || other.id === id;
      });
  }

  place(id, x, y, dir) {
    if (!this.canPlace(id, x, y, dir)) return false;
    this.remove(id);
    this.ships.push({ id, x, y, dir, cells: cellsFor(x, y, shipDef(id).size, dir), hits: new Set() });
    return true;
  }

  remove(id) {
    this.ships = this.ships.filter((s) => s.id !== id);
  }

  clear() {
    this.ships = [];
    this.shots.clear();
  }

  isPlaced(id) {
    return this.ships.some((s) => s.id === id);
  }

  get allPlaced() {
    return FLEET.every((s) => this.isPlaced(s.id));
  }

  randomize() {
    this.ships = [];
    for (const def of FLEET) {
      for (let tries = 0; tries < 500; tries++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const x = Math.floor(Math.random() * SIZE);
        const y = Math.floor(Math.random() * SIZE);
        if (this.place(def.id, x, y, dir)) break;
      }
    }
    if (!this.allPlaced) this.randomize();
  }

  /** Résout un tir adverse. Renvoie { hit, sunk: {id,name,cells}|null, over } ou null si déjà tiré. */
  receiveShot(x, y) {
    const key = `${x},${y}`;
    if (this.shots.has(key)) return null;
    const ship = this.shipAt(x, y);
    this.shots.set(key, ship ? 'hit' : 'miss');
    if (!ship) return { hit: false, sunk: null, over: false };
    ship.hits.add(key);
    const isSunk = ship.hits.size === ship.cells.length;
    return {
      hit: true,
      sunk: isSunk ? { id: ship.id, name: shipDef(ship.id).name, cells: ship.cells } : null,
      over: this.ships.every((s) => s.hits.size === s.cells.length),
    };
  }

  isSunk(ship) {
    return ship.hits.size === ship.cells.length;
  }
}
