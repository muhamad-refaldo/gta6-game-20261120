// Solara City 3D v3.2 — vehicles: realistic cars (true proportions, wheels with
// hubs, reflective glass, mirrors, handles, plates, bumpers, lights), traffic AI
// that obeys lights, police pursuit + helicopter + roadblocks, arcade driving.
// Fresh rewrite for v3.2. Exports (used by main/missions/combat/sidesystems):
// makeCarMesh, spawnCar, updatePlayerCar, spawnTraffic, updateTraffic,
// spawnPolice, updatePolice.
import * as THREE from 'three';
import { G, clamp, lerp, rand, pick, dist2, nearestRoadPoint } from './state.js';
import { lightStateAt } from './city.js';
import { audio } from './audio.js';
import { input } from './input.js';

// ---- per-type dimensions (length x width x height in units, realistic ratios) ----
const TYPES = {
  sedan:  { len: 4.4, wid: 1.9, h: 1.35, top: 30, accel: 15, wheel: 0.32 },
  sports: { len: 4.3, wid: 2.0, h: 1.22, top: 38, accel: 20, wheel: 0.34 },
  suv:    { len: 4.6, wid: 2.0, h: 1.75, top: 30, accel: 14, wheel: 0.38 },
  pickup: { len: 4.9, wid: 2.0, h: 1.7,  top: 28, accel: 13, wheel: 0.38 },
  van:    { len: 5.0, wid: 2.1, h: 2.05, top: 25, accel: 11, wheel: 0.36 },
  taxi:   { len: 4.4, wid: 1.9, h: 1.4,  top: 30, accel: 15, wheel: 0.32 },
  police: { len: 4.4, wid: 1.9, h: 1.4,  top: 34, accel: 18, wheel: 0.32 },
};
const TRAFFIC_COLORS = [0x8a9aa8, 0xd43d2a, 0x2a6fd4, 0xe8c832, 0x3aa655, 0x7a4fd4, 0x4fd4c2, 0xd8d8d8, 0x2a2d33, 0xb06a2a];

// ---- shared materials ----
const MAT = {
  tire: new THREE.MeshLambertMaterial({ color: 0x141414 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.3 }),
  trim: new THREE.MeshLambertMaterial({ color: 0x23262b }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 0.9, roughness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0e1418, metalness: 0.85, roughness: 0.15 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 1.4 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x7a0f08, emissive: 0xff2a1a, emissiveIntensity: 1.2 }),
  plate: new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
  whiteDoor: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  taxiSign: new THREE.MeshStandardMaterial({ color: 0xe8c832, emissive: 0xffd23d, emissiveIntensity: 0.7 }),
  redLight: new THREE.MeshStandardMaterial({ color: 0x7a0f08, emissive: 0xff2a1a, emissiveIntensity: 2.2 }),
  blueLight: new THREE.MeshStandardMaterial({ color: 0x0a1a7a, emissive: 0x2a4aff, emissiveIntensity: 2.2 }),
  barrier: new THREE.MeshLambertMaterial({ color: 0xc23b22 }),
  barrierWhite: new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
};

function paint(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35 });
}

function bx(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// one wheel: steer pivot (front) -> spin group -> tire + hub
function makeWheel(r, steerable) {
  const steer = new THREE.Group();
  const spin = new THREE.Group();
  steer.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 14), MAT.tire);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.26, 10), MAT.hub);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  return { steer, spin };
}

