// Solara City 3D v3.2 — city: realistic districts with textured facades, readable
// shop signs, varied roofs, palms, street props, parked cars, traffic lights,
// bridge + island, sea + beach. Fresh rewrite for v3.2.
// Exports: buildCity(). G.city = { setNight, setWet, update, raceStarts, stores,
// chop, garage, shells, lightStateAt }.
import * as THREE from 'three';
import {
  G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z,
  DISTRICTS, rand, randi, pick, clamp, dist2,
} from './state.js';

// ---- deterministic layout RNG (same city every load) ----
function mulberry32(seed) {
  let a = seed;
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

const ROAD_XS = [-182, -130, -78, -26, 26, 78, 130, 182];
const ROAD_ZS = [-182, -130, -78, -26, 26, 78, 130, 182];
const BLOCK_CS = [-156, -104, -52, 0, 52, 104, 156];

// ---- canvas texture helpers ----
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function canvasTex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

// facade styles: 0 glass, 1 brick, 2 concrete, 3 stucco, 4 art-deco, 5 house, 6 industrial, 7 dark glass
function facadeTexture(style) {
  const [c, x] = makeCanvas(256, 256);
  const bases = ['#2a3a4a', '#7a4a38', '#9a938a', '#d8c49a', '#c8b890', '#e8d8b0', '#6a6a6a', '#2a3644'];
  const base = bases[style] || bases[2];
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  // subtle grime / variation
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.06})`;
    x.fillRect(rng() * 256, rng() * 256, 2 + rng() * 5, 2 + rng() * 5);
  }
  if (style === 1) {
    // brick courses
    x.strokeStyle = 'rgba(0,0,0,0.25)';
    x.lineWidth = 1;
    for (let y = 0; y < 256; y += 12) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
    for (let y = 6; y < 256; y += 12) {
      for (let xx = (y / 12) % 2 === 0 ? 0 : 16; xx < 256; xx += 32) {
        x.beginPath(); x.moveTo(xx, y - 6); x.lineTo(xx, y + 6); x.stroke();
      }
    }
  }
  if (style === 6) {
    // corrugated vertical lines
    x.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let xx = 0; xx < 256; xx += 8) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, 256); x.stroke(); }
  }
  if (style === 4) {
    // art-deco vertical ribs
    x.fillStyle = 'rgba(255,255,255,0.12)';
    for (let xx = 8; xx < 256; xx += 32) x.fillRect(xx, 0, 6, 256);
  }
  if (style === 5) {
    // siding lines
    x.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < 256; y += 10) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
  }
  // windows: grid with random lit / dark, framed
  const cols = style === 5 ? 5 : style === 0 || style === 7 ? 8 : 6;
  const rows = style === 5 ? 4 : 10;
  const ww = 256 / cols, wh = 256 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = rng() < 0.42;
      const wx = i * ww + ww * 0.2, wy = j * wh + wh * 0.2;
      const wW = ww * 0.6, wH = wh * 0.55;
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(wx - 2, wy - 2, wW + 4, wH + 4); // frame shadow
      if (lit) {
        x.fillStyle = rng() < 0.7 ? '#ffd27a' : '#ffe9b0';
      } else if (style === 0 || style === 7) {
        x.fillStyle = '#101c28';
      } else {
        x.fillStyle = '#232a30';
      }
      x.fillRect(wx, wy, wW, wH);
      // window cross bar
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(wx, wy + wH / 2 - 1, wW, 2);
      x.fillRect(wx + wW / 2 - 1, wy, 2, wH);
    }
  }
  return canvasTex(c);
}

function asphaltTexture() {
  const [c, x] = makeCanvas(128, 512);
  x.fillStyle = '#33343a';
  x.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 900; i++) {
    const v = 40 + rng() * 40;
    x.fillStyle = `rgb(${v},${v},${v + 4})`;
    x.fillRect(rng() * 128, rng() * 512, 1.5, 1.5);
  }
  // patches + cracks
  for (let i = 0; i < 7; i++) {
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(rng() * 100, rng() * 480, 14 + rng() * 20, 8 + rng() * 16);
  }
  x.strokeStyle = 'rgba(0,0,0,0.4)';
  x.beginPath(); x.moveTo(rng() * 128, 0); x.lineTo(rng() * 128, 512); x.stroke();
  // edge lines
  x.fillStyle = 'rgba(220,220,220,0.55)';
  x.fillRect(4, 0, 2, 512);
  x.fillRect(122, 0, 2, 512);
  // centre dashes (worn yellow)
  x.fillStyle = 'rgba(220,180,60,0.75)';
  for (let y = 0; y < 512; y += 64) x.fillRect(62, y, 4, 34);
  return canvasTex(c);
}

function concreteTexture() {
  const [c, x] = makeCanvas(128, 128);
  x.fillStyle = '#8f8a80';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    const v = 120 + rng() * 40;
    x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    x.fillRect(rng() * 128, rng() * 128, 1.5, 1.5);
  }
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.lineWidth = 2;
  x.strokeRect(1, 1, 126, 126);
  x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.stroke();
  x.beginPath(); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
  return canvasTex(c);
}

function grassTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#57704a';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const g = 90 + rng() * 50;
    x.fillStyle = `rgb(${g * 0.75},${g},${g * 0.55})`;
    x.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  for (let i = 0; i < 10; i++) {
    x.fillStyle = 'rgba(120,100,60,0.25)';
    x.beginPath(); x.arc(rng() * 256, rng() * 256, 8 + rng() * 18, 0, Math.PI * 2); x.fill();
  }
  return c;
}

function sandTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#d9c08a';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const v = 190 + rng() * 50;
    x.fillStyle = `rgb(${v},${v - 20},${v - 70})`;
    x.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  return c;
}

function seaTexture() {
  const [c, x] = makeCanvas(256, 256);
  const grad = x.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#1f6f8b');
  grad.addColorStop(0.5, '#2a8aa8');
  grad.addColorStop(1, '#1a5a78');
  x.fillStyle = grad;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 26; i++) {
    x.beginPath();
    const y = rng() * 256;
    x.moveTo(0, y);
    x.bezierCurveTo(80, y + rr(-6, 6), 170, y + rr(-6, 6), 256, y);
    x.stroke();
  }
  return c;
}

function crosswalkTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#33343a';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(235,235,235,0.8)';
  // zebra stripes on all four approaches (faded)
  for (let k = 0; k < 10; k++) {
    const s = 68 + k * 12.8;
    x.fillRect(s, 8, 8, 40); // north
    x.fillRect(s, 208, 8, 40); // south
    x.fillRect(8, s, 40, 8); // west
    x.fillRect(208, s, 40, 8); // east
  }
  // stop lines
  x.fillRect(20, 44, 216, 5);
  x.fillRect(20, 207, 216, 5);
  x.fillRect(44, 20, 5, 216);
  x.fillRect(207, 20, 5, 216);
  return canvasTex(c);
}

function signTexture(text, bg, fg, sub) {
  const [c, x] = makeCanvas(512, 128);
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = fg;
  x.lineWidth = 6;
  x.strokeRect(6, 6, 500, 116);
  x.fillStyle = fg;
  x.font = 'bold 52px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, sub ? 52 : 64);
  if (sub) {
    x.font = 'bold 26px sans-serif';
    x.fillText(sub, 256, 98);
  }
  return c;
}

function awningTexture(color) {
  const [c, x] = makeCanvas(128, 64);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 === 0 ? color : '#f2ead8';
    x.fillRect(i * 16, 0, 16, 64);
  }
  return c;
}

// ---- shared materials ----
const MAT = {
  asphalt: null, concrete: null, grass: null, sand: null, sea: null, cross: null,
  pole: new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  lampHead: new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.2 }),
  hydrant: new THREE.MeshLambertMaterial({ color: 0xc22e24 }),
  benchWood: new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
  benchIron: new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
  cone: new THREE.MeshLambertMaterial({ color: 0xe86a1a }),
  mailbox: new THREE.MeshLambertMaterial({ color: 0x2a5fd4 }),
  bin: new THREE.MeshLambertMaterial({ color: 0x2e4a2e }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
  trunkRing: new THREE.MeshLambertMaterial({ color: 0x5a3d22 }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3a7a3a }),
  palmLeaf2: new THREE.MeshLambertMaterial({ color: 0x4a8a3a }),
  leafBlob: new THREE.MeshLambertMaterial({ color: 0x4a7a3a }),
  leafBlob2: new THREE.MeshLambertMaterial({ color: 0x5d8a42 }),
  roofDark: new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
  acUnit: new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
  waterTank: new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  bridgeDeck: new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
  bridgeRail: new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
  containerA: new THREE.MeshLambertMaterial({ color: 0xc23b22 }),
  containerB: new THREE.MeshLambertMaterial({ color: 0x2a6fd4 }),
  containerC: new THREE.MeshLambertMaterial({ color: 0x3aa655 }),
  containerD: new THREE.MeshLambertMaterial({ color: 0xe8c832 }),
  crane: new THREE.MeshLambertMaterial({ color: 0xd8a03a }),
  shellGold: new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffb52a, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.25 }),
  neonPink: new THREE.MeshStandardMaterial({ color: 0xff5da2, emissive: 0xff2a8a, emissiveIntensity: 0.25 }),
  neonCyan: new THREE.MeshStandardMaterial({ color: 0x4ecdc4, emissive: 0x1ad4c2, emissiveIntensity: 0.25 }),
  neonAmber: new THREE.MeshStandardMaterial({ color: 0xffc46a, emissive: 0xff9f1c, emissiveIntensity: 0.25 }),
};

function box(w, h, d, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, mat, x, y, z, parent, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ---- module state ----
let lightClock = 0;
let lightHeads = []; // {red, amber, green, axis, idx}
let glowMats = []; // building facade materials (night glow)
let neonMats = [];
let lampBulbs = [];
let palmGroups = [];
let seaMat = null;
let beaconMat = null;
let roadMats = [];
let flickerNeon = null;

const LIGHT_POS = [
  { x: -26, z: -26 }, { x: 26, z: -26 }, { x: -26, z: 26 }, { x: 26, z: 26 },
];

function lightPhase(idx) {
  return (lightClock + idx * 5.5) % 22;
}
function lightStateFor(idx, axis) {
  const ph = lightPhase(idx);
  if (axis === 'z') return ph < 10 ? 'green' : ph < 12 ? 'amber' : 'red';
  return ph < 10 ? 'red' : ph < 12 ? 'amber' : 'green';
}

export function lightStateAt(x, z, axis = 'z') {
  let best = 0, bd = 1e9;
  for (let i = 0; i < LIGHT_POS.length; i++) {
    const d = dist2(x, z, LIGHT_POS[i].x, LIGHT_POS[i].z);
    if (d < bd) { bd = d; best = i; }
  }
  return lightStateFor(best, axis);
}

function districtOf(bx, bz) {
  let best = DISTRICTS[0], bd = 1e9;
  for (const d of DISTRICTS) {
    const dd = dist2(bx, bz, d.cx, d.cz);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

// ---- building ----
const FACADE_CACHE = [];
function facadeMat(style, w, h) {
  if (!FACADE_CACHE[style]) FACADE_CACHE[style] = facadeTexture(style);
  const tex = FACADE_CACHE[style].clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 13)), Math.max(1, Math.round(h / 13)));
  const mat = new THREE.MeshLambertMaterial({
    map: tex, emissive: 0xffc46a, emissiveMap: tex, emissiveIntensity: 0,
  });
  glowMats.push(mat);
  return mat;
}

function makeBuilding(parent, bx, bz, w, d, h, style) {
  const g = new THREE.Group();
  g.position.set(bx, 0, bz);
  const mat = facadeMat(style, w, h);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // dark roof slab
  box(w + 0.4, 0.5, d + 0.4, MAT.roofDark, 0, h + 0.2, 0, g);
  // parapet
  box(w + 0.3, 0.5, 0.3, MAT.roofDark, 0, h + 0.5, d / 2 - 0.1, g);
  box(w + 0.3, 0.5, 0.3, MAT.roofDark, 0, h + 0.5, -d / 2 + 0.1, g);
  // rooftop props
  const nProps = rri(1, 3);
  for (let k = 0; k < nProps; k++) {
    const px = rr(-w / 2 + 2, w / 2 - 2), pz = rr(-d / 2 + 2, d / 2 - 2);
    const kind = rpick(['ac', 'ac', 'antenna', 'tank', 'vent']);
    if (kind === 'ac') box(1.6, 0.9, 1.2, MAT.acUnit, px, h + 0.9, pz, g);
    else if (kind === 'antenna') {
      cyl(0.06, 0.08, 4, MAT.pole, px, h + 2.4, pz, g, 6);
      box(1.6, 0.06, 0.06, MAT.pole, px, h + 4, pz, g);
    } else if (kind === 'tank') {
      cyl(1.1, 1.1, 1.8, MAT.waterTank, px, h + 1.3, pz, g, 10);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 10), MAT.waterTank);
      cone.position.set(px, h + 2.6, pz); cone.castShadow = true; g.add(cone);
    } else {
      cyl(0.5, 0.6, 1.1, MAT.acUnit, px, h + 0.9, pz, g, 8);
    }
  }
  // tall towers get a setback crown
  if (h > 26) {
    const cw = w * 0.62, cd = d * 0.62, ch = 6;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), facadeMat(style, cw, ch));
    crown.position.y = h + ch / 2 + 0.4;
    crown.castShadow = true;
    g.add(crown);
    box(cw + 0.3, 0.4, cd + 0.3, MAT.roofDark, 0, h + ch + 0.6, 0, g);
  }
  parent.add(g);
  return g;
}

// ---- shop front (awning + readable sign + neon) ----
function makeShop(parent, bx, bz, name, color) {
  // shop building at block centre, front faces +z (rob point at bz+11)
  const g = new THREE.Group();
  g.position.set(bx, 0, bz);
  const mat = facadeMat(rri(1, 4), 14, 9);
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 12), mat);
  body.position.y = 4.5;
  body.castShadow = true;
  g.add(body);
  box(14.4, 0.4, 12.4, MAT.roofDark, 0, 9.2, 0, g);
  // awning (striped) over the front
  const awnTex = canvasTex(awningTexture(color));
  const awn = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.15, 3.2),
    new THREE.MeshLambertMaterial({ map: awnTex })
  );
  awn.position.set(0, 3.4, 7.2);
  awn.rotation.x = 0.28;
  awn.castShadow = true;
  g.add(awn);
  // sign board with readable name
  const signTex = canvasTex(signTexture(name, '#20242c', '#ffd23d'));
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(11, 2.4, 0.3),
    new THREE.MeshLambertMaterial({ map: signTex })
  );
  sign.position.set(0, 6.4, 6.2);
  g.add(sign);
  // neon strip under the sign
  const neonMat = new THREE.MeshStandardMaterial({ color: 0xff5da2, emissive: 0xff2a8a, emissiveIntensity: 0.25 });
  neonMats.push(neonMat);
  box(11, 0.18, 0.12, neonMat, 0, 5.0, 6.25, g);
  // glass storefront
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, metalness: 0.6, roughness: 0.25, emissive: 0xffc46a, emissiveIntensity: 0 });
  glowMats.push(glass);
  box(11, 2.6, 0.15, glass, 0, 1.5, 6.05, g);
  // door
  box(1.6, 2.6, 0.2, MAT.trim, 0, 1.3, 6.1, g);
  parent.add(g);
  return g;
}

// ---- palms & trees ----
function makePalm(parent, x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  const lean = rr(-0.06, 0.06);
  g.rotation.z = lean;
  const trunk = cyl(0.16, 0.3, 5.6, MAT.trunk, 0, 2.8, 0, g, 7);
  void trunk;
  // ring bands on the trunk
  for (let k = 1; k <= 4; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 6, 10), MAT.trunkRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = k * 1.1;
    g.add(ring);
  }
  // coconuts
  for (let k = 0; k < 3; k++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), MAT.trunkRing);
    nut.position.set(Math.cos(k * 2.1) * 0.4, 5.5, Math.sin(k * 2.1) * 0.4);
    g.add(nut);
  }
  // 7 drooping fronds, 2 segments each
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rr(-0.2, 0.2);
    const frond = new THREE.Group();
    frond.position.set(0, 5.6, 0);
    frond.rotation.y = a;
    const seg1 = box(0.55, 0.05, 1.5, k % 2 ? MAT.palmLeaf : MAT.palmLeaf2, 0, 0.15, 0.75, frond);
    seg1.rotation.x = -0.35;
    const seg2g = new THREE.Group();
    seg2g.position.set(0, -0.25, 1.45);
    seg2g.rotation.x = -0.55;
    frond.add(seg2g);
    box(0.45, 0.04, 1.3, k % 2 ? MAT.palmLeaf2 : MAT.palmLeaf, 0, 0, 0.6, seg2g);
    g.add(frond);
  }
  parent.add(g);
  palmGroups.push(g);
  return g;
}

function makeTree(parent, x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  cyl(0.18, 0.28, 2.2, MAT.trunk, 0, 1.1, 0, g, 7);
  const blobs = [
    [0, 2.9, 0, 1.7, 1.15, 1.7],
    [0.9, 2.4, 0.4, 1.1, 0.85, 1.1],
    [-0.8, 2.5, -0.3, 1.0, 0.8, 1.0],
  ];
  for (const [bx, by, bz, sx, sy, sz] of blobs) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), rng() < 0.5 ? MAT.leafBlob : MAT.leafBlob2);
    b.position.set(bx, by, bz);
    b.scale.set(sx, sy, sz);
    b.castShadow = true;
    g.add(b);
  }
  parent.add(g);
  return g;
}

// ---- street props ----
function makeHydrant(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(0.22, 0.26, 0.7, MAT.hydrant, 0, 0.35, 0, g, 10);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.hydrant);
  top.position.y = 0.78; top.castShadow = true; g.add(top);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8), MAT.hydrant);
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = a;
    cap.position.set(Math.cos(a) * 0.24, 0.42, Math.sin(a) * 0.24);
    g.add(cap);
  }
  parent.add(g);
}

function makeBench(parent, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  box(2.0, 0.08, 0.55, MAT.benchWood, 0, 0.5, 0, g);
  box(2.0, 0.5, 0.07, MAT.benchWood, 0, 0.85, -0.24, g);
  for (const sx of [-0.85, 0.85]) {
    box(0.08, 0.5, 0.5, MAT.benchIron, sx, 0.25, 0, g);
  }
  parent.add(g);
}

function makeBusShelter(parent, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  for (const sx of [-1.4, 1.4]) {
    box(0.12, 2.6, 0.12, MAT.pole, sx, 1.3, 0, g);
    box(0.12, 2.6, 0.12, MAT.pole, sx, 1.3, -0.9, g);
  }
  box(3.2, 0.12, 1.6, MAT.roofDark, 0, 2.65, -0.45, g);
  box(2.6, 0.08, 0.5, MAT.benchWood, 0, 0.55, -0.7, g);
  // sign
  const signTex = canvasTex(signTexture('BUS STOP', '#1a5fd4', '#ffffff'));
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), new THREE.MeshLambertMaterial({ map: signTex }));
  sign.position.set(0, 2.2, 0.1);
  g.add(sign);
  parent.add(g);
}

function makeLamp(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(0.09, 0.13, 6.2, MAT.pole, 0, 3.1, 0, g, 8);
  const arm = box(1.6, 0.09, 0.09, MAT.pole, 0.8, 6.1, 0, g);
  void arm;
  box(0.5, 0.14, 0.24, MAT.lampHead, 1.5, 6.05, 0, g);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.15 });
  lampBulbs.push(bulbMat);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.18), bulbMat);
  bulb.position.set(1.5, 5.96, 0);
  g.add(bulb);
  parent.add(g);
}

function makeTrafficLight(parent, ix, iz) {
  // one pole at the corner, two heads (one per axis)
  const g = new THREE.Group();
  const cx = LIGHT_POS[0].x, cz = LIGHT_POS[0].z;
  void cx; void cz;
  const baseX = ix + 7.5, baseZ = iz + 7.5;
  g.position.set(baseX, 0, baseZ);
  cyl(0.12, 0.16, 5.4, MAT.pole, 0, 2.7, 0, g, 8);
  const heads = [];
  for (const [axis, ry, ox, oz] of [['z', 0, 0, -2.2], ['x', Math.PI / 2, -2.2, 0]]) {
    const head = new THREE.Group();
    head.position.set(ox, 5.2, oz);
    head.rotation.y = ry;
    box(0.5, 1.5, 0.4, MAT.trim, 0, 0, 0, head);
    const mk = (color, y) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m);
      s.position.set(0, y, 0.22);
      head.add(s);
      return m;
    };
    const red = mk(0xff2a1a, 0.5);
    const amber = mk(0xffb52a, 0);
    const green = mk(0x2aff5a, -0.5);
    g.add(head);
    heads.push({ red, amber, green, axis, idx: LIGHT_POS.findIndex((p) => p.x === ix && p.z === iz) });
  }
  parent.add(g);
  lightHeads.push(...heads);
}

function makeBillboard(parent, x, z, ry, lines, bg, fg) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  for (const sx of [-3.4, 3.4]) {
    box(0.35, 7, 0.35, MAT.pole, sx, 3.5, 0, g);
  }
  const tex = canvasTex(signTexture(lines[0], bg, fg, lines[1]));
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(9, 2.6, 0.3),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  board.position.y = 8;
  board.castShadow = true;
  g.add(board);
  parent.add(g);
}

// parked car (static, local builder — NOT in G.cars)
function makeParkedCar(parent, x, z, ry, color, type) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1418, metalness: 0.8, roughness: 0.2 });
  const tall = type === 'van' || type === 'suv';
  box(1.9, 0.55, 4.4, body, 0, 0.55, 0, g);
  if (tall) box(1.8, 0.9, 3.6, glass, 0, 1.2, 0, g);
  else {
    box(1.7, 0.5, 1.9, glass, 0, 1.0, -0.2, g);
    box(1.75, 0.07, 1.8, body, 0, 1.28, -0.2, g);
  }
  for (const [sx, sz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12), MAT.tire);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx, 0.33, sz);
    w.castShadow = true;
    g.add(w);
  }
  box(0.36, 0.12, 0.05, MAT.head, -0.55, 0.75, 2.22, g);
  box(0.36, 0.12, 0.05, MAT.head, 0.55, 0.75, 2.22, g);
  box(0.36, 0.12, 0.05, MAT.tail, -0.55, 0.75, -2.22, g);
  box(0.36, 0.12, 0.05, MAT.tail, 0.55, 0.75, -2.22, g);
  parent.add(g);
}

// ---- build ----
export function buildCity() {
  const scene = G.scene;
  const city = new THREE.Group();
  scene.add(city);

  // ground / sea / beach
  MAT.grass = new THREE.MeshLambertMaterial({ map: canvasTex(grassTexture(), 24, 24) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), MAT.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(90, -0.05, 20);
  ground.receiveShadow = true;
  city.add(ground);

  MAT.sand = new THREE.MeshLambertMaterial({ map: canvasTex(sandTexture(), 10, 4) });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(440, 62), MAT.sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.0, 231);
  beach.receiveShadow = true;
  city.add(beach);

  const seaTex = canvasTex(seaTexture(), 3, 3);
  seaMat = new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.25, metalness: 0.35 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(230, 480), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(325, -0.3, 20);
  city.add(sea);

  // roads (asphalt with baked dashes) + sidewalks + crosswalks
  const asphaltC = asphaltTexture();
  const concreteC = concreteTexture();
  const crossC = crosswalkTexture();
  for (const rx of ROAD_XS) {
    const tex = asphaltC.clone(); tex.needsUpdate = true;
    tex.repeat.set(1, 7);
    const roadMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 });
    roadMats.push(roadMat);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 400), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = Math.PI / 2; // dashes run along the road
    road.position.set(rx, 0.01, 0);
    road.receiveShadow = true;
    city.add(road);
    for (const s of [-1, 1]) {
      const swTex = concreteC.clone(); swTex.needsUpdate = true;
      swTex.repeat.set(1, 40);
      const sw = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 400),
        new THREE.MeshLambertMaterial({ map: swTex })
      );
      sw.rotation.x = -Math.PI / 2;
      sw.rotation.z = Math.PI / 2;
      sw.position.set(rx + s * 8, 0.02, 0);
      sw.receiveShadow = true;
      city.add(sw);
    }
  }
  for (const rz of ROAD_ZS) {
    const tex = asphaltC.clone(); tex.needsUpdate = true;
    tex.repeat.set(1, 7);
    const roadMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 });
    roadMats.push(roadMat);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.015, rz);
    road.receiveShadow = true;
    city.add(road);
    for (const s of [-1, 1]) {
      const swTex = concreteC.clone(); swTex.needsUpdate = true;
      swTex.repeat.set(40, 1);
      const sw = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 4),
        new THREE.MeshLambertMaterial({ map: swTex })
      );
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(0, 0.025, rz + s * 8);
      sw.receiveShadow = true;
      city.add(sw);
    }
  }
  // crosswalk planes at every crossing
  for (const rx of ROAD_XS) {
    for (const rz of ROAD_ZS) {
      const tex = crossC.clone(); tex.needsUpdate = true;
      const cw = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.9 })
      );
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(rx, 0.03, rz);
      cw.receiveShadow = true;
      city.add(cw);
    }
  }

  // ---- buildings per block ----
  const parks = new Set(['2,3', '5,3']);
  const storeBlocks = {
    '5,4': { name: 'MARINA MARKET', color: '#2a6fd4' },
    '1,1': { name: 'OLD TOWN DELI', color: '#c23b22' },
    '3,6': { name: 'BEACH TACOS', color: '#e8a33d' },
    '3,2': { name: 'DOWNTOWN PHARMACY', color: '#3aa655' },
    '1,4': { name: 'PALM LAUNDRY', color: '#7a4fd4' },
  };
  const stores = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const bx = BLOCK_CS[i], bz = BLOCK_CS[j];
      const key = `${i},${j}`;
      if (parks.has(key)) continue;
      const d = districtOf(bx, bz);
      if (storeBlocks[key]) {
        const s = storeBlocks[key];
        makeShop(city, bx, bz, s.name, s.color);
        stores.push({ x: bx, z: bz + 11, kind: 'store', name: s.name, robT: 0 });
        continue;
      }
      if (d.name === 'Palm Heights') {
        // suburban houses with pitched roofs
        const nH = rri(2, 3);
        for (let k = 0; k < nH; k++) {
          const hx = bx + rr(-11, 11), hz = bz + rr(-11, 11);
          const hw = rr(7, 10), hd = rr(7, 9), hh = rr(5.5, 7.5);
          const hm = facadeMat(5, hw, hh);
          const house = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), hm);
          house.position.set(hx, hh / 2, hz);
          house.castShadow = true;
          house.receiveShadow = true;
          city.add(house);
          // pitched roof
          const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(hw, hd) * 0.72, 2.6, 4), new THREE.MeshLambertMaterial({ color: rpick([0x7a4a38, 0x4a3a2a, 0x8a2a2a]) }));
          roof.position.set(hx, hh + 1.3, hz);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          city.add(roof);
          // yard: small lawn + bush
          const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), MAT.leafBlob);
          bush.position.set(hx + rr(-4, 4), 0.7, hz + rr(3, 5));
          bush.scale.y = 0.75;
          bush.castShadow = true;
          city.add(bush);
        }
        makePalm(city, bx + rr(-14, 14), bz + rr(-14, 14), rr(0.9, 1.15));
        continue;
      }
      if (d.name === 'Harbor Docks') {
        makeBuilding(city, bx, bz, rr(16, 22), rr(14, 20), rr(8, 12), 6);
        // container stacks
        for (let k = 0; k < 3; k++) {
          const cx = bx + rr(-13, 13), cz = bz + rr(-13, 13);
          const cm = rpick([MAT.containerA, MAT.containerB, MAT.containerC, MAT.containerD]);
          box(6, 2.4, 2.4, cm, cx, 1.2, cz, city);
          if (rng() < 0.5) box(6, 2.4, 2.4, rpick([MAT.containerA, MAT.containerB, MAT.containerC]), cx, 3.6, cz, city);
        }
        continue;
      }
      // general: 1-2 buildings by district
      const tall = d.name === 'Downtown Solara';
      const nB = tall ? 1 : rri(1, 2);
      for (let k = 0; k < nB; k++) {
        const ox = nB === 1 ? 0 : (k === 0 ? -9 : 9);
        const oz = nB === 1 ? 0 : (k === 0 ? -7 : 7);
        let style, h;
        if (d.name === 'Downtown Solara') { style = rpick([0, 7, 7, 4]); h = rr(24, 44); }
        else if (d.name === 'Old Town') { style = rpick([1, 1, 3]); h = rr(8, 14); }
        else if (d.name === 'Marina Bay') { style = rpick([2, 3, 0]); h = rr(12, 20); }
        else if (d.name === 'Beachfront') { style = rpick([3, 2]); h = rr(8, 14); }
        else { style = rri(0, 4); h = rr(10, 20); }
        const w = tall ? rr(16, 22) : rr(13, 18);
        const dep = tall ? rr(16, 22) : rr(12, 17);
        makeBuilding(city, bx + ox, bz + oz, w, dep, h, style);
      }
      // occasional neon sign on a Marina / Downtown building
      if ((d.name === 'Marina Bay' || d.name === 'Downtown Solara') && rng() < 0.5) {
        const nm = rpick([MAT.neonPink, MAT.neonCyan, MAT.neonAmber]);
        if (!flickerNeon) flickerNeon = nm;
        box(0.25, 1.2, 5, nm, bx + 8, 7, bz, city);
      }
    }
  }

  // parks (trees, benches, paths)
  for (const [px, pz] of [[-52, 0], [104, 0]]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), new THREE.MeshLambertMaterial({ map: canvasTex(grassTexture(), 4, 4) }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(px, 0.02, pz);
    lawn.receiveShadow = true;
    city.add(lawn);
    for (let k = 0; k < 5; k++) makeTree(city, px + rr(-15, 15), pz + rr(-15, 15), rr(0.9, 1.3));
    makeBench(city, px - 6, pz + 8, 0);
    makeBench(city, px + 8, pz - 6, Math.PI / 2);
    makePalm(city, px + 12, pz + 10, 1.1);
  }

  // Solara Tower (downtown landmark)
  {
    const g = new THREE.Group();
    g.position.set(0, 0, -52);
    const towerMat = facadeMat(7, 24, 55);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(24, 55, 24), towerMat);
    tower.position.y = 27.5;
    tower.castShadow = true;
    g.add(tower);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(17, 10, 17), facadeMat(0, 17, 10));
    crown.position.y = 60;
    crown.castShadow = true;
    g.add(crown);
    cyl(0.5, 0.8, 12, MAT.pole, 0, 71, 0, g, 8);
    beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 2 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), beaconMat);
    beacon.position.y = 77.5;
    g.add(beacon);
    city.add(g);
  }

  // Harbor crane
  {
    const g = new THREE.Group();
    g.position.set(130, 0, -130);
    for (const sx of [-4, 4]) {
      box(1.2, 26, 1.2, MAT.crane, sx, 13, 0, g);
      box(1.2, 26, 1.2, MAT.crane, sx, 13, 6, g);
    }
    box(14, 1.6, 1.6, MAT.crane, 0, 26, 3, g);
    box(20, 1.2, 1.2, MAT.crane, 6, 27.5, 3, g);
    const cable = cyl(0.05, 0.05, 9, MAT.trim, 14, 22, 3, g, 6);
    void cable;
    box(1.6, 1.2, 1.6, MAT.containerB, 14, 17, 3, g);
    city.add(g);
  }

  // bridge to Isla Verde (deck top y = 0.1)
  {
    const deck = box(82, 0.6, 12, MAT.bridgeDeck, 222, -0.2, 0, city);
    void deck;
    for (const s of [-1, 1]) {
      box(82, 1.1, 0.3, MAT.bridgeRail, 222, 0.6, s * 5.8, city);
    }
    for (const px of [200, 220, 240, 258]) {
      makeLamp(city, px, -5);
      box(2.5, 9, 2.5, MAT.bridgeDeck, px, -4.5, 0, city);
    }
  }

  // Isla Verde (island at 300,0): ground + buildings clear of the beacon plaza (330,0)
  {
    const island = new THREE.Mesh(new THREE.CircleGeometry(72, 28), new THREE.MeshLambertMaterial({ map: canvasTex(sandTexture(), 6, 6) }));
    island.rotation.x = -Math.PI / 2;
    island.position.set(300, 0.0, 0);
    island.receiveShadow = true;
    city.add(island);
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(58, 28), new THREE.MeshLambertMaterial({ map: canvasTex(grassTexture(), 5, 5) }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(300, 0.02, 0);
    lawn.receiveShadow = true;
    city.add(lawn);
    makeBuilding(city, 278, -32, 18, 16, 22, 4);
    makeBuilding(city, 282, 28, 14, 14, 14, 3);
    makeBuilding(city, 318, -38, 12, 12, 10, 2);
    makePalm(city, 268, 8, 1.2);
    makePalm(city, 322, 18, 1.1);
    makeTree(city, 292, -8, 1.2);
  }

  // ---- palms along Palm Heights + beachfront ----
  for (let k = 0; k < 8; k++) {
    makePalm(city, rr(-140, -70), rr(20, 90), rr(0.9, 1.2));
  }
  for (let k = 0; k < 5; k++) {
    makePalm(city, rr(-60, 60), 196 + rr(-4, 4), rr(0.9, 1.25));
  }

  // ---- street props ----
  // lamps at intersection corners + along main roads
  for (const { x, z } of LIGHT_POS) {
    for (const [ox, oz] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) makeLamp(city, x + ox, z + oz);
  }
  for (const rx of [-78, 26, 130]) {
    for (const rz of [-130, -26, 78]) makeLamp(city, rx + 8, rz);
  }
  // hydrants, benches, shelters, cones, signs
  const hydrantSpots = [[-84, -72], [84, -72], [-84, 84], [84, 84], [-84, -20], [-20, -84], [20, 136], [-136, 32], [136, -32], [-20, 84], [84, -84], [132, -84]];
  for (const [x, z] of hydrantSpots) makeHydrant(city, x, z);
  const benchSpots = [[-34, -52], [34, -52], [-52, -34], [52, 34], [-104, -20], [104, 20], [-20, 104], [20, -104], [52, 84], [-84, 52]];
  for (const [x, z] of benchSpots) makeBench(city, x, z, rng() < 0.5 ? 0 : Math.PI / 2);
  makeBusShelter(city, -130, 34, 0);
  makeBusShelter(city, 84, -34, Math.PI / 2);
  makeBusShelter(city, -84, 34, 0);
  makeBusShelter(city, 34, -84, Math.PI / 2);
  const coneSpots = [[-30, -14], [-28, -14], [-26, -14], [-24, -14], [22, 14], [24, 14], [26, 14], [28, 14]];
  for (const [x, z] of coneSpots) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 10), MAT.cone);
    cone.position.set(x, 0.45, z);
    cone.castShadow = true;
    city.add(cone);
    box(0.7, 0.06, 0.7, MAT.cone, x, 0.03, z, city);
  }
  // street signs
  for (const [x, z, ry, label] of [[-20, -32, 0, 'PALM HEIGHTS'], [32, -20, Math.PI / 2, 'DOWNTOWN'], [-32, 20, 0, 'MARINA BAY'], [20, 32, Math.PI / 2, 'OLD TOWN']]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    cyl(0.07, 0.09, 3.2, MAT.pole, 0, 1.6, 0, g, 6);
    const tex = canvasTex(signTexture(label, '#1a5f2a', '#ffffff'));
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 0.08), new THREE.MeshLambertMaterial({ map: tex }));
    board.position.y = 3.0;
    g.add(board);
    city.add(g);
  }
  // mailboxes, bins, parking meters, newspaper boxes
  for (const [x, z] of [[-34, 20], [34, -20], [-20, -34], [20, 34], [84, 20], [-84, -20]]) {
    box(0.5, 0.7, 0.4, MAT.mailbox, x, 0.85, z, city);
    box(0.14, 0.6, 0.14, MAT.pole, x, 0.3, z, city);
  }
  for (const [x, z] of [[-36, 26], [36, -26], [-26, 36], [26, -36], [90, 26], [-90, -26]]) {
    cyl(0.35, 0.32, 0.9, MAT.bin, x, 0.45, z, city, 10);
  }
  for (const [x, z] of [[-33, -52], [33, 52], [-52, 33], [52, -33]]) {
    cyl(0.05, 0.07, 1.1, MAT.pole, x, 0.55, z, city, 6);
    box(0.22, 0.3, 0.16, MAT.trim, x, 1.2, z, city);
  }
  // planters with shrubs along the main avenue
  for (const [x, z] of [[-34, -78], [34, -78], [-78, 130], [34, 78], [-78, -34], [78, 34]]) {
    box(1.6, 0.55, 1.6, MAT.concrete || new THREE.MeshLambertMaterial({ color: 0x8f8a80 }), x, 0.28, z, city);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), MAT.leafBlob2);
    bush.position.set(x, 0.9, z);
    bush.scale.y = 0.7;
    bush.castShadow = true;
    city.add(bush);
  }
  // parked cars along curbs
  const parked = [
    [-30.5, -60, Math.PI / 2, 0x8a9aa8, 'sedan'], [-30.5, 20, Math.PI / 2, 0xd43d2a, 'sports'],
    [30.5, 60, -Math.PI / 2, 0x2a6fd4, 'sedan'], [30.5, -100, -Math.PI / 2, 0x3aa655, 'suv'],
    [-82.5, -20, 0, 0xe8c832, 'taxi'], [82.5, 100, 0, 0xd8d8d8, 'van'],
    [-21.5, 100, Math.PI, 0x7a4fd4, 'sedan'], [21.5, -60, Math.PI, 0xb06a2a, 'pickup'],
    [73.5, -20, Math.PI / 2, 0x2a2d33, 'sedan'], [-133.5, 60, -Math.PI / 2, 0x4fd4c2, 'suv'],
    [125.5, 20, Math.PI, 0x8a9aa8, 'sedan'], [-21.5, -140, 0, 0xd43d2a, 'sports'],
  ];
  for (const [x, z, ry, color, type] of parked) makeParkedCar(city, x, z, ry, color, type);

  // billboards
  makeBillboard(city, -26, -124, 0, ['SOLARA CITY', 'Seven districts. One king.'], '#20242c', '#ffd23d');
  makeBillboard(city, 124, 26, Math.PI / 2, ['VICE COLA', 'Taste the night.'], '#7a1a2a', '#ffffff');
  makeBillboard(city, -124, 78, 0, ['MARINA BAY', 'Yachts · Neon · Fast crowd'], '#0a3a4a', '#4ecdc4');
  makeBillboard(city, 78, 150, Math.PI / 2, ['FALCO SPORT', '0–60 in 3.9 seconds'], '#1a1a1a', '#ff5d5d');

  // ---- traffic lights ----
  for (const { x, z } of LIGHT_POS) makeTrafficLight(city, x, z);

  // ---- gameplay data ----
  const raceStarts = [
    { x: -26, z: 130, name: 'Sunset Sprint', len: 6 },
    { x: -130, z: -78, name: 'Old Town Loop', len: 6 },
    { x: 26, z: 156, name: 'Beachfront Dash', len: 5 },
  ];
  const chop = { x: 130, z: -78 };
  const garage = { x: -130, z: 78 };
  const shellSpots = [
    [0, 210], [52, 220], [-52, 215], [104, 205], [-104, 225],
    [-60, 8], [-44, -6], [96, -8], [112, 6],
    [-78, -52], [26, -104], [78, 52], [-26, 104], [156, -26], [0, 78],
    [300, 40], [280, -20], [330, 35],
    [130, -130], [156, -104],
  ];
  const shells = shellSpots.map(([x, z]) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), MAT.shellGold);
    mesh.position.set(x, 1.2, z);
    mesh.castShadow = true;
    city.add(mesh);
    return { x, z, taken: false, mesh };
  });

  // chop shop + garage markers (visible buildings)
  {
    const chopTex = canvasTex(signTexture('CHOP SHOP', '#3a1a1a', '#ff5d5d'));
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), new THREE.MeshLambertMaterial({ map: chopTex }));
    b.position.set(chop.x, 4, chop.z - 6);
    city.add(b);
    box(12, 7, 10, new THREE.MeshLambertMaterial({ color: 0x4a3a3a }), chop.x, 3.5, chop.z - 12, city);
    const garTex = canvasTex(signTexture('GARAGE', '#1a2a3a', '#4ecdc4'));
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), new THREE.MeshLambertMaterial({ map: garTex }));
    g2.position.set(garage.x, 4, garage.z - 6);
    city.add(g2);
    box(12, 7, 10, new THREE.MeshLambertMaterial({ color: 0x3a4a5a }), garage.x, 3.5, garage.z - 12, city);
  }

  G.city = {
    raceStarts, stores, chop, garage, shells, lightStateAt,
    setNight(night) {
      for (const m of glowMats) m.emissiveIntensity = night * 0.85;
      for (const m of neonMats) m.emissiveIntensity = 0.25 + night * 2.2;
      for (const m of lampBulbs) m.emissiveIntensity = 0.15 + night * 2.0;
    },
    setWet(rain) {
      // NOTE: loop roadMats (plural) — a single roadMat variable does not exist
      for (const m of roadMats) {
        m.roughness = 0.9 - rain * 0.65;
        m.color.setScalar(1 - rain * 0.25);
      }
    },
    update(dt) {
      lightClock += dt;
      // traffic light heads follow the cycle
      for (const h of lightHeads) {
        const st = lightStateFor(h.idx, h.axis);
        h.red.emissiveIntensity = st === 'red' ? 2.4 : 0.12;
        h.amber.emissiveIntensity = st === 'amber' ? 2.4 : 0.12;
        h.green.emissiveIntensity = st === 'green' ? 2.4 : 0.12;
      }
      // palm sway
      const t = performance.now() / 1000;
      for (let i = 0; i < palmGroups.length; i++) {
        palmGroups[i].rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.02;
      }
      // sea shimmer
      if (seaMat && seaMat.map) seaMat.map.offset.x += dt * 0.008;
      // tower beacon blink
      if (beaconMat) beaconMat.emissiveIntensity = (Math.sin(t * 2.4) > 0) ? 2.2 : 0.2;
      // one neon sign flickers
      if (flickerNeon) flickerNeon.emissiveIntensity = (Math.sin(t * 9) > -0.7) ? 2.2 : 0.6;
    },
  };
  return G.city;
}
