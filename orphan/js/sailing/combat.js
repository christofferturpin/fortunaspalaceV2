/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING COMBAT  —  firing arcs, broadside volleys, damage resolution    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   bearingTo(ship, target) ──► absoluteDegrees                            │
  │   relativeBearing(ship, target) ──► [-180..180]  (rel to bow)            │
  │   sideForBearing(rb) ──► 'port' | 'starboard' | null                     │
  │                                                                          │
  │   canFire(ship, target, side?) ──► bool                                  │
  │   hitChance(distance, range) ──► [0.1..0.9] (linear falloff)             │
  │                                                                          │
  │   fireBroadside(ship, target, side, world, rng) ──► damageDealt          │
  │     ├─ roll one hit chance per gun                                       │
  │     ├─ sum damage, apply to target.hp                                    │
  │     ├─ set side.reload = stats.reload                                    │
  │     └─ log {type:'volley', shooter, target, side, hits, damage}          │
  │                                                                          │
  │   resolve(world, dt, rng) ──► void                                       │
  │     ∀ship: if intent fires, attempt broadside on target (each side)      │
  │                                                                          │
  │   Exports (window.Sailing.Combat): all of the above                      │
  │   External deps: World.log, Ship.TYPE_STATS                              │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ARC_MIN=30, ARC_MAX=150  // off bow for each side
  bearingTo(a,t)→ atan2(t.x-a.x, -(t.y-a.y))*180/π → [-180..180] → mod360
  relativeBearing(s,t)→ normDeg(bearingTo(s,t) - s.heading)  // [-180..180]
  sideForBearing(rb)→ rb∈[30,150]?'starboard' : rb∈[-150,-30]?'port' : null
  hitChance(d,r)→ max(0.1, 0.9 - 0.6*(d/r))
  distance(a,b)→ √((a.x-b.x)²+(a.y-b.y)²)
  canFire(s,t,side?)→ s.alive && t.alive && hp>0 && d<range && side?reload==0 && rb∈sideArc(side)
  fireBroadside(s,t,side,w,rng)→ dmg:
    stats=TYPE_STATS[s.type]; d=dist(s,t); hc=hitChance(d,stats.range)
    hits=0; ∀g∈0..stats.guns: rng()<hc→ hits++
    dmg=hits*stats.dmg; t.hp-=dmg
    s[side].reload = stats.reload
    log(w,{type:'volley',shooter:s.id,target:t.id,side,hits,damage:dmg,dist:d})
    t.hp<=0 && t.alive→ t.alive=F; log(w,{type:'sunk',ship:t.id,by:s.id})
    ret dmg
  resolve(w,dt,rng)→
    ∀s∈living: if !s.target||target dead→ skip
       for side∈['port','starboard']:
         canFire(s,t,side)→ fireBroadside(s,t,side,w,rng)
  exports: global.Sailing.Combat={...}
*/
(function (global) {
  'use strict';

  const ARC_MIN = 30;
  const ARC_MAX = 150;

  function normDeg(d) {
    return ((d % 360) + 540) % 360 - 180;
  }

  function bearingTo(from, to) {
    const dx = to.x - from.x;
    const dy = -(to.y - from.y);
    let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  function relativeBearing(ship, target) {
    return normDeg(bearingTo(ship, target) - ship.heading);
  }

  function sideForBearing(rb) {
    const abs = Math.abs(rb);
    if (abs < ARC_MIN || abs > ARC_MAX) return null;
    return rb > 0 ? 'starboard' : 'port';
  }

  function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hitChance(d, range, target) {
    const f = d / range;
    let p = 0.9 - 0.6 * f;
    if (target) {
      // Smaller targets are harder to hit — agility/scale modifier.
      // Anchored at Frigate length (45m) = 1.0.
      const TYPE_STATS = global.Sailing.Ship.TYPE_STATS;
      const stats = TYPE_STATS[target.type];
      if (stats) p *= Math.pow(stats.length / 45, 0.55);
    }
    if (p < 0.05) return 0.05;
    if (p > 0.95) return 0.95;
    return p;
  }

  function canFire(ship, target, side) {
    if (!ship.alive || !target || !target.alive || target.hp <= 0) return false;
    const TYPE_STATS = global.Sailing.Ship.TYPE_STATS;
    const stats = TYPE_STATS[ship.type];
    const d = distance(ship, target);
    if (d > stats.range) return false;
    const rb = relativeBearing(ship, target);
    const requiredSide = sideForBearing(rb);
    if (!requiredSide) return false;
    if (side && side !== requiredSide) return false;
    if (ship[requiredSide].reload > 0) return false;
    return true;
  }

  function fireBroadside(ship, target, side, world, rng) {
    const TYPE_STATS = global.Sailing.Ship.TYPE_STATS;
    const log = global.Sailing.World.log;
    const stats = TYPE_STATS[ship.type];
    const d = distance(ship, target);
    const hc = hitChance(d, stats.range, target);
    let hits = 0;
    for (let g = 0; g < stats.gunsPerSide; g++) {
      if (rng() < hc) hits++;
    }
    const damage = hits * stats.damagePerHit;
    target.hp -= damage;
    ship[side].reload = stats.reload;
    log(world, {
      type: 'volley',
      shooter: ship.id,
      target: target.id,
      side,
      hits,
      guns: stats.gunsPerSide,
      damage,
      dist: Math.round(d),
    });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      log(world, { type: 'sunk', ship: target.id, by: ship.id });
    }
    return damage;
  }

  function resolve(world, dt, rng) {
    rng = rng || Math.random;
    for (const ship of world.ships) {
      if (!ship.alive || ship.hp <= 0) continue;
      const target = ship.target;
      if (!target || !target.alive || target.hp <= 0) continue;
      for (const side of ['port', 'starboard']) {
        if (canFire(ship, target, side)) {
          fireBroadside(ship, target, side, world, rng);
        }
      }
    }
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Combat = {
    ARC_MIN, ARC_MAX,
    bearingTo, relativeBearing, sideForBearing,
    distance, hitChance, canFire, fireBroadside, resolve,
  };
})(typeof window !== 'undefined' ? window : globalThis);
