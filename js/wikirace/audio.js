/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE AUDIO  —  WebAudio SFX bank (chimes, bells, organ, noise)      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   module state: ctx, masterGain (0.35), muted=false                      │
  │                                                                          │
  │   ensureCtx() ──► AudioContext (lazy; resumes if suspended)              │
  │       └─ first call wires masterGain ─► ctx.destination                  │
  │                                                                          │
  │   tone(freq, duration, opts?) ──► void                                   │
  │       └─ osc(type, freq) ─► gain(ADSR) ─► masterGain                     │
  │                                                                          │
  │   noiseBurst(duration, opts?) ──► void                                   │
  │       └─ buffer(white) ─► biquad(filterType,filterFreq,Q) ─► gain ─►     │
  │          masterGain                                                      │
  │                                                                          │
  │   SFX (all gated on !muted; call ensureCtx() implicitly):                │
  │     horseSelect()  ─► paper-tap noise                                    │
  │     slotAssign()   ─► A5+E6 chime                                        │
  │     clearPick()    ─► G3 thump + lowpass noise                           │
  │     coinClink()    ─► A6+E7 sine + highpass tick                         │
  │     sowSeed()      ─► C3/G3/C4 organ + coin clatter                      │
  │     raceStart()    ─► C6 bell + overtones + whoosh                       │
  │     arkTink()      ─► C7/G7/C8 metallic tink                             │
  │     horseDie()     ─► A3 tolling bell                                    │
  │     raceFinish()   ─► C-major sawtooth "amen" chord                      │
  │     winChime()     ─► C5/E5/G5/C6 arpeggio                               │
  │     loss()         ─► F4/C4/F3 descent                                   │
  │                                                                          │
  │   setMuted(m) / isMuted() ──► gate all output                            │
  │                                                                          │
  │   Exports (window.WikiraceSound): { horseSelect, slotAssign, clearPick,  │
  │       coinClink, sowSeed, raceStart, arkTink, horseDie, raceFinish,      │
  │       winChime, loss, setMuted, isMuted }                                │
  │   External deps: AudioContext / webkitAudioContext                       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F
  ensureCtx()→AudioContext|null: !ctx→AC=AudioContext||webkitAudioContext; !AC→null; ctx=new AC; masterGain=ctx.createGain; gain.value=0.35; connect(destination); if ctx.state=='suspended'→resume; ret ctx
  tone(freq,duration,opts={}): c=ensureCtx; !c||muted→ret; osc=createOscillator(type=opts.type||'sine', freq, detune?); g=createGain; osc→g→masterGain; startAt=now+(opts.delay||0); vol=opts.volume??0.12; attack=opts.attack||0.005; ADSR: setValue(0,startAt), linRamp(vol,startAt+attack), expRamp(0.001,startAt+dur); osc.start+stop
  noiseBurst(duration,opts={}): c=ensureCtx; !c||muted→ret; buf=createBuffer(1,sampleRate*dur); fill data[i]=rnd*2-1; src=createBufferSource(buf); filter=biquad(type=opts.filterType||'bandpass',freq=opts.filterFreq||2000,Q=opts.Q||4); src→filter→g→masterGain; ADSR vol=opts.volume??0.10
  SFX (all gated !muted via tone/noiseBurst):
    horseSelect: noiseBurst(0.04, bandpass 700Hz Q6 v0.06)
    slotAssign: tone(880,0.32) + tone(1318.5,0.22 delay0.04)
    clearPick: tone(196,0.16 triangle) + noiseBurst(0.05 lowpass 600Hz)
    coinClink: tone(1760,0.18) + tone(2637,0.12 delay0.02) + noiseBurst(0.02 highpass 4kHz)
    sowSeed: tone C3/G3 triangle + C4 sawtooth (0.95s organ) + tone(1318.5/1976 delay) + noiseBurst highpass 5kHz
    raceStart: tone C6/2093/3136 sine (steeple bell) + noiseBurst highpass 2kHz (whoosh)
    arkTink: tone C7/G7/C8 sine + noiseBurst highpass 5kHz
    horseDie: tone(220 triangle 0.7) + tone(440 0.5) + tone(659.25 0.3) (tolling bell)
    raceFinish: tone C3/E3/G3 sawtooth + C4 sine, all 1.5s (amen chord)
    winChime: ∀i∈[0..3] tone(notes[i]=C5/E5/G5/C6, 0.6, delay i*0.10) + octave overtone
    loss: tone F4(0.7 triangle) + C4(0.8 delay0.18) + F3(1.0 delay0.36 sine)
  setMuted(m): muted=m
  isMuted()→muted
  exports: global.WikiraceSound={horseSelect,slotAssign,clearPick,coinClink,sowSeed,raceStart,arkTink,horseDie,raceFinish,winChime,loss,setMuted,isMuted}
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
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    if (opts.detune) osc.detune.value = opts.detune;
    osc.connect(g);
    g.connect(masterGain);
    const startAt = c.currentTime + (opts.delay || 0);
    const vol = opts.volume == null ? 0.12 : opts.volume;
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
    g.gain.linearRampToValueAtTime(opts.volume == null ? 0.10 : opts.volume, startAt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    src.start(startAt);
    src.stop(startAt + duration + 0.05);
  }

  // ===== Specific sounds =====

  // Soft paper-tap when selecting a horse from the field.
  function horseSelect() {
    noiseBurst(0.04, { filterType: 'bandpass', filterFreq: 700, Q: 6, volume: 0.06 });
  }

  // Gentle dyad chime when a horse fills a slot — like a hymnal page-marker bell.
  function slotAssign() {
    tone(880, 0.32, { type: 'sine', volume: 0.10, attack: 0.004 });
    tone(1318.5, 0.22, { type: 'sine', volume: 0.07, attack: 0.004, delay: 0.04 });
  }

  // Low thump when the player clears their picks.
  function clearPick() {
    tone(196, 0.16, { type: 'triangle', volume: 0.10 });
    noiseBurst(0.05, { filterType: 'lowpass', filterFreq: 600, Q: 1, volume: 0.04 });
  }

  // Coin clink when MAX is pressed.
  function coinClink() {
    tone(1760, 0.18, { type: 'sine', volume: 0.10 });
    tone(2637, 0.12, { type: 'sine', volume: 0.06, delay: 0.02 });
    noiseBurst(0.02, { filterType: 'highpass', filterFreq: 4000, volume: 0.03 });
  }

  // SOW YOUR SEED — dramatic press: low organ swell + coin.
  function sowSeed() {
    // Three-note triangle-saw stack (root–fifth–octave) — fake pipe organ.
    tone(130.81, 0.95, { type: 'triangle', volume: 0.11, attack: 0.04 });   // C3
    tone(196,    0.95, { type: 'triangle', volume: 0.09, attack: 0.04 });   // G3
    tone(261.63, 0.95, { type: 'sawtooth', volume: 0.06, attack: 0.04 });   // C4
    // Coin clatter on top
    tone(1318.5, 0.22, { type: 'sine', volume: 0.13, delay: 0.05 });
    tone(1976,   0.18, { type: 'sine', volume: 0.09, delay: 0.07 });
    noiseBurst(0.05, { filterType: 'highpass', filterFreq: 5000, volume: 0.05, delay: 0.05 });
  }

  // Race-start: a single bright steeple bell stab.
  function raceStart() {
    tone(1046.5, 0.6, { type: 'sine', volume: 0.18, attack: 0.002 });   // C6 fundamental
    tone(2093,   0.4, { type: 'sine', volume: 0.08, attack: 0.002 });   // overtone
    tone(3136,   0.25, { type: 'sine', volume: 0.04, attack: 0.002 });  // higher partial
    // Brief whoosh underneath
    noiseBurst(0.12, { filterType: 'highpass', filterFreq: 2000, Q: 0.7, volume: 0.06 });
  }

  // Bright metallic TINK — winner colliding with the ark hull.
  function arkTink() {
    tone(2093, 0.4,  { type: 'sine', volume: 0.20, attack: 0.001 });   // C7
    tone(3136, 0.32, { type: 'sine', volume: 0.12, attack: 0.001 });   // G7
    tone(4186, 0.22, { type: 'sine', volume: 0.06, attack: 0.001 });   // C8
    noiseBurst(0.04, { filterType: 'highpass', filterFreq: 5000, volume: 0.08 });
  }

  // Distant single tolling bell when a horse dies / is "called home."
  function horseDie() {
    tone(220, 0.7, { type: 'triangle', volume: 0.10, attack: 0.04 });
    tone(440, 0.5, { type: 'sine', volume: 0.05, attack: 0.04, delay: 0.01 });
    tone(659.25, 0.3, { type: 'sine', volume: 0.025, attack: 0.06, delay: 0.02 });
  }

  // Race finishes — a sustained "amen" chord.
  function raceFinish() {
    // C major chord on organ-ish sawtooth
    tone(130.81, 1.5, { type: 'sawtooth', volume: 0.07, attack: 0.06 }); // C3
    tone(164.81, 1.5, { type: 'sawtooth', volume: 0.06, attack: 0.06 }); // E3
    tone(196,    1.5, { type: 'sawtooth', volume: 0.06, attack: 0.06 }); // G3
    tone(261.63, 1.5, { type: 'sine',     volume: 0.05, attack: 0.06 }); // C4
  }

  // Joyful win — ascending church-bell arpeggio (C–E–G–C).
  function winChime() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      tone(freq, 0.6, { type: 'sine', volume: 0.16, delay: i * 0.10, attack: 0.004 });
      tone(freq * 2, 0.32, { type: 'sine', volume: 0.05, delay: i * 0.10, attack: 0.004 });
    });
  }

  // Gentle sad descent for a losing race.
  function loss() {
    tone(349.23, 0.7, { type: 'triangle', volume: 0.13 });
    tone(261.63, 0.8, { type: 'triangle', volume: 0.11, delay: 0.18 });
    tone(174.61, 1.0, { type: 'sine',     volume: 0.09, delay: 0.36 });
  }

  global.WikiraceSound = {
    horseSelect,
    slotAssign,
    clearPick,
    coinClink,
    sowSeed,
    raceStart,
    arkTink,
    horseDie,
    raceFinish,
    winChime,
    loss,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
