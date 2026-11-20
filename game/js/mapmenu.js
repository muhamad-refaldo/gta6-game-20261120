// Solara City 3D v3.3 — map menu: full map (with safehouse + race-ring markers),
// story (mission list), stats (career stats + weapon shop), and the pause menu.
// Fresh rewrite for v3.3. Exports: openMapMenu, closeMapMenu, openPause,
// closePause, bindMapMenu.
import { G, DISTRICTS, fmtMoney } from './state.js';
import { drawBigMap, toast } from './hud.js';
import { MISSIONS } from './missions.js';
import { WEAPONS, buyWeapon } from './combat.js';
import { saveSlot } from './save.js';
import { SAFEHOUSES } from './city.js';

const $ = (id) => document.getElementById(id);

function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

export function openMapMenu() {
  G.mapOpen = true;
  show($('mapmenu'));
  renderTab(currentTab());
}
export function closeMapMenu() {
  G.mapOpen = false;
  hide($('mapmenu'));
}
export function openPause() {
  G.paused = true;
  show($('pause'));
}
export function closePause() {
  G.paused = false;
  hide($('pause'));
}

function currentTab() {
  const active = document.querySelector('.map-tabs button.active');
  return active ? active.dataset.tab : 'map';
}

function switchTab(name) {
  document.querySelectorAll('.map-tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('#mapmenu .tab').forEach((t) => {
    t.classList.toggle('active', t.id === 'tab-' + name);
  });
  renderTab(name);
}

function renderTab(name) {
  if (name === 'map') renderMap();
  else if (name === 'story') renderStory();
  else if (name === 'stats') renderStats();
}

