/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  IS-IT-RAINING AUDIO  —  WebAudio SFX bank for the weather-guess game    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   ensureCtx() ──► lazily creates AudioContext + masterGain (0.4)         │
  │                    ──► resumes if suspended; returns ctx | null          │
  │                                                                          │
  │   Primitive layer:                                                       │
  │     tone(freq, duration, opts)         ──► oscillator + gain envelope    │
  │     pitchSweep(from, to, duration, opts) ──► osc w/ exp freq ramp        │
  │     noiseBurst(duration, opts)         ──► buffer src + biquad filter    │
  │                                                                          │
  │   SFX layer (consume primitives; respect muted flag):                    │
  │     click()         ──► tone+tone (bakelite button)                      │
  │     channelChange() ──► noiseBurst → delayed tones                       │
  │     correct(rung)   ──► layered chime; complexity grows with rung 1..10  │
  │     wrong()         ──► pitchSweep + tone + noiseBurst                   │
  │     cashOut()       ──► coin-shower of tones + register chime            │
  │     pushIt()        ──► rising sweep + low triangle                      │
  │     powerOn()       ──► tone + noiseBurst + sweep                        │
  │     broke()         ──► two low square tones                             │
  │                                                                          │
  │   Exports (window.IRSound):                                              │
  │     { click, channelChange, correct, wrong, cashOut, pushIt,             │
  │       powerOn, broke, setMuted(m), isMuted() }                           │
  │   External deps: AudioContext / webkitAudioContext                       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F
  ensureCtx()→ctx|null: !ctx→AC=AudioContext||webkit; !AC→null; new AC; masterGain.gain=0.4→destination; suspended→resume; ret ctx
  tone(freq,duration,opts): c=ensureCtx; guard(!c||muted); osc(type||'square',freq,detune?)→gain→master; gain env: 0→vol@attack→exp 0.001@duration; osc.start/stop
  pitchSweep(from,to,duration,opts): osc(type||'sawtooth'); freq from→to exp ramp; gain env 0→vol→0.001; start/stop
  noiseBurst(duration,opts): buffer=createBuffer(1,sr*duration); fill data[i]=rnd*2-1; src→biquad(filterType||'bandpass',filterFreq||1500,Q||4)→gain→master; env 0→vol→0.001; start/stop
  click(): tone(160,.04,square v=.14) + tone(70,.07,triangle v=.09) — bakelite button
  channelChange(): noiseBurst(.18, bandpass 1800 Q1.5 v=.08); setTimeout 140→tone(220,.05 sq)+tone(110,.06 sq)
  correct(rung): r=clamp(rung,1,10); base E5+E6; r≥3 add G5+ovr@80ms; r≥5 add B5+ovr@160ms + highpass noise@200ms; r≥7 add E6+sine@240ms
  wrong(): pitchSweep(330→110,.45 saw v=.16); +60ms tone(82,.45 sine v=.18); +30ms lowpass noiseBurst
  cashOut(): 8 coin pings@32ms*i+rnd: freq=1200+rnd*1400 triangle v=.08; +280ms register chime tone(880,.30)+tone(1318,.30)+tone(1760,.22)
  pushIt(): pitchSweep(220→660,.18 sq v=.10) + tone(110,.05 tri v=.06)
  powerOn(): tone(80,.04 sq v=.18); +50ms highpass noiseBurst .4 + sweep(120→60 sine v=.06)
  broke(): tone(140,.12 sq v=.14); +90ms tone(100,.16 sq v=.12)
  exports: window.IRSound={click,channelChange,correct,wrong,cashOut,pushIt,powerOn,broke,setMuted(m)→muted=!!m,isMuted()→muted}
*/

