// Solara City 3D v3 — vehicles: distinct low-poly bodies per type (sedan, sports, SUV,
// pickup, van, taxi, police), arcade handling per type, traffic AI that obeys traffic
// lights, police pursuit + roadblocks + a clearly visible helicopter with searchlight.
// Fresh rewrite for v3. Exports: makeCarMesh(color, police, type), spawnCar(x, z, yaw,
// opts), updatePlayerCar(dt), spawnTraffic(n), updateTraffic(dt), spawnPolice(n),
// updatePolice(dt).
// Car object shape (used by missions/combat/sidesystems — keep exact):
// { group, yaw, speed, top, accel, health, color, driver, ai, police, type, flee,
//   wheels[], brakeMat, headMat, steer }
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, rand, randi, pick, clamp, lerp, dist2, addHeat } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';

const roadX = (i) => -CITY_HALF + i * PITCH;
const roadZ = (j) => -CITY_HALF + j * PITCH;

export const CAR_TYPES = {
  sedan:  { len: 4.4, w: 2.0, bodyH: 0.72, cabH: 0.62, cabL: 2.0, top: 30, accel: 14 },
  sports: { len: 4.7, w: 2.0, bodyH: 0.58, cabH: 0.5,  cabL: 1.7, top: 38, accel: 21 },
  suv:    { len: 4.8, w: 2.1, bodyH: 0.95, cabH: 0.85, cabL: 2.6, top: 28, accel: 12 },
  pickup: { len: 5.1, w: 2.1, bodyH: 0.8,  cabH: 0.8,  cabL: 1.5, top: 29, accel: 13 },
  van:    { len: 5.3, w: 2.2, bodyH: 1.5,  cabH: 0.0,  cabL: 0.0, top: 25, accel: 10 },
  taxi:   { len: 4.4, w: 2.0, bodyH: 0.72, cabH: 0.62, cabL: 2.0, top: 30, accel: 14 },
  police: { len: 4.5, w: 2.05, bodyH: 0.75, cabH: 0.62, cabL: 2.1, top: 34, accel: 18 },
};

// ---- distinct low-poly body per type. children[0] is ALWAYS the main body box
// (the garage respray replaces children[0].material — keep that contract). ----
export function makeCarMesh(color, police = false, type = 'sedan') {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0x111318 : color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2f42 });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa4ae });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.bodyH, t.len), bodyMat);
  body.position.y = 0.55 + t.bodyH / 2 - 0.36;
  body.castShadow = true;
  g.add(body); // children[0] — respray target
  // cabin / roof
  if (t.cabL > 0) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.86, t.cabH, t.cabL), type === 'pickup' ? bodyMat : glassMat);
    cab.position.set(0, body.position.y + t.bodyH / 2 + t.cabH / 2 - 0.06, type === 'pickup' ? -t.len / 2 + t.cabL / 2 + 0.35 : -0.15);
    cab.castShadow = true;
    g.add(cab);
  }
  if (type === 'pickup') {
    // open bed: low walls around the rear half
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(t.w - 0.2, 0.12, t.len / 2 - 0.4), darkMat);
    bedFloor.position.set(0, body.position.y + t.bodyH / 2 + 0.02, t.len / 4);
    g.add(bedFloor);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, t.len / 2 - 0.4), bodyMat);
      wall.position.set(s * (t.w / 2 - 0.06), body.position.y + t.bodyH / 2 + 0.25, t.len / 4);
      g.add(wall);
    }
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.9, 0.08, 0.5), darkMat);
    spoiler.position.set(0, body.position.y + t.bodyH / 2 + 0.42, t.len / 2 - 0.3);
    g.add(spoiler);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.7, 0.18, 0.3), darkMat);
    lip.position.set(0, 0.42, -t.len / 2 - 0.05);
    g.add(lip);
  }
  if (type === 'van') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.04, 0.3, t.len * 0.7), new THREE.MeshLambertMaterial({ color: 0x2ec4b6 }));
    stripe.position.set(0, body.position.y + 0.25, 0);
    g.add(stripe);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    sign.position.set(0, body.position.y + t.bodyH / 2 + t.cabH + 0.12, -0.15);
    g.add(sign);
  }
  if (police) {
    // white doors band + light bar
    const band = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.04, 0.34, t.len * 0.62), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    band.position.set(0, body.position.y + 0.08, 0);
    g.add(band);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.4), darkMat);
    barBase.position.set(0, body.position.y + t.bodyH / 2 + t.cabH + 0.08, -0.15);
    g.add(barBase);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 10);
  const wheels = [];
  for (const [wx, wz] of [[-t.w / 2, -t.len / 2 + 0.85], [t.w / 2, -t.len / 2 + 0.85], [-t.w / 2, t.len / 2 - 0.85], [t.w / 2, t.len / 2 - 0.85]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  // headlights + brake lights (store materials for night/brake glow)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x7a1010 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), headMat);
    hl.position.set(s * (t.w / 2 - 0.35), 0.72, -t.len / 2 - 0.02);
    g.add(hl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), brakeMat);
    bl.position.set(s * (t.w / 2 - 0.35), 0.72, t.len / 2 + 0.02);
    g.add(bl);
  }
  // police light bar lenses (kept as children so updatePolice can flash them)
  let barL = null, barR = null;
  if (police) {
    barL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    barL.position.set(-0.38, body.position.y + t.bodyH / 2 + t.cabH + 0.2, -0.15);
    g.add(barL);
    barR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2d7dff }));
    barR.position.set(0.38, body.position.y + t.bodyH / 2 + t.cabH + 0.2, -0.15);
    g.add(barR);
  }
  g.userData = { wheels, headMat, brakeMat, barL, barR, type };
  return g;
}

