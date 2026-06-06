/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/AUDIO — WebAudio SFX (deal, chips, fold, check, win/loss)     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.BFAudio                                 │
  │                                                                          │
  │   Module state: ctx, masterGain (0.42), muted (R/W localStorage),        │
  │     muteBtn (mounted DOM element, lazy).                                 │
  │                                                                          │
  │   Core engine (synthesized — no asset loads):                            │
  │     ensureCtx()                  ──► AudioContext | null (lazy + resume) │
  │     tone(freq, dur, opts)        ──► osc → gain → master                 │
  │     noiseBurst(dur, opts)        ──► noise → biquad → gain → master      │
  │     chord(freqs, dur, opts)      ──► tone[] simultaneous                 │
  │                                                                          │
  │   Public cues (gated on !muted):                                         │
  │     cardFlick()    ──► single paper-flick noise burst (3–4 kHz bandpass) │
  │     cardDeal(n=2)  ──► cardFlick × n, ~75 ms apart                       │
  │     cardFlip()     ──► fuller flick + bright tick at end (showdown)      │
  │     chipPlace()    ──► one metallic clink (4 kHz + 3 kHz pair, fast env) │
  │     chipStack(n)   ──► chipPlace × clamp(2 + log₂ n, 2, 5), 30 ms apart  │
  │     check()        ──► wooden knock — low tone + brief noise tap         │
  │     fold()         ──► paper-push — descending low-passed noise sweep    │
  │     streetDeal(n)  ──► burn-card tick + cardDeal(n) (flop=3, turn/r=1)   │
  │     showdown()     ──► low rumble + bright tick (anticipation→reveal)    │
  │     win()          ──► gothic minor→major swell (Cm to C maj, organ ish) │
  │     loss()         ──► descending minor arp + low organ hit              │
  │     uiTick()       ──► quiet UI click (button / preset / mute toggle)    │
  │                                                                          │
  │   Mute control:                                                          │
  │     isMuted() / setMuted(b) / toggleMuted()                              │
  │     Persists to localStorage 'wendys_palace_bossfight_audio_muted'.      │
  │   Mute button:                                                           │
  │     mountMuteButton(target?)  ──► injects fixed top-right speaker SVG    │
  │       button. Click toggles mute + plays uiTick. Idempotent (re-mounting │
  │       returns the existing node).                                        │
  │   First-gesture arm:                                                     │
  │     armOnFirstGesture(el?)    ──► one-shot listener that calls ctx       │
  │       (AudioContext needs a user gesture to start). Default: document.   │
  │                                                                          │
  │   Exports (window.BFAudio): all cues + mute API + mountMuteButton +      │
  │     armOnFirstGesture + ensureCtx.                                       │
  │   External deps: window.AudioContext / webkitAudioContext, localStorage. │
  │   Consumers: js/bossfight/page.js (Chavez), js/bossfight/page-generic.js │
  │     (Malechstone, Zashiki, Nahual, Fortuna).                             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  MUTE_KEY='wendys_palace_bossfight_audio_muted'
  state: ctx=null, master=null, muted=(localStorage[MUTE_KEY]==='1'), muteBtn=null
  ensureCtx()→ctx|null: lazy new AC; master=gain(0.42)→destination; ctx.suspended→resume; ret ctx
  tone(f,dur,opts={type:'sine',volume:.18,attack:.005,delay:0,target:master})→void: guard !ctx||muted; osc(type,f)→g→target; startAt=now+delay; g.gain set 0,linRamp vol@attack,expRamp .001@dur; osc.start startAt; osc.stop startAt+dur+.05
  noiseBurst(dur,opts={filter:'bandpass',freq:3000,Q:1.4,vol:.32,attack:.005,delay:0,sweepTo:null})→void: guard; bufSize=sampleRate*dur; buf=fill rnd*2-1; src→biquad(filter,freq,Q)→g→master; if sweepTo expRamp filter.freq@dur; env as tone; play
  chord(freqs,dur,opts)→void: ∀f tone(f,dur,opts)
  cardFlick(opts?): noiseBurst(80ms,bandpass,2800+rnd*900,Q:1.6,vol:.30,opts.delay)
  cardDeal(n=2): ∀i∈[0..n) setTimeout(cardFlick, i*75)
  cardFlip(): noiseBurst(120ms,bandpass,2400,Q:1.2,vol:.34); tone(5200,80ms,type:'square',vol:.06,delay:.08)
  chipPlace(opts?): tone(4100,90ms,type:'square',vol:.08,delay:opts?.delay); tone(2950,70ms,type:'square',vol:.07,delay:(opts?.delay||0)+.018); noiseBurst(40ms,highpass,3800,Q:.8,vol:.18,opts?.delay)
  chipStack(n=3): cnt=clamp(2+floor(log2 max(1,n)),2,5); ∀i∈[0..cnt) chipPlace({delay:i*.03+rnd*.012})
  check(): tone(280,90ms,type:'sine',vol:.16); tone(180,140ms,type:'sine',vol:.10,delay:.012); noiseBurst(50ms,bandpass,1100,Q:4,vol:.10)
  fold(): noiseBurst(280ms,bandpass,1800,Q:1.5,vol:.16,sweepTo:600); tone(120,180ms,type:'sine',vol:.10,delay:.04)
  streetDeal(n=3): noiseBurst(40ms,highpass,5000,Q:.7,vol:.10); setTimeout(cardDeal(n),60)
  showdown(): tone(55,420ms,type:'sine',vol:.10); tone(82,400ms,type:'sine',vol:.08,delay:.04); tone(2800,140ms,type:'square',vol:.05,delay:.18)
  win(): notes=[Cm chord then C maj]: chord([261.63,311.13,392],.65,type:'triangle',vol:.10); chord([261.63,329.63,392,523.25],.9,type:'triangle',vol:.11,delay:.42); tone(130.81,1.1,type:'sine',vol:.10,delay:.04)
  loss(): notes=[440,392,329.63,261.63]; ∀(f,i) tone(f,.55,type:'triangle',vol:.12,delay:i*.13); tone(98,1.2,type:'sine',vol:.10,delay:.20); tone(82,1.1,type:'sine',vol:.08,delay:.40)
  uiTick(): noiseBurst(20ms,bandpass,1200,Q:6,vol:.07)
  isMuted/setMuted/toggleMuted: muted=b; localStorage[MUTE_KEY]=b?'1':'0'; updateBtn
  mountMuteButton(target=body): idempotent; SVG speaker icon; click→toggleMuted+uiTick; data-muted=muted; fixed top:14 right:14 z:10000
  armOnFirstGesture(el=document): one-shot keydown/pointerdown→ensureCtx then removeListener
  exports: global.BFAudio={ensureCtx,tone,noiseBurst,chord,cardFlick,cardDeal,cardFlip,chipPlace,chipStack,check,fold,streetDeal,showdown,win,loss,uiTick,isMuted,setMuted,toggleMuted,mountMuteButton,armOnFirstGesture}
