// save.js — localStorage save / load for Solara City progress.
window.SC = window.SC || {};
(function () {
  var KEY = 'solara-city-save-v1';

  function save(G) {
    try {
      var data = {
        money: G.money, missionIdx: G.missionIdx,
        x: Math.round(G.player.x), y: Math.round(G.player.y),
        health: G.player.health, savedAt: Date.now()
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (typeof d.money !== 'number' || typeof d.missionIdx !== 'number') return null;
      return d;
    } catch (e) { return null; }
  }

  function hasSave() { return load() !== null; }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  SC.Save = { save: save, load: load, hasSave: hasSave, clear: clear };
})();
