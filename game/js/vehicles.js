// Solara City 3D — vehicles: low-poly cars, arcade physics, traffic AI, police, helicopter.
import * as THREE from 'three';
import { G, CITY_HALF, PITCH, NROADS, roadX, roadZ, nearestRoadPoint, rand, randi, clamp, pick, dist2 } from './state.js';
import { input } from './input.js';
import { audio, } from './audio.js';
import { addHeat } from './state.js';

const CAR_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8c832, 0x3aa655, 0xe8e8e8, 0x222226, 0xd47f2a, 0x7a4fd4, 0x4fd4c2];
const CAR_MODELS = [
  { name: 'Solara Hatch', top: 32, color: 0x4fd4c2 },
  { name: 'Vento Sedan', top: 30, color: 0x2a6fd4 },
  { name: 'Falco Sport', top: 46, color: 0xd43d2a },
  { name: 'Toro Truck', top: 26, color: 0x8a6a45 },
  { name: 'Lusso Coupe', top: 42, color: 0xe8c832 },
];

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    g.userData.wheels.push(w);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.45, -0.2); g.add(bar);
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    l1.position.set(-0.32, 1.56, -0.2); g.add(l1);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    l2.position.set(0.32, 1.56, -0.2); g.add(l2);
    g.userData.lightL = l1; g.userData.lightR = l2;
  }
  return g;
}

export function spawnCar(x, z, yaw, opts = {}) {
  const model = opts.model || pick(CAR_MODELS);
  const mesh = makeCarMesh(opts.police ? 0xffffff : (opts.color ?? model.color), opts.police);
  mesh.position.set(x, 0, z); mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    group: mesh, model, yaw, speed: 0, steer: 0,
    police: !!opts.police, driver: opts.driver || null,
    top: model.top, color: opts.color ?? model.color,
    health: 100, stuck: 0,
    ai: opts.police ? { targetSpeed: 18 } : null,
  };
  G.cars.push(car);
  if (opts.police) G.police.push(car); else if (!opts.player) G.traffic.push(car);
  return car;
}

function drivePhysics(car, dt, throttle, steer) {
  const accel = 22, brake = 34, maxRev = 12;
  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed = Math.max(car.speed - accel * 0.6 * dt, -maxRev);
  } else car.speed *= Math.pow(0.4, dt); // drag
  car.speed = clamp(car.speed, -maxRev, car.top);
  const sf = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.yaw += steer * sf * 1.9 * dt * Math.sign(car.speed || 1);
  car.group.position.x += Math.sin(car.yaw) * car.speed * dt;
  car.group.position.z += Math.cos(car.yaw) * car.speed * dt;
  car.group.rotation.y = car.yaw;
  // wheel spin
  for (const w of car.group.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  car.group.position.x = clamp(car.group.position.x, -195, 405);
  car.group.position.z = clamp(car.group.position.z, -195, 265);
}

export function updatePlayerCar(dt) {
  const p = G.player;
  if (!p || p.onFoot || !p.car) return;
  const car = p.car;
  const ax = input.axis();
  let throttle = ax.f;
  // screenshot staging: the chase scene drives itself down the road
  if (G.sceneMode === 'chase') { throttle = 1; }
  if (input.keys.KeyE) { // handbrake
    car.speed *= Math.pow(0.05, dt);
    throttle = 0;
  }
  drivePhysics(car, dt, throttle, G.sceneMode === 'chase' ? 0 : -ax.s);
  p.pos.copy(car.group.position);
  audio.setEngine(Math.abs(car.speed) / car.top, true);
  // crash into buildings? keep on roads loosely: slow on block interiors
  const rp = nearestRoadPoint(car.group.position.x, car.group.position.z);
  const offRoad = Math.hypot(car.group.position.x - rp.x, car.group.position.z - rp.z);
  if (offRoad > 14) car.speed *= Math.pow(0.6, dt);
}

