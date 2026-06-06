/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS BATTLE  —  fixed-timestep sim: AI, attacks, projectiles, win  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   createBattle(playerSpecs, enemySpecs) ──► battle{bots,projectiles,     │
  │      │                                       effects,events,winner,...}  │
  │      └─ ShapebotsBot.spawnTeams(...)                                     │
  │                                                                          │
  │   step(battle, dt) ──► void  (called repeatedly by main.js loop)         │
  │      │                                                                   │
  │      ├─ 1. projectiles                                                   │
  │      │     ├─ bomb  ──► travel → AoE applyDamage(falloff) → explosion FX │
  │      │     └─ snipe ──► homing turn → pierce hits applyDamage/Knockback  │
  │      ├─ 2. effects age (cull when age >= ttl)                            │
  │      ├─ 3. per-bot AI for each alive bot:                                │
  │      │     ├─ detect target death ─► stamp _lastTargetDiedAt             │
  │      │     ├─ active special: evalTrigger ─► fireEffect ─► set cooldown  │
  │      │     ├─ resolveProgram(self, battle) ──► {attack,target,move}      │
  │      │     │     └─ evalTrigger(reaction.trigger)                        │
  │      │     ├─ pickTarget(self, prog, bots) ──► target | null             │
  │      │     ├─ regenerate passive ─► +hp                                  │
  │      │     ├─ pickMoveTarget(self, moveId, battle) ──► movement intent   │
  │      │     │     (kite, orbit, spread, charge, hold, approach)           │
  │      │     ├─ knockback decay + integrate vel ─► pos                     │
  │      │     ├─ soft separation push                                       │
  │      │     └─ if target in range & atk cd≤0 ─► fireAttack(self,target)   │
  │      └─ 4. checkWin(battle) ──► sets battle.winner, battle.reason        │
  │                                                                          │
  │   fireAttack(self, target, battle) ──► void                              │
  │      switches on atkDef: melee arc / shotgun cone / beam line / whirl    │
  │      AoE / bomb projectile / snipe projectile / heal beam                │
  │      └─ applyDamage / applyHeal / applyKnockback / push effect / log     │
  │                                                                          │
  │   fireEffect(self, effectId, battle) ──► bool (fired?)                   │
  │      aegis / bulwark / pulseHeal / adrenaline / loadedShot / detonate    │
  │      / teleport / rally / lockdown                                       │
  │      └─ pickAlly(self, battle, rule)                                     │
  │                                                                          │
  │   applyDamage(target,amt,sourceBot,t,battle,opts) ──► amt                │
  │      ├─ shield absorb first, then hp                                     │
  │      ├─ on death: stamp _teamDeathT, _lastTargetDiedAt, log              │
  │      ├─ thorns reflect (opts.noReflect guards recursion)                 │
  │      └─ vampiric heal on sourceBot                                       │
  │   applyHeal(target, amt) ──► healedAmt                                   │
  │   applyKnockback(target, fromPos, mag, dur, t)                           │
  │   damageScalar(self, battle) ──► rally×berserk multiplier                │
  │                                                                          │
  │   evalTrigger(triggerId, self, battle) ──► bool                          │
  │      switch over all D.TRIGGERS ids                                      │
  │   isPassive(self, name) ──► bool                                         │
  │                                                                          │
  │   Helpers: dist, distBots, angleBetween, normalize, alive, logEvent      │
  │                                                                          │
  │   Exports (window.ShapebotsBattle): { createBattle, step }               │
  │   External deps: window.ShapebotsData (all maps + BATTLE/ARENA),         │
  │                  window.ShapebotsBot (spawnTeams)                        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  D=global.ShapebotsData
  dist(a,b)=hypot(dx,dy); distBots=dist(a.pos,b.pos); angleBetween(from,to)=atan2(dy,dx); normalize(vx,vy)→{x,y}|{0,0} if m<1e-6
  createBattle(playerSpecs,enemySpecs)→battle: bots=Bot.spawnTeams; ret{tick:0,t:0,bots,projectiles:[],effects:[],events:[],lastHealStalemateCheck:0,winner:null,reason:null,_origTeamCount:{player,enemy},_teamDeathT:{player:-∞,enemy:-∞}}
  alive(bots,team)→bots.filter(alive&&team); logEvent(battle,text,team): push{t,text,team||'neutral'}; trim>30
  evalTrigger(id,self,battle)→bool: switch over D.TRIGGERS;
    always:T; myHpUnder60/30:hp/maxHp<frac; allyHpUnder40:any ally<40%; hitRecently:(t-_lastDamagedAt)<recentHitWindow; targetJustDied:similar; enemyInMelee:any enemy<meleeNearbyRadius;
    allyJustDied:(t-_teamDeathT[team])<recentAllyDeathWindow; halfTeamDown:liveN<=orig/2; outnumbered:meCount<themCount; firstFiveSec:t<5; noTargetInRange:no targetId||dead||dist>range+radius; surrounded:count enemies within 200>=3
  isPassive(self,name)→bool: special.kind==='passive'&&special.passive===name
  pickTarget(self,prog,bots)→bot|null: side=ATTACKS[prog.attack].targetSide; pool=alive&¬self&&(side==='ally'?same:opp); empty→null; rule=TARGETS[prog.target].pick∈{nearest/furthest/lowestHp/highestHp/mostDamaged}→reduce accordingly; mostDamaged: filter dmgd→pick latest, fallback lowestHp
  pickMoveTarget(self,moveId,battle)→bot|null: enemies/allies pools; switch moveId∈{approachNearest/FurthestEnemy: pick by dist; goToLowestHpAlly: lowestHp ally; goToAttackedAlly: recent dmg(<2s) latest or lowestHp ally; kiteShort/Medium/Long: nearest enemy; hold: null}
  pickAlly(self,battle,rule)→bot|null: pool=team allies≠self; nearest/lowestHp reduce; default pool[0]
  applyDamage(target,amt,sourceBot,t,battle,opts)→amt:
    guard(!target.alive)→0; shield absorbs first(min(shield.hp,remaining)); shield<=0→null;
    remaining→hp-=; _lastDamagedAt=t; hp<=0→alive=F,diedAt=t,battle._teamDeathT[team]=t,∀bots if _lastTargetId===target.id→_lastTargetDiedAt=t, logEvent killer-name
    thorns: !opts.noReflect&&sourceBot&&≠target&&alive&&cross-team&&isPassive(target,'thorns')→applyDamage(source,amt*thornsFrac,target,t,b,{noReflect:T})
    vampiric: sourceBot alive&&cross-team&&isPassive(source,'vampiric')→source.hp=min(maxHp,hp+amt*vampFrac); ret amt
  applyHeal(target,amt)→healed: guard(!alive)→0; before=hp; hp=min(maxHp,hp+amt); ret hp-before
  applyKnockback(target,fromPos,mag,dur,t): guard(!alive||mag<=0); dir=normalize(pos-fromPos); knockback={x:dir*mag,y:dir*mag,until:t+dur}
  damageScalar(self,battle)→m: m=1; rallyUntil&&t<until→m*=rallyMult; isPassive(berserk)→m*=1+berserkMax*(1-hp/maxHp); ret m
  fireAttack(self,target,battle): atkDef=ATTACKS[default.attack]; loadedMult=1, consume buffs.loadedShot(>1)→loadedMult+loadFlash; runtimeMul=damageScalar; dmg=atk*dmgCoeff*dmgMult*loadedMult*runtimeMul
    melee: arcRad=arcDeg*π/180; facing=angleBetween(self,target); ∀b∈enemies if dist<=reach+r && |angDelta|<=arc/2 → applyDamage+applyKnockback; push meleeArc effect; log
    shotgun: coneRad; ∀enemy in cone within maxRange→falloff=1-tRange*(1-falloffEdge); applyDamage*falloff+knockback; push shotgunBlast
    beam: project along facing axis; ∀enemy if along∈[0,maxR+r]&&|perp|<=halfWidth+r→applyDamage(no knockback); push beamFlash
    whirl: r=range*rangeMult; ∀enemy within r+radius→applyDamage+knockback; push whirlRing; log hits count
    bomb: dir to target; push projectile{kind:'bomb',ownerRef,team,pos,vel=dir*speed,aim=target.pos,aoeRadius,falloffEdge,dmg,ttl:3}
    snipe: push projectile{kind:'snipe',ownerRef,team,pos,vel,speed,homingRate,targetId,knockback,dmg,hitSet:Set,ttl:2}
    heal: applyHeal(target,healAmount); push healBeam effect; log
  fireEffect(self,effectId,battle)→bool: eff=EFFECTS[id]; switch:
    aegis: self.shield={hp:shieldHp}+shieldPulse FX→T
    bulwark: ally=pickAlly(nearest); !ally→F; ally.shield={hp}+shieldPulse→T
    pulseHeal: ally=lowestHp; applyHeal(healAmount)+healBeam→T
    adrenaline: buffs.speedUntil=t+duration,speedMult=eff.speedMult+speedFlash→T
    loadedShot: buffs.loadedShot=dmgMult+loadFlash→T
    detonate: r=aoeRadius*rangeMult; ∀enemy in r→applyDamage(atk*dmgMult*dmgMult); explosion FX→T
    teleport: ally=lowestHp; offset by angle×24; clamp to arena; teleFlash from→to→T
    rally: ∀b∈team alive→buffs.rallyUntil=t+duration,rallyMult=dmgMult; rallyPulse FX→T
    lockdown: nearest enemy; dist>range→F; buffs.rootedUntil=t+duration; rootedRing FX→T
  resolveProgram(self,battle)→{attack,target,move}: r=programs.reaction; if r.trigger&&r.override&&evalTrigger(r.trigger)→reactionActive=T; isMove=MOVES[r.override]; isTarget=TARGETS[r.override]; ret default with one dim swapped; else reactionActive=F; ret default
  step(battle,dt):
    1.projectiles iter from end: ttl-=dt;
      bomb: integrate pos+=vel*dt; reachedAim(dist<max(8,speed*dt))||ttl<=0→∀enemy in aoeRadius→falloff=1-(d/aoeRadius)*(1-falloffEdge); applyDamage; explosion FX; log hits; splice
      snipe: tgt=find(targetId,alive); homing turn≤homingRate*dt; pos+=vel*dt; ∀enemy not in hitSet&&dist<=radius+4→hitSet.add,applyDamage,applyKnockback,log; offscreen||ttl<=0→splice
    2.effects: age+=dt; age>=ttl→splice
    3.∀alive bot: cd.attack-=dt; cd.special-=dt
      detect target death: cur=find(targetId); !alive→_lastTargetDiedAt=t,_lastTargetId=targetId,targetId=null
      active special: special.kind==='active'&&cd.special<=0&&evalTrigger(trigger||'always')→fireEffect→cd.special=eff.cooldown+log
      prog=resolveProgram; reacquire target if invalid(wrong side|dead)||t>=targetReacquireAt→pickTarget; targetReacquireAt=t+0.5
      regenerate passive: hp=min(maxHp,hp+regenPerSec*dt)
      movement: desired={0,0}; rooted=t<rootedUntil→skip;
        isKite: deadzone=12; d<desired-dz→push away; d>desired+dz→approach
        isOrbit: tangent dir + bias toward/away to maintain orbitDist
        isSpread: nearest ally within spreadDist→push away
        isCharge: stopDist=range+radius-4; d>stopDist→approach with moveSpeedMul=speedMult
        hold:{0,0}; default approach until stopDist
      speedMult=t<speedUntil?buffs.speedMult:1; mvx/y=desired*speed*speedMult*moveSpeedMul
      knockback active(t<until)→mv=mv*knockbackMoveScale+knockback; decay; else zero
      pos+=mv*dt
      soft separation ∀other alive within (rSum)→push apart by separationPush*push*dt
      clamp pos to arena
      attack: target&&cd.attack<=0&&dist<=range+target.radius→fireAttack; cd.attack=cooldown; face target
    4.checkWin
  checkWin(battle): pAlive,eAlive; both0→player(mutual); p0→enemy(annihilation); e0→player(annihilation);
    t>=healStalemateAfter && t-lastCheck>=healStalemateCheckEvery→lastCheck=t; pAttackers=filter≠heal; eAttackers=…; one side 0 attackers&&other>0→winner=other(healStalemate)
    t>=timeoutSec→pScore=Σ(hp/maxHp); winner=higher; tie→player; reason='timeout'
  exports: global.ShapebotsBattle={createBattle,step}
