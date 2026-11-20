// missions.js — the Solara City story: six jobs for Marco, with objectives,
// dialogue, rewards and progression. Missions are data; the engine runs them.
window.SC = window.SC || {};
(function () {
  // World anchors (road intersections make good meeting points).
  var A = {
    diner: { x: 1000, y: 1000, name: 'Sunset Diner' },
    marina: { x: 2600, y: 2600, name: 'Solara Marina' },
    docks: { x: 600, y: 2600, name: 'Old Docks' },
    bank: { x: 1800, y: 1400, name: 'Solara Trust Bank' },
    hideout: { x: 600, y: 600, name: 'Marco\u2019s Hideout' },
    stadium: { x: 1000, y: 2600, name: 'Solara Stadium' },
    tower: { x: 1400, y: 1400, name: 'Solara Tower' },
    beach: { x: 2900, y: 1800, name: 'Palma Beach' }
  };

  var MISSIONS = [
    {
      id: 1, title: 'Welcome to Solara', reward: 200,
      briefing: ['Marco', 'Rex! You made it. The docks spit you out and the city is already hungry. Come see me at the Sunset Diner — I have a job with your name on it.'],
      objectives: [
        { type: 'goto', x: A.diner.x, y: A.diner.y, r: 70, desc: 'Meet Marco at the Sunset Diner' }
      ],
      done: ['Marco', 'Good, you can follow directions. That already puts you ahead of half this town. Take this — first pay of many.']
    },
    {
      id: 2, title: 'The Package', reward: 350,
      briefing: ['Marco', 'A package needs to reach the Marina, no questions, no stops. Take a car — any car. The streets are yours, Rex.'],
      objectives: [
        { type: 'gotoCar', x: A.marina.x, y: A.marina.y, r: 80, desc: 'Drive the package to the Solara Marina' }
      ],
      done: ['Marco', 'Clean delivery. The client is happy, which means I am happy, which means you get paid.']
    },
    {
      id: 3, title: 'Viper Tail', reward: 500,
      briefing: ['Marco', 'The Viper crew sent a driver to nose around my turf. Catch his car and ram it three times — send him home with a message.'],
      objectives: [
        { type: 'chase', hits: 3, desc: 'Ram the Viper driver 3 times' }
      ],
      done: ['Marco', 'He will think twice before cruising my streets again. Nice driving, Rex.']
    },
    {
      id: 4, title: 'Heat Wave', reward: 600,
      briefing: ['Marco', 'The PD is all over us tonight. Lose them — get your wanted level back to zero and meet me at the hideout.'],
      objectives: [
        { type: 'escape', desc: 'Lose the police (wanted level 0)' },
        { type: 'goto', x: A.hideout.x, y: A.hideout.y, r: 70, desc: 'Reach Marco\u2019s Hideout' }
      ],
      done: ['Marco', 'Ghost. That is how you survive in Solara — be gone before they even know you were there.']
    },
    {
      id: 5, title: 'Turf War', reward: 800,
      briefing: ['Marco', 'The Vipers are pushing into the stadium block. Go there and clear out four of them. You have a pistol — use it.'],
      objectives: [
        { type: 'eliminate', count: 4, x: A.stadium.x, y: A.stadium.y, desc: 'Clear 4 Viper gang members at the Stadium' }
      ],
      done: ['Marco', 'The stadium block is ours again. The Vipers are learning: Solara belongs to us.']
    },
    {
      id: 6, title: 'The Last Job', reward: 1500,
      briefing: ['Marco', 'One last job, Rex. Hit the Solara Trust Bank, grab the cash, and lose the cops before you reach the hideout. After this, we own the city.'],
      objectives: [
        { type: 'goto', x: A.bank.x, y: A.bank.y, r: 70, desc: 'Reach the Solara Trust Bank' },
        { type: 'grab', x: A.bank.x, y: A.bank.y, r: 70, desc: 'Grab the cash (stay 4 seconds)' },
        { type: 'escape', desc: 'Escape the police (wanted level 0)' },
        { type: 'goto', x: A.hideout.x, y: A.hideout.y, r: 70, desc: 'Reach the Hideout with the cash' }
      ],
      done: ['Marco', 'We did it, Rex. Solara City is ours. You are not just a driver anymore — you are a legend of these streets.']
    }
  ];

  function current(G) { return MISSIONS[G.missionIdx] || null; }
  function objective(G) {
    var m = current(G);
    if (!m) return null;
    return m.objectives[G.objectiveIdx] || null;
  }

  function start(G, idx) {
    G.missionIdx = idx; G.objectiveIdx = 0;
    G.missionState = { hits: 0, kills: 0, grabT: 0, escapeT: 0, rival: null, rivals: [] };
    var m = current(G);
    if (!m) return;
    SC.HUD.say(m.briefing[0], m.briefing[1], 6);
    SC.HUD.toast('MISSION: ' + m.title);
    setupObjective(G);
  }

  function setupObjective(G) {
    var o = objective(G);
    if (!o) return;
    if (o.type === 'chase') {
      // Spawn the rival driver near the player.
      var p = G.player;
      var car = SC.Vehicles.makeCar(p.x + 260, p.y - 120, 0, 'sport', 'rival');
      car.color = '#7a1fa2';
      G.cars.push(car);
      G.missionState.rival = car;
      SC.HUD.toast('A purple Viper car is nearby — ram it!');
    }
    if (o.type === 'eliminate') {
      G.missionState.rivals = [];
      for (var i = 0; i < 4; i++) {
        var r = SC.Combat.spawnRival(G, o.x + (Math.random() - 0.5) * 260, o.y + (Math.random() - 0.5) * 260);
        G.missionState.rivals.push(r);
      }
    }
    if (o.type === 'escape') {
      SC.addWanted(3);
      SC.HUD.toast('The police are on you — lose them!');
    }
  }

  function completeObjective(G) {
    var m = current(G);
    G.objectiveIdx++;
    SC.Audio.pickup();
    if (G.objectiveIdx >= m.objectives.length) {
      G.money += m.reward;
      SC.HUD.say(m.done[0], m.done[1], 6);
      SC.HUD.toast('MISSION COMPLETE  +$' + m.reward);
      SC.Audio.jingle();
      G.missionIdx++;
      if (G.missionIdx >= MISSIONS.length) {
        G.missionIdx = MISSIONS.length - 1;
        G.objectiveIdx = MISSIONS[G.missionIdx].objectives.length;
        SC.HUD.toast('STORY COMPLETE — free roam! Keep earning, Rex.');
        SC.HUD.say('Marco', 'Every job is done. Solara is yours now, Rex. Drive, earn, survive — the city never sleeps.', 8);
      } else {
        setTimeout(function () { if (G.state === 'playing') start(G, G.missionIdx); }, 2500);
      }
    } else {
      setupObjective(G);
    }
  }

  function update(G, dt) {
    var o = objective(G);
    if (!o || G.state !== 'playing') return;
    var p = G.player;
    if (o.type === 'goto' || o.type === 'grab') {
      var d = Math.hypot(p.x - o.x, p.y - o.y);
      if (o.type === 'goto' && d < o.r) completeObjective(G);
      if (o.type === 'grab') {
        if (d < o.r) {
          G.missionState.grabT += dt;
          if (G.missionState.grabT > 4) completeObjective(G);
        } else G.missionState.grabT = 0;
      }
    }
    if (o.type === 'gotoCar') {
      var d2 = Math.hypot(p.x - o.x, p.y - o.y);
      if (!p.onFoot && d2 < o.r) completeObjective(G);
    }
    if (o.type === 'chase') {
      var rival = G.missionState.rival;
      if (rival) {
        // Rival tries to flee along the roads.
        var dx = rival.x - p.x, dy = rival.y - p.y;
        var want = Math.atan2(dy, dx);
        var diff = want - rival.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        rival.angle += Math.max(-1.8 * dt, Math.min(1.8 * dt, diff * 2 * dt));
        rival.vx = Math.cos(rival.angle) * 300;
        rival.vy = Math.sin(rival.angle) * 300;
        rival.x += rival.vx * dt; rival.y += rival.vy * dt;
        if (SC.City.collides(rival.x, rival.y, 12)) { rival.angle += Math.PI / 2; }
        if (G.missionState.hits >= o.hits) {
          var idx = G.cars.indexOf(rival);
          if (idx >= 0) G.cars.splice(idx, 1);
          completeObjective(G);
        }
      }
    }
    if (o.type === 'escape') {
      if (G.wanted === 0) completeObjective(G);
    }
    if (o.type === 'eliminate') {
      if (G.missionState.kills >= o.count) completeObjective(G);
    }
  }

  SC.Missions = {
    list: MISSIONS, anchors: A, current: current, objective: objective,
    start: start, update: update, completeObjective: completeObjective
  };
})();