export function makeCarMesh(color, police = false, type = 'sedan') {
  const t = TYPES[type] || TYPES.sedan;
  const { len, wid, wheel: wr } = t;
  const body = paint(police ? 0x14161a : color);
  const g = new THREE.Group();

  // children[0] MUST stay the main body box (garage respray replaces its material)
  const mainBody = bx(wid, 0.5, len, body, 0, 0.55, 0, g);
  void mainBody;

  // hood (front, lower) + trunk (rear, lower)
  bx(wid * 0.96, 0.3, len * 0.2, body, 0, 0.68, len * 0.36, g);
  bx(wid * 0.96, 0.3, len * 0.18, body, 0, 0.68, -len * 0.36, g);

  if (type === 'van') {
    // tall boxy van: glass band along the whole side
    bx(wid * 0.88, 0.85, len * 0.86, MAT.glass, 0, 1.25, 0, g);
    bx(wid * 0.9, 0.08, len * 0.88, body, 0, 1.72, 0, g); // roof
    bx(wid * 0.02, 0.5, 0.06, MAT.trim, -wid / 2 - 0.005, 1.25, len * 0.1, g); // sliding door line
    bx(wid * 0.02, 0.5, 0.06, MAT.trim, wid / 2 + 0.005, 1.25, len * 0.1, g);
  } else if (type === 'pickup') {
    // cab up front, open bed behind
    bx(wid * 0.86, 0.55, len * 0.34, MAT.glass, 0, 1.05, len * 0.22, g); // cab glass
    bx(wid * 0.88, 0.07, len * 0.34, body, 0, 1.36, len * 0.22, g); // cab roof
    bx(wid, 0.42, len * 0.42, body, 0, 0.62, -len * 0.24, g); // bed floor + walls base
    bx(wid, 0.5, 0.08, body, 0, 0.85, -len * 0.46, g); // tailgate
    bx(0.08, 0.5, len * 0.42, body, -wid / 2 + 0.04, 0.85, -len * 0.24, g); // bed wall L
    bx(0.08, 0.5, len * 0.42, body, wid / 2 - 0.04, 0.85, -len * 0.24, g); // bed wall R
    bx(wid * 0.8, 0.06, len * 0.38, MAT.trim, 0, 0.84, -len * 0.24, g); // bed liner
  } else {
    // cabin: dark reflective glass + body-color roof
    const cabH = type === 'suv' ? 0.62 : 0.5;
    const cabY = type === 'suv' ? 1.08 : 1.02;
    bx(wid * 0.84, cabH, len * 0.42, MAT.glass, 0, cabY, -len * 0.04, g);
    bx(wid * 0.8, 0.07, len * 0.38, body, 0, cabY + cabH / 2 + 0.02, -len * 0.04, g); // roof
    if (type === 'suv') {
      bx(0.06, 0.06, len * 0.36, MAT.trim, -wid * 0.32, cabY + cabH / 2 + 0.08, -len * 0.04, g); // roof rail L
      bx(0.06, 0.06, len * 0.36, MAT.trim, wid * 0.32, cabY + cabH / 2 + 0.08, -len * 0.04, g); // roof rail R
    }
    if (type === 'sports') {
      // rear spoiler + side skirts
      bx(wid * 0.92, 0.05, 0.34, body, 0, 1.02, -len * 0.48, g);
      bx(0.06, 0.16, 0.3, MAT.trim, -wid * 0.36, 0.92, -len * 0.48, g);
      bx(0.06, 0.16, 0.3, MAT.trim, wid * 0.36, 0.92, -len * 0.48, g);
      bx(wid * 0.06, 0.1, len * 0.6, MAT.trim, -wid / 2 + 0.02, 0.3, 0, g);
      bx(wid * 0.06, 0.1, len * 0.6, MAT.trim, wid / 2 - 0.02, 0.3, 0, g);
    }
  }

  // side trim lines (door shut lines) + door handles
  bx(0.02, 0.03, len * 0.62, MAT.trim, -wid / 2 - 0.005, 0.62, 0, g);
  bx(0.02, 0.03, len * 0.62, MAT.trim, wid / 2 + 0.005, 0.62, 0, g);
  for (const sx of [-1, 1]) {
    for (const dz of [len * 0.12, -len * 0.12]) {
      bx(0.03, 0.03, 0.18, MAT.chrome, sx * (wid / 2 + 0.01), 0.88, dz, g);
    }
  }

  // mirrors
  bx(0.1, 0.08, 0.16, body, -wid / 2 - 0.07, 1.02, len * 0.16, g);
  bx(0.1, 0.08, 0.16, body, wid / 2 + 0.07, 1.02, len * 0.16, g);

  // bumpers, grille, lights, plates, exhaust
  bx(wid * 0.98, 0.2, 0.16, MAT.trim, 0, 0.34, len / 2 - 0.02, g);
  bx(wid * 0.98, 0.2, 0.16, MAT.trim, 0, 0.34, -len / 2 + 0.02, g);
  bx(wid * 0.45, 0.16, 0.05, MAT.trim, 0, 0.62, len / 2 + 0.01, g); // grille
  bx(0.36, 0.13, 0.06, MAT.head, -wid * 0.28, 0.78, len / 2 + 0.01, g);
  bx(0.36, 0.13, 0.06, MAT.head, wid * 0.28, 0.78, len / 2 + 0.01, g);
  bx(0.36, 0.12, 0.06, MAT.tail, -wid * 0.28, 0.8, -len / 2 - 0.01, g);
  bx(0.36, 0.12, 0.06, MAT.tail, wid * 0.28, 0.8, -len / 2 - 0.01, g);
  bx(0.52, 0.15, 0.02, MAT.plate, 0, 0.45, len / 2 + 0.07, g);
  bx(0.52, 0.15, 0.02, MAT.plate, 0, 0.45, -len / 2 - 0.07, g);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), MAT.trim);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(wid * 0.25, 0.26, -len / 2 - 0.05);
  g.add(exhaust);

  // wheels (front steerable)
  const wheels = {};
  const wz = len * 0.33, wx = wid / 2 - 0.02;
  for (const [key, sx, sz, steerable] of [['fl', -1, 1, true], ['fr', 1, 1, true], ['rl', -1, -1, false], ['rr', 1, -1, false]]) {
    const w = makeWheel(wr, steerable);
    w.steer.position.set(sx * wx, wr, sz * wz);
    g.add(w.steer);
    wheels[key] = w;
  }

  // type extras
  if (type === 'taxi') {
    bx(0.55, 0.16, 0.3, MAT.taxiSign, 0, 1.42, -len * 0.04, g); // roof sign
  }
  let lightRed = null, lightBlue = null;
  if (police || type === 'police') {
    // white doors on a black body
    bx(0.02, 0.42, len * 0.44, MAT.whiteDoor, -wid / 2 - 0.008, 0.72, 0, g);
    bx(0.02, 0.42, len * 0.44, MAT.whiteDoor, wid / 2 + 0.008, 0.72, 0, g);
    // light bar: red left, blue right
    bx(0.95, 0.07, 0.32, MAT.trim, 0, 1.38, -len * 0.04, g);
    lightRed = bx(0.4, 0.13, 0.28, MAT.redLight, -0.23, 1.46, -len * 0.04, g);
    lightBlue = bx(0.4, 0.13, 0.28, MAT.blueLight, 0.23, 1.46, -len * 0.04, g);
  }

  g.userData = { wheels, lightRed, lightBlue };
  return g;
}

