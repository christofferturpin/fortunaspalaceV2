/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLLERWORKS WHEEL — continuously-spinning roulette + ball-rain catcher  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ get #wheel-canvas, set 540×580                │
  │                          └─ requestAnimationFrame(loop)                  │
  │                                                                          │
  │   loop() ──► step() → draw() → rAF(loop)                                 │
  │                                                                          │
  │   step():                                                                │
  │     wheelAngle += OMEGA   (wheel always spins, even when idle)           │
  │     filter activeBalls (stepBall settles or lingers)                     │
  │     prune landedFlashes older than FLASH_MS                              │
  │     if round complete (pending=0,active=0,totalBalls>0):                 │
  │       Wallet.add(floor(totalPayout)); setStatus; reset round             │
  │                                                                          │
  │   stepBall(b, now) ──► bool dropFromList                                 │
  │     b.landed?  ── linger LINGER_MS then prune                            │
  │     else: vy+=GRAVITY; x+=vx; y+=vy                                      │
  │       hit wheel disc (dist<RIM_R)? snap to pocket at ball's angle,       │
  │       payout += (bet/totalBalls)*pocketMult; push landedFlash;           │
  │       Sound.ballLand(mult). off-screen safety: drop if y>H+20            │
  │                                                                          │
  │   Public API:                                                            │
  │     queueBalls(count, bet)                                               │
  │       ├─ count==0 → setStatus 'No triplets' return                       │
  │       └─ pendingBalls=count; pendingBet=bet; totalBalls=count;           │
  │           totalPayout=0; startSpawning(); setStatus                      │
  │                                                                          │
  │   startSpawning(): setInterval(SPAWN_INTERVAL_MS) spawnBall              │
  │     while pendingBalls>0 — fires fast (≈70ms) so the cascade looks       │
  │     ridiculous and overwhelming.                                         │
  │                                                                          │
  │   Exports (window.Wheel): { POCKETS, queueBalls, isBusy, onStateChange } │
  │   External deps: Wallet, Sound, Canvas2D, requestAnimationFrame          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: W=540, H=580, CX=W/2, CY=320, WHEEL_R=230, RIM_R=200, HUB_R=38,
    POCKET_COUNT=24, BALL_R=5, GRAVITY=0.18, OMEGA=0.016, SPAWN_INTERVAL_MS=70,
    FUNNEL_Y=70, LINGER_MS=320, FLASH_MS=620
  POCKETS=[24 multipliers in [0,.25,.5,1,2,5] mixed for visual variety];
    avg ≈ 0.63 → ~63% RTP w/ bet/N normalization
  POCKET_COLORS={0→'#1a0a06', .25→'#3a2010', .5→'#6a3818', 1→'#a86028',
    2→'#d4af37', 5→'#ff6a00'}
  state: canvas,ctx; wheelAngle=0; pendingBalls=0, pendingBet=1, totalBalls=0,
    totalPayout=0; activeBalls=[]; landedFlashes=[]; spawnTimer=null;
    stateListeners=[]
  notifyState(): ∀fn→fn({pending,active})
  setStatus(t): #wheel-status.text=t
  spawnBall(): sx=CX+(rnd-.5)*120; push{x=sx,y=8,vx=±0.2,vy=2,landed=F,landAt=0}; notifyState
  pocketIndexAt(angle): localAng=normalize(angle-wheelAngle); ret floor(localAng/(2π/POCKET_COUNT))%POCKET_COUNT
  stepBall(b,now)→drop: b.landed→ret (now-landAt>LINGER_MS);
    b.vy+=G; b.x+=vx; b.y+=vy; dx=x-CX,dy=y-CY,dist=hypot;
    !landed && dist<RIM_R-2 && y>CY-WHEEL_R+4 →
      ang=atan2(dy,dx); idx=pocketIndexAt(ang); m=POCKETS[idx];
      pay=(bet/totalBalls)*m; totalPayout+=pay;
      push landedFlash{idx,t0=now,m,pay};
      pocketAng=(idx+.5)*(2π/POCKET_COUNT)+wheelAngle;
      b.x=CX+cos(pocketAng)*RIM_R; b.y=CY+sin(pocketAng)*RIM_R;
      b.landed=T; b.landAt=now; Sound.ballLand(m); ret F;
    y>H+20→ret T; ret F
  step(): wheelAngle+=OMEGA; now=performance.now;
    activeBalls=filter(!stepBall); landedFlashes=filter(now-t0<FLASH_MS);
    if pending==0 && active==0 && totalBalls>0:
      won=floor(totalPayout); won>0→Wallet.add(won);
      setStatus(`Round paid ${won} coin${...} from ${totalBalls} balls`);
      totalPayout=0; totalBalls=0; notifyState
  drawWheel(now): translate(CX,CY); rotate(wheelAngle); fill disc;
    ∀i<POCKET_COUNT: wedge a0→a1; fillStyle=POCKET_COLORS[POCKETS[i]];
      fill+stroke; label '×m' or '·' rotated to face outward;
    hub fill+stroke; 6 spokes;
    landedFlashes: pocketAng→px,py world coords; radial glow + popup '+m×'
  drawFunnel(): trapezoid chute above wheel + rivet dots
  drawBalls(): glowing copper dots
  draw(): clear; bg paint; drawWheel; drawFunnel; drawBalls
  startSpawning(): clear timer; setInterval(SPAWN_INTERVAL_MS)→
    pending<=0?clear:pending--; spawnBall; notifyState
  init(): #wheel-canvas; ctx; W,H; rAF(loop)
  exports: global.Wheel={POCKETS:slice, queueBalls(c,bet): pending=c; pendingBet=bet;
    totalBalls=c; totalPayout=0; c==0?setStatus 'No triplets':setStatus+startSpawning;
    notifyState | isBusy()→pending>0||active>0 | onStateChange(fn)}
  on DOMContentLoaded→init
