// Solara City 3D v3.1 — city: detailed low-poly world. Fresh rewrite for v3.1.
// Canvas-texture facades (real window grids that light up at night), roof details,
// shop fronts with awnings + lit signs, neon, billboards, palms with fronds, blob
// trees, street props (hydrants, benches, bus stops, cones, signs), crosswalks,
// Solara Tower, harbour cranes, bridge + Isla Verde. Gameplay anchors preserved:
// 4 signalised intersections (22 s cycle, lightStateAt), lamps + windows follow the
// night, wet roads darken with rain, island buildings stay 30+ units clear of the
// mission beacon plaza at (330, 0), bridge deck top at y = 0.1.
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z, DISTRICTS, districtAt, roadX, roadZ, rand, randi, pick, clamp } from './state.js';

// deterministic layout so every load (and every screenshot) shows the same city
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);
const rr = (a, b) => a + rng() * (b - a);
const rri = (a, b) => Math.floor(rr(a, b + 1));
const rpick = (arr) => arr[Math.floor(rng() * arr.length)];

let elapsed = 0;
const windowMats = [];   // facade materials whose windows glow at night
const lampMats = [];     // street-lamp head materials
const signMats = [];     // lit sign materials
let roadMats = [];     // road strip materials (rain darkens them)

// ---------------- canvas textures ----------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// facade: a window grid. Returns { map, glow } — glow is black except the lit windows,
// so the same grid lights up at night through emissiveMap.
function facadeTextures(base, winDark, winLit, cols, rows, litRatio) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(rng() < litRatio);
    grid.push(row);
  }
  const map = canvasTex(256, 512, (x, W, H) => {
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    // subtle vertical panel lines
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let c = 1; c < cols; c++) x.fillRect((c * W) / cols - 1, 0, 2, H);
    const ww = W / cols * 0.62, wh = H / rows * 0.55;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = (c + 0.19) * (W / cols), py = (r + 0.22) * (H / rows);
        x.fillStyle = grid[r][c] ? winLit : winDark;
        x.fillRect(px, py, ww, wh);
        x.fillStyle = 'rgba(255,255,255,0.14)';
        x.fillRect(px, py, ww, wh * 0.25);
      }
    }
  });
  const glow = canvasTex(256, 512, (x, W, H) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const ww = W / cols * 0.62, wh = H / rows * 0.55;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) continue;
        x.fillStyle = '#ffca6a';
        x.fillRect((c + 0.19) * (W / cols), (r + 0.22) * (H / rows), ww, wh);
      }
    }
  });
  return { map, glow };
}

function signTexture(text, sub, bg, fg, accent) {
  return canvasTex(512, 128, (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = accent; x.lineWidth = 6; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 64px sans-serif';
    x.fillText(text, W / 2, sub ? H / 2 - 14 : H / 2);
    if (sub) { x.font = 'bold 30px sans-serif'; x.fillStyle = accent; x.fillText(sub, W / 2, H - 30); }
  });
}

function billboardTexture(title, sub, bg1, bg2, fg) {
  return canvasTex(512, 256, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg1); g.addColorStop(1, bg2);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 72px sans-serif';
    x.fillText(title, W / 2, H / 2 - 22);
    x.font = 'bold 34px sans-serif';
    x.fillText(sub, W / 2, H / 2 + 52);
  });
}

// ---------------- small builders ----------------
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }
function basic(color) { return new THREE.MeshBasicMaterial({ color }); }
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

// ---------------- traffic lights ----------------
const SIGNAL_SPOTS = [
  { x: -78, z: -78, offset: 0 },
  { x: -78, z: 26, offset: 5.5 },
  { x: 26, z: -78, offset: 11 },
  { x: 26, z: 26, offset: 16.5 },
];
const signals = []; // { x, z, offset, heads: [{ lamps: { red, amber, green }, axis }] }

function signalPhase(sig) {
  const t = (elapsed + sig.offset) % 22;
  if (t < 9) return { ns: 'green', ew: 'red' };
  if (t < 11) return { ns: 'amber', ew: 'red' };
  if (t < 20) return { ns: 'red', ew: 'green' };
  return { ns: 'red', ew: 'amber' };
}

