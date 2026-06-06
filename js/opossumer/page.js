/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  OPOSSUMER PAGE  —  Frogger-style level ladder w/ wager + cash/push      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ ctx from #op-canvas                          │
  │                          ├─ bind() ──► #op-start ──► startRun()          │
  │                          │             #op-cash  ──► cashOut()           │
  │                          │             #op-push  ──► pushIt()            │
  │                          │             #op-restart ──► newRun()          │
  │                          │             #op-wager-max ──► set max wager   │
  │                          │             #op-wager input ──► renderLadder  │
  │                          │             window keydown ──► onKey()        │
  │                          ├─ loadLevel(0); renderLadder; setButtons       │
  │                          └─ rAF ──► loop(ts)                             │
  │                                                                          │
  │   loop(ts) ──► update(dt) ──► render() ──► renderHud()                   │
  │     update: moves cars; advances hopT; checkCollision() ──► onDeath();   │
  │             reaching row 0 ──► onLevelCleared()                          │
  │     render: drawRoad() ──► drawCars() ──► drawBaby()                     │
  │                                                                          │
  │   Level setup: buildLanes(cfg) ──► lanes[]; loadLevel(idx) sizes canvas  │
  │   Helpers: levelMult(n), payoutForLevel(n, wager), formatMult(m)         │
  │            playerPixel() ──► {x,y}; getWager() ──► int                   │
  │   Input:  onKey(e) ──► tryHop(dc, dr)                                    │
  │   State transitions: startRun → playing → cleared → (cashOut|pushIt)     │
  │                       playing → dead → newRun → idle                     │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet (spend/add/getBalance),                   │
  │                   window.Child.recordPlay                                │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SLOW_SPEED_MIN=25; SLOW_SPEED_MAX=55; LEVELS=[10 cfg{lanes,speedMin,speedMax,carsPerLane,slowLanes}]; MAX_LEVELS=10
  CELL=32; COLS=16; HOP_DUR=110
  state: runState='idle'|'playing'|'cleared'|'dead'|'cashed', runActive=F, runWager=0, levelIdx=0, pot=0, rows=0, lanes=[], player={col,row,hopFrom,hopT}, lastFrame=0, canvas, ctx, promptEl
  levelMult(n)→num: n===3?1.75:0.5*n
  payoutForLevel(n,wager)→int: floor(levelMult(n)*wager)
  formatMult(m)→str: m≥10?'×N':'×N.NN'
  levelRowCount(cfg)→int: cfg.lanes+2
  buildLanes(cfg)→lanes[]: pick slowCount lane indices (shuffled); ∀i dir=i%2?-1:1; isSlow→SLOW range else cfg range; speed=lo+rnd*(hi-lo); cars=[carsPerLane × {x,w=(longRand)1or2.4 CELL}]; ret [{dir,speed,cars,slow}]
  loadLevel(idx): cfg=LEVELS[idx]; rows=levelRowCount; lanes=buildLanes; canvas W=COLS*CELL,H=rows*CELL; player.col=COLS/2,row=rows-1,hopFrom=null
  tryHop(dc,dr): guard(runState!=='playing'||hopFrom); nc=col+dc,nr=row+dr; bounds-check; hopFrom={col,row}; col=nc,row=nr; hopT=0
  onKey(e): guard(input/textarea/contentEditable); ArrowUp/W→tryHop(0,-1); Down/S→(0,1); Left/A→(-1,0); Right/D→(1,0); preventDefault each
  playerPixel()→{x,y}: !hopFrom→cellCenter; else lerp from hopFrom→target by t=hopT/HOP_DUR
  checkCollision()→bool: guard(hopFrom||row==0||row==rows-1); lane=lanes[row-1]; p=playerPixel; half=CELL*.36; ∀car if car.x<pRight && car.x+w>pLeft→T
  update(dt): ∀lane ∀car car.x+=dir*speed*dt/1000; wrap; guard(runState!=='playing'); hopT+=dt; hopT≥HOP_DUR→hopFrom=null; collision→onDeath; row===0 && !hopFrom→onLevelCleared
  drawRoad(): top safe green, bottom safe gravel, asphalt mid; dashed yellow lane stripes; solid edge lines; stable grass tufts (cached); shimmer gravel on bottom
  drawCars(): ∀lane,car body+trim+windshield+head/tail lights (color by dir)
  drawBaby(): p=playerPixel; lift=sin(hopT/HOP_DUR*π)*4; splat=dead→blood ellipse; emoji font; fillText 👶 or 💀
  render(): drawRoad; drawCars; drawBaby; cleared/dead/cashed→tint overlay
  loop(ts): dt=min(60,ts-lastFrame); update(dt); render; renderHud; rAF
  getWager()→int: max(1,floor(#op-wager.value||0)); writeback if differs
  setPrompt(text,cls): promptEl.text=text; rm win/loss/err/info; add cls; toggle is-on
  setButtons(): wager+max.disabled=runActive; start.hidden=runState!=='idle'; cash+push.hidden=runState!=='cleared'; restart.hidden=!dead&&!cashed; cleared→cash.text='💰 CASH · '+pot; nextL>MAX→push.hidden else push.text='PUSH → L'+nextL+' · '+mult
  renderHud(): #op-level=oneBased|'—'; wager-display; mult; pot
  renderLadder(): ∀n 1..MAX li.classList toggle is-climbed/current/active/next; innerHTML L+mult+coins
  onLevelCleared(): state='cleared'; pot=payoutForLevel; oneBased≥MAX→Wallet.add(pot),runActive=F,state='cashed','Top of ladder'; else 'Cleared Lx — pot N'; setButtons; renderLadder
  onDeath(): lost=runWager; state='dead'; runActive=F; pot=0; setPrompt 'Squish. −N coins'; setButtons; renderLadder
  startRun(): guard(runState!=='idle'); wager=getWager; Wallet.spend(wager)? else err; Child.recordPlay; runWager=wager,runActive=T,pot=0,levelIdx=0,state='playing'; loadLevel(0); blurActive; setPrompt; setButtons; renderLadder
  blurActive(): activeElement?.blur
  pushIt(): guard(runState!=='cleared'); levelIdx+=1; ≥MAX ret; state='playing'; loadLevel; blur; prompt; setButtons; renderLadder
  cashOut(): guard(runState!=='cleared'); Wallet.add(pot); runActive=F,state='cashed'; setPrompt; setButtons; renderLadder
  newRun(): guard(state!=='dead'&&state!=='cashed'); state='idle',runActive=F,runWager=0,pot=0,levelIdx=0; loadLevel(0); setPrompt 'Set wager…'; setButtons; renderLadder
  bind(): #op-start click→startRun; cash→cashOut; push→pushIt; restart→newRun; wager-max→#op-wager=Wallet.balance,renderLadder; #op-wager input→!runActive&&renderLadder; window keydown→onKey
  init(): canvas=#op-canvas; ctx=2d, smoothing=F; promptEl=#op-prompt; bind; loadLevel(0); renderLadder; setButtons; rAF(loop)
  exports: none (IIFE-local); on DOMContentLoaded→init
*/

(function (global) {
  // ===== Level config =====
  // Multiplier at level n is 1.5 × n (so L1 ×1.5, L2 ×3.0, … L10 ×15.0).
  // Each level adds a lane and ratchets car speed + density. Direction
  // alternates by lane index so the player has to track both sides.
  // Slow-lane speed range — used for "rest lanes" sprinkled into L4+ levels
  // so the player has reliable safe-ish strips to pause in.
  const SLOW_SPEED_MIN = 25;
  const SLOW_SPEED_MAX = 55;

  const LEVELS = [
    // ---- Tone-down sweep (L1-L5): everything slower than before. L4 + L5
    // are deliberate "breather" levels — base speed dips and slow lanes
    // multiply, so the player has a comfortable mid-game plateau. ----
    { lanes: 3,  speedMin:  55, speedMax:  95, carsPerLane: 2, slowLanes: 0 },
    { lanes: 4,  speedMin:  75, speedMax: 120, carsPerLane: 3, slowLanes: 0 },
    { lanes: 5,  speedMin:  90, speedMax: 145, carsPerLane: 3, slowLanes: 0 },
    { lanes: 6,  speedMin:  80, speedMax: 130, carsPerLane: 4, slowLanes: 2 },
    { lanes: 7,  speedMin:  80, speedMax: 130, carsPerLane: 4, slowLanes: 3 },
    // ---- Ramp re-engages at L6: each push adds ~20 px/s on top of L5's
    // base, and the slow-lane count drops to 2 so the road tightens up
    // again. L10 still tops out well under the brutal old curve. ----
    { lanes: 8,  speedMin: 105, speedMax: 160, carsPerLane: 4, slowLanes: 2 },
    { lanes: 9,  speedMin: 125, speedMax: 185, carsPerLane: 4, slowLanes: 2 },
    { lanes: 10, speedMin: 145, speedMax: 210, carsPerLane: 4, slowLanes: 2 },
    { lanes: 11, speedMin: 165, speedMax: 235, carsPerLane: 4, slowLanes: 2 },
    { lanes: 12, speedMin: 185, speedMax: 260, carsPerLane: 5, slowLanes: 2 },
  ];

  const MAX_LEVELS = LEVELS.length;
  const CELL = 32;
  const COLS = 16;
  const HOP_DUR = 110;            // ms — duration of a single hop animation

  function levelMult(n) { return n === 3 ? 1.75 : 0.5 * n; } // n is 1-based; L1 ×0.5, L3 ×1.75, L10 ×5.0
  function payoutForLevel(n, wager) { return Math.floor(levelMult(n) * wager); }
  function formatMult(m) {
    if (m >= 10) return '×' + m.toFixed(0);
    const r = Math.round(m * 100) / 100;
    return '×' + (Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2));
  }

  // ===== Run state =====
  // States:
  //   idle     — pre-game, wager is editable, no canvas action
  //   playing  — opossum is crossing; arrow keys / WASD / SPACE active
  //   cleared  — reached top safe zone; cash or push decision
  //   dead     — got hit; pot wiped, NEW RUN to reset
  //   cashed   — took the pot; NEW RUN to play again
  let runState = 'idle';
  let runActive = false;
  let runWager = 0;
  let levelIdx = 0;             // 0-based index into LEVELS
  let pot = 0;
  let rows = 0;                 // total grid rows for current level
  let lanes = [];               // [{ dir, speed, cars: [{x, w}] }]
  let player = { col: Math.floor(COLS / 2), row: 0, hopFrom: null, hopT: 0 };
  let lastFrame = 0;
  let canvas, ctx;
  let promptEl;

  // ===== Setup per level =====

  function levelRowCount(cfg) { return cfg.lanes + 2; } // 1 top safe + lanes + 1 start

  function buildLanes(cfg) {
    // Pick which lane indices get the "slow" treatment this level. Shuffled
    // pick so the slow strips aren't always at the same y position, but we
    // avoid putting two slow lanes adjacent to each other where possible —
    // breathing room reads better when it's spread out.
    const slowCount = Math.min(cfg.slowLanes || 0, cfg.lanes);
    const indices = Array.from({ length: cfg.lanes }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const slowSet = new Set(indices.slice(0, slowCount));

    const result = [];
    for (let i = 0; i < cfg.lanes; i++) {
      // Direction alternates by lane index; lane 0 (closest to top) goes right
      // so the visual rhythm is consistent regardless of how many lanes there
      // are this level.
      const dir = i % 2 === 0 ? 1 : -1;
      const isSlow = slowSet.has(i);
      const lo = isSlow ? SLOW_SPEED_MIN : cfg.speedMin;
      const hi = isSlow ? SLOW_SPEED_MAX : cfg.speedMax;
      const speed = lo + Math.random() * (hi - lo);
      const cars = [];
      const canvasW = COLS * CELL;
      const baseGap = canvasW / cfg.carsPerLane;
      // Pre-place cars evenly with jitter so each lane looks distinct on spawn.
      // A small offset puts cars somewhere in the middle of their gap, not
      // packed at x=0.
      for (let c = 0; c < cfg.carsPerLane; c++) {
        const isLong = Math.random() < 0.25;
        const w = (isLong ? 2 : 1) * CELL + (isLong ? CELL * 0.4 : 0);
        const x = c * baseGap + Math.random() * (baseGap - w);
        cars.push({ x, w });
      }
      result.push({ dir, speed, cars, slow: isSlow });
    }
    return result;
  }

  function loadLevel(idx) {
    const cfg = LEVELS[idx];
    rows = levelRowCount(cfg);
    lanes = buildLanes(cfg);
    canvas.width = COLS * CELL;
    canvas.height = rows * CELL;
    player.col = Math.floor(COLS / 2);
    player.row = rows - 1;       // bottom safe zone
    player.hopFrom = null;
    player.hopT = 0;
  }

  // ===== Input =====

  function tryHop(dc, dr) {
    if (runState !== 'playing') return;
    if (player.hopFrom) return; // mid-hop
    const nc = player.col + dc;
    const nr = player.row + dr;
    if (nc < 0 || nc >= COLS) return;
    if (nr < 0 || nr >= rows) return;
    player.hopFrom = { col: player.col, row: player.row };
    player.col = nc;
    player.row = nr;
    player.hopT = 0;
  }

  function onKey(e) {
    // Don't fight focused inputs (wager box, BBS terminal, etc.) — when the
    // player is typing somewhere, the baby is not crawling.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // Only block default scrolling for keys we actually use, so the page
    // stays scrollable with Tab/PgUp/etc.
    const k = e.key;
    if (k === 'ArrowUp'    || k === 'w' || k === 'W') { e.preventDefault(); tryHop(0, -1); }
    else if (k === 'ArrowDown'  || k === 's' || k === 'S') { e.preventDefault(); tryHop(0,  1); }
    else if (k === 'ArrowLeft'  || k === 'a' || k === 'A') { e.preventDefault(); tryHop(-1, 0); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); tryHop( 1, 0); }
  }

  // ===== Frame =====

  function playerPixel() {
    if (!player.hopFrom) {
      return {
        x: player.col * CELL + CELL / 2,
        y: player.row * CELL + CELL / 2,
      };
    }
    const t = Math.min(1, player.hopT / HOP_DUR);
    const fx = player.hopFrom.col * CELL + CELL / 2;
    const fy = player.hopFrom.row * CELL + CELL / 2;
    const tx = player.col * CELL + CELL / 2;
    const ty = player.row * CELL + CELL / 2;
    return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t };
  }

  function checkCollision() {
    // Airborne during a hop — Frogger logic, the opossum is mid-leap and a
    // car can't clip it. Collision resolves once the hop lands.
    if (player.hopFrom) return false;
    // Safe zones (top + bottom rows) never collide.
    if (player.row === 0 || player.row === rows - 1) return false;
    const laneIdx = player.row - 1;
    const lane = lanes[laneIdx];
    if (!lane) return false;
    const p = playerPixel();
    const half = CELL * 0.36; // hitbox — slightly tighter now that there's no play-dead bail-out
    const pLeft = p.x - half;
    const pRight = p.x + half;
    for (const car of lane.cars) {
      if (car.x < pRight && car.x + car.w > pLeft) return true;
    }
    return false;
  }

  function update(dt) {
    // Cars always move — the road keeps flowing under "cleared" and "dead"
    // overlays so the page never looks frozen.
    for (const lane of lanes) {
      const W = canvas.width;
      const wrap = W + 80;
      for (const car of lane.cars) {
        car.x += lane.dir * lane.speed * (dt / 1000);
        if (lane.dir > 0 && car.x > W + 40) car.x -= wrap;
        if (lane.dir < 0 && car.x < -car.w - 40) car.x += wrap;
      }
    }

    if (runState !== 'playing') return;

    if (player.hopFrom) {
      player.hopT += dt;
      if (player.hopT >= HOP_DUR) {
        player.hopFrom = null;
        player.hopT = 0;
      }
    }

    if (checkCollision()) {
      onDeath();
      return;
    }

    // Reached top safe zone = level cleared.
    if (player.row === 0 && !player.hopFrom) {
      onLevelCleared();
    }
  }

  // ===== Draw =====

  function drawRoad() {
    const W = canvas.width;
    const H = canvas.height;
    // Top safe zone — grass-ish dirt strip ("the median").
    ctx.fillStyle = '#1a2818';
    ctx.fillRect(0, 0, W, CELL);
    // Bottom safe zone — shoulder gravel.
    ctx.fillStyle = '#241c14';
    ctx.fillRect(0, H - CELL, W, CELL);
    // Asphalt for the middle.
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(0, CELL, W, H - 2 * CELL);

    // Lane stripes between adjacent road rows. Dashed yellow that scrolls
    // slightly with each lane's direction would be nice; for a first cut a
    // static dashed line per boundary reads fine.
    ctx.strokeStyle = '#8a7838';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 8]);
    for (let i = 1; i < lanes.length; i++) {
      const y = (i + 1) * CELL;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Solid lines at the safe-zone edges so the road border reads.
    ctx.strokeStyle = '#e0d090';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, CELL); ctx.lineTo(W, CELL);
    ctx.moveTo(0, H - CELL); ctx.lineTo(W, H - CELL);
    ctx.stroke();

    // Tiny grass tufts on the top median and gravel flecks on the bottom
    // shoulder. Drawn deterministically per-cell from a seeded-ish RNG so
    // they don't shimmer between frames. We just use a stable seed = cell
    // index; the noise position is fixed once chosen.
    if (!drawRoad._tufts) drawRoad._tufts = [];
    if (drawRoad._tufts.length !== COLS * 6) {
      drawRoad._tufts = [];
      for (let i = 0; i < COLS * 6; i++) {
        drawRoad._tufts.push({
          x: Math.random() * W,
          y: Math.random() * CELL,
          tone: Math.random() < 0.5 ? '#3a5a28' : '#5a6a30',
        });
      }
    }
    for (const t of drawRoad._tufts) {
      ctx.fillStyle = t.tone;
      ctx.fillRect(t.x, t.y, 2, 2);
    }
    // Gravel: reuse the tuft positions mirrored to the bottom row.
    for (const t of drawRoad._tufts) {
      ctx.fillStyle = Math.random() < 0.5 ? '#3a2c1c' : '#4a3a24';
      // intentionally non-deterministic for a faint shimmer of grit on the shoulder
      ctx.fillRect(t.x, H - CELL + (t.y * 0.95), 1, 1);
    }
  }

  function drawCars() {
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const y = (li + 1) * CELL;
      const inset = 3;
      for (const car of lane.cars) {
        const body = lane.dir > 0 ? '#a8323a' : '#3a5a8a';
        const trim = lane.dir > 0 ? '#5a1a20' : '#1a2a4a';
        ctx.fillStyle = trim;
        ctx.fillRect(car.x - 1, y + inset - 1, car.w + 2, CELL - 2 * inset + 2);
        ctx.fillStyle = body;
        ctx.fillRect(car.x, y + inset, car.w, CELL - 2 * inset);

        // Windshield: front-third of the car, lighter slab.
        ctx.fillStyle = '#c0d8e8';
        const wsW = Math.max(6, car.w * 0.28);
        const wsX = lane.dir > 0 ? car.x + car.w - wsW - 3 : car.x + 3;
        ctx.fillRect(wsX, y + inset + 2, wsW, CELL - 2 * inset - 4);

        // Headlights on the leading edge; taillights on the trailing edge.
        const lightR = 2;
        const leadX  = lane.dir > 0 ? car.x + car.w - 2 : car.x;
        const trailX = lane.dir > 0 ? car.x             : car.x + car.w - 2;
        ctx.fillStyle = '#ffe6a8';
        ctx.fillRect(leadX,  y + inset + 2,         lightR, lightR);
        ctx.fillRect(leadX,  y + CELL - inset - 4,  lightR, lightR);
        ctx.fillStyle = '#c01a1a';
        ctx.fillRect(trailX, y + inset + 2,         lightR, lightR);
        ctx.fillRect(trailX, y + CELL - inset - 4,  lightR, lightR);
      }
    }
  }

  // The "frog" of this Frogger-like is a baby. Drawn as an emoji glyph
  // centered on the player's cell so it lands cleanly on each hop. On
  // splat, we swap to the skull glyph and lay a blood smear under it.
  function drawBaby() {
    const p = playerPixel();
    const hopFrac = player.hopFrom ? Math.sin((player.hopT / HOP_DUR) * Math.PI) : 0;
    const lift = hopFrac * 4;
    const splat = runState === 'dead';

    const cx = p.x;
    const cy = p.y - lift;

    if (splat) {
      // Roadkill smear under the corpse — wide flat ellipse of dark blood.
      ctx.fillStyle = 'rgba(110, 10, 18, 0.75)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, CELL * 0.5, CELL * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = Math.round(CELL * (splat ? 0.7 : 0.85)) +
      'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(splat ? '💀' : '👶', cx, cy);
  }

  function render() {
    drawRoad();
    drawCars();
    drawBaby();

    // Slight darkening at level cleared / dead so the prompt overlay reads
    // without competing with the live road.
    if (runState === 'cleared' || runState === 'dead' || runState === 'cashed') {
      ctx.fillStyle = runState === 'dead'
        ? 'rgba(60, 6, 8, 0.45)'
        : runState === 'cleared'
          ? 'rgba(10, 30, 14, 0.40)'
          : 'rgba(20, 14, 8, 0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    const dt = Math.min(60, ts - lastFrame); // clamp so a tab-switch doesn't teleport cars
    lastFrame = ts;
    update(dt);
    render();
    renderHud();
    requestAnimationFrame(loop);
  }

  // ===== Flow / UI plumbing =====

  function getWager() {
    const w = document.getElementById('op-wager');
    const v = Math.max(1, Math.floor(Number(w.value) || 0));
    if (String(v) !== w.value) w.value = v;
    return v;
  }

  function setPrompt(text, cls) {
    if (!promptEl) return;
    promptEl.textContent = text || '';
    promptEl.classList.remove('is-win', 'is-loss', 'is-err', 'is-info');
    if (cls) promptEl.classList.add(cls);
    promptEl.classList.toggle('is-on', !!text);
  }

  function setButtons() {
    const start   = document.getElementById('op-start');
    const cash    = document.getElementById('op-cash');
    const push    = document.getElementById('op-push');
    const restart = document.getElementById('op-restart');
    const wager   = document.getElementById('op-wager');
    const max     = document.getElementById('op-wager-max');

    wager.disabled = runActive;
    max.disabled = runActive;

    start.hidden = runState !== 'idle';
    cash.hidden = push.hidden = runState !== 'cleared';
    restart.hidden = !(runState === 'dead' || runState === 'cashed');

    if (runState === 'cleared') {
      cash.textContent = '💰 CASH · ' + pot;
      const nextL = levelIdx + 2;
      if (nextL > MAX_LEVELS) {
        // No more lanes to push to — force cash.
        push.hidden = true;
      } else {
        push.textContent = 'PUSH → L' + nextL + ' · ' + formatMult(levelMult(nextL));
      }
    }
  }

  function renderHud() {
    const levelEl = document.getElementById('op-level');
    const wagerEl = document.getElementById('op-wager-display');
    const multEl  = document.getElementById('op-mult');
    const potEl   = document.getElementById('op-pot');
    const oneBased = levelIdx + 1;
    levelEl.textContent = runActive ? oneBased : '—';
    wagerEl.textContent = runActive ? runWager : '—';
    multEl.textContent  = runActive ? formatMult(levelMult(oneBased)) : '—';
    potEl.textContent   = pot;
  }

  function renderLadder() {
    const list = document.getElementById('op-ladder-list');
    if (!list) return;
    const wager = runActive ? runWager : getWager();
    list.innerHTML = '';
    for (let n = 1; n <= MAX_LEVELS; n++) {
      const li = document.createElement('li');
      li.className = 'op-ladder-rung';
      const oneBased = levelIdx + 1;
      if (runActive && n < oneBased) li.classList.add('is-climbed');
      if (runActive && n === oneBased && runState === 'cleared') li.classList.add('is-current');
      if (runActive && n === oneBased && runState === 'playing') li.classList.add('is-active');
      if (runActive && n === oneBased + 1 && runState === 'cleared') li.classList.add('is-next');
      const mult = levelMult(n);
      const coins = payoutForLevel(n, wager);
      li.innerHTML =
        '<span class="op-ladder-n">L' + n + '</span>' +
        '<span class="op-ladder-mult">' + formatMult(mult) + '</span>' +
        '<span class="op-ladder-coins">' + coins + '</span>';
      list.appendChild(li);
    }
  }

  // ===== State transitions =====

  function onLevelCleared() {
    runState = 'cleared';
    const oneBased = levelIdx + 1;
    pot = payoutForLevel(oneBased, runWager);
    if (oneBased >= MAX_LEVELS) {
      // Top of the ladder — auto cash out so the player doesn't get stuck
      // staring at a disabled PUSH button on the final rung.
      Wallet.add(pot);
      runActive = false;
      runState = 'cashed';
      setPrompt('Top of the ladder. +' + pot + ' coins. Baby crawls into the sunset.', 'is-win');
    } else {
      setPrompt('Cleared L' + oneBased + ' — pot ' + pot + '. Cash, or push for ×' +
        (levelMult(oneBased + 1)).toFixed(1) + '?', 'is-win');
    }
    setButtons();
    renderLadder();
  }

  function onDeath() {
    const lost = runWager;        // the pot is built FROM the wager — losing the
                                  // wager IS losing the pot you'd been climbing.
    runState = 'dead';
    runActive = false;
    pot = 0;
    setPrompt('Squish. −' + lost + ' coins. Try another baby.', 'is-loss');
    setButtons();
    renderLadder();
  }

  function startRun() {
    if (runState !== 'idle') return;
    const wager = getWager();
    if (!Wallet.spend(wager)) {
      setPrompt("You can't cover that wager.", 'is-err');
      return;
    }
    if (window.Child && typeof window.Child.recordPlay === 'function') {
      window.Child.recordPlay();
    }
    runWager = wager;
    runActive = true;
    pot = 0;
    levelIdx = 0;
    runState = 'playing';
    loadLevel(levelIdx);
    // Pull focus off the wager input so arrow keys don't increment the
    // number while the player is trying to hop.
    blurActive();
    setPrompt('Crawl to the curb. ↑↓←→ or WASD.', 'is-info');
    setButtons();
    renderLadder();
  }

  function blurActive() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function pushIt() {
    if (runState !== 'cleared') return;
    levelIdx += 1;
    if (levelIdx >= MAX_LEVELS) return; // guarded in setButtons too
    runState = 'playing';
    loadLevel(levelIdx);
    blurActive();
    setPrompt('L' + (levelIdx + 1) + ' — ' + LEVELS[levelIdx].lanes + ' lanes. Crawl.', 'is-info');
    setButtons();
    renderLadder();
  }

  function cashOut() {
    if (runState !== 'cleared') return;
    const won = pot;
    Wallet.add(won);
    runActive = false;
    runState = 'cashed';
    setPrompt('Cashed out: +' + won + ' coins. Baby is collected.', 'is-win');
    setButtons();
    renderLadder();
  }

  function newRun() {
    if (runState !== 'dead' && runState !== 'cashed') return;
    runState = 'idle';
    runActive = false;
    runWager = 0;
    pot = 0;
    levelIdx = 0;
    // Show the bottom-row baby waiting on the shoulder of an L1-shape road
    // so the canvas isn't empty between runs.
    loadLevel(0);
    setPrompt('Set wager, then START RUN.', null);
    setButtons();
    renderLadder();
  }

  // ===== Bind =====

  function bind() {
    document.getElementById('op-start').addEventListener('click', startRun);
    document.getElementById('op-cash').addEventListener('click', cashOut);
    document.getElementById('op-push').addEventListener('click', pushIt);
    document.getElementById('op-restart').addEventListener('click', newRun);
    document.getElementById('op-wager-max').addEventListener('click', () => {
      const w = document.getElementById('op-wager');
      w.value = Math.max(1, Wallet.getBalance());
      renderLadder();
    });
    document.getElementById('op-wager').addEventListener('input', () => {
      if (!runActive) renderLadder();
    });
    window.addEventListener('keydown', onKey);
  }

  function init() {
    canvas = document.getElementById('op-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    promptEl = document.getElementById('op-prompt');
    bind();
    loadLevel(0);              // preview L1 road behind the prompt
    renderLadder();
    setButtons();
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
