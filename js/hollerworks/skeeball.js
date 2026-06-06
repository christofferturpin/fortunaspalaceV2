/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLLERWORKS SKEEBALL — ramped lane + ski-jump lip + scoring hole bank   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ get #skeeball-canvas, set 540×500             │
  │                          ├─ bindAimInput (mousemove/touchmove/keydown)   │
  │                          └─ requestAnimationFrame(loop)                  │
  │                                                                          │
  │   loop() ──► step() → draw() → rAF(loop)                                 │
  │                                                                          │
  │   Ball state machine:                                                    │
  │     'ramp'    — animate along quadratic Bezier (BASE → CTRL → LIP)       │
  │                 over ROLL_DURATION_MS. At t=1, switch to 'flying' with   │
  │                 velocity = power × (cos θ, -sin θ) where θ is the        │
  │                 lip tangent angle and power = back-calc from b.aimY.     │
  │     'flying'  — free physics: vy+=GRAVITY each frame; x+=vx; y+=vy.      │
  │                 hits target wall (x>=TARGET_X)? score from y minus       │
  │                 current target offset. hits floor early? gutter.         │
  │     'landed'  — linger LINGER_MS for visual settle, then prune.          │
  │                                                                          │
  │   Player aim:                                                            │
  │     mousemove/touchmove sets aimY (intended landing Y on the wall).      │
  │     Arrow ↑/↓ nudges aimY ±AIM_KEY_STEP. Aim persists across mouse-out.  │
  │     Aim is sampled WHEN BALL SPAWNS — locked in for that ball, so a      │
  │     cascade is a record of where you were aiming at each tick.           │
  │     Each ball's computed power gets ±AIM_POWER_JITTER × 100% variance    │
  │     so identical aims produce slightly different landings.               │
  │                                                                          │
  │   Moving target:                                                         │
  │     The hole bank slides vertically (TARGET_OSC_AMP × sin(now·2π/T)).    │
  │     scoreFromY subtracts the offset before zone lookup so hits chase     │
  │     the holes wherever they currently are. Flight time ≈ 0.5–0.7s, so    │
  │     a 3s oscillation period asks the player to lead the target by       │
  │     ~½–¾ rad of phase.                                                   │
  │                                                                          │
  │   Public API:                                                            │
  │     queueBalls(count, bet)                                               │
  │       ├─ count==0 → setStatus 'no triplets' return                       │
  │       └─ pendingBalls=count; pendingBet=bet; totalBalls=count;           │
  │           totalPayout=0; startSpawning(); setStatus                      │
  │                                                                          │
  │   Exports (window.Skeeball): { ZONES, queueBalls, isBusy,                │
  │                                onStateChange }                           │
  │   External deps: Wallet, Sound, Canvas2D, requestAnimationFrame          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: W=540, H=500, FLOOR_Y=460, GRAVITY=0.4, BALL_R=5,
    SPAWN_INTERVAL_MS=70, ROLL_DURATION_MS=380, LINGER_MS=300, FLASH_MS=700,
    TARGET_X=470, TARGET_X_END=525, SCORE_DIVISOR=22,
    AIM_KEY_STEP=10, AIM_Y_MIN=20, AIM_Y_MAX=H-40, AIM_POWER_JITTER=0.05,
    TARGET_OSC_AMP=60, TARGET_OSC_PERIOD_MS=3000,
    MIN_POWER=4, MAX_POWER=24
  RAMP: BASE=(70,440), CTRL=(230,385), LIP=(290,280) (quadratic Bezier).
    Tangent at t=1 → ≈60° above horizontal; cached LIP_DX,LIP_DY.
  ZONES (intrinsic y, before target offset; high→low):
    100:y=40..65, 50:y=70..100, 40:y=105..140, 30:y=145..185,
    20:y=190..240, 10:y=245..345
  state: canvas,ctx; pendingBalls=0,pendingBet=1,totalBalls=0,totalPayout=0;
    activeBalls=[]; landedFlashes=[]; zoneFlashes={s→t0}; spawnTimer=null;
    stateListeners=[]; aimY=240
  bezPoint(t)→{x,y}: quadratic Bezier on RAMP control points
  notifyState(): ∀fn→fn({pending,active})
  setStatus(t): #skeeball-status.text=t
  getTargetOffset(now): TARGET_OSC_AMP*sin(now/PERIOD*2π)
  scoreFromY(y,oy)→{score,zone}|null: adj=y-oy; ∀z∈ZONES if adj∈[yMin,yMax]→ret; null
  clampAim(v): clamp [AIM_Y_MIN, AIM_Y_MAX]
  computePowerForAim(targetY): solve y_wall = LIP.y + vy*t + 0.5*g*t²
    with t=D/vx, D=TARGET_X-LIP.x, vx=v*LIP_DX, vy=v*LIP_DY (LIP_DX=cos θ,
    LIP_DY=-sin θ). Yields v² = 0.5*g*D² / (LIP_DX²*(y - LIP.y - D*LIP_DY/LIP_DX)).
    Clamp to [MIN_POWER, MAX_POWER].
  spawnBall(): aim=aimY; ramp ball{state:'ramp',spawnAt:now,aimY:aim,
    powerJitter=1+(rnd-.5)*2*AIM_POWER_JITTER,x:BASE.x,y:BASE.y}; notifyState
  stepBall(b,now)→drop:
    b.state==='landed': now-landAt>LINGER_MS;
    b.state==='ramp': t=(now-spawnAt)/ROLL_DURATION; t>=1→
        p=bezPoint(1); b.x=p.x; b.y=p.y; v=computePowerForAim(b.aimY)*powerJitter;
        b.vx=v*LIP_DX; b.vy=v*LIP_DY; b.state='flying';
      else: p=bezPoint(t); b.x=p.x; b.y=p.y; F
    b.state==='flying': vy+=g; x+=vx; y+=vy;
      x>=TARGET_X→ oy=getTargetOffset(now); s=scoreFromY(y,oy)?.score||0;
        pay=(bet/totalBalls)*(s/SCORE_DIVISOR); totalPayout+=pay;
        push landedFlash; if s>0 zoneFlashes[s]=now; b.state='landed'; landAt=now;
        b.x=min(x,TARGET_X+12); Sound.ballLand(s); updateRunningStatus; F;
      y>=FLOOR_Y && x<TARGET_X→ gutter; landed; Sound.ballLand(0);
        updateRunningStatus; F;
      y>H+20||x>W+20→T; F
  step(): now; activeBalls=filter(!stepBall);
    landedFlashes=filter(now-t0<FLASH_MS);
    round-complete: floor(totalPayout)→Wallet.add; setStatus; reset
  updateRunningStatus(): show `${landed}/${total} shots · running ${coins}`
  drawLane(): bg; floor; left-wall + rivets; cabinet shading
  drawRamp(): fill body below bezier down to floor; stroke surface; rivets
  drawSpout(): copper hopper at BASE (drops the ball onto the ramp)
  drawTargets(now): translate(0,oy); ∀z draw hole; flash overlay if recent;
    label; restore. 'GUTTER' label below the envelope stays fixed.
  drawAimLine(): power=computePowerForAim(aimY); vx,vy from LIP_DX/DY;
    dashed parabola sampled t=0→t_wall from LIP.
  drawCrosshair(): yellow crosshair+ring at (TARGET_X+10, aimY)
  drawBalls(): glowing copper dots
  drawFlashes(now): radial glow + popup at ball landing pos
  draw(): clear; drawLane; drawRamp; drawTargets; drawAimLine; drawCrosshair;
    drawSpout; drawBalls; drawFlashes
  bindAimInput(): pointermove/down + touchmove + keydown ArrowUp/Down
  startSpawning(): setInterval(SPAWN_INTERVAL_MS)→spawn or clear
  init(): canvas; ctx; W,H; cursor='crosshair'; bind; loop
  exports: global.Skeeball={ZONES, queueBalls, isBusy, onStateChange}
  on DOMContentLoaded→init
