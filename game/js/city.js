// Solara City 3D v3.4 — city: seven districts, roads + traffic lights, bridge to
// Isla Verde, beach + sea, textured buildings, shops, palms, street props,
// golden shells, race starts, stunt ramps, safehouses, a gun shop, a wooden
// harbour pier, a courier depot and parked-vehicle spawn points.
// Fresh rewrite for v3.4. Exports: buildCity(), RAMPS, SAFEHOUSES, SOLIDS,
// groundY, COURIER_DEPOT, COURIER_DROPS, BOAT_SPAWN, BIKE_SPAWNS, PIER.
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z, roadX, roadZ, rand, randi, pick, dist2 } from './state.js';

// ---------- stunt ramps (5) ----------
// Each ramp sits on a road. A car driving over it in the launch direction
// (dx,dz) fast enough goes airborne. The ramp mesh is a sloped slab; the
// trigger zone is a box centred on the ramp.
export const RAMPS = [
  { name: 'North Jump', x: -26, z: 60, yaw: Math.PI, dx: 0, dz: -1 },
  { name: 'East Jump', x: 26, z: -26, yaw: Math.PI / 2, dx: 1, dz: 0 },
  { name: 'South Jump', x: 78, z: 26, yaw: 0, dx: 0, dz: 1 },
  { name: 'West Jump', x: -78, z: 78, yaw: -Math.PI / 2, dx: -1, dz: 0 },
  { name: 'Beach Jump', x: -78, z: 130, yaw: Math.PI, dx: 0, dz: -1 },
];

// ---------- safehouses (3) ----------
// x,z = door / interact point (11 south of the building centre bx,bz).
export const SAFEHOUSES = [
  { name: 'Palm Court', x: -104, z: 115, bx: -104, bz: 104, price: 5000, color: 0x2e8b6a },
  { name: 'Marina Loft', x: 52, z: 115, bx: 52, bz: 104, price: 15000, color: 0x2a6fd4 },
  { name: 'Isla Villa', x: 300, z: -41, bx: 300, bz: -52, price: 30000, color: 0xc9a227 },
];

// ---------- courier depot + drops (v3.4) ----------
// Depot building at block (104,-52); door 11 south of the building centre.
export const COURIER_DEPOT = { name: 'SOLARA COURIER', x: 104, z: -41, bx: 104, bz: -52 };
// Drop points reuse existing spots: two shops, a safehouse door, the beach shop.
export const COURIER_DROPS = [
  { name: 'DOWNTOWN PHARMACY', x: 0, z: -41 },
  { name: 'MARINA MARKET', x: 104, z: 63 },
  { name: 'Palm Court', x: -104, z: 115 },
  { name: 'BEACH TACOS', x: 0, z: 167 },
];

// ---------- parked-vehicle spawns (v3.4) ----------
// Motorcycles: near the garage, near Palm Court safehouse, near Marina Bay.
export const BIKE_SPAWNS = [
  { x: -124, z: 86, yaw: Math.PI / 2 },
  { x: -96, z: 120, yaw: 0 },
  { x: 124, z: 68, yaw: -Math.PI / 2 },
];
// Boat: moored alongside the harbour pier (pier runs east-west at z=-104).
export const BOAT_SPAWN = { x: 228, z: -100, yaw: Math.PI / 2 };
// Pier extent (deck from the shore east into the sea, 6 wide).
export const PIER = { x0: 182, x1: 238, z: -104, halfW: 3 };

// ---------- collision boxes ----------
// {x, z, hw, hd}: axis-aligned boxes the player and cars are pushed out of.
export const SOLIDS = [];

// ---------- ground height ----------
// Bridge deck top is 0.1; everywhere else the ground is 0.
export function groundY(x, z) {
  if (x >= 186 && x <= 282 && Math.abs(z) < 8) return 0.1;
  return 0;
}

