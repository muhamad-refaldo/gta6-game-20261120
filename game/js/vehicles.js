// Solara City 3D v3.1 — vehicles: detailed low-poly cars (7 bodies), traffic AI that
// obeys traffic lights, player driving, police chase/ram/bust, police helicopter with
// searchlight, and roadblocks. Fresh rewrite for v3.1.
// A car's forward is its local +z (rotation.y = yaw, forward = (sin yaw, cos yaw)).
// children[0] of every car group is ALWAYS the body box — the garage respray
// replaces children[0].material, so nothing may be inserted before it.
import * as THREE from 'three';
import { G, BLOCK, ROAD, PITCH, NROADS, CITY_HALF, roadX, roadZ, nearestRoadPoint, rand, randi, pick, clamp, lerp, dist2 } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { lightStateAt } from './city.js';

const TYPES = {
  sedan:  { top: 30, len: 4.3, w: 1.9,  bodyH: 0.62, cabH: 0.55, wheelR: 0.36 },
  sports: { top: 38, len: 4.6, w: 2.0,  bodyH: 0.5,  cabH: 0.45, wheelR: 0.34 },
  suv:    { top: 29, len: 4.5, w: 2.0,  bodyH: 0.85, cabH: 0.6,  wheelR: 0.4 },
  pickup: { top: 28, len: 4.8, w: 1.95, bodyH: 0.65, cabH: 0.6,  wheelR: 0.38 },
  van:    { top: 25, len: 4.9, w: 2.05, bodyH: 1.05, cabH: 0,    wheelR: 0.38 },
  taxi:   { top: 30, len: 4.3, w: 1.9,  bodyH: 0.62, cabH: 0.55, wheelR: 0.36 },
  police: { top: 34, len: 4.4, w: 1.95, bodyH: 0.62, cabH: 0.55, wheelR: 0.36 },
};
const TRAFFIC_COLORS = [0x3a6fd4, 0xd4d4d4, 0x222831, 0x7a4fd4, 0x4fd4c2, 0xc2c2c2, 0x8a5a3b, 0x3aa655];

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }
function basic(color) { return new THREE.MeshBasicMaterial({ color }); }

// ---------- car mesh builder ----------
export function makeCarMesh(color, police) {
  return buildCarMesh('sedan', color, police);
}

