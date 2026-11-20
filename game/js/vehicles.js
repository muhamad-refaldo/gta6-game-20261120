// Solara City 3D v3.4 — vehicles: cars, motorcycles, boats, traffic AI, police.
// Fresh rewrite for v3.4. Exports: makeCarMesh, spawnCar, updatePlayerCar,
// spawnTraffic, updateTraffic, spawnPolice, updatePolice, spawnParkedVehicles.
// Motorcycles and boats are enterable vehicles (F, same as cars) built on the
// same car object so player.js needs no change. Boats stay on the water and
// never drive onto land; police cars give up the chase while the player is
// on a boat (they cannot follow into the sea).
import * as THREE from 'three';
import { G, clamp, dist2, rand, randi, pick, nearestRoadPoint, roadX, roadZ, PITCH, NROADS, CITY_HALF, SEA_X } from './state.js';
import { RAMPS, groundY, SOLIDS, BIKE_SPAWNS, BOAT_SPAWN } from './city.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { addHeat } from './state.js';

// ---------- vehicle types ----------
// top = top speed, accel = acceleration. Body dims are realistic per type.
const TYPES = {
  sedan:  { top: 32, accel: 13, w: 1.9, l: 4.4, h: 1.35 },
  sports: { top: 38, accel: 18, w: 2.0, l: 4.3, h: 1.22 },
  suv:    { top: 30, accel: 14, w: 2.0, l: 4.6, h: 1.75 },
  pickup: { top: 28, accel: 12, w: 2.0, l: 4.9, h: 1.7 },
  van:    { top: 25, accel: 11, w: 2.1, l: 5.0, h: 2.05 },
  truck:  { top: 26, accel: 10, w: 2.2, l: 5.4, h: 2.2 },
  taxi:   { top: 33, accel: 14, w: 1.9, l: 4.4, h: 1.4 },
};
// motorcycles: faster accel + top speed, lower grip (slides more).
const BIKE_DIMS = { top: 42, accel: 22, w: 0.7, l: 2.1, h: 1.1 };
// boats: water-only, moderate speed.
const BOAT_DIMS = { top: 28, accel: 10, w: 2.2, l: 5.0, h: 1.2 };
const TYPE_NAMES = Object.keys(TYPES);
const CAR_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8c832, 0x2e8b6a, 0x8e44ad, 0xe8e8e8, 0x1a1a1a, 0xc97b2a, 0x4ecdc4, 0x7a7a7a];

// ---------- car mesh ----------
// children[0] is the body box (respray repaints it). Forward is +Z.
export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const type = police ? 'sedan' : 'sedan';
  const dims = TYPES[type];
  // body (children[0])
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf0f0f0 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h * 0.62, dims.l), bodyMat);
  body.position.y = dims.h * 0.55;
  body.castShadow = true;
  g.add(body);
  // cabin / windows
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.82, dims.h * 0.42, dims.l * 0.5), glassMat);
  cabin.position.set(0, dims.h * 1.02, -dims.l * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  // wheels (tires + rims)
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  const wheels = [];
  for (const [wx, wz] of [[-dims.w / 2, dims.l * 0.32], [dims.w / 2, dims.l * 0.32], [-dims.w / 2, -dims.l * 0.32], [dims.w / 2, -dims.l * 0.32]]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  // headlights / taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    hl.position.set(sx, dims.h * 0.55, dims.l / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
    tl.position.set(sx, dims.h * 0.55, -dims.l / 2 - 0.02);
    g.add(tl);
  }
  // bumpers, mirrors, handles, plate
  const bumperMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const bz of [dims.l / 2 + 0.05, -dims.l / 2 - 0.05]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.06, 0.28, 0.14), bumperMat);
    b.position.set(0, 0.35, bz);
    g.add(b);
  }
  for (const sx of [-dims.w / 2 - 0.08, dims.w / 2 + 0.08]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), bumperMat);
    mir.position.set(sx, dims.h * 0.95, dims.l * 0.18);
    g.add(mir);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.04), new THREE.MeshLambertMaterial({ color: 0xf0f0e8 }));
  plate.position.set(0, 0.4, dims.l / 2 + 0.12);
  g.add(plate);
  // police livery: black doors + light bar
  if (police) {
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.04, dims.h * 0.3, dims.l * 0.42), blackMat);
    door.position.set(0, dims.h * 0.5, 0);
    g.add(door);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), blackMat);
    barBase.position.set(0, dims.h * 1.28, 0);
    g.add(barBase);
    const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    redBar.position.set(-0.28, dims.h * 1.32, 0);
    g.add(redBar);
    const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2a6fff }));
    blueBar.position.set(0.28, dims.h * 1.32, 0);
    g.add(blueBar);
    g.userData.lightBar = { red: redBar, blue: blueBar };
  }
  g.userData.wheels = wheels;
  return g;
}