// ---------- canvas textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 8 facade styles: base colour + window grid + trim. Deterministic per style.
const FACADE_COLORS = ['#b8a88a', '#8a9ab0', '#a88a7a', '#7a8a6a', '#b09a8a', '#6a7a8a', '#c0b090', '#9a8a9a'];
function facadeTexture(style) {
  const base = FACADE_COLORS[style % FACADE_COLORS.length];
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle vertical shading
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    // window grid
    const cols = 3 + (style % 3);
    const rows = 5 + (style % 3);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = 12 + i * ((w - 24) / cols);
        const y = 14 + j * ((h - 28) / rows);
        const lit = ((i * 7 + j * 3 + style) % 4) === 0;
        g.fillStyle = lit ? '#ffd98a' : '#1c2836';
        g.fillRect(x, y, (w - 24) / cols - 8, (h - 28) / rows - 10);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x, y, (w - 24) / cols - 8, 3);
      }
    }
    // ground-floor band
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 22, w, 22);
  });
}

function signTexture(text, bg = '#1a1a1a', fg = '#f0e8d8', font = 44) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = `bold ${font}px Arial`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function stripeTexture() {
  return canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d43d2a';
    for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 16, h);
  });
}

// ---------- shared state for day/night + wet roads ----------
const roadMats = [];
const lampBulbs = [];
const windowMats = [];
const lightHeads = []; // {ix, iz, axis, offset, red, amber, green}
const LIGHT_CYCLE = 22;
const LIGHT_POINTS = [
  { ix: -26, iz: -26, offset: 0 },
  { ix: 26, iz: -26, offset: 5.5 },
  { ix: -26, iz: 26, offset: 11 },
  { ix: 26, iz: 26, offset: 16.5 },
];

export function lightStateAt(x, z, axis) {
  // nearest traffic-light intersection
  let best = null, bd = Infinity;
  for (const lp of LIGHT_POINTS) {
    const d = dist2(x, z, lp.ix, lp.iz);
    if (d < bd) { bd = d; best = lp; }
  }
  if (!best) return 'green';
  const phase = (((G.time ? G.time.day : 0) + best.offset) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;
  // axis 'x' drives east-west; axis 'z' drives north-south. They alternate.
  if (axis === 'x') {
    if (phase < 9) return 'green';
    if (phase < 11) return 'amber';
    if (phase < 20) return 'red';
    return 'amber';
  }
  if (phase < 9) return 'red';
  if (phase < 11) return 'amber';
  if (phase < 20) return 'green';
  return 'amber';
}

// ---------- building helper ----------
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  (parent || G.scene).add(m);
  return m;
}

function addBuilding(bx, bz, opts = {}) {
  const w = opts.w || rand(15, 19);
  const d = opts.d || rand(16, 20);
  const h = opts.h || rand(10, 28);
  const style = opts.style !== undefined ? opts.style : randi(0, 7);
  const mats = [];
  const side = new THREE.MeshLambertMaterial({ map: facadeTexture(style) });
  const top = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  for (let i = 0; i < 6; i++) mats.push(i === 2 ? top : side);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.position.set(bx, h / 2, bz);
  m.castShadow = true; m.receiveShadow = true;
  G.scene.add(m);
  // roof rim
  box(w + 0.6, 0.5, d + 0.6, new THREE.MeshLambertMaterial({ color: 0x2a2a2a }), bx, h + 0.25, bz);
  // lit windows at night (a few emissive panes on the facade)
  const winMat = new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xffc860, emissiveIntensity: 0 });
  windowMats.push(winMat);
  for (let k = 0; k < 4; k++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.1), winMat);
    win.position.set(bx - w / 2 + 3 + k * ((w - 6) / 3), rand(3, h - 3), bz + d / 2 + 0.06);
    G.scene.add(win);
  }
  SOLIDS.push({ x: bx, z: bz, hw: w / 2, hd: d / 2 });
  return m;
}

