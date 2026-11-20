// Solara City 3D — boot, golden-hour lighting, game loop, title, scenes, game over.
import * as THREE from 'three';
import { G, clamp, addHeat } from './state.js';
import { buildCity } from './city.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { createPlayer, updatePlayer, updateCamera, enterCar } from './player.js';
import { spawnCar, spawnTraffic, updateTraffic, updatePolice, updatePlayerCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { giveWeapons, updateCombat, currentWeapon } from './combat.js';
import { startMission, updateMissions, holdInteract, releaseInteract } from './missions.js';
import { initSideSystems, updateSideSystems, nearestRaceStart, startRace } from './sidesystems.js';
import { buildWeaponSlots, updateHUD, setObjective, toast, showHint, hideHint, advanceDialogue } from './hud.js';
import { openMapMenu, closeMapMenu, openPause, closePause, bindMapMenu } from './mapmenu.js';
import { saveSlot, loadSlot, listSlots, applySave } from './save.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
G.sceneMode = params.get('scene');

let lastT = performance.now();
let titleAngle = 0;

function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  $('game').appendChild(renderer.domElement);
  return renderer;
}

function initLights() {
  // golden-hour sun: low, warm, long shadows
  const sun = new THREE.DirectionalLight(0xffb36b, 3.0);
  sun.position.set(-140, 55, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
  G.scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xff9a5c, 0x5a4a3a, 1.1);
  G.scene.add(hemi);
  G.scene.fog = new THREE.Fog(0xe89a5a, 140, 460);
  G.scene.background = new THREE.Color(0xdd7a45);
}

function startGame(fromSave) {
  G.title = false;
  G.paused = false;
  G.camSnapped = false;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.init(); audio.resume();
  if (fromSave) {
    const s = loadSlot(0);
    if (s && applySave(s)) toast('Welcome back to Solara City');
    else toast('No save found — fresh start');
  }
  if (!G.mission && G.missionsDone.length === 0 && !fromSave) startMission(0);
  else if (G.mission) setObjective(G.mission.def.name + ' — ' + G.mission.def.contact, G.mission.def.stages[G.mission.stage].label);
  buildWeaponSlots();
}

function applyScene() {
  const mode = G.sceneMode;
  if (!mode || mode === 'title') return;
  startGame(false);
  if (mode === 'chase') {
    // player car on the north-south road x=26, heading south; police close behind
    const car = spawnCar(26, 66, 0, { model: { name: 'Falco Sport', top: 46, color: 0xd43d2a } });
    enterCar(car);
    car.speed = 24;
    G.heat = 55; G.wanted = 3;
    spawnCar(26, 105, Math.PI, { police: true, driver: 'police' });
    spawnCar(30, 118, Math.PI, { police: true, driver: 'police' });
    spawnCar(26, 60, 0, { police: true, driver: 'police' });
    G.camYaw = Math.PI;
    startMission(0);
  } else if (mode === 'onfoot') {
    G.player.pos.set(-26, 0, -26);
    G.player.group.position.copy(G.player.pos);
    G.camYaw = Math.PI * 0.9;
  } else if (mode === 'mission') {
    G.player.pos.set(60, 0, 30);
    G.player.group.position.copy(G.player.pos);
    G.player.yaw = 1.1; // face the Marina Bay marker
    G.player.group.rotation.y = 1.1;
    G.camYaw = Math.PI * 1.25; // camera northwest, looking southeast at the marker
    startMission(0);
  }
}

function bindUI() {
  $('btn-new').onclick = () => { audio.init(); startGame(false); };
  $('btn-continue').onclick = () => { audio.init(); startGame(true); };
  $('btn-load').onclick = () => {
    const slots = $('slots');
    slots.classList.remove('hidden');
    slots.innerHTML = '';
    listSlots().forEach((label, i) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { audio.init(); startGame(true); if (i > 0) { const s = loadSlot(i); if (s) applySave(s); } };
      slots.appendChild(b);
    });
  };
  $('btn-retry').onclick = () => {
    G.gameOver = false; G.busted = false;
    G.money = Math.max(0, G.money - 200);
    G.health = 100; G.armour = 0; G.wanted = 0; G.heat = 0;
    G.player.pos.set(0, 0, 30); G.player.group.position.copy(G.player.pos);
    if (G.player.car) { G.player.car = null; G.player.onFoot = true; G.player.group.visible = true; }
    $('end').classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.paused = false;
    toast('Back on the streets. Stay sharp.');
  };
  $('btn-end-title').onclick = () => location.reload();
  bindMapMenu();
}

function wantedFromHeat(h) {
  return h < 8 ? 0 : h < 25 ? 1 : h < 45 ? 2 : h < 65 ? 3 : h < 85 ? 4 : 5;
}

