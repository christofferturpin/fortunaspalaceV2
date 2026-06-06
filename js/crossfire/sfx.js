/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CROSSFIRE / CONCUSSION BOWL SFX  —  crunchy industrial Web-Audio synth  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Procedural sounds only — no audio assets. Master = compressor + soft   │
  │   tanh waveshaper for that rolled-steel saturation, then master gain.    │
  │                                                                          │
  │   Lazy AudioContext; first user gesture (pointerdown/click/keydown)      │
  │   plays a silent blip to "unlock" the engine in autoplay-blocked         │
  │   browsers. All scheduling uses an 8ms lookahead so a freshly-resumed    │
  │   context doesn't drop events.                                           │
  │                                                                          │
  │   Exports (window.CFSfx): { fire, aiFire, puckHit, wallHit, laser,      │
  │                              score, matchEnd, kickoff, button, deny,    │
  │                              setMuted, isMuted, test }                  │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ctx=lazy AudioContext; bus=comp(thresh=-16,knee=4,ratio=10,atk=.003,rel=.12)→shaper(tanh×2.5)→gain(.9)→dest
  noiseBuf(dur)→AudioBuffer: random[-1,1] * sr*dur samples
  clack({pitch,dur,body,noiseAmt,noiseFreq,hp/lp/bp,sat}):
    square 2pitch→.5pitch over dur, ASR body gain → bus
    optional noise transient (highpass default) layered
  thump({pitch,dur,body}): low-pitch sine + noise, longer envelope
  chime(partials[],dur): bandpass noise per partial, staggered
  zap({pitch,dur}): saw 4pitch→.25pitch + ring-mod noise burst, harsh
  unlockOnFirstGesture: bind capture-phase pointerdown/click/keydown/touchstart → silent osc to wake ctx
  exports.fire=clack(180,.05,.4,.5); aiFire=clack(140,.05,.35,.45); puckHit=thump scaled by speed; wallHit=clack(380,.03,.3,.6); laser=zap stacked; score=chime+brass; matchEnd(player)=ascending fanfare; matchEnd(ai)=descending dirge; kickoff=whistle-like zap; button=clack(420,.04); deny=clack(110,.08)
