// Solara City 3D v3 — boot + main loop: renderer, day/night cycle + rain weather,
// quality settings, title/pause/map/end screens, input routing, wanted decay,
// bust + game-over, and ?scene= staging (title / chase / onfoot / mission / night).
// Fresh rewrite for v3. Static offline files only; no network, no build step.
import * as THREE from 'three';
import { G, clamp, lerp, fmtMoney } from './state.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, updateCamera, enterCar } from './player.js';
import { spawnCar, spawnTraffic, updateTraffic, spawnPolice, updatePolice, updatePlayerCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { startMission, updateMissions, holdInteract, releaseInteract } from './missions.js';
import { updateCombat, giveWeapons, currentWeapon } from './combat.js';
import { initSideSystems, updateSideSystems, nearestRaceStart, startRace, startTaxi } from './sidesystems.js';
import { audio } from './audio.js';
import { saveSlot, loadSlot, applySave, listSlots } from './save.js';
import { openMapMenu, closeMapMenu, openPause, closePause, bindMapMenu } from './mapmenu.js';
import { updateHUD, toast, advanceDialogue, showWheel, hideWheel, setObjective } from './hud.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('game').appendChild(renderer.domElement);
input.attach(renderer.domElement);

G.scene = new THREE.Scene();
G.scene.background = new THREE.Color(0xdd7a45);
G.scene.fog = new THREE.Fog(0xf0a266, 90, 420);
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.camera.position.set(0, 40, 120);
G.renderer = renderer;
G.quality = 'high';

const sun = new THREE.DirectionalLight(0xffb066, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
G.scene.add(sun);
G.scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a4038, 0.85);
G.scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.28);
G.scene.add(amb);