// Per-type body swap: rebuild the body box dims for the car's type while
// keeping children[0] as the body (respray target).
function applyTypeDims(car) {
  const dims = TYPES[car.type];
  const body = car.group.children[0];
  body.geometry.dispose();
  body.geometry = new THREE.BoxGeometry(dims.w, dims.h * 0.62, dims.l);
  body.position.y = dims.h * 0.55;
  const cabin = car.group.children[1];
  cabin.geometry.dispose();
  cabin.geometry = new THREE.BoxGeometry(dims.w * 0.82, dims.h * 0.42, dims.l * 0.5);
  cabin.position.set(0, dims.h * 1.02, -dims.l * 0.05);
}

// ---------- motorcycle mesh (v3.4) ----------
// children[0] is the frame body. Forward is +Z. A static rider figure sits
// on the bike so the player (hidden while riding, same as in a car) is
// represented on screen.
function makeBikeMesh(color) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  // frame / body (children[0])
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 1.6), bodyMat);
  frame.position.y = 0.62;
  frame.castShadow = true;
  g.add(frame);
  // fuel tank
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.62), bodyMat);
  tank.position.set(0, 0.88, 0.18);
  tank.castShadow = true;
  g.add(tank);
  // seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.72), darkMat);
  seat.position.set(0, 0.82, -0.42);
  g.add(seat);
  // wheels
  const wheels = [];
  for (const wz of [0.78, -0.78]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 14), new THREE.MeshLambertMaterial({ color: 0x141414 }));
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 10), chromeMat);
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);
    wheel.position.set(0, 0.35, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  // front fork + handlebar
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), chromeMat);
  fork.position.set(0, 0.75, 0.72);
  fork.rotation.x = 0.35;
  g.add(fork);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8), darkMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.02, 0.62);
  g.add(bar);
  // headlight / taillight
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  hl.position.set(0, 0.8, 1.02);
  g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tl.position.set(0, 0.78, -1.02);
  g.add(tl);
  // static rider figure (dark jacket, helmet)
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), jacketMat);
  torso.position.set(0, 1.18, -0.22);
  torso.rotation.x = 0.28;
  torso.castShadow = true;
  g.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshLambertMaterial({ color }));
  helmet.position.set(0, 1.62, -0.08);
  helmet.castShadow = true;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), new THREE.MeshLambertMaterial({ color: 0x18242e }));
  visor.position.set(0, 1.62, 0.14);
  g.add(visor);
  for (const sx of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.62), jacketMat);
    arm.position.set(sx, 1.28, 0.28);
    arm.rotation.x = -0.5;
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), darkMat);
    leg.position.set(sx, 0.72, -0.05);
    leg.rotation.x = 0.5;
    g.add(leg);
  }
  g.userData.wheels = wheels;
  return g;
}

// ---------- boat mesh (v3.4) ----------
// children[0] is the hull. Forward is +Z. White hull, coloured stripe.
function makeBoatMesh(color) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const accentMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  // hull (children[0])
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 5.0), hullMat);
  hull.position.y = 0.55;
  hull.castShadow = true;
  g.add(hull);
  // bow wedge (pointed front)
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.55, 1.1, 4), hullMat);
  bow.rotation.y = Math.PI / 4;
  bow.rotation.x = Math.PI / 2;
  bow.scale.set(1, 1, 0.6);
  bow.position.set(0, 0.55, 2.9);
  bow.castShadow = true;
  g.add(bow);
  // coloured stripe along the hull
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.22, 4.6), accentMat);
  stripe.position.set(0, 0.75, 0);
  g.add(stripe);
  // deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 4.4), new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
  deck.position.set(0, 1.05, -0.1);
  g.add(deck);
  // windshield + console
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }));
  shield.position.set(0, 1.45, 1.15);
  shield.rotation.x = -0.35;
  g.add(shield);
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), darkMat);
  consoleBox.position.set(0, 1.3, 0.85);
  g.add(consoleBox);
  // seats
  for (const sz of [-0.3, -1.1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.6), accentMat);
    seat.position.set(0, 1.25, sz);
    g.add(seat);
  }
  // outboard motor at the stern
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), darkMat);
  motor.position.set(0, 0.6, -2.65);
  motor.castShadow = true;
  g.add(motor);
  g.userData.wheels = [];
  return g;
}

