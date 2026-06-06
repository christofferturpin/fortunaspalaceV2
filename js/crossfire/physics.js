/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CROSSFIRE PHYSICS  —  circle-collider puck w/ spin (renders as square)  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   The puck *moves* like a disc (circle-circle collision @ PUCK_R) but    │
  │   *renders* as a rotating square with a bearing inside. Off-center hits  │
  │   transfer angular velocity via the grazing (tangent) component of the   │
  │   marble's velocity — a frictional model, not OBB physics.               │
  │                                                                          │
  │   stepWorld(world, dt) ──► mutates world.marbles + world.puck            │
  │      │                                                                   │
  │      ├─ integrate(m, dt)            ── pos += vel*dt, life += dt         │
  │      ├─ wallBounceSides(m, W)       ── side-wall reflect                 │
  │      ├─ marbleVsPuck(m, puck)       ── circle collision; linear push     │
  │      │                                 along normal + spin from          │
  │      │                                 cross(n, marble.v) (friction)     │
  │      ├─ integratePuck(puck, dt)     ── pos, angle, lin & ang drag        │
  │      ├─ puckWallBounce(puck, W)     ── side walls + random ang kick      │
  │      ├─ updateBearing(puck, dt)     ── inner ball slides from puck       │
  │      │                                 accel + centrifugal from ω        │
  │      └─ goalCheck(puck, W, H)       ── top/bottom edges (using PUCK_R)   │
  │                                                                          │
  │   Exports (window.CFPhysics): { stepWorld, makeMarble, makePuck,         │
  │                       MARBLE_R, PUCK_HALF, PUCK_R, MARBLE_SPEED }        │
  │   External deps: none (pure math)                                        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  MARBLE_R=11; PUCK_HALF=28 (visual); PUCK_R=32 (collider — moves like a disc)
  MARBLE_SPEED=820; MAX_LIFE=4.0s
  PUCK_MASS=8; PUCK_INERTIA=900; IMPULSE_GAIN=3.2 (vDotN/mass*GAIN); SPIN_GAIN=0.045 (cross(n,m.v)→angVel)
  PUCK_DRAG=0.40/s; PUCK_ANG_DRAG=0.55/s; BEARING_R=8; BEARING_DAMP=0.20/s
  goals: entire top→'player'; entire bottom→'ai' (using PUCK_R)
  makeMarble(x,y,angle,owner)→{x,y,vx,vy,r,life,owner,dead}
  makePuck(x,y)→{x,y,vx,vy,angle,angVel,half,mass,inertia,prevVX,prevVY,bearing:{lx,ly,lvx,lvy,r}}
  marbleVsPuck(m,p):
    circle-circle collision @ rs=m.r+PUCK_R; n=(p-m)/d; vDotN=m.v·n; vDotN<=0→consume marble;
    impulse = vDotN/p.mass*IMPULSE_GAIN → p.v += n*impulse
    cross = n.x*m.vy - n.y*m.vx (grazing direction) → p.angVel += cross*SPIN_GAIN
    separate by overlap; m.dead=T
  side walls: ARCS bulging into field by SAGITTA=70 at midline (R≈860 from chord L=680).
    LEFT_CX = WALL_INSET - (R - SAGITTA); rightCX(W) = W - WALL_INSET + (R - SAGITTA); ARC_CY = midline.
    Field is OUTSIDE the arc circle (d > R). Marble/puck collide when d < R+r; reflect along radial normal.
    In back areas (y outside play field), walls revert to straight chord x=WALL_INSET/x=W-WALL_INSET.
  arcBounce(b,r,cx,cy,R,e): d=hypot(b-c); d<R+r → n=(b-c)/d; vDotN<0 → v -= (1+e)*vDotN*n; reposition at d=R+r
  wallBounceSides(m,W): y∈[PLAY_TOP,PLAY_BOTTOM] → arcBounce(left)+arcBounce(right); else straight chord clamp
  puckWallBounce(p,W): arcBounce on both sides; if hit → angVel += rnd kick
  updateBearing(p,dt): local-frame: bearing.v -= (p.linear accel rotated to local)*dt + centrifugal ω²·b.l*dt + tangential ω·perp(b.l)*0.5*dt; damp; bounce interior [-h+r, h-r]
  goalCheck(p): entire puck past goal line (trailing edge across) → 'player'/'ai'; else null.
