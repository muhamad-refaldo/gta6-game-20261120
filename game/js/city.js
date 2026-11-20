// Solara City 3D v3 — the city: brighter golden-hour look, district identity, traffic
// lights, night lamps + lit windows, wet roads, beach + sea, bridge to Isla Verde.
// Fresh rewrite for v3. Only buildCity() is exported; everything the game needs
// lives on G.city: raceStarts, chop, garage, stores, shells, solids, trafficLights,
// setNight(frac), setWet(w), lightStateAt(x, z, axis), update(dt).
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z, rand, randi, pick, dist2 } from './state.js';

const roadX = (i) => -CITY_HALF + i * PITCH;
const roadZ = (j) => -CITY_HALF + j * PITCH;

// ---- canvas facade textures: window grids with a lit-window emissive twin ----
function facadeTexture(base, win, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 4; col++) {
      x.fillStyle = win;
      x.fillRect(12 + col * 28, 14 + r * 30, 18, 20);
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  // lit twin: same grid, only some windows glow warm
  const c2 = document.createElement('canvas');
  c2.width = 128; c2.height = 256;
  const y = c2.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 4; col++) {
      if (Math.random() < 0.45) { y.fillStyle = lit; y.fillRect(12 + col * 28, 14 + r * 30, 18, 20); }
    }
  }
  const emissiveMap = new THREE.CanvasTexture(c2);
  return { map, emissiveMap };
}

