// Solara City 3D v3.3 — saves: 3 slots in localStorage, autosave after every
// mission, safe defaults so saves from older versions still load.
// Fresh rewrite for v3.3. Exports: saveSlot, loadSlot, applySave, listSlots,
// autosave.
import { G, fmtMoney } from './state.js';
import { WEAPONS } from './combat.js';
import { toast } from './hud.js';

const KEY = (i) => `solara-city-save-${i}`;
const SLOTS = 3;

const DEFAULT_STATS = {
  cashEarned: 0, carsStolen: 0, copsEvaded: 0, racesWon: 0, kills: 0,
  robberies: 0, fares: 0, shots: 0, hits: 0, distance: 0, maxWanted: 0,
};

function buildSave() {
  const p = G.player;
  return {
    v: 2,
    money: G.money,
    health: G.health,
    armour: G.armour,
    time: { day: G.time.day, hour: G.time.hour },
    missionIndex: G.missionIndex,
    missionsDone: [...(G.missionsDone || [])],
    respect: G.respect,
    stats: { ...G.stats },
    shellsTaken: G.shellsTaken,
    weapons: (G.weapons || []).map((w) => ({ locked: w.locked, ammoLeft: w.ammoLeft })),
    weaponIndex: G.weaponIndex,
    pos: p ? { x: p.pos.x, y: p.pos.y, z: p.pos.z } : { x: 0, y: 0, z: 0 },
    radio: G.radio,
    day: G.time.day,
    shells: (G.city ? G.city.shells : []).map((s) => !!s.taken),
    jumpsDone: [...(G.jumpsDone || [])],
    safehousesOwned: [...(G.safehousesOwned || [])],
    crew: G.crew || null,
  };
}

export function saveSlot(i) {
  try {
    localStorage.setItem(KEY(i), JSON.stringify(buildSave()));
    toast(`Game saved — Slot ${i + 1}`);
    return true;
  } catch (e) {
    toast('Save failed — storage unavailable');
    return false;
  }
}

export function autosave() {
  try {
    localStorage.setItem(KEY(0), JSON.stringify(buildSave()));
  } catch (e) { /* autosave is best-effort */ }
}

export function loadSlot(i) {
  try {
    const raw = localStorage.getItem(KEY(i));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    return s;
  } catch (e) {
    toast('Save slot is corrupt');
    return null;
  }
}

export function listSlots() {
  const labels = [];
  for (let i = 0; i < SLOTS; i++) {
    const s = loadSlot(i);
    if (!s) labels.push(`Slot ${i + 1} — Empty`);
    else {
      labels.push(`Slot ${i + 1} — Day ${s.day || 1} · ${fmtMoney(s.money || 0)} · ${(s.missionsDone || []).length}/10 missions`);
    }
  }
  return labels;
}

export function applySave(s) {
  if (!s) return false;
  G.money = typeof s.money === 'number' ? s.money : 500;
  G.health = typeof s.health === 'number' ? s.health : 100;
  G.armour = typeof s.armour === 'number' ? s.armour : 0;
  const day = (s.time && s.time.day) || s.day || 1;
  const hour = (s.time && typeof s.time.hour === 'number') ? s.time.hour : 17.6;
  G.time = { day, hour };
  G.missionIndex = typeof s.missionIndex === 'number' ? s.missionIndex : 0;
  G.missionsDone = Array.isArray(s.missionsDone) ? [...s.missionsDone] : [];
  G.mission = null; // no active mission after a load (startGame(false) does not resume one)
  G.respect = typeof s.respect === 'number' ? s.respect : 0;
  G.stats = { ...DEFAULT_STATS, ...(s.stats || {}) };
  G.shellsTaken = typeof s.shellsTaken === 'number' ? s.shellsTaken : 0;
  G.weapons = WEAPONS.map((w, i) => {
    const saved = Array.isArray(s.weapons) ? s.weapons[i] : null;
    return {
      ...w,
      locked: saved && typeof saved.locked === 'boolean' ? saved.locked : w.locked,
      ammoLeft: saved && typeof saved.ammoLeft === 'number' ? saved.ammoLeft : (saved && saved.ammoLeft === null ? null : w.ammo),
    };
  });
  G.weaponIndex = typeof s.weaponIndex === 'number' ? s.weaponIndex : 2;
  G.radio = typeof s.radio === 'number' ? s.radio : 0;
  G.jumpsDone = Array.isArray(s.jumpsDone) ? [...s.jumpsDone] : [];
  G.safehousesOwned = Array.isArray(s.safehousesOwned) ? [...s.safehousesOwned] : [];
  G.crew = s.crew || null;
  // shells: restore taken states + mesh visibility
  if (G.city && Array.isArray(s.shells)) {
    G.city.shells.forEach((sh, i) => {
      sh.taken = !!s.shells[i];
      if (sh.mesh) sh.mesh.visible = !sh.taken;
    });
  }
  // player: on foot at the saved position (cars are not saved)
  if (G.player) {
    const pos = s.pos || { x: 0, y: 0, z: 0 };
    G.player.car = null;
    G.player.onFoot = true;
    G.player.pos.set(pos.x || 0, 0, pos.z || 0);
    G.player.group.position.copy(G.player.pos);
    G.player.group.visible = true;
    G.player.speed = 0;
  }
  G.wanted = 0;
  G.heat = 0;
  G.gameOver = false;
  G.busted = false;
  toast('Save loaded');
  return true;
}
