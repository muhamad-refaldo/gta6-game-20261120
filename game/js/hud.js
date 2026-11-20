// Solara City 3D v3 — HUD: money/clock/radio, wanted stars, objective panel, district
// label, health/armour bars, numbered weapon slots, round minimap, speed, toasts,
// hints, dialogue queue, weapon wheel, full-size map drawing.
// Fresh rewrite for v3. Exports (used by missions/sidesystems/save/mapmenu/main):
// setObjective, clearObjective, showDialogue, toast, advanceDialogue, drawBigMap,
// updateHUD, showHint, hideHint, buildWheel, showWheel, hideWheel.
import { G, DISTRICTS, districtAt, fmtMoney, fmtClock, clamp } from './state.js';
import { WEAPONS, currentWeapon } from './combat.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const els = {};
function grab() {
  for (const id of ['money', 'clock', 'radio', 'stars', 'objective', 'obj-title', 'obj-text',
    'district-name', 'district-rep', 'health-fill', 'armour-fill', 'weapons', 'minimap',
    'speed', 'toast', 'hint', 'dialogue', 'dlg-name', 'dlg-text', 'dlg-hint', 'crosshair',
    'wheel', 'wheel-items', 'hud', 'bigmap']) els[id] = $(id);
}
grab();

let toastTimer = null;
let dlgQueue = [];
let dlgIdx = 0;
let lastSlotsSig = '';

export function toast(text, ms = 2600) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, ms);
}

export function showHint(text) {
  if (!els.hint) return;
  els.hint.textContent = text;
  els.hint.style.opacity = '1';
}
export function hideHint() { if (els.hint) els.hint.style.opacity = '0'; }

export function setObjective(title, text) {
  if (!els.objective) return;
  els['obj-title'].textContent = title;
  els['obj-text'].textContent = text;
  els.objective.style.display = 'block';
}
export function clearObjective() { if (els.objective) els.objective.style.display = 'none'; }

export function showDialogue(lines) {
  dlgQueue = lines || [];
  dlgIdx = 0;
  if (!dlgQueue.length) return;
  renderDialogue();
}
function renderDialogue() {
  if (!els.dialogue) return;
  const line = dlgQueue[dlgIdx];
  if (!line) { els.dialogue.style.display = 'none'; return; }
  els['dlg-name'].textContent = line.name;
  els['dlg-text'].textContent = line.text;
  els['dlg-hint'].textContent = dlgIdx < dlgQueue.length - 1 ? 'E — continue' : 'E — close';
  els.dialogue.style.display = 'block';
}
export function advanceDialogue() {
  if (!dlgQueue.length || !els.dialogue || els.dialogue.style.display === 'none') return false;
  dlgIdx++;
  if (dlgIdx >= dlgQueue.length) { els.dialogue.style.display = 'none'; dlgQueue = []; }
  else renderDialogue();
  return true;
}

// ---- weapon wheel ----
export function buildWheel() {
  if (!els['wheel-items']) return;
  els['wheel-items'].innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'witem' + (w.locked ? ' locked' : '') + (G.weaponIndex === i ? ' active' : '');
    d.innerHTML = `<div class="wn">${i + 1}. ${w.name}</div><div class="wd">${w.desc}</div>` +
      `<div class="wd">${w.locked ? 'LOCKED — $' + w.price.toLocaleString() : (w.ammo === Infinity ? '∞ ammo' : w.ammoLeft + ' ammo')}</div>`;
    d.onclick = () => {
      if (!w.locked) { G.weaponIndex = i; audio.blip(500 + i * 80, 0.08, 'square', 0.08); hideWheel(); }
    };
    els['wheel-items'].appendChild(d);
  });
}
export function showWheel() {
  buildWheel();
  if (els.wheel) els.wheel.classList.remove('hidden');
  G.wheelOpen = true;
}
export function hideWheel() {
  if (els.wheel) els.wheel.classList.add('hidden');
  G.wheelOpen = false;
}

