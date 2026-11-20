// Solara City 3D — shared game state, constants and helpers.
// Every module reads and writes this one object, so the game has a single source of truth.
import * as THREE from 'three';

export const BLOCK = 40;          // city block size (units)
export const ROAD = 12;           // road width
export const PITCH = BLOCK + ROAD; // distance between road centrelines
export const NROADS = 7;          // roads per direction (0..6)
export const CITY_HALF = (NROADS * PITCH) / 2; // ~182
export const SEA_X = 210;         // sea starts east of the city
export const BEACH_Z = 200;       // beach starts south of the city

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtClock = (h) => {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
};

export const DISTRICTS = [
  { name: 'Downtown Solara', cx: 0,   cz: -52,  r: 90, rep: 62, color: '#e8a33d', desc: 'Glass towers and the bank district.' },
  { name: 'Old Town',        cx: -104, cz: -104, r: 80, rep: 48, color: '#c98f4e', desc: 'Brick streets, cafés and old money.' },
  { name: 'Harbor Docks',    cx: 104,  cz: -104, r: 80, rep: 35, color: '#7fa8b8', desc: 'Cranes, containers and night deals.' },
  { name: 'Marina Bay',      cx: 104,  cz: 52,   r: 80, rep: 71, color: '#4ecdc4', desc: 'Yachts, neon and the fast crowd.' },
  { name: 'Palm Heights',    cx: -104, cz: 52,   r: 80, rep: 55, color: '#8fc97f', desc: 'Suburban streets under the palms.' },
  { name: 'Beachfront',      cx: 0,    cz: 156,  r: 80, rep: 78, color: '#f4d35e', desc: 'Sand, surf and sunset crowds.' },
  { name: 'Isla Verde',      cx: 300,  cz: 0,    r: 70, rep: 88, color: '#2ec4b6', desc: 'The island across the bridge. King territory.' },
];

export function districtAt(x, z) {
  let best = DISTRICTS[0], bd = 1e9;
  for (const d of DISTRICTS) {
    const dd = dist2(x, z, d.cx, d.cz);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

// Road centrelines: x = roadX(i), z = roadZ(j)
export const roadX = (i) => -CITY_HALF + i * PITCH;
export const roadZ = (j) => -CITY_HALF + j * PITCH;
export function nearestRoadPoint(x, z) {
  // snap a point to the nearest road centreline (keeps cars on roads)
  let bx = roadX(0), bd = 1e9;
  for (let i = 0; i < NROADS; i++) { const d = Math.abs(x - roadX(i)); if (d < bd) { bd = d; bx = roadX(i); } }
  let bz = roadZ(0); bd = 1e9;
  for (let j = 0; j < NROADS; j++) { const d = Math.abs(z - roadZ(j)); if (d < bd) { bd = d; bz = roadZ(j); } }
  // choose the closer axis: if |x-bx| < |z-bz| the car is on a vertical road (constant x)
  return Math.abs(x - bx) < Math.abs(z - bz) ? { x: bx, z, axis: 'z' } : { x, z: bz, axis: 'x' };
}

export const G = {
  scene: null, camera: null, renderer: null,
  three: THREE,
  time: { day: 1, hour: 17.6 },      // golden hour: 17:36
  money: 500, health: 100, armour: 0,
  wanted: 0, heat: 0,               // heat 0..100 drives wanted stars
  respect: 0,                        // 0..5 ranks
  weapons: [], weaponIndex: 0,
  player: null,                      // { group, pos:Vector3, yaw, speed, onFoot, car, walkPhase }
  cars: [],                          // all drivable cars (player + traffic + police share shape)
  traffic: [], police: [], roadblocks: [],
  heli: null,
  peds: [], enemies: [],
  missionIndex: 0, mission: null,    // active mission state machine
  missionsDone: [],
  marker: null,                      // 3D beacon {group, x, z, label}
  shells: [], shellsTaken: 0,
  races: [], race: null,
  taxi: { active: false, passenger: null, dest: null, fare: 0 },
  radio: 0, radioOn: true,
  stats: { cashEarned: 0, carsStolen: 0, copsEvaded: 0, racesWon: 0, kills: 0, robberies: 0, fares: 0, shots: 0, hits: 0 },
  crew: null,
  city: null,                        // filled by city.js
  paused: false, mapOpen: false, title: true,
  gameOver: false, busted: false,
  camYaw: 0, camPitch: 0.32, camDist: 9, camMode: 0,
  aimMode: false, wheelOpen: false,
  sceneMode: null,                   // ?scene= staging
  dialogue: [], dialogueTimer: 0,
  keys: {}, mouseDX: 0, mouseDY: 0, mouseDown: false, rightDown: false,
  fps: 0,
};

export function addMoney(n) {
  G.money += n;
  if (n > 0) G.stats.cashEarned += n;
}
export function addHeat(n) {
  G.heat = clamp(G.heat + n, 0, 100);
  const w = G.heat < 8 ? 0 : G.heat < 25 ? 1 : G.heat < 45 ? 2 : G.heat < 65 ? 3 : G.heat < 85 ? 4 : 5;
  if (w > G.wanted) G.wanted = w;
}
export function wantedStars() { return G.wanted; }
