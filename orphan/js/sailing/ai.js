/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING AI  —  strategy + tactical layers for AI-controlled ships       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   think(ship, world, dt, opts) ──► void                                  │
  │     throttled internally:                                                │
  │       every 1.0s ──► chooseTarget + chooseIntent (strategy)              │
  │       every 0.2s ──► setRudder (tactical)                                │
  │                                                                          │
  │   assignRoles(world): per-side flagship = longest hull (id ties)         │
  │   chooseTarget(ship, world): concentrate fire on enemy flagship          │
  │   chooseIntent(ship, world): APPROACH | ENGAGE | DISENGAGE               │
  │     APPROACH   when dist > range * 1.1                                   │
  │     ENGAGE     when dist <= range * 1.1                                  │
  │     DISENGAGE  when hp < startHp * 0.2                                   │
  │                                                                          │
  │   setRudder(ship, world):                                                │
  │     follower      → line-astern station behind friendly flagship         │
  │     APPROACH flag → toward flagshipApproachDest (cross point ahead of    │
  │                     enemy flagship's bow)                                │
  │     APPROACH solo → Pathfind.planHeading toward target                   │
  │     ENGAGE        → commit ONE pass heading, hold until target slides    │
  │                     behind beam (|rel bearing|>130°), then re-approach.  │
  │                     Pass heading = perpendicular to enemy flagship       │
  │                     (loaded side) or engagementHeading (solo).           │
  │     DISENGAGE     → run downwind, away from target                       │
  │                                                                          │
  │   Exports (window.Sailing.AI): { think, chooseTarget, chooseIntent,      │
  │     setRudder }                                                          │
  │   External deps: Combat, Sail, Pathfind, Ship.TYPE_STATS, World          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  think(s,w,dt,opts)→
    s.ai??={nextStrat:0, nextTact:0, startHp:s.hp}
    w.t>=s.ai.nextStrat → chooseTarget(s,w); chooseIntent(s,w); s.ai.nextStrat=w.t+1.0
    w.t>=s.ai.nextTact  → setRudder(s,w); s.ai.nextTact=w.t+0.2
  chooseTarget(s,w)→
    enemies = living(w).filter(e→e.side!==s.side)
    enemies.len===0 → s.target=null; ret
    best=enemies.reduce((b,e)→ score(s,e)>score(s,b)?e:b)
    s.target=best
  score(s,e)→ -dist(s,e) - e.hp*0.5 + (e.hp<s.hp?200:0)
  chooseIntent(s,w)→
    !s.target → s.intent='PATROL'; ret
    stats=TYPE_STATS[s.type]; d=dist(s,s.target)
    s.hp<s.ai.startHp*0.2 → s.intent='DISENGAGE'
    : d>stats.range*1.1 → s.intent='APPROACH'
    : s.intent='ENGAGE'
  setRudder(s,w)→
    !s.target||s.intent==='PATROL' → s.rudderTarget=s.heading; ret
    s.intent==='DISENGAGE' → away=bearing(t,s); s.rudderTarget=Pathfind.planHeading(...)
    s.intent==='APPROACH'  → s.rudderTarget=Pathfind.planHeading(s,s.target,w)
    s.intent==='ENGAGE'    → s.rudderTarget=engagementHeading(s,s.target,w)
  engagementHeading(s,t,w)→
    b=bearing(s,t); candS=(b-90+360)%360; candP=(b+90+360)%360
    twaS=TWA(candS,wind.from); twaP=TWA(candP,wind.from)
    scoreS=POS(twaS)+(s.starboard.reload===0?0.3:0)
    scoreP=POS(twaP)+(s.port.reload===0?0.3:0)
    h = scoreS>scoreP?candS:candP
    ret Pathfind.avoidIslands(s,h,w)
  exports: global.Sailing.AI={think,chooseTarget,chooseIntent,setRudder}
*/
(function (global) {
  'use strict';

  function deps() {
    const S = global.Sailing;
    return {
      Combat: S.Combat,
      Sail: S.Sail,
      Pathfind: S.Pathfind,
      World: S.World,
      Ship: S.Ship,
    };
  }

  function living(world) {
    return world.ships.filter((s) => s.alive && s.hp > 0);
  }

  function score(self, enemy) {
    const { Combat } = deps();
    const d = Combat.distance(self, enemy);
    let s = -d - enemy.hp * 0.5;
    if (enemy.hp < self.hp) s += 200;
    return s;
  }

  function chooseTarget(ship, world) {
    const enemies = living(world).filter((e) => e.side !== ship.side);
    if (enemies.length === 0) { ship.target = null; return; }
    // All ships on a side concentrate fire on the enemy flagship.
    const flag = enemies.find((e) => e.role === 'flagship');
    if (flag) { ship.target = flag; return; }
    let best = enemies[0];
    let bestS = score(ship, best);
    for (let i = 1; i < enemies.length; i++) {
      const s = score(ship, enemies[i]);
      if (s > bestS) { best = enemies[i]; bestS = s; }
    }
    ship.target = best;
  }

  // Per-side flagship = longest-hulled living ship (lowest id breaks ties).
  // Re-assigns roles whenever called, so flagship dying promotes the next
  // largest survivor automatically.
  function assignRoles(world) {
    const { Ship } = deps();
    const bySide = new Map();
    for (const s of world.ships) {
      if (!s.alive || s.hp <= 0) continue;
      if (!bySide.has(s.side)) bySide.set(s.side, []);
      bySide.get(s.side).push(s);
    }
    bySide.forEach((ships) => {
      ships.sort((a, b) => {
        const la = Ship.TYPE_STATS[a.type].length;
        const lb = Ship.TYPE_STATS[b.type].length;
        if (lb !== la) return lb - la;
        return a.id - b.id;
      });
      for (let i = 0; i < ships.length; i++) {
        ships[i].role = i === 0 ? 'flagship' : 'follower';
        ships[i].formationIdx = i;
      }
    });
  }

  function findFriendlyFlagship(ship, world) {
    for (const s of world.ships) {
      if (s.side === ship.side && s.role === 'flagship' && s.alive && s.hp > 0) {
        return s;
      }
    }
    return null;
  }

  function findEnemyFlagship(ship, world) {
    for (const s of world.ships) {
      if (s.side !== ship.side && s.role === 'flagship' && s.alive && s.hp > 0) {
        return s;
      }
    }
    return null;
  }

  function chooseIntent(ship, world) {
    const { Combat, Ship } = deps();
    const prev = ship.intent;
    if (!ship.target || !ship.target.alive) { ship.intent = 'PATROL'; return; }
    const stats = Ship.TYPE_STATS[ship.type];
    const d = Combat.distance(ship, ship.target);
    if (ship.hp < ship.ai.startHp * 0.2) ship.intent = 'DISENGAGE';
    else if (d > stats.range * 1.1) ship.intent = 'APPROACH';
    else ship.intent = 'ENGAGE';
    // Pass-and-fire commitment: clear the held pass heading whenever we
    // leave ENGAGE so the next ENGAGE recomputes a fresh pass course.
    if (ship.intent !== prev && ship.intent !== 'ENGAGE') {
      ship.ai.passActive = false;
    }
  }

  function engagementHeading(ship, target, world) {
    const { Combat, Sail, Pathfind } = deps();
    const b = Combat.bearingTo(ship, target);
    const candS = (b - 90 + 360) % 360;
    const candP = (b + 90 + 360) % 360;
    const twaS = Sail.trueWindAngle(candS, world.wind.from);
    const twaP = Sail.trueWindAngle(candP, world.wind.from);
    const scoreS = Sail.pointOfSail(twaS) + (ship.starboard.reload === 0 ? 0.3 : 0);
    const scoreP = Sail.pointOfSail(twaP) + (ship.port.reload === 0 ? 0.3 : 0);
    const h = scoreS >= scoreP ? candS : candP;
    return Pathfind.avoidIslands(ship, h, world);
  }

  // Line-astern station behind flagship along its sternward direction.
  // Far from station → planHeading there. Near station → match flagship.
  function followerHeading(ship, flagship, world) {
    const { Pathfind, Combat, Ship } = deps();
    const fRad = (flagship.heading * Math.PI) / 180;
    const fStats = Ship.TYPE_STATS[flagship.type];
    const myStats = Ship.TYPE_STATS[ship.type];
    const spacing = Math.max(70, (fStats.length + myStats.length) * 1.8);
    const back = ship.formationIdx * spacing;
    const stationX = flagship.x - Math.sin(fRad) * back;
    const stationY = flagship.y + Math.cos(fRad) * back;
    const dist = Combat.distance(ship, { x: stationX, y: stationY });
    if (dist > 70) {
      return Pathfind.planHeading(ship, { x: stationX, y: stationY }, world);
    }
    // On station — match flagship's heading, but still avoid ships/islands
    let h = flagship.heading;
    h = Pathfind.avoidIslands(ship, h, world);
    h = Pathfind.avoidShips(ship, h, world);
    return h;
  }

  // Crossing point ahead of enemy flagship's bow — used as the APPROACH
  // destination for our flagship, so they head TOWARDS the crossing rather
  // than the enemy itself.
  function flagshipApproachDest(ship, world) {
    const { Ship } = deps();
    const enemyFlag = findEnemyFlagship(ship, world);
    if (!enemyFlag) return ship.target;
    const eRad = (enemyFlag.heading * Math.PI) / 180;
    const myStats = Ship.TYPE_STATS[ship.type];
    const ahead = Math.max(180, myStats.range * 0.55);
    return {
      x: enemyFlag.x + Math.sin(eRad) * ahead,
      y: enemyFlag.y - Math.cos(eRad) * ahead,
    };
  }

  // Picks ONE heading perpendicular to enemy flagship's heading — the side
  // chosen is whichever brings our enemy onto a loaded broadside and sails
  // a friendly point of sail. The caller commits to this heading for the
  // duration of the pass.
  function crossTPassHeading(ship, enemyFlag, world) {
    const { Combat, Sail } = deps();
    const perpA = (enemyFlag.heading + 90) % 360;
    const perpB = (enemyFlag.heading - 90 + 360) % 360;
    const bearingEnemy = Combat.bearingTo(ship, enemyFlag);
    function scoreH(h) {
      const rb = ((bearingEnemy - h + 540) % 360) - 180;
      const side = Combat.sideForBearing(rb);
      let s = -2;
      if (side) {
        s = 1;
        if (ship[side].reload === 0) s += 0.5;
      }
      const twa = Sail.trueWindAngle(h, world.wind.from);
      s += Sail.pointOfSail(twa) * 0.6;
      return s;
    }
    return scoreH(perpA) >= scoreH(perpB) ? perpA : perpB;
  }

  function disengageHeading(ship, world) {
    const { Pathfind } = deps();
    const downwind = (world.wind.from + 180) % 360;
    const dist = 600;
    const rad = (downwind * Math.PI) / 180;
    const dest = {
      x: ship.x + Math.sin(rad) * dist,
      y: ship.y - Math.cos(rad) * dist,
    };
    return Pathfind.planHeading(ship, dest, world);
  }

  function setRudder(ship, world) {
    const { Pathfind, Combat } = deps();
    if (!ship.target || ship.intent === 'PATROL') {
      ship.rudderTarget = ship.heading;
      return;
    }
    if (ship.intent === 'DISENGAGE') {
      ship.rudderTarget = disengageHeading(ship, world);
      return;
    }
    if (ship.role === 'follower') {
      const flagship = findFriendlyFlagship(ship, world);
      if (flagship && flagship !== ship) {
        ship.rudderTarget = followerHeading(ship, flagship, world);
        return;
      }
    }
    if (ship.intent === 'APPROACH') {
      const dest = ship.role === 'flagship'
        ? flagshipApproachDest(ship, world)
        : ship.target;
      ship.rudderTarget = Pathfind.planHeading(ship, dest, world);
      return;
    }
    if (ship.intent === 'ENGAGE') {
      const target = ship.target;
      // "Pass and fire" — commit to a straight heading at the start of the
      // pass and hold it until the target slides behind our beam. Then
      // bear off back toward the approach destination for another pass.
      const rb = Combat.relativeBearing(ship, target);
      if (ship.ai.passActive && Math.abs(rb) > 130) {
        ship.ai.passActive = false;
        const dest = ship.role === 'flagship'
          ? flagshipApproachDest(ship, world)
          : target;
        ship.rudderTarget = Pathfind.planHeading(ship, dest, world);
        return;
      }
      if (!ship.ai.passActive) {
        let h;
        if (ship.role === 'flagship') {
          const enemyFlag = findEnemyFlagship(ship, world);
          h = enemyFlag
            ? crossTPassHeading(ship, enemyFlag, world)
            : engagementHeading(ship, target, world);
        } else {
          h = engagementHeading(ship, target, world);
        }
        ship.ai.passHeading = h;
        ship.ai.passActive = true;
      }
      let h = ship.ai.passHeading;
      h = Pathfind.avoidIslands(ship, h, world);
      h = Pathfind.avoidShips(ship, h, world);
      ship.rudderTarget = h;
      return;
    }
  }

  function think(ship, world, dt, opts) {
    if (!ship.ai) ship.ai = { nextStrat: 0, nextTact: 0, startHp: ship.hp };
    // World-level role assignment, debounced — runs at most once per ~1.5s
    // regardless of how many ships call think this tick.
    if (world._lastRoleAssign == null || world.t - world._lastRoleAssign > 1.5) {
      assignRoles(world);
      world._lastRoleAssign = world.t;
    }
    if (world.t >= ship.ai.nextStrat) {
      chooseTarget(ship, world);
      chooseIntent(ship, world);
      ship.ai.nextStrat = world.t + 1.0;
    }
    if (world.t >= ship.ai.nextTact) {
      setRudder(ship, world);
      ship.ai.nextTact = world.t + 0.2;
    }
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.AI = {
    think, chooseTarget, chooseIntent, setRudder,
    assignRoles, engagementHeading, crossTPassHeading,
    flagshipApproachDest, followerHeading,
    findFriendlyFlagship, findEnemyFlagship,
  };
})(typeof window !== 'undefined' ? window : globalThis);
