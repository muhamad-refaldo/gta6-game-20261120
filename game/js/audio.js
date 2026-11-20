// audio.js — all sound is synthesized with WebAudio. No audio files are shipped.
window.SC = window.SC || {};
(function () {
  var ctx = null, master = null, engineOsc = null, engineGain = null;
  var sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  var musicTimer = null, muted = false, musicOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function init() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    // Engine hum: two detuned saws through a lowpass.
    try {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
      var o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 75;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(lp); o2.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); o2.start();
      engineOsc._o2 = o2;
    } catch (e) { /* audio is optional */ }
    startMusic();
  }

  function setEngine(speed01) {
    if (!ctx || !engineOsc || muted) return;
    var f = 45 + speed01 * 130;
    try {
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc._o2.frequency.setTargetAtTime(f * 1.5, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.09, ctx.currentTime, 0.1);
    } catch (e) {}
  }

  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      try {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 720;
        sirenGain = ctx.createGain(); sirenGain.gain.value = muted ? 0 : 0.045;
        sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      } catch (e) {}
    } else if (!on && sirenOsc) {
      try { sirenOsc.stop(); } catch (e) {}
      sirenOsc = null;
    }
  }

  function sirenTick(dt) {
    if (!sirenOsc) return;
    sirenTimer += dt;
    if (sirenTimer > 0.42) {
      sirenTimer = 0; sirenHigh = !sirenHigh;
      try { sirenOsc.frequency.value = sirenHigh ? 950 : 720; } catch (e) {}
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function noise(dur, vol) {
    if (!ctx || muted) return;
    try {
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var g = ctx.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(master); src.start();
    } catch (e) {}
  }

  // Simple sunny-day chord loop: C — Am — F — G bass + pluck.
  var CHORDS = [[130.8, 164.8, 196.0], [110.0, 130.8, 164.8], [87.3, 130.8, 174.6], [98.0, 146.8, 196.0]];
  function startMusic() {
    if (musicOn || !ctx) return;
    musicOn = true;
    var step = 0;
    musicTimer = setInterval(function () {
      if (muted || !ctx) return;
      var chord = CHORDS[Math.floor(step / 4) % 4];
      var note = chord[step % 3];
      blip(note * 2, 0.32, 'triangle', 0.05);
      if (step % 4 === 0) blip(chord[0] / 2, 0.9, 'sine', 0.12);
      step++;
    }, 300);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  SC.Audio = {
    init: init, setEngine: setEngine, siren: siren, sirenTick: sirenTick,
    shot: function () { noise(0.14, 0.5); },
    punch: function () { noise(0.08, 0.3); blip(120, 0.1, 'square', 0.15); },
    pickup: function () { blip(660, 0.12, 'sine', 0.2); setTimeout(function () { blip(880, 0.18, 'sine', 0.2); }, 90); },
    jingle: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { blip(f, 0.25, 'triangle', 0.22); }, i * 110); }); },
    crash: function () { noise(0.3, 0.45); },
    toggleMute: toggleMute
  };
})();
