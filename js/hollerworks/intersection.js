/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLLERWORKS INTERSECTION — slot-driven fleet w/ crash mechanic          │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  fireCars(descriptors) — one car per descriptor. Each descriptor =       │
  │    { dir: 0..3, color: '#hex', isTruck: bool }. Lane and maneuver are   │
  │    chosen here (random lane; lane-edge tiles get 50% turn chance).      │
  │  Direction map: 0=SB(top→down) 1=WB(right→left) 2=NB(bottom→up)         │
  │    3=EB(left→right). Matches slot arrow glyphs ↓ ← ↑ →.                  │
  │                                                                          │
  │  Trucks: slot-driven only (diamond mods). Longer (38×14), slower         │
  │  (CRUISE 4.6), weak turn (0.11). Trucks ride inner lanes (1..6) and     │
  │  always go straight — too wide for the arc routing geometry.           │
  │                                                                          │
  │  Routes are generalized for all 4 directions and 3 maneuvers. Tight     │
  │  right turns use a radius-8 arc around the "right corner" of the box;   │
  │  wide left turns use a radius-136 arc around the diagonally opposite    │
  │  ("left") corner.                                                        │
  │                                                                          │
  │  Per-frame driver loop:                                                 │
  │    1. Advance currentIdx past behind-us waypoints.                      │
  │    2. Distance-based pure-pursuit target.                              │
  │    3. Forward-cone avoidance bias; wider cone for wrecks.              │
  │    4. Turn-rate cap (per-vehicle: cars 0.22, trucks 0.11).             │
  │    5. Target speed = min of (route limits, follow-gap, wreck panic).   │
  │    6. Accel/decel toward target speed (per-vehicle caps).             │
  │    7. Advance; drop skid marks (+ Sound.tireScreech) on high lat. accel │
  │                                                                          │
  │  Crash → wreck. Per-vehicle radii. Impact spawns a stacked FX burst:   │
  │    flash → shockwave → sparks → fire → smoke → debris.                │
  │  Wrecks stay for the FULL round (no fade, no despawn). They keep      │
  │  burning while young, then quietly stop emitting but remain on the     │
  │  road. startRound() clears them on the next spin.                     │
  │                                                                          │
  │  Each car carries 1-5 occupants (trucks 1-2). All occupants count as   │
  │  dead when the car wrecks, fed into totalDeaths for the status line.  │
  │                                                                          │
  │  Bodies: small chance per crash to eject one. Drawn as a tiny family   │
  │  emoji (👨/👩/👦/👧/👶/🐕) that flies briefly, then crawls leaking blood. │
  │  Live car runs it over → splat (Sound.bodySplat). Trails persist.     │
  │                                                                          │
  │  Pizza JACKPOT car: ~35%/spin a rainbow-haloed pizza/💰 car is mixed in  │
  │  the spawn plan. Any wreck on it → FLASH-FLASH-YAY-JACKPOT canvas       │
  │  celebration (strobe + tumbling emoji shower + bouncing "JACKPOT!" txt) │
  │  and fires onJackpotCarWreck → slot.js cashes the persistent pool.     │
  │                                                                          │
  │  Skids + blood: NO fade, persist for the round. Batched single-path   │
  │  draws keep them cheap even at thousands of marks.                    │
  │                                                                          │
  │  Spawn safety: scheduleNextSpawn walks the plan for a lane whose      │
  │  off-screen entry zone is clear, so same-lane spawns don't rear-end   │
  │  each other before reaching the canvas.                               │
  │                                                                          │
  │  Car color comes from the slot tile (red, yellow, green, black).        │
  │  Truck trailer is hardcoded steel; cab uses the slot color.            │
  │                                                                          │
  │  fireCars(descriptors) — restarts the round with the slot's car list.   │
  │  Empty/missing descriptors → 30-car random demo (page-load atmosphere). │
  │                                                                          │
  │  Exports (window.Intersection): { fireCars, isBusy, onStateChange }     │
  │  External deps: Canvas2D, requestAnimationFrame                          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
