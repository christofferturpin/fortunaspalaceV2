/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS AUDIO  —  WebAudio synth voices for Gladiatrix.exe arena      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded)  ─ AudioContext lazy-built on first call         │
  │                                                                          │
  │   ensureCtx() ──► AudioContext   (creates ctx + masterGain @ 0.32)       │
  │       ▲                                                                  │
  │       │ called by every voice                                            │
  │                                                                          │
  │   Primitives (all gated by muted flag):                                  │
  │     tone(freq, dur, opts?)              ──► osc → gain envelope          │
  │     pitchSweep(from, to, dur, opts?)    ──► exp freq ramp                │
  │     noiseBurst(dur, opts?)              ──► white noise → biquad         │
  │     throttle(key, gapMs)                ──► bool (true = play allowed)   │
  │                                                                          │
  │   Combat voices (called by ShapebotsBattle in fireAttack / fireEffect /  │
  │   bomb-detonate / snipe-hit / applyDamage-death):                        │
  │     melee()        ──► metallic clang (throttle 35ms)                    │
  │     shotgun()      ──► bandpass noise burst + low thud (throttle 45ms)   │
  │     beam()         ──► square buzz + sweep (throttle 60ms)               │
  │     whirl()        ──► rising bandpass whoosh (throttle 80ms)            │
  │     bombLaunch()   ──► low thump + airy whistle (throttle 60ms)          │
  │     bombExplode()  ──► sub kick + bright noise burst                     │
  │     snipe()        ──► high-velocity zip + crack (throttle 50ms)         │
  │     snipeHit()     ──► short snap (throttle 35ms)                        │
  │     chainZap()     ──► detuned saw crackle (throttle 60ms)               │
  │     heal()         ──► soft chime + overtone (throttle 60ms)             │
  │                                                                          │
  │   Active-special voices:                                                 │
  │     shield()       ──► metallic ring (aegis / bulwark / phaseShift)      │
  │     pulseHeal()    ──► bright bell pair                                  │
  │     adrenaline()   ──► quick upward whoosh                               │
  │     loadedShot()   ──► charge whine                                      │
  │     detonate()     ──► boom (heavier than bombExplode)                   │
  │     teleport()     ──► descending+ascending zap pair                     │
  │     rally()        ──► short brass horn cluster                          │
  │     lockdown()     ──► clank + iron ring                                 │
  │     vortex()       ──► sub rumble + downward sweep                       │
  │     freeze()       ──► crystalline shimmer (hp noise + chime)            │
  │     enrage()       ──► detuned growl                                     │
  │                                                                          │
  │   Run / phase voices (called by main.js):                                │
  │     start()        ──► two-beat brass hit (round start)                  │
  │     botDown(team)  ──► death thunk; player=sub-thump+sad, enemy=snap     │
  │     roundWon()     ──► 3-note major fanfare + shimmer                    │
  │     roundLost()    ──► descending minor sting + low drone                │
  │     cashOut()      ──► coin chime cascade                                │
  │     abandon()      ──► dull clank + half-fanfare                         │
  │     click()        ──► UI tap (button presses)                           │
  │     setMuted(m)    ──► toggle muted flag                                 │
  │     isMuted()      ──► bool                                              │
  │                                                                          │
  │   Module state: ctx, masterGain, muted, lastPlayMs (Map: key → ms)       │
  │                                                                          │
  │   Exports (window.Sound): { all voices + setMuted/isMuted }              │
  │   External deps: WebAudio API (AudioContext / webkitAudioContext),       │
  │                  performance.now                                         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: ctx=null, masterGain=null, muted=F, lastPlayMs=Map()
  ensureCtx()→ctx|null: lazy new (AudioContext||webkitAudioContext); masterGain=createGain@0.32→destination; if suspended→resume; ret ctx
  throttle(key,gap)→bool: now=performance.now; prev=lastPlayMs[key]||0; now-prev<gap→F; lastPlayMs[key]=now; T
  tone(freq,dur,opts={})→void: c=ensure; guard(!c||muted); osc(type=opts.type||'square',freq,detune?); g=gain; osc→g→master; vol=opts.volume??0.16; attack=opts.attack||0.005; env: 0→vol@attack→exp 0.001@dur; start now, stop dur+0.05
  pitchSweep(from,to,dur,opts={}): like tone but freq.setVal(from)→expRamp(max(.01,to))@dur; type=opts.type||'sawtooth'
  noiseBurst(dur,opts={}): bufSz=sampleRate*dur; fill[-1,1] rnd; src→biquad(type=opts.filterType||'bandpass',freq=opts.filterFreq||1500,Q=opts.Q||4)→g→master; vol=opts.volume??0.11; env+start/stop
  click(): tone(140,.04,sq,.13); tone(80,.06,sq,.07,attack=.001)
  melee(): throttle('melee',35); tone(420,.06,sq,.14,attack=.001); tone(180,.08,tri,.08,attack=.001); noiseBurst(.05,bp@2400,Q=3,.04)
  shotgun(): throttle('shot',45); noiseBurst(.18,bp@1300,Q=2.2,.13); tone(78,.10,sine,.13,attack=.002)
  beam(): throttle('beam',60); tone(660,.18,sq,.10,attack=.005); pitchSweep(900,540,.22,saw,.08); tone(1320,.10,tri,.04,attack=.02)
  whirl(): throttle('whirl',80); pitchSweep(180,900,.28,saw,.10); noiseBurst(.28,bp@1800,Q=1.5,.06); tone(220,.22,tri,.06,attack=.02)
  bombLaunch(): throttle('bombLaunch',60); tone(110,.10,sine,.16,attack=.001); pitchSweep(880,480,.35,sine,.05); noiseBurst(.12,bp@600,Q=3,.04)
  bombExplode(): tone(55,.32,sine,.20,attack=.002); noiseBurst(.30,lp@900,Q=.8,.16); pitchSweep(220,80,.30,saw,.10)
  snipe(): throttle('snipe',50); pitchSweep(2200,3600,.07,sq,.09); tone(1800,.05,tri,.05,attack=.001)
  snipeHit(): throttle('snipeHit',35); tone(900,.04,sq,.10,attack=.001); noiseBurst(.03,hp@5000,Q=1,.05)
  chainZap(): throttle('chain',60); tone(880,.06,saw,.10,attack=.001,detune=12); tone(1240,.05,saw,.07,attack=.001,detune=-12); noiseBurst(.08,hp@4500,Q=.8,.05)
  heal(): throttle('heal',60); tone(880,.18,sine,.10,attack=.02); tone(1318,.14,sine,.06,attack=.04); tone(1760,.10,tri,.03,attack=.06)
  shield(): tone(330,.20,sq,.10,attack=.003); tone(660,.16,tri,.05,attack=.02); noiseBurst(.10,bp@3000,Q=1,.04)
  pulseHeal(): tone(659,.18,sq,.12,attack=.005); tone(988,.16,sq,.10,attack=.01); tone(1318,.18,tri,.06,attack=.02)
  adrenaline(): pitchSweep(220,880,.18,saw,.10); noiseBurst(.10,bp@2000,Q=1.5,.05)
  loadedShot(): pitchSweep(140,420,.20,saw,.10); tone(420,.10,tri,.04,attack=.02)
  detonate(): tone(48,.38,sine,.22,attack=.002); noiseBurst(.35,lp@1100,Q=.7,.18); pitchSweep(240,70,.32,saw,.12)
  teleport(): pitchSweep(1200,300,.10,saw,.08); pitchSweep(300,1800,.12,saw,.08)
  rally(): tone(330,.16,sq,.14,attack=.01); tone(415,.16,sq,.12,attack=.012); tone(494,.16,sq,.10,attack=.014); tone(330*2,.18,tri,.05,attack=.02)
  lockdown(): tone(160,.12,sq,.14,attack=.001); tone(320,.18,tri,.07,attack=.02); noiseBurst(.10,bp@800,Q=2,.05)
  vortex(): tone(45,.45,sine,.18,attack=.01); pitchSweep(900,160,.40,saw,.10); noiseBurst(.40,lp@500,Q=.9,.07)
  freeze(): noiseBurst(.24,hp@5500,Q=.7,.07); tone(1318,.20,tri,.07,attack=.02); tone(1568,.16,sine,.05,attack=.04); tone(2093,.14,sine,.04,attack=.06)
  enrage(): pitchSweep(220,140,.30,saw,.14,detune=15); pitchSweep(110,80,.34,saw,.10,detune=-15); noiseBurst(.20,bp@500,Q=1.4,.06)
  start(): tone(330,.12,sq,.16,attack=.003); tone(494,.18,sq,.14,attack=.005); tone(659,.20,tri,.08,attack=.01) @130ms
  botDown(team): team==='player'→tone(110,.30,sine,.18,attack=.002);tone(82,.40,sine,.14,attack=.04);noiseBurst(.20,lp@400,Q=.8,.06); else tone(180,.06,sq,.10,attack=.001);noiseBurst(.05,hp@3000,Q=1,.04)
  roundWon(): notes=[523,659,784]@110ms tone(sq,.20,.16)+tone(*2,tri,.14,.06); +500ms→noiseBurst(.5,hp@4500,Q=.6,.08); +600ms→pitchSweep(800,2200,.4,saw,.08)
  roundLost(): notes=[330,277,220]@140ms tone(sq,.24,.14)+tone(*0.5,sine,.30,.10); +500ms→tone(110,.6,sine,.18,attack=.04)
  cashOut(): notes=[523,659,784,1046,1318]@60ms tone(sq,.18,.14)+tone(*2,tri,.10,.05)
  abandon(): tone(140,.18,sq,.12,attack=.001); tone(280,.20,tri,.07,attack=.02); noiseBurst(.16,bp@900,Q=2,.05); +220ms→tone(220,.16,sine,.10,attack=.04)
  exports: global.Sound={click,melee,shotgun,beam,whirl,bombLaunch,bombExplode,snipe,snipeHit,chainZap,heal,shield,pulseHeal,adrenaline,loadedShot,detonate,teleport,rally,lockdown,vortex,freeze,enrage,start,botDown,roundWon,roundLost,cashOut,abandon,setMuted(m){muted=m},isMuted()→muted}
  no DOMContentLoaded; ctx built lazily on first voice call
