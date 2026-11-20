// Solara City 3D v3.4 — side systems: street races, taxi fares, store robbery,
// chop shop, garage respray, gun shop, safehouses, stunt jumps, golden shells,
// crew, respect toasts, career-stat counters, courier missions (v3.4) and
// F5 quick save (v3.4).
// Fresh rewrite for v3.4. Exports: initSideSystems, updateSideSystems,
// nearestRaceStart, startRace, startTaxi.
import * as THREE from 'three';
import { G, addMoney, addHeat, dist2, clamp, randi, DISTRICTS, districtAt } from './state.js';
import { toast, setObjective, clearObjective, showHint, hideHint } from './hud.js';
import { RAMPS, SAFEHOUSES, COURIER_DEPOT, COURIER_DROPS } from './city.js';
import { buyWeapon } from './combat.js';
import { autosave, saveSlot } from './save.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { spawnParkedVehicles } from './vehicles.js';

// ---------- race ----------
const RACE_REWARD = 8500;
// 7 rings forming a loop around the start (offsets land on road crossings).
const RACE_RING_OFFSETS = [
  { x: 0, z: 52 }, { x: 52, z: 52 }, { x: 52, z: 0 }, { x: 52, z: -52 },
  { x: 0, z: -52 }, { x: -52, z: -52 }, { x: -52, z: 0 },
];
let raceRingMesh = null;

export function nearestRaceStart(maxD) {
  if (!G.city || !G.city.raceStarts) return null;
  let best = null, bd = maxD;
  for (const rs of G.city.raceStarts) {
    const d = dist2(rs.x, rs.z, G.player.pos.x, G.player.pos.z);
    if (d < bd) { bd = d; best = rs; }
  }
  return best;
}

function makeRaceRing() {
  if (raceRingMesh) return raceRingMesh;
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(6, 0.45, 10, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd24a })
  );
  m.rotation.x = Math.PI / 2;
  m.visible = false;
  G.scene.add(m);
  raceRingMesh = m;
  return m;
}

export function startRace(rs) {
  if (!rs) return;
  if (G.race) { toast('Already racing'); return; }
  if (!G.player.car) { toast('You need a car to race'); return; }
  const rings = RACE_RING_OFFSETS.map((o) => ({ x: rs.x + o.x, z: rs.z + o.z }));
  G.race = { name: rs.name, rings, idx: 0 };
  const ring = makeRaceRing();
  ring.position.set(rings[0].x, 1.2, rings[0].z);
  ring.visible = true;
  setObjective(rs.name, 'Ring 1/' + rings.length + ' — drive through the gold rings');
  audio.blip(660, 0.15, 'sine', 0.2);
  toast(rs.name + ' — GO!');
}

function endRace(win) {
  if (raceRingMesh) raceRingMesh.visible = false;
  if (win) {
    const bonus = G.crew ? 1.25 : 1;
    const payout = Math.round(RACE_REWARD * bonus);
    addMoney(payout);
    G.stats.racesWon++;
    audio.cash();
    if (!G.crew) {
      G.crew = { name: 'Dante', role: 'Driver' };
      toast('Race won! +$' + payout + ' — Dante joined your crew (+25% race pay)');
    } else {
      toast('Race won! +$' + payout);
    }
  } else {
    toast('Race abandoned');
  }
  clearObjective();
  G.race = null;
}

function updateRace(dt) {
  if (!G.race) return;
  if (!G.player.car) { endRace(false); return; }
  const ring = G.race.rings[G.race.idx];
  const p = G.player.pos;
  if (dist2(p.x, p.z, ring.x, ring.z) < 10) {
    G.race.idx++;
    audio.blip(880, 0.12, 'sine', 0.2);
    if (G.race.idx >= G.race.rings.length) { endRace(true); return; }
    const next = G.race.rings[G.race.idx];
    if (raceRingMesh) raceRingMesh.position.set(next.x, 1.2, next.z);
    setObjective(G.race.name, 'Ring ' + (G.race.idx + 1) + '/' + G.race.rings.length + ' — drive through the gold rings');
  }
}

