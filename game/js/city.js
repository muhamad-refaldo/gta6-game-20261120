// Solara City 3D v3.3 — city: seven districts, roads + traffic lights, bridge to
// Isla Verde, beach + sea, textured buildings, shops, palms, street props,
// golden shells, race starts, stunt ramps, safehouses and a gun shop.
// Fresh rewrite for v3.3. Exports: buildCity(), RAMPS, SAFEHOUSES, groundY.
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z, roadX, roadZ, rand, randi, pick, dist2 } from './state.js';

// ---------- stunt ramps (5) ----------
// Each ramp sits on a road. A car driving over it in the launch direction
// (dx,dz) fast enough goes airborne. The ramp mesh is a sloped slab; the
// trigger zone is a box centred on the ramp.
export const RAMPS = [
  { x: -26, z: 60, dx: 0, dz: -1, name: 'North Jump' },
  { x: 26, z: -26, dx: 1, dz: 0, name: 'East Jump' },
  { x: 78, z: 26, dx: 0, dz: 1, name: 'South Jump' },
  { x: -78, z: 78, dx: -1, dz: 0, name: 'West Jump' },
  { x: -78, z: 130, dx: 0, dz: -1, name: 'Beach Jump' },
];

// ---------- safehouses (3) ----------
// x,z is the door / interact point (south face of the building). The building
// itself stands 11 units north of the door, like the shops.
export const SAFEHOUSES = [
  { x: -104, z: 115, bx: -104, bz: 104, name: 'Palm Court', price: 5000, color: 0x2e8b6a },
  { x: 52, z: 115, bx: 52, bz: 104, name: 'Marina Loft', price: 15000, color: 0x2a6fd4 },
  { x: 300, z: -41, bx: 300, bz: -52, name: 'Isla Villa', price: 30000, color: 0xc9a227 },
];

// Building footprints for car collision (filled by buildCity).
export const SOLIDS = [];

// Gun shop (Ammu-Nation): door / interact point, building 11 units north.
const GUNSHOP = { x: -52, z: 167, bx: -52, bz: 156, name: 'AMMU-NATION' };

// Ground height: the bridge deck sits at y=0.1, everything else at y=0.
export function groundY(x, z) {
  if (x > 186 && x < 282 && Math.abs(z) < 8) return 0.1;
  return 0;
}

// ---------- canvas texture helpers ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 8 facade styles (canvas textures on building boxes).
const FACADE_STYLES = [
  { base: '#c8b8a0', trim: '#8a6f4d', win: '#2e3d55', lit: '#ffd76e' },
  { base: '#b8c4cc', trim: '#5a6a75', win: '#1f2e3d', lit: '#ffe9a0' },
  { base: '#d9a08a', trim: '#8a4a35', win: '#3d2a22', lit: '#ffcf7a' },
  { base: '#a8b89a', trim: '#5a6a4a', win: '#26331f', lit: '#fff0b0' },
  { base: '#c9a8c9', trim: '#7a4a7a', win: '#2e1f2e', lit: '#ffd23d' },
  { base: '#8fb8c9', trim: '#3d6a7a', win: '#16303d', lit: '#ffe9a0' },
  { base: '#d9c08a', trim: '#8a6f3d', win: '#3d2f1a', lit: '#ffcf7a' },
  { base: '#b0b0b0', trim: '#5a5a5a', win: '#1a1a1a', lit: '#fff0b0' },
];
const facadeMats = [];
function facadeMat(styleIdx) {
  if (facadeMats[styleIdx]) return facadeMats[styleIdx];
  const s = FACADE_STYLES[styleIdx % FACADE_STYLES.length];
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = s.base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const cols = 5, rows = 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = 18 + c * 46, wy = 16 + r * 34;
        const isLit = Math.random() < 0.4;
        g.fillStyle = isLit ? s.lit : s.win;
        g.fillRect(wx, wy, 28, 22);
        g.fillStyle = s.trim;
        g.fillRect(wx, wy + 22, 28, 2);
      }
    }
    g.fillStyle = s.trim; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, h - 26, w, 3);
  });
  const m = new THREE.MeshLambertMaterial({ map: tex });
  facadeMats[styleIdx] = m;
  return m;
}
function signTex(text, fg, bg) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 56;
    g.font = `bold ${size}px Arial, sans-serif`;
    const maxW = w - 24;
    while (size > 20 && g.measureText(text).width > maxW) {
      size -= 2;
      g.font = `bold ${size}px Arial, sans-serif`;
    }
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
function chevronTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e8c832'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 64, h); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 64, 0); g.lineTo(i * 64 + 32, h);
      g.closePath(); g.fill();
    }
  });
}

