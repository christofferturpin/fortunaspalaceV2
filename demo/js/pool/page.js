/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  POOL — aim → bend → orbital curve → pool-ball dynamics (cue + 4 reds)   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ canvas mousemove ──► onMove                  │
  │                          │     AIM   → aim + straight preview            │
  │                          │     BEND  → drag pen-tool handle              │
  │                          ├─ canvas mousedown ──► onDown                  │
  │                          │     AIM   → fire straight                     │
  │                          │     BEND  → grab handle                       │
  │                          ├─ window mouseup        ──► release            │
  │                          ├─ #pool-power input     ──► power 0..1         │
  │                          ├─ #pool-shoot click     ──► primaryAction()    │
  │                          ├─ #pool-reset click     ──► resetShot()        │
  │                          ├─ keydown SPACE         ──► primaryAction()    │
  │                          └─ keydown ESC / R       ──► resetShot()        │
  │                                                                          │
  │   rAF ──► loop(t) ──► step(dt) ──► draw()                                │
  │       Phases:                                                            │
  │         AIM           → straight preview (firstHit) hits walls/SQ/reds   │
  │         FIRED         → cue rides precomputed straight trajectory;       │
  │                         slow-mo before contact. On red contact, momentum │
  │                         transfers → MULTI_ROLLING. On wall/SQ contact,   │
  │                         pause → BEND.                                    │
  │         BEND          → drag handle (unclamped); Bezier-ish orbital      │
  │                         preview                                          │
  │         CURVE_FIRED   → cue rides precomputed orbital trajectory;        │
  │                         slow-mo before contact. Any contact (wall/SQ/    │
  │                         red) → MULTI_ROLLING with appropriate response.  │
  │         MULTI_ROLLING → live multi-ball physics with substeps:           │
  │                         advance, wall/SQ resolve, ball-ball elastic      │
  │                         collisions (equal mass), friction. Phase ends    │
  │                         when every ball is below STOP_EPS.               │
  │         STOPPED       → idle until reset                                 │
  │                                                                          │
  │   Multi-ball physics: substeps per frame. Each sub-step advances all     │
  │   balls, clamps to felt bounds (reflect), resolves SQ Minkowski overlap, │
  │   then resolves every pair via line-of-centers swap of normal velocity   │
  │   components. Friction multiplier applied each sub-step.                 │
  │                                                                          │
  │   Exports (window.Pool): { init }                                        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  W=720,H=460,R=11; SQ={x:310,y:180,w:100,h:100}; CUE_HOME=(180,230)
  REDS_HOME=[(250,100),(250,360),(560,100),(560,360)]
  MIN_P=220, MAX_P=900; FRICTION_60=0.987; STOP_EPS=14
  SIM_DT=1/180; SIM_MAX_T=4; SIM_MAX_SAMPLES=900
  SLOW_WINDOW_T=0.22; SLOW_FACTOR=0.22
  HANDLE_DIST=70; HANDLE_R=11; HANDLE_GRAB=R+8
  OMEGA_PER_PX=0.05; OMEGA_MAX=16; CURVE_FRICTION_60=0.997
  ROLL_SUBSTEPS=4
  state: cue{x,y,vx,vy}, reds[]{x,y,vx,vy}, mouse, aimAng, power
         phase∈{AIM,FIRED,BEND,CURVE_FIRED,MULTI_ROLLING,STOPPED}
         preview, previewTraj, trajectory, flightTime, totalFlightTime,
         finalSpeed, finalVel, contact{px,py,nx,ny,target,redIndex}
         naturalDir, handle{x,y}, dragging
  firstHit(ox,oy,udx,udy)→hit: walls + SQ Minkowski + all reds (ray-circle)
  ballBallCollide(b1,b2): along line of centers; equal mass swap of normal v
  resolveBallVsBox(ball): wall reflect on out-of-bounds
  resolveBallVsCircle(ball): if inside Minkowski box, push out shortest axis,
    reflect normal velocity component
  physicsStep(dt): ROLL_SUBSTEPS sub-steps {advance all, clamp walls, SQ,
    pair-resolve all pairs, friction *cue *reds}
  fire(): sim=simulateStraight; phase=FIRED
  commitCurve(): sim=simulateCircular; phase=CURVE_FIRED
  step(dt) FIRED: stepTrajectory(dt, onArrive: red→ballCollide+MULTI, else BEND)
  step(dt) CURVE_FIRED: stepTrajectory(dt, onArrive: red→ballCollide+MULTI,
    else reflect+MULTI)
  step(dt) MULTI_ROLLING: physicsStep(dt); allStopped→STOPPED
  exports: window.Pool={init}; on DOMContentLoaded→init
*/