// ---------- spawn ----------
export function spawnCar(x, z, yaw = 0, opts = {}) {
  const type = opts.type || 'sedan';
  const color = opts.color !== undefined ? opts.color : pick(CAR_COLORS);
  const police = !!opts.police;
  let group;
  let dims;
  if (type === 'motorcycle') {
    group = makeBikeMesh(color);
    dims = BIKE_DIMS;
  } else if (type === 'boat') {
    group = makeBoatMesh(color);
    dims = BOAT_DIMS;
  } else {
    group = makeCarMesh(color, police);
    dims = TYPES[type] || TYPES.sedan;
  }
  group.position.set(x, type === 'boat' ? 0.15 : groundY(x, z), z);
  group.rotation.y = yaw;
  G.scene.add(group);
  const car = {
    group, type, color, police,
    top: dims.top, accel: dims.accel,
    speed: 0, health: 100, yaw,
    ai: { axis: 'z', dir: 1, targetSpeed: rand(8, 14), turnCd: 0 },
    flee: false, driver: opts.driver || null,
    steer: 0, bustT: 0,
    vy: 0, airborne: false, airTime: 0, airHeight: 0,
  };
  if (opts.driver === 'flee') car.flee = true;
  if (type !== 'motorcycle' && type !== 'boat') applyTypeDims(car);
  G.cars.push(car);
  return car;
}

export function spawnTraffic(n = 14) {
  for (let k = 0; k < n; k++) {
    const vertical = Math.random() < 0.5;
    const ri = randi(0, NROADS - 1);
    const along = rand(-170, 180);
    const x = vertical ? roadX(ri) : along;
    const z = vertical ? along : roadZ(ri);
    const car = spawnCar(x, z, 0, { type: pick(TYPE_NAMES), color: pick(CAR_COLORS) });
    car.ai.axis = vertical ? 'z' : 'x';
    car.ai.dir = Math.random() < 0.5 ? 1 : -1;
    car.ai.targetSpeed = rand(9, 15);
    car.yaw = car.ai.axis === 'z' ? (car.ai.dir > 0 ? 0 : Math.PI) : (car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.group.rotation.y = car.yaw;
    G.traffic.push(car);
  }
}

// Parked motorcycles + the harbour boat (v3.4). Called once at boot from
// initSideSystems; parked vehicles are in G.cars but not G.traffic, so the
// traffic AI never moves them and the player can take them with F.
export function spawnParkedVehicles() {
  if (G._parkedSpawned) return;
  G._parkedSpawned = true;
  for (const b of BIKE_SPAWNS) {
    spawnCar(b.x, b.z, b.yaw, { type: 'motorcycle', color: pick([0xd43d2a, 0x2a6fd4, 0xe8c832]) });
  }
  spawnCar(BOAT_SPAWN.x, BOAT_SPAWN.z, BOAT_SPAWN.yaw, { type: 'boat', color: 0x2a6fd4 });
}

// ---------- solids (building push-out) ----------
function pushOutOfSolids(car, r = 1.6) {
  const p = car.group.position;
  for (const s of SOLIDS) {
    const dx = p.x - s.x, dz = p.z - s.z;
    const ox = s.hw + r - Math.abs(dx);
    const oz = s.hd + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) p.x += dx > 0 ? ox : -ox;
      else p.z += dz > 0 ? oz : -oz;
      car.speed *= 0.4;
    }
  }
  // roadblock barriers are solids too
  for (const rb of G.roadblocks) {
    const dx = p.x - rb.x, dz = p.z - rb.z;
    const ox = rb.hw + r - Math.abs(dx);
    const oz = rb.hd + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) p.x += dx > 0 ? ox : -ox;
      else p.z += dz > 0 ? oz : -oz;
      car.speed = 0;
    }
  }
}

