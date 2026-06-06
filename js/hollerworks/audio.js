/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLLERWORKS AUDIO — WebAudio synth voices for slot + wheel              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded)  ─ AudioContext lazy-built on first call         │
  │                                                                          │
  │   ensureCtx() ──► AudioContext   (creates ctx + masterGain @ 0.35)       │
  │       ▲                                                                  │
  │       │ called by every voice                                            │
  │                                                                          │
  │   Primitives (all gated by muted flag):                                  │
  │     tone(freq, duration, opts?) ──► osc → gain envelope                  │
  │     noiseBurst(duration, opts?) ──► white noise → biquad → gain          │
  │                                                                          │
  │   Public voices (called by Slot.spin / Intersection collisions):         │
  │     click()        ──► two-tap square click                              │
  │     spin()         ──► low boiler rumble + chuff (0.9s)                  │
  │     carCrash()     ──► sub-thump + saw clang + glass burst (throttle 70) │
  │     truckCrash()   ──► deeper, longer boom + low rumble (throttle 140)   │
  │     fireWhoosh()   ──► bandpassed roar for ignition (throttle 90)        │
  │     tireScreech(i) ──► rising squeal, intensity-scaled (throttle 110)    │
  │     bodySplat()    ──► wet low thud + squelch noise (throttle 50)        │
  │     ballLand(s)    ──► branch on skee-ball score:                        │
  │                       s===0    → gutter thunk (throttled 25ms)           │
  │                       s===10   → soft ting                               │
  │                       s===20   → small chime + overtone                  │
  │                       s===30   → bigger chime + overtone                 │
  │                       s===40   → brighter chime + overtone               │
  │                       s===50   → bright triad                            │
  │                       s>=100   → 4-note carnival bell + shimmer          │
  │     setMuted(m)  ──► toggle muted flag                                   │
  │     isMuted()    ──► bool                                                │
  │                                                                          │
  │   Module state: ctx, masterGain, muted, lastTingMs (throttle)            │
  │                                                                          │
  │   Exports (window.Sound): { click, spin, ballLand, carCrash,             │
  │     truckCrash, fireWhoosh, tireScreech, bodySplat,                      │
  │     setMuted, isMuted }                                                  │
  │   External deps: WebAudio API, performance.now                           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F, lastTingMs=0
  ensureCtx()→ctx|null: lazy new (AudioContext||webkitAudioContext);
    masterGain=createGain@0.35→destination; if suspended→resume; ret ctx
  tone(freq,dur,opts={})→void: c=ensure; guard(!c||muted);
    osc(type=opts.type||'square',freq)→g→master; vol=opts.volume??0.15;
    env: 0→vol@(opts.attack||0.003)→exp 0.001@dur; start now, stop dur+0.05
  noiseBurst(dur,opts={})→void: bufSz=sampleRate*dur; fill[-1,1] rnd;
    src→biquad(filterType||'bandpass',filterFreq||1500,Q||4)→g→master;
    vol=opts.volume??0.10; env+start/stop
  click(): tone(140,.04,sq,.14); tone(80,.06,sq,.08,attack=.001)
  spin(): dur=0.9; saw osc 64Hz + LFO 8Hz·gain=4→freq; lowpass(420,Q=1.5);
    env vol .12 sustained then exp; +noiseBurst(.9,bp@700,Q=1.2,.06)
  ballLand(s): s==0→throttle 25ms; tone(180+rnd*40,.07,sine,.07);
    s==10→tone(660,.07,sq,.10);
    s==20→tone(784,.09,sq,.12)+tone(1175,.06,tri,.05);
    s==30→tone(880,.12,sq,.13)+tone(1320,.08,tri,.06);
    s==40→tone(988,.14,sq,.14)+tone(1480,.10,tri,.07);
    s==50→tone(1046,.16,sq,.16)+tone(1568,.12,tri,.08)+tone(2093,.10,sine,.05);
    s>=100→arp[523,659,784,1046]@30ms w/ overtones + noiseBurst(.3,hp@4000,.7,.08)
  exports: global.Sound={click,spin,ballLand,setMuted(m){muted=m},isMuted()→muted}
  no DOMContentLoaded; ctx built lazily on first voice call
