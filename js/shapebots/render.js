/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS RENDER  —  per-frame canvas painter for arena + bots + FX     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   render(ctx, battle) ──► void  (called each rAF tick from main.js loop) │
  │      │                                                                   │
  │      ├─ drawArena(ctx)              ──► backdrop, centerline, frame      │
  │      ├─ battle.effects.forEach ──► drawEffect(ctx, e)                    │
  │      │     (meleeArc, shotgunBlast, explosion, healBeam, shieldPulse,    │
  │      │      speedFlash, loadFlash, beamFlash, whirlRing, teleFlash,      │
  │      │      rallyPulse, rootedRing)                                      │
  │      ├─ battle.bots.forEach (alive) ──►                                  │
  │      │     ├─ drawGlyph(ctx, b)     ──► team-colored type + weapon char  │
  │      │     ├─ drawShield(ctx, b)    ──► sulfur ring if shield.hp > 0     │
  │      │     └─ drawHpBar(ctx, b)     ──► hp bar above/below bot           │
  │      └─ battle.projectiles.forEach ──► drawProjectile(ctx, p)            │
  │            (bomb dot+aim ring, snipe rotated streak)                     │
  │                                                                          │
  │   drawTeamMarker(ctx, b)  (unused helper, kept for debug)                │
  │                                                                          │
  │   Exports (window.ShapebotsRender): { render }                           │
  │   External deps: window.ShapebotsData (ARENA)                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  D=global.ShapebotsData
  TEAM_COLOR={player:'#5aa8ff',enemy:'#ff5a5a'}; TYPE_GLYPH={heart:♥,spade:♠,diamond:♦,club:♣}; WEAPON_GLYPH={melee:/,shotgun:<,beam:~,whirl:@,bomb:*,snipe:=,heal:+}
  drawGlyph(ctx,b): stroke+fill type glyph @ pos in TEAM_COLOR; if weapon→small offset(+14,+12) glyph, heal=yellow else team
  drawHpBar(ctx,b): w=32,h=4; frac=hp/maxHp; topY=y-r-10; flip below if topY<2; bg black+team-fill+white border
  drawShield(ctx,b): guard(!b.shield||hp<=0); arc r=radius+6 sulfur glow stroke
  drawTeamMarker(ctx,b): translucent team-color disc (unused, debug)
  drawProjectile(ctx,p): kind==='bomb'→orange dot @ pos + ring @ aim; kind==='snipe'→rotate to vel angle, gold rect
  drawEffect(ctx,e): t=age/ttl; switch kind∈{meleeArc,shotgunBlast(wedge+pellets),explosion(ring+fill),healBeam(line+disc),shieldPulse(expand ring sulfur),speedFlash(green ring),loadFlash(yellow disc),beamFlash(team line+white core),whirlRing(yellow ring),teleFlash(2 rings+dashed line),rallyPulse(gold ring 30→230),rootedRing(pink dashed wobble)}→stroke/fill with alpha=1-t
  drawArena(ctx): fill bg #150a0c; dashed centerline x=w/2; frame strokeRect
  render(ctx,battle): drawArena; ∀e∈effects drawEffect; ∀b∈bots(alive){drawGlyph,drawShield,drawHpBar}; ∀p∈projectiles drawProjectile
  exports: global.ShapebotsRender={render}
*/

// Shapebots — canvas renderer.

