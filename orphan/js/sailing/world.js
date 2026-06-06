/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING WORLD  —  battle field, wind, islands, ships, shared tunables   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   createWorld(opts) ──► World{w,h,wind,islands,ships,t,tick,events}      │
  │                                                                          │
  │   addShip(world, ship) ──► world           (mutates: ships.push)         │
  │   livingShips(world, side?) ──► Ship[]     (hp>0, optional side filter)  │
  │   sidesAlive(world) ──► Set<sideId>                                      │
  │   log(world, evt) ──► void                 (append {t,tick,...evt})      │
  │                                                                          │
  │   TUNE exposes shared physics/sim constants, consumed by:                │
  │     physics.js, sail.js, combat.js, ai.js, sim.js                        │
  │                                                                          │
  │   Exports (window.Sailing.World): { createWorld, addShip,                │
  │     livingShips, sidesAlive, log, TUNE }                                 │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  TUNE: DT=1/60, WIND_NOMINAL=8, NO_GO=40, MIN_STEERAGE=1.0, STEERAGE_FLOOR=0.15,
        TURN_SPEED_PENALTY=0.3, DRAG_FACTOR=1.5, GROUND_DMG=5,
        WIND_STRENGTH_MIN=0.3, WIND_STRENGTH_MAX=1.2
  createWorld({w=2000,h=2000,wind={from:90,strength:8}}={})→
    {w,h,wind,islands:[],ships:[],t:0,tick:0,events:[]}
  addShip(w,s)→ w.ships.push(s); ret w
  livingShips(w,side?)→ w.ships.filter(s→s.hp>0 && (side==null||s.side===side))
  sidesAlive(w)→ new Set(livingShips(w).map(s→s.side))
  log(w,evt)→ w.events.push({t:w.t,tick:w.tick,...evt})
  exports: global.Sailing.World={createWorld,addShip,livingShips,sidesAlive,log,TUNE}
*/
(function (global) {
  'use strict';

  const TUNE = {
    DT: 1 / 60,
    WIND_NOMINAL: 8,
    NO_GO: 40,
    MIN_STEERAGE: 1.0,
    STEERAGE_FLOOR: 0.15,
    TURN_SPEED_PENALTY: 0.3,
    DRAG_FACTOR: 1.5,
    GROUND_DMG: 5,
    WIND_STRENGTH_MIN: 0.3,
    WIND_STRENGTH_MAX: 1.2,
  };

  function createWorld(opts) {
    const o = opts || {};
    return {
      w: o.w || 2000,
      h: o.h || 2000,
      wind: o.wind || { from: 90, strength: 8 },
      islands: [],
      ships: [],
      t: 0,
      tick: 0,
      events: [],
    };
  }

  function addShip(world, ship) {
    world.ships.push(ship);
    return world;
  }

  function livingShips(world, side) {
    return world.ships.filter(
      (s) => s.hp > 0 && (side == null || s.side === side)
    );
  }

  function sidesAlive(world) {
    const set = new Set();
    for (const s of livingShips(world)) set.add(s.side);
    return set;
  }

  function log(world, evt) {
    world.events.push(Object.assign({ t: world.t, tick: world.tick }, evt));
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.World = { createWorld, addShip, livingShips, sidesAlive, log, TUNE };
})(typeof window !== 'undefined' ? window : globalThis);
