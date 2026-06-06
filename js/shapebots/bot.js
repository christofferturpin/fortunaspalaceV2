/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS BOT  —  bot factory, spawn placement, stat preview            │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   spawnTeams(playerSpecs, enemySpecs) ──► bots[] (player left, enemy R)  │
  │      │                                                                   │
  │      └─ createBot(spec, team, idx) ──► bot{id,team,hp,atk,speed,range,   │
  │            │                            pos,vel,buffs,cooldowns,...}     │
  │            └─ passiveMods(spec) ──► {dmgMult,rangeMult,hpMult,speedMult} │
  │                                                                          │
  │   previewStats(spec) ──► {hp,atk,speed,range,attackLabel}                │
  │      └─ passiveMods(spec)                                                │
  │                                                                          │
  │   Exports (window.ShapebotsBot): { createBot, spawnTeams, previewStats } │
  │   External deps: window.ShapebotsData (BASE, TYPES, ATTACKS, PASSIVES,   │
  │                                        BATTLE, ARENA)                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  D=global.ShapebotsData
  passiveMods(spec)→{dmgMult,rangeMult,hpMult,speedMult}: guard(!spec.special||kind!=='passive'||!passive)→ret 1s; p=D.PASSIVES[spec.special.passive]; ret p.fields||1
  createBot(spec,team,idx)→bot: t=D.TYPES[spec.type]; a=D.ATTACKS[spec.default.attack]; m=passiveMods(spec); maxHp=round(BASE.hp*t.hpMult*m.hpMult); atk=BASE.atk*t.atkMult; speed=BASE.speed*t.speedMult*m.speedMult; range=a.range*m.rangeMult; ret{id:`${team}-${idx}`,team,idx,name,type,programs:{default,trigger,special},maxHp,hp,atk,speed,range,radius,dmgMult,rangeMult,pos,vel,knockback,facing:team==='player'?0:π,shield:null,buffs:{speed/loaded/rally/rooted},cooldowns:{attack:0,special:0},targetId:null,targetReacquireAt:0,_lastTargetId,_lastTargetDiedAt:-∞,_lastDamagedAt:-∞,alive:T,color,reactionActive:F}
  spawnTeams(playerSpecs,enemySpecs)→bots[]: playerX=BATTLE.spawnInsetX; enemyX=ARENA.w-inset; step=ARENA.h/(N+1); ∀i createBot(player,'player',i) pos=(playerX,step*(i+1)); ∀i createBot(enemy,'enemy',i) pos=(enemyX,step*(i+1)); ret bots
  previewStats(spec)→{hp,atk,speed,range,attackLabel}|null: guard(!spec.type); t=TYPES[type]; a=spec.default.attack?ATTACKS[..]:null; m=passiveMods; ret rounded stats incl mods
  exports: global.ShapebotsBot={createBot,spawnTeams,previewStats}
*/

// Shapebots — Bot factory + stat preview.

(function (global) {
  'use strict';

  const D = global.ShapebotsData;

  function passiveMods(spec) {
    if (!spec.special || spec.special.kind !== 'passive' || !spec.special.passive) {
      return { dmgMult: 1.0, rangeMult: 1.0, hpMult: 1.0, speedMult: 1.0, dmgTakenMult: 1.0 };
    }
    const p = D.PASSIVES[spec.special.passive];
    return {
      dmgMult:      p.dmgMult      || 1.0,
      rangeMult:    p.rangeMult    || 1.0,
      hpMult:       p.hpMult       || 1.0,
      speedMult:    p.speedMult    || 1.0,
      dmgTakenMult: p.dmgTakenMult || 1.0,
    };
  }

  function createBot(spec, team, idx) {
    const typeDef = D.TYPES[spec.type];
    const atkDef  = D.ATTACKS[spec.default.attack];
    const mods    = passiveMods(spec);

    // House odds: enemies get a flat stat buff (the gladiator is meant to be outgunned).
    const buff = (team === 'enemy' && D.ENEMY_BUFF) ? D.ENEMY_BUFF : { hpMult: 1, atkMult: 1, speedMult: 1 };

    const maxHp  = Math.round(D.BASE.hp * typeDef.hpMult * mods.hpMult * buff.hpMult);
    const atk    = D.BASE.atk * typeDef.atkMult * buff.atkMult;
    const speed  = D.BASE.speed * typeDef.speedMult * mods.speedMult * buff.speedMult;
    const radius = D.BASE.radius;
    const range  = atkDef.range * mods.rangeMult;

    return {
      id: `${team}-${idx}`,
      team,
      idx,
      name: spec.name || `Bot ${idx + 1}`,
      type: spec.type,
      programs: {
        default: spec.default,
        trigger: spec.trigger || null,
        special: spec.special,
      },
      maxHp, hp: maxHp,
      atk, speed, range,
      radius,
      dmgMult: mods.dmgMult,
      rangeMult: mods.rangeMult,
      dmgTakenMult: mods.dmgTakenMult,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      knockback: { x: 0, y: 0, until: 0 },
      facing: team === 'player' ? 0 : Math.PI,
      shield: null,
      buffs: {
        speedUntil: 0, speedMult: 1.0,
        loadedShot: false,
        rallyUntil: 0, rallyMult: 1.0,
        rootedUntil: 0,
        invulnUntil: 0,
        enrageUntil: 0, enrageMult: 1.0,
      },
      cooldowns: { attack: 0, special: 0 },
      targetId: null,
      targetReacquireAt: 0,
      _lastTargetId: null,
      _lastTargetDiedAt: -Infinity,
      _lastDamagedAt: -Infinity,
      _lastKillAt: -Infinity,
      alive: true,
      color: typeDef.color,
      reactionActive: false,
    };
  }

  function spawnTeams(playerSpecs, enemySpecs) {
    const bots = [];
    const playerX = D.BATTLE.spawnInsetX;
    const enemyX  = D.ARENA.w - D.BATTLE.spawnInsetX;
    const step = D.ARENA.h / (playerSpecs.length + 1);

    playerSpecs.forEach((spec, i) => {
      const b = createBot(spec, 'player', i);
      b.pos.x = playerX;
      b.pos.y = step * (i + 1);
      bots.push(b);
    });
    enemySpecs.forEach((spec, i) => {
      const b = createBot(spec, 'enemy', i);
      b.pos.x = enemyX;
      b.pos.y = step * (i + 1);
      bots.push(b);
    });
    return bots;
  }

  function previewStats(spec) {
    if (!spec.type) return null;
    const t = D.TYPES[spec.type];
    const a = (spec.default && spec.default.attack) ? D.ATTACKS[spec.default.attack] : null;
    const mods = passiveMods(spec);
    return {
      hp:    Math.round(D.BASE.hp * t.hpMult * mods.hpMult),
      atk:   +(D.BASE.atk * t.atkMult * mods.dmgMult).toFixed(1),
      speed: Math.round(D.BASE.speed * t.speedMult * mods.speedMult),
      range: a ? Math.round(a.range * mods.rangeMult) : null,
      attackLabel: a ? a.label : null,
    };
  }

  global.ShapebotsBot = { createBot, spawnTeams, previewStats };
})(window);
