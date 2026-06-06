/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING PHYSICS  —  per-tick integration: speed, turn, position, hit    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   step(world, dt) ──► void                                               │
  │     ├─ stepShip(ship, world, dt)  (per living ship)                      │
  │     │    ├─ accelerate toward sail-allowed speed                         │
  │     │    ├─ turn toward rudderTarget (rate × steerageFactor)             │
  │     │    ├─ apply turn-speed penalty                                     │
  │     │    ├─ integrate position by heading vector                         │
  │     │    └─ decrement broadside reload timers                            │
  │     └─ resolveCollisions(world)                                          │
  │          ├─ island hits  (point-in-poly + hull-radius edge clearance)    │
  │          └─ ship-ship   (mass-weighted separation + grazing damage)      │
  │                                                                          │
  │   Exports (window.Sailing.Physics): { step, stepShip,                    │
  │     resolveCollisions, pointInPolygon, closestPointOnPolygon }           │
  │   External deps: World.TUNE, Sail.effectiveSpeed, Ship.TYPE_STATS        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  normDeg(d)→ ((d+540)%360)-180
  stepShip(s,w,dt)→
    !s.alive→ret; stats=TYPE_STATS[s.type]; desired=Sail.effectiveSpeed(s,w.wind)
    Δ=desired-s.speed; rate=Δ>0?stats.accel:stats.accel*DRAG
    s.speed += sign(Δ)*min(|Δ|, rate*dt); s.speed=max(0,s.speed)
    hd=normDeg(s.rudderTarget-s.heading)
    sf=max(STEER_FLOOR, min(1, s.speed/MIN_STEERAGE)); maxRate=stats.turnRate*sf
    desiredRate = sign(hd)*min(|hd|*Kp(0.5), maxRate)  // proportional rudder
    α = 1-exp(-dt/stats.turnInertia)
    s.turnSpeed = lerp(s.turnSpeed, desiredRate, α)   // angular momentum
    s.heading = (s.heading + s.turnSpeed*dt + 360) % 360
    s.speed *= 1 - TURN_PEN * (|s.turnSpeed|/stats.turnRate) * dt
    r=s.heading*π/180; s.x+=sin(r)*s.speed*dt; s.y-=cos(r)*s.speed*dt
    s.port.reload=max(0,s.port.reload-dt); s.starboard.reload=max(0,s.starboard.reload-dt)
    s.x=clamp(s.x,10,w.w-10); s.y=clamp(s.y,10,w.h-10)
  closestPointOnPolygon(p,poly)→ {p,dist,inside}: scan all edges, find min dist to segment,
    pip-test inside; return {nearest, dist, inside}
  resolveCollisions(w)→
    ∀s∈living: ∀i∈w.islands: c=closestPointOnPolygon(s,i.vertices); r=stats.len/3
      c.inside? pushOut(s,c,r); s.speed*=0.3; !s.aground→{hp-=GROUND_DMG; aground=T; log('ground')}
      :c.dist<r? pushAway(s,c,r); s.speed*=0.5
      :s.aground=F
    pairs(living): d=|b-a|; rsum=(a.len+b.len)/2; d<rsum→ separate mass-weighted; both speed*=0.5; hp-=2; log('collide')
  step(w,dt)→ ∀s∈living: stepShip(s,w,dt); resolveCollisions(w)
  exports: global.Sailing.Physics={step,stepShip,resolveCollisions,pointInPolygon,closestPointOnPolygon}
