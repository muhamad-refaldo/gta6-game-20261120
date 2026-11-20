// city.js — Solara City map: road grid, blocks, buildings, parks, beach, water.
// All layout is generated from one fixed seed so the city is identical every run.
window.SC = window.SC || {};
(function () {
  var SIZE = 3200;
  var ROAD_W = 64;
  var SPACING = 400;
  var FIRST = 200;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Road centre lines, both directions.
  var lines = [];
  for (var i = 0; i < 8; i++) lines.push(FIRST + i * SPACING);

  var PALETTE = ['#e8c39a', '#d9a06b', '#c98f5f', '#b7d3e0', '#f2e3c6',
    '#a8c8a0', '#e0b0a0', '#d8c8e8', '#f0d090', '#b0c8d8'];
  var ROOF = ['#8a6a4a', '#7a5a3a', '#6a7a8a', '#9a8a6a', '#5a6a7a'];

  var buildings = [];
  var trees = [];
  var parks = [];
  var landmarks = {};

  function generate() {
    var rnd = mulberry32(1337);
    buildings = []; trees = []; parks = []; landmarks = {};
    for (var bx = 0; bx < 7; bx++) {
      for (var by = 0; by < 7; by++) {
        var x0 = lines[bx] + ROAD_W / 2 + 10;
        var x1 = lines[bx + 1] - ROAD_W / 2 - 10;
        var y0 = lines[by] + ROAD_W / 2 + 10;
        var y1 = lines[by + 1] - ROAD_W / 2 - 10;
        // Beach blocks on the far east edge stay open.
        if (bx === 6) continue;
        // Two park blocks.
        if ((bx === 2 && by === 2) || (bx === 5 && by === 3)) {
          parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
          for (var t = 0; t < 14; t++) {
            trees.push({ x: x0 + 20 + rnd() * (x1 - x0 - 40), y: y0 + 20 + rnd() * (y1 - y0 - 40), r: 10 + rnd() * 8 });
          }
          continue;
        }
        // Stadium block.
        if (bx === 1 && by === 5) {
          landmarks.stadium = { x: x0 + 20, y: y0 + 20, w: x1 - x0 - 40, h: y1 - y0 - 40, name: 'Solara Stadium' };
          buildings.push({ x: x0 + 20, y: y0 + 20, w: x1 - x0 - 40, h: y1 - y0 - 40, c: '#c8ccd4', roof: '#7a8aa0', hgt: 26, stadium: true });
          continue;
        }
        // Solara Tower, the tall centre landmark.
        if (bx === 3 && by === 3) {
          landmarks.tower = { x: (x0 + x1) / 2 - 55, y: (y0 + y1) / 2 - 55, w: 110, h: 110, name: 'Solara Tower' };
          buildings.push({ x: (x0 + x1) / 2 - 55, y: (y0 + y1) / 2 - 55, w: 110, h: 110, c: '#9fb8d8', roof: '#5a7aa8', hgt: 90, tower: true });
          continue;
        }
        // Normal block: 1-4 buildings.
        var n = 1 + Math.floor(rnd() * 3);
        for (var k = 0; k < n; k++) {
          var bw = 60 + rnd() * 90, bh = 60 + rnd() * 90;
          var px = x0 + 8 + rnd() * Math.max(1, (x1 - x0 - bw - 16));
          var py = y0 + 8 + rnd() * Math.max(1, (y1 - y0 - bh - 16));
          buildings.push({ x: px, y: py, w: bw, h: bh,
            c: PALETTE[Math.floor(rnd() * PALETTE.length)],
            roof: ROOF[Math.floor(rnd() * ROOF.length)],
            hgt: 6 + rnd() * 22 });
        }
        // A few street trees on block corners.
        if (rnd() < 0.7) trees.push({ x: x0 + 14, y: y0 + 14, r: 9 + rnd() * 5 });
        if (rnd() < 0.5) trees.push({ x: x1 - 14, y: y1 - 14, r: 9 + rnd() * 5 });
      }
    }
    // Palm rows along the beach road.
    for (var py2 = 120; py2 < SIZE - 100; py2 += 170) {
      trees.push({ x: 2960, y: py2, r: 12, palm: true });
      trees.push({ x: 2900, y: py2 + 85, r: 11, palm: true });
    }
  }

  function isRoad(x, y) {
    for (var i = 0; i < lines.length; i++) {
      if (Math.abs(x - lines[i]) < ROAD_W / 2) return true;
      if (Math.abs(y - lines[i]) < ROAD_W / 2) return true;
    }
    return false;
  }

  function nearestLine(v) {
    var best = lines[0], bd = 1e9;
    for (var i = 0; i < lines.length; i++) {
      var d = Math.abs(v - lines[i]);
      if (d < bd) { bd = d; best = lines[i]; }
    }
    return best;
  }

  // True when point (x,y) with radius r hits a building, the world edge or the sea.
  function collides(x, y, r) {
    if (x < r || y < r || x > SIZE - r || y > SIZE - r) return true;
    if (x > 3064 - r) return true; // the sea
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  function draw(ctx, cam) {
    var x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
    var x1 = Math.min(SIZE, cam.x + cam.w + 40), y1 = Math.min(SIZE, cam.y + cam.h + 40);
    // Ground.
    ctx.fillStyle = '#8fae7d';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Beach sand and sea on the east edge.
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(Math.max(x0, 2920), y0, Math.min(x1, SIZE) - Math.max(x0, 2920), y1 - y0);
    ctx.fillStyle = '#2f8fd0';
    ctx.fillRect(Math.max(x0, 3064), y0, Math.min(x1, SIZE) - Math.max(x0, 3064), y1 - y0);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
      ctx.fillRect(3064, wy, 26, 4);
    }
    // City blocks (paved).
    ctx.fillStyle = '#b9b3a2';
    for (var bx = 0; bx < 7; bx++) {
      for (var by = 0; by < 7; by++) {
        if (bx === 6) continue;
        ctx.fillRect(lines[bx] + ROAD_W / 2, lines[by] + ROAD_W / 2,
          lines[bx + 1] - lines[bx] - ROAD_W, lines[by + 1] - lines[by] - ROAD_W);
      }
    }
    // Parks.
    for (var p = 0; p < parks.length; p++) {
      ctx.fillStyle = '#6da85e';
      ctx.fillRect(parks[p].x, parks[p].y, parks[p].w, parks[p].h);
      ctx.strokeStyle = '#4a7a3e'; ctx.lineWidth = 3;
      ctx.strokeRect(parks[p].x, parks[p].y, parks[p].w, parks[p].h);
    }
    // Roads.
    ctx.fillStyle = '#3d3d46';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillRect(x0, lines[i] - ROAD_W / 2, x1 - x0, ROAD_W);
      ctx.fillRect(lines[i] - ROAD_W / 2, y0, ROAD_W, y1 - y0);
    }
    // Centre dashes.
    ctx.fillStyle = '#ffd23e';
    for (var j = 0; j < lines.length; j++) {
      for (var d = 0; d < SIZE; d += 64) {
        ctx.fillRect(d, lines[j] - 2, 30, 4);
        ctx.fillRect(lines[j] - 2, d, 4, 30);
      }
    }
    // Buildings with sun shadows.
    for (var b = 0; b < buildings.length; b++) {
      var bd = buildings[b];
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(bd.x + bd.hgt * 0.35, bd.y + bd.hgt * 0.5, bd.w, bd.h);
      ctx.fillStyle = bd.c;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.fillStyle = bd.roof;
      ctx.fillRect(bd.x + 5, bd.y + 5, bd.w - 10, bd.h - 10);
      if (bd.tower) {
        ctx.fillStyle = '#ffd23e';
        ctx.fillRect(bd.x + bd.w / 2 - 3, bd.y + bd.h / 2 - 3, 6, 6);
      }
      if (bd.stadium) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(bd.x + bd.w / 2, bd.y + bd.h / 2, bd.w / 2 - 12, bd.h / 2 - 12, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Trees and palms.
    for (var t = 0; t < trees.length; t++) {
      var tr = trees[t];
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.arc(tr.x + 4, tr.y + 5, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tr.palm ? '#3f9e4d' : '#2f7a3a';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57b368';
      ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.25, tr.y - tr.r * 0.25, tr.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  SC.City = {
    SIZE: SIZE, ROAD_W: ROAD_W, lines: lines,
    buildings: function () { return buildings; },
    trees: function () { return trees; },
    landmarks: function () { return landmarks; },
    generate: generate, isRoad: isRoad, nearestLine: nearestLine,
    collides: collides, draw: draw
  };
})();
