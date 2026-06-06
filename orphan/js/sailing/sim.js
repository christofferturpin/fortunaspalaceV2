/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING SIM  —  battle loop driver + result reporter (no rendering)     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   buildBattle(opts) ──► { world, rng }                                   │
  │     ├─ createWorld(w,h,wind)                                             │
  │     ├─ Mapgen.generateIslands                                            │
  │     ├─ Mapgen.placeSpawns                                                │
  │     └─ attach AIController to each ship                                  │
  │                                                                          │
  │   runBattle(opts) ──► { winner, elapsed, events, survivors, world }      │
  │     fixed-step sim: Controller.tickAll → Physics.step → Combat.resolve   │
  │     stops when one side has no living ships, or maxSimSeconds            │
  │                                                                          │
  │   defaultLineups() ──► [{side:'A',types:[Cutter,Cutter]},                │
  │                          {side:'B',types:[ManOWar]}]                     │
  │                                                                          │
  │   textReport(result) ──► multi-line summary string for console / <pre>   │
  │                                                                          │
  │   Exports (window.Sailing.Sim): { buildBattle, runBattle,                │
  │     defaultLineups, textReport }                                         │
  │   External deps: every other Sailing.* module                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  defaultLineups()→ [{side:'A',types:['Cutter','Cutter']},{side:'B',types:['ManOWar']}]
  buildBattle({seed,lineups=default,wind={from:90,strength:8},w=2000,h=2000}={})→
    rng=makeRng(seed); world=createWorld({w,h,wind})
    Mapgen.generateIslands(world,{count:2},rng)
    ships=Mapgen.placeSpawns(world,lineups,rng)
    ∀s: addShip(world,s); attachController(s, makeController('ai'))
    ret {world,rng}
  runBattle(opts={})→ result:
    {world,rng}=buildBattle(opts); dt=TUNE.DT
    max=opts.maxSimSeconds||600; snapEvery=opts.snapshotEvery||10; lastSnap=0
    while world.t<max:
      Controller.tickAll(world,dt); Physics.step(world,dt); Combat.resolve(world,dt,rng)
      world.t+=dt; world.tick++
      world.t-lastSnap>=snapEvery → snapshot(world); lastSnap=world.t
      sides=sidesAlive(world); sides.size<=1 → break
    ret {winner:sides.size===1?[...sides][0]:null, elapsed:world.t,
         events:world.events, survivors:livingShips(world), world}
  snapshot(w)→ ∀s∈livingShips: log(w,{type:'snap',ship:s.id,side:s.side,
    shipType:s.type,x:round(s.x),y:round(s.y),hdg:round(s.heading),
    spd:s.speed.toFixed(2),hp:s.hp,intent:s.intent,target:s.target?.id})
  textReport(r)→ formatted multiline: header(winner,elapsed),
    survivors, top events (volleys/sunk), wind, islands
  exports: global.Sailing.Sim={buildBattle,runBattle,defaultLineups,textReport}
