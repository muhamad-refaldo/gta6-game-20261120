// Solara City 3D — HUD: money/clock/stars/health/armour/weapons/objective/minimap/dialogue.
import { G, DISTRICTS, fmtMoney, fmtClock, districtAt } from './state.js';
import { WEAPONS } from './combat.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
let lastDistrict = '';

export function setObjective(title, text) {
  $('objective').classList.remove('hidden');
  $('obj-title').textContent = title;
  $('obj-text').textContent = text;
}
export function clearObjective() { $('objective').classList.add('hidden'); }

let toastTimer = null;
export function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.textContent = ''; }, ms);
}
export function showHint(text) { $('hint').textContent = text; }
export function hideHint() { $('hint').textContent = ''; }

let dlgLines = [], dlgIdx = 0, dlgTimer = 0;
export function showDialogue(lines) {
  dlgLines = lines; dlgIdx = 0; dlgTimer = 0;
  renderDialogue();
}
function renderDialogue() {
  if (dlgIdx >= dlgLines.length) { $('dialogue').classList.add('hidden'); dlgLines = []; return; }
  const l = dlgLines[dlgIdx];
  $('dialogue').classList.remove('hidden');
  $('dlg-name').textContent = l.name;
  $('dlg-text').textContent = l.text;
  dlgTimer = 6;
}
export function advanceDialogue() {
  if (!dlgLines.length) return false;
  dlgIdx++;
  audio.blip(600, 0.06, 'square', 0.06);
  renderDialogue();
  return true;
}
export function updateDialogue(dt) {
  if (!dlgLines.length) return;
  dlgTimer -= dt;
  if (dlgTimer <= 0) advanceDialogue();
}

export function buildWeaponSlots() {
  const w = $('weapons');
  w.innerHTML = '';
  G.weapons.forEach((wp, i) => {
    const d = document.createElement('div');
    d.className = 'wslot' + (wp.locked ? ' locked' : '') + (i === G.weaponIndex ? ' active' : '');
    d.innerHTML = `<b>${i + 1}</b>${wp.name}${wp.ammoLeft === Infinity ? '' : '<br>' + wp.ammoLeft}`;
    w.appendChild(d);
  });
}

export function updateHUD(dt) {
  $('money').textContent = fmtMoney(G.money);
  $('clock').textContent = `DAY ${G.time.day} · ${fmtClock(G.time.hour)}`;
  $('radio').textContent = 'RADIO: ' + (G.radioOn ? ['SOLARA FM', 'VICE BEATS', 'CLASSIC COAST'][G.radio] : 'OFF');
  // stars
  let stars = '';
  for (let i = 0; i < 5; i++) stars += `<span class="${i < G.wanted ? '' : 'off'}">★</span>`;
  $('stars').innerHTML = stars;
  $('health-fill').style.width = G.health + '%';
  $('armour-fill').style.width = G.armour + '%';
  // weapon slots active state
  const slots = $('weapons').children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('active', i === G.weaponIndex);
    const wp = G.weapons[i];
    if (wp) slots[i].innerHTML = `<b>${i + 1}</b>${wp.name}${wp.ammoLeft === Infinity ? '' : '<br>' + wp.ammoLeft}`;
  }
  // speed
  const sp = $('speed');
  if (!G.player.onFoot && G.player.car) {
    sp.classList.remove('hidden');
    sp.textContent = Math.round(Math.abs(G.player.car.speed) * 2.2) + ' mph';
  } else sp.classList.add('hidden');
  // district
  const d = districtAt(G.player.pos.x, G.player.pos.z);
  if (d.name !== lastDistrict) {
    lastDistrict = d.name;
    $('district-name').textContent = d.name;
    $('district-rep').textContent = 'REP ' + d.rep + ' · ' + d.desc;
    toast(d.name, 2000);
  }
  drawMinimap();
  updateDialogue(dt);
}

