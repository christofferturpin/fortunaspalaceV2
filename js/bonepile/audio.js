/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BONEPILE / LOTTAUTO — WebAudio voice bank for the scratcher cabinet     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded)  ─ AudioContext lazy-built on first call         │
  │                                                                          │
  │   Primitives:                                                            │
  │     tone(freq,dur,opts?)        ──► osc → gain env                       │
  │     sweep(from,to,dur,opts?)    ──► osc + exp freq ramp                  │
  │     noise(dur,opts?)            ──► white-noise buffer → biquad → gain   │
  │                                                                          │
  │   Voices (called by js/bonepile/scratch.js):                             │
  │     print()         ──► mechanical klunk + paper ssh (BUY)              │
  │     scratchTick(s)  ──► throttled foil-rub hiss (pointermove)            │
  │     revealDie()     ──► soft mid blip when a die is uncovered           │
  │     pair(face)      ──► cha-ching ding (each pair-equivalent earned)     │
  │     combo(n)        ──► rising arpeggio for 3+ of a kind                 │
  │     bust()          ──► alarm sweep-down + low rumble                    │
  │     cashout()       ──► register: two-tap + bell shimmer                 │
  │     sweepFloor()    ──► broom whoosh                                     │
  │     rubScoop()      ──► ascending vacuum hum for ~1s                     │
  │     rubSparkle()    ──► 4-note ascending chime                           │
  │     greet()         ──► pixel-attendant blip                             │
  │     setMuted(m), isMuted()                                               │
  │                                                                          │
  │   Exports: window.BonepileSound                                          │
  │   External deps: WebAudio API                                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, master=null, muted=F, lastScratchMs=0, lastTickFreq=2400
  ensureCtx()→ctx|null: lazy AC; master gain @ .35 → dest; resume if suspended
  tone(freq,dur,opts={}): osc(type||'sine')→g→master; env 0→vol@attack→exp .001@dur
  sweep(from,to,dur,opts={}): osc(type||'sawtooth')→g; freq set→expRamp(to)@dur; env as tone
  noise(dur,opts={}): bufSz=sampleRate*dur fill[-1..1]; src→biquad(filter,freq,Q)→g→master; env
  print(): tone(180,.05,sq,.18); tone(120,.07,sq,.12,attack=.001);
    +noise(.22,lp@1400,vol=.06); +tone(540,.07,tri,.06)@40ms
  scratchTick(strength=1): throttle now-last<55→ret; jittered hp noise
    (.04-.08 dur), filterFreq 2000+rnd*2500; vol .03*strength
  revealDie(): tone(660+rnd*220,.07,sine,.06,attack=.002)
  pair(face=4): tone(880,.05,sq,.1); tone(440+face*120,.18,sine,.08)@30ms;
    tone(1760,.18,sine,.04)@30ms
  combo(n): arp=[523,659,784,1046,1318,1568,1976]; k=min(n,7);
    ∀i<k setTimeout(tone(arp[i],.13,tri,.1+i*.01),i*60)
  bust(): sweep(880,90,.65,saw,.22); +noise(.5,bp@220,Q=1,.12);
    +tone(60,.5,sq,.08)@80ms
  cashout(): tone(880,.08,sq,.13); tone(1320,.08,sq,.12)@70ms;
    noise(.32,bp@5200,Q=2,.07)@140ms; tone(1760,.22,sine,.06)@140ms
  sweepFloor(): noise(.55,bp@1300,Q=1,.09); sweep(2200,420,.55,tri,.05)
  rubScoop(): sweep(110,520,.95,saw,.12); noise(.95,lp@700,vol=.1);
    +noise(.95,hp@1800,vol=.04) @0
  rubSparkle(): notes=[1568,1976,2349,2637]; ∀i tone(notes[i],.2,sine,.09)@i*80;
    +noise(.4,hp@6000,Q=.7,.04)@320
  greet(): tone(560,.04,sq,.08); tone(740,.04,sq,.05)@40ms
  exports: global.BonepileSound={print,scratchTick,revealDie,pair,combo,
    bust,cashout,sweepFloor,rubScoop,rubSparkle,greet,setMuted,isMuted}
*/