// ---------- taxi ----------
export function startTaxi() {
  if (!G.player.car) { toast('You need a car for a fare'); return; }
  if (G.taxi.active) return;
  // pick a district far from the player (DISTRICTS use cx/cz, not x/z)
  let dest = null;
  for (let tries = 0; tries < 8 && !dest; tries++) {
    const d = DISTRICTS[randi(0, DISTRICTS.length - 1)];
    if (dist2(d.cx, d.cz, G.player.pos.x, G.player.pos.z) > 60) dest = d;
  }
  if (!dest) dest = DISTRICTS[randi(0, DISTRICTS.length - 1)];
  const d = dist2(dest.cx, dest.cz, G.player.pos.x, G.player.pos.z);
  const fare = clamp(Math.round(d * 1.5), 120, 400);
  G.taxi = { active: true, passenger: 'Rider', dest: { x: dest.cx, z: dest.cz, name: dest.name }, fare };
  setObjective('Taxi — ' + dest.name, 'Drop off the passenger • $' + fare);
  toast('Passenger picked up — take them to ' + dest.name);
}

function updateTaxi(dt) {
  if (!G.taxi.active) return;
  if (!G.player.car) {
    G.taxi.active = false;
    clearObjective();
    toast('Passenger left — fare cancelled');
    return;
  }
  const p = G.player.pos;
  const dest = G.taxi.dest;
  if (dist2(p.x, p.z, dest.x, dest.z) < 16) {
    addMoney(G.taxi.fare);
    G.stats.fares++;
    audio.cash();
    toast('Fare complete! +$' + G.taxi.fare);
    G.taxi.active = false;
    clearObjective();
  }
}

// ---------- chop shop + garage ----------
const SELL_PRICES = { sedan: 900, sports: 1800, suv: 1200, pickup: 1100, van: 800, truck: 1000, taxi: 1000, motorcycle: 1400, boat: 2200 };
const CAR_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8c832, 0x2e8b6a, 0x8e44ad, 0xe8e8e8, 0x1a1a1a, 0xc97b2a, 0x4ecdc4, 0x7a7a7a];

function updateChopGarage() {
  const p = G.player;
  if (!G.city) return;
  // chop shop: sell the car you are driving
  if (p.car && dist2(p.pos.x, p.pos.z, G.city.chop.x, G.city.chop.z) < 9) {
    showHint('Press E — Sell this car');
    if (window.__ePressed) {
      const car = p.car;
      const price = SELL_PRICES[car.type] || 800;
      addMoney(price);
      audio.cash();
      toast('Car sold for $' + price);
      G.scene.remove(car.group);
      const ci = G.cars.indexOf(car);
      if (ci >= 0) G.cars.splice(ci, 1);
      const ti = G.traffic.indexOf(car);
      if (ti >= 0) G.traffic.splice(ti, 1);
      p.car = null;
      p.onFoot = true;
      p.group.visible = true;
      p.group.position.copy(p.pos);
    }
    return;
  }
  // garage: respray the car you are driving ($100)
  if (p.car && dist2(p.pos.x, p.pos.z, G.city.garage.x, G.city.garage.z) < 9) {
    showHint('Press E — Respray ($100)');
    if (window.__ePressed) {
      if (G.money < 100) { toast('Not enough cash for a respray'); return; }
      G.money -= 100;
      const nc = CAR_COLORS[randi(0, CAR_COLORS.length - 1)];
      p.car.color = nc;
      const body = p.car.group.children[0];
      if (body && body.material && body.material.color) body.material.color.setHex(nc);
      audio.blip(520, 0.12, 'sine', 0.15);
      toast('Resprayed — fresh paint!');
    }
    return;
  }
}