export function lightStateAt(x, z, axis) {
  let best = null, bd = 22;
  for (const s of signals) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return 'green';
  const ph = signalPhase(best);
  return axis === 'z' ? ph.ns : ph.ew;
}

const LAMP_ON = { red: 0xff2a2a, amber: 0xffb020, green: 0x2aff5a };
const LAMP_OFF = { red: 0x3a0d0d, amber: 0x3a2a0d, green: 0x0d2a12 };
function buildSignalHead(parent, x, z, faceAngle, axis) {
  const pole = mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.6, 8), lam(0x2c313a), x, 2.8, z);
  const head = box(0.55, 1.5, 0.55, lam(0x1a1d22), x, 5.9, z);
  head.rotation.y = faceAngle;
  const lamps = {};
  const defs = [['red', 0.42], ['amber', 0], ['green', -0.42]];
  for (const [name, dy] of defs) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), basic(LAMP_OFF[name]));
    // lamps sit on the face that looks toward the approaching traffic
    const fx = Math.sin(faceAngle), fz = Math.cos(faceAngle);
    lamp.position.set(x + fx * 0.3, 5.9 + dy, z + fz * 0.3);
    parent.add(lamp);
    lamps[name] = lamp;
  }
  parent.add(pole, head);
  return { lamps, axis };
}

function refreshSignals() {
  for (const s of signals) {
    const ph = signalPhase(s);
    for (const h of s.heads) {
      const state = ph[h.axis];
      for (const name of ['red', 'amber', 'green']) {
        h.lamps[name].material.color.setHex(name === state ? LAMP_ON[name] : LAMP_OFF[name]);
      }
    }
  }
}

// ---------------- trees ----------------
function makePalm(x, z, s = 1) {
  const g = new THREE.Group();
  const trunkMat = lam(0x8a6a45);
  // slightly curved trunk: three stacked segments, each offset a little
  let tx = 0;
  for (let k = 0; k < 3; k++) {
    const seg = mesh(new THREE.CylinderGeometry(0.22 - k * 0.03, 0.26 - k * 0.03, 1.5, 7), trunkMat, tx, 0.75 + k * 1.45, 0);
    tx += 0.16;
    g.add(seg);
  }
  const topX = tx, topY = 4.4;
  const frondMat = lam(0x2f9e44);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const frond = box(0.5, 0.07, 2.4, frondMat, 0, 0, 1.1);
    const pivot = new THREE.Group();
    pivot.position.set(topX, topY, 0);
    pivot.rotation.y = a;
    frond.rotation.x = 0.55; // droop down-out
    pivot.add(frond);
    g.add(pivot);
  }
  // coconut cluster
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(0x6a4a2a), topX + 0.2, topY - 0.25, 0.15));
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(0x6a4a2a), topX - 0.15, topY - 0.3, -0.2));
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  return g;
}

function makeBlobTree(x, z, s = 1) {
  const g = new THREE.Group();
  const greens = [0x3f8f3a, 0x4da344, 0x2f7d33];
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 7), lam(0x6a4a2a), 0, 0.8, 0));
  const b1 = mesh(new THREE.IcosahedronGeometry(1.5, 0), lam(rpick(greens)), 0, 2.6, 0);
  const b2 = mesh(new THREE.IcosahedronGeometry(1.0, 0), lam(rpick(greens)), 0.9, 2.0, 0.4);
  const b3 = mesh(new THREE.IcosahedronGeometry(0.85, 0), lam(rpick(greens)), -0.8, 2.2, -0.3);
  g.add(b1, b2, b3);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  return g;
}