export function spawnCar(x, z, yaw = 0, opts = {}) {
  const type = opts.type || (opts.police ? 'police' : pick(['sedan', 'sedan', 'sports', 'suv', 'taxi']));
  const color = opts.color !== undefined ? opts.color : pick([0xd43d2a, 0x2a6fd4, 0xe8c832, 0x3aa655, 0x7a4fd4, 0x4fd4c2, 0xd8d8d8, 0x222831]);
  const group = makeCarMesh(color, !!opts.police, type);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  G.scene.add(group);
  const t = CAR_TYPES[type];
  const car = {
    group, yaw, speed: 0, top: opts.top || t.top, accel: t.accel,
    health: 100, color, driver: opts.driver || null,
    ai: opts.ai || { targetSpeed: rand(10, 16) },
    police: !!opts.police, type, flee: !!opts.flee,
    wheels: group.userData.wheels, brakeMat: group.userData.brakeMat,
    headMat: group.userData.headMat, barL: group.userData.barL, barR: group.userData.barR,
    steer: 0, bustT: 0, axis: 'x', dir: 1, lane: 0, stopT: 0,
  };
  G.cars.push(car);
  return car;
}

// ---- collision helpers ----
function collideBuildings(car) {
  const p = car.group.position;
  for (const s of G.city.solids) {
    if (Math.abs(p.x - s.x) < s.hw + 1.4 && Math.abs(p.z - s.z) < s.hd + 1.4) {
      const dx = p.x - s.x, dz = p.z - s.z;
      const ox = s.hw + 1.4 - Math.abs(dx), oz = s.hd + 1.4 - Math.abs(dz);
      if (ox < oz) p.x = s.x + Math.sign(dx || 1) * (s.hw + 1.4);
      else p.z = s.z + Math.sign(dz || 1) * (s.hd + 1.4);
      if (Math.abs(car.speed) > 8) { audio.crash(); addHeat(2); }
      car.speed *= 0.45;
      return true;
    }
  }
  return false;
}
function collideCars(car, others) {
  const p = car.group.position;
  for (const o of others) {
    if (o === car) continue;
    const q = o.group.position;
    const dx = p.x - q.x, dz = p.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.6 && d > 0.01) {
      const push = (3.6 - d) / 2;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
      car.speed *= 0.85;
    }
  }
}