function buildCarMesh(type, color, police) {
  const t = TYPES[type] || TYPES.sedan;
  const g = new THREE.Group();
  const bodyMat = lam(police ? 0x14161c : color);
  const glassMat = lam(0x16202c);
  const darkMat = lam(0x1c1e24);
  const bodyY = t.wheelR + t.bodyH / 2 - 0.08;
  const L = t.len, W = t.w;

  // children[0] — the body box (respray target). Everything else is added after it.
  const body = mesh(new THREE.BoxGeometry(W, t.bodyH, L), bodyMat, 0, bodyY, 0);
  g.add(body);

  // cabin / glasshouse (vans are one tall box, so they get side windows instead)
  if (type === 'van') {
    const win = mesh(new THREE.BoxGeometry(W + 0.04, 0.42, L * 0.62), glassMat, 0, bodyY + t.bodyH / 2 + 0.18, -L * 0.05);
    g.add(win);
    const stripe = mesh(new THREE.BoxGeometry(W + 0.06, 0.1, L * 0.62), lam(0xdddddd), 0, bodyY + t.bodyH / 2 - 0.08, -L * 0.05);
    g.add(stripe);
  } else if (type === 'pickup') {
    // cab at the front, open bed at the rear
    const cab = mesh(new THREE.BoxGeometry(W - 0.15, t.cabH, L * 0.42), glassMat, 0, bodyY + t.bodyH / 2 + t.cabH / 2 - 0.05, L * 0.2);
    g.add(cab);
    const bedFloor = mesh(new THREE.BoxGeometry(W - 0.1, 0.08, L * 0.42), darkMat, 0, bodyY + t.bodyH / 2 - 0.02, -L * 0.26);
    const bedL = mesh(new THREE.BoxGeometry(0.08, 0.42, L * 0.42), bodyMat, -(W / 2 - 0.04), bodyY + t.bodyH / 2 + 0.18, -L * 0.26);
    const bedR = mesh(new THREE.BoxGeometry(0.08, 0.42, L * 0.42), bodyMat, W / 2 - 0.04, bodyY + t.bodyH / 2 + 0.18, -L * 0.26);
    const tail = mesh(new THREE.BoxGeometry(W - 0.1, 0.42, 0.08), bodyMat, 0, bodyY + t.bodyH / 2 + 0.18, -L / 2 + 0.04);
    g.add(bedFloor, bedL, bedR, tail);
  } else {
    const cab = mesh(new THREE.BoxGeometry(W - 0.3, t.cabH, L * 0.48), glassMat, 0, bodyY + t.bodyH / 2 + t.cabH / 2 - 0.04, -L * 0.06);
    g.add(cab);
    const roof = mesh(new THREE.BoxGeometry(W - 0.34, 0.08, L * 0.4), bodyMat, 0, bodyY + t.bodyH / 2 + t.cabH - 0.02, -L * 0.06);
    g.add(roof);
  }

  // hood panel + front/rear fascia
  const hood = mesh(new THREE.BoxGeometry(W - 0.16, 0.1, L * 0.26), bodyMat, 0, bodyY + t.bodyH / 2 - 0.02, L * 0.34);
  const grille = mesh(new THREE.BoxGeometry(W * 0.52, 0.18, 0.06), darkMat, 0, bodyY - 0.02, L / 2 + 0.01);
  const bumperF = mesh(new THREE.BoxGeometry(W, 0.16, 0.2), darkMat, 0, 0.32, L / 2 + 0.02);
  const bumperR = mesh(new THREE.BoxGeometry(W, 0.16, 0.2), darkMat, 0, 0.32, -L / 2 - 0.02);
  g.add(hood, grille, bumperF, bumperR);

  // headlights (warm white, always bright) + taillights (red)
  const hl = basic(0xfff6c8), tl = basic(0xd21f26);
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.06), hl, -(W / 2 - 0.38), bodyY + 0.06, L / 2 + 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.06), hl, W / 2 - 0.38, bodyY + 0.06, L / 2 + 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.12, 0.06), tl, -(W / 2 - 0.38), bodyY + 0.06, -L / 2 - 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.12, 0.06), tl, W / 2 - 0.38, bodyY + 0.06, -L / 2 - 0.02));

  // wheels: tyre + hub, front pair on steering pivots
  const wheelPos = [
    [-(W / 2 - 0.02), L / 2 - 0.85, true], [W / 2 - 0.02, L / 2 - 0.85, true],
    [-(W / 2 - 0.02), -L / 2 + 0.85, false], [W / 2 - 0.02, -L / 2 + 0.85, false],
  ];
  const wheels = {};
  for (const [wx, wz, front] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, t.wheelR, wz);
    const tyre = mesh(new THREE.CylinderGeometry(t.wheelR, t.wheelR, 0.26, 14), lam(0x14161a));
    tyre.rotation.z = Math.PI / 2;
    const hub = mesh(new THREE.CylinderGeometry(t.wheelR * 0.55, t.wheelR * 0.55, 0.3, 10), lam(0x9aa2ad));
    hub.rotation.z = Math.PI / 2;
    pivot.add(tyre, hub);
    g.add(pivot);
    if (front) { if (wx < 0) wheels.fl = pivot; else wheels.fr = pivot; }
  }

  // ---- per-type extras ----
  let lightL = null, lightR = null;
  if (type === 'sports') {
    const spoiler = mesh(new THREE.BoxGeometry(W - 0.2, 0.07, 0.4), darkMat, 0, bodyY + t.bodyH / 2 + 0.42, -L / 2 + 0.25);
    const supL = mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), darkMat, -(W / 2 - 0.5), bodyY + t.bodyH / 2 + 0.2, -L / 2 + 0.25);
    const supR = mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), darkMat, W / 2 - 0.5, bodyY + t.bodyH / 2 + 0.2, -L / 2 + 0.25);
    const skirtL = mesh(new THREE.BoxGeometry(0.08, 0.14, L * 0.7), darkMat, -(W / 2 + 0.01), 0.3, 0);
    const skirtR = mesh(new THREE.BoxGeometry(0.08, 0.14, L * 0.7), darkMat, W / 2 + 0.01, 0.3, 0);
    g.add(spoiler, supL, supR, skirtL, skirtR);
  } else if (type === 'suv') {
    const railL = mesh(new THREE.BoxGeometry(0.08, 0.08, L * 0.42), darkMat, -(W / 2 - 0.35), bodyY + t.bodyH / 2 + t.cabH + 0.02, -L * 0.06);
    const railR = mesh(new THREE.BoxGeometry(0.08, 0.08, L * 0.42), darkMat, W / 2 - 0.35, bodyY + t.bodyH / 2 + t.cabH + 0.02, -L * 0.06);
    g.add(railL, railR);
  } else if (type === 'taxi') {
    const sign = mesh(new THREE.BoxGeometry(0.72, 0.2, 0.32), basic(0xffe45c), 0, bodyY + t.bodyH / 2 + t.cabH + 0.08, -L * 0.06);
    const signTop = mesh(new THREE.BoxGeometry(0.74, 0.05, 0.34), lam(0x1a1a1a), 0, bodyY + t.bodyH / 2 + t.cabH + 0.19, -L * 0.06);
    g.add(sign, signTop);
  }
  if (police) {
    // white doors on the black body + roof light bar + push bar
    const doorL = mesh(new THREE.BoxGeometry(0.04, 0.5, 1.7), lam(0xf2f2f2), -(W / 2 + 0.01), bodyY + 0.05, 0.1);
    const doorR = mesh(new THREE.BoxGeometry(0.04, 0.5, 1.7), lam(0xf2f2f2), W / 2 + 0.01, bodyY + 0.05, 0.1);
    const barBase = mesh(new THREE.BoxGeometry(0.95, 0.1, 0.32), darkMat, 0, bodyY + t.bodyH / 2 + t.cabH + 0.05, -L * 0.06);
    lightL = mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), basic(0xff2222), -0.26, bodyY + t.bodyH / 2 + t.cabH + 0.18, -L * 0.06);
    lightR = mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), basic(0x2266ff), 0.26, bodyY + t.bodyH / 2 + t.cabH + 0.18, -L * 0.06);
    const pushL = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), darkMat, -(W / 2 - 0.4), 0.45, L / 2 + 0.14);
    const pushR = mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), darkMat, W / 2 - 0.4, 0.45, L / 2 + 0.14);
    g.add(doorL, doorR, barBase, lightL, lightR, pushL, pushR);
  }
  return { group: g, wheelFL: wheels.fl, wheelFR: wheels.fr, lightL, lightR };
}

