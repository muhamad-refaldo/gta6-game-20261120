// Solara City 3D — full map (M) + pause (Esc): MAP / STORY / STATS tabs.
import { G, DISTRICTS, fmtMoney } from './state.js';
import { MISSIONS } from './missions.js';
import { WEAPONS } from './combat.js';
import { drawBigMap } from './hud.js';
import { audio } from './audio.js';
import { saveSlot } from './save.js';

const $ = (id) => document.getElementById(id);

export function openMapMenu() {
  G.mapOpen = true;
  G.paused = true;
  $('mapmenu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  renderStory();
  renderStats();
  drawBigMap();
  audio.setEngine(0, false);
  audio.setSiren(false);
}
export function closeMapMenu() {
  G.mapOpen = false;
  if (!G.title) G.paused = false;
  $('mapmenu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  drawBigMap();
}

export function openPause() {
  G.paused = true;
  $('pause').classList.remove('hidden');
  audio.setEngine(0, false);
  audio.setSiren(false);
}
export function closePause() {
  G.paused = false;
  $('pause').classList.add('hidden');
}

export function renderStory() {
  const el = $('mission-list');
  el.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const done = G.missionsDone.includes(m.name);
    const active = G.mission && G.missionIndex === i;
    const d = document.createElement('div');
    d.className = 'mrow' + (done ? ' done' : '') + (active ? ' active' : '');
    d.innerHTML = `<div class="mt">${i + 1}. ${m.name} — ${m.contact} ${done ? '✓' : active ? '▶' : ''}</div>` +
      `<div class="md">${m.intro[0].text}</div>` +
      `<div class="mp">Payout: $${m.payout.toLocaleString()}</div>`;
    el.appendChild(d);
  });
  // weapon shop
  const shop = document.createElement('div');
  shop.className = 'mrow';
  shop.innerHTML = `<div class="mt">WEAPON SHOP — spend your cash</div><div class="md">Buy locked weapons here. Click to buy.</div>`;
  el.appendChild(shop);
  WEAPONS.forEach((w, i) => {
    if (!w.locked) return;
    const b = document.createElement('button');
    b.textContent = `${w.name} — $${w.price.toLocaleString()} (${w.desc})`;
    b.style.cssText = 'display:block;width:100%;text-align:left;background:rgba(255,255,255,.08);border:1px solid #ff9f1c;color:#fff;padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:14px;cursor:pointer';
    b.onclick = () => {
      if (G.money >= w.price) {
        G.money -= w.price; w.locked = false;
        audio.cash();
        renderStory();
      }
    };
    el.appendChild(b);
  });
}

export function renderStats() {
  const s = G.stats;
  const rows = [
    ['Cash earned', fmtMoney(s.cashEarned)],
    ['Current cash', fmtMoney(G.money)],
    ['Missions completed', `${G.missionsDone.length} / ${MISSIONS.length}`],
    ['Respect rank', `${G.respect} / 5`],
    ['Cars stolen', s.carsStolen],
    ['Cops evaded', s.copsEvaded],
    ['Street races won', s.racesWon],
    ['Golden shells', `${G.shellsTaken} / 20`],
    ['Store robberies', s.robberies],
    ['Taxi fares', s.fares],
    ['Enemies taken down', s.kills],
    ['Shots fired / hits', `${s.shots} / ${s.hits}`],
    ['Wanted level', '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted)],
    ['Day / time', `Day ${G.time.day}`],
  ];
  const el = $('stats-list');
  el.innerHTML = rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('') +
    `<div class="srow"><span>District reputations</span><b>${DISTRICTS.map((d) => d.name.split(' ')[0] + ' ' + d.rep).join(' · ')}</b></div>`;
}

export function bindMapMenu() {
  document.querySelectorAll('.map-tabs button[data-tab]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.map-tabs button[data-tab]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('#mapmenu .tab').forEach((t) => t.classList.remove('active'));
      $('tab-' + b.dataset.tab).classList.add('active');
      if (b.dataset.tab === 'map') drawBigMap();
      if (b.dataset.tab === 'story') renderStory();
      if (b.dataset.tab === 'stats') renderStats();
    };
  });
  $('btn-close-map').onclick = closeMapMenu;
  $('btn-resume').onclick = closePause;
  $('btn-map').onclick = () => { closePause(); openMapMenu(); };
  $('btn-save').onclick = () => { saveSlot(0); };
  $('btn-title').onclick = () => { location.reload(); };
}
