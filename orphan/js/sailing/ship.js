/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING SHIP  —  ship entity + TYPE_STATS for Cutter/Frigate/ManOWar    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   createShip({type, side, x, y, heading, id?}) ──► Ship                  │
  │                                                                          │
  │   Ship state fields:                                                     │
  │     id, type, side, x, y, heading, speed, rudderTarget,                  │
  │     hp, port{reload}, starboard{reload}, alive, intent, target           │
  │                                                                          │
  │   TYPE_STATS keys: Cutter, Frigate, ManOWar                              │
  │     topSpeed, accel, turnRate, hp, gunsPerSide,                          │
  │     damagePerHit, range, reload, length, beam, mass                      │
  │                                                                          │
  │   Exports (window.Sailing.Ship): { createShip, TYPE_STATS, TYPES }       │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  TYPES=['Cutter','Frigate','ManOWar']
  TYPE_STATS:
    Cutter:   {topSpeed:4.0, accel:0.80, turnRate:5.0, turnInertia:1.5, hp:40,  guns:2, dmg:6, range:320, reload:7,  len:20, beam:5,  mass:1}
    Frigate:  {topSpeed:2.5, accel:0.30, turnRate:2.5, turnInertia:3.0, hp:100, guns:4, dmg:6, range:350, reload:10, len:45, beam:12, mass:4}
    ManOWar:  {topSpeed:4.0, accel:0.12, turnRate:0.8, turnInertia:6.0, hp:240, guns:6, dmg:7, range:450, reload:16, len:70, beam:18, mass:9}
  nextId=1
  createShip({type,side,x,y,heading=0,id?})→
    {id:id??nextId++,type,side,x,y,heading,speed:0,rudderTarget:heading,
     hp:STATS[type].hp,port:{reload:0},starboard:{reload:0},
     alive:T,intent:'APPROACH',target:null}
  exports: global.Sailing.Ship={createShip,TYPE_STATS,TYPES}
*/
(function (global) {
  'use strict';

  const TYPE_STATS = {
    Cutter: {
      topSpeed: 4.0, accel: 0.80, turnRate: 5.0, turnInertia: 1.5, hp: 40,
      gunsPerSide: 2, damagePerHit: 6, range: 320, reload: 7,
      length: 20, beam: 5, mass: 1,
    },
    Frigate: {
      topSpeed: 2.5, accel: 0.30, turnRate: 2.5, turnInertia: 3.0, hp: 100,
      gunsPerSide: 4, damagePerHit: 6, range: 350, reload: 10,
      length: 45, beam: 12, mass: 4,
    },
    ManOWar: {
      topSpeed: 4.0, accel: 0.12, turnRate: 0.8, turnInertia: 6.0, hp: 240,
      gunsPerSide: 6, damagePerHit: 7, range: 450, reload: 16,
      length: 70, beam: 18, mass: 9,
    },
  };

  const TYPES = Object.keys(TYPE_STATS);

  let nextId = 1;

  function createShip(opts) {
    const type = opts.type;
    const stats = TYPE_STATS[type];
    if (!stats) throw new Error('Unknown ship type: ' + type);
    const heading = opts.heading || 0;
    return {
      id: opts.id != null ? opts.id : nextId++,
      type,
      side: opts.side,
      x: opts.x,
      y: opts.y,
      heading,
      speed: 0,
      rudderTarget: heading,
      hp: stats.hp,
      port: { reload: 0 },
      starboard: { reload: 0 },
      alive: true,
      intent: 'APPROACH',
      target: null,
    };
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Ship = { createShip, TYPE_STATS, TYPES };
})(typeof window !== 'undefined' ? window : globalThis);