// ---------- spawning ----------
export function spawnCar(x, z, yaw = 0, opts = {}) {
  const type = opts.type || 'sedan';
  const color = opts.color !== undefined ? opts.color : pick(TRAFFIC_COLORS);
  const police = !!opts.police || type === 'police';
  const built = buildCarMesh(type, color, police);
  const t = TYPES[type] || TYPES.sedan;
  built.group.position.set(x, 0, z);
  built.group.rotation.y = yaw;
  G.scene.add(built.group);
  const car = {
    group: built.group, type, color, police,
    yaw, speed: 0, top: t.top, health: 100,
    ai: null, flee: false, driver: opts.driver || null, owned: false,
    wheelFL: built.wheelFL, wheelFR: built.wheelFR,
    lightL: built.lightL, lightR: built.lightR,
    axis: 'z', dir: 1, targetSpeed: 0, turnCooldown: 0,
  };
  G.cars.push(car);
  return car;
}

function randomRoadPoint(minPlayerDist = 30) {
  for (let tries = 0; tries < 20; tries++) {
    const i = randi(0, NROADS - 1), j = randi(0, NROADS - 1);
    const x = roadX(i), z = roadZ(j);
    if (G.player && dist2(x, z, G.player.pos.x, G.player.pos.z) < minPlayerDist) continue;
    return { x, z };
  }
  return { x: roadX(0), z: roadZ(0) };
}

