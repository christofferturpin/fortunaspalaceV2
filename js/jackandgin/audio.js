/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  WebAudio SFX (cards, chips, win/loss cues)             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.JG.Sound                                │
  │                                                                          │
  │   Module state: ctx, masterGain (gain=0.4), muted=false                  │
  │                                                                          │
  │   Core engine:                                                           │
  │     ensureCtx()                  ──► AudioContext | null (lazy + resume) │
  │     tone(freq, duration, opts)   ──► schedules osc → gain → master       │
  │     noiseBurst(duration, opts)   ──► schedules noise → filter → gain     │
  │                                                                          │
  │   Public cues (all gated on !muted):                                     │
  │     click()         ──► short wooden tap                                 │
  │     cardFlick()     ──► single paper flick (noise burst)                 │
  │     cardDeal(count) ──► cardFlick × count, 90ms apart                    │
  │     bet()           ──► chip stack (1760/2637/3520 Hz + noise tail)      │
  │     stand()         ──► felt thud + low wood                             │
  │     win()           ──► C-major arpeggio                                 │
  │     loss()          ──► descending triangle F4→C4→F3                     │
  │     bust()          ──► 440→110 Hz sweep + 82 Hz sub-bass                │
  │     push()          ──► perfect fifth (392 + 587.33)                     │
  │                                                                          │
  │   Mute control: setMuted(m), isMuted()                                   │
  │                                                                          │
  │   Exports (window.JG.Sound): {click, cardFlick, cardDeal, bet, stand,    │
  │     win, loss, bust, push, setMuted, isMuted}                            │
  │   External deps: window.AudioContext / webkitAudioContext                │
  │   Consumers: JG.UI (state-change cues, button clicks)                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F
  ensureCtx()→AudioContext|null: lazy new AC; gain=0.4→destination; resume if suspended
  tone(freq,dur,opts)→void: guard(!ctx||muted); osc(type,freq)→gain→master; ramp 0→vol@attack→0.001@dur
  noiseBurst(dur,opts)→void: guard(!ctx||muted); fill buf with rnd*2-1; src→biquad(filterType,freq,Q)→gain→master; ramp 0→vol@5ms→0.001@dur
  click(): noiseBurst(25ms,{bandpass,800Hz,Q:8,vol:.08})
  cardFlick(): noiseBurst(90ms,{bandpass,3000+rnd*800,Q:1.4,vol:.32})
  cardDeal(n=3): setTimeout(cardFlick, i*90) for i∈[0..n)
  bet(): tone(1760,.25)+tone(2637,.18)+tone(3520,.12)+noiseBurst(25ms highpass 4kHz)
  stand(): noiseBurst(70ms,bandpass 380,Q:5) + tone(196,.18)
  win(): notes=[C5,E5,G5,C6]; ∀(f,i) tone(f,.55,delay:i*.09) + tone(f*2,.3,delay:i*.09)
  loss(): tone(F4,.7,tri)+tone(C4,.8,tri,delay:.18)+tone(F3,1,sin,delay:.36)
  bust(): direct osc(tri) ramp 440→110@.7s, gain→.22@.02→.001@.7; +tone(82,.7,sin,delay:.05)
  push(): tone(392,.5)+tone(587.33,.5)
  setMuted(m): muted=m; isMuted()→muted
  exports: global.JG.Sound={click,cardFlick,cardDeal,bet,stand,win,loss,bust,push,setMuted,isMuted}
*/

(function (global) {
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
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(masterGain);
    const startAt = c.currentTime + (opts.delay || 0);
    const vol = opts.volume == null ? 0.16 : opts.volume;
    const attack = opts.attack || 0.005;
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(vol, startAt + attack);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
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
    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.value = opts.filterFreq || 2000;
    filter.Q.value = opts.Q || 4;
    const g = c.createGain();
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    const startAt = c.currentTime + (opts.delay || 0);
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(opts.volume == null ? 0.12 : opts.volume, startAt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    src.start(startAt);
    src.stop(startAt + duration + 0.05);
  }

  // ----- Specific sounds -----

  function click() {
    // crisp wooden tap
    noiseBurst(0.025, {
      filterType: 'bandpass',
      filterFreq: 800,
      Q: 8,
      volume: 0.08,
    });
  }

  function cardFlick() {
    // brushy paper flick — wider band + louder so the single hit reads
    noiseBurst(0.09, {
      filterType: 'bandpass',
      filterFreq: 3000 + Math.random() * 800,
      Q: 1.4,
      volume: 0.32,
    });
  }

  function cardDeal(count) {
    count = count || 3;
    for (let i = 0; i < count; i++) {
      setTimeout(cardFlick, i * 90);
    }
  }

  function bet() {
    // bright metallic chip — sine stack with brief noise tail
    tone(1760, 0.25, { type: 'sine', volume: 0.18 });
    tone(2637, 0.18, { type: 'sine', volume: 0.10 });
    tone(3520, 0.12, { type: 'sine', volume: 0.05 });
    noiseBurst(0.025, {
      filterType: 'highpass',
      filterFreq: 4000,
      volume: 0.04,
    });
  }

  function stand() {
    // hand on green felt + low wood
    noiseBurst(0.07, {
      filterType: 'bandpass',
      filterFreq: 380,
      Q: 5,
      volume: 0.11,
    });
    tone(196, 0.18, { type: 'sine', volume: 0.06 });
  }

  function win() {
    // ascending C-major arpeggio, glockenspiel/parlor chime
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      tone(freq, 0.55, {
        type: 'sine',
        volume: 0.16,
        delay: i * 0.09,
        attack: 0.003,
      });
      tone(freq * 2, 0.3, {
        type: 'sine',
        volume: 0.05,
        delay: i * 0.09,
      });
    });
  }

  function loss() {
    // gentle descending triangle — F4 → C4 → F3
    tone(349.23, 0.7, { type: 'triangle', volume: 0.15 });
    tone(261.63, 0.8, { type: 'triangle', volume: 0.13, delay: 0.18 });
    tone(174.61, 1.0, { type: 'sine', volume: 0.10, delay: 0.36 });
  }

  function bust() {
    // descending sweep + sub-bass thud
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    const g = c.createGain();
    osc.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.7);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.start(now);
    osc.stop(now + 0.75);
    tone(82, 0.7, { type: 'sine', volume: 0.16, delay: 0.05 });
  }

  function push() {
    // soft perfect fifth, suspended
    tone(392, 0.5, { type: 'sine', volume: 0.13 });
    tone(587.33, 0.5, { type: 'sine', volume: 0.10 });
  }

  global.JG = global.JG || {};
  global.JG.Sound = {
    click,
    cardFlick,
    cardDeal,
    bet,
    stand,
    win,
    loss,
    bust,
    push,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