// ---- player driving (arcade) ----
export function updatePlayerCar(dt) {
  const p = G.player;
  if (!p || p.onFoot || !p.car) { audio.setEngine(0, false); return; }
  const car = p.car;
  const th = input.keys.KeyW || input.keys.ArrowUp ? 1 : 0;
  const br = input.keys.KeyS || input.keys.ArrowDown ? 1 : 0;
  const st = (input.keys.KeyA || input.keys.ArrowLeft ? 1 : 0) - (input.keys.KeyD || input.keys.ArrowRight ? 1 : 0);
  const hb = input.keys.Space ? 1 : 0;
  if (th) car.speed += car.accel * dt;
  if (br) {
    if (car.speed > 1) car.speed -= 26 * dt;
    else car.speed -= 9 * dt; // reverse
  }
  if (hb) car.speed *= Math.max(0, 1 - 3.2 * dt);
  car.speed -= car.speed * 0.55 * dt; // drag
  car.speed = clamp(car.speed, -11, car.top);
  const spdN = clamp(Math.abs(car.speed) / car.top, 0, 1);
  car.steer = lerp(car.steer, st, 1 - Math.pow(0.001, dt));
  car.yaw += car.steer * 1.9 * spdN * dt * (car.speed >= 0 ? 1 : -1);
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  car.group.position.x += fx * car.speed * dt;
  car.group.position.z += fz * car.speed * dt;
  car.group.position.x = clamp(car.group.position.x, -190, 400);
  car.group.position.z = clamp(car.group.position.z, -190, 260);
  car.group.rotation.y = car.yaw;
  for (const w of car.wheels) w.rotation.x += car.speed * dt * 0.55;
  car.brakeMat.color.setHex(br || hb ? 0xff2d2d : 0x7a1010);
  collideBuildings(car);
  collideCars(car, G.cars);
  audio.setEngine(spdN, true);
  // auto-drive (used by the ?scene=chase staging): keep to the road, loop the block
  if (G.autoDrive) {
    car.speed = Math.max(car.speed, 16);
    const px = car.group.position;
    if (px.z < -160) car.yaw = 0; // head +z
    if (px.z > 160) car.yaw = Math.PI; // head -z
  }
}

// ---- traffic ----
export function spawnTraffic(n) {
  for (let k = 0; k < n; k++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const i = randi(0, NROADS - 1);
    const t = rand(-CITY_HALF, CITY_HALF);
    const x = axis === 'x' ? t : roadX(i);
    const z = axis === 'x' ? roadZ(i) : t;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const type = pick(['sedan', 'sedan', 'suv', 'pickup', 'van', 'taxi', 'sports']);
    const car = spawnCar(x, z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      { driver: 'traffic', type });
    car.axis = axis; car.dir = dir;
    car.lane = pick([-2.6, 2.6]);
    car.ai.targetSpeed = rand(9, 15);
    G.traffic.push(car);
  }
}

function trafficAhead(car) {
  // nearest car ahead on the same axis + lane, within 12 units
  const p = car.group.position;
  let best = 1e9;
  for (const o of G.cars) {
    if (o === car || o.driver === 'player') continue;
    const q = o.group.position;
    if (car.axis === 'x') {
      if (Math.abs(q.z - p.z) > 4) continue;
      const d = (q.x - p.x) * car.dir;
      if (d > 0 && d < best) best = d;
    } else {
      if (Math.abs(q.x - p.x) > 4) continue;
      const d = (q.z - p.z) * car.dir;
      if (d > 0 && d < best) best = d;
    }
  }
  return best;
}

export function updateTraffic(dt) {
  const pp = G.player ? G.player.pos : null;
  for (let i = G.traffic.length - 1; i >= 0; i--) {
    const car = G.traffic[i];
    const p = car.group.position;
    // respawn far away cars near the player to keep the streets alive
    if (pp && dist2(p.x, p.z, pp.x, pp.z) > 300) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const ri = randi(0, NROADS - 1);
      const near = rand(-60, 60);
      p.x = axis === 'x' ? pp.x + near : roadX(ri);
      p.z = axis === 'x' ? roadZ(ri) : pp.z + near;
      car.axis = axis; car.dir = Math.random() < 0.5 ? 1 : -1;
      car.speed = 0;
      continue;
    }
    // traffic light: stop line 4 units before the intersection centre
    let want = car.ai.targetSpeed;
    const li = G.city.lightStateAt(p.x, p.z, car.axis);
    if (li === 'red' || li === 'amber') {
      // distance to the nearest intersection centre ahead
      let dInt = 1e9;
      for (const tl of G.city.trafficLights) {
        const along = car.axis === 'x' ? (tl.x - p.x) * car.dir : (tl.z - p.z) * car.dir;
        const lateral = car.axis === 'x' ? Math.abs(tl.z - p.z) : Math.abs(tl.x - p.x);
        if (along > 0 && along < dInt && lateral < 8) dInt = along;
      }
      if (dInt < 14) {
        if (li === 'red' || dInt < 7) want = 0;
        else want = Math.min(want, dInt * 0.8);
      }
    }
    // car ahead: match its speed
    const ahead = trafficAhead(car);
    if (ahead < 12) want = Math.min(want, Math.max(0, (ahead - 5) * 0.9));
    // accelerate / brake toward want
    if (car.speed < want) car.speed += 8 * dt;
    else car.speed = Math.max(want, car.speed - 18 * dt);
    // move along the axis, with lane offset
    if (car.axis === 'x') {
      p.x += car.dir * car.speed * dt;
      p.z += (roadZ(Math.round((p.z + CITY_HALF) / PITCH)) + car.lane - p.z) * 0.02;
      // snap lane: find nearest road line for z
      let bz = roadZ(0), bd = 1e9;
      for (let j = 0; j < NROADS; j++) { const d = Math.abs(p.z - roadZ(j)); if (d < bd) { bd = d; bz = roadZ(j); } }
      p.z += (bz + car.lane - p.z) * Math.min(1, dt * 1.5);
    } else {
      p.z += car.dir * car.speed * dt;
      let bx = roadX(0), bd = 1e9;
      for (let j = 0; j < NROADS; j++) { const d = Math.abs(p.x - roadX(j)); if (d < bd) { bd = d; bx = roadX(j); } }
      p.x += (bx + car.lane - p.x) * Math.min(1, dt * 1.5);
    }
    // turn at intersections sometimes
    const nearInt = (car.axis === 'x')
      ? (() => { let b = 1e9; for (let j = 0; j < NROADS; j++) b = Math.min(b, Math.abs(p.x - roadX(j))); return b; })()
      : (() => { let b = 1e9; for (let j = 0; j < NROADS; j++) b = Math.min(b, Math.abs(p.z - roadZ(j))); return b; })();
    if (nearInt < 1.5 && Math.random() < 0.25 && car.speed > 3) {
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.lane = pick([-2.6, 2.6]);
    }
    car.yaw = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.group.rotation.y = car.yaw;
    for (const w of car.wheels) w.rotation.x += car.speed * dt * 0.55;
    // wrap around the city edge
    if (p.x < -CITY_HALF - 10 || p.x > CITY_HALF + 10 || p.z < -CITY_HALF - 10 || p.z > CITY_HALF + 10) {
      p.x = clamp(p.x, -CITY_HALF, CITY_HALF); p.z = clamp(p.z, -CITY_HALF, CITY_HALF);
      car.dir *= -1;
    }
    collideCars(car, G.traffic);
  }
}