// ---------------- main build ----------------
export function buildCity() {
  const scene = G.scene;
  const root = new THREE.Group();
  scene.add(root);
  const add = (m) => root.add(m);

  // ---- ground: one canvas shows grass + sidewalk block pads ----
  const groundTex = canvasTex(1024, 1024, (x, W, H) => {
    x.fillStyle = '#3d4a3d'; x.fillRect(0, 0, W, H); // grass base
    // sidewalk pads: light slabs where the blocks sit
    const toPx = (v) => ((v + 215) / 430) * W;
    x.fillStyle = '#9aa0aa';
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const cx = -156 + i * 52, cz = -156 + j * 52;
        x.fillRect(toPx(cx - 20), toPx(cz - 20), toPx(40) - toPx(0), toPx(40) - toPx(0));
      }
    }
    // island pad
    x.fillStyle = '#9ab87a';
    x.beginPath(); x.arc(toPx(300), toPx(0), toPx(75) - toPx(0), 0, Math.PI * 2); x.fill();
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(430, 430), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  add(ground);

  // ---- roads: dashed strips (materials tracked so rain can darken them) ----
  const dashTex = canvasTex(64, 256, (x, W, H) => {
    x.fillStyle = '#45454a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#d8c25a';
    x.fillRect(W / 2 - 3, 40, 6, 70);
    x.fillRect(W / 2 - 3, 168, 6, 70);
  });
  dashTex.wrapS = dashTex.wrapT = THREE.RepeatWrapping;
  for (let i = 0; i < NROADS; i++) {
    const vt = dashTex.clone();
    vt.needsUpdate = true;
    vt.repeat.set(1, 7);
    const vm = new THREE.MeshLambertMaterial({ map: vt, emissive: 0x14161c });
    roadMats.push(vm);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 380), vm);
    v.rotation.x = -Math.PI / 2;
    v.position.set(roadX(i), 0.01, 0);
    v.receiveShadow = true;
    add(v);
    const ht = dashTex.clone();
    ht.needsUpdate = true;
    ht.repeat.set(7, 1);
    const hm = new THREE.MeshLambertMaterial({ map: ht, emissive: 0x14161c });
    roadMats.push(hm);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(380, ROAD), hm);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.012, roadZ(i));
    h.receiveShadow = true;
    add(h);
  }

  // ---- crosswalks at the signalised intersections ----
  const stripeTex = canvasTex(128, 128, (x, W, H) => {
    x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, W, H);
    x.fillStyle = '#e8e8e8';
    for (let k = 0; k < 5; k++) x.fillRect(8 + k * 24, 10, 14, H - 20);
  });
  for (const s of SIGNAL_SPOTS) {
    for (const [dx, dz, rot] of [[0, -9, 0], [0, 9, 0], [-9, 0, Math.PI / 2], [9, 0, Math.PI / 2]]) {
      const cw = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 4.5),
        new THREE.MeshLambertMaterial({ map: stripeTex, transparent: true, opacity: 0.85 })
      );
      cw.rotation.x = -Math.PI / 2;
      cw.rotation.z = rot;
      cw.position.set(s.x + dx, 0.03, s.z + dz);
      add(cw);
    }
  }

  // ---- beach + sea ----
  const sand = mesh(new THREE.PlaneGeometry(400, 62), lam(0xd9c08a), 10, 0.02, 231);
  sand.rotation.x = -Math.PI / 2;
  add(sand);
  const sea = mesh(new THREE.PlaneGeometry(220, 460), lam(0x1f6f8b), 320, -0.3, 20);
  sea.rotation.x = -Math.PI / 2;
  add(sea);
  const seaS = mesh(new THREE.PlaneGeometry(400, 60), lam(0x1f6f8b), 10, -0.3, 292);
  seaS.rotation.x = -Math.PI / 2;
  add(seaS);
  // beach umbrellas
  for (const [ux, uz, col] of [[-60, 225, 0xe84a5f], [-20, 235, 0x4ecdc4], [40, 222, 0xffd23d], [90, 238, 0x7a4fd4]]) {
    add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), lam(0x8a8a8a), ux, 1.5, uz));
    const umb = mesh(new THREE.ConeGeometry(2.2, 0.9, 10), lam(col), ux, 3.3, uz);
    add(umb);
  }

  // ---- facade texture styles (one canvas per style, cloned per building) ----
  const styles = {
    glass: facadeTextures('#2a3a4a', '#101820', '#ffd28a', 7, 12, 0.45),
    brick: facadeTextures('#8a5a40', '#241812', '#ffca6a', 5, 8, 0.35),
    modern: facadeTextures('#e8e0d0', '#20242c', '#ffe9a8', 6, 9, 0.4),
    suburban: facadeTextures('#d8c8a8', '#2a2118', '#ffca6a', 4, 6, 0.3),
    warehouse: facadeTextures('#6a7078', '#1c2024', '#ffd28a', 6, 4, 0.2),
  };
  function buildingMat(style, w, h) {
    const st = styles[style];
    const map = st.map.clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(Math.max(1, Math.round(w / 13)), Math.max(1, Math.round(h / 22)));
    const glow = st.glow.clone();
    glow.needsUpdate = true;
    glow.wrapS = glow.wrapT = THREE.RepeatWrapping;
    glow.repeat.copy(map.repeat);
    const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffc860, emissiveMap: glow, emissiveIntensity: 0 });
    windowMats.push(m);
    return m;
  }
  function roofBits(g, w, d, h, style) {
    // parapet edge
    g.add(box(w + 0.4, 0.5, d + 0.4, lam(0x3a3f46), 0, h + 0.25, 0));
    if (rng() < 0.7) g.add(box(rr(1.2, 2.2), rr(0.8, 1.4), rr(1.2, 2), lam(0x9aa2ad), rr(-w / 4, w / 4), h + 0.9, rr(-d / 4, d / 4))); // AC unit
    if (rng() < 0.5) {
      const ant = mesh(new THREE.CylinderGeometry(0.06, 0.08, rr(3, 6), 6), lam(0x666666), rr(-w / 3, w / 3), h + 2.5, rr(-d / 3, d / 3));
      g.add(ant);
    }
    if (rng() < 0.35) g.add(mesh(new THREE.CylinderGeometry(rr(0.8, 1.2), rr(0.8, 1.2), 1.6, 10), lam(0x7a6a55), rr(-w / 4, w / 4), h + 1.1, rr(-d / 4, d / 4))); // water tank
  }

  // ---- buildings, block by block ----
  const specialBlocks = new Set(['3,2', '5,1', '5,0', '1,4']); // tower, harbour, garage
  const parkBlocks = new Set(['2,3', '5,3']);
  // shops: building sits on a block centre; the rob point is on the sidewalk
  // right in front of the shop front (+z face, 11 units out)
  const storeDefs = [
    { bx: 0, bz: 52, name: '24/7 MARKET', col: '#0e7a3d' },
    { bx: -52, bz: -104, name: 'LIQUOR', col: '#7a1e2b' },
    { bx: 52, bz: 52, name: 'PAWN SHOP', col: '#8a6d1e' },
    { bx: 0, bz: -104, name: 'DONUTS', col: '#c25a8a' },
    { bx: 104, bz: 104, name: 'PHARMACY', col: '#1e6a8a' },
  ];
  const storeByBlock = new Map();
  for (const s of storeDefs) {
    const bi = Math.round((s.bx + 156) / 52), bj = Math.round((s.bz + 156) / 52);
    storeByBlock.set(bi + ',' + bj, s);
  }
  const stores = [];
  function shopFront(g, w, name, col) {
    // awning + lit sign + glass storefront
    const awn = box(w * 0.8, 0.18, 2.2, lam(0xd8552a), 0, 2.6, w * 0.1 + 1.2);
    awn.rotation.x = 0.25;
    const sign = signTexture(name, 'OPEN 24H', '#14161c', '#ffe9b0', col);
    const signMat = new THREE.MeshLambertMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.25 });
    signMats.push(signMat);
    const board = box(w * 0.85, 1.1, 0.18, signMat, 0, 3.9, w * 0.1 + 0.7);
    const glass = box(w * 0.8, 2.0, 0.1, lam(0x2a4a5a), 0, 1.4, w * 0.1 + 0.55);
    g.add(awn, board, glass);
  }
  function makeBuilding(cx, cz, w, d, h, style, opts = {}) {
    const g = new THREE.Group();
    const body = box(w, h, d, buildingMat(style, w, h), 0, h / 2, 0);
    g.add(body);
    roofBits(g, w, d, h, style);
    if (opts.shop) shopFront(g, w, opts.shop.name, opts.shop.col);
    if (opts.neon) {
      const neon = box(w * 0.7, 0.22, 0.1, basic(opts.neon), 0, h * 0.55, d / 2 + 0.08);
      g.add(neon);
      const neon2 = box(0.22, h * 0.4, 0.1, basic(opts.neon === 0xff4ec4 ? 0x4ecdc4 : 0xff4ec4), w / 2 + 0.08, h * 0.5, 0);
      g.add(neon2);
    }
    g.position.set(cx, 0, cz);
    g.rotation.y = opts.rot || 0;
    add(g);
    return g;
  }

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const key = i + ',' + j;
      const cx = -156 + i * 52, cz = -156 + j * 52;
      const d = districtAt(cx, cz);
      if (parkBlocks.has(key)) {
        // park: trees + benches + a path
        for (let k = 0; k < 5; k++) add(makeBlobTree(cx + rr(-14, 14), cz + rr(-14, 14), rr(0.9, 1.4)));
        for (let k = 0; k < 3; k++) {
          const bx = cx + rr(-12, 12), bz = cz + rr(-12, 12);
          add(box(2.4, 0.14, 0.7, lam(0x8a6a45), bx, 0.55, bz));
          add(box(2.4, 0.7, 0.14, lam(0x8a6a45), bx, 0.9, bz - 0.35));
        }
        continue;
      }
      if (key === '3,2') continue; // Solara Tower (below)
      if (key === '5,1' || key === '5,0') continue; // harbour (below)
      const store = storeByBlock.get(key);
      if (store) {
        makeBuilding(cx, cz, 20, 14, 9, 'modern', { shop: { name: store.name, col: store.col } });
        stores.push({ x: store.bx, z: store.bz + 11, kind: 'store', name: store.name, robT: 0 });
        continue;
      }
      if (key === '1,4') {
        // garage (respray) — Palm Heights
        makeBuilding(cx, cz, 22, 15, 8, 'warehouse', { shop: { name: 'GARAGE', col: '#1e8a8a' } });
        continue;
      }
      // normal block: 1-3 buildings by district
      const isDowntown = d.name === 'Downtown Solara';
      const isMarina = d.name === 'Marina Bay';
      const n = isDowntown ? (rng() < 0.5 ? 1 : 2) : rri(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rr(10, 17), dd = rr(10, 15);
        const ox = n === 1 ? 0 : (k - (n - 1) / 2) * 14;
        const oz = n === 1 ? 0 : (rng() < 0.5 ? -6 : 6);
        let h, style;
        if (isDowntown) { h = rr(22, 42); style = 'glass'; }
        else if (d.name === 'Old Town') { h = rr(8, 14); style = 'brick'; }
        else if (isMarina) { h = rr(10, 20); style = 'modern'; }
        else if (d.name === 'Beachfront') { h = rr(10, 18); style = 'modern'; }
        else if (d.name === 'Palm Heights') { h = rr(5, 8); style = 'suburban'; }
        else { h = rr(7, 13); style = 'warehouse'; }
        makeBuilding(cx + ox, cz + oz, w, dd, h, style, {
          neon: isMarina && rng() < 0.5 ? (rng() < 0.5 ? 0xff4ec4 : 0x4ecdc4) : null,
        });
      }
    }
  }

  // ---- Solara Tower (Downtown landmark) ----
  {
    const g = new THREE.Group();
    const tower = box(17, 52, 17, buildingMat('glass', 17, 52), 0, 26, 0);
    const crown = box(12, 6, 12, lam(0x1a2430), 0, 55, 0);
    const antenna = mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 8), lam(0x888888), 0, 62, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), basic(0xff2222));
    beacon.position.set(0, 67, 0);
    const sign = signTexture('SOLARA', 'TOWER', '#14161c', '#ffd23d', '#ffd23d');
    const signMat = new THREE.MeshLambertMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.4 });
    signMats.push(signMat);
    const board = box(15, 2.4, 0.3, signMat, 0, 47, 8.7);
    g.add(tower, crown, antenna, beacon, board);
    g.position.set(0, 0, -52);
    add(g);
  }

  // ---- harbour: cranes + containers + chop shop ----
  {
    const craneMat = lam(0xd8a020);
    for (const [cx, cz, rot] of [[120, -120, 0.4], [88, -128, -0.3]]) {
      const g = new THREE.Group();
      g.add(box(1.6, 20, 1.6, craneMat, 0, 10, 0));
      const jib = box(22, 1.2, 1.2, craneMat, 6, 19, 0);
      jib.rotation.z = 0.08;
      g.add(jib);
      g.add(box(4, 2, 2, lam(0x8a8a8a), -4, 18, 0));
      const cable = mesh(new THREE.CylinderGeometry(0.05, 0.05, 7, 6), lam(0x333333), 12, 15, 0);
      g.add(cable);
      g.add(box(2.2, 1.6, 1.6, lam(0xc25a2a), 12, 11, 0));
      g.position.set(cx, 0, cz);
      g.rotation.y = rot;
      add(g);
    }
    const contCols = [0xc0392b, 0x2a6fd4, 0x3aa655, 0xd8a020, 0x7a4fd4];
    for (let k = 0; k < 14; k++) {
      const cx = 78 + (k % 5) * 7, cz = -138 + Math.floor(k / 5) * 7;
      const stack = k % 3 === 0 ? 2 : 1;
      for (let s = 0; s < stack; s++) {
        add(box(6, 2.6, 2.6, lam(contCols[(k + s) % contCols.length]), cx, 1.3 + s * 2.6, cz));
      }
    }
    // chop shop building (Harbor Docks)
    makeBuilding(104, -104, 20, 14, 8, 'warehouse', { shop: { name: 'CHOP SHOP', col: '#c0392b' } });
  }

  // ---- bridge to Isla Verde (deck top at y = 0.1) ----
  {
    const deck = box(88, 0.4, 12, lam(0x4a4f58), 224, -0.1, 0);
    add(deck);
    add(box(88, 1.0, 0.4, lam(0x8a8f98), 224, 0.6, 5.8));
    add(box(88, 1.0, 0.4, lam(0x8a8f98), 224, 0.6, -5.8));
    for (const px of [200, 224, 248]) {
      add(box(3, 8, 8, lam(0x3a3f46), px, -4, 0)); // support pillars into the sea
      const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe0a0, emissive: 0xffe0a0, emissiveIntensity: 0.2 });
      lampMats.push(lampMat);
      add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), lam(0x2c313a), px, 2.5, 5.4));
      add(mesh(new THREE.SphereGeometry(0.3, 8, 6), lampMat, px, 5.2, 5.4));
    }
  }

  // ---- Isla Verde (island at 300,0; buildings keep 30+ clear of the beacon plaza 330,0) ----
  {
    const island = mesh(new THREE.CircleGeometry(75, 28), lam(0x9ab87a), 300, 0.03, 0);
    island.rotation.x = -Math.PI / 2;
    add(island);
    // villas in a ring, all 40+ from (330,0)
    for (const [vx, vz] of [[268, -32], [272, 34], [296, -48], [296, 48], [258, 0], [352, -30], [352, 30]]) {
      makeBuilding(vx, vz, rr(12, 16), rr(10, 13), rr(6, 10), 'modern', { neon: null });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(makePalm(300 + Math.cos(a) * 58, Math.sin(a) * 58, rr(0.9, 1.2)));
    }
    // palms ringing the beacon plaza (38 out, so the beam stays clear)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      add(makePalm(330 + Math.cos(a) * 38, Math.sin(a) * 38, rr(0.9, 1.2)));
    }
  }

  // ---- traffic lights (4 intersections) ----
  for (const s of SIGNAL_SPOTS) {
    const sig = { x: s.x, z: s.z, offset: s.offset, heads: [] };
    // NS-phase heads on the north/south sides, EW-phase on east/west
    sig.heads.push(buildSignalHead(root, s.x - 8, s.z - 8, Math.PI, 'ns'));       // north side, faces south
    sig.heads.push(buildSignalHead(root, s.x + 8, s.z + 8, 0, 'ns'));            // south side, faces north
    sig.heads.push(buildSignalHead(root, s.x + 8, s.z - 8, -Math.PI / 2, 'ew')); // east side, faces west
    sig.heads.push(buildSignalHead(root, s.x - 8, s.z + 8, Math.PI / 2, 'ew'));  // west side, faces east
    signals.push(sig);
  }

  // ---- street lamps along the roads ----
  for (let i = 0; i < NROADS; i++) {
    for (let j = 0; j < NROADS; j += 2) {
      const lx = roadX(i), lz = roadZ(j);
      const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe0a0, emissive: 0xffe0a0, emissiveIntensity: 0.2 });
      lampMats.push(lampMat);
      add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 6, 6), lam(0x2c313a), lx + 7, 3, lz));
      add(mesh(new THREE.SphereGeometry(0.34, 8, 6), lampMat, lx + 7, 6.1, lz));
    }
  }

  // ---- trees: street trees on block corners (never on a road), palms in the
  // south/west districts, blob trees elsewhere ----
  for (let k = 0; k < 30; k++) {
    const bi = rri(0, 5), bj = rri(0, 5);
    const cx = -156 + bi * 52, cz = -156 + bj * 52;
    const px = cx + (rng() < 0.5 ? -1 : 1) * rr(14, 17);
    const pz = cz + (rng() < 0.5 ? -1 : 1) * rr(14, 17);
    const d = districtAt(px, pz);
    if (d.name === 'Palm Heights' || d.name === 'Beachfront' || d.name === 'Marina Bay') {
      add(makePalm(px, pz, rr(0.9, 1.3)));
    } else if (rng() < 0.6) {
      add(makeBlobTree(px, pz, rr(0.9, 1.5)));
    }
  }

  // ---- street props ----
  // hydrants
  for (let k = 0; k < 12; k++) {
    const hx = roadX(rri(0, 6)) + (rng() < 0.5 ? -7.5 : 7.5);
    const hz = roadZ(rri(0, 6)) + (rng() < 0.5 ? -7.5 : 7.5);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), lam(0xc22a2a), 0, 0.35, 0));
    g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), lam(0xc22a2a), 0, 0.78, 0));
    g.position.set(hx, 0, hz);
    add(g);
  }
  // benches
  for (let k = 0; k < 10; k++) {
    const bx = roadX(rri(0, 6)) + (rng() < 0.5 ? -7.5 : 7.5);
    const bz = roadZ(rri(0, 6)) + (rng() < 0.5 ? -7.5 : 7.5);
    add(box(2.4, 0.14, 0.7, lam(0x8a6a45), bx, 0.55, bz));
    add(box(2.4, 0.7, 0.14, lam(0x8a6a45), bx, 0.95, bz - 0.32));
    add(box(0.14, 0.55, 0.6, lam(0x333333), bx - 1, 0.28, bz));
    add(box(0.14, 0.55, 0.6, lam(0x333333), bx + 1, 0.28, bz));
  }
  // bus stops (shelter + sign)
  for (const [sx, sz] of [[-26, 78], [78, -26], [-78, 130], [26, -130]]) {
    const g = new THREE.Group();
    g.add(box(3.4, 0.16, 1.6, lam(0x2a6fd4), 0, 2.6, 0));
    g.add(box(0.14, 2.6, 0.14, lam(0x666666), -1.6, 1.3, -0.7));
    g.add(box(0.14, 2.6, 0.14, lam(0x666666), 1.6, 1.3, -0.7));
    g.add(box(3.4, 1.2, 0.08, lam(0x9fd4e8), 0, 1.4, -0.75));
    g.add(box(2.2, 0.14, 0.6, lam(0x8a6a45), 0, 0.55, -0.4));
    g.position.set(sx, 0, sz);
    add(g);
  }
  // traffic cones (roadworks near downtown)
  for (let k = 0; k < 8; k++) {
    const cx = -26 + (k % 4) * 2.2, cz = -52 + Math.floor(k / 4) * 3;
    const cone = mesh(new THREE.ConeGeometry(0.32, 0.75, 10), lam(0xe85d04), cx, 0.38, cz);
    const band = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 10), lam(0xffffff), cx, 0.42, cz);
    add(cone, band);
  }
  // road signs (stop + street names)
  for (const [sx, sz, rot] of [[-70, -70, 0], [34, 34, Math.PI], [-70, 34, 0], [34, -70, Math.PI]]) {
    add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), lam(0x8a8a8a), sx, 1.6, sz));
    const stop = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), lam(0xc22a2a), sx, 3.3, sz);
    stop.rotation.x = Math.PI / 2;
    stop.rotation.z = rot;
    add(stop);
  }
  // billboards
  const bbData = [
    { x: -130, z: -182, rot: 0, tex: billboardTexture('SOLARA CITY', 'SEVEN DISTRICTS · ONE KING', '#1a2a4a', '#c25a2a', '#ffd23d') },
    { x: 130, z: -182, rot: 0, tex: billboardTexture('VICE COLA', 'TASTE THE NIGHT', '#3a0d2a', '#0d2a3a', '#ff4ec4') },
    { x: -182, z: 78, rot: Math.PI / 2, tex: billboardTexture('NEON NIGHTS', 'MARINA BAY · AFTER DARK', '#0d2a3a', '#2a0d3a', '#4ecdc4') },
    { x: 182, z: -78, rot: -Math.PI / 2, tex: billboardTexture('FALCO SPORT', '0-60 IN 3.1 SECONDS', '#2a2a2a', '#7a1e1e', '#ffffff') },
  ];
  for (const b of bbData) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: b.tex, emissive: 0xffffff, emissiveMap: b.tex, emissiveIntensity: 0.2 });
    signMats.push(mat);
    const panel = box(14, 7, 0.4, mat, 0, 9, 0);
    g.add(panel);
    g.add(box(0.6, 9, 0.6, lam(0x333333), -5, 4.5, 0));
    g.add(box(0.6, 9, 0.6, lam(0x333333), 5, 4.5, 0));
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot;
    add(g);
  }

  // ---- gameplay anchors ----
  const raceStarts = [
    { x: -26, z: 130, name: 'Beachfront Dash', len: 4 },
    { x: -78, z: -78, name: 'Old Town Loop', len: 5 },
    { x: 78, z: 26, name: 'Sunset Sprint', len: 6 },
  ];
  const chop = { x: 104, z: -104 };
  const garage = { x: -104, z: 52 };
  const shells = [];
  const shellSpots = [
    [-60, 225], [-20, 235], [40, 222], [90, 238], [130, 228],           // beach
    [120, 40], [88, 70], [140, 60],                                      // marina
    [285, -28], [272, 22], [312, 40], [322, -18],                        // island
    [10, -40], [-40, 10], [52, -78],                                     // downtown
    [120, -120], [88, -88],                                              // harbor
    [-120, -90], [-88, -120],                                            // old town
    [-120, 40],                                                          // palm heights
  ];
  for (const [sx, sz] of shellSpots) {
    const mg = new THREE.Group();
    const core = mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffd23d, emissive: 0xa8820a, emissiveIntensity: 0.7 }), 0, 0, 0);
    const ring = mesh(new THREE.TorusGeometry(0.75, 0.14, 8, 18), basic(0xffe9a8), 0, 0, 0);
    mg.add(core, ring);
    mg.position.set(sx, 1.2, sz);
    add(mg);
    shells.push({ x: sx, z: sz, taken: false, mesh: mg });
  }

  G.city = {
    raceStarts, chop, garage, stores, shells,
    setNight(night) {
      for (const m of windowMats) m.emissiveIntensity = night * 1.3;
      for (const m of lampMats) m.emissiveIntensity = 0.2 + night * 1.5;
      for (const m of signMats) m.emissiveIntensity = 0.25 + night * 1.1;
    },
    setWet(rain) {
      // the dash texture is the dry look; rain only darkens the tint (dry = white)
      const r = 1 - rain * 0.45, gg = 1 - rain * 0.42, b = 1 - rain * 0.34;
      for (const m of roadMats) m.color.setRGB(r, gg, b);
    },
    update(dt) {
      elapsed += dt;
      refreshSignals();
    },
  };
  refreshSignals();
}
