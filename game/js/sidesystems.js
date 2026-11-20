// Solara City 3D v3.3 — side systems: street races, taxi fares, store robbery,
// chop shop, garage respray, gun shop, safehouses, stunt jumps, golden shells,
// crew, respect toasts and career-stat counters.
// Fresh rewrite for v3.3. Exports: initSideSystems, updateSideSystems,
// nearestRaceStart, startRace, startTaxi.
import * as THREE from 'three';
import { G, addMoney, addHeat, dist2, clamp, randi, DISTRICTS, districtAt } from './state.js';
import { toast, setObjective, clearObjective, showHint, hideHint } from './hud.js';
import { RAMPS, SAFEHOUSES } from './city.js';
import { buyWeapon } from './combat.js';
import { autosave } from './save.js';
import { audio } from './audio.js';

// ---------- race ----------
const RACE_REWARD = 8500;
const RACE_RING_OFFSETS = [
  [0, -52], [-52, -52], [-52, -104], [0, -104], [52, -104], [52, -52], [52, 0],
];

export function nearestRaceStart(maxD) {
  if (!G.city || !G.player) return null;
  let best = null, bd = maxD;
  for (const rs of G.city.raceStarts) {
    const d = dist2(rs.x, rs.z, G.player.pos.x, G.player.pos.z);
    if (d < bd) { bd = d; best = rs; }
  }
  return best;
}

function ringPositions(rs, total) {
  const pts = [];
  for (let i = 0; i < total && i < RACE_RING_OFFSETS.length; i++) {
    const [ox, oz] = RACE_RING_OFFSETS[i];
    pts.push({ x: rs.x + ox, z: rs.z + oz });
  }
  return pts;
}

export function startRace(rs) {
  if (G.race) { toast('A race is already running — hit the rings!'); return; }
  if (!G.player.car) { toast('You need a car to race!'); return; }
  const total = rs.len + 1;
  const pts = ringPositions(rs, total);
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = i === 0 ? { x: rs.x, z: rs.z } : pts[i - 1];
    const dx = pts[i].x - prev.x, dz = pts[i].z - prev.z;
    const yaw = Math.atan2(dx, dz);
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.35, 10, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23d })
    );
    mesh.position.set(pts[i].x, 2.5, pts[i].z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    G.scene.add(mesh);
    rings.push({ x: pts[i].x, z: pts[i].z, hit: false, mesh });
  }
  G.race = { name: rs.name, rings, hit: 0, total };
  setObjective('STREET RACE — ' + rs.name, `Hit the rings! (0/${total})`);
  toast('Race started — hit every ring!');
  audio.blip(880, 0.15, 'sine', 0.15);
}

function restoreObjective() {
  if (G.mission) {
    const m = G.mission.def, st = m.stages[G.mission.stage];
    setObjective(m.name + ' — ' + m.contact, st.label);
  } else clearObjective();
}

function finishRace() {
  const r = G.race;
  if (!r) return;
  for (const ring of r.rings) G.scene.remove(ring.mesh);
  G.race = null;
  G.stats.racesWon++;
  let payout = RACE_REWARD;
  if (G.crew) payout = Math.round(payout * (1 + G.crew.bonus));
  addMoney(payout);
  toast(`RACE WON! +$${payout.toLocaleString()}`);
  audio.cash();
  // first race win recruits a crew member (a driver who boosts race payouts)
  if (!G.crew) {
    G.crew = { name: 'Dante', role: 'Driver', bonus: 0.25 };
    toast('Dante joined your crew! (+25% race payout)', 4200);
  }
  restoreObjective();
}

// ---------- taxi ----------
export function startTaxi() {
  if (G.taxi.active) return;
  if (!G.player.car) return;
  const here = districtAt(G.player.pos.x, G.player.pos.z);
  const choices = DISTRICTS.filter((d) => d.name !== here.name);
  const d = choices[Math.floor(Math.random() * choices.length)];
  const dist = dist2(G.player.pos.x, G.player.pos.z, d.cx, d.cz);
  const fare = clamp(120 + Math.round(dist * 0.5), 120, 400);
  G.taxi = { active: true, passenger: null, dest: { x: d.cx, z: d.cz, name: d.name }, fare };
  setObjective('TAXI', `Drive your passenger to ${d.name} — $${fare}`);
  toast(`Taxi fare: ${d.name} — $${fare}`);
}

function finishTaxi() {
  const t = G.taxi;
  if (!t.active) return;
  G.stats.fares++;
  addMoney(t.fare);
  toast(`Fare paid! +$${t.fare}`);
  audio.cash();
  G.taxi = { active: false, passenger: null, dest: null, fare: 0 };
  restoreObjective();
}

// ---------- init ----------
let lastRespect = 0;
let lastPos = null;