export function spawnCar(x, z, yaw, opts = {}) {
  const type = opts.type || 'sedan';
  const t = TYPES[type] || TYPES.sedan;
  const police = !!opts.police || type === 'police';
  const color = opts.color !== undefined ? opts.color : pick(TRAFFIC_COLORS);
  const group = makeCarMesh(color, police, type);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  G.scene.add(group);
  const car = {
    group, type, color, police,
    top: t.top, accel: t.accel, speed: 0, health: 100,
    yaw, ai: null, flee: opts.driver === 'flee', driver: opts.driver || null,
    steer: 0, bustT: 0,
  };
  G.cars.push(car);
  return car;
}

// ---------------- player driving ----------------
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function spinWheels(car, dt) {
  const w = car.group.userData.wheels;
  if (!w) return;
  const r = (TYPES[car.type] || TYPES.sedan).wheel;
  for (const key of ['fl', 'fr', 'rl', 'rr']) {
    w[key].spin.rotation.x += (car.speed * dt) / r;
  }
  w.fl.steer.rotation.y = car.steer || 0;
  w.fr.steer.rotation.y = car.steer || 0;
}

export function updatePlayerCar(dt) {
  const car = G.player.car;
  if (!car || G.player.onFoot) { audio.setEngine(0, false); return; }
  const ax = input.axis();
  const handbrake = !!(input.keys.Space);

  if (G.autoDrive) {
    // chase / night staging: drive itself along the road
    const lookX = car.group.position.x + Math.sin(car.yaw) * 10;
    const lookZ = car.group.position.z + Math.cos(car.yaw) * 10;
    const rp = nearestRoadPoint(lookX, lookZ);
    const desired = Math.atan2(rp.x - car.group.position.x, rp.z - car.group.position.z);
    const diff = lerpAngle(car.yaw, desired, 1);
    car.steer = clamp(diff * 0.7, -0.45, 0.45);
    car.yaw += car.steer * Math.max(4, Math.abs(car.speed)) * dt * 0.06;
    car.speed += ((12 - car.speed) * Math.min(1, dt * 0.8));
  } else {
    const throttle = ax.f; // W +1, S -1
    const steerIn = ax.s; // D +1, A -1
    const speedFac = 1 - Math.min(1, Math.abs(car.speed) / car.top) * 0.5;
    car.steer += ((-steerIn * 0.5 * speedFac) - car.steer) * Math.min(1, dt * 8);
    if (throttle > 0) car.speed += car.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= 30 * dt; // brake
      else car.speed -= car.accel * 0.6 * dt; // reverse
    } else {
      car.speed -= car.speed * 0.35 * dt; // drag
    }
    if (handbrake) {
      car.speed -= car.speed * 2.5 * dt;
      car.steer *= 1.4;
    }
    car.speed = clamp(car.speed, -10, car.top);
    car.yaw += car.steer * car.speed * dt * 0.055;
  }

  car.group.position.x += Math.sin(car.yaw) * car.speed * dt;
  car.group.position.z += Math.cos(car.yaw) * car.speed * dt;
  car.group.position.x = clamp(car.group.position.x, -190, 395);
  car.group.position.z = clamp(car.group.position.z, -190, 255);
  car.group.rotation.y = car.yaw;
  spinWheels(car, dt);
  audio.setEngine(Math.abs(car.speed) / car.top, true);
}

