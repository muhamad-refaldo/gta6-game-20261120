// Solara City 3D — side systems: street races, taxi fares, chop shop, store robbery,
// garage/respray, radio, golden shells, respect ranks and crew.
import * as THREE from 'three';
import { G, addMoney, addHeat, dist2, rand, pick } from './state.js';
import { setObjective, clearObjective, toast, showHint, hideHint } from './hud.js';
import { audio } from './audio.js';
import { buyWeapon } from './combat.js';

let raceState = null;

export function initSideSystems() {
  // race checkpoint rings are created on race start
}

export function nearestRaceStart(maxD = 10) {
  for (const r of G.city.raceStarts) {
    if (dist2(G.player.pos.x, G.player.pos.z, r.x, r.z) < maxD) return r;
  }
  return null;
}

function makeRing(x, z, color = 0x4ecdc4) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.35, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.y = Math.PI / 2;
  ring.position.set(x, 2.5, z);
  G.scene.add(ring);
  return ring;
}

export function startRace(def) {
  if (!G.player.car) { toast('You need a car to race!'); return; }
  const pts = [];
  const cx = def.x, cz = def.z;
  for (let k = 0; k < def.len; k++) {
    const a = (k / def.len) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * 90, z: cz + Math.sin(a) * 90 });
  }
  pts.push({ x: cx, z: cz });
  const rings = pts.map((p) => makeRing(p.x, p.z));
  raceState = { def, pts, idx: 0, rings, t: 0, prize: 2500 + def.len * 1000 };
  setObjective('STREET RACE — ' + def.name, 'Hit the rings! (0/' + pts.length + ')');
  toast('Race started — hit every ring!');
  audio.blip(660, 0.2, 'square', 0.15);
}

function endRace(win) {
  if (!raceState) return;
  for (const r of raceState.rings) G.scene.remove(r);
  if (win) {
    addMoney(raceState.prize);
    G.stats.racesWon++;
    toast(`RACE WON! +$${raceState.prize.toLocaleString()}`, 4000);
    audio.cash();
  } else toast('Race failed.');
  raceState = null;
  clearObjective();
  if (G.mission) setObjective(G.mission.def.name + ' — ' + G.mission.def.contact, G.mission.def.stages[G.mission.stage].label);
}

export function updateRace(dt) {
  if (!raceState) return;
  raceState.t += dt;
  const p = G.player.pos;
  const target = raceState.pts[raceState.idx];
  const d = dist2(p.x, p.z, target.x, target.z);
  if (d < 8) {
    G.scene.remove(raceState.rings[raceState.idx]);
    raceState.idx++;
    setObjective('STREET RACE — ' + raceState.def.name, `Hit the rings! (${raceState.idx}/${raceState.pts.length})`);
    audio.blip(990, 0.12, 'sine', 0.15);
    if (raceState.idx >= raceState.pts.length) { endRace(true); return; }
  }
  if (raceState.t > 150) endRace(false);
  if (!G.player.car) endRace(false);
}

// ---- taxi ----
export function startTaxi() {
  if (G.taxi.active) return;
  const dests = [{ x: 104, z: 52, name: 'Marina Bay' }, { x: -104, z: -104, name: 'Old Town' }, { x: 0, z: 156, name: 'Beachfront' }, { x: 104, z: -104, name: 'Harbor Docks' }];
  const d = pick(dests);
  G.taxi = { active: true, dest: d, fare: rand(120, 320) | 0 };
  setObjective('TAXI FARE', `Drive your passenger to ${d.name} — $${G.taxi.fare}`);
  toast('Passenger picked up! Drive to ' + d.name);
}
export function updateTaxi() {
  if (!G.taxi.active) return;
  const d = G.taxi.dest;
  if (dist2(G.player.pos.x, G.player.pos.z, d.x, d.z) < 9) {
    addMoney(G.taxi.fare);
    G.stats.fares++;
    toast(`Fare paid! +$${G.taxi.fare}`);
    audio.cash();
    G.taxi = { active: false, dest: null, fare: 0 };
    clearObjective();
  }
}