export function drawMinimap() {
  const c = $('minimap');
  if (!c) return;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  x.save();
  x.beginPath(); x.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); x.clip();
  // sea + land
  x.fillStyle = '#12202e'; x.fillRect(0, 0, W, H);
  const wx = (v) => ((v + 210) / 640) * W;
  const wz = (v) => ((v + 210) / 640) * H;
  x.fillStyle = '#1d5f7a'; x.fillRect(wx(210), 0, W - wx(210), H); // sea east
  x.fillStyle = '#1d5f7a'; x.fillRect(0, wz(230), W, H - wz(230)); // sea south
  x.fillStyle = '#e8cf9a'; x.fillRect(0, wz(200), W, wz(230) - wz(200)); // beach
  // roads
  x.strokeStyle = '#5a6068'; x.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    x.beginPath(); x.moveTo(wx(-182 + i * 52), 0); x.lineTo(wx(-182 + i * 52), H); x.stroke();
    x.beginPath(); x.moveTo(0, wz(-182 + i * 52 + 40)); x.lineTo(W, wz(-182 + i * 52 + 40)); x.stroke();
  }
  // island
  x.fillStyle = '#2f7d5a'; x.beginPath(); x.arc(wx(330), wz(0), 16, 0, Math.PI * 2); x.fill();
  // mission marker
  if (G.marker) {
    x.fillStyle = '#ffd23d';
    x.beginPath(); x.arc(wx(G.marker.x), wz(G.marker.z), 7, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
  }
  // shells
  x.fillStyle = '#ffd23d';
  for (const s of G.city.shells) if (!s.taken) { x.beginPath(); x.arc(wx(s.x), wz(s.z), 2.5, 0, Math.PI * 2); x.fill(); }
  // police
  x.fillStyle = '#ff3d5e';
  for (const p of G.police) { x.beginPath(); x.arc(wx(p.group.position.x), wz(p.group.position.z), 4, 0, Math.PI * 2); x.fill(); }
  // player arrow (rotates with yaw)
  const px = wx(G.player.pos.x), pz = wz(G.player.pos.z);
  x.save(); x.translate(px, pz); x.rotate(G.player.yaw);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(0, -8); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath(); x.fill();
  x.restore();
  // north indicator
  x.fillStyle = '#fff'; x.font = 'bold 13px Arial'; x.fillText('N', W / 2 - 4, 14);
  x.restore();
  // ring
  x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 3;
  x.beginPath(); x.arc(W / 2, H / 2, W / 2 - 1.5, 0, Math.PI * 2); x.stroke();
}

export function drawBigMap() {
  const c = $('bigmap');
  if (!c) return;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0e1a26'; x.fillRect(0, 0, W, H);
  const wx = (v) => ((v + 210) / 640) * W;
  const wz = (v) => ((v + 210) / 640) * H;
  x.fillStyle = '#1d5f7a'; x.fillRect(wx(210), 0, W - wx(210), H);
  x.fillStyle = '#1d5f7a'; x.fillRect(0, wz(230), W, H - wz(230));
  x.fillStyle = '#e8cf9a'; x.fillRect(0, wz(200), W, wz(230) - wz(200));
  // districts
  x.font = 'bold 14px Arial';
  for (const d of DISTRICTS) {
    x.fillStyle = d.color;
    x.globalAlpha = 0.25;
    x.beginPath(); x.arc(wx(d.cx), wz(d.cz), d.r / 640 * W, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
    x.fillStyle = '#fff';
    x.fillText(d.name.toUpperCase(), wx(d.cx) - 46, wz(d.cz));
  }
  // roads
  x.strokeStyle = '#5a6068'; x.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    x.beginPath(); x.moveTo(wx(-182 + i * 52), 0); x.lineTo(wx(-182 + i * 52), H); x.stroke();
    x.beginPath(); x.moveTo(0, wz(-182 + i * 52 + 40)); x.lineTo(W, wz(-182 + i * 52 + 40)); x.stroke();
  }
  // bridge
  x.strokeStyle = '#ff9f1c'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(wx(200), wz(0)); x.lineTo(wx(310), wz(0)); x.stroke();
  const dot = (px, pz, color, r = 6) => {
    x.fillStyle = color; x.beginPath(); x.arc(wx(px), wz(pz), r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
  };
  if (G.marker) dot(G.marker.x, G.marker.z, '#ffd23d', 9);
  for (const r of G.city.raceStarts) dot(r.x, r.z, '#4ecdc4', 6);
  dot(G.city.chop.x, G.city.chop.z, '#ff5d5d', 6);
  dot(G.city.garage.x, G.city.garage.z, '#7dff9a', 6);
  for (const s of G.city.shells) if (!s.taken) dot(s.x, s.z, '#ffd23d', 3);
  for (const p of G.police) dot(p.group.position.x, p.group.position.z, '#ff3d5e', 5);
  // player
  x.save(); x.translate(wx(G.player.pos.x), wz(G.player.pos.z)); x.rotate(G.player.yaw);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(0, -10); x.lineTo(7, 8); x.lineTo(-7, 8); x.closePath(); x.fill();
  x.restore();
}
