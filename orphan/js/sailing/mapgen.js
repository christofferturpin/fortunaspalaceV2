/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING MAPGEN  —  random islands + ship spawn placement                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   makeRng(seed) ──► rng() (mulberry32, deterministic if seed given)      │
  │                                                                          │
  │   generateIslands(world, opts, rng) ──► world (mutates islands)          │
  │     ├─ pick 2 centers in middle band (40-60% along axis)                 │
  │     ├─ per island: 12 vertices, radius base*(0.7+0.6*rnd)                │
  │     └─ retry until islands don't overlap each other                      │
  │                                                                          │
  │   placeSpawns(world, sideLineups, rng) ──► [Ship,...]                    │
  │     ├─ each side gets opposite long edge (west/east)                     │
  │     ├─ ships of same side stacked along that edge (spacing 150)          │
  │     └─ rejects placements within 250m of an island                       │
  │                                                                          │
  │   Exports (window.Sailing.Mapgen): { generateIslands, placeSpawns,       │
  │     makeRng }                                                            │
  │   External deps: World, Ship.createShip, Physics.pointInPolygon          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  makeRng(seed)→ mulberry32: s=seed|0||Date.now(); return ()→ ...
  randPolyVertices(cx,cy,base,rng)→ verts[12]:
    ∀i∈0..12: a=i/12*2π; r=base*(0.7+0.6*rnd); push{x:cx+cos(a)*r, y:cy+sin(a)*r}
  islandsOverlap(a,b)→ centerDist - (maxRadiusA + maxRadiusB) < 50
  generateIslands(w,opts,rng)→
    n=opts.count||2; tries=0
    while(islands.len<n && tries++<100):
      cx=rnd*w.w*0.4+w.w*0.3; cy=rnd*w.h*0.6+w.h*0.2
      base=120+rnd*100  // 120..220
      cand={x:cx,y:cy,base,vertices:randPolyVertices(cx,cy,base,rng)}
      ∃overlap(cand,existing)? continue : islands.push(cand)
    ret w
  placeSpawns(w,lineups,rng)→ ships[]:
    lineups={side:'A',types:['Cutter','Cutter']}, etc
    edgeX(side)= side==='A'?100:w.w-100
    headingFor(side)= side==='A'?90:270   // face the other side
    ∀side: stack ships along that edge with 150m spacing, centered on h/2
            retry y if within 250 of any island vertices polygon
    ret all ships
  exports: global.Sailing.Mapgen={generateIslands,placeSpawns,makeRng}
*/
(function (global) {
  'use strict';

  function makeRng(seed) {
    let s = (seed | 0) || (Date.now() & 0x7fffffff);
    return function rng() {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randPolyVertices(cx, cy, base, rng) {
    const verts = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = base * (0.7 + 0.6 * rng());
      verts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return verts;
  }

  function islandsOverlap(a, b, padding) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const maxRa = a.base * 1.3, maxRb = b.base * 1.3;
    return d - (maxRa + maxRb) < (padding || 50);
  }

  function generateIslands(world, opts, rng) {
    const count = (opts && opts.count) || 2;
    rng = rng || makeRng();
    let tries = 0;
    while (world.islands.length < count && tries < 200) {
      tries++;
      const cx = world.w * 0.3 + rng() * world.w * 0.4;
      const cy = world.h * 0.2 + rng() * world.h * 0.6;
      const base = 120 + rng() * 100;
      const cand = { x: cx, y: cy, base, vertices: randPolyVertices(cx, cy, base, rng) };
      let bad = false;
      for (const ex of world.islands) {
        if (islandsOverlap(cand, ex, 80)) { bad = true; break; }
      }
      if (!bad) world.islands.push(cand);
    }
    return world;
  }

  function distToIsland(p, island) {
    const dx = p.x - island.x, dy = p.y - island.y;
    return Math.sqrt(dx * dx + dy * dy) - island.base * 1.3;
  }

  // If `toward` would put the ship in irons (or sub-NO_GO), nudge to the
  // closer close-hauled heading so it can actually sail off the line.
  function sailableHeading(toward, wind) {
    const Sail = global.Sailing.Sail;
    const TUNE = global.Sailing.World.TUNE;
    const buffer = 5;
    const twa = Sail.trueWindAngle(toward, wind.from);
    if (twa >= TUNE.NO_GO + buffer) return toward;
    const tack = Sail.bestCloseHauledTack(toward, wind.from);
    return ((wind.from - tack * (TUNE.NO_GO + buffer)) + 720) % 360;
  }

  function placeSpawns(world, lineups, rng) {
    rng = rng || makeRng();
    const Ship = global.Sailing.Ship;
    const ships = [];

    for (let li = 0; li < lineups.length; li++) {
      const lineup = lineups[li];
      const side = lineup.side;
      const types = lineup.types;
      const edgeX = li === 0 ? 100 : world.w - 100;
      const desiredHeading = li === 0 ? 90 : 270;
      const heading = sailableHeading(desiredHeading, world.wind);

      const spacing = 150;
      const totalSpan = (types.length - 1) * spacing;
      const startY = world.h / 2 - totalSpan / 2;

      for (let i = 0; i < types.length; i++) {
        let y = startY + i * spacing;
        let attempts = 0;
        while (attempts < 20) {
          let ok = true;
          for (const isl of world.islands) {
            if (distToIsland({ x: edgeX, y }, isl) < 150) { ok = false; break; }
          }
          if (ok) break;
          y += (rng() - 0.5) * 200;
          y = Math.max(120, Math.min(world.h - 120, y));
          attempts++;
        }
        const ship = Ship.createShip({
          type: types[i],
          side,
          x: edgeX,
          y,
          heading,
        });
        ships.push(ship);
      }
    }
    return ships;
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Mapgen = { generateIslands, placeSpawns, makeRng };
})(typeof window !== 'undefined' ? window : globalThis);