*/
(function (global) {
  const W = 540;
  const H = 580;
  const CX = W / 2;
  const CY = 320;
  const WHEEL_R = 230;
  const RIM_R = 200;
  const HUB_R = 38;
  const POCKET_COUNT = 24;
  const BALL_R = 5;
  const GRAVITY = 0.18;
  const OMEGA = 0.016;
  const SPAWN_INTERVAL_MS = 70;
  const FUNNEL_Y = 70;
  const LINGER_MS = 320;
  const FLASH_MS = 620;

  // 24 pockets, alternating dud/small with rare big payoffs. Pattern is
  // deliberately uneven so adjacent balls landing in slightly different
  // angles get visibly different outcomes — feeds the "ridiculous wins,
  // each not worth a lot" feel.
  const POCKETS = [
    0,    0.25, 0.5,  0.25, 0,    0.25,
    1,    0.25, 0.5,  0,    0.25, 2,
    0.25, 0.5,  0,    0.25, 1,    0.25,
    5,    0.25, 0.5,  1,    0.25, 0,
  ];
  const POCKET_COLORS = {
    0:    '#1a0a06',
    0.25: '#3a2010',
    0.5:  '#6a3818',
    1:    '#a86028',
    2:    '#d4af37',
    5:    '#ff6a00',
  };

  let canvas, ctx;
  let wheelAngle = 0;
  let pendingBalls = 0;
  let pendingBet = 1;
  let totalBalls = 0;
  let totalPayout = 0;
  let activeBalls = [];
  let landedFlashes = [];
  let spawnTimer = null;
  const stateListeners = [];

  function notifyState() {
    const s = { pending: pendingBalls, active: activeBalls.length };
    for (const fn of stateListeners) fn(s);
  }

  function setStatus(text) {
    const el = document.getElementById('wheel-status');
    if (el) el.textContent = text;
  }

  function spawnBall() {
    const sx = CX + (Math.random() - 0.5) * 120;
    activeBalls.push({
      x: sx,
      y: 8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: 1.8 + Math.random() * 0.6,
      landed: false,
      landAt: 0,
    });
    notifyState();
  }

  function pocketIndexAt(angle) {
    let localAng = angle - wheelAngle;
    const TWO_PI = Math.PI * 2;
    localAng = ((localAng % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.floor(localAng / (TWO_PI / POCKET_COUNT)) % POCKET_COUNT;
  }

  function stepBall(b, now) {
    if (b.landed) {
      return (now - b.landAt) > LINGER_MS;
    }
    b.vy += GRAVITY;
    b.x += b.vx;
    b.y += b.vy;
    const dx = b.x - CX;
    const dy = b.y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < RIM_R - 2 && b.y > CY - WHEEL_R + 4) {
      const ang = Math.atan2(dy, dx);
      const idx = pocketIndexAt(ang);
      const m = POCKETS[idx];
      const pay = (pendingBet / Math.max(1, totalBalls)) * m;
      totalPayout += pay;
      landedFlashes.push({ idx, t0: now, m, pay });
      const TWO_PI = Math.PI * 2;
      const pocketAng = (idx + 0.5) * (TWO_PI / POCKET_COUNT) + wheelAngle;
      b.x = CX + Math.cos(pocketAng) * RIM_R;
      b.y = CY + Math.sin(pocketAng) * RIM_R;
      b.landed = true;
      b.landAt = now;
      if (global.Sound) global.Sound.ballLand(m);
      return false;
    }
    if (b.y > H + 20) return true;
    return false;
  }

  function step() {
    wheelAngle += OMEGA;
    const now = performance.now();
    activeBalls = activeBalls.filter((b) => !stepBall(b, now));
    landedFlashes = landedFlashes.filter((f) => now - f.t0 < FLASH_MS);
    if (pendingBalls === 0 && activeBalls.length === 0 && totalBalls > 0) {
      const won = Math.floor(totalPayout);
      if (won > 0) Wallet.add(won);
      setStatus('Round paid ' + won + ' coin' + (won === 1 ? '' : 's') +
        ' from ' + totalBalls + ' ball' + (totalBalls === 1 ? '' : 's') + '.');
      totalPayout = 0;
      totalBalls = 0;
      notifyState();
    }
  }

  function drawWheel(now) {
    const TWO_PI = Math.PI * 2;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(wheelAngle);

    // Outer wheel body — dark brass disc with a faint highlight at top.
    const bodyGrad = ctx.createRadialGradient(0, -WHEEL_R * 0.6, 8, 0, 0, WHEEL_R);
    bodyGrad.addColorStop(0, '#5a3818');
    bodyGrad.addColorStop(0.4, '#3a2010');
    bodyGrad.addColorStop(1, '#1a0e06');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R, 0, TWO_PI);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d4af37';
    ctx.stroke();

    // Pockets
    for (let i = 0; i < POCKET_COUNT; i++) {
      const a0 = (i / POCKET_COUNT) * TWO_PI;
      const a1 = ((i + 1) / POCKET_COUNT) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, RIM_R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = POCKET_COLORS[POCKETS[i]] || '#1a0a06';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Pocket labels
    ctx.fillStyle = '#d8c8b0';
    ctx.font = 'bold 14px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < POCKET_COUNT; i++) {
      const a = (i + 0.5) / POCKET_COUNT * TWO_PI;
      const m = POCKETS[i];
      const label =
        m === 0    ? '·'   :
        m === 0.25 ? '¼'   :
        m === 0.5  ? '½'   :
        m + '×';
      ctx.save();
      ctx.rotate(a);
      ctx.translate(RIM_R - 22, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = m >= 2 ? '#1a0a06' : '#d8c8b0';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // Hub
    ctx.fillStyle = '#1a1612';
    ctx.beginPath();
    ctx.arc(0, 0, HUB_R, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Spokes
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 3);
      ctx.strokeStyle = '#6a4018';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(HUB_R - 1, 0);
      ctx.lineTo(WHEEL_R - 6, 0);
      ctx.stroke();
      ctx.restore();
    }
    // Hub rivet
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // Landed flashes (world coords, follow pocket through wheel rotation)
    for (const f of landedFlashes) {
      const age = now - f.t0;
      const t = age / FLASH_MS;
      const opacity = Math.max(0, 1 - t);
      const pocketAng = (f.idx + 0.5) * (TWO_PI / POCKET_COUNT) + wheelAngle;
      const px = CX + Math.cos(pocketAng) * RIM_R;
      const py = CY + Math.sin(pocketAng) * RIM_R;
      ctx.save();
      const glowColor = f.m >= 2 ? 'rgba(255, 200, 80,'
                        : f.m >= 1 ? 'rgba(255, 160, 80,'
                        : 'rgba(255, 220, 140,';
      ctx.shadowColor = f.m >= 5 ? '#ff6a00' : '#d4af37';
      ctx.shadowBlur = 18 * opacity;
      ctx.fillStyle = glowColor + (opacity * 0.55) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 10 + t * 14, 0, TWO_PI);
      ctx.fill();
      if (f.m > 0) {
        ctx.fillStyle = 'rgba(255, 240, 200,' + opacity + ')';
        ctx.font = 'bold 13px "VT323", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+' + f.m + '×', px, py - 18 - t * 12);
      }
      ctx.restore();
    }
  }

  function drawFunnel() {
    // Hopper trapezoid above the wheel
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, FUNNEL_Y);
    grad.addColorStop(0, '#2a1a0c');
    grad.addColorStop(1, '#1a1006');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#6a4028';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(W - 20, 0);
    ctx.lineTo(CX + 70, FUNNEL_Y);
    ctx.lineTo(CX - 70, FUNNEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Rivets
    ctx.fillStyle = '#d4af37';
    [30, 110, 220, 320, 430, W - 30].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Copper pipe rim
    ctx.strokeStyle = '#a86028';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CX - 70, FUNNEL_Y);
    ctx.lineTo(CX + 70, FUNNEL_Y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalls() {
    ctx.save();
    ctx.shadowColor = '#ff8a30';
    for (const b of activeBalls) {
      ctx.shadowBlur = b.landed ? 14 : 8;
      const grad = ctx.createRadialGradient(b.x - 1.5, b.y - 1.5, 0.5, b.x, b.y, BALL_R + 1);
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

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    // Background panel
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0805');
    bg.addColorStop(1, '#050203');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawWheel(now);
    drawFunnel();
    drawBalls();
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
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
    canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    requestAnimationFrame(loop);
  }

  global.Wheel = {
    POCKETS: POCKETS.slice(),
    queueBalls(count, bet) {
      pendingBalls = count;
      pendingBet = bet;
      totalBalls = count;
      totalPayout = 0;
      if (count === 0) {
        setStatus('No triplets — boiler vents cold.');
        notifyState();
        return;
      }
      setStatus(count + ' ball' + (count === 1 ? '' : 's') +
        ' tumbling onto the wheel…');
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
