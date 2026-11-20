// Solara City 3D — 10 story missions: named contacts, dialogue, multi-stage objectives, payouts.
import * as THREE from 'three';
import { G, addMoney, addHeat, dist2, clamp } from './state.js';
import { setObjective, clearObjective, showDialogue, toast, advanceDialogue } from './hud.js';
import { spawnCar, spawnPolice } from './vehicles.js';
import { spawnEnemy, clearEnemies } from './combat.js';
import { audio } from './audio.js';
import { autosave } from './save.js';

export const MISSIONS = [
  { name: 'Welcome to Solara', contact: 'Marco', payout: 800,
    intro: [{ name: 'Marco', text: 'You made it. Solara City — seven districts, one king, and right now that king is not you.' }, { name: 'Marco', text: 'Prove yourself. Come meet me at Marina Bay. Follow the gold marker.' }],
    stages: [{ type: 'goto', x: 104, z: 52, label: 'Meet Marco at Marina Bay' }] },
  { name: 'The Package', contact: 'Marco', payout: 1500,
    intro: [{ name: 'Marco', text: 'A package is waiting in Old Town. Pick it up, bring it to the docks. No questions, no cops.' }],
    stages: [
      { type: 'goto', x: -104, z: -104, label: 'Pick up the package in Old Town' },
      { type: 'goto', x: 104, z: -104, label: 'Deliver the package to Harbor Docks' },
    ] },
  { name: 'Hot Wheels', contact: 'Lena', payout: 2500,
    intro: [{ name: 'Lena', text: 'I need a Falco Sport — the red one. Steal any fast car and bring it to my chop shop at the Harbor.' }],
    stages: [{ type: 'steal', x: 104, z: -104, label: 'Steal a car and deliver it to the Chop Shop' }] },
  { name: 'Turf War', contact: 'Rico', payout: 4000,
    intro: [{ name: 'Rico', text: 'The Red Vipers took our corner on Beachfront. Clear them out. All of them. I will pay good.' }],
    stages: [{ type: 'kill', x: 0, z: 156, n: 5, label: 'Clear the Red Vipers from Beachfront (0/5)' }] },
  { name: 'The Getaway', contact: 'Marco', payout: 5000,
    intro: [{ name: 'Marco', text: 'The cops are onto us. Lose them — all of them — and do not get caught. Run, kid.' }],
    stages: [{ type: 'escape', label: 'Lose the police (stay out of sight)' }] },
  { name: 'Bank Job', contact: 'Lena', payout: 12000,
    intro: [{ name: 'Lena', text: 'Downtown Bank. In, out, gone. Hold E at the vault, then lose the heat. This one makes you rich.' }],
    stages: [
      { type: 'rob', x: 52, z: -52, label: 'Rob the Downtown Bank (hold E)' },
      { type: 'escape', label: 'Escape the police' },
    ] },
  { name: 'Street King', contact: 'Rico', payout: 8000,
    intro: [{ name: 'Rico', text: 'Three races. Sunset Sprint, Old Town Loop, Beachfront Dash. Win them all and the streets are yours.' }],
    stages: [{ type: 'races', label: 'Win 3 street races (0/3)' }] },
  { name: 'The Informant', contact: 'Marco', payout: 10000,
    intro: [{ name: 'Marco', text: 'An informant is running to the island with our names. Chase his car down and stop him — hard.' }],
    stages: [{ type: 'chase', label: 'Chase down the informant (ram his car)' }] },
  { name: 'Harbor Heist', contact: 'Lena', payout: 20000,
    intro: [{ name: 'Lena', text: 'A cargo truck at the Harbor holds twenty grand of product. Take the truck. Bring it to the garage.' }],
    stages: [{ type: 'steal', x: -104, z: 52, label: 'Steal the cargo truck and bring it to the Garage' }] },
  { name: 'King of Solara', contact: 'Marco', payout: 50000,
    intro: [{ name: 'Marco', text: 'This is it. The Vipers hold Isla Verde. Survive their assault, take the island, and Solara is yours.' }],
    stages: [{ type: 'survive', x: 330, z: 0, t: 60, label: 'Survive the assault on Isla Verde' }] },
];

let markerGroup = null;
let stageState = {};
let robProgress = 0;

export function setMarker(x, z) {
  clearMarker();
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  beam.position.y = 30; g.add(beam);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd23d })
  );
  orb.position.y = 7; g.add(orb);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; g.add(ring);
  g.position.set(x, 0, z);
  G.scene.add(g);
  markerGroup = g;
  G.marker = { x, z, group: g };
}
export function clearMarker() {
  if (markerGroup) G.scene.remove(markerGroup);
  markerGroup = null; G.marker = null;
}

export function startMission(i) {
  const m = MISSIONS[i];
  if (!m) return;
  G.missionIndex = i;
  G.mission = { def: m, stage: 0, done: false };
  stageState = {};
  showDialogue(m.intro);
  setObjective(m.name + ' — ' + m.contact, m.stages[0].label);
  enterStage();
}

function enterStage() {
  const m = G.mission.def, st = m.stages[G.mission.stage];
  stageState = {};
  if (st.type === 'goto' || st.type === 'kill' || st.type === 'rob') setMarker(st.x, st.z);
  else if (st.type === 'steal') setMarker(st.x, st.z);
  else if (st.type === 'survive') setMarker(st.x, st.z);
  else if (st.type === 'escape') { clearMarker(); if (G.wanted < 2) { G.heat = 55; G.wanted = 3; spawnPolice(2); } }
  else if (st.type === 'chase') {
    clearMarker();
    const car = spawnCar(G.player.pos.x + 40, G.player.pos.z - 30, 0, { color: 0x111111, driver: 'flee' });
    car.speed = 20; car.ai = { targetSpeed: 26 };
    car.flee = true; stageState.target = car; stageState.hits = 0;
    setMarker(car.group.position.x, car.group.position.z);
  }
  else if (st.type === 'races') { clearMarker(); toast('Go to a race start (◆ on the map) and press E'); }
  setObjective(m.name + ' — ' + m.contact, st.label);
}

