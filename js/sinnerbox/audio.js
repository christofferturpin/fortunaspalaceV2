/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SINNERBOX AUDIO  —  WebAudio synth voices for slot + plinko             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded)  ─ AudioContext lazy-built on first call         │
  │                                                                          │
  │   ensureCtx() ──► AudioContext   (creates ctx + masterGain @ 0.4)        │
  │       ▲                                                                  │
  │       │ called by every voice                                            │
  │                                                                          │
  │   Primitives (all gated by muted flag):                                  │
  │     tone(freq, duration, opts?) ──► void   (osc → gain envelope)         │
  │     pitchSweep(from, to, duration, opts?) ──► void  (exp freq ramp)      │
  │     noiseBurst(duration, opts?) ──► void   (white noise → biquad)        │
  │                                                                          │
  │   Public voices (called by Slot.spin / Plinko ball events):              │
  │     click()         ──► two-tap square click                             │
  │     spin()          ──► dual sawtooth + LFO + lowpass + noise (1.2s)     │
  │     pegHit()        ──► throttled (>28ms) triangle blip, jittered freq   │
  │     zoneLand(value) ──► branch on 0/1/2/≥3 (loss/small/moving/big)       │
  │     jackpot()       ──► C-maj climb + held chord + shimmer + sweep       │
  │     setMuted(m)     ──► toggle muted flag                                │
  │     isMuted()       ──► bool                                             │
  │                                                                          │
  │   Module state: ctx, masterGain, muted, lastPegHitMs (throttle)          │
  │                                                                          │
  │   Exports (window.Sound): { click, spin, pegHit, zoneLand, jackpot,      │
  │                             setMuted, isMuted }                          │
  │   External deps: WebAudio API (AudioContext / webkitAudioContext),       │
  │                  performance.now                                         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F, lastPegHitMs=0
  ensureCtx()→ctx|null: lazy new (AudioContext||webkitAudioContext); masterGain=createGain@0.4→destination; if suspended→resume; ret ctx
  tone(freq,dur,opts={})→void: c=ensure; guard(!c||muted); osc(type=opts.type||'square',freq,detune?); g=gain; osc→g→master; vol=opts.volume??0.18; attack=opts.attack||0.005; env: 0→vol@attack→exp 0.001@dur; start now, stop dur+0.05
  pitchSweep(from,to,dur,opts={})→void: like tone but type=opts.type||'sawtooth'; freq.setVal(from)→expRamp(max(0.01,to))@dur
  noiseBurst(dur,opts={})→void: bufSz=sampleRate*dur; fill[-1,1] rnd; src→biquad(type=opts.filterType||'bandpass',freq=opts.filterFreq||1500,Q=opts.Q||4)→g→master; vol=opts.volume??0.12; env+start/stop
  click(): tone(110,.05,sq,.16); tone(70,.07,sq,.10,attack=.001)
  spin(): dur=1.2; 2 saw osc(92,95.5)+LFO(14Hz,gain=5)→both freq; lowpass(720,Q=1); env vol .11 sustained then exp; +noiseBurst(1.2,bp@1100,Q=1.5,.05)
  pegHit(): throttle now-lastPegHitMs<28; freq=700+rnd*500; tone(freq,.05,tri,.06,attack=.001)
  zoneLand(v): v==0→pitchSweep(220,130,.45,saw,.15) + setTimeout(80)tone(82,.4,sine,.18); v==1→tone(523,.18,sq,.15)+tone(1046,.12,tri,.05); v==2→arp[523,659,784,1046]@55ms each with overtones×2,×3 + sparkle pad@240 + noise shimmer@200 (hp@4500); v>=3→arp[330,392,494,659]@70ms minor+overtones
  jackpot(): climb=[262,330,392,523,659,784,1046]@55ms each tone+overtone; @climb.len*55→held chord C5+E5+G5+C6+sine2093; +noiseBurst(.7,hp@5000,Q=.6,.09); @+400→pitchSweep(800,2400,.45,saw,.10)
  exports: global.Sound={click,spin,pegHit,zoneLand,jackpot,setMuted(m){muted=m},isMuted()→muted}
  no DOMContentLoaded; ctx built lazily on first voice call
*/

