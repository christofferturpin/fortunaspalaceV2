/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  TAROT AUDIO  —  WebAudio synth voices for the tarot interactions        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   ensureCtx() ──► AudioContext (lazy, master @ 0.35)                     │
  │     └─ resume on first call (Chrome autoplay gate)                       │
  │                                                                          │
  │   Primitives (gated by muted):                                           │
  │     tone(freq, dur, opts?)                — osc + gain envelope          │
  │     pitchSweep(from, to, dur, opts?)      — exp ramp                     │
  │     noiseBurst(dur, opts?)                — white noise → biquad         │
  │                                                                          │
  │   Public voices (window.TarotSound):                                     │
  │     click()    — UI/deck click                                           │
  │     shuffle()  — soft swirl, called once per shuffle pulse               │
  │     deal()     — thunk as a card lands in its slot                       │
  │     flip()     — short pitch-sweep swish                                 │
  │     coin()     — bright bell ding (shuffle-bonus reward)                 │
  │     mash()     — bass swell + glitch noise for the final reveal          │
  │     book()     — page-rustle whoosh                                      │
  │     setMuted(m) / isMuted()                                              │
  │                                                                          │
  │   Exports: window.TarotSound                                             │
  │   External deps: WebAudio API                                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, master=null, muted=F
  ensureCtx()→ctx|null: lazy AC; master=gain@0.35→destination; resume if suspended
  tone(f,dur,opts={}): osc(type||'square',f)→g→master; env 0→vol@attack→exp.001@dur
  pitchSweep(f0,f1,dur,opts={}): osc(type||'sawtooth')→g; freq.setVal(f0)→expRamp(f1)@dur
  noiseBurst(dur,opts={}): bufSz=sampleRate*dur fill[-1,1]; src→biquad(type||'bandpass')→g→master
  click: tone(220,.04,sq,.18); tone(140,.05,sq,.10,attack=.001)
  shuffle: noiseBurst(.18, bp@1800, Q=2, .07) + tone(660,.05,tri,.05)
  deal:   tone(140,.10,sine,.16,attack=.003) + tone(95,.08,sine,.12)
  flip:   pitchSweep(900,1500,.06,tri,.08) then pitchSweep(1500,650,.07,tri,.06)
  coin:   tone(1320,.18,sine,.22,attack=.001) + tone(1760,.22,sine,.10) + noiseBurst(.08,hp@4000,Q=3,.04)
  mash:   pitchSweep(60,90,.9,saw,.20) + noiseBurst(.7,bp@900,Q=1,.10) + tone(220,.4,square,.06)+detune via shifts
  book:   noiseBurst(.35,bp@1200,Q=1.5,.08) + pitchSweep(400,180,.4,tri,.05)
  exports: global.TarotSound={click,shuffle,deal,flip,coin,mash,book,setMuted,isMuted}
  no DOMContentLoaded; ctx built lazily.
*/
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
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
    g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.18 : opts.volume;
    const attack = opts.attack || 0.005;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function pitchSweep(from, to, duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sawtooth';
    osc.connect(g);
    g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.14 : opts.volume;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, to), now + duration);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function noiseBurst(duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const bufSz = Math.floor(c.sampleRate * duration);
    const buf = c.createBuffer(1, bufSz, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const biquad = c.createBiquadFilter();
    biquad.type = opts.filterType || 'bandpass';
    biquad.frequency.value = opts.filterFreq || 1500;
    biquad.Q.value = opts.Q || 4;
    const g = c.createGain();
    src.connect(biquad);
    biquad.connect(g);
    g.connect(master);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.10 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  // ────────────────────────────────────────────────────────────────────
  //  Voices
  // ────────────────────────────────────────────────────────────────────
  function click() {
    tone(220, 0.04, { type: 'square', volume: 0.16 });
    tone(140, 0.05, { type: 'square', volume: 0.10, attack: 0.001 });
  }

  function shuffle() {
    noiseBurst(0.18, { filterType: 'bandpass', filterFreq: 1800, Q: 2, volume: 0.07 });
    tone(660, 0.05, { type: 'triangle', volume: 0.05 });
  }

  function deal() {
    tone(140, 0.10, { type: 'sine', volume: 0.16, attack: 0.003 });
    tone( 95, 0.08, { type: 'sine', volume: 0.12 });
  }

  function flip() {
    pitchSweep( 900, 1500, 0.06, { type: 'triangle', volume: 0.08 });
    setTimeout(() => {
      pitchSweep(1500,  650, 0.07, { type: 'triangle', volume: 0.06 });
    }, 50);
  }

  function coin() {
    tone(1320, 0.18, { type: 'sine', volume: 0.22, attack: 0.001 });
    tone(1760, 0.22, { type: 'sine', volume: 0.10 });
    noiseBurst(0.08, { filterType: 'highpass', filterFreq: 4000, Q: 3, volume: 0.04 });
  }

  function mash() {
    pitchSweep(60, 90, 0.9, { type: 'sawtooth', volume: 0.20 });
    noiseBurst(0.7, { filterType: 'bandpass', filterFreq: 900, Q: 1, volume: 0.10 });
    setTimeout(() => {
      tone(220, 0.4, { type: 'square', volume: 0.06 });
      tone(110, 0.5, { type: 'sawtooth', volume: 0.08, attack: 0.02 });
    }, 200);
  }

  function book() {
    noiseBurst(0.35, { filterType: 'bandpass', filterFreq: 1200, Q: 1.5, volume: 0.08 });
    pitchSweep(400, 180, 0.4, { type: 'triangle', volume: 0.05 });
  }

  global.TarotSound = {
    click: click,
    shuffle: shuffle,
    deal: deal,
    flip: flip,
    coin: coin,
    mash: mash,
    book: book,
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
  };
})(typeof window !== 'undefined' ? window : this);