// ---------- stunt jump (airtime) ----------
const JUMP_MIN_SPEED = 6;
const JUMP_GRAVITY = 22;
function checkRampLaunch(car, dt) {
  if (car.airborne) return;
  const p = car.group.position;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i];
    const dx = p.x - r.x, dz = p.z - r.z;
    // trigger box: 10 long (along launch dir) x 9 wide
    const along = dx * r.dx + dz * r.dz;
    const across = Math.abs(dx * -r.dz + dz * r.dx);
    if (Math.abs(along) < 5 && across < 4.5) {
      const align = fx * r.dx + fz * r.dz;
      if (Math.abs(car.speed) >= JUMP_MIN_SPEED && align > 0.5) {
        car.airborne = true;
        car.airTime = 0;
        car.airHeight = 0;
        car.vy = Math.min(14, 5 + Math.abs(car.speed) * 0.35);
        car.jumpRamp = i;
        return;
      }
    }
  }
}
function updateAirborne(car, dt) {
  if (!car.airborne) return;
  car.vy -= JUMP_GRAVITY * dt;
  car.airTime += dt;
  const p = car.group.position;
  p.y += car.vy * dt;
  if (p.y > car.airHeight) car.airHeight = p.y;
  // nose-up pitch while airborne, easing back as it falls
  const targetPitch = car.vy > 0 ? -0.14 : 0.05;
  car.group.rotation.x += (targetPitch - car.group.rotation.x) * Math.min(1, dt * 5);
  const gy = groundY(p.x, p.z);
  if (p.y <= gy) {
    p.y = gy;
    car.vy = 0;
    car.airborne = false;
    car.group.rotation.x = 0;
    // report the landing to the side systems (bonus + stats)
    G.stuntJump = { airTime: car.airTime, height: car.airHeight, ramp: car.jumpRamp };
    car.jumpRamp = undefined;
  }
}

// ---------- player car ----------
export function updatePlayerCar(dt) {
  const p = G.player;
  if (!p || p.onFoot || !p.car) return;
  const car = p.car;
  if (car.type === 'boat') { updatePlayerBoat(car, dt); return; }
  if (car.type === 'motorcycle') { updatePlayerBike(car, dt); return; }
  const ax = input.axis();
  const handbrake = !!input.keys.Space;

  // --- steering ---
  const steerTarget = -ax.s * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const spdF = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.yaw += car.steer * spdF * dt * (car.speed >= 0 ? 1 : -1) * 2.2;

  // --- throttle / brake / drag ---
  if (G.autoDrive) {
    car.speed = Math.min(car.speed + car.accel * dt * 0.8, car.top * 0.6);
    // auto-steer toward the nearest road centreline
    const np = nearestRoadPoint(car.group.position.x, car.group.position.z);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const toRoadX = np.x - car.group.position.x;
    const toRoadZ = np.z - car.group.position.z;
    const cross = fx * toRoadZ - fz * toRoadX;
    car.yaw += clamp(cross * 0.02, -0.03, 0.03);
  } else if (ax.f > 0) {
    car.speed = Math.min(car.speed + car.accel * dt, car.top);
  } else if (ax.f < 0) {
    car.speed = Math.max(car.speed - car.accel * 1.4 * dt, -car.top * 0.45);
  } else {
    car.speed -= car.speed * Math.min(1, dt * 0.9);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= car.speed * Math.min(1, dt * 4);
    car.yaw += car.steer * spdF * dt * 1.6;
  }

  // --- stunt ramp launch ---
  checkRampLaunch(car, dt);

  // --- move ---
  const gp = car.group.position;
  gp.x += Math.sin(car.yaw) * car.speed * dt;
  gp.z += Math.cos(car.yaw) * car.speed * dt;
  // keep inside the world
  gp.x = clamp(gp.x, -190, 395);
  gp.z = clamp(gp.z, -190, 255);
  pushOutOfSolids(car);

  // --- airborne physics / ground height ---
  if (car.airborne) {
    updateAirborne(car, dt);
  } else {
    gp.y = groundY(gp.x, gp.z);
    // pitch up the ramp slope while crossing it
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let pitch = 0;
    for (const r of RAMPS) {
      const dx = gp.x - r.x, dz = gp.z - r.z;
      const along = dx * r.dx + dz * r.dz;
      const across = Math.abs(dx * -r.dz + dz * r.dx);
      if (Math.abs(along) < 5 && across < 4.5 && (fx * r.dx + fz * r.dz) > 0.5) {
        pitch = -0.17 * (1 - Math.abs(along) / 5);
        break;
      }
    }
    car.group.rotation.x += (pitch - car.group.rotation.x) * Math.min(1, dt * 8);
  }

  car.group.rotation.y = car.yaw;
  // wheels spin
  const wheels = car.group.userData.wheels || [];
  for (const w of wheels) w.rotation.x += car.speed * dt * 1.4;
  // engine sound
  audio.setEngine(clamp(Math.abs(car.speed) / car.top, 0, 1), true);
}