// ---------------- day / night ----------------
// keyframes: hour -> sun colour/intensity, hemi, fog, background, night fraction
const SKY = [
  { h: 0.0, sun: 0x8fa3ff, sunI: 0.12, hemi: 0.22, fog: 0x0d1526, bg: 0x0a1220, night: 1.0 },
  { h: 5.0, sun: 0x8fa3ff, sunI: 0.12, hemi: 0.22, fog: 0x0d1526, bg: 0x0a1220, night: 1.0 },
  { h: 6.5, sun: 0xff9a5c, sunI: 0.7, hemi: 0.5, fog: 0xe8a06a, bg: 0xe88a52, night: 0.55 },
  { h: 8.0, sun: 0xfff0d0, sunI: 1.15, hemi: 0.85, fog: 0xb8d4e8, bg: 0x87b5d9, night: 0.0 },
  { h: 12.0, sun: 0xfff6e0, sunI: 1.25, hemi: 0.95, fog: 0xc2d9ea, bg: 0x8fc0e0, night: 0.0 },
  { h: 16.5, sun: 0xffd9a0, sunI: 1.2, hemi: 0.9, fog: 0xe8c49a, bg: 0xe8a06a, night: 0.0 },
  { h: 17.6, sun: 0xffb066, sunI: 1.35, hemi: 0.85, fog: 0xf0a266, bg: 0xdd7a45, night: 0.08 },
  { h: 19.0, sun: 0xff7a4d, sunI: 0.8, hemi: 0.6, fog: 0xd97a5c, bg: 0xc96a52, night: 0.45 },
  { h: 20.0, sun: 0x8fa3ff, sunI: 0.25, hemi: 0.35, fog: 0x2a3048, bg: 0x1a2238, night: 0.9 },
  { h: 21.5, sun: 0x8fa3ff, sunI: 0.14, hemi: 0.25, fog: 0x101828, bg: 0x0c1424, night: 1.0 },
  { h: 24.0, sun: 0x8fa3ff, sunI: 0.12, hemi: 0.22, fog: 0x0d1526, bg: 0x0a1220, night: 1.0 },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function applyTimeOfDay() {
  const h = ((G.time.hour % 24) + 24) % 24;
  let a = SKY[0], b = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (h >= SKY[i].h && h <= SKY[i + 1].h) { a = SKY[i]; b = SKY[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : clamp((h - a.h) / (b.h - a.h), 0, 1);
  const rain = G.weather.rain;
  // sun angle: rises east, sets west
  const dayFrac = clamp((h - 6) / 12, 0, 1);
  const ang = Math.PI * (1 - dayFrac);
  const elev = Math.sin(ang) * 0.9 + 0.12;
  sun.position.set(Math.cos(ang) * 220, Math.max(18, elev * 240), 120);
  sun.color.setHex(a.sun).lerp(_c1.setHex(b.sun), t);
  sun.intensity = lerp(a.sunI, b.sunI, t) * (1 - rain * 0.45);
  hemi.intensity = lerp(a.hemi, b.hemi, t) * (1 - rain * 0.25);
  amb.intensity = 0.28 + lerp(a.night, b.night, t) * 0.06;
  G.scene.fog.color.setHex(a.fog).lerp(_c2.setHex(b.fog), t);
  G.scene.background.setHex(a.bg).lerp(_c2.setHex(b.bg), t);
  const night = lerp(a.night, b.night, t);
  G.scene.fog.near = 90 - rain * 45;
  G.scene.fog.far = 420 - rain * 190;
  if (G.city) G.city.setNight(night);
  return night;
}

// ---------------- rain ----------------
G.weather = { rain: 0, target: 0 };
let rainPts = null, rainVel = null;
function buildRain(n) {
  if (rainPts) { G.scene.remove(rainPts); rainPts.geometry.dispose(); }
  const pos = new Float32Array(n * 3);
  rainVel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = Math.random() * 32;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    rainVel[i] = 26 + Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainPts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbdd8f0, size: 0.32, transparent: true, opacity: 0.65 }));
  rainPts.visible = false;
  rainPts.frustumCulled = false;
  G.scene.add(rainPts);
}
buildRain(1200);
// rain ambience: own looped noise buffer (audio.js owns the main context)
let rainCtx = null, rainGain = null;
function rainAudio(level) {
  try {
    if (!rainCtx) {
      rainCtx = new (window.AudioContext || window.webkitAudioContext)();
      const len = rainCtx.sampleRate * 2;
      const buf = rainCtx.createBuffer(1, len, rainCtx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.03 * w) / 1.03; d[i] = last * 3.2; }
      const src = rainCtx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = rainCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      rainGain = rainCtx.createGain(); rainGain.gain.value = 0;
      src.connect(lp); lp.connect(rainGain); rainGain.connect(rainCtx.destination);
      src.start();
    }
    if (rainCtx.state === 'suspended') rainCtx.resume();
    if (rainGain) rainGain.gain.value = level * 0.05;
  } catch (e) { /* rain sound is optional */ }
}
function updateRain(dt) {
  const w = G.weather;
  // deterministic schedule: rain during game-hours 5.5-7 of every 8-hour block
  const cyc = (G.time.hour + (G.time.day - 1) * 24) % 8;
  const sched = (cyc >= 5.5 && cyc < 7) ? 0.8 : 0;
  if (w.forced !== undefined) w.target = w.forced;
  else w.target = sched;
  w.rain = lerp(w.rain, w.target, Math.min(1, dt * 0.4));
  if (rainPts) {
    rainPts.visible = w.rain > 0.05;
    if (rainPts.visible) {
      const p = G.player ? G.player.pos : { x: 0, z: 0 };
      rainPts.position.set(p.x, 0, p.z);
      const arr = rainPts.geometry.attributes.position.array;
      for (let i = 0; i < rainVel.length; i++) {
        arr[i * 3 + 1] -= rainVel[i] * dt;
        arr[i * 3] += dt * 3; // wind slant
        if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] = 30 + Math.random() * 2; arr[i * 3] = (Math.random() - 0.5) * 90; }
      }
      rainPts.geometry.attributes.position.needsUpdate = true;
      rainPts.material.opacity = 0.65 * w.rain;
    }
  }
  if (G.city) G.city.setWet(w.rain);
  rainAudio(w.rain);
}

// ---------------- quality settings ----------------
function applyQuality(q) {
  G.quality = q;
  if (q === 'low') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    if (rainPts) { /* fewer drops */ }
  } else if (q === 'med') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    sun.shadow.mapSize.set(1024, 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    sun.shadow.mapSize.set(2048, 2048);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  document.querySelectorAll('#quality button[data-q]').forEach((b) => {
    b.classList.toggle('active', b.dataset.q === q);
  });
}

