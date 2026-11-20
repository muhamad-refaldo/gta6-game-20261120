// vehicles.js — car physics, traffic AI, police AI and parked cars.
window.SC = window.SC || {};
(function () {
  var COLORS = ['#d23c3c', '#3c7ad2', '#e8c33c', '#e8e8e8', '#3aa655', '#8a5fc0', '#e07a2e', '#222831'];
  var KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport'];
  var idc = 1;

  function makeCar(x, y, angle, kind, driver) {
    var c = {
      id: idc++, x: x, y: y, angle: angle, vx: 0, vy: 0,
      kind: kind || 'sedan', driver: driver || 'traffic',
      color: kind === 'taxi' ? '#f2c200' : COLORS[Math.floor(Math.random() * COLORS.length)],
      len: kind === 'truck' ? 62 : 46, wid: kind === 'truck' ? 26 : 22,
      maxSpeed: kind === 'sport' ? 520 : kind === 'truck' ? 300 : 400,
      health: 100, siren: driver === 'police',
      // traffic AI state
      road: 'h', line: 0, dir: 1, target: null, waitT: 0,
      skid: []
    };
    if (driver === 'police') { c.color = '#20242e'; c.kind = 'police'; c.maxSpeed = 470; }
    return c;
  }

  function speedOf(c) { return Math.hypot(c.vx, c.vy); }

  // Arcade car physics: engine force along the nose, steering by speed,
  // strong lateral grip, handbrake loosens it for slides.
  function drivePhysics(c, throttle, steer, handbrake, dt) {
    var fwdX = Math.cos(c.angle), fwdY = Math.sin(c.angle);
    var fwdSpeed = c.vx * fwdX + c.vy * fwdY;
    var accel = throttle > 0 ? 300 : (throttle < 0 ? 220 : 0);
    fwdSpeed += accel * throttle * dt;
    if (throttle === 0) fwdSpeed -= fwdSpeed * 1.4 * dt; // drag
    if (throttle < 0 && fwdSpeed > 0) fwdSpeed -= 420 * dt; // brake
    var maxF = throttle < 0 ? -140 : c.maxSpeed;
    fwdSpeed = Math.max(-140, Math.min(c.maxSpeed, fwdSpeed));
    var steerAmt = steer * 2.4 * Math.min(1, Math.abs(fwdSpeed) / 140) * (fwdSpeed >= 0 ? 1 : -1);
    c.angle += steerAmt * dt * (handbrake ? 1.5 : 1);
    var latGrip = handbrake ? 2.2 : 9;
    var nx = Math.cos(c.angle), ny = Math.sin(c.angle);
    var latX = -ny, latY = nx;
    var latSpeed = c.vx * latX + c.vy * latY;
    latSpeed -= latSpeed * Math.min(1, latGrip * dt);
    c.vx = nx * fwdSpeed + latX * latSpeed;
    c.vy = ny * fwdSpeed + latY * latSpeed;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (handbrake && Math.abs(fwdSpeed) > 150 && Math.random() < 0.5) {
      c.skid.push({ x: c.x - nx * c.len / 2, y: c.y - ny * c.len / 2, a: 0.5 });
      if (c.skid.length > 40) c.skid.shift();
    }
    for (var i = c.skid.length - 1; i >= 0; i--) {
      c.skid[i].a -= dt * 0.25;
      if (c.skid[i].a <= 0) c.skid.splice(i, 1);
    }
  }

  function collideWorld(c) {
    if (SC.City.collides(c.x, c.y, c.wid / 2)) {
      // Simple bounce: kill velocity into the wall.
      c.vx *= -0.3; c.vy *= -0.3;
      c.x -= c.vx * 0.02; c.y -= c.vy * 0.02;
      return true;
    }
    return false;
  }

  // --- Traffic AI: follow the road grid, right-hand lane, turn at intersections.
  function trafficStep(G, c, dt) {
    var lines = SC.City.lines;
    if (!c.target) {
      // Snap to the nearest road and pick a heading.
      var nx = SC.City.nearestLine(c.x), ny = SC.City.nearestLine(c.y);
      if (Math.abs(c.x - nx) < Math.abs(c.y - ny)) { c.road = 'v'; c.line = nx; c.dir = c.y < ny ? 1 : -1; }
      else { c.road = 'h'; c.line = ny; c.dir = c.x < nx ? 1 : -1; }
      c.target = nextIntersection(c);
    }
    var tx = c.target.x, ty = c.target.y;
    var dx = tx - c.x, dy = ty - c.y;
    var dist = Math.hypot(dx, dy);
    var want = Math.atan2(dy, dx);
    var diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff * 3 * dt));
    // Slow down for a car ahead.
    var ahead = carAhead(G, c, 70);
    var throttle = ahead ? 0 : 1;
    if (dist < 30) {
      c.target = nextIntersection(c);
      // At an intersection, sometimes turn.
      if (Math.random() < 0.35) {
        var turn = Math.random() < 0.5 ? 1 : -1;
        c.road = c.road === 'h' ? 'v' : 'h';
        c.dir = turn;
        c.target = nextIntersection(c);
      }
    }
    // Keep to the right-hand lane: nudge toward the lane offset.
    var lane = 15;
    if (c.road === 'h') {
      var wantY = c.line + (c.dir > 0 ? lane : -lane);
      c.y += (wantY - c.y) * Math.min(1, 2 * dt);
      c.angle += ((c.dir > 0 ? 0 : Math.PI) - c.angle) * 0 + 0;
    } else {
      var wantX = c.line + (c.dir > 0 ? -lane : lane);
      c.x += (wantX - c.x) * Math.min(1, 2 * dt);
    }
    drivePhysics(c, throttle, Math.max(-1, Math.min(1, diff * 2)), false, dt);
    var sp = speedOf(c);
    if (sp > 150) { c.vx *= 150 / sp; c.vy *= 150 / sp; }
    collideWorld(c);
  }

  function nextIntersection(c) {
    var lines = SC.City.lines;
    if (c.road === 'h') {
      var nx = c.x + c.dir * 400;
      nx = Math.max(lines[0], Math.min(lines[lines.length - 1], nx));
      return { x: nx, y: c.line };
    }
    var ny = c.y + c.dir * 400;
    ny = Math.max(lines[0], Math.min(lines[lines.length - 1], ny));
    return { x: c.line, y: ny };
  }

  function carAhead(G, c, dist) {
    var fx = Math.cos(c.angle), fy = Math.sin(c.angle);
    for (var i = 0; i < G.cars.length; i++) {
      var o = G.cars[i];
      if (o === c) continue;
      var dx = o.x - c.x, dy = o.y - c.y;
      var along = dx * fx + dy * fy;
      var side = Math.abs(dx * -fy + dy * fx);
      if (along > 0 && along < dist && side < 26) return true;
    }
    return false;
  }

  // --- Police AI: chase the player, ram, and try to bust on foot.
  function policeStep(G, c, dt) {
    var p = G.player;
    var dx = p.x - c.x, dy = p.y - c.y;
    var dist = Math.hypot(dx, dy);
    var want = Math.atan2(dy, dx);
    var diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    var steer = Math.max(-1, Math.min(1, diff * 2.2));
    drivePhysics(c, 1, steer, false, dt);
    collideWorld(c);
    // Ram the player's car.
    if (!p.onFoot && p.car && dist < 55) {
      p.car.health -= 14 * dt;
      if (Math.random() < dt * 2) SC.Audio.crash();
      if (p.car.health <= 0) {
        explodeCar(G, p.car);
        p.car = null; p.onFoot = true;
        p.x += 30; p.y += 30;
        SC.HUD.toast('Your car is wrecked!');
      }
    }
    // Bust the player on foot: stand next to him for a moment.
    if (p.onFoot && dist < 42) {
      c.bustT = (c.bustT || 0) + dt;
      if (c.bustT > 1.6) {
        G.state = 'busted';
        SC.HUD.showEnd('BUSTED', 'The Solara PD caught up with Rex. Bail is $300 — the crew will cover it this time.');
        G.money = Math.max(0, G.money - 300);
      }
    } else c.bustT = 0;
  }

  function explodeCar(G, car) {
    for (var i = 0; i < 26; i++) {
      G.particles.push({ x: car.x, y: car.y, vx: (Math.random() - 0.5) * 320, vy: (Math.random() - 0.5) * 320,
        life: 0.7 + Math.random() * 0.5, max: 1.2, color: Math.random() < 0.5 ? '#ff7a2e' : '#555', r: 3 + Math.random() * 5 });
    }
    SC.Audio.crash();
    var idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  }

  function spawnTraffic(G, n) {
    var lines = SC.City.lines;
    for (var i = 0; i < n; i++) {
      var horizontal = Math.random() < 0.5;
      var line = lines[Math.floor(Math.random() * lines.length)];
      var along = lines[0] + Math.random() * (lines[lines.length - 1] - lines[0]);
      var kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      var c = makeCar(horizontal ? along : line, horizontal ? line : along,
        horizontal ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2), kind, 'traffic');
      c.road = horizontal ? 'h' : 'v'; c.line = line; c.dir = Math.random() < 0.5 ? 1 : -1;
      c.target = nextIntersection(c);
      G.cars.push(c);
    }
  }

  function spawnParked(G, n) {
    var lines = SC.City.lines;
    for (var i = 0; i < n; i++) {
      var horizontal = Math.random() < 0.5;
      var line = lines[Math.floor(Math.random() * lines.length)];
      var along = lines[0] + Math.random() * (lines[lines.length - 1] - lines[0]);
      var off = (Math.random() < 0.5 ? 1 : -1) * 44;
      var c = makeCar(horizontal ? along : line + off, horizontal ? line + off : along,
        horizontal ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        KINDS[Math.floor(Math.random() * KINDS.length)], 'parked');
      G.cars.push(c);
    }
  }

  function spawnPolice(G, n) {
    var p = G.player;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = 420 + Math.random() * 260;
      var x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      x = Math.max(60, Math.min(SC.City.SIZE - 60, x));
      y = Math.max(60, Math.min(SC.City.SIZE - 60, y));
      x = SC.City.nearestLine(x); y = SC.City.nearestLine(y);
      var c = makeCar(x, y, Math.atan2(p.y - y, p.x - x), 'police', 'police');
      G.cars.push(c);
      G.police.push(c);
    }
  }

  function nearestCar(G, x, y, maxD) {
    var best = null, bd = maxD;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      var d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function update(G, dt) {
    var p = G.player;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (c.driver === 'traffic') trafficStep(G, c, dt);
      else if (c.driver === 'police') policeStep(G, c, dt);
      else if (c.driver === 'player') {
        var ax = SC.Input.axis();
        var steer = ax.x;
        var throttle = ax.y < 0 ? 1 : (ax.y > 0 ? -1 : 0);
        drivePhysics(c, throttle, steer, SC.Input.isDown(' '), dt);
        collideWorld(c);
        // Sync player position to the car.
        p.x = c.x; p.y = c.y; p.angle = c.angle;
      }
    }
    // Car-car soft collisions: push apart.
    for (var a = 0; a < G.cars.length; a++) {
      for (var b = a + 1; b < G.cars.length; b++) {
        var A = G.cars[a], B = G.cars[b];
        var dx = B.x - A.x, dy = B.y - A.y;
        var d = Math.hypot(dx, dy);
        if (d > 0 && d < 44) {
          var push = (44 - d) / 2;
          var ux = dx / d, uy = dy / d;
          A.x -= ux * push; A.y -= uy * push;
          B.x += ux * push; B.y += uy * push;
          var tmpVx = A.vx, tmpVy = A.vy;
          A.vx = B.vx * 0.5; A.vy = B.vy * 0.5;
          B.vx = tmpVx * 0.5; B.vy = tmpVy * 0.5;
        }
      }
    }
  }

  function drawCarShape(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    var L = c.len, W = c.wid;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
    ctx.fillStyle = c.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-L / 2 + 4, -W / 2 + 3, L - 8, 5);
    ctx.fillStyle = '#1c2733'; // windshield + rear window
    ctx.fillRect(-L * 0.12, -W / 2 + 3, L * 0.22, W - 6);
    ctx.fillStyle = '#ffd23e'; // headlights
    ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 6);
    ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 6);
    ctx.fillStyle = '#ff3b30'; // taillights
    ctx.fillRect(-L / 2, -W / 2 + 2, 3, 6);
    ctx.fillRect(-L / 2, W / 2 - 8, 3, 6);
    if (c.kind === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (c.kind === 'police') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 3);
      // Light bar.
      var t = Date.now() / 180;
      ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#ff2222' : '#2266ff';
      ctx.fillRect(-6, -W / 2 - 3, 12, 5);
      ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#2266ff' : '#ff2222';
      ctx.fillRect(-6, W / 2 - 2, 12, 5);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, G) {
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      for (var s = 0; s < c.skid.length; s++) {
        ctx.fillStyle = 'rgba(20,20,20,' + c.skid[s].a + ')';
        ctx.fillRect(c.skid[s].x - 3, c.skid[s].y - 3, 6, 6);
      }
      drawCarShape(ctx, c);
    }
  }

  SC.Vehicles = {
    makeCar: makeCar, speedOf: speedOf, update: update, draw: draw,
    spawnTraffic: spawnTraffic, spawnParked: spawnParked, spawnPolice: spawnPolice,
    nearestCar: nearestCar, explodeCar: explodeCar, carAhead: carAhead
  };
})();
