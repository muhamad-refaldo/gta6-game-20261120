// pedestrians.js — sidewalk walkers who stroll, chat and flee from danger.
window.SC = window.SC || {};
(function () {
  var SHIRTS = ['#e86a6a', '#6aa8e8', '#e8c33c', '#7ac47a', '#c07ae8', '#e8e8e8', '#e89a4a'];
  var SKINS = ['#ffd9a0', '#c98f5f', '#8a5a3a', '#f2c9a0'];

  function makePed(x, y) {
    return {
      x: x, y: y, angle: Math.random() * Math.PI * 2, r: 10,
      speed: 45 + Math.random() * 35,
      shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
      state: 'walk', fleeX: 0, fleeY: 0, phase: Math.random() * 6,
      target: null, waitT: 0
    };
  }

  function spawn(G, n) {
    var lines = SC.City.lines;
    for (var i = 0; i < n; i++) {
      var horizontal = Math.random() < 0.5;
      var line = lines[Math.floor(Math.random() * lines.length)];
      var along = lines[0] + Math.random() * (lines[lines.length - 1] - lines[0]);
      var off = (Math.random() < 0.5 ? 1 : -1) * 46;
      var p = makePed(horizontal ? along : line + off, horizontal ? line + off : along);
      p.angle = horizontal ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      G.peds.push(p);
    }
  }

  function scare(G, x, y, radius) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < radius) {
        p.state = 'flee';
        p.fleeX = p.x + (p.x - x) / (d || 1) * 300;
        p.fleeY = p.y + (p.y - y) / (d || 1) * 300;
      }
    }
  }

  function update(G, dt) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      p.phase += dt * 8;
      var sp = p.speed;
      if (p.state === 'flee') {
        sp = 170;
        var dx = p.fleeX - p.x, dy = p.fleeY - p.y;
        var d = Math.hypot(dx, dy);
        if (d < 30) { p.state = 'walk'; }
        else p.angle = Math.atan2(dy, dx);
      } else {
        // Stroll along the sidewalk; at an intersection, sometimes turn.
        var nx = SC.City.nearestLine(p.x), ny = SC.City.nearestLine(p.y);
        if (Math.abs(p.x - nx) < 46 && Math.abs(p.y - ny) < 46) {
          if (Math.random() < dt * 0.5) p.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        }
      }
      var nx2 = p.x + Math.cos(p.angle) * sp * dt;
      var ny2 = p.y + Math.sin(p.angle) * sp * dt;
      if (!SC.City.collides(nx2, p.y, p.r)) p.x = nx2;
      else p.angle += Math.PI / 2;
      if (!SC.City.collides(p.x, ny2, p.r)) p.y = ny2;
      else p.angle += Math.PI / 2;
      // Keep inside the city and out of the sea.
      if (p.x > 3050) { p.x = 3050; p.angle = Math.PI; }
      if (p.x < 20) { p.x = 20; p.angle = 0; }
      if (p.y < 20) { p.y = 20; p.angle = Math.PI / 2; }
      if (p.y > SC.City.SIZE - 20) { p.y = SC.City.SIZE - 20; p.angle = -Math.PI / 2; }
    }
  }

  function draw(ctx, G) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      var bob = Math.sin(p.phase) * 1.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(1, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(p.angle);
      ctx.fillStyle = p.shirt;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (p.state === 'flee') {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', p.x, p.y - 14 + bob);
      }
    }
  }

  SC.Peds = { spawn: spawn, update: update, draw: draw, scare: scare, make: makePed };
})();
