// hud.js — DOM HUD (stars, health, money, objective), minimap, dialogue, toasts.
window.SC = window.SC || {};
(function () {
  var els = {};
  var dlgTimer = null, toastTimer = null;

  function grab() {
    els.hud = document.getElementById('hud');
    els.wanted = document.getElementById('wanted');
    els.healthfill = document.getElementById('healthfill');
    els.money = document.getElementById('money');
    els.speed = document.getElementById('speed');
    els.objective = document.getElementById('objective');
    els.dialogue = document.getElementById('dialogue');
    els.dlgName = document.getElementById('dlg-name');
    els.dlgText = document.getElementById('dlg-text');
    els.toast = document.getElementById('toast');
    els.minimap = document.getElementById('minimap');
    els.start = document.getElementById('startScreen');
    els.pause = document.getElementById('pauseScreen');
    els.end = document.getElementById('endScreen');
    els.endTitle = document.getElementById('endTitle');
    els.endText = document.getElementById('endText');
    els.btnContinue = document.getElementById('btnContinue');
  }

  function showStart(hasSave) {
    els.start.classList.remove('hidden');
    els.hud.classList.add('hidden');
    els.pause.classList.add('hidden');
    els.end.classList.add('hidden');
    if (hasSave) els.btnContinue.classList.remove('hidden');
  }
  function showGame() {
    els.start.classList.add('hidden');
    els.pause.classList.add('hidden');
    els.end.classList.add('hidden');
    els.hud.classList.remove('hidden');
  }
  function showPause(on) { els.pause.classList.toggle('hidden', !on); }
  function showEnd(title, text) {
    els.endTitle.textContent = title;
    els.endText.textContent = text;
    els.end.classList.remove('hidden');
  }

  function say(name, text, seconds) {
    els.dlgName.textContent = name;
    els.dlgText.textContent = text;
    els.dialogue.classList.remove('hidden');
    if (dlgTimer) clearTimeout(dlgTimer);
    dlgTimer = setTimeout(function () { els.dialogue.classList.add('hidden'); }, (seconds || 5) * 1000);
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.add('hidden'); }, 2600);
  }

  function update(G) {
    // Wanted stars.
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < G.wanted ? '\u2605' : '<span class="off">\u2605</span>';
    els.wanted.innerHTML = stars;
    els.healthfill.style.width = Math.max(0, G.player.health) + '%';
    els.money.textContent = '$' + G.money.toLocaleString('en-US');
    var sp = 0;
    if (G.player.car) sp = Math.round(SC.Vehicles.speedOf(G.player.car) * 0.45);
    else if (G.player.moving) sp = 12;
    els.speed.textContent = sp + ' km/h';
    var o = SC.Missions.objective(G);
    var m = SC.Missions.current(G);
    if (m && o) {
      var extra = '';
      if (o.type === 'chase') extra = '  (' + (G.missionState.hits || 0) + '/' + o.hits + ' hits)';
      if (o.type === 'eliminate') extra = '  (' + (G.missionState.kills || 0) + '/' + o.count + ' down)';
      if (o.type === 'grab') extra = '  (' + Math.ceil(Math.max(0, 4 - (G.missionState.grabT || 0))) + 's)';
      els.objective.textContent = 'MISSION ' + m.id + ': ' + m.title + ' — ' + o.desc + extra;
    } else if (m) {
      els.objective.textContent = 'MISSION ' + m.id + ': ' + m.title;
    } else {
      els.objective.textContent = 'Free roam — explore Solara City. Find Marco for work.';
    }
    drawMinimap(G);
  }

  function drawMinimap(G) {
    var c = els.minimap;
    if (!c) return;
    var x = c.getContext('2d');
    var S = SC.City.SIZE, k = 180 / S;
    x.clearRect(0, 0, 180, 180);
    x.save();
    x.beginPath(); x.arc(90, 90, 88, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#20242e'; x.fillRect(0, 0, 180, 180);
    // Sea + beach.
    x.fillStyle = '#2f8fd0'; x.fillRect(3064 * k, 0, 180, 180);
    x.fillStyle = '#e8d5a0'; x.fillRect(2920 * k, 0, (3064 - 2920) * k, 180);
    // Roads.
    x.strokeStyle = '#8a8a96'; x.lineWidth = 3;
    var lines = SC.City.lines;
    for (var i = 0; i < lines.length; i++) {
      x.beginPath(); x.moveTo(0, lines[i] * k); x.lineTo(180, lines[i] * k); x.stroke();
      x.beginPath(); x.moveTo(lines[i] * k, 0); x.lineTo(lines[i] * k, 180); x.stroke();
    }
    // Buildings.
    x.fillStyle = '#5a5f6e';
    var bs = SC.City.buildings();
    for (var b = 0; b < bs.length; b++) {
      x.fillRect(bs[b].x * k, bs[b].y * k, Math.max(2, bs[b].w * k), Math.max(2, bs[b].h * k));
    }
    // Mission marker.
    var o = SC.Missions.objective(G);
    if (o && o.x !== undefined) {
      var pulse = 5 + Math.sin(Date.now() / 200) * 2;
      x.fillStyle = '#ffd23e';
      x.beginPath(); x.arc(o.x * k, o.y * k, pulse, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#000'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(o.x * k, o.y * k, pulse, 0, Math.PI * 2); x.stroke();
    }
    // Police (red) and player (white arrow).
    x.fillStyle = '#ff3b30';
    for (var p = 0; p < G.police.length; p++) {
      x.beginPath(); x.arc(G.police[p].x * k, G.police[p].y * k, 3, 0, Math.PI * 2); x.fill();
    }
    x.save();
    x.translate(G.player.x * k, G.player.y * k);
    x.rotate(G.player.angle);
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(6, 0); x.lineTo(-4, -4); x.lineTo(-4, 4); x.closePath(); x.fill();
    x.restore();
    x.restore();
  }

  SC.HUD = { grab: grab, showStart: showStart, showGame: showGame, showPause: showPause,
    showEnd: showEnd, say: say, toast: toast, update: update };
})();
