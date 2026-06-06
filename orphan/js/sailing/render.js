/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SAILING RENDER  —  canvas rendering: sea/islands/ships/fx (no sim)      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   makeViewport(canvas, world) ──► vp{scale,ox,oy,cw,ch}                  │
  │                                                                          │
  │   render(world, ctx, vp, particles) ──► void                             │
  │     ├─ drawSea       (gradient + faint wave hatching)                    │
  │     ├─ drawIsland*   (polygon fill + rocky inner highlight)              │
  │     ├─ drawWake*     (fading position trail per ship)                    │
  │     ├─ drawParticles (smoke / darksmoke / splinter / flash / ball /      │
  │     │                 splash — combat fx + sinking debris)               │
  │     ├─ drawShip*     (oriented hex hull + mast + gun ports + crew)       │
  │     │   └─ drawHPBar (color-stepped fill above each ship)                │
  │     └─ drawWindIndicator (rose + arrow)                                  │
  │                                                                          │
  │   updateWakes(world, dt): per-ship throttled trail capture (~0.5s)       │
  │   updateParticles(ps, dt): age + filter expired                          │
  │   syncEventsToParticles(world, ps, lastIdx): scan new events,            │
  │     spawn smoke at shooter broadside, splash at target                   │
  │                                                                          │
  │   Exports (window.Sailing.Render): { makeViewport, render,               │
  │     updateWakes, updateParticles, syncEventsToParticles, SIDE_COLORS }   │
  │   External deps: Ship.TYPE_STATS                                         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIDE_COLORS: A=blue (hull#3a5a78,accent#7aa8c9,fill#1a2c3a)
               B=red  (hull#8a3a3a,accent#c97a7a,fill#3a1a1a)
  makeViewport(c,w)→ scale=min(c.w/w.w, c.h/w.h); center via ox,oy
  w2c(x,vp)→ x*vp.scale + vp.ox (mirror for y)
  drawSea(ctx,vp)→ linearGradient #0a1820→#0d2030, faint horizontal streaks @0.05α
  drawIsland(ctx,i,vp)→ fill polygon #3a2818, stroke #2a1810, inner circle #4a3828
  drawWake(ctx,s,vp)→ polyline through s.wake[], rgba(200,220,230,0.4)
  drawShip(ctx,s,vp)→
    save; translate(c.x,c.y); rotate(h*π/180)
    hex hull (bow(0,-L/2)→port(-W/2,-L/3)→stern-port(-W/2,L/3)→stern(0,L/2)→...)
    mast line; cannon dots per side; crew dots bobbing
    restore; drawHPBar(s); label if scale>0.4
  drawHPBar(s,stats,vp)→ rect above ship; color = hp%>0.5 green : >0.25 amber : red
  spawnSmokePuff(ps,x,y)→ 4 particles, life~1.2s, growing radius
  spawnSplash(ps,x,y)→ ring expanding 5→20, life 0.5s
  updateWakes(w,dt)→ each 0.5s push {x,y}; cap @20
  syncEventsToParticles(w,ps,last)→ scan w.events from last; per volley with hits:
    smoke at shooter[broadside-perp offset]; splash at target.pos
  render(w,ctx,vp,ps)→ sea; islands; wakes; particles; ships; wind
  exports: global.Sailing.Render={...}
*/
(function (global) {
  'use strict';

  const SIDE_COLORS = {
    A: { hull: '#82b8e8', accent: '#dcefff', fill: '#26425e', wake: 'rgba(220,235,250,0.55)' },
    B: { hull: '#e88880', accent: '#ffe0d4', fill: '#5e2820', wake: 'rgba(250,225,215,0.55)' },
  };

  // Ships are drawn larger than their physical hitbox so the canvas reads
  // well at default zoom. Physics still uses true stats.length/beam.
  const SHIP_VISUAL_SCALE = 2.6;
  // Cannonball flight model (visual only, not part of combat resolution).
  const BALL_SPEED = 180;   // world units per second
  const BALL_MIN_LIFE = 0.35;
  const BALL_GUN_STAGGER = 0.05;

  function makeViewport(canvas, world) {
    const scale = Math.min(canvas.width / world.w, canvas.height / world.h);
    return {
      scale,
      ox: (canvas.width - world.w * scale) / 2,
      oy: (canvas.height - world.h * scale) / 2,
      cw: canvas.width,
      ch: canvas.height,
    };
  }

  function w2cX(x, vp) { return x * vp.scale + vp.ox; }
  function w2cY(y, vp) { return y * vp.scale + vp.oy; }

  function drawSea(ctx, vp) {
    const g = ctx.createLinearGradient(0, 0, 0, vp.ch);
    g.addColorStop(0, '#1f4258');
    g.addColorStop(1, '#28536c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vp.cw, vp.ch);

    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#c0dceb';
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const y = (i + 0.5) * (vp.ch / 16);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vp.cw, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawWindIndicator(ctx, world, vp) {
    const cx = 70, cy = 70, R = 38;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = 'rgba(232,208,160,0.4)';
    ctx.fillStyle = 'rgba(20,20,28,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#c9b48a';
    ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', 0, -R + 9);
    ctx.fillText('S', 0, R - 2);
    ctx.fillText('W', -R + 6, 3);
    ctx.fillText('E', R - 6, 3);

    const toRad = ((world.wind.from + 180) * Math.PI) / 180;
    const len = R - 10;
    const ax = Math.sin(toRad) * len, ay = -Math.cos(toRad) * len;
    ctx.strokeStyle = '#e8d0a0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-ax * 0.7, -ay * 0.7);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const ang = Math.atan2(ay, ax), ah = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ang - 0.5) * ah, ay - Math.sin(ang - 0.5) * ah);
    ctx.lineTo(ax - Math.cos(ang + 0.5) * ah, ay - Math.sin(ang + 0.5) * ah);
    ctx.closePath();
    ctx.fillStyle = '#e8d0a0'; ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#c9b48a';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      'WIND  from ' + Math.round(world.wind.from) + '°  ' + world.wind.strength.toFixed(1) + ' m/s',
      cx + R + 12,
      cy + 4
    );
  }

  function drawIsland(ctx, island, vp) {
    ctx.fillStyle = '#6a5238';
    ctx.strokeStyle = '#3a2818';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < island.vertices.length; i++) {
      const v = island.vertices[i];
      const cx = w2cX(v.x, vp), cy = w2cY(v.y, vp);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#8c6e4c';
    ctx.beginPath();
    ctx.arc(w2cX(island.x, vp), w2cY(island.y, vp), island.base * vp.scale * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#a88a64';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = island.base * 0.3;
      const px = island.x + Math.cos(a) * r;
      const py = island.y + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(w2cX(px, vp), w2cY(py, vp), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWake(ctx, ship, vp) {
    if (!ship.wake || ship.wake.length < 2) return;
    const col = (SIDE_COLORS[ship.side] || SIDE_COLORS.A).wake;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < ship.wake.length; i++) {
      const p = ship.wake[i];
      const cx = w2cX(p.x, vp), cy = w2cY(p.y, vp);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  function drawShip(ctx, ship, vp) {
    const stats = global.Sailing.Ship.TYPE_STATS[ship.type];
    const colors = SIDE_COLORS[ship.side] || SIDE_COLORS.A;
    const L = Math.max(22, stats.length * vp.scale * SHIP_VISUAL_SCALE);
    const W = Math.max(8, stats.beam * vp.scale * SHIP_VISUAL_SCALE);
    const cx = w2cX(ship.x, vp), cy = w2cY(ship.y, vp);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((ship.heading * Math.PI) / 180);

    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = ship.role === 'flagship' ? '#f0d480' : colors.hull;
    ctx.lineWidth = ship.role === 'flagship' ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(0, -L / 2);
    ctx.lineTo(-W / 2, -L / 3);
    ctx.lineTo(-W / 2, L / 3);
    ctx.lineTo(0, L / 2);
    ctx.lineTo(W / 2, L / 3);
    ctx.lineTo(W / 2, -L / 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (ship.role === 'flagship') {
      ctx.strokeStyle = 'rgba(240,212,128,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -L * 0.6);
      ctx.lineTo(-2.5, -L * 0.52);
      ctx.lineTo(2.5, -L * 0.52);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -L / 3);
    ctx.lineTo(0, L / 3);
    ctx.stroke();

    ctx.fillStyle = '#0a0a0a';
    const portCount = Math.min(stats.gunsPerSide, 6);
    const spread = L * 0.55;
    for (let i = 0; i < portCount; i++) {
      const py = -spread / 2 + (i + 0.5) * (spread / portCount);
      ctx.beginPath(); ctx.arc(-W / 2 - 1.5, py, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W / 2 + 1.5, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    const hpPct = Math.max(0, ship.hp) / stats.hp;
    const crewCount = Math.max(2, Math.round(4 * hpPct));
    const t = (ship.id * 1.7 + (performance.now ? performance.now() : 0) * 0.001);
    ctx.fillStyle = colors.accent;
    for (let i = 0; i < crewCount; i++) {
      const cy2 = -L / 3 + (i + 0.5) * (L * 0.66 / crewCount);
      const cx2 = Math.sin(t + i * 1.3) * (W * 0.18);
      ctx.beginPath();
      ctx.arc(cx2, cy2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    drawHPBar(ctx, ship, stats, vp, cx, cy, L);

    if (vp.scale > 0.35) {
      ctx.fillStyle = colors.accent;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        ship.side + '·' + ship.type + (ship.intent ? ' [' + ship.intent + ']' : ''),
        cx,
        cy + L / 2 + 14
      );
    }
  }

  function drawHPBar(ctx, ship, stats, vp, cx, cy, L) {
    const w = Math.max(22, L);
    const h = 3;
    const hpPct = Math.max(0, ship.hp) / stats.hp;
    const x = cx - w / 2;
    const y = cy - L / 2 - 10;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = hpPct > 0.5 ? '#6db66d' : hpPct > 0.25 ? '#c9a050' : '#c95050';
    ctx.fillRect(x, y, w * hpPct, h);
  }

  function drawSinkingMarker(ctx, ship, vp) {
    const cx = w2cX(ship.x, vp), cy = w2cY(ship.y, vp);
    ctx.strokeStyle = 'rgba(180,180,180,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('†', cx, cy + 4);
  }

  function drawParticles(ctx, ps, vp) {
    for (const p of ps) {
      const a = 1 - p.age / p.life;
      const cx = w2cX(p.x, vp), cy = w2cY(p.y, vp);
      if (p.kind === 'smoke') {
        ctx.fillStyle = 'rgba(210,210,215,' + (a * 0.55).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, p.r * vp.scale * 10, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'darksmoke') {
        ctx.fillStyle = 'rgba(60,55,50,' + (a * 0.65).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, p.r * vp.scale * 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'splinter') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p.angle || 0);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.len, 0);
        ctx.lineTo(p.len, 0);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'splash') {
        ctx.strokeStyle = 'rgba(180,210,230,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, (4 + (1 - a) * 14) * Math.max(0.6, vp.scale * 4), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'flash') {
        ctx.fillStyle = 'rgba(255,220,140,' + (a * 0.9).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, 6 * Math.max(0.6, vp.scale * 4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ball') {
        const flight = p.age - p.delay;
        if (flight < 0) continue;
        const t = flight / p.life;
        // Short trail behind the ball
        const trailT = Math.max(0, t - 0.08);
        const trX = w2cX(p.fromX + (p.toX - p.fromX) * trailT, vp);
        const trY = w2cY(p.fromY + (p.toY - p.fromY) * trailT, vp);
        ctx.strokeStyle = 'rgba(40,40,45,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(trX, trY); ctx.lineTo(cx, cy);
        ctx.stroke();
        // The ball itself — black core with subtle highlight
        ctx.fillStyle = '#0c0c0e';
        ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(160,160,170,0.5)';
        ctx.beginPath(); ctx.arc(cx - 0.8, cy - 0.8, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function spawnSmokePuff(ps, x, y) {
    for (let i = 0; i < 14; i++) {
      ps.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7,
        age: 0,
        life: 1.6 + Math.random() * 1.2,
        kind: 'smoke',
        r: 1.5 + Math.random() * 1.1,
      });
    }
  }

  function spawnFlash(ps, x, y) {
    ps.push({ x, y, age: 0, life: 0.22, kind: 'flash' });
  }

  function spawnSplash(ps, x, y) {
    ps.push({ x, y, age: 0, life: 0.55, kind: 'splash' });
  }

  const SPLINTER_COLORS = ['#b88a52', '#946a38', '#7c5428', '#a47844', '#62421e'];

  function spawnWoodSplinter(ps, x, y, vx, vy) {
    ps.push({
      kind: 'splinter',
      x, y, vx, vy,
      age: 0,
      life: 0.7 + Math.random() * 0.5,
      angle: Math.atan2(vy, vx),
      spin: (Math.random() - 0.5) * 8,
      len: 2.5 + Math.random() * 3,
      color: SPLINTER_COLORS[(Math.random() * SPLINTER_COLORS.length) | 0],
    });
  }

  function spawnHitBurst(ps, x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 14 + Math.random() * 28;
      spawnWoodSplinter(ps, x, y, Math.cos(a) * s, Math.sin(a) * s);
    }
    // A puff of dark smoke from the impact too
    for (let i = 0; i < 5; i++) {
      ps.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        age: 0, life: 0.9 + Math.random() * 0.5,
        kind: 'darksmoke', r: 1.0 + Math.random() * 0.6,
      });
    }
  }

  function spawnSinkBurst(ps, x, y) {
    for (let k = 0; k < 12; k++) spawnSplash(ps, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    spawnHitBurst(ps, x, y, 24);
    for (let i = 0; i < 18; i++) {
      ps.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        age: 0, life: 2.2 + Math.random() * 1.2,
        kind: 'smoke', r: 2 + Math.random() * 1.5,
      });
    }
  }

  function spawnCannonBall(ps, fromX, fromY, toX, toY, isHit, gunIdx) {
    const dx = toX - fromX, dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const life = Math.max(BALL_MIN_LIFE, dist / BALL_SPEED);
    ps.push({
      kind: 'ball',
      x: fromX, y: fromY,
      fromX, fromY, toX, toY,
      age: 0, life,
      hit: !!isHit,
      delay: (gunIdx || 0) * BALL_GUN_STAGGER + Math.random() * 0.05,
    });
  }

  function updateParticles(ps, dt) {
    const next = [];
    for (const p of ps) {
      p.age += dt;
      if (p.kind === 'ball') {
        const flight = p.age - p.delay;
        if (flight < 0) {
          p.x = p.fromX; p.y = p.fromY;
          next.push(p);
          continue;
        }
        const t = flight / p.life;
        if (t < 1) {
          p.x = p.fromX + (p.toX - p.fromX) * t;
          p.y = p.fromY + (p.toY - p.fromY) * t;
          next.push(p);
          continue;
        }
        // Arrived. Always a splash; on hits we also kick up wood splinters
        // and a dark powder puff — that's the "wood busting out" feel.
        next.push({ kind: 'splash', x: p.toX, y: p.toY, age: 0, life: 0.55 });
        if (p.hit) spawnHitBurst(next, p.toX, p.toY, 8);
        continue;
      }
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      if (p.kind === 'smoke') {
        p.r += dt * 3.5;
        p.vx *= 0.985; p.vy *= 0.985;
      } else if (p.kind === 'darksmoke') {
        p.r += dt * 2.0;
        p.vx *= 0.97; p.vy *= 0.97;
      } else if (p.kind === 'splinter') {
        p.vx *= 0.92; p.vy *= 0.92;
        if (p.spin) p.angle = (p.angle || 0) + p.spin * dt;
      }
      if (p.age < p.life) next.push(p);
    }
    return next;
  }

  function updateWakes(world, dt) {
    for (const ship of world.ships) {
      if (!ship.alive || ship.hp <= 0) continue;
      if (!ship.wake) ship.wake = [];
      ship.wakeT = (ship.wakeT || 0) + dt;
      if (ship.wakeT >= 0.4) {
        ship.wake.push({ x: ship.x, y: ship.y });
        if (ship.wake.length > 24) ship.wake.shift();
        ship.wakeT = 0;
      }
    }
  }

  function broadsidePoint(ship, side) {
    const stats = global.Sailing.Ship.TYPE_STATS[ship.type];
    const sign = side === 'starboard' ? 1 : -1;
    const rad = (ship.heading * Math.PI) / 180;
    const offset = (stats.beam / 2) * SHIP_VISUAL_SCALE;
    const px = ship.x + Math.cos(rad) * offset * sign;
    const py = ship.y + Math.sin(rad) * offset * sign;
    return { x: px, y: py };
  }

  function syncEventsToParticles(world, particles, lastEventIdx) {
    for (let i = lastEventIdx; i < world.events.length; i++) {
      const e = world.events[i];
      if (e.type === 'volley') {
        const shooter = world.ships.find((s) => s.id === e.shooter);
        const target = world.ships.find((s) => s.id === e.target);
        if (!shooter || !target) continue;
        const bp = broadsidePoint(shooter, e.side);
        spawnFlash(particles, bp.x, bp.y);
        spawnSmokePuff(particles, bp.x, bp.y);
        const totalGuns = e.guns || 1;
        const hits = Math.min(e.hits || 0, totalGuns);
        for (let g = 0; g < totalGuns; g++) {
          const isHit = g < hits;
          const jitter = isHit ? 14 : 55;
          const toX = target.x + (Math.random() - 0.5) * jitter;
          const toY = target.y + (Math.random() - 0.5) * jitter;
          spawnCannonBall(particles, bp.x, bp.y, toX, toY, isHit, g);
        }
      } else if (e.type === 'sunk') {
        const ship = world.ships.find((s) => s.id === e.ship);
        if (ship) spawnSinkBurst(particles, ship.x, ship.y);
      } else if (e.type === 'ground') {
        const ship = world.ships.find((s) => s.id === e.ship);
        if (ship) spawnSplash(particles, ship.x, ship.y);
      }
    }
    return world.events.length;
  }

  function render(world, ctx, vp, particles) {
    drawSea(ctx, vp);
    for (const island of world.islands) drawIsland(ctx, island, vp);
    for (const ship of world.ships) {
      if (ship.alive && ship.hp > 0) drawWake(ctx, ship, vp);
    }
    drawParticles(ctx, particles, vp);
    for (const ship of world.ships) {
      if (!ship.alive || ship.hp <= 0) drawSinkingMarker(ctx, ship, vp);
    }
    for (const ship of world.ships) {
      if (ship.alive && ship.hp > 0) drawShip(ctx, ship, vp);
    }
    drawWindIndicator(ctx, world, vp);
  }

  const NS = (global.Sailing = global.Sailing || {});
  NS.Render = {
    makeViewport, render,
    updateWakes, updateParticles, syncEventsToParticles,
    spawnSmokePuff, spawnSplash, spawnFlash,
    spawnWoodSplinter, spawnHitBurst, spawnSinkBurst,
    SIDE_COLORS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
