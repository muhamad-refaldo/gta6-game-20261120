// Solara City 3D v3.2 — player: realistic humanoid (~1.8 units), natural proportions,
// walk animation, third-person orbit camera, enter/exit cars.
// Fresh rewrite for v3.2. Exports (used by main/missions/save/hud):
// createPlayer, updatePlayer, updateCamera, enterCar.
import * as THREE from 'three';
import { G, clamp, dist2 } from './state.js';
import { input } from './input.js';
import { toast } from './hud.js';

// ---- materials (shared, realistic muted palette) ----
const M = {
  skin: new THREE.MeshLambertMaterial({ color: 0xc98a5e }),
  skinDark: new THREE.MeshLambertMaterial({ color: 0x8a5a3b }),
  hair: new THREE.MeshLambertMaterial({ color: 0x241610 }),
  jacket: new THREE.MeshLambertMaterial({ color: 0xb23a1e }),
  jacketDark: new THREE.MeshLambertMaterial({ color: 0x7e2a16 }),
  shirt: new THREE.MeshLambertMaterial({ color: 0xefe4cc }),
  jeans: new THREE.MeshLambertMaterial({ color: 0x2e3d55 }),
  jeansDark: new THREE.MeshLambertMaterial({ color: 0x243146 }),
  shoes: new THREE.MeshLambertMaterial({ color: 0x2e2018 }),
  sole: new THREE.MeshLambertMaterial({ color: 0x8a8078 }),
  cap: new THREE.MeshLambertMaterial({ color: 0xc22e24 }),
  capBrim: new THREE.MeshLambertMaterial({ color: 0x8f1f16 }),
  buckle: new THREE.MeshLambertMaterial({ color: 0xc8a03a }),
};

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// limb pivots (kept module-level for the walk animation)
let armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, torso, headG;
let bobT = 0;

export function createPlayer() {
  const g = new THREE.Group();

  // ---- legs: hip pivots at y 0.92, thigh + shin + shoe ----
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, 0.92, 0);
    g.add(hip);
    box(0.17, 0.44, 0.19, M.jeans, 0, -0.22, 0, hip); // thigh
    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    hip.add(knee);
    box(0.15, 0.42, 0.16, M.jeansDark, 0, -0.21, 0, knee); // shin
    box(0.16, 0.09, 0.3, M.shoes, 0, -0.44, 0.05, knee); // shoe
    box(0.16, 0.03, 0.3, M.sole, 0, -0.47, 0.05, knee); // sole
    return { hip, knee };
  }
  const lL = makeLeg(-1), lR = makeLeg(1);
  legL = lL.hip; legR = lR.hip; kneeL = lL.knee; kneeR = lR.knee;

  // ---- hips / belt ----
  box(0.44, 0.16, 0.26, M.jeans, 0, 0.98, 0, g);
  box(0.46, 0.07, 0.28, M.jacketDark, 0, 1.05, 0, g); // belt
  box(0.06, 0.05, 0.02, M.buckle, 0, 1.05, 0.15, g); // buckle

  // ---- torso: jacket + shirt + collar + zip ----
  torso = new THREE.Group();
  torso.position.set(0, 0, 0);
  g.add(torso);
  box(0.5, 0.55, 0.27, M.jacket, 0, 1.33, 0, torso);
  box(0.3, 0.42, 0.03, M.shirt, 0, 1.3, 0.14, torso); // shirt front
  box(0.03, 0.48, 0.02, M.jacketDark, 0, 1.33, 0.155, torso); // zip line
  box(0.42, 0.09, 0.29, M.jacketDark, 0, 1.6, 0, torso); // collar
  box(0.52, 0.05, 0.28, M.jacketDark, 0, 1.08, 0, torso); // jacket hem

  // ---- arms: shoulder pivots, upper arm + elbow + forearm + hand ----
  function makeArm(side) {
    const sh = new THREE.Group();
    sh.position.set(0.31 * side, 1.54, 0);
    g.add(sh);
    box(0.13, 0.38, 0.14, M.jacket, 0, -0.19, 0, sh); // upper arm
    const el = new THREE.Group();
    el.position.set(0, -0.38, 0);
    sh.add(el);
    box(0.12, 0.34, 0.13, M.jacketDark, 0, -0.17, 0, el); // forearm
    box(0.11, 0.13, 0.12, M.skin, 0, -0.4, 0, el); // hand
    return { sh, el };
  }
  const aL = makeArm(-1), aR = makeArm(1);
  armL = aL.sh; armR = aR.sh; elbowL = aL.el; elbowR = aR.el;

  // ---- head: skin, hair, eyes, cap ----
  headG = new THREE.Group();
  headG.position.set(0, 1.74, 0);
  g.add(headG);
  box(0.26, 0.28, 0.25, M.skin, 0, 0, 0, headG); // head
  box(0.27, 0.09, 0.26, M.hair, 0, 0.15, -0.01, headG); // hair top
  box(0.27, 0.2, 0.06, M.hair, 0, 0.02, -0.11, headG); // hair back
  box(0.04, 0.03, 0.02, M.hair, -0.06, 0.02, 0.13, headG); // eye L
  box(0.04, 0.03, 0.02, M.hair, 0.06, 0.02, 0.13, headG); // eye R
  box(0.04, 0.07, 0.04, M.skinDark, 0, -0.03, 0.13, headG); // nose
  // cap (red, worn forwards)
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 12), M.cap);
  capTop.position.set(0, 0.17, 0); capTop.castShadow = true; headG.add(capTop);
  box(0.26, 0.03, 0.15, M.capBrim, 0, 0.13, 0.17, headG); // brim

  g.position.set(0, 0, 0);
  G.scene.add(g);
  G.player = {
    group: g, pos: new THREE.Vector3(0, 0, 0), yaw: 0,
    speed: 0, onFoot: true, car: null, walkPhase: 0,
    vy: 0, grounded: true,
  };
  return G.player;
}

function nearestEnterableCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (G.police.includes(c) || c.flee) continue; // never steal a pursuit car or the informant
    const d = dist2(c.group.position.x, c.group.position.z, G.player.pos.x, G.player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(car) {
  if (!car) return;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.group.visible = false;
  G.player.pos.copy(car.group.position);
  G.player.pos.y = 0;
  if (G.traffic.includes(car)) {
    const i = G.traffic.indexOf(car);
    if (i >= 0) G.traffic.splice(i, 1);
    G.stats.carsStolen++;
    toast("Car stolen — it's yours now");
  }
}

function exitCar() {
  const car = G.player.car;
  if (!car) return;
  const side = 2.4;
  const px = car.group.position.x + Math.cos(car.yaw) * side;
  const pz = car.group.position.z - Math.sin(car.yaw) * side;
  G.player.car = null;
  G.player.onFoot = true;
  G.player.pos.set(px, 0, pz);
  G.player.group.position.copy(G.player.pos);
  G.player.group.visible = true;
  G.camSnapped = false;
}

// angle lerp with wrap-around
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;

  // safety: the car we were driving was destroyed
  if (!p.onFoot && (!p.car || !G.cars.includes(p.car))) {
    p.car = null; p.onFoot = true; p.group.visible = true;
    p.group.position.copy(p.pos);
  }

  // mouse look + wheel zoom (always, even in a car)
  G.camYaw -= (input.mouseDX || 0) * 0.0032;
  G.camPitch = clamp((G.camPitch || 0.32) + (input.mouseDY || 0) * 0.0022, 0.06, 1.15);
  if (input.wheelDelta) G.camDist = clamp((G.camDist || 9) - input.wheelDelta * 0.01, 5, 16);

  // camera mode cycle
  if (input.wasPressed('KeyC')) {
    G.camMode = ((G.camMode || 0) + 1) % 3;
    toast(['Camera: Chase', 'Camera: Orbit', 'Camera: High'][G.camMode]);
    G.camSnapped = false;
  }

  // F: enter / exit car
  if (input.wasPressed('KeyF')) {
    if (p.onFoot) {
      const car = nearestEnterableCar(4.5);
      if (car) enterCar(car);
      else toast('No car close enough');
    } else exitCar();
  }

  if (p.onFoot) {
    const ax = input.axis();
    const sprint = !!(input.keys.ShiftLeft || input.keys.ShiftRight);
    const targetSpeed = (ax.f !== 0 || ax.s !== 0) ? (sprint ? 8 : 4.5) : 0;
    p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 8);

    if (p.speed > 0.3) {
      // move relative to the camera yaw; forward on screen = away from camera
      const fx = -Math.sin(G.camYaw), fz = -Math.cos(G.camYaw);
      const rx = Math.cos(G.camYaw), rz = -Math.sin(G.camYaw);
      let mx = fx * ax.f + rx * ax.s;
      let mz = fz * ax.f + rz * ax.s;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const targetYaw = Math.atan2(mx, mz);
      p.yaw = lerpAngle(p.yaw, targetYaw, Math.min(1, dt * 12));
      p.pos.x += mx * p.speed * dt;
      p.pos.z += mz * p.speed * dt;
      p.pos.x = clamp(p.pos.x, -190, 395);
      p.pos.z = clamp(p.pos.z, -190, 255);
      p.walkPhase += p.speed * dt * 1.9;
    }

    // jump (Space)
    if (input.wasPressed('Space') && p.grounded) {
      p.vy = 7.5; p.grounded = false;
    }
    if (!p.grounded) {
      p.vy -= 22 * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
    }

    // walk animation: limbs swing opposite, knees bend on the swing, torso bobs
    const sw = Math.min(1, p.speed / 4.5);
    const ph = p.walkPhase;
    const swing = Math.sin(ph) * 0.55 * sw;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    kneeL.rotation.x = Math.max(0, Math.sin(ph + 0.7)) * 0.7 * sw;
    kneeR.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 0.7)) * 0.7 * sw;
    armL.rotation.x = -swing * 0.9;
    armR.rotation.x = swing * 0.9;
    elbowL.rotation.x = -0.35 - Math.max(0, Math.sin(ph)) * 0.25 * sw;
    elbowR.rotation.x = -0.35 - Math.max(0, Math.sin(ph + Math.PI)) * 0.25 * sw;
    bobT += dt * (2 + p.speed);
    const bob = Math.abs(Math.sin(ph)) * 0.045 * sw;
    torso.position.y = bob;
    torso.rotation.x = 0.06 * sw; // slight forward lean
    headG.position.y = 1.74 + bob;
    headG.rotation.x = -0.04 * sw;

    p.group.position.copy(p.pos);
    p.group.rotation.y = p.yaw;
  } else if (p.car) {
    // riding: hide the body, follow the car
    p.pos.copy(p.car.group.position);
    p.pos.y = 0;
    p.speed = Math.abs(p.car.speed || 0);
  }
}