(function () {
  'use strict';

  const W = 900, H = 580, R = 14;
  const CIRC = { cx: 450, cy: 290, r: 62 };
  const CUE_HOME = { x: 210, y: 290 };
  const WALL_THICK = 5;
  const WALL_COLORS = {
    north: '#8a1a1a',
    east:  '#2848a0',
    south: '#1a6a30',
    west:  '#a08a28'
  };
  const WALL_GLOW_RGB = {
    north: '255, 60, 60',
    east:  '60, 130, 255',
    south: '40, 230, 80',
    west:  '255, 220, 40'
  };
  const WALL_GLOW_DEPTH = 56; // inward bloom from each rail
  const BALL_GRADIENTS = {
    red:    ['#ffe2d0', '#ff3a3a', '#7a0a0a'],
    blue:   ['#dceeff', '#3a82ff', '#101e6a'],
    green:  ['#dcffd8', '#22e054', '#0a4a18'],
    yellow: ['#fff8c8', '#ffe040', '#6a4a08']
  };
  const CUE_GRADIENT = ['#fff8e0', '#f0e2b8', '#a08868'];
  const BALL_GLOW_RGB = {
    red:    '255, 60, 60',
    blue:   '60, 130, 255',
    green:  '40, 230, 80',
    yellow: '255, 220, 40'
  };
  // Compass arrangement: north (top) red, east (right) blue, south (bottom)
  // green, west (left) yellow.
  const REDS_HOME = [
    { x: 450, y:  78, color: 'red' },     // north
    { x: 836, y: 290, color: 'blue' },    // east
    { x: 450, y: 502, color: 'green' },   // south
    { x:  64, y: 290, color: 'yellow' }   // west
  ];
  const COLOR_WALL = { red: 'north', blue: 'east', green: 'south', yellow: 'west' };
  const MIN_P = 40, MAX_P = 940; // slider 0 → ~none, 100 → very fast
  const FRICTION_60 = 0.987;
  const STOP_EPS = 14;
  const SIM_DT = 1 / 180;
  const SIM_MAX_T = 4.0;
  const SIM_MAX_SAMPLES = 900;
  const SLOW_WINDOW_T = 0.22;
  const SLOW_FACTOR = 0.22;
  const HANDLE_DIST = 84;
  const HANDLE_R = 13;
  const HANDLE_GRAB = HANDLE_R + 10;
  const HANDLE_SENS = 0.45;   // drag-to-handle gain (lower = less twitchy)
  const PERP_DEADZONE = 14;   // px of perpendicular drag before any curve starts
  const OMEGA_PER_PX = 0.020;
  const OMEGA_MAX = 7.5;
  const RED_HIT_BOOST = 1.25;
  const RED_BALL_MASS = 1.5; // cue mass = 1; colored balls heavier
  const CURVE_FRICTION_60 = 0.997;
  const MIN_PULL = 1.5;
  const ROLL_SUBSTEPS = 4;
  const TRAIL_MAX = 36;
  const TRAIL_MIN_DIST = 3.5;     // px between trail samples
  const TRAIL_SPEED_MAX = 550;    // px/s used to normalize trail width / alpha
  // Sheds applied every N frames instead of every frame so the tail lingers
  // longer after the orb comes to rest. Trail still fades visually because
  // older samples ramp down via the tapered alpha at the head of the line.
  const TRAIL_SHED_EVERY = 2;
  const TOUCH_COOLDOWN_MS = 280;
  const SCORE_FLASH_S = 0.45;
  const HIT_FLASH_S   = 0.35;
  const SPIN_UP_DUR   = 0.34;
  const GAMEOVER_HOLD_MIN_S = 0.4; // at minimum, give the event burst time
  const GAMEOVER_HOLD_MAX_S = 4.0; // safety cap if a ball gets stuck rolling
  const FINAL_FLASH_DUR    = 1.6;  // big score reveal duration

  const state = {
    canvas: null,
    ctx: null,
    cue: { x: CUE_HOME.x, y: CUE_HOME.y, vx: 0, vy: 0, trail: [] },
    reds: REDS_HOME.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0, color: p.color, lastTouchT: -Infinity, lit: true, trail: [], poofed: false })),
    mouse: { x: CUE_HOME.x + 80, y: CUE_HOME.y, over: false },
    aimAng: 0,
    power: 0.55,
    phase: 'AIM',
    preview: null,
    previewTraj: null,
    trajectory: null,
    flightTime: 0,
    totalFlightTime: 0,
    finalSpeed: 0,
    finalVel: { x: 0, y: 0 },
    contact: null,
    naturalDir: { x: 1, y: 0 },
    handle: { x: 0, y: 0 },
    dragAnchorMouse: { x: 0, y: 0 },
    dragAnchorHandle: { x: 0, y: 0 },
    dragging: false,
    lastT: 0,
    pendingRedImpulses: null,
    score: 0,
    combo: 0,
    particles: [],
    rings: [],
    lastScoreTime: -Infinity,
    lastHitTime: -Infinity,
    gameOver: false,
    replay: { frames: [], events: [], recording: false, playbackIndex: 0, eventIdx: 0 },
    replayPendingAt: null,
    endReason: '',
    spinUpStart: 0,
    spinUpEnd: 0,
    nextSpinSparkAt: 0,
    lastBentRedIndex: -1,
    gameOverT0: 0,
    scoreFlashFired: false,
    scoreFlashAt: 0,
    feltImage: null,
    bet: 10,
    runStaked: false,
    runPayout: 0,
    quotes: [],
    lastQuoteMilestone: 0
  };

  // ---- audio: procedural mystical sfx ---------------------------------------
  // Synthesized via WebAudio so there's nothing to ship — just oscillators,
  // gain envelopes, and a sprinkle of harmonics.

  const sfx = { ctx: null, master: null, enabled: true };

  function ensureAudio() {
    if (!sfx.enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { sfx.enabled = false; return null; }
    if (!sfx.ctx) {
      sfx.ctx = new AC();
      sfx.master = sfx.ctx.createGain();
      sfx.master.gain.value = 0.55;
      sfx.master.connect(sfx.ctx.destination);
    }
    if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
    return sfx.ctx;
  }

  function sfxTone(freq, dur, type, vol, attack) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const a = attack || 0.004;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(sfx.master);
    o.start(now); o.stop(now + dur + 0.04);
  }

  function sfxSweep(f0, f1, dur, type, vol) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sawtooth';
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(sfx.master);
    o.start(now); o.stop(now + dur + 0.04);
  }

  function sfxNoise(dur, vol, lowpassHz) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufLen = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpassHz || 1800;
    const g = ctx.createGain();
    g.gain.value = vol || 0.12;
    src.connect(lp); lp.connect(g); g.connect(sfx.master);
    src.start(now); src.stop(now + dur + 0.02);
  }

  const SCORE_FREQS = { red: 523.25, blue: 392.00, green: 659.26, yellow: 587.33 };

  function sfxHit() {
    sfxTone(880, 0.18, 'sine', 0.14);
    sfxTone(1320, 0.12, 'sine', 0.06);
    sfxTone(1760, 0.08, 'sine', 0.04);
  }

  function sfxScore(color) {
    const f = SCORE_FREQS[color] || 523.25;
    sfxTone(f, 0.55, 'sine', 0.14);
    sfxTone(f * 2, 0.42, 'sine', 0.07);
    sfxTone(f * 3, 0.28, 'triangle', 0.04);
  }

  function sfxLaunch() {
    sfxSweep(110, 480, 0.34, 'sawtooth', 0.12);
    sfxTone(660, 0.18, 'sine', 0.10, 0.002);
    sfxNoise(0.18, 0.05, 2400);
  }

  function sfxPoof() {
    sfxSweep(900, 60, 0.42, 'triangle', 0.18);
    sfxNoise(0.32, 0.16, 1200);
    sfxTone(1760, 0.25, 'sine', 0.08);
  }

  function sfxRelight() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const seq = [523.25, 659.26, 783.99, 1046.50];
    for (let i = 0; i < seq.length; i++) {
      const t = sfx.ctx.currentTime + i * 0.07;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = seq[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(sfx.master);
      o.start(t); o.stop(t + 0.55);
    }
  }

  function sfxGameOverIron() {
    sfxSweep(220, 55, 1.1, 'sawtooth', 0.20);
    sfxTone(82.4, 1.2, 'sine', 0.16);
    sfxNoise(0.6, 0.12, 600);
  }

  function sfxGameOverCueStop() {
    sfxSweep(440, 110, 0.8, 'triangle', 0.16);
    sfxTone(165, 0.9, 'sine', 0.12);
  }

  function sfxScoreFlash() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const chord = [523.25, 659.26, 783.99, 1046.50];
    for (let i = 0; i < chord.length; i++) {
      const f = chord[i];
      const t = sfx.ctx.currentTime + i * 0.06;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); g.connect(sfx.master);
      o.start(t); o.stop(t + 1.15);
      // Octave harmonic
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'triangle';
      o2.frequency.value = f * 2;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o2.connect(g2); g2.connect(sfx.master);
      o2.start(t); o2.stop(t + 0.75);
    }
  }

  function sfxContact(intensity) {
    const t = Math.min(1, intensity / 600);
    const freq = 200 + 400 * t;
    sfxTone(freq, 0.10 + 0.08 * t, 'triangle', 0.05 + 0.06 * t);
  }

  // ---- helpers: time / random placement / effects ---------------------------

  function nowMs() { return state.lastT || performance.now(); }
  function nowSec() { return nowMs() / 1000; }

  // Payout table — first five hits drip back the stake (0.20 each = 1.0×
  // total) so combo 5 is the BREAK-EVEN line. From combo 6 onward each hit
  // adds a small linear bump so even long chains stay modest:
  //   1..5 → 0.20 each       (cum 0.20, 0.40, 0.60, 0.80, 1.00)
  //   6+   → (combo-5) × 0.05  (6→0.05, 7→0.10, 8→0.15, 9→0.20, 10→0.25, …)
  // Cumulative at combo 11 is roughly 2× stake.
  function comboMultiplier(combo) {
    if (combo <= 0) return 0;
    if (combo <= 5) return 0.20;
    return (combo - 5) * 0.05;
  }

  function readBet() {
    const el = document.getElementById('pool-bet');
    if (!el) return 0;
    const v = parseInt(el.value, 10);
    return isFinite(v) && v > 0 ? v : 0;
  }

  function loadCovenQuotes() {
    if (!window.fetch) return;
    fetch('../assets/covenquotes.json')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && Array.isArray(data.quotes)) state.quotes = data.quotes;
      })
      .catch(() => { /* offline / file:// — quietly no quotes */ });
  }

  function dropQuote() {
    if (!state.quotes || !state.quotes.length) return;
    const layer = document.getElementById('pool-quote-layer');
    if (!layer) return;
    const text = state.quotes[Math.floor(Math.random() * state.quotes.length)];
    const el = document.createElement('div');
    el.className = 'pool-quote';
    el.textContent = text;
    // Random position in the quote layer; keep clear of dead-center so
    // it doesn't crowd the canvas area too aggressively.
    const left = 4 + Math.random() * 78;     // percent
    const top  = 8 + Math.random() * 84;
    el.style.left = left.toFixed(2) + '%';
    el.style.top  = top.toFixed(2) + '%';
    el.style.setProperty('--rot', ((Math.random() - 0.5) * 10).toFixed(2) + 'deg');
    layer.appendChild(el);
  }

  function clearQuotes() {
    const layer = document.getElementById('pool-quote-layer');
    if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild);
    state.lastQuoteMilestone = 0;
  }

  // Drop a quote every 4 successful scores (~every 25%) — call after a
  // score updates state.score (live or replay).
  function maybeDropQuoteForScore() {
    const milestone = Math.floor(state.score / 4);
    if (milestone > state.lastQuoteMilestone) {
      state.lastQuoteMilestone = milestone;
      dropQuote();
    }
  }

  function refreshBetDisplay() {
    const balEl = document.getElementById('pool-balance');
    const payEl = document.getElementById('pool-payout');
    const multEl = document.getElementById('pool-mult');
    if (balEl) balEl.textContent = (window.Wallet ? window.Wallet.getBalance() : '—');
    if (payEl) payEl.textContent = state.runPayout;
    if (multEl) {
      const m = comboMultiplier(Math.max(1, state.combo + 1));
      multEl.textContent = m.toFixed(2);
    }
  }

  function pickRandomCuePosition() {
    const margin = 28;
    const minBallDist = 2 * R + 28;
    const minCircleDist = R + CIRC.r + 26;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = R + margin + Math.random() * (W - 2 * (R + margin));
      const y = R + margin + Math.random() * (H - 2 * (R + margin));
      const dxc = x - CIRC.cx, dyc = y - CIRC.cy;
      if (dxc * dxc + dyc * dyc < minCircleDist * minCircleDist) continue;
      let bad = false;
      for (let i = 0; i < REDS_HOME.length; i++) {
        const b = REDS_HOME[i];
        const dxb = x - b.x, dyb = y - b.y;
        if (dxb * dxb + dyb * dyb < minBallDist * minBallDist) { bad = true; break; }
      }
      if (!bad) return { x: x, y: y };
    }
    return { x: CUE_HOME.x, y: CUE_HOME.y };
  }

  function spawnRing(x, y, color, maxR, lifeS) {
    state.rings.push({
      x: x, y: y, r: 4, maxR: maxR || 70,
      life: 0, maxLife: lifeS || 0.55,
      color: color
    });
  }

  function spawnParticles(x, y, color, n, baseSpeed) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = baseSpeed * (0.5 + Math.random() * 1.0);
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.3,
        color: color,
        size: 1.4 + Math.random() * 1.4,
        tail: 9 + Math.random() * 7
      });
    }
  }

  // Symmetric radial spark burst — n evenly-angled streaks. Reads "metal on
  // metal" much better than the random scatter of spawnParticles.
  function spawnStarburst(x, y, color, n, speed, tail) {
    const jitter = Math.PI / n * 0.4;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * jitter;
      const sp = speed * (0.85 + Math.random() * 0.3);
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.15,
        color: color,
        size: 2.2,
        tail: tail || 14
      });
    }
  }

  // Quick angular cross — 4 long bright spokes that snap outward and fade.
  function spawnImpactCross(x, y, color, len) {
    const L = len || 26;
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (let i = 0; i < 4; i++) {
      const ang = angles[i] + (Math.random() - 0.5) * 0.5;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * 380,
        vy: Math.sin(ang) * 380,
        life: 0,
        maxLife: 0.22,
        color: color,
        size: 2.8,
        tail: L
      });
    }
  }

  function updateEffects(dt) {
    if (state.particles.length) {
      const surviving = [];
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life += dt;
        if (p.life < p.maxLife) surviving.push(p);
      }
      state.particles = surviving;
    }
    if (state.rings.length) {
      const surviving = [];
      for (let i = 0; i < state.rings.length; i++) {
        const r = state.rings[i];
        r.life += dt;
        r.r = 4 + (r.maxR - 4) * (r.life / r.maxLife);
        if (r.life < r.maxLife) surviving.push(r);
      }
      state.rings = surviving;
    }
  }

  // ---- effect bundles (called by both live play and replay) -----------------

  function fxScore(x, y, ballColor, wallSide) {
    const wallC = WALL_COLORS[wallSide] || '#f0e3c4';
    const stops = BALL_GRADIENTS[ballColor] || ['#f0e3c4', '#b81616', '#3a0a0a'];
    spawnRing(x, y, '#f0e3c4', 70, 0.45);
    spawnRing(x, y, wallC, 110, 0.6);
    spawnStarburst(x, y, '#fff5d6', 10, 360, 22);
    spawnStarburst(x, y, wallC, 8, 280, 18);
    spawnParticles(x, y, stops[1], 12, 260);
    spawnParticles(x, y, '#f0e3c4', 8, 320);
    spawnImpactCross(x, y, '#fff5d6', 30);
    sfxScore(ballColor);
  }

  function fxHit(x, y, ballColor) {
    const stops = BALL_GRADIENTS[ballColor] || ['#f0e3c4'];
    spawnRing(x, y, '#fff5d6', 60, 0.32);
    spawnStarburst(x, y, '#fff5d6', 8, 320, 18);
    spawnStarburst(x, y, stops[1], 6, 240, 14);
    spawnParticles(x, y, '#f0e3c4', 8, 280);
    spawnImpactCross(x, y, '#fff5d6', 22);
    sfxHit();
  }

  function fxLaunch(x, y, ang) {
    spawnRing(x, y, '#fff5d6', 42, 0.28);
    spawnImpactCross(x, y, '#fff5d6', 18);
    for (let i = 0; i < 12; i++) {
      const a = ang + (Math.random() - 0.5) * 0.85;
      const sp = 260 + Math.random() * 200;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.15,
        color: '#fff5d6',
        size: 1.8,
        tail: 16
      });
    }
    sfxLaunch();
  }

  // Ball-on-ball impact spark. Scales spoke count + brightness with the
  // relative normal speed at contact (`intensity`, px/s).
  function fxRelight(balls) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      spawnRing(b.x, b.y, '#fff5d6', R * 4.0, 0.55);
      spawnStarburst(b.x, b.y, '#fff5d6', 10, 240, 16);
    }
    sfxRelight();
  }

  // Mark the ball with the given color as unlit. If all four are unlit, relight
  // every ball (cycle reset) and fire the relight burst.
  function dimBallByColor(color) {
    for (let i = 0; i < state.reds.length; i++) {
      if (state.reds[i].color === color) {
        state.reds[i].lit = false;
        break;
      }
    }
    let anyLit = false;
    for (let i = 0; i < state.reds.length; i++) {
      if (state.reds[i].lit) { anyLit = true; break; }
    }
    if (!anyLit) {
      for (let i = 0; i < state.reds.length; i++) state.reds[i].lit = true;
      fxRelight(state.reds);
    }
  }

  function fxContact(x, y, intensity) {
    const n = Math.max(3, Math.min(8, Math.floor(intensity / 70)));
    const speed = 160 + intensity * 0.35;
    spawnStarburst(x, y, '#fff5d6', n, speed, 8 + n);
    spawnParticles(x, y, '#d8c8a8', Math.max(2, n - 2), speed * 0.8);
    sfxContact(intensity);
  }

  function fxGameOver(x, y) {
    spawnRing(x, y, '#f0e3c4', 220, 0.85);
    spawnRing(x, y, '#b81616', 170, 0.7);
    spawnStarburst(x, y, '#fff5d6', 16, 460, 30);
    spawnStarburst(x, y, '#b81616', 12, 380, 26);
    spawnParticles(x, y, '#b81616', 22, 400);
    spawnParticles(x, y, '#f0e3c4', 14, 340);
    spawnImpactCross(x, y, '#fff5d6', 48);
    sfxGameOverIron();
  }

  function fxBallPoof(x, y, color) {
    const rgb = BALL_GLOW_RGB[color] || '240, 220, 180';
    spawnRing(x, y, '#fff5d6', 110, 0.55);
    spawnRing(x, y, 'rgba(' + rgb + ', 0.9)', 80, 0.45);
    spawnStarburst(x, y, '#fff5d6', 16, 380, 26);
    spawnStarburst(x, y, 'rgba(' + rgb + ', 1)', 12, 300, 20);
    spawnParticles(x, y, 'rgba(' + rgb + ', 1)', 18, 280);
    spawnParticles(x, y, '#fff5d6', 12, 230);
    spawnImpactCross(x, y, '#fff5d6', 36);
    sfxPoof();
  }

  // DOUBLE-UP bonus burst — combo 8 milestone reward (player gets 2× their
  // stake on top of the normal hit payout). Big celebratory bone+gold blast.
  function fxDoubleUp(x, y) {
    spawnRing(x, y, '#fff5d6', 180, 0.75);
    spawnRing(x, y, '#c8a050', 130, 0.7);
    spawnStarburst(x, y, '#fff5d6', 20, 500, 36);
    spawnStarburst(x, y, '#c8a050', 14, 380, 28);
    spawnParticles(x, y, '#c8a050', 22, 380);
    spawnParticles(x, y, '#fff5d6', 18, 440);
    spawnImpactCross(x, y, '#fff5d6', 60);
    sfxScoreFlash();
  }

  function fxScoreFlash() {
    const cx = W / 2, cy = H / 2;
    spawnRing(cx, cy, '#fff5d6', 460, 0.7);
    spawnRing(cx, cy, '#c8a050', 360, 0.75);
    spawnStarburst(cx, cy, '#fff5d6', 22, 520, 38);
    spawnStarburst(cx, cy, '#c8a050', 16, 420, 30);
    spawnParticles(cx, cy, '#c8a050', 24, 380);
    spawnParticles(cx, cy, '#fff5d6', 18, 440);
    spawnImpactCross(cx, cy, '#fff5d6', 80);
    sfxScoreFlash();
  }

  function fxCueStop(x, y) {
    spawnRing(x, y, '#f0e3c4', 130, 0.7);
    spawnRing(x, y, '#7a6048', 90, 0.55);
    spawnStarburst(x, y, '#fff5d6', 12, 260, 22);
    spawnParticles(x, y, '#d8c8a8', 14, 220);
    spawnImpactCross(x, y, '#fff5d6', 30);
    sfxGameOverCueStop();
  }

  function recordReplayEvent(type, data) {
    if (!state.replay.recording) return;
    const evt = { frame: state.replay.frames.length, type: type };
    for (const k in data) evt[k] = data[k];
    state.replay.events.push(evt);
  }

  function fireReplayEvent(evt) {
    switch (evt.type) {
      case 'score':
        fxScore(evt.x, evt.y, evt.color, evt.wallSide);
        state.lastScoreTime = nowSec();
        dimBallByColor(evt.color);
        // Replay-time accumulation so the centre tally counts up.
        state.score += 1;
        state.combo += 1;
        state.runPayout += (evt.payout || 0);
        maybeDropQuoteForScore();
        refreshBetDisplay();
        updateUI();
        break;
      case 'hit':
        fxHit(evt.x, evt.y, evt.color);
        state.lastHitTime = nowSec();
        break;
      case 'launch':
        fxLaunch(evt.x, evt.y, evt.ang);
        break;
      case 'gameover':
        fxGameOver(evt.x, evt.y);
        state.combo = 0;
        updateUI();
        break;
      case 'cuestop':
        fxCueStop(evt.x, evt.y);
        state.combo = 0;
        updateUI();
        break;
      case 'scoreflash':
        fxScoreFlash();
        break;
      case 'poof':
        fxBallPoof(evt.x, evt.y, evt.color);
        if (typeof evt.index === 'number' && state.reds[evt.index]) {
          state.reds[evt.index].poofed = true;
        }
        break;
      case 'contact':
        fxContact(evt.x, evt.y, evt.intensity);
        break;
    }
  }

  function captureReplayFrame(force) {
    if (!state.replay.recording) return;
    const eps = 0.4;
    const frames = state.replay.frames;
    if (!force && frames.length > 0) {
      const last = frames[frames.length - 1];
      let moved = (Math.abs(last.cueX - state.cue.x) > eps ||
                   Math.abs(last.cueY - state.cue.y) > eps);
      if (!moved) {
        for (let i = 0; i < state.reds.length; i++) {
          if (Math.abs(last.reds[i].x - state.reds[i].x) > eps ||
              Math.abs(last.reds[i].y - state.reds[i].y) > eps) {
            moved = true;
            break;
          }
        }
      }
      if (!moved) return;
    }
    const reds = [];
    for (let i = 0; i < state.reds.length; i++) {
      reds.push({ x: state.reds[i].x, y: state.reds[i].y });
    }
    frames.push({ cueX: state.cue.x, cueY: state.cue.y, reds: reds });
  }

  function startReplay() {
    if (!state.replay.frames || state.replay.frames.length < 6) return;
    state.replay.recording = false;
    state.replay.playbackIndex = 0;
    state.replay.eventIdx = 0;
    state.particles = [];
    state.rings = [];
    for (let i = 0; i < state.reds.length; i++) {
      state.reds[i].lit = true;
      state.reds[i].trail = [];
      state.reds[i].poofed = false;
    }
    // Replay-time counters reset so the centre tally + payout tick up as
    // the recorded events fire. Wallet is NOT touched during replay.
    state.score = 0;
    state.combo = 0;
    state.runPayout = 0;
    state.cue.trail = [];
    clearQuotes();
    refreshBetDisplay();
    state.phase = 'REPLAY';
    updateUI();
  }

  function endGame(hitPoint, reason) {
    if (state.gameOver) return;
    state.gameOver = true;
    state.endReason = reason || 'iron';
    state.combo = 0;
    state.cue.vx = 0; state.cue.vy = 0;
    // NOTE: reds keep their velocities — physics during HOLD lets lingering
    // motion resolve naturally before the score flash.
    state.phase = 'GAME_OVER';
    state.gameOverT0 = nowSec();
    state.scoreFlashFired = false;
    const px = hitPoint ? hitPoint.x : CIRC.cx;
    const py = hitPoint ? hitPoint.y : CIRC.cy;
    if (reason === 'cue-stop') {
      fxCueStop(px, py);
      recordReplayEvent('cuestop', { x: px, y: py });
    } else {
      fxGameOver(px, py);
      recordReplayEvent('gameover', { x: px, y: py });
    }
    captureReplayFrame();
    updateUI();
  }

  function init() {
    state.canvas = document.getElementById('pool-canvas');
    state.ctx = state.canvas.getContext('2d');

    // Load the wizard's-book felt texture. Rendered as a stretched background
    // before any other layer; falls back to the ink color if the image hasn't
    // loaded yet.
    state.feltImage = new Image();
    state.feltImage.src = '../assets/images/tablepool.jpg';

    // HiDPI: keep the logical drawing space at W × H but inflate the backing
    // store to device pixels so balls render sharp on Retina / 4K displays.
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== 1) {
      state.canvas.style.width = W + 'px';
      state.canvas.style.height = H + 'px';
      state.canvas.width = Math.round(W * dpr);
      state.canvas.height = Math.round(H * dpr);
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    state.ctx.imageSmoothingEnabled = true;
    state.ctx.imageSmoothingQuality = 'high';

    state.canvas.addEventListener('mousemove', onMove);
    state.canvas.addEventListener('mouseenter', () => { state.mouse.over = true; });
    state.canvas.addEventListener('mouseleave', () => { state.mouse.over = false; });
    state.canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    const slider = document.getElementById('pool-power');
    const sliderVal = document.getElementById('pool-power-val');
    slider.addEventListener('input', () => {
      state.power = slider.value / 100;
      sliderVal.textContent = slider.value;
    });
    state.power = slider.value / 100;
    sliderVal.textContent = slider.value;

    document.getElementById('pool-shoot').addEventListener('click', primaryAction);
    document.getElementById('pool-reset').addEventListener('click', resetShot);

    // Bet input — clamp to wallet balance and refresh the displayed mult.
    const betEl = document.getElementById('pool-bet');
    if (betEl) {
      betEl.addEventListener('input', () => {
        state.bet = readBet();
        refreshBetDisplay();
      });
      state.bet = readBet();
    }
    if (window.Wallet && typeof window.Wallet.onChange === 'function') {
      window.Wallet.onChange(refreshBetDisplay);
    }
    refreshBetDisplay();
    loadCovenQuotes();
    window.addEventListener('keydown', (e) => {
      ensureAudio();
      if (e.code === 'Space') { e.preventDefault(); primaryAction(); }
      else if (e.code === 'Escape' || e.code === 'KeyR') resetShot();
    });

    const home = pickRandomCuePosition();
    state.cue.x = home.x;
    state.cue.y = home.y;
    state.aimAng = Math.atan2(CIRC.cy - state.cue.y, CIRC.cx - state.cue.x);
    updateUI();
    requestAnimationFrame(loop);
  }

  function canvasPt(e) {
    const rect = state.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  }

  function onMove(e) {
    const p = canvasPt(e);
    state.mouse.x = p.x; state.mouse.y = p.y;
    if (state.phase === 'AIM') {
      const dx = p.x - state.cue.x, dy = p.y - state.cue.y;
      if (dx * dx + dy * dy > 4) state.aimAng = Math.atan2(dy, dx);
    } else if (state.phase === 'BEND' && state.dragging) {
      const dx = p.x - state.dragAnchorMouse.x;
      const dy = p.y - state.dragAnchorMouse.y;
      state.handle.x = state.dragAnchorHandle.x + dx * HANDLE_SENS;
      state.handle.y = state.dragAnchorHandle.y + dy * HANDLE_SENS;
      clampHandle();
    }
  }

  function onDown(e) {
    ensureAudio();
    if (state.phase === 'AIM') { fire(); return; }
    if (state.phase === 'BEND') {
      const p = canvasPt(e);
      if (Math.hypot(p.x - state.handle.x, p.y - state.handle.y) <= HANDLE_GRAB) {
        state.dragging = true;
        state.dragAnchorMouse.x = p.x;
        state.dragAnchorMouse.y = p.y;
        state.dragAnchorHandle.x = state.handle.x;
        state.dragAnchorHandle.y = state.handle.y;
      }
    }
  }

  function onUp() { state.dragging = false; }

  // Keep the bend handle on the felt so it never gets stuck under the header
  // or the page chrome where the player can't grab it.
  function clampHandle() {
    const margin = HANDLE_R + 4;
    if (state.handle.x < margin) state.handle.x = margin;
    else if (state.handle.x > W - margin) state.handle.x = W - margin;
    if (state.handle.y < margin) state.handle.y = margin;
    else if (state.handle.y > H - margin) state.handle.y = H - margin;
  }

  function firstHit(ox, oy, udx, udy, skipReds) {
    let best = null;

    let tWall = Infinity, nWallX = 0, nWallY = 0;
    if (udx > 1e-9) {
      const t = (W - R - ox) / udx;
      if (t > 1e-6 && t < tWall) { tWall = t; nWallX = -1; nWallY = 0; }
    } else if (udx < -1e-9) {
      const t = (R - ox) / udx;
      if (t > 1e-6 && t < tWall) { tWall = t; nWallX = 1; nWallY = 0; }
    }
    if (udy > 1e-9) {
      const t = (H - R - oy) / udy;
      if (t > 1e-6 && t < tWall) { tWall = t; nWallX = 0; nWallY = -1; }
    } else if (udy < -1e-9) {
      const t = (R - oy) / udy;
      if (t > 1e-6 && t < tWall) { tWall = t; nWallX = 0; nWallY = 1; }
    }
    if (tWall < Infinity) best = { t: tWall, nx: nWallX, ny: nWallY, target: 'wall' };

    // Inner circle (Minkowski sum: ray vs circle of radius r+R)
    {
      const CR = CIRC.r + R;
      const dxc = ox - CIRC.cx, dyc = oy - CIRC.cy;
      const b = dxc * udx + dyc * udy;
      const c = dxc * dxc + dyc * dyc - CR * CR;
      if (c >= -1e-6) {
        const disc = b * b - c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t1 = -b - sq;
          if (t1 > 1e-6 && (!best || t1 < best.t)) {
            const px = ox + udx * t1;
            const py = oy + udy * t1;
            const nx = (px - CIRC.cx) / CR;
            const ny = (py - CIRC.cy) / CR;
            best = { t: t1, nx: nx, ny: ny, target: 'circle' };
          }
        }
      }
    }

    // Reds (ray vs circle, Minkowski radius = 2R). Skipped during the curve
    // simulation, because reds will be rolling live by the time the cue rides
    // its precomputed orbital path — predicted red contacts would be phantom.
    if (skipReds) {
      if (!best) return null;
      best.px = ox + udx * best.t;
      best.py = oy + udy * best.t;
      return best;
    }
    const RR = 2 * R, RR2 = RR * RR;
    for (let i = 0; i < state.reds.length; i++) {
      const red = state.reds[i];
      if (red.poofed) continue;
      const dxc = ox - red.x, dyc = oy - red.y;
      const b = dxc * udx + dyc * udy;
      const c = dxc * dxc + dyc * dyc - RR2;
      if (c < -1e-6) continue; // origin inside red
      const disc = b * b - c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const t1 = -b - sq;
      if (t1 > 1e-6 && (!best || t1 < best.t)) {
        const px = ox + udx * t1;
        const py = oy + udy * t1;
        const nx = (px - red.x) / RR;
        const ny = (py - red.y) / RR;
        best = { t: t1, nx: nx, ny: ny, target: 'red', redIndex: i };
      }
    }

    if (!best) return null;
    best.px = ox + udx * best.t;
    best.py = oy + udy * best.t;
    return best;
  }

  function reflect(dx, dy, nx, ny) {
    const dot = dx * nx + dy * ny;
    return { x: dx - 2 * dot * nx, y: dy - 2 * dot * ny };
  }

  function simulateStraight(ox, oy, udx, udy, speed) {
    const samples = [];
    let x = ox, y = oy;
    let vx = udx * speed, vy = udy * speed;
    let t = 0;
    samples.push({ x: x, y: y, t: t, vx: vx, vy: vy });
    while (t < SIM_MAX_T && samples.length < SIM_MAX_SAMPLES) {
      const sp = Math.hypot(vx, vy);
      if (sp < 1) break;
      const px = x, py = y;
      x += vx * SIM_DT;
      y += vy * SIM_DT;
      t += SIM_DT;
      const segdx = x - px, segdy = y - py;
      const seglen = Math.hypot(segdx, segdy);
      if (seglen > 1e-6) {
        const sdx = segdx / seglen, sdy = segdy / seglen;
        const hit = firstHit(px, py, sdx, sdy);
        if (hit && hit.t <= seglen + 0.25) {
          samples.push({ x: hit.px, y: hit.py, t: t, vx: vx, vy: vy });
          return { samples: samples, contact: hit };
        }
      }
      samples.push({ x: x, y: y, t: t, vx: vx, vy: vy });
    }
    return null;
  }

  function simulateCircular(P0, handle, naturalDir, speed) {
    const pullX = handle.x - P0.x;
    const pullY = handle.y - P0.y;
    const pullDist = Math.hypot(pullX, pullY);

    let initialDx, initialDy;
    let omega;
    if (pullDist < MIN_PULL) {
      initialDx = naturalDir.x;
      initialDy = naturalDir.y;
      omega = 0;
    } else {
      initialDx = pullX / pullDist;
      initialDy = pullY / pullDist;
      const perpNatX = -naturalDir.y, perpNatY = naturalDir.x;
      const perpComp = pullX * perpNatX + pullY * perpNatY;
      const dead = PERP_DEADZONE;
      let effPerp = 0;
      if (perpComp > dead)      effPerp = perpComp - dead;
      else if (perpComp < -dead) effPerp = perpComp + dead;
      omega = effPerp * OMEGA_PER_PX;
      if (omega > OMEGA_MAX) omega = OMEGA_MAX;
      else if (omega < -OMEGA_MAX) omega = -OMEGA_MAX;
    }

    const samples = [];
    let x = P0.x, y = P0.y;
    let vx = initialDx * speed, vy = initialDy * speed;
    let t = 0;
    samples.push({ x: x, y: y, t: t, vx: vx, vy: vy });

    const cosW = Math.cos(omega * SIM_DT);
    const sinW = Math.sin(omega * SIM_DT);
    const frStep = Math.pow(CURVE_FRICTION_60, SIM_DT * 60);

    let finalSDX = initialDx, finalSDY = initialDy;

    while (t < SIM_MAX_T && samples.length < SIM_MAX_SAMPLES) {
      const sp = Math.hypot(vx, vy);
      if (sp < 1) break;

      const rvx = vx * cosW - vy * sinW;
      const rvy = vx * sinW + vy * cosW;
      vx = rvx; vy = rvy;

      const px = x, py = y;
      x += vx * SIM_DT;
      y += vy * SIM_DT;
      t += SIM_DT;

      vx *= frStep;
      vy *= frStep;

      const segdx = x - px, segdy = y - py;
      const seglen = Math.hypot(segdx, segdy);
      if (seglen > 1e-6) {
        const sdx = segdx / seglen, sdy = segdy / seglen;
        const hit = firstHit(px, py, sdx, sdy, true);
        if (hit && hit.t <= seglen + 0.25) {
          samples.push({ x: hit.px, y: hit.py, t: t, vx: vx, vy: vy });
          return {
            samples: samples,
            contact: hit,
            finalUDir: { x: sdx, y: sdy },
            speed: Math.hypot(vx, vy)
          };
        }
        finalSDX = sdx; finalSDY = sdy;
      }
      samples.push({ x: x, y: y, t: t, vx: vx, vy: vy });
    }
    // No wall / disc hit found — the orbit looped itself out under friction
    // (or just kept spiralling tight). Synthesize a contact marker at the
    // trajectory's final sample so the curve still animates and the cue ends
    // up at the right spot when CURVE_FIRED arrives.
    const last = samples[samples.length - 1];
    return {
      samples: samples,
      contact: {
        px: last.x, py: last.y,
        nx: 0, ny: 0,
        target: 'end'
      },
      finalUDir: { x: finalSDX, y: finalSDY },
      speed: Math.hypot(vx, vy)
    };
  }

  function sampleVelAt(t) {
    const traj = state.trajectory;
    if (!traj || traj.length === 0) return { vx: 0, vy: 0 };
    if (t <= 0) return { vx: traj[0].vx, vy: traj[0].vy };
    const last = traj[traj.length - 1];
    if (t >= last.t) return { vx: last.vx, vy: last.vy };
    let lo = 0, hi = traj.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (traj[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = traj[lo], b = traj[hi];
    const span = b.t - a.t;
    const u = span > 1e-9 ? (t - a.t) / span : 0;
    return { vx: a.vx + (b.vx - a.vx) * u, vy: a.vy + (b.vy - a.vy) * u };
  }

  function triggerRedBend(redIndex) {
    const red = state.reds[redIndex];
    const dx = red.x - state.cue.x, dy = red.y - state.cue.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    let cueVx, cueVy;
    if (state.phase === 'CURVE_FIRED' && state.trajectory) {
      const vel = sampleVelAt(state.flightTime);
      cueVx = vel.vx; cueVy = vel.vy;
    } else {
      cueVx = state.cue.vx;
      cueVy = state.cue.vy;
    }
    const relVn = (cueVx - red.vx) * nx + (cueVy - red.vy) * ny;
    if (relVn <= 0) return false; // separating
    const kRed = 2 / (1 + RED_BALL_MASS);
    state.pendingRedImpulses = [{ index: redIndex, vx: relVn * nx * kRed, vy: relVn * ny * kRed }];
    const tangVX = cueVx - relVn * nx;
    const tangVY = cueVy - relVn * ny;
    const tangSpeed = Math.hypot(tangVX, tangVY);
    let natUDx, natUDy;
    if (tangSpeed > 1) {
      natUDx = tangVX / tangSpeed;
      natUDy = tangVY / tangSpeed;
    } else {
      natUDx = -ny; natUDy = nx;
    }
    state.finalSpeed = Math.hypot(cueVx, cueVy) * RED_HIT_BOOST;
    state.naturalDir = { x: natUDx, y: natUDy };
    const NUDGE = 1.0;
    state.cue.x -= nx * NUDGE;
    state.cue.y -= ny * NUDGE;
    state.contact = {
      px: state.cue.x, py: state.cue.y,
      nx: -nx, ny: -ny,
      target: 'red', redIndex: redIndex
    };
    state.handle.x = state.contact.px + natUDx * HANDLE_DIST;
    state.handle.y = state.contact.py + natUDy * HANDLE_DIST;
    clampHandle();
    state.cue.vx = 0; state.cue.vy = 0;
    state.phase = 'BEND';
    red.lastTouchT = nowMs();
    state.lastBentRedIndex = redIndex;
    state.lastHitTime = nowSec();
    fxHit(state.cue.x, state.cue.y, red.color);
    recordReplayEvent('hit', { x: state.cue.x, y: state.cue.y, color: red.color });
    captureReplayFrame();
    updateUI();
    return true;
  }

  function checkLiveRedHit() {
    const RR = 2 * R, RR2 = RR * RR;
    const tMs = nowMs();
    for (let i = 0; i < state.reds.length; i++) {
      if (i === state.lastBentRedIndex) continue; // no double-bend off same ball
      const r = state.reds[i];
      if (r.poofed) continue;
      if (tMs - r.lastTouchT < TOUCH_COOLDOWN_MS) continue;
      const dx = r.x - state.cue.x, dy = r.y - state.cue.y;
      if (dx * dx + dy * dy < RR2) {
        if (triggerRedBend(i)) return true;
      }
    }
    return false;
  }

  function sampleAt(t) {
    const traj = state.trajectory;
    if (!traj || traj.length === 0) return null;
    if (t <= 0) return traj[0];
    const last = traj[traj.length - 1];
    if (t >= last.t) return last;
    let lo = 0, hi = traj.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (traj[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = traj[lo], b = traj[hi];
    const span = b.t - a.t;
    const u = span > 1e-9 ? (t - a.t) / span : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }

  // Curve speed during BEND — driven by the *current* slider so the player can
  // tune power while the cue is paused at contact. Red contacts still get the
  // RED_HIT_BOOST multiplier.
  function curveSpeed() {
    const base = MIN_P + state.power * (MAX_P - MIN_P);
    const boost = (state.contact && state.contact.target === 'red') ? RED_HIT_BOOST : 1;
    return base * boost;
  }

  function primaryAction() {
    if (state.phase === 'AIM') fire();
    else if (state.phase === 'BEND') commitCurve();
  }

  function setupTrajectoryFromSim(sim, sourceVx, sourceVy) {
    state.trajectory = sim.samples;
    const last = sim.samples[sim.samples.length - 1];
    state.totalFlightTime = last.t;
    state.flightTime = 0;
    state.contact = sim.contact;
    const fsp = Math.hypot(last.vx, last.vy) || 1;
    state.finalSpeed = fsp;
    state.finalVel = { x: last.vx, y: last.vy };
    if (sim.contact && sim.contact.target !== 'red') {
      const fudx = last.vx / fsp, fudy = last.vy / fsp;
      state.naturalDir = reflect(fudx, fudy, sim.contact.nx, sim.contact.ny);
      state.handle.x = sim.contact.px + state.naturalDir.x * HANDLE_DIST;
      state.handle.y = sim.contact.py + state.naturalDir.y * HANDLE_DIST;
      clampHandle();
    }
  }

  function fire() {
    // Child lock guard — if the wife/child state has the player locked out
    // (e.g. baby needs attention), the cast is refused with a status line.
    if (window.Child && typeof window.Child.isLocked === 'function' && window.Child.isLocked()) {
      const s = document.getElementById('pool-status');
      const msg = window.Child.lockMessage ? window.Child.lockMessage() : '';
      if (s) s.textContent = (msg || 'THE CHILD CRIES — tend to your kin first.');
      return;
    }
    // Stake gets locked in on the FIRST cast of a run. If the player doesn't
    // have the coins, the cast is rejected.
    if (!state.runStaked) {
      const bet = readBet();
      if (bet > 0 && window.Wallet) {
        if (!window.Wallet.spend(bet)) {
          const s = document.getElementById('pool-status');
          if (s) s.textContent = 'INSUFFICIENT PURSE — adjust your stake.';
          return;
        }
      }
      state.bet = bet;
      state.runStaked = true;
      state.runPayout = 0;
      refreshBetDisplay();
      // Each ritual (each cast = one play) tells the Child system another
      // play has happened — that's what drives the hunger / wellness decay.
      if (window.Child && typeof window.Child.recordPlay === 'function') {
        window.Child.recordPlay();
      }
    }
    const dx = Math.cos(state.aimAng), dy = Math.sin(state.aimAng);
    const speed = MIN_P + state.power * (MAX_P - MIN_P);
    const sim = simulateStraight(state.cue.x, state.cue.y, dx, dy, speed);
    if (!sim || !sim.samples || sim.samples.length < 2 || !sim.contact) {
      // Defensive: bounded-box sim should always find a wall, but if it
      // somehow doesn't, fall back to a live shot so the player's click
      // never silently no-ops.
      state.cue.vx = dx * speed;
      state.cue.vy = dy * speed;
      if (!state.replay.recording) {
        state.replay.frames = [];
        state.replay.events = [];
        state.replay.playbackIndex = 0;
        state.replay.eventIdx = 0;
        state.replay.recording = true;
        captureReplayFrame(true);
      }
      state.lastBentRedIndex = -1;
      state.phase = 'MULTI_ROLLING';
      updateUI();
      return;
    }
    setupTrajectoryFromSim(sim);
    // First shot of a game: open a fresh replay tape. Subsequent shots just
    // append onto the same tape so the full run plays back on game over.
    if (!state.replay.recording) {
      state.replay.frames = [];
      state.replay.events = [];
      state.replay.playbackIndex = 0;
      state.replay.eventIdx = 0;
      state.replay.recording = true;
      captureReplayFrame(true);
    }
    state.lastBentRedIndex = -1; // fresh shot, no carryover bend lockout
    state.phase = 'FIRED';
    updateUI();
  }

  function commitCurve() {
    // Release any pending red impulses recorded at BEND entry — the struck
    // ball gets its momentum at the moment the player commits the curve.
    if (state.pendingRedImpulses) {
      for (let i = 0; i < state.pendingRedImpulses.length; i++) {
        const imp = state.pendingRedImpulses[i];
        const r = state.reds[imp.index];
        r.vx += imp.vx;
        r.vy += imp.vy;
      }
      state.pendingRedImpulses = null;
    }
    const P0 = { x: state.contact.px, y: state.contact.py };
    const P1 = { x: state.handle.x, y: state.handle.y };
    const speed = curveSpeed();
    const sim = simulateCircular(P0, P1, state.naturalDir, speed);

    // Normal path — we have a precomputable trajectory ending at a wall/disc.
    if (sim && sim.samples && sim.samples.length >= 2 && sim.contact) {
      setupTrajectoryFromSim(sim);
      state.spinUpStart = nowSec();
      state.spinUpEnd = state.spinUpStart + SPIN_UP_DUR;
      state.nextSpinSparkAt = state.spinUpStart;
      state.phase = 'SPIN_UP';
      updateUI();
      return;
    }

    // Fallback — sim couldn't produce a usable trajectory (orbital loop that
    // never hit a wall, or a degenerate near-zero motion). Launch the cue
    // manually so RELEASE always produces a visible shot.
    let vx, vy;
    if (sim && sim.samples && sim.samples.length >= 2) {
      const last = sim.samples[sim.samples.length - 1];
      vx = last.vx;
      vy = last.vy;
    } else {
      let dx = state.handle.x - P0.x;
      let dy = state.handle.y - P0.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) { dx = state.naturalDir.x; dy = state.naturalDir.y; }
      else       { dx /= d; dy /= d; }
      vx = dx * speed;
      vy = dy * speed;
    }
    // Guarantee a minimum launch speed so the cue actually leaves contact.
    const minLaunch = MIN_P * 0.85;
    const spOut = Math.hypot(vx, vy);
    if (spOut < minLaunch) {
      const k = (minLaunch / Math.max(spOut, 1e-3));
      vx *= k; vy *= k;
    }
    state.cue.vx = vx;
    state.cue.vy = vy;
    const ang = Math.atan2(vy, vx);
    fxLaunch(state.cue.x, state.cue.y, ang);
    recordReplayEvent('launch', { x: state.cue.x, y: state.cue.y, ang: ang });
    captureReplayFrame(true);
    state.phase = 'MULTI_ROLLING';
    updateUI();
  }

  function resetShot() {
    const home = pickRandomCuePosition();
    state.cue.x = home.x;
    state.cue.y = home.y;
    state.cue.vx = 0; state.cue.vy = 0;
    state.contact = null;
    state.trajectory = null;
    state.previewTraj = null;
    state.flightTime = 0;
    state.totalFlightTime = 0;
    state.dragging = false;
    state.phase = 'AIM';
    state.reds = REDS_HOME.map((p) => ({
      x: p.x, y: p.y, vx: 0, vy: 0, color: p.color, lastTouchT: -Infinity, lit: true, trail: [], poofed: false
    }));
    state.pendingRedImpulses = null;
    state.score = 0;
    state.combo = 0;
    state.particles = [];
    state.rings = [];
    state.lastScoreTime = -Infinity;
    state.lastHitTime = -Infinity;
    state.gameOver = false;
    state.replay.frames = [];
    state.replay.events = [];
    state.replay.recording = false;
    state.replay.playbackIndex = 0;
    state.replay.eventIdx = 0;
    state.replayPendingAt = null;
    state.spinUpStart = 0;
    state.spinUpEnd = 0;
    state.nextSpinSparkAt = 0;
    state.lastBentRedIndex = -1;
    state.endReason = '';
    state.gameOverT0 = 0;
    state.scoreFlashFired = false;
    state.scoreFlashAt = 0;
    state.runStaked = false;
    state.runPayout = 0;
    state.bet = readBet();
    state.aimAng = Math.atan2(CIRC.cy - state.cue.y, CIRC.cx - state.cue.x);
    clearQuotes();
    refreshBetDisplay();
    updateUI();
  }

  function updateUI() {
    const status = document.getElementById('pool-status');
    const shoot = document.getElementById('pool-shoot');
    switch (state.phase) {
      case 'AIM':
        status.textContent = 'Aim with intent — SPACE / click felt / CAST to loose the cue.';
        shoot.textContent = 'Cast';
        shoot.disabled = false;
        break;
      case 'FIRED':
        status.textContent = 'The cue carries…';
        shoot.disabled = true;
        break;
      case 'BEND':
        status.textContent = 'Bend the carom — drag the binding, then RELEASE.';
        shoot.textContent = 'Release';
        shoot.disabled = false;
        break;
      case 'SPIN_UP':
        status.textContent = 'Gathering…';
        shoot.disabled = true;
        break;
      case 'CURVE_FIRED':
        status.textContent = 'Winding the curve…';
        shoot.disabled = true;
        break;
      case 'MULTI_ROLLING':
        status.textContent = 'The sisters roll…';
        shoot.disabled = true;
        break;
      case 'STOPPED':
        status.textContent = 'The rite settles. RESET to begin again.';
        shoot.textContent = 'Cast';
        shoot.disabled = true;
        break;
      case 'GAME_OVER':
        if (state.endReason === 'cue-stop') {
          status.textContent = 'THE CUE STILLED — the rite ends. RESET to begin again.';
        } else {
          status.textContent = 'THE IRON DRANK — the rite ends. RESET to begin again.';
        }
        shoot.textContent = 'Cast';
        shoot.disabled = true;
        break;
      case 'REPLAY':
        status.textContent = 'REPLAY — RESET to begin again.';
        shoot.textContent = 'Cast';
        shoot.disabled = true;
        break;
    }
    status.textContent += '   ·   score: ' + state.score;
  }

  // --- Multi-ball physics helpers --------------------------------------------

  function resolveBallVsBox(ball) {
    let wall = null;
    if (ball.x < R) {
      ball.x = R;
      if (ball.vx < 0) { ball.vx = -ball.vx; wall = 'west'; }
    } else if (ball.x > W - R) {
      ball.x = W - R;
      if (ball.vx > 0) { ball.vx = -ball.vx; wall = 'east'; }
    }
    if (ball.y < R) {
      ball.y = R;
      if (ball.vy < 0) { ball.vy = -ball.vy; wall = 'north'; }
    } else if (ball.y > H - R) {
      ball.y = H - R;
      if (ball.vy > 0) { ball.vy = -ball.vy; wall = 'south'; }
    }
    return wall;
  }

  function resolveBallVsCircle(ball) {
    const dx = ball.x - CIRC.cx, dy = ball.y - CIRC.cy;
    const distSq = dx * dx + dy * dy;
    const CR = CIRC.r + R;
    if (distSq >= CR * CR || distSq < 1e-6) return false;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist, ny = dy / dist;
    ball.x = CIRC.cx + nx * CR;
    ball.y = CIRC.cy + ny * CR;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= 2 * vn * nx;
      ball.vy -= 2 * vn * ny;
      return true;
    }
    return false;
  }

  function resolveBallVsBall(b1, b2, m2Over1) {
    const M = m2Over1 || 1;
    const dx = b2.x - b1.x, dy = b2.y - b1.y;
    const distSq = dx * dx + dy * dy;
    const rr = 2 * R;
    if (distSq >= rr * rr || distSq < 1e-6) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist, ny = dy / dist;
    // Separation split proportional to inverse mass (heavier ball moves less).
    const overlap = rr - dist;
    const w1 = M / (1 + M); // share for b1 (lighter b1 moves more when M>1)
    const w2 = 1 / (1 + M);
    b1.x -= nx * overlap * w1;
    b1.y -= ny * overlap * w1;
    b2.x += nx * overlap * w2;
    b2.y += ny * overlap * w2;
    const v1n = b1.vx * nx + b1.vy * ny;
    const v2n = b2.vx * nx + b2.vy * ny;
    if (v1n - v2n <= 0) return; // already separating
    const dv = v1n - v2n;
    // Elastic-collision impulse coefficients for unequal mass:
    //   v1' = v1 - 2M/(1+M) * dv ;  v2' = v2 + 2/(1+M) * dv
    const k1 = 2 * M / (1 + M);
    const k2 = 2 / (1 + M);
    b1.vx -= k1 * dv * nx;
    b1.vy -= k1 * dv * ny;
    b2.vx += k2 * dv * nx;
    b2.vy += k2 * dv * ny;
    if (dv > 90) {
      const cx = (b1.x + b2.x) * 0.5;
      const cy = (b1.y + b2.y) * 0.5;
      fxContact(cx, cy, dv);
      recordReplayEvent('contact', { x: cx, y: cy, intensity: dv });
    }
  }

  function resolveStaticCueVsBall(b) {
    // Used during CURVE_FIRED: cue rides a precomputed trajectory, so treat
    // it as an immovable obstacle and bounce red balls off it.
    const dx = b.x - state.cue.x, dy = b.y - state.cue.y;
    const distSq = dx * dx + dy * dy;
    const rr = 2 * R;
    if (distSq >= rr * rr || distSq < 1e-6) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist, ny = dy / dist;
    const overlap = rr - dist;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= 2 * vn * nx;
      b.vy -= 2 * vn * ny;
      const dv = -2 * vn;
      if (dv > 90) {
        const cx = (state.cue.x + b.x) * 0.5;
        const cy = (state.cue.y + b.y) * 0.5;
        fxContact(cx, cy, dv);
        recordReplayEvent('contact', { x: cx, y: cy, intensity: dv });
      }
    }
  }

  function scoreMatchedHit(ball, wallSide) {
    if (state.gameOver) return; // no scoring during HOLD / flash
    if (!ball.lit) return; // dim balls cannot score
    state.score += 1;
    state.combo += 1;
    state.lastScoreTime = nowSec();
    // Payout: bet × multiplier(combo) → wallet.
    const payout = Math.floor(state.bet * comboMultiplier(state.combo));
    if (payout > 0 && window.Wallet) window.Wallet.add(payout);
    state.runPayout += payout;
    fxScore(ball.x, ball.y, ball.color, wallSide);
    recordReplayEvent('score', {
      x: ball.x, y: ball.y, color: ball.color, wallSide: wallSide, payout: payout
    });
    dimBallByColor(ball.color);
    maybeDropQuoteForScore();
    refreshBetDisplay();
    updateUI();
  }

  function physicsStep(dt, skipCue) {
    const sdt = dt / ROLL_SUBSTEPS;
    const fr = Math.pow(FRICTION_60, sdt * 60);
    for (let s = 0; s < ROLL_SUBSTEPS; s++) {
      if (!skipCue) {
        state.cue.x += state.cue.vx * sdt;
        state.cue.y += state.cue.vy * sdt;
      }
      for (let i = 0; i < state.reds.length; i++) {
        const r = state.reds[i];
        if (r.poofed) continue;
        r.x += r.vx * sdt;
        r.y += r.vy * sdt;
      }
      if (!skipCue) {
        resolveBallVsBox(state.cue);
        // The cue can graze the iron — no game over from the white ball.
        resolveBallVsCircle(state.cue);
      }
      for (let i = 0; i < state.reds.length; i++) {
        const red = state.reds[i];
        if (red.poofed) continue;
        const wallHit = resolveBallVsBox(red);
        if (wallHit && COLOR_WALL[red.color] === wallHit) scoreMatchedHit(red, wallHit);
        const redHitCircle = resolveBallVsCircle(red);
        if (redHitCircle && !state.gameOver) {
          // POOF — the orb vanishes into the hot sigil rather than bouncing.
          // We freeze its velocity, mark it poofed (so the rest of the
          // sim/render skips it), spawn the burst, and end the game so the
          // HOLD window can let everything else resolve.
          red.poofed = true;
          red.vx = 0; red.vy = 0;
          fxBallPoof(red.x, red.y, red.color);
          recordReplayEvent('poof', { x: red.x, y: red.y, color: red.color, index: i });
          endGame({ x: red.x, y: red.y });
          return null;
        }
      }
      if (skipCue) {
        for (let i = 0; i < state.reds.length; i++) {
          if (state.reds[i].poofed) continue;
          resolveStaticCueVsBall(state.reds[i]);
        }
      } else {
        // Any cue-red overlap during MULTI_ROLLING short-circuits and bubbles
        // up so the caller can re-trigger BEND. A per-red cooldown prevents
        // two-touches-in-a-row from re-firing on the same ball; if a red is
        // still cooling down we just resolve elastically without a new bend.
        const RR2 = 4 * R * R;
        const tMs = nowMs();
        for (let i = 0; i < state.reds.length; i++) {
          const red = state.reds[i];
          if (red.poofed) continue;
          const dxr = red.x - state.cue.x, dyr = red.y - state.cue.y;
          if (dxr * dxr + dyr * dyr < RR2) {
            const cooledDown = tMs - red.lastTouchT >= TOUCH_COOLDOWN_MS;
            const notLastBend = i !== state.lastBentRedIndex;
            if (cooledDown && notLastBend) return { bendTrigger: i };
            // Either still cooling, or the just-bent ball — elastic only.
            resolveBallVsBall(state.cue, red, RED_BALL_MASS);
          }
        }
      }
      for (let i = 0; i < state.reds.length; i++) {
        if (state.reds[i].poofed) continue;
        for (let j = i + 1; j < state.reds.length; j++) {
          if (state.reds[j].poofed) continue;
          resolveBallVsBall(state.reds[i], state.reds[j]);
        }
      }
      if (!skipCue) { state.cue.vx *= fr; state.cue.vy *= fr; }
      for (let i = 0; i < state.reds.length; i++) {
        if (state.reds[i].poofed) continue;
        state.reds[i].vx *= fr;
        state.reds[i].vy *= fr;
      }
    }
    return null;
  }

  function allStopped() {
    if (Math.hypot(state.cue.vx, state.cue.vy) >= STOP_EPS) return false;
    for (let i = 0; i < state.reds.length; i++) {
      if (Math.hypot(state.reds[i].vx, state.reds[i].vy) >= STOP_EPS) return false;
    }
    return true;
  }

  function snapToRest() {
    state.cue.vx = 0; state.cue.vy = 0;
    for (let i = 0; i < state.reds.length; i++) {
      state.reds[i].vx = 0;
      state.reds[i].vy = 0;
    }
  }

  // ---------------------------------------------------------------------------

  function onTrajectoryArrive() {
    const c = state.contact;
    state.cue.x = c.px;
    state.cue.y = c.py;
    if (c.target === 'red' && typeof c.redIndex === 'number') {
      // Pool-ball impact also triggers the bend / curve-pull phase. The red's
      // would-be momentum (normal-component swap) is stored as a pending
      // impulse to be applied when the player releases the curve. The cue is
      // paused at contact; naturalDir is the cue's tangential direction
      // (parallel to the line of impact), so the default handle sits along
      // the natural sideways carom.
      const red = state.reds[c.redIndex];
      const dx = red.x - c.px, dy = red.y - c.py;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      const vix = state.finalVel.x, viy = state.finalVel.y;
      const vn = vix * nx + viy * ny;
      const kRed = 2 / (1 + RED_BALL_MASS);
      const redVX = vn > 0 ? vn * nx * kRed : 0;
      const redVY = vn > 0 ? vn * ny * kRed : 0;
      state.pendingRedImpulses = [{ index: c.redIndex, vx: redVX, vy: redVY }];

      const tangVX = vix - vn * nx;
      const tangVY = viy - vn * ny;
      const tangSpeed = Math.hypot(tangVX, tangVY);
      let natUDx, natUDy;
      if (tangSpeed > 1) {
        natUDx = tangVX / tangSpeed;
        natUDy = tangVY / tangSpeed;
      } else {
        natUDx = -ny; natUDy = nx; // perpendicular to line of centers
      }
      // 50% boost applied to the cue's *overall* incoming speed, not just the
      // tangential remainder.
      state.finalSpeed = Math.hypot(vix, viy) * RED_HIT_BOOST;
      state.naturalDir = { x: natUDx, y: natUDy };

      // Nudge cue back a hair so subsequent simulations don't false-collide
      // against the just-hit red (which still hasn't moved yet).
      const NUDGE = 1.0;
      state.cue.x = c.px - nx * NUDGE;
      state.cue.y = c.py - ny * NUDGE;
      state.contact = {
        px: state.cue.x, py: state.cue.y,
        nx: -nx, ny: -ny,
        target: 'red', redIndex: c.redIndex
      };
      state.handle.x = state.contact.px + natUDx * HANDLE_DIST;
      state.handle.y = state.contact.py + natUDy * HANDLE_DIST;
      clampHandle();
      state.cue.vx = 0; state.cue.vy = 0;
      state.phase = 'BEND';
      state.reds[c.redIndex].lastTouchT = nowMs();
      state.lastBentRedIndex = c.redIndex;
      state.lastHitTime = nowSec();
      fxHit(state.cue.x, state.cue.y, red.color);
      recordReplayEvent('hit', { x: state.cue.x, y: state.cue.y, color: red.color });
      updateUI();
      return;
    }
    // Wall or inner circle (only colored balls hitting the disc end the game,
    // and the cue's trajectory ends here either way).
    if (state.phase === 'FIRED') {
      // Pause for BEND
      state.cue.vx = 0; state.cue.vy = 0;
      state.phase = 'BEND';
      updateUI();
    } else {
      // CURVE_FIRED: reflect cue velocity off the wall/circle and roll
      const fsp = state.finalSpeed || 1;
      const udx = state.finalVel.x / fsp, udy = state.finalVel.y / fsp;
      const r = reflect(udx, udy, c.nx, c.ny);
      state.cue.vx = r.x * fsp;
      state.cue.vy = r.y * fsp;
      state.cue.x += c.nx * 0.5;
      state.cue.y += c.ny * 0.5;
      state.phase = 'MULTI_ROLLING';
      updateUI();
    }
  }

  function stepTrajectory(dt) {
    const remaining = state.totalFlightTime - state.flightTime;
    let effDt = dt;
    if (remaining < SLOW_WINDOW_T) effDt = dt * SLOW_FACTOR;
    state.flightTime += effDt;
    if (state.flightTime >= state.totalFlightTime) {
      state.flightTime = state.totalFlightTime;
      onTrajectoryArrive();
    } else {
      const p = sampleAt(state.flightTime);
      if (p) { state.cue.x = p.x; state.cue.y = p.y; }
    }
  }

  function stepSpinUp() {
    const t = nowSec();
    // Stream short bone sparks in toward the cue from random angles.
    while (state.nextSpinSparkAt < t) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = R + 28 + Math.random() * 8;
      const sp = 130 + Math.random() * 70;
      state.particles.push({
        x: state.cue.x + Math.cos(ang) * r0,
        y: state.cue.y + Math.sin(ang) * r0,
        vx: -Math.cos(ang) * sp,
        vy: -Math.sin(ang) * sp,
        life: 0,
        maxLife: 0.22,
        color: '#fff5d6',
        size: 1.3,
        tail: 10
      });
      state.nextSpinSparkAt += 0.012; // ~80/sec
    }
    if (t >= state.spinUpEnd) {
      // Launch burst in the curve's actual departure direction.
      let burstAng = 0;
      const traj = state.trajectory;
      if (traj && traj.length > 1) {
        burstAng = Math.atan2(traj[1].vy, traj[1].vx);
      } else if (state.finalVel) {
        burstAng = Math.atan2(state.finalVel.y, state.finalVel.x);
      }
      const cx = state.cue.x, cy = state.cue.y;
      fxLaunch(cx, cy, burstAng);
      recordReplayEvent('launch', { x: cx, y: cy, ang: burstAng });
      captureReplayFrame(true); // force — cue hasn't moved since BEND, but the event needs a tagged frame
      state.phase = 'CURVE_FIRED';
      updateUI();
    }
  }

  function updateTrails(dt) {
    if (dt <= 0) return;
    // During shoot-pause phases the trails freeze in place so the player can
    // read the orbs' last momentum while lining up the bend.
    const paused = state.phase === 'BEND' || state.phase === 'SPIN_UP';
    // Cue gets its own burning trail during REPLAY only. Unlike the orb
    // trails, the cue's burn ACCUMULATES — it never sheds samples on
    // stationary frames, so the full path becomes a glowing rune inscribed
    // across the felt as the replay plays out.
    if (state.phase === 'REPLAY') {
      if (!state.cue.trail) state.cue.trail = [];
      const ct = state.cue.trail;
      const clast = ct.length ? ct[ct.length - 1] : null;
      if (clast) {
        const cdx = state.cue.x - clast.x, cdy = state.cue.y - clast.y;
        const cdist = Math.hypot(cdx, cdy);
        if (cdist >= TRAIL_MIN_DIST) {
          ct.push({ x: state.cue.x, y: state.cue.y, sp: cdist / dt });
          // Safety cap so an enormous run can't grow unbounded.
          while (ct.length > 1000) ct.shift();
        }
        // No stationary shed — the rune persists.
      } else {
        ct.push({ x: state.cue.x, y: state.cue.y, sp: 0 });
      }
    } else if (state.cue.trail && state.cue.trail.length) {
      state.cue.trail.length = 0;
    }
    for (let i = 0; i < state.reds.length; i++) {
      const red = state.reds[i];
      if (red.poofed) { red.trail = []; continue; }
      if (!red.trail) red.trail = [];
      const trail = red.trail;
      const last = trail.length ? trail[trail.length - 1] : null;
      if (last) {
        const dxp = red.x - last.x, dyp = red.y - last.y;
        const dist = Math.hypot(dxp, dyp);
        if (dist >= TRAIL_MIN_DIST) {
          const sp = dist / dt;
          trail.push({ x: red.x, y: red.y, sp: sp });
          while (trail.length > TRAIL_MAX) trail.shift();
        } else if (trail.length && !paused) {
          // Ball is at rest in live play — bleed the trail off so it fades.
          // (Skipped while paused for shoot so the trail remains visible.)
          red.trailShedCounter = (red.trailShedCounter || 0) + 1;
          if (red.trailShedCounter >= TRAIL_SHED_EVERY) {
            red.trailShedCounter = 0;
            trail.shift();
          }
        }
      } else {
        trail.push({ x: red.x, y: red.y, sp: 0 });
      }
    }
  }

  function emitDiscEmbers(dt) {
    // Ambient sparks rising from the red-hot sigil. Rate climbs with the
    // current score so the disc gets more furious as the rite progresses.
    if (state.phase === 'GAME_OVER') return;
    const rage = Math.min(1, Math.sqrt(state.score / 24));
    const rate = 9 + rage * 28; // 9..37 per second
    let chance = dt * rate;
    while (chance > 0) {
      if (Math.random() < chance) {
        const ang = Math.random() * Math.PI * 2;
        const r0 = CIRC.r * (0.88 + Math.random() * 0.12);
        state.particles.push({
          x: CIRC.cx + Math.cos(ang) * r0,
          y: CIRC.cy + Math.sin(ang) * r0,
          vx: (Math.random() - 0.5) * 40,
          vy: -(34 + Math.random() * 60),
          life: 0,
          maxLife: 0.7 + Math.random() * 0.55,
          color: 'rgba(255, 140, 50, 0.95)',
          size: 2.0 + Math.random() * 0.8,
          tail: 8 + Math.random() * 6
        });
      }
      chance -= 1;
    }
  }

  function emitOrbSparkles(dt) {
    // Tiny mystical motes drifting around every lit orb so they feel alive
    // even at rest. Suppressed once the game is past play.
    if (state.phase === 'GAME_OVER' || state.phase === 'REPLAY') return;
    for (let i = 0; i < state.reds.length; i++) {
      const r = state.reds[i];
      if (r.poofed || !r.lit) continue;
      if (Math.random() < dt * 5) {
        const rgb = BALL_GLOW_RGB[r.color] || '240, 220, 180';
        const ang = Math.random() * Math.PI * 2;
        const dist = R * (1.05 + Math.random() * 0.6);
        const sx = r.x + Math.cos(ang) * dist;
        const sy = r.y + Math.sin(ang) * dist;
        state.particles.push({
          x: sx, y: sy,
          vx: (Math.random() - 0.5) * 26,
          vy: (Math.random() - 0.5) * 26 - 14,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.35,
          color: Math.random() < 0.4 ? '#fff5d6' : 'rgba(' + rgb + ', 0.9)',
          size: 1.3 + Math.random() * 0.7,
          tail: 6 + Math.random() * 4
        });
      }
    }
  }

  function step(dt) {
    updateEffects(dt);
    updateTrails(dt);
    emitDiscEmbers(dt);
    emitOrbSparkles(dt);
    if (state.replayPendingAt !== null && nowSec() >= state.replayPendingAt) {
      state.replayPendingAt = null;
      startReplay();
    }
    if (state.phase === 'REPLAY') {
      const total = state.replay.frames.length;
      if (total < 2) return;
      const idx = state.replay.playbackIndex;
      const f = state.replay.frames[idx];
      if (f) {
        state.cue.x = f.cueX;
        state.cue.y = f.cueY;
        for (let i = 0; i < state.reds.length; i++) {
          state.reds[i].x = f.reds[i].x;
          state.reds[i].y = f.reds[i].y;
        }
      }
      // Fire any events tagged to frame <= current index.
      while (state.replay.eventIdx < state.replay.events.length) {
        const evt = state.replay.events[state.replay.eventIdx];
        if (evt.frame > idx) break;
        fireReplayEvent(evt);
        state.replay.eventIdx++;
      }
      // Advance and loop. On loop reset event cursor + clear residual effects.
      state.replay.playbackIndex = idx + 1;
      if (state.replay.playbackIndex >= total) {
        state.replay.playbackIndex = 0;
        state.replay.eventIdx = 0;
        state.particles = [];
        state.rings = [];
        for (let i = 0; i < state.reds.length; i++) {
          state.reds[i].lit = true;
          state.reds[i].trail = [];
          state.reds[i].poofed = false;
        }
        state.score = 0;
        state.combo = 0;
        state.runPayout = 0;
        state.cue.trail = [];
        clearQuotes();
        refreshBetDisplay();
      }
      return;
    }
    if (state.phase === 'GAME_OVER') {
      const elapsed = nowSec() - state.gameOverT0;
      const settled = allStopped();
      const holdDone = elapsed >= GAMEOVER_HOLD_MAX_S ||
                       (elapsed >= GAMEOVER_HOLD_MIN_S && settled);
      if (!holdDone) {
        // HOLD — reds keep rolling so any lingering motion resolves; cue
        // stays put. No scoring, no re-end. Capture frames into replay.
        physicsStep(dt, true);
        captureReplayFrame();
      } else if (!state.scoreFlashFired) {
        state.scoreFlashFired = true;
        state.scoreFlashAt = nowSec();
        snapToRest();
        fxScoreFlash();
        recordReplayEvent('scoreflash', { score: state.score });
        captureReplayFrame(true);
      } else if (!state.replayPendingAt &&
                 nowSec() - state.scoreFlashAt >= FINAL_FLASH_DUR) {
        state.replayPendingAt = nowSec() + 0.01;
      }
      return;
    }
    if (state.phase === 'AIM') {
      const dx = Math.cos(state.aimAng), dy = Math.sin(state.aimAng);
      state.preview = firstHit(state.cue.x, state.cue.y, dx, dy);
      return;
    }
    if (state.phase === 'BEND') {
      const P0 = { x: state.contact.px, y: state.contact.py };
      const P1 = { x: state.handle.x, y: state.handle.y };
      const sim = simulateCircular(P0, P1, state.naturalDir, curveSpeed());
      state.previewTraj = sim ? sim.samples : null;
      return;
    }
    if (state.phase === 'FIRED') {
      stepTrajectory(dt);
      captureReplayFrame();
      return;
    }
    if (state.phase === 'SPIN_UP')     { stepSpinUp(); return; }
    if (state.phase === 'CURVE_FIRED') {
      stepTrajectory(dt);
      if (state.phase !== 'CURVE_FIRED') return;
      if (checkLiveRedHit()) return;
      physicsStep(dt, true);
      if (state.phase !== 'CURVE_FIRED') return;
      if (checkLiveRedHit()) return;
      captureReplayFrame();
      return;
    }
    if (state.phase === 'MULTI_ROLLING') {
      const result = physicsStep(dt, false);
      if (state.phase !== 'MULTI_ROLLING') return;
      if (result && typeof result.bendTrigger === 'number') {
        triggerRedBend(result.bendTrigger);
        return;
      }
      // The game ends the instant the cue ball stops — even if reds keep
      // rolling, the player has used up their momentum.
      if (Math.hypot(state.cue.vx, state.cue.vy) < STOP_EPS) {
        state.cue.vx = 0; state.cue.vy = 0;
        endGame({ x: state.cue.x, y: state.cue.y }, 'cue-stop');
      } else {
        captureReplayFrame();
      }
    }
  }

  function drawPolyline(ctx, pts, stroke, dash) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBallShadow(ctx, x, y) {
    const sx = x + 2.5, sy = y + 5;
    const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, R + 4);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, sy, R + 2, R * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShadedSphere(ctx, x, y, stops) {
    // Light direction: upper-left. Highlight sits inside the rim.
    const hx = x - R * 0.42, hy = y - R * 0.45;
    drawBallShadow(ctx, x, y);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.clip();

    // Body — soft radial gradient with multiple stops for smooth falloff.
    const body = ctx.createRadialGradient(hx, hy, R * 0.05, hx, hy, R * 2.05);
    body.addColorStop(0.00, stops[0]);
    body.addColorStop(0.22, stops[1]);
    body.addColorStop(0.65, stops[2]);
    body.addColorStop(1.00, stops[2]);
    ctx.fillStyle = body;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);

    // Edge ambient occlusion — subtle dark rim.
    const rim = ctx.createRadialGradient(x, y, R * 0.62, x, y, R);
    rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = rim;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);

    // Ground-shadow side — gentle bottom darkening.
    const floor = ctx.createLinearGradient(x, y - R * 0.15, x, y + R);
    floor.addColorStop(0, 'rgba(0, 0, 0, 0)');
    floor.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = floor;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);

    // Specular halo — additive blend so the highlight stays bright on any
    // base color (red doesn't go pink, blue doesn't wash gray).
    ctx.globalCompositeOperation = 'screen';
    const spec = ctx.createRadialGradient(hx, hy, 0.5, hx, hy, R * 0.7);
    spec.addColorStop(0, 'rgba(255, 250, 230, 0.78)');
    spec.addColorStop(0.35, 'rgba(255, 250, 230, 0.32)');
    spec.addColorStop(1, 'rgba(255, 250, 230, 0)');
    ctx.fillStyle = spec;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'source-over';

    // Tight catchlight — the brightest single point.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(hx + R * 0.04, hy + R * 0.05, R * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Outline — thin dark edge for silhouette.
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawDimOverlay(ctx, x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(8, 6, 10, 0.5)';
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.restore();
  }

  function drawBallGlow(ctx, x, y, color, pulse) {
    const rgb = BALL_GLOW_RGB[color];
    if (!rgb) return;
    ctx.save();
    // Additive blend so the glow truly lights whatever is underneath
    // instead of just tinting it — that's what gives the nuclear feel.
    ctx.globalCompositeOperation = 'lighter';

    // Outer aura — wide, faint, colored.
    const auraR = R * 3.4;
    const aura = ctx.createRadialGradient(x, y, R * 0.6, x, y, auraR);
    aura.addColorStop(0, 'rgba(' + rgb + ', ' + (0.55 * pulse).toFixed(3) + ')');
    aura.addColorStop(0.5, 'rgba(' + rgb + ', ' + (0.22 * pulse).toFixed(3) + ')');
    aura.addColorStop(1, 'rgba(' + rgb + ', 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, auraR, 0, Math.PI * 2);
    ctx.fill();

    // Bright saturated halo close to the ball.
    const haloR = R * 1.9;
    const halo = ctx.createRadialGradient(x, y, R * 0.4, x, y, haloR);
    halo.addColorStop(0, 'rgba(' + rgb + ', ' + (0.85 * pulse).toFixed(3) + ')');
    halo.addColorStop(0.55, 'rgba(' + rgb + ', ' + (0.45 * pulse).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(' + rgb + ', 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, haloR, 0, Math.PI * 2);
    ctx.fill();

    // White-hot core — the radioactive hot spot bleeding through the body.
    const coreR = R * 1.05;
    const core = ctx.createRadialGradient(x, y, 0.5, x, y, coreR);
    core.addColorStop(0, 'rgba(255, 255, 245, ' + (0.65 * pulse).toFixed(3) + ')');
    core.addColorStop(0.6, 'rgba(' + rgb + ', ' + (0.35 * pulse).toFixed(3) + ')');
    core.addColorStop(1, 'rgba(' + rgb + ', 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawColoredBall(ctx, x, y, color, lit) {
    const stops = BALL_GRADIENTS[color] || BALL_GRADIENTS.red;
    drawShadedSphere(ctx, x, y, stops);
    if (lit === false) drawDimOverlay(ctx, x, y);
  }

  function drawCueBall(ctx, x, y) {
    drawShadedSphere(ctx, x, y, CUE_GRADIENT);
  }

  function draw() {
    const ctx = state.ctx;
    ctx.clearRect(0, 0, W, H);

    // Felt — the wizard's-book table texture, stretched edge-to-edge then
    // muted under a dark wash so the texture reads as subtle parchment grain
    // rather than a visible tiled pattern.
    if (state.feltImage && state.feltImage.complete && state.feltImage.naturalWidth > 0) {
      ctx.drawImage(
        state.feltImage,
        0, 0, state.feltImage.naturalWidth, state.feltImage.naturalHeight,
        0, 0, W, H
      );
    } else {
      ctx.fillStyle = '#06070e';
      ctx.fillRect(0, 0, W, H);
    }
    // Dark unifying wash — kills any obvious tiling pattern in the source.
    ctx.fillStyle = 'rgba(4, 2, 10, 0.62)';
    ctx.fillRect(0, 0, W, H);

    // Radial vignette warming the centre slightly.
    const vg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(40, 18, 8, 0.18)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Colored wall stripes (compass-matched to balls)
    ctx.fillStyle = WALL_COLORS.north;
    ctx.fillRect(0, 0, W, WALL_THICK);
    ctx.fillStyle = WALL_COLORS.south;
    ctx.fillRect(0, H - WALL_THICK, W, WALL_THICK);
    ctx.fillStyle = WALL_COLORS.west;
    ctx.fillRect(0, 0, WALL_THICK, H);
    ctx.fillStyle = WALL_COLORS.east;
    ctx.fillRect(W - WALL_THICK, 0, WALL_THICK, H);
    // Glowing rail bloom — each rail bleeds its colored light inward for that
    // arcane "lit by sigil" feel.
    {
      const D = WALL_GLOW_DEPTH;
      let g;
      g = ctx.createLinearGradient(0, WALL_THICK, 0, WALL_THICK + D);
      g.addColorStop(0, 'rgba(' + WALL_GLOW_RGB.north + ', 0.42)');
      g.addColorStop(1, 'rgba(' + WALL_GLOW_RGB.north + ', 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, WALL_THICK, W, D);
      g = ctx.createLinearGradient(0, H - WALL_THICK, 0, H - WALL_THICK - D);
      g.addColorStop(0, 'rgba(' + WALL_GLOW_RGB.south + ', 0.42)');
      g.addColorStop(1, 'rgba(' + WALL_GLOW_RGB.south + ', 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - WALL_THICK - D, W, D);
      g = ctx.createLinearGradient(WALL_THICK, 0, WALL_THICK + D, 0);
      g.addColorStop(0, 'rgba(' + WALL_GLOW_RGB.west + ', 0.42)');
      g.addColorStop(1, 'rgba(' + WALL_GLOW_RGB.west + ', 0)');
      ctx.fillStyle = g;
      ctx.fillRect(WALL_THICK, 0, D, H);
      g = ctx.createLinearGradient(W - WALL_THICK, 0, W - WALL_THICK - D, 0);
      g.addColorStop(0, 'rgba(' + WALL_GLOW_RGB.east + ', 0.42)');
      g.addColorStop(1, 'rgba(' + WALL_GLOW_RGB.east + ', 0)');
      ctx.fillStyle = g;
      ctx.fillRect(W - WALL_THICK - D, 0, D, H);
    }

    // Red-hot sigil — pulsing incandescent iron. As the score climbs the
    // disc gets brighter, angrier, with a wider halo, rotating spikes, and
    // a faint shake at high rage.
    const rage = Math.min(1, Math.sqrt(state.score / 24));
    const heatT = nowSec() * (2.2 + rage * 4.0);
    const heat = Math.min(1.45, 0.85 + 0.18 * Math.sin(heatT) + rage * 0.30);
    const shakeAmt = rage > 0.4 ? rage * 1.6 : 0;
    const cx = CIRC.cx + (Math.random() - 0.5) * shakeAmt;
    const cy = CIRC.cy + (Math.random() - 0.5) * shakeAmt;

    // Heat halo — grows wider and hotter with rage.
    ctx.save();
    const haloR = CIRC.r + 70 + rage * 70;
    const halo = ctx.createRadialGradient(cx, cy, CIRC.r * 0.85, cx, cy, haloR);
    halo.addColorStop(0, 'rgba(255, 130, 50, ' + Math.min(1, (0.32 + rage * 0.36) * heat).toFixed(3) + ')');
    halo.addColorStop(0.5, 'rgba(255, 60, 24, ' + Math.min(1, (0.12 + rage * 0.22) * heat).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(180, 18, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Angry rays radiating outward — only at moderate+ rage.
    if (rage > 0.15) {
      ctx.save();
      const rayCount = 6 + Math.floor(rage * 6);
      const rayInner = CIRC.r + 4;
      const rayOuter = CIRC.r + 24 + rage * 60;
      ctx.translate(cx, cy);
      ctx.rotate(heatT * 0.18);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255, 90, 30, ' + (rage * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1.5 + rage * 1.5;
      ctx.shadowColor = 'rgba(255, 100, 40, 0.7)';
      ctx.shadowBlur = 12 + rage * 12;
      for (let i = 0; i < rayCount; i++) {
        const a = (i / rayCount) * Math.PI * 2;
        const flick = 0.92 + 0.16 * Math.sin(heatT * 3 + i * 1.7);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rayInner, Math.sin(a) * rayInner);
        ctx.lineTo(Math.cos(a) * rayOuter * flick, Math.sin(a) * rayOuter * flick);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Incandescent body — bright zone expands with rage so the white-hot
    // core swallows more of the disc.
    const innerStop = Math.max(0.10, 0.25 - rage * 0.12);
    const midStop = Math.max(0.40, 0.60 - rage * 0.18);
    const ironG = ctx.createRadialGradient(cx, cy, 1, cx, cy, CIRC.r);
    ironG.addColorStop(0.00, 'rgba(255, 246, 215, ' + Math.min(1, 0.97 * heat).toFixed(3) + ')');
    ironG.addColorStop(innerStop, 'rgba(255, 170, 60, ' + Math.min(1, heat).toFixed(3) + ')');
    ironG.addColorStop(midStop, 'rgba(206, 52, 22, ' + Math.min(1, heat).toFixed(3) + ')');
    ironG.addColorStop(1.00, 'rgba(76, 12, 8, ' + Math.min(1, heat).toFixed(3) + ')');
    ctx.fillStyle = ironG;
    ctx.beginPath();
    ctx.arc(cx, cy, CIRC.r, 0, Math.PI * 2);
    ctx.fill();

    // Glowing ember rim — brighter + wider stroke with rage.
    ctx.strokeStyle = 'rgba(255, 150, 70, ' + Math.min(1, (0.85 + rage * 0.15) * heat).toFixed(3) + ')';
    ctx.lineWidth = 2 + rage * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, CIRC.r - 1, 0, Math.PI * 2);
    ctx.stroke();
    // Inner white-hot core ring — larger as rage grows.
    ctx.strokeStyle = 'rgba(255, 250, 230, ' + Math.min(1, (0.45 + rage * 0.35) * heat).toFixed(3) + ')';
    ctx.lineWidth = 1 + rage * 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, CIRC.r * (0.42 + rage * 0.18), 0, Math.PI * 2);
    ctx.stroke();

    // Combo readout inside the iron disc — pulses on each score.
    {
      const since = nowSec() - state.lastScoreTime;
      const pulse = since < SCORE_FLASH_S ? 1 - since / SCORE_FLASH_S : 0;
      const scale = 1 + pulse * 0.55;
      ctx.save();
      ctx.translate(CIRC.cx, CIRC.cy);
      ctx.scale(scale, scale);
      ctx.font = '700 38px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (state.combo > 0) {
        ctx.fillStyle = pulse > 0 ? '#fff5d6' : '#f0e3c4';
        ctx.shadowColor = 'rgba(255, 220, 140, ' + (0.5 + pulse * 0.45).toFixed(3) + ')';
        ctx.shadowBlur = 14 + pulse * 22;
      } else {
        ctx.fillStyle = '#3a2818';
      }
      ctx.fillText(String(state.combo), 0, 0);
      ctx.restore();
    }

    // Movement trails — tapered fading streaks behind moving colored balls;
    // width + alpha scale with the speed at each recorded sample.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < state.reds.length; i++) {
      const red = state.reds[i];
      if (red.poofed) continue;
      const trail = red.trail;
      if (!trail || trail.length < 2) continue;
      const rgb = BALL_GLOW_RGB[red.color];
      if (!rgb) continue;
      const N = trail.length;
      for (let j = 1; j < N; j++) {
        const a = trail[j - 1], b = trail[j];
        const u = 0.35 + 0.65 * (j / N);
        const spRatio = Math.min(1, ((a.sp + b.sp) * 0.5) / TRAIL_SPEED_MAX);
        if (spRatio < 0.02) continue;
        const width = R * 0.95 * u * (0.55 + 0.6 * spRatio);
        const alpha = Math.min(1, 0.92 * u * (0.55 + 0.6 * spRatio));
        ctx.strokeStyle = 'rgba(' + rgb + ', ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Compass balls — soft pulsing glow under lit ones, then the ball body.
    const tPulse = nowSec();
    for (let i = 0; i < state.reds.length; i++) {
      const r = state.reds[i];
      if (r.poofed) continue;
      if (r.lit) {
        const pulse = 0.85 + 0.18 * Math.sin(tPulse * 2.4 + i * 0.8);
        drawBallGlow(ctx, r.x, r.y, r.color, pulse);
      }
    }
    // Rotating arcane rings under every still-alive orb — slow, dashed, in
    // the orb's own colour. Counter-rotating per index for a coven feel.
    for (let i = 0; i < state.reds.length; i++) {
      const r = state.reds[i];
      if (r.poofed) continue;
      const rgb = BALL_GLOW_RGB[r.color];
      if (!rgb) continue;
      const dir = (i % 2 === 0) ? 1 : -1;
      const ang = tPulse * 0.9 * dir + i * 0.7;
      const r1 = R * 1.6;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(' + rgb + ', ' + (r.lit ? 0.40 : 0.18).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, r1, 0, Math.PI * 2);
      ctx.stroke();
      // Tick marks at four cardinal points on the ring
      ctx.setLineDash([]);
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r1 - 3), Math.sin(a) * (r1 - 3));
        ctx.lineTo(Math.cos(a) * (r1 + 3), Math.sin(a) * (r1 + 3));
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < state.reds.length; i++) {
      if (state.reds[i].poofed) continue;
      ctx.save();
      drawColoredBall(ctx, state.reds[i].x, state.reds[i].y, state.reds[i].color, state.reds[i].lit);
      ctx.restore();
    }

    if (state.phase === 'AIM' && state.preview) {
      ctx.save();
      ctx.strokeStyle = 'rgba(106, 176, 122, 0.55)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(state.cue.x, state.cue.y);
      ctx.lineTo(state.preview.px, state.preview.py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(106, 176, 122, 0.8)';
      ctx.beginPath();
      ctx.arc(state.preview.px, state.preview.py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (state.phase === 'BEND' && state.contact) {
      const c = state.contact;
      const natAng = Math.atan2(state.naturalDir.y, state.naturalDir.x);

      ctx.save();
      ctx.strokeStyle = 'rgba(184, 150, 92, 0.25)';
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(c.px + Math.cos(natAng) * 120, c.py + Math.sin(natAng) * 120);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      if (state.previewTraj && state.previewTraj.length > 1) {
        drawPolyline(ctx, state.previewTraj, 'rgba(184, 120, 120, 0.7)', [6, 6]);
        const lastP = state.previewTraj[state.previewTraj.length - 1];
        ctx.save();
        ctx.fillStyle = 'rgba(184, 120, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(lastP.x, lastP.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = '#b8965c';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(state.handle.x, state.handle.y);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      const g = ctx.createRadialGradient(state.handle.x - 2, state.handle.y - 2, 1, state.handle.x, state.handle.y, HANDLE_R);
      g.addColorStop(0, '#f0e3c4');
      g.addColorStop(0.45, '#b8965c');
      g.addColorStop(1, '#5a1a22');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(state.handle.x, state.handle.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a0e0e';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(240, 227, 196, 0.85)';
      ctx.beginPath();
      ctx.arc(c.px, c.py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Burning cue trail (REPLAY only) — the full path renders as a glowing
    // red rune across the felt. The most recent segments add an orange
    // flame body and a white-hot core so the "active fire" reads at the head.
    if (state.phase === 'REPLAY' && state.cue.trail && state.cue.trail.length >= 2) {
      const ct = state.cue.trail;
      const N = ct.length;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Pass 1 — the rune. One continuous red polyline, uniform brightness,
      // big ember shadow blur. This is the "inscribed in the felt" layer.
      ctx.shadowColor = 'rgba(255, 100, 30, 0.55)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(176, 28, 28, 0.62)';
      ctx.lineWidth = R * 1.25;
      ctx.beginPath();
      ctx.moveTo(ct[0].x, ct[0].y);
      for (let j = 1; j < N; j++) ctx.lineTo(ct[j].x, ct[j].y);
      ctx.stroke();

      // Pass 2 — orange flame body on the last ~18 samples (active fire).
      ctx.shadowBlur = 9;
      const flameLen = 18;
      const flameStart = Math.max(1, N - flameLen);
      for (let j = flameStart; j < N; j++) {
        const a = ct[j - 1], b = ct[j];
        const u = (j - flameStart + 1) / (N - flameStart + 1); // 0..1 → head
        ctx.strokeStyle = 'rgba(255, 130, 50, ' + (0.75 * u).toFixed(3) + ')';
        ctx.lineWidth = R * 0.95 * u;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Pass 3 — white-hot core only on the last ~8 samples (head flame tip).
      ctx.shadowBlur = 0;
      const coreLen = 8;
      const coreStart = Math.max(1, N - coreLen);
      for (let j = coreStart; j < N; j++) {
        const a = ct[j - 1], b = ct[j];
        const u = (j - coreStart + 1) / (N - coreStart + 1);
        ctx.strokeStyle = 'rgba(255, 232, 168, ' + (0.9 * u).toFixed(3) + ')';
        ctx.lineWidth = R * 0.45 * u;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      // Sprinkle ember sparks from the active head only so the rune behind
      // it reads as a settled burn rather than a wildfire.
      if (Math.random() < 0.7) {
        const idx = Math.max(0, N - 1 - Math.floor(Math.random() * 8));
        const s = ct[idx];
        state.particles.push({
          x: s.x + (Math.random() - 0.5) * 6,
          y: s.y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 50,
          vy: -(20 + Math.random() * 50),
          life: 0,
          maxLife: 0.4 + Math.random() * 0.3,
          color: 'rgba(255, 140, 50, 0.95)',
          size: 1.8,
          tail: 8 + Math.random() * 6
        });
      }
    }

    // Cue ball
    ctx.save();
    drawCueBall(ctx, state.cue.x, state.cue.y);
    ctx.restore();

    // SPIN_UP rotating energy spokes — ring contracts as it charges.
    if (state.phase === 'SPIN_UP') {
      const elapsed = nowSec() - state.spinUpStart;
      const u = Math.min(1, elapsed / SPIN_UP_DUR);
      const ringR = R + 22 - 14 * u;     // 33 → 19 px
      const len   = 6 + 4 * u;           // 6 → 10 px spokes
      const baseAng = nowSec() * 18;
      const spokes = 6;
      ctx.save();
      ctx.translate(state.cue.x, state.cue.y);
      ctx.strokeStyle = '#fff5d6';
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 + u * 1.2;
      ctx.shadowColor = 'rgba(255, 235, 180, 0.75)';
      ctx.shadowBlur = 10 + u * 12;
      for (let i = 0; i < spokes; i++) {
        const a = baseAng + (i / spokes) * Math.PI * 2;
        const r1 = ringR;
        const r2 = ringR + len;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Slow-mo vignette
    if (state.phase === 'FIRED' || state.phase === 'CURVE_FIRED') {
      const rem = state.totalFlightTime - state.flightTime;
      if (rem < SLOW_WINDOW_T) {
        const intensity = 1 - (rem / SLOW_WINDOW_T);
        ctx.save();
        const vg2 = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.65);
        vg2.addColorStop(0, 'rgba(90, 26, 34, 0)');
        vg2.addColorStop(1, 'rgba(90, 26, 34, ' + (0.55 * intensity).toFixed(3) + ')');
        ctx.fillStyle = vg2;
        ctx.fillRect(0, 0, W, H);
        if (state.contact) {
          const pulseR = 4 + intensity * 10;
          ctx.fillStyle = 'rgba(240, 227, 196, ' + (0.3 + 0.5 * intensity).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(state.contact.px, state.contact.py, pulseR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Effect layer — rings + particles drawn last so they read on top.
    if (state.rings.length) {
      ctx.save();
      for (let i = 0; i < state.rings.length; i++) {
        const r = state.rings[i];
        const u = r.life / r.maxLife;
        const alpha = 1 - u;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3 * (1 - u * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (state.particles.length) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const u = p.life / p.maxLife;
        const alpha = 1 - u;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - u * 0.5);
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 1) {
          const tailLen = (p.tail || 8) * (1 - u * 0.35);
          const inv = 1 / speed;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * inv * tailLen, p.y - p.vy * inv * tailLen);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Hit flash — brief bright wash whenever the cue triggers a bend on a red.
    {
      const sinceHit = nowSec() - state.lastHitTime;
      if (sinceHit < HIT_FLASH_S) {
        const intensity = 1 - sinceHit / HIT_FLASH_S;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 235, 180, ' + (0.18 * intensity).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    // REPLAY badge + progress bar
    if (state.phase === 'REPLAY') {
      const total = state.replay.frames.length;
      const u = total > 0 ? state.replay.playbackIndex / total : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(10, 4, 6, 0.55)';
      ctx.fillRect(0, 0, 140, 56);
      ctx.fillStyle = '#f0e3c4';
      ctx.font = '700 22px Cinzel, Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(184, 22, 22, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fillText('REPLAY', 16, 14);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120, 96, 72, 0.45)';
      ctx.fillRect(16, 42, 108, 4);
      ctx.fillStyle = '#f0e3c4';
      ctx.fillRect(16, 42, 108 * u, 4);
      ctx.font = '500 14px Cinzel, Georgia, serif';
      ctx.fillStyle = '#d8c8a8';
      ctx.fillText('score ' + state.score, W - 96, 18);
      ctx.restore();
    }

    // GAME OVER staged overlay — nothing during HOLD; big score reveal once
    // the flash has fired and through its FINAL_FLASH_DUR window.
    if (state.phase === 'GAME_OVER' && state.scoreFlashFired) {
      const flashElapsed = nowSec() - state.scoreFlashAt;
      const flashU = Math.min(1, flashElapsed / FINAL_FLASH_DUR);
      const popIn = Math.max(0, 1 - flashElapsed / 0.28); // first 0.28s pop

      ctx.save();
      ctx.fillStyle = 'rgba(10, 4, 8, ' + (0.45 + 0.3 * flashU).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);

      const scale = 1 + popIn * 0.55;
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = '600 22px Cinzel, Georgia, serif';
      ctx.shadowColor = '#b02424';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#c8a050';
      ctx.fillText('FINAL RECKONING', 0, -68);

      ctx.font = '900 104px Cinzel, Georgia, serif';
      ctx.shadowColor = '#fff5d6';
      ctx.shadowBlur = 36 + popIn * 30;
      ctx.fillStyle = '#fff5d6';
      ctx.fillText(String(state.score), 0, 10);

      ctx.font = '600 20px Cinzel, Georgia, serif';
      ctx.shadowColor = '#c8a050';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#c8a050';
      ctx.fillText('paid ' + state.runPayout, 0, 76);

      ctx.font = '500 18px Cinzel, Georgia, serif';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#8a6a28';
      const caption = state.endReason === 'cue-stop'
        ? 'the cue stilled'
        : 'the iron drank';
      ctx.fillText(caption, 0, 110);
      ctx.restore();
    }
  }

  function loop(t) {
    if (!state.lastT) state.lastT = t;
    let dt = (t - state.lastT) / 1000;
    if (dt > 0.05) dt = 0.05;
    state.lastT = t;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Pool = { init: init };
})();