// ---------- store robbery (hold E) ----------
let robProgress = 0;
let robCooldownUntil = 0;

function updateStoreRobbery(dt) {
  const p = G.player;
  if (!G.city || !G.city.stores) return;
  if (!p.onFoot) { robProgress = 0; return; }
  let near = null;
  for (const s of G.city.stores) {
    if (dist2(p.pos.x, p.pos.z, s.x, s.z) < 8) { near = s; break; }
  }
  if (!near) { robProgress = 0; return; }
  if (performance.now() < robCooldownUntil) {
    showHint('This shop was just hit — come back later');
    return;
  }
  if (window.__eHeld) {
    robProgress += dt;
    showHint('Robbing ' + near.name + '… ' + Math.round((robProgress / 3) * 100) + '%');
    if (robProgress >= 3) {
      robProgress = 0;
      robCooldownUntil = performance.now() + 60000;
      G.stats.robberies++;
      addMoney(800);
      addHeat(25);
      audio.cash();
      toast(' till emptied! +$800 — RUN!');
      hideHint();
    }
  } else {
    if (robProgress > 0) { robProgress = 0; hideHint(); }
    else showHint('Hold E — Rob ' + near.name);
  }
}

// ---------- golden shells ----------
function updateShells() {
  const p = G.player;
  if (!G.city || !G.city.shells || !p.onFoot) return;
  for (const sh of G.city.shells) {
    if (sh.taken) continue;
    if (dist2(p.pos.x, p.pos.z, sh.x, sh.z) < 2.5) {
      sh.taken = true;
      if (sh.mesh) sh.mesh.visible = false;
      G.shellsTaken++;
      addMoney(500);
      audio.cash();
      toast('Golden shell found! +$500 (' + G.shellsTaken + '/20)');
      break;
    }
  }
}

// ---------- safehouses ----------
function updateSafehouses() {
  const p = G.player;
  if (!p.onFoot) return;
  for (let i = 0; i < SAFEHOUSES.length; i++) {
    const sh = SAFEHOUSES[i];
    const owned = (G.safehousesOwned || []).includes(i);
    if (dist2(p.pos.x, p.pos.z, sh.x, sh.z) < 6) {
      if (owned) {
        showHint('Press E — Enter ' + sh.name + ' (rest + save)');
        if (window.__ePressed) {
          G.health = 100;
          autosave();
          audio.blip(660, 0.15, 'sine', 0.15);
          toast('Home sweet home — healed + saved');
        }
      } else {
        showHint('Press E — Buy ' + sh.name + ' ($' + sh.price.toLocaleString() + ')');
        if (window.__ePressed) {
          if (G.money < sh.price) { toast('Not enough cash for ' + sh.name); return; }
          G.money -= sh.price;
          if (!Array.isArray(G.safehousesOwned)) G.safehousesOwned = [];
          G.safehousesOwned.push(i);
          if (sh.ownedSign) sh.ownedSign.visible = true;
          autosave();
          audio.cash();
          toast(sh.name + ' is yours now!');
        }
      }
      return;
    }
  }
}

// ---------- gun shop ----------
function updateGunshop() {
  const p = G.player;
  if (!G.city || !G.city.gunshop || !p.onFoot) return;
  const gs = G.city.gunshop;
  if (dist2(p.pos.x, p.pos.z, gs.x, gs.z) < 8) {
    const next = G.weapons.findIndex((w) => w.locked);
    if (next < 0) {
      showHint('SOLARA ARMS — you own every weapon');
      return;
    }
    const w = G.weapons[next];
    showHint('Press E — Buy ' + w.name + ' ($' + w.price.toLocaleString() + ')');
    if (window.__ePressed) {
      if (buyWeapon(next)) {
        audio.cash();
        toast(w.name + ' purchased!');
      } else {
        toast('Not enough cash for the ' + w.name);
      }
    }
  }
}

