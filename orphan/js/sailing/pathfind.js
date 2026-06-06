/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING PATHFIND  —  heading planner: tacking + island avoidance        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   planHeading(ship, dest, world) ──► targetHeadingDeg                    │
  │     ├─ bearing = bearingTo(ship, dest)                                   │
  │     ├─ if upwind beyond NO_GO → pick close-hauled tack (w/ hysteresis)   │
  │     └─ bend heading away from islands within the corridor                │
  │                                                                          │
  │   closeHauledHeading(wind, tack) ──► degrees                             │
  │     starboard (+1): wind.from − (NO_GO + 5)                              │
  │     port (−1):      wind.from + (NO_GO + 5)                              │
  │                                                                          │
  │   chooseTack(ship, dest, wind) ──► +1 | -1                               │
  │     ├─ angular error of each tack vs direct bearing                      │
  │     └─ hysteresis: keep ship.tackPreference if within 30°                │
  │                                                                          │
  │   avoidIslands(ship, heading, world) ──► adjustedHeading                 │
  │     repulsion sum from nearby islands (≤500m, ±110° arc) → bend ≤90°     │
  │     panic mode if d<80m: hard 90° away regardless of heading arc         │
  │                                                                          │
  │   Exports (window.Sailing.Pathfind): all of the above                    │
  │   External deps: Combat.bearingTo, Sail.trueWindAngle, World.TUNE        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  NO_GO_BUFFER = 5  // headroom above sail's NO_GO before insisting we tack
  ISLAND_AVOID_R = 500  // start bending at this distance
  ISLAND_AVOID_ARC = 110  // bend only if island within this arc of heading
  ISLAND_AVOID_MAX_BEND = 90  // clamp on total adjustment
  ISLAND_PANIC_DIST = 80  // emergency 90° hard-turn radius
  closeHauledHeading(wind,tack)→ (wind.from - tack*(NO_GO+BUFFER) + 360)%360
  chooseTack(s,dest,wind)→ tack:
    bearing=bearingTo(s,dest)
    es=|normDeg(closeHauled(+1)-bearing)|
    ep=|normDeg(closeHauled(-1)-bearing)|
    prev=s.tackPreference
    prev && |es-ep|<30 → ret prev
    chosen = es<ep?+1:-1; s.tackPreference=chosen; ret chosen
  avoidIslands(s,h,w)→ adj:
    bend=0; panic={sign:0,mag:0}
    ∀i∈islands:
      d=dist(s,i.center)-i.base*1.3
      d>ISLAND_AVOID_R → continue
      rb=normDeg(bearingTo(s,i.center)-h); ab=|rb|
      d<PANIC_DIST → mag=(1-max(0,d)/PANIC)*90; mag>panic.mag→ panic={sign:-sign(rb||1),mag}; continue
      ab>AVOID_ARC → continue
      t=1-d/AVOID_R; strength = t*t*75 + t*25
      bend += -sign(rb) * strength * (1 - ab/AVOID_ARC)
    panic.mag>0 → bend += panic.sign * panic.mag
    ret (h + clamp(bend,-MAX_BEND,MAX_BEND) + 360) % 360
  planHeading(s,dest,w)→
    bearing=bearingTo(s,dest)
    twa=trueWindAngle(bearing, w.wind.from)
    twa<NO_GO+BUFFER? tack=chooseTack(s,dest,w.wind); h=closeHauled(tack) : h=bearing
    h=avoidIslands(s,h,w); ret h
  exports: global.Sailing.Pathfind={planHeading,closeHauledHeading,chooseTack,avoidIslands}