export function spawnTraffic(n = 14) {
  const types = ['sedan', 'sedan', 'suv', 'van', 'pickup', 'taxi', 'sedan'];
  for (let k = 0; k < n; k++) {
    const p = randomRoadPoint(30);
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const dir = Math.random() < 0.5 ? 1 : -1;
    const type = pick(types);
    const color = type === 'taxi' ? 0xe8c832 : pick(TRAFFIC_COLORS);
    const car = spawnCar(p.x, p.z, 0, { type, color });
    car.axis = axis; car.dir = dir;
    car.yaw = axis === 'z' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    car.group.rotation.y = car.yaw;
    car.targetSpeed = rand(7, 13);
    car.speed = car.targetSpeed;
    // right-hand lane offset
    const off = 2.2;
    if (axis === 'z') car.group.position.x += dir === 1 ? -off : off;
    else car.group.position.z += dir === 1 ? off : -off;
    G.traffic.push(car);
  }
}

// ---------- traffic AI ----------
function nextIntersectionAhead(car) {
  const p = car.group.position;
  if (car.axis === 'z') {
    for (let j = 0; j < NROADS; j++) {
      const cz = roadZ(j);
      const d = (cz - p.z) * car.dir;
      if (d > 0 && d < 60) return { at: cz, dist: d, coord: cz };
    }
  } else {
    for (let i = 0; i < NROADS; i++) {
      const cx = roadX(i);
      const d = (cx - p.x) * car.dir;
      if (d > 0 && d < 60) return { at: cx, dist: d, coord: cx };
    }
  }
  return null;
}

export function updateTraffic(dt) {
  for (const car of [...G.traffic]) {
    if (!G.cars.includes(car)) continue; // shot cars are removed from G.cars
    const p = car.group.position;
    let want = car.targetSpeed;
    // obey the traffic light at the next intersection
    const nx = nextIntersectionAhead(car);
    if (nx) {
      const light = lightStateAt(p.x, p.z, car.axis);
      const stopDist = nx.dist - 7; // stop line 7 units before the centreline
      if ((light === 'red' || light === 'amber') && stopDist > 0 && stopDist < 16) {
        want = 0;
        if (stopDist < 0.6) {
          // hold exactly at the line
          car.speed = 0;
          if (car.axis === 'z') p.z = nx.at - car.dir * 7;
          else p.x = nx.at - car.dir * 7;
        }
      }
    }
    // don't rear-end the player's car
    if (G.player && G.player.car) {
      const pc = G.player.car.group.position;
      const d = dist2(p.x, p.z, pc.x, pc.z);
      if (d < 9) {
        const ahead = car.axis === 'z'
          ? (pc.z - p.z) * car.dir > 0 && Math.abs(pc.x - p.x) < 4
          : (pc.x - p.x) * car.dir > 0 && Math.abs(pc.z - p.z) < 4;
        if (ahead) want = Math.min(want, G.player.car.speed * 0.9);
      }
    }
    car.speed = lerp(car.speed, want, Math.min(1, dt * (want < car.speed ? 3.5 : 1.2)));
    if (car.speed > 0.05) {
      const step = car.speed * dt;
      if (car.axis === 'z') p.z += car.dir * step;
      else p.x += car.dir * step;
      // turn at intersections sometimes (keeps traffic circulating)
      car.turnCooldown -= dt;
      if (car.turnCooldown <= 0) {
        const cross = car.axis === 'z'
          ? Math.abs(p.x - roadX(Math.round((p.x + CITY_HALF) / PITCH))) < 2.5
          : Math.abs(p.z - roadZ(Math.round((p.z + CITY_HALF) / PITCH))) < 2.5;
        const along = car.axis === 'z'
          ? Math.abs(p.z - roadZ(Math.round((p.z + CITY_HALF) / PITCH))) < 2.5
          : Math.abs(p.x - roadX(Math.round((p.x + CITY_HALF) / PITCH))) < 2.5;
        if (cross && along && Math.random() < 0.3) {
          const newAxis = car.axis === 'z' ? 'x' : 'z';
          const newDir = Math.random() < 0.5 ? 1 : -1;
          if (newAxis === 'z') { p.x = roadX(Math.round((p.x + CITY_HALF) / PITCH)); car.yaw = newDir === 1 ? 0 : Math.PI; }
          else { p.z = roadZ(Math.round((p.z + CITY_HALF) / PITCH)); car.yaw = newDir === 1 ? Math.PI / 2 : -Math.PI / 2; }
          car.axis = newAxis; car.dir = newDir;
          car.group.rotation.y = car.yaw;
          car.turnCooldown = 3;
        }
      }
    }
    // wrap around at the city edge instead of driving into the sea
    if (car.axis === 'z' && (p.z > 195 || p.z < -195)) {
      p.z = car.dir === 1 ? -190 : 190;
    } else if (car.axis === 'x' && (p.x > 195 || p.x < -195)) {
      p.x = car.dir === 1 ? -190 : 190;
    }
    p.y = 0;
  }
}