// ---------- shared materials ----------
const M = {
  grass: new THREE.MeshLambertMaterial({ color: 0x5a8a4a }),
  sand: new THREE.MeshLambertMaterial({ color: 0xd9c08a }),
  sea: new THREE.MeshLambertMaterial({ color: 0x1f6f8b }),
  road: new THREE.MeshLambertMaterial({ color: 0x3a3d42 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x9a9a92 }),
  curb: new THREE.MeshLambertMaterial({ color: 0x6a6a62 }),
  bridgeDeck: new THREE.MeshLambertMaterial({ color: 0x4a4d52 }),
  bridgeRail: new THREE.MeshLambertMaterial({ color: 0xc9a227 }),
  white: new THREE.MeshLambertMaterial({ color: 0xf0f0e8 }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xe8c832 }),
  pole: new THREE.MeshLambertMaterial({ color: 0x2a2d30 }),
  lampOff: new THREE.MeshLambertMaterial({ color: 0x444444 }),
  lampOn: new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
  palmTrunk: new THREE.MeshLambertMaterial({ color: 0x7a5a3a }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3d8a4a }),
  shell: new THREE.MeshLambertMaterial({ color: 0xffd23d, emissive: 0x664400 }),
  rampBase: new THREE.MeshLambertMaterial({ color: 0x8a2a1a }),
  redLight: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  amberLight: new THREE.MeshBasicMaterial({ color: 0xffa500 }),
  greenLight: new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
  lightOff: new THREE.MeshLambertMaterial({ color: 0x331111 }),
};

const roadMats = [];   // setWet loops these
const lampBulbs = [];  // setNight lights these
const windowMats = []; // setNight lights safehouse windows

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function onRoad(x, z) {
  for (let i = 0; i < NROADS; i++) {
    if (Math.abs(x - roadX(i)) < 9 || Math.abs(z - roadZ(i)) < 9) return true;
  }
  return false;
}

// ---------- traffic lights ----------
// 4 signalised intersections (central 2x2). Cycle 22s: red 10, amber 2,
// green 10, staggered 5.5s per intersection (by i+j).
const LIGHT_SPOTS = [
  { i: 3, j: 3 }, { i: 3, j: 4 }, { i: 4, j: 3 }, { i: 4, j: 4 },
];
let lightTime = 0;
function lightPhaseAt(i, j) {
  const stagger = ((i + j) % 4) * 5.5;
  return (lightTime + stagger) % 22;
}
function lightStateAt(x, z, axis) {
  const i = Math.round((x + CITY_HALF) / PITCH);
  const j = Math.round((z + CITY_HALF) / PITCH);
  const ph = lightPhaseAt(Math.max(0, Math.min(NROADS - 1, i)), Math.max(0, Math.min(NROADS - 1, j)));
  if (ph < 10) return 'red';
  if (ph < 12) return 'amber';
  return 'green';
}