*/
(function (global) {
  'use strict';

  const NO_GO_BUFFER = 5;
  const ISLAND_AVOID_R = 500;
  const ISLAND_AVOID_ARC = 110;
  const ISLAND_AVOID_MAX_BEND = 90;
  const ISLAND_PANIC_DIST = 80;

  function normDeg(d) {
    return ((d % 360) + 540) % 360 - 180;
  }

  function sign(x) {
    return x > 0 ? 1 : (x < 0 ? -1 : 0);
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function closeHauledHeading(wind, tack) {
    const TUNE = global.Sailing.World.TUNE;
    const noGo = TUNE.NO_GO + NO_GO_BUFFER;
    return ((wind.from - tack * noGo) + 360 + 360) % 360;
  }

  function chooseTack(ship, dest, wind) {
    const Combat = global.Sailing.Combat;
    const bearing = Combat.bearingTo(ship, dest);
    const hS = closeHauledHeading(wind, +1);
    const hP = closeHauledHeading(wind, -1);
    const es = Math.abs(normDeg(hS - bearing));
    const ep = Math.abs(normDeg(hP - bearing));
    const prev = ship.tackPreference;
    if (prev && Math.abs(es - ep) < 30) return prev;
    const chosen = es < ep ? 1 : -1;
    ship.tackPreference = chosen;
    return chosen;
  }

  function avoidIslands(ship, heading, world) {
    const Combat = global.Sailing.Combat;
    let bend = 0;
    let panicSign = 0;
    let panicMag = 0;
    for (const island of world.islands) {
      const dx = ship.x - island.x;
      const dy = ship.y - island.y;
      const d = Math.sqrt(dx * dx + dy * dy) - island.base * 1.3;
      if (d > ISLAND_AVOID_R) continue;
      const rb = normDeg(Combat.bearingTo(ship, island) - heading);
      const ab = Math.abs(rb);
      if (d < ISLAND_PANIC_DIST) {
        // Way too close — hard 90° away regardless of arc
        const s = -sign(rb || 1);
        const mag = (1 - Math.max(0, d) / ISLAND_PANIC_DIST) * 90;
        if (mag > panicMag) { panicMag = mag; panicSign = s; }
        continue;
      }
      if (ab > ISLAND_AVOID_ARC) continue;
      const t = 1 - d / ISLAND_AVOID_R;
      // Steeper falloff so close islands dominate
      const strength = t * t * 75 + t * 25;
      bend += -sign(rb) * strength * (1 - ab / ISLAND_AVOID_ARC);
    }
    if (panicMag > 0) bend += panicSign * panicMag;
    return (heading + clamp(bend, -ISLAND_AVOID_MAX_BEND, ISLAND_AVOID_MAX_BEND) + 360) % 360;
  }

  // Bend away from other hulls (friendly or foe) inside SHIP_AVOID_R.
  // Used to prevent line-mates ramming each other and accidental friendly
  // collisions during maneuvers. Does NOT prevent intentional engagement
  // closure — the avoidance only triggers inside ~80m of another hull.
  const SHIP_AVOID_R = 90;
  const SHIP_AVOID_ARC = 100;
  const SHIP_AVOID_MAX_BEND = 55;
  function avoidShips(ship, heading, world) {
    const Combat = global.Sailing.Combat;
    let bend = 0;
    for (const other of world.ships) {
      if (other === ship || !other.alive || other.hp <= 0) continue;
      const dx = ship.x - other.x;
      const dy = ship.y - other.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > SHIP_AVOID_R) continue;
      const rb = normDeg(Combat.bearingTo(ship, other) - heading);
      const ab = Math.abs(rb);
      if (ab > SHIP_AVOID_ARC) continue;
      const t = 1 - d / SHIP_AVOID_R;
      // Steeper for friendlies — never want to ram a sibling
      const factor = other.side === ship.side ? 1.4 : 1.0;
      const strength = (t * t * 65 + t * 15) * factor;
      bend += -sign(rb || 1) * strength * (1 - ab / SHIP_AVOID_ARC);
    }
    return (heading + clamp(bend, -SHIP_AVOID_MAX_BEND, SHIP_AVOID_MAX_BEND) + 360) % 360;
  }

  function planHeading(ship, dest, world) {
    const Sail = global.Sailing.Sail;
    const Combat = global.Sailing.Combat;
    const TUNE = global.Sailing.World.TUNE;
    const bearing = Combat.bearingTo(ship, dest);
    const twa = Sail.trueWindAngle(bearing, world.wind.from);
    let h;
    if (twa < TUNE.NO_GO + NO_GO_BUFFER) {
      const tack = chooseTack(ship, dest, world.wind);
      h = closeHauledHeading(world.wind, tack);
    } else {
      h = bearing;
    }
    h = avoidIslands(ship, h, world);
    h = avoidShips(ship, h, world);
    return h;
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Pathfind = { planHeading, closeHauledHeading, chooseTack, avoidIslands, avoidShips };
})(typeof window !== 'undefined' ? window : globalThis);