*/

// Shapebots — fixed-timestep sim.
// Resolves Default vs Reaction each tick, evaluates Active Special triggers,
// fires effects, runs movement and attacks, projectiles, win checks.

(function (global) {
  'use strict';

  const D = global.ShapebotsData;

  // ----- helpers -----
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function distBots(a, b) { return dist(a.pos, b.pos); }
  function angleBetween(from, to) { return Math.atan2(to.y - from.y, to.x - from.x); }
  function normalize(vx, vy) {
    const m = Math.hypot(vx, vy);
    if (m < 1e-6) return { x: 0, y: 0 };
    return { x: vx / m, y: vy / m };
  }

  // ----- battle init -----
  function createBattle(playerSpecs, enemySpecs) {
    const bots = global.ShapebotsBot.spawnTeams(playerSpecs, enemySpecs);
    return {
      tick: 0,
      t: 0,
      bots,
      projectiles: [],
      effects: [],
      events: [],          // action log: { t, text, team }
      lastHealStalemateCheck: 0,
      winner: null,
      reason: null,
      _origTeamCount: {
        player: bots.filter(b => b.team === 'player').length,
        enemy:  bots.filter(b => b.team === 'enemy').length,
      },
      _teamDeathT: { player: -Infinity, enemy: -Infinity },
    };
  }

  function alive(bots, team) { return bots.filter(b => b.alive && b.team === team); }

  function logEvent(battle, text, team) {
    if (!battle.events) battle.events = [];
    battle.events.push({ t: battle.t, text, team: team || 'neutral' });
    if (battle.events.length > 30) battle.events.shift();
  }

  // ----- trigger evaluation -----
  function evalTrigger(triggerId, self, battle) {
    if (!triggerId) return false;
    const T = battle.t;
    const B = D.BATTLE;
    switch (triggerId) {
      case 'always':         return true;
      case 'myHpUnder60':    return self.hp / self.maxHp < 0.60;
      case 'myHpUnder30':    return self.hp / self.maxHp < 0.30;
      case 'allyHpUnder40':  return battle.bots.some(b => b.alive && b.team === self.team && b.id !== self.id && b.hp / b.maxHp < 0.40);
      case 'hitRecently':    return (T - self._lastDamagedAt) < B.recentHitWindow;
      case 'targetJustDied': return (T - self._lastTargetDiedAt) < B.recentTargetDeathWindow;
      case 'enemyInMelee':   return battle.bots.some(b => b.alive && b.team !== self.team && distBots(self, b) < B.meleeNearbyRadius);
      case 'allyJustDied':   return (T - battle._teamDeathT[self.team]) < B.recentAllyDeathWindow;
      case 'halfTeamDown': {
        const orig  = battle._origTeamCount[self.team];
        const liveN = battle.bots.filter(b => b.alive && b.team === self.team).length;
        return liveN <= Math.floor(orig / 2);
      }
      case 'outnumbered': {
        const me   = battle.bots.filter(b => b.alive && b.team === self.team).length;
        const them = battle.bots.filter(b => b.alive && b.team !== self.team).length;
        return me < them;
      }
      case 'firstFiveSec':    return T < 5.0;
      case 'noTargetInRange': {
        if (!self.targetId) return true;
        const t = battle.bots.find(b => b.id === self.targetId);
        if (!t || !t.alive) return true;
        return distBots(self, t) > self.range + t.radius;
      }
      case 'surrounded': {
        let n = 0;
        for (const b of battle.bots) {
          if (b.alive && b.team !== self.team && distBots(self, b) < 200) n++;
        }
        return n >= 3;
      }
      case 'onKill':         return (T - self._lastKillAt) < 2.0;
    }
    return false;
  }

  function isPassive(self, name) {
    return self.programs && self.programs.special &&
           self.programs.special.kind === 'passive' &&
           self.programs.special.passive === name;
  }

  // ----- target / move pickers -----
  function pickTarget(self, prog, bots) {
    const atkDef = D.ATTACKS[prog.attack];
    const side = atkDef.targetSide;
    const pool = bots.filter(b => b.alive && b.id !== self.id && (side === 'ally' ? b.team === self.team : b.team !== self.team));
    if (pool.length === 0) {
      // Healer fallback: with no allies left to heal, hunt the nearest enemy instead.
      // fireAttack's heal branch detects the enemy target and swings a weak strike.
      if (atkDef.isHeal) {
        const enemies = bots.filter(b => b.alive && b.id !== self.id && b.team !== self.team);
        if (enemies.length) return enemies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
      }
      return null;
    }
    const rule = D.TARGETS[prog.target] && D.TARGETS[prog.target].pick;
    switch (rule) {
      case 'nearest':     return pool.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
      case 'furthest':    return pool.reduce((a, b) => distBots(self, a) >= distBots(self, b) ? a : b);
      case 'lowestHp':    return pool.reduce((a, b) => a.hp <= b.hp ? a : b);
      case 'highestHp':   return pool.reduce((a, b) => a.hp >= b.hp ? a : b);
      case 'mostDamaged': {
        const dmgd = pool.filter(b => b._lastDamagedAt > -Infinity);
        if (dmgd.length === 0) return pool.reduce((a, b) => a.hp <= b.hp ? a : b);
        return dmgd.reduce((a, b) => b._lastDamagedAt > a._lastDamagedAt ? b : a);
      }
      case 'random':      return pool[Math.floor(Math.random() * pool.length)];
    }
    return pool[0];
  }

  function pickMoveTarget(self, moveId, battle) {
    const bots = battle.bots;
    const enemies = bots.filter(b => b.alive && b.team !== self.team);
    const allies  = bots.filter(b => b.alive && b.team === self.team && b.id !== self.id);
    // Helper: prefer the bot's current attack target (if a valid enemy), else nearest enemy.
    // Used by approach/charge/strafe so movement always tracks who the bot is shooting —
    // otherwise a melee bot with target=lowestHpEnemy walks to the nearest enemy and
    // freezes there without ever entering attack range of its real target.
    const attackOrNearest = () => {
      if (self.targetId) {
        const t = battle.bots.find(b => b.id === self.targetId && b.alive && b.team !== self.team);
        if (t) return t;
      }
      if (!enemies.length) return null;
      return enemies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
    };
    switch (moveId) {
      case 'approachNearestEnemy':
      case 'chargeNearestEnemy':
      case 'strafeNearestEnemy':
        return attackOrNearest();
      case 'approachFurthestEnemy':
        if (!enemies.length) return null;
        return enemies.reduce((a, b) => distBots(self, a) >= distBots(self, b) ? a : b);
      case 'goToLowestHpAlly':
        if (!allies.length) return null;
        return allies.reduce((a, b) => a.hp <= b.hp ? a : b);
      case 'goToAttackedAlly': {
        const recent = allies.filter(a => (battle.t - a._lastDamagedAt) < 2.0);
        if (recent.length) return recent.reduce((a, b) => b._lastDamagedAt > a._lastDamagedAt ? b : a);
        if (!allies.length) return null;
        return allies.reduce((a, b) => a.hp <= b.hp ? a : b);
      }
      case 'kiteShort':
      case 'kiteMedium':
      case 'kiteLong':
        if (!enemies.length) return null;
        return enemies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
      case 'followAllyA':
      case 'followAllyB':
      case 'followAllyC':
      case 'followAllyD':
      case 'followAllyE': {
        const def = D.MOVES[moveId];
        const slot = def && def.allyIdx;
        const picked = battle.bots.find(b => b.alive && b.team === self.team && b.idx === slot && b.id !== self.id);
        if (picked) return picked;
        // Graceful fallback: nearest living ally if the targeted slot is empty.
        if (allies.length) return allies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
        return null;
      }
      case 'spreadOut':
      case 'hold':
        return null;
    }
    return null;
  }

  function pickAlly(self, battle, rule) {
    const pool = battle.bots.filter(b => b.alive && b.team === self.team && b.id !== self.id);
    if (pool.length === 0) return null;
    if (rule === 'nearest')   return pool.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
    if (rule === 'lowestHp')  return pool.reduce((a, b) => a.hp <= b.hp ? a : b);
    return pool[0];
  }

  // ----- damage / heal / knockback -----
  // sourceBot may be null (e.g., thorns reflection, environmental). Vampiric/Thorns/etc. consult it.
  function applyDamage(target, amount, sourceBot, t, battle, opts) {
    opts = opts || {};
    if (!target.alive) return 0;
    // Phase Shift: ignore incoming damage entirely while the invuln window is up.
    if (target.buffs && target.buffs.invulnUntil && t < target.buffs.invulnUntil) return 0;
    // Glass Cannon: amplify incoming damage by the target's dmgTakenMult.
    let remaining = amount * (target.dmgTakenMult || 1.0);
    if (target.shield && target.shield.hp > 0) {
      const absorbed = Math.min(target.shield.hp, remaining);
      target.shield.hp -= absorbed;
      remaining -= absorbed;
      if (target.shield.hp <= 0) target.shield = null;
    }
    if (remaining > 0) {
      target.hp -= remaining;
      target._lastDamagedAt = t;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.diedAt = t;
        if (global.Sound) global.Sound.botDown(target.team);
        if (battle) {
          battle._teamDeathT[target.team] = t;
          battle.bots.forEach(b => { if (b.alive && b._lastTargetId === target.id) b._lastTargetDiedAt = t; });
          const killer = sourceBot && sourceBot.alive ? sourceBot.name : null;
          logEvent(battle, killer ? `${target.name} is down (killed by ${killer})` : `${target.name} is down`, target.team);
          // Stamp kill on the killer for the `onKill` trigger.
          if (sourceBot && sourceBot.alive && target.team !== sourceBot.team) {
            sourceBot._lastKillAt = t;
          }
        }
      }
    }
    // Thorns: reflect a fraction of HP damage actually taken (not shield-absorbed).
    if (!opts.noReflect && remaining > 0 && sourceBot && sourceBot !== target && sourceBot.alive && target.team !== sourceBot.team) {
      if (isPassive(target, 'thorns')) {
        const frac = D.PASSIVES.thorns.thornsFrac;
        applyDamage(sourceBot, remaining * frac, target, t, battle, { noReflect: true });
      }
    }
    // Vampiric: heal a fraction of HP damage actually dealt (shield-absorbed damage does not heal).
    if (remaining > 0 && sourceBot && sourceBot.alive && target.team !== sourceBot.team && isPassive(sourceBot, 'vampiric')) {
      const frac = D.PASSIVES.vampiric.vampFrac;
      sourceBot.hp = Math.min(sourceBot.maxHp, sourceBot.hp + remaining * frac);
    }
    return amount;
  }

  function applyHeal(target, amount) {
    if (!target.alive) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    return target.hp - before;
  }

  function applyKnockback(target, fromPos, magnitude, dur, t) {
    if (!target.alive || magnitude <= 0) return;
    const dir = normalize(target.pos.x - fromPos.x, target.pos.y - fromPos.y);
    target.knockback.x = dir.x * magnitude;
    target.knockback.y = dir.y * magnitude;
    target.knockback.until = t + dur;
  }

  // Compute a bot's runtime damage multiplier from rally + berserk passives.
  function damageScalar(self, battle) {
    let m = 1.0;
    if (self.buffs.rallyUntil && battle.t < self.buffs.rallyUntil) m *= (self.buffs.rallyMult || 1.0);
    if (isPassive(self, 'berserk')) {
      const missing = 1 - (self.hp / self.maxHp);
      m *= 1 + D.PASSIVES.berserk.berserkMax * missing;
    }
    return m;
  }

  // ----- attack firing -----
  function fireAttack(self, target, battle) {
    const atkDef = D.ATTACKS[self.programs.default.attack];

    // Loaded Shot consumed on first non-heal fire.
    let loadedMult = 1.0;
    if (!atkDef.isHeal && self.buffs.loadedShot && self.buffs.loadedShot > 1.0) {
      loadedMult = self.buffs.loadedShot;
      self.buffs.loadedShot = 0;
      battle.effects.push({ kind: 'loadFlash', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.3 });
    }
    const runtimeMul = damageScalar(self, battle);
    const dmg = self.atk * (atkDef.dmgCoeff || 0) * self.dmgMult * loadedMult * runtimeMul;

    if (atkDef === D.ATTACKS.melee) {
      if (global.Sound) global.Sound.melee();
      const arcRad = (atkDef.arcDeg * Math.PI) / 180;
      const facing = angleBetween(self.pos, target.pos);
      self.facing = facing;
      const arcReach = atkDef.range * self.rangeMult;
      const targetBefore = target.hp;
      battle.bots.forEach(b => {
        if (!b.alive || b.team === self.team) return;
        const d = distBots(self, b);
        if (d > arcReach + b.radius) return;
        const ang = angleBetween(self.pos, b.pos);
        const da = Math.abs(((ang - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da <= arcRad / 2) {
          applyDamage(b, dmg, self, battle.t, battle);
          applyKnockback(b, self.pos, atkDef.knockback, atkDef.knockbackDur, battle.t);
        }
      });
      battle.effects.push({ kind: 'meleeArc', pos: { x: self.pos.x, y: self.pos.y }, facing, reach: arcReach, arc: arcRad, color: self.color, age: 0, ttl: 0.18 });
      if (target.alive) {
        const taken = Math.max(0, targetBefore - target.hp);
        logEvent(battle, `${self.name} Melee hits ${target.name} for ${taken} → ${target.hp}/${target.maxHp}`, self.team);
      }
      return;
    }
    if (atkDef === D.ATTACKS.shotgun) {
      if (global.Sound) global.Sound.shotgun();
      const coneRad = (atkDef.coneDeg * Math.PI) / 180;
      const facing = angleBetween(self.pos, target.pos);
      self.facing = facing;
      const maxRange = atkDef.range * self.rangeMult;
      const targetBefore = target.hp;
      battle.bots.forEach(b => {
        if (!b.alive || b.team === self.team) return;
        const d = distBots(self, b);
        if (d > maxRange + b.radius) return;
        const ang = angleBetween(self.pos, b.pos);
        const da = Math.abs(((ang - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da <= coneRad / 2) {
          const tRange = Math.min(1, d / maxRange);
          const falloff = 1 - tRange * (1 - atkDef.falloffEdge);
          applyDamage(b, dmg * falloff, self, battle.t, battle);
          applyKnockback(b, self.pos, atkDef.knockback, atkDef.knockbackDur, battle.t);
        }
      });
      battle.effects.push({ kind: 'shotgunBlast', pos: { x: self.pos.x, y: self.pos.y }, facing, reach: maxRange, cone: coneRad, age: 0, ttl: 0.22 });
      if (target.alive) {
        const taken = Math.max(0, targetBefore - target.hp);
        logEvent(battle, `${self.name} Shotgun hits ${target.name} for ${taken} → ${target.hp}/${target.maxHp}`, self.team);
      }
      return;
    }
    if (atkDef === D.ATTACKS.beam) {
      if (global.Sound) global.Sound.beam();
      const facing = angleBetween(self.pos, target.pos);
      self.facing = facing;
      const maxR = atkDef.range * self.rangeMult;
      const halfWidth = atkDef.beamWidth;
      const cos = Math.cos(facing), sin = Math.sin(facing);
      const targetBefore = target.hp;
      battle.bots.forEach(b => {
        if (!b.alive || b.team === self.team) return;
        const dx = b.pos.x - self.pos.x;
        const dy = b.pos.y - self.pos.y;
        const along = dx * cos + dy * sin;
        if (along < 0 || along > maxR + b.radius) return;
        const perp = -dx * sin + dy * cos;
        if (Math.abs(perp) > halfWidth + b.radius) return;
        applyDamage(b, dmg, self, battle.t, battle);
      });
      battle.effects.push({ kind: 'beamFlash', pos: { x: self.pos.x, y: self.pos.y }, facing, length: maxR, team: self.team, age: 0, ttl: 0.12 });
      if (target.alive) {
        const taken = Math.max(0, targetBefore - target.hp);
        logEvent(battle, `${self.name} Beam hits ${target.name} for ${taken} → ${target.hp}/${target.maxHp}`, self.team);
      }
      return;
    }
    if (atkDef === D.ATTACKS.whirl) {
      if (global.Sound) global.Sound.whirl();
      const r = atkDef.range * self.rangeMult;
      let hits = 0;
      battle.bots.forEach(b => {
        if (!b.alive || b.team === self.team) return;
        if (distBots(self, b) <= r + b.radius) {
          applyDamage(b, dmg, self, battle.t, battle);
          applyKnockback(b, self.pos, atkDef.knockback, atkDef.knockbackDur, battle.t);
          hits++;
        }
      });
      battle.effects.push({ kind: 'whirlRing', pos: { x: self.pos.x, y: self.pos.y }, radius: r, age: 0, ttl: 0.3 });
      logEvent(battle, `${self.name} Whirl hits ${hits} ${hits === 1 ? 'enemy' : 'enemies'}`, self.team);
      return;
    }
    if (atkDef === D.ATTACKS.bomb) {
      if (global.Sound) global.Sound.bombLaunch();
      const dir = normalize(target.pos.x - self.pos.x, target.pos.y - self.pos.y);
      battle.projectiles.push({
        kind: 'bomb', ownerId: self.id, ownerRef: self, team: self.team,
        pos: { x: self.pos.x, y: self.pos.y },
        vel: { x: dir.x * atkDef.projectileSpeed, y: dir.y * atkDef.projectileSpeed },
        aim: { x: target.pos.x, y: target.pos.y },
        speed: atkDef.projectileSpeed,
        aoeRadius: atkDef.aoeRadius * self.rangeMult,
        falloffEdge: atkDef.aoeFalloffEdge,
        dmg, ttl: 3.0,
      });
      logEvent(battle, `${self.name} lobs Bomb at ${target.name}`, self.team);
      return;
    }
    if (atkDef === D.ATTACKS.snipe) {
      if (global.Sound) global.Sound.snipe();
      const dir = normalize(target.pos.x - self.pos.x, target.pos.y - self.pos.y);
      battle.projectiles.push({
        kind: 'snipe', ownerId: self.id, ownerRef: self, team: self.team,
        pos: { x: self.pos.x, y: self.pos.y },
        vel: { x: dir.x * atkDef.projectileSpeed, y: dir.y * atkDef.projectileSpeed },
        speed: atkDef.projectileSpeed,
        homingRate: (atkDef.homingRateDeg * Math.PI / 180),
        targetId: target.id,
        knockback: atkDef.knockback, knockbackDur: atkDef.knockbackDur,
        dmg, hitSet: new Set(), ttl: 2.0,
      });
      logEvent(battle, `${self.name} snipes at ${target.name}`, self.team);
      return;
    }
    if (atkDef === D.ATTACKS.chainLightning) {
      if (global.Sound) global.Sound.chainZap();
      const facing = angleBetween(self.pos, target.pos);
      self.facing = facing;
      const hit = new Set();
      let curBot = target;
      let curDmg = dmg;
      let lastPos = { x: self.pos.x, y: self.pos.y };
      const maxHops = atkDef.chainHops || 0;
      const chainRange = atkDef.chainRange || 150;
      const falloff = atkDef.chainFalloff || 0.75;
      const before = target.hp;
      let hops = 0;
      for (let i = 0; i <= maxHops; i++) {
        if (!curBot || !curBot.alive || curBot.team === self.team) break;
        applyDamage(curBot, curDmg, self, battle.t, battle);
        hit.add(curBot.id);
        battle.effects.push({
          kind: 'beamFlash',
          pos: { x: lastPos.x, y: lastPos.y },
          facing: angleBetween(lastPos, curBot.pos),
          length: dist(lastPos, curBot.pos),
          team: self.team, age: 0, ttl: 0.18,
        });
        hops++;
        lastPos = { x: curBot.pos.x, y: curBot.pos.y };
        curDmg *= falloff;
        // Pick next hop: nearest unhit enemy within chainRange of the current bolt.
        const candidates = battle.bots.filter(b => b.alive && b.team !== self.team && !hit.has(b.id) && dist(lastPos, b.pos) <= chainRange + b.radius);
        if (!candidates.length) break;
        curBot = candidates.reduce((a, b) => dist(lastPos, a.pos) <= dist(lastPos, b.pos) ? a : b);
      }
      if (target.alive) {
        const taken = Math.max(0, before - target.hp);
        logEvent(battle, `${self.name} Chain Lightning · ${hops} hop${hops === 1 ? '' : 's'} · ${target.name} took ${taken} → ${target.hp}/${target.maxHp}`, self.team);
      }
      return;
    }
    if (atkDef === D.ATTACKS.heal) {
      // Healer fallback: pickTarget hands us an enemy when no allies remain. Throw a feeble
      // strike for 0.5× ATK so the bot still contributes instead of giving up.
      if (target.team !== self.team) {
        if (global.Sound) global.Sound.beam();
        const facing = angleBetween(self.pos, target.pos);
        self.facing = facing;
        const fallbackDmg = self.atk * 0.5 * self.dmgMult * runtimeMul;
        const before = target.hp;
        applyDamage(target, fallbackDmg, self, battle.t, battle);
        battle.effects.push({ kind: 'beamFlash', pos: { x: self.pos.x, y: self.pos.y }, facing, length: distBots(self, target), team: self.team, age: 0, ttl: 0.14 });
        if (target.alive) {
          const taken = Math.max(0, before - target.hp);
          logEvent(battle, `${self.name} (no allies left) strikes ${target.name} for ${taken} → ${target.hp}/${target.maxHp}`, self.team);
        }
        return;
      }
      if (global.Sound) global.Sound.heal();
      const healed = applyHeal(target, atkDef.healAmount);
      battle.effects.push({ kind: 'healBeam', from: { x: self.pos.x, y: self.pos.y }, to: { x: target.pos.x, y: target.pos.y }, amount: healed, age: 0, ttl: 0.35 });
      logEvent(battle, `${self.name} heals ${target.name} for ${healed} → ${target.hp}/${target.maxHp}`, self.team);
      return;
    }
  }

  // ----- active special firing -----
  function fireEffect(self, effectId, battle) {
    const eff = D.EFFECTS[effectId];
    if (!eff) return false;
    switch (effectId) {
      case 'aegis': {
        const cur = (self.shield && self.shield.hp) || 0;
        self.shield = { hp: Math.max(cur, eff.shieldHp) };
        battle.effects.push({ kind: 'shieldPulse', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.shield();
        return true;
      }
      case 'bulwark': {
        const ally = pickAlly(self, battle, 'nearest');
        if (!ally) return false;
        const cur = (ally.shield && ally.shield.hp) || 0;
        ally.shield = { hp: Math.max(cur, eff.shieldHp) };
        battle.effects.push({ kind: 'shieldPulse', pos: { x: ally.pos.x, y: ally.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.shield();
        return true;
      }
      case 'pulseHeal': {
        const ally = pickAlly(self, battle, 'lowestHp');
        if (!ally) return false;
        const healed = applyHeal(ally, eff.healAmount);
        battle.effects.push({ kind: 'healBeam', from: { x: self.pos.x, y: self.pos.y }, to: { x: ally.pos.x, y: ally.pos.y }, amount: healed, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.pulseHeal();
        return true;
      }
      case 'adrenaline':
        self.buffs.speedUntil = battle.t + eff.duration;
        self.buffs.speedMult = eff.speedMult;
        battle.effects.push({ kind: 'speedFlash', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.adrenaline();
        return true;
      case 'loadedShot':
        self.buffs.loadedShot = eff.dmgMult;
        battle.effects.push({ kind: 'loadFlash', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.loadedShot();
        return true;
      case 'detonate': {
        const r = eff.aoeRadius * self.rangeMult;
        battle.bots.forEach(b => {
          if (!b.alive || b.team === self.team) return;
          if (distBots(self, b) <= r + b.radius) {
            applyDamage(b, self.atk * eff.dmgMult * self.dmgMult, self, battle.t, battle);
          }
        });
        battle.effects.push({ kind: 'explosion', pos: { x: self.pos.x, y: self.pos.y }, radius: r, age: 0, ttl: 0.5 });
        if (global.Sound) global.Sound.detonate();
        return true;
      }
      case 'teleport': {
        const ally = pickAlly(self, battle, 'lowestHp');
        if (!ally) return false;
        const angle = Math.random() * Math.PI * 2;
        const offset = 24;
        const fromPos = { x: self.pos.x, y: self.pos.y };
        self.pos.x = Math.max(self.radius, Math.min(D.ARENA.w - self.radius, ally.pos.x + Math.cos(angle) * offset));
        self.pos.y = Math.max(self.radius, Math.min(D.ARENA.h - self.radius, ally.pos.y + Math.sin(angle) * offset));
        battle.effects.push({ kind: 'teleFlash', from: fromPos, to: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.teleport();
        return true;
      }
      case 'rally': {
        battle.bots.forEach(b => {
          if (!b.alive || b.team !== self.team) return;
          b.buffs.rallyUntil = battle.t + eff.duration;
          b.buffs.rallyMult  = eff.dmgMult;
        });
        battle.effects.push({ kind: 'rallyPulse', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.6 });
        if (global.Sound) global.Sound.rally();
        return true;
      }
      case 'lockdown': {
        const enemies = battle.bots.filter(b => b.alive && b.team !== self.team);
        if (!enemies.length) return false;
        const nearest = enemies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
        if (distBots(self, nearest) > eff.range * self.rangeMult) return false;
        nearest.buffs.rootedUntil = battle.t + eff.duration;
        battle.effects.push({ kind: 'rootedRing', pos: { x: nearest.pos.x, y: nearest.pos.y }, radius: nearest.radius + 8, age: 0, ttl: eff.duration });
        if (global.Sound) global.Sound.lockdown();
        return true;
      }
      case 'vortex': {
        const r = (eff.range || 220) * self.rangeMult;
        let pulled = 0;
        battle.bots.forEach(b => {
          if (!b.alive || b.team === self.team) return;
          if (distBots(self, b) > r + b.radius) return;
          const dir = normalize(self.pos.x - b.pos.x, self.pos.y - b.pos.y);
          b.knockback.x = dir.x * eff.pullStrength;
          b.knockback.y = dir.y * eff.pullStrength;
          b.knockback.until = battle.t + 0.4;
          pulled++;
        });
        battle.effects.push({ kind: 'rallyPulse', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.6 });
        if (pulled > 0 && global.Sound) global.Sound.vortex();
        return pulled > 0;
      }
      case 'freeze': {
        const r = (eff.aoeRadius || 180) * self.rangeMult;
        let frozen = 0;
        battle.bots.forEach(b => {
          if (!b.alive || b.team === self.team) return;
          if (distBots(self, b) > r + b.radius) return;
          b.buffs.rootedUntil = battle.t + eff.duration;
          battle.effects.push({ kind: 'rootedRing', pos: { x: b.pos.x, y: b.pos.y }, radius: b.radius + 8, age: 0, ttl: eff.duration });
          frozen++;
        });
        if (frozen > 0 && global.Sound) global.Sound.freeze();
        return frozen > 0;
      }
      case 'phaseShift':
        self.buffs.invulnUntil = battle.t + eff.duration;
        battle.effects.push({ kind: 'shieldPulse', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.4 });
        if (global.Sound) global.Sound.shield();
        return true;
      case 'enrage':
        self.cooldowns.attack = 0;
        self.buffs.enrageUntil = battle.t + eff.duration;
        self.buffs.enrageMult  = eff.cooldownMult;
        battle.effects.push({ kind: 'speedFlash', pos: { x: self.pos.x, y: self.pos.y }, age: 0, ttl: 0.5 });
        if (global.Sound) global.Sound.enrage();
        return true;
    }
    return false;
  }

  // ----- program resolution -----
  // Reaction is { trigger, override }. The override id is looked up in MOVES then TARGETS;
  // whichever it matches is the dimension we swap. The other dimension stays as Default.
  function resolveProgram(self, battle) {
    const r = self.programs.reaction;
    if (r && r.trigger && r.override && evalTrigger(r.trigger, self, battle)) {
      self.reactionActive = true;
      const isMove   = !!D.MOVES[r.override];
      const isTarget = !!D.TARGETS[r.override];
      return {
        attack: self.programs.default.attack,
        target: isTarget ? r.override : self.programs.default.target,
        move:   isMove   ? r.override : self.programs.default.move,
      };
    }
    self.reactionActive = false;
    return self.programs.default;
  }

  // ----- step -----
  function step(battle, dt) {
    battle.t += dt;
    battle.tick++;

    // 1. Projectiles.
    for (let i = battle.projectiles.length - 1; i >= 0; i--) {
      const p = battle.projectiles[i];
      p.ttl -= dt;
      if (p.kind === 'bomb') {
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        const reachedAim = dist(p.pos, p.aim) < Math.max(8, p.speed * dt);
        if (reachedAim || p.ttl <= 0) {
          let hits = 0;
          battle.bots.forEach(b => {
            if (!b.alive || b.team === p.team) return;
            const d = dist(p.pos, b.pos);
            if (d <= p.aoeRadius + b.radius) {
              const t = Math.min(1, d / p.aoeRadius);
              const falloff = 1 - t * (1 - p.falloffEdge);
              applyDamage(b, p.dmg * falloff, p.ownerRef, battle.t, battle);
              hits++;
            }
          });
          battle.effects.push({ kind: 'explosion', pos: { x: p.pos.x, y: p.pos.y }, radius: p.aoeRadius, age: 0, ttl: 0.5 });
          if (global.Sound) global.Sound.bombExplode();
          const owner = p.ownerRef && p.ownerRef.name;
          if (owner) {
            logEvent(battle, hits > 0
              ? `${owner}'s Bomb hits ${hits} ${hits === 1 ? 'enemy' : 'enemies'}`
              : `${owner}'s Bomb misses`, p.team);
          }
          battle.projectiles.splice(i, 1);
          continue;
        }
      } else if (p.kind === 'snipe') {
        const tgt = battle.bots.find(b => b.id === p.targetId && b.alive);
        if (tgt) {
          const desired = angleBetween(p.pos, tgt.pos);
          const current = Math.atan2(p.vel.y, p.vel.x);
          let delta = desired - current;
          while (delta >  Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const maxTurn = p.homingRate * dt;
          if (delta >  maxTurn) delta =  maxTurn;
          if (delta < -maxTurn) delta = -maxTurn;
          const newAng = current + delta;
          p.vel.x = Math.cos(newAng) * p.speed;
          p.vel.y = Math.sin(newAng) * p.speed;
        }
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        battle.bots.forEach(b => {
          if (!b.alive || b.team === p.team) return;
          if (p.hitSet.has(b.id)) return;
          if (dist(p.pos, b.pos) <= b.radius + 4) {
            p.hitSet.add(b.id);
            const before = b.hp;
            if (global.Sound) global.Sound.snipeHit();
            applyDamage(b, p.dmg, p.ownerRef, battle.t, battle);
            applyKnockback(b, p.pos, p.knockback, p.knockbackDur, battle.t);
            const owner = p.ownerRef && p.ownerRef.name;
            if (owner && b.alive) {
              const taken = Math.max(0, before - b.hp);
              logEvent(battle, `${owner}'s Snipe hits ${b.name} for ${taken} → ${b.hp}/${b.maxHp}`, p.team);
            }
          }
        });
        if (p.pos.x < -50 || p.pos.x > D.ARENA.w + 50 || p.pos.y < -50 || p.pos.y > D.ARENA.h + 50 || p.ttl <= 0) {
          battle.projectiles.splice(i, 1);
          continue;
        }
      }
    }

    // 2. Effects aging.
    for (let i = battle.effects.length - 1; i >= 0; i--) {
      battle.effects[i].age += dt;
      if (battle.effects[i].age >= battle.effects[i].ttl) battle.effects.splice(i, 1);
    }

    // 3. Per-bot AI.
    battle.bots.forEach(self => {
      if (!self.alive) return;
      self.cooldowns.attack -= dt;
      self.cooldowns.special -= dt;

      // Detect target death — if our current target is gone, stamp the time.
      if (self.targetId) {
        const cur = battle.bots.find(b => b.id === self.targetId);
        if (!cur || !cur.alive) {
          self._lastTargetDiedAt = battle.t;
          self._lastTargetId = self.targetId;
          self.targetId = null;
        }
      }

      // Active special firing — trigger lives at bot-level (programs.trigger).
      if (self.programs.special && self.programs.special.kind === 'active' && self.cooldowns.special <= 0) {
        const trig = self.programs.trigger || 'always';
        if (evalTrigger(trig, self, battle)) {
          const effId = self.programs.special.effect;
          if (fireEffect(self, effId, battle)) {
            self.cooldowns.special = D.EFFECTS[effId].cooldown;
            logEvent(battle, `${self.name} activates ${D.EFFECTS[effId].label}`, self.team);
          }
        }
      }

      // Resolve active program (default or reaction).
      const prog = resolveProgram(self, battle);

      // Acquire / refresh target periodically.
      const cur = self.targetId ? battle.bots.find(b => b.id === self.targetId) : null;
      const wantSide = D.ATTACKS[prog.attack].targetSide;
      const curInvalid = !cur || !cur.alive ||
        (wantSide === 'ally'  && cur.team !== self.team) ||
        (wantSide === 'enemy' && cur.team === self.team);
      if (curInvalid || battle.t >= self.targetReacquireAt) {
        const t = pickTarget(self, prog, battle.bots);
        self.targetId = t ? t.id : null;
        if (t) self._lastTargetId = t.id;
        self.targetReacquireAt = battle.t + 0.5;
      }
      const target = self.targetId ? battle.bots.find(b => b.id === self.targetId) : null;

      // Regenerate passive (always-on heal).
      if (isPassive(self, 'regenerate')) {
        self.hp = Math.min(self.maxHp, self.hp + D.PASSIVES.regenerate.regenPerSec * dt);
      }

      // Movement.
      let desired = { x: 0, y: 0 };
      let moveSpeedMul = 1.0;
      const rooted = battle.t < (self.buffs.rootedUntil || 0);
      const moveTgt = pickMoveTarget(self, prog.move, battle);
      const moveDef = D.MOVES[prog.move];
      if (rooted) {
        // Frozen in place: no movement intent.
      } else if (moveDef && moveDef.isKite && moveTgt) {
        const d = distBots(self, moveTgt);
        const desiredDist = moveDef.kiteDist;
        const deadzone = 12;
        if (d < desiredDist - deadzone) {
          desired = normalize(self.pos.x - moveTgt.pos.x, self.pos.y - moveTgt.pos.y);
        } else if (d > desiredDist + deadzone) {
          desired = normalize(moveTgt.pos.x - self.pos.x, moveTgt.pos.y - self.pos.y);
        }
      } else if (moveDef && moveDef.isOrbit && moveTgt) {
        const toEnemy = normalize(moveTgt.pos.x - self.pos.x, moveTgt.pos.y - self.pos.y);
        const tangent = { x: -toEnemy.y, y: toEnemy.x };
        const d = distBots(self, moveTgt);
        const dd = moveDef.orbitDist;
        let dvx = tangent.x, dvy = tangent.y;
        // Bias toward/away to maintain orbit distance.
        if (d < dd - 20)       { dvx += -toEnemy.x * 0.7; dvy += -toEnemy.y * 0.7; }
        else if (d > dd + 20)  { dvx +=  toEnemy.x * 0.7; dvy +=  toEnemy.y * 0.7; }
        desired = normalize(dvx, dvy);
      } else if (moveDef && moveDef.isSpread) {
        const allies = battle.bots.filter(b => b.alive && b.team === self.team && b.id !== self.id);
        let spread = false;
        if (allies.length) {
          const nr = allies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
          if (distBots(self, nr) < moveDef.spreadDist) {
            desired = normalize(self.pos.x - nr.pos.x, self.pos.y - nr.pos.y);
            spread = true;
          }
        }
        if (!spread) {
          // No clump — engage the nearest enemy until in attack range.
          const enemies = battle.bots.filter(b => b.alive && b.team !== self.team);
          if (enemies.length) {
            const ne = enemies.reduce((a, b) => distBots(self, a) <= distBots(self, b) ? a : b);
            const stopDist = (self.range + self.radius) - 4;
            if (distBots(self, ne) > stopDist) {
              desired = normalize(ne.pos.x - self.pos.x, ne.pos.y - self.pos.y);
            }
          }
        }
      } else if (moveDef && moveDef.isFollow && moveTgt) {
        // Walk to the followed ally, stop at followDist.
        const d = distBots(self, moveTgt);
        if (d > (moveDef.followDist || 50)) {
          desired = normalize(moveTgt.pos.x - self.pos.x, moveTgt.pos.y - self.pos.y);
        }
      } else if (moveDef && moveDef.isCharge && moveTgt) {
        const stopDist = (self.range + self.radius) - 4;
        const d = distBots(self, moveTgt);
        if (d > stopDist) {
          desired = normalize(moveTgt.pos.x - self.pos.x, moveTgt.pos.y - self.pos.y);
          moveSpeedMul = moveDef.speedMult;
        }
      } else if (prog.move === 'hold') {
        desired = { x: 0, y: 0 };
      } else if (moveTgt) {
        const stopDist = (self.range + self.radius) - 4;
        const d = distBots(self, moveTgt);
        if (d > stopDist) {
          desired = normalize(moveTgt.pos.x - self.pos.x, moveTgt.pos.y - self.pos.y);
        }
      }

      const speedMult = (battle.t < self.buffs.speedUntil) ? self.buffs.speedMult : 1.0;
      let mvx = desired.x * self.speed * speedMult * moveSpeedMul;
      let mvy = desired.y * self.speed * speedMult * moveSpeedMul;

      if (battle.t < self.knockback.until) {
        mvx = mvx * D.BATTLE.knockbackMoveScale + self.knockback.x;
        mvy = mvy * D.BATTLE.knockbackMoveScale + self.knockback.y;
        self.knockback.x *= Math.max(0, 1 - dt / 0.25);
        self.knockback.y *= Math.max(0, 1 - dt / 0.25);
      } else {
        self.knockback.x = 0;
        self.knockback.y = 0;
      }

      self.vel.x = mvx;
      self.vel.y = mvy;
      self.pos.x += mvx * dt;
      self.pos.y += mvy * dt;

      // Soft separation.
      battle.bots.forEach(other => {
        if (other === self || !other.alive) return;
        const d = distBots(self, other);
        const minD = (self.radius + other.radius) * 1.0;
        if (d > 0 && d < minD) {
          const push = (minD - d) / minD;
          const dir = normalize(self.pos.x - other.pos.x, self.pos.y - other.pos.y);
          self.pos.x += dir.x * D.BATTLE.separationPush * push * dt;
          self.pos.y += dir.y * D.BATTLE.separationPush * push * dt;
        }
      });

      self.pos.x = Math.max(self.radius, Math.min(D.ARENA.w - self.radius, self.pos.x));
      self.pos.y = Math.max(self.radius, Math.min(D.ARENA.h - self.radius, self.pos.y));

      // Attack.
      if (target && self.cooldowns.attack <= 0) {
        const d = distBots(self, target);
        const inRange = d <= self.range + target.radius;
        if (inRange) {
          fireAttack(self, target, battle);
          let cd = D.ATTACKS[prog.attack].cooldown;
          // Enrage: while active, attack cooldown is multiplied (i.e., shorter).
          if (battle.t < (self.buffs.enrageUntil || 0)) cd *= (self.buffs.enrageMult || 1.0);
          self.cooldowns.attack = cd;
          self.facing = angleBetween(self.pos, target.pos);
        }
      }
    });

    // 4. Win checks.
    checkWin(battle);
  }

  function checkWin(battle) {
    const pAlive = alive(battle.bots, 'player');
    const eAlive = alive(battle.bots, 'enemy');

    if (pAlive.length === 0 && eAlive.length === 0) { battle.winner = 'player'; battle.reason = 'mutual'; return; }
    if (pAlive.length === 0) { battle.winner = 'enemy';  battle.reason = 'annihilation'; return; }
    if (eAlive.length === 0) { battle.winner = 'player'; battle.reason = 'annihilation'; return; }

    // Heal-stalemate rule removed: healers now fall back to a weak strike when no allies
    // remain (fireAttack heal branch), so a side composed of only healers will still
    // produce damage and the battle resolves naturally via attrition or timeout.

    if (battle.t >= D.BATTLE.timeoutSec) {
      const pScore = pAlive.reduce((s, b) => s + b.hp / b.maxHp, 0);
      const eScore = eAlive.reduce((s, b) => s + b.hp / b.maxHp, 0);
      if (pScore > eScore)      battle.winner = 'player';
      else if (eScore > pScore) battle.winner = 'enemy';
      else                      battle.winner = 'player';
      battle.reason = 'timeout';
    }
  }

  global.ShapebotsBattle = { createBattle, step };
})(window);