*/

(function (global) {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  const lastPlayMs = Object.create(null);

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.32;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function throttle(key, gapMs) {
    const now = performance.now();
    const prev = lastPlayMs[key] || 0;
    if (now - prev < gapMs) return false;
    lastPlayMs[key] = now;
    return true;
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
    const vol = opts.volume == null ? 0.16 : opts.volume;
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
    if (opts.detune) osc.detune.value = opts.detune;
    osc.connect(g);
    g.connect(masterGain);
    const now = c.currentTime;
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, toFreq), now + duration);
    const vol = opts.volume == null ? 0.16 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + (opts.attack || 0.01));
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
    g.gain.linearRampToValueAtTime(opts.volume == null ? 0.11 : opts.volume, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  // ----- UI -----
  function click() {
    tone(140, 0.04, { type: 'square', volume: 0.13 });
    tone(80,  0.06, { type: 'square', volume: 0.07, attack: 0.001 });
  }

  // ----- Combat voices -----
  function melee() {
    if (!throttle('melee', 35)) return;
    tone(420, 0.06, { type: 'square',   volume: 0.14, attack: 0.001 });
    tone(180, 0.08, { type: 'triangle', volume: 0.08, attack: 0.001 });
    noiseBurst(0.05, { filterType: 'bandpass', filterFreq: 2400, Q: 3, volume: 0.04 });
  }

  function shotgun() {
    if (!throttle('shot', 45)) return;
    noiseBurst(0.18, { filterType: 'bandpass', filterFreq: 1300, Q: 2.2, volume: 0.13 });
    tone(78, 0.10, { type: 'sine', volume: 0.13, attack: 0.002 });
  }

  function beam() {
    if (!throttle('beam', 60)) return;
    tone(660, 0.18, { type: 'square', volume: 0.10, attack: 0.005 });
    pitchSweep(900, 540, 0.22, { type: 'sawtooth', volume: 0.08 });
    tone(1320, 0.10, { type: 'triangle', volume: 0.04, attack: 0.02 });
  }

  function whirl() {
    if (!throttle('whirl', 80)) return;
    pitchSweep(180, 900, 0.28, { type: 'sawtooth', volume: 0.10 });
    noiseBurst(0.28, { filterType: 'bandpass', filterFreq: 1800, Q: 1.5, volume: 0.06 });
    tone(220, 0.22, { type: 'triangle', volume: 0.06, attack: 0.02 });
  }

  function bombLaunch() {
    if (!throttle('bombLaunch', 60)) return;
    tone(110, 0.10, { type: 'sine', volume: 0.16, attack: 0.001 });
    pitchSweep(880, 480, 0.35, { type: 'sine', volume: 0.05 });
    noiseBurst(0.12, { filterType: 'bandpass', filterFreq: 600, Q: 3, volume: 0.04 });
  }

  function bombExplode() {
    tone(55, 0.32, { type: 'sine', volume: 0.20, attack: 0.002 });
    noiseBurst(0.30, { filterType: 'lowpass', filterFreq: 900, Q: 0.8, volume: 0.16 });
    pitchSweep(220, 80, 0.30, { type: 'sawtooth', volume: 0.10 });
  }

  function snipe() {
    if (!throttle('snipe', 50)) return;
    pitchSweep(2200, 3600, 0.07, { type: 'square', volume: 0.09 });
    tone(1800, 0.05, { type: 'triangle', volume: 0.05, attack: 0.001 });
  }

  function snipeHit() {
    if (!throttle('snipeHit', 35)) return;
    tone(900, 0.04, { type: 'square', volume: 0.10, attack: 0.001 });
    noiseBurst(0.03, { filterType: 'highpass', filterFreq: 5000, Q: 1, volume: 0.05 });
  }

  function chainZap() {
    if (!throttle('chain', 60)) return;
    tone(880,  0.06, { type: 'sawtooth', volume: 0.10, attack: 0.001, detune: 12  });
    tone(1240, 0.05, { type: 'sawtooth', volume: 0.07, attack: 0.001, detune: -12 });
    noiseBurst(0.08, { filterType: 'highpass', filterFreq: 4500, Q: 0.8, volume: 0.05 });
  }

  function heal() {
    if (!throttle('heal', 60)) return;
    tone(880,  0.18, { type: 'sine',     volume: 0.10, attack: 0.02 });
    tone(1318, 0.14, { type: 'sine',     volume: 0.06, attack: 0.04 });
    tone(1760, 0.10, { type: 'triangle', volume: 0.03, attack: 0.06 });
  }

  // ----- Active-special voices -----
  function shield() {
    tone(330, 0.20, { type: 'square',   volume: 0.10, attack: 0.003 });
    tone(660, 0.16, { type: 'triangle', volume: 0.05, attack: 0.02  });
    noiseBurst(0.10, { filterType: 'bandpass', filterFreq: 3000, Q: 1, volume: 0.04 });
  }

  function pulseHeal() {
    tone(659,  0.18, { type: 'square',   volume: 0.12, attack: 0.005 });
    tone(988,  0.16, { type: 'square',   volume: 0.10, attack: 0.01  });
    tone(1318, 0.18, { type: 'triangle', volume: 0.06, attack: 0.02  });
  }

  function adrenaline() {
    pitchSweep(220, 880, 0.18, { type: 'sawtooth', volume: 0.10 });
    noiseBurst(0.10, { filterType: 'bandpass', filterFreq: 2000, Q: 1.5, volume: 0.05 });
  }

  function loadedShot() {
    pitchSweep(140, 420, 0.20, { type: 'sawtooth', volume: 0.10 });
    tone(420, 0.10, { type: 'triangle', volume: 0.04, attack: 0.02 });
  }

  function detonate() {
    tone(48, 0.38, { type: 'sine', volume: 0.22, attack: 0.002 });
    noiseBurst(0.35, { filterType: 'lowpass', filterFreq: 1100, Q: 0.7, volume: 0.18 });
    pitchSweep(240, 70, 0.32, { type: 'sawtooth', volume: 0.12 });
  }

  function teleport() {
    pitchSweep(1200, 300, 0.10, { type: 'sawtooth', volume: 0.08 });
    setTimeout(() => pitchSweep(300, 1800, 0.12, { type: 'sawtooth', volume: 0.08 }), 90);
  }

  function rally() {
    tone(330, 0.16, { type: 'square',   volume: 0.14, attack: 0.01  });
    tone(415, 0.16, { type: 'square',   volume: 0.12, attack: 0.012 });
    tone(494, 0.16, { type: 'square',   volume: 0.10, attack: 0.014 });
    tone(660, 0.18, { type: 'triangle', volume: 0.05, attack: 0.02  });
  }

  function lockdown() {
    tone(160, 0.12, { type: 'square',   volume: 0.14, attack: 0.001 });
    tone(320, 0.18, { type: 'triangle', volume: 0.07, attack: 0.02  });
    noiseBurst(0.10, { filterType: 'bandpass', filterFreq: 800, Q: 2, volume: 0.05 });
  }

  function vortex() {
    tone(45, 0.45, { type: 'sine', volume: 0.18, attack: 0.01 });
    pitchSweep(900, 160, 0.40, { type: 'sawtooth', volume: 0.10 });
    noiseBurst(0.40, { filterType: 'lowpass', filterFreq: 500, Q: 0.9, volume: 0.07 });
  }

  function freeze() {
    noiseBurst(0.24, { filterType: 'highpass', filterFreq: 5500, Q: 0.7, volume: 0.07 });
    tone(1318, 0.20, { type: 'triangle', volume: 0.07, attack: 0.02 });
    tone(1568, 0.16, { type: 'sine',     volume: 0.05, attack: 0.04 });
    tone(2093, 0.14, { type: 'sine',     volume: 0.04, attack: 0.06 });
  }

  function enrage() {
    pitchSweep(220, 140, 0.30, { type: 'sawtooth', volume: 0.14, detune: 15  });
    pitchSweep(110,  80, 0.34, { type: 'sawtooth', volume: 0.10, detune: -15 });
    noiseBurst(0.20, { filterType: 'bandpass', filterFreq: 500, Q: 1.4, volume: 0.06 });
  }

  // ----- Run / phase voices -----
  function start() {
    tone(330, 0.12, { type: 'square',   volume: 0.16, attack: 0.003 });
    setTimeout(() => {
      tone(494, 0.18, { type: 'square',   volume: 0.14, attack: 0.005 });
      tone(659, 0.20, { type: 'triangle', volume: 0.08, attack: 0.01  });
    }, 130);
  }

  function botDown(team) {
    if (team === 'player') {
      tone(110, 0.30, { type: 'sine', volume: 0.18, attack: 0.002 });
      tone(82,  0.40, { type: 'sine', volume: 0.14, attack: 0.04  });
      noiseBurst(0.20, { filterType: 'lowpass', filterFreq: 400, Q: 0.8, volume: 0.06 });
    } else {
      tone(180, 0.06, { type: 'square', volume: 0.10, attack: 0.001 });
      noiseBurst(0.05, { filterType: 'highpass', filterFreq: 3000, Q: 1, volume: 0.04 });
    }
  }

  function roundWon() {
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq,     0.20, { type: 'square',   volume: 0.16 });
        tone(freq * 2, 0.14, { type: 'triangle', volume: 0.06 });
      }, i * 110);
    });
    setTimeout(() => {
      noiseBurst(0.5, { filterType: 'highpass', filterFreq: 4500, Q: 0.6, volume: 0.08 });
    }, 500);
    setTimeout(() => {
      pitchSweep(800, 2200, 0.4, { type: 'sawtooth', volume: 0.08 });
    }, 600);
  }

  function roundLost() {
    const notes = [330, 277, 220];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq,       0.24, { type: 'square', volume: 0.14 });
        tone(freq * 0.5, 0.30, { type: 'sine',   volume: 0.10 });
      }, i * 140);
    });
    setTimeout(() => {
      tone(110, 0.6, { type: 'sine', volume: 0.18, attack: 0.04 });
    }, 500);
  }

  function cashOut() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        tone(freq,     0.18, { type: 'square',   volume: 0.14 });
        tone(freq * 2, 0.10, { type: 'triangle', volume: 0.05 });
      }, i * 60);
    });
  }

  function abandon() {
    tone(140, 0.18, { type: 'square',   volume: 0.12, attack: 0.001 });
    tone(280, 0.20, { type: 'triangle', volume: 0.07, attack: 0.02  });
    noiseBurst(0.16, { filterType: 'bandpass', filterFreq: 900, Q: 2, volume: 0.05 });
    setTimeout(() => {
      tone(220, 0.16, { type: 'sine', volume: 0.10, attack: 0.04 });
    }, 220);
  }

  global.Sound = {
    click,
    melee, shotgun, beam, whirl,
    bombLaunch, bombExplode,
    snipe, snipeHit, chainZap, heal,
    shield, pulseHeal, adrenaline, loadedShot, detonate,
    teleport, rally, lockdown, vortex, freeze, enrage,
    start, botDown, roundWon, roundLost, cashOut, abandon,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
  };
})(window);
