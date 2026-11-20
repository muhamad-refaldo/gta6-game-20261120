// player.js — Rex on foot: walk, run, enter/exit cars, take damage.
window.SC = window.SC || {};
(function () {
  function createPlayer(x, y) {
    return {
      x: x, y: y, angle: -Math.PI / 2, r: 13,
      speed: 0, health: 100, maxHealth: 100,
      onFoot: true, car: null,
      weapon: 'pistol', ammo: 12, ammoMax: 12, reloadT: 0,
      punchT: 0, hurtT: 0, walkPhase: 0, moving: false
    };
  }

  function update(G, dt) {
    var p = G.player;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.punchT > 0) p.punchT -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) p.ammo = p.ammoMax;
    }
    if (!p.onFoot) return; // driving is handled by vehicles.js
    var ax = SC.Input.axis();
    p.moving = (ax.x !== 0 || ax.y !== 0);
    var sp = 215;
    if (SC.Input.isDown('shift')) sp = 300;
    var nx = p.x + ax.x * sp * dt, ny = p.y + ax.y * sp * dt;
    if (ax.x !== 0 || ax.y !== 0) p.angle = Math.atan2(ax.y, ax.x);
    if (!SC.City.collides(nx, p.y, p.r)) p.x = nx;
    if (!SC.City.collides(p.x, ny, p.r)) p.y = ny;
    if (p.moving) p.walkPhase += dt * 11;
    // Slow health regen when calm.
    if (G.wanted === 0 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 2 * dt);
  }

  function damage(G, amount) {
    var p = G.player;
    if (p.hurtT > 0 || G.state !== 'playing') return;
    p.health -= amount;
    p.hurtT = 0.5;
    if (p.health <= 0) {
      p.health = 0;
      G.state = 'wasted';
      SC.HUD.showEnd('WASTED', 'Rex went down in the streets of Solara. The city keeps moving without him.');
    }
  }

  function draw(ctx, p, cam) {
    if (!p.onFoot) return;
    var bob = p.moving ? Math.sin(p.walkPhase) * 2 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 5, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(p.angle);
    // Body: teal jacket, dark jeans.
    ctx.fillStyle = '#1f6f6f';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd9a0'; // head
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(9, -2, 6, Math.PI * 0.6, Math.PI * 1.7); ctx.fill(); // hair
    // Gun arm when armed.
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#333';
      ctx.fillRect(8, -2, 12, 4);
    }
    ctx.restore();
    if (p.hurtT > 0) {
      ctx.strokeStyle = 'rgba(255,40,40,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.stroke();
    }
  }

  SC.Player = { create: createPlayer, update: update, damage: damage, draw: draw };
})();