export function buildCity() {
  const scene = G.scene;
  const city = {
    raceStarts: [], chop: { x: 104, z: -78 }, garage: { x: -104, z: 26 },
    stores: [], shells: [], solids: [], trafficLights: [],
    lamps: [], lampMat: null, winMats: [], roadMat: null, seaMat: null,
    nightFrac: 0, wet: 0, elapsed: 0,
  };
  G.city = city;

  // ---------- ground ----------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a4038 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 520), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(110, -0.05, 30);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- roads: lighter asphalt strips + centre dashes + sidewalks ----------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x54595f });
  city.roadMat = roadMat;
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x6e6a5e });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 4);
  const roadGeoX = new THREE.BoxGeometry(CITY_HALF * 2 + ROAD, 0.1, ROAD);
  const roadGeoZ = new THREE.BoxGeometry(ROAD, 0.1, CITY_HALF * 2 + ROAD);
  const walkGeoX = new THREE.BoxGeometry(CITY_HALF * 2 + ROAD, 0.08, 2.4);
  const walkGeoZ = new THREE.BoxGeometry(2.4, 0.08, CITY_HALF * 2 + ROAD);
  for (let i = 0; i < NROADS; i++) {
    const rx = new THREE.Mesh(roadGeoX, roadMat);
    rx.position.set(0, 0, roadZ(i)); rx.receiveShadow = true; scene.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMat);
    rz.position.set(roadX(i), 0, 0); rz.receiveShadow = true; scene.add(rz);
    for (const s of [-1, 1]) {
      const wx = new THREE.Mesh(walkGeoX, walkMat);
      wx.position.set(0, 0.02, roadZ(i) + s * (ROAD / 2 + 1.2)); scene.add(wx);
      const wz = new THREE.Mesh(walkGeoZ, walkMat);
      wz.position.set(roadX(i) + s * (ROAD / 2 + 1.2), 0.02, 0); scene.add(wz);
    }
    // centre dashes along both directions
    for (let k = -CITY_HALF; k < CITY_HALF; k += 10) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(k, 0.08, roadZ(i)); scene.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.rotation.y = Math.PI / 2; d2.position.set(roadX(i), 0.08, k); scene.add(d2);
    }
  }

  // ---------- beach + sea + bridge ----------
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xd9c08a });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(400, 90), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, BEACH_Z + 32); sand.receiveShadow = true; scene.add(sand);
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1f6f8b, transparent: true, opacity: 0.92 });
  city.seaMat = seaMat;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 560), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(SEA_X + 130, -0.3, 30); scene.add(sea);
  // island ground
  const islandMat = new THREE.MeshLambertMaterial({ color: 0x4a7a52 });
  const island = new THREE.Mesh(new THREE.CircleGeometry(78, 28), islandMat);
  island.rotation.x = -Math.PI / 2; island.position.set(300, 0.02, 0); island.receiveShadow = true; scene.add(island);
  // bridge from city (x 182) to island (x 240)
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x8a7f70 });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(64, 1.2, 14), bridgeMat);
  bridge.position.set(212, -0.5, 0); bridge.castShadow = true; scene.add(bridge);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xff9f1c });
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(64, 1, 0.6), railMat);
    rail.position.set(212, 0.6, s * 6.8); scene.add(rail);
  }

  // ---------- buildings (shared unit box + 3 facade materials) ----------
  const facades = [
    facadeTexture('#5a6a7a', '#2c3844', '#ffd76e'), // glass downtown
    facadeTexture('#7a5a44', '#3a2c22', '#ffbf5e'), // brick old town
    facadeTexture('#8a8578', '#4a463c', '#ffe9a8'), // concrete
  ];
  const winMats = facades.map((f) => new THREE.MeshLambertMaterial({
    map: f.map, emissiveMap: f.emissiveMap, emissive: new THREE.Color(0xffc46a), emissiveIntensity: 0.12,
  }));
  city.winMats = winMats;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const districts = [
    { cx: 0, cz: -52, hMin: 22, hMax: 58, mat: 0 },   // Downtown glass
    { cx: -104, cz: -104, hMin: 8, hMax: 18, mat: 1 }, // Old Town brick
    { cx: 104, cz: -104, hMin: 8, hMax: 16, mat: 2 },  // Harbor
    { cx: 104, cz: 52, hMin: 12, hMax: 30, mat: 0 },   // Marina
    { cx: -104, cz: 52, hMin: 7, hMax: 14, mat: 1 },   // Palm Heights
    { cx: 0, cz: 156, hMin: 8, hMax: 20, mat: 2 },     // Beachfront
  ];
  for (let bi = 0; bi < 6; bi++) {
    for (let bj = 0; bj < 6; bj++) {
      const cx = -CITY_HALF + BLOCK / 2 + bi * PITCH;
      const cz = -CITY_HALF + BLOCK / 2 + bj * PITCH;
      // park blocks: two green squares instead of buildings
      if ((bi === 1 && bj === 4) || (bi === 4 && bj === 1)) {
        const park = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), new THREE.MeshLambertMaterial({ color: 0x4a7a3a }));
        park.rotation.x = -Math.PI / 2; park.position.set(cx, 0.05, cz); park.receiveShadow = true; scene.add(park);
        for (let t = 0; t < 5; t++) {
          const tree = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 6), new THREE.MeshLambertMaterial({ color: 0x2f6b2f }));
          tree.position.set(cx + rand(-14, 14), 4, cz + rand(-14, 14)); tree.castShadow = true; scene.add(tree);
        }
        continue;
      }
      // pick district by nearest centre
      let d = districts[0], bd = 1e9;
      for (const dd of districts) { const q = dist2(cx, cz, dd.cx, dd.cz); if (q < bd) { bd = q; d = dd; } }
      const nB = randi(1, 3);
      for (let b = 0; b < nB; b++) {
        const w = rand(12, 24), dep = rand(12, 24);
        const h = rand(d.hMin, d.hMax);
        const bx = cx + (nB === 1 ? 0 : rand(-9, 9));
        const bz = cz + (nB === 1 ? 0 : rand(-9, 9));
        const m = new THREE.Mesh(boxGeo, winMats[d.mat]);
        m.scale.set(w, h, dep);
        m.position.set(bx, h / 2, bz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, dep + 0.6);
        roof.position.set(bx, h + 0.4, bz);
        scene.add(roof);
        city.solids.push({ x: bx, z: bz, hw: w / 2 + 0.5, hd: dep / 2 + 0.5 });
      }
    }
  }
  // Solara Tower landmark (downtown, tall, glowing crown)
  const tower = new THREE.Mesh(boxGeo, winMats[0]);
  tower.scale.set(26, 74, 26); tower.position.set(0, 37, -52); tower.castShadow = true; scene.add(tower);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(28, 3, 28), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
  crown.position.set(0, 75.5, -52); scene.add(crown);
  city.solids.push({ x: 0, z: -52, hw: 14, hd: 14 });
  // harbour containers
  const contCols = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22];
  for (let k = 0; k < 14; k++) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(contCols) }));
    c.scale.set(12, 2.6, 2.6);
    c.position.set(120 + (k % 7) * 14, 1.3 + Math.floor(k / 7) * 2.7, -150 + (k % 3) * 4);
    c.castShadow = true; scene.add(c);
    city.solids.push({ x: c.position.x, z: c.position.z, hw: 6.5, hd: 1.8 });
  }
  // island buildings — kept clear of the mission beacon plaza at (330, 0)
  for (let k = 0; k < 5; k++) {
    const b = new THREE.Mesh(boxGeo, winMats[2]);
    const h = rand(10, 22);
    b.scale.set(rand(12, 18), h, rand(12, 18));
    let bx = 300, bz = 0;
    for (let t = 0; t < 10; t++) {
      bx = 300 + rand(-40, 40); bz = rand(-40, 40);
      if (Math.hypot(bx - 330, bz) >= 30) break;
    }
    b.position.set(bx, h / 2, bz);
    b.castShadow = true; scene.add(b);
  }

  // ---------- palms (instanced) ----------
  const palmGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 5);
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const frondGeo = new THREE.ConeGeometry(2.6, 3.4, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3f });
  const palmSpots = [];
  for (let k = 0; k < 90; k++) {
    const onX = Math.random() < 0.5;
    const i = randi(0, NROADS - 1), t = rand(-CITY_HALF, CITY_HALF);
    const x = onX ? roadX(i) + pick([-8, 8]) : t;
    const z = onX ? t : roadZ(i) + pick([-8, 8]);
    if (Math.abs(x) > 185 || Math.abs(z) > 185) continue;
    palmSpots.push([x, z]);
  }
  const palms = new THREE.InstancedMesh(palmGeo, palmMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  palmSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3, z); palms.setMatrixAt(i, m4);
    m4.makeTranslation(x, 7, z); fronds.setMatrixAt(i, m4);
  });
  palms.castShadow = true;
  scene.add(palms); scene.add(fronds);

  // ---------- street lamps (instanced poles + emissive heads) ----------
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 5);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
  const lampHeadGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  city.lampMat = lampMat;
  const lampSpots = [];
  for (let i = 0; i < NROADS; i++) {
    for (let k = -CITY_HALF + 20; k < CITY_HALF; k += 52) {
      lampSpots.push([roadX(i) + 7.5, k]);
      lampSpots.push([k, roadZ(i) + 7.5]);
    }
  }
  const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampMat, lampSpots.length);
  lampSpots.forEach(([x, z], idx) => {
    m4.makeTranslation(x, 3.5, z); poles.setMatrixAt(idx, m4);
    m4.makeTranslation(x, 7.1, z); heads.setMatrixAt(idx, m4);
  });
  scene.add(poles); scene.add(heads);
  city.lamps = lampSpots;

  // ---------- traffic lights at 4 major intersections ----------
  const tlCols = { red: 0xff2d2d, amber: 0xffb02d, green: 0x2dff5e };
  const tlIntersections = [
    { x: roadX(2), z: roadZ(2) }, { x: roadX(2), z: roadZ(4) },
    { x: roadX(4), z: roadZ(2) }, { x: roadX(4), z: roadZ(4) },
  ];
  tlIntersections.forEach((it, k) => {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.5, 6), lampPoleMat);
    pole.position.y = 3.25; grp.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.3, 0.3), lampPoleMat);
    arm.position.set(0, 6.2, 0); grp.add(arm);
    const headsArr = [];
    for (const s of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      housing.position.set(s * 2.4, 5.6, 0); grp.add(housing);
      const lamps = {};
      ['red', 'amber', 'green'].forEach((col, ci) => {
        const lm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
          new THREE.MeshBasicMaterial({ color: tlCols[col] }));
        lm.material = lm.material.clone();
        lm.position.set(s * 2.4, 6.3 - ci * 0.65, 0.55);
        lm.material.color.multiplyScalar(0.18);
        grp.add(lm); lamps[col] = lm;
      });
      headsArr.push(lamps);
    }
    grp.position.set(it.x + 7, 0, it.z + 7);
    scene.add(grp);
    city.trafficLights.push({ x: it.x, z: it.z, offset: k * 5.5, heads: headsArr, state: 'ns' });
  });

  // ---------- race starts / chop / garage / stores / shells ----------
  city.raceStarts = [
    { x: roadX(3), z: roadZ(1), name: 'Sunset Sprint', len: 5 },
    { x: roadX(1), z: roadZ(3), name: 'Old Town Loop', len: 6 },
    { x: roadX(3), z: roadZ(5), name: 'Beachfront Dash', len: 7 },
  ];
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x4ecdc4 });
  for (const r of city.raceStarts) {
    const flag = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 4), flagMat);
    flag.position.set(r.x, 4, r.z); scene.add(flag);
  }
  const markSpot = (x, z, color) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    m.position.set(x, 0.2, z); scene.add(m);
  };
  markSpot(city.chop.x, city.chop.z, 0xff5d5d);
  markSpot(city.garage.x, city.garage.z, 0x4ecdc4);
  city.stores = [
    { kind: 'store', x: -78, z: -26, name: 'Corner Mart' },
    { kind: 'store', x: 26, z: -130, name: 'Lucky Liquor' },
    { kind: 'store', x: 130, z: 26, name: 'Marina Goods' },
    { kind: 'store', x: -130, z: 78, name: 'Palm Deli' },
    { kind: 'store', x: 78, z: 130, name: 'Beach Shop' },
    { kind: 'store', x: -26, z: -78, name: 'Old Town Bakery' },
  ];
  for (const s of city.stores) {
    markSpot(s.x, s.z, 0x7dff9a);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
    sign.position.set(s.x, 5.5, s.z); scene.add(sign);
  }
  // golden shells: beach + a few inland
  const shellGeo = new THREE.TorusGeometry(0.8, 0.35, 8, 14);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd23d });
  for (let k = 0; k < 20; k++) {
    const x = k < 14 ? rand(-160, 160) : rand(-150, 150);
    const z = k < 14 ? rand(190, 245) : rand(-150, 150);
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.set(x, 1.2, z);
    scene.add(mesh);
    city.shells.push({ x, z, mesh, taken: false });
  }

  // ---------- API on G.city ----------
  city.setNight = (frac) => {
    city.nightFrac = frac;
    city.lampMat.color.setHex(0xffe9a8).multiplyScalar(0.25 + frac * 0.95);
    for (const m of city.winMats) m.emissiveIntensity = 0.12 + frac * 0.95;
  };
  city.setWet = (w) => {
    city.wet = w;
    roadMat.color.setHex(0x54595f).multiplyScalar(1 - w * 0.45);
  };
  city.lightStateAt = (x, z, axis) => {
    // nearest signalised intersection within 16 units; null = no light here
    let best = null, bd = 1e9;
    for (const tl of city.trafficLights) {
      const d = dist2(x, z, tl.x, tl.z);
      if (d < bd) { bd = d; best = tl; }
    }
    if (!best || bd > 16) return null;
    const ph = (city.elapsed + best.offset) % 22;
    const nsGreen = ph < 9, nsAmber = ph >= 9 && ph < 11;
    const ewGreen = ph >= 11 && ph < 20;
    if (axis === 'z') return nsGreen ? 'green' : nsAmber ? 'amber' : 'red';
    return ewGreen ? 'green' : 'red';
  };
  city.update = (dt) => {
    city.elapsed += dt;
    // traffic light lamps
    for (const tl of city.trafficLights) {
      const ph = (city.elapsed + tl.offset) % 22;
      const nsGreen = ph < 9, nsAmber = ph >= 9 && ph < 11;
      const ewGreen = ph >= 11 && ph < 20;
      for (const lamps of tl.heads) {
        lamps.red.material.color.setHex(0xff2d2d).multiplyScalar(nsGreen || ewGreen ? 0.18 : 1.6);
        lamps.amber.material.color.setHex(0xffb02d).multiplyScalar(nsAmber || (ph >= 20) ? 1.6 : 0.18);
        lamps.green.material.color.setHex(0x2dff5e).multiplyScalar(nsGreen || ewGreen ? 1.6 : 0.18);
      }
    }
  };

  return city;
}