*/
(function (global) {
  'use strict';

  function getDeps() {
    const S = global.Sailing;
    return {
      TUNE: S.World.TUNE,
      Sail: S.Sail,
      TYPE_STATS: S.Ship.TYPE_STATS,
      log: S.World.log,
    };
  }

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

  function stepShip(ship, world, dt) {
    if (!ship.alive || ship.hp <= 0) return;
    const { TUNE, Sail, TYPE_STATS } = getDeps();
    const stats = TYPE_STATS[ship.type];

    const desired = Sail.effectiveSpeed(ship, world.wind);
    const delta = desired - ship.speed;
    const rate = delta > 0 ? stats.accel : stats.accel * TUNE.DRAG_FACTOR;
    ship.speed += sign(delta) * Math.min(Math.abs(delta), rate * dt);
    if (ship.speed < 0) ship.speed = 0;

    // Proportional rudder + angular momentum: ship can't snap to its
    // rudderTarget — the rudder commands a desired turn rate (capped by max
    // rate and proportional to heading error so the ship slows its swing
    // approaching the target), and ship.turnSpeed (deg/s) lerps toward that
    // command with a time constant of stats.turnInertia. Large hulls swing
    // through long arcs; small hulls answer the helm quickly.
    const hd = normDeg(ship.rudderTarget - ship.heading);
    const sf = Math.max(TUNE.STEERAGE_FLOOR, Math.min(1, ship.speed / TUNE.MIN_STEERAGE));
    const maxRate = stats.turnRate * sf;
    const Kp = 0.5;
    const desiredRate = sign(hd) * Math.min(Math.abs(hd) * Kp, maxRate);
    const tau = stats.turnInertia || 2.0;
    const alpha = 1 - Math.exp(-dt / tau);
    ship.turnSpeed = (ship.turnSpeed || 0) * (1 - alpha) + desiredRate * alpha;
    ship.heading = (ship.heading + ship.turnSpeed * dt + 360) % 360;

    const turnFrac = Math.abs(ship.turnSpeed) / Math.max(stats.turnRate, 0.001);
    ship.speed *= 1 - TUNE.TURN_SPEED_PENALTY * turnFrac * dt;

    const r = (ship.heading * Math.PI) / 180;
    ship.x += Math.sin(r) * ship.speed * dt;
    ship.y -= Math.cos(r) * ship.speed * dt;

    ship.port.reload = Math.max(0, ship.port.reload - dt);
    ship.starboard.reload = Math.max(0, ship.starboard.reload - dt);

    ship.x = clamp(ship.x, 10, world.w - 10);
    ship.y = clamp(ship.y, 10, world.h - 10);
  }

  function pointInPolygon(p, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y;
      const xj = verts[j].x, yj = verts[j].y;
      const intersect =
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
    t = clamp(t, 0, 1);
    return { x: a.x + t * abx, y: a.y + t * aby };
  }

  function closestPointOnPolygon(p, verts) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const cp = closestPointOnSegment(p, a, b);
      const dx = p.x - cp.x;
      const dy = p.y - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) {
        bestD = d;
        best = cp;
      }
    }
    return { point: best, dist: bestD, inside: pointInPolygon(p, verts) };
  }

  function pushOutward(ship, contact, hullR, margin) {
    const dx = ship.x - contact.point.x;
    const dy = ship.y - contact.point.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    let nx, ny;
    if (d < 0.001) {
      nx = 1; ny = 0;
    } else {
      nx = dx / d; ny = dy / d;
    }
    ship.x = contact.point.x + nx * (hullR + margin);
    ship.y = contact.point.y + ny * (hullR + margin);
  }

  function pushInward(ship, contact, hullR, margin) {
    const dx = ship.x - contact.point.x;
    const dy = ship.y - contact.point.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const nx = -dx / d, ny = -dy / d;
    ship.x = contact.point.x - nx * (hullR + margin);
    ship.y = contact.point.y - ny * (hullR + margin);
  }

  function resolveCollisions(world) {
    const { TUNE, TYPE_STATS, log } = getDeps();
    const living = world.ships.filter((s) => s.alive && s.hp > 0);

    for (const ship of living) {
      const stats = TYPE_STATS[ship.type];
      const hullR = stats.length / 3;
      let touching = false;
      for (const island of world.islands) {
        const c = closestPointOnPolygon(ship, island.vertices);
        if (c.inside) {
          touching = true;
          pushInward(ship, c, hullR, 2);
          ship.speed *= 0.3;
          if (!ship.aground) {
            ship.hp -= TUNE.GROUND_DMG;
            ship.aground = true;
            log(world, { type: 'ground', ship: ship.id });
          }
        } else if (c.dist < hullR) {
          touching = true;
          pushOutward(ship, c, hullR, 2);
          ship.speed *= 0.5;
        }
      }
      if (!touching) ship.aground = false;
      if (ship.hp <= 0 && ship.alive) {
        ship.alive = false;
        log(world, { type: 'sunk', ship: ship.id, cause: 'ground' });
      }
    }

    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const a = living[i], b = living[j];
        if (!a.alive || !b.alive) continue;
        const sa = TYPE_STATS[a.type], sb = TYPE_STATS[b.type];
        const ra = sa.length / 3, rb = sb.length / 3;
        const rsum = ra + rb;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < rsum * rsum) {
          const d = Math.sqrt(d2) || 0.001;
          const overlap = rsum - d;
          const nx = dx / d, ny = dy / d;
          const msum = sa.mass + sb.mass;
          a.x -= nx * overlap * (sb.mass / msum);
          a.y -= ny * overlap * (sb.mass / msum);
          b.x += nx * overlap * (sa.mass / msum);
          b.y += ny * overlap * (sa.mass / msum);
          a.speed *= 0.5;
          b.speed *= 0.5;
          a.hp -= 2;
          b.hp -= 2;
          log(world, { type: 'collide', a: a.id, b: b.id });
        }
      }
    }
  }

  function step(world, dt) {
    for (const ship of world.ships) {
      if (ship.alive && ship.hp > 0) stepShip(ship, world, dt);
    }
    resolveCollisions(world);
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Physics = { step, stepShip, resolveCollisions, pointInPolygon, closestPointOnPolygon };
})(typeof window !== 'undefined' ? window : globalThis);
