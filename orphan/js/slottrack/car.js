/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SLOTTRACK CAR — one-button slot car on the auto-generated track         │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ STTrack.onGenerate(reset)  (regen → respawn) │
  │                          ├─ bind #st-throttle (mouse/touch) + Space key  │
  │                          ├─ bind #st-brake (mouse/touch) + Shift key     │
  │                          ├─ reset() ──► s=0, v=0, !airborne, !crashed    │
  │                          └─ RAF loop: step(t)                            │
  │                                                                          │
  │   step(t) — one of two regimes:                                          │
  │     ON-TRACK:                                                            │
  │       v += throttle?ACCEL:0; v -= (brake?BRAKE_DECEL:0)+FRICTION         │
  │       v∈[0,V_MAX]; s += v·dt; cent = v²·κ(s)                             │
  │       cent>SPARK_CENT → stress fills (overload·STRESS_FILL·ramp); else   │
  │         drains. sparks count scales with stress AND overload.            │
  │       car body leans into corners ∝ cent (LEAN_REF_CENT saturates);      │
  │         drifts outward ∝ stress (understeer); small residual shake.      │
  │       stress reaches 1 → airborne, eject tangentially with v             │
  │     AIRBORNE:                                                            │
  │       avy += GRAVITY; avx *= (1-AIR_DRAG); pos += vel; trail sparks      │
  │       off-viewbox + buffer → crashed (throttle press → respawn)          │
  │     GHOST (every frame while raceActive):                                │
  │       lookAhead κ → ideal v = √(GHOST_TARGET_CENT/κ); approach via       │
  │       GHOST_ACCEL / GHOST_BRAKE; cap = idealV · ghostSpeedMul (SABOTAGE);│
  │       advance ghostS; on wraparound, ghostLaps += 1.                     │
  │                                                                          │
  │   RACE FLOW (bet → spin → arm → throttle starts → settle):               │
  │     startRace(bet): Wallet.spend(bet); clear lives/debuff/laps;          │
  │       STSlot.spinAll() (fires addLives + setGhostDebuff via onMatch);    │
  │       if lives==0 → 'NO LIVES — bet lost'; else raceArmed=true.          │
  │     setThrottle(true) edge while raceArmed → raceActive=true, raceArmed= │
  │       false. The ghost starts moving and laps begin counting.            │
  │   On respawn (throttle press while crashed with lives>0): reset(true)    │
  │     restarts the race from the start line — both player AND ghost back   │
  │     to s=0, lap counters zeroed, race stays active, lives now -1.        │
  │     checkRaceEnd: playerLaps≥RACE_LAPS → endRace(true);                  │
  │       ghostLaps≥RACE_LAPS → endRace(false,'OUTPACED');                   │
  │       lives≤0 && crashed → endRace(false,'WRECKED').                     │
  │     endRace(won): if won → multiplier = WIN_PAYOUT + lives_remaining;    │
  │       Wallet.add(bet·multiplier). Else bet kept by house. raceActive=    │
  │       false; message shown in #st-bet-status.                            │
  │                                                                          │
  │   Exports (window.STCar):                                                │
  │     { init, reset, addLives, setGhostDebuff, startRace }                 │
  │   External deps: STTrack (onGenerate hook); STSlot (spinAll); Wallet.    │
  │   Called by STSlot.onMatch: addLives(n) and setGhostDebuff(r).           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ACCEL=250, FRICTION=80, BRAKE_DECEL=240, V_MAX=320; SPARK_CENT=200, STRESS_REF_CENT=500
  STRESS_FILL=2.4, STRESS_RAMP=0.9, STRESS_DRAIN=0.7; SHAKE_START=0.15, MAX_SHAKE=3px, MAX_SHAKE_DEG=3°
  MAX_LEAN_DEG=18°, LEAN_REF_CENT=700, SLIDE_MAX=16px
  GHOST_TARGET_CENT=600, GHOST_ACCEL=220, GHOST_BRAKE=380, GHOST_MIN_V=60, GHOST_MAX_V_FRAC=0.93
  STARTING_LIVES=0, MAX_LIVES=9; RACE_LAPS=1, WIN_PAYOUT=2
  GRAVITY=500, AIR_DRAG=0.4; SPARK_LIFE=0.55; CRASH_BUFFER=80; W=1300,H=500
  state: path,pathLen, s,v, throttle,brake, stress∈[0,1], airborne,crashed, ax,ay,avx,avy, heading, sparks[], ghostS,ghostV, ghostSpeedMul, lives, raceActive, raceArmed, raceBet, playerLaps, ghostLaps, raceMessage, lastT, raf
  setBrake(on): brake=on
  addLives(n): lives=min(MAX_LIVES, lives+n); updateStatus
  setGhostDebuff(r∈[0,1]): ghostSpeedMul=1-r; updateStatus  // 0.20=wrench, 0.40=gear, 0.60=wheel
  startRace(bet): Wallet.spend(bet)||abort; clear lives/debuff/laps; STSlot.spinAll; lives≤0→bet lost; else reset positions, raceActive=T
  endRace(won): raceActive=F; won→mul=WIN_PAYOUT+lives; Wallet.add(bet·mul); set raceMessage
  checkRaceEnd: playerLaps≥RACE_LAPS→endRace(T); ghostLaps≥RACE_LAPS→endRace(F,'OUTPACED'); lives≤0&&crashed→endRace(F,'WRECKED')
  airborne→crashed: lives-- only when raceActive (practice mode is free)
  setThrottle: respawn allowed if !raceActive || lives>0; ghost step only runs while raceActive
  pointAt(s)→{x,y}: path.getPointAtLength(mod(s,pathLen))
  tangentAt(s,ds=2)→{x,y}: pointAt(s+ds) - pointAt(s-ds)
  curvatureAt(s,ds=5)→num: a1=atan2(p1-p0); a2=atan2(p2-p1); |Δa wrapped to ±π| / (2·ds)
  emitSpark(x,y,tx,ty): perpendicular spray @ rnd∈[120,220] + slight back-drift; life=SPARK_LIFE·rnd[0.7..1]
  stepOnTrack(dt): throttle→v+=ACCEL·dt; brake→v-=BRAKE_DECEL·dt; v-=FRICTION·dt; clamp v∈[0,V_MAX]; s=mod(s+v·dt,pathLen); cent=v²κ; cent>SPARK_CENT→fillRate=STRESS_FILL·(1+STRESS_RAMP·stress); stress+=overload·fillRate·dt else stress-=STRESS_DRAIN·dt; clamp stress∈[0,1]; spark count=1+⌊stress·4⌋+⌊overload·2⌋; stress≥1→airborne
  stepAirborne(dt): avy+=GRAVITY; avx*=(1-AIR_DRAG·dt); pos+=vel·dt; trail; out-of-bounds → crashed=T,airborne=F
  stepSparks(dt): ∀sp.life-=dt; advance; gravity·0.3; drop dead
  step(t): dt=clamp(0,0.05); airborne?stepAirborne:!crashed?stepOnTrack:noop; stepSparks; renderAll; RAF
  renderCar(): airborne||crashed → use ax,ay,atan2(avy,avx); else → sample pPrev,p,pNext at ±ds; tangent=pNext-pPrev; cross=(p-pPrev)×(pNext-p); turnSign=sign(cross); leanDeg=turnSign·MAX_LEAN_DEG·min(1,cent/LEAN_REF_CENT); outward=turnSign·(ty,-tx)/|t|; slide=stress·SLIDE_MAX; small residual shake (≤MAX_SHAKE,MAX_SHAKE_DEG) past SHAKE_START; transform=`translate(x+out·slide+jit, y+out·slide+jit) rotate(headingDeg+leanDeg+wobble)`; fill ramps amber→red w/ stress
  stepGhost(dt): lookAhead=30+ghostV·0.35; kMax=max(κ(ghostS),κ(ghostS+look)); idealV=√(GHOST_TARGET_CENT/kMax); cap=min(idealV,V_MAX·GHOST_MAX_V_FRAC); approach cap @ GHOST_ACCEL or GHOST_BRAKE; clamp ≥GHOST_MIN_V; ghostS=(ghostS+ghostV·dt)%pathLen
  renderGhost(): #st-ghost.transform = `translate(p.x,p.y) rotate(headingDeg+leanDeg)` (no shake/slide on AI)
  renderSparks(): rebuild #st-spark-layer with <circle> per spark; opacity=life/SPARK_LIFE
  updateStatus(): #st-car-info.text = on-track ? `v=X grip[████····] N%` : airborne ? 'AIRBORNE' : 'CRASHED — hold THROTTLE'
  setThrottle(on): crashed&&on→reset; throttle=on
  setBrake(on): brake=on
  reset(): path=#st-track-path; pathLen=getTotalLength; s=0;v=0; stress=0; airborne=F;crashed=F; sparks=[]; ghostS=0;ghostV=0; render
  init(): bind #st-throttle (mouse/touch) + Space; bind #st-brake (mouse/touch) + Shift; STTrack?.onGenerate(reset); reset; RAF(step)
  exports: global.STCar={init,reset}; on DOMContentLoaded→init