// ---------- player driving ----------
let headSpot = null, headTarget = null;
function ensureHeadlight() {
  if (headSpot) return;
  headSpot = new THREE.SpotLight(0xfff2c8, 0, 60, 0.42, 0.55, 1.1);
  headTarget = new THREE.Object3D();
  G.scene.add(headSpot);
  G.scene.add(headTarget);
  headSpot.target = headTarget;
}

export function updatePlayerCar(dt) {
  const p = G.player;
  const car = p ? p.car : null;
  ensureHeadlight();
  if (!car) { if (headSpot) headSpot.intensity = 0; audio.setEngine(0, false); return; }
  const gp = car.group.position;
  // auto-drive (staging scenes) until the player touches the wheel
  if (G.autoDrive) {
    if (input.axis().f !== 0 || input.axis().s !== 0 || input.keys.KeyW || input.keys.KeyA || input.keys.KeyS || input.keys.KeyD) {
      G.autoDrive = false;
    } else {
      car.speed = lerp(car.speed, 16, Math.min(1, dt * 1.5));
      // stay on the road: snap toward the nearest centreline
      const snap = nearestRoadPoint(gp.x, gp.z);
      if (snap.axis === 'z') gp.x = lerp(gp.x, snap.x, Math.min(1, dt * 2));
      else gp.z = lerp(gp.z, snap.z, Math.min(1, dt * 2));
    }
  }
  if (!G.autoDrive) {
    const ax = input.axis();
    const throttle = ax.f; // W = +1, S = -1
    const steer = -ax.s;   // D = right
    const handbrake = input.keys.Space;
    if (throttle > 0) car.speed += 14 * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= 26 * dt; // brake
      else car.speed = Math.max(car.speed - 8 * dt, -10); // reverse
    } else car.speed = lerp(car.speed, 0, Math.min(1, dt * 0.8));
    if (handbrake) car.speed = lerp(car.speed, 0, Math.min(1, dt * 4));
    car.speed = clamp(car.speed, -10, car.top);
    if (Math.abs(car.speed) > 0.3) {
      car.yaw += steer * dt * 1.7 * Math.min(1, Math.abs(car.speed) / 9) * Math.sign(car.speed);
      car.group.rotation.y = car.yaw;
    }
    // front wheels visibly steer
    const steerAngle = steer * 0.38 * Math.min(1, Math.abs(car.speed) / 8);
    if (car.wheelFL) car.wheelFL.rotation.y = steerAngle;
    if (car.wheelFR) car.wheelFR.rotation.y = steerAngle;
  }
  gp.x += Math.sin(car.yaw) * car.speed * dt;
  gp.z += Math.cos(car.yaw) * car.speed * dt;
  gp.x = clamp(gp.x, -190, 395);
  gp.z = clamp(gp.z, -190, 255);
  gp.y = 0;
  // gentle collision with traffic: push apart, scrub speed
  for (const t of G.traffic) {
    if (t === car) continue;
    const tp = t.group.position;
    const d = dist2(gp.x, gp.z, tp.x, tp.z);
    if (d < 3.8 && d > 0.01) {
      const push = (3.8 - d) / 2;
      const nx = (tp.x - gp.x) / d, nz = (tp.z - gp.z) / d;
      tp.x += nx * push; tp.z += nz * push;
      gp.x -= nx * push * 0.4; gp.z -= nz * push * 0.4;
      if (Math.abs(car.speed) > 8) audio.crash();
      car.speed *= 0.94; t.speed *= 0.6;
    }
  }
  // player state follows the car
  p.pos.copy(gp);
  p.yaw = car.yaw;
  // headlight beam ahead of the car
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  headSpot.position.set(gp.x + fx * 1.5, 1.4, gp.z + fz * 1.5);
  headTarget.position.set(gp.x + fx * 26, 0.4, gp.z + fz * 26);
  headSpot.intensity = 55;
  audio.setEngine(clamp(Math.abs(car.speed) / car.top, 0, 1), true);
}

