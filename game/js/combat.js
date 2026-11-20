// combat.js — shooting, punching, bullets, rival gang members.
window.SC = window.SC || {};
(function () {
  function shoot(G) {
    var p = G.player;
    if (!p.onFoot || p.reloadT > 0 || p.ammo <= 0) return;
    p.ammo--;
    var cam = G.camera;
    var mx = SC.Input.mouse.x + cam.x, my = SC.Input.mouse.y + cam.y;
    var a = Math.atan2(my - p.y, mx - p.x);
    p.angle = a;
    G.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.9, from: 'player' });
    G.particles.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24,
      vx: 0, vy: 0, life: 0.08, max: 0.08, color: '#ffd23e', r: 9 });
    SC.Audio.shot();
    SC.Peds.scare(G, p.x, p.y, 320);
    if (p.ammo === 0) { p.reloadT = 1.2; SC.HUD.toast('Reloading...'); }
  }

  function punch(G) {
    var p = G.player;
    if (!p.onFoot || p.punchT > 0) return;
    p.punchT = 0.45;
    SC.Audio.punch();
    var hx = p.x + Math.cos(p.angle) * 30, hy = p.y + Math.sin(p.angle) * 30;
    var hit = false;
    for (var i = G.rivals.length - 1; i >= 0; i--) {
      var r = G.rivals[i];
      if (Math.hypot(r.x - hx, r.y - hy) < 34) { damageRival(G, r, 34); hit = true; }
    }
    for (var j = G.peds.length - 1; j >= 0; j--) {
      var pd = G.peds[j];
      if (Math.hypot(pd.x - hx, pd.y - hy) < 30) {
        G.peds.splice(j, 1);
        SC.addWanted(1);
        SC.Peds.scare(G, p.x, p.y, 400);
        hit = true;
      }
    }
    if (hit) SC.HUD.toast('Hit!');
  }

  function spawnRival(G, x, y) {
    var r = { x: x, y: y, angle: 0, r: 12, health: 60, shootT: 1 + Math.random(),
      shirt: '#7a1fa2', skin: '#ffd9a0', phase: 0 };
    G.rivals.push(r);
    return r;
  }

  function damageRival(G, r, dmg) {
    r.health -= dmg;
    G.particles.push({ x: r.x, y: r.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#ff3b30', r: 8 });
    if (r.health <= 0) {
      var idx = G.rivals.indexOf(r);
      if (idx >= 0) G.rivals.splice(idx, 1);
      G.missionState.kills = (G.missionState.kills || 0) + 1;
      G.money += 25;
      for (var i = 0; i < 10; i++) {
        G.particles.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
          life: 0.5, max: 0.5, color: '#7a1fa2', r: 4 });
      }
    }
  }

  function update(G, dt) {
    var p = G.player;
    // Player shooting.
    if (SC.Input.mouse.clicked && G.state === 'playing') shoot(G);
    if (SC.Input.wasPressed('f')) punch(G);
    if (SC.Input.wasPressed('r') && p.ammo < p.ammoMax && p.reloadT <= 0) {
      p.reloadT = 1.2; SC.HUD.toast('Reloading...');
    }
    // Bullets.
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      var dead = b.life <= 0 || SC.City.collides(b.x, b.y, 1);
      if (!dead && b.from === 'player') {
        for (var j = G.rivals.length - 1; j >= 0; j--) {
          if (Math.hypot(G.rivals[j].x - b.x, G.rivals[j].y - b.y) < 14) {
            damageRival(G, G.rivals[j], 34); dead = true; break;
          }
        }
        if (!dead) {
          for (var k = 0; k < G.cars.length; k++) {
            var c = G.cars[k];
            if (c.driver === 'player') continue;
            if (Math.abs(b.x - c.x) < c.len / 2 + 4 && Math.abs(b.y - c.y) < c.wid / 2 + 6) {
              c.health -= 25; dead = true;
              if (c.driver === 'police') SC.addWanted(1);
              if (c.health <= 0) SC.Vehicles.explodeCar(G, c);
              break;
            }
          }
        }
        if (!dead) {
          for (var m = 0; m < G.peds.length; m++) {
            if (Math.hypot(G.peds[m].x - b.x, G.peds[m].y - b.y) < 12) {
              G.peds.splice(m, 1);
              SC.addWanted(1);
              SC.Peds.scare(G, b.x, b.y, 420);
              dead = true; break;
            }
          }
        }
      }
      if (!dead && b.from === 'rival') {
        if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
          SC.Player.damage(G, 9);
          dead = true;
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
    // Rival AI: approach and shoot at the player.
    for (var n = 0; n < G.rivals.length; n++) {
      var r = G.rivals[n];
      r.phase += dt * 8;
      var dx = p.x - r.x, dy = p.y - r.y;
      var d = Math.hypot(dx, dy);
      if (d > 260) {
        r.angle = Math.atan2(dy, dx);
        r.x += Math.cos(r.angle) * 120 * dt;
        r.y += Math.sin(r.angle) * 120 * dt;
      } else {
        r.angle = Math.atan2(dy, dx);
        r.shootT -= dt;
        if (r.shootT <= 0 && d < 420) {
          r.shootT = 1.1 + Math.random() * 0.7;
          var a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.25;
          G.bullets.push({ x: r.x + Math.cos(a) * 18, y: r.y + Math.sin(a) * 18,
            vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 1.1, from: 'rival' });
          SC.Audio.shot();
        }
      }
    }
  }

  function draw(ctx, G) {
    for (var i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (var j = 0; j < G.rivals.length; j++) {
      var r = G.rivals[j];
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(1, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(r.angle);
      ctx.fillStyle = r.shirt;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = r.skin;
      ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 11, 4);
      ctx.restore();
      // Health bar.
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(r.x - 14, r.y - 22, 28, 5);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(r.x - 14, r.y - 22, 28 * Math.max(0, r.health / 60), 5);
    }
  }

  SC.Combat = { update: update, draw: draw, shoot: shoot, punch: punch,
    spawnRival: spawnRival, damageRival: damageRival };
})();