// ---------- stunt jumps ----------
function updateStuntJump() {
  if (!G.stuntJump) return;
  const sj = G.stuntJump;
  G.stuntJump = null;
  if (!Array.isArray(G.jumpsDone)) G.jumpsDone = [];
  const isNew = !G.jumpsDone.includes(sj.ramp);
  let bonus;
  if (isNew) {
    G.jumpsDone.push(sj.ramp);
    bonus = 150 + Math.round(sj.airTime * 200);
    toast('STUNT JUMP! Air ' + sj.airTime.toFixed(1) + 's — +$' + bonus + ' (new ramp)');
  } else {
    bonus = 50;
    toast('Stunt jump +$50');
  }
  addMoney(bonus);
  audio.cash();
}

// ---------- courier missions (v3.4) ----------
// Pick up a parcel at the depot (on foot, E), deliver it to a drop point
// (on foot, E) before the timer runs out. Payout scales with distance.
const COURIER_TIME = 100; // seconds per delivery
let courierMarker = null;

function makeCourierMarker(x, z) {
  removeCourierMarker();
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 30, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  beam.position.y = 15;
  g.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd24a })
  );
  gem.position.y = 4;
  g.add(gem);
  g.position.set(x, 0, z);
  G.scene.add(g);
  courierMarker = g;
  return g;
}

function removeCourierMarker() {
  if (courierMarker) {
    G.scene.remove(courierMarker);
    courierMarker = null;
  }
}

function startCourier() {
  const c = G.courier;
  if (c.active) return;
  // pick a drop point, preferring a different one from the last delivery
  let drop = null;
  for (let tries = 0; tries < 6 && !drop; tries++) {
    const d = COURIER_DROPS[randi(0, COURIER_DROPS.length - 1)];
    if (d.name !== c.lastDrop) drop = d;
  }
  if (!drop) drop = COURIER_DROPS[randi(0, COURIER_DROPS.length - 1)];
  const d = dist2(drop.x, drop.z, COURIER_DEPOT.x, COURIER_DEPOT.z);
  const payout = clamp(Math.round(d * 1.2), 150, 350);
  c.active = true;
  c.dest = drop;
  c.payout = payout;
  c.timeLeft = COURIER_TIME;
  c.lastShownSec = -1;
  makeCourierMarker(drop.x, drop.z);
  setObjective('Courier — ' + drop.name, 'Deliver the parcel • $' + payout + ' • ' + COURIER_TIME + 's left');
  audio.blip(760, 0.12, 'sine', 0.18);
  toast('Parcel picked up — deliver to ' + drop.name);
}

function endCourier(win) {
  const c = G.courier;
  if (win) {
    addMoney(c.payout);
    if (typeof G.stats.deliveries !== 'number') G.stats.deliveries = 0;
    G.stats.deliveries++;
    c.lastDrop = c.dest ? c.dest.name : null;
    audio.cash();
    toast('Delivered! +$' + c.payout + ' (' + G.stats.deliveries + ' deliveries)');
  } else {
    toast('Delivery failed — too slow. Pick up a new parcel at the depot.');
  }
  c.active = false;
  c.dest = null;
  c.payout = 0;
  c.timeLeft = 0;
  removeCourierMarker();
  clearObjective();
}

function updateCourier(dt) {
  const c = G.courier;
  if (!c) return;
  const p = G.player;
  // near the depot, no active delivery: offer to start one
  if (!c.active && p.onFoot && dist2(p.pos.x, p.pos.z, COURIER_DEPOT.x, COURIER_DEPOT.z) < 6) {
    showHint('Press E — Start a courier delivery');
    if (window.__ePressed) startCourier();
    return;
  }
  if (!c.active) return;
  // countdown
  c.timeLeft -= dt;
  const sec = Math.max(0, Math.ceil(c.timeLeft));
  if (sec !== c.lastShownSec && c.dest) {
    c.lastShownSec = sec;
    setObjective('Courier — ' + c.dest.name, 'Deliver the parcel • $' + c.payout + ' • ' + sec + 's left');
  }
  if (c.timeLeft <= 0) { endCourier(false); return; }
  // at the drop point, on foot: deliver with E
  if (c.dest && p.onFoot && dist2(p.pos.x, p.pos.z, c.dest.x, c.dest.z) < 6) {
    showHint('Press E — Deliver the parcel ($' + c.payout + ')');
    if (window.__ePressed) endCourier(true);
  }
}

