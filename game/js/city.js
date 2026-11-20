// Solara City 3D — the city: roads, instanced buildings, palms, beach, sea, bridge, island.
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, SEA_X, BEACH_Z, DISTRICTS, rand, randi, pick } from './state.js';

function windowsTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4f5a'; x.fillRect(0, 0, 64, 128);
  for (let r = 0; r < 12; r++) for (let col = 0; col < 4; col++) {
    const lit = Math.random() < 0.45;
    x.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd76e' : '#9be7ff') : '#14181f';
    x.fillRect(6 + col * 14, 6 + r * 10, 9, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity() {
  const scene = G.scene;
  const city = { buildings: [], palms: [], stores: [], garage: null, chop: null, raceStarts: [], shells: [] };

  // ---- ground: sidewalk concrete across the whole city ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 60, CITY_HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x8a7f72 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 20); ground.receiveShadow = true;
  scene.add(ground);

  // ---- roads: dark strips along every centreline ----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x565b66 });
  for (let i = 0; i < NROADS; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY_HALF * 2 + 40), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(-CITY_HALF + i * PITCH, 0.02, 20); v.receiveShadow = true; scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, ROAD), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, -CITY_HALF + i * PITCH + 40); h.receiveShadow = true; scene.add(h);
  }
  // centre dashes (thin pale strips, cheap: one per road, dashed via texture-less segments)
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c98a });
  for (let i = 0; i < NROADS; i++) {
    for (let k = -3; k <= 3; k++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(-CITY_HALF + i * PITCH, 0.04, 20 + k * PITCH); scene.add(d);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), dashMat);
      d2.rotation.x = -Math.PI / 2; d2.position.set(k * PITCH, 0.04, -CITY_HALF + i * PITCH + 40); scene.add(d2);
    }
  }

  // ---- city blocks: raised curb boxes ----
  const blockMat = new THREE.MeshLambertMaterial({ color: 0x7d7468 });
  for (let i = 0; i < NROADS - 1; i++) for (let j = 0; j < NROADS - 1; j++) {
    const bx = -CITY_HALF + i * PITCH + ROAD / 2 + BLOCK / 2;
    const bz = -CITY_HALF + j * PITCH + ROAD / 2 + BLOCK / 2 + 40;
    const b = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.6, BLOCK), blockMat);
    b.position.set(bx, 0.3, bz); b.receiveShadow = true; scene.add(b);
  }

  // ---- buildings: one InstancedMesh, per-instance colour + window texture ----
  const tex = windowsTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x443322, emissiveIntensity: 0.8 });
  const placements = [];
  const downtown = (x, z) => Math.hypot(x, z + 52) < 90;
  for (let i = 0; i < NROADS - 1; i++) for (let j = 0; j < NROADS - 1; j++) {
    const bx = -CITY_HALF + i * PITCH + ROAD / 2 + BLOCK / 2;
    const bz = -CITY_HALF + j * PITCH + ROAD / 2 + BLOCK / 2 + 40;
    const n = downtown(bx, bz) ? randi(2, 3) : randi(1, 2);
    for (let k = 0; k < n; k++) {
      const w = rand(10, 16), d = rand(10, 16);
      const h = downtown(bx, bz) ? rand(28, 70) : rand(6, 20);
      const ox = rand(-8, 8), oz = rand(-8, 8);
      placements.push({ x: bx + ox, z: bz + oz, w, h, d, c: pick([0x9a8f80, 0x7f8a96, 0xb08d5f, 0x6f7f8a, 0xa89a7a, 0x8a6f7f]) });
    }
  }
  // Solara Tower — the landmark skyscraper
  placements.push({ x: 0, z: -52, w: 22, h: 110, d: 22, c: 0x3d5a80 });
  const inst = new THREE.InstancedMesh(bGeo, bMat, placements.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  placements.forEach((pl, idx) => {
    p.set(pl.x, 0.6 + pl.h / 2, pl.z); s.set(pl.w, pl.h, pl.d);
    m4.compose(p, q, s); inst.setMatrixAt(idx, m4);
    inst.setColorAt(idx, col.setHex(pl.c));
  });
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
  city.buildings = placements;

  // ---- palm trees: instanced trunks + instanced leaf crowns ----
  const palmSpots = [];
  for (let i = 0; i < NROADS - 1; i++) for (let j = 0; j < NROADS - 1; j++) {
    const bx = -CITY_HALF + i * PITCH + ROAD / 2;
    const bz = -CITY_HALF + j * PITCH + ROAD / 2 + 40;
    if (Math.random() < 0.55) palmSpots.push({ x: bx + rand(4, BLOCK - 4), z: bz + rand(4, BLOCK - 4) });
  }
  for (let k = 0; k < 26; k++) palmSpots.push({ x: rand(-170, 170), z: rand(185, 205) }); // beach palms
  for (let k = 0; k < 14; k++) palmSpots.push({ x: rand(260, 340), z: rand(-40, 40) });  // island palms
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const leafGeo = new THREE.IcosahedronGeometry(3.2, 0);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7d3a, flatShading: true });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length);
  palmSpots.forEach((pl, idx) => {
    p.set(pl.x, 3.5, pl.z); s.set(1, 1, 1); m4.compose(p, q, s); trunks.setMatrixAt(idx, m4);
    p.set(pl.x, 7.6, pl.z); s.set(1, 0.45, 1); m4.compose(p, q, s); leaves.setMatrixAt(idx, m4);
  });
  trunks.castShadow = true; leaves.castShadow = true;
  scene.add(trunks); scene.add(leaves);
  city.palms = palmSpots;

  // ---- beach + sea ----
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 120, 60), new THREE.MeshLambertMaterial({ color: 0xe8cf9a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, BEACH_Z + 30); sand.receiveShadow = true; scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 500), new THREE.MeshLambertMaterial({ color: 0x1e6f8f, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(320, 0.02, 160); scene.add(sea);
  const sea2 = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 120, 220), sea.material);
  sea2.rotation.x = -Math.PI / 2; sea2.position.set(0, 0.02, BEACH_Z + 140); scene.add(sea2);

  // ---- bridge to Isla Verde (east, z = 0) ----
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 16), bridgeMat);
  bridge.position.set(255, 1.2, 0); bridge.castShadow = true; bridge.receiveShadow = true; scene.add(bridge);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xff9f1c });
  for (const rz of [-7, 7]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(110, 1, 0.6), railMat);
    rail.position.set(255, 2.2, rz); scene.add(rail);
  }
  // island ground + buildings
  const island = new THREE.Mesh(new THREE.CylinderGeometry(75, 80, 2, 24), new THREE.MeshLambertMaterial({ color: 0x7d9b6a }));
  island.position.set(330, 0, 0); island.receiveShadow = true; scene.add(island);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, r = rand(18, 48);
    const h = rand(8, 26);
    const ib = new THREE.Mesh(new THREE.BoxGeometry(rand(10, 14), h, rand(10, 14)), new THREE.MeshLambertMaterial({ color: pick([0xe8e0d0, 0xc9b18a, 0x9ab8c9]) }));
    ib.position.set(330 + Math.cos(a) * r, 1 + h / 2, Math.sin(a) * r); ib.castShadow = true; scene.add(ib);
  }

  // ---- interactable spots ----
  const markerGeo = new THREE.CylinderGeometry(4, 4, 0.3, 20);
  const mk = (x, z, color) => {
    const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }));
    m.position.set(x, 0.75, z); scene.add(m); return m;
  };
  city.stores = [
    { x: 52, z: -52, name: 'Downtown Bank', kind: 'bank', marker: mk(52, -52, 0xffd23d) },
    { x: -52, z: -104, name: 'Old Town Liquor', kind: 'store', marker: mk(-52, -104, 0xffd23d) },
    { x: 104, z: 52, name: 'Marina 24/7', kind: 'store', marker: mk(104, 52, 0xffd23d) },
  ];
  city.garage = { x: -104, z: 52, name: 'Palm Heights Garage', marker: mk(-104, 52, 0x7dff9a) };
  city.chop = { x: 104, z: -104, name: 'Harbor Chop Shop', marker: mk(104, -104, 0xff5d5d) };
  city.raceStarts = [
    { x: 0, z: -156, name: 'Sunset Sprint', len: 3 },
    { x: -156, z: 0, name: 'Old Town Loop', len: 4 },
    { x: 52, z: 156, name: 'Beachfront Dash', len: 3 },
  ];
  city.raceStarts.forEach((r) => { r.marker = mk(r.x, r.z, 0x4ecdc4); });

  // golden shells (20 collectibles) scattered across districts
  const shellGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xffd23d, emissive: 0xaa7700, emissiveIntensity: 0.8 });
  for (let k = 0; k < 20; k++) {
    const x = rand(-170, 170), z = rand(-170, 190);
    const s = new THREE.Mesh(shellGeo, shellMat);
    s.position.set(x, 1.2, z); scene.add(s);
    city.shells.push({ x, z, mesh: s, taken: false });
  }
  G.city = city;
  return city;
}
