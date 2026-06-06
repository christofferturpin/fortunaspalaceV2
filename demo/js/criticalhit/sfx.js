/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRITICAL HIT SFX — Web Audio synth library (no media files)             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (IIFE on load) ──► window.CritSFX                                      │
  │                                                                          │
  │   Internal primitives:                                                   │
  │     getCtx()     ──► AudioContext | null (lazy + resume)                 │
  │     tone(opts)   ──► osc + gain envelope (optional pitchEnd ramp)        │
  │     noise(opts)  ──► buffer noise + bandpass filter + envelope           │
  │                                                                          │
  │   Public surface (window.CritSFX):                                       │
  │     startDiceRoll() / stopDiceRoll()                                     │
  │       ── ref-counted noise loop while any die is tumbling                │
  │     diceLand()    ── short pitch-drop thud when a die settles            │
  │     merge()       ── 3-note ascending chime when two dice combine        │
  │     holdClick()   ── soft tick on hold-toggle                            │
  │     deal()        ── round-start whoosh (noise + pitch drop)             │
  │     win()         ── major chord chime on a winning cash-out             │
  │     bust()        ── sad descending tones on <8 score                    │
  │     crit()        ── triumphant flourish for ×20 tier (overrides win)    │
  │                                                                          │
  │   Exports: window.CritSFX                                                │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ctx: lazy AudioContext (created on first sound, resumed if suspended)
  tone({freq,type,dur,gain,attack,pitchEnd,when})→void
  noise({dur,gain,freq,Q,when})→void  (bandpassed white noise)
  rollLoopRefs=0; rollLoopId=0  (ref-counted setInterval for tumble noise)
  startDiceRoll: refs++; if refs===1→tick + setInterval(tick,80)
  stopDiceRoll:  refs--; if refs===0→clearInterval
  diceLand:  220→110 square + low noise
  merge:     440, 660, 880 stacked at +80ms steps
  holdClick: 880→1100 square 40ms
  deal:      noise whoosh 350ms + saw 600→200
  win:       523/659/784 sine cascade
  bust:      330→260 + 196→130 saw, +150ms gap
  crit:      523/659/784/1047 cascade + 880 triangle bell
  exports: global.CritSFX={start/stopDiceRoll, diceLand, merge, holdClick,
    deal, win, bust, crit}
*/
(function (global) {
  'use strict';

  let ctx = null;
  function getCtx() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* ignore */ }
      }
      return ctx;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    return ctx;
  }

  function tone(opts) {
    const c = getCtx();
    if (!c) return;
    const o = opts || {};
    const freq      = o.freq      || 440;
    const type      = o.type      || 'sine';
    const dur       = o.dur       || 0.15;
    const gain      = o.gain      || 0.16;
    const attack    = o.attack    || 0.005;
    const pitchEnd  = o.pitchEnd  || null;
    const whenDelay = o.when      || 0;
    const t0 = c.currentTime + whenDelay;
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (pitchEnd) {
      try { osc.frequency.exponentialRampToValueAtTime(pitchEnd, t0 + dur); }
      catch (e) { osc.frequency.linearRampToValueAtTime(pitchEnd, t0 + dur); }
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(opts) {
    const c = getCtx();
    if (!c) return;
    const o = opts || {};
    const dur       = o.dur  || 0.08;
    const gain      = o.gain || 0.12;
    const freq      = o.freq || 1200;
    const Q         = o.Q    || 1;
    const whenDelay = o.when || 0;
    const t0 = c.currentTime + whenDelay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = Q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  let rollLoopRefs = 0;
  let rollLoopId   = 0;

  global.CritSFX = {
    startDiceRoll: function () {
      rollLoopRefs += 1;
      if (rollLoopRefs > 1) return;
      const tick = function () {
        noise({ dur: 0.07, gain: 0.10, freq: 1800, Q: 0.8 });
      };
      tick();
      rollLoopId = setInterval(tick, 80);
    },
    stopDiceRoll: function () {
      rollLoopRefs = Math.max(0, rollLoopRefs - 1);
      if (rollLoopRefs > 0) return;
      if (rollLoopId) {
        clearInterval(rollLoopId);
        rollLoopId = 0;
      }
    },
    diceLand: function () {
      tone({ freq: 220, type: 'square', dur: 0.10, gain: 0.10, pitchEnd: 110 });
      noise({ dur: 0.05, gain: 0.12, freq: 220, Q: 0.5 });
    },
    merge: function () {
      tone({ freq: 440, type: 'sine', dur: 0.10, gain: 0.13 });
      tone({ freq: 660, type: 'sine', dur: 0.10, gain: 0.13, when: 0.08 });
      tone({ freq: 880, type: 'sine', dur: 0.18, gain: 0.15, when: 0.16 });
    },
    holdClick: function () {
      tone({ freq: 880, type: 'square', dur: 0.04, gain: 0.08, pitchEnd: 1100 });
    },
    deal: function () {
      noise({ dur: 0.32, gain: 0.13, freq: 800, Q: 0.6 });
      tone({ freq: 600, type: 'sawtooth', dur: 0.25, gain: 0.10, pitchEnd: 200 });
    },
    win: function () {
      tone({ freq: 523, type: 'sine', dur: 0.30, gain: 0.16 });
      tone({ freq: 659, type: 'sine', dur: 0.30, gain: 0.16, when: 0.06 });
      tone({ freq: 784, type: 'sine', dur: 0.40, gain: 0.16, when: 0.12 });
    },
    bust: function () {
      tone({ freq: 330, type: 'sawtooth', dur: 0.18, gain: 0.12, pitchEnd: 260 });
      tone({ freq: 196, type: 'sawtooth', dur: 0.40, gain: 0.14, pitchEnd: 130, when: 0.15 });
    },
    crit: function () {
      tone({ freq: 523, type: 'sine', dur: 0.18, gain: 0.13 });
      tone({ freq: 659, type: 'sine', dur: 0.18, gain: 0.13, when: 0.06 });
      tone({ freq: 784, type: 'sine', dur: 0.18, gain: 0.13, when: 0.12 });
      tone({ freq: 1047, type: 'sine', dur: 0.50, gain: 0.18, when: 0.20 });
      tone({ freq: 880, type: 'triangle', dur: 0.80, gain: 0.09, when: 0.20 });
    },
  };
})(window);