*/
(function (global) {
  const ACCEL = 250;
  const FRICTION = 80;
  const BRAKE_DECEL = 240;       // softer brake — momentum matters
  const V_MAX = 320;
  const SPARK_CENT = 200;       // centripetal load where sparks/stress begin
  const STRESS_REF_CENT = 500;  // overload saturates at SPARK_CENT + this (much sooner)
  const STRESS_FILL = 2.4;      // base fill rate at peak overload (stress=0)
  const STRESS_RAMP = 0.9;      // positive-feedback: fill rate ×= (1 + RAMP·stress)
  const STRESS_DRAIN = 0.7;     // 1/sec when under threshold
  const SHAKE_START = 0.15;     // stress level where visible shake begins
  const MAX_SHAKE = 3;          // px of position jitter at full stress (subtle now)
  const MAX_SHAKE_DEG = 3;      // degrees of random rotational wobble at full stress
  const MAX_LEAN_DEG = 18;      // signed body-yaw lean toward inside of corner
  const LEAN_REF_CENT = 700;    // centripetal load where lean saturates
  const SLIDE_MAX = 16;         // px of outward drift at full stress (understeer)
  const GHOST_TARGET_CENT = 600;
  const GHOST_ACCEL = 220;
  const GHOST_BRAKE = 380;
  const GHOST_MIN_V = 60;
  const GHOST_MAX_V_FRAC = 0.93;
  const STARTING_LIVES = 0;
  const MAX_LIVES = 9;
  const RACE_LAPS = 1;          // laps needed to win (sprint race)
  const WIN_PAYOUT = 2;         // payout multiplier on win (bet × 2)
  const GRAVITY = 500;
  const AIR_DRAG = 0.4;
  const SPARK_LIFE = 0.55;
  const CRASH_BUFFER = 80;
  const W = 1300;
  const H = 500;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let path = null;
  let pathLen = 0;
  let s = 0, v = 0;
  let throttle = false, brake = false;
  let airborne = false, crashed = false;
  let stress = 0;
  let ax = 0, ay = 0, avx = 0, avy = 0;
  let heading = 0;
  let sparks = [];
  let lastT = 0;
  let raf = 0;
  let ghostS = 0, ghostV = 0;
  let ghostSpeedMul = 1.0;
  let lives = STARTING_LIVES;
  let raceActive = false;
  let raceArmed = false;         // bet placed + slot hit; awaiting throttle press
  let raceBet = 0;
  let playerLaps = 0, ghostLaps = 0;
  let raceMessage = 'PLACE A BET TO RACE';

  function $(id) { return document.getElementById(id); }

  function pointAt(arc) {
    const a = ((arc % pathLen) + pathLen) % pathLen;
    return path.getPointAtLength(a);
  }

  function tangentAt(arc) {
    const ds = 2;
    const p1 = pointAt(arc - ds);
    const p2 = pointAt(arc + ds);
    return { x: p2.x - p1.x, y: p2.y - p1.y };
  }

  function curvatureAt(arc) {
    const ds = 5;
    const p0 = pointAt(arc - ds);
    const p1 = pointAt(arc);
    const p2 = pointAt(arc + ds);
    let da = Math.atan2(p2.y - p1.y, p2.x - p1.x)
           - Math.atan2(p1.y - p0.y, p1.x - p0.x);
    while (da >  Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return Math.abs(da) / (2 * ds);
  }

  function emitSpark(x, y, tx, ty) {
    const mag = Math.hypot(tx, ty) || 1;
    const ux = tx / mag, uy = ty / mag;
    const side = Math.random() < 0.5 ? -1 : 1;
    const perpX = -uy * side;
    const perpY =  ux * side;
    const speed = 120 + Math.random() * 100;
    const drift = (Math.random() - 0.5) * 0.6;
    const vx = perpX * speed + (-ux) * (40 + Math.random() * 40) + (Math.random() - 0.5) * 30;
    const vy = perpY * speed + (-uy) * (40 + Math.random() * 40) + drift * 30;
    sparks.push({
      x: x, y: y, vx: vx, vy: vy,
      life: SPARK_LIFE * (0.7 + Math.random() * 0.3)
    });
  }

  function stepOnTrack(dt) {
    if (throttle) v += ACCEL * dt;
    if (brake)    v -= BRAKE_DECEL * dt;
    v -= FRICTION * dt;
    if (v < 0) v = 0;
    if (v > V_MAX) v = V_MAX;
    s += v * dt;
    if (pathLen > 0) {
      while (s >= pathLen) {
        s -= pathLen;
        if (raceActive) playerLaps += 1;
      }
      if (s < 0) s = ((s % pathLen) + pathLen) % pathLen;
    }

    const k = curvatureAt(s);
    const cent = v * v * k;

    // stress: fills proportional to overload above SPARK_CENT, drains otherwise.
    // Positive feedback: the higher current stress is, the faster it climbs —
    // so the last quarter of the gauge slips away much faster than the first.
    if (cent > SPARK_CENT) {
      const overload = Math.min(1, (cent - SPARK_CENT) / STRESS_REF_CENT);
      const fillRate = STRESS_FILL * (1 + STRESS_RAMP * stress);
      stress += overload * fillRate * dt;
    } else {
      stress -= STRESS_DRAIN * dt;
    }
    if (stress < 0) stress = 0;
    if (stress > 1) stress = 1;

    if (cent > SPARK_CENT || stress > 0.05) {
      const p = pointAt(s);
      const tg = tangentAt(s);
      const overload = Math.max(0, Math.min(1, (cent - SPARK_CENT) / STRESS_REF_CENT));
      const count = 1 + Math.floor(stress * 4) + Math.floor(overload * 2);
      for (let i = 0; i < count; i++) emitSpark(p.x, p.y, tg.x, tg.y);
    }

    if (stress >= 1) {
      const p = pointAt(s);
      const tg = tangentAt(s);
      const mag = Math.hypot(tg.x, tg.y) || 1;
      airborne = true;
      ax = p.x; ay = p.y;
      avx = (tg.x / mag) * v;
      avy = (tg.y / mag) * v;
    }
  }

  function stepAirborne(dt) {
    avy += GRAVITY * dt;
    const k = 1 - AIR_DRAG * dt;
    avx *= k;
    ax += avx * dt;
    ay += avy * dt;

    if (Math.random() < 0.5) emitSpark(ax, ay, avx, avy);

    if (ax < -CRASH_BUFFER || ax > W + CRASH_BUFFER ||
        ay < -CRASH_BUFFER || ay > H + CRASH_BUFFER) {
      crashed = true;
      airborne = false;
      if (raceActive && lives > 0) lives -= 1;
    }
  }

  function stepGhost(dt) {
    if (!path || pathLen <= 0 || !raceActive) return;
    // Look ahead so the ghost brakes into corners it can see coming.
    const lookAhead = 30 + ghostV * 0.35;
    const kAhead = curvatureAt(ghostS + lookAhead);
    const kNow   = curvatureAt(ghostS);
    const kMax   = Math.max(kAhead, kNow, 0.0005);
    const idealV = Math.sqrt(GHOST_TARGET_CENT / kMax);
    // Sabotage slot reduces the ghost's effective top speed.
    const capV   = Math.min(idealV, V_MAX * GHOST_MAX_V_FRAC) * ghostSpeedMul;
    if (ghostV < capV) ghostV = Math.min(capV, ghostV + GHOST_ACCEL * dt);
    else               ghostV = Math.max(capV, ghostV - GHOST_BRAKE * dt);
    const minV = GHOST_MIN_V * ghostSpeedMul;
    if (ghostV < minV) ghostV = minV;
    ghostS += ghostV * dt;
    while (ghostS >= pathLen) {
      ghostS -= pathLen;
      if (raceActive) ghostLaps += 1;
    }
  }

  function renderGhost() {
    const ghost = $('st-ghost');
    if (!ghost || !path || pathLen <= 0) return;
    const ds = 4;
    const pPrev = pointAt(ghostS - ds);
    const p     = pointAt(ghostS);
    const pNext = pointAt(ghostS + ds);
    const tx = pNext.x - pPrev.x;
    const ty = pNext.y - pPrev.y;
    const cross = (p.x - pPrev.x) * (pNext.y - p.y)
                - (p.y - pPrev.y) * (pNext.x - p.x);
    const turnSign = cross > 0 ? 1 : (cross < 0 ? -1 : 0);
    const k = curvatureAt(ghostS);
    const cent = ghostV * ghostV * k;
    const leanT = Math.min(1, cent / LEAN_REF_CENT);
    const leanDeg = turnSign * MAX_LEAN_DEG * leanT;
    const deg = Math.atan2(ty, tx) * 180 / Math.PI + leanDeg;
    ghost.setAttribute('transform',
      'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')');
  }

  function stepSparks(dt) {
    const next = [];
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      sp.life -= dt;
      if (sp.life <= 0) continue;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += GRAVITY * 0.3 * dt;
      next.push(sp);
    }
    sparks = next;
  }

  function step(t) {
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastT = t;

    if (airborne)         stepAirborne(dt);
    else if (!crashed)    stepOnTrack(dt);

    stepGhost(dt);
    stepSparks(dt);
    checkRaceEnd();
    renderCar();
    renderGhost();
    renderSparks();
    updateStatus();

    raf = requestAnimationFrame(step);
  }

  function renderCar() {
    const car = $('st-car');
    if (!car) return;
    let x, y, deg;
    if (airborne || crashed) {
      x = ax; y = ay;
      heading = Math.atan2(avy, avx);
      deg = heading * 180 / Math.PI;
    } else {
      const ds = 5;
      const pPrev = pointAt(s - ds);
      const p     = pointAt(s);
      const pNext = pointAt(s + ds);
      const tx = pNext.x - pPrev.x;
      const ty = pNext.y - pPrev.y;
      const tmag = Math.hypot(tx, ty) || 1;
      heading = Math.atan2(ty, tx);

      // Curve direction (cross product of consecutive tangents)
      const cross = (p.x - pPrev.x) * (pNext.y - p.y)
                  - (p.y - pPrev.y) * (pNext.x - p.x);
      const turnSign = cross > 0 ? 1 : (cross < 0 ? -1 : 0);
      const k = curvatureAt(s);
      const cent = v * v * k;

      // Deterministic lean — body yaws into the corner, scales with cent.
      const leanT = Math.min(1, cent / LEAN_REF_CENT);
      const leanDeg = turnSign * MAX_LEAN_DEG * leanT;

      // Outward drift (understeer) — scales with stress so it shows when fighting.
      const outX =  turnSign * (ty / tmag);
      const outY = -turnSign * (tx / tmag);
      const slideAmt = stress * SLIDE_MAX;

      // A tiny residual shake on top of the deterministic motion.
      const shakeT = Math.max(0, (stress - SHAKE_START) / (1 - SHAKE_START));
      const shakeAmp = shakeT * MAX_SHAKE;
      const angleWobble = (Math.random() - 0.5) * 2 * MAX_SHAKE_DEG * shakeT;

      x = p.x + outX * slideAmt + (Math.random() - 0.5) * 2 * shakeAmp;
      y = p.y + outY * slideAmt + (Math.random() - 0.5) * 2 * shakeAmp;
      deg = heading * 180 / Math.PI + leanDeg + angleWobble;
    }
    car.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')');
    const body = car.querySelector('.st-car-body');
    if (body) {
      // Colour ramps from amber → red as stress climbs, so the car visibly
      // "heats" before flying off.
      let fill;
      if (crashed)        fill = '#888';
      else if (airborne)  fill = '#c33';
      else if (stress > SHAKE_START) {
        const t = Math.min(1, (stress - SHAKE_START) / (1 - SHAKE_START));
        const r = Math.round(0xff);
        const g = Math.round(0xd2 * (1 - t) + 0x55 * t);
        const b = Math.round(0x4a * (1 - t) + 0x22 * t);
        fill = 'rgb(' + r + ',' + g + ',' + b + ')';
      } else {
        fill = '#ffd24a';
      }
      body.setAttribute('fill', fill);
    }
  }

  function renderSparks() {
    const layer = $('st-spark-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', sp.x.toFixed(1));
      c.setAttribute('cy', sp.y.toFixed(1));
      c.setAttribute('r', 2.4);
      c.setAttribute('fill', '#ffb030');
      c.setAttribute('opacity', Math.max(0, sp.life / SPARK_LIFE).toFixed(2));
      layer.appendChild(c);
    }
  }

  function updateStatus() {
    const info = $('st-car-info');
    const betStatus = $('st-bet-status');

    if (info) {
      let drive;
      if (raceArmed)                                   drive = 'READY — hit THROTTLE/Space to GO';
      else if (raceActive && crashed && lives <= 0)    drive = 'WRECKED — out of lives';
      else if (crashed)                                drive = 'CRASHED — hold THROTTLE to respawn';
      else if (airborne)                               drive = 'AIRBORNE';
      else if (raceActive) {
        const pct    = Math.round(stress * 100);
        const filled = Math.round(stress * 20);
        const bar    = '█'.repeat(filled) + '·'.repeat(20 - filled);
        drive = 'ON TRACK  v=' + Math.round(v) + '  grip [' + bar + '] ' + (100 - pct) + '%';
      } else {
        drive = '— IDLE — place a bet to race —';
      }

      if (raceActive || raceArmed) {
        const lapStr = raceActive
          ? '  laps ' + playerLaps + '/' + RACE_LAPS + ' (ghost ' + ghostLaps + '/' + RACE_LAPS + ')'
          : '';
        const livesStr  = '  lives:' + lives;
        const debuffStr = ghostSpeedMul < 1
          ? '  ghost@' + Math.round(ghostSpeedMul * 100) + '%'
          : '';
        info.textContent = drive + lapStr + livesStr + debuffStr;
      } else {
        info.textContent = drive;
      }
    }

    if (betStatus) betStatus.textContent = (raceActive || raceArmed) ? '' : raceMessage;
  }

  function setThrottle(on) {
    if (on) {
      // First throttle press after BET starts the race.
      if (raceArmed && !raceActive) {
        raceArmed = false;
        raceActive = true;
        updateStatus();
      }
      if (crashed && (!raceActive || lives > 0)) reset(true);
    }
    throttle = on;
  }

  function setBrake(on) {
    brake = on;
  }

  function addLives(n) {
    const inc = Math.max(0, n | 0);
    lives = Math.min(MAX_LIVES, lives + inc);
    updateStatus();
  }

  function setGhostDebuff(reduction) {
    const r = Math.max(0, Math.min(0.99, Number(reduction) || 0));
    ghostSpeedMul = 1 - r;
    updateStatus();
  }

  function reset(soft) {
    path = $('st-track-path');
    if (!path) return;
    pathLen = path.getTotalLength();
    s = 0; v = 0;
    airborne = false; crashed = false;
    stress = 0;
    sparks = [];
    // Soft AND hard reset both restart the race from the line: a player
    // respawn (soft) using one of their remaining lives sends both the AI
    // and the lap counters back to zero — fresh sprint, one fewer try.
    ghostS = 0; ghostV = 0;
    playerLaps = 0; ghostLaps = 0;
    if (!soft) {
      // Hard reset additionally clears race state.
      raceActive = false;
      raceArmed = false;
      raceMessage = 'PLACE A BET TO RACE';
    }
    renderCar();
    renderGhost();
    renderSparks();
    updateStatus();
  }

  function startRace(bet) {
    if (raceActive) return false;
    bet = Math.max(1, parseInt(bet, 10) || 0);
    if (!window.Wallet || typeof window.Wallet.spend !== 'function' || !window.Wallet.spend(bet)) {
      raceMessage = 'INSUFFICIENT COINS';
      updateStatus();
      return false;
    }
    raceBet = bet;
    // Clear last round's effects before rolling — slot.onMatch callbacks
    // (addLives, setGhostDebuff) will overwrite these if they hit.
    lives = 0;
    ghostSpeedMul = 1.0;
    playerLaps = 0;
    ghostLaps = 0;
    if (window.STSlot && typeof window.STSlot.spinAll === 'function') {
      window.STSlot.spinAll();
    }
    if (lives <= 0) {
      raceMessage = 'NO LIVES — bet of ' + bet + ' lost';
      updateStatus();
      return false;
    }
    // Position both at start line. Race is ARMED — clock starts on first
    // throttle press (so the player can read the slots before launching).
    s = 0; v = 0; stress = 0;
    ghostS = 0; ghostV = 0;
    airborne = false; crashed = false;
    sparks = [];
    raceActive = false;
    raceArmed = true;
    raceMessage = '';
    updateStatus();
    return true;
  }

  function endRace(won, reason) {
    if (!raceActive) return;
    raceActive = false;
    raceArmed = false;
    if (won) {
      // Lives remaining at the moment of winning add to the multiplier.
      // Base = WIN_PAYOUT; each unused try tacks on +1×.
      const mul = WIN_PAYOUT + lives;
      const payout = raceBet * mul;
      if (window.Wallet && typeof window.Wallet.add === 'function') {
        window.Wallet.add(payout);
      }
      raceMessage = 'WON +' + payout + ' coins  (' + mul + '× bet, ' + lives + ' lives left)';
    } else {
      raceMessage = 'LOST  (' + reason + ')  bet of ' + raceBet + ' gone';
    }
    // After the race settles — win, outpaced, or wrecked — put both cars back
    // on the start line so the next BET begins from a clean slate (and the
    // wreck doesn't sit off-track).
    s = 0; v = 0; stress = 0;
    airborne = false; crashed = false;
    sparks = [];
    ghostS = 0; ghostV = 0;
    updateStatus();
  }

  function checkRaceEnd() {
    if (!raceActive) return;
    if (playerLaps >= RACE_LAPS)         endRace(true);
    else if (ghostLaps >= RACE_LAPS)     endRace(false, 'OUTPACED');
    else if (lives <= 0 && crashed)      endRace(false, 'WRECKED');
  }

  function init() {
    if (window.STTrack && typeof window.STTrack.onGenerate === 'function') {
      window.STTrack.onGenerate(reset);
    }

    function bindHoldButton(id, onSet) {
      const btn = $(id);
      if (!btn) return;
      const press   = function (e) { e.preventDefault(); onSet(true); };
      const release = function (e) { e.preventDefault(); onSet(false); };
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
    }
    bindHoldButton('st-throttle', setThrottle);
    bindHoldButton('st-brake',    setBrake);

    const betBtn = $('st-bet-go');
    if (betBtn) {
      betBtn.addEventListener('click', function () {
        const input = $('st-bet');
        const bet = parseInt(input ? input.value : '10', 10) || 10;
        startRace(bet);
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setThrottle(true); }
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { setBrake(true); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space') { e.preventDefault(); setThrottle(false); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { setBrake(false); }
    });

    reset();
    lastT = 0;
    raf = requestAnimationFrame(step);
  }

  global.STCar = {
    init: init,
    reset: reset,
    addLives: addLives,
    setGhostDebuff: setGhostDebuff,
    startRace: startRace
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