// ---------------- traffic ----------------
const ROAD_XS = [-182, -130, -78, -26, 26, 78, 130, 182];
const ROAD_ZS = [-182, -130, -78, -26, 26, 78, 130, 182];

export function spawnTraffic(n = 14) {
  const types = ['sedan', 'sedan', 'sports', 'suv', 'pickup', 'van', 'taxi'];
  for (let k = 0; k < n; k++) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const dir = Math.random() < 0.5 ? 1 : -1;
    const line = pick(axis === 'z' ? ROAD_XS : ROAD_ZS);
    const along = rand(-170, 180);
    const lane = dir > 0 ? 1.8 : -1.8;
    const x = axis === 'z' ? line + lane : along;
    const z = axis === 'z' ? along : line + lane;
    const yaw = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = spawnCar(x, z, yaw, { type: pick(types) });
    car.ai = { axis, dir, targetSpeed: rand(10, 16), turnCd: rand(0, 3) };
    car.speed = car.ai.targetSpeed;
    G.traffic.push(car);
  }
}

function nextCrossing(pos, dir, axis) {
  const lines = axis === 'z' ? ROAD_ZS : ROAD_XS;
  let best = null, bd = 1e9;
  for (const L of lines) {
    const d = (L - pos) * dir;
    if (d > 2 && d < bd) { bd = d; best = L; }
  }
  return best === null ? null : { at: best, dist: bd };
}