export function spawnTraffic(n = 18) {
  for (let k = 0; k < n; k++) {
    const vertical = Math.random() < 0.5;
    const road = randi(0, NROADS - 1);
    const along = rand(-CITY_HALF, CITY_HALF);
    const x = vertical ? roadX(road) + (Math.random() < 0.5 ? 2.8 : -2.8) : along;
    const z = vertical ? along : roadZ(road) + (Math.random() < 0.5 ? 2.8 : -2.8) + 40;
    const yaw = vertical ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = spawnCar(x, z, yaw, {});
    car.speed = rand(8, 16);
    car.ai = { axis: vertical ? 'z' : 'x', dir: Math.sign(Math.sin(yaw)) || 1, targetSpeed: car.speed, wait: 0 };
  }
}

function aiDrive(car, dt) {
  const ai = car.ai;
  if (!ai) return; // parked cars and the player's car have no AI driver
  // car ahead? slow down
  let blocked = false;
  for (const o of G.cars) {
    if (o === car) continue;
    const d = dist2(car.group.position.x, car.group.position.z, o.group.position.x, o.group.position.z);
    if (d < 7) {
      const ahead = (o.group.position.x - car.group.position.x) * Math.sin(car.yaw) + (o.group.position.z - car.group.position.z) * Math.cos(car.yaw);
      if (ahead > 0) { blocked = true; break; }
    }
  }
  if (blocked) { car.speed = Math.max(0, car.speed - 20 * dt); return; }
  car.speed = Math.min(car.speed + 8 * dt, ai.targetSpeed);
  car.group.position.x += Math.sin(car.yaw) * car.speed * dt;
  car.group.position.z += Math.cos(car.yaw) * car.speed * dt;
  car.group.rotation.y = car.yaw;
  // at an intersection, maybe turn
  const px = car.group.position.x, pz = car.group.position.z;
  const nearX = roadX(0); let ix = -1, iz = -1;
  for (let i = 0; i < NROADS; i++) {
    if (Math.abs(px - roadX(i)) < 1.2) ix = i;
    if (Math.abs(pz - (roadZ(i) + 40)) < 1.2) iz = i;
  }
  if (ix >= 0 && iz >= 0 && Math.random() < 0.02) {
    const choices = [0, Math.PI / 2, -Math.PI / 2];
    const turn = pick(choices);
    car.yaw += turn;
    // snap to lane centre
    car.group.position.x = roadX(ix) + (turn !== 0 ? 0 : 2.8 * Math.sign(Math.cos(car.yaw)) || 0);
  }
  // wrap around city edges
  if (px > CITY_HALF + 20 || px < -CITY_HALF - 20 || pz > CITY_HALF + 60 || pz < -CITY_HALF - 20) {
    car.group.position.x = rand(-150, 150); car.group.position.z = rand(-150, 150);
  }
}

export function updateTraffic(dt) {
  for (const c of [...G.traffic]) {
    if (c.driver === 'player') continue;
    aiDrive(c, dt);
  }
}

// ---- police ----
export function spawnPolice(n) {
  const p = G.player.pos;
  for (let k = 0; k < n; k++) {
    const a = rand(0, Math.PI * 2), r = rand(60, 90);
    const car = spawnCar(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, rand(0, Math.PI * 2), { police: true, driver: 'police' });
    car.speed = 10;
  }
}

