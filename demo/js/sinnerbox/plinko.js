/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SINNERBOX PLINKO  —  physics board + jackpot pool + lane payouts        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ get #plinko-canvas, set 500×600               │
  │                          ├─ loadPalette()   (CSS vars → palette)         │
  │                          ├─ generateObstacles()  (2 spinners + 2 plats)  │
  │                          ├─ generatePegs()       (13 rows, clear-checked)│
  │                          ├─ generateWallTops()   (lane divider tops)     │
  │                          ├─ bindInput()  ─► pointerdown / arrows / space │
  │                          └─ requestAnimationFrame(loop)                  │
  │                                                                          │
  │   loop() ──► step() → draw() → rAF(loop)                                 │
  │                                                                          │
  │   step():                                                                │
  │     updateMovingThree(now)   ── shifts the ×2 lane index every 1000ms    │
  │     spinners[].angle += omega                                            │
  │     platforms[].x += vx (bounce minX/maxX)                               │
  │     activeBalls.filter(stepBall)  ─► settled balls drop out              │
  │     if settled ─► notifyState() + checkRoundComplete()                   │
  │                                                                          │
  │   stepBall(b) ──► bool settled                                           │
  │     gravity + walls + collide pegs/wallTopPegs/spinners/platforms        │
  │     stuck-kick if no meaningful move in 1500ms                           │
  │     on bottom: idx = floor(x/zoneW); payout = zones[idx]*bet             │
  │       Wallet.add(payout); zoneFlashes[idx]=now; Sound.zoneLand(v)        │
  │       if jackpotLane===idx && pool>0 ─► claimJackpot()+Wallet.add+flash  │
  │                                                                          │
  │   Jackpot pool (persisted to localStorage 'wendys_palace_sinnerbox_      │
  │   jackpot'):                                                             │
  │     readJackpot() / writeJackpot() / addJackpot(n) / claimJackpot()      │
  │     notifyJackpot() ──► jackpotListeners                                 │
  │                                                                          │
  │   Public API (queueBalls drives a round):                                │
  │     queueBalls(count, bet, isConsolation)                                │
  │        ├─ if !consolation && pool>0 && rand<JACKPOT_LANE_CHANCE          │
  │        │       ─► jackpotLane = floor(rand*9)                            │
  │        ├─ setStatus(...)                                                 │
  │        └─ if consolation ─► scheduleAutoDrop(FIRST_DELAY)                │
  │                                                                          │
  │   Input ─► tryDrop(x) ─► spawnBall(x)  (pendingBalls--)                  │
  │   scheduleAutoDrop(delay) self-chains during consolation                 │
  │                                                                          │
  │   Exports (window.Plinko):                                               │
  │     { ZONE_VALUES (copy), queueBalls, isBusy, onStateChange,             │
  │       recordWager(amount), getJackpot, onJackpotChange, onJackpotHit }   │
  │   External deps: Wallet, Sound, localStorage, Canvas2D,                  │
  │                  requestAnimationFrame, performance.now                  │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: W=500, H=600, PEG_R=4, BALL_R=7, TOP=50, BOTTOM=70, ROWS=13, ZONE_COUNT=9
  ZONE_VALUES=[0,1,1,1,0,1,1,1,0]; MOVING_THREE_VALUE=2; MOVING_THREE_INTERVAL_MS=1000; WALL_TOP_OFFSET=32
  GRAVITY=0.3; RESTITUTION=0.55; WALL_RESTITUTION=0.5; PEG_FLASH_MS=280; ZONE_FLASH_MS=750
  JACKPOT_KEY='wendys_palace_sinnerbox_jackpot'; JACKPOT_LANE_CHANCE=0.18; JACKPOT_FLASH_MS=2600
  AUTO_DROP_FIRST_DELAY=320; AUTO_DROP_STAGGER_MS=380
  state: canvas,ctx; pegs[], wallTopPegs[], spinners[], platforms[]; consolationMode=F; movingThreeIndex=1, movingThreeDir=-1, movingThreeLastMove=-∞; zoneFlashes[9]=-∞; pendingBalls=0, pendingBet=1; activeBalls[]; totalPayout=0; jackpotPool=readJackpot(), jackpotLane=-1, jackpotFlashStart=-∞, jackpotFlashAmount=0; jackpotListeners[], jackpotHitListeners[], stateListeners[]; cursorX=W/2; autoDropTimer=null; palette={bg,peg,border,text,ball,cursor}
  readJackpot()→int: parseInt(localStorage[JACKPOT_KEY]||'0'); finite&&>0?v:0
  writeJackpot(): localStorage[JACKPOT_KEY]=String(pool)
  notifyJackpot(): ∀fn∈jackpotListeners→fn(pool)
  addJackpot(n): guard(!finite||n<=0); pool+=floor(n); write
  claimJackpot()→int: v=pool; pool=0; write; ret v
  formatLaneValue(v)→str: v≥1M→Mfmt, v≥1K→Kfmt, else String(v)
  loadPalette(): read CSS vars --bg-panel,--bone,--iron-light,--blood
  rowY(row)→y: TOP + (H-TOP-BOTTOM-WALL_TOP_OFFSET)/(ROWS+1) * row
  shuffled(arr)→arr: Fisher-Yates copy
  randSign()→±1
  generateObstacles(): pick 4 of [2.5,4.5,6.5,8.5,10.5]; first 2→spinners{x,y,r=14,angle,omega=±0.05~0.09}; last 2→platforms{x,y,w=70,h=5,vx=±1.5~2.5,minX,maxX}
  isClearOfObstacles(x,y)→bool: spinner dist > s.r+22 && not in platform sweep band
  generatePegs(): ∀r<ROWS; cols=isEven?10:9; startX=isEven?25:50; ∀c push{x,y,lastHit=-∞} w/ jitter if clear
  generateWallTops(): ∀i∈[1..ZONE_COUNT) push{x=i*zoneW,y=wallTopY,lastHit=-∞}
  notifyState(): ∀fn→fn({pending,active})
  setStatus(text,callToAction): #plinko-status.text=text; toggle .plinko-status-call
  currentZoneValues()→arr: consolation?map(v>0?1:0):ZONE_VALUES w/ [movingThreeIndex]=2
  updateMovingThree(now): bounce idx ±1 every 1000ms in [0,ZONE_COUNT-1]
  spawnBall(x): clamp x; push{x,y=TOP-10,vx=±0.3,vy=0,bet=pendingBet,lastMoveAt,lastMoveX,lastMoveY}; notifyState
  stepBall(b)→settled: b.vy+=G; b.x+=vx; b.y+=vy; wall clamp; ∀peg/wallTopPeg: collision→normal reflect*RESTITUTION+jitter+lastHit=now+Sound.pegHit; ∀spinner: reflect+tangent boost(omega*32); ∀platform: top hit→vy=-1.05*|vy|-1.5+hitPos*3+p.vx*.5; ∀wall side: side bounce; stuck-kick if no move>1500ms (vy=-3.5..-4.3); on b.y>H-BALL_R-2: idx=floor(x/zoneW); payout=zones[idx]*bet; Wallet.add; zoneFlashes[idx]=now; Sound.zoneLand(v); if !conso && jackpotLane==idx && pool>0→claimJackpot+Wallet.add+flash+listeners+Sound.jackpot; ret T
  step(): updateMovingThree; ∀spinner.angle+=omega; ∀plat.x+=vx (bounce minX/maxX-w); guard(activeBalls.len==0); filter !stepBall; if settledAny→notifyState+checkRoundComplete
  checkRoundComplete(): if pendingBalls==0 && active==0 → setStatus('Round complete. Payout:N coins.'); reset payout+lane; notifyJackpot
  drawPeg(p,now): flash by age vs PEG_FLASH_MS→glow else solid
  draw(): clear; bg; ∀peg drawPeg; ∀spinner ring+4 rotating arms; ∀plat chrome+highlight+shadow; lane walls vertical; ∀wallTopPeg drawPeg; zone strip border+flash overlays; if jackpotLane≥0→pulsing gold column+star@above; zone values text w/ pendingBet mult; if awaitingClick(pending>0&&!conso)→pulse cursor triangle+CTA text+red border; ∀b draw red ball; if jackpotFlash active→full overlay 'JACKPOT +N COINS'
  loop(): step; draw; rAF(loop)
  tryDrop(x): guard(pending<=0); pending--; spawnBall(x); setStatus by mode (conso/click/last)
  scheduleAutoDrop(delay): clearTimer; setTimeout→guard; x=rnd lane-safe; cursorX=x; tryDrop; if pending>0&&conso→reschedule@STAGGER
  bindInput(): canvas.pointerdown→guard(conso); compute x in W coords; clamp; tryDrop; keydown ArrowL/R move cursorX±12; Space/Enter→tryDrop
  init(): #plinko-canvas; ctx=getContext'2d'; W,H; loadPalette; genObstacles; genPegs; genWallTops; bindInput; rAF(loop)
  exports: global.Plinko={ZONE_VALUES:slice, queueBalls(count,bet,isConso): pending+=count; pendingBet=bet; conso=!!; reset payout+lane; if !conso&&pending>0&&pool>0&&rnd<0.18→lane=floor(rnd*9); setStatus by mode; if conso&&pending>0→scheduleAutoDrop(FIRST_DELAY); notifyState | isBusy()→pending>0||active>0 | onStateChange(fn) | recordWager(amount)→addJackpot | getJackpot()→pool | onJackpotChange(fn): push+fire(pool) | onJackpotHit(fn)}
  on DOMContentLoaded→init
*/

(function (global) {
  const W = 500;
  const H = 600;
  const PEG_R = 4;
  const BALL_R = 7;
  const TOP = 50;
  const BOTTOM = 70;
  const ROWS = 13;
  const ZONE_COUNT = 9;
  const ZONE_VALUES = [0, 1, 1, 1, 0, 1, 1, 1, 0];
  const MOVING_THREE_VALUE = 2;
  const MOVING_THREE_INTERVAL_MS = 1000;
  const WALL_TOP_OFFSET = 32;
  const GRAVITY = 0.3;
  const RESTITUTION = 0.55;
  const WALL_RESTITUTION = 0.5;

  let canvas, ctx;
  let pegs = [];
  let wallTopPegs = [];
  let spinners = [];
  let platforms = [];
  let consolationMode = false;
  let movingThreeIndex = 1;
  let movingThreeDir = -1;
  let movingThreeLastMove = -Infinity;
  let zoneFlashes = new Array(ZONE_COUNT).fill(-Infinity);
  const PEG_FLASH_MS = 280;
  const ZONE_FLASH_MS = 750;
  let pendingBalls = 0;
  let pendingBet = 1;
  let activeBalls = [];
  let totalPayout = 0;

  // ===== Jackpot =====
  // Every wager spent on sinnerbox grows the pool. The only way to drain it
  // is to claim it: each non-consolation spin has JACKPOT_LANE_CHANCE to
  // light up one of the nine landing lanes; if a ball settles in that lit
  // lane the player claims the entire pool. Persisted so the pool survives
  // reloads.
  const JACKPOT_KEY = 'wendys_palace_sinnerbox_jackpot';
  const JACKPOT_LANE_CHANCE = 0.18;
  const JACKPOT_FLASH_MS = 2600;
  let jackpotPool = readJackpot();
  let jackpotLane = -1; // -1 = no offer this round
  let jackpotFlashStart = -Infinity;
  let jackpotFlashAmount = 0;
  const jackpotListeners = [];
  const jackpotHitListeners = [];

  function readJackpot() {
    try {
      const v = parseInt(localStorage.getItem(JACKPOT_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function writeJackpot() {
    try { localStorage.setItem(JACKPOT_KEY, String(jackpotPool)); } catch (e) {}
  }
  function notifyJackpot() {
    for (const fn of jackpotListeners) fn(jackpotPool);
  }
  function addJackpot(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    jackpotPool += Math.floor(n);
    writeJackpot();
  }
  function claimJackpot() {
    const v = jackpotPool;
    jackpotPool = 0;
    writeJackpot();
    return v;
  }
  let cursorX = W / 2;
  let autoDropTimer = null;
  const AUTO_DROP_FIRST_DELAY = 320;
  const AUTO_DROP_STAGGER_MS = 380;
  const stateListeners = [];
  const palette = {
    bg: '#1a0a0c',
    peg: '#d8c8b0',
    border: '#3a3032',
    text: '#d8c8b0',
    ball: '#b8001f',
    cursor: '#b8001f',
  };

  function formatLaneValue(v) {
    if (v >= 1_000_000) {
      const n = v / 1_000_000;
      return (n >= 10 ? Math.floor(n) : Math.round(n * 10) / 10) + 'M';
    }
    if (v >= 1_000) {
      const n = v / 1_000;
      return (n >= 10 ? Math.floor(n) : Math.round(n * 10) / 10) + 'K';
    }
    return String(v);
  }

  function loadPalette() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) =>
      (cs.getPropertyValue(name).trim() || fallback);
    palette.bg = get('--bg-panel', palette.bg);
    palette.peg = get('--bone', palette.peg);
    palette.border = get('--iron-light', palette.border);
    palette.text = get('--bone', palette.text);
    palette.ball = get('--blood', palette.ball);
    palette.cursor = get('--blood', palette.cursor);
  }

  function rowY(row) {
    const usableH = H - TOP - BOTTOM - WALL_TOP_OFFSET;
    const rowSpacing = usableH / (ROWS + 1);
    return TOP + rowSpacing * row;
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randSign() {
    return Math.random() < 0.5 ? 1 : -1;
  }

  function generateObstacles() {
    const candidateRows = [2.5, 4.5, 6.5, 8.5, 10.5];
    const chosen = shuffled(candidateRows).slice(0, 4);
    const spinnerRows = chosen.slice(0, 2);
    const platformRows = chosen.slice(2, 4);

    spinners = spinnerRows.map((row) => ({
      x: W * (0.22 + Math.random() * 0.56),
      y: rowY(row),
      r: 14,
      angle: Math.random() * Math.PI * 2,
      omega: randSign() * (0.05 + Math.random() * 0.04),
    }));

    platforms = platformRows.map((row) => ({
      x: W * (0.15 + Math.random() * 0.45),
      y: rowY(row),
      w: 70,
      h: 5,
      vx: randSign() * (1.5 + Math.random() * 1.0),
      minX: W * 0.08,
      maxX: W * 0.92,
    }));
  }

  function isClearOfObstacles(x, y) {
    // Need peg-edge to spinner-edge gap > ball diameter (14px) plus slack,
    // otherwise the ball wedges in the crevice. clearance = s.r + PEG_R +
    // 2*BALL_R + 4px slack ≈ s.r + 22.
    const SPINNER_PEG_CLEAR = 22;
    for (const s of spinners) {
      const dx = x - s.x, dy = y - s.y;
      const min = s.r + SPINNER_PEG_CLEAR;
      if (dx * dx + dy * dy < min * min) return false;
    }
    for (const p of platforms) {
      if (x > p.minX - 10 && x < p.maxX + p.w + 10 && Math.abs(y - p.y) < 16) {
        return false;
      }
    }
    return true;
  }

  function generatePegs() {
    pegs = [];
    const usableH = H - TOP - BOTTOM - WALL_TOP_OFFSET;
    const rowSpacing = usableH / (ROWS + 1);
    const colSpacing = 50;
    for (let r = 0; r < ROWS; r++) {
      const y = TOP + rowSpacing * (r + 1);
      const isEven = r % 2 === 0;
      const cols = isEven ? 10 : 9;
      const startX = isEven ? 25 : 50;
      for (let c = 0; c < cols; c++) {
        const x = startX + c * colSpacing;
        const jx = (Math.random() - 0.5) * 6;
        const jy = (Math.random() - 0.5) * 4;
        const px = x + jx;
        const py = y + jy;
        if (isClearOfObstacles(px, py)) {
          pegs.push({ x: px, y: py, lastHit: -Infinity });
        }
      }
    }
  }

  function generateWallTops() {
    wallTopPegs = [];
    const zoneW = W / ZONE_COUNT;
    const wallTopY = H - BOTTOM - WALL_TOP_OFFSET;
    for (let i = 1; i < ZONE_COUNT; i++) {
      wallTopPegs.push({ x: i * zoneW, y: wallTopY, lastHit: -Infinity });
    }
  }

  function notifyState() {
    const s = { pending: pendingBalls, active: activeBalls.length };
    stateListeners.forEach((fn) => fn(s));
  }

  // Single entry point for the status banner so we can also toggle the
  // "you need to click" emphasis class in one place.
  function setStatus(text, callToAction) {
    const el = document.getElementById('plinko-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('plinko-status-call', !!callToAction);
  }

  function currentZoneValues() {
    if (consolationMode) {
      return ZONE_VALUES.map((v) => (v > 0 ? 1 : 0));
    }
    const zones = ZONE_VALUES.slice();
    zones[movingThreeIndex] = MOVING_THREE_VALUE;
    return zones;
  }

  function updateMovingThree(now) {
    if (movingThreeLastMove === -Infinity) {
      movingThreeLastMove = now;
      return;
    }
    if (now - movingThreeLastMove < MOVING_THREE_INTERVAL_MS) return;
    movingThreeLastMove = now;
    movingThreeIndex += movingThreeDir;
    if (movingThreeIndex <= 0) {
      movingThreeIndex = 0;
      movingThreeDir = 1;
    } else if (movingThreeIndex >= ZONE_COUNT - 1) {
      movingThreeIndex = ZONE_COUNT - 1;
      movingThreeDir = -1;
    }
  }

  function spawnBall(x) {
    const now = performance.now();
    const sx = Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, x));
    activeBalls.push({
      x: sx,
      y: TOP - 10,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0,
      bet: pendingBet,
      // Stuck detection: position+timestamp last seen meaningfully moving.
      lastMoveAt: now,
      lastMoveX: sx,
      lastMoveY: TOP - 10,
    });
    notifyState();
  }

  function stepBall(b) {
    b.vy += GRAVITY;
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx * WALL_RESTITUTION; }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -b.vx * WALL_RESTITUTION; }
    const now = performance.now();
    for (const p of pegs) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const minDist = BALL_R + PEG_R;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = p.x + nx * minDist;
        b.y = p.y + ny * minDist;
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * dot * nx) * RESTITUTION;
        b.vy = (b.vy - 2 * dot * ny) * RESTITUTION;
        b.vx += (Math.random() - 0.5) * 0.4;
        p.lastHit = now;
        if (global.Sound) global.Sound.pegHit();
      }
    }
    for (const p of wallTopPegs) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const minDist = BALL_R + PEG_R;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = p.x + nx * minDist;
        b.y = p.y + ny * minDist;
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * dot * nx) * RESTITUTION;
        b.vy = (b.vy - 2 * dot * ny) * RESTITUTION;
        b.vx += (Math.random() - 0.5) * 0.4;
        p.lastHit = now;
        if (global.Sound) global.Sound.pegHit();
      }
    }
    // Spinners (rotating bumpers) — bounce + tangential boost
    for (const s of spinners) {
      const dx = b.x - s.x;
      const dy = b.y - s.y;
      const minDist = BALL_R + s.r;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = s.x + nx * minDist;
        b.y = s.y + ny * minDist;
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 2 * dot * nx) * RESTITUTION;
        b.vy = (b.vy - 2 * dot * ny) * RESTITUTION;
        const tx = -ny, ty = nx;
        const boost = s.omega * 32;
        b.vx += tx * boost;
        b.vy += ty * boost;
        if (global.Sound) global.Sound.pegHit();
      }
    }

    // Moving platforms — pong-style upward bounce on top hit
    for (const p of platforms) {
      if (b.x + BALL_R > p.x && b.x - BALL_R < p.x + p.w &&
          b.y + BALL_R > p.y && b.y - BALL_R < p.y + p.h && b.vy > 0) {
        b.y = p.y - BALL_R;
        b.vy = -Math.abs(b.vy) * 1.05 - 1.5;
        const hitPos = (b.x - (p.x + p.w / 2)) / (p.w / 2);
        b.vx += hitPos * 3 + p.vx * 0.5;
        if (global.Sound) global.Sound.pegHit();
      }
    }

    // Vertical wall sides
    const zoneW = W / ZONE_COUNT;
    const wallTopY = H - BOTTOM - WALL_TOP_OFFSET;
    for (let i = 1; i < ZONE_COUNT; i++) {
      const wallX = i * zoneW;
      if (b.y > wallTopY && Math.abs(b.x - wallX) < BALL_R) {
        if (b.x < wallX) b.x = wallX - BALL_R;
        else b.x = wallX + BALL_R;
        b.vx = -b.vx * WALL_RESTITUTION;
      }
    }

    // Stuck detection — give the ball an upward kick if it hasn't moved
    // meaningfully in a while. Skipped once the ball is in the lane corridor
    // since wedging there is fine (it's about to settle).
    if (b.y < wallTopY) {
      const dx = b.x - b.lastMoveX;
      const dy = b.y - b.lastMoveY;
      if (dx * dx + dy * dy > 9) {
        b.lastMoveX = b.x;
        b.lastMoveY = b.y;
        b.lastMoveAt = now;
      } else if (now - b.lastMoveAt > 1500) {
        b.vy = -3.5 - Math.random() * 0.8;
        b.vx += (Math.random() - 0.5) * 2.0;
        b.lastMoveAt = now;
        b.lastMoveX = b.x;
        b.lastMoveY = b.y;
      }
    } else {
      // In the lane corridor: keep the timer fresh so we don't kick a
      // ball that's just slowly walking down to its zone.
      b.lastMoveAt = now;
      b.lastMoveX = b.x;
      b.lastMoveY = b.y;
    }

    if (b.y > H - BALL_R - 2) {
      const idx = Math.max(0, Math.min(ZONE_COUNT - 1, Math.floor(b.x / zoneW)));
      const zones = currentZoneValues();
      const payout = zones[idx] * b.bet;
      totalPayout += payout;
      if (payout > 0) {
        Wallet.add(payout);
      }
      zoneFlashes[idx] = now;
      if (global.Sound) global.Sound.zoneLand(zones[idx]);
      // Jackpot lane: ball must land in the specific lit lane to claim the pool.
      if (!consolationMode && jackpotLane === idx && jackpotPool > 0) {
        const jp = claimJackpot();
        Wallet.add(jp);
        totalPayout += jp;
        jackpotFlashStart = now;
        jackpotFlashAmount = jp;
        jackpotLane = -1;
        for (const fn of jackpotHitListeners) {
          try { fn(jp); } catch (e) {}
        }
        if (global.Sound) global.Sound.jackpot();
      }
      return true; // settled
    }
    return false;
  }

  function step() {
    // Always animate obstacles (visual life even when no balls)
    updateMovingThree(performance.now());
    for (const s of spinners) s.angle += s.omega;
    for (const p of platforms) {
      p.x += p.vx;
      if (p.x < p.minX) { p.x = p.minX; p.vx = -p.vx; }
      if (p.x + p.w > p.maxX) { p.x = p.maxX - p.w; p.vx = -p.vx; }
    }
    if (activeBalls.length === 0) return;
    let settledAny = false;
    activeBalls = activeBalls.filter((b) => {
      const settled = stepBall(b);
      if (settled) settledAny = true;
      return !settled;
    });
    if (settledAny) {
      notifyState();
      checkRoundComplete();
    }
  }

  function checkRoundComplete() {
    if (pendingBalls === 0 && activeBalls.length === 0) {
      const result = totalPayout;
      totalPayout = 0;
      jackpotLane = -1;
      setStatus('Round complete. Payout: ' + result + ' coins.', false);
      notifyJackpot();
    }
  }

  function drawPeg(p, now) {
    const age = now - p.lastHit;
    const flash = age < PEG_FLASH_MS ? Math.max(0, 1 - age / PEG_FLASH_MS) : 0;
    if (flash > 0) {
      ctx.save();
      ctx.shadowColor = '#ff6a00';
      ctx.shadowBlur = 14 * flash;
      ctx.fillStyle = 'rgba(255, 220, 130, ' + (0.7 + 0.3 * flash) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_R + flash * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = palette.peg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);

    for (const p of pegs) drawPeg(p, now);

    // Spinners — outer ring + rotating cross arms
    for (const s of spinners) {
      ctx.save();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeStyle = palette.peg;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s.r * 0.85, 0);
        ctx.stroke();
        ctx.rotate(Math.PI / 2);
      }
      ctx.fillStyle = palette.ball;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Moving platforms — chrome bar with highlight
    for (const p of platforms) {
      ctx.fillStyle = palette.peg;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255, 220, 130, 0.55)';
      ctx.fillRect(p.x, p.y, p.w, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
    }

    const zoneW = W / ZONE_COUNT;
    const zoneTop = H - BOTTOM;
    const wallTopY = zoneTop - WALL_TOP_OFFSET;

    // Lane walls (vertical dividers)
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    for (let i = 1; i < ZONE_COUNT; i++) {
      const wallX = i * zoneW;
      ctx.beginPath();
      ctx.moveTo(wallX, wallTopY);
      ctx.lineTo(wallX, H);
      ctx.stroke();
    }
    // Wall-top pegs (with flash)
    for (const p of wallTopPegs) drawPeg(p, now);

    // Zone strip outer border + top
    ctx.strokeStyle = palette.border;
    ctx.strokeRect(0, zoneTop, W, BOTTOM);

    // Zone glow / fill on flash
    for (let i = 0; i < ZONE_COUNT; i++) {
      const age = now - zoneFlashes[i];
      const flash = age < ZONE_FLASH_MS ? Math.max(0, 1 - age / ZONE_FLASH_MS) : 0;
      if (flash > 0) {
        ctx.fillStyle = 'rgba(255, 106, 0, ' + (flash * 0.45) + ')';
        ctx.fillRect(i * zoneW + 1, zoneTop + 1, zoneW - 2, BOTTOM - 2);
      }
    }

    // Jackpot lane — glowing gold column the player aims for.
    if (jackpotLane >= 0) {
      const lx = jackpotLane * zoneW;
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.save();
      // Vertical gold column from wall-top down through the zone strip.
      const grad = ctx.createLinearGradient(0, wallTopY, 0, H);
      grad.addColorStop(0, 'rgba(255, 220, 130, ' + (0.05 + 0.10 * pulse) + ')');
      grad.addColorStop(0.6, 'rgba(255, 196, 80, ' + (0.20 + 0.18 * pulse) + ')');
      grad.addColorStop(1, 'rgba(255, 196, 80, ' + (0.45 + 0.20 * pulse) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(lx + 1, wallTopY, zoneW - 2, H - wallTopY);
      // Bright glowing border on the lit lane.
      ctx.shadowColor = '#ffd070';
      ctx.shadowBlur = 16 + 14 * pulse;
      ctx.strokeStyle = 'rgba(255, 230, 160, ' + (0.65 + 0.30 * pulse) + ')';
      ctx.lineWidth = 2 + pulse * 1.5;
      ctx.strokeRect(lx + 1, wallTopY, zoneW - 2, H - wallTopY);
      // Star marker hovering above the lane.
      ctx.shadowBlur = 22 * pulse;
      ctx.fillStyle = 'rgba(255, 232, 170, ' + (0.85 + 0.15 * pulse) + ')';
      ctx.font = 'bold 24px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', lx + zoneW / 2, wallTopY - 14);
      ctx.restore();
    }

    // Zone payout values
    const zones = currentZoneValues();
    ctx.font = '36px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < ZONE_COUNT; i++) {
      const age = now - zoneFlashes[i];
      const flash = age < ZONE_FLASH_MS ? Math.max(0, 1 - age / ZONE_FLASH_MS) : 0;
      if (flash > 0) {
        ctx.save();
        ctx.shadowColor = '#ff6a00';
        ctx.shadowBlur = 18 * flash;
        ctx.fillStyle = '#fff5d0';
      } else {
        ctx.fillStyle = palette.text;
      }
      const value = zones[i] * pendingBet;
      ctx.fillText(formatLaneValue(value), i * zoneW + zoneW / 2, zoneTop + BOTTOM / 2);
      if (flash > 0) ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = palette.ball;
    ctx.shadowBlur = 14;
    const awaitingClick = pendingBalls > 0 && !consolationMode;
    // Cursor only shown when the player can actually act on it. During
    // consolation the balls auto-drop, so a pulsing pointer would be a lie.
    if (awaitingClick) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      const tipY = 22 + pulse * 8;
      const halfW = 9 + pulse * 4;
      ctx.shadowBlur = 18 + pulse * 14;
      ctx.fillStyle = palette.cursor;
      ctx.beginPath();
      ctx.moveTo(cursorX - halfW, 4);
      ctx.lineTo(cursorX + halfW, 4);
      ctx.lineTo(cursorX, tipY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = palette.ball;
    for (const b of activeBalls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (awaitingClick) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.save();
      // Dark band behind the call-to-action so the text doesn't fight the
      // pegs/spinners for legibility on a busy board.
      ctx.fillStyle = 'rgba(10, 4, 6, ' + (0.55 + 0.25 * pulse) + ')';
      ctx.fillRect(0, 30, W, 64);
      ctx.shadowColor = palette.ball;
      ctx.shadowBlur = 28 * pulse;
      ctx.fillStyle = 'rgba(255, 235, 200,' + (0.85 + 0.15 * pulse) + ')';
      ctx.font = 'bold 40px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('▼ CLICK TO DROP ▼', W / 2, 38);
      ctx.lineWidth = 4 + pulse * 3;
      ctx.strokeStyle = 'rgba(184, 0, 31,' + (0.55 + 0.4 * pulse) + ')';
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.restore();
    }

    // Jackpot win flash — full-board overlay with the prize amount.
    const jpAge = now - jackpotFlashStart;
    if (jpAge < JACKPOT_FLASH_MS) {
      const t = jpAge / JACKPOT_FLASH_MS;
      const fade = 1 - t;
      const pulse = 0.5 + 0.5 * Math.sin(now / 80);
      ctx.save();
      ctx.fillStyle = 'rgba(10, 4, 6, ' + (0.65 * fade) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(60, 20, 0, ' + (0.4 * fade) + ')';
      ctx.fillRect(0, H / 2 - 78, W, 156);
      ctx.shadowColor = '#ffd070';
      ctx.shadowBlur = 36 * pulse * fade;
      ctx.fillStyle = 'rgba(255, 220, 130, ' + (0.9 + 0.1 * pulse) * fade + ')';
      ctx.font = 'bold 64px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ JACKPOT ★', W / 2, H / 2 - 22);
      ctx.shadowBlur = 24 * pulse * fade;
      ctx.fillStyle = 'rgba(255, 240, 200, ' + (0.95 * fade) + ')';
      ctx.font = 'bold 44px "VT323", monospace';
      ctx.fillText('+' + jackpotFlashAmount + ' COINS', W / 2, H / 2 + 30);
      ctx.lineWidth = 5 + pulse * 4;
      ctx.strokeStyle = 'rgba(255, 196, 80, ' + (0.7 * fade) + ')';
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.restore();
    }
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  function tryDrop(x) {
    if (pendingBalls <= 0) return;
    pendingBalls -= 1;
    spawnBall(x);
    if (consolationMode) {
      setStatus(
        pendingBalls > 0
          ? 'Auto-dropping consolation… ' + pendingBalls + ' to go.'
          : 'Consolation ball dropping…',
        false
      );
    } else if (pendingBalls > 0) {
      setStatus('▼ CLICK TO DROP ▼  (' + pendingBalls + ' ball' +
        (pendingBalls === 1 ? '' : 's') + ' left)', true);
    } else {
      setStatus('Last ball dropping…', false);
    }
  }

  function scheduleAutoDrop(delay) {
    if (autoDropTimer) clearTimeout(autoDropTimer);
    autoDropTimer = setTimeout(function () {
      autoDropTimer = null;
      if (pendingBalls <= 0 || !consolationMode) return;
      const x = BALL_R + 6 + Math.random() * (W - 2 * BALL_R - 12);
      cursorX = x;
      tryDrop(x);
      if (pendingBalls > 0 && consolationMode) {
        scheduleAutoDrop(AUTO_DROP_STAGGER_MS);
      }
    }, delay);
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', (e) => {
      if (consolationMode) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const x = (e.clientX - rect.left) * scaleX;
      cursorX = Math.max(BALL_R, Math.min(W - BALL_R, x));
      tryDrop(cursorX);
    });
    window.addEventListener('keydown', (e) => {
      if (pendingBalls <= 0 && activeBalls.length === 0) return;
      if (consolationMode) return;
      if (e.key === 'ArrowLeft') {
        cursorX = Math.max(BALL_R, cursorX - 12);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        cursorX = Math.min(W - BALL_R, cursorX + 12);
        e.preventDefault();
      } else if (e.key === ' ' || e.key === 'Enter') {
        tryDrop(cursorX);
        e.preventDefault();
      }
    });
  }

  function init() {
    canvas = document.getElementById('plinko-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    loadPalette();
    generateObstacles();
    generatePegs();
    generateWallTops();
    bindInput();
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
    requestAnimationFrame(loop);
  }

  global.Plinko = {
    ZONE_VALUES: ZONE_VALUES.slice(),
    queueBalls(count, bet, isConsolation) {
      pendingBalls += count;
      pendingBet = bet;
      consolationMode = !!isConsolation;
      totalPayout = 0;
      jackpotLane = -1;
      if (!consolationMode && pendingBalls > 0 && jackpotPool > 0 &&
          Math.random() < JACKPOT_LANE_CHANCE) {
        jackpotLane = Math.floor(Math.random() * ZONE_COUNT);
      }
      if (consolationMode) {
        setStatus('No match. ' + pendingBalls + ' consolation ball' +
          (pendingBalls === 1 ? '' : 's') + ' auto-dropping…', false);
      } else if (jackpotLane >= 0) {
        setStatus('★ JACKPOT LANE LIT — aim for the gold ★  (' + pendingBalls +
          ' ball' + (pendingBalls === 1 ? '' : 's') + ')', true);
      } else {
        setStatus('▼ CLICK TO DROP ▼  (' + pendingBalls + ' ball' +
          (pendingBalls === 1 ? '' : 's') + ' × ' + bet + ' coin' +
          (bet === 1 ? '' : 's') + ')', true);
      }
      if (consolationMode && pendingBalls > 0) {
        scheduleAutoDrop(AUTO_DROP_FIRST_DELAY);
      }
      if (canvas) {
        try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
      }
      notifyState();
    },
    isBusy() {
      return pendingBalls > 0 || activeBalls.length > 0;
    },
    onStateChange(fn) {
      stateListeners.push(fn);
    },
    // Slot machine calls this whenever a wager is spent so the loss pool
    // grows by the wagered amount. Plinko payouts internally drain it.
    recordWager(amount) { addJackpot(amount); },
    getJackpot() { return jackpotPool; },
    onJackpotChange(fn) {
      jackpotListeners.push(fn);
      try { fn(jackpotPool); } catch (e) {}
    },
    onJackpotHit(fn) { jackpotHitListeners.push(fn); },
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