export function updateTraffic(dt) {
  for (const c of G.traffic) {
    const ai = c.ai;
    if (!ai) continue;
    ai.turnCd = Math.max(0, ai.turnCd - dt);

    // obey the light at the next intersection
    let target = ai.targetSpeed;
    const cross = nextCrossing(ai.axis === 'z' ? c.group.position.z : c.group.position.x, ai.dir, ai.axis);
    if (cross && cross.dist < 16) {
      const state = lightStateAt(c.group.position.x, c.group.position.z, ai.axis);
      if (state !== 'green') target = 0; // brake for red / amber
    }
    const rate = target < c.speed ? 20 : 7; // brake harder than accelerate
    c.speed += clamp(target - c.speed, -rate * dt, rate * dt);

    // move along the current axis
    if (ai.axis === 'z') c.group.position.z += ai.dir * c.speed * dt;
    else c.group.position.x += ai.dir * c.speed * dt;

    // maybe turn at an intersection
    const posAlong = ai.axis === 'z' ? c.group.position.z : c.group.position.x;
    const lines = ai.axis === 'z' ? ROAD_ZS : ROAD_XS;
    let onCross = false;
    for (const L of lines) if (Math.abs(posAlong - L) < 1.6) { onCross = true; break; }
    if (onCross && ai.turnCd <= 0 && Math.random() < 0.35) {
      ai.turnCd = 3;
      const other = ai.axis === 'z' ? 'x' : 'z';
      const ndir = Math.random() < 0.5 ? 1 : -1;
      // snap onto the crossing road
      if (other === 'x') {
        c.group.position.z = c.group.position.z; // stays on its z road line
        ai.axis = 'x'; ai.dir = ndir;
        c.yaw = ndir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        ai.axis = 'z'; ai.dir = ndir;
        c.yaw = ndir > 0 ? 0 : Math.PI;
      }
      // lane offset for the new axis
      const lane = ndir > 0 ? 1.8 : -1.8;
      if (ai.axis === 'z') c.group.position.x = nearestRoadPoint(c.group.position.x, c.group.position.z).x + lane;
      else c.group.position.z = nearestRoadPoint(c.group.position.x, c.group.position.z).z + lane;
    }

    // bounce back at the city edge
    if (c.group.position.x > 188 || c.group.position.x < -188 || c.group.position.z > 258 || c.group.position.z < -188) {
      ai.dir *= -1;
      c.yaw += Math.PI;
      if (ai.axis === 'z') c.group.position.x = nearestRoadPoint(c.group.position.x, c.group.position.z).x + (ai.dir > 0 ? 1.8 : -1.8);
      else c.group.position.z = nearestRoadPoint(c.group.position.x, c.group.position.z).z + (ai.dir > 0 ? 1.8 : -1.8);
    }

    c.group.rotation.y = c.yaw;
    c.steer = 0;
    spinWheels(c, dt);
  }
}

// ---------------- police + helicopter + roadblocks ----------------
let heli = null;
let heliAngle = 0;
let roadblockGroup = null;
let roadblockCars = [];
let spawnTimer = 0;

function buildHeli() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2a6fd4, emissive: 0x0a2a55, emissiveIntensity: 0.6 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc22e24 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1418, metalness: 0.85, roughness: 0.15 });
  // fuselage: white body, blue belly, red tail fin
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 4.2), white);
  body.position.y = 0; body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3.6), blue);
  belly.position.y = -0.55; g.add(belly);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.0), glass);
  nose.position.set(0, 0.1, 2.2); g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), white);
  boom.position.set(0, 0.2, -3.4); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.1), red);
  fin.position.set(0, 0.8, -4.9); g.add(fin);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.14), dark);
  tailRotor.position.set(0.32, 0.4, -4.9); g.add(tailRotor);
  // skids
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), dark);
    skid.position.set(sx, -1.05, 0); g.add(skid);
  }
  // main rotor (spins)
  const rotor = new THREE.Group();
  rotor.position.y = 0.95;
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.07, 0.42), dark);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), dark);
  mast.position.y = 0.75; g.add(mast);
  g.add(rotor);
  // searchlight cone (apex at the heli, base toward the ground/player)
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c0, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 20, 20, 1, true), coneMat);
  g.add(cone);
  // spotlight + ground pool
  const spot = new THREE.SpotLight(0xfff2c0, 220, 60, 0.26, 0.5, 1.2);
  G.scene.add(spot);
  G.scene.add(spot.target);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  G.scene.add(pool);
  G.scene.add(g);
  return { group: g, rotor, tailRotor, cone, spot, pool };
}