*/
(function (global) {
  const W = 540;
  const H = 500;
  const FLOOR_Y = 460;
  const GRAVITY = 0.4;
  const BALL_R = 5;
  const SPAWN_INTERVAL_MS = 70;
  const ROLL_DURATION_MS = 380;
  const LINGER_MS = 300;
  const FLASH_MS = 700;
  const TARGET_X = 470;
  const TARGET_X_END = 525;
  const SCORE_DIVISOR = 22;
  const AIM_KEY_STEP = 10;
  const AIM_Y_MIN = 20;
  const AIM_Y_MAX = H - 40;
  const AIM_POWER_JITTER = 0.05;
  const TARGET_OSC_AMP = 60;
  const TARGET_OSC_PERIOD_MS = 3000;
  const MIN_POWER = 4;
  const MAX_POWER = 24;

  // Quadratic Bezier ramp: BASE → CTRL → LIP.
  // Chosen so that the tangent at t=1 (the lip) is ≈60° above horizontal:
  // LIP - CTRL = (60, -105) → normalize → (cos 60°, -sin 60°).
  const RAMP_BASE = { x: 70,  y: FLOOR_Y };
  const RAMP_CTRL = { x: 230, y: 385 };
  const RAMP_LIP  = { x: 290, y: 280 };

  // Cached unit-direction of the lip tangent so we don't recompute every
  // spawn/draw.
  const LIP_TANGENT_DX = (RAMP_LIP.x - RAMP_CTRL.x);
  const LIP_TANGENT_DY = (RAMP_LIP.y - RAMP_CTRL.y);
  const LIP_TANGENT_MAG = Math.sqrt(
    LIP_TANGENT_DX * LIP_TANGENT_DX + LIP_TANGENT_DY * LIP_TANGENT_DY);
  const LIP_DX = LIP_TANGENT_DX / LIP_TANGENT_MAG; // cos(θ)
  const LIP_DY = LIP_TANGENT_DY / LIP_TANGENT_MAG; // -sin(θ) (negative since y up = -y)

  // Hole-bank zones in intrinsic coords (before oscillation offset).
  const ZONES = [
    { score: 100, yMin: 40,  yMax: 65,  color: '#ff6a00', label: '100' },
    { score: 50,  yMin: 70,  yMax: 100, color: '#d4af37', label: '50'  },
    { score: 40,  yMin: 105, yMax: 140, color: '#c89048', label: '40'  },
    { score: 30,  yMin: 145, yMax: 185, color: '#a86028', label: '30'  },
    { score: 20,  yMin: 190, yMax: 240, color: '#8a4818', label: '20'  },
    { score: 10,  yMin: 245, yMax: 345, color: '#5a3018', label: '10'  },
  ];

  let canvas, ctx;
  let pendingBalls = 0;
  let pendingBet = 1;
  let totalBalls = 0;
  let totalPayout = 0;
  let activeBalls = [];
  let landedFlashes = [];
  const zoneFlashes = {};
  let spawnTimer = null;
  const stateListeners = [];
  let aimY = 240;

  function notifyState() {
    const s = { pending: pendingBalls, active: activeBalls.length };
    for (const fn of stateListeners) fn(s);
  }

  function setStatus(text) {
    const el = document.getElementById('skeeball-status');
    if (el) el.textContent = text;
  }

  function getTargetOffset(now) {
    return TARGET_OSC_AMP * Math.sin(now / TARGET_OSC_PERIOD_MS * Math.PI * 2);
  }

  function scoreFromY(y, oy) {
    const adj = y - oy;
    for (const z of ZONES) {
      if (adj >= z.yMin && adj <= z.yMax) return { score: z.score, zone: z };
    }
    return null;
  }

  function clampAim(v) {
    if (v < AIM_Y_MIN) return AIM_Y_MIN;
    if (v > AIM_Y_MAX) return AIM_Y_MAX;
    return v;
  }

  function bezPoint(t) {
    const mt = 1 - t;
    return {
      x: mt * mt * RAMP_BASE.x + 2 * mt * t * RAMP_CTRL.x + t * t * RAMP_LIP.x,
      y: mt * mt * RAMP_BASE.y + 2 * mt * t * RAMP_CTRL.y + t * t * RAMP_LIP.y,
    };
  }

  // From lip kinematics:  y_wall = LIP.y + vy*t + ½·g·t²
  //   where t = D / vx = D / (v · LIP_DX),  vy = v · LIP_DY  (LIP_DY<0).
  //   Substituting:
  //     y - LIP.y = (v·LIP_DY) · (D/(v·LIP_DX)) + ½·g·(D/(v·LIP_DX))²
  //     y - LIP.y = D·(LIP_DY/LIP_DX) + ½·g·D² / (LIP_DX² · v²)
  //     v² = ½·g·D² / (LIP_DX² · (y - LIP.y - D·LIP_DY/LIP_DX))
  function computePowerForAim(targetY) {
    const D = TARGET_X - RAMP_LIP.x;
    const fall = targetY - RAMP_LIP.y - D * (LIP_DY / LIP_DX);
    if (fall <= 1) return MAX_POWER; // unreachable from above; cap
    const v2 = 0.5 * GRAVITY * D * D / (LIP_DX * LIP_DX * fall);
    const v = Math.sqrt(v2);
    if (v < MIN_POWER) return MIN_POWER;
    if (v > MAX_POWER) return MAX_POWER;
    return v;
  }

  function updateRunningStatus() {
    if (totalBalls === 0) return;
    const landed = totalBalls - pendingBalls - activeBalls.length;
    const coins = Math.floor(totalPayout);
    setStatus(landed + '/' + totalBalls + ' shots · running ' + coins +
      ' coin' + (coins === 1 ? '' : 's'));
  }

  function spawnBall() {
    const now = performance.now();
    activeBalls.push({
      state: 'ramp',
      spawnAt: now,
      aimY,
      powerJitter: 1 + (Math.random() - 0.5) * 2 * AIM_POWER_JITTER,
      x: RAMP_BASE.x,
      y: RAMP_BASE.y,
      vx: 0,
      vy: 0,
      landed: false,
      landAt: 0,
      score: 0,
    });
    notifyState();
  }

  function stepBall(b, now) {
    if (b.state === 'landed') {
      return (now - b.landAt) > LINGER_MS;
    }

    if (b.state === 'ramp') {
      const t = Math.min(1, (now - b.spawnAt) / ROLL_DURATION_MS);
      const p = bezPoint(t);
      b.x = p.x;
      b.y = p.y;
      if (t >= 1) {
        // Launch off the lip with computed velocity for the locked-in aim.
        const power = computePowerForAim(b.aimY) * b.powerJitter;
        b.vx = power * LIP_DX;
        b.vy = power * LIP_DY;
        b.state = 'flying';
      }
      return false;
    }

    // flying
    b.vy += GRAVITY;
    b.x += b.vx;
    b.y += b.vy;

    if (b.x >= TARGET_X) {
      const oy = getTargetOffset(now);
      const r = scoreFromY(b.y, oy);
      const score = r ? r.score : 0;
      const pay = (pendingBet / Math.max(1, totalBalls)) * (score / SCORE_DIVISOR);
      totalPayout += pay;
      const fx = Math.min(b.x, TARGET_X + 12);
      landedFlashes.push({ x: fx, y: b.y, t0: now, score, pay });
      if (score > 0) zoneFlashes[score] = now;
      b.state = 'landed';
      b.landAt = now;
      b.x = fx;
      b.score = score;
      if (global.Sound) global.Sound.ballLand(score);
      updateRunningStatus();
      return false;
    }

    if (b.y >= FLOOR_Y && b.x < TARGET_X) {
      landedFlashes.push({ x: b.x, y: FLOOR_Y, t0: now, score: 0, pay: 0 });
      b.y = FLOOR_Y;
      b.state = 'landed';
      b.landAt = now;
      b.score = 0;
      if (global.Sound) global.Sound.ballLand(0);
      updateRunningStatus();
      return false;
    }

    if (b.y > H + 20 || b.x > W + 20) return true;
    return false;
  }

  function step() {
    const now = performance.now();
    activeBalls = activeBalls.filter((b) => !stepBall(b, now));
    landedFlashes = landedFlashes.filter((f) => now - f.t0 < FLASH_MS);
    if (pendingBalls === 0 && activeBalls.length === 0 && totalBalls > 0) {
      const won = Math.floor(totalPayout);
      if (won > 0) Wallet.add(won);
      setStatus('Round paid ' + won + ' coin' + (won === 1 ? '' : 's') +
        ' from ' + totalBalls + ' shot' + (totalBalls === 1 ? '' : 's') + '.');
      totalPayout = 0;
      totalBalls = 0;
      notifyState();
    }
  }

  function drawLane() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0805');
    bg.addColorStop(1, '#1a0e06');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Floor
    ctx.strokeStyle = '#6a4028';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, FLOOR_Y);
    ctx.lineTo(W - 20, FLOOR_Y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90, 50, 24, 0.25)';
    ctx.fillRect(20, FLOOR_Y, W - 40, 14);

    // Left cabinet wall + rivets
    ctx.strokeStyle = '#5a3818';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(20, FLOOR_Y);
    ctx.stroke();
    ctx.fillStyle = '#d4af37';
    [60, 160, 260, 360, 440].forEach((y) => {
      ctx.beginPath();
      ctx.arc(20, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawRamp() {
    // Body (fill under the curve down to the floor)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(RAMP_BASE.x, RAMP_BASE.y);
    ctx.quadraticCurveTo(RAMP_CTRL.x, RAMP_CTRL.y, RAMP_LIP.x, RAMP_LIP.y);
    ctx.lineTo(RAMP_LIP.x, FLOOR_Y);
    ctx.lineTo(RAMP_BASE.x, FLOOR_Y);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, RAMP_LIP.y, 0, FLOOR_Y);
    body.addColorStop(0, '#3a2010');
    body.addColorStop(1, '#1a0e06');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = '#5a3818';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Surface (the curve itself, drawn over the body)
    ctx.beginPath();
    ctx.moveTo(RAMP_BASE.x, RAMP_BASE.y);
    ctx.quadraticCurveTo(RAMP_CTRL.x, RAMP_CTRL.y, RAMP_LIP.x, RAMP_LIP.y);
    ctx.strokeStyle = '#c89048';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Inner highlight
    ctx.beginPath();
    ctx.moveTo(RAMP_BASE.x, RAMP_BASE.y - 1);
    ctx.quadraticCurveTo(RAMP_CTRL.x, RAMP_CTRL.y - 1, RAMP_LIP.x, RAMP_LIP.y - 1);
    ctx.strokeStyle = 'rgba(255, 220, 130, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Lip flange — a small upturned plate at the top of the ramp
    const lipDirX = LIP_DX;
    const lipDirY = LIP_DY;
    const flangeLen = 12;
    const nx = -lipDirY;  // perpendicular up-left
    const ny =  lipDirX;
    const fx = RAMP_LIP.x + lipDirX * flangeLen;
    const fy = RAMP_LIP.y + lipDirY * flangeLen;
    ctx.beginPath();
    ctx.moveTo(RAMP_LIP.x, RAMP_LIP.y);
    ctx.lineTo(fx, fy);
    ctx.lineTo(fx + nx * 6, fy + ny * 6);
    ctx.lineTo(RAMP_LIP.x + nx * 6, RAMP_LIP.y + ny * 6);
    ctx.closePath();
    ctx.fillStyle = '#d4af37';
    ctx.fill();
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rivets along the ramp body
    ctx.fillStyle = '#d4af37';
    [0.15, 0.35, 0.55, 0.75].forEach((u) => {
      const p = bezPoint(u);
      ctx.beginPath();
      ctx.arc(p.x, p.y + 18, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawSpout() {
    // Copper hopper at the base of the ramp — visual only; balls appear
    // at RAMP_BASE and start rolling.
    ctx.save();
    ctx.translate(RAMP_BASE.x - 8, RAMP_BASE.y - 4);
    const grad = ctx.createLinearGradient(0, -10, 0, 10);
    grad.addColorStop(0, '#ffc060');
    grad.addColorStop(0.5, '#a86028');
    grad.addColorStop(1, '#5a3018');
    ctx.fillStyle = grad;
    ctx.fillRect(-22, -14, 28, 28);
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-22, -14, 28, 28);
    // Open spout mouth (where the ball emerges)
    ctx.fillStyle = '#0a0403';
    ctx.fillRect(2, -6, 6, 12);
    ctx.strokeRect(2, -6, 6, 12);
    // Rivets
    ctx.fillStyle = '#d4af37';
    [-18, -8, 2].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, -10, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, 10, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawTargets(now) {
    const oy = getTargetOffset(now);
    ctx.save();
    ctx.translate(0, oy);

    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(TARGET_X - 4, 30, (TARGET_X_END - TARGET_X) + 16, 330);
    ctx.strokeStyle = '#5a3818';
    ctx.lineWidth = 2;
    ctx.strokeRect(TARGET_X - 4, 30, (TARGET_X_END - TARGET_X) + 16, 330);

    for (const z of ZONES) {
      const h = z.yMax - z.yMin;
      ctx.fillStyle = z.color;
      ctx.fillRect(TARGET_X, z.yMin, TARGET_X_END - TARGET_X, h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(TARGET_X + 2, z.yMin + 2, TARGET_X_END - TARGET_X - 4, h - 4);
      ctx.strokeStyle = '#3a1a08';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(TARGET_X, z.yMin, TARGET_X_END - TARGET_X, h);

      const flashAge = now - (zoneFlashes[z.score] || -Infinity);
      if (flashAge < FLASH_MS) {
        const a = Math.max(0, 1 - flashAge / FLASH_MS);
        ctx.save();
        ctx.shadowColor = z.color;
        ctx.shadowBlur = 18 * a;
        ctx.fillStyle = 'rgba(255, 220, 130, ' + (a * 0.45) + ')';
        ctx.fillRect(TARGET_X + 2, z.yMin + 2, TARGET_X_END - TARGET_X - 4, h - 4);
        ctx.restore();
      }

      ctx.fillStyle = '#ffe0a0';
      ctx.font = 'bold ' + (h >= 50 ? 18 : 14) + 'px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(z.label, (TARGET_X + TARGET_X_END) / 2, z.yMin + h / 2);
    }
    ctx.restore();

    // "GUTTER" label below the oscillation envelope (fixed position)
    ctx.fillStyle = '#5a3018';
    ctx.font = 'bold 10px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GUTTER', (TARGET_X + TARGET_X_END) / 2, FLOOR_Y - 6);
  }

  function drawAimLine() {
    const power = computePowerForAim(aimY);
    const vx = power * LIP_DX;
    const vy = power * LIP_DY;
    const D = TARGET_X - RAMP_LIP.x;
    const t_wall = D / vx;

    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.setLineDash([4, 7]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(RAMP_LIP.x, RAMP_LIP.y);
    for (let s = 2; s <= t_wall; s += 2) {
      const px = RAMP_LIP.x + vx * s;
      const py = RAMP_LIP.y + vy * s + 0.5 * GRAVITY * s * s;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCrosshair() {
    ctx.save();
    ctx.strokeStyle = '#ffd070';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffd070';
    ctx.shadowBlur = 6;
    const x = TARGET_X + 10;
    const y = aimY;
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalls() {
    ctx.save();
    ctx.shadowColor = '#ff8a30';
    for (const b of activeBalls) {
      ctx.shadowBlur = b.state === 'landed' ? 14 : 9;
      const grad = ctx.createRadialGradient(b.x - 1.5, b.y - 1.5, 0.4, b.x, b.y, BALL_R + 1);
      grad.addColorStop(0, '#fff0c0');
      grad.addColorStop(0.5, '#ffc060');
      grad.addColorStop(1, '#a05818');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlashes(now) {
    for (const f of landedFlashes) {
      const age = now - f.t0;
      const t = age / FLASH_MS;
      const opacity = Math.max(0, 1 - t);
      ctx.save();
      const isGutter = f.score === 0;
      const glow = isGutter ? '#5a3018' : (f.score >= 50 ? '#ff8a30' : '#d4af37');
      ctx.shadowColor = glow;
      ctx.shadowBlur = 16 * opacity;
      ctx.fillStyle = isGutter
        ? 'rgba(140, 90, 60,' + (opacity * 0.45) + ')'
        : 'rgba(255, 220, 130,' + (opacity * 0.55) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, 8 + t * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 13px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isGutter
        ? 'rgba(160, 110, 70,' + opacity + ')'
        : 'rgba(255, 240, 200,' + opacity + ')';
      const label = isGutter ? '×' : '+' + f.score;
      ctx.fillText(label, f.x, f.y - 14 - t * 14);
      ctx.restore();
    }
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    drawLane();
    drawRamp();
    drawTargets(now);
    drawAimLine();
    drawCrosshair();
    drawSpout();
    drawBalls();
    drawFlashes(now);
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  function pointerToAim(clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.height === 0) return;
    const scaleY = H / rect.height;
    aimY = clampAim((clientY - rect.top) * scaleY);
  }

  function bindAimInput() {
    canvas.addEventListener('pointermove', (e) => pointerToAim(e.clientY));
    canvas.addEventListener('pointerdown', (e) => pointerToAim(e.clientY));
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        pointerToAim(e.touches[0].clientY);
        e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        aimY = clampAim(aimY - AIM_KEY_STEP);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        aimY = clampAim(aimY + AIM_KEY_STEP);
        e.preventDefault();
      }
    });
  }

  function startSpawning() {
    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(() => {
      if (pendingBalls <= 0) {
        clearInterval(spawnTimer);
        spawnTimer = null;
        return;
      }
      pendingBalls -= 1;
      spawnBall();
      notifyState();
    }, SPAWN_INTERVAL_MS);
  }

  function init() {
    canvas = document.getElementById('skeeball-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cursor = 'crosshair';
    bindAimInput();
    requestAnimationFrame(loop);
  }

  global.Skeeball = {
    ZONES: ZONES.slice(),
    queueBalls(count, bet) {
      pendingBalls = count;
      pendingBet = bet;
      totalBalls = count;
      totalPayout = 0;
      if (count === 0) {
        setStatus('No triplets — the launcher coughs and quits.');
        notifyState();
        return;
      }
      setStatus(count + ' shot' + (count === 1 ? '' : 's') +
        ' rolling up the ramp…');
      startSpawning();
      notifyState();
    },
    isBusy() {
      return pendingBalls > 0 || activeBalls.length > 0;
    },
    onStateChange(fn) { stateListeners.push(fn); },
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