export function buildCity() {
  const scene = G.scene;
  const city = {
    raceStarts: [
      { x: -26, z: 130, name: 'Sunset Sprint', len: 6 },
      { x: -130, z: -78, name: 'Old Town Loop', len: 6 },
      { x: 26, z: 156, name: 'Beachfront Dash', len: 5 },
    ],
    stores: [
      { x: -104, z: -93, kind: 'store', name: 'OLD TOWN DELI', robT: 0 },
      { x: -104, z: 63, kind: 'store', name: 'PALM LAUNDRY', robT: 0 },
      { x: 0, z: -41, kind: 'store', name: 'DOWNTOWN PHARMACY', robT: 0 },
      { x: 0, z: 167, kind: 'store', name: 'BEACH TACOS', robT: 0 },
      { x: 104, z: 63, kind: 'store', name: 'MARINA MARKET', robT: 0 },
    ],
    chop: { x: 130, z: -78 },
    garage: { x: -130, z: 78 },
    shells: [],
    lightStateAt,
    setNight,
    setWet,
    update,
    gunshop: GUNSHOP,
  };
  G.city = city;

  // ---------- ground, beach, sea ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(100, -0.05, 20);
  ground.receiveShadow = true;
  scene.add(ground);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(500, 90), M.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0, BEACH_Z + 42);
  beach.receiveShadow = true;
  scene.add(beach);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 700), M.sea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SEA_X + 140, -0.15, 20);
  sea.receiveShadow = true;
  scene.add(sea);

  // ---------- roads + sidewalks ----------
  for (let i = 0; i < NROADS; i++) {
    const rx = roadX(i), rz = roadZ(i);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY_HALF * 2 + 40), M.road);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(rx, 0, 20);
    vRoad.receiveShadow = true;
    scene.add(vRoad);
    roadMats.push(vRoad.material);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, ROAD), M.road);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0, rz);
    hRoad.receiveShadow = true;
    scene.add(hRoad);
    roadMats.push(hRoad.material);
    for (let k = -170; k < 190; k += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), M.white);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(rx, 0.02, k);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), M.white);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(k, 0.02, rz);
      scene.add(dash2);
    }
  }
  for (let i = 0; i < NROADS; i++) {
    const rx = roadX(i), rz = roadZ(i);
    for (const off of [-7.5, 7.5]) {
      const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(3, CITY_HALF * 2 + 40), M.sidewalk);
      sw1.rotation.x = -Math.PI / 2;
      sw1.position.set(rx + off, 0.01, 20);
      sw1.receiveShadow = true;
      scene.add(sw1);
      const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, 3), M.sidewalk);
      sw2.rotation.x = -Math.PI / 2;
      sw2.position.set(0, 0.01, rz + off);
      sw2.receiveShadow = true;
      scene.add(sw2);
    }
  }
  // zebra crossings at the 4 signalised intersections
  for (const s of LIGHT_SPOTS) {
    const cx = roadX(s.i), cz = roadZ(s.j);
    for (let k = -5; k <= 5; k += 2.5) {
      const z1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), M.white);
      z1.rotation.x = -Math.PI / 2;
      z1.position.set(cx + k, 0.03, cz - 8);
      scene.add(z1);
      const z2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), M.white);
      z2.rotation.x = -Math.PI / 2;
      z2.position.set(cx - 8, 0.03, cz + k);
      scene.add(z2);
    }
  }

  // ---------- bridge to Isla Verde (deck top y=0.1) ----------
  box(96, 0.2, 14, M.bridgeDeck, 234, 0, 0, scene);
  for (const side of [-7, 7]) {
    box(96, 1.1, 0.4, M.bridgeRail, 234, 0.65, side, scene);
  }
  for (let k = 0; k < 6; k++) {
    box(1.2, 7, 1.2, M.bridgeRail, 196 + k * 15, 3.5, -7, scene);
    box(1.2, 7, 1.2, M.bridgeRail, 196 + k * 15, 3.5, 7, scene);
  }
  const island = new THREE.Mesh(new THREE.CircleGeometry(75, 28), M.grass);
  island.rotation.x = -Math.PI / 2;
  island.position.set(320, -0.02, 0);
  island.receiveShadow = true;
  scene.add(island);
  const islandSand = new THREE.Mesh(new THREE.RingGeometry(72, 78, 28), M.sand);
  islandSand.rotation.x = -Math.PI / 2;
  islandSand.position.set(320, 0, 0);
  scene.add(islandSand);

  // ---------- buildings ----------
  // Blocks reserved for special uses (no random building there).
  const reserved = new Set();
  const blockKey = (bx, bz) => `${bx},${bz}`;
  const solid = (x, z, hw, hd) => { SOLIDS.push({ x, z, hw, hd }); };
  const storeBlocks = [[-104, -104], [-104, 52], [0, -52], [0, 156], [104, 52]];
  for (const [bx, bz] of storeBlocks) reserved.add(blockKey(bx, bz));
  reserved.add(blockKey(104, -104)); // Harbor delivery lot (mission 3) — kept clear
  for (const sh of SAFEHOUSES) reserved.add(blockKey(sh.bx, sh.bz));
  reserved.add(blockKey(GUNSHOP.bx, GUNSHOP.bz));
  reserved.add(blockKey(52, -52)); // bank
  const parkBlocks = [[-52, 0], [104, 0]];

  const blockCentersX = [-156, -104, -52, 0, 52, 104];
  const blockCentersZ = [-156, -104, -52, 0, 52, 104, 156];
  for (let bi = 0; bi < blockCentersX.length; bi++) {
    for (let bj = 0; bj < blockCentersZ.length; bj++) {
      const bx = blockCentersX[bi], bz = blockCentersZ[bj];
      if (reserved.has(blockKey(bx, bz))) continue;
      if (parkBlocks.some(([px, pz]) => px === bx && pz === bz)) continue;
      const style = (bi * 7 + bj * 3) % FACADE_STYLES.length;
      const w = rand(14, 22), d = rand(14, 22), h = rand(10, 34);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMat(style));
      b.position.set(bx, h / 2, bz);
      b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      solid(bx, bz, w / 2 + 0.5, d / 2 + 0.5);
      box(w + 0.6, 0.5, d + 0.6, M.curb, bx, h + 0.25, bz, scene);
      box(rand(2, 4), 1, rand(2, 4), M.pole, bx + rand(-4, 4), h + 1, bz + rand(-4, 4), scene);
      if (h < 18 && Math.random() < 0.5) {
        const awn = box(w * 0.7, 0.3, 4, new THREE.MeshLambertMaterial({ color: pick([0xc0392b, 0x2a6fd4, 0x2e8b6a, 0xe8a33d]) }), bx, 3.4, bz + d / 2 + 1.5, scene);
        awn.rotation.x = 0.25;
      }
    }
  }
  // island buildings (kept >= 30 units from the plaza beacon at 330,0)
  const islandSpots = [[272, -40], [272, 40], [300, 52], [352, -52], [352, 52]];
  for (const [ix, iz] of islandSpots) {
    if (dist2(ix, iz, 330, 0) < 30) continue;
    const style = randi(0, FACADE_STYLES.length - 1);
    const h = rand(12, 26);
    const b = new THREE.Mesh(new THREE.BoxGeometry(rand(14, 20), h, rand(14, 20)), facadeMat(style));
    b.position.set(ix, h / 2, iz);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    solid(ix, iz, 10.5, 10.5);
    box(15, 0.5, 15, M.curb, ix, h + 0.25, iz, scene);
  }

  // ---------- Harbor delivery lot (104,-104): kept clear for mission 3 ----------
  {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshLambertMaterial({ color: 0x4a4d52 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(104, 0.02, -104);
    lot.receiveShadow = true;
    scene.add(lot);
    for (let k = 0; k < 5; k++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 8), M.white);
      line.rotation.x = -Math.PI / 2;
      line.position.set(92 + k * 6, 0.04, -104);
      scene.add(line);
    }
    const pSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 2), new THREE.MeshBasicMaterial({ map: signTex('PARKING', '#ffffff', '#2a4a5a') }));
    pSign.position.set(104, 3.5, -118);
    scene.add(pSign);
  }

  // ---------- shops (stores) ----------
  const shopColors = [0xc0392b, 0x2e8b6a, 0x2a6fd4, 0xe8a33d, 0x8e44ad];
  city.stores.forEach((s, idx) => {
    const bx = s.x, bz = s.z - 11;
    const col = shopColors[idx % shopColors.length];
    const b = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 14), facadeMat(idx % FACADE_STYLES.length));
    b.position.set(bx, 4, bz);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    // NOTE: shop buildings are NOT solids — mission targets sit on shop block
    // centres, so cars must be able to drive up to them.
    box(19, 0.5, 15, M.curb, bx, 8.25, bz, scene);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTex(s.name, '#ffffff', '#' + col.toString(16).padStart(6, '0')) })
    );
    sign.position.set(bx, 6.5, bz + 7.2);
    scene.add(sign);
    const awn = box(8, 0.3, 3.5, new THREE.MeshLambertMaterial({ color: col }), bx, 3.6, bz + 7.5, scene);
    awn.rotation.x = 0.3;
  });

  // ---------- chop shop + garage + bank ----------
  box(20, 7, 14, new THREE.MeshLambertMaterial({ color: 0x5a2a2a }), 148, 3.5, -88, scene);
  solid(148, -88, 10.5, 7.5);
  const chopSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: signTex('CHOP SHOP', '#ff5d5d', '#2a0a0a') }));
  chopSign.position.set(148, 6, -80.5);
  scene.add(chopSign);
  box(20, 7, 14, new THREE.MeshLambertMaterial({ color: 0x2a4a5a }), -148, 3.5, 88, scene);
  solid(-148, 88, 10.5, 7.5);
  const garSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: signTex('GARAGE', '#4ecdc4', '#0a2a2a') }));
  garSign.position.set(-148, 6, 80.5);
  garSign.rotation.y = Math.PI;
  scene.add(garSign);
  box(22, 12, 16, facadeMat(1), 52, 6, -52, scene);
  solid(52, -52, 11.5, 8.5);
  const bankSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTex('DOWNTOWN BANK', '#ffd23d', '#1a2a1a') }));
  bankSign.position.set(52, 9, -43.5);
  scene.add(bankSign);

  // ---------- gun shop (Ammu-Nation) ----------
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 14), facadeMat(4));
    b.position.set(GUNSHOP.bx, 4, GUNSHOP.bz);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    solid(GUNSHOP.bx, GUNSHOP.bz, 9.5, 7.5);
    box(19, 0.5, 15, M.curb, GUNSHOP.bx, 8.25, GUNSHOP.bz, scene);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTex('AMMU-NATION', '#ffd23d', '#1a1a1a') }));
    sign.position.set(GUNSHOP.bx, 6.5, GUNSHOP.bz + 7.2);
    scene.add(sign);
  }

  // ---------- safehouses (distinct look + name board + owned sign) ----------
  for (const sh of SAFEHOUSES) {
    const g = new THREE.Group();
    const h = sh.name === 'Isla Villa' ? 10 : 8;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(18, h, 14),
      new THREE.MeshLambertMaterial({ color: sh.color })
    );
    body.position.set(0, h / 2, 0);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    box(19, 0.5, 15, M.curb, 0, h + 0.25, 0, g);
    box(1.5, 2.5, 1.5, M.pole, 5, h + 1.5, -3, g);
    const winMat = new THREE.MeshLambertMaterial({ color: 0x2e3d55, emissive: 0x000000 });
    windowMats.push(winMat);
    for (const [wx, wy] of [[-5, 4.5], [5, 4.5], [-5, 2], [5, 2]]) {
      box(2.4, 2, 0.2, winMat, wx, wy, 7.1, g);
    }
    box(2.2, 3.6, 0.3, new THREE.MeshLambertMaterial({ color: 0x4a2a1a }), 0, 1.8, 7.1, g);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 3.6),
      new THREE.MeshBasicMaterial({ map: signTex(`${sh.name} — $${sh.price.toLocaleString()}`, '#ffffff', '#' + sh.color.toString(16).padStart(6, '0')) })
    );
    sign.position.set(0, h - 1.5, 7.2);
    g.add(sign);
    const owned = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 2),
      new THREE.MeshBasicMaterial({ map: signTex('YOURS', '#7dff9a', '#0a2a0a') })
    );
    owned.position.set(0, h + 2.2, 7.2);
    owned.visible = false;
    g.add(owned);
    g.position.set(sh.bx, 0, sh.bz);
    scene.add(g);
    solid(sh.bx, sh.bz, 9.5, 7.5);
    sh.group = g;
    sh.ownedSign = owned;
    sh.door = { x: sh.x, z: sh.z };
  }

  // ---------- stunt ramps ----------
  const chev = chevronTex();
  for (const r of RAMPS) {
    const g = new THREE.Group();
    const slope = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.35, 7),
      new THREE.MeshLambertMaterial({ map: chev })
    );
    slope.position.set(0, 0.6, 0);
    slope.rotation.x = -Math.atan2(1.2, 7);
    slope.castShadow = true; slope.receiveShadow = true;
    g.add(slope);
    box(0.3, 0.9, 7, M.rampBase, -4, 0.7, 0, g);
    box(0.3, 0.9, 7, M.rampBase, 4, 0.7, 0, g);
    box(8, 1.1, 1.2, M.rampBase, 0, 0.55, -3, g);
    box(0.3, 4.5, 0.3, M.pole, 5.5, 2.25, 3, g);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.6),
      new THREE.MeshBasicMaterial({ map: signTex('STUNT!', '#ffd23d', '#3a0a0a') })
    );
    sign.position.set(5.5, 4.6, 3);
    g.add(sign);
    const yaw = Math.atan2(r.dx, r.dz);
    g.rotation.y = yaw + Math.PI;
    g.position.set(r.x, 0, r.z);
    scene.add(g);
    r.group = g;
    r.yaw = yaw;
  }

  // ---------- race start gantries ----------
  for (const rs of city.raceStarts) {
    const g = new THREE.Group();
    box(0.4, 5, 0.4, M.pole, -5, 2.5, 0, g);
    box(0.4, 5, 0.4, M.pole, 5, 2.5, 0, g);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 1.6),
      new THREE.MeshBasicMaterial({ map: signTex(rs.name.toUpperCase(), '#0a0a0a', '#4ecdc4') })
    );
    banner.position.set(0, 4.6, 0);
    g.add(banner);
    for (let k = 0; k < 6; k++) {
      const sq = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshLambertMaterial({ color: k % 2 ? 0x111111 : 0xffffff })
      );
      sq.rotation.x = -Math.PI / 2;
      sq.position.set(-3.5 + k * 1.4, 0.04, 0);
      g.add(sq);
    }
    g.position.set(rs.x, 0, rs.z);
    scene.add(g);
  }

  // ---------- golden shells (20) ----------
  const SHELL_POS = [
    [0, 210], [52, 220], [-52, 215], [104, 205], [-104, 225],
    [-60, 8], [-44, -6], [96, -8], [112, 6], [-78, -52],
    [26, -104], [78, 52], [-26, 104], [156, -26], [0, 78],
    [300, 40], [280, -20], [330, 35], [130, -130], [156, -104],
  ];
  for (const [sx, sz] of SHELL_POS) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.35, 8, 14), M.shell);
    mesh.position.set(sx, 0.9, sz);
    mesh.rotation.x = Math.PI / 2.4;
    mesh.castShadow = true;
    scene.add(mesh);
    city.shells.push({ x: sx, z: sz, taken: false, mesh });
  }

  // ---------- traffic lights (4 intersections) ----------
  const lightHeads = [];
  for (const s of LIGHT_SPOTS) {
    const cx = roadX(s.i), cz = roadZ(s.j);
    for (const [ox, oz, faceYaw] of [[-8, -8, 0], [8, 8, Math.PI]]) {
      box(0.35, 6, 0.35, M.pole, cx + ox, 3, cz + oz, scene);
      const head = new THREE.Group();
      head.position.set(cx + ox, 5.6, cz + oz);
      head.rotation.y = faceYaw;
      box(1, 2.4, 0.8, M.pole, 0, 0, 0, head);
      const lamps = {};
      for (const [name, dy] of [['red', 0.75], ['amber', 0], ['green', -0.75]]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), M.lightOff);
        lamp.position.set(0, dy, 0.42);
        head.add(lamp);
        lamps[name] = lamp;
      }
      scene.add(head);
      lightHeads.push({ i: s.i, j: s.j, lamps });
    }
  }

  // ---------- palms ----------
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 7), M.palmTrunk);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    g.add(trunk);
    for (let k = 0; k < 6; k++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), M.palmLeaf);
      const a = (k / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand(-170, 170), z = rand(-170, 195);
    if (onRoad(x, z)) continue;
    if (dist2(x, z, 330, 0) < 35) continue;
    palm(x, z);
  }
  for (let i = 0; i < 10; i++) palm(rand(-160, 160), rand(205, 235));

  // ---------- street props + lamps ----------
  const propCols = [0xc0392b, 0x2a6fd4, 0x7a7a7a, 0xe8a33d];
  for (let i = 0; i < 40; i++) {
    const x = rand(-175, 175), z = rand(-175, 190);
    const kind = i % 5;
    if (kind === 0) box(0.8, 1.1, 0.8, new THREE.MeshLambertMaterial({ color: pick(propCols) }), x, 0.55, z, scene);
    else if (kind === 1) { box(3, 0.4, 1, M.pole, x, 0.7, z, scene); box(0.3, 0.7, 1, M.pole, x - 1.2, 0.35, z, scene); box(0.3, 0.7, 1, M.pole, x + 1.2, 0.35, z, scene); }
    else if (kind === 2) box(1.2, 1.6, 0.6, new THREE.MeshLambertMaterial({ color: 0x2a4a5a }), x, 0.8, z, scene);
    else if (kind === 3) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1, 8), new THREE.MeshLambertMaterial({ color: 0x4a4a4a })); c.position.set(x, 0.5, z); c.castShadow = true; scene.add(c); }
    else box(0.4, 1.2, 0.4, M.yellow, x, 0.6, z, scene);
  }
  for (let i = 0; i < NROADS; i++) {
    for (let k = -150; k < 180; k += 52) {
      const lx = roadX(i) + 8, lz = k;
      box(0.25, 5.5, 0.25, M.pole, lx, 2.75, lz, scene);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.lampOff);
      bulb.position.set(lx, 5.6, lz);
      scene.add(bulb);
      lampBulbs.push(bulb);
    }
  }
  // billboards
  const billboards = [
    { x: -26, z: -160, text: 'SOLARA CITY', fg: '#ffd23d', bg: '#1a2a4a' },
    { x: 130, z: 60, text: 'VICE BEATS', fg: '#ff5d8a', bg: '#1a0a1a' },
    { x: -130, z: 130, text: 'KING OF SOLARA', fg: '#7dff9a', bg: '#0a2a0a' },
  ];
  for (const b of billboards) {
    box(0.6, 9, 0.6, M.pole, b.x, 4.5, b.z, scene);
    box(0.6, 9, 0.6, M.pole, b.x + 8, 4.5, b.z, scene);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshBasicMaterial({ map: signTex(b.text, b.fg, b.bg) }));
    board.position.set(b.x + 4, 10, b.z);
    scene.add(board);
  }

  // ---------- parks (block indices 2,3 and 5,3) ----------
  for (const [px, pz] of parkBlocks) {
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(16, 20), new THREE.MeshLambertMaterial({ color: 0x4a7a3a }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(px, 0.05, pz);
    lawn.receiveShadow = true;
    scene.add(lawn);
    for (let k = 0; k < 4; k++) palm(px + rand(-10, 10), pz + rand(-10, 10));
    box(4, 0.4, 2, M.pole, px, 0.6, pz + 6, scene);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 16), M.sea);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(px + 6, 0.08, pz - 5);
    scene.add(pond);
  }

  // ---------- plaza beacon (Isla Verde, 330,0) ----------
  {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 1.2, 16), M.curb);
    base.position.set(330, 0.6, 0);
    base.castShadow = true;
    scene.add(base);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 50, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    beam.position.set(330, 25, 0);
    scene.add(beam);
  }

  // ---------- per-frame / state helpers ----------
  function setNight(night) {
    const on = night > 0.4;
    for (const bulb of lampBulbs) {
      bulb.material = on ? M.lampOn : M.lampOff;
    }
    for (const m of windowMats) {
      m.emissive.setHex(on ? 0xcc9933 : 0x000000);
    }
  }
  function setWet(rain) {
    for (const m of roadMats) {
      m.color.setHex(rain > 0.3 ? 0x23262b : 0x3a3d42);
    }
  }
  function update(dt) {
    lightTime += dt;
    for (const h of lightHeads) {
      const ph = lightPhaseAt(h.i, h.j);
      const state = ph < 10 ? 'red' : ph < 12 ? 'amber' : 'green';
      for (const name of ['red', 'amber', 'green']) {
        h.lamps[name].material = name === state
          ? (name === 'red' ? M.redLight : name === 'amber' ? M.amberLight : M.greenLight)
          : M.lightOff;
      }
    }
    const t = performance.now() / 1000;
    for (const s of city.shells) {
      if (!s.taken) {
        s.mesh.position.y = 0.9 + Math.sin(t * 2 + s.x) * 0.15;
        s.mesh.rotation.z += dt * 0.4;
      }
    }
  }

  city._lightHeads = lightHeads;
  return city;
}
