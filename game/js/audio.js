// Solara City 3D — all sound is synthesized with WebAudio. No audio files.
import { G } from './state.js';

class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.radioNodes = null; this.radioStep = 0; this.radioTimer = null;
    this.started = false;
  }
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      // engine hum (sawtooth through lowpass, pitch follows speed)
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // police siren (two-tone)
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'sine'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenPhase = 0;
      this.startRadio();
    } catch (e) { /* audio unavailable — game still plays */ }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEngine(speed01, on) {
    if (!this.started) return;
    this.engineGain.gain.value = on ? 0.05 + speed01 * 0.08 : 0;
    this.engineOsc.frequency.value = 55 + speed01 * 130;
  }
  setSiren(on) {
    if (!this.started) return;
    this.sirenGain.gain.value = on ? 0.05 : 0;
  }
  update(dt) {
    if (!this.started) return;
    if (G.wanted > 0) { this.sirenPhase += dt * 2.4; this.sirenOsc.frequency.value = (Math.sin(this.sirenPhase) > 0 ? 750 : 950); }
  }
  blip(freq, dur, type = 'square', vol = 0.12) {
    if (!this.started) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  shot() {
    if (!this.started) return;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.12, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = this.ctx.createGain(); g.gain.value = 0.35;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  crash() { this.blip(70, 0.35, 'sawtooth', 0.3); }
  cash() { this.blip(880, 0.12, 'sine', 0.15); setTimeout(() => this.blip(1320, 0.18, 'sine', 0.15), 110); }
  // ---- radio: 3 stations of simple synth loops (bass + lead arpeggio) ----
  static STATIONS = [
    { name: 'SOLARA FM', bpm: 112, scale: [0, 3, 5, 7, 10], base: 110, wave: 'triangle' },
    { name: 'VICE BEATS', bpm: 128, scale: [0, 2, 3, 7, 8], base: 98, wave: 'sawtooth' },
    { name: 'CLASSIC COAST', bpm: 88, scale: [0, 4, 5, 7, 11], base: 130, wave: 'sine' },
  ];
  startRadio() {
    const stepDur = () => 60 / AudioSys.STATIONS[G.radio].bpm / 2;
    const tick = () => {
      if (!this.started) return;
      if (G.radioOn && !G.paused && !G.title) {
        const st = AudioSys.STATIONS[G.radio];
        const s = this.radioStep++;
        // bass on beats
        if (s % 4 === 0) this.blip(st.base, stepDur() * 3.5, 'sine', 0.16);
        // lead arpeggio
        const n = st.scale[(s * 3 + Math.floor(s / 8)) % st.scale.length];
        this.blip(st.base * 4 * Math.pow(2, n / 12), stepDur() * 0.9, st.wave, 0.05);
        if (s % 8 === 4) this.blip(st.base * 2, stepDur(), 'square', 0.04);
      }
      this.radioTimer = setTimeout(tick, stepDur() * 1000);
    };
    tick();
  }
  cycleRadio() {
    G.radio = (G.radio + 1) % AudioSys.STATIONS.length;
    G.radioOn = true;
    this.radioStep = 0;
    return AudioSys.STATIONS[G.radio].name;
  }
}

export const audio = new AudioSys();