// ---------- police ----------
export function spawnPolice(n = 2) {
  let made = 0;
  for (let k = 0; k < n && G.police.length < 6; k++) {
    const p = randomRoadPoint(15);
    const car = spawnCar(p.x, p.z, rand(0, Math.PI * 2), { type: 'police', police: true });
    car.driver = 'police';
    G.police.push(car);
    made++;
  }
  return made;
}

function clearRoadblocks() {
  for (const rb of G.roadblocks) {
    G.scene.remove(rb.group);
    for (const c of rb.cars || []) {
      const i = G.cars.indexOf(c);
      if (i >= 0) G.cars.splice(i, 1);
      G.scene.remove(c.group);
    }
  }
  G.roadblocks = [];
}

function makeRoadblock() {
  const p = G.player;
  const yaw = p.car ? p.car.yaw : p.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const cx = p.pos.x + fx * 35, cz = p.pos.z + fz * 35;
  const snap = nearestRoadPoint(cx, cz);
  const group = new THREE.Group();
  // three striped barriers across the road
  const rightX = -fz, rightZ = fx; // perpendicular to the road direction
  for (let k = -1; k <= 1; k++) {
    const bx = snap.x + rightX * k * 4, bz = snap.z + rightZ * k * 4;
    const bar = new THREE.Group();
    const red = mesh(new THREE.BoxGeometry(3.6, 0.5, 0.18), lam(0xd21f26), 0, 0.85, 0);
    const white = mesh(new THREE.BoxGeometry(3.6, 0.16, 0.2), lam(0xf2f2f2), 0, 0.85, 0);
    const legL = mesh(new THREE.BoxGeometry(0.14, 0.85, 0.14), lam(0x222222), -1.5, 0.42, 0);
    const legR = mesh(new THREE.BoxGeometry(0.14, 0.85, 0.14), lam(0x222222), 1.5, 0.42, 0);
    bar.add(red, white, legL, legR);
    bar.position.set(bx, 0, bz);
    bar.rotation.y = Math.atan2(rightX, rightZ) + Math.PI / 2;
    group.add(bar);
  }
  G.scene.add(group);
  // two flanking police cars, parked as part of the block (they do not chase)
  const cars = [];
  for (const s of [-1, 1]) {
    const c = spawnCar(snap.x + rightX * s * 7, snap.z + rightZ * s * 7, yaw + Math.PI / 2, { type: 'police', police: true });
    c.driver = 'block';
    cars.push(c);
  }
  G.roadblocks.push({ group, cars });
}