// ---- police ----
export function spawnPolice(n) {
  const pp = G.player ? G.player.pos : { x: 0, z: 0 };
  for (let k = 0; k < n; k++) {
    const a = rand(0, Math.PI * 2);
    const car = spawnCar(pp.x + Math.sin(a) * 30, pp.z + Math.cos(a) * 30, a,
      { driver: 'police', police: true, type: 'police' });
    car.ai.targetSpeed = 26;
    G.police.push(car);
  }
}

let roadblockGroup = null;
function spawnRoadblock() {
  if (roadblockGroup) return;
  const pp = G.player.pos;
  const fx = Math.sin(G.player.car ? G.player.car.yaw : G.player.yaw);
  const fz = Math.cos(G.player.car ? G.player.car.yaw : G.player.yaw);
  const bx = pp.x + fx * 55, bz = pp.z + fz * 55;
  roadblockGroup = new THREE.Group();
  const barMat = new THREE.MeshLambertMaterial({ color: 0xff5d5d });
  for (const s of [-4, 0, 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 3.4), barMat);
    bar.position.set(-fz * s, 0.55, fx * s);
    roadblockGroup.add(bar);
  }
  roadblockGroup.position.set(bx, 0, bz);
  G.scene.add(roadblockGroup);
  // two parked police cars flanking the block
  for (const s of [-9, 9]) {
    const c = spawnCar(bx - fz * s, bz + fx * s, Math.atan2(fx, fz) + Math.PI / 2,
      { driver: 'police', police: true, type: 'police' });
    c.ai.targetSpeed = 0;
    G.police.push(c);
  }
}
function clearRoadblock() {
  if (!roadblockGroup) return;
  G.scene.remove(roadblockGroup);
  roadblockGroup = null;
}

