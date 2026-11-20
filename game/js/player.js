// Solara City 3D — the player: low-poly third-person character, movement, camera, cars.
import * as THREE from 'three';
import { G, clamp, lerp } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';

export function createPlayer() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const mk = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const torso = mk(0.9, 1.0, 0.5, shirt, 0, 1.35, 0);
  const head = mk(0.55, 0.55, 0.55, skin, 0, 2.15, 0);
  mk(0.6, 0.22, 0.6, hair, 0, 2.5, 0);
  const legL = mk(0.34, 0.9, 0.4, pants, -0.22, 0.45, 0);
  const legR = mk(0.34, 0.9, 0.4, pants, 0.22, 0.45, 0);
  const armL = mk(0.28, 0.9, 0.32, shirt, -0.62, 1.35, 0);
  const armR = mk(0.28, 0.9, 0.32, shirt, 0.62, 1.35, 0);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  G.scene.add(g);
  G.player = {
    group: g, parts: { legL, legR, armL, armR, torso, head },
    pos: new THREE.Vector3(0, 0, 30), vel: new THREE.Vector3(),
    yaw: Math.PI, speed: 0, onFoot: true, car: null, walkPhase: 0, vy: 0, grounded: true,
  };
  return G.player;
}

function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c === G.player.car || c.police) continue;
    const d = c.group.position.distanceTo(G.player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(car) {
  const p = G.player;
  p.car = car; p.onFoot = false; car.driver = 'player';
  p.group.visible = false;
  G.stats.carsStolen++;
  audio.blip(300, 0.15, 'square', 0.1);
  return car;
}
export function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const c = p.car;
  c.driver = null;
  p.pos.copy(c.group.position).add(new THREE.Vector3(Math.sin(c.yaw + Math.PI / 2) * 2.2, 0, Math.cos(c.yaw + Math.PI / 2) * 2.2));
  p.pos.y = 0; p.yaw = c.yaw;
  p.car = null; p.onFoot = true;
  p.group.visible = true;
  p.group.position.copy(p.pos);
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  const ax = input.axis();

  if (p.onFoot) {
    // camera-relative movement
    const cy = G.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = -fz, rz = fx;
    let mx = fx * ax.f + rx * ax.s, mz = fz * ax.f + rz * ax.s;
    const ml = Math.hypot(mx, mz);
    const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
    const spd = sprint ? 9 : 5;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      p.pos.x += mx * spd * dt; p.pos.z += mz * spd * dt;
      p.yaw = Math.atan2(mx, mz);
      p.walkPhase += dt * (sprint ? 13 : 9);
      p.speed = spd;
    } else p.speed = 0;
    // jump
    if (input.wasPressed('Space') && p.grounded) { p.vy = 7; p.grounded = false; }
    if (!p.grounded) {
      p.vy -= 22 * dt; p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
    }
    // walk animation
    const sw = p.speed > 0 ? Math.sin(p.walkPhase) * 0.6 : 0;
    p.parts.legL.rotation.x = sw; p.parts.legR.rotation.x = -sw;
    p.parts.armL.rotation.x = -sw * 0.8; p.parts.armR.rotation.x = sw * 0.8;
    p.group.position.copy(p.pos);
    p.group.rotation.y = p.yaw;
    // enter car
    if (input.wasPressed('KeyF')) {
      const car = nearestCar(4.5);
      if (car) enterCar(car);
    }
    // clamp to world
    p.pos.x = clamp(p.pos.x, -190, 400); p.pos.z = clamp(p.pos.z, -190, 260);
  } else {
    // driving handled in vehicles.js (player car)
    if (input.wasPressed('KeyF')) exitCar();
  }
}

export function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  // orbit with mouse
  G.camYaw -= input.mouseDX * 0.0032;
  G.camPitch = clamp(G.camPitch + input.mouseDY * 0.0022, 0.05, 1.1);
  if (input.wheelDelta) G.camDist = clamp(G.camDist + input.wheelDelta * 0.01, 5, 16);
  if (input.wasPressed('KeyC')) { G.camMode = (G.camMode + 1) % 3; }
  const dist = [9, 6, 14][G.camMode];
  const height = [3.2, 2.0, 6][G.camMode];
  const target = p.onFoot ? p.pos.clone().add(new THREE.Vector3(0, 2, 0))
    : p.car.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  // aim mode pulls the camera close over the shoulder
  const d = G.aimMode ? 4.5 : dist;
  const h = G.aimMode ? 2.2 : height;
  const cx = target.x + Math.sin(G.camYaw) * d * Math.cos(G.camPitch);
  const cz = target.z + Math.cos(G.camYaw) * d * Math.cos(G.camPitch);
  const cy = target.y + h + Math.sin(G.camPitch) * d * 0.4;
  const cam = G.camera;
  if (!G.camSnapped) { cam.position.set(cx, cy, cz); G.camSnapped = true; }
  cam.position.set(lerp(cam.position.x, cx, 1 - Math.pow(0.001, dt)), lerp(cam.position.y, cy, 1 - Math.pow(0.001, dt)), lerp(cam.position.z, cz, 1 - Math.pow(0.001, dt)));
  cam.lookAt(target.x, target.y + (G.aimMode ? 0.4 : 0), target.z);
}