(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let lastScratchMs = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    osc.connect(g); g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.14 : opts.volume;
    const attack = opts.attack == null ? 0.005 : opts.attack;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.04);
  }

  function sweep(from, to, dur, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sawtooth';
    osc.connect(g); g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.12 : opts.volume;
    osc.frequency.setValueAtTime(Math.max(0.01, from), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, to), now + dur);
    const attack = opts.attack == null ? 0.005 : opts.attack;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function noise(dur, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const biq = c.createBiquadFilter();
    biq.type = opts.filter || 'bandpass';
    biq.frequency.value = opts.freq || 1500;
    biq.Q.value = opts.Q == null ? 1 : opts.Q;
    const g = c.createGain();
    src.connect(biq); biq.connect(g); g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.08 : opts.volume;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.start(now);
    src.stop(now + dur + 0.04);
  }

  // ───── voices ──────────────────────────────────────────────────────
  function print() {
    tone(180, 0.05, { type: 'square', volume: 0.18 });
    tone(120, 0.07, { type: 'square', volume: 0.12, attack: 0.001 });
    noise(0.22, { filter: 'lowpass', freq: 1400, volume: 0.06 });
    setTimeout(function () { tone(540, 0.07, { type: 'triangle', volume: 0.06 }); }, 40);
  }

  function scratchTick(strength) {
    const now = performance.now();
    if (now - lastScratchMs < 55) return;
    lastScratchMs = now;
    const s = strength == null ? 1 : Math.max(0.3, Math.min(2, strength));
    noise(0.04 + Math.random() * 0.04, {
      filter: 'highpass',
      freq: 2000 + Math.random() * 2500,
      Q: 0.6,
      volume: 0.035 * s,
    });
  }

  function revealDie() {
    tone(640 + Math.random() * 220, 0.07, {
      type: 'sine', volume: 0.06, attack: 0.002,
    });
  }

  function pair(face) {
    const f = face || 4;
    tone(880, 0.05, { type: 'square', volume: 0.10 });
    setTimeout(function () {
      tone(440 + f * 120, 0.18, { type: 'sine', volume: 0.08 });
      tone(1760, 0.18, { type: 'sine', volume: 0.04 });
    }, 28);
  }

  function combo(n) {
    const arp = [523, 659, 784, 1046, 1318, 1568, 1976];
    const k = Math.min(n || 3, arp.length);
    for (let i = 0; i < k; i++) {
      const v = 0.10 + i * 0.012;
      const f = arp[i];
      setTimeout(function () { tone(f, 0.13, { type: 'triangle', volume: v }); }, i * 60);
    }
  }

  function bust() {
    sweep(880, 90, 0.65, { type: 'sawtooth', volume: 0.22 });
    noise(0.5, { filter: 'bandpass', freq: 220, Q: 1, volume: 0.12 });
    setTimeout(function () {
      tone(60, 0.5, { type: 'square', volume: 0.08, attack: 0.001 });
    }, 80);
  }

  function cashout() {
    tone(880, 0.08, { type: 'square', volume: 0.13 });
    setTimeout(function () { tone(1320, 0.08, { type: 'square', volume: 0.12 }); }, 70);
    setTimeout(function () {
      noise(0.32, { filter: 'bandpass', freq: 5200, Q: 2, volume: 0.07 });
      tone(1760, 0.22, { type: 'sine', volume: 0.06 });
    }, 140);
  }

  function sweepFloor() {
    noise(0.55, { filter: 'bandpass', freq: 1300, Q: 1, volume: 0.09 });
    sweep(2200, 420, 0.55, { type: 'triangle', volume: 0.05 });
  }

  function rubScoop() {
    sweep(110, 520, 0.95, { type: 'sawtooth', volume: 0.12 });
    noise(0.95, { filter: 'lowpass', freq: 700, volume: 0.10 });
    noise(0.95, { filter: 'highpass', freq: 1800, volume: 0.04 });
  }

  function rubSparkle() {
    const notes = [1568, 1976, 2349, 2637];
    for (let i = 0; i < notes.length; i++) {
      const f = notes[i];
      setTimeout(function () {
        tone(f, 0.20, { type: 'sine', volume: 0.09 });
      }, i * 80);
    }
    setTimeout(function () {
      noise(0.4, { filter: 'highpass', freq: 6000, Q: 0.7, volume: 0.04 });
    }, 320);
  }

  function greet() {
    tone(560, 0.04, { type: 'square', volume: 0.08 });
    setTimeout(function () { tone(740, 0.04, { type: 'square', volume: 0.05 }); }, 40);
  }

  global.BonepileSound = {
    print: print,
    scratchTick: scratchTick,
    revealDie: revealDie,
    pair: pair,
    combo: combo,
    bust: bust,
    cashout: cashout,
    sweepFloor: sweepFloor,
    rubScoop: rubScoop,
    rubSparkle: rubSparkle,
    greet: greet,
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
  };
})(window);
