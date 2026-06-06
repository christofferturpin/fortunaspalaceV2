/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DOUBLE HAPPINESS AUDIO — WebAudio SFX bank for the eyeballs game        │
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
  │     click()         ──► chopstick clack (two short hard ticks)           │
  │     doorChime()     ──► entry-bell three-tone (new run / new pair)       │
  │     correct(rung)   ──► brass-bell chime; ornament with rung 1..12       │
  │     wrong()         ──► sour gong-warble + low thud                      │
  │     cashOut()       ──► register chime + paper-receipt rustle            │
  │     pushIt()        ──► chime ascend (lazy-susan spin)                   │
  │     broke()         ──► two muted blocks                                 │
  │                                                                          │
  │   Exports (window.DHSound):                                              │
  │     { click, doorChime, correct, wrong, cashOut, pushIt, broke,          │
  │       setMuted(m), isMuted() }                                           │
  │   External deps: AudioContext / webkitAudioContext                       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F
  ensureCtx()→ctx|null: !ctx→AC=AudioContext||webkit; !AC→null; new AC; masterGain.gain=0.4→destination; suspended→resume; ret ctx
  tone(freq,duration,opts): c=ensureCtx; guard(!c||muted); osc(type||'square',freq,detune?)→gain→master; env 0→vol@attack→exp 0.001@duration; start/stop
  pitchSweep(from,to,duration,opts): osc(type||'sawtooth'); freq from→to exp ramp; gain env 0→vol→0.001; start/stop
  noiseBurst(duration,opts): buffer 1ch sr*duration rnd; src→biquad(filterType||'bandpass',filterFreq||1500,Q||4)→gain→master; env; start/stop
  click(): tone(900,.025 sq v=.10) + tone(1200,.018 tri v=.06) +tone(380,.04 tri v=.05)@8ms — chopstick clack
  doorChime(): tone(1318,.18 tri v=.10) +tone(880,.20 tri v=.09)@110ms +tone(1568,.18 tri v=.07)@220ms — entry bell
  correct(rung): r=clamp(1,12); base brass bell tone(523,.32 tri v=.12)+tone(1046,.20 sine v=.06); r≥3 add tone(659,.30 tri v=.10)@90ms; r≥6 add tone(784,.30 tri v=.10)@180ms; r≥9 add tone(1046,.30 sine v=.07)@270ms; r≥6 highpass noiseBurst(.25,4000 v=.04)@200ms
  wrong(): pitchSweep(180→90,.6 sine v=.18) + tone(70,.55 sine v=.16)@50ms + lowpass noiseBurst(.25,500 Q1 v=.08)@10ms — gong wobble
  cashOut(): bell tone(880,.32 tri v=.16)+tone(1318,.28 tri v=.12); +250ms 6 paper-rustle highpass noiseBursts(.08,8000 v=.04) at 50ms*i
  pushIt(): pitchSweep(440→990,.22 tri v=.10) + tone(220,.08 sine v=.06) — lazy susan spin chime
  broke(): tone(180,.10 sq v=.12) + tone(140,.14 sq v=.10)@90ms — wood block thud
  exports: window.DHSound={click,doorChime,correct,wrong,cashOut,pushIt,broke,setMuted(m)→muted=!!m,isMuted()→muted}
*/

(function (global) {
  // Restaurant-coded SFX bank. Same primitives as is-it-raining's audio.js —
  // tone / sweep / noise — but the cued SFX are chopstick clacks, brass bell
  // chimes, gong warble, and paper-receipt rustle.

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

  // Chopstick clack: two short hard ticks with a wooden afterthump.
  function click() {
    tone(900,  0.025, { type: 'square',   volume: 0.10, attack: 0.001 });
    tone(1200, 0.018, { type: 'triangle', volume: 0.06, attack: 0.001 });
    setTimeout(() => tone(380, 0.04, { type: 'triangle', volume: 0.05 }), 8);
  }

  // Entry bell — three triangle tones cascading like the bell tied to a
  // restaurant's front door. Played on new run and new pair.
  function doorChime() {
    tone(1318, 0.18, { type: 'triangle', volume: 0.10 });
    setTimeout(() => tone(880,  0.20, { type: 'triangle', volume: 0.09 }), 110);
    setTimeout(() => tone(1568, 0.18, { type: 'triangle', volume: 0.07 }), 220);
  }

  // Correct — brass bell chime; ornament added at higher rungs (1..12).
  function correct(rung) {
    const c = ensureCtx();
    if (!c || muted) return;
    const r = Math.max(1, Math.min(12, rung || 1));
    // Base bell — present on every rung so the run feels coherent.
    tone(523,  0.32, { type: 'triangle', volume: 0.12 });            // C5
    tone(1046, 0.20, { type: 'sine',     volume: 0.06 });            // C6 sparkle
    if (r >= 3) {
      setTimeout(() => {
        tone(659, 0.30, { type: 'triangle', volume: 0.10 });          // E5
        tone(1318, 0.18, { type: 'sine',    volume: 0.05 });
      }, 90);
    }
    if (r >= 6) {
      setTimeout(() => {
        tone(784, 0.30, { type: 'triangle', volume: 0.10 });          // G5
        tone(1568, 0.18, { type: 'sine',    volume: 0.05 });
      }, 180);
      setTimeout(() => {
        noiseBurst(0.25, {
          filterType: 'highpass',
          filterFreq: 4000,
          Q: 0.6,
          volume: 0.04,
        });
      }, 200);
    }
    if (r >= 9) {
      setTimeout(() => {
        tone(1046, 0.30, { type: 'sine',     volume: 0.07 });          // C6
        tone(2093, 0.18, { type: 'sine',     volume: 0.04 });
      }, 270);
    }
  }

  // Wrong — gong warble: low slow sweep with a dull thud.
  function wrong() {
    pitchSweep(180, 90, 0.6, { type: 'sine', volume: 0.18 });
    setTimeout(() => tone(70, 0.55, { type: 'sine', volume: 0.16 }), 50);
    setTimeout(() => {
      noiseBurst(0.25, {
        filterType: 'lowpass',
        filterFreq: 500,
        Q: 1,
        volume: 0.08,
      });
    }, 10);
  }

  // Cash out — bright bell chime (cash register) followed by a quick paper
  // rustle (the receipt printing).
  function cashOut() {
    const c = ensureCtx();
    if (!c || muted) return;
    tone(880,  0.32, { type: 'triangle', volume: 0.16 });
    tone(1318, 0.28, { type: 'triangle', volume: 0.12 });
    // Six rapid highpass noise pops = receipt-paper rustle.
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        noiseBurst(0.08, {
          filterType: 'highpass',
          filterFreq: 8000,
          Q: 0.5,
          volume: 0.04,
        });
      }, 250 + i * 50);
    }
  }

  // Push it — rising chime sweep, like the lazy susan spinning the next pair
  // of dishes into position.
  function pushIt() {
    pitchSweep(440, 990, 0.22, { type: 'triangle', volume: 0.10 });
    tone(220, 0.08, { type: 'sine', volume: 0.06 });
  }

  // Broke — two wood-block thuds, the kind a host bangs on the counter to
  // say no.
  function broke() {
    tone(180, 0.10, { type: 'square', volume: 0.12, attack: 0.001 });
    setTimeout(() => tone(140, 0.14, { type: 'square', volume: 0.10 }), 90);
  }

  global.DHSound = {
    click,
    doorChime,
    correct,
    wrong,
    cashOut,
    pushIt,
    broke,
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
  };
})(window);