function addSign(x, y, z, text, bg, fg, w = 10, h = 2.5) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.3),
    new THREE.MeshLambertMaterial({ map: signTexture(text, bg, fg) })
  );
  m.position.set(x, y, z);
  G.scene.add(m);
  return m;
}

// ---------- build the city ----------
export function buildCity() {
  const scene = G.scene;
  // ----- ground -----
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a6b3a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 480), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(95, 0, 30);
  ground.receiveShadow = true;
  scene.add(ground);
  // ----- sea (east, x > SEA_X) -----
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1a5a8a });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 460), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(310, 0.03, 30);
  sea.receiveShadow = true;
  scene.add(sea);
  // ----- beach (south, z > BEACH_Z) -----
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd8c090 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(420, 60), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, 228);
  sand.receiveShadow = true;
  scene.add(sand);

  // ----- roads -----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e32 });
  roadMats.push(roadMat);
  const ROAD_LEN = 380;
  for (let i = 0; i < NROADS; i++) {
    const rx = roadX(i);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, ROAD_LEN), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(rx, 0.01, 5);
    v.receiveShadow = true;
    scene.add(v);
    const rz = roadZ(i);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, ROAD), roadMat);
    hz.rotation.x = -Math.PI / 2;
    hz.position.set(-5, 0.01, rz);
    hz.receiveShadow = true;
    scene.add(hz);
    // centre dashes
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
    for (let d = -180; d < 200; d += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(rx, 0.02, d);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(d, 0.02, rz);
      scene.add(dash2);
    }
  }
  // ----- bridge to Isla Verde (deck top y=0.1) -----
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
  const deck = box(96, 0.2, 16, deckMat, 234, 0, 0);
  deck.receiveShadow = true;
  const railMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  box(96, 1, 0.4, railMat, 234, 0.6, -8);
  box(96, 1, 0.4, railMat, 234, 0.6, 8);
  // bridge supports
  for (const sx of [200, 234, 268]) {
    box(2, 6, 14, new THREE.MeshLambertMaterial({ color: 0x4a4a50 }), sx, -3, 0);
  }

  // ----- regular buildings (36 blocks) -----
  const reserved = new Set([
    '-104,-104', '-104,52', '0,-52', '0,156', '104,52', // stores
    '-104,104', '52,104', // safehouses (mainland)
    '-52,156', // gun shop
    '-52,0', '104,0', // gardens
    '104,-52', // courier depot
    '104,-104', // harbour parking lot
    '52,-52', // bank
    '0,0', // central plaza (player spawn — keep clear)
  ]);
  const blockVals = [-156, -104, -52, 0, 52, 104, 156];
  for (const bx of blockVals) {
    for (const bz of blockVals) {
      if (reserved.has(`${bx},${bz}`)) continue;
      addBuilding(bx, bz);
    }
  }

  // ----- stores (5) — building at block centre, sign + door 11 south -----
  const STORES = [
    { name: 'OLD TOWN DELI', bx: -104, bz: -104, bg: '#7a2a2a' },
    { name: 'PALM LAUNDRY', bx: -104, bz: 52, bg: '#2a5a7a' },
    { name: 'DOWNTOWN PHARMACY', bx: 0, bz: -52, bg: '#2a7a3a' },
    { name: 'BEACH TACOS', bx: 0, bz: 156, bg: '#a86a1a' },
    { name: 'MARINA MARKET', bx: 104, bz: 52, bg: '#5a2a7a' },
  ];
  const stores = [];
  for (const s of STORES) {
    addBuilding(s.bx, s.bz, { w: 17, d: 18, h: rand(9, 13), style: randi(0, 7) });
    addSign(s.bx, 7.5, s.bz + 9.2, s.name, s.bg, '#f0e8d8', 13, 2.6);
    stores.push({ name: s.name, x: s.bx, z: s.bz + 11, bx: s.bx, bz: s.bz });
  }

  // ----- safehouses (3) — building + sign, door 11 south -----
  for (const sh of SAFEHOUSES) {
    addBuilding(sh.bx, sh.bz, { w: 18, d: 16, h: 12, style: randi(0, 7) });
    const col = '#' + sh.color.toString(16).padStart(6, '0');
    sh.sign = addSign(sh.bx, 8, sh.bz + 8.2, sh.name.toUpperCase(), col, '#ffffff', 12, 2.4);
    sh.ownedSign = addSign(sh.bx, 5.4, sh.bz + 8.2, 'OWNED', '#1a7a2a', '#ffffff', 6, 1.6);
    sh.ownedSign.visible = false;
  }

  // ----- gun shop (SOLARA ARMS) -----
  const GUNSHOP = { name: 'SOLARA ARMS', x: -52, z: 167, bx: -52, bz: 156 };
  addBuilding(GUNSHOP.bx, GUNSHOP.bz, { w: 17, d: 18, h: 11, style: 3 });
  addSign(GUNSHOP.bx, 7.5, GUNSHOP.bz + 9.2, 'SOLARA ARMS', '#3a3a3a', '#ffd24a', 13, 2.6);

  // ----- Downtown Bank (mission 6 target) -----
  addBuilding(52, -52, { w: 20, d: 20, h: 16, style: 1 });
  addSign(52, 9, -52 + 10.2, 'DOWNTOWN BANK', '#1a2a4a', '#e8d890', 13, 2.6);

  // ----- courier depot (v3.4) -----
  addBuilding(COURIER_DEPOT.bx, COURIER_DEPOT.bz, { w: 18, d: 18, h: 11, style: 5 });
  addSign(COURIER_DEPOT.bx, 7.5, COURIER_DEPOT.bz + 9.2, 'SOLARA COURIER', '#c96a1a', '#ffffff', 14, 2.6);
  addSign(COURIER_DEPOT.bx, 4.8, COURIER_DEPOT.bz + 9.2, 'PARCELS  •  SAME DAY', '#222222', '#ffd24a', 12, 1.8);

  // ----- chop shop + garage (small yards on road corners) -----
  const CHOP = { x: 130, z: -78 };
  const GARAGE = { x: -130, z: 78 };
  addBuilding(138, -86, { w: 12, d: 12, h: 7, style: 6 });
  addSign(138, 5, -86 + 6.2, 'CHOP SHOP', '#4a1a1a', '#ff8a6a', 9, 2);
  addBuilding(-138, 86, { w: 12, d: 12, h: 7, style: 2 });
  addSign(-138, 5, 86 + 6.2, 'GARAGE', '#1a3a4a', '#8ad8ff', 9, 2);

  // ----- gardens (2 blocks): grass + trees, no building -----
  for (const [gx, gz] of [[-52, 0], [104, 0]]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshLambertMaterial({ color: 0x3a6b2a }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(gx, 0.02, gz);
    lawn.receiveShadow = true;
    scene.add(lawn);
    for (let k = 0; k < 5; k++) {
      addTree(gx + rand(-13, 13), gz + rand(-13, 13));
    }
  }

  // ----- central plaza (0,0): paved circle + palms, no building -----
  const plazaC = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshLambertMaterial({ color: 0x9a9a8a }));
  plazaC.rotation.x = -Math.PI / 2;
  plazaC.position.set(0, 0.02, 0);
  plazaC.receiveShadow = true;
  scene.add(plazaC);
  for (const [px, pz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) addPalm(px, pz);

  // ----- harbour parking lot (104,-104) -----
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshLambertMaterial({ color: 0x3a3a3e }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(104, 0.02, -104);
  lot.receiveShadow = true;
  scene.add(lot);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (let k = -2; k <= 2; k++) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 8), lineMat);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(104 + k * 6, 0.03, -104);
    scene.add(ln);
  }

  // ----- palms + street props -----
  for (let k = 0; k < 26; k++) {
    // palms along the beach and the marina
    const px = rand(-170, 200);
    const pz = pick([rand(200, 240), rand(40, 70), rand(-120, -90)]);
    addPalm(px, pz);
  }
  // street lamps along the main roads
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const rx of [-130, -26, 78, 130]) {
    for (const rz of [-130, -26, 78, 130]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), lampMat);
      pole.position.set(rx + 7, 3, rz + 7);
      pole.castShadow = true;
      scene.add(pole);
      const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0 });
      lampBulbs.push(bulbMat);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), bulbMat);
      bulb.position.set(rx + 7, 6.2, rz + 7);
      scene.add(bulb);
    }
  }
  // zebra crossings at the central intersections
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (const [zx, zz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) {
    for (let k = -2; k <= 2; k++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5), zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(zx + k * 2.2, 0.02, zz - 9);
      scene.add(stripe);
    }
  }

  // ----- traffic lights (4 intersections, 22 s cycle, staggered) -----
  for (const lp of LIGHT_POINTS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    pole.position.set(lp.ix + 7, 3.5, lp.iz + 7);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Group();
    head.position.set(lp.ix + 7, 7.2, lp.iz + 7);
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    head.add(headBox);
    const mkLamp = (color, y) => {
      const m = new THREE.MeshLambertMaterial({ color: 0x330000, emissive: color, emissiveIntensity: 0 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), m);
      s.position.set(0, y, 0.48);
      head.add(s);
      return m;
    };
    const red = mkLamp(0xff2a2a, 0.75);
    const amber = mkLamp(0xffc832, 0);
    const green = mkLamp(0x2aff5a, -0.75);
    scene.add(head);
    lightHeads.push({ ix: lp.ix, iz: lp.iz, offset: lp.offset, red, amber, green });
  }

  // ----- stunt ramps (5) + STUNT! signs -----
  for (const r of RAMPS) {
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.yaw;
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xd86a1a });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 10), slabMat);
    slab.position.y = 1.09;
    slab.rotation.x = -0.22;
    slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab);
    // side rails
    const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
    for (const sx of [-4, 4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 10), railMat);
      rail.position.set(sx, 1.2, 0);
      rail.rotation.x = -0.22;
      g.add(rail);
    }
    scene.add(g);
    r.mesh = g;
    // STUNT! sign on a post beside the ramp
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    post.position.set(r.x - r.dz * 7, 2, r.z + r.dx * 7);
    scene.add(post);
    addSign(r.x - r.dz * 7, 4.4, r.z + r.dx * 7, 'STUNT!', '#d86a1a', '#ffffff', 7, 1.8);
  }

  // ----- golden shells (20) -----
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0xa8821a, emissiveIntensity: 0.6 });
  const SHELL_SPOTS = [
    [-156, -130], [-156, 26], [-156, 130], [-104, -156], [-104, 156], [-52, -130],
    [-52, 78], [0, -130], [0, 26], [0, 130], [52, -156], [52, 26], [52, 130],
    [104, -156], [104, 130], [156, -104], [156, -26], [156, 78], [156, 156], [300, 40],
  ];
  const shells = [];
  for (const [sx, sz] of SHELL_SPOTS) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), shellMat);
    s.scale.y = 0.6;
    s.position.set(sx, 0.5, sz);
    s.castShadow = true;
    scene.add(s);
    shells.push({ x: sx, z: sz, taken: false, mesh: s });
  }

  // ----- race starts (3) -----
  const RACE_DEFS = [
    { name: 'Sunset Sprint', x: -26, z: 130, len: 6 },
    { name: 'Old Town Loop', x: -130, z: -78, len: 6 },
    { name: 'Beachfront Dash', x: 26, z: 156, len: 5 },
  ];
  const raceStarts = [];
  const checker = canvasTex(128, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? '#111111' : '#f0f0f0';
      g.fillRect(i * 16, j * 16, 16, 16);
    }
  });
  for (const rs of RACE_DEFS) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.5), new THREE.MeshLambertMaterial({ map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(rs.x, 0.02, rs.z);
    scene.add(line);
    raceStarts.push({ name: rs.name, x: rs.x, z: rs.z, len: rs.len });
  }

  // ----- harbour pier (v3.4) + mooring -----
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const deckMat2 = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  const pierLen = PIER.x1 - PIER.x0;
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.12, PIER.halfW * 2), deckMat2);
  pierDeck.position.set((PIER.x0 + PIER.x1) / 2, 0, PIER.z);
  pierDeck.castShadow = true; pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  // posts along both sides
  for (let px = PIER.x0 + 4; px <= PIER.x1; px += 8) {
    for (const pz of [PIER.z - PIER.halfW + 0.4, PIER.z + PIER.halfW - 0.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), woodMat);
      post.position.set(px, 0.4, pz);
      post.castShadow = true;
      scene.add(post);
    }
  }
  addSign(PIER.x0 + 2, 3.4, PIER.z, 'HARBOR PIER', '#5a3a1a', '#ffe8b0', 9, 2);

  // ----- Isla Verde: extra buildings + beacon plaza -----
  for (const [ix, iz] of [[260, -30], [260, 30], [325, -62], [320, 60]]) {
    addBuilding(ix, iz, { w: rand(15, 18), d: rand(15, 19), h: rand(9, 18), style: randi(0, 7) });
  }
  // beacon plaza (mission 9 target) — keep 30 clear of buildings
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(12, 24), new THREE.MeshLambertMaterial({ color: 0x8a8a7a }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(330, 0.02, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const beaconMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 20, 12), beaconMat);
  tower.position.set(330, 10, 0);
  tower.castShadow = true;
  scene.add(tower);
  const beaconLight = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffc832, emissiveIntensity: 0.9 })
  );
  beaconLight.position.set(330, 21, 0);
  scene.add(beaconLight);
  windowMats.push(beaconLight.material);

  // ----- expose the city -----
  G.city = {
    raceStarts,
    stores,
    chop: CHOP,
    garage: GARAGE,
    shells,
    gunshop: GUNSHOP,
    depot: COURIER_DEPOT,
    courierDrops: COURIER_DROPS,
    lightStateAt,
    setNight,
    setWet,
    update: updateCity,
  };
}