// ---- chop shop / garage / stores ----
export function updateShops(dt) {
  const p = G.player.pos;
  // chop shop: sell a stolen car
  if (dist2(p.x, p.z, G.city.chop.x, G.city.chop.z) < 8 && !G.player.onFoot) {
    showHint('Press E to sell this car at the Chop Shop');
    if (window.__ePressed) {
      const car = G.player.car;
      const val = Math.round(car.top * 40);
      addMoney(val);
      toast(`Car sold at the Chop Shop! +$${val.toLocaleString()}`);
      audio.cash();
      const idx = G.cars.indexOf(car);
      if (idx >= 0) G.cars.splice(idx, 1);
      G.scene.remove(car.group);
      // put player on foot
      G.player.car = null; G.player.onFoot = true;
      G.player.group.visible = true;
      G.player.group.position.copy(p);
      window.__ePressed = false;
    }
  }
  // garage: respray + repair
  if (dist2(p.x, p.z, G.city.garage.x, G.city.garage.z) < 8 && !G.player.onFoot) {
    showHint('Press R to respray & repair ($300)');
    if (window.__rPressed) {
      if (G.money >= 300) {
        G.money -= 300;
        const car = G.player.car;
        car.health = 100;
        const nc = pick([0xd43d2a, 0x2a6fd4, 0xe8c832, 0x3aa655, 0x7a4fd4, 0x4fd4c2]);
        car.group.children[0].material = new THREE.MeshLambertMaterial({ color: nc });
        car.color = nc;
        toast('Resprayed & repaired!');
        audio.blip(760, 0.15, 'sine', 0.12);
      } else toast('Not enough cash ($300).');
      window.__rPressed = false;
    }
  }
  // stores: rob (hold E) — only when on foot and no active rob mission
  for (const s of G.city.stores) {
    if (s.kind !== 'store') continue;
    if (dist2(p.x, p.z, s.x, s.z) < 7 && G.player.onFoot) {
      showHint('Hold E to rob ' + s.name);
      if (window.__eHeld) {
        s.robT = (s.robT || 0) + dt;
        if (s.robT > 2.5) {
          const take = rand(200, 700) | 0;
          addMoney(take);
          G.stats.robberies++;
          addHeat(25);
          toast(`Robbed ${s.name}! +$${take} — the cops are coming!`);
          audio.cash();
          s.robT = 0;
          window.__eHeld = false;
        }
      } else s.robT = 0;
    }
  }
}

// ---- golden shells ----
export function updateShells() {
  const p = G.player.pos;
  for (const s of G.city.shells) {
    if (s.taken) continue;
    s.mesh.rotation.y += 0.03;
    s.mesh.position.y = 1.2 + Math.sin(performance.now() / 400 + s.x) * 0.25;
    if (dist2(p.x, p.z, s.x, s.z) < 3) {
      s.taken = true;
      G.scene.remove(s.mesh);
      G.shellsTaken++;
      addMoney(500);
      toast(`Golden shell found! (${G.shellsTaken}/20) +$500`);
      audio.cash();
    }
  }
}

// ---- respect + crew ----
export function updateRespect(dt) {
  const r = Math.min(5, Math.floor(G.missionsDone.length / 2) + Math.floor(G.stats.racesWon / 2) + Math.floor(G.shellsTaken / 10));
  if (r !== G.respect) { G.respect = r; toast(`RESPECT RANK ${r} — the streets know your name`); }
  // crew member follows after mission 5
  if (G.missionsDone.length >= 5 && !G.crew) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), mat);
    body.position.y = 1.35; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0x8a5a3b }));
    head.position.y = 2.15; g.add(head);
    g.position.copy(G.player.pos);
    G.scene.add(g);
    G.crew = { group: g };
    toast('Your crew has your back now.');
  }
  if (G.crew) {
    const c = G.crew.group.position;
    const dx = G.player.pos.x - c.x, dz = G.player.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 4) {
      c.x += (dx / d) * 5 * dt; c.z += (dz / d) * 5 * dt;
      G.crew.group.rotation.y = Math.atan2(dx, dz);
    }
  }
}

export function updateSideSystems(dt) {
  updateRace(dt);
  updateTaxi();
  updateShops(dt);
  updateShells();
  updateRespect(dt);
}

export function buyWeaponAtStore(i) { return buyWeapon(i); }