function ensureHeli() {
  if (heli) return;
  heli = buildHeli();
  G.heli = heli.group;
  heliAngle = Math.random() * Math.PI * 2;
}

function removeHeli() {
  if (!heli) return;
  G.scene.remove(heli.group);
  G.scene.remove(heli.spot);
  G.scene.remove(heli.spot.target);
  G.scene.remove(heli.pool);
  heli = null;
  G.heli = null;
}

function ensureRoadblock() {
  if (roadblockGroup) return;
  const p = G.player.pos;
  const rp = nearestRoadPoint(p.x, p.z);
  const group = new THREE.Group();
  // 3 striped barriers across the road ahead of the player
  const ahead = 35;
  const fx = Math.sin(G.player.car ? G.player.car.yaw : G.player.yaw);
  const fz = Math.cos(G.player.car ? G.player.car.yaw : G.player.yaw);
  const cx = p.x + fx * ahead, cz = p.z + fz * ahead;
  const perp = rp.axis === 'z' ? 'x' : 'z';
  for (let k = -1; k <= 1; k++) {
    const off = k * 4;
    const bx0 = perp === 'x' ? cx + off : cx;
    const bz0 = perp === 'x' ? cz : cz + off;
    const bar = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.25), k % 2 === 0 ? MAT.barrier : MAT.barrierWhite);
    b1.position.y = 0.9; b1.castShadow = true; bar.add(b1);
    for (const sx of [-1.6, 1.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.5), MAT.trim);
      leg.position.set(sx, 0.45, 0); bar.add(leg);
    }
    bar.position.set(bx0, 0, bz0);
    bar.rotation.y = perp === 'x' ? Math.PI / 2 : 0;
    group.add(bar);
  }
  G.scene.add(group);
  roadblockGroup = group;
  G.roadblocks = [group];
  // 2 flanking police cars
  roadblockCars = [];
  for (const s of [-1, 1]) {
    const ox = perp === 'x' ? 0 : s * 7;
    const oz = perp === 'x' ? s * 7 : 0;
    const car = spawnCar(cx + ox, cz + oz, perp === 'x' ? 0 : Math.PI / 2, { type: 'police', police: true });
    car.ai = { mode: 'block' };
    G.police.push(car);
    roadblockCars.push(car);
  }
}

function removeRoadblock() {
  if (roadblockGroup) { G.scene.remove(roadblockGroup); roadblockGroup = null; G.roadblocks = []; }
  for (const c of roadblockCars) {
    G.scene.remove(c.group);
    const pi = G.police.indexOf(c);
    if (pi >= 0) G.police.splice(pi, 1);
    const ci = G.cars.indexOf(c);
    if (ci >= 0) G.cars.splice(ci, 1);
  }
  roadblockCars = [];
}

export function spawnPolice(n = 2) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = 26 + Math.random() * 18;
    let x = G.player.pos.x + Math.cos(a) * d;
    let z = G.player.pos.z + Math.sin(a) * d;
    const rp = nearestRoadPoint(x, z);
    x = rp.x; z = rp.z;
    const car = spawnCar(x, z, Math.atan2(G.player.pos.x - x, G.player.pos.z - z), { type: 'police', police: true });
    car.ai = { mode: 'chase', bustT: 0 };
    G.police.push(car);
  }
}

