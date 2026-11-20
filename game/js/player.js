// Solara City 3D v3.1 — player: detailed humanoid character, third-person camera,
// on-foot movement (walk/sprint/jump), enter/exit cars. Fresh rewrite for v3.1.
// The character is a real low-poly person now: jacket, shirt, arms, legs, shoes,
// cap and hair, with a walk-cycle swing — not a green box.
import * as THREE from 'three';
import { G, clamp, lerp, dist2 } from './state.js';
import { input } from './input.js';

function turnToward(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + clamp(d, -maxStep, maxStep);
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createPlayer() {
  const g = new THREE.Group();
  const jacket = 0xd8552a;   // burnt-orange jacket — the player's signature colour
  const jacketDark = 0xa83f1e;
  const shirt = 0xffe9b0;
  const pants = 0x23283a;
  const skin = 0xd9a066;
  const hair = 0x2a1a12;
  const cap = 0xc22a2a;

  // ---- legs (pivot at the hip so the walk swing looks right) ----
  const legL = new THREE.Group();
  legL.position.set(-0.18, 0.84, 0);
  const legLMesh = box(0.3, 0.8, 0.34, pants, 0, -0.4, 0);
  const shoeL = box(0.32, 0.12, 0.46, 0x14161c, 0, -0.78, 0.06);
  legL.add(legLMesh, shoeL);
  const legR = new THREE.Group();
  legR.position.set(0.18, 0.84, 0);
  const legRMesh = box(0.3, 0.8, 0.34, pants, 0, -0.4, 0);
  const shoeR = box(0.32, 0.12, 0.46, 0x14161c, 0, -0.78, 0.06);
  legR.add(legRMesh, shoeR);

  // ---- torso: jacket + shirt panel + belt ----
  const torso = box(0.86, 0.92, 0.5, jacket, 0, 1.32, 0);
  const shirtPanel = box(0.46, 0.66, 0.06, shirt, 0, 1.36, 0.26);
  const belt = box(0.88, 0.1, 0.52, 0x1a1a1a, 0, 0.9, 0);
  const collar = box(0.5, 0.12, 0.54, jacketDark, 0, 1.82, 0);

  // ---- arms (pivot at the shoulder) ----
  const armL = new THREE.Group();
  armL.position.set(-0.56, 1.7, 0);
  armL.add(box(0.26, 0.78, 0.3, jacketDark, 0, -0.39, 0));
  armL.add(box(0.24, 0.16, 0.28, skin, 0, -0.82, 0));
  const armR = new THREE.Group();
  armR.position.set(0.56, 1.7, 0);
  armR.add(box(0.26, 0.78, 0.3, jacketDark, 0, -0.39, 0));
  armR.add(box(0.24, 0.16, 0.28, skin, 0, -0.82, 0));

  // ---- head: skin + hair + backwards cap with brim ----
  const head = new THREE.Group();
  head.position.set(0, 2.02, 0);
  head.add(box(0.5, 0.48, 0.46, skin, 0, 0, 0));
  head.add(box(0.52, 0.18, 0.48, hair, 0, 0.2, -0.02));
  const capTop = box(0.54, 0.12, 0.5, cap, 0, 0.28, 0);
  const capBrim = box(0.5, 0.05, 0.26, cap, 0, 0.24, -0.32); // brim points back
  const capButton = box(0.1, 0.06, 0.1, 0xffffff, 0, 0.36, 0);
  head.add(capTop, capBrim, capButton);

  g.add(legL, legR, torso, shirtPanel, belt, collar, armL, armR, head);
  g.position.set(-26, 0, -26);
  G.scene.add(g);

  G.player = {
    group: g, pos: new THREE.Vector3(-26, 0, -26),
    yaw: 0, speed: 0, onFoot: true, car: null, walkPhase: 0, vy: 0,
    parts: { legL, legR, armL, armR, torso, head },
  };
  G.camYaw = 0; G.camPitch = 0.32; G.camDist = 9; G.camMode = 0; G.camSnapped = false;
}

function tryEnterCar() {
  const p = G.player;
  let best = null, bd = 4.5;
  for (const c of G.cars) {
    const d = dist2(p.pos.x, p.pos.z, c.group.position.x, c.group.position.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) enterCar(best);
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  // step out on the car's left side
  const sx = Math.cos(car.yaw) * 2.4, sz = -Math.sin(car.yaw) * 2.4;
  p.pos.set(car.group.position.x + sx, 0, car.group.position.z + sz);
  p.yaw = car.yaw;
  p.car = null; p.onFoot = true; p.speed = 0; p.vy = 0;
  car.speed = 0;
  p.group.visible = true;
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.yaw;
  G.camSnapped = false;
}

export function enterCar(car) {
  const p = G.player;
  if (!car || !p) return;
  // the car stops being AI-driven the moment the player takes it
  const ti = G.traffic.indexOf(car);
  if (ti >= 0) G.traffic.splice(ti, 1);
  const pi = G.police.indexOf(car);
  if (pi >= 0) G.police.splice(pi, 1);
  if (!car.owned) { car.owned = true; G.stats.carsStolen++; }
  p.car = car; p.onFoot = false; p.speed = 0; p.vy = 0;
  car.driver = 'player';
  p.group.visible = false;
  p.pos.copy(car.group.position);
  p.yaw = car.yaw;
  G.camSnapped = false;
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  // F: enter the nearest car, or step out of the one we're driving
  if (input.wasPressed('KeyF')) {
    if (p.onFoot) tryEnterCar();
    else exitCar();
  }
  if (!p.onFoot) return;

  const ax = input.axis();
  // W moves away from the camera, D moves right on screen
  const lx = -Math.sin(G.camYaw), lz = -Math.cos(G.camYaw); // camera look direction
  const rx = Math.cos(G.camYaw), rz = -Math.sin(G.camYaw);  // screen-right
  let mx = lx * ax.f + rx * ax.s;
  let mz = lz * ax.f + rz * ax.s;
  const len = Math.hypot(mx, mz);
  const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
  const target = len > 0 ? (sprint ? 8 : 4.5) : 0;
  if (len > 0) {
    mx /= len; mz /= len;
    p.yaw = turnToward(p.yaw, Math.atan2(mx, mz), dt * 10);
  }
  p.speed = lerp(p.speed, target, Math.min(1, dt * 8));
  p.pos.x += mx * p.speed * dt;
  p.pos.z += mz * p.speed * dt;
  // jump (Space) with simple gravity
  if (input.wasPressed('Space') && p.pos.y <= 0.01) p.vy = 8;
  if (p.pos.y > 0 || p.vy !== 0) {
    p.vy -= 22 * dt;
    p.pos.y = Math.max(0, p.pos.y + p.vy * dt);
    if (p.pos.y === 0) p.vy = 0;
  }
  p.pos.x = clamp(p.pos.x, -190, 395);
  p.pos.z = clamp(p.pos.z, -190, 255);
  // walk cycle: legs and arms swing opposite, body bobs slightly
  p.walkPhase += p.speed * dt * 1.9;
  const sw = Math.sin(p.walkPhase) * 0.55 * Math.min(1, p.speed / 4.5);
  p.parts.legL.rotation.x = sw;
  p.parts.legR.rotation.x = -sw;
  p.parts.armL.rotation.x = -sw * 0.8;
  p.parts.armR.rotation.x = sw * 0.8;
  p.group.position.set(p.pos.x, p.pos.y + Math.abs(Math.sin(p.walkPhase)) * 0.05, p.pos.z);
  p.group.rotation.y = p.yaw;
}

export function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  // mouse orbit + wheel zoom + C cycles the camera mode
  if (input.mouseDX) G.camYaw -= input.mouseDX * 0.004;
  if (input.mouseDY) G.camPitch = clamp(G.camPitch + input.mouseDY * 0.003, 0.12, 1.1);
  if (input.wheelDelta) G.camDist = clamp(G.camDist - input.wheelDelta * 0.01, 6, 20);
  if (input.wasPressed('KeyC')) G.camMode = (G.camMode + 1) % 3;

  const target = p.onFoot ? p.pos : (p.car ? p.car.group.position : p.pos);
  // while driving, the camera swings in behind the car (unless the mouse is steering it)
  if (!p.onFoot && p.car && !input.mouseDX) {
    G.camYaw = turnToward(G.camYaw, p.car.yaw + Math.PI, dt * 1.6);
  }
  const modeDist = G.camMode === 0 ? G.camDist : G.camMode === 1 ? Math.max(G.camDist, 13) : 13;
  const modePitch = G.camMode === 2 ? Math.max(G.camPitch, 0.55) : G.camPitch;
  const d = modeDist * Math.cos(modePitch);
  const h = 2 + modeDist * Math.sin(modePitch);
  const cx = target.x + Math.sin(G.camYaw) * d;
  const cz = target.z + Math.cos(G.camYaw) * d;
  if (!G.camSnapped) {
    G.camera.position.set(cx, h, cz);
    G.camSnapped = true;
  } else {
    G.camera.position.x = lerp(G.camera.position.x, cx, Math.min(1, dt * 7));
    G.camera.position.y = lerp(G.camera.position.y, h, Math.min(1, dt * 7));
    G.camera.position.z = lerp(G.camera.position.z, cz, Math.min(1, dt * 7));
  }
  G.camera.lookAt(target.x, target.y + 2, target.z);
}
