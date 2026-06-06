/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX AUDIO — WebAudio cantina voices for slot + matcher             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded) — AudioContext lazy-built on first voice call    │
  │                                                                          │
  │   ensureCtx() ──► AudioContext  (creates ctx + masterGain @ 0.4)         │
  │                                                                          │
  │   Primitives (all gated by muted flag):                                  │
  │     tone(freq, duration, opts?) ──► osc → gain envelope                  │
  │     pitchSweep(from, to, duration, opts?) ──► exp freq ramp              │
  │     noiseBurst(duration, opts?) ──► white noise → biquad filter          │
  │                                                                          │
  │   Cantina voices (slot.js / matcher.js call into these):                 │
  │     lever()        ──► SPIN — triple-shake maraca count-in               │
  │     steam(dur)     ──► rolling maraca shaker during the spin             │
  │     gearTick()     ──► castanet "tak" on tile select (throttled)         │
  │     gearEngage()   ──► 4-note ascending guitar strum on valid swap       │
  │     noMatch()      ──► sad trombone — three descending wah-wahs          │
  │     dud()          ──► slumping mariachi trumpet on no-payline spin      │
  │     clear(length)  ──► mariachi flourish — escalates with blob size      │
  │     payout(amount) ──► trumpet fanfare, scales with log(amount)          │
  │     setMuted(m)    ──► toggle muted flag                                 │
  │     isMuted()      ──► bool                                              │
  │                                                                          │
  │   Module state: ctx, masterGain, muted, lastTickMs (throttle for         │
  │   gearTick so rapid clicks don't stack)                                  │
  │                                                                          │
  │   Exports (window.MatchboxAudio): { lever, steam, gearTick, gearEngage,  │
  │     noMatch, dud, clear, payout, setMuted, isMuted }                     │
  │   External deps: WebAudio API (AudioContext / webkitAudioContext),       │
  │                  performance.now (throttle)                              │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F, lastTickMs=0
  ensureCtx()→ctx|null: lazy new (AudioContext||webkitAudioContext); masterGain=gain@0.4→destination; suspended→resume; ret ctx
  tone(f,d,opts={})→void: c=ensure; guard(!c||muted); osc(opts.type||'square',f,detune?); g; osc→g→master; vol=opts.volume??0.18; att=opts.attack||0.005; env 0→vol@att→exp .001@d; start now stop d+0.05
  pitchSweep(from,to,d,opts={})→void: similar; freq.setVal(from)→expRamp(max(.01,to))@d
  noiseBurst(d,opts={})→void: buf=sampleRate*d white noise; src→biquad(opts.filterType||'bandpass',opts.filterFreq||1500,Q=opts.Q||4)→g→master; env+start/stop
  lever(): 3 HP noiseBursts @ 3kHz at t=0/60/130ms, last accent louder — maraca count-in shake
  steam(dur=1.2): noiseBurst(dur,bp@3500,Q=1.5,.05) body + rhythmic HP@3200 accents every 100ms
  gearTick(): throttle 22ms; noiseBurst(.03,bp@5500+rnd*1000,Q=2,.10) — castanet click
  gearEngage(): 4-note ascending strum [196,247,294,392]Hz triangle+sine 18ms apart
  noMatch(): pitchSweep 220→165 saw .18s, 165→110 .20s, 110→70 .30s — wah-wah-wah
  dud(): pitchSweep 330→165 square .55s + 660→330 triangle .55s — descending sad trumpet
  clear(L): L<4→maraca tap noiseBurst .05; L=4→sine+triangle bell 659+1319; L=5→trumpet arpeggio [523,659,784]; L≥6→4-note arpeggio [523,659,784,1046] + bp@1200 ¡olé! cheer
  payout(amount): n=clamp(3,7,floor(log2(amount))+2); ∀i∈[0..n) setTimeout(i*75) trumpet square+triangle through fanfare [392,494,523,659,784,880,1046]
  exports: global.MatchboxAudio={lever,steam,gearTick,gearEngage,noMatch,dud,clear,payout,setMuted(m){muted=m},isMuted()→muted}
  no DOMContentLoaded; ctx lazy on first voice
*/
(function (global) {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let lastTickMs = 0;

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

  // ───── Cantina voices ─────

  // SPIN — maraca count-in. Three quick rattles, last one accented louder.
  function lever() {
    noiseBurst(0.06, { filterType: 'highpass', filterFreq: 3000, Q: 0.7, volume: 0.16 });
    setTimeout(() => {
      noiseBurst(0.06, { filterType: 'highpass', filterFreq: 3200, Q: 0.7, volume: 0.16 });
    }, 60);
    setTimeout(() => {
      noiseBurst(0.10, { filterType: 'highpass', filterFreq: 2800, Q: 0.7, volume: 0.21 });
    }, 130);
  }

  // Rolling maraca over the reel animation. Sustained bandpass body + a
  // staccato highpass accent every 100ms so the shake has a heartbeat.
  function steam(duration) {
    const dur = duration || 1.2;
    noiseBurst(dur, { filterType: 'bandpass', filterFreq: 3500, Q: 1.5, volume: 0.05 });
    const totalMs = Math.floor(dur * 1000);
    for (let t = 60; t < totalMs - 60; t += 100) {
      setTimeout(() => {
        noiseBurst(0.04, { filterType: 'highpass', filterFreq: 3200, Q: 0.7, volume: 0.08 });
      }, t);
    }
  }

  // Tile select — castanet "tak". Throttled so rapid clicks don't stack
  // into a buzz. Jittered freq gives each click a slightly different voice.
  function gearTick() {
    const now = performance.now();
    if (now - lastTickMs < 22) return;
    lastTickMs = now;
    const freq = 5500 + Math.random() * 1000;
    noiseBurst(0.03, { filterType: 'bandpass', filterFreq: freq, Q: 2, volume: 0.10 });
  }

  // Valid swap — 4-note ascending guitar strum (G3-B3-D4-G4 open chord,
  // 18ms between plucks for a quick wrist-flick feel).
  function gearEngage() {
    const notes = [196, 247, 294, 392];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq, 0.40, { type: 'triangle', volume: 0.09, attack: 0.001 });
        tone(freq * 2, 0.30, { type: 'sine', volume: 0.04, attack: 0.001 });
      }, i * 18);
    });
  }

  // Invalid swap — classic sad-trombone wah-wah-wah. Three descending
  // sawtooth slides, each picking up where the last left off.
  function noMatch() {
    pitchSweep(220, 165, 0.18, { type: 'sawtooth', volume: 0.10 });
    setTimeout(() => pitchSweep(165, 110, 0.20, { type: 'sawtooth', volume: 0.09 }), 180);
    setTimeout(() => pitchSweep(110,  70, 0.30, { type: 'sawtooth', volume: 0.09 }), 380);
  }

  // No-payline spin — slumping mariachi trumpet. Square fundamental + an
  // octave triangle, both descending half an octave over the half-second.
  function dud() {
    pitchSweep(330, 165, 0.55, { type: 'square',   volume: 0.11 });
    pitchSweep(660, 330, 0.55, { type: 'triangle', volume: 0.05 });
  }

  // Winning slot spin — quick rising mariachi triplet (C E G) plus a high
  // crowning bell ping. Fires the moment the player sees their hit, before
  // moves transfer to the matcher.
  function slotHit() {
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq,     0.20, { type: 'square',   volume: 0.13, attack: 0.005 });
        tone(freq * 2, 0.14, { type: 'triangle', volume: 0.06, attack: 0.01 });
      }, i * 70);
    });
    setTimeout(() => {
      tone(1046, 0.36, { type: 'sine',     volume: 0.11, attack: 0.02 });
      tone(2093, 0.28, { type: 'triangle', volume: 0.05, attack: 0.03 });
    }, 220);
  }

  // Successful match — mariachi flourish. Voice escalates with run length:
  //   L<4  → quiet maraca tap (feedback only, no payout)
  //   L=4  → 2-note festival-bell chime
  //   L=5  → 3-note trumpet arpeggio (C major: C-E-G)
  //   L≥6  → 4-note trumpet arpeggio + cantina "¡olé!" cheer
  function clear(length) {
    if (length < 4) {
      noiseBurst(0.05, { filterType: 'bandpass', filterFreq: 3500, Q: 1.5, volume: 0.08 });
      return;
    }
    if (length === 4) {
      tone(659,  0.40, { type: 'sine',     volume: 0.13, attack: 0.01 });
      tone(1319, 0.30, { type: 'triangle', volume: 0.08, attack: 0.02 });
      return;
    }
    if (length === 5) {
      const notes = [523, 659, 784];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          tone(freq,     0.40, { type: 'square',   volume: 0.12, attack: 0.02 });
          tone(freq * 2, 0.30, { type: 'triangle', volume: 0.05, attack: 0.03 });
        }, i * 80);
      });
      return;
    }
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq,     0.55, { type: 'square',   volume: 0.14, attack: 0.02 });
        tone(freq * 2, 0.40, { type: 'triangle', volume: 0.07, attack: 0.03 });
      }, i * 65);
    });
    setTimeout(() => {
      noiseBurst(0.40, { filterType: 'bandpass', filterFreq: 1200, Q: 0.5, volume: 0.08 });
    }, notes.length * 65 + 50);
  }

  // Payout — trumpet fanfare. Ascending notes through the mariachi scale;
  // count scales with log(amount) so a 1×wager hit still gets a few notes
  // and a big jackpot rings out the full octave.
  function payout(amount) {
    if (!amount || amount <= 0) return;
    const fanfare = [392, 494, 523, 659, 784, 880, 1046];
    const n = Math.max(3, Math.min(7, Math.floor(Math.log2(Math.max(2, amount))) + 2));
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const freq = fanfare[i % fanfare.length];
        tone(freq,     0.18, { type: 'square',   volume: 0.11, attack: 0.005 });
        tone(freq * 2, 0.12, { type: 'triangle', volume: 0.04, attack: 0.01 });
      }, i * 75);
    }
  }

  global.MatchboxAudio = {
    lever,
    steam,
    gearTick,
    gearEngage,
    noMatch,
    dud,
    slotHit,
    clear,
    payout,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