export function updatePolice(dt) {
  // wanted 0: stand down entirely
  if (G.wanted === 0) {
    for (const c of [...G.police]) {
      G.scene.remove(c.group);
      const ci = G.cars.indexOf(c);
      if (ci >= 0) G.cars.splice(ci, 1);
    }
    G.police = [];
    removeHeli();
    removeRoadblock();
    spawnTimer = 0;
    return;
  }

  // grow the pursuit to match the wanted level
  const desired = Math.min(G.wanted, 5);
  spawnTimer += dt;
  if (G.police.length < desired && spawnTimer > 1.5) {
    spawnTimer = 0;
    spawnPolice(1);
  }

  const px = G.player.pos.x, pz = G.player.pos.z;
  const pCar = G.player.car;
  for (const c of G.police) {
    if (c.ai && c.ai.mode === 'block') continue; // roadblock cars hold position
    const dx = px - c.group.position.x, dz = pz - c.group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const desiredYaw = Math.atan2(dx, dz);
    c.yaw = lerpAngle(c.yaw, desiredYaw, Math.min(1, dt * 1.6));
    const targetSpeed = Math.min(c.top * 0.92, d < 12 ? 14 : c.top * 0.92);
    c.speed += clamp(targetSpeed - c.speed, -24 * dt, 16 * dt);
    c.group.position.x += Math.sin(c.yaw) * c.speed * dt;
    c.group.position.z += Math.cos(c.yaw) * c.speed * dt;
    c.group.rotation.y = c.yaw;
    c.steer = clamp(lerpAngle(c.yaw, desiredYaw, 1) * 0.6, -0.4, 0.4);
    spinWheels(c, dt);
    // flashing light bar (alternating red / blue)
    const on = Math.floor(performance.now() / 260) % 2 === 0;
    const ud = c.group.userData;
    if (ud.lightRed) ud.lightRed.material.emissiveIntensity = on ? 2.6 : 0.25;
    if (ud.lightBlue) ud.lightBlue.material.emissiveIntensity = on ? 0.25 : 2.6;

    // bust: close + slow for 2.5 s
    const slow = pCar ? Math.abs(pCar.speed) < 2 : true;
    if (d < (pCar ? 4 : 2.5) && slow) {
      c.bustT = (c.bustT || 0) + dt;
      if (c.bustT > 2.5) { G.busted = true; c.bustT = 0; }
    } else c.bustT = 0;

    // ram: slow the player's car on contact
    if (pCar && d < 3.5) pCar.speed *= (1 - 0.5 * dt);
  }

  // helicopter at 3+ stars, roadblock at 4+
  if (G.wanted >= 3) ensureHeli(); else removeHeli();
  if (G.wanted >= 4) ensureRoadblock(); else removeRoadblock();

  if (heli) {
    heliAngle += dt * 0.45;
    const hx = px + Math.cos(heliAngle) * 18;
    const hz = pz + Math.sin(heliAngle) * 18;
    heli.group.position.set(hx, 7.5, hz);
    heli.group.lookAt(px, 1, pz);
    heli.rotor.rotation.y += dt * 22;
    heli.tailRotor.rotation.x += dt * 30;
    // searchlight beam: from the heli down to the player
    const midX = (hx + px) / 2, midY = (7.5 + 0) / 2, midZ = (hz + pz) / 2;
    const beamLen = Math.hypot(hx - px, 7.5, hz - pz);
    heli.cone.scale.set(1, beamLen / 20, 1);
    heli.cone.position.set(midX, midY, midZ);
    heli.cone.lookAt(hx, 7.5, hz);
    heli.cone.rotateX(Math.PI / 2);
    heli.spot.position.set(hx, 7.5, hz);
    heli.spot.target.position.set(px, 0, pz);
    heli.pool.position.set(px, 0.06, pz);
    heli.pool.material.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.03;
  }
}
