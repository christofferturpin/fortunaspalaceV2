/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING CONTROLLER  —  uniform per-ship decision interface              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   makeController(kind, opts) ──► { think(ship, world, dt) }              │
  │     kinds: 'ai' (AIController via AI.think), 'idle' (no-op)              │
  │                                                                          │
  │   attachController(ship, controller) ──► void                            │
  │     ship.controller = controller                                         │
  │                                                                          │
  │   tickAll(world, dt) ──► void                                            │
  │     ∀ ship: ship.controller?.think(ship, world, dt)                      │
  │                                                                          │
  │   AIController calls into AI module; HumanController (future) reads      │
  │   from a shared input queue — same interface.                            │
  │                                                                          │
  │   Exports (window.Sailing.Controller): { makeController,                 │
  │     attachController, tickAll }                                          │
  │   External deps: AI.think (lazy lookup at call time)                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  makeController(kind,opts={})→ {think:(s,w,dt)→ ...}:
    kind==='ai'→ ret {kind:'ai', think:(s,w,dt)→ Sailing.AI.think(s,w,dt,opts)}
    kind==='idle'→ ret {kind:'idle', think:()→{}}
    throw 'unknown controller kind'
  attachController(ship,c)→ ship.controller=c
  tickAll(w,dt)→ ∀s∈w.ships: s.alive && s.hp>0 && s.controller && s.controller.think(s,w,dt)
  exports: global.Sailing.Controller={makeController,attachController,tickAll}
*/
(function (global) {
  'use strict';

  function makeController(kind, opts) {
    opts = opts || {};
    if (kind === 'ai') {
      return {
        kind: 'ai',
        opts,
        think(ship, world, dt) {
          return global.Sailing.AI.think(ship, world, dt, opts);
        },
      };
    }
    if (kind === 'idle') {
      return { kind: 'idle', think() {} };
    }
    throw new Error('Unknown controller kind: ' + kind);
  }

  function attachController(ship, controller) {
    ship.controller = controller;
  }

  function tickAll(world, dt) {
    for (const ship of world.ships) {
      if (!ship.alive || ship.hp <= 0) continue;
      if (ship.controller) ship.controller.think(ship, world, dt);
    }
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Controller = { makeController, attachController, tickAll };
})(typeof window !== 'undefined' ? window : globalThis);
