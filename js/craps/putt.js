/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRAPS PUTT OVERLAY  —  bent-hallway mini-golf payout phase              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ grabs #cp-putt-* DOM refs                    │
  │                          ├─ canvas mousemove ──► onMouseMove             │
  │                          ├─ canvas mousedown ──► onMouseDown             │
  │                          ├─ window  mouseup   ──► onMouseUp              │
  │                          ├─ window  keydown   ──► onKey                  │
  │                          └─ close   click     ──► closeOverlay           │
  │                                                                          │
  │   CrapsPutt.show(opts)  opts:{ballCount,perBall,valueMult,bonusPct,      │
  │                                bonusCoins,onComplete(totalWon)}          │
  │                  │                                                       │
  │                  └─► nextBall() ──► generateCourse()                     │
  │                                       │                                  │
  │                                       └─► tryGenerateCourse(...)         │
  │                                              ├─ polylineToPolygon(pts,w) │
  │                                              │      └─ lineIntersect()   │
  │                                              └─► course{ball,hole,walls, │
  │                                                          hill,polygon}   │
  │                  └─► enterAim() ──► draw()                               │
  │                                                                          │
  │   Aim/Power/Fire pipeline:                                               │
  │     onMouseDown(aim) ─► aim-hold ─► onMouseUp ─► enterPower()            │
  │     enterPower()    ─► tickPower() (rAF bar oscillation)                 │
  │     onMouseDown(power)/Space ─► fire()                                   │
  │     fire() ─► SFX.putt(); rAF stepFly()                                  │
  │                                                                          │
  │   stepFly() ──► physicsTick() ──► draw()                                 │
  │                  │                                                       │
  │                  ├─ hill push, friction, substep motion                  │
  │                  ├─ collideCircleSegment(cx,cy,r,x1,y1,x2,y2)            │
  │                  │     ──► {nx,ny,overlap} | null                        │
  │                  ├─ wall reflect (restitution) + SFX.wallHit()           │
  │                  └─ hole capture ──► course.sunk = true                  │
  │                                                                          │
  │   Resolution:                                                            │
  │     sunk     ──► onSunk()    ──► SFX.sink(); nextBall()                  │
  │     stopped  ──► onStopped() ──► SFX.miss(); course.missCount++;         │
  │                                  nextBall()                              │
  │     nextBall: if course.missCount ≥ COURSE_FAIL_LIMIT (9), regenerate    │
  │               course on the next swing (same ball budget — refresh, not  │
  │               consume); otherwise respawn ball at start.                 │
  │     ballIdx > totalBalls ──► finish()                                    │
  │                              └─► adds bonusCoins; SFX.win/loss;          │
  │                                  reveals close button                    │
  │     closeOverlay() ──► onComplete(totalWon)                              │
  │                                                                          │
  │   Draw pipeline: draw() ──► canvas paint + drawArrowHead()               │
  │   HUD: setPrompt(text), updateHud() updates #cp-putt-* spans             │
  │                                                                          │
  │   Exports: window.CrapsPutt = { show }                                   │
  │   External deps: window.SFX (putt/wallHit/sink/miss/win/loss),           │
  │                  DOM (#cp-putt-overlay/canvas/prompt/power/close/ball/   │
  │                       stroke/payout/won/mult)                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: W=600, H=400, BALL_R=7, HOLE_R=11, FRICTION=.985, MIN_SPEED=.06, MAX_LAUNCH=13, MIN_LAUNCH=1.8, SINK_SPEED=6.2, POWER_STEP=2.6, HILL_PUSH=.16, WALL_RESTITUTION=.78, COURSE_FAIL_LIMIT=9
  DOM: overlay,canvas,ctx,promptEl,powerWrap,powerFill,closeBtn,ballEl,strokeEl,payoutEl,wonEl,multEl
  state: course, totalBalls=1, perBall=1, valueMult=1, bonusPct=0, bonusCoins=0, ballIdx=0, totalWon=0, ballsSunk=0, phase='idle'∈{aim,aim-hold,power,flying,between,done}, aimAngle=-π/2, powerLevel=0, powerDir=1, mouseX/Y, onComplete, powerRaf, flyRaf
  init(): grab DOM; bind canvas mousemove/down, window mouseup/keydown, close click
  show(opts): set totalBalls/perBall/valueMult/bonusPct/bonusCoins/onComplete; reset ballIdx/totalWon/ballsSunk; overlay.hidden=F; closeBtn.hidden=T; updateHud; nextBall
  closeOverlay(): hide; cancel rafs; phase=idle; call onComplete(totalWon)
  generateCourse()→c: 80 attempts of tryGenerateCourse; fallback known-good 90°
  tryGenerateCourse(...)→c|null: width=115..140, betaDeg=65..115, theta1=rnd, turn=±1, L1/L2=150..230, corner cx/cy w/margin; ballEnd/holeEnd = corner±L·(cos,sin); polygon=polylineToPolygon([ballEnd,corner,holeEnd],width); ∀v∈poly verify in canvas; ball/hole inset 30/34 from arm end; hill on rnd arm@T=.35..65, r=min(34,w·.32), fx/fy=(cos,sin)hillAngle·HILL_PUSH; walls=poly edges; ret {ball,hole,walls,polygon,hill,ballStart,sunk:F}
  polylineToPolygon(pts,w)→poly: halfW=w/2; ∀i: end caps use left-normal; mid uses miter via lineIntersect; ret [...left, ...right.reverse()]
  lineIntersect(a,dx1,dy1,b,dx2,dy2)→pt|null: det≈0→null; t=...; ret a+t·d
  collideCircleSegment(cx,cy,r,x1,y1,x2,y2)→{nx,ny,overlap}|null: project onto seg, clamp t∈[0,1]; distSq>=r²→null; ret push-out normal
  nextBall(): ballIdx++; >totalBalls→finish; stale=course&&!sunk&&missCount≥COURSE_FAIL_LIMIT; if !course||sunk||stale→generateCourse else reset ball to ballStart, v=0; aimAngle=-π/2; mouse→hole; updateHud; enterAim
  enterAim(): phase=aim; powerLevel/Dir reset; powerFill=0%; setPrompt(ball N of M…); draw
  enterPower(): phase=power; reset; powerWrap+active; setPrompt(stop bar); tickPower
  tickPower(): guard phase=power; powerLevel+=POWER_STEP·dir; clamp [0,100] reverse; powerFill.width=lvl%; rAF
  fire(): cancel powerRaf; v=MIN_LAUNCH+(lvl/100)·(MAX-MIN); ball.vx/vy=cos/sin(aim)·v; phase=flying; SFX.putt; rAF stepFly
  stepFly(): guard flying; physicsTick; draw; sunk→onSunk; speed<MIN_SPEED→stop+onStopped; else rAF
  onSunk(): phase=between; ballsSunk++; totalWon+=perBall; updateHud; SFX.sink; setPrompt(Sunk!); setTimeout 850→nextBall
  onStopped(): phase=between; course.missCount++; SFX.miss; setPrompt(Missed|refresh hint if ≥FAIL_LIMIT); setTimeout 700→nextBall
  finish(): phase=done; totalWon+=bonusCoins; updateHud; setPrompt(round over summary); SFX.win||loss; closeBtn.hidden=F; focus
  physicsTick(): hill push if inside disc; friction; substep numSteps=ceil(speed/(BALL_R·.6)); ∀step: advance+4iter wall collide (push out, reflect vn·-RESTITUTION, SFX.wallHit); clamp to canvas; hole capture if dist<HOLE_R+BALL_R·.3 && speed<SINK_SPEED→sunk=T; lip nudge if close+slow
  onMouseMove(e): update mouseX/Y from canvas rect; if aim/aim-hold→aimAngle=atan2(mouse-ball); draw
  onMouseDown(e): phase=aim→aim-hold+snap aim+setPrompt(drag); phase=power→fire
  onMouseUp(): phase=aim-hold→enterPower
  onKey(e): guard overlay.hidden; Space→enterPower||fire by phase; Enter && !closeBtn.hidden→closeOverlay
  draw(): bg wall grad+grout; tracePoly; clip→floor linoleum+seams+stains+hill(grad+arrow); restore; corridor strokes cream/blood/black; hole black+IV stand pink flag; aim guide dashed/solid by phase+arrow; ball shadow+gauze grad+red cross+outline
  drawArrowHead(x,y,angle,size,color): tri at tip
  setPrompt(text): promptEl.text=text
  updateHud(): ballEl=idx/total, strokeEl=bonus or —, payoutEl=perBall c, wonEl=totalWon c, multEl=×valueMult
  exports: window.CrapsPutt={show}; on DOMContentLoaded→init