// ---------- MAP tab: big map + safehouse / race-ring markers ----------
function renderMap() {
  drawBigMap();
  const c = $('bigmap');
  if (!c) return;
  const ctx = c.getContext('2d');
  const S = c.width / 430;
  const X = (x) => (x + 215) * S;
  const Z = (z) => (z + 215) * S;
  const clampX = (v) => Math.max(12, Math.min(c.width - 12, v));
  const clampY = (v) => Math.max(12, Math.min(c.height - 12, v));
  // safehouses: green house = owned, orange = for sale (clamped to the map edge)
  for (let i = 0; i < SAFEHOUSES.length; i++) {
    const sh = SAFEHOUSES[i];
    const owned = (G.safehousesOwned || []).includes(i);
    const mx = clampX(X(sh.bx)), my = clampY(Z(sh.bz));
    ctx.fillStyle = owned ? '#7dff9a' : '#ff9f1c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    // house: square + roof triangle
    ctx.beginPath();
    ctx.moveTo(mx - 7, my + 2); ctx.lineTo(mx + 7, my + 2); ctx.lineTo(mx + 7, my + 9); ctx.lineTo(mx - 7, my + 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 9, my + 2); ctx.lineTo(mx, my - 7); ctx.lineTo(mx + 9, my + 2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(owned ? 'YOURS' : '$' + (sh.price / 1000) + 'k', mx, my + 22);
  }
  // active race rings (cyan diamonds)
  if (G.race) {
    ctx.fillStyle = '#4ecdc4';
    for (const ring of G.race.rings) {
      if (ring.hit) continue;
      const mx = clampX(X(ring.x)), my = clampY(Z(ring.z));
      ctx.beginPath();
      ctx.moveTo(mx, my - 7); ctx.lineTo(mx + 7, my); ctx.lineTo(mx, my + 7); ctx.lineTo(mx - 7, my); ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------- STORY tab ----------
function renderStory() {
  const box = $('mission-list');
  if (!box) return;
  box.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const done = (G.missionsDone || []).includes(m.name);
    const active = G.mission ? G.mission.def === m : (i === G.missionIndex && !done);
    const row = document.createElement('div');
    row.className = 'mrow' + (done ? ' done' : '') + (active ? ' active' : '');
    const intro = m.intro && m.intro[0] ? m.intro[0].text : '';
    const status = done ? ' ✓ COMPLETE' : active ? ' ▶' : '';
    row.innerHTML = `<div class="mt">${i + 1}. ${m.name} — ${m.contact}${status}</div>` +
      `<div class="md">${intro}</div>` +
      `<div class="mp">Payout: ${fmtMoney(m.payout)}</div>`;
    box.appendChild(row);
  });
}

// ---------- STATS tab: career stats + weapon shop ----------
function srow(label, value) {
  return `<div class="srow"><span>${label}</span><b>${value}</b></div>`;
}
function starStr(n) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  return s;
}
function renderStats() {
  const box = $('stats-list');
  if (!box) return;
  const st = G.stats;
  const distKm = ((st.distance || 0) / 1000).toFixed(1);
  const reps = DISTRICTS.map((d) => `${d.name.split(' ')[0]} ${d.rep}`).join(' · ');
  let html = '';
  html += srow('Cash earned', fmtMoney(st.cashEarned));
  html += srow('Current cash', fmtMoney(G.money));
  html += srow('Missions completed', `${(G.missionsDone || []).length} / 10`);
  html += srow('Respect rank', `${G.respect} / 5`);
  html += srow('Cars stolen', st.carsStolen);
  html += srow('Cops evaded', st.copsEvaded);
  html += srow('Street races won', st.racesWon);
  html += srow('Golden shells', `${G.shellsTaken} / 20`);
  html += srow('Stunt jumps', `${(G.jumpsDone || []).length} / 5`);
  html += srow('Safehouses', `${(G.safehousesOwned || []).length} / 3`);
  html += srow('Highest wanted', starStr(st.maxWanted || 0));
  html += srow('Distance travelled', `${distKm} km`);
  html += srow('Store robberies', st.robberies);
  html += srow('Taxi fares', st.fares);
  html += srow('Enemies taken down', st.kills);
  html += srow('Shots fired / hits', `${st.shots} / ${st.hits}`);
  html += srow('Wanted level', starStr(G.wanted));
  html += srow('Day / time', `Day ${G.time.day}`);
  html += srow('District reputations', reps);
  html += srow('Crew', G.crew ? `${G.crew.name} — ${G.crew.role} (+25% race payout)` : '—');
  // weapon shop
  html += `<div style="margin:18px 0 8px;font-size:17px;font-weight:800;letter-spacing:2px;color:#ffd23d">WEAPON SHOP</div>`;
  WEAPONS.forEach((w, i) => {
    const owned = !G.weapons[i] || !G.weapons[i].locked;
    const ammo = w.ammo === Infinity ? '∞ ammo' : `${G.weapons[i] ? G.weapons[i].ammoLeft : w.ammo} ammo`;
    const action = owned
      ? '<b style="color:#7dff9a">OWNED</b>'
      : `<button data-buy="${i}" style="background:#ff9f1c;border:none;color:#fff;font-weight:800;padding:6px 14px;border-radius:6px;cursor:pointer">BUY $${w.price.toLocaleString()}</button>`;
    html += `<div class="srow"><span>${i + 1}. ${w.name} <span style="color:#aaa;font-size:13px">· ${w.desc} · ${ammo}</span></span>${action}</div>`;
  });
  box.innerHTML = html;
  box.querySelectorAll('button[data-buy]').forEach((b) => {
    b.onclick = () => {
      const i = parseInt(b.dataset.buy, 10);
      const w = WEAPONS[i];
      if (buyWeapon(i)) {
        toast(`${w.name} purchased! — $${w.price.toLocaleString()}`);
        renderStats();
      } else {
        toast(`Not enough cash — ${w.name} costs $${w.price.toLocaleString()}`);
      }
    };
  });
}

// ---------- bindings ----------
export function bindMapMenu() {
  document.querySelectorAll('.map-tabs button[data-tab]').forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  const closeBtn = $('btn-close-map');
  if (closeBtn) closeBtn.onclick = () => closeMapMenu();
  const resume = $('btn-resume');
  if (resume) resume.onclick = () => closePause();
  const mapBtn = $('btn-map');
  if (mapBtn) mapBtn.onclick = () => { closePause(); openMapMenu(); };
  const saveBtn = $('btn-save');
  if (saveBtn) saveBtn.onclick = () => { saveSlot(0); toast('Game saved'); };
  const titleBtn = $('btn-title');
  if (titleBtn) titleBtn.onclick = () => location.reload();
}