export function updatePolice(dt) {
  const want = G.wanted;
  const need = want === 0 ? 0 : want === 1 ? 1 : want === 2 ? 2 : want === 3 ? 3 : want === 4 ? 4 : 5;
  if (G.police.length < need) spawnPolice(need - G.police.length);
  const p = G.player;
  const px = p.onFoot ? p.pos.x : p.car.group.position.x;
  const pz = p.onFoot ? p.pos.z : p.car.group.position.z;
  for (const c of [...G.police]) {
    if (G.wanted === 0) {
      // stand down: drive away and despawn
      c.speed = Math.max(0, c.speed - 10 * dt);
      aiDrive(c, dt);
      if (dist2(c.group.position.x, c.group.position.z, px, pz) > 160) {
        G.scene.remove(c.group);
        G.cars.splice(G.cars.indexOf(c), 1);
        G.police.splice(G.police.indexOf(c), 1);
      }
      continue;
    }
    // chase: steer toward player, ram on contact
    const dx = px - c.group.position.x, dz = pz - c.group.position.z;
    const wantYaw = Math.atan2(dx, dz);
    let dy = wantYaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += clamp(dy, -2.2 * dt, 2.2 * dt);
    c.speed = Math.min(c.speed + 14 * dt, 30 + G.wanted * 2);
    c.group.position.x += Math.sin(c.yaw) * c.speed * dt;
    c.group.position.z += Math.cos(c.yaw) * c.speed * dt;
    c.group.rotation.y = c.yaw;
    // flashing lights
    const t = performance.now() / 180;
    if (c.group.userData.lightL) {
      c.group.userData.lightL.material.color.setHex(Math.sin(t) > 0 ? 0xff2222 : 0x330000);
      c.group.userData.lightR.material.color.setHex(Math.sin(t) > 0 ? 0x000033 : 0x2266ff);
    }
    const d = dist2(c.group.position.x, c.group.position.z, px, pz);
    if (d < 3.2) {
      // ram: damage player / car
      if (p.onFoot) { G.health -= 14 * dt; addHeat(2 * dt); }
      else { p.car.health -= 20 * dt; if (p.car.health <= 0) { p.car.health = 0; } }
      c.speed *= 0.5;
    }
    // busted: on foot and a cop is very close and slow
    if (p.onFoot && d < 2.2 && c.speed < 4 && G.wanted >= 2) {
      G.busted = true;
    }
  }
  // helicopter at 3+ stars
  if (want >= 3 && !G.heli) spawnHeli();
  if (want < 3 && G.heli) { G.scene.remove(G.heli.group); G.heli = null; }
  if (G.heli) updateHeli(dt);
  // roadblocks at 4+ stars
  if (want >= 4 && G.roadblocks.length === 0) spawnRoadblocks();
  if (want < 4 && G.roadblocks.length) {
    for (const r of G.roadblocks) G.scene.remove(r);
    G.roadblocks = [];
  }
}

function spawnHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
  body.castShadow = true; g.add(body);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  rotor.position.y = 1; g.add(rotor);
  const spot = new THREE.SpotLight(0xfff2cc, 60, 60, 0.35, 0.5);
  spot.position.set(0, -0.5, 0);
  const tgt = new THREE.Object3D(); tgt.position.set(0, -20, 0); g.add(tgt);
  spot.target = tgt; g.add(spot);
  g.position.set(G.player.pos.x + 20, 20, G.player.pos.z - 20);
  G.scene.add(g);
  G.heli = { group: g, rotor, angle: Math.PI / 2 };
}

function updateHeli(dt) {
  const h = G.heli;
  h.angle += dt * 0.5;
  const p = G.player.pos;
  h.group.position.set(p.x + Math.cos(h.angle) * 30, 20, p.z + Math.sin(h.angle) * 30);
  h.group.lookAt(p.x, 0, p.z);
  h.rotor.rotation.y += dt * 22;
}

function spawnRoadblocks() {
  const p = G.player.pos;
  for (let k = 0; k < 2; k++) {
    const a = (k / 2) * Math.PI * 2 + 0.6;
    const g = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.8), new THREE.MeshLambertMaterial({ color: i === 0 ? 0xff7b2f : 0xeeeeee }));
      b.position.set(i * 2.4, 0.55, 0); b.castShadow = true; g.add(b);
    }
    g.position.set(p.x + Math.cos(a) * 34, 0, p.z + Math.sin(a) * 34);
    G.scene.add(g);
    G.roadblocks.push(g);
  }
}
