/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  RAID / AUDIO — procedural Web Audio SFX for the sweep                   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   RaidAudio.<event>() ──► one-shot synth voice → AudioContext.dest       │
  │                  │                                                       │
  │                  ├─ weapon(id) ──► gunshot/bat/MG by weapon              │
  │                  ├─ place(id)   ──► breach sound (low thunk + click)     │
  │                  ├─ move()       ──► low footstep thump                  │
  │                  ├─ flee()       ──► short hiss / panic whoosh           │
  │                  ├─ escape()     ──► ascending chime sweep               │
  │                  ├─ startle()    ──► tiny high blip                      │
  │                  ├─ cops()       ──► police siren warble (~0.7s)         │
  │                  ├─ copShot()    ──► sharp high-freq sidearm shot        │
  │                  ├─ atkDown()    ──► descending death tone               │
  │                  ├─ barricade()  ──► heavy wooden thud                   │
  │                  ├─ breakthrough()──► splintering crack                  │
  │                  └─ clear()      ──► low drone + bell                    │
  │                                                                          │
  │   AudioContext is lazy-allocated on first call; user-gesture unlock      │
  │   handled by the page's own button clicks. All voices are short          │
  │   (<300ms typical) so simultaneous events naturally layer.               │
  │                                                                          │
  │   Exports (window.RaidAudio): { weapon, place, move, flee, escape,       │
  │     startle, cops, copShot, atkDown, barricade, breakthrough, clear,     │
  │     setEnabled }                                                         │
  │   External deps: Web Audio API                                           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, enabled=T
  ensure()→ctx|null: ctx||new AudioContext; suspended? ctx.resume; ret ctx
  noise(dur,filterHz,gain,decay=0.4): buffer w/ exp-decay rnd → lowpass → gain → dest
  tone(freq,dur,gain,type='sine',sweepTo?): osc + linRamp(freq→sweepTo) + expGain
  weapon(id):
    'pistol'      → noise(0.14, 2000, 0.34)
    'revolver'    → noise(0.18, 1400, 0.40)
    'shotgun'     → noise(0.28,  900, 0.55)
    'machinegun'  → 4× noise(0.07,1800,0.30) spaced 0.06s
    'bat'         → tone(80,0.15,0.45,'sine') + noise(0.06,400,0.20)
  place(id): noise(0.10,500,0.18) + tone(160,0.10,0.25,'sine')
  move(): tone(95,0.08,0.22,'sine')
  flee(): noise(0.20,1500,0.18,decay=0.3)
  escape(): tone(520,0.22,0.28,'sine',sweepTo=940)
  startle(): tone(1400,0.06,0.28,'triangle')
  cops(): square(800)+square(1100)+square(800)+square(1100) staggered 180ms
  copShot(): noise(0.10,2500,0.30) — sharper, briefer
  atkDown(): tone(220,0.4,0.28,'sine',sweepTo=80)
  barricade(): tone(90,0.18,0.4,'sine') + noise(0.08,250,0.22)
  breakthrough(): noise(0.22,1200,0.4) + tone(150,0.18,0.3,'triangle',sweepTo=60)
  clear(): tone(110)+tone(440)+after 220ms tone(660)
  setEnabled(b): enabled=b
  exports: global.RaidAudio={...all events,setEnabled}
*/
(function (global) {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  function noise(dur, filterHz, gain, decay) {
    const c = ensure(); if (!c) return;
    if (decay == null) decay = 0.4;
    const t = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * decay));
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filterHz;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t);
  }

  function tone(freq, dur, gain, type, sweepTo) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo != null) {
      osc.frequency.linearRampToValueAtTime(sweepTo, t + dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function weapon(id) {
    if (!enabled) return;
    switch (id) {
      case 'pistol':     noise(0.14, 2000, 0.34); break;
      case 'revolver':   noise(0.18, 1400, 0.40); break;
      case 'shotgun':    noise(0.28, 900, 0.55); break;
      case 'machinegun':
        for (let i = 0; i < 4; i++) {
          setTimeout(() => noise(0.07, 1800, 0.30), i * 60);
        }
        break;
      case 'bat':
        tone(80, 0.15, 0.45, 'sine');
        noise(0.06, 400, 0.20);
        break;
      default: noise(0.14, 2000, 0.32);
    }
  }

  function place()   { noise(0.10, 500, 0.18); tone(160, 0.10, 0.25, 'sine'); }
  function move()    { tone(95, 0.08, 0.22, 'sine'); }
  function flee()    { noise(0.20, 1500, 0.18, 0.3); }
  function escape()  { tone(520, 0.22, 0.28, 'sine', 940); }
  function startle() { tone(1400, 0.06, 0.28, 'triangle'); }

  function cops() {
    tone(800, 0.18, 0.22, 'square');
    setTimeout(() => tone(1100, 0.18, 0.22, 'square'), 180);
    setTimeout(() => tone(800, 0.18, 0.22, 'square'), 360);
    setTimeout(() => tone(1100, 0.18, 0.22, 'square'), 540);
  }
  function copShot()  { noise(0.10, 2500, 0.30); }
  function atkDown()  { tone(220, 0.4, 0.28, 'sine', 80); }
  function barricade(){ tone(90, 0.18, 0.40, 'sine'); noise(0.08, 250, 0.22); }
  function breakthrough() {
    noise(0.22, 1200, 0.40);
    tone(150, 0.18, 0.30, 'triangle', 60);
  }

  function clear() {
    tone(110, 1.4, 0.18, 'sine');
    tone(440, 1.4, 0.16, 'sine');
    setTimeout(() => tone(660, 0.9, 0.14, 'sine'), 220);
  }

  function setEnabled(b) { enabled = !!b; }

  global.RaidAudio = {
    weapon, place, move, flee, escape, startle,
    cops, copShot, atkDown, barricade, breakthrough, clear,
    setEnabled
  };
})(typeof window !== 'undefined' ? window : globalThis);
