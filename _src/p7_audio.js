
/* ============================================================================
   7a. SOUNDTRACK
   A deterministic 30-second score, rendered offline (OfflineAudioContext) from
   oscillators, FM bells, filtered noise and saw pads on the film's 120 BPM
   grid.  Rendering into one buffer makes pause, seek and loop sample-exact.
   Section gates perform the hard cuts written into the score: 14 s (freeze),
   20 s (ERROR), 24 s (blackout), 30 s (end).
   ========================================================================== */
const NOTE = m => 440 * Math.pow(2, (m - 69) / 12);
class Soundtrack {
  static render(sr = 44100) {
    const ctx = new OfflineAudioContext(2, Math.ceil((CONFIG.duration + 0.6) * sr), sr);
    new Soundtrack(ctx).compose();
    return ctx.startRendering();
  }
  constructor(c) {
    this.c = c; this.rng = makeRNG('soundtrack');
    const r = this.rng, sr = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, sr * 2, sr);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = r.next() * 2 - 1;
    this.crushBuf = c.createBuffer(1, sr, sr);          // sample-and-hold 2-bit "digital debris"
    const cd = this.crushBuf.getChannelData(0);
    for (let i = 0, hold = 0, v = 0; i < cd.length; i++) {
      if (--hold <= 0) { hold = 1 + Math.floor(r.next() * 40); v = Math.round((r.next() * 2 - 1) * 3) / 3; }
      cd[i] = v;
    }
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(comp);
    this.musicGate = c.createGain(); this.musicGate.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.musicGate);
    const verb = c.createConvolver(), send = c.createGain();
    verb.buffer = this.impulse(2.8); send.gain.value = 0.32;
    this.music.connect(send); send.connect(verb); verb.connect(this.musicGate);  // reverb is gated too: cuts are hard
    this.ui = c.createGain(); this.ui.gain.value = 0.7; this.ui.connect(this.master);
    this.glitchGate = c.createGain(); this.glitchGate.connect(this.master);
    this.gx = c.createGain(); this.gx.connect(this.glitchGate);
    const gate = (p, t, a, b, ramp = 0.006) => { p.setValueAtTime(a, t); p.linearRampToValueAtTime(b, t + ramp); };
    this.master.gain.setValueAtTime(0.8, 0); gate(this.master.gain, 29.3, 0.8, 0, 1.1);   // the ending breathes out instead of being cut
    const M = this.musicGate.gain;
    M.setValueAtTime(1, 0); gate(M, 14.0, 1, 0); gate(M, 16.0, 0, 1, 0.3); gate(M, 20.0, 1, 0); gate(M, 28.0, 0, 1, 0.05);
    const G = this.glitchGate.gain;
    G.setValueAtTime(1, 0); gate(G, 24.0, 1, 0);
  }
  impulse(sec) {                                         // procedural reverb: darkened decaying noise
    const c = this.c, n = Math.floor(sec * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0, y = 0; i < n; i++) { y += ((this.rng.next() * 2 - 1) - y) * 0.35; d[i] = y * Math.pow(1 - i / n, 2.4); }
    }
    return b;
  }
  env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  tone(t, f, dur, amp, type = 'sine', dest = this.music, a = 0.005) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); this.env(g, t, amp, a, dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  noise(t, dur, amp, type, freq, q = 1, dest = this.music) {
    const c = this.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, amp, 0.003, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, this.rng.next() * 1.5); s.stop(t + dur + 0.1);
  }
  swell(t0, t1, amp, type, f0, f1, q = 1, dest = this.music) {   // filtered-noise riser / dive
    const c = this.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1 + 0.02);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0); s.stop(t1 + 0.05);
  }
  kick(t, amp = 1, f0 = 150, f1 = 42, dec = 0.45, dest = this.music) {
    this.tone(t, f0, dec, amp, 'sine', dest, 0.002).frequency.exponentialRampToValueAtTime(f1, t + 0.09);
    this.noise(t, 0.012, amp * 0.18, 'highpass', 2500, 0.7, dest);
  }
  tom(t, f, amp) {
    this.tone(t, f * 1.8, 0.38, amp).frequency.exponentialRampToValueAtTime(f, t + 0.06);
    this.noise(t, 0.07, amp * 0.12, 'bandpass', f * 4, 2);
  }
  sub(t, amp, dur, dest = this.music) { this.tone(t, 62, dur, amp, 'sine', dest, 0.01).frequency.exponentialRampToValueAtTime(26, t + dur * 0.8); }
  bell(t, f, amp, dur = 1.6, ratio = 3.5, index = 2, dest = this.music) {   // FM: inharmonic, metallic, ancient
    const c = this.c, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * index * 0.04 + 0.01, t + dur * 0.7);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    this.env(g, t, amp, 0.002, dur);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  gong(t, f, amp) { this.bell(t, f, amp, 4.5, 1.41, 3.2); this.bell(t, f * 2.76, amp * 0.3, 2.8, 1.17, 1.4); this.noise(t, 0.4, amp * 0.25, 'lowpass', 900); }
  pad(t0, t1, notes, amp, cut = 1100, dest = this.music) {             // detuned saws → slow low-pass
    const c = this.c, f = c.createBiquadFilter(), g = c.createGain(), att = Math.min(0.5, (t1 - t0) * 0.4);
    f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(cut * 0.5, t0); f.frequency.linearRampToValueAtTime(cut, t0 + (t1 - t0) * 0.6);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + att);
    g.gain.setValueAtTime(amp, t1 - 0.05); g.gain.linearRampToValueAtTime(0, t1 + 0.4);
    f.connect(g); g.connect(dest);
    for (const m of notes) for (const det of [-8, 0, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = NOTE(m); o.detune.value = det;
      o.connect(f); o.start(t0); o.stop(t1 + 0.5);
    }
  }
  compose() {
    const r = this.rng, U = this.ui, X = this.gx, SC = [0, 1, 3, 5, 7, 8, 10];          // D phrygian
    const N = (d, oct) => 38 + 12 * (oct - 2) + SC[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    // 0–4 s  genesis: a breath, the opening ring, rippling rings, triangles
    this.tone(0.3, NOTE(76), 0.9, 0.012, 'sine', this.music, 0.5);
    this.pad(0.4, 14.0, [26], 0.05, 160);
    this.bell(1.0, NOTE(62), 0.16, 2.2, 2.0, 1.5); this.sub(1.0, 0.35, 1.5);
    this.pad(1.0, 14.0, [38, 45], 0.028, 300);
    for (let k = 0; k < 7; k++) this.bell(2.0 + k * 0.125, NOTE(N(k, 4)), 0.08, 1.4, 3.5, 1.6);
    [0, 2, 4, 8, 7, 4, 2, 1].forEach((d, i) => this.bell(3.0 + i * 0.125, NOTE(N(d, 5)), 0.06, 0.9, 3.5, 1.2));
    this.kick(3.0, 0.4);
    // 4–8 s  constellation: stars thicken, the spin, the snap into the eye, the dive
    this.kick(4.0, 0.55); this.gong(4.0, NOTE(50), 0.12); this.kick(5.0, 0.4); this.kick(6.0, 0.45);
    for (let t = 4.05; t < 6.9;) {
      this.bell(t, NOTE(N(r.int(0, 9), 5)), 0.02 + r.next() * 0.03, 0.5, 3.5, 0.8);
      t += 0.26 / (1 + (t - 4) * 1.2) * (0.5 + r.next());
    }
    this.swell(6.0, 6.92, 0.22, 'bandpass', 300, 6000, 2);
    this.noise(6.92, 0.05, 0.35, 'highpass', 3000); this.bell(6.92, NOTE(86), 0.12, 1.5); this.kick(6.92, 0.5, 120, 40, 0.3);
    this.swell(7.0, 8.0, 0.25, 'bandpass', 3000, 150, 1.5);
    this.tone(7.0, 110, 1.0, 0.35, 'sine', this.music, 0.6).frequency.exponentialRampToValueAtTime(30, 8.0);
    this.swell(7.55, 8.0, 0.2, 'lowpass', 400, 6000, 0.7);
    // 8–14 s  the world tree: impact, ritual groove, growth bass, neural ticks, twelve signs
    this.kick(8.0, 1.0); this.sub(8.0, 0.9, 2.5); this.gong(8.0, NOTE(38), 0.22); this.noise(8.0, 1.4, 0.18, 'lowpass', 2500, 0.7);
    [9, 10, 10.75, 11, 12, 12.75, 13, 13.25, 13.5, 13.75].forEach(t => this.kick(t, 0.85));
    [[8.5, 38], [9.5, 41], [9.75, 38], [10.5, 45], [11.5, 43], [11.75, 41], [12.5, 38], [13.125, 45], [13.375, 43], [13.625, 41], [13.875, 38]]
      .forEach(([t, m]) => this.tom(t, NOTE(m), 0.45));
    [38, 38, 41, 43, 45, 46, 45].forEach((m, i) => { this.tone(8 + i * 0.5, NOTE(m), 0.42, 0.2, 'triangle'); this.tone(8 + i * 0.5, NOTE(m - 12), 0.42, 0.25); });
    this.pad(8.0, 10.0, [50, 53, 57, 64], 0.035, 900); this.pad(10.0, 12.0, [46, 50, 53, 60], 0.035, 1100);
    this.pad(12.0, 13.0, [43, 46, 50, 57], 0.04, 1300); this.pad(13.0, 14.0, [45, 49, 52, 58], 0.05, 1600);
    for (let i = 0; i < 32; i++) {
      const t = 10.0 + i * 0.125;
      this.noise(t, 0.018, i % 4 === 2 ? 0.07 : 0.035, 'highpass', 7500);
      if (r.next() < 0.35) this.bell(t, NOTE(N(r.int(5, 12), 5)), 0.025, 0.25, 2.0, 2.5);
    }
    for (let k = 0; k < 12; k++) this.bell(12.0 + k * 0.075, NOTE(N(k, 5)), 0.07, 1.2, 3.5, 1.4);
    this.gong(13.0, NOTE(38), 0.2);
    // 14 s  FREEZE: the gate slams shut; one thin tone hangs in the silence
    this.tone(14.0, NOTE(88), 1.0, 0.006, 'sine', U, 0.05);
    // 15–18 s  initialisation: key clicks (one per typed character), progress bar, life, consciousness rising
    for (const cue of TEXT_CUES) {
      let i = 0;
      for (const line of cue.lines) for (const ch of line) { if (ch !== ' ') this.tone(cue.t + i / cue.cps, 2300 + (i % 3) * 310, 0.012, 0.03, 'square', U, 0.001); i++; }
    }
    for (let i = 0; i < 24; i++) this.tone(15.4 + i * 0.02, 500 + i * 45, 0.01, 0.025, 'square', U, 0.001);
    this.tone(15.9, 880, 0.08, 0.05, 'square', U); this.tone(15.98, 1320, 0.12, 0.05, 'square', U);
    this.pad(16.0, 17.2, [50, 57, 64], 0.03, 700);
    for (let i = 0; i < 14; i++) {
      const t = 16.05 + i * 0.07 + r.next() * 0.03;
      this.tone(t, 300 + r.next() * 500, 0.12, 0.05).frequency.exponentialRampToValueAtTime(200 + r.next() * 900, t + 0.12);
    }
    this.swell(17.0, 18.0, 0.22, 'bandpass', 200, 5000, 1.2);
    this.tone(17.0, NOTE(50), 1.0, 0.08, 'sine', this.music, 0.9).frequency.exponentialRampToValueAtTime(NOTE(86), 18.0);
    for (let t = 17.0, k = 0; t < 17.98; k++) { this.kick(t, 0.3 + (t - 17) * 0.4, 110, 45, 0.15); t += 0.22 * Math.pow(0.86, k); }
    // 18–20 s  the eye: impact, choir of saws, heartbeat, the blink
    this.kick(18.0, 1.0); this.sub(18.0, 0.9, 2.5); this.gong(18.0, NOTE(38), 0.25);
    this.pad(18.0, 20.0, [38, 45, 50, 53, 57, 63], 0.03, 1200);
    [18.5, 19.0, 19.5].forEach(t => { this.kick(t, 0.5, 90, 40, 0.25); this.kick(t + 0.16, 0.3, 80, 38, 0.2); });
    this.noise(19.76, 0.04, 0.4, 'highpass', 2000, 0.7, X); this.kick(19.76, 0.5, 200, 50, 0.15, X);
    // 20–24 s  ERROR (tritone beeps), then reality breaking: bit-crushed debris, squeals, sub drops
    for (let i = 0; i < 3; i++) {
      const t = 20.0 + i * 0.16;
      this.tone(t, 146.8, 0.1, 0.09, 'square', U, 0.002); this.tone(t, 207.7, 0.1, 0.09, 'square', U, 0.002);
    }
    this.pad(20.0, 24.0, [26, 32], 0.05, 380, X);
    [21.0, 22.0, 23.0].forEach(t => this.sub(t, 0.7, 0.9, X));
    for (let t = 21.0; t < 24.0;) {
      const c = this.c, s = c.createBufferSource(), g = c.createGain(), dur = 0.02 + r.next() * 0.09;
      s.buffer = this.crushBuf; s.playbackRate.value = 0.25 + r.next() * 3;
      g.gain.setValueAtTime(0.12 + r.next() * 0.25 * (t - 20.5) / 3.5, t); g.gain.setValueAtTime(0, t + dur);
      s.connect(g); g.connect(X); s.start(t, r.next() * 0.8); s.stop(t + dur + 0.01);
      if (r.next() < 0.3) this.tone(t, 200 + r.next() * 3000, dur, 0.05, 'square', X, 0.001);
      t += (0.03 + r.next() * 0.12) * (1.15 - (t - 21) / 3.5);
    }
    // 24–28 s  blackness, the cursor, the question, the hesitation, YES
    [24.0, 24.5].forEach(t => this.tone(t, 3000, 0.006, 0.015, 'square', U, 0.001));
    this.tone(25.55, 1760, 0.05, 0.03, 'square', U);
    this.tone(26.0, 1200, 0.02, 0.05, 'square', U); this.kick(26.0, 0.2, 90, 50, 0.1, U);
    this.tone(27.0, 1500, 0.02, 0.05, 'square', U); this.kick(27.0, 0.2, 90, 50, 0.1, U);
    this.tone(27.5, 880, 0.08, 0.06, 'square', U); this.tone(27.6, 1320, 0.16, 0.06, 'square', U);
    // 28–30 s  rebirth and the infinite pull-back
    for (let i = 0; i < 16; i++) this.bell(28.0 + i * 0.0375, NOTE(N(i, 4)), 0.05, 0.9, 3.5, 1.2);
    this.pad(28.0, 30.0, [38, 45], 0.035, 400);
    this.swell(28.1, 28.6, 0.2, 'lowpass', 300, 7000, 0.7);
    this.kick(28.6, 1.0); this.sub(28.6, 1.0, 1.4); this.gong(28.6, NOTE(38), 0.25);
    this.pad(28.6, 29.7, [38, 45, 50, 57, 64], 0.035, 1500);
    this.bell(29.5, NOTE(62), 0.13, 1.6, 2.0, 1.5);   // the opening bell returns: the loop closes
  }
}