// ---- minimap (round canvas) + big map (map menu) ----
function drawMapOn(ctx, w, h, big) {
  const S = w / 430; // world -215..215 maps to the canvas
  const X = (x) => (x + 215) * S;
  const Z = (z) => (z + 215) * S;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = big ? '#0e1a26' : '#12202e';
  ctx.fillRect(0, 0, w, h);
  // district tints
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.color + '22';
    ctx.beginPath(); ctx.arc(X(d.cx), Z(d.cz), d.r * S, 0, Math.PI * 2); ctx.fill();
  }
  // sea + beach
  ctx.fillStyle = '#1f6f8b';
  ctx.fillRect(X(210), 0, w - X(210), h);
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, Z(200), X(210), h - Z(200));
  // roads
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = big ? 5 : 3;
  for (let i = 0; i < 7; i++) {
    const rx = -182 + i * 52, rz = -182 + i * 52;
    ctx.beginPath(); ctx.moveTo(X(rx), 0); ctx.lineTo(X(rx), h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, Z(rz)); ctx.lineTo(w, Z(rz)); ctx.stroke();
  }
  // race starts
  ctx.fillStyle = '#4ecdc4';
  for (const r of G.city.raceStarts) {
    ctx.font = `bold ${big ? 16 : 12}px sans-serif`;
    ctx.fillText('◆', X(r.x) - 6, Z(r.z) + 4);
  }
  // stores / chop / garage
  ctx.fillStyle = '#7dff9a';
  for (const s of G.city.stores) { ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), big ? 5 : 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff5d5d';
  ctx.beginPath(); ctx.arc(X(G.city.chop.x), Z(G.city.chop.z), big ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4ecdc4';
  ctx.beginPath(); ctx.arc(X(G.city.garage.x), Z(G.city.garage.z), big ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
  // golden shells
  ctx.fillStyle = '#ffd23d';
  for (const s of G.city.shells) {
    if (s.taken) continue;
    ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), big ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  }
  // police
  ctx.fillStyle = '#ff3d5e';
  for (const c of G.police) {
    ctx.beginPath(); ctx.arc(X(c.group.position.x), Z(c.group.position.z), big ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // mission marker
  if (G.marker) {
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath(); ctx.arc(X(G.marker.x), Z(G.marker.z), big ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(G.marker.x), Z(G.marker.z), big ? 13 : 9, 0, Math.PI * 2); ctx.stroke();
  }
  // player arrow
  const p = G.player;
  if (p) {
    ctx.save();
    ctx.translate(X(p.pos.x), Z(p.pos.z));
    ctx.rotate(p.yaw);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, big ? -10 : -7); ctx.lineTo(big ? 7 : 5, big ? 8 : 6); ctx.lineTo(big ? -7 : -5, big ? 8 : 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // district labels on the big map
  if (big) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px sans-serif';
    for (const d of DISTRICTS) ctx.fillText(d.name, X(d.cx) - 34, Z(d.cz));
  }
}

export function drawBigMap() {
  const c = els.bigmap;
  if (!c) return;
  const ctx = c.getContext('2d');
  drawMapOn(ctx, c.width, c.height, true);
}

// ---- per-frame HUD ----
export function updateHUD() {
  if (!els.money) grab();
  const p = G.player;
  els.money.textContent = fmtMoney(G.money);
  els.clock.textContent = `DAY ${G.time.day} · ${fmtClock(G.time.hour)}`;
  els.radio.textContent = 'RADIO: ' + (G.radioOn ? audio.constructor.STATIONS[G.radio].name : 'OFF');
  // wanted stars
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '<span class="off">★</span>';
  els.stars.innerHTML = stars;
  // district
  if (p) {
    const d = districtAt(p.pos.x, p.pos.z);
    els['district-name'].textContent = d.name;
    els['district-rep'].textContent = `REP ${d.rep} · ${d.desc}`;
  }
  // health / armour
  els['health-fill'].style.width = clamp(G.health, 0, 100) + '%';
  els['armour-fill'].style.width = clamp(G.armour, 0, 100) + '%';
  // weapon slots (rebuild only when the signature changes)
  const sig = G.weapons.map((w) => (w.locked ? 'L' : '') + w.ammoLeft).join(',') + '|' + G.weaponIndex;
  if (sig !== lastSlotsSig) {
    lastSlotsSig = sig;
    els.weapons.innerHTML = '';
    G.weapons.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'wslot' + (i === G.weaponIndex ? ' active' : '') + (w.locked ? ' locked' : '');
      d.innerHTML = `<b>${i + 1}</b>${w.name}<br>${w.ammo === Infinity ? '∞' : w.ammoLeft}`;
      els.weapons.appendChild(d);
    });
  }
  // speed
  const spd = p && !p.onFoot && p.car ? Math.abs(p.car.speed) * 2.2 : (p ? p.speed * 2.2 : 0);
  els.speed.textContent = `${Math.round(spd)} mph`;
  // crosshair: show when aiming or firing a ranged weapon on foot
  const w = currentWeapon();
  els.crosshair.style.display = (G.aimMode || (p && p.onFoot && w && w.range > 5)) ? 'block' : 'none';
  // minimap
  const mm = els.minimap;
  if (mm) drawMapOn(mm.getContext('2d'), mm.width, mm.height, false);
  // fps (quality display, set by main.js)
  if (G.fps > 0 && els.clock) els.clock.title = `FPS ${Math.round(G.fps)} · ${G.quality || 'high'}`;
}