// ---------- player motorcycle (v3.4) ----------
// Faster accel + top speed than any car, but low grip: it coasts/slides
// longer, turns sharper and leans into corners. Road vehicle: same world
// clamp, building push-out and stunt ramps as a car.
function updatePlayerBike(car, dt) {
  const ax = input.axis();
  const handbrake = !!input.keys.Space;
  const steerTarget = -ax.s * 0.6;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 10);
  const spdF = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.yaw += car.steer * spdF * dt * (car.speed >= 0 ? 1 : -1) * 2.6;

  if (G.autoDrive) {
    car.speed = Math.min(car.speed + car.accel * dt * 0.8, car.top * 0.6);
    const np = nearestRoadPoint(car.group.position.x, car.group.position.z);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const toRoadX = np.x - car.group.position.x;
    const toRoadZ = np.z - car.group.position.z;
    const cross = fx * toRoadZ - fz * toRoadX;
    car.yaw += clamp(cross * 0.02, -0.03, 0.03);
  } else if (ax.f > 0) {
    car.speed = Math.min(car.speed + car.accel * dt, car.top);
  } else if (ax.f < 0) {
    car.speed = Math.max(car.speed - car.accel * 1.4 * dt, -car.top * 0.45);
  } else {
    // low grip: the bike coasts / slides longer than a car
    car.speed -= car.speed * Math.min(1, dt * 0.5);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= car.speed * Math.min(1, dt * 3);
    car.yaw += car.steer * spdF * dt * 1.8;
  }

  checkRampLaunch(car, dt);
  const gp = car.group.position;
  gp.x += Math.sin(car.yaw) * car.speed * dt;
  gp.z += Math.cos(car.yaw) * car.speed * dt;
  gp.x = clamp(gp.x, -190, 395);
  gp.z = clamp(gp.z, -190, 255);
  pushOutOfSolids(car, 0.7);

  if (car.airborne) {
    updateAirborne(car, dt);
  } else {
    gp.y = groundY(gp.x, gp.z);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let pitch = 0;
    for (const r of RAMPS) {
      const dx = gp.x - r.x, dz = gp.z - r.z;
      const along = dx * r.dx + dz * r.dz;
      const across = Math.abs(dx * -r.dz + dz * r.dx);
      if (Math.abs(along) < 5 && across < 4.5 && (fx * r.dx + fz * r.dz) > 0.5) {
        pitch = -0.17 * (1 - Math.abs(along) / 5);
        break;
      }
    }
    car.group.rotation.x += (pitch - car.group.rotation.x) * Math.min(1, dt * 8);
  }

  car.group.rotation.y = car.yaw;
  // lean into turns
  car.group.rotation.z += ((-car.steer * 0.4) - car.group.rotation.z) * Math.min(1, dt * 8);
  const wheels = car.group.userData.wheels || [];
  for (const w of wheels) w.rotation.x += car.speed * dt * 1.4;
  audio.setEngine(clamp(Math.abs(car.speed) / car.top, 0, 1), true);
}

