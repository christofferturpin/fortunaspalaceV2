/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CLOSENESS·WHEEL — vertical reel; the only closeness mini-game           │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   mount(rootEl) ──► injects reel cabinet + plinker + Spin button         │
  │                       │                                                  │
  │                       ├─ buildStrip() ──► STRIP_COPIES × N items         │
  │                       └─ #cls-wheel-btn click ──► spin()                 │
  │                                                                          │
  │   The "wheel" is a vertical cylinder viewed FROM THE FRONT — its         │
  │   circumference labels scroll past a fixed plinker on the right side     │
  │   that points at the middle visible row. Five rows are visible at any    │
  │   moment:                                                                │
  │           ┌──────────┐                                                   │
  │           │   ...    │                                                   │
  │           │   ...    │                                                   │
  │     ─────►│   ROW    │   ← plinker (catches each row edge as it goes by) │
  │           │   ...    │                                                   │
  │           │   ...    │                                                   │
  │           └──────────┘                                                   │
  │                                                                          │
  │   20 distribution slots (same layout / counts as the old wheel so the    │
  │   25/25/20/10/5/5/5/5 outcome probabilities are preserved). Each slot    │
  │   is one row on the reel.                                                │
  │                                                                          │
  │   PHYSICS — driven by requestAnimationFrame, semi-implicit Euler.        │
  │   THE FLAP IS THE FRICTION. Each peg-strike against the spring-damper    │
  │   flap exerts a Newton's-third-law reaction back on the wheel:           │
  │     per peg-strike:  v ← v · PEG_DRAG          PEG_DRAG = 0.948          │
  │     per Δt:          v ← max(0, v − BEARING_FRICTION·Δt)   = 30 px/s²    │
  │     stop floor:      if v < PEG_STOP_FLOOR after impact → v = 0          │
  │   Bearing friction is tiny (just guarantees a clean stop). The dominant  │
  │   decelerator is the flap eating ~5 % of the wheel's velocity per peg.   │
  │   At 20 pegs/rev that's 0.948²⁰ ≈ 34 % per rotation; the spin slows by   │
  │   ~2/3 every full rotation, so the cadence naturally stretches into the  │
  │   satisfying flick-flick-flick-flick…  flick……  flick………  CLICK at end.  │
  │     Plinker: torsional spring-damper hinged at its base. Each row edge   │
  │              crossing the centre kicks ω_p by POINTER_KICK·(0.55+0.45·   │
  │              violence) and fires Sound.tick(). K=4000, ζ≈0.47, 6-step    │
  │              sub-integration for spring stability under big Δt.          │
  │                                                                          │
  │   On stop the reel SNAPS to the nearest row boundary (so the middle row  │
  │   is cleanly centred under the plinker, never half-overlapping the next  │
  │   row). Then Closeness.applyOutcome(SLOTS[idx].kind) fires; AGAIN auto-  │
  │   respins after AGAIN_DELAY_MS.                                          │
  │                                                                          │
  │   Exports (window.ClosenessWheel): { mount }                             │
  │   External deps: window.Closeness (applyOutcome, setStatus, Sound)       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SLOTS[20]: {kind,icon,label,fill,text} — same layout/counts as the old wheel
  KINDS: closetick|money1|money5|money10|strike|hurt|meal|again
  CONST:
    N=20, ITEM_PX=80, WINDOW_H=400, CENTER=200, LOOP_PX=1600, STRIP_COPIES=4
    AGAIN_DELAY_MS=700, SPARK_INTERVAL_MS=32
    reel: BEARING_FRICTION=30 px/s², REEL_VEL_MIN=6, PUSH_MIN=800, PUSH_MAX=1100
          PEG_DRAG=0.948 (per peg-strike), PEG_STOP_FLOOR=35
    plinker: POINTER_K=4000, POINTER_C=60 (ζ≈0.47), POINTER_KICK=1600 px/s impulse, POINTER_SETTLED_{OMEGA=6,THETA=0.4}, POINTER_SUBSTEPS=6
  state: scrollPos, scrollVel, plinkerTheta, plinkerOmega, spinning, sparkTimer, physicsRaf, lastFrameTime, lastTickIdx
  mount(rootEl): inject .reel-stage .reel-cabinet .reel-window .reel-strip .reel-plinker .reel-floor + Spin btn; refs; buildStrip; btn click→spin
  buildStrip(): innerHTML = STRIP_COPIES copies × ∀i SLOTS[i] rendered as .reel-item (background slot.fill, color slot.text, icon span + label span). Duplicating gives seamless looping while scrollPos wraps mod LOOP_PX.
  spin(): guard spinning; scrollVel=rnd∈[PUSH_MIN,PUSH_MAX]; lastTickIdx=floor((scrollPos+CENTER)/ITEM_PX); .is-spinning on cabinet+plinker; startSparks; Sound.grindStart; rAF physicsTick
  physicsTick(): dt=clamp((now-lastFrameTime)/1000, 0, 0.05)
    reel: v-=BEARING_FRICTION·dt clamp≥0; scrollPos+=v·dt; while scrollPos≥LOOP_PX → -=LOOP_PX
    pegs: idx=floor((scrollPos+CENTER)/ITEM_PX); idx≠lastTickIdx → crossings=clamp(|Δ|,1,3); ∀k Sound.tick; plinkerOmega += KICK·(0.55+0.45·clamp(v/800))·crossings; ∀k v*=PEG_DRAG; if v<PEG_STOP_FLOOR → v=0
    plinker: 6 substeps of α=-K·θ_p - C·ω_p; ω_p+=α·subDt; θ_p+=ω_p·subDt
    render: strip.transform=translateY(-scrollPos); plinker.transform=rotate(θ_p)
    stop if v==0 ∧ |ω_p|<SETTLED_OMEGA ∧ |θ_p|<SETTLED_THETA → finishSpin
  finishSpin(): stopSparks; Sound.grindStop; remove .is-spinning; snap scrollPos to nearest row so middle row centred under plinker; idx=floor((scrollPos+CENTER)/ITEM_PX) mod N; kind=SLOTS[idx].kind; applyOutcome; kind==='again' → setTimeout(AGAIN_DELAY_MS)→spin
  startSparks/stopSparks/spawnSparkBurst: 4-7 sparks every 32ms from the plinker tip rect, position:fixed, --vx/--vy cone leftward (back into the reel)
  exports: global.ClosenessWheel={mount}