*/
(function () {
  var MARBLE_R = 11;
  var PUCK_HALF = 28;          // visual half-side of the square
  var PUCK_R = 32;             // collider radius (slightly inside the corners)
  var MARBLE_SPEED = 820;
  var MAX_LIFE = 4.0;
  var PUCK_MASS = 8;
  var PUCK_INERTIA = 900;      // low → easy to spin
  var IMPULSE_GAIN = 3.2;      // linear push (same units as pre-square build)
  var SPIN_GAIN = 0.045;       // tangential-velocity → angVel (friction at contact)
  var PUCK_DRAG_PER_SEC = 0.40;
  var PUCK_ANG_DRAG_PER_SEC = 0.55;
  var BEARING_R = 8;
  var BEARING_DAMP_PER_SEC = 0.20;
  // Play field is inset from the canvas edges so guns can sit BEHIND the
  // goal lines and shoot wide enough to reach their own back corners.
  var PLAY_TOP = 60;
  var PLAY_BOTTOM = 840;
  // Minimum forward velocity (px/s) for the puck's leading edge to "cross"
  // the goal. Sitting on the line with no shove → no goal until pushed.
  var MIN_GOAL_VEL = 35;
  // Side walls are arcs (nearly-circular). The chord runs vertically along
  // x=WALL_INSET / x=W-WALL_INSET between the goal lines. The arc bulges
  // into the field by SAGITTA px at the midline.
  var WALL_INSET = 6;
  var SAGITTA = 70;
  var ARC_CY = (PLAY_TOP + PLAY_BOTTOM) / 2;
  var ARC_L = PLAY_BOTTOM - PLAY_TOP;
  var ARC_R_VAL = (ARC_L * ARC_L + 4 * SAGITTA * SAGITTA) / (8 * SAGITTA);
  // Walls bulge outward: arc circle centers sit INSIDE the field, so the
  // playable area is INSIDE each circle (d ≤ R). The midline is the widest
  // part of the field; the goal lines are the narrowest.
  var LEFT_CX = WALL_INSET + ARC_R_VAL;
  function rightCX(W) { return (W - WALL_INSET) - ARC_R_VAL; }

  function makeMarble(x, y, angle, owner) {
    return {
      x: x, y: y,
      vx: Math.cos(angle) * MARBLE_SPEED,
      vy: Math.sin(angle) * MARBLE_SPEED,
      r: MARBLE_R,
      life: 0,
      owner: owner,
      kind: 'marble',
      dead: false
    };
  }

  var LASER_SPEED = 1400;   // notional projectile speed used for impulse math
  var LASER_ZIP = 0.07;     // travel time (s) from origin to target — the "zip"
  var LASER_TTL = 0.55;     // total beam lifetime (zip + fade) (s)

  // Fire a laser from (originX, originY) along aimAngle. Computes the puck
  // impact (if any) NOW, but defers applying impulse until the beam visually
  // reaches the target. The render layer animates the beam extending out,
  // then fading after impact.
  function fireLaser(world, originX, originY, aimAngle, owner) {
    var puck = world.puck;
    var dx = Math.cos(aimAngle);
    var dy = Math.sin(aimAngle);
    var px = originX - puck.x;
    var py = originY - puck.y;
    var b = px * dx + py * dy;
    var c = px * px + py * py - PUCK_R * PUCK_R;
    var disc = b * b - c;
    var hitX, hitY;
    var nx = 0, ny = 0, willHit = false;
    if (disc >= 0) {
      var t = -b - Math.sqrt(disc);
      if (t > 0) {
        hitX = originX + dx * t;
        hitY = originY + dy * t;
        nx = (puck.x - hitX) / PUCK_R;
        ny = (puck.y - hitY) / PUCK_R;
        willHit = true;
      }
    }
    if (!willHit) {
      hitX = originX + dx * 2000;
      hitY = originY + dy * 2000;
    }
    if (!world.lasers) world.lasers = [];
    world.lasers.push({
      x1: originX, y1: originY,
      x2: hitX,    y2: hitY,
      dx: dx, dy: dy,
      nx: nx, ny: ny,
      willHit: willHit,
      applied: false,
      owner: owner,
      age: 0,
      zip: LASER_ZIP,
      ttl: LASER_TTL
    });
  }

  // Apply the deferred impulse once a laser's beam reaches the target.
  function applyLaserHit(L, puck) {
    if (L.applied || !L.willHit) { L.applied = true; return; }
    L.applied = true;
    var vDotN = (L.dx * L.nx + L.dy * L.ny) * LASER_SPEED;
    if (vDotN <= 0) return;
    var ownerMul = L.owner === 'player' ? 1.15 : 1.0;
    var impulse = vDotN / puck.mass * IMPULSE_GAIN * ownerMul;
    puck.vx += L.nx * impulse;
    puck.vy += L.ny * impulse;
    var cross = L.nx * L.dy - L.ny * L.dx;
    puck.angVel += cross * LASER_SPEED * SPIN_GAIN;
  }

  function makePuck(x, y) {
    return {
      x: x, y: y,
      vx: 0, vy: 0,
      angle: 0,
      angVel: 0,
      half: PUCK_HALF,
      mass: PUCK_MASS,
      inertia: PUCK_INERTIA,
      prevVX: 0, prevVY: 0,
      bearing: { lx: 0, ly: 0, lvx: 0, lvy: 0, r: BEARING_R }
    };
  }

  // Bounce a body of radius `r` off an outward-bulging arc wall whose circle
  // is centered at (cx, cy) with radius arcR. The playable field is INSIDE
  // the circle, so the body must stay within d ≤ arcR - r from the center.
  function arcBounce(b, r, cx, cy, arcR, restitution) {
    var dx = b.x - cx;
    var dy = b.y - cy;
    var d2 = dx * dx + dy * dy;
    var maxD = arcR - r;
    if (d2 <= maxD * maxD) return false;
    var d = Math.sqrt(d2) || 0.0001;
    // Wall normal points from the body BACK toward the arc center (into field).
    var nx = -dx / d, ny = -dy / d;
    var vDotN = b.vx * nx + b.vy * ny;
    if (vDotN < 0) {
      b.vx -= (1 + restitution) * vDotN * nx;
      b.vy -= (1 + restitution) * vDotN * ny;
    }
    b.x = cx + (dx / d) * maxD;
    b.y = cy + (dy / d) * maxD;
    return true;
  }

  function wallBounceSides(m, W) {
    // Arc walls span the full canvas height; no back-area straight fallback.
    var hitL = arcBounce(m, m.r, LEFT_CX,    ARC_CY, ARC_R_VAL, 0.9);
    var hitR = arcBounce(m, m.r, rightCX(W), ARC_CY, ARC_R_VAL, 0.9);
    if ((hitL || hitR) && window.CFSfx) window.CFSfx.wallHit();
  }

  // Marble vs puck — collider is a CIRCLE (so it moves like a disc), but the
  // puck looks square and we still compute spin from the tangential component
  // of the impact, as if there were friction at the contact point.
  function marbleVsPuck(m, p) {
    var dx = p.x - m.x;
    var dy = p.y - m.y;
    var d2 = dx * dx + dy * dy;
    var rs = m.r + PUCK_R;
    if (d2 >= rs * rs) return;
    var d = Math.sqrt(d2) || 0.0001;
    var nx = dx / d, ny = dy / d;            // normal: marble → puck
    var vDotN = m.vx * nx + m.vy * ny;
    if (vDotN <= 0) { m.dead = true; return; }
    // linear push along the normal — player shots carry a little extra weight
    var ownerMul = m.owner === 'player' ? 1.15 : 1.0;
    var impulse = vDotN / p.mass * IMPULSE_GAIN * ownerMul;
    p.vx += nx * impulse;
    p.vy += ny * impulse;
    if (window.CFSfx) window.CFSfx.puckHit(vDotN);
    // spin: friction at contact. Tangent points perpendicular to n.
    // The sign of the cross product (n × v) tells us which way it grazes.
    var cross = nx * m.vy - ny * m.vx;       // scalar z-cross in 2D
    p.angVel += cross * SPIN_GAIN;
    // separate so the puck doesn't sit on the marble
    var overlap = rs - d;
    p.x += nx * overlap;
    p.y += ny * overlap;
    // impact burst at the contact point on the puck's surface
    if (!w_currentWorld.bursts) w_currentWorld.bursts = [];
    w_currentWorld.bursts.push({
      x: p.x - nx * PUCK_R,
      y: p.y - ny * PUCK_R,
      age: 0,
      ttl: 0.28,
      maxR: 22,
      owner: m.owner
    });
    m.dead = true;
  }

  function integratePuck(p, dt) {
    p.prevVX = p.vx; p.prevVY = p.vy;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.angVel * dt;
    var d = Math.pow(PUCK_DRAG_PER_SEC, dt);
    var dA = Math.pow(PUCK_ANG_DRAG_PER_SEC, dt);
    p.vx *= d; p.vy *= d;
    p.angVel *= dA;
  }

  function puckWallBounce(p, W) {
    // Puck only ever lives within the play field, so always use the arcs.
    var hitL = arcBounce(p, PUCK_R, LEFT_CX,    ARC_CY, ARC_R_VAL, 0.85);
    var hitR = arcBounce(p, PUCK_R, rightCX(W), ARC_CY, ARC_R_VAL, 0.85);
    if (hitL || hitR) p.angVel += (Math.random() - 0.5) * 4;
  }

  // Inner ball bearing — local-frame physics with pseudo-forces from the
  // puck's linear accel (drags opposite) and angular velocity (centrifugal).
  // Purely cosmetic; doesn't feed back on the puck.
  function updateBearing(p, dt) {
    if (dt <= 0) return;
    var b = p.bearing;
    // puck linear acceleration in world (use vel delta)
    var ax = (p.vx - p.prevVX) / dt;
    var ay = (p.vy - p.prevVY) / dt;
    // rotate accel into local frame
    var cosA = Math.cos(p.angle), sinA = Math.sin(p.angle);
    var laX =  cosA * ax + sinA * ay;
    var laY = -sinA * ax + cosA * ay;
    // pseudo-force on bearing is opposite of frame accel
    b.lvx += -laX * dt;
    b.lvy += -laY * dt;
    // centrifugal — outward from local origin, scaled by ω²
    var w2 = p.angVel * p.angVel;
    b.lvx += b.lx * w2 * dt;
    b.lvy += b.ly * w2 * dt;
    // tangential pull from angular accel
    b.lvx += -b.ly * p.angVel * 0.5 * dt;
    b.lvy +=  b.lx * p.angVel * 0.5 * dt;
    // integrate
    b.lx += b.lvx * dt;
    b.ly += b.lvy * dt;
    // damp
    var damp = Math.pow(BEARING_DAMP_PER_SEC, dt);
    b.lvx *= damp; b.lvy *= damp;
    // bounce off interior walls
    var lim = p.half - b.r - 2;
    if (b.lx < -lim) { b.lx = -lim; b.lvx = -b.lvx * 0.6; }
    if (b.lx >  lim) { b.lx =  lim; b.lvx = -b.lvx * 0.6; }
    if (b.ly < -lim) { b.ly = -lim; b.lvy = -b.lvy * 0.6; }
    if (b.ly >  lim) { b.ly =  lim; b.lvy = -b.lvy * 0.6; }
  }

  function goalCheck(p, shift) {
    // Puck must be ENTIRELY past the (possibly-collapsed) goal line.
    var s = shift || 0;
    if (p.y + PUCK_R < PLAY_TOP + s)    return 'player';
    if (p.y - PUCK_R > PLAY_BOTTOM - s) return 'ai';
    return null;
  }

  var w_currentWorld = null;
  function stepWorld(w, dt) {
    w_currentWorld = w;
    var W = w.width, H = w.height;
    var marbles = w.marbles;
    var puck = w.puck;
    for (var i = 0; i < marbles.length; i++) {
      var m = marbles[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life += dt;
      wallBounceSides(m, W);
      if (m.life > MAX_LIFE || m.y < -20 || m.y > H + 20) m.dead = true;
      if (!m.dead) marbleVsPuck(m, puck);
    }
    integratePuck(puck, dt);
    puckWallBounce(puck, W);
    updateBearing(puck, dt);
    var winner = goalCheck(puck, w.goalShiftPx);
    var alive = [];
    for (var j = 0; j < marbles.length; j++) if (!marbles[j].dead) alive.push(marbles[j]);
    w.marbles = alive;
    if (w.bursts && w.bursts.length) {
      var liveB = [];
      for (var bi = 0; bi < w.bursts.length; bi++) {
        w.bursts[bi].age += dt;
        if (w.bursts[bi].age < w.bursts[bi].ttl) liveB.push(w.bursts[bi]);
      }
      w.bursts = liveB;
    }
    if (w.lasers && w.lasers.length) {
      var liveLasers = [];
      for (var k = 0; k < w.lasers.length; k++) {
        var L = w.lasers[k];
        L.age += dt;
        if (!L.applied && L.age >= L.zip) applyLaserHit(L, puck);
        if (L.age < L.ttl) liveLasers.push(L);
      }
      w.lasers = liveLasers;
    }
    return winner;
  }

  window.CFPhysics = {
    stepWorld: stepWorld,
    makeMarble: makeMarble,
    fireLaser: fireLaser,
    makePuck: makePuck,
    MARBLE_R: MARBLE_R,
    PUCK_HALF: PUCK_HALF,
    PUCK_R: PUCK_R,
    MARBLE_SPEED: MARBLE_SPEED,
    PLAY_TOP: PLAY_TOP,
    PLAY_BOTTOM: PLAY_BOTTOM,
    WALL_INSET: WALL_INSET,
    SAGITTA: SAGITTA,
    ARC_CY: ARC_CY,
    ARC_R: ARC_R_VAL,
    LEFT_CX: LEFT_CX,
    rightCX: rightCX
  };
})();