// ---------- trees / palms ----------
function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x6a4a2a })
  );
  trunk.position.set(x, 1.5, z);
  trunk.castShadow = true;
  G.scene.add(trunk);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a6b2a })
  );
  top.position.set(x, 4.2, z);
  top.castShadow = true;
  G.scene.add(top);
}

function addPalm(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 5.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a })
  );
  trunk.position.set(x, 2.75, z);
  trunk.rotation.z = rand(-0.12, 0.12);
  trunk.castShadow = true;
  G.scene.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 3.2), leafMat);
    const a = (k / 6) * Math.PI * 2;
    leaf.position.set(x + Math.cos(a) * 1.4, 5.6, z + Math.sin(a) * 1.4);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.35;
    leaf.castShadow = true;
    G.scene.add(leaf);
  }
}

// ---------- day / night + wet roads ----------
export function setNight(isNight) {
  const lampI = isNight ? 1.4 : 0;
  for (const m of lampBulbs) m.emissiveIntensity = lampI;
  for (const m of windowMats) m.emissiveIntensity = isNight ? 0.9 : 0;
}

export function setWet(wet) {
  for (const m of roadMats) {
    m.color.setHex(wet ? 0x1a1a20 : 0x2e2e32);
  }
}

function updateCity(dt) {
  // traffic-light heads follow the cycle
  for (const lh of lightHeads) {
    const phase = (((G.time ? G.time.day : 0) + lh.offset) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;
    // east-west green first half, north-south green second half (matches lightStateAt)
    lh.green.emissiveIntensity = phase < 9 ? 1 : 0;
    lh.amber.emissiveIntensity = ((phase >= 9 && phase < 11) || phase >= 20) ? 1 : 0;
    lh.red.emissiveIntensity = (phase >= 11 && phase < 20) ? 1 : 0;
  }
}