/* ============================================================================
   7b. AUDIO ENGINE — playback of the rendered score (play / stop / seek).
   The analyser taps the source before the volume stage, so muting keeps the
   visuals reactive.
   ========================================================================== */
class AudioEngine {
  constructor() {
    this.ctx = null; this.buffer = null; this.src = null; this.analyser = null;
    this.playing = false; this.startAt = 0; this.muted = QS.has('mute'); this.status = 'composing';
  }
  init() {                                   // must run inside a user gesture (autoplay policy)
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.status = 'no Web Audio'; return; }
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : CONFIG.audio.volume;
    this.out.connect(this.ctx.destination);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.5;
  }
  play(offset) {
    this.stop();
    if (!this.ctx || !this.buffer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    offset = Math.max(0, offset);
    if (offset >= this.buffer.duration) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer; s.connect(this.analyser); s.connect(this.out); s.start(0, offset);
    this.src = s; this.startAt = this.ctx.currentTime - offset; this.playing = true;
  }
  stop() {
    if (this.src) { try { this.src.stop(); } catch (e) { /* already ended */ } this.src.disconnect(); this.src = null; }
    this.playing = false;
  }
  time() { return this.ctx.currentTime - this.startAt - (this.ctx.outputLatency || 0); }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : CONFIG.audio.volume; }
}