// ---------- player boat (v3.4) ----------
// Water-only: steers + throttles on the sea (y = water level), never onto
// land. Clamped to the sea east of the shore, kept out of Isla Verde and
// clear of the bridge corridor.
function updatePlayerBoat(car, dt) {
  const ax = input.axis();
  const steerTarget = -ax.s * 0.45;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 6);
  const spdF = clamp(Math.abs(car.speed) / 10, 0, 1);
  car.yaw += car.steer * spdF * dt * (car.speed >= 0 ? 1 : -1) * 1.2;

  if (ax.f > 0) {
    car.speed = Math.min(car.speed + car.accel * dt, car.top);
  } else if (ax.f < 0) {
    car.speed = Math.max(car.speed - car.accel * 1.4 * dt, -car.top * 0.4);
  } else {
    car.speed -= car.speed * Math.min(1, dt * 1.2);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }

  const gp = car.group.position;
  gp.x += Math.sin(car.yaw) * car.speed * dt;
  gp.z += Math.cos(car.yaw) * car.speed * dt;
  // stay in the water: east of the shore (SEA_X), inside the world
  gp.x = clamp(gp.x, SEA_X + 3, 390);
  gp.z = clamp(gp.z, -185, 250);
  // push out of Isla Verde (circle at 300,0, r=70)
  const dxI = gp.x - 300, dzI = gp.z;
  const dI = Math.hypot(dxI, dzI);
  if (dI < 78 && dI > 0.01) {
    const push = 78 - dI;
    gp.x += (dxI / dI) * push;
    gp.z += (dzI / dI) * push;
    car.speed *= 0.5;
  }
  // keep clear of the bridge corridor (|z|<14, x 180-285)
  if (gp.x > 180 && gp.x < 285 && Math.abs(gp.z) < 14) {
    gp.z = gp.z >= 0 ? 14 : -14;
    car.speed *= 0.5;
  }
  // float on the water with a gentle bob + roll into turns
  gp.y = 0.15 + Math.sin((G.time ? G.time.day : 0) * 1.6) * 0.06;
  car.group.rotation.y = car.yaw;
  car.group.rotation.z += ((-car.steer * 0.08) - car.group.rotation.z) * Math.min(1, dt * 5);
  audio.setEngine(clamp(Math.abs(car.speed) / car.top, 0, 1), true);
}