// ---------------- boot ----------------
buildCity();
createPlayer();
giveWeapons();
spawnTraffic(14);
spawnPeds(22);
initSideSystems();
bindMapMenu();
G.time.hour = 17.6;
G.time.day = 1;

// ---------------- title / pause / end ----------------
function showTitle() {
  G.title = true;
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  const slots = listSlots();
  const box = $('slots');
  box.innerHTML = '';
  slots.forEach((label, i) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      const s = loadSlot(i);
      if (s) { applySave(s); startGame(false); }
      else toast('Slot is empty — start a New Game');
    };
    box.appendChild(b);
  });
}
function startGame(fresh) {
  audio.init(); audio.resume();
  G.title = false;
  G.gameOver = false; G.busted = false;
  $('title').classList.add('hidden');
  $('end').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.camSnapped = false;
  if (fresh) {
    G.missionIndex = 0; G.missionsDone = [];
    startMission(0);
  }
}
$('btn-new').onclick = () => startGame(true);
$('btn-continue').onclick = () => {
  const s = loadSlot(0);
  if (s) { applySave(s); startGame(false); }
  else startGame(true);
};
document.querySelectorAll('#quality button[data-q]').forEach((b) => {
  b.onclick = () => { applyQuality(b.dataset.q); toast('Quality: ' + b.dataset.q.toUpperCase()); };
});
$('btn-retry').onclick = () => location.reload();
window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('error', (e) => {
  const el = $('err');
  if (el) { el.textContent = 'Error: ' + (e.message || e.error); el.style.display = 'block'; }
});

// ---------------- ?scene= staging ----------------
const params = new URLSearchParams(location.search);
const sceneMode = params.get('scene');
G.sceneMode = sceneMode;
if (params.get('quality')) applyQuality(params.get('quality'));
if (params.get('hour')) G.time.hour = parseFloat(params.get('hour'));
if (params.get('weather') === 'rain') G.weather.forced = 0.8;
if (params.get('weather') === 'clear') G.weather.forced = 0;

function clearTrafficNear(x, z, r) {
  // move any traffic car out of the staging area so it cannot block the shot
  for (const c of G.traffic) {
    const p = c.group.position;
    if (Math.hypot(p.x - x, p.z - z) < r) {
      p.x = -130 + Math.random() * 60; p.z = -130 + Math.random() * 60;
      c.speed = 0;
    }
  }
}