function nextStage() {
  const m = G.mission;
  m.stage++;
  if (m.stage >= m.def.stages.length) completeMission();
  else enterStage();
}

function completeMission() {
  const m = G.mission.def;
  addMoney(m.payout);
  G.missionsDone.push(m.name);
  G.respect = Math.min(5, G.respect + 1);
  clearEnemies();
  clearMarker();
  clearObjective();
  toast(`MISSION COMPLETE — ${m.name} · +$${m.payout.toLocaleString()}`, 4200);
  audio.cash();
  G.mission = null;
  autosave();
  // start the next mission after a beat
  if (G.missionIndex + 1 < MISSIONS.length) {
    setTimeout(() => { if (!G.mission && !G.title && !G.gameOver) startMission(G.missionIndex + 1); }, 3500);
  } else {
    toast('YOU ARE THE KING OF SOLARA CITY', 6000);
  }
}

export function updateMissions(dt) {
  if (!G.mission) return;
  const m = G.mission.def, st = m.stages[G.mission.stage];
  const p = G.player.pos;
  if (markerGroup) {
    markerGroup.rotation.y += dt * 1.2;
    const s = 1 + Math.sin(performance.now() / 300) * 0.12;
    markerGroup.scale.set(s, 1, s);
  }
  switch (st.type) {
    case 'goto':
      if (dist2(p.x, p.z, st.x, st.z) < 7) { audio.blip(880, 0.15, 'sine', 0.15); nextStage(); }
      break;
    case 'kill': {
      if (!stageState.spawned) {
        stageState.spawned = true;
        for (let k = 0; k < st.n; k++) spawnEnemy(st.x + (k - 2) * 5, st.z + (k % 2) * 6);
        stageState.total = st.n;
      }
      const left = G.enemies.filter((e) => !e.dead).length;
      setObjective(m.name + ' — ' + m.contact, `Clear the Red Vipers from Beachfront (${st.n - left}/${st.n})`);
      if (left === 0) nextStage();
      break;
    }
    case 'steal':
      if (!G.player.onFoot && G.player.car && dist2(p.x, p.z, st.x, st.z) < 9) {
        toast('Delivered. Nice wheels.'); nextStage();
      }
      break;
    case 'escape':
      if (G.wanted === 0) {
        G.stats.copsEvaded++;
        toast('You lost them. Clean.'); nextStage();
      }
      break;
    case 'rob': {
      const near = dist2(p.x, p.z, st.x, st.z) < 8;
      if (near && G.keys && document.getElementById('hud')) {
        // hold E handled in main loop via input; here we just track progress flag
      }
      if (stageState.held) {
        robProgress += dt;
        setObjective(m.name + ' — ' + m.contact, `Cracking the vault… ${Math.round((robProgress / 3) * 100)}%`);
        if (robProgress >= 3) {
          robProgress = 0;
          G.stats.robberies++;
          addMoney(3000);
          addHeat(45);
          toast('Vault open! +$3,000 — RUN!');
          nextStage();
        }
      }
      break;
    }
    case 'races': {
      const won = G.stats.racesWon;
      setObjective(m.name + ' — ' + m.contact, `Win 3 street races (${won}/3)`);
      if (won >= 3) nextStage();
      break;
    }
    case 'chase': {
      const t = stageState.target;
      if (!t || !G.cars.includes(t)) { nextStage(); return; }
      setMarker(t.group.position.x, t.group.position.z);
      // fleeing car drives away from player
      const dx = t.group.position.x - p.x, dz = t.group.position.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      t.yaw = Math.atan2(dx, dz);
      t.speed = Math.min(t.speed + 6 * dt, 26);
      t.group.position.x += Math.sin(t.yaw) * t.speed * dt;
      t.group.position.z += Math.cos(t.yaw) * t.speed * dt;
      t.group.rotation.y = t.yaw;
      const dd = dist2(t.group.position.x, t.group.position.z, p.x, p.z);
      if (dd < 5) {
        stageState.hits = (stageState.hits || 0) + dt;
        if (stageState.hits > 2.5) {
          t.health = 0;
          const idx = G.cars.indexOf(t);
          if (idx >= 0) G.cars.splice(idx, 1);
          G.scene.remove(t.group);
          toast('Informant stopped.');
          nextStage();
        }
      } else stageState.hits = 0;
      break;
    }
    case 'survive': {
      if (!stageState.spawned) {
        stageState.spawned = true; stageState.t = st.t; stageState.wave = 0;
      }
      stageState.t -= dt;
      stageState.wave -= dt;
      if (stageState.wave <= 0 && G.enemies.filter((e) => !e.dead).length < 4) {
        stageState.wave = 6;
        for (let k = 0; k < 3; k++) spawnEnemy(p.x + (Math.random() < 0.5 ? -1 : 1) * 25, p.z + (Math.random() < 0.5 ? -1 : 1) * 25, 80);
      }
      setObjective(m.name + ' — ' + m.contact, `Survive the assault — ${Math.ceil(stageState.t)}s left`);
      if (stageState.t <= 0) nextStage();
      break;
    }
  }
}

// called from main when E is held near the current objective
export function holdInteract(dt) {
  if (!G.mission) return;
  const st = G.mission.def.stages[G.mission.stage];
  if (st.type === 'rob') stageState.held = true;
}
export function releaseInteract() { stageState.held = false; robProgress = 0; }