function updateWanted(dt) {
  // heat decays when no police are close and no recent crime
  const p = G.player.pos;
  let nearCop = false;
  for (const c of G.police) {
    if (Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z) < 55) { nearCop = true; break; }
  }
  if (!nearCop) G.heat = Math.max(0, G.heat - 1.6 * dt);
  G.wanted = wantedFromHeat(G.heat);
}

function updateClock(dt) {
  G.time.hour += dt / 120; // 1 game hour per 2 real minutes
  if (G.time.hour >= 24) { G.time.hour -= 24; G.time.day++; }
}

function showEnd(kind) {
  G.gameOver = true;
  G.paused = true;
  $('hud').classList.add('hidden');
  $('end').classList.remove('hidden');
  $('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  $('end-sub').textContent = kind === 'busted'
    ? 'The Solara PD got you. Your crew posted bail.'
    : 'The streets of Solara are unforgiving.';
  audio.setEngine(0, false); audio.setSiren(false);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  G.fps = 1 / Math.max(dt, 0.001);

  // title backdrop: slow orbit over the city
  if (G.title) {
    titleAngle += dt * 0.05;
    G.camera.position.set(Math.cos(titleAngle) * 130, 55, Math.sin(titleAngle) * 130);
    G.camera.lookAt(0, 10, 0);
    G.renderer.render(G.scene, G.camera);
    return;
  }
  if (G.paused) {
    input.endFrame();
    return;
  }

  // global keys
  if (input.wasPressed('KeyM')) { if (G.mapOpen) closeMapMenu(); else openMapMenu(); }
  if (input.wasPressed('Escape')) { if (G.mapOpen) closeMapMenu(); else openPause(); }
  if (input.wasPressed('Tab')) {
    G.wheelOpen = !G.wheelOpen;
    $('wheel').classList.toggle('hidden', !G.wheelOpen);
    if (G.wheelOpen) renderWheel();
  }
  if (input.wasPressed('KeyQ')) toast('Radio: ' + audio.cycleRadio());
  if (input.wasPressed('KeyE')) {
    if (!advanceDialogue()) {
      const rs = nearestRaceStart(10);
      if (rs) startRace(rs);
      window.__ePressed = true;
    }
  }
  window.__eHeld = !!input.keys.KeyE;
  if (input.wasPressed('KeyR')) window.__rPressed = true;
  G.aimMode = input.rightDown && G.player.onFoot;
  $('crosshair').classList.toggle('hidden', !G.aimMode);

  // mission rob hold
  if (input.keys.KeyE) holdInteract(dt); else releaseInteract();

  // world updates
  updatePlayer(dt);
  updatePlayerCar(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updatePeds(dt);
  updateCombat(dt);
  updateMissions(dt);
  updateSideSystems(dt);
  updateWanted(dt);
  updateClock(dt);
  audio.update(dt);
  audio.setSiren(G.wanted > 0);

  // death / busted
  if (G.health <= 0 && !G.gameOver) showEnd('wasted');
  if (G.busted && !G.gameOver) { G.busted = false; showEnd('busted'); }

  updateHUD(dt);
  updateCamera(dt);
  G.renderer.render(G.scene, G.camera);
  input.endFrame();
}

function renderWheel() {
  const el = $('wheel-items');
  el.innerHTML = '';
  G.weapons.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'witem' + (w.locked ? ' locked' : '') + (i === G.weaponIndex ? ' active' : '');
    d.innerHTML = `<div class="wn">${i + 1} · ${w.name}</div><div class="wd">${w.desc}${w.locked ? '<br>LOCKED — $' + w.price.toLocaleString() : ''}</div>`;
    d.onclick = () => {
      if (w.locked) {
        if (G.money >= w.price) { G.money -= w.price; w.locked = false; audio.cash(); renderWheel(); }
        return;
      }
      G.weaponIndex = i; buildWeaponSlots(); renderWheel();
    };
    el.appendChild(d);
  });
}

function boot() {
  try {
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    G.camera.position.set(0, 40, 120);
    G.renderer = initRenderer();
  } catch (e) {
    $('err').classList.remove('hidden');
    $('err').textContent = 'WebGL failed to start: ' + e.message;
    return;
  }
  initLights();
  buildCity();
  createPlayer();
  spawnTraffic(18);
  spawnPeds(22);
  giveWeapons();
  initSideSystems();
  input.attach(G.renderer.domElement);
  bindUI();
  // a few parked cars around the city
  spawnCar(-40, 90, 0, {});
  spawnCar(90, -40, Math.PI / 2, {});
  spawnCar(-90, -140, Math.PI, { color: 0xe8c832 });
  spawnCar(140, 110, -Math.PI / 2, { color: 0xd43d2a });
  window.addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });
  window.addEventListener('error', (e) => {
    const el = $('err');
    el.classList.remove('hidden');
    el.textContent = 'Error: ' + e.message;
  });
  applyScene();
  lastT = performance.now();
  frame();
}

boot();