(function (global) {
  // WebAudio-based SFX for "Is It Raining?". Same shape as js/sinnerbox/audio.js
  // — single AudioContext, master gain, helpers for tones / sweeps / noise.

  let ctx = null;
  let masterGain = null;
  let muted = false;

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

  // Chunky bakelite TV button — a hard low click with a faint wood thunk.
  function click() {
    tone(160, 0.04, { type: 'square',   volume: 0.14, attack: 0.001 });
    tone(70,  0.07, { type: 'triangle', volume: 0.09, attack: 0.001 });
  }

  // Brief radio-tune: a thin static burst with a settling click. Played
  // when a new city loads (channel change).
  function channelChange() {
    noiseBurst(0.18, {
      filterType: 'bandpass',
      filterFreq: 1800,
      Q: 1.5,
      volume: 0.08,
    });
    setTimeout(() => {
      tone(220, 0.05, { type: 'square', volume: 0.12 });
      tone(110, 0.06, { type: 'square', volume: 0.08 });
    }, 140);
  }

  // Correct guess — chime intensity climbs with the rung achieved (1..10).
  // Rung 1 is modest. Higher rungs add overtones, sparkle, and a wider
  // major arpeggio. The weatherman is upset, in proportion.
  function correct(rung) {
    const c = ensureCtx();
    if (!c || muted) return;
    const r = Math.max(1, Math.min(10, rung || 1));
    // Base chime — same on every rung so the run feels coherent.
    tone(659, 0.18, { type: 'square',   volume: 0.16 });            // E5
    tone(1318, 0.12, { type: 'triangle', volume: 0.06 });           // E6 ghost
    if (r >= 3) {
      setTimeout(() => {
        tone(784, 0.16, { type: 'square',   volume: 0.15 });        // G5
        tone(1568, 0.10, { type: 'triangle', volume: 0.05 });
      }, 80);
    }
    if (r >= 5) {
      setTimeout(() => {
        tone(988, 0.18, { type: 'square',   volume: 0.15 });        // B5
        tone(1976, 0.10, { type: 'triangle', volume: 0.05 });
      }, 160);
    }
    if (r >= 7) {
      setTimeout(() => {
        tone(1318, 0.22, { type: 'square',   volume: 0.14 });       // E6
        tone(2637, 0.10, { type: 'sine',     volume: 0.04 });
      }, 240);
    }
    if (r >= 5) {
      setTimeout(() => {
        noiseBurst(0.25, {
          filterType: 'highpass',
          filterFreq: 4500,
          Q: 0.7,
          volume: 0.06,
        });
      }, 200);
    }
  }

  // Wrong guess — sour descending buzzer with a thud underneath.
  function wrong() {
    pitchSweep(330, 110, 0.45, { type: 'sawtooth', volume: 0.16 });
    setTimeout(() => tone(82, 0.45, { type: 'sine', volume: 0.18 }), 60);
    setTimeout(() => {
      noiseBurst(0.18, {
        filterType: 'lowpass',
        filterFreq: 800,
        Q: 1,
        volume: 0.07,
      });
    }, 30);
  }

  // Cash out — quick coin shower into a register chime.
  function cashOut() {
    const c = ensureCtx();
    if (!c || muted) return;
    // Pseudo coin shower: a flurry of short high pings.
    for (let i = 0; i < 8; i++) {
      const delay = i * 32 + Math.random() * 18;
      const freq = 1200 + Math.random() * 1400;
      setTimeout(() => {
        tone(freq, 0.06, { type: 'triangle', volume: 0.08 });
      }, delay);
    }
    // Register chime — bright two-tone bell after the shower lands.
    setTimeout(() => {
      tone(880,  0.30, { type: 'square',   volume: 0.16 });
      tone(1318, 0.30, { type: 'square',   volume: 0.13 });
      tone(1760, 0.22, { type: 'triangle', volume: 0.06 });
    }, 280);
  }

  // PUSH IT — a brief rising tension tone, like a "are you sure?" cue.
  function pushIt() {
    pitchSweep(220, 660, 0.18, { type: 'square', volume: 0.10 });
    tone(110, 0.05, { type: 'triangle', volume: 0.06 });
  }

  // New run — TV power-on click + quick CRT warmup whoosh.
  function powerOn() {
    tone(80, 0.04, { type: 'square', volume: 0.18, attack: 0.001 });
    setTimeout(() => {
      noiseBurst(0.4, {
        filterType: 'highpass',
        filterFreq: 2200,
        Q: 0.6,
        volume: 0.05,
      });
      pitchSweep(120, 60, 0.4, { type: 'sine', volume: 0.06 });
    }, 50);
  }

  // Tried to spend more than you have — short low denial buzz.
  function broke() {
    tone(140, 0.12, { type: 'square', volume: 0.14, attack: 0.001 });
    setTimeout(() => tone(100, 0.16, { type: 'square', volume: 0.12 }), 90);
  }

  global.IRSound = {
    click,
    channelChange,
    correct,
    wrong,
    cashOut,
    pushIt,
    powerOn,
    broke,
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
  };
})(window);