*/
(function (global) {
  let ctx = null;
  let bus = null;
  let unlocked = false;
  let muted = false;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); }
      catch (e) { console.warn('CFSfx: AudioContext failed', e); return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function getBus() {
    if (bus) return bus;
    const c = getCtx();
    if (!c) return null;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 4;
    comp.ratio.value = 10;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    // Tanh waveshaper for crunchy saturation
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(2048);
    const k = 2.5;
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.tanh(k * x);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const master = c.createGain();
    master.gain.value = 0.9;
    comp.connect(shaper).connect(master).connect(c.destination);
    bus = comp;
    return bus;
  }

  function unlockOnFirstGesture() {
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
    const t = c.currentTime + 0.001;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.01);
      unlocked = true;
    } catch (e) {}
  }
  ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, unlockOnFirstGesture, { capture: true });
  });

  function noiseBurst(opts) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const dur = opts.dur || 0.05;
    const freq = opts.freq || 2000;
    const q = opts.q || 6;
    const gain = opts.gain || 0.6;
    const type = opts.type || 'highpass';
    const len = Math.max(8, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = c.createGain();
    const t0 = c.currentTime + 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(b);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function clack(opts) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const pitch = opts.pitch || 180;
    const dur = opts.dur || 0.06;
    const body = opts.body != null ? opts.body : 0.5;
    const noiseAmt = opts.noiseAmt != null ? opts.noiseAmt : 0.5;
    const wave = opts.wave || 'square';
    const t0 = c.currentTime + 0.008;
    const osc = c.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(pitch * 2, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, pitch * 0.5), t0 + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(body, t0 + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(og).connect(b);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    if (noiseAmt > 0) {
      noiseBurst({
        dur: Math.min(0.05, dur * 0.7),
        freq: pitch * (opts.noiseFreqMul || 6),
        q: opts.noiseQ || 4,
        gain: noiseAmt,
        type: opts.noiseType || 'highpass'
      });
    }
  }

  function thump(opts) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const pitch = opts.pitch || 65;
    const dur = opts.dur || 0.22;
    const body = opts.body || 0.85;
    const t0 = c.currentTime + 0.008;
    // sine body + noise
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch * 3, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, pitch), t0 + 0.05);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(body, t0 + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(og).connect(b);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    noiseBurst({ dur: 0.06, freq: 400, q: 1.6, gain: 0.45, type: 'lowpass' });
    noiseBurst({ dur: 0.04, freq: 3000, q: 6, gain: 0.35, type: 'highpass' });
  }

  function chime(partials, baseDur, baseGain) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const t0 = c.currentTime + 0.008;
    partials.forEach((f, i) => {
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = f;
      filt.Q.value = 32;
      const len = Math.floor(c.sampleRate * baseDur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const ch = buf.getChannelData(0);
      for (let j = 0; j < len; j++) ch[j] = (Math.random() * 2 - 1) * 0.5;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      const start = t0 + i * 0.025;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(0.04, baseGain - i * 0.07), start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + baseDur);
      src.connect(filt).connect(g).connect(b);
      src.start(start);
      src.stop(start + baseDur);
    });
  }

  function zap(opts) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const pitch = opts.pitch || 600;
    const dur = opts.dur || 0.18;
    const t0 = c.currentTime + 0.008;
    // sawtooth swooping down (high → low gives "discharge" feel)
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 4, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, pitch * 0.25), t0 + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.55, t0 + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    // bandpass for that resonant whining
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(pitch * 3, t0);
    filt.frequency.exponentialRampToValueAtTime(pitch * 0.5, t0 + dur);
    filt.Q.value = 8;
    osc.connect(filt).connect(og).connect(b);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    // sizzle on top
    noiseBurst({ dur: dur * 0.7, freq: 3500, q: 3, gain: 0.4, type: 'highpass' });
  }

  function brass(rootHz, dur) {
    if (muted) return;
    const c = getCtx();
    const b = getBus();
    if (!c || !b) return;
    const t0 = c.currentTime + 0.008;
    // Three sawtooth voices at root, 5th, octave for chunky stadium horn.
    [1, 1.5, 2].forEach((mul, i) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * mul;
      const g = c.createGain();
      const lvl = 0.32 - i * 0.07;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(lvl, t0 + 0.02);
      g.gain.setValueAtTime(lvl, t0 + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1800;
      filt.Q.value = 3;
      osc.connect(filt).connect(g).connect(b);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  }

  global.CFSfx = {
    fire:    () => clack({ pitch: 180, dur: 0.05, body: 0.4, noiseAmt: 0.5 }),
    aiFire:  () => clack({ pitch: 140, dur: 0.05, body: 0.35, noiseAmt: 0.45 }),
    puckHit: (speed) => {
      // speed (px/s) modulates volume and pitch. Light grazes → small click;
      // heavy slams → low thump.
      const s = Math.min(1, (Math.abs(speed || 200) / 800));
      if (s < 0.25) clack({ pitch: 220, dur: 0.06, body: 0.35 * s + 0.15, noiseAmt: 0.5 });
      else thump({ pitch: 70 + (1 - s) * 40, dur: 0.16 + s * 0.1, body: 0.5 + s * 0.45 });
    },
    wallHit: () => clack({ pitch: 380, dur: 0.03, body: 0.25, noiseAmt: 0.55, noiseFreqMul: 4 }),
    laser:   (owner) => {
      zap({ pitch: owner === 'ai' ? 520 : 680, dur: 0.22 });
      setTimeout(() => clack({ pitch: 90, dur: 0.18, body: 0.85, noiseAmt: 1.0 }), 80);
    },
    score: (winner) => {
      chime([520, 780, 1100, 1450], 0.55, 0.42);
      setTimeout(() => brass(winner === 'player' ? 220 : 130, 0.55), 80);
    },
    matchEnd: (winner) => {
      // Player win: ascending chime cascade. AI win: descending dirge.
      if (winner === 'player') {
        chime([330, 495, 660], 0.45, 0.45);
        setTimeout(() => chime([495, 660, 880], 0.45, 0.45), 220);
        setTimeout(() => chime([660, 880, 1100], 0.6, 0.45), 460);
        setTimeout(() => brass(110, 1.1), 700);
      } else {
        chime([220, 175, 130], 0.5, 0.4);
        setTimeout(() => chime([175, 130, 98], 0.7, 0.4), 280);
        setTimeout(() => thump({ pitch: 50, dur: 0.9, body: 1.0 }), 520);
      }
    },
    kickoff: () => {
      // Industrial whistle: short rising zap + clack.
      const c = getCtx();
      if (!c) return;
      const t0 = c.currentTime + 0.008;
      try {
        const osc = c.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1100, t0);
        osc.frequency.linearRampToValueAtTime(1600, t0 + 0.18);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
        g.gain.setValueAtTime(0.35, t0 + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(g).connect(getBus());
        osc.start(t0);
        osc.stop(t0 + 0.25);
      } catch (e) {}
      setTimeout(() => clack({ pitch: 80, dur: 0.12, body: 0.9, noiseAmt: 0.9 }), 220);
    },
    button:  () => clack({ pitch: 420, dur: 0.04, body: 0.3, noiseAmt: 0.4 }),
    deny:    () => clack({ pitch: 110, dur: 0.08, body: 0.5, noiseAmt: 0.4 }),

    setMuted: (v) => { muted = !!v; },
    isMuted:  () => muted,
    test: () => {
      const c = getCtx();
      console.log('CFSfx.test() — state:', c && c.state, 'currentTime:', c && c.currentTime);
      clack({ pitch: 220, dur: 0.18, body: 0.9, noiseAmt: 0.7 });
    }
  };
})(window);