export function initSideSystems() {
  G.race = null;
  G.taxi = { active: false, passenger: null, dest: null, fare: 0 };
  if (!G.crew) G.crew = null;
  if (!Array.isArray(G.jumpsDone)) G.jumpsDone = [];
  if (!Array.isArray(G.safehousesOwned)) G.safehousesOwned = [];
  if (typeof G.stats.distance !== 'number') G.stats.distance = 0;
  if (typeof G.stats.maxWanted !== 'number') G.stats.maxWanted = 0;
  lastRespect = G.respect || 0;
  lastPos = G.player ? { x: G.player.pos.x, z: G.player.pos.z } : null;
}

// ---------- per-frame ----------
const SELL_PRICES = { sedan: 900, sports: 1800, suv: 1200, pickup: 1100, van: 800, truck: 1000, taxi: 1000 };
const RESPRAY_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8c832, 0x2e8b6a, 0x8e44ad, 0xe8e8e8, 0x1a1a1a, 0xc97b2a, 0x4ecdc4, 0x7a7a7a];

export function updateSideSystems(dt) {
  const p = G.player;
  if (!p || G.title || !G.city) return;
  const now = performance.now() / 1000;

  // --- career counters: distance travelled + highest wanted ---
  if (lastPos) {
    const d = dist2(p.pos.x, p.pos.z, lastPos.x, lastPos.z);
    if (d < 50) G.stats.distance += d; // ignore teleports
  }
  lastPos = { x: p.pos.x, z: p.pos.z };
  if (G.wanted > (G.stats.maxWanted || 0)) G.stats.maxWanted = G.wanted;

  // --- respect rank toast ---
  if (G.respect > lastRespect) {
    toast(`RESPECT RANK ${G.respect} — the streets know your name`, 3600);
    lastRespect = G.respect;
  }

  // --- safehouse owned signs follow the save ---
  for (let i = 0; i < SAFEHOUSES.length; i++) {
    const sh = SAFEHOUSES[i];
    if (sh.ownedSign) sh.ownedSign.visible = (G.safehousesOwned || []).includes(i);
  }

  // --- golden shells ---
  for (const s of G.city.shells) {
    if (!s.taken && dist2(p.pos.x, p.pos.z, s.x, s.z) < 3.5) {
      s.taken = true;
      if (s.mesh) s.mesh.visible = false;
      G.shellsTaken++;
      addMoney(500);
      toast(`Golden shell found! (${G.shellsTaken}/20) +$500`);
      audio.cash();
    }
  }

  // --- street race: ring detection + ring bob ---
  if (G.race && p.car) {
    const carPos = p.car.group.position;
    for (const ring of G.race.rings) {
      if (ring.hit) continue;
      ring.mesh.position.y = 2.5 + Math.sin(now * 2 + ring.x) * 0.3;
      if (dist2(carPos.x, carPos.z, ring.x, ring.z) < 6) {
        ring.hit = true;
        ring.mesh.visible = false;
        G.race.hit++;
        audio.blip(1320, 0.12, 'sine', 0.15);
        setObjective(`STREET RACE — ${G.race.name}`, `Hit the rings! (${G.race.hit}/${G.race.total})`);
        if (G.race.hit >= G.race.total) finishRace();
      }
    }
  }

  // --- taxi arrival ---
  // District centres sit on shop block centres, so the car stops a few units
  // short of the exact point — a 16-unit radius keeps the fare completable.
  if (G.taxi.active && G.taxi.dest && p.car) {
    const cp = p.car.group.position;
    if (dist2(cp.x, cp.z, G.taxi.dest.x, G.taxi.dest.z) < 16) finishTaxi();
  }

  // --- store robbery (hold E on foot near a shop) ---
  for (const s of G.city.stores) {
    if (s.robT < 0) { s.robT += dt; if (s.robT > 0) s.robT = 0; continue; } // cooldown ticks back to 0
    if (!p.onFoot) continue;
    if (dist2(p.pos.x, p.pos.z, s.x, s.z) >= 12) { if (s.robT > 0) s.robT = 0; continue; }
    if (window.__eHeld) {
      s.robT += dt * 0.35;
      if (s.robT >= 1) {
        const payout = 200 + randi(0, 200);
        addMoney(payout);
        addHeat(12);
        G.stats.robberies++;
        toast(`Robbed ${s.name}! +$${payout}`);
        audio.cash();
        s.robT = -30; // 30s cooldown before this shop can be robbed again
      }
    } else if (s.robT > 0) {
      s.robT = 0; // letting go resets the crack
    }
  }

  // --- stunt jump bonus (reported by vehicles.js on landing) ---
  if (G.stuntJump) {
    const j = G.stuntJump;
    G.stuntJump = null;
    const idx = j.ramp;
    const isNew = idx !== undefined && !(G.jumpsDone || []).includes(idx);
    if (isNew) G.jumpsDone.push(idx);
    const bonus = isNew ? 150 + Math.round(j.airTime * 200) : 50;
    addMoney(bonus);
    const rampName = idx !== undefined && RAMPS[idx] ? RAMPS[idx].name : 'Stunt';
    toast(isNew ? `STUNT! New ramp — ${rampName} +$${bonus}` : `STUNT! +$${bonus}`);
    audio.cash();
  }

  // --- interactions: nearest hint + E / R presses ---
  // candidates: {d, hint, onPress, onR}
  let best = null;
  const consider = (d, hint, onPress) => {
    if (!best || d < best.d) best = { d, hint, onPress };
  };
  // safehouses (on foot, near the door)
  for (let i = 0; i < SAFEHOUSES.length; i++) {
    const sh = SAFEHOUSES[i];
    if (!p.onFoot) break;
    const d = dist2(p.pos.x, p.pos.z, sh.x, sh.z);
    if (d > 6) continue;
    const owned = (G.safehousesOwned || []).includes(i);
    if (owned) {
      consider(d, `Press E to enter ${sh.name} (save + heal)`, () => {
        autosave();
        G.health = 100;
        toast('Safehouse — game saved, health restored');
        audio.cash();
      });
    } else {
      consider(d, `Press E to buy ${sh.name} — $${sh.price.toLocaleString()}`, () => {
        if (G.money < sh.price) { toast(`Not enough cash — ${sh.name} costs $${sh.price.toLocaleString()}`); return; }
        G.money -= sh.price;
        if (!G.safehousesOwned.includes(i)) G.safehousesOwned.push(i);
        if (sh.ownedSign) sh.ownedSign.visible = true;
        toast(`${sh.name} is yours! Safehouse saved.`);
        audio.cash();
      });
    }
  }
  // stores (on foot, near the rob point)
  if (p.onFoot) {
    for (const s of G.city.stores) {
      const d = dist2(p.pos.x, p.pos.z, s.x, s.z);
      if (d > 12) continue;
      if (s.robT < 0) consider(d, `${s.name} — come back later`, null);
      else consider(d, `Hold E to rob ${s.name}`, null);
    }
  }
  // gun shop (on foot)
  if (p.onFoot && G.city.gunshop) {
    const gs = G.city.gunshop;
    const d = dist2(p.pos.x, p.pos.z, gs.x, gs.z);
    if (d <= 8) {
      const idx = G.weapons.findIndex((w) => w.locked);
      if (idx >= 0) {
        const w = G.weapons[idx];
        consider(d, `Press E to buy ${w.name} — $${w.price.toLocaleString()}`, () => {
          if (buyWeapon(idx)) { toast(`${w.name} purchased! — $${w.price.toLocaleString()}`); audio.cash(); }
          else toast(`Not enough cash — ${w.name} costs $${w.price.toLocaleString()}`);
        });
      } else {
        consider(d, 'All weapons owned', null);
      }
    }
  }
  // chop shop (in a car)
  if (!p.onFoot && p.car) {
    const d = dist2(p.pos.x, p.pos.z, G.city.chop.x, G.city.chop.z);
    if (d <= 10) {
      consider(d, 'Press E to sell this car at the Chop Shop', () => {
        const car = p.car;
        if (!car) return;
        const price = SELL_PRICES[car.type] || 800;
        addMoney(price);
        const gi = G.cars.indexOf(car);
        if (gi >= 0) G.cars.splice(gi, 1);
        G.scene.remove(car.group);
        p.car = null;
        p.onFoot = true;
        p.group.visible = true;
        p.pos.set(G.city.chop.x + 4, 0, G.city.chop.z + 4);
        p.group.position.copy(p.pos);
        toast(`Car sold at the Chop Shop! +$${price.toLocaleString()}`);
        audio.cash();
      });
    }
  }
  // garage (in a car) — R to respray
  if (!p.onFoot && p.car) {
    const d = dist2(p.pos.x, p.pos.z, G.city.garage.x, G.city.garage.z);
    if (d <= 10) {
      if (!best || d < best.d) best = { d, hint: 'Press R to respray & repair ($300)', onPress: null, onR: true };
    }
  }
  // race start (in a car) — E starts the race (handled by main.js)
  if (!p.onFoot && p.car && !G.race) {
    const rs = nearestRaceStart(10);
    if (rs) {
      const d = dist2(p.pos.x, p.pos.z, rs.x, rs.z);
      consider(d, `Press E to start ${rs.name}`, null);
    }
  }

  if (best) showHint(best.hint);
  else hideHint();

  // consume E / R for the chosen interaction
  if (best && best.onPress && window.__ePressed) best.onPress();
  if (best && best.onR && window.__rPressed) {
    const car = p.car;
    if (car) {
      if (G.money < 300) { toast('Not enough cash — respray costs $300'); }
      else {
        G.money -= 300;
        let nc = car.color;
        while (nc === car.color) nc = RESPRAY_COLORS[Math.floor(Math.random() * RESPRAY_COLORS.length)];
        car.color = nc;
        if (car.group.children[0] && car.group.children[0].material) {
          car.group.children[0].material.color.setHex(nc);
        }
        car.health = 100;
        toast('Resprayed & repaired!');
        audio.blip(660, 0.12, 'sine', 0.12);
      }
    }
  }
}