// ---------- traffic ----------
export function updateTraffic(dt) {
  const px = G.player ? G.player.pos.x : 0;
  const pz = G.player ? G.player.pos.z : 0;
  for (let i = G.traffic.length - 1; i >= 0; i--) {
    const c = G.traffic[i];
    const p = c.group.position;
    c.ai.turnCd -= dt;
    // respawn far-away cars near the player so the streets stay alive
    if (dist2(p.x, p.z, px, pz) > 320) {
      const vertical = Math.random() < 0.5;
      const ri = randi(0, NROADS - 1);
      const along = rand(-150, 160);
      const nx = vertical ? roadX(ri) : px + rand(-80, 80);
      const nz = vertical ? pz + rand(-80, 80) : roadZ(ri);
      p.set(clamp(nx, -180, 180), groundY(nx, nz), clamp(nz, -180, 195));
      c.ai.axis = vertical ? 'z' : 'x';
      c.ai.dir = Math.random() < 0.5 ? 1 : -1;
      c.speed = 0;
      continue;
    }
    // target speed: obey the traffic light ahead + the car ahead
    let target = c.ai.targetSpeed;
    const ahead = 14;
    const ax = c.ai.axis === 'z' ? 0 : c.ai.dir;
    const az = c.ai.axis === 'z' ? c.ai.dir : 0;
    const ix = p.x + ax * ahead, iz = p.z + az * ahead;
    const light = G.city ? G.city.lightStateAt(ix, iz, c.ai.axis) : 'green';
    const nearIntersection = Math.abs(ix - Math.round((ix + CITY_HALF) / PITCH) * PITCH + CITY_HALF) < 8 &&
      Math.abs(iz - Math.round((iz + CITY_HALF) / PITCH) * PITCH + CITY_HALF) < 8;
    if ((light === 'red' || light === 'amber') && nearIntersection) target = 0;
    // car ahead?
    for (const o of G.cars) {
      if (o === c) continue;
      const ox = o.group.position.x - p.x, oz = o.group.position.z - p.z;
      const alongO = ox * ax + oz * az;
      const acrossO = Math.abs(ox * -az + oz * ax);
      if (alongO > 0 && alongO < 10 && acrossO < 3) { target = 0; break; }
      if (alongO > 0 && alongO < 18 && acrossO < 3) target = Math.min(target, 5);
    }
    // accelerate / brake toward target
    if (c.speed < target) c.speed = Math.min(c.speed + c.accel * dt, target);
    else c.speed = Math.max(c.speed - c.accel * 1.6 * dt, target);
    // move along the road centreline
    p.x += Math.sin(c.yaw) * c.speed * dt;
    p.z += Math.cos(c.yaw) * c.speed * dt;
    p.y = groundY(p.x, p.z);
    // turn at intersections (random, with cooldown)
    const ci = Math.round((p.x + CITY_HALF) / PITCH);
    const cj = Math.round((p.z + CITY_HALF) / PITCH);
    const atCentre = Math.abs(p.x - roadX(ci)) < 1.5 && Math.abs(p.z - roadZ(cj)) < 1.5;
    if (atCentre && c.ai.turnCd <= 0 && Math.random() < 0.35) {
      c.ai.turnCd = 4;
      if (c.ai.axis === 'z') {
        c.ai.axis = 'x';
        c.ai.dir = Math.random() < 0.5 ? 1 : -1;
      } else {
        c.ai.axis = 'z';
        c.ai.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
    c.yaw = c.ai.axis === 'z' ? (c.ai.dir > 0 ? 0 : Math.PI) : (c.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    c.group.rotation.y = c.yaw;
    const wheels = c.group.userData.wheels || [];
    for (const w of wheels) w.rotation.x += c.speed * dt * 1.4;
  }
}

// ---------- police + helicopter + roadblocks ----------
let heli = null;
let heliAngle = 0;
let heliGroup = null;

function makeHeli() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.6), new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }));
  glass.position.set(0, 0.3, 2.4);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5), bodyMat);
  tail.position.set(0, 0.2, -5);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 1.2), bodyMat);
  fin.position.set(0, 0.8, -7.2);
  g.add(fin);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.2;
  g.add(rotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const s of [-1.2, 1.2]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4.5), skidMat);
    skid.position.set(s, -1.1, 0);
    g.add(skid);
  }
  // searchlight cone
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3, 12, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  cone.position.y = -6.5;
  cone.rotation.x = Math.PI;
  g.add(cone);
  g.userData.rotor = rotor;
  return g;
}

export function spawnPolice(n = 1) {
  const p = G.player;
  for (let k = 0; k < n; k++) {
    const a = rand(0, Math.PI * 2);
    const x = clamp((p ? p.pos.x : 0) + Math.cos(a) * rand(45, 70), -180, 180);
    const z = clamp((p ? p.pos.z : 0) + Math.sin(a) * rand(45, 70), -180, 195);
    const car = spawnCar(x, z, 0, { type: 'sedan', police: true });
    car.top = 40;
    car.accel = 20;
    G.police.push(car);
  }
}