// ---- third-person camera ----
const _camTarget = new THREE.Vector3();
const _smoothed = new THREE.Vector3();
let _smoothInit = false;

export function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const mode = G.camMode || 0;

  if (p.onFoot) _camTarget.set(p.pos.x, p.pos.y + 1.7, p.pos.z);
  else if (p.car) _camTarget.set(p.car.group.position.x, 2.2, p.car.group.position.z);
  else _camTarget.set(p.pos.x, p.pos.y + 1.7, p.pos.z);

  // chase mode follows behind the player / car
  const followYaw = p.onFoot ? p.yaw : (p.car ? p.car.yaw : p.yaw);
  if (mode === 0) {
    G.camYaw = lerpAngle(G.camYaw, followYaw + Math.PI, Math.min(1, dt * 2.5));
  }

  const dist = mode === 2 ? (G.camDist || 9) * 1.1 : (G.camDist || 9);
  const pitch = mode === 2 ? 0.55 : (G.camPitch || 0.32);
  const cx = _camTarget.x + Math.sin(G.camYaw) * Math.cos(pitch) * dist;
  const cy = _camTarget.y + Math.sin(pitch) * dist;
  const cz = _camTarget.z + Math.cos(G.camYaw) * Math.cos(pitch) * dist;

  if (!G.camSnapped || !_smoothInit) {
    _smoothed.set(cx, cy, cz);
    _smoothInit = true;
    G.camSnapped = true;
  } else {
    const k = Math.min(1, dt * 7);
    _smoothed.x += (cx - _smoothed.x) * k;
    _smoothed.y += (cy - _smoothed.y) * k;
    _smoothed.z += (cz - _smoothed.z) * k;
  }
  G.camera.position.copy(_smoothed);
  G.camera.lookAt(_camTarget);
}