*/
(function (global) {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let lastTingMs = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
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
    osc.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.15 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + (opts.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function noiseBurst(duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
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
    g.gain.linearRampToValueAtTime(opts.volume == null ? 0.10 : opts.volume, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  function click() {
    tone(140, 0.04, { type: 'square', volume: 0.14 });
    tone(80, 0.06, { type: 'square', volume: 0.08, attack: 0.001 });
  }

  function spin() {
    const c = ensureCtx();
    if (!c || muted) return;
    const duration = 0.9;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 64;
    const lfo = c.createOscillator();
    lfo.frequency.value = 8;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.5;
    const g = c.createGain();
    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.05);
    g.gain.setValueAtTime(0.12, now + duration - 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + duration + 0.05);
    lfo.stop(now + duration + 0.05);
    noiseBurst(duration, {
      filterType: 'bandpass',
      filterFreq: 700,
      Q: 1.2,
      volume: 0.06,
    });
  }

  function ballLand(score) {
    if (score === 0) {
      // Gutter — dull thunk. Throttled because gutters cluster.
      const now = performance.now();
      if (now - lastTingMs < 25) return;
      lastTingMs = now;
      tone(180 + Math.random() * 40, 0.07, { type: 'sine', volume: 0.07 });
      return;
    }
    if (score === 10) {
      tone(660, 0.07, { type: 'square', volume: 0.10 });
    } else if (score === 20) {
      tone(784, 0.09, { type: 'square', volume: 0.12 });
      tone(1175, 0.06, { type: 'triangle', volume: 0.05 });
    } else if (score === 30) {
      tone(880, 0.12, { type: 'square', volume: 0.13 });
      tone(1320, 0.08, { type: 'triangle', volume: 0.06 });
    } else if (score === 40) {
      tone(988, 0.14, { type: 'square', volume: 0.14 });
      tone(1480, 0.10, { type: 'triangle', volume: 0.07 });
    } else if (score === 50) {
      tone(1046, 0.16, { type: 'square', volume: 0.16 });
      tone(1568, 0.12, { type: 'triangle', volume: 0.08 });
      tone(2093, 0.10, { type: 'sine',     volume: 0.05 });
    } else if (score >= 100) {
      // Carnival bell jackpot — 4-note ascend + shimmer
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => {
        setTimeout(() => {
          tone(f, 0.20, { type: 'square',   volume: 0.16 });
          tone(f * 2, 0.14, { type: 'triangle', volume: 0.07 });
        }, i * 30);
      });
      noiseBurst(0.3, {
        filterType: 'highpass',
        filterFreq: 4000,
        Q: 0.7,
        volume: 0.08,
      });
    }
  }

  // Car crash: percussive low thump + sawtooth clang + high-frequency
  // glass-shard noise burst. Throttled so a 20-car pileup over a few
  // hundred ms doesn't blend into a single fuzz.
  let lastCrashMs = 0;
  function carCrash() {
    const now = performance.now();
    if (now - lastCrashMs < 70) return;
    lastCrashMs = now;
    tone(70 + Math.random() * 25, 0.14, { type: 'square',   volume: 0.20 });
    tone(280 + Math.random() * 60, 0.09, { type: 'sawtooth', volume: 0.13 });
    noiseBurst(0.18, {
      filterType: 'highpass',
      filterFreq: 3000 + Math.random() * 1500,
      Q: 0.7,
      volume: 0.10,
    });
  }

  // Truck crash: bigger, lower, longer — separate throttle from carCrash so
  // a truck inside a pile-up still gets its boom even when cars are flooding.
  let lastTruckCrashMs = 0;
  function truckCrash() {
    const now = performance.now();
    if (now - lastTruckCrashMs < 140) return;
    lastTruckCrashMs = now;
    tone(40 + Math.random() * 15, 0.40, { type: 'square',   volume: 0.28 });
    tone(120 + Math.random() * 30, 0.26, { type: 'sawtooth', volume: 0.20 });
    tone(200 + Math.random() * 40, 0.18, { type: 'square',   volume: 0.14 });
    noiseBurst(0.50, {
      filterType: 'lowpass',
      filterFreq: 500 + Math.random() * 200,
      Q: 0.6,
      volume: 0.18,
    });
    noiseBurst(0.30, {
      filterType: 'highpass',
      filterFreq: 2200,
      Q: 0.8,
      volume: 0.12,
    });
  }

  // Fire whoosh — soft roar that plays right after a crash, evoking the
  // fuel ignition. Bandpassed pink-ish noise with a slow envelope.
  let lastWhooshMs = 0;
  function fireWhoosh() {
    const now = performance.now();
    if (now - lastWhooshMs < 90) return;
    lastWhooshMs = now;
    noiseBurst(0.55, {
      filterType: 'bandpass',
      filterFreq: 600 + Math.random() * 200,
      Q: 1.2,
      volume: 0.11,
    });
    noiseBurst(0.35, {
      filterType: 'lowpass',
      filterFreq: 220,
      Q: 0.8,
      volume: 0.09,
    });
  }

  // Plink — bright bell-like ping, used for slot win highlights. Triangle
  // base + sine octave-up sparkle. Pitch arg controls the note (default
  // 1100Hz). Callers chain a few of these for an arpeggio.
  function plink(freq) {
    const c = ensureCtx();
    if (!c || muted) return;
    const f = freq || 1100;
    const dur = 0.20;
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = c.createGain();
    osc.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    // Octave-up sparkle
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = f * 2;
    const g2 = c.createGain();
    osc2.connect(g2); g2.connect(masterGain);
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.05, now + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.5);
    osc2.start(now);
    osc2.stop(now + dur + 0.05);
  }

  // Body splat — three-layer cartoon squelch: low thud, downward sine
  // pitch slide (the "squish"), and a brief wet noise burst. Throttled so
  // a pile-up's worth of splats don't compound into a buzz.
  let lastSplatMs = 0;
  function bodySplat() {
    const now = performance.now();
    if (now - lastSplatMs < 50) return;
    lastSplatMs = now;
    const c = ensureCtx();
    if (!c || muted) return;
    // 1. Low thud
    tone(46 + Math.random() * 12, 0.12, { type: 'square', volume: 0.18 });
    // 2. Downward pitch-slide squelch (sine, 200Hz → 40Hz over 130ms)
    const osc = c.createOscillator();
    osc.type = 'sine';
    const startF = 180 + Math.random() * 50;
    const now2 = c.currentTime;
    osc.frequency.setValueAtTime(startF, now2);
    osc.frequency.exponentialRampToValueAtTime(40, now2 + 0.13);
    const g = c.createGain();
    osc.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0, now2);
    g.gain.linearRampToValueAtTime(0.18, now2 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now2 + 0.14);
    osc.start(now2);
    osc.stop(now2 + 0.18);
    // 3. Wet noise burst
    noiseBurst(0.10, {
      filterType: 'lowpass',
      filterFreq: 500 + Math.random() * 200,
      Q: 1.4,
      volume: 0.14,
    });
    // 4. Bone-crack — very short bright noise burst riding on top
    noiseBurst(0.04, {
      filterType: 'highpass',
      filterFreq: 2400 + Math.random() * 600,
      Q: 1.0,
      volume: 0.10,
    });
  }

  // Tire screech — short upward squeal. Throttled so prolonged carving
  // doesn't turn into a single drone.
  let lastScreechMs = 0;
  function tireScreech(intensity) {
    const now = performance.now();
    if (now - lastScreechMs < 110) return;
    lastScreechMs = now;
    const c = ensureCtx();
    if (!c || muted) return;
    const dur = 0.18 + Math.random() * 0.10;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const startF = 900 + Math.random() * 200;
    const endF   = startF + 250 + Math.random() * 200;
    osc.frequency.setValueAtTime(startF, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endF, c.currentTime + dur);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 3.5;
    const g = c.createGain();
    osc.connect(filter); filter.connect(g); g.connect(masterGain);
    const i = Math.max(0.3, Math.min(1, intensity || 0.5));
    const vol = 0.05 + 0.08 * i;
    const now2 = c.currentTime;
    g.gain.setValueAtTime(0, now2);
    g.gain.linearRampToValueAtTime(vol, now2 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now2 + dur);
    osc.start(now2);
    osc.stop(now2 + dur + 0.05);
  }

  // Jackpot-feed cha-ching — short coin clatter + a bright bell on top, for
  // when the pizza-truck drop bumps the persistent jackpot pool. Distinct
  // from plink (single bell) so the player hears the pool growing.
  function jackpotBump() {
    const c = ensureCtx();
    if (!c || muted) return;
    noiseBurst(0.12, {
      filterType: 'highpass',
      filterFreq: 3200,
      Q: 0.9,
      volume: 0.10,
    });
    plink(1318);
    setTimeout(() => plink(1976), 60);
  }

  // Jackpot-won cascade — ascending bell run that signals the splat-on-the-
  // 💰 character has been collected. Bigger than jackpotBump, lower-pitched
  // anchor so it lands like a payout, not a pickup.
  function jackpotWin() {
    const c = ensureCtx();
    if (!c || muted) return;
    const notes = [523, 659, 784, 1046, 1318, 1568, 2093];
    notes.forEach((f, i) => setTimeout(() => plink(f), i * 70));
    setTimeout(() => {
      tone(523, 0.5, { type: 'triangle', volume: 0.10 });
      tone(1046, 0.5, { type: 'sine',    volume: 0.07 });
    }, 100);
  }

  global.Sound = {
    click,
    spin,
    ballLand,
    carCrash,
    truckCrash,
    fireWhoosh,
    tireScreech,
    bodySplat,
    plink,
    jackpotBump,
    jackpotWin,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