*/
(function (global) {
  // ── Geometry ──
  // Roads stretched so cars have long graceful entries/exits — more
  // glide time on either side of the box.
  const W = 920;
  const H = 600;
  const CX = W / 2;
  const CY = H / 2;
  const ROAD_W = 256;
  const INTER_HALF = ROAD_W / 2;
  const LANES_PER_DIR = 8;
  const LANE_WIDTH = ROAD_W / (LANES_PER_DIR * 2); // 16

  // ── Vehicle dimensions ──
  const CAR_LEN = 22;
  const CAR_WID = 11;
  const CAR_R = 8;
  // Trucks: longer, fatter, slower, can't whip the wheel like a car. Their
  // tight-turn arcs are also a lot wider (handled by routing).
  const TRUCK_LEN = 38;
  const TRUCK_WID = 14;
  const TRUCK_R   = 11;

  // ── Physics ──
  const CRUISE = 5.6;
  const MAX_ACCEL = 0.32;
  const MAX_DECEL = 0.46;
  const MAX_TURN_RATE = 0.22;
  const GRIP_LIMIT = 0.55;
  // Trucks cruise at the SAME speed as cars (else slow trucks get rear-ended
  // by their lane's followers before they're even on-screen). What makes
  // a truck a truck is size + sluggish steering, not speed.
  const TRUCK_CRUISE = CRUISE;
  const TRUCK_MAX_ACCEL = MAX_ACCEL;
  const TRUCK_MAX_DECEL = MAX_DECEL;
  const TRUCK_MAX_TURN_RATE = 0.11;
  const TRUCK_GRIP_LIMIT = 0.30;

  // ── Driver behavior ──
  // Distance-based pursuit: target is interpolated `LOOKAHEAD_DIST` pixels
  // along the route from the car's current waypoint. Continuous, no
  // index-step jumps. Off-route the lookahead stretches so the return
  // curve is smooth.
  const LOOKAHEAD_DIST_BASE = 22;
  const LOOKAHEAD_DIST_OFFROUTE_GAIN = 2.4; // extra px of lookahead per px of lateral drift
  const LOOKAHEAD_DIST_MAX = 80;
  const BRAKE_LOOKAHEAD = 18;
  // Steering inertia: heading angular velocity lerps toward the desired
  // rate at TURN_INERTIA per frame. Smaller = smoother (more momentum).
  // Removes the per-frame jiggle from pursuit micro-corrections and lets
  // a dodge maneuver curve cleanly back instead of snapping.
  const TURN_INERTIA = 0.20;
  // Avoidance bias smoothing — same idea as steering inertia, but applied
  // to the swerve signal so it doesn't twitch as a threat flickers across
  // the cone boundary.
  const BIAS_INERTIA = 0.30;
  const FOLLOW_GAP = 28;
  const FOLLOW_LATERAL = CAR_WID + 2; // "same lane" if within this lateral offset

  // ── Forward-cone avoidance ──
  // Live cars: tight cone (10°, 40px) — only react to imminent threats.
  // Wrecks: wider, longer, stronger — they're stationary obstacles so the
  // car should commit to swerving from further out.
  const AVOID_CONE_DIST = 40;
  const AVOID_CONE_HALF_ANGLE = Math.PI / 18; // 10° each side
  const AVOID_BIAS_AMOUNT = 0.28;
  const AVOID_CONE_DIST_WRECK = 140;
  const AVOID_CONE_HALF_ANGLE_WRECK = Math.PI / 7; // ~25.7° each side
  const AVOID_BIAS_AMOUNT_WRECK = 1.05;
  // When actively dodging a wreck the steering cap is raised so the car
  // can whip the wheel harder than usual; and below WRECK_PANIC_DIST it
  // also brakes to buy more time for the swerve.
  const WRECK_DODGE_TURN_MULT = 2.4;
  const WRECK_PANIC_DIST = 38;
  const WRECK_PANIC_SPEED_FLOOR = 0.45; // fraction of cruise — speed cap during panic
  // Wrecks keep momentum after impact and slide before settling. Spreads
  // wreckage across the canvas instead of always piling at the impact spot.
  const WRECK_SLIDE_DECAY = 0.86;
  const WRECK_SLIDE_STOP = 0.08;

  // ── Spawning ──
  const SPAWN_INTERVAL_MS = 55;
  // Pizza JACKPOT car — rare special car inserted into the spawn plan with
  // a per-spin chance. Heavily glowing rainbow/pizza halo so it's instantly
  // legible across the canvas. Any collision (with another car or a wreck)
  // cashes the persistent jackpot pool to the wallet and fires a
  // FLASH-FLASH-YAY-JACKPOT canvas celebration. If it escapes uneaten the
  // player just missed their shot — no payout, no celebration.
  const JACKPOT_CAR_CHANCE = 0.35;

  // ── Visual effects ──
  // Skid marks are oriented tangent strokes. They DO NOT fade — they live
  // for the full round so the asphalt accumulates the history of carnage.
  // Capped via MAX_SKIDS to keep the batched draw cheap.
  const SKID_LATERAL_THRESHOLD = 0.06;
  const SKID_LEN = 3.5;
  const SKID_WIDTH = 1.6;
  const DEBRIS_GRAVITY = 0.18;
  // ── Particle caps ──
  // Live particles (fire/smoke/sparks/debris) have life cycles, so they're
  // capped to bound the per-frame draw cost. Persistent marks (skids,
  // blood, bone, settled wrecks) are baked straight onto stainLayer instead
  // of kept in arrays — they cost a single drawImage per frame regardless.
  const MAX_FIRE = 60;
  const MAX_SMOKE = 40;
  const MAX_SPARKS = 50;
  const MAX_DEBRIS = 60;
  const MAX_BODIES = 30;
  const MAX_BLOOD_BLOOMS = 30;
  const BLOOD_BLOOM_LIFE = 32;
  // ── Body / blood ──
  // Crash → small chance to eject a body. It flies a bit, lands, crawls,
  // leaks a blood trail. If a live car hits it → splat. Bodies are drawn
  // as tiny family-member emojis (with skin-tone diversity) + pets.
  const BODY_TYPES = [
    '👨🏻', '👨🏼', '👨🏽', '👨🏾', '👨🏿',
    '👩🏻', '👩🏼', '👩🏽', '👩🏾', '👩🏿',
    '👦🏻', '👦🏼', '👦🏽', '👦🏾', '👦🏿',
    '👧🏻', '👧🏼', '👧🏽', '👧🏾', '👧🏿',
    '👶🏻', '👶🏼', '👶🏽', '👶🏾', '👶🏿',
    '🐕', '🐩', '🐈', '🐈‍⬛',
  ];
  const BODY_FONT_PX = 18;
  const BODY_EJECT_CHANCE = 0.18;
  const BODY_CRAWL_SPEED = 0.35;
  // Bodies persist until splatted or the round resets — no life timer.
  // The hard despawn at the old 600-frame mark read to players as
  // "the emoji fades out" which was the wrong vibe.
  const BODY_TRAIL_INTERVAL = 4;
  const BODY_R = 6;
  // ── Spawn safety ──
  // Lane-clear check defers spawns into lanes whose entry zone still has a
  // warm car (recently spawned + still accelerating). The BACK zone must be
  // generous because backed-off cars are still in the pipeline, accelerating
  // from rest — they catch up to anything spawned at the entry point.
  // The FWD zone covers cars that have entered the canvas but aren't yet
  // at full cruise speed, so a new spawn won't rear-end them.
  const SPAWN_WARM_FWD  = 200;
  const SPAWN_WARM_BACK = 360;
  // ── Wreck lifetime ──
  // Wrecks stay for the FULL round — no fade, no despawn. They keep burning
  // for a few seconds, then quietly stop emitting but remain on the road.
  // (startRound() clears everything on the next spin.)
  const WRECK_EMIT_CUTOFF = 200;
  // ── Occupants / death tally ──
  // Cars carry 1 or 2 people (50/50, mean 1.5, rounded up to int). Trucks
  // usually just a driver (1-2). When the car wrecks, all occupants minus
  // any ejected survivor are counted dead immediately. Bodies that crawl
  // away are survivors — they only count toward deaths if splatted.

  let canvas, ctx;
  // Pre-rendered layers — built once on init, blitted per frame.
  let roadLayer = null, roadCtx = null;
  // Stain layer — accumulates skids, blood, bone bits, and baked wrecks
  // across the round. Cleared on startRound. Direct-drawn on emit so the
  // main frame loop only blits one image instead of iterating thousands
  // of marks per frame.
  let stainLayer = null, stainCtx = null;
  let cars = [];
  let debris = [];
  let sparks = [];
  let fireParticles = [];
  let smokeParticles = [];
  let flashes = [];
  let shockwaves = [];
  let bodies = [];
  let bloodBlooms = [];
  // Acid pools persist on the asphalt — anything crawling through dies.
  let acidPools = [];
  // Pizza emojis dropped by pizza-truck wrecks — purely decorative.
  let pizzas = [];
  // Active FLASH-FLASH-YAY-JACKPOT celebrations from jackpot-car wrecks.
  // Each: { x, y, age, life, pizzas:[{x,y,vx,vy,rot,vr}] }
  let jackpotCelebrations = [];
  let spawnPlan = [];
  let spawnTimer = null;
  // Round tallies.
  let totalSpawned = 0;
  let totalEscaped = 0;
  let totalCrashed = 0;
  let totalDeaths = 0;
  let totalSplats = 0;
  let totalQueued = 0;
  let roundEnded = false;
  const stateListeners = [];

  // ── Event hooks (slot.js subscribes to these for the jackpot system) ──
  const pizzaDropListeners = [];
  const jackpotSplatListeners = [];
  const jackpotCarWreckListeners = [];
  // Body-spawn counter that walks toward the next jackpot character.
  // The user wanted ~1-in-100, jittered so the player can't time it.
  let bodySpawnCount = 0;
  let nextJackpotAt = 90 + Math.floor(Math.random() * 20);
  function rollJackpotFlag() {
    bodySpawnCount += 1;
    if (bodySpawnCount >= nextJackpotAt) {
      nextJackpotAt = bodySpawnCount + 90 + Math.floor(Math.random() * 20);
      return true;
    }
    return false;
  }

  // ── Helpers ──
  function notifyState() {
    const s = {
      pending: spawnPlan.length,
      active: cars.filter((c) => c.alive).length,
    };
    for (const fn of stateListeners) fn(s);
  }
  function setStatus(text) {
    const el = document.getElementById('intersection-status');
    if (el) el.textContent = text;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rollOccupants(isTruck) {
    if (isTruck) return Math.random() < 0.7 ? 1 : 2;
    return Math.random() < 0.5 ? 1 : 2;
  }
  function wrapPi(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  // ── Direction utilities ──
  function laneCoord(dir, laneIdx) {
    const offset = (laneIdx + 0.5) * LANE_WIDTH;
    if (dir === 0) return CX - offset; // SB x
    if (dir === 1) return CY - offset; // WB y
    if (dir === 2) return CX + offset; // NB x
    return CY + offset;                // EB y
  }
  function spawnHeading(dir) {
    if (dir === 0) return Math.PI / 2;
    if (dir === 1) return Math.PI;
    if (dir === 2) return -Math.PI / 2;
    return 0;
  }
  function offScreenSpawn(dir, laneIdx) {
    const c = laneCoord(dir, laneIdx);
    if (dir === 0) return { x: c, y: -30 };
    if (dir === 1) return { x: W + 30, y: c };
    if (dir === 2) return { x: c, y: H + 30 };
    return { x: -30, y: c };
  }
  function offScreenExit(dir, laneIdx) {
    // Off-screen endpoint in direction `dir`, in lane laneIdx of dir's road
    const c = laneCoord(dir, laneIdx);
    if (dir === 0) return { x: c, y: H + 30 };
    if (dir === 1) return { x: -30, y: c };
    if (dir === 2) return { x: c, y: -30 };
    return { x: W + 30, y: c };
  }
  function boxEntryPoint(dir, laneIdx) {
    const c = laneCoord(dir, laneIdx);
    if (dir === 0) return { x: c, y: CY - INTER_HALF };
    if (dir === 1) return { x: CX + INTER_HALF, y: c };
    if (dir === 2) return { x: c, y: CY + INTER_HALF };
    return { x: CX - INTER_HALF, y: c };
  }
  function boxExitPoint(dir, laneIdx) {
    // Where a car going TOWARD `dir` exits the box (on dir's far edge of the box)
    const c = laneCoord(dir, laneIdx);
    if (dir === 0) return { x: c, y: CY + INTER_HALF };
    if (dir === 1) return { x: CX - INTER_HALF, y: c };
    if (dir === 2) return { x: c, y: CY - INTER_HALF };
    return { x: CX + INTER_HALF, y: c };
  }

  // Right turn arc: tight (r=8) around the "right corner" of the box.
  function rightTurnArc(dir, laneIdx) {
    const corners = [
      { x: CX - INTER_HALF, y: CY - INTER_HALF }, // NW corner — for SB
      { x: CX + INTER_HALF, y: CY - INTER_HALF }, // NE — for WB
      { x: CX + INTER_HALF, y: CY + INTER_HALF }, // SE — for NB
      { x: CX - INTER_HALF, y: CY + INTER_HALF }, // SW — for EB
    ];
    const center = corners[dir];
    const entry = boxEntryPoint(dir, laneIdx);
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    return { center, radius: 8, startAngle, sweepAngle: Math.PI / 2 };
  }
  // Left turn arc: wide (r=136) around the diagonally opposite corner.
  function leftTurnArc(dir, laneIdx) {
    const corners = [
      { x: CX + INTER_HALF, y: CY - INTER_HALF }, // NE — for SB
      { x: CX + INTER_HALF, y: CY + INTER_HALF }, // SE — for WB
      { x: CX - INTER_HALF, y: CY + INTER_HALF }, // SW — for NB
      { x: CX - INTER_HALF, y: CY - INTER_HALF }, // NW — for EB
    ];
    const center = corners[dir];
    const entry = boxEntryPoint(dir, laneIdx);
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    return { center, radius: 136, startAngle, sweepAngle: -Math.PI / 2 };
  }

  function curvatureSpeedLimit(radius) {
    if (!isFinite(radius)) return CRUISE;
    const accelLimit = Math.sqrt(GRIP_LIMIT * radius);
    const turnLimit  = MAX_TURN_RATE * radius;
    return Math.min(CRUISE, accelLimit, turnLimit);
  }

  // ── Route waypoint generators ──
  function straightWaypoints(x1, y1, x2, y2, segLen) {
    segLen = segLen || 6;
    const dx = x2 - x1, dy = y2 - y1;
    const totalLen = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const n = Math.max(2, Math.ceil(totalLen / segLen));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: x1 + dx * t, y: y1 + dy * t, angle, speedLimit: CRUISE });
    }
    return pts;
  }
  function arcWaypoints(cx, cy, radius, startAngle, sweepAngle, segLen) {
    // Denser sampling so pure-pursuit follows the arc smoothly without
    // chord-cutting — important now that wider canvas reveals the curve.
    segLen = segLen || 2.5;
    const arcLen = Math.abs(sweepAngle) * radius;
    const n = Math.max(2, Math.ceil(arcLen / segLen));
    const pts = [];
    const lim = curvatureSpeedLimit(radius);
    const tangentDir = Math.sign(sweepAngle);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = startAngle + sweepAngle * t;
      pts.push({
        x: cx + radius * Math.cos(ang),
        y: cy + radius * Math.sin(ang),
        angle: ang + tangentDir * Math.PI / 2,
        speedLimit: lim,
      });
    }
    return pts;
  }

  function makeRoute(dir, laneIdx, maneuver) {
    const spawn = offScreenSpawn(dir, laneIdx);
    if (maneuver === 'straight') {
      const off = offScreenExit(dir, laneIdx);
      return straightWaypoints(spawn.x, spawn.y, off.x, off.y);
    }
    const entry = boxEntryPoint(dir, laneIdx);
    const arc = (maneuver === 'right')
      ? rightTurnArc(dir, laneIdx)
      : leftTurnArc(dir, laneIdx);
    const newDir = (maneuver === 'right')
      ? (dir + 1) % 4
      : (dir + 3) % 4;
    const endAng = arc.startAngle + arc.sweepAngle;
    const arcEnd = {
      x: arc.center.x + arc.radius * Math.cos(endAng),
      y: arc.center.y + arc.radius * Math.sin(endAng),
    };
    const offExit = offScreenExit(newDir, laneIdx);
    return straightWaypoints(spawn.x, spawn.y, entry.x, entry.y).concat(
      arcWaypoints(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.sweepAngle),
      straightWaypoints(arcEnd.x, arcEnd.y, offExit.x, offExit.y)
    );
  }

  // ── Ambulance ──
  // Post-race cleanup vehicle. Careens onto the canvas from a random edge
  // at full speed, then HUNTS the nearest survivor body. Can crash like
  // any other car. Carries no occupants — it's just a meat wagon.
  function spawnAmbulance() {
    const dir = Math.floor(Math.random() * 4);
    const laneIdx = 3 + Math.floor(Math.random() * 2);
    const spawn = offScreenSpawn(dir, laneIdx);
    cars.push({
      isAmbulance: true,
      isTruck: true,
      color: '#f4f4f8',
      maneuver: 'straight',
      dir, laneIdx,
      route: [],            // unused; ambulanceStep pathfinds directly
      currentIdx: 0,
      x: spawn.x, y: spawn.y,
      heading: spawnHeading(dir),
      angularVel: 0,
      smoothedBias: 0,
      speed: CRUISE,        // careen entrance
      prevSpeed: CRUISE,
      lastTurnDelta: 0,
      alive: true,
      wrecked: false,
      fireSeed: Math.random() * 1000,
      occupants: 0,
    });
  }

  // Ambulance per-frame — pick the nearest body and steer for it. Once
  // bodies are gone, head off the nearest edge and despawn. No avoidance
  // scans (it doesn't dodge wrecks) so it can crash on its way.
  function ambulanceStep(c) {
    let target = null;
    let bestSq = Infinity;
    for (const b of bodies) {
      const dx = b.x - c.x, dy = b.y - c.y;
      const d = dx * dx + dy * dy;
      if (d < bestSq) { bestSq = d; target = b; }
    }
    let exiting = false;
    if (!target) {
      exiting = true;
      const dists = [c.x, W - c.x, c.y, H - c.y];
      let minIdx = 0;
      for (let i = 1; i < 4; i++) if (dists[i] < dists[minIdx]) minIdx = i;
      if      (minIdx === 0) target = { x: -60,    y: c.y };
      else if (minIdx === 1) target = { x: W + 60, y: c.y };
      else if (minIdx === 2) target = { x: c.x,    y: -60 };
      else                   target = { x: c.x,    y: H + 60 };
    }
    const desired = Math.atan2(target.y - c.y, target.x - c.x);
    const desiredDelta = clamp(wrapPi(desired - c.heading),
      -MAX_TURN_RATE, MAX_TURN_RATE);
    c.angularVel = c.angularVel * (1 - TURN_INERTIA) + desiredDelta * TURN_INERTIA;
    c.heading += c.angularVel;
    c.prevSpeed = c.speed;
    c.speed += clamp(CRUISE - c.speed, -MAX_DECEL, MAX_ACCEL);
    c.x += Math.cos(c.heading) * c.speed;
    c.y += Math.sin(c.heading) * c.speed;
    if (exiting && (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60)) {
      c.alive = false;
    }
  }

  // ── Build spawn plan ──
  // descriptors: array of { dir, color, isTruck } from the slot. One car per
  // descriptor. Lane and maneuver are chosen here (trucks: inner lane,
  // straight; cars: random lane with lane-edge turn chance).
  // If descriptors is empty/missing, a small random demo fleet is generated
  // so the canvas isn't dead on page load.
  function buildSpawnPlan(descriptors) {
    if (!descriptors || descriptors.length === 0) {
      descriptors = makeDemoDescriptors(30);
    }
    const plan = [];
    for (const d of descriptors) {
      const isTruck = !!d.isTruck;
      let laneIdx, maneuver = 'straight';
      if (isTruck) {
        laneIdx = 1 + Math.floor(Math.random() * (LANES_PER_DIR - 2));
      } else {
        laneIdx = Math.floor(Math.random() * LANES_PER_DIR);
        if (laneIdx === 0 && Math.random() < 0.5) maneuver = 'left';
        else if (laneIdx === LANES_PER_DIR - 1 && Math.random() < 0.5) maneuver = 'right';
      }
      plan.push({
        dir: d.dir,
        laneIdx,
        maneuver,
        isTruck,
        truckType: d.truckType || null,
        color: d.color || '#b8001f',
      });
    }
    // Shuffle (Fisher–Yates) so spawn order is mixed across directions.
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = plan[i]; plan[i] = plan[j]; plan[j] = tmp;
    }
    // Occasional pizza JACKPOT car — inserted at a random position in the
    // spawn order so it shows up mid-round, not always first or last.
    if (Math.random() < JACKPOT_CAR_CHANCE) {
      const dir = Math.floor(Math.random() * 4);
      const laneIdx = Math.floor(Math.random() * LANES_PER_DIR);
      const insertAt = Math.floor(Math.random() * (plan.length + 1));
      plan.splice(insertAt, 0, {
        dir,
        laneIdx,
        maneuver: 'straight',
        isTruck: false,
        truckType: null,
        color: '#ffd24a',
        isJackpotCar: true,
      });
    }
    return plan;
  }

  function makeDemoDescriptors(n) {
    const palette = ['#ff2848', '#ffd640', '#48ff5a'];
    const ds = [];
    for (let i = 0; i < n; i++) {
      ds.push({
        dir: Math.floor(Math.random() * 4),
        color: palette[Math.floor(Math.random() * 4)],
        isTruck: Math.random() < 0.06,
      });
    }
    return ds;
  }

  // ── Spawn-spacing: push the spawn point further offscreen if a same-lane
  // car is too close along the forward axis.
  function applySpawnBackoff(spawnX, spawnY, dir, laneIdx, isTruck) {
    const h = spawnHeading(dir);
    const cosF = Math.cos(h), sinF = Math.sin(h);
    const myLen = isTruck ? TRUCK_LEN : CAR_LEN;
    let maxBackoff = 0;
    for (const o of cars) {
      if (!o.alive && !o.wrecked) continue;
      if (o.dir !== dir || o.laneIdx !== laneIdx) continue;
      const dx = o.x - spawnX, dy = o.y - spawnY;
      const ofwd = dx * cosF + dy * sinF;
      if (ofwd < 0) continue;
      const otherLen = o.isTruck ? TRUCK_LEN : CAR_LEN;
      const required = (myLen + otherLen) - ofwd;
      if (required > maxBackoff) maxBackoff = required;
    }
    return {
      x: spawnX - cosF * maxBackoff,
      y: spawnY - sinF * maxBackoff,
    };
  }

  // ── Spawn one car from a plan entry ──
  function spawnFromEntry(entry) {
    const { dir, laneIdx, maneuver, isTruck, color, truckType, isJackpotCar } = entry;
    const route = makeRoute(dir, laneIdx, maneuver);
    const first = route[0];
    const spawn = applySpawnBackoff(first.x, first.y, dir, laneIdx, isTruck);
    cars.push({
      isTruck: !!isTruck,
      truckType: truckType || null,
      isJackpotCar: !!isJackpotCar,
      color: color || '#b8001f',
      maneuver,
      dir,
      laneIdx,
      route,
      currentIdx: 0,
      x: spawn.x,
      y: spawn.y,
      heading: spawnHeading(dir),
      angularVel: 0,
      smoothedBias: 0,
      speed: 0,
      prevSpeed: 0,
      lastTurnDelta: 0,
      alive: true,
      wrecked: false,
      fireSeed: Math.random() * 1000,
      occupants: rollOccupants(!!isTruck),
    });
    totalSpawned += 1;
    refreshTally();
    notifyState();
  }

  // Status line: live tally of spawned / escaped / wrecked.
  function refreshTally() {
    const inFlight = cars.filter((c) => c.alive).length;
    setStatus(
      totalSpawned + '/' + totalQueued + ' spawned · ' +
      inFlight + ' driving · ' +
      totalEscaped + ' escaped · ' +
      totalCrashed + ' wrecked · ' +
      totalDeaths + ' dead · ' +
      totalSplats + ' SPLATS!'
    );
  }

  // ── Avoidance: forward-cone bias ──
  // Forward distance to the closest WRECK in c's cone (uses the wider
  // wreck-cone params). Returns Infinity if none. Used to decide whether
  // to raise the steering cap and engage the panic brake.
  function nearestWreckFwd(c) {
    const cosH = Math.cos(c.heading);
    const sinH = Math.sin(c.heading);
    const rangeSq = AVOID_CONE_DIST_WRECK * AVOID_CONE_DIST_WRECK;
    let best = Infinity;
    for (const o of cars) {
      if (o === c || !o.wrecked) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > rangeSq) continue;
      const fwd = dx * cosH + dy * sinH;
      if (fwd <= 0 || fwd > AVOID_CONE_DIST_WRECK) continue;
      const right = -dx * sinH + dy * cosH;
      const halfWidth = fwd * Math.tan(AVOID_CONE_HALF_ANGLE_WRECK);
      if (Math.abs(right) > halfWidth) continue;
      if (fwd < best) best = fwd;
    }
    return best;
  }

  function avoidBias(c) {
    const cosH = Math.cos(c.heading);
    const sinH = Math.sin(c.heading);
    const rangeSq = AVOID_CONE_DIST_WRECK * AVOID_CONE_DIST_WRECK;
    let bias = 0;
    for (const o of cars) {
      if (o === c) continue;
      if (!o.alive && !o.wrecked) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      // Cheap early-out before the trig: skip anything past the widest
      // possible avoidance cone (the wreck cone). Drops O(N²) cost when
      // dozens of cars share the canvas.
      if (dx * dx + dy * dy > rangeSq) continue;
      // Skip live cars heading roughly the same way (parallel traffic).
      if (o.alive && Math.abs(wrapPi(o.heading - c.heading)) < Math.PI / 6) continue;
      const fwd = dx * cosH + dy * sinH;
      if (fwd <= 0) continue;
      // Wrecks get a wider/longer cone and stronger swerve. Live cars get
      // the tight default — they're moving and a hard dodge might overshoot.
      const coneDist  = o.wrecked ? AVOID_CONE_DIST_WRECK       : AVOID_CONE_DIST;
      const coneHalf  = o.wrecked ? AVOID_CONE_HALF_ANGLE_WRECK : AVOID_CONE_HALF_ANGLE;
      const biasAmt   = o.wrecked ? AVOID_BIAS_AMOUNT_WRECK     : AVOID_BIAS_AMOUNT;
      if (fwd > coneDist) continue;
      const right = -dx * sinH + dy * cosH;
      const halfWidth = fwd * Math.tan(coneHalf);
      if (Math.abs(right) > halfWidth) continue;
      const closeness = 1 - fwd / coneDist;
      const sideSign = right >= 0 ? -1 : 1;
      bias += sideSign * closeness * biasAmt;
    }
    return bias;
  }

  // Continuous distance-based pursuit target. Walks forward along the
  // route from c.currentIdx accumulating segment lengths until `lookDist`
  // is reached, then interpolates within the spanning segment. Removes
  // the jagged "target jumps to the next waypoint" sawtooth that drives
  // most of the zigzag.
  function pursuitTarget(c, lookDist) {
    const route = c.route;
    let i = c.currentIdx;
    let accum = 0;
    while (i < route.length - 1) {
      const a = route[i];
      const b = route[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (accum + seg >= lookDist) {
        const t = (lookDist - accum) / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      accum += seg;
      i += 1;
    }
    return route[route.length - 1];
  }

  // ── Follow gap: brake for a same-lane car directly ahead ──
  function findSameLaneAhead(c) {
    let bestFwd = Infinity;
    const cosH = Math.cos(c.heading), sinH = Math.sin(c.heading);
    const reach = FOLLOW_GAP + 20;
    const rangeSq = reach * reach;
    for (const o of cars) {
      if (o === c) continue;
      if (!o.alive && !o.wrecked) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > rangeSq) continue;
      const fwd = dx * cosH + dy * sinH;
      if (fwd <= 0 || fwd > reach) continue;
      const lat = -dx * sinH + dy * cosH;
      if (Math.abs(lat) > FOLLOW_LATERAL) continue;
      if (fwd < bestFwd) bestFwd = fwd;
    }
    return bestFwd;
  }

  // ── Per-car AI step ──
  function aiStep(c) {
    if (!c.alive) return;
    if (c.isAmbulance) { ambulanceStep(c); return; }
    const cruise   = c.isTruck ? TRUCK_CRUISE        : CRUISE;
    const accelCap = c.isTruck ? TRUCK_MAX_ACCEL     : MAX_ACCEL;
    const decelCap = c.isTruck ? TRUCK_MAX_DECEL     : MAX_DECEL;
    const turnRate = c.isTruck ? TRUCK_MAX_TURN_RATE : MAX_TURN_RATE;

    // 1. Advance currentIdx past any waypoint behind the car.
    while (c.currentIdx < c.route.length - 1) {
      const w = c.route[c.currentIdx];
      const dx = w.x - c.x, dy = w.y - c.y;
      const dot = dx * Math.cos(c.heading) + dy * Math.sin(c.heading);
      if (dot < 0) c.currentIdx += 1;
      else break;
    }

    // 2. Route-complete check.
    if (c.currentIdx >= c.route.length - 1) {
      const last = c.route[c.route.length - 1];
      const distToEnd = Math.hypot(last.x - c.x, last.y - c.y);
      if (distToEnd < 6 || c.x < -40 || c.x > W + 40 || c.y < -40 || c.y > H + 40) {
        c.alive = false;
        totalEscaped += 1;
        refreshTally();
        return;
      }
    }

    // 3. Distance-based pursuit target. Continuous (interpolates within
    //    the spanning segment) so the desired heading is smooth instead
    //    of stair-stepped. Lookahead distance stretches with lateral
    //    drift so off-route cars take a long arc back to their lane.
    const curWp = c.route[c.currentIdx];
    let lateralOff = 0;
    if (curWp) {
      const dxw = c.x - curWp.x, dyw = c.y - curWp.y;
      const wcos = Math.cos(curWp.angle), wsin = Math.sin(curWp.angle);
      lateralOff = Math.abs(-dxw * wsin + dyw * wcos);
    }
    const lookDist = Math.min(
      LOOKAHEAD_DIST_MAX,
      LOOKAHEAD_DIST_BASE + lateralOff * LOOKAHEAD_DIST_OFFROUTE_GAIN
    );
    const target = pursuitTarget(c, lookDist);
    const desired = Math.atan2(target.y - c.y, target.x - c.x);

    // 3b. Avoidance bias smoothed by its own inertia so a threat
    //     flickering across the cone boundary doesn't twitch the heading.
    const rawBias = avoidBias(c);
    c.smoothedBias = c.smoothedBias * (1 - BIAS_INERTIA) + rawBias * BIAS_INERTIA;

    const wreckFwd = nearestWreckFwd(c);
    const dodgingWreck = isFinite(wreckFwd);
    const turnCap = dodgingWreck ? turnRate * WRECK_DODGE_TURN_MULT : turnRate;

    // Steering inertia: angular velocity lerps toward the desired per-frame
    // turn rate. Cars never snap-change direction; once they commit to a
    // curve they ride it through.
    const desiredDelta = clamp(wrapPi(desired + c.smoothedBias - c.heading), -turnCap, turnCap);
    c.angularVel = c.angularVel * (1 - TURN_INERTIA) + desiredDelta * TURN_INERTIA;
    if (c.angularVel >  turnCap) c.angularVel =  turnCap;
    if (c.angularVel < -turnCap) c.angularVel = -turnCap;
    c.heading += c.angularVel;
    c.lastTurnDelta = c.angularVel;

    // 4. Speed target: min of route speed limits + follow-gap brake
    let ts = cruise;
    const endIdx = Math.min(c.currentIdx + BRAKE_LOOKAHEAD, c.route.length);
    for (let i = c.currentIdx; i < endIdx; i++) {
      const sl = c.route[i].speedLimit;
      if (sl < ts) ts = sl;
    }
    const aheadDist = findSameLaneAhead(c);
    if (aheadDist < FOLLOW_GAP) {
      ts = Math.min(ts, cruise * Math.max(0, (aheadDist - 12) / (FOLLOW_GAP - 12)));
    }
    // Panic brake when a wreck is close-and-in-path: bleeds speed so the
    // raised-cap swerve has time to actually clear the obstacle.
    if (dodgingWreck && wreckFwd < WRECK_PANIC_DIST) {
      const t = wreckFwd / WRECK_PANIC_DIST;
      ts = Math.min(ts, cruise * (WRECK_PANIC_SPEED_FLOOR + (1 - WRECK_PANIC_SPEED_FLOOR) * t));
    }

    // 5. Engine + brake (toward target speed)
    c.prevSpeed = c.speed;
    const speedDelta = ts - c.speed;
    c.speed += clamp(speedDelta, -decelCap, accelCap);
    if (c.speed < 0) c.speed = 0;

    // 6. Skid marks on lateral accel — oriented tangent strokes so chained
    //    marks form clean continuous arcs (ice-skating streaks).
    const lateralAccel = c.speed * Math.abs(c.angularVel);
    if (lateralAccel > SKID_LATERAL_THRESHOLD * 3 && global.Sound &&
        global.Sound.tireScreech) {
      global.Sound.tireScreech(Math.min(1, lateralAccel / 1.0));
    }
    if (lateralAccel > SKID_LATERAL_THRESHOLD) {
      const cosH = Math.cos(c.heading);
      const sinH = Math.sin(c.heading);
      const rearX = c.x - cosH * (CAR_LEN / 2 - 2);
      const rearY = c.y - sinH * (CAR_LEN / 2 - 2);
      const perpX = -sinH, perpY = cosH;
      const off = CAR_WID / 2 - 1.5;
      emitSkid(rearX + perpX * off, rearY + perpY * off, c.heading);
      emitSkid(rearX - perpX * off, rearY - perpY * off, c.heading);
    }

    // 7. Advance position
    c.x += Math.cos(c.heading) * c.speed;
    c.y += Math.sin(c.heading) * c.speed;
  }

  // ── Impact FX ──
  // A crash spawns a stacked set of effects:
  //   • a quick white-yellow flash (rim-light the impact)
  //   • an expanding shockwave ring
  //   • a burst of glowing sparks (small bright dots, fast)
  //   • a cloud of fire particles (rising orange, additive blending)
  //   • a slow drift of smoke (dark, expanding, low opacity)
  //   • a shower of debris chunks (existing behavior, now denser)
  // Truck impacts get bigger, hotter, smokier numbers.
  function spawnImpact(mx, my, big) {
    const scale = big ? 1.5 : 1.0;
    flashes.push({ x: mx, y: my, life: 7, maxLife: 7, size: (big ? 50 : 32) });
    shockwaves.push({
      x: mx, y: my,
      life: 18, maxLife: 18,
      maxRadius: big ? 80 : 54,
    });
    const sparkCount = Math.floor((10 + Math.random() * 6) * scale);
    for (let i = 0; i < sparkCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5 * scale;
      sparks.push({
        x: mx, y: my,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 12 + Math.random() * 10,
        maxLife: 22,
      });
    }
    const fireCount = Math.floor((7 + Math.random() * 5) * scale);
    for (let i = 0; i < fireCount; i++) {
      fireParticles.push({
        x: mx + (Math.random() - 0.5) * 6,
        y: my + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 2.0,
        vy: -1.0 - Math.random() * 1.6,
        life: 14 + Math.random() * 10,
        maxLife: 24,
        size: (3.5 + Math.random() * 4) * scale,
        hue: 18 + Math.random() * 28,
      });
    }
    const smokeCount = Math.floor((5 + Math.random() * 4) * scale);
    for (let i = 0; i < smokeCount; i++) {
      smokeParticles.push({
        x: mx + (Math.random() - 0.5) * 8,
        y: my + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.5 - Math.random() * 0.5,
        life: 50 + Math.random() * 30,
        maxLife: 80,
        size: 6 + Math.random() * 4,
        growth: 0.10 + Math.random() * 0.06,
      });
    }
    const debrisCount = Math.floor((8 + Math.random() * 5) * scale);
    const palette = ['#ff6a00', '#d4af37', '#b8001f', '#3a1a08', '#1a0e06'];
    for (let i = 0; i < debrisCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 5) * scale;
      debris.push({
        x: mx, y: my,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  // Wrecks keep burning while young; rates kept low + cuts off as the wreck
  // ages so dozens of stale wrecks don't all puff every frame.
  function emitWreckBurn(c) {
    if (c.wreckAge > WRECK_EMIT_CUTOFF) return;
    if (Math.random() < 0.10) {
      fireParticles.push({
        x: c.x + (Math.random() - 0.5) * (c.isTruck ? 14 : 8),
        y: c.y + (Math.random() - 0.5) * (c.isTruck ? 14 : 8),
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.6 - Math.random() * 0.8,
        life: 12 + Math.random() * 10,
        maxLife: 22,
        size: (c.isTruck ? 3.2 : 2.2) + Math.random() * 1.8,
        hue: 14 + Math.random() * 24,
      });
    }
    if (Math.random() < 0.05) {
      smokeParticles.push({
        x: c.x + (Math.random() - 0.5) * (c.isTruck ? 12 : 6),
        y: c.y + (Math.random() - 0.5) * (c.isTruck ? 12 : 6),
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.35 - Math.random() * 0.4,
        life: 50 + Math.random() * 30,
        maxLife: 80,
        size: 4 + Math.random() * 3,
        growth: 0.08 + Math.random() * 0.05,
      });
    }
  }

  // Bodies: occasional crash ejecta. Tiny crawlers that bleed and can be
  // run over for a satisfying splat. They're added in the collision block.
  function spawnBody(x, y, ang) {
    const isJackpot = rollJackpotFlag();
    bodies.push({
      x, y,
      vx: Math.cos(ang) * (1.6 + Math.random() * 1.2),
      vy: Math.sin(ang) * (1.6 + Math.random() * 1.2),
      heading: ang,
      dead: false,
      trailTimer: 0,
      crawling: false,
      emoji: isJackpot ? '💰'
                       : BODY_TYPES[Math.floor(Math.random() * BODY_TYPES.length)],
      jackpot: isJackpot,
    });
  }
  // Acid truck wreck — drops a persistent kill-zone puddle on the
  // asphalt. Stamped onto stainLayer for the visual; tracked in
  // acidPools[] for the body-vs-pool kill check each frame.
  function spawnAcidPool(x, y) {
    const radius = 16 + Math.random() * 10;
    acidPools.push({ x, y, radius });
    if (!stainCtx) return;
    const g = stainCtx;
    g.fillStyle = 'rgba(80, 180, 30, 0.55)';
    g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(140, 230, 50, 0.55)';
    g.beginPath(); g.arc(x, y, radius * 0.68, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200, 255, 100, 0.55)';
    g.beginPath(); g.arc(x, y, radius * 0.32, 0, Math.PI * 2); g.fill();
    // A few stray drops in the splash radius
    g.fillStyle = 'rgba(120, 220, 40, 0.6)';
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius + 2 + Math.random() * 10;
      g.beginPath();
      g.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r,
        0.8 + Math.random() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Pizza JACKPOT car wreck — fires the celebration animation and notifies
  // slot.js to cash out the pool. The celebration is purely on-canvas:
  // strobing white flash, expanding "JACKPOT!" text, and a thrown shower of
  // pizza + dollar emojis tumbling outward from the crash point.
  function triggerJackpotCelebration(x, y) {
    const burst = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp  = 2.5 + Math.random() * 5.5;
      burst.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.32,
        emoji: Math.random() < 0.35 ? '💰' : '🍕',
        size: 18 + Math.random() * 10,
      });
    }
    jackpotCelebrations.push({
      x, y,
      age: 0,
      life: 120,        // ~2 seconds at 60fps
      maxLife: 120,
      pizzas: burst,
    });
    // A few traditional pizzas land on the road too, so the scene reads
    // afterward like a normal pizza wreck plus the jackpot fireworks.
    // (Inline rather than dropPizzas() — we don't want to also fire the
    // pool-feed listener; the cashout is what matters here.)
    const scatterCount = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < scatterCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 24;
      pizzas.push({
        x: x + Math.cos(ang) * r,
        y: y + Math.sin(ang) * r,
        rot: Math.random() * Math.PI * 2,
      });
    }
    for (const fn of jackpotCarWreckListeners) fn();
  }

  // Pizza truck wreck — scatters pizzas across the road. No gameplay
  // effect; pure decorative carnage.
  function dropPizzas(x, y) {
    const count = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 24;
      pizzas.push({
        x: x + Math.cos(ang) * r,
        y: y + Math.sin(ang) * r,
        rot: Math.random() * Math.PI * 2,
      });
    }
    // A pizza-truck wreck feeds the jackpot pool. Listener(s) decide
    // exactly how much to add (currently 1-5% of player bank).
    for (const fn of pizzaDropListeners) fn();
  }

  // Cow truck wreck — 6 cows tumble out in random directions. They're
  // bodies underneath, so they crawl and splat the same way people do.
  function spawnCows(x, y) {
    for (let i = 0; i < 6; i++) {
      if (bodies.length >= MAX_BODIES) break;
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 1.4;
      const isJackpot = rollJackpotFlag();
      bodies.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        heading: ang,
        dead: false,
        trailTimer: 0,
        crawling: false,
        emoji: isJackpot ? '💰' : '🐄',
        jackpot: isJackpot,
      });
    }
  }

  // A splat is a small massacre. Big central pool, dense spray field of
  // varied-size red drops, then a scattering of pale bone-chunks. All
  // emitted directly onto stainLayer.
  function spawnSplat(x, y) {
    emitBlood(x, y, 6);
    emitBlood(x + 1, y + 1, 5);
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 18;
      emitBlood(x + Math.cos(ang) * r, y + Math.sin(ang) * r, 1.2 + Math.random() * 2.6);
    }
    for (let s = 0; s < 3; s++) {
      const ang = Math.random() * Math.PI * 2;
      for (let i = 1; i < 6; i++) {
        emitBlood(
          x + Math.cos(ang) * (i * 3 + Math.random() * 2),
          y + Math.sin(ang) * (i * 3 + Math.random() * 2),
          1.0 + Math.random() * 1.0);
      }
    }
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 11;
      emitBone(x + Math.cos(ang) * r, y + Math.sin(ang) * r, 0.8 + Math.random() * 1.0);
    }
  }

  function stepBodies() {
    if (bodies.length === 0) return;
    for (const b of bodies) {
      if (!b.crawling) {
        b.x += b.vx; b.y += b.vy;
        b.vx *= 0.82; b.vy *= 0.82;
        if (Math.abs(b.vx) + Math.abs(b.vy) < 0.25) {
          b.crawling = true;
          b.heading = Math.random() * Math.PI * 2;
        }
      } else {
        b.x += Math.cos(b.heading) * BODY_CRAWL_SPEED;
        b.y += Math.sin(b.heading) * BODY_CRAWL_SPEED;
        b.heading += (Math.random() - 0.5) * 0.10;
        if (b.trailTimer-- <= 0) {
          emitBlood(
            b.x + (Math.random() - 0.5) * 1.4,
            b.y + (Math.random() - 0.5) * 1.4,
            1.2);
          b.trailTimer = BODY_TRAIL_INTERVAL;
        }
      }
      // Acid pool kill — crawling through dissolves the body.
      if (!b.dead) {
        for (const p of acidPools) {
          const dxp = b.x - p.x, dyp = b.y - p.y;
          const reach = p.radius - 2; // a hair inside the pool edge
          if (dxp * dxp + dyp * dyp < reach * reach) {
            b.dead = true;
            spawnSplat(b.x, b.y);
            if (bloodBlooms.length < MAX_BLOOD_BLOOMS) {
              bloodBlooms.push({
                x: b.x, y: b.y,
                age: 0,
                maxRadius: 10 + Math.random() * 4,
                life: BLOOD_BLOOM_LIFE,
                maxLife: BLOOD_BLOOM_LIFE,
                isAcid: true,
              });
            }
            totalSplats += 1;
            totalDeaths += 1;
            refreshTally();
            if (global.Sound && global.Sound.bodySplat) global.Sound.bodySplat();
            break;
          }
        }
      }
      if (b.dead) continue;
      // Splat check vs live cars (early-out by squared distance)
      for (const c of cars) {
        if (!c.alive) continue;
        const dx = c.x - b.x, dy = c.y - b.y;
        const carR = c.isTruck ? TRUCK_R : CAR_R;
        const reach = carR + BODY_R;
        if (dx * dx + dy * dy < reach * reach) {
          const wasJackpot = !!b.jackpot;
          b.dead = true;
          spawnSplat(b.x, b.y);
          if (bloodBlooms.length < MAX_BLOOD_BLOOMS) {
            bloodBlooms.push({
              x: b.x, y: b.y,
              age: 0,
              maxRadius: 14 + Math.random() * 6,
              life: BLOOD_BLOOM_LIFE,
              maxLife: BLOOD_BLOOM_LIFE,
            });
          }
          totalSplats += 1;
          totalDeaths += 1; // survivor caught — counts as a fresh death
          refreshTally();
          if (global.Sound && global.Sound.bodySplat) global.Sound.bodySplat();
          if (wasJackpot) {
            for (const fn of jackpotSplatListeners) fn();
          }
          break;
        }
      }
    }
    bodies = bodies.filter((b) => !b.dead);
  }

  // ── Step + collision ──
  function step() {
    for (const c of cars) aiStep(c);
    // Pairwise collision (alive cars vs alive+wrecked others). Wrecks
    // KEEP their momentum (they slide and decay) so impact debris spreads
    // beyond the impact point instead of stamping a pile.
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (!a.alive) continue;
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const b = cars[j];
        if (!b.alive && !b.wrecked) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const ra = a.isTruck ? TRUCK_R : CAR_R;
        const rb = b.isTruck ? TRUCK_R : CAR_R;
        const min = ra + rb;
        if (dx * dx + dy * dy < min * min) {
          const bWasAlive = b.alive;
          a.alive = false; a.wrecked = true; a.wreckAge = 0; // keep a.speed
          totalCrashed += 1;
          let immediateDeaths = a.occupants;
          if (bWasAlive) {
            b.alive = false; b.wrecked = true; b.wreckAge = 0; // keep b.speed
            totalCrashed += 1;
            immediateDeaths += b.occupants;
          }
          const truckImpact = a.isTruck || b.isTruck;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          spawnImpact(mx, my, truckImpact);
          // Occasional body ejecta — a SURVIVOR who got out alive. They
          // don't count toward immediate deaths; they only die if splatted
          // (or stay alive if the round ends with them still crawling).
          if (bodies.length < MAX_BODIES && immediateDeaths > 0 &&
              Math.random() < BODY_EJECT_CHANCE) {
            spawnBody(mx, my, Math.random() * Math.PI * 2);
            immediateDeaths -= 1;
          }
          totalDeaths += immediateDeaths;
          // Cow truck dumps 6 cow bodies on impact.
          if (a.truckType === 'cow')              spawnCows(a.x, a.y);
          if (bWasAlive && b.truckType === 'cow') spawnCows(b.x, b.y);
          // Acid truck pools a kill-zone on the asphalt.
          if (a.truckType === 'acid')              spawnAcidPool(a.x, a.y);
          if (bWasAlive && b.truckType === 'acid') spawnAcidPool(b.x, b.y);
          // Pizza truck dumps pizzas everywhere — purely visual.
          if (a.truckType === 'pizza')              dropPizzas(a.x, a.y);
          if (bWasAlive && b.truckType === 'pizza') dropPizzas(b.x, b.y);
          // Pizza JACKPOT car — any wreck fires the pool-cashout celebration.
          // Listener (slot.js) handles the actual wallet payout.
          if (a.isJackpotCar)              triggerJackpotCelebration(a.x, a.y);
          if (bWasAlive && b.isJackpotCar) triggerJackpotCelebration(b.x, b.y);
          // Gas truck flagged for explosion — handled in step() so we
          // don't mutate cars[] mid-collision-loop.
          if (a.truckType === 'gas')              a.gasExplosionPending = true;
          if (bWasAlive && b.truckType === 'gas') b.gasExplosionPending = true;
          if (global.Sound) {
            if (truckImpact && global.Sound.truckCrash) global.Sound.truckCrash();
            else if (global.Sound.carCrash) global.Sound.carCrash();
            if (global.Sound.fireWhoosh) global.Sound.fireWhoosh();
          }
          refreshTally();
          break;
        }
      }
    }
    // Wreck slide + age + emit. Wrecks despawn after WRECK_DESPAWN frames
    // so the canvas doesn't accumulate hundreds across spins.
    for (const c of cars) {
      if (!c.wrecked) continue;
      c.wreckAge = (c.wreckAge || 0) + 1;
      if (c.speed > WRECK_SLIDE_STOP) {
        c.x += Math.cos(c.heading) * c.speed;
        c.y += Math.sin(c.heading) * c.speed;
        c.speed *= WRECK_SLIDE_DECAY;
      } else if (!c.baked) {
        // Settled — bake the wreck onto stainLayer once and skip it from
        // the per-frame drawCar loop. Saves dozens of transforms/fills
        // per frame in a pile-up round.
        c.speed = 0;
        bakeWreck(c);
      }
      emitWreckBurn(c);
    }
    // Gas-truck wrecks pop in a separate pass — they chain-wreck nearby
    // cars, which would have invalidated the main collision loop above.
    for (const c of cars) {
      if (!c.gasExplosionPending) continue;
      c.gasExplosionPending = false;
      // Stacked impact bursts for the fireball
      spawnImpact(c.x, c.y, true);
      for (let i = 0; i < 3; i++) {
        spawnImpact(
          c.x + (Math.random() - 0.5) * 30,
          c.y + (Math.random() - 0.5) * 30,
          true);
      }
      // Wreck every live car within blast radius
      const RADIUS_SQ = 80 * 80;
      for (const o of cars) {
        if (o === c || !o.alive) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        if (dx * dx + dy * dy > RADIUS_SQ) continue;
        o.alive = false;
        o.wrecked = true;
        o.wreckAge = 0;
        totalCrashed += 1;
        totalDeaths += o.occupants || 0;
        spawnImpact(o.x, o.y, true);
        // Chain a gas-truck blast if the blasted car was itself a gas
        // truck — handled on the next frame's pass.
        if (o.truckType === 'gas') o.gasExplosionPending = true;
      }
      if (global.Sound) {
        if (global.Sound.truckCrash) global.Sound.truckCrash();
        if (global.Sound.fireWhoosh) global.Sound.fireWhoosh();
      }
    }
    for (const d of debris) {
      d.x += d.vx; d.y += d.vy;
      d.vx *= 0.92; d.vy *= 0.92;
      d.vy += DEBRIS_GRAVITY;
      d.life -= 1;
    }
    debris = debris.filter((d) => d.life > 0);
    if (debris.length > MAX_DEBRIS) debris.splice(0, debris.length - MAX_DEBRIS);
    for (const s of sparks) {
      s.x += s.vx; s.y += s.vy;
      s.vx *= 0.90; s.vy *= 0.90;
      s.vy += 0.08;
      s.life -= 1;
    }
    sparks = sparks.filter((s) => s.life > 0);
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
    for (const f of fireParticles) {
      f.x += f.vx; f.y += f.vy;
      f.vx *= 0.94; f.vy *= 0.96;
      f.life -= 1;
    }
    fireParticles = fireParticles.filter((f) => f.life > 0);
    if (fireParticles.length > MAX_FIRE) {
      fireParticles.splice(0, fireParticles.length - MAX_FIRE);
    }
    for (const m of smokeParticles) {
      m.x += m.vx; m.y += m.vy;
      m.vx *= 0.97; m.vy *= 0.98;
      m.size += m.growth;
      m.life -= 1;
    }
    smokeParticles = smokeParticles.filter((m) => m.life > 0);
    if (smokeParticles.length > MAX_SMOKE) {
      smokeParticles.splice(0, smokeParticles.length - MAX_SMOKE);
    }
    for (const fl of flashes) fl.life -= 1;
    flashes = flashes.filter((fl) => fl.life > 0);
    for (const sw of shockwaves) sw.life -= 1;
    shockwaves = shockwaves.filter((sw) => sw.life > 0);
    // Jackpot celebrations — advance age and tumble emoji burst.
    for (const cel of jackpotCelebrations) {
      cel.age += 1;
      cel.life -= 1;
      for (const p of cel.pizzas) {
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.94; p.vy *= 0.94;
        p.vy += 0.18;
        p.rot += p.vr;
      }
    }
    jackpotCelebrations = jackpotCelebrations.filter((c) => c.life > 0);

    // Bodies: fly → land → crawl → bleed; check splat by live cars.
    stepBodies();
    // Blood blooms expand briefly then fade in place.
    for (const b of bloodBlooms) {
      b.age += 1;
      b.life -= 1;
    }
    bloodBlooms = bloodBlooms.filter((b) => b.life > 0);
    // Remove "gone" cars (route complete and not wrecked)
    cars = cars.filter((c) => c.alive || c.wrecked);
    // Round-end detection: spawn plan empty AND no driving cars left.
    if (!roundEnded && spawnPlan.length === 0 && !cars.some((c) => c.alive)) {
      roundEnded = true;
      setStatus(
        'Round complete: ' + totalEscaped + ' of ' + totalQueued +
        ' escaped · ' + totalCrashed + ' wrecked · ' +
        totalDeaths + ' dead · ' +
        totalSplats + ' SPLATS!'
      );
    }
    notifyState();
  }

  // ── Drawing ──
  function renderRoadTo(g) {
    // Daylight 1956 — bright suburban lawn at the four corners, concrete
    // sidewalk band along the curb, light-grey asphalt on the strips.
    // The brighter the road, the redder the blood reads on it.
    g.fillStyle = '#1a221a';
    g.fillRect(0, 0, W, H);
    // Lawn corners
    g.fillStyle = '#6a9c54';
    g.fillRect(0, 0, CX - INTER_HALF, CY - INTER_HALF);
    g.fillRect(CX + INTER_HALF, 0, W - (CX + INTER_HALF), CY - INTER_HALF);
    g.fillRect(0, CY + INTER_HALF, CX - INTER_HALF, H - (CY + INTER_HALF));
    g.fillRect(CX + INTER_HALF, CY + INTER_HALF,
      W - (CX + INTER_HALF), H - (CY + INTER_HALF));
    // Concrete sidewalk band where lawn meets asphalt
    g.fillStyle = '#cabfa2';
    g.fillRect(0, CY - INTER_HALF - 4, W, 4);
    g.fillRect(0, CY + INTER_HALF,     W, 4);
    g.fillRect(CX - INTER_HALF - 4, 0, 4, H);
    g.fillRect(CX + INTER_HALF,     0, 4, H);
    // Asphalt — light, almost concrete grey
    g.fillStyle = '#7e848e';
    g.fillRect(0, CY - INTER_HALF, W, ROAD_W);
    g.fillRect(CX - INTER_HALF, 0, ROAD_W, H);

    g.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    g.lineWidth = 0.9;
    g.setLineDash([6, 8]);
    for (let i = 1; i < LANES_PER_DIR * 2; i++) {
      if (i === LANES_PER_DIR) continue;
      const offset = (i - LANES_PER_DIR) * LANE_WIDTH;
      const xLane = CX + offset;
      g.beginPath();
      g.moveTo(xLane, 0); g.lineTo(xLane, CY - INTER_HALF);
      g.moveTo(xLane, CY + INTER_HALF); g.lineTo(xLane, H);
      g.stroke();
      const yLane = CY + offset;
      g.beginPath();
      g.moveTo(0, yLane); g.lineTo(CX - INTER_HALF, yLane);
      g.moveTo(CX + INTER_HALF, yLane); g.lineTo(W, yLane);
      g.stroke();
    }
    g.setLineDash([]);

    g.strokeStyle = '#ffd650';
    g.lineWidth = 2.0;
    g.setLineDash([12, 10]);
    g.beginPath();
    g.moveTo(0, CY);            g.lineTo(CX - INTER_HALF, CY);
    g.moveTo(CX + INTER_HALF, CY); g.lineTo(W, CY);
    g.moveTo(CX, 0);            g.lineTo(CX, CY - INTER_HALF);
    g.moveTo(CX, CY + INTER_HALF); g.lineTo(CX, H);
    g.stroke();
    g.setLineDash([]);

    g.strokeStyle = '#a8aeb6';
    g.lineWidth = 1.4;
    const corners = [
      [0,            CY - INTER_HALF, CX - INTER_HALF, CY - INTER_HALF, CX - INTER_HALF, 0],
      [W,            CY - INTER_HALF, CX + INTER_HALF, CY - INTER_HALF, CX + INTER_HALF, 0],
      [0,            CY + INTER_HALF, CX - INTER_HALF, CY + INTER_HALF, CX - INTER_HALF, H],
      [W,            CY + INTER_HALF, CX + INTER_HALF, CY + INTER_HALF, CX + INTER_HALF, H],
    ];
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(x3, y3);
      g.stroke();
    }
  }

  // ── Direct stain emitters ──
  // These draw straight onto stainLayer, no array bookkeeping. The main
  // frame loop just blits stainLayer with one drawImage — O(1) cost
  // regardless of how many marks have accumulated.
  function emitSkid(x, y, angle) {
    if (!stainCtx) return;
    const g = stainCtx;
    g.strokeStyle = 'rgba(20, 12, 8, 0.55)';
    g.lineWidth = SKID_WIDTH;
    g.lineCap = 'round';
    g.beginPath();
    const dx = Math.cos(angle) * SKID_LEN;
    const dy = Math.sin(angle) * SKID_LEN;
    g.moveTo(x - dx, y - dy);
    g.lineTo(x + dx, y + dy);
    g.stroke();
  }
  function emitBlood(x, y, size) {
    if (!stainCtx) return;
    const g = stainCtx;
    g.fillStyle = 'rgba(110, 6, 14, 0.78)';
    g.beginPath();
    g.arc(x, y, size || 1.2, 0, Math.PI * 2);
    g.fill();
  }
  function emitBone(x, y, size) {
    if (!stainCtx) return;
    const g = stainCtx;
    g.fillStyle = 'rgba(235, 225, 205, 0.88)';
    g.beginPath();
    g.arc(x, y, size, 0, Math.PI * 2);
    g.fill();
  }

  function drawPizzas() {
    if (pizzas.length === 0) return;
    ctx.font = '14px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    for (const p of pizzas) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillText('🍕', 0, 0);
      ctx.restore();
    }
  }

  function drawBodies() {
    if (bodies.length === 0) return;
    // Canvas emoji-rendering quirk: the alpha component of fillStyle is
    // multiplied into the color-emoji glyph even though the glyph carries
    // its own colors. If the previous draw left fillStyle on something
    // like rgba(220,30,50,0.75) (a blood-bloom fill), the emoji renders
    // at 75% opacity — and because the previous fillStyle varies per
    // frame, the emoji "flickers / fades". Pin a fully-opaque fillStyle
    // before every body draw, plus an explicit color-emoji font stack
    // and globalAlpha = 1 to be safe.
    ctx.font = BODY_FONT_PX + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    for (const b of bodies) {
      ctx.fillText(b.emoji, b.x, b.y);
    }
  }

  // Paint a settled wreck onto stainLayer once. After this, the wreck no
  // longer participates in the per-frame drawCar loop — it's just pixels.
  function bakeWreck(c) {
    if (!stainCtx) return;
    const g = stainCtx;
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.heading);
    const l = c.isTruck ? TRUCK_LEN : CAR_LEN;
    const w = c.isTruck ? TRUCK_WID : CAR_WID;
    if (c.isTruck) {
      const trailerLen = l * 0.68;
      const cabLen = l - trailerLen - 1;
      const trailerX0 = -l / 2;
      const cabX0 = trailerX0 + trailerLen + 1;
      g.fillStyle = '#2a1a0e';
      g.fillRect(trailerX0, -w / 2, trailerLen, w);
      g.strokeStyle = '#0a0e14';
      g.lineWidth = 0.7;
      g.strokeRect(trailerX0, -w / 2, trailerLen, w);
      const cabW = w - 1;
      g.fillStyle = '#1f140a';
      g.fillRect(cabX0, -cabW / 2, cabLen, cabW);
      g.strokeRect(cabX0, -cabW / 2, cabLen, cabW);
    } else {
      g.fillStyle = '#2a1a0e';
      g.fillRect(-l / 2, -w / 2, l, w);
      g.strokeStyle = '#0a0e14';
      g.lineWidth = 0.7;
      g.strokeRect(-l / 2, -w / 2, l, w);
    }
    // Char marks across the wreck
    g.strokeStyle = 'rgba(10, 6, 2, 0.55)';
    g.lineWidth = 0.6;
    for (let k = 0; k < 3; k++) {
      const yy = -w / 2 + (k + 1) * w / 4;
      g.beginPath();
      g.moveTo(-l / 2 + 2, yy);
      g.lineTo(l / 2 - 2, yy);
      g.stroke();
    }
    g.restore();
    c.baked = true;
  }

  function drawBloodBlooms() {
    if (bloodBlooms.length === 0) return;
    for (const b of bloodBlooms) {
      const growT = Math.min(1, b.age / 8);
      const ease = 1 - (1 - growT) * (1 - growT) * (1 - growT);
      const r = b.maxRadius * ease;
      if (b.isAcid) {
        // Acid dissolution — green burst
        ctx.fillStyle = 'rgba(80, 180, 30, 0.55)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(180, 255, 80, 0.75)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      } else {
        // Outer dark-blood halo + bright crimson core
        ctx.fillStyle = 'rgba(120, 8, 16, 0.55)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(220, 30, 50, 0.75)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawDebris() {
    for (const d of debris) {
      const a = Math.max(0, d.life / d.maxLife);
      ctx.fillStyle = d.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // FX draw functions: solid alpha-blended fills, no radial gradients.
  // Gradients per-particle-per-frame were the hot path; additive blending
  // alone on plain circles still gives the bright overlap-stacking look.
  function drawSmoke() {
    for (const m of smokeParticles) {
      const a = Math.max(0, m.life / m.maxLife) * 0.30;
      ctx.fillStyle = 'rgba(40, 34, 30, ' + a + ')';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFire() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of fireParticles) {
      const a = Math.max(0, f.life / f.maxLife);
      const r = f.size * (0.7 + 0.5 * a);
      // Outer warm glow
      ctx.fillStyle = 'hsla(' + f.hue + ', 100%, 50%, ' + (0.45 * a) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Bright core
      ctx.fillStyle = 'rgba(255, 235, 180, ' + (0.55 * a) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSparks() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 220, 140, 1)';
    for (const s of sparks) {
      const a = Math.max(0, s.life / s.maxLife);
      ctx.globalAlpha = 0.85 * a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawShockwavesAndFlashes() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fl of flashes) {
      const a = Math.max(0, fl.life / fl.maxLife);
      const r = fl.size * (1 - a * 0.4);
      ctx.fillStyle = 'rgba(255, 220, 140, ' + (0.40 * a) + ')';
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 220, ' + (0.55 * a) + ')';
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sw of shockwaves) {
      const t = 1 - sw.life / sw.maxLife;
      const r = sw.maxRadius * t;
      const a = (1 - t) * 0.45;
      ctx.strokeStyle = 'rgba(255, 220, 160, ' + a + ')';
      ctx.lineWidth = 2.2 * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pizza jackpot car halo — rendered BEFORE the car body so the glow sits
  // under the paint. Heavy pulsing rainbow rings via additive blend, plus a
  // shimmer of sparkle dots. Drawn in world-space (no transform), so the
  // halo doesn't rotate with the car.
  function drawJackpotGlow(c) {
    const t = performance.now() / 1000;
    const pulse = 0.65 + 0.35 * Math.sin(t * 6.0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Outer warm halo — cycles hue
    const hue1 = (t * 90) % 360;
    const hue2 = (hue1 + 60) % 360;
    const hue3 = (hue1 + 120) % 360;
    ctx.fillStyle = 'hsla(' + hue1 + ', 100%, 55%, ' + (0.18 * pulse) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, 42 * pulse + 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'hsla(' + hue2 + ', 100%, 60%, ' + (0.26 * pulse) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, 28 * pulse + 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'hsla(' + hue3 + ', 100%, 70%, ' + (0.42 * pulse) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, 16 * pulse + 8, 0, Math.PI * 2); ctx.fill();
    // Bright core
    ctx.fillStyle = 'rgba(255, 250, 220, ' + (0.55 * pulse) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI * 2); ctx.fill();
    // Sparkle dots orbiting
    for (let k = 0; k < 6; k++) {
      const ang = t * 1.8 + k * (Math.PI / 3);
      const r = 22 + Math.sin(t * 3 + k) * 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r,
        1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.heading);
    const l = c.isTruck ? TRUCK_LEN : CAR_LEN;
    const w = c.isTruck ? TRUCK_WID : CAR_WID;
    const cruiseRef = c.isTruck ? TRUCK_CRUISE : CRUISE;
    const decelRef  = c.isTruck ? TRUCK_MAX_DECEL : MAX_DECEL;

    // Ambulance — white truck body, red mid-stripe, red cross, roof light.
    // Drawn before the regular branches so it short-circuits them.
    if (c.isAmbulance) {
      ctx.fillStyle = '#f4f4f8';
      ctx.fillRect(-l / 2, -w / 2, l, w);
      ctx.strokeStyle = '#0a0e14';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-l / 2, -w / 2, l, w);
      // Red horizontal stripe down the side
      ctx.fillStyle = '#dc0028';
      ctx.fillRect(-l / 2, -1.5, l, 3);
      // Red cross in the middle
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillStyle = '#dc0028';
      ctx.fillRect(-2.5, -0.8, 5, 1.6);
      ctx.fillRect(-0.8, -2.5, 1.6, 5);
      // Twin emergency strobe — red and blue lights alternate every 100ms.
      const phase = (Math.floor(performance.now() / 100) & 1) === 0;
      const leftCol  = phase ? '#ff3050' : '#3060ff';
      const rightCol = phase ? '#3060ff' : '#ff3050';
      ctx.fillStyle = leftCol;
      ctx.fillRect(-l / 2 + 3, -w / 2 - 1, l / 2 - 4, 2);
      ctx.fillStyle = rightCol;
      ctx.fillRect(1, -w / 2 - 1, l / 2 - 4, 2);
      // Halo glow around the strobes for legibility against the dark road
      ctx.fillStyle = phase ? 'rgba(255, 48, 80, 0.4)' : 'rgba(48, 96, 255, 0.4)';
      ctx.fillRect(-l / 2 + 3, -w / 2 - 3, l / 2 - 4, 4);
      ctx.fillStyle = phase ? 'rgba(48, 96, 255, 0.4)' : 'rgba(255, 48, 80, 0.4)';
      ctx.fillRect(1, -w / 2 - 3, l / 2 - 4, 4);
      // Headlights
      ctx.fillStyle = '#ffffe0';
      ctx.fillRect(l / 2 - 1.6, -w / 2 + 1, 1.4, 2);
      ctx.fillRect(l / 2 - 1.6, w / 2 - 3, 1.4, 2);
      ctx.restore();
      return;
    }

    if (c.isTruck) {
      // Trailer (rear ~70% of length) + cab (front ~30%, slightly narrower).
      const trailerLen = l * 0.68;
      const cabLen     = l - trailerLen - 1;
      const trailerX0  = -l / 2;
      const cabX0      = trailerX0 + trailerLen + 1;
      // Trailer color depends on truck cargo.
      let trailerFill;
      if (c.wrecked)                       trailerFill = '#2a1a0e';
      else if (c.truckType === 'cow')      trailerFill = '#8a5828';
      else if (c.truckType === 'gas')      trailerFill = '#a8a8b0';
      else if (c.truckType === 'acid')     trailerFill = '#5a7a30';
      else if (c.truckType === 'pizza')    trailerFill = '#c4302a';
      else                                 trailerFill = '#3a4046';
      ctx.fillStyle = trailerFill;
      ctx.fillRect(trailerX0, -w / 2, trailerLen, w);
      ctx.strokeStyle = '#15181b';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(trailerX0, -w / 2, trailerLen, w);
      if (!c.wrecked) {
        if (c.truckType === 'cow') {
          // White spots scattered across the trailer
          ctx.fillStyle = '#f0f0e8';
          const spots = [
            [trailerX0 + 5,  -2.5, 2.0],
            [trailerX0 + 11,  2.0, 1.3],
            [trailerX0 + 16, -1.0, 1.6],
            [trailerX0 + 22,  2.5, 1.4],
          ];
          for (const [sx, sy, sr] of spots) {
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (c.truckType === 'gas') {
          // Yellow hazard stripe down the centerline
          ctx.fillStyle = '#ffdc28';
          ctx.fillRect(trailerX0 + 2, -1.6, trailerLen - 4, 3.2);
          // Red rear-end warning bar
          ctx.fillStyle = '#dc0028';
          ctx.fillRect(trailerX0, -w / 2 + 0.5, 2, w - 1);
        } else if (c.truckType === 'acid') {
          // Bright green tank highlight + biohazard markings
          ctx.fillStyle = '#a8ff48';
          ctx.fillRect(trailerX0 + 2, -1.8, trailerLen - 4, 3.6);
          // Yellow hazard squares on the sides
          ctx.fillStyle = '#ffdc28';
          ctx.fillRect(trailerX0 + trailerLen / 2 - 2, -w / 2 + 0.5, 4, 2);
          ctx.fillRect(trailerX0 + trailerLen / 2 - 2,  w / 2 - 2.5, 4, 2);
        } else if (c.truckType === 'pizza') {
          // White cream stripes + creamy filling spots (cheese)
          ctx.fillStyle = '#faf2dc';
          ctx.fillRect(trailerX0 + 1, -w / 2 + 1.5, trailerLen - 2, 1.2);
          ctx.fillRect(trailerX0 + 1,  w / 2 - 2.7, trailerLen - 2, 1.2);
          // A little cheese smear in the middle
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath();
          ctx.arc(trailerX0 + trailerLen / 2, 0, 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Regular truck — corrugated ribbing
          ctx.strokeStyle = 'rgba(20, 22, 26, 0.7)';
          ctx.lineWidth = 0.5;
          for (let rib = 1; rib < 5; rib++) {
            const xr = trailerX0 + (trailerLen * rib) / 5;
            ctx.beginPath();
            ctx.moveTo(xr, -w / 2 + 1); ctx.lineTo(xr, w / 2 - 1);
            ctx.stroke();
          }
        }
      }
      // Cab
      const cabW = w - 1;
      ctx.fillStyle = c.wrecked ? '#1f140a' : c.color;
      ctx.fillRect(cabX0, -cabW / 2, cabLen, cabW);
      ctx.strokeStyle = '#0a0e14';
      ctx.strokeRect(cabX0, -cabW / 2, cabLen, cabW);
      if (!c.wrecked) {
        // Top-edge sheen — a thin lighter strip along the upper side of
        // the cab so the body reads as painted metal under bright light.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(cabX0 + 1, -cabW / 2, cabLen - 2, 1);
      }
      if (!c.wrecked) {
        // Windshield
        ctx.fillStyle = 'rgba(180, 220, 240, 0.55)';
        ctx.fillRect(cabX0 + cabLen - 4.5, -cabW / 2 + 1.2, 2.5, cabW - 2.4);
        // Headlights
        ctx.fillStyle = '#ffffe0';
        ctx.fillRect(cabX0 + cabLen - 1.6, -cabW / 2 + 1, 1.4, 2);
        ctx.fillRect(cabX0 + cabLen - 1.6, cabW / 2 - 3, 1.4, 2);
        // Light cone
        ctx.fillStyle = 'rgba(255, 240, 180, 0.08)';
        ctx.beginPath();
        ctx.moveTo(cabX0 + cabLen, -cabW / 2 + 1.5);
        ctx.lineTo(cabX0 + cabLen, cabW / 2 - 1.5);
        ctx.lineTo(cabX0 + cabLen + 18, w + 2);
        ctx.lineTo(cabX0 + cabLen + 18, -(w + 2));
        ctx.closePath();
        ctx.fill();
        // Tail lights — brighter while braking
        const decel = c.speed - c.prevSpeed;
        if (decel < -0.03 || c.speed < cruiseRef * 0.6) {
          const intensity = Math.max(decel < 0 ? -decel / decelRef : 0,
                                     c.speed < cruiseRef ? 1 - c.speed / cruiseRef : 0);
          ctx.fillStyle = 'rgba(255, 40, 0, ' + (0.4 + 0.6 * intensity) + ')';
          ctx.fillRect(-l / 2, -w / 2 + 1, 1.8, 2.5);
          ctx.fillRect(-l / 2, w / 2 - 3.5, 1.8, 2.5);
        }
      }
    } else {
      ctx.fillStyle = c.wrecked ? '#2a1a0e' : c.color;
      ctx.fillRect(-l / 2, -w / 2, l, w);
      ctx.strokeStyle = '#0a0e14';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-l / 2, -w / 2, l, w);
      if (!c.wrecked) {
        // Top-edge sheen — a thin lighter strip so the body reads as
        // painted metal under bright light. Subtle neon, not NEEEEEON.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(-l / 2 + 1, -w / 2, l - 2, 1);
        ctx.fillStyle = 'rgba(180, 220, 240, 0.55)';
        ctx.fillRect(l / 2 - 7, -w / 2 + 1.5, 3.5, w - 3);
        ctx.fillStyle = '#ffffe0';
        ctx.fillRect(l / 2 - 1.6, -w / 2 + 1, 1.4, 2);
        ctx.fillRect(l / 2 - 1.6, w / 2 - 3, 1.4, 2);
        ctx.fillStyle = 'rgba(255, 240, 180, 0.10)';
        ctx.beginPath();
        ctx.moveTo(l / 2, -w / 2 + 2);
        ctx.lineTo(l / 2, w / 2 - 2);
        ctx.lineTo(l / 2 + 14, w);
        ctx.lineTo(l / 2 + 14, -w);
        ctx.closePath();
        ctx.fill();
        const decel = c.speed - c.prevSpeed;
        if (decel < -0.04 || c.speed < cruiseRef * 0.55) {
          const intensity = Math.max(decel < 0 ? -decel / decelRef : 0,
                                     c.speed < cruiseRef ? 1 - c.speed / cruiseRef : 0);
          ctx.fillStyle = 'rgba(255, 40, 0, ' + (0.4 + 0.6 * intensity) + ')';
          ctx.fillRect(-l / 2, -w / 2 + 1, 1.6, 2);
          ctx.fillRect(-l / 2, w / 2 - 3, 1.6, 2);
        }
      }
    }
    // Wreck char marks — body color is already darkened above
    if (c.wrecked) {
      ctx.strokeStyle = 'rgba(10, 6, 2, 0.55)';
      ctx.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) {
        const yy = -w / 2 + (k + 1) * w / 4;
        ctx.beginPath();
        ctx.moveTo(-l / 2 + 2, yy);
        ctx.lineTo(l / 2 - 2, yy);
        ctx.stroke();
      }
    }
    // Jackpot car: pizza/dollar emoji painted on top of the body. Rotate
    // back to upright so the emoji stays readable regardless of car heading.
    if (c.isJackpotCar && !c.wrecked) {
      ctx.rotate(-c.heading);
      ctx.font = '14px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      const t = performance.now() / 220;
      ctx.fillText((Math.floor(t) & 1) === 0 ? '🍕' : '💰', 0, 0);
    }
    ctx.restore();
  }

  // FLASH-FLASH-YAY-JACKPOT — full-canvas celebration overlay drawn on top
  // of everything. Phases:
  //   0-20:   bright white flashes, strobing on/off every other frame
  //   0-90:   "JACKPOT!" text balloons out from impact, drifts upward
  //   0-120:  pizza/dollar emoji shower tumbling from the impact point
  // The strobe is intentionally jarring; it's the cabinet payoff moment.
  function drawJackpotCelebrations() {
    if (jackpotCelebrations.length === 0) return;
    for (const cel of jackpotCelebrations) {
      const t = cel.age;
      // Full-canvas strobe flash — bright white pulse fading by frame 30
      if (t < 30) {
        const strobe = (t & 1) === 0;
        const flashA = (1 - t / 30) * (strobe ? 0.55 : 0.18);
        ctx.fillStyle = 'rgba(255, 250, 220, ' + flashA + ')';
        ctx.fillRect(0, 0, W, H);
      }
      // Tumbling pizza/dollar shower
      ctx.font = '24px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      for (const p of cel.pizzas) {
        if (p.y > H + 40) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.font = p.size + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }
      // Big YAY JACKPOT text — balloons out then drifts up & fades
      const grow = Math.min(1, t / 12);
      const ease = 1 - (1 - grow) * (1 - grow);
      const fontPx = 24 + ease * 36;
      const txtAlpha = t < 90 ? 1 : Math.max(0, (cel.life) / 30);
      const liftY = Math.min(t, 70) * 0.6;
      ctx.save();
      ctx.globalAlpha = txtAlpha;
      ctx.font = 'bold ' + fontPx + 'px "Alfa Slab One", "Impact", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Outer warm glow (additive)
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 180, 30, 0.55)';
      ctx.fillText('JACKPOT!', cel.x, cel.y - liftY);
      ctx.globalCompositeOperation = 'source-over';
      // Black stroke
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(60, 20, 0, 0.95)';
      ctx.strokeText('JACKPOT!', cel.x, cel.y - liftY);
      // Bright gold fill
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('JACKPOT!', cel.x, cel.y - liftY);
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Pre-rendered road, then the accumulated stain layer (skids + blood +
    // bone + baked wrecks). Two drawImages instead of thousands of paths.
    if (roadLayer)  ctx.drawImage(roadLayer, 0, 0);
    if (stainLayer) ctx.drawImage(stainLayer, 0, 0);
    // Pizzas sit on the asphalt, beneath everything moving.
    drawPizzas();
    // Only un-baked wrecks (still sliding) need per-frame drawCar.
    for (const c of cars) if (c.wrecked && !c.baked) drawCar(c);
    // Jackpot car halo BEFORE the body so the glow sits under the paint.
    for (const c of cars) if (c.alive && c.isJackpotCar) drawJackpotGlow(c);
    for (const c of cars) if (c.alive) drawCar(c);
    // Bodies draw ON TOP of all cars so a passing vehicle can't visually
    // cover them frame-to-frame (which read as a flickery fade-out).
    // Splat is the only thing that removes a body.
    drawBodies();
    drawDebris();
    drawSmoke();
    drawFire();
    drawSparks();
    drawShockwavesAndFlashes();
    drawBloodBlooms();
    // Jackpot celebration overlay — top of the stack so nothing covers it.
    drawJackpotCelebrations();
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Spawn pump (chained setTimeout) ──
  // Lane-clear check: same-lane cars within the warm zone (spawn point ±
  // SPAWN_WARM_*) block this spawn. Without this, two consecutive same-lane
  // spawns rear-end each other off-screen — the second is backed off, then
  // the third's backoff calc (which only considers cars AHEAD of the spawn
  // point) places it in front of the still-accelerating second car.
  function laneClearForSpawn(dir, laneIdx) {
    const spawn = offScreenSpawn(dir, laneIdx);
    const h = spawnHeading(dir);
    const cosF = Math.cos(h), sinF = Math.sin(h);
    for (const o of cars) {
      if (!o.alive && !o.wrecked) continue;
      if (o.dir !== dir || o.laneIdx !== laneIdx) continue;
      const dx = o.x - spawn.x, dy = o.y - spawn.y;
      const ofwd = dx * cosF + dy * sinF;
      if (ofwd > -SPAWN_WARM_BACK && ofwd < SPAWN_WARM_FWD) return false;
    }
    return true;
  }

  function scheduleNextSpawn() {
    if (spawnPlan.length === 0) { spawnTimer = null; return; }
    spawnTimer = setTimeout(() => {
      if (spawnPlan.length === 0) { spawnTimer = null; return; }
      // Walk the plan for the first lane-clear entry; fall back to head.
      let idx = 0;
      for (let i = 0; i < spawnPlan.length; i++) {
        if (laneClearForSpawn(spawnPlan[i].dir, spawnPlan[i].laneIdx)) {
          idx = i;
          break;
        }
      }
      const entry = spawnPlan.splice(idx, 1)[0];
      spawnFromEntry(entry);
      if (spawnPlan.length > 0) scheduleNextSpawn();
      else spawnTimer = null;
    }, SPAWN_INTERVAL_MS);
  }

  function startRound(descriptors) {
    cars = [];
    debris = [];
    sparks = [];
    fireParticles = [];
    smokeParticles = [];
    flashes = [];
    shockwaves = [];
    bodies = [];
    bloodBlooms = [];
    acidPools = [];
    pizzas = [];
    jackpotCelebrations = [];
    if (stainCtx) stainCtx.clearRect(0, 0, W, H);
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
    spawnPlan = buildSpawnPlan(descriptors);
    totalQueued = spawnPlan.length;
    totalSpawned = 0;
    totalEscaped = 0;
    totalCrashed = 0;
    totalDeaths = 0;
    totalSplats = 0;
    roundEnded = false;
    setStatus(totalQueued + ' vehicles approaching');
    scheduleNextSpawn();
    notifyState();
  }

  function init() {
    canvas = document.getElementById('intersection-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    // Pre-render the static road once
    roadLayer = document.createElement('canvas');
    roadLayer.width = W;
    roadLayer.height = H;
    roadCtx = roadLayer.getContext('2d');
    renderRoadTo(roadCtx);
    // Persistent stain canvas — accumulates skids, blood, bone, baked
    // wrecks across the round. Cleared on startRound.
    stainLayer = document.createElement('canvas');
    stainLayer.width = W;
    stainLayer.height = H;
    stainCtx = stainLayer.getContext('2d');
    setStatus('Spin the slot to fire vehicles.');
    requestAnimationFrame(loop);
  }

  global.Intersection = {
    // descriptors: array of { dir: 0..3, color: '#hex', isTruck: bool }
    // — one car per descriptor. The intersection chooses lane + maneuver.
    fireCars(descriptors) { startRound(descriptors); },
    // Post-race meat-wagon: spawns a single ambulance that drives across
    // and splats any survivors still crawling.
    spawnAmbulance() { spawnAmbulance(); },
    isBusy() {
      // Ambulance is a post-race phantom — it doesn't count as the race
      // being "in progress" or the slot is locked out forever.
      return spawnPlan.length > 0 ||
        cars.some((c) => c.alive && !c.isAmbulance);
    },
    // Tally snapshot for the slot's payout calculation.
    getStats() {
      return {
        queued:   totalQueued,
        spawned:  totalSpawned,
        escaped:  totalEscaped,
        wrecked:  totalCrashed,
        deaths:   totalDeaths,
        splats:   totalSplats,
      };
    },
    onStateChange(fn) { stateListeners.push(fn); },
    // Jackpot hooks — slot.js subscribes for the pool + win mechanic.
    onPizzaDrop(fn)    { pizzaDropListeners.push(fn); },
    onJackpotSplat(fn) { jackpotSplatListeners.push(fn); },
    onJackpotCarWreck(fn) { jackpotCarWreckListeners.push(fn); },
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
