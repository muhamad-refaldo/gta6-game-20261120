// Solara City 3D — combat: weapon wheel, shooting, rival gang enemies, damage.
import * as THREE from 'three';
import { G, clamp, rand, pick, dist2, addHeat } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { scarePeds } from './pedestrians.js';

export const WEAPONS = [
  { name: 'Fists', key: '1', dmg: 12, rate: 0.45, range: 3, ammo: Infinity, auto: false, desc: 'Close quarters. Always ready.', locked: false },
  { name: 'Bat', key: '2', dmg: 25, rate: 0.6, range: 3.5, ammo: Infinity, auto: false, desc: 'Aluminium. Loud. Final.', locked: false },
  { name: 'Pistol', key: '3', dmg: 22, rate: 0.32, range: 55, ammo: 120, auto: false, desc: 'Reliable sidearm.', locked: false },
  { name: 'SMG', key: '4', dmg: 13, rate: 0.09, range: 45, ammo: 240, auto: true, desc: 'Spray the street.', locked: true, price: 2500 },
  { name: 'Shotgun', key: '5', dmg: 65, rate: 0.9, range: 22, ammo: 40, auto: false, desc: 'One shell, one problem gone.', locked: true, price: 4000 },
  { name: 'Rifle', key: '6', dmg: 42, rate: 0.14, range: 90, ammo: 120, auto: true, desc: 'Long reach, clean lines.', locked: true, price: 8000 },
  { name: 'RPG', key: '7', dmg: 160, rate: 1.6, range: 80, ammo: 8, auto: false, desc: 'For when the city says no.', locked: true, price: 20000 },
];

export function currentWeapon() { return G.weapons[G.weaponIndex]; }

export function giveWeapons() {
  G.weapons = WEAPONS.map((w) => ({ ...w, ammoLeft: w.ammo }));
  G.weaponIndex = 2; // pistol
}

export function buyWeapon(i) {
  const w = G.weapons[i];
  if (!w.locked || G.money < w.price) return false;
  G.money -= w.price; w.locked = false;
  return true;
}

const raycaster = new THREE.Raycaster();
let shootCooldown = 0;
let muzzle = null;

export function spawnEnemy(x, z, hp = 60) {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const mk = (w, h, d, mat, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m;
  };
  mk(0.9, 1.0, 0.5, red, 0, 1.35, 0);
  mk(0.55, 0.55, 0.55, skin, 0, 2.15, 0);
  mk(0.34, 0.9, 0.4, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), -0.22, 0.45, 0);
  mk(0.34, 0.9, 0.4, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), 0.22, 0.45, 0);
  g.position.set(x, 0, z);
  G.scene.add(g);
  const e = { group: g, hp, x, z, shootT: rand(1, 2), dead: false };
  G.enemies.push(e);
  return e;
}

export function clearEnemies() {
  for (const e of G.enemies) G.scene.remove(e.group);
  G.enemies = [];
}

function hitTest(origin, dir, maxDist) {
  // returns {point, enemy, car, ped} for the closest hit
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const targets = [];
  for (const e of G.enemies) if (!e.dead) targets.push(...e.group.children);
  for (const c of G.cars) targets.push(c.group);
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) return null;
  const h = hits[0];
  let obj = h.object, enemy = null, car = null;
  while (obj) {
    for (const e of G.enemies) if (e.group === obj || e.group.children.includes(obj)) enemy = e;
    for (const c of G.cars) if (c.group === obj || c.group.children.includes(obj)) car = c;
    obj = obj.parent;
  }
  return { point: h.point, enemy, car, dist: h.distance };
}

export function shoot() {
  const w = currentWeapon();
  if (!w || shootCooldown > 0) return;
  if (w.ammoLeft <= 0) { audio.blip(160, 0.1, 'square', 0.1); shootCooldown = 0.3; return; }
  shootCooldown = w.rate;
  if (w.ammoLeft !== Infinity) w.ammoLeft--;
  G.stats.shots++;
  audio.shot();
  const cam = G.camera;
  const origin = cam.position.clone();
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.z += rand(-0.012, 0.012);
  dir.normalize();
  // muzzle flash
  if (!muzzle) {
    muzzle = new THREE.PointLight(0xffcc66, 0, 12);
    G.scene.add(muzzle);
  }
  muzzle.position.copy(origin).add(dir.clone().multiplyScalar(2));
  muzzle.intensity = 40;
  setTimeout(() => { if (muzzle) muzzle.intensity = 0; }, 60);
  const hit = hitTest(origin, dir, w.range);
  if (hit) {
    G.stats.hits++;
    if (hit.enemy) {
      hit.enemy.hp -= w.dmg;
      if (hit.enemy.hp <= 0 && !hit.enemy.dead) {
        hit.enemy.dead = true;
        G.scene.remove(hit.enemy.group);
        G.stats.kills++;
        addHeat(4);
      }
    } else if (hit.car) {
      hit.car.health -= w.dmg;
      if (hit.car.health <= 0) {
        // car explodes: remove, add heat
        const idx = G.cars.indexOf(hit.car);
        if (idx >= 0) G.cars.splice(idx, 1);
        const ti = G.traffic.indexOf(hit.car);
        if (ti >= 0) G.traffic.splice(ti, 1);
        G.scene.remove(hit.car.group);
        addHeat(10);
        audio.crash();
      }
    }
  }
  // gunfire scares peds and draws heat
  scarePeds(G.player.pos.x, G.player.pos.z, 26);
  addHeat(1.5);
}

export function updateCombat(dt) {
  shootCooldown = Math.max(0, shootCooldown - dt);
  const w = currentWeapon();
  if (!w) return;
  const firing = input.mouseDown && !G.paused && !G.mapOpen && !G.title;
  if (firing && (w.auto || input.mouseDown)) {
    if (G.aimMode || !G.player.onFoot) shoot();
    else if (input.mouseDown) shoot(); // hip-fire allowed
  }
  // number keys switch weapon
  for (let i = 0; i < G.weapons.length; i++) {
    if (input.wasPressed('Digit' + (i + 1))) {
      if (!G.weapons[i].locked) { G.weaponIndex = i; audio.blip(500 + i * 80, 0.08, 'square', 0.08); }
    }
  }
  // enemies shoot back
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.shootT -= dt;
    const d = dist2(e.x, e.z, G.player.pos.x, G.player.pos.z);
    if (d < 40) {
      e.group.lookAt(G.player.pos.x, 0, G.player.pos.z);
      if (e.shootT <= 0) {
        e.shootT = rand(0.9, 1.8);
        audio.shot();
        if (Math.random() < 0.45) {
          if (G.armour > 0) G.armour = Math.max(0, G.armour - 8);
          else G.health = Math.max(0, G.health - 8);
        }
      }
    }
  }
}
