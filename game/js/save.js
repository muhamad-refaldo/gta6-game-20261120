// Solara City 3D — saves: 3 slots + autosave after each mission (localStorage).
import { G } from './state.js';
import { toast } from './hud.js';

const KEY = (i) => `solara-city-save-${i}`;

export function snapshot() {
  return {
    v: 2, money: G.money, health: G.health, armour: G.armour,
    time: G.time, missionIndex: G.missionIndex, missionsDone: G.missionsDone,
    respect: G.respect, stats: G.stats, shellsTaken: G.shellsTaken,
    weapons: G.weapons.map((w) => ({ locked: w.locked, ammoLeft: w.ammoLeft })),
    weaponIndex: G.weaponIndex,
    pos: { x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z },
    radio: G.radio, day: G.time.day,
    shells: G.city.shells.map((s) => s.taken),
  };
}

export function saveSlot(i) {
  try {
    localStorage.setItem(KEY(i), JSON.stringify(snapshot()));
    toast(`Saved to slot ${i + 1}`);
    return true;
  } catch (e) { toast('Save failed (storage unavailable)'); return false; }
}

export function autosave() { saveSlot(0); }

export function loadSlot(i) {
  try {
    const raw = localStorage.getItem(KEY(i));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function listSlots() {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const s = loadSlot(i);
    out.push(s ? `Slot ${i + 1}: Day ${s.day} · $${Math.round(s.money).toLocaleString()} · ${s.missionsDone.length} missions` : `Slot ${i + 1}: empty`);
  }
  return out;
}

export function applySave(s) {
  if (!s) return false;
  G.money = s.money; G.health = s.health; G.armour = s.armour;
  G.time = s.time; G.missionIndex = s.missionIndex; G.missionsDone = s.missionsDone || [];
  G.respect = s.respect || 0; G.stats = s.stats || G.stats; G.shellsTaken = s.shellsTaken || 0;
  if (s.weapons) s.weapons.forEach((w, i) => { if (G.weapons[i]) { G.weapons[i].locked = w.locked; G.weapons[i].ammoLeft = w.ammoLeft; } });
  G.weaponIndex = s.weaponIndex || 0;
  G.player.pos.set(s.pos.x, s.pos.y, s.pos.z);
  G.player.group.position.copy(G.player.pos);
  G.radio = s.radio || 0;
  if (s.shells) s.shells.forEach((taken, i) => {
    if (taken && G.city.shells[i]) { G.city.shells[i].taken = true; G.scene.remove(G.city.shells[i].mesh); }
  });
  return true;
}