*/

(function () {
  // OBRA DINN palette — 1-bit Bayer-dither, pure B&W. Each kind gets its
  // own dither density (different "shade of gray" achieved with pure black
  // and white pixels in a Bayer-like pattern). All patterns are tiny SVG
  // tiles served as data URLs and scaled by background-size so each "dot"
  // is a chunky 2-3 css px — that's the look.
  //
  // tile syntax: a 2×2 or 4×4 SVG, fill='black' = lit pixel, the gaps are
  // the white field (declared as the background-color fallback after the
  // image). background-size sets how big a single pixel renders.
  const D = function (svg, tileCss, bg) {
    // URL-encode the SVG. SVG attributes use DOUBLE quotes so they get
    // encoded to %22 — bare url() doesn't accept literal quotes of either
    // kind, and encodeURIComponent leaves single quotes alone. Then the
    // unquoted url(...) works inside an HTML style="..." attribute too.
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="${svg.w}" height="${svg.h}" shape-rendering="crispEdges">${svg.rects}</svg>`;
    const enc = encodeURIComponent(raw);
    return `url(data:image/svg+xml,${enc}) 0 0/${tileCss} repeat, ${bg}`;
  };
  const r = (x, y, c) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;

  // Density levels (ratio of black pixels):
  const DITHER = {
    white:   '#fff',
    l12:     D({ w:4, h:4, rects: r(0,0,'black') + r(2,2,'black') }, '12px 12px', '#fff'),
    l25:     D({ w:2, h:2, rects: r(0,0,'black') }, '8px 8px', '#fff'),
    l37:     D({ w:4, h:4, rects: r(0,0,'black') + r(2,2,'black') + r(2,0,'black') + r(0,2,'black') + r(1,1,'black') + r(3,3,'black') }, '10px 10px', '#fff'),
    l50:     D({ w:2, h:2, rects: r(0,0,'black') + r(1,1,'black') }, '8px 8px', '#fff'),
    l62:     D({ w:4, h:4, rects: r(0,0,'white') + r(2,2,'white') + r(2,0,'white') + r(0,2,'white') + r(1,1,'white') + r(3,3,'white') }, '10px 10px', '#000'),
    l75:     D({ w:2, h:2, rects: r(0,0,'white') }, '8px 8px', '#000'),
    l87:     D({ w:4, h:4, rects: r(0,0,'white') + r(2,2,'white') }, '12px 12px', '#000'),
    black:   '#000',
  };

  // accent = colored tint multiplied over the dither — so each row reads
  // as (dither pattern) × (color), turning the white dots accent-colored
  // and keeping the black gaps black.
  const CLR = {
    closetick:    { fill: DITHER.l25,   accent: '#ff4080' },  // hot pink
    closetickAlt: { fill: DITHER.l37,   accent: '#ff80b8' },
    strike:       { fill: DITHER.black, accent: '#9020e0' },  // purple
    again:        { fill: DITHER.l50,   accent: '#ffd000' },  // yellow
    minislot:     { fill: DITHER.l37,   accent: '#00d0ff' },  // cyan
    money1:       { fill: DITHER.white, accent: '#80e0d0' },  // mint
    money5:       { fill: DITHER.l62,   accent: '#ffa040' },  // orange
    money10:      { fill: DITHER.l87,   accent: '#ff5020' },  // hot orange
    hurt:         { fill: DITHER.l75,   accent: '#ff2040' },  // blood red
    meal:         { fill: DITHER.l12,   accent: '#40d060' },  // bright green
  };

  // 80 rows — each of the previous 40 slots split into TWO and the whole
  // sequence run through a seeded shuffle, so the wheel reads as a longer
  // chaotic strip but the same exact kind-distribution holds:
  //   20×closetick, 20×strike, 16×again, 8×money1, 4×money5, 4×money10,
  //   4×hurt, 4×meal  →  25/25/20/10/5/5/5/5 % (preserved).
  const SLOTS = [];
  (function buildSlots() {
    const baseOrder = [
      'closetick','strike','closetick','again','strike','closetick','money1','strike',
      'closetick','hurt','strike','closetick','again','money5','strike','money1',
      'again','meal','money10','again',
      'closetick','strike','closetick','again','strike','closetick','money1','strike',
      'closetick','hurt','strike','closetick','again','money5','strike','money1',
      'again','meal','money10','again',
    ];
    // Double every entry inline → 80 (each kind appears twice as often
    // and in pairs initially), then run mild adjacency swaps with a
    // seeded PRNG so neighbours mix without losing rhythm. Half the
    // doubled AGAINs become MINISLOT — a sub-game that rolls 3 symbols.
    const order = [];
    let againSeen = 0;
    for (const k of baseOrder) {
      if (k === 'again') {
        // Alternate AGAIN / MINISLOT for each 'again' in baseOrder, so
        // after doubling-and-shuffling we end with 8 of each in 80 slots.
        order.push((againSeen++ % 2 === 0) ? 'again' : 'minislot');
        order.push((againSeen++ % 2 === 0) ? 'again' : 'minislot');
      } else {
        order.push(k, k);
      }
    }
    // Mulberry32 PRNG — deterministic so the wheel layout is the same
    // across page loads (outcome detection still works correctly).
    let s = 0x9E3779B9;
    const rand = () => {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // 60 short-range swaps — break up the doubled pairs without turning
    // the layout into noise.
    for (let i = 0; i < 60; i++) {
      const a = Math.floor(rand() * order.length);
      const b = (a + 1 + Math.floor(rand() * 4)) % order.length;
      const tmp = order[a]; order[a] = order[b]; order[b] = tmp;
    }

    const ICONS = {
      closetick: '♥',  strike: '✕',  again: '↻', minislot: '⊞',
      money1:    '$',  money5:  '$$', money10: '$$$',
      hurt:      '☠',  meal:    '◆',
    };
    const LABELS = {
      closetick: '+CLOSE',  strike: 'STRIKE',  again: 'SPIN AGAIN', minislot: 'MINI-SLOT',
      money1:    '+1%',     money5: '+5%',     money10: '+10%',
      hurt:      'HURT',    meal:   'MEAL',
    };
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      const clrKey = k === 'closetick' && i % 4 === 2 ? 'closetickAlt' : k;
      SLOTS.push({
        kind: k,
        icon: ICONS[k],
        label: LABELS[k],
        ...(CLR[clrKey] || CLR[k]),
      });
    }
  })();

  const N = SLOTS.length;        // 40 (built above)

  // Geometry
  const ITEM_PX = 80;
  const WINDOW_H = 400;        // 5 rows visible
  const CENTER = WINDOW_H / 2; // plinker points at this y inside the window
  const LOOP_PX = N * ITEM_PX; // 1600
  const STRIP_COPIES = 4;      // duplicate items so the loop wrap is invisible
  const AGAIN_DELAY_MS = 350;        // halved for snappier auto-respin
  const SPARK_INTERVAL_MS = 32;

  // Reel physics: the flap-impact IS the friction. Every peg-strike against
  // the spring-damper flap exerts a Newton's-third-law reaction force back
  // on the wheel, draining a fraction of its velocity. This is the dominant
  // (and almost only) decelerator — there's a tiny bearing-friction baseline
  // just to guarantee a clean stop, but most of what the player sees is the
  //   flick — flick — flick — flick — flick…  flick……  flick………  CLICK.
  //
  //   per peg-strike:  v ← v · PEG_DRAG       (multiplicative reaction force)
  //   per Δt:          v ← max(0, v − BEARING_FRICTION · Δt)
  //   on impact:       if v < STOP_FLOOR  →  v = 0
  //
  // With PEG_DRAG = 0.948 (~5.2 % per peg) and 20 pegs per revolution:
  //   0.948²⁰ ≈ 0.34   → 34 % velocity per rotation
  //   Starting at v₀=1000 → after 1 rev ≈ 340, after 2 ≈ 116, after 3 ≈ 40
  // The drag is constant-fraction so the cadence stretches naturally — early
  // pegs feel like a rattle, late pegs feel like distinct chunky clinks.
  const BEARING_FRICTION    = 80;    // px/s² — slight low-speed drag
  const REEL_VEL_MIN        = 6;     // px/s — coast threshold
  const PUSH_MIN            = 1800;  // px/s — much harder push so it
  const PUSH_MAX            = 2400;  // goes AROUND multiple times
  const PEG_DRAG            = 0.982; // tuned for 80 pegs/rev (was 0.965 @ 40)
  const PEG_STOP_FLOOR      = 75;    // raise floor so the tail doesn't crawl

  // Plinker physics — identical to the old wheel-pointer spring-damper.
  // K=4000 → ω_n≈63 rad/s → 100 ms period. C=60 → ζ≈0.47 → one overshoot.
  // 6-step sub-integration: symplectic Euler is conditionally stable
  // (Δt < 2/√K ≈ 32 ms); sub-stepping keeps the inner Δt small.
  const POINTER_K       = 4000;
  const POINTER_C       = 60;
  const POINTER_KICK    = 1600;  // deg/s impulse per row crossing
  const POINTER_SETTLED_OMEGA = 6;
  const POINTER_SETTLED_THETA = 0.4;
  const POINTER_SUBSTEPS = 6;

  let stage = null;
  let cabinet = null;
  let strip = null;
  let plinker = null;
  let btn = null;
  let btnLabel = null;
  let powerEl = null;
  let powerNeedle = null;

  let scrollPos = 0;        // px, [0, LOOP_PX)
  let scrollVel = 0;        // px/s
  let plinkerTheta = 0;     // deg (rotation of the plinker tip)
  let plinkerOmega = 0;     // deg/s
  let spinning = false;
  let sparkTimer = null;
  let physicsRaf = null;
  let lastFrameTime = 0;
  let lastTickIdx = 0;
  // When the player fires in the red STRIKE zone of the power meter, we
  // mark the next spin as a forced-strike — physics still runs (a feeble
  // half-spin), but finishSpin overrides the outcome to 'strike'.
  let forceStrikeNextSpin = false;

  // Power meter state — see arm()/fire() below. Vertical meter:
  // Position 1 = TOP (FULL), 0 = BOTTOM (STRIKE).
  // POWER_SPEED 3.2 → full sweep in 0.31 s; bounces off endpoints.
  const POWER_SPEED       = 3.2;
  const POWER_STRIKE_MAX  = 0.20;   // bottom 20 % of meter = STRIKE
  let powerPos = 1;
  let powerDir = -1;        // -1 = moving toward 0 (left), +1 = toward 1
  let powerArmed = false;
  let powerRaf = null;
  let powerLastFrame = 0;

  function mount(rootEl) {
    rootEl.innerHTML = `
      <div class="wheel-stage">
        <div class="reel-rig">
          <div class="power-meter" id="cls-power" data-state="idle">
            <div class="power-track">
              <div class="power-zone power-zone-high">FULL</div>
              <div class="power-zone power-zone-mid">MID</div>
              <div class="power-zone power-zone-low">LOW</div>
              <div class="power-zone power-zone-strike">STRIKE</div>
            </div>
            <div class="power-needle" id="cls-power-needle"></div>
          </div>
          <div class="reel-window">
            <div class="reel-strip" id="cls-reel"></div>
            <div class="reel-band-top"></div>
            <div class="reel-band-bottom"></div>
          </div>
          <div class="reel-plinker">
            <div class="reel-plinker-tip"></div>
          </div>
        </div>
      </div>
      <div class="closeness-controls">
        <button class="closeness-btn" id="cls-wheel-btn" type="button">
          <span id="cls-wheel-btn-label">SPIN</span>
          <span class="closeness-btn-hint">[space]</span>
        </button>
      </div>
    `;
    stage = rootEl.querySelector('.wheel-stage');
    cabinet = rootEl.querySelector('.reel-cabinet');
    strip = document.getElementById('cls-reel');
    plinker = rootEl.querySelector('.reel-plinker-tip');
    btn = document.getElementById('cls-wheel-btn');
    btnLabel = document.getElementById('cls-wheel-btn-label');
    powerEl = document.getElementById('cls-power');
    powerNeedle = document.getElementById('cls-power-needle');

    buildStrip();

    btn.addEventListener('click', () => {
      window.Closeness.Sound.init();
      handleAction();
    });

    // SPACE = same as clicking the button. Ignore when an input/textarea
    // has focus, and when the button is disabled mid-spin.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (spinning) return;
      e.preventDefault();
      window.Closeness.Sound.init();
      handleAction();
    });
  }

  // The button does one of two things depending on state:
  //   IDLE  →  arm the power meter (needle starts oscillating)
  //   ARMED →  fire (capture needle, spin)
  function handleAction() {
    if (spinning) return;
    if (!powerArmed) arm();
    else fire();
  }

  function arm() {
    powerArmed = true;
    powerPos = 1;
    powerDir = -1;
    if (powerEl) powerEl.dataset.state = 'armed';
    if (btnLabel) btnLabel.textContent = 'FIRE!';
    powerLastFrame = performance.now();
    if (powerRaf) cancelAnimationFrame(powerRaf);
    powerRaf = requestAnimationFrame(powerTick);
  }

  function powerTick() {
    const now = performance.now();
    let dt = (now - powerLastFrame) / 1000;
    if (dt > 0.05) dt = 0.05;
    powerLastFrame = now;
    powerPos += POWER_SPEED * powerDir * dt;
    if (powerPos > 1) { powerPos = 1; powerDir = -1; }
    if (powerPos < 0) { powerPos = 0; powerDir = +1; }
    if (powerNeedle) {
      // Vertical meter: position 1 = TOP (FULL), 0 = BOTTOM (STRIKE).
      powerNeedle.style.top = ((1 - powerPos) * 100) + '%';
    }
    if (powerArmed) powerRaf = requestAnimationFrame(powerTick);
  }

  function fire() {
    if (powerRaf) { cancelAnimationFrame(powerRaf); powerRaf = null; }
    powerArmed = false;
    if (powerEl) powerEl.dataset.state = 'firing';

    // Map needle position → velocity. Bottom POWER_STRIKE_MAX of the bar is
    // the forced-strike zone; anywhere above maps linearly to the normal
    // [PUSH_MIN, PUSH_MAX] range.
    let v;
    if (powerPos < POWER_STRIKE_MAX) {
      // STRIKE: weak token spin so the player SEES the failure, then we
      // override the outcome to 'strike' in finishSpin.
      v = 200 + powerPos * 200;   // ~200-240 px/s — barely scrolls
      forceStrikeNextSpin = true;
    } else {
      const p = (powerPos - POWER_STRIKE_MAX) / (1 - POWER_STRIKE_MAX);
      v = PUSH_MIN + p * (PUSH_MAX - PUSH_MIN);
      forceStrikeNextSpin = false;
    }
    spin({ velocity: v });
  }

  function buildStrip() {
    let html = '';
    for (let c = 0; c < STRIP_COPIES; c++) {
      for (let i = 0; i < N; i++) {
        const s = SLOTS[i];
        html += `<div class="reel-item" data-kind="${s.kind}" style="background:${s.fill};--accent:${s.accent};height:${ITEM_PX}px;">`
              + `<span class="reel-icon">${s.icon}</span>`
              + `<span class="reel-label">${s.label}</span>`
              + `<span class="reel-peg" aria-hidden="true"></span>`
              + `</div>`;
      }
    }
    strip.innerHTML = html;
  }

  function spin(opts) {
    if (spinning) return;
    spinning = true;
    btn.disabled = true;
    if (powerEl) powerEl.dataset.state = 'spinning';
    if (btnLabel) btnLabel.textContent = '…';
    window.Closeness.setStatus('…');

    const v0 = (opts && typeof opts.velocity === 'number')
      ? opts.velocity
      : PUSH_MIN + Math.random() * (PUSH_MAX - PUSH_MIN);
    scrollVel = v0;
    lastTickIdx = Math.floor((scrollPos + CENTER) / ITEM_PX);

    if (stage) stage.classList.add('is-spinning');
    if (cabinet) cabinet.classList.add('is-spinning');

    startSparks();
    if (window.Closeness.Sound.grindStart) window.Closeness.Sound.grindStart();

    lastFrameTime = performance.now();
    physicsRaf = requestAnimationFrame(physicsTick);
  }

  // One physics step. The reel scrolls UP (y increasing) so the strip's
  // CSS transform is translateY(-scrollPos). Each row crossing the plinker
  // line at y == CENTER fires Sound.tick + a plinker impulse.
  function physicsTick() {
    const now = performance.now();
    let dt = (now - lastFrameTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastFrameTime = now;

    // ── reel: tiny baseline bearing drag, otherwise coast ──
    if (scrollVel > 0) {
      scrollVel -= BEARING_FRICTION * dt;
      if (scrollVel < REEL_VEL_MIN) scrollVel = 0;
    }
    scrollPos += scrollVel * dt;
    while (scrollPos >= LOOP_PX) scrollPos -= LOOP_PX;

    // ── row crossing → peg-strike: tick + plinker kick + reaction drag ──
    // EVERY peg-strike drains a fraction of wheel velocity (Newton's third
    // law: the wheel pushes the flap, the flap pushes back). This is the
    // dominant decelerator — the wheel stops because the flap keeps eating
    // its momentum, one click at a time. Each impact also throws a burst
    // of white sparks scaled by how fast the wheel was when it hit.
    const tickIdxNow = Math.floor((scrollPos + CENTER) / ITEM_PX);
    if (tickIdxNow !== lastTickIdx) {
      const crossings = Math.min(Math.abs(tickIdxNow - lastTickIdx), 3);
      for (let k = 0; k < crossings; k++) window.Closeness.Sound.tick();
      const violence = Math.min(1, scrollVel / 800);
      plinkerOmega += POINTER_KICK * (0.55 + 0.45 * violence) * crossings;
      // Speed-scaled spark burst right at the impact moment.
      const sparkPower = Math.min(1.4, scrollVel / 350);
      if (sparkPower > 0.2) spawnSparkBurst(sparkPower * crossings);
      // Reaction drag — per crossing, so a multi-row jump still applies
      // multiple impacts. Floor-snap when the next impact wouldn't move
      // the reel meaningfully further.
      for (let k = 0; k < crossings; k++) {
        scrollVel *= PEG_DRAG;
      }
      if (scrollVel < PEG_STOP_FLOOR) scrollVel = 0;
      lastTickIdx = tickIdxNow;
    }

    // ── plinker spring-damper, sub-stepped ──
    const subDt = dt / POINTER_SUBSTEPS;
    for (let s = 0; s < POINTER_SUBSTEPS; s++) {
      const alpha = -POINTER_K * plinkerTheta - POINTER_C * plinkerOmega;
      plinkerOmega += alpha * subDt;
      plinkerTheta += plinkerOmega * subDt;
    }

    // ── render ──
    strip.style.transform = `translateY(${(-scrollPos).toFixed(2)}px)`;
    if (plinker) {
      plinker.style.transform = `rotate(${plinkerTheta.toFixed(2)}deg)`;
    }

    const reelMoving = scrollVel > 0;
    const plinkerMoving = Math.abs(plinkerOmega) > POINTER_SETTLED_OMEGA
                       || Math.abs(plinkerTheta) > POINTER_SETTLED_THETA;
    if (reelMoving || plinkerMoving) {
      physicsRaf = requestAnimationFrame(physicsTick);
    } else {
      physicsRaf = null;
      plinkerOmega = 0;
      plinkerTheta = 0;
      if (plinker) plinker.style.transform = 'rotate(0deg)';
      finishSpin();
    }
  }

  function finishSpin() {
    stopSparks();
    if (window.Closeness.Sound.grindStop) window.Closeness.Sound.grindStop();
    if (stage) stage.classList.remove('is-spinning');
    if (cabinet) cabinet.classList.remove('is-spinning');

    // No snap — the wheel rests wherever the flap-impact physics carried
    // it. Outcome is whichever row's centre is closest to the plinker line
    // at that exact resting position; the strip stays put.
    const idx = ((Math.floor((scrollPos + CENTER) / ITEM_PX) % N) + N) % N;

    // The "wheel must spin one time or strike!" rule — if the player fired
    // in the red zone of the power meter, override whatever row landed under
    // the plinker to a STRIKE so the failure is the gameplay penalty.
    let kind = SLOTS[idx].kind;
    if (forceStrikeNextSpin) {
      kind = 'strike';
      forceStrikeNextSpin = false;
    }

    window.Closeness.applyOutcome(kind);
    spinning = false;

    if (powerEl) powerEl.dataset.state = 'idle';
    if (btnLabel) btnLabel.textContent = 'SPIN';

    if (kind === 'again') {
      btn.disabled = true;
      // AGAIN auto-respin bypasses the power meter — the wheel just goes
      // again at a random normal velocity (no skill check).
      setTimeout(() => spin(), AGAIN_DELAY_MS);
    } else {
      btn.disabled = false;
    }
  }

  // Sparks fire from the plinker tip at each peg-strike (not on an
  // interval) — caller passes `intensity` derived from current wheel
  // velocity, so a fast wheel throws bigger, faster, more numerous sparks
  // and a slow one barely spits anything.
  // (startSparks/stopSparks kept as no-ops so existing call sites stay
  // safe; the work happens inline at each peg-strike in physicsTick.)
  function startSparks() {}
  function stopSparks() {}

  function spawnSparkBurst(intensity) {
    if (!plinker) return;
    const rect = plinker.getBoundingClientRect();
    if (!rect.width) return;
    const ox = rect.left;                          // tip is at the LEFT edge
    const oy = rect.top + rect.height / 2;
    const p = Math.max(0.3, Math.min(1.8, intensity || 1));
    // Toned down — still has force per spark, just fewer of them so the
    // screen isn't drowned in noise.
    const count = Math.max(2, Math.floor(2 + p * 5));          // 2..11
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('span');
      spark.className = 'wheel-spark';
      // Cone: 120°..240°. 180° = straight left.
      const angleDeg = 120 + Math.random() * 120;
      const angle = angleDeg * Math.PI / 180;
      const speed = (100 + Math.random() * 220) * p;            // 100..600
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      spark.style.setProperty('--vx', `${vx.toFixed(1)}px`);
      spark.style.setProperty('--vy', `${vy.toFixed(1)}px`);
      spark.style.left = `${ox}px`;
      spark.style.top = `${oy}px`;
      spark.style.animationDuration = `${(320 + Math.random() * 260) * (0.7 + p * 0.4)}ms`;
      document.body.appendChild(spark);
      spark.addEventListener('animationend', () => spark.remove(), { once: true });
    }
  }

  // External API — page.js calls requestRespin() when the minislot
  // sub-game rolls the ↻ symbol, giving the player a free wheel respin
  // that bypasses the power meter.
  function requestRespin() {
    if (spinning) return;
    if (btn) btn.disabled = true;
    setTimeout(() => spin(), AGAIN_DELAY_MS);
  }

  window.ClosenessWheel = { mount, requestRespin };
})();