(function (global) {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let lastPegHitMs = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.value = freq;
    if (opts.detune) osc.detune.value = opts.detune;
    osc.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.18 : opts.volume;
    const attack = opts.attack || 0.005;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function pitchSweep(fromFreq, toFreq, duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sawtooth';
    osc.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, toFreq), now + duration);
    const vol = opts.volume == null ? 0.18 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function noiseBurst(duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.value = opts.filterFreq || 1500;
    filter.Q.value = opts.Q || 4;
    const g = c.createGain();
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(opts.volume == null ? 0.12 : opts.volume, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  function click() {
    tone(110, 0.05, { type: 'square', volume: 0.16 });
    tone(70, 0.07, { type: 'square', volume: 0.10, attack: 0.001 });
  }

  function spin() {
    const c = ensureCtx();
    if (!c || muted) return;
    const duration = 1.2;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 92;
    const detunedOsc = c.createOscillator();
    detunedOsc.type = 'sawtooth';
    detunedOsc.frequency.value = 95.5;

    const lfo = c.createOscillator();
    lfo.frequency.value = 14;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(detunedOsc.frequency);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = 1;

    const g = c.createGain();
    osc.connect(filter);
    detunedOsc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);

    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.05);
    g.gain.setValueAtTime(0.11, now + duration - 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    detunedOsc.start(now);
    lfo.start(now);
    osc.stop(now + duration + 0.05);
    detunedOsc.stop(now + duration + 0.05);
    lfo.stop(now + duration + 0.05);

    noiseBurst(duration, {
      filterType: 'bandpass',
      filterFreq: 1100,
      Q: 1.5,
      volume: 0.05,
    });
  }

  function pegHit() {
    const now = performance.now();
    if (now - lastPegHitMs < 28) return;
    lastPegHitMs = now;
    const freq = 700 + Math.random() * 500;
    tone(freq, 0.05, { type: 'triangle', volume: 0.06, attack: 0.001 });
  }

  function zoneLand(value) {
    if (value === 0) {
      // Ominous: minor descending sawtooth + subbass
      pitchSweep(220, 130, 0.45, { type: 'sawtooth', volume: 0.15 });
      setTimeout(() => tone(82, 0.4, { type: 'sine', volume: 0.18 }), 80);
    } else if (value === 1) {
      // Small chime — single hit, square + ghost overtone
      tone(523, 0.18, { type: 'square', volume: 0.15 });
      tone(1046, 0.12, { type: 'triangle', volume: 0.05 });
    } else if (value === 2) {
      // Moving bonus lane — bright C-major arpeggio (C-E-G-C) with bell
      // overtones, a sustained sparkle pad, and a final shimmer noise burst.
      // Major mode keeps it tonally distinct from the ≥3 minor arpeggio.
      const notes = [523, 659, 784, 1046];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          tone(freq, 0.22, { type: 'square',   volume: 0.17 });
          tone(freq * 2, 0.18, { type: 'triangle', volume: 0.08 });
          tone(freq * 3, 0.10, { type: 'sine',     volume: 0.04 });
        }, i * 55);
      });
      // Sparkle pad — a held high octave that blooms after the arpeggio lands.
      setTimeout(() => {
        tone(2093, 0.45, { type: 'triangle', volume: 0.07, attack: 0.04 });
        tone(2637, 0.35, { type: 'sine',     volume: 0.05, attack: 0.06 });
      }, 240);
      // Bright high-pass noise shimmer for that slot-machine sparkle.
      setTimeout(() => {
        noiseBurst(0.32, {
          filterType: 'highpass',
          filterFreq: 4500,
          Q: 0.7,
          volume: 0.08,
        });
      }, 200);
    } else if (value >= 3) {
      // Big win — minor arpeggio (E-G-B-E') with overtones
      const notes = [330, 392, 494, 659];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          tone(freq, 0.16, { type: 'square', volume: 0.16 });
          tone(freq * 2, 0.08, { type: 'triangle', volume: 0.05 });
        }, i * 70);
      });
    }
  }

  function jackpot() {
    // Big fanfare for the jackpot trigger — full octave climb in C major,
    // then a held high power-chord with shimmer and a noise sweep on top.
    const climb = [262, 330, 392, 523, 659, 784, 1046];
    climb.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq, 0.18, { type: 'square',   volume: 0.18 });
        tone(freq * 2, 0.14, { type: 'triangle', volume: 0.08 });
      }, i * 55);
    });
    // Held high chord (C5 + E5 + G5 + C6) blooms after the climb.
    setTimeout(() => {
      tone(523,  0.9, { type: 'square',   volume: 0.16, attack: 0.03 });
      tone(659,  0.9, { type: 'square',   volume: 0.13, attack: 0.04 });
      tone(784,  0.9, { type: 'square',   volume: 0.12, attack: 0.05 });
      tone(1046, 0.9, { type: 'triangle', volume: 0.10, attack: 0.06 });
      tone(2093, 0.7, { type: 'sine',     volume: 0.06, attack: 0.10 });
    }, climb.length * 55);
    // Sustained shimmer on top.
    setTimeout(() => {
      noiseBurst(0.7, {
        filterType: 'highpass',
        filterFreq: 5000,
        Q: 0.6,
        volume: 0.09,
      });
    }, climb.length * 55);
    // Pitch sweep up at the very end for that "+coins!" cherry on top.
    setTimeout(() => {
      pitchSweep(800, 2400, 0.45, { type: 'sawtooth', volume: 0.10 });
    }, climb.length * 55 + 400);
  }

  global.Sound = {
    click,
    spin,
    pegHit,
    zoneLand,
    jackpot,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
