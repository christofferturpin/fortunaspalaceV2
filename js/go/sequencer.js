/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GO SEQUENCER  —  the board IS a pad-sequencer                           │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   The 9×9 board doubles as a step sequencer. A two-axis playhead         │
  │   sweeps right→left across columns (8→0), then top→bottom across         │
  │   rows (0→8). 18 steps = two bars of 9/8 in 3+3+3. Tempo & note          │
  │   division come from page.js: BPM is user-set (#go-bpm), and moveNum     │
  │   selects the note division (wholes early → 16ths in the endgame).       │
  │                                                                          │
  │   Each step lays down:                                                   │
  │     · a hi-hat tiss (noise burst, 7 kHz HP, heavy verb send)             │
  │     · a low slow kick on phases 0/3/6 of each bar (3+3+3 downbeats)      │
  │     · one ambient pad voice per "active" cap on the playhead. Player     │
  │       caps always sing as a warm sine pair; the opponent's voice         │
  │       varies by rank — sine for Lady in Waiting, a dubstep wub           │
  │       (sub-saw + resonant LFO-swept LP) for Consort, a glide-square      │
  │       (portamento between notes) for High-Consort, sawtooth pad for      │
  │       Emperess.                                                          │
  │     · while the AI is thinking, a three-hit snare stutter (spacing       │
  │       capped at 90ms so it stays a triplet, not a buzz roll).            │
  │                                                                          │
  │   Page.js filters the cell array to only the last 10 placements still    │
  │   on the board, so the pad is a rolling tail of recent moves, not the    │
  │   full board — but the drum bed plays regardless.                        │
  │                                                                          │
  │     pitch  = 69 (A4) + PENT_OFFSETS[col] + 12·rowOctaveShift(row)        │
  │     timbre = sine pair (red caps) | triangle pair (blue caps)            │
  │                                                                          │
  │   PENT_OFFSETS is A-minor-pentatonic stretched across 9 cols spanning    │
  │   ~2 octaves: A C D E G A C D E (semitones 0 3 5 7 10 12 15 17 19).      │
  │   Pentatonic = every pairing is consonant, so the sequencer is always    │
  │   harmonic regardless of cap placement — fits the "all notes harmonic    │
  │   within a chord, ambient as it plays" spec.                             │
  │                                                                          │
  │   rowOctaveShift maps the row (0 = top) to an octave offset (+2..-2)     │
  │   so the high notes sit visually at the top of the board.                │
  │                                                                          │
  │   Voices are dual-oscillator detuned, low-pass filtered, with a slow-    │
  │   attack / long-release envelope, sent partially through a stereo        │
  │   feedback delay for ambience — Japanese FM-pad-circa-93 feel.           │
  │                                                                          │
  │   AudioContext can't start without a user gesture, so page.js arms       │
  │   start() on the first click/keydown.                                    │
  │                                                                          │
  │   Public API (window.GoSequencer):                                       │
  │     init(getCellsFn, onStepFn, getStepMsFn?, getOpponentLevelFn?,        │
  │          getIsAiThinkingFn?, getRootOffsetFn?)                           │
  │     start()                                    ──► begin the step loop   │
  │     stop()                                     ──► pause                 │
  │     isStarted()                                ──► bool                  │
  │     getActiveStep()                            ──► {axis,idx} just played│
  │                                                                          │
  │   External deps: Web Audio API (browser-native)                          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  PENT_OFFSETS=[0,3,5,7,10,12,15,17,19] (A-minor-pent stretched 2 octaves)
  KICK_PHASES={0,3,6} (3+3+3 downbeats; applied to phase%9 so it fires in both bars of the 18-step two-axis cycle)
  STEP_MS=375; VOICE_LEN=1.6s; MASTER_GAIN=0.18; WET_SEND=0.4
  PLAYER_VOICE={wave:'sine',detune:1.005,lp:1600,gainScale:1.0} (constant)
  HOUSE_VOICES={1:{sine,1.003,1400,1.00},2:{tri,1.006,2000,0.95},3:{square,1.010,2200,0.55},4:{saw,1.014,1800,0.65}} (per-rank opponent timbre; gainScale tames bright waves) — NB levels 2 and 3 short-circuit to playWub (dubstep) and playGlide (portamento) respectively; HOUSE_VOICES[2] and [3] only serve as fallbacks if getOpponentLevel is missing
  rowToOctaveShift(row)→[-2..+2]: round((4-row)*0.5)
  cellToMidi(row,col)→int: 69 + (getRootOffset()|0) + PENT_OFFSETS[col] + 12*octaveShift
  midiToHz(m)→Hz: 440*2^((m-69)/12)
  state: ctx, master, wetSend, noiseBuf (shared white-noise for hat+snare), getCells, onStep, getStepMs, getOpponentLevel, getIsAiThinking, getRootOffset, lastGlideFreq (portamento memory for playGlide), timer, stepIdx, started, running
  playPad(midi, when, color): special-cases HOUSE+level2→playWub, HOUSE+level3→playGlide; else voice = (color==1 ? PLAYER_VOICE : HOUSE_VOICES[getOpponentLevel()||4]); dual-osc voice.wave detuned ×voice.detune → LP voice.lp → env (attack 60ms, peak 0.42×voice.gainScale, exp release 1.6s) → master + wetSend
  playWub(midi, when): freq/2 (sub-octave); two detuned sawtooths → resonant LP (cutoff 350, Q 14) modulated by sine LFO 4.5Hz, ±900Hz depth → env (attack 15ms, peak 0.34, exp release 1.7s) → master + wetSend
  playGlide(midi, when): two detuned squares; freq starts at lastGlideFreq (or current if first), exponentialRampToValueAtTime over 180ms → LP 2200 Q1.5 → env (attack 60ms, peak 0.27, exp release 1.6s); lastGlideFreq = freq
  playSnare(when, amp≈0.30): noiseBuf slice → bandpass 1.8kHz Q0.7 → env (peak amp@3ms, exp→0.0006 by 110ms) → master + send 0.30 to wetSend; PLUS sine 220→exp 140Hz over 80ms thud at amp*0.45
  playKick(when): sine 220Hz→exp 90Hz over 220ms (kept above sub-bass so laptop speakers actually move); env linRamp 0→0.85@4ms, exp→0.001 by 400ms; dry to master
  playHat(when): noiseBuf slice (random offset, 50ms) → HP 7kHz Q0.9 → env (peak 0.32, exp→0.0008 by 55ms); dry to master + heavy send (0.85) to wetSend
  ensureAudio(): build ctx, master gain (0.18), stereo feedback-delay reverb (delayL 0.32s, delayR 0.41s, fb 0.55, xfeed 0.30)
  playPad(midi, when, color):
    f=midiToHz(midi); osc1+osc2 (sine for player, triangle for opp), osc2 detuned +0.5%
    →mix(0.5)→biquad LP (1600Hz player / 2400Hz opp, Q=1)→env (attack 60ms, exp release 1.6s, peak 0.45)
    env→master + wetSend
  tick(): phase=stepIdx%18; isColPhase=phase<9; idx=isColPhase?(8-phase):(phase-9); axis=isColPhase?'col':'row'; now=ctx.currentTime+5ms; KICK_PHASES.has(phase%9)→playKick(now); playHat(now); getIsAiThinking?()→3× playSnare staggered min(stepMs/3, 90ms) apart; cells=getCells; ∀k∈0..8: row=isColPhase?k:idx, col=isColPhase?idx:k, cells[row*9+col] truthy → playPad(cellToMidi(row,col), now, color); onStep(idx,axis); stepIdx++
  loop(): if !running ret; tick(); reschedule setTimeout(loop, max(40, getStepMs?())||STEP_MS)
  exports: global.GoSequencer={init(getCells,onStep,getStepMs?,getOpponentLevel?,getIsAiThinking?,getRootOffset?),start,stop,isStarted,getActiveStep}
*/
(function (global) {
  const PENT_OFFSETS = [0, 3, 5, 7, 10, 12, 15, 17, 19];
  const STEP_MS = 375;
  const VOICE_LEN = 1.6;
  const MASTER_GAIN = 0.18;
  const WET_SEND_GAIN = 0.4;

  function rowToOctaveShift(row) {
    return Math.round((4 - row) * 0.5);
  }
  function cellToMidi(row, col) {
    const root = getRootOffset ? ((getRootOffset() | 0) % 12) : 0;
    return 69 + root + PENT_OFFSETS[col] + rowToOctaveShift(row) * 12;
  }
  function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // 9/8 in compound 3+3+3 grouping → kick lands on the three downbeats
  // within each bar. The full cycle is two bars (18 steps): a right→left
  // column sweep, then a top→bottom row sweep.
  const KICK_PHASES = new Set([0, 3, 6]);

  // Per-difficulty timbre for the OPPONENT's pad voice. Player (red caps)
  // always sings as a warm sine pair; the house (blue caps) shifts timbre
  // with rank so the music itself signals who's playing what.
  //   1 Lady in Waiting  → pure sine, narrow detune, low LP — soft, demure
  //   2 Consort          → triangle, mild detune, mid LP — clearer
  //   3 High-Consort     → filtered square, more detune — bright, regal
  //   4 Emperess         → filtered sawtooth, wide detune — rich, imperious
  // gainScale compensates so brighter waveforms don't blow out the mix.
  const HOUSE_VOICES = {
    1: { wave: 'sine',     detune: 1.003, lp: 1400, gainScale: 1.00 },
    2: { wave: 'triangle', detune: 1.006, lp: 2000, gainScale: 0.95 },
    3: { wave: 'square',   detune: 1.010, lp: 2200, gainScale: 0.55 },
    4: { wave: 'sawtooth', detune: 1.014, lp: 1800, gainScale: 0.65 },
  };
  // Player voice — constant, regardless of opponent level.
  const PLAYER_VOICE = { wave: 'sine', detune: 1.005, lp: 1600, gainScale: 1.00 };

  let ctx = null;
  let master = null;
  let wetSend = null;
  let noiseBuf = null;             // shared white-noise buffer for hi-hat hits
  let getCells = null;
  let onStep = null;
  let getStepMs = null;            // optional: dynamic per-tick tempo
  let getOpponentLevel = null;     // optional: returns 1..4 for HOUSE voice select
  let getIsAiThinking = null;      // optional: true → fire stutter snare per step
  let getRootOffset = null;        // optional: returns 0..11 semitones above A (key change, stays minor pent)
  let lastGlideFreq = null;        // remembered freq for playGlide's portamento (L3 voice)
  let timer = null;
  let stepIdx = 0;
  let started = false;
  let running = false;             // distinct from started — false when stopped

  function ensureAudio() {
    if (ctx) return;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);

    // Stereo-feedback delay network — poor-man's reverb, but sounds lush.
    const delayL = ctx.createDelay(2.0);
    const delayR = ctx.createDelay(2.0);
    delayL.delayTime.value = 0.32;
    delayR.delayTime.value = 0.41;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.55;
    fbR.gain.value = 0.55;
    const xfeed = ctx.createGain();
    xfeed.gain.value = 0.30;
    delayL.connect(fbL).connect(delayR);
    delayR.connect(fbR).connect(delayL);
    delayL.connect(xfeed).connect(master);
    delayR.connect(xfeed).connect(master);

    wetSend = ctx.createGain();
    wetSend.gain.value = WET_SEND_GAIN;
    wetSend.connect(delayL);
    wetSend.connect(delayR);

    // Pre-fill a shared 100ms white-noise buffer for hi-hat one-shots —
    // cheaper than allocating + filling a buffer per hit.
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  // Glide (portamento) voice — used for HOUSE caps when opponent rank is 3
  // (High-Consort). Square pair like the pad version, but each new note
  // exponentially ramps its oscillator frequency from the LAST note's
  // pitch over 180ms, so successive caps slide into one another like a
  // mono synth lead. The remembered frequency persists across columns,
  // so even sparse blue placements connect smoothly.
  function playGlide(midi, when) {
    if (!ctx) return;
    const freq = midiToHz(midi);
    const fromFreq = lastGlideFreq || freq;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'square';
    o2.type = 'square';
    // Portamento: start at the previous note's freq and exp-ramp to target.
    const glide = 0.18;
    o1.frequency.setValueAtTime(fromFreq, when);
    o2.frequency.setValueAtTime(fromFreq * 1.010, when);
    o1.frequency.exponentialRampToValueAtTime(freq, when + glide);
    o2.frequency.exponentialRampToValueAtTime(freq * 1.010, when + glide);

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o1.connect(mix);
    o2.connect(mix);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 1.5;
    mix.connect(lp);

    const env = ctx.createGain();
    env.gain.value = 0;
    lp.connect(env);
    env.connect(master);
    env.connect(wetSend);

    const t = when;
    const attack  = 0.06;
    const release = 1.6;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.27, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0008, t + attack + release);

    o1.start(t);
    o2.start(t);
    const stopAt = t + attack + release + 0.1;
    o1.stop(stopAt);
    o2.stop(stopAt);

    lastGlideFreq = freq;
  }

  // Dubstep wub voice — used for HOUSE caps when opponent rank is 2
  // (Consort). Two slightly-detuned sawtooths dropped one octave for sub
  // weight, run through a low-pass biquad with high resonance (Q=14)
  // and a sine LFO at ~4.5 Hz sweeping the cutoff. The LFO depth
  // (~900Hz) drives the filter from nearly-closed to wide-open across
  // each wobble cycle — that's the characteristic "wub wub" growl.
  function playWub(midi, when) {
    if (!ctx) return;
    const freq = midiToHz(midi) / 2;            // sub-octave for bass weight

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 1.007;          // slight detune for thickness

    const mix = ctx.createGain();
    mix.gain.value = 0.55;
    o1.connect(mix);
    o2.connect(mix);

    // The wub: resonant low-pass with an LFO sweeping the cutoff.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    filter.Q.value = 14;
    mix.connect(filter);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.5;                  // wobble rate (Hz)
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 900;                  // cutoff sweep range (Hz)
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);

    // Envelope — quick attack so the wub punches in, slow release so
    // each cap's wub bleeds into the next column's tick.
    const env = ctx.createGain();
    env.gain.value = 0;
    filter.connect(env);
    env.connect(master);
    env.connect(wetSend);

    const t = when;
    const attack  = 0.015;
    const release = 1.7;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.34, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0008, t + attack + release);

    o1.start(t);
    o2.start(t);
    lfo.start(t);
    const stopAt = t + attack + release + 0.1;
    o1.stop(stopAt);
    o2.stop(stopAt);
    lfo.stop(stopAt);
  }

  function playPad(midi, when, color) {
    if (!ctx) return;

    // Per-rank special voices that aren't simple pads:
    //   L2 Consort      → dubstep wub (sub-saw + LFO-swept LP)
    //   L3 High-Consort → glide / portamento square (slides between notes)
    if (color !== 1 && getOpponentLevel) {
      const lv = getOpponentLevel();
      if (lv === 2) { playWub(midi, when);   return; }
      if (lv === 3) { playGlide(midi, when); return; }
    }

    const freq = midiToHz(midi);

    // Pick voice config: player is constant; opponent's varies by rank.
    let voice;
    if (color === 1) {
      voice = PLAYER_VOICE;
    } else {
      const lv = getOpponentLevel ? (getOpponentLevel() || 4) : 4;
      voice = HOUSE_VOICES[lv] || HOUSE_VOICES[4];
    }

    // Dual-osc, slight detune for thickness.
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = voice.wave;
    o2.type = voice.wave;
    o1.frequency.value = freq;
    o2.frequency.value = freq * voice.detune;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o1.connect(mix);
    o2.connect(mix);

    // Low-pass filter for warmth (per-voice cutoff).
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = voice.lp;
    lp.Q.value = 1.0;
    mix.connect(lp);

    // ADSR-ish envelope (long release for pad sustain).
    const env = ctx.createGain();
    env.gain.value = 0;
    lp.connect(env);
    env.connect(master);
    env.connect(wetSend);

    const t = when;
    const attack = 0.06;
    const release = VOICE_LEN;
    const peak = 0.42 * voice.gainScale;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0008, t + attack + release);

    o1.start(t);
    o2.start(t);
    o1.stop(t + attack + release + 0.05);
    o2.stop(t + attack + release + 0.05);
  }

  // Kick — sine oscillator with a fast pitch drop (220→90 Hz). Kept inside
  // the range laptop / phone speakers can actually reproduce — sub-bass
  // (sub-80 Hz) vanishes on tiny drivers, so the kick sweep ends at 90 Hz
  // for body that still translates everywhere.
  function playKick(when) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, when);
    osc.frequency.exponentialRampToValueAtTime(90, when + 0.22);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.85, when + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.40);

    osc.connect(env);
    env.connect(master);
    osc.start(when);
    osc.stop(when + 0.45);
  }

  // Hi-hat — 50ms slice of the shared noise buffer, slammed through a
  // 7 kHz high-pass for the "tiss," with a stronger wet send so the
  // delay tail puffs out behind every hit.
  function playHat(when) {
    if (!ctx || !noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    // Random offset into the buffer so successive hits don't repeat exactly.
    src.loop = false;
    const startInBuf = Math.random() * 0.04;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    hp.Q.value = 0.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.32, when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0008, when + 0.055);

    src.connect(hp).connect(env);
    env.connect(master);
    // Heavier wet send than the pads — that's what makes it feel verby.
    const hatWet = ctx.createGain();
    hatWet.gain.value = 0.85;
    env.connect(hatWet).connect(wetSend);

    src.start(when, startInBuf);
    src.stop(when + 0.08);
  }

  // Snare — noise-burst body band-passed around 1.8 kHz + a quick sine
  // thud. Short envelope. Used as a "thinking" stutter while the AI ponders.
  function playSnare(when, amp) {
    if (!ctx || !noiseBuf) return;
    const peak = (amp == null ? 0.30 : amp);

    // Noise body (the snare wires)
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const offset = Math.random() * 0.05;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0006, when + 0.11);
    src.connect(bp).connect(env);
    env.connect(master);
    const sendG = ctx.createGain();
    sendG.gain.value = 0.30;
    env.connect(sendG).connect(wetSend);
    src.start(when, offset);
    src.stop(when + 0.13);

    // Tonal thud (snare shell)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, when);
    osc.frequency.exponentialRampToValueAtTime(140, when + 0.08);
    const oEnv = ctx.createGain();
    oEnv.gain.setValueAtTime(0, when);
    oEnv.gain.linearRampToValueAtTime(peak * 0.45, when + 0.002);
    oEnv.gain.exponentialRampToValueAtTime(0.001, when + 0.07);
    osc.connect(oEnv);
    oEnv.connect(master);
    osc.start(when);
    osc.stop(when + 0.10);
  }

  function tick() {
    if (!ctx) return;
    // Two-axis sweep: 18-step cycle. Phase 0..8 = vertical playhead reading
    // columns right→left (col = 8 - phase). Phase 9..17 = horizontal playhead
    // reading rows top→bottom (row = phase - 9). Downbeats land at phase%9
    // in {0,3,6}, so the 9/8 groove holds across both bars.
    const phase = stepIdx % 18;
    const isColPhase = phase < 9;
    const idx = isColPhase ? (8 - phase) : (phase - 9);
    const axis = isColPhase ? 'col' : 'row';
    const now = ctx.currentTime + 0.005;

    if (KICK_PHASES.has(phase % 9)) playKick(now);
    playHat(now);

    // Stutter-snare while the AI is thinking — three quick triplet hits
    // per step, capped at 90ms apart so fast-tempo steps don't blur the
    // hits into a buzz roll.
    if (getIsAiThinking && getIsAiThinking()) {
      const stepMs   = getStepMs ? getStepMs() : STEP_MS;
      const stutters = 3;
      const spacing  = Math.min(stepMs / stutters, 90) / 1000; // seconds
      for (let i = 0; i < stutters; i++) {
        playSnare(now + i * spacing, 0.26);
      }
    }

    // Pad voices for any "active" caps along the playhead line.
    if (getCells) {
      const cells = getCells();
      if (cells && cells.length) {
        for (let k = 0; k < 9; k++) {
          const row = isColPhase ? k : idx;
          const col = isColPhase ? idx : k;
          const v = cells[row * 9 + col];
          if (!v) continue;
          playPad(cellToMidi(row, col), now, v);
        }
      }
    }
    if (onStep) {
      try { onStep(idx, axis); } catch (_) {}
    }
    stepIdx++;
  }

  function loop() {
    if (!running) return;
    tick();
    const ms = getStepMs ? Math.max(40, getStepMs()) : STEP_MS;
    timer = setTimeout(loop, ms);
  }

  global.GoSequencer = {
    // init(getCellsFn, onStepFn, getStepMsFn?, getOpponentLevelFn?,
    //      getIsAiThinkingFn?, getRootOffsetFn?)
    //   getCellsFn()           → Int8Array(81) of currently-sounding cells
    //                            (page.js filters to last-N placements still
    //                            on the board)
    //   onStepFn(idx, axis)    → fires AFTER each tick so the UI can move
    //                            its playhead. axis='col' (vertical strip,
    //                            idx=col 0..8) or 'row' (horizontal strip,
    //                            idx=row 0..8). 18-step cycle: 9 col steps
    //                            right→left, then 9 row steps top→bottom.
    //   getStepMsFn()?         → optional, next tick's duration in ms
    //                            (page.js multiplies user-set BPM by a
    //                            moveNum-driven note division — wholes
    //                            early, 16ths in the endgame)
    //   getOpponentLevelFn()?  → optional, returns 1..4 — selects which
    //                            HOUSE voice timbre to use for opponent caps
    //   getIsAiThinkingFn()?   → optional, true → fire 3 stutter-snare
    //                            triplets per step (the "thinking" cue)
    //   getRootOffsetFn()?     → optional, returns 0..11 semitones above A
    //                            — transposes the whole scale (stays minor
    //                            pentatonic) so "key" can change live
    init(getCellsFn, onStepFn, getStepMsFn, getOpponentLevelFn, getIsAiThinkingFn, getRootOffsetFn) {
      getCells = getCellsFn;
      onStep = onStepFn;
      getStepMs = getStepMsFn || null;
      getOpponentLevel = getOpponentLevelFn || null;
      getIsAiThinking = getIsAiThinkingFn || null;
      getRootOffset = getRootOffsetFn || null;
    },
    start() {
      ensureAudio();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (running) return;
      started = true;
      running = true;
      loop();
    },
    stop() {
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }
    },
    isStarted() { return started; },
    getActiveStep() {
      if (stepIdx === 0) return { axis: 'col', idx: -1 };
      const phase = (stepIdx - 1) % 18;
      return phase < 9
        ? { axis: 'col', idx: 8 - phase }
        : { axis: 'row', idx: phase - 9 };
    },
  };
})(window);
