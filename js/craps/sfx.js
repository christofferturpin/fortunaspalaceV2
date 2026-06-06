/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRAPS SFX  —  Web Audio synth library for the craps + putt minigame     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (IIFE on load) ──► defines window.SFX                                  │
  │                                                                          │
  │   Internal primitives:                                                   │
  │     getCtx()                ──► AudioContext | null  (lazy + resume)     │
  │     tone({freq,type,dur,gain,attack,pitchEnd,when}) ──► void  (osc env)  │
  │     noise({dur,gain,type,freq,Q,when})              ──► void  (buf+filt) │
  │                                                                          │
  │   Public surface (window.SFX):                                           │
  │     pickChip()       ──► tone + noise  (tile click)                      │
  │     startDiceRoll()  ──► setInterval(noise, 65ms)  (loop id stored)      │
  │     stopDiceRoll()   ──► clearInterval                                   │
  │     diceLand()       ──► tone(pitch-drop) + noise                        │
  │     putt()           ──► tone(pitch-drop) + noise  (ball struck)         │
  │     wallHit()        ──► tone  (rate-limited 70ms via lastWallHit)       │
  │     sink()           ──► 3-tone ascending chime                          │
  │     miss()           ──► tone(downward sigh)                             │
  │     win()            ──► 3-tone fanfare                                  │
  │     loss()           ──► 2 overlapping sawtooth descents                 │
  │                                                                          │
  │   Exports: window.SFX (object of named SFX functions)                    │
  │   External deps: Web Audio API (AudioContext / webkitAudioContext),      │
  │                  performance.now (wall-hit throttle)                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, master=null, lastWallHit=0, rollLoopId=null
  getCtx()→AudioCtx|null: lazy init (AC=AudioContext||webkit); master=gain(0.6)→destination; if suspended→resume; ret ctx
  tone({freq=440,type=sine,dur=.1,gain=.15,attack=.004,pitchEnd,when=0}): t0=cur+when; osc.freq=freq@t0; pitchEnd→expRamp(pitchEnd,t0+dur); g: 0→gain(attack), expRamp(.001,t0+dur); osc→g→master; start/stop
  noise({dur=.08,gain=.1,type=lowpass,freq=800,Q=1,when=0}): t0; buf=rand[-1,1]×len; src→biquad(type,freq,Q)→g(gain→.001 exp)→master
  SFX.pickChip(): tone(1200,square,.025,.06)+noise(.02,.04,highpass,2000)
  SFX.startDiceRoll(): guard rollLoopId; tick=noise(.05,.05,bandpass,1600,Q1.4); tick(); rollLoopId=setInterval(tick,65)
  SFX.stopDiceRoll(): clearInterval; rollLoopId=null
  SFX.diceLand(): tone(160→70,sine,.08,.16)+noise(.05,.07,lowpass,400)
  SFX.putt(): tone(240→110,tri,.06,.18)+noise(.03,.05,lowpass,600)
  SFX.wallHit(): rate-limit 70ms via lastWallHit; tone(180→90,tri,.04,.09)
  SFX.sink(): 3 sine tones C5/G5/C6 @ 0/.07/.14s
  SFX.miss(): tone(260→130,saw,.18,.07)
  SFX.win(): 3 sine tones C5/E5/A5 @ 0/.10/.20s, dur .12/.12/.20
  SFX.loss(): 2 saw tones 230→110 + 200→90, dur .38, when 0/.05
  exports: window.SFX={pickChip,startDiceRoll,stopDiceRoll,diceLand,putt,wallHit,sink,miss,win,loss}; IIFE on load
*/

(function () {
  // Web Audio synth — no asset files. Calls are guarded so the game still runs
  // if AudioContext is unavailable. First call resumes the context (some
  // browsers suspend until user gesture).

  let ctx = null;
  let master = null;
  let lastWallHit = 0;
  let rollLoopId = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(opts) {
    const c = getCtx();
    if (!c) return;
    const {
      freq = 440, type = 'sine', dur = 0.1, gain = 0.15,
      attack = 0.004, pitchEnd, when = 0,
    } = opts;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (pitchEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, pitchEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(opts) {
    const c = getCtx();
    if (!c) return;
    const {
      dur = 0.08, gain = 0.1, type = 'lowpass', freq = 800, Q = 1, when = 0,
    } = opts;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = Q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  window.SFX = {
    // Tile click — short typewriter peck.
    pickChip() {
      tone({ freq: 1200, type: 'square', dur: 0.025, gain: 0.06 });
      noise({ dur: 0.02, gain: 0.04, type: 'highpass', freq: 2000 });
    },

    // Looped rattle while the dice tumble. Call stopDiceRoll() to end it.
    startDiceRoll() {
      if (rollLoopId) return;
      const tick = () => {
        noise({ dur: 0.05, gain: 0.05, type: 'bandpass', freq: 1600, Q: 1.4 });
      };
      tick();
      rollLoopId = setInterval(tick, 65);
    },
    stopDiceRoll() {
      if (rollLoopId) { clearInterval(rollLoopId); rollLoopId = null; }
    },

    // One die landing — wooden thunk.
    diceLand() {
      tone({ freq: 160, pitchEnd: 70, type: 'sine', dur: 0.08, gain: 0.16 });
      noise({ dur: 0.05, gain: 0.07, type: 'lowpass', freq: 400 });
    },

    // Putt — the ball being struck. Short woody knock.
    putt() {
      tone({ freq: 240, pitchEnd: 110, type: 'triangle', dur: 0.06, gain: 0.18 });
      noise({ dur: 0.03, gain: 0.05, type: 'lowpass', freq: 600 });
    },

    // Ball bouncing off a wall. Rate-limited to avoid machine-gun stutter
    // when the ball is bouncing rapidly between two walls.
    wallHit() {
      const now = performance.now();
      if (now - lastWallHit < 70) return;
      lastWallHit = now;
      tone({ freq: 180, pitchEnd: 90, type: 'triangle', dur: 0.04, gain: 0.09 });
    },

    // Ball drops in. Quick ascending three-note chime.
    sink() {
      tone({ freq: 523, type: 'sine', dur: 0.08, gain: 0.14, when: 0.00 });
      tone({ freq: 784, type: 'sine', dur: 0.08, gain: 0.14, when: 0.07 });
      tone({ freq: 1047, type: 'sine', dur: 0.14, gain: 0.16, when: 0.14 });
    },

    // Ball stopped without sinking. Short downward sigh.
    miss() {
      tone({ freq: 260, pitchEnd: 130, type: 'sawtooth', dur: 0.18, gain: 0.07 });
    },

    // Round won with payout. Slightly bigger fanfare.
    win() {
      tone({ freq: 523, type: 'sine', dur: 0.12, gain: 0.18, when: 0.00 });
      tone({ freq: 659, type: 'sine', dur: 0.12, gain: 0.18, when: 0.10 });
      tone({ freq: 880, type: 'sine', dur: 0.20, gain: 0.20, when: 0.20 });
    },

    // Round lost / wager gone. Sad descending fluorescent buzz.
    loss() {
      tone({ freq: 230, pitchEnd: 110, type: 'sawtooth', dur: 0.38, gain: 0.11 });
      tone({ freq: 200, pitchEnd: 90, type: 'sawtooth', dur: 0.38, gain: 0.08, when: 0.05 });
    },
  };
})();