*/
(function (global) {
  'use strict';

  function S() { return global.Sailing; }

  function defaultLineups() {
    return [
      { side: 'A', types: ['Cutter', 'Cutter', 'Cutter'] },
      { side: 'B', types: ['ManOWar'] },
    ];
  }

  // Point-budget fleet builder.
  //   Cutter=1, Frigate=2, ManOWar=3.
  // Picks uniformly random among affordable types until budget is spent.
  const SHIP_COSTS = { Cutter: 1, Frigate: 2, ManOWar: 3 };

  function randomLineup(budget, rng) {
    rng = rng || Math.random;
    const types = [];
    let remaining = budget;
    let guard = 0;
    while (remaining > 0 && guard++ < 100) {
      const options = Object.keys(SHIP_COSTS).filter((t) => SHIP_COSTS[t] <= remaining);
      if (options.length === 0) break;
      const pick = options[(rng() * options.length) | 0];
      types.push(pick);
      remaining -= SHIP_COSTS[pick];
    }
    return types;
  }

  function randomLineups(budget, rng) {
    return [
      { side: 'A', types: randomLineup(budget, rng) },
      { side: 'B', types: randomLineup(budget, rng) },
    ];
  }

  function buildBattle(opts) {
    opts = opts || {};
    const { World, Mapgen, Controller } = S();
    const rng = Mapgen.makeRng(opts.seed);
    const world = World.createWorld({
      w: opts.w || 2000,
      h: opts.h || 2000,
      wind: opts.wind || { from: 0, strength: 8 },
    });
    Mapgen.generateIslands(world, { count: opts.islandCount || 2 }, rng);
    const lineups = opts.lineups || defaultLineups();
    const ships = Mapgen.placeSpawns(world, lineups, rng);
    for (const ship of ships) {
      World.addShip(world, ship);
      Controller.attachController(ship, Controller.makeController('ai'));
    }
    return { world, rng };
  }

  function snapshot(world) {
    const { World } = S();
    for (const s of World.livingShips(world)) {
      World.log(world, {
        type: 'snap',
        ship: s.id,
        side: s.side,
        shipType: s.type,
        x: Math.round(s.x),
        y: Math.round(s.y),
        hdg: Math.round(s.heading),
        spd: +s.speed.toFixed(2),
        hp: s.hp,
        intent: s.intent,
        target: s.target ? s.target.id : null,
      });
    }
  }

  function step(world, dt, rng) {
    const { Controller, Physics, Combat } = S();
    Controller.tickAll(world, dt);
    Physics.step(world, dt);
    Combat.resolve(world, dt, rng);
    world.t += dt;
    world.tick++;
  }

  function runBattle(opts) {
    opts = opts || {};
    const { World } = S();
    const TUNE = World.TUNE;
    const { world, rng } = buildBattle(opts);
    const dt = TUNE.DT;
    const max = opts.maxSimSeconds || 600;
    const snapEvery = opts.snapshotEvery || 10;
    let lastSnap = -snapEvery;
    let sides = World.sidesAlive(world);
    let stoppedAt = 'timeout';

    while (world.t < max) {
      step(world, dt, rng);

      if (world.t - lastSnap >= snapEvery) {
        snapshot(world);
        lastSnap = world.t;
      }

      sides = World.sidesAlive(world);
      if (sides.size <= 1) {
        stoppedAt = 'victory';
        break;
      }
    }

    snapshot(world);
    return {
      winner: sides.size === 1 ? [...sides][0] : null,
      elapsed: world.t,
      stoppedAt,
      events: world.events,
      survivors: World.livingShips(world),
      world,
    };
  }

  function textReport(r) {
    const lines = [];
    const w = r.world;
    lines.push('=== SAILING BATTLE REPORT ===');
    lines.push(
      'Wind: from ' + w.wind.from + '° at ' + w.wind.strength.toFixed(1) + ' m/s'
    );
    lines.push(
      'Field: ' + w.w + 'x' + w.h + ' / Islands: ' + w.islands.length
    );
    lines.push('Elapsed: ' + r.elapsed.toFixed(1) + 's (' + r.stoppedAt + ')');
    lines.push(
      'Winner: ' + (r.winner ? r.winner : '— (draw / timeout)')
    );
    lines.push('');
    lines.push('Survivors:');
    if (r.survivors.length === 0) lines.push('  (none)');
    for (const s of r.survivors) {
      lines.push(
        '  ' + s.side + '.' + s.type + '#' + s.id +
        '  hp=' + s.hp +
        '  pos=(' + Math.round(s.x) + ',' + Math.round(s.y) + ')' +
        '  hdg=' + Math.round(s.heading) + '°' +
        '  spd=' + s.speed.toFixed(2) + 'm/s'
      );
    }
    lines.push('');

    const volleys = r.events.filter((e) => e.type === 'volley');
    const sunk = r.events.filter((e) => e.type === 'sunk');
    const grounds = r.events.filter((e) => e.type === 'ground');
    lines.push(
      'Events: ' + volleys.length + ' volleys, ' +
      sunk.length + ' sunk, ' + grounds.length + ' groundings'
    );

    const hitVolleys = volleys.filter((v) => v.hits > 0);
    if (hitVolleys.length > 0) {
      const totalDmg = hitVolleys.reduce((s, v) => s + v.damage, 0);
      const avgDist =
        hitVolleys.reduce((s, v) => s + v.dist, 0) / hitVolleys.length;
      lines.push(
        '  hits ' + hitVolleys.length + '/' + volleys.length +
        '  total dmg=' + totalDmg +
        '  avg engagement dist=' + Math.round(avgDist) + 'm'
      );
    }

    if (sunk.length > 0) {
      lines.push('');
      lines.push('Sinkings (chronological):');
      for (const e of sunk) {
        lines.push(
          '  t=' + e.t.toFixed(1) + 's  ship#' + e.ship +
          (e.by ? '  sunk by #' + e.by : '  ' + (e.cause || ''))
        );
      }
    }
    return lines.join('\n');
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Sim = {
    buildBattle, runBattle, step, snapshot,
    defaultLineups, randomLineup, randomLineups,
    textReport, SHIP_COSTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