*/

(function (global) {
  const MUTE_KEY = 'wendys_palace_bossfight_audio_muted';

  let ctx = null;
  let master = null;
  let muted = false;
  let muteBtn = null;

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.42;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  function tone(freq, duration, opts) {
    opts = opts || {};
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(opts.target || master);
    const startAt = c.currentTime + (opts.delay || 0);
    const vol = opts.volume == null ? 0.18 : opts.volume;
    const attack = opts.attack || 0.005;
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(vol, startAt + attack);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + Math.max(duration, attack + 0.02));
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
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
    const biquad = c.createBiquadFilter();
    biquad.type = opts.filter || 'bandpass';
    biquad.frequency.value = opts.freq || 3000;
    biquad.Q.value = opts.Q == null ? 1.0 : opts.Q;
    const g = c.createGain();
    src.connect(biquad);
    biquad.connect(g);
    g.connect(master);
    const startAt = c.currentTime + (opts.delay || 0);
    const vol = opts.vol == null ? 0.24 : opts.vol;
    const attack = opts.attack || 0.005;
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(vol, startAt + attack);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    if (opts.sweepTo) {
      biquad.frequency.setValueAtTime(opts.freq || 3000, startAt);
      biquad.frequency.exponentialRampToValueAtTime(opts.sweepTo, startAt + duration);
    }
    src.start(startAt);
    src.stop(startAt + duration + 0.05);
  }

  function chord(freqs, duration, opts) {
    for (const f of freqs) tone(f, duration, opts);
  }

  // ──────────────────────── Public cues ────────────────────────

  function cardFlick(opts) {
    opts = opts || {};
    noiseBurst(0.08, {
      filter: 'bandpass',
      freq: 2800 + Math.random() * 900,
      Q: 1.6, vol: 0.30, delay: opts.delay || 0,
    });
  }

  function cardDeal(n) {
    n = n || 2;
    for (let i = 0; i < n; i++) {
      setTimeout(cardFlick, i * 75);
    }
  }

  function cardFlip() {
    noiseBurst(0.12, { filter: 'bandpass', freq: 2400, Q: 1.2, vol: 0.34 });
    tone(5200, 0.08, { type: 'square', volume: 0.06, delay: 0.08 });
  }

  function chipPlace(opts) {
    opts = opts || {};
    const d = opts.delay || 0;
    tone(4100, 0.09, { type: 'square', volume: 0.08, delay: d });
    tone(2950, 0.07, { type: 'square', volume: 0.07, delay: d + 0.018 });
    noiseBurst(0.04, { filter: 'highpass', freq: 3800, Q: 0.8, vol: 0.18, delay: d });
  }

  function chipStack(n) {
    n = Math.max(1, n || 1);
    const cnt = Math.min(5, Math.max(2, 2 + Math.floor(Math.log2(n))));
    for (let i = 0; i < cnt; i++) {
      chipPlace({ delay: i * 0.03 + Math.random() * 0.012 });
    }
  }

  function check() {
    tone(280, 0.09, { type: 'sine', volume: 0.16 });
    tone(180, 0.14, { type: 'sine', volume: 0.10, delay: 0.012 });
    noiseBurst(0.05, { filter: 'bandpass', freq: 1100, Q: 4, vol: 0.10 });
  }

  function fold() {
    noiseBurst(0.28, {
      filter: 'bandpass', freq: 1800, Q: 1.5, vol: 0.16, sweepTo: 600,
    });
    tone(120, 0.18, { type: 'sine', volume: 0.10, delay: 0.04 });
  }

  function streetDeal(n) {
    noiseBurst(0.04, { filter: 'highpass', freq: 5000, Q: 0.7, vol: 0.10 });
    setTimeout(function () { cardDeal(n || 1); }, 60);
  }

  function showdown() {
    tone(55, 0.42, { type: 'sine', volume: 0.10 });
    tone(82, 0.40, { type: 'sine', volume: 0.08, delay: 0.04 });
    tone(2800, 0.14, { type: 'square', volume: 0.05, delay: 0.18 });
  }

  // Gothic verdict — Cm (C Eb G) → C major (C E G C) — minor flavour
  // resolves with a slight lift, never quite cheery.
  function win() {
    chord([261.63, 311.13, 392.00], 0.65, { type: 'triangle', volume: 0.10 });
    chord([261.63, 329.63, 392.00, 523.25], 0.90, {
      type: 'triangle', volume: 0.11, delay: 0.42,
    });
    tone(130.81, 1.10, { type: 'sine', volume: 0.10, delay: 0.04 });
  }

  // Descending minor (A4 G4 E4 C4) + low organ — the chair scrapes back.
  function loss() {
    const notes = [440.00, 392.00, 329.63, 261.63];
    for (let i = 0; i < notes.length; i++) {
      tone(notes[i], 0.55, { type: 'triangle', volume: 0.12, delay: i * 0.13 });
    }
    tone(98.00, 1.20, { type: 'sine', volume: 0.10, delay: 0.20 });
    tone(82.00, 1.10, { type: 'sine', volume: 0.08, delay: 0.40 });
  }

  function uiTick() {
    noiseBurst(0.02, { filter: 'bandpass', freq: 1200, Q: 6, vol: 0.07 });
  }

  // ──────────────────────── Mute control ────────────────────────

  function isMuted() { return muted; }
  function setMuted(b) {
    muted = !!b;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (muteBtn) muteBtn.dataset.muted = muted ? '1' : '0';
  }
  function toggleMuted() { setMuted(!muted); }

  // ──────────────────────── Mute button mount ────────────────────────

  const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/>' +
    '<path class="bf-audio-wave" d="M15 8a5 5 0 0 1 0 8M17.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path class="bf-audio-cross" d="M16 9 L21 14 M21 9 L16 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0"/>' +
    '</svg>';

  function mountMuteButton(target) {
    if (muteBtn) return muteBtn;
    target = target || document.body;
    if (!target) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bf-audio-btn';
    btn.setAttribute('aria-label', 'Toggle sound');
    btn.setAttribute('title', 'Toggle sound (M)');
    btn.dataset.muted = muted ? '1' : '0';
    btn.innerHTML = SPEAKER_SVG;
    // Inline styles so we don't depend on a stylesheet shipping. CSS in
    // poker-base.css adds polish but this base layout always works.
    btn.style.position = 'fixed';
    btn.style.top = '14px';
    btn.style.right = '14px';
    btn.style.zIndex = '10000';
    btn.style.width = '36px';
    btn.style.height = '36px';
    btn.style.padding = '0';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.border = '1px solid currentColor';
    btn.style.background = 'rgba(0,0,0,0.5)';
    btn.style.color = '#d8c8b0';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '50%';
    btn.style.transition = 'color 180ms, background 180ms, transform 120ms';
    btn.addEventListener('click', function () {
      toggleMuted();
      if (!muted) uiTick();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
    target.appendChild(btn);
    muteBtn = btn;
    return btn;
  }

  // ──────────────────────── First-gesture arm ────────────────────────

  function armOnFirstGesture(el) {
    el = el || document;
    function arm() {
      ensureCtx();
      el.removeEventListener('pointerdown', arm, true);
      el.removeEventListener('keydown',     arm, true);
    }
    el.addEventListener('pointerdown', arm, true);
    el.addEventListener('keydown',     arm, true);
  }

  // ──────────────────────── M-key global toggle ────────────────────────

  document.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      toggleMuted();
      if (!muted) uiTick();
    }
  });

  global.BFAudio = {
    ensureCtx, tone, noiseBurst, chord,
    cardFlick, cardDeal, cardFlip,
    chipPlace, chipStack,
    check, fold,
    streetDeal, showdown,
    win, loss, uiTick,
    isMuted, setMuted, toggleMuted,
    mountMuteButton, armOnFirstGesture,
  };
})(window);