function ensureHeli() {
  if (G.heli) return;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6.4), bodyMat);
  body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5), bodyMat);
  tail.position.set(0, 0.3, 5.2); g.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 1.8), new THREE.MeshLambertMaterial({ color: 0x9fd4ff }));
  glass.position.set(0, 0.2, -2.4); g.add(glass);
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7), rotorMat);
  rotor.position.y = 1.3; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.5), rotorMat);
  tailRotor.position.set(0.45, 0.4, 7.2); g.add(tailRotor);
  // searchlight cone (translucent, points down-forward)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  cone.position.set(0, -13, -4);
  cone.rotation.x = 0.35;
  g.add(cone);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
  blink.position.set(0, -1, 0); g.add(blink);
  const spot = new THREE.SpotLight(0xfff2b0, 60, 60, 0.5, 0.5, 1.2);
  spot.position.set(0, -1, -2);
  g.add(spot);
  g.add(spot.target);
  spot.target.position.set(0, -26, -8);
  g.scale.setScalar(1.15);
  G.scene.add(g);
  G.heli = { group: g, rotor, tailRotor, cone, blink, spot, angle: 0.6 };
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  const wanted = G.wanted;
  // helicopter at 3+ stars
  if (wanted >= 3) {
    ensureHeli();
    const h = G.heli;
    h.angle += dt * 0.22;
    // orbit ahead-left of the player so it stays in the chase camera frame
    const baseYaw = p.car ? p.car.yaw : p.yaw;
    const ax = Math.sin(baseYaw + 0.15 + Math.sin(h.angle) * 0.2);
    const az = Math.cos(baseYaw + 0.15 + Math.sin(h.angle) * 0.2);
    const tx = p.pos.x + ax * 26;
    const tz = p.pos.z + az * 26;
    h.group.position.x = lerp(h.group.position.x, tx, 1 - Math.pow(0.01, dt));
    h.group.position.z = lerp(h.group.position.z, tz, 1 - Math.pow(0.01, dt));
    h.group.position.y = lerp(h.group.position.y, 7.5 + Math.sin(h.angle * 2) * 1.0, 1 - Math.pow(0.01, dt));
    h.group.rotation.y = Math.atan2(p.pos.x - h.group.position.x, p.pos.z - h.group.position.z);
    h.rotor.rotation.y += dt * 22;
    h.tailRotor.rotation.x += dt * 30;
    h.blink.material.color.setHex(Math.sin(performance.now() / 160) > 0 ? 0xff2d2d : 0x440000);
    h.spot.intensity = 60;
  } else if (G.heli) {
    // fly away and remove
    const h = G.heli;
    h.group.position.y += 14 * dt;
    h.rotor.rotation.y += dt * 22;
    if (h.group.position.y > 90) { G.scene.remove(h.group); G.heli = null; }
  }
  // roadblocks at 4+ stars
  if (wanted >= 4) spawnRoadblock();
  else clearRoadblock();

  const flash = Math.sin(performance.now() / 130) > 0;
  for (let i = G.police.length - 1; i >= 0; i--) {
    const car = G.police[i];
    const cp = car.group.position;
    const dx = p.pos.x - cp.x, dz = p.pos.z - cp.z;
    const d = Math.hypot(dx, dz) || 1;
    // flash light bar
    if (car.barL && car.barR) {
      car.barL.material.color.setHex(flash ? 0xff2d2d : 0x550000);
      car.barR.material.color.setHex(flash ? 0x2d7dff : 0x000055);
    }
    if (wanted === 0) {
      // drive off, despawn when far
      car.speed = Math.max(0, car.speed - 6 * dt);
      if (d > 220) {
        G.scene.remove(car.group);
        G.cars.splice(G.cars.indexOf(car), 1);
        G.police.splice(i, 1);
        continue;
      }
    } else {
      // pursuit: steer toward the player, ram when close
      const wantYaw = Math.atan2(dx, dz);
      let dy = wantYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += clamp(dy, -2.4 * dt, 2.4 * dt);
      const target = d < 7 ? 30 : 26;
      car.speed += (target - car.speed) * Math.min(1, dt * 0.8);
      car.group.position.x += Math.sin(car.yaw) * car.speed * dt;
      car.group.position.z += Math.cos(car.yaw) * car.speed * dt;
      car.group.rotation.y = car.yaw;
      for (const w of car.wheels) w.rotation.x += car.speed * dt * 0.55;
      collideBuildings(car);
      // bust: player on foot, police touching, sustained
      if (p.onFoot && d < 4.5) {
        car.bustT += dt;
        if (car.bustT > 2.5) { G.busted = true; }
      } else car.bustT = 0;
      // ram damage to player car
      if (!p.onFoot && d < 4 && p.car) {
        p.car.health = Math.max(0, p.car.health - 12 * dt);
        if (p.car.health <= 0) {
          const idx = G.cars.indexOf(p.car);
          if (idx >= 0) G.cars.splice(idx, 1);
          G.scene.remove(p.car.group);
          audio.crash();
          p.car = null; p.onFoot = true; p.group.visible = true;
          p.group.position.copy(p.pos);
          addHeat(10);
        }
      }
    }
    // keep police inside the world
    car.group.position.x = clamp(car.group.position.x, -190, 400);
    car.group.position.z = clamp(car.group.position.z, -190, 260);
  }
}
