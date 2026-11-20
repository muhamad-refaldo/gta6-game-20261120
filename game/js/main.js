// main.js — Solara City boot, game loop, camera, wanted level, car entry,
// scene staging (?scene=) and rendering.
window.SC = window.SC || {};
(function () {
  var canvas, ctx;
  var G = null;
  var lastT = 0;

  function newGameState() {
    return {
      state: 'title', time: 0,
      money: 0, wanted: 0, heat: 0, hiddenT: 0,
      missionIdx: 0, objectiveIdx: 0, missionState: {},
      cars: [], peds: [], bullets: [], particles: [], rivals: [], police: [],
      camera: { x: 0, y: 0, w: 1280, h: 720 },
      player: SC.Player.create(1000, 1000),
      muted: false
    };
  }

  // Wanted level: crimes raise it, police respond, hiding lowers it.
  function addWanted(n) {
    if (!G || G.state !== 'playing') return;
    G.wanted = Math.max(0, Math.min(5, G.wanted + n));
    G.heat = 0; G.hiddenT = 0;
    syncPolice();
    SC.Audio.siren(G.wanted > 0);
  }

  function syncPolice() {
    if (!G) return;
    // Wanted level N wants N police cars on the streets.
    while (G.police.length < G.wanted) SC.Vehicles.spawnPolice(G, 1);
    while (G.police.length > G.wanted) {
      var c = G.police.pop();
      var idx = G.cars.indexOf(c);
      if (idx >= 0) G.cars.splice(idx, 1);
    }
    SC.Audio.siren(G.wanted > 0);
  }

  function updateWanted(dt) {
    if (G.wanted === 0) return;
    var nearPolice = false;
    for (var i = 0; i < G.police.length; i++) {
      if (Math.hypot(G.police[i].x - G.player.x, G.police[i].y - G.player.y) < 520) { nearPolice = true; break; }
    }
    if (!nearPolice) {
      G.hiddenT += dt;
      if (G.hiddenT > 8) {
        G.wanted--;
        G.hiddenT = 0;
        SC.HUD.toast(G.wanted > 0 ? 'Heat dying down...' : 'You lost them!');
        syncPolice();
      }
    } else G.hiddenT = 0;
  }

  function tryEnterCar() {
    var p = G.player;
    if (!p.onFoot) {
      // Exit the car.
      var c = p.car;
      p.car = null; p.onFoot = true;
      p.x = c.x + Math.cos(c.angle + Math.PI / 2) * 34;
      p.y = c.y + Math.sin(c.angle + Math.PI / 2) * 34;
      if (SC.City.collides(p.x, p.y, p.r)) { p.x = c.x - 34; p.y = c.y - 34; }
      c.driver = 'parked';
      return;
    }
    var car = SC.Vehicles.nearestCar(G, p.x, p.y, 60);
    if (!car) return;
    if (car.driver === 'police') { SC.HUD.toast('Too hot — that is a police car!'); return; }
    if (car.driver === 'traffic') {
      // Carjacking: the driver bails out as a pedestrian.
      SC.Peds.spawn(G, 0);
      G.peds.push({ x: car.x + 26, y: car.y + 26, angle: Math.random() * 6, r: 10, speed: 170,
        shirt: '#e86a6a', skin: '#ffd9a0', state: 'flee', fleeX: car.x + 300, fleeY: car.y + 300, phase: 0 });
      addWanted(1);
      SC.HUD.toast('Car stolen! The PD is on to you.');
    }
    car.driver = 'player';
    p.car = car; p.onFoot = false;
    p.x = car.x; p.y = car.y;
    SC.Audio.pickup();
  }

  function update(dt) {
    if (G.state !== 'playing') return;
    G.time += dt;
    // Pause / mute.
    if (SC.Input.wasPressed('p')) {
      G.state = 'paused';
      SC.HUD.showPause(true);
      return;
    }
    if (SC.Input.wasPressed('m')) { G.muted = SC.Audio.toggleMute(); }
    if (SC.Input.wasPressed('e')) tryEnterCar();
    SC.Player.update(G, dt);
    SC.Vehicles.update(G, dt);
    SC.Peds.update(G, dt);
    SC.Missions.update(G, dt);
    SC.Combat.update(G, dt);
    updateWanted(dt);
    // Rival car ramming counts for mission 3.
    var o = SC.Missions.objective(G);
    if (o && o.type === 'chase' && G.missionState.rival && G.player.car) {
      var rv = G.missionState.rival;
      if (Math.hypot(rv.x - G.player.car.x, rv.y - G.player.car.y) < 60) {
        var rel = Math.hypot(G.player.car.vx - rv.vx, G.player.car.vy - rv.vy);
        if (rel > 120 && !G.missionState.hitCd) {
          G.missionState.hits = (G.missionState.hits || 0) + 1;
          G.missionState.hitCd = 1.2;
          SC.Audio.crash();
          SC.HUD.toast('RAM! ' + G.missionState.hits + '/' + o.hits);
          SC.Peds.scare(G, rv.x, rv.y, 300);
        }
      }
    }
    if (G.missionState.hitCd) G.missionState.hitCd -= dt;
    // Particles.
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
      if (pt.life <= 0) G.particles.splice(i, 1);
    }
    // Camera follows the player smoothly.
    var cam = G.camera;
    var tx = Math.max(0, Math.min(SC.City.SIZE - cam.w, G.player.x - cam.w / 2));
    var ty = Math.max(0, Math.min(SC.City.SIZE - cam.h, G.player.y - cam.h / 2));
    cam.x += (tx - cam.x) * Math.min(1, 5 * dt);
    cam.y += (ty - cam.y) * Math.min(1, 5 * dt);
    // Engine + siren sounds.
    var sp01 = G.player.car ? Math.min(1, SC.Vehicles.speedOf(G.player.car) / 500) : 0;
    SC.Audio.setEngine(sp01);
    SC.Audio.sirenTick(dt);
    SC.HUD.update(G);
  }

  function render() {
    var cam = G.camera;
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    SC.City.draw(ctx, cam);
    // Mission marker on the ground.
    var o = SC.Missions.objective(G);
    if (o && o.x !== undefined && G.state === 'playing') {
      var pulse = 26 + Math.sin(Date.now() / 220) * 6;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(o.x, o.y, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,62,0.25)';
      ctx.beginPath(); ctx.arc(o.x, o.y, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.moveTo(o.x, o.y - pulse - 26); ctx.lineTo(o.x - 10, o.y - pulse - 8); ctx.lineTo(o.x + 10, o.y - pulse - 8); ctx.closePath(); ctx.fill();
    }
    SC.Peds.draw(ctx, G);
    SC.Vehicles.draw(ctx, G);
    SC.Player.draw(ctx, G.player, cam);
    SC.Combat.draw(ctx, G);
    // Particles.
    for (var i = 0; i < G.particles.length; i++) {
      var pt = G.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Screen-edge arrow toward the mission objective.
    if (o && o.x !== undefined && G.state === 'playing') {
      var sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx < 0 || sy < 0 || sx > canvas.width || sy > canvas.height) {
        var cx = canvas.width / 2, cy = canvas.height / 2;
        var a = Math.atan2(sy - cy, sx - cx);
        var ex = cx + Math.cos(a) * (canvas.width / 2 - 60);
        var ey = cy + Math.sin(a) * (canvas.height / 2 - 60);
        ctx.save();
        ctx.translate(ex, ey); ctx.rotate(a);
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // "Grab the cash" progress ring.
    if (o && o.type === 'grab' && G.missionState.grabT > 0) {
      ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GRABBING CASH... ' + Math.ceil(4 - G.missionState.grabT) + 's', canvas.width / 2, 90);
    }
    // Vignette for the sunny look.
    var grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.45,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.95);
    grad.addColorStop(0, 'rgba(255,220,150,0)');
    grad.addColorStop(1, 'rgba(255,180,80,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (G.state === 'playing') update(dt);
    else if (G.state === 'paused' && SC.Input.wasPressed('p')) {
      G.state = 'playing';
      SC.HUD.showPause(false);
    }
    if (G.state === 'playing' || G.state === 'busted' || G.state === 'wasted' || G.state === 'paused') render();
    SC.Input.endFrame();
  }

  function startGame(fresh) {
    if (fresh) {
      G = newGameState();
      SC.City.generate();
      SC.Vehicles.spawnTraffic(G, 24);
      SC.Vehicles.spawnParked(G, 14);
      SC.Peds.spawn(G, 42);
      G.camera.x = G.player.x - 640;
      G.camera.y = G.player.y - 360;
    }
    G.state = 'playing';
    SC.HUD.showGame();
    SC.Audio.init();
    SC.Missions.start(G, G.missionIdx);
  }

  function continueGame() {
    var s = SC.Save.load();
    G = newGameState();
    SC.City.generate();
    SC.Vehicles.spawnTraffic(G, 24);
    SC.Vehicles.spawnParked(G, 14);
    SC.Peds.spawn(G, 42);
    if (s) {
      G.money = s.money; G.missionIdx = s.missionIdx;
      G.player.x = s.x; G.player.y = s.y;
      G.player.health = s.health || 100;
      if (SC.City.collides(G.player.x, G.player.y, 14)) { G.player.x = 1000; G.player.y = 1000; }
    }
    G.camera.x = G.player.x - 640;
    G.camera.y = G.player.y - 360;
    G.state = 'playing';
    SC.HUD.showGame();
    SC.Audio.init();
    SC.Missions.start(G, G.missionIdx);
    SC.HUD.toast('Welcome back, Rex.');
  }

  // ?scene= staging for deterministic screenshots: title | chase | onfoot | mission
  function applyScene(scene) {
    if (!scene || scene === 'title') return;
    startGame(true);
    if (scene === 'chase') {
      var car = SC.Vehicles.makeCar(1400, 1400, 0, 'sport', 'player');
      car.color = '#d23c3c';
      car.vx = 300; // rolling east down the avenue as the shot opens
      G.cars.push(car);
      G.player.car = car; G.player.onFoot = false;
      G.player.x = car.x; G.player.y = car.y;
      G.wanted = 3;
      syncPolice();
      // Put the police right behind the player so the chase reads on screen.
      for (var i = 0; i < G.police.length; i++) {
        var pc = G.police[i];
        pc.x = G.player.x - 220 - i * 130;
        pc.y = G.player.y + (i % 2 === 0 ? 36 : -36);
        pc.angle = 0; pc.vx = 320; pc.vy = 0;
      }
      G.missionIdx = 3; G.objectiveIdx = 0;
      G.missionState = { hits: 0, kills: 0, grabT: 0, escapeT: 0, rival: null, rivals: [] };
      SC.HUD.toast('MISSION: Heat Wave — lose the police!');
    }
    if (scene === 'onfoot') {
      G.player.x = 1400; G.player.y = 1400;
      G.camera.x = G.player.x - 640; G.camera.y = G.player.y - 360;
    }
    if (scene === 'mission') {
      // Mid-block on the marina road, clear of passing traffic for the shot.
      var car2 = SC.Vehicles.makeCar(2400, 2200, -Math.PI / 2, 'sedan', 'player');
      G.cars.push(car2);
      for (var ci = G.cars.length - 1; ci >= 0; ci--) {
        var cc = G.cars[ci];
        if (cc !== car2 && Math.hypot(cc.x - 2400, cc.y - 2200) < 320) G.cars.splice(ci, 1);
      }
      G.player.car = car2; G.player.onFoot = false;
      G.player.x = car2.x; G.player.y = car2.y;
      G.missionIdx = 1; G.objectiveIdx = 0;
      G.missionState = { hits: 0, kills: 0, grabT: 0, escapeT: 0, rival: null, rivals: [] };
      SC.HUD.say('Marco', 'A package needs to reach the Marina, no questions, no stops.', 6);
    }
    if (scene === 'city') {
      // On foot by the beach road: palms, sand and sea on the right of frame.
      G.player.x = 2700; G.player.y = 1800;
      G.camera.x = 2060; G.camera.y = 1440;
    }
  }

  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (G) { G.camera.w = canvas.width; G.camera.h = canvas.height; }
    }
    window.addEventListener('resize', resize);
    resize();
    SC.Input.init(canvas);
    SC.HUD.grab();
    G = newGameState();
    SC.City.generate();
    SC.Vehicles.spawnTraffic(G, 24);
    SC.Vehicles.spawnParked(G, 14);
    SC.Peds.spawn(G, 42);
    // Title screen backdrop: a slow pan over the city.
    G.camera.x = 1200; G.camera.y = 800;
    G.state = 'title';
    SC.HUD.showStart(SC.Save.hasSave());
    document.getElementById('btnNew').addEventListener('click', function () { SC.Save.clear(); startGame(true); });
    document.getElementById('btnContinue').addEventListener('click', continueGame);
    document.getElementById('btnResume').addEventListener('click', function () {
      G.state = 'playing'; SC.HUD.showPause(false);
    });
    document.getElementById('btnSave').addEventListener('click', function () {
      if (SC.Save.save(G)) SC.HUD.toast('Game saved.');
      else SC.HUD.toast('Save failed.');
    });
    document.getElementById('btnQuit').addEventListener('click', function () {
      SC.Save.save(G);
      G = newGameState();
      SC.City.generate();
      SC.Vehicles.spawnTraffic(G, 24);
      SC.Vehicles.spawnParked(G, 14);
      SC.Peds.spawn(G, 42);
      SC.HUD.showStart(SC.Save.hasSave());
    });
    document.getElementById('btnRetry').addEventListener('click', function () {
      var s = SC.Save.load();
      if (s) continueGame();
      else startGame(true);
    });
    document.getElementById('btnTitle').addEventListener('click', function () {
      G = newGameState();
      SC.City.generate();
      SC.Vehicles.spawnTraffic(G, 24);
      SC.Vehicles.spawnParked(G, 14);
      SC.Peds.spawn(G, 42);
      SC.HUD.showStart(SC.Save.hasSave());
    });
    // Screenshot staging via query param.
    var scene = null;
    try {
      scene = new URLSearchParams(window.location.search).get('scene');
    } catch (e) {}
    if (scene) applyScene(scene);
    // Idle title pan: drift the camera so the title screen shows a living city.
    setInterval(function () {
      if (G.state !== 'title') return;
      G.camera.x = 1200 + Math.sin(Date.now() / 9000) * 500;
      G.camera.y = 800 + Math.cos(Date.now() / 11000) * 300;
      // Keep traffic moving behind the title.
      SC.Vehicles.update(G, 0.016);
      SC.Peds.update(G, 0.016);
      render();
    }, 32);
    requestAnimationFrame(loop);
  }

  SC.addWanted = addWanted;
  SC.Game = { boot: boot, startGame: startGame, continueGame: continueGame, getState: function () { return G; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