// ---------- init + per-frame ----------
export function initSideSystems() {
  if (!Array.isArray(G.jumpsDone)) G.jumpsDone = [];
  if (!Array.isArray(G.safehousesOwned)) G.safehousesOwned = [];
  if (typeof G.stats.distance !== 'number') G.stats.distance = 0;
  if (typeof G.stats.maxWanted !== 'number') G.stats.maxWanted = 0;
  if (typeof G.stats.deliveries !== 'number') G.stats.deliveries = 0;
  if (!G.courier) G.courier = { active: false, dest: null, payout: 0, timeLeft: 0, lastDrop: null, lastShownSec: -1 };
  // restore owned-safehouse signs after a load
  for (let i = 0; i < SAFEHOUSES.length; i++) {
    if ((G.safehousesOwned || []).includes(i) && SAFEHOUSES[i].ownedSign) {
      SAFEHOUSES[i].ownedSign.visible = true;
    }
  }
  // parked motorcycles + harbour boat (v3.4)
  spawnParkedVehicles();
}

export function updateSideSystems(dt) {
  const p = G.player;
  if (!p || G.title || G.paused || G.gameOver) return;
  // career counters
  if (typeof G.stats.distance !== 'number') G.stats.distance = 0;
  if (typeof G.stats.maxWanted !== 'number') G.stats.maxWanted = 0;
  if (typeof G.stats.deliveries !== 'number') G.stats.deliveries = 0;
  if (p.onFoot) {
    if (p.speed > 0.3) G.stats.distance += p.speed * dt;
  } else if (p.car) {
    G.stats.distance += Math.abs(p.car.speed) * dt;
  }
  if (G.wanted > G.stats.maxWanted) G.stats.maxWanted = G.wanted;

  // F5 quick save (v3.4) — input.js already preventDefaults F5 so the page
  // never reloads; here we just save to slot 0.
  if (input.wasPressed('F5')) {
    saveSlot(0);
    toast('Quick saved');
  }

  updateRace(dt);
  updateTaxi(dt);
  updateChopGarage();
  updateStoreRobbery(dt);
  updateShells();
  updateSafehouses();
  updateGunshop();
  updateStuntJump();
  updateCourier(dt);

  // hide the contextual hint when nothing is near
  let nearAny = false;
  if (G.city) {
    if (p.car) {
      if (dist2(p.pos.x, p.pos.z, G.city.chop.x, G.city.chop.z) < 9) nearAny = true;
      if (dist2(p.pos.x, p.pos.z, G.city.garage.x, G.city.garage.z) < 9) nearAny = true;
    } else {
      if (G.city.stores) for (const s of G.city.stores) if (dist2(p.pos.x, p.pos.z, s.x, s.z) < 8) nearAny = true;
      if (G.city.gunshop && dist2(p.pos.x, p.pos.z, G.city.gunshop.x, G.city.gunshop.z) < 8) nearAny = true;
      for (const sh of SAFEHOUSES) if (dist2(p.pos.x, p.pos.z, sh.x, sh.z) < 6) nearAny = true;
      if (!G.courier.active && dist2(p.pos.x, p.pos.z, COURIER_DEPOT.x, COURIER_DEPOT.z) < 6) nearAny = true;
      if (G.courier.active && G.courier.dest && dist2(p.pos.x, p.pos.z, G.courier.dest.x, G.courier.dest.z) < 6) nearAny = true;
    }
  }
  if (!nearAny) hideHint();
}