let bustTimer = 0;
export function updatePolice(dt) {
  // drop police entries whose car was destroyed (combat only removes from G.cars)
  for (let i = G.police.length - 1; i >= 0; i--) {
    if (!G.cars.includes(G.police[i])) G.police.splice(i, 1);
  }
  const p = G.player;
  if (!p) return;
  const px = p.pos.x, pz = p.pos.z;
  const t = performance.now() / 1000;
  const flash = Math.sin(t * 9) > 0;

  if (G.wanted === 0) {
    // stand down: far-away units drive off and despawn
    for (let i = G.police.length - 1; i >= 0; i--) {
      const c = G.police[i];
      const d = dist2(c.group.position.x, c.group.position.z, px, pz);
      if (d > 130) {
        G.scene.remove(c.group);
        const ci = G.cars.indexOf(c);
        if (ci >= 0) G.cars.splice(ci, 1);
        G.police.splice(i, 1);
      }
    }
    if (G.heli) removeHeli();
    clearRoadblocks();
    bustTimer = 0;
    return;
  }

  // chase: steer toward the player, ram on contact
  let near = false;
  for (const c of G.police) {
    const gp = c.group.position;
    const dx = px - gp.x, dz = pz - gp.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    let dy = want - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += clamp(dy, -2.2 * dt, 2.2 * dt);
    c.group.rotation.y = c.yaw;
    const target = d > 40 ? c.top : Math.min(c.top, 14 + d * 0.4);
    c.speed = lerp(c.speed, target, Math.min(1, dt * 1.4));
    gp.x += Math.sin(c.yaw) * c.speed * dt;
    gp.z += Math.cos(c.yaw) * c.speed * dt;
    gp.x = clamp(gp.x, -190, 395);
    gp.z = clamp(gp.z, -190, 255);
    // light bar flash
    if (c.lightL) c.lightL.visible = flash;
    if (c.lightR) c.lightR.visible = !flash;
    if (d < 3.6) {
      near = true;
      if (p.car) {
        p.car.speed *= 0.9;
        c.speed *= 0.85;
        if (Math.abs(p.car.speed) > 6) audio.crash();
      }
    }
  }
  // bust: a cop sitting on an on-foot player for ~2.5s ends the run
  if (near && p.onFoot && p.speed < 1) {
    bustTimer += dt;
    if (bustTimer > 2.5) { G.busted = true; bustTimer = 0; }
  } else bustTimer = Math.max(0, bustTimer - dt);

  // helicopter from 3 stars up
  if (G.wanted >= 3) {
    if (!G.heli) makeHeli();
    updateHeli(dt);
  } else if (G.heli) removeHeli();

  // roadblocks from 4 stars up
  if (G.wanted >= 4 && G.roadblocks.length === 0) makeRoadblock();
  if (G.wanted < 4 && G.roadblocks.length > 0) clearRoadblocks();
}

