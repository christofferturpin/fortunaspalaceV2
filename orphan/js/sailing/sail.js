/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING SAIL  —  wind/heading → speed multiplier (point of sail curve)  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   trueWindAngle(heading, windFrom) ──► twa[0..180]                       │
  │   pointOfSail(twa) ──► mult[0..1]                                        │
  │   windStrengthFactor(strength) ──► clamp(s/8, 0.3, 1.2)                  │
  │   effectiveSpeed(ship, wind) ──► m/s desired (sail-allowed)              │
  │   bestCloseHauledTack(heading, windFrom) ──► +1 or -1 (rel sign)         │
  │                                                                          │
  │   No-go zone: TWA < 40°  →  multiplier 0 (drifting on momentum only)     │
  │   Peak speed: TWA ~ 90°  (beam reach)                                    │
  │                                                                          │
  │   Exports (window.Sailing.Sail): { trueWindAngle, pointOfSail,           │
  │     windStrengthFactor, effectiveSpeed, bestCloseHauledTack }            │
  │   External deps: World.TUNE, Ship.TYPE_STATS                             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  trueWindAngle(h,from)→ abs(((from-h+540)%360)-180)              // 0..180
  pointOfSail(twa)→ mult:
    twa<NO_GO(40)→ 0
    twa<60      → lerp(0.4,0.6, (twa-40)/20)
    twa<110     → 1.0
    twa<150     → lerp(0.95,0.85, (twa-110)/40)
    else        → lerp(0.75,0.65, (twa-150)/30)
  windStrengthFactor(s)→ clamp(s/WIND_NOMINAL, WIND_MIN, WIND_MAX)
  effectiveSpeed(ship,wind)→ STATS[ship.type].topSpeed * pointOfSail(twa) * windFactor
  bestCloseHauledTack(h,from)→ // which way to bear off when in irons
    diff=((from-h+540)%360)-180; ret diff>=0 ? +1 : -1
  exports: global.Sailing.Sail={...}
*/
(function (global) {
  'use strict';

  function trueWindAngle(heading, windFrom) {
    const d = ((windFrom - heading + 540) % 360) - 180;
    return Math.abs(d);
  }

  function lerp(a, b, t) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return a + (b - a) * t;
  }

  function pointOfSail(twa) {
    const TUNE = global.Sailing.World.TUNE;
    if (twa < TUNE.NO_GO) return 0;
    if (twa < 60) return lerp(0.4, 0.6, (twa - 40) / 20);
    if (twa < 110) return 1.0;
    if (twa < 150) return lerp(0.95, 0.85, (twa - 110) / 40);
    return lerp(0.75, 0.65, (twa - 150) / 30);
  }

  function windStrengthFactor(strength) {
    const TUNE = global.Sailing.World.TUNE;
    const r = strength / TUNE.WIND_NOMINAL;
    if (r < TUNE.WIND_STRENGTH_MIN) return TUNE.WIND_STRENGTH_MIN;
    if (r > TUNE.WIND_STRENGTH_MAX) return TUNE.WIND_STRENGTH_MAX;
    return r;
  }

  function effectiveSpeed(ship, wind) {
    const stats = global.Sailing.Ship.TYPE_STATS[ship.type];
    const twa = trueWindAngle(ship.heading, wind.from);
    return stats.topSpeed * pointOfSail(twa) * windStrengthFactor(wind.strength);
  }

  function bestCloseHauledTack(heading, windFrom) {
    const diff = ((windFrom - heading + 540) % 360) - 180;
    return diff >= 0 ? 1 : -1;
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Sail = {
    trueWindAngle,
    pointOfSail,
    windStrengthFactor,
    effectiveSpeed,
    bestCloseHauledTack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