/* ============================================================================
   7c. AUDIO REACTIVE SYSTEM — AnalyserNode → bass / mid / high.
   Band energy is read from the FFT, auto-gained by a slowly decaying peak
   (so any track works), then exponentially smoothed with a fast attack and a
   slower release so the picture never jitters.  A toggles it off; the film is
   then driven by the timeline alone.
   ========================================================================== */
class AudioReactiveSystem {
  constructor() {
    this.enabled = true; this.data = null;
    this.v = { bass: 0, mid: 0, high: 0 };
    this.peak = { bass: 0.3, mid: 0.3, high: 0.3 };
  }
  update(dt, an, sr, active) {
    const A = CONFIG.audio, raw = { bass: 0, mid: 0, high: 0 };
    if (an && active) {
      if (!this.data) this.data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(this.data);
      const hz = sr / an.fftSize, d = this.data;
      for (const k in raw) {
        const i0 = Math.max(1, Math.floor(A.bands[k][0] / hz)), i1 = Math.min(d.length - 1, Math.ceil(A.bands[k][1] / hz));
        let s = 0;
        for (let i = i0; i <= i1; i++) s += d[i];
        const x = Math.max(0, s / ((i1 - i0 + 1) * 255) - 0.1) / 0.9;
        this.peak[k] = Math.max(this.peak[k] * Math.exp(-dt * 0.3), x, 0.2);
        raw[k] = clamp01(x / this.peak[k]);
      }
    }
    for (const k in this.v) {
      const target = this.enabled ? raw[k] * A.reactivity : 0, rate = target > this.v[k] ? A.attack : A.release;
      this.v[k] += (target - this.v[k]) * (1 - Math.exp(-dt * rate));
    }
  }
}