(function (global) {
  'use strict';

  const D = global.ShapebotsData;

  const TEAM_COLOR = {
    player: '#5aa8ff',
    enemy:  '#ff5a5a',
  };
  const TYPE_GLYPH = {
    heart:   '♥',
    spade:   '♠',
    diamond: '♦',
    club:    '♣',
  };
  const WEAPON_GLYPH = {
    melee:   '/',
    shotgun: '<',
    beam:    '~',
    whirl:   '@',
    bomb:    '*',
    snipe:   '=',
    heal:    '+',
  };

  function drawGlyph(ctx, b) {
    const ch = TYPE_GLYPH[b.type] || '?';
    const wch = b.programs && b.programs.default && WEAPON_GLYPH[b.programs.default.attack];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Main body glyph.
    ctx.font = 'bold 30px "VT323", "Courier New", monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeText(ch, b.pos.x, b.pos.y + 1);
    ctx.fillStyle = TEAM_COLOR[b.team] || '#ffffff';
    ctx.fillText(ch, b.pos.x, b.pos.y + 1);
    // Weapon glyph — small, bottom-right, slightly muted.
    if (wch) {
      ctx.font = 'bold 18px "VT323", "Courier New", monospace';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      const wx = b.pos.x + 14, wy = b.pos.y + 12;
      ctx.strokeText(wch, wx, wy);
      ctx.fillStyle = wch === '+' ? '#ffd86a' : TEAM_COLOR[b.team];
      ctx.fillText(wch, wx, wy);
    }
    ctx.restore();
  }

  function drawHpBar(ctx, b) {
    const x = b.pos.x, y = b.pos.y;
    const w = 32, h = 4;
    const frac = Math.max(0, b.hp / b.maxHp);
    // Flip below the bot when the top is too close to the canvas edge.
    const topY = y - b.radius - 10;
    const barY = topY < 2 ? (y + b.radius + 4) : topY;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w/2, barY, w, h);
    ctx.fillStyle = TEAM_COLOR[b.team] || '#ffffff';
    ctx.fillRect(x - w/2, barY, w * frac, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w/2 + 0.5, barY + 0.5, w, h);
  }

  function drawShield(ctx, b) {
    if (!b.shield || b.shield.hp <= 0) return;
    const r = b.radius + 6;
    ctx.save();
    // Sulfur glow so it reads against both blue and red bots.
    ctx.shadowColor = 'rgba(255, 220, 120, 0.9)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255, 216, 106, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTeamMarker(ctx, b) {
    ctx.save();
    ctx.fillStyle = b.team === 'player' ? 'rgba(26,255,127,0.35)' : 'rgba(184,0,31,0.35)';
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawProjectile(ctx, p) {
    if (p.kind === 'bomb') {
      ctx.save();
      ctx.fillStyle = '#ff6a00';
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,106,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.aim.x, p.aim.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'snipe') {
      ctx.save();
      const ang = Math.atan2(p.vel.y, p.vel.x);
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-8, -1.5, 16, 3);
      ctx.restore();
    }
  }

  function drawEffect(ctx, e) {
    const k = e.kind;
    const t = e.age / e.ttl;
    if (k === 'meleeArc') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.reach, e.facing - e.arc / 2, e.facing + e.arc / 2);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'shotgunBlast') {
      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - t);
      // Wedge fill.
      ctx.fillStyle = 'rgba(255,200,100,0.5)';
      ctx.beginPath();
      ctx.moveTo(e.pos.x, e.pos.y);
      ctx.arc(e.pos.x, e.pos.y, e.reach, e.facing - e.cone / 2, e.facing + e.cone / 2);
      ctx.closePath();
      ctx.fill();
      // Pellet streaks.
      ctx.strokeStyle = 'rgba(255,220,150,0.95)';
      ctx.lineWidth = 2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const ang = e.facing - e.cone / 2 + (i / (n - 1)) * e.cone;
        const r = e.reach * (0.55 + 0.45 * t);
        ctx.beginPath();
        ctx.moveTo(e.pos.x, e.pos.y);
        ctx.lineTo(e.pos.x + Math.cos(ang) * r, e.pos.y + Math.sin(ang) * r);
        ctx.stroke();
      }
      ctx.restore();
    } else if (k === 'explosion') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#ff6a00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,106,0,${0.4 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius * (0.3 + 0.4 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (k === 'healBeam') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(26,255,127,0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.lineTo(e.to.x, e.to.y);
      ctx.stroke();
      ctx.fillStyle = '#1aff7f';
      ctx.beginPath();
      ctx.arc(e.to.x, e.to.y, 6 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (k === 'shieldPulse') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.shadowColor = 'rgba(255, 220, 120, 0.9)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(255, 216, 106, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, 24 + 48 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'speedFlash') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(180,255,180,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, 14 + 18 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'loadFlash') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = 'rgba(255,200,80,0.85)';
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, 6 + 8 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (k === 'beamFlash') {
      ctx.save();
      ctx.globalAlpha = 0.9 * (1 - t);
      ctx.strokeStyle = TEAM_COLOR[e.team] || '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.pos.x, e.pos.y);
      ctx.lineTo(e.pos.x + Math.cos(e.facing) * e.length, e.pos.y + Math.sin(e.facing) * e.length);
      ctx.stroke();
      // bright core
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (k === 'whirlRing') {
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.strokeStyle = 'rgba(255,220,150,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius * (0.5 + 0.5 * t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'teleFlash') {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = 'rgba(180,160,255,0.9)';
      ctx.lineWidth = 2;
      [e.from, e.to].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 + 18 * t, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(180,160,255,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.lineTo(e.to.x, e.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (k === 'rallyPulse') {
      ctx.save();
      ctx.globalAlpha = 0.9 * (1 - t);
      ctx.strokeStyle = '#ffd86a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, 30 + 200 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'rootedRing') {
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - t * 0.5);
      ctx.strokeStyle = 'rgba(255,80,200,0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, e.radius + 3 * Math.sin(e.age * 12), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function drawArena(ctx) {
    ctx.fillStyle = '#150a0c';
    ctx.fillRect(0, 0, D.ARENA.w, D.ARENA.h);
    // Centerline.
    ctx.strokeStyle = 'rgba(216,200,176,0.12)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(D.ARENA.w / 2, 0);
    ctx.lineTo(D.ARENA.w / 2, D.ARENA.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // Frame.
    ctx.strokeStyle = 'rgba(216,200,176,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, D.ARENA.w - 2, D.ARENA.h - 2);
  }

  function render(ctx, battle) {
    drawArena(ctx);
    battle.effects.forEach(e => drawEffect(ctx, e));
    battle.bots.forEach(b => {
      if (!b.alive) return;
      drawGlyph(ctx, b);
      drawShield(ctx, b);
      drawHpBar(ctx, b);
    });
    battle.projectiles.forEach(p => drawProjectile(ctx, p));
  }

  global.ShapebotsRender = { render };
})(window);