function stageScene(mode) {
  if (!mode || mode === 'title') return; // title: leave the title screen over the live city
  startGame(false);
  const p = G.player;
  if (mode === 'chase') {
    // player in a red sports car on the north-south road, wanted 3, police behind, heli up
    const car = spawnCar(-26, 78, Math.PI, { type: 'sports', color: 0xd43d2a });
    enterCar(car);
    p.pos.set(-26, 0, 78);
    G.heat = 55; G.wanted = 3;
    spawnPolice(3);
    G.autoDrive = true;
    clearTrafficNear(-26, 78, 25);
    startMission(0);
    G.camSnapped = false;
  } else if (mode === 'onfoot') {
    // middle of the intersection, camera looking north down the street (wide view)
    p.pos.set(-26, 0, -26);
    p.group.position.copy(p.pos);
    G.camYaw = 0;
    G.camMode = 2;
    startMission(0);
    G.camSnapped = false;
  } else if (mode === 'mission') {
    // final mission: on Isla Verde, 20 units from the gold beacon so it towers ahead
    const car = spawnCar(310, 0, Math.PI / 2, { type: 'sedan', color: 0x2a6fd4 });
    enterCar(car);
    p.pos.set(310, 0, 0);
    G.camYaw = -Math.PI / 2; // camera west of the car, looking east at the beacon
    startMission(9);
    G.camSnapped = false;
  } else if (mode === 'night') {
    // night rain street scene for the 4th screenshot
    G.time.hour = 21.5;
    G.weather.forced = 0.75;
    const car = spawnCar(-26, 60, Math.PI, { type: 'sedan', color: 0xe8c832 });
    enterCar(car);
    p.pos.set(-26, 0, 60);
    G.autoDrive = true;
    G.camSnapped = false;
  }
}
showTitle();
stageScene(sceneMode);

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 0.5) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsT = 0; }

  // E / R edge + hold flags for shops and missions (consumed by sidesystems/missions)
  window.__ePressed = false; window.__rPressed = false;
  if (input.wasPressed('KeyE')) {
    if (!advanceDialogue()) window.__ePressed = true;
  }
  if (input.wasPressed('KeyR')) window.__rPressed = true;
  window.__eHeld = !!input.keys.KeyE;

  if (G.title) {
    // slow orbit over the city behind the title screen
    G.camYaw += dt * 0.05;
    const t = performance.now() / 1000;
    G.camera.position.set(Math.sin(t * 0.05) * 130, 55, Math.cos(t * 0.05) * 130);
    G.camera.lookAt(0, 10, 0);
    G.city.update(dt);
    updateTraffic(dt * 0.5);
    updatePeds(dt * 0.5);
    applyTimeOfDay();
    updateRain(dt * 0.2);
    renderer.render(G.scene, G.camera);
    input.endFrame();
    return;
  }

  const paused = G.paused || G.mapOpen || G.wheelOpen || G.gameOver || G.busted;
  if (!paused) {
    // clock: 1 game hour per 90 real seconds
    G.time.hour += dt / 90;
    if (G.time.hour >= 24) { G.time.hour -= 24; G.time.day++; }
    const night = applyTimeOfDay();
    updateRain(dt);
    G.city.update(dt);
    updatePlayer(dt);
    updatePlayerCar(dt);
    updateCamera(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateMissions(dt);
    updateCombat(dt);
    updateSideSystems(dt);
    audio.update(dt);
    audio.setSiren(G.wanted > 0 && G.police.length > 0);

    // hold-E near the vault / shops
    if (window.__eHeld) holdInteract(dt);
    else releaseInteract();

    // wanted decay: heat cools when the player stays clean
    if (G.wanted > 0) {
      G.heat = Math.max(0, G.heat - dt * 1.1);
      const w = G.heat < 8 ? 0 : G.heat < 25 ? 1 : G.heat < 45 ? 2 : G.heat < 65 ? 3 : G.heat < 85 ? 4 : 5;
      if (w < G.wanted && G.police.length === 0) G.wanted = w;
      else if (w < G.wanted) G.wanted = w;
    }

    // aim (right mouse)
    G.aimMode = input.rightDown && G.player.onFoot;
    // interact (E) near race start / taxi
    if (window.__ePressed) {
      const rs = nearestRaceStart(10);
      if (rs) startRace(rs);
      else if (G.player.car && !G.taxi.active) startTaxi();
    }

    // bust / game over
    if (G.busted) {
      G.busted = false;
      $('end-title').textContent = 'BUSTED';
      $('end-sub').textContent = 'The Solara PD caught you. The streets will wait.';
      $('end').classList.remove('hidden');
      G.gameOver = true;
      audio.setEngine(0, false); audio.setSiren(false);
    }
    if (G.health <= 0 && !G.gameOver) {
      $('end-title').textContent = 'WASTED';
      $('end-sub').textContent = 'Solara City claims another one.';
      $('end').classList.remove('hidden');
      G.gameOver = true;
      audio.setEngine(0, false); audio.setSiren(false);
    }
    updateHUD();
  }
  // menu keys run even while paused (wheel / map / pause overlay open)
  if (input.wasPressed('Tab')) {
    if (G.wheelOpen) hideWheel();
    else if (!G.mapOpen && !G.paused) showWheel();
  }
  if (input.wasPressed('KeyM') && !G.mapOpen && !G.wheelOpen && !G.paused) openMapMenu();
  if (input.wasPressed('Escape')) {
    if (G.mapOpen) closeMapMenu();
    else if (G.wheelOpen) hideWheel();
    else if (G.paused) closePause();
    else openPause();
  }
  if (input.wasPressed('KeyQ') && !G.paused && !G.mapOpen && !G.wheelOpen) toast('RADIO: ' + audio.cycleRadio());
  renderer.render(G.scene, G.camera);
  input.endFrame();
}
applyQuality('high');
animate();
console.log('Solara City v3 ready');