function spawnRoadblocks() {
  const p = G.player;
  if (!p) return;
  const np = nearestRoadPoint(p.pos.x, p.pos.z);
  const axis = np.axis;
  // place the block ~38 units ahead along the player's facing
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let bx = p.pos.x + fx * 38, bz = p.pos.z + fz * 38;
  if (axis === 'z') { bx = np.x; bz = clamp(bz, -175, 190); }
  else { bz = np.z; bx = clamp(bx, -175, 190); }
  const g = new THREE.Group();
  const stripe = canvasStripe();
  for (const off of [-3, 3]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? 6 : 1, 1.1, axis === 'z' ? 1 : 6), new THREE.MeshLambertMaterial({ map: stripe }));
    bar.position.set(axis === 'z' ? off : 0, 0.8, axis === 'z' ? 0 : off);
    bar.castShadow = true;
    g.add(bar);
    for (const leg of [-2.4, 2.4]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      l.position.set(axis === 'z' ? off + leg : leg, 0.4, axis === 'z' ? 0 : off + leg);
      g.add(l);
    }
  }
  g.position.set(bx, 0, bz);
  G.scene.add(g);
  G.roadblocks.push({ x: bx, z: bz, hw: axis === 'z' ? 6.5 : 1.2, hd: axis === 'z' ? 1.2 : 6.5, group: g });
}
let stripeTex = null;
function canvasStripe() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#d43d2a';
  for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 16, 32);
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  return stripeTex;
}
function clearRoadblocks() {
  for (const rb of G.roadblocks) G.scene.remove(rb.group);
  G.roadblocks = [];
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  const wanted = G.wanted;
  // Police cars cannot follow into the sea: while the player is on a boat
  // they give up (the helicopter still tracks them from above).
  const playerOnBoat = !!(p.car && p.car.type === 'boat');

  // keep the right number of pursuit cars
  const desired = (wanted && !playerOnBoat) ? wanted : 0;
  if (G.police.length < desired) spawnPolice(desired - G.police.length);
  // give up when the heat is gone (or the player escaped onto the water)
  if (wanted === 0 || playerOnBoat) {
    for (let i = G.police.length - 1; i >= 0; i--) {
      const c = G.police[i];
      c.giveUp = (c.giveUp || 0) + dt;
      if (c.giveUp > 5) {
        G.scene.remove(c.group);
        const ci = G.cars.indexOf(c);
        if (ci >= 0) G.cars.splice(ci, 1);
        G.police.splice(i, 1);
      }
    }
  } else {
    for (const c of G.police) c.giveUp = 0;
  }

  // chase / ram / bust
  for (const c of G.police) {
    const cp = c.group.position;
    const dx = p.pos.x - cp.x, dz = p.pos.z - cp.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx, dz);
    let dy = targetYaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += clamp(dy, -1.6 * dt, 1.6 * dt);
    const targetSpeed = Math.min(c.top, 14 + wanted * 4);
    if (d > 6) c.speed = Math.min(c.speed + c.accel * dt, targetSpeed);
    else c.speed = Math.max(c.speed - c.accel * dt, 4);
    cp.x += Math.sin(c.yaw) * c.speed * dt;
    cp.z += Math.cos(c.yaw) * c.speed * dt;
    cp.y = groundY(cp.x, cp.z);
    c.group.rotation.y = c.yaw;
    // ram: push the player's car and shake it
    if (d < 4.5 && p.car) {
      p.car.group.position.x += (dx / d) * 3 * dt;
      p.car.group.position.z += (dz / d) * 3 * dt;
      p.car.speed *= (1 - Math.min(1, dt * 2));
      c.speed *= 0.6;
    }
    // bust: a cop sitting on a slow/stopped player arrests them
    const playerSlow = !p.car || Math.abs(p.car.speed) < 3;
    if (d < 5 && playerSlow) {
      c.bustT += dt;
      if (c.bustT > 3) { G.busted = true; c.bustT = 0; }
    } else {
      c.bustT = Math.max(0, c.bustT - dt);
    }
    // flashing light bar
    const bar = c.group.userData.lightBar;
    if (bar) {
      const on = Math.floor(performance.now() / 300) % 2 === 0;
      bar.red.material.color.setHex(on ? 0xff2a2a : 0x550000);
      bar.blue.material.color.setHex(on ? 0x2a6fff : 0x000055);
    }
    pushOutOfSolids(c);
  }

  // helicopter at 3+ stars: orbits the player at height 7.5, radius 18
  if (wanted >= 3) {
    if (!heliGroup) {
      heliGroup = makeHeli();
      G.scene.add(heliGroup);
      heli = { group: heliGroup };
      G.heli = heli;
    }
    heliAngle += dt * 0.55;
    const hx = p.pos.x + Math.cos(heliAngle) * 18;
    const hz = p.pos.z + Math.sin(heliAngle) * 18;
    heliGroup.position.set(hx, p.pos.y + 7.5, hz);
    heliGroup.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
    heliGroup.userData.rotor.rotation.y += dt * 22;
  } else if (heliGroup) {
    G.scene.remove(heliGroup);
    heliGroup = null;
    heli = null;
    G.heli = null;
  }

  // roadblocks at 4+ stars
  if (wanted >= 4 && G.roadblocks.length === 0) spawnRoadblocks();
  if (wanted < 4 && G.roadblocks.length > 0) clearRoadblocks();
}