// ---------- helicopter ----------
function makeHeli() {
  const g = new THREE.Group();
  const bodyMat = lam(0xe8ecf0); // white police livery — reads against the dusk sky
  const stripeMat = lam(0x2a6fd4);
  const glassMat = lam(0x9fd4e8);
  // fuselage: main body + nose + tail boom + fin, all clearly visible
  const body = mesh(new THREE.BoxGeometry(2.0, 1.5, 3.4), bodyMat, 0, 0, 0);
  const stripeL = mesh(new THREE.BoxGeometry(0.06, 0.4, 3.0), stripeMat, -1.02, -0.1, 0);
  const stripeR = mesh(new THREE.BoxGeometry(0.06, 0.4, 3.0), stripeMat, 1.02, -0.1, 0);
  const nose = mesh(new THREE.BoxGeometry(1.7, 1.1, 1.0), glassMat, 0, -0.1, 2.0);
  const boom = mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), bodyMat, 0, 0.25, -3.2);
  const fin = mesh(new THREE.BoxGeometry(0.16, 1.4, 0.9), lam(0xd21f26), 0, 0.7, -4.8);
  const belly = mesh(new THREE.BoxGeometry(1.6, 0.3, 2.6), lam(0x2a6fd4), 0, -0.85, 0);
  // skids
  const skidL = mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), lam(0x333333), -0.85, -1.15, 0);
  const skidR = mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), lam(0x333333), 0.85, -1.15, 0);
  const strutL = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), lam(0x333333), -0.85, -0.85, 0.6);
  const strutR = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), lam(0x333333), 0.85, -0.85, 0.6);
  // main rotor (spins) + tail rotor
  const rotor = new THREE.Group();
  rotor.position.y = 1.05;
  const blade1 = mesh(new THREE.BoxGeometry(6.6, 0.08, 0.42), lam(0x222222), 0, 0, 0);
  const blade2 = mesh(new THREE.BoxGeometry(0.42, 0.08, 6.6), lam(0x222222), 0, 0, 0);
  const mast = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), lam(0x333333), 0, -0.2, 0);
  rotor.add(blade1, blade2, mast);
  const tailRotor = mesh(new THREE.BoxGeometry(0.08, 1.5, 0.3), lam(0x222222), 0.35, 0.7, -4.8);
  // red beacon (top + belly)
  const beacon = mesh(new THREE.SphereGeometry(0.22, 10, 8), basic(0xff2222), 0, 1.0, -0.6);
  const beaconB = mesh(new THREE.SphereGeometry(0.18, 10, 8), basic(0xff2222), 0, -1.0, 0.6);
  // searchlight cone (translucent, apex at the heli) + ground pool
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 18, 1, true), coneMat);
  cone.visible = false;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.26, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.07;
  // spotlight aimed at the player
  const spot = new THREE.SpotLight(0xfff2c8, 90, 70, 0.4, 0.6, 1.1);
  const spotTarget = new THREE.Object3D();
  g.add(body, stripeL, stripeR, nose, boom, fin, belly, skidL, skidR, strutL, strutR, rotor, tailRotor, beacon, beaconB);
  G.scene.add(g);
  G.scene.add(cone);
  G.scene.add(pool);
  G.scene.add(spot);
  G.scene.add(spotTarget);
  spot.target = spotTarget;
  const p = G.player;
  G.heli = {
    group: g, rotor, tailRotor, cone, pool, spot, spotTarget, beacon, beaconB,
    angle: -Math.PI / 2, // start ahead of the player so it is in frame
    height: 7.5, radius: 18,
    x: p ? p.pos.x : 0, z: p ? p.pos.z - 18 : -18,
  };
  g.scale.setScalar(1.35); // big enough to read clearly from the chase camera
}

function removeHeli() {
  const h = G.heli;
  if (!h) return;
  G.scene.remove(h.group);
  G.scene.remove(h.cone);
  G.scene.remove(h.pool);
  G.scene.remove(h.spot);
  G.scene.remove(h.spotTarget);
  G.heli = null;
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
function updateHeli(dt) {
  const h = G.heli;
  const p = G.player;
  if (!h || !p) return;
  h.angle += dt * 0.28; // slow orbit around the player
  const hx = p.pos.x + Math.cos(h.angle) * h.radius;
  const hz = p.pos.z + Math.sin(h.angle) * h.radius;
  h.group.position.set(hx, h.height, hz);
  // face the direction of travel (tangent to the orbit)
  h.group.rotation.y = Math.atan2(-Math.sin(h.angle), Math.cos(h.angle)) + Math.PI / 2;
  h.rotor.rotation.y += dt * 22;
  h.tailRotor.rotation.z += dt * 30;
  const blink = Math.sin(performance.now() / 130) > 0;
  h.beacon.visible = blink;
  h.beaconB.visible = blink;
  // searchlight: cone from the heli down to the player, pool of light on the ground
  const len = Math.hypot(hx - p.pos.x, h.height, hz - p.pos.z);
  _dir.set(hx - p.pos.x, h.height, hz - p.pos.z).normalize();
  _mid.set((hx + p.pos.x) / 2, h.height / 2, (hz + p.pos.z) / 2);
  h.cone.position.copy(_mid);
  h.cone.quaternion.setFromUnitVectors(_up, _dir);
  h.cone.scale.set(1, len, 1);
  h.cone.visible = true;
  h.pool.position.set(p.pos.x, 0.07, p.pos.z);
  h.spot.position.set(hx, h.height - 0.5, hz);
  h.spotTarget.position.set(p.pos.x, 0, p.pos.z);
}