*/

(function () {
  const W = 600;
  const H = 400;
  const BALL_R = 7;
  const HOLE_R = 11;
  const FRICTION = 0.985;
  const MIN_SPEED = 0.06;
  const MAX_LAUNCH = 13;
  const MIN_LAUNCH = 1.8;
  const SINK_SPEED = 6.2;
  const POWER_STEP = 2.6;
  const HILL_PUSH = 0.16;
  const WALL_RESTITUTION = 0.78;
  // After this many consecutive misses on the same course, the next ball
  // gets a fresh layout — keeps a brutal corridor from grinding the whole
  // round down. Only really fires on High (11 balls); Mid/Low rounds end
  // before the counter has room to climb that high.
  const COURSE_FAIL_LIMIT = 9;

  let overlay, canvas, ctx, promptEl, powerWrap, powerFill, closeBtn;
  let ballEl, strokeEl, payoutEl, wonEl, multEl;

  let course;
  let totalBalls = 1, perBall = 1, valueMult = 1, bonusPct = 0, bonusCoins = 0;
  let ballIdx = 0, totalWon = 0, ballsSunk = 0;
  let phase = 'idle'; // 'aim' | 'aim-hold' | 'power' | 'flying' | 'between' | 'done'
  let aimAngle = -Math.PI / 2;
  let powerLevel = 0;
  let powerDir = 1;
  let mouseX = W / 2, mouseY = 40;
  let onComplete = null;
  let powerRaf = 0;
  let flyRaf = 0;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    overlay   = document.getElementById('cp-putt-overlay');
    canvas    = document.getElementById('cp-putt-canvas');
    if (!overlay || !canvas) return;
    ctx       = canvas.getContext('2d');
    promptEl  = document.getElementById('cp-putt-prompt');
    powerWrap = document.getElementById('cp-putt-power');
    powerFill = document.getElementById('cp-putt-power-fill');
    closeBtn  = document.getElementById('cp-putt-close');
    ballEl    = document.getElementById('cp-putt-ball');
    strokeEl  = document.getElementById('cp-putt-stroke');
    payoutEl  = document.getElementById('cp-putt-payout');
    wonEl     = document.getElementById('cp-putt-won');
    multEl    = document.getElementById('cp-putt-mult');

    canvas.addEventListener('mousemove', onMouseMove, { passive: true });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', closeOverlay);
  }

  function show(opts) {
    totalBalls = opts.ballCount;
    perBall    = opts.perBall;
    valueMult  = opts.valueMult;
    bonusPct   = opts.bonusPct || 0;
    bonusCoins = opts.bonusCoins || 0;
    onComplete = opts.onComplete;

    ballIdx = 0;
    totalWon = 0;
    ballsSunk = 0;
    // course is generated per-ball inside nextBall() — each shot gets a fresh
    // hallway with a different bend angle.

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    closeBtn.hidden = true;
    powerWrap.classList.remove('cp-putt-power-active');
    updateHud();
    nextBall();
  }

  function closeOverlay() {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    cancelAnimationFrame(powerRaf);
    cancelAnimationFrame(flyRaf);
    phase = 'idle';
    const fn = onComplete;
    onComplete = null;
    if (typeof fn === 'function') fn(totalWon);
  }

  // ====== COURSE GEN ======
  // A course is a bent hallway: two arms meeting at a corner with a random
  // interior angle in [65°, 115°]. The polyline (ballEnd → corner → holeEnd)
  // is buffered out to a polygon of width ~120, and that polygon IS the play
  // area. Polygon edges are the walls the ball bounces off of.
  function generateCourse() {
    for (let attempt = 0; attempt < 80; attempt++) {
      const c = tryGenerateCourse();
      if (c) return c;
    }
    // Fallback: a known-good right-angle course
    return tryGenerateCourse(90, 120, 0, 1, 180, 180, 300, 200);
  }

  function tryGenerateCourse(forceBetaDeg, forceWidth, forceTheta1, forceTurn, forceL1, forceL2, forceCx, forceCy) {
    const widthCorridor = forceWidth || (115 + Math.random() * 25);          // 115..140
    const betaDeg = forceBetaDeg || (65 + Math.random() * 50);               // 65°..115° interior
    const beta = betaDeg * Math.PI / 180;
    const theta1 = forceTheta1 !== undefined ? forceTheta1 : Math.random() * Math.PI * 2;
    const turn = forceTurn !== undefined ? forceTurn : (Math.random() < 0.5 ? 1 : -1);
    const theta2 = theta1 + turn * beta;
    const L1 = forceL1 || (150 + Math.random() * 80);
    const L2 = forceL2 || (150 + Math.random() * 80);
    const cornerMargin = 60;
    const cx = forceCx !== undefined ? forceCx : (cornerMargin + Math.random() * (W - 2 * cornerMargin));
    const cy = forceCy !== undefined ? forceCy : (cornerMargin + Math.random() * (H - 2 * cornerMargin));

    const ballEnd = { x: cx + L1 * Math.cos(theta1), y: cy + L1 * Math.sin(theta1) };
    const holeEnd = { x: cx + L2 * Math.cos(theta2), y: cy + L2 * Math.sin(theta2) };

    const polygon = polylineToPolygon(
      [ballEnd, { x: cx, y: cy }, holeEnd],
      widthCorridor,
    );

    // All polygon vertices must fit within the canvas (with a small margin).
    for (const v of polygon) {
      if (v.x < 4 || v.x > W - 4 || v.y < 4 || v.y > H - 4) return null;
    }

    // Ball/hole sit slightly inset from each arm's end cap so they're cleanly
    // inside the corridor, not pressed against the cap wall.
    const ballPos = {
      x: cx + (L1 - 30) * Math.cos(theta1),
      y: cy + (L1 - 30) * Math.sin(theta1),
    };
    const holePos = {
      x: cx + (L2 - 34) * Math.cos(theta2),
      y: cy + (L2 - 34) * Math.sin(theta2),
    };

    // Hill: somewhere in the middle of one of the arms.
    const useArm1 = Math.random() < 0.5;
    const armT = 0.35 + Math.random() * 0.3;
    const hillTheta = useArm1 ? theta1 : theta2;
    const hillL = useArm1 ? L1 : L2;
    const hillAngle = Math.random() * Math.PI * 2;
    const hill = {
      x: cx + hillL * armT * Math.cos(hillTheta),
      y: cy + hillL * armT * Math.sin(hillTheta),
      r: Math.min(34, widthCorridor * 0.32),
      fx: Math.cos(hillAngle) * HILL_PUSH,
      fy: Math.sin(hillAngle) * HILL_PUSH,
      angle: hillAngle,
    };

    // Build wall segments from polygon edges (closed loop).
    const walls = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      walls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }

    return {
      ball: { x: ballPos.x, y: ballPos.y, vx: 0, vy: 0 },
      hole: { x: holePos.x, y: holePos.y },
      walls,
      polygon,
      hill,
      ballStart: { x: ballPos.x, y: ballPos.y },
      sunk: false,
      missCount: 0,
    };
  }

  // Buffer a polyline outward by `width/2` on each side and return the
  // resulting closed polygon. Bends use a simple miter join (intersection of
  // the offset lines). Restricting the bend angle range upstream keeps the
  // miter from getting wildly long.
  function polylineToPolygon(points, width) {
    const halfW = width / 2;
    const left = [];
    const right = [];

    for (let i = 0; i < points.length; i++) {
      if (i === 0 || i === points.length - 1) {
        const dx = i === 0 ? points[1].x - points[0].x : points[i].x - points[i - 1].x;
        const dy = i === 0 ? points[1].y - points[0].y : points[i].y - points[i - 1].y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len, ny = dx / len; // left normal
        left.push({ x: points[i].x + nx * halfW, y: points[i].y + ny * halfW });
        right.push({ x: points[i].x - nx * halfW, y: points[i].y - ny * halfW });
      } else {
        const p = points[i];
        const prev = points[i - 1];
        const next = points[i + 1];
        const dx1 = p.x - prev.x, dy1 = p.y - prev.y;
        const len1 = Math.hypot(dx1, dy1);
        const nx1 = -dy1 / len1, ny1 = dx1 / len1;
        const dx2 = next.x - p.x, dy2 = next.y - p.y;
        const len2 = Math.hypot(dx2, dy2);
        const nx2 = -dy2 / len2, ny2 = dx2 / len2;

        const aL = { x: p.x + nx1 * halfW, y: p.y + ny1 * halfW };
        const bL = { x: p.x + nx2 * halfW, y: p.y + ny2 * halfW };
        left.push(lineIntersect(aL, dx1, dy1, bL, dx2, dy2) || aL);

        const aR = { x: p.x - nx1 * halfW, y: p.y - ny1 * halfW };
        const bR = { x: p.x - nx2 * halfW, y: p.y - ny2 * halfW };
        right.push(lineIntersect(aR, dx1, dy1, bR, dx2, dy2) || aR);
      }
    }

    return [...left, ...right.reverse()];
  }

  function lineIntersect(a, dx1, dy1, b, dx2, dy2) {
    const det = -dx1 * dy2 + dx2 * dy1;
    if (Math.abs(det) < 1e-6) return null;
    const t = ((b.x - a.x) * (-dy2) + dx2 * (b.y - a.y)) / det;
    return { x: a.x + t * dx1, y: a.y + t * dy1 };
  }

  // Circle vs. line segment. Returns push-out normal + overlap on hit, else null.
  function collideCircleSegment(cx, cy, r, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const ddx = cx - px, ddy = cy - py;
    const distSq = ddx * ddx + ddy * ddy;
    if (distSq >= r * r) return null;
    const dist = Math.sqrt(Math.max(distSq, 1e-6));
    return {
      nx: ddx / dist,
      ny: ddy / dist,
      overlap: r - dist,
    };
  }

  // ====== ROUND FLOW ======

  function nextBall() {
    ballIdx++;
    if (ballIdx > totalBalls) { finish(); return; }
    // Fresh course on the first ball, after every sink, and after the
    // player misses COURSE_FAIL_LIMIT times on the same layout. Otherwise
    // the course stays the same — same hole, same hill — but the ball
    // respawns at the start so the player gets another swing at the level.
    const stale = course && !course.sunk && course.missCount >= COURSE_FAIL_LIMIT;
    if (!course || course.sunk || stale) {
      course = generateCourse();
    } else {
      course.ball.x = course.ballStart.x;
      course.ball.y = course.ballStart.y;
      course.ball.vx = 0;
      course.ball.vy = 0;
    }
    aimAngle = -Math.PI / 2;
    mouseX = course.hole.x;
    mouseY = course.hole.y;
    updateHud();
    enterAim();
  }

  function enterAim() {
    phase = 'aim';
    powerLevel = 0;
    powerDir = 1;
    powerFill.style.width = '0%';
    powerWrap.classList.remove('cp-putt-power-active');
    setPrompt(`Ball ${ballIdx} of ${totalBalls} — press and hold to aim, release to commit.`);
    draw();
  }

  function enterPower() {
    phase = 'power';
    powerLevel = 0;
    powerDir = 1;
    powerWrap.classList.add('cp-putt-power-active');
    setPrompt('Power — click (or Space) to stop the bar.');
    tickPower();
  }

  function tickPower() {
    if (phase !== 'power') return;
    powerLevel += POWER_STEP * powerDir;
    if (powerLevel >= 100) { powerLevel = 100; powerDir = -1; }
    if (powerLevel <= 0)   { powerLevel = 0;   powerDir = 1; }
    powerFill.style.width = powerLevel + '%';
    powerRaf = requestAnimationFrame(tickPower);
  }

  function fire() {
    cancelAnimationFrame(powerRaf);
    powerWrap.classList.remove('cp-putt-power-active');
    const v = MIN_LAUNCH + (powerLevel / 100) * (MAX_LAUNCH - MIN_LAUNCH);
    course.ball.vx = Math.cos(aimAngle) * v;
    course.ball.vy = Math.sin(aimAngle) * v;
    phase = 'flying';
    setPrompt('');
    updateHud();
    if (window.SFX) window.SFX.putt();
    flyRaf = requestAnimationFrame(stepFly);
  }

  function stepFly() {
    if (phase !== 'flying') return;
    physicsTick();
    draw();
    if (course.sunk) { onSunk(); return; }
    const sp = Math.hypot(course.ball.vx, course.ball.vy);
    if (sp < MIN_SPEED) {
      course.ball.vx = 0;
      course.ball.vy = 0;
      onStopped();
      return;
    }
    flyRaf = requestAnimationFrame(stepFly);
  }

  function onSunk() {
    phase = 'between';
    ballsSunk++;
    totalWon += perBall;
    updateHud();
    if (window.SFX) window.SFX.sink();
    setPrompt(`Sunk! +${perBall} coin${perBall === 1 ? '' : 's'}.`);
    setTimeout(() => {
      if (phase === 'between') nextBall();
    }, 850);
  }

  function onStopped() {
    phase = 'between';
    if (course) course.missCount = (course.missCount || 0) + 1;
    if (window.SFX) window.SFX.miss();
    const refreshComing = course && course.missCount >= COURSE_FAIL_LIMIT;
    setPrompt(refreshComing ? 'Missed — new course incoming.' : 'Missed.');
    setTimeout(() => {
      if (phase === 'between') nextBall();
    }, 700);
  }

  function finish() {
    phase = 'done';
    // Fold the bottom-row bonus (computed upstream) into the round's payout.
    if (bonusCoins > 0) totalWon += bonusCoins;
    updateHud();
    const parts = [`${ballsSunk}/${totalBalls} sunk`];
    if (bonusCoins > 0) parts.push(`+${bonusCoins}c bonus`);
    parts.push(`${totalWon} coin${totalWon === 1 ? '' : 's'}`);
    setPrompt(`Round over — ${parts.join(' · ')}.`);
    if (window.SFX) {
      if (totalWon > 0) window.SFX.win();
      else              window.SFX.loss();
    }
    closeBtn.hidden = false;
    closeBtn.focus();
  }

  // ====== PHYSICS ======

  function physicsTick() {
    const b = course.ball;

    // Hill: push if inside the disc.
    const dx = b.x - course.hill.x;
    const dy = b.y - course.hill.y;
    if (Math.hypot(dx, dy) < course.hill.r) {
      b.vx += course.hill.fx;
      b.vy += course.hill.fy;
    }

    b.vx *= FRICTION;
    b.vy *= FRICTION;

    // Substep motion so no single advance moves the ball more than ~0.6 *
    // BALL_R. Without this, a fast ball (per-tick distance > BALL_R*2) can
    // tunnel through a wall — the final position lands past the wall and the
    // push-out normal then points outward, shoving it further out of bounds.
    const motionSpeed = Math.hypot(b.vx, b.vy);
    const maxStepDist = BALL_R * 0.6;
    const numSteps = Math.max(1, Math.ceil(motionSpeed / maxStepDist));
    const dt = 1 / numSteps;

    for (let step = 0; step < numSteps; step++) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      for (let iter = 0; iter < 4; iter++) {
        let any = false;
        for (const w of course.walls) {
          const hit = collideCircleSegment(b.x, b.y, BALL_R, w.x1, w.y1, w.x2, w.y2);
          if (!hit) continue;
          b.x += hit.nx * hit.overlap;
          b.y += hit.ny * hit.overlap;
          const vn = b.vx * hit.nx + b.vy * hit.ny;
          if (vn < 0) {
            const newVn = -vn * WALL_RESTITUTION;
            b.vx += (newVn - vn) * hit.nx;
            b.vy += (newVn - vn) * hit.ny;
            if (window.SFX) window.SFX.wallHit();
          }
          any = true;
        }
        if (!any) break;
      }
    }

    // Safety clamp in case the ball escapes the polygon somehow.
    if (b.x < BALL_R) b.x = BALL_R;
    if (b.x > W - BALL_R) b.x = W - BALL_R;
    if (b.y < BALL_R) b.y = BALL_R;
    if (b.y > H - BALL_R) b.y = H - BALL_R;

    // Hole capture
    const hx = b.x - course.hole.x;
    const hy = b.y - course.hole.y;
    const distH = Math.hypot(hx, hy);
    const speed = Math.hypot(b.vx, b.vy);
    if (distH < HOLE_R + BALL_R * 0.3 && speed < SINK_SPEED) {
      course.sunk = true;
      b.x = course.hole.x;
      b.y = course.hole.y;
      b.vx = 0;
      b.vy = 0;
    } else if (distH < HOLE_R + BALL_R * 0.7 && speed < SINK_SPEED * 0.4) {
      // Faint lip nudge — only when already close AND slow. Was way too
      // magnetic before; balls drifting past 15+ pixels out got sucked in.
      b.vx -= (hx / Math.max(distH, 0.001)) * 0.08;
      b.vy -= (hy / Math.max(distH, 0.001)) * 0.08;
    }
  }

  // ====== INPUT ======

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (e.clientY - rect.top)  * (canvas.height / rect.height);
    if (phase === 'aim' || phase === 'aim-hold') {
      aimAngle = Math.atan2(mouseY - course.ball.y, mouseX - course.ball.x);
      draw();
    }
  }

  function onMouseDown(e) {
    if (phase === 'aim') {
      e.preventDefault();
      phase = 'aim-hold';
      // snap aim to current cursor immediately
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
      mouseY = (e.clientY - rect.top)  * (canvas.height / rect.height);
      aimAngle = Math.atan2(mouseY - course.ball.y, mouseX - course.ball.x);
      setPrompt('Drag to adjust — release to commit direction.');
      draw();
    } else if (phase === 'power') {
      fire();
    }
  }

  function onMouseUp() {
    if (phase === 'aim-hold') {
      enterPower();
    }
  }

  function onKey(e) {
    if (overlay.hidden) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (phase === 'aim' || phase === 'aim-hold') enterPower();
      else if (phase === 'power') fire();
    } else if (e.key === 'Enter' && !closeBtn.hidden) {
      closeOverlay();
    }
  }

  // ====== DRAW ======

  function draw() {
    if (!ctx) return;

    // Background: outside the corridor = scuffed hospital baseboard tile.
    const wallGrad = ctx.createLinearGradient(0, 0, 0, H);
    wallGrad.addColorStop(0, '#3a4a40');
    wallGrad.addColorStop(1, '#161e1a');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, W, H);
    // Faint tile grout lines on the wall area for the dingy feel.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let y = 0; y < H; y += 28) ctx.fillRect(0, y, W, 1);

    // Build a path for the corridor polygon so we can both clip and stroke it.
    function tracePoly() {
      const poly = course.polygon;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
    }

    // Felt inside the corridor polygon.
    ctx.save();
    tracePoly();
    ctx.clip();

    // Floor of the corridor — pale stained linoleum.
    const floorGrad = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
    floorGrad.addColorStop(0, '#c5d4be');
    floorGrad.addColorStop(1, '#7e9088');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, W, H);

    // Linoleum tile seams.
    ctx.fillStyle = 'rgba(40, 50, 40, 0.18)';
    for (let y = 0; y < H; y += 28) ctx.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 28) ctx.fillRect(x, 0, 1, H);
    // Random stains/scuffs.
    ctx.fillStyle = 'rgba(80, 50, 30, 0.10)';
    for (let i = 0; i < 6; i++) {
      const sx = (i * 113 + 47) % W;
      const sy = (i * 71 + 29) % H;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 18, 8, i, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hill (drawn inside the clip so it doesn't bleed onto the wood).
    const h = course.hill;
    const hg = ctx.createRadialGradient(
      h.x - h.fx * 40, h.y - h.fy * 40, 6,
      h.x, h.y, h.r,
    );
    hg.addColorStop(0, 'rgba(200, 230, 180, 0.32)');
    hg.addColorStop(1, 'rgba(20, 60, 40, 0.0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 240, 200, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.stroke();
    const arrowLen = h.r * 0.55;
    const ax = h.x + Math.cos(h.angle) * arrowLen;
    const ay = h.y + Math.sin(h.angle) * arrowLen;
    ctx.strokeStyle = 'rgba(240, 220, 160, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    drawArrowHead(ax, ay, h.angle, 8, 'rgba(240, 220, 160, 0.8)');

    ctx.restore();

    // Corridor frame: cream hospital baseboard trim, with a dried-blood stripe
    // sitting along the inside edge.
    tracePoly();
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 5;
    ctx.stroke();
    tracePoly();
    ctx.strokeStyle = '#8b2c2c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    tracePoly();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Hole
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(course.hole.x, course.hole.y, HOLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(course.hole.x, course.hole.y, HOLE_R + 2, 0, Math.PI * 2);
    ctx.stroke();
    // IV stand: pin-up pink flag on a chrome pole.
    ctx.strokeStyle = '#c8c8c0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(course.hole.x, course.hole.y - 1);
    ctx.lineTo(course.hole.x, course.hole.y - 20);
    ctx.stroke();
    ctx.fillStyle = '#d4536d';
    ctx.beginPath();
    ctx.moveTo(course.hole.x, course.hole.y - 20);
    ctx.lineTo(course.hole.x + 9, course.hole.y - 16);
    ctx.lineTo(course.hole.x, course.hole.y - 12);
    ctx.closePath();
    ctx.fill();

    // Aim guide — dashed preview while idle, solid while committing (mouse held)
    if (phase === 'aim' || phase === 'aim-hold') {
      const b = course.ball;
      const len = 70;
      const ex = b.x + Math.cos(aimAngle) * len;
      const ey = b.y + Math.sin(aimAngle) * len;
      if (phase === 'aim-hold') {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#fff6d8';
      } else {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 240, 200, 0.7)';
      }
      ctx.lineWidth = phase === 'aim-hold' ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowHead(ex, ey, aimAngle, 8, '#fff6d8');
    }

    // Ball — gauze-white pill with a faint red-cross mark.
    const b = course.ball;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(b.x + 1.5, b.y + 2, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
    bg.addColorStop(0, '#fffaf0');
    bg.addColorStop(1, '#d4c8a8');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    // Tiny red cross on the ball.
    ctx.strokeStyle = '#b8001f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x - 3, b.y); ctx.lineTo(b.x + 3, b.y);
    ctx.moveTo(b.x, b.y - 3); ctx.lineTo(b.x, b.y + 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawArrowHead(x, y, angle, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(angle - 0.4) * size, y - Math.sin(angle - 0.4) * size);
    ctx.lineTo(x - Math.cos(angle + 0.4) * size, y - Math.sin(angle + 0.4) * size);
    ctx.closePath();
    ctx.fill();
  }

  // ====== HUD ======

  function setPrompt(text) {
    if (promptEl) promptEl.textContent = text;
  }

  function updateHud() {
    if (ballEl)   ballEl.textContent   = `${Math.min(ballIdx, totalBalls)} / ${totalBalls}`;
    if (strokeEl) strokeEl.textContent = bonusPct > 0 ? `+${bonusPct}% (${bonusCoins}c)` : '—';
    if (payoutEl) payoutEl.textContent = `${perBall}c`;
    if (wonEl)    wonEl.textContent    = `${totalWon}c`;
    if (multEl)   multEl.textContent   = `×${valueMult}`;
  }

  window.CrapsPutt = { show };
})();
