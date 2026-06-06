/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS DATA  —  balance constants, palettes, enemy library, rounds   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   No entry points — pure data module evaluated on load.                  │
  │   Mirrors pages/shapebots/BALANCE.md.                                    │
  │                                                                          │
  │   Constants (window.ShapebotsData):                                      │
  │      ARENA     ──► {w,h}                                                 │
  │      BASE      ──► {hp, atk, speed, radius}  (chassis starting stats)    │
  │      TYPES     ──► heart / spade / diamond / club  (hp/atk/spd mults)    │
  │      ATTACKS   ──► melee, shotgun, beam, whirl, bomb, snipe, heal        │
  │      TARGETS   ──► nearest/furthest/lowestHp/... (side:enemy|ally)       │
  │      MOVES     ──► approach/charge/strafe/kite/spread/hold               │
  │      TRIGGERS  ──► always, myHpUnder30, allyJustDied, surrounded, ...    │
  │      PASSIVES  ──► sharpened, reinforced, vampiric, thorns, berserk, ... │
  │      EFFECTS   ──► aegis, bulwark, pulseHeal, adrenaline, rally,         │
  │                    detonate, teleport, lockdown, loadedShot              │
  │      BATTLE    ──► sim timing (tickHz, timeoutSec, stalemate, etc.)      │
  │      ENEMY_BOTS, ENEMY_TEAMS_BY_SIZE[1..7], ENEMY_TEAM (back-compat)     │
  │      ROUNDS    ──► [{playerSize,enemySize} × 7]  (2v1 → 5v7 gauntlet)    │
  │      STARTER, UNLOCKS[6], PLAYER_STARTERS  (progression buckets)         │
  │                                                                          │
  │   Exports (window.ShapebotsData): { ARENA, BASE, TYPES, ATTACKS,         │
  │      TARGETS, MOVES, TRIGGERS, PASSIVES, EFFECTS, BATTLE, ENEMY_BOTS,    │
  │      ROUNDS, ENEMY_TEAM, ENEMY_TEAMS_BY_SIZE, PLAYER_STARTERS, STARTER,  │
  │      UNLOCKS }                                                           │
  │   External deps: none                                                    │
  │   Consumers: bot.js, battle.js, render.js, programming.js, main.js       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ARENA={w:900,h:540}
  BASE={hp:100,atk:10,speed:80,radius:16}
  TYPES={heart|spade|diamond|club→{label,desc,hpMult,atkMult,speedMult,color}}  // heart=tank +60%hp, spade=+50%atk, diamond=+50%spd, club=+20% all
  ATTACKS={melee|shotgun|beam|whirl|bomb|snipe|heal→{label,desc,targetSide,range,cooldown,dmgCoeff,...}}  // varies: arcDeg/coneDeg/falloffEdge/beamWidth/projectileSpeed/aoeRadius/homingRateDeg/healAmount
  TARGETS={nearest|furthest|lowestHp|highestHp|mostDamaged Enemy/Ally→{label,desc,side:'enemy'|'ally',pick}}
  MOVES={approach|charge|strafe|goToLowestHpAlly|goToAttackedAlly|spreadOut|kiteShort|kiteMedium|kiteLong|hold→{label,desc,isCharge/isOrbit/isKite/isSpread,speedMult/orbitDist/kiteDist/spreadDist}}
  TRIGGERS={always|myHpUnder60|myHpUnder30|allyHpUnder40|hitRecently|targetJustDied|enemyInMelee|allyJustDied|halfTeamDown|outnumbered|firstFiveSec|noTargetInRange|surrounded→{label,desc}}
  PASSIVES={sharpened|extended|reinforced|quickened|vampiric|thorns|berserk|regenerate→{label,desc,dmgMult/rangeMult/hpMult/speedMult/vampFrac/thornsFrac/berserkMax/regenPerSec}}
  EFFECTS={aegis|bulwark|pulseHeal|adrenaline|loadedShot|detonate|teleport|rally|lockdown→{label,desc,targeting:'self'|'nearestAlly'|'lowestHpAlly'|'aoeSelf'|'allies'|'nearestEnemy',cooldown,shieldHp/healAmount/speedMult/dmgMult/duration/aoeRadius/range}}
  BATTLE={tickHz:60,timeoutSec:60,healStalemateAfter:10,healStalemateCheckEvery:1.0,separationPush:30,knockbackMoveScale:0.5,spawnInsetX:80,meleeNearbyRadius:80,recentHitWindow:2.0,recentTargetDeathWindow:2.0,recentAllyDeathWindow:3.0}
  ENEMY_BOTS={tank|bruiser|sniper|bomber|medic|stalker|crusher→{name,type,default:{attack,target,move},trigger,special}}
  archetypes (consts): _sentinel,_templar,_bulwark,_outrider,_striker,_berserker,_reaper,_crasher,_avenger,_inquisit,_skirmisher,_marksman,_eyewitness,_hexer,_hexerLoop,_slinger,_bombardier,_pyro,_stalker,_chaplain,_conductor,_beacon (each: {name,type,default,trigger,special})
  ENEMY_TEAMS_BY_SIZE={1..7→[5 teams each] of archetype arrays}
  ROUNDS=[{playerSize,enemySize}*7]: 2v1,2v2,3v3,4v4,5v5,5v6,5v7
  ENEMY_TEAM=ENEMY_TEAMS_BY_SIZE[5][0]  // back-compat
  STARTER=['melee','nearestEnemy','approachNearestEnemy','reinforced']
  UNLOCKS=[6 arrays of ids unlocked after R1..R6 wins]
  PLAYER_STARTERS=[{name,desc,bots:[2 bot specs]}*5]: Bruiser+Medic, Tank+Medic, Twin Bruisers, Twin Tanks, Brawl
  exports: global.ShapebotsData={ARENA,BASE,TYPES,ATTACKS,TARGETS,MOVES,TRIGGERS,PASSIVES,EFFECTS,BATTLE,ENEMY_BOTS,ROUNDS,ENEMY_TEAM,ENEMY_TEAMS_BY_SIZE,PLAYER_STARTERS,STARTER,UNLOCKS}
*/

// Shapebots — balance constants, program shape, palettes, enemy team.
// Mirrors pages/shapebots/BALANCE.md.

(function (global) {
  'use strict';

  const ARENA = { w: 900, h: 540 };

  const BASE = { hp: 100, atk: 10, speed: 80, radius: 16 };

  const TYPES = {
    heart:   { label: 'Heart',   desc: 'Tank chassis · +60% HP. Soaks damage; trades raw output for survival.',                       hpMult: 1.60, atkMult: 1.00, speedMult: 1.00, color: '#ff6a6a' },
    spade:   { label: 'Spade',   desc: 'Bruiser chassis · +50% ATK. The hardest puncher; standard HP and speed.',                    hpMult: 1.00, atkMult: 1.50, speedMult: 1.00, color: '#ff9a6a' },
    diamond: { label: 'Diamond', desc: 'Skirmisher chassis · +50% speed. Outmaneuvers heavier bots, reaches kite/strafe distances.', hpMult: 1.00, atkMult: 1.00, speedMult: 1.50, color: '#b5ff8e' },
    club:    { label: 'Club',    desc: 'Generalist chassis · +20% to HP / ATK / speed. Balanced — no weaknesses, no peaks.',         hpMult: 1.20, atkMult: 1.20, speedMult: 1.20, color: '#d4af37' },
  };

  // Each attack declares targetSide. Target picker filters bots to that side.
  const ATTACKS = {
    melee:   { label: 'Melee',   desc: 'Close arc · 60 px reach · 0.8 s · 1.0× ATK · 90° swing hits everyone in front, hard knockback.', targetSide: 'enemy', range: 60,  cooldown: 0.8, dmgCoeff: 1.0, arcDeg: 90,  knockback: 120, knockbackDur: 0.25 },
    shotgun: { label: 'Shotgun', desc: 'Cone burst · 180 px · 1.1 s · 1.3× ATK at point-blank → 0.6× at max range · 65° spread.',       targetSide: 'enemy', range: 180, cooldown: 1.1, dmgCoeff: 1.3, coneDeg: 65, falloffEdge: 0.6, knockback: 80, knockbackDur: 0.20 },
    beam:    { label: 'Beam',    desc: 'Line pierce · 240 px · 0.4 s cd · 0.4× ATK per hit · machine-gun cadence, pierces all in line.',  targetSide: 'enemy', range: 240, cooldown: 0.4, dmgCoeff: 0.4, beamWidth: 7, pierces: true, knockback: 0,  knockbackDur: 0 },
    whirl:   { label: 'Whirl',   desc: '360° AoE · 80 px radius · 1.0 s · 0.9× ATK · hits every enemy in radius. Needs one in range to fire.', targetSide: 'enemy', range: 80,  cooldown: 1.0, dmgCoeff: 0.9, knockback: 60, knockbackDur: 0.15, is360: true },
    bomb:    { label: 'Bomb',    desc: 'Lobbed AoE · 280 px range · 1.6 s · 1.2× ATK center → 0.7× edge · 80 px blast. No friendly fire.',    targetSide: 'enemy', range: 280, cooldown: 1.6, dmgCoeff: 1.2, projectileSpeed: 220, aoeRadius: 80, aoeFalloffEdge: 0.6 },
    snipe:   { label: 'Snipe',   desc: 'Line projectile · 480 px · 1.2 s · 0.9× ATK · pierces all enemies on the line · slight homing.',     targetSide: 'enemy', range: 480, cooldown: 1.2, dmgCoeff: 0.9, projectileSpeed: 600, pierces: true, homingRateDeg: 20, knockback: 60, knockbackDur: 0.15 },
    heal:    { label: 'Heal',    desc: 'Ally heal · 200 px · 1.0 s · restores 12 HP to target ally. Requires an ally-target tile.',          targetSide: 'ally',  range: 200, cooldown: 1.0, healAmount: 12, isHeal: true },
    chainLightning: { label: 'Chain Lightning', desc: 'Arcs to up to 3 enemies · 220 px first hop · 150 px chain jumps · 1.4 s · 0.8× ATK on first hit, 25% falloff per jump.', targetSide: 'enemy', range: 220, cooldown: 1.4, dmgCoeff: 0.8, chainHops: 2, chainRange: 150, chainFalloff: 0.75 },
  };

  // Target rules — side-explicit. UI rejects drops whose side doesn't match the attack.
  const TARGETS = {
    nearestEnemy:     { label: 'Nearest enemy',      desc: 'Pick the closest enemy. Standard frontline default.',                       side: 'enemy', pick: 'nearest' },
    furthestEnemy:    { label: 'Furthest enemy',     desc: 'Pick the farthest enemy. Snipe their backline.',                            side: 'enemy', pick: 'furthest' },
    lowestHpEnemy:    { label: 'Lowest-HP enemy',    desc: 'Pick the enemy with the least HP. Finishes wounded targets.',               side: 'enemy', pick: 'lowestHp' },
    highestHpEnemy:   { label: 'Highest-HP enemy',   desc: 'Pick the enemy with the most HP. Slug it out with the biggest threat.',     side: 'enemy', pick: 'highestHp' },
    mostDamagedEnemy: { label: 'Most-damaged enemy', desc: 'Pick the most recently damaged enemy. Pile on what your team started.',     side: 'enemy', pick: 'mostDamaged' },
    lowestHpAlly:     { label: 'Lowest-HP ally',     desc: 'Pick the weakest ally. The classic medic target.',                          side: 'ally',  pick: 'lowestHp' },
    nearestAlly:      { label: 'Nearest ally',       desc: 'Pick the closest ally. Heal whoever\'s right next to you.',                 side: 'ally',  pick: 'nearest' },
    mostDamagedAlly:  { label: 'Most-damaged ally',  desc: 'Pick the most recently damaged ally. Reactive heals.',                      side: 'ally',  pick: 'mostDamaged' },
    randomEnemy:      { label: 'Random enemy',       desc: 'Pick a random enemy each acquisition. Pure chaos — every fight feels different.', side: 'enemy', pick: 'random' },
  };

  const MOVES = {
    approachNearestEnemy:  { label: 'Approach target',                desc: 'Walk toward whoever I am attacking; stop just inside firing range. Falls back to the nearest enemy if I have no target yet.' },
    approachFurthestEnemy: { label: 'Approach furthest enemy',        desc: 'Walk toward the farthest enemy, stop at firing range. Useful for pressuring backline regardless of attack target.' },
    chargeNearestEnemy:    { label: 'Charge target (×1.6 spd)',       desc: 'Approach whoever I am attacking at 1.6× speed until in firing range. Falls back to the nearest enemy if I have no target.',  isCharge: true, speedMult: 1.6 },
    strafeNearestEnemy:    { label: 'Strafe target (orbit 200)',      desc: 'Orbit whoever I am attacking at ~200 px. Tangential motion + soft distance-keep. Falls back to the nearest enemy.', isOrbit: true, orbitDist: 200 },
    goToLowestHpAlly:      { label: 'Go to lowest-HP ally',           desc: 'Walk toward the weakest ally.' },
    goToAttackedAlly:      { label: 'Go to ally being attacked',      desc: 'Walk toward whichever ally was damaged most recently (within 2 s). Falls back to lowest-HP ally.' },
    spreadOut:             { label: 'Spread out from allies',         desc: 'Back off from nearest ally if within 120 px. Counters AoE clumping.', isSpread: true, spreadDist: 120 },
    kiteShort:             { label: 'Kite — short (100)',             desc: 'Maintain 100 px from nearest enemy. Good for shotgun.',         kiteDist: 100, isKite: true },
    kiteMedium:            { label: 'Kite — medium (250)',            desc: 'Maintain 250 px from nearest enemy. Good for bomb / beam.',     kiteDist: 250, isKite: true },
    kiteLong:              { label: 'Kite — long (450)',              desc: 'Maintain 450 px from nearest enemy. Good for snipe.',           kiteDist: 450, isKite: true },
    hold:                  { label: 'Hold position',                  desc: "Don't move at all. Best paired with a long-range attack." },
    followAllyA:           { label: 'Follow ally A',                  desc: 'Stick close to teammate A (slot 1). Stops ~50 px away. Falls back to nearest ally if A is gone.', isFollow: true, allyIdx: 0, followDist: 50 },
    followAllyB:           { label: 'Follow ally B',                  desc: 'Stick close to teammate B (slot 2). Stops ~50 px away. Falls back to nearest ally if B is gone.', isFollow: true, allyIdx: 1, followDist: 50 },
    followAllyC:           { label: 'Follow ally C',                  desc: 'Stick close to teammate C (slot 3). Stops ~50 px away. Falls back to nearest ally if C is gone.', isFollow: true, allyIdx: 2, followDist: 50 },
    followAllyD:           { label: 'Follow ally D',                  desc: 'Stick close to teammate D (slot 4). Stops ~50 px away. Falls back to nearest ally if D is gone.', isFollow: true, allyIdx: 3, followDist: 50 },
    followAllyE:           { label: 'Follow ally E',                  desc: 'Stick close to teammate E (slot 5). Stops ~50 px away. Falls back to nearest ally if E is gone.', isFollow: true, allyIdx: 4, followDist: 50 },
  };

  // Triggers — shared between Reaction and Active Special. Eval lives in battle.js.
  const TRIGGERS = {
    always:           { label: 'Always',                       desc: 'Always true. Active Special re-fires on its cooldown forever.' },
    myHpUnder60:      { label: 'My HP < 60%',                  desc: 'Fires while my own HP is below 60%.' },
    myHpUnder30:      { label: 'My HP < 30%',                  desc: 'Fires while my own HP is below 30%. The panic-button trigger.' },
    allyHpUnder40:    { label: 'Any ally HP < 40%',            desc: 'Fires while any ally on my team is below 40% HP.' },
    hitRecently:      { label: 'I was hit (last 2s)',          desc: 'Fires for 2 seconds after I take damage.' },
    targetJustDied:   { label: 'My target died (last 2s)',     desc: 'Fires for 2 seconds after the target I was attacking dies.' },
    enemyInMelee:     { label: 'Enemy in melee range',         desc: 'Fires while any enemy is within 80 px of me.' },
    allyJustDied:     { label: 'Ally died (last 3s)',          desc: 'Fires for 3 seconds after an ally on my team dies.' },
    halfTeamDown:     { label: 'Half my team is down',         desc: 'Fires while my team has only half (or fewer) of its starting bots alive.' },
    outnumbered:      { label: 'Outnumbered',                  desc: 'Fires while my team has fewer alive bots than the enemy team.' },
    firstFiveSec:     { label: 'First 5 seconds',              desc: 'Fires during the first 5 seconds of the round. Opening-burst window.' },
    noTargetInRange:  { label: 'No target in range',           desc: 'Fires when I have no target, or my target is outside my attack range.' },
    surrounded:       { label: '3+ enemies within 200 px',     desc: 'Fires while three or more enemies are within 200 px of me.' },
    onKill:           { label: 'I just got a kill (2s)',       desc: 'Fires for 2 s after I land the killing blow on an enemy. Snowball fuel.' },
  };

  // Passive specials. Stat passives are applied at spawn (in bot.js).
  // Behavioral passives (vampiric, thorns, berserk, regenerate) are read at runtime in battle.js.
  const PASSIVES = {
    sharpened:  { label: 'Sharpened (+30% dmg)',              desc: 'All my attacks deal 30% more damage.',                                       dmgMult: 1.30 },
    extended:   { label: 'Extended (+50% range)',             desc: 'All my attack ranges and AoE radii grow by 50%.',                            rangeMult: 1.50 },
    reinforced: { label: 'Reinforced (+30% HP)',              desc: 'Max HP +30%. The toughness passive.',                                        hpMult: 1.30 },
    quickened:  { label: 'Quickened (+30% speed)',            desc: 'Movement speed +30%. Stacks with Adrenaline.',                                speedMult: 1.30 },
    vampiric:   { label: 'Vampiric (heal 25% of dmg dealt)',  desc: 'I heal for 25% of damage I deal to enemies. Sustains long fights.',          vampFrac: 0.25 },
    thorns:     { label: 'Thorns (reflect 25% dmg)',          desc: 'When I take damage, 25% is reflected back to the attacker (single bounce).', thornsFrac: 0.25 },
    berserk:    { label: 'Berserk (+dmg as HP drops, max +50%)', desc: 'Damage scales up to +50% as my HP drops. ×1.0 full → ×1.25 half → ×1.5 zero.', berserkMax: 0.50 },
    regenerate: { label: 'Regenerate (+2 HP/s)',              desc: 'Passive heal of 2 HP every second while alive.',                              regenPerSec: 2 },
    glasscannon:{ label: 'Glass Cannon (+60% dmg, +30% dmg taken)', desc: 'Trade defense for offense: every attack hits 60% harder, every hit on me lands 30% harder. High risk, high reward.', dmgMult: 1.60, dmgTakenMult: 1.30 },
  };

  // Active special effects — discrete one-shots with their own cooldown.
  // Targeting is baked per effect; trigger comes from the player's pick.
  const EFFECTS = {
    aegis:      { label: 'Aegis (self shield 50)',           desc: 'Apply a 50 HP shield to myself. Cooldown 12 s.',                                       targeting: 'self',         cooldown: 12, shieldHp: 50 },
    bulwark:    { label: 'Bulwark (ally shield 40)',         desc: 'Apply a 40 HP shield to the nearest ally. Cooldown 8 s.',                              targeting: 'nearestAlly',  cooldown: 8,  shieldHp: 40 },
    pulseHeal:  { label: 'Pulse Heal (ally +30 HP)',         desc: 'Heal the lowest-HP ally for 30 HP. Cooldown 8 s.',                                     targeting: 'lowestHpAlly', cooldown: 8,  healAmount: 30 },
    adrenaline: { label: 'Adrenaline (+60% spd, 2s)',        desc: 'Self +60% movement speed for 2 seconds. Cooldown 6 s.',                                targeting: 'self',         cooldown: 6,  speedMult: 1.60, duration: 2.0 },
    loadedShot: { label: 'Loaded Shot (next atk ×2)',        desc: 'My next attack deals double damage. Cooldown 8 s.',                                    targeting: 'self',         cooldown: 8,  dmgMult: 2.0 },
    detonate:   { label: 'Detonate (AoE around self)',       desc: '80 px AoE around me, ATK × 1.5 to each enemy hit. No friendly fire. Cooldown 10 s.',   targeting: 'aoeSelf',      cooldown: 10, aoeRadius: 80, dmgMult: 1.5 },
    teleport:   { label: 'Teleport (to lowest-HP ally)',     desc: 'Instantly blink to the lowest-HP ally (random ~24 px offset). Cooldown 14 s.',         targeting: 'lowestHpAlly', cooldown: 14 },
    rally:      { label: 'Rally (+30% dmg, all allies, 5s)', desc: '+30% damage to every living ally for 5 seconds. Stacks with passives. Cooldown 18 s.', targeting: 'allies',       cooldown: 18, dmgMult: 1.30, duration: 5.0 },
    lockdown:   { label: 'Lockdown (root nearest 1.5s)',     desc: 'Root the nearest enemy in place for 1.5 s (must be within 200 px). Cooldown 10 s.',    targeting: 'nearestEnemy', cooldown: 10, range: 200, duration: 1.5 },
    vortex:     { label: 'Vortex (pull enemies in)',         desc: 'Yank every enemy within 220 px toward me. Brutal setup for whirl or detonate. Cooldown 14 s.', targeting: 'aoeSelf',      cooldown: 14, range: 220, pullStrength: 240 },
    freeze:     { label: 'Freeze (AoE root 1.5s)',           desc: 'Root every enemy within 180 px in place for 1.5 s. Total lockdown. Cooldown 16 s.',     targeting: 'aoeSelf',      cooldown: 16, aoeRadius: 180, duration: 1.5 },
    phaseShift: { label: 'Phase Shift (1.5s invuln)',        desc: 'Become untouchable for 1.5 s — incoming damage ignored entirely. Cooldown 12 s.',      targeting: 'self',         cooldown: 12, duration: 1.5 },
    enrage:     { label: 'Enrage (fire 60% faster, 3s)',     desc: 'Reset attack cooldown and fire 60% faster for 3 s. Burst window. Cooldown 14 s.',      targeting: 'self',         cooldown: 14, duration: 3.0, cooldownMult: 0.40 },
  };

  // Flat balance buff applied to every enemy bot at spawn (bot.js#createBot).
  // The gladiator is supposed to be outgunned — house odds.
  const ENEMY_BUFF = { hpMult: 1.00, atkMult: 1.00, speedMult: 1.00 };

  const BATTLE = {
    tickHz: 60,
    timeoutSec: 60,
    healStalemateAfter: 10,
    healStalemateCheckEvery: 1.0,
    separationPush: 30,
    knockbackMoveScale: 0.5,
    spawnInsetX: 80,
    meleeNearbyRadius: 80,        // used by 'enemyInMelee' trigger
    recentHitWindow: 2.0,
    recentTargetDeathWindow: 2.0,
    recentAllyDeathWindow: 3.0,
  };

  // ----- enemy bot library -----
  // Schema: { name, type, default:{attack,target,move}, trigger, special }
  const ENEMY_BOTS = {
    tank:    { name: 'Tank',    type: 'heart',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: null,           special: { kind: 'passive', passive: 'reinforced' } },
    bruiser: { name: 'Bruiser', type: 'spade',   default: { attack: 'melee',   target: 'lowestHpEnemy',  move: 'approachNearestEnemy' }, trigger: 'allyJustDied', special: { kind: 'active',  effect: 'loadedShot' } },
    sniper:  { name: 'Sniper',  type: 'diamond', default: { attack: 'snipe',   target: 'nearestEnemy',   move: 'kiteLong'             }, trigger: null,           special: { kind: 'passive', passive: 'sharpened' } },
    bomber:  { name: 'Bomber',  type: 'diamond', default: { attack: 'bomb',    target: 'highestHpEnemy', move: 'kiteMedium'           }, trigger: null,           special: { kind: 'passive', passive: 'extended' } },
    medic:   { name: 'Medic',   type: 'club',    default: { attack: 'heal',    target: 'lowestHpAlly',   move: 'goToLowestHpAlly'     }, trigger: 'myHpUnder30',  special: { kind: 'active',  effect: 'aegis' } },
    stalker: { name: 'Stalker', type: 'diamond', default: { attack: 'shotgun', target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: 'hitRecently',  special: { kind: 'active',  effect: 'adrenaline' } },
    crusher: { name: 'Crusher', type: 'spade',   default: { attack: 'whirl',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: 'enemyInMelee', special: { kind: 'active',  effect: 'detonate' } },
  };

  // ----- Enemy archetypes (reused across teams) -----
  // All follow the same player-bot spec shape: { name, type, default, trigger, special }.
  // HEARTS (tanky)
  const _sentinel   = { name: 'Sentinel',   type: 'heart',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: null,            special: { kind: 'passive', passive: 'reinforced' } };
  const _templar    = { name: 'Templar',    type: 'heart',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: 'myHpUnder30',   special: { kind: 'active',  effect: 'aegis' } };
  const _bulwark    = { name: 'Bulwark',    type: 'heart',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: 'allyHpUnder40', special: { kind: 'active',  effect: 'bulwark' } };
  const _outrider   = { name: 'Outrider',   type: 'heart',   default: { attack: 'shotgun', target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: 'hitRecently',   special: { kind: 'active',  effect: 'adrenaline' } };
  // SPADES (high ATK)
  const _striker    = { name: 'Striker',    type: 'spade',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'approachNearestEnemy' }, trigger: null,            special: { kind: 'passive', passive: 'sharpened' } };
  const _berserker  = { name: 'Berserker',  type: 'spade',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: null,            special: { kind: 'passive', passive: 'berserk' } };
  const _reaper     = { name: 'Reaper',     type: 'spade',   default: { attack: 'melee',   target: 'lowestHpEnemy',  move: 'chargeNearestEnemy'   }, trigger: null,            special: { kind: 'passive', passive: 'vampiric' } };
  const _crasher    = { name: 'Crasher',    type: 'spade',   default: { attack: 'melee',   target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: 'hitRecently',   special: { kind: 'active',  effect: 'loadedShot' } };
  const _avenger    = { name: 'Avenger',    type: 'spade',   default: { attack: 'melee',   target: 'lowestHpEnemy',  move: 'chargeNearestEnemy'   }, trigger: 'allyJustDied',  special: { kind: 'active',  effect: 'rally' } };
  const _inquisit   = { name: 'Inquisitor', type: 'spade',   default: { attack: 'snipe',   target: 'lowestHpEnemy',  move: 'kiteMedium'           }, trigger: 'always',        special: { kind: 'active',  effect: 'lockdown' } };
  // DIAMONDS (fast)
  const _skirmisher = { name: 'Skirmisher', type: 'diamond', default: { attack: 'snipe',   target: 'nearestEnemy',   move: 'kiteLong'             }, trigger: null,            special: { kind: 'passive', passive: 'sharpened' } };
  const _marksman   = { name: 'Marksman',   type: 'diamond', default: { attack: 'snipe',   target: 'lowestHpEnemy',  move: 'kiteLong'             }, trigger: null,            special: { kind: 'passive', passive: 'sharpened' } };
  const _eyewitness = { name: 'Eyewitness', type: 'diamond', default: { attack: 'beam',    target: 'nearestEnemy',   move: 'kiteMedium'           }, trigger: null,            special: { kind: 'passive', passive: 'sharpened' } };
  const _hexer      = { name: 'Hexer',      type: 'diamond', default: { attack: 'beam',    target: 'nearestEnemy',   move: 'kiteMedium'           }, trigger: 'enemyInMelee',  special: { kind: 'active',  effect: 'lockdown' } };
  const _hexerLoop  = { name: 'Hexer',      type: 'diamond', default: { attack: 'beam',    target: 'nearestEnemy',   move: 'kiteMedium'           }, trigger: 'always',        special: { kind: 'active',  effect: 'lockdown' } };
  const _slinger    = { name: 'Slinger',    type: 'diamond', default: { attack: 'bomb',    target: 'highestHpEnemy', move: 'kiteMedium'           }, trigger: 'allyJustDied',  special: { kind: 'active',  effect: 'loadedShot' } };
  const _bombardier = { name: 'Bombardier', type: 'diamond', default: { attack: 'bomb',    target: 'highestHpEnemy', move: 'kiteLong'             }, trigger: null,            special: { kind: 'passive', passive: 'extended' } };
  const _pyro       = { name: 'Pyromancer', type: 'diamond', default: { attack: 'whirl',   target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: 'hitRecently',   special: { kind: 'active',  effect: 'detonate' } };
  const _stalker    = { name: 'Stalker',    type: 'diamond', default: { attack: 'shotgun', target: 'nearestEnemy',   move: 'chargeNearestEnemy'   }, trigger: 'hitRecently',   special: { kind: 'active',  effect: 'adrenaline' } };
  // CLUBS (balanced)
  const _chaplain   = { name: 'Chaplain',   type: 'club',    default: { attack: 'heal',    target: 'mostDamagedAlly', move: 'goToAttackedAlly'    }, trigger: 'allyHpUnder40', special: { kind: 'active',  effect: 'pulseHeal' } };
  const _conductor  = { name: 'Conductor',  type: 'club',    default: { attack: 'heal',    target: 'mostDamagedAlly', move: 'goToAttackedAlly'    }, trigger: 'always',        special: { kind: 'active',  effect: 'rally' } };
  const _beacon     = { name: 'Beacon',     type: 'club',    default: { attack: 'heal',    target: 'lowestHpAlly',   move: 'goToLowestHpAlly'     }, trigger: null,            special: { kind: 'passive', passive: 'regenerate' } };

  // Flat archetype pool — main.js samples N from this for each round, so every battle
  // is a fresh random roll instead of a fixed team picked from a library.
  const ENEMY_ARCHETYPES = [
    _sentinel, _templar, _bulwark, _outrider,
    _striker, _berserker, _reaper, _crasher, _avenger, _inquisit,
    _skirmisher, _marksman, _eyewitness, _hexer, _hexerLoop, _slinger, _bombardier, _pyro, _stalker,
    _chaplain, _conductor, _beacon,
  ];

  // ----- Team library: 5 teams per size -----
  // main.js picks one of these at random when each round starts.
  const ENEMY_TEAMS_BY_SIZE = {
    1: [
      [_sentinel],
      [_striker],
      [_skirmisher],
      [_templar],
      [_stalker],
    ],
    2: [
      [_templar, _reaper],                            // Brace
      [_marksman, _marksman],                         // Crossfire
      [_striker, _berserker],                         // Twin Hammers
      [_marksman, _chaplain],                         // Sniper + Doctor
      [_templar, _hexer],                             // Beam Tank
    ],
    3: [
      [_bulwark, _marksman, _chaplain],               // Trident
      [_berserker, _berserker, _striker],             // Three Hammers
      [_inquisit, _hexer, _pyro],                     // Lockdown
      [_templar, _templar, _chaplain],                // Twin Aegis
      [_reaper, _striker, _conductor],                // Bloodthirst
    ],
    4: [
      [_templar, _reaper, _hexer, _chaplain],         // Crossfire
      [_striker, _berserker, _reaper, _conductor],    // Onslaught
      [_marksman, _inquisit, _marksman, _chaplain],   // Watchtower
      [_stalker, _reaper, _pyro, _chaplain],          // Vanguard
      [_sentinel, _bulwark, _templar, _chaplain],     // Iron Wall
    ],
    5: [
      [_bulwark, _reaper, _marksman, _pyro, _chaplain],          // Phalanx
      [_templar, _berserker, _inquisit, _pyro, _conductor],      // Crucible
      [_reaper, _berserker, _striker, _stalker, _chaplain],      // Avalanche
      [_slinger, _slinger, _marksman, _hexer, _chaplain],        // Bombardment
      [_bulwark, _bulwark, _reaper, _chaplain, _conductor],      // Tide
    ],
    6: [
      [_templar, _reaper, _berserker, _hexerLoop, _slinger, _chaplain],   // Tempest
      [_templar, _templar, _reaper, _reaper, _chaplain, _chaplain],        // Twin Tide
      [_striker, _berserker, _reaper, _avenger, _marksman, _chaplain],     // Onslaught-6
      [_bulwark, _marksman, _hexer, _slinger, _pyro, _conductor],          // Reign
      [_pyro, _pyro, _pyro, _slinger, _hexer, _chaplain],                  // Conflagration
    ],
    7: [
      [_templar, _bulwark, _reaper, _berserker, _inquisit, _pyro, _conductor],     // Final Court
      [_sentinel, _templar, _bulwark, _reaper, _marksman, _chaplain, _conductor],   // Royal Guard
      [_striker, _berserker, _reaper, _reaper, _stalker, _pyro, _chaplain],         // Slaughter
      [_templar, _inquisit, _hexer, _hexer, _slinger, _pyro, _conductor],           // Crucible-7
      [_sentinel, _bulwark, _bulwark, _reaper, _chaplain, _chaplain, _conductor],   // Endless Tide
    ],
  };

  // Round metadata only — actual enemy team is chosen at run-time by main.js.
  const ROUNDS = [
    { playerSize: 2, enemySize: 1 },   // R1: 2v1
    { playerSize: 2, enemySize: 2 },   // R2: 2v2
    { playerSize: 3, enemySize: 3 },   // R3: 3v3
    { playerSize: 4, enemySize: 4 },   // R4: 4v4
    { playerSize: 5, enemySize: 5 },   // R5: 5v5
    { playerSize: 5, enemySize: 6 },   // R6: 5v6
    { playerSize: 5, enemySize: 7 },   // R7: 5v7
  ];

  // Back-compat: a default enemy team if anything still imports ENEMY_TEAM directly.
  // Back-compat for callers that imported ENEMY_TEAM directly (5-bot canonical team).
  const ENEMY_TEAM = ENEMY_TEAMS_BY_SIZE[5][0].slice();

  // ----- progression: starter set + 6 unlock buckets -----
  // STARTER lists the programs every PLAYER_STARTERS preset uses (so they're
  // always present in the dynamic starter set). Programs that some starter teams
  // skip (e.g. heal for Twin Bruisers) live in UNLOCKS so the player can still
  // pick them up mid-run.
  // Total = 4 + 10 + 11 + 9 + 9 + 8 + 9 = 60.
  const STARTER = [
    'melee',
    'nearestEnemy',
    'approachNearestEnemy',
    'reinforced',
  ];

  const UNLOCKS = [
    // After R1 win → R2 stock — chassis swap unlocks open up early.
    ['diamond', 'bomb', 'lowestHpEnemy', 'kiteMedium', 'myHpUnder30', 'sharpened', 'aegis', 'loadedShot', 'heart', 'spade'],
    // After R2 win → R3 stock — the medic kit is grabbable here.
    ['club', 'snipe', 'furthestEnemy', 'goToAttackedAlly', 'allyHpUnder40', 'pulseHeal', 'bulwark', 'extended', 'heal', 'lowestHpAlly', 'goToLowestHpAlly'],
    // After R3 win → R4 stock — maneuver moves plus the universal 'always' trigger.
    ['shotgun', 'chargeNearestEnemy', 'strafeNearestEnemy', 'mostDamagedEnemy', 'hitRecently', 'enemyInMelee', 'quickened', 'adrenaline', 'always'],
    // After R4 win → R5 stock
    ['whirl', 'highestHpEnemy', 'nearestAlly', 'spreadOut', 'kiteShort', 'halfTeamDown', 'mostDamagedAlly', 'targetJustDied', 'detonate'],
    // After R5 win → R6 stock
    ['beam', 'approachFurthestEnemy', 'outnumbered', 'surrounded', 'noTargetInRange', 'thorns', 'lockdown', 'teleport'],
    // After R6 win → R7 stock (the gauntlet finale unlocks)
    ['kiteLong', 'hold', 'myHpUnder60', 'firstFiveSec', 'allyJustDied', 'vampiric', 'berserk', 'regenerate', 'rally'],
    // "Chaos pool" — game-changing programs sprinkled into the draft pool.
    ['chainLightning', 'randomEnemy', 'onKill', 'glasscannon', 'vortex', 'freeze', 'phaseShift', 'enrage'],
  ];

  // ----- Player starter teams (picked at run start; all bots use only STARTER programs) -----
  const PLAYER_STARTERS = [
    {
      name: 'Bruiser + Medic',
      desc: 'Spade puncher up front, Heart medic holding the line. Balanced default.',
      bots: [
        { name: 'Bruiser', type: 'spade', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
        { name: 'Medic',   type: 'heart', default: { attack: 'heal',  target: 'lowestHpAlly', move: 'goToLowestHpAlly'     }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
      ],
    },
    {
      name: 'Tank + Medic',
      desc: 'Two Hearts — heavy soaker and a medic. Survives forever, kills slow.',
      bots: [
        { name: 'Tank',  type: 'heart', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
        { name: 'Medic', type: 'heart', default: { attack: 'heal',  target: 'lowestHpAlly', move: 'goToLowestHpAlly'     }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
      ],
    },
    {
      name: 'Twin Bruisers',
      desc: 'Two Spade melees. No heals. Pure aggression — race the clock.',
      bots: [
        { name: 'Bruiser', type: 'spade', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
        { name: 'Crasher', type: 'spade', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
      ],
    },
    {
      name: 'Twin Tanks',
      desc: 'Two Reinforced Hearts trading blows. Extreme survivability, slow grind.',
      bots: [
        { name: 'Tank A', type: 'heart', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
        { name: 'Tank B', type: 'heart', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
      ],
    },
    {
      name: 'Brawl',
      desc: 'Spade bruiser + Heart tank. No medic, no plan B — just two front-liners.',
      bots: [
        { name: 'Bruiser', type: 'spade', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
        { name: 'Tank',    type: 'heart', default: { attack: 'melee', target: 'nearestEnemy', move: 'approachNearestEnemy' }, trigger: null, special: { kind: 'passive', passive: 'reinforced' } },
      ],
    },
  ];

  global.ShapebotsData = {
    ARENA, BASE, TYPES, ATTACKS, TARGETS, MOVES, TRIGGERS, PASSIVES, EFFECTS, BATTLE,
    ENEMY_BUFF,
    ENEMY_BOTS, ROUNDS, ENEMY_TEAM, ENEMY_TEAMS_BY_SIZE, ENEMY_ARCHETYPES, PLAYER_STARTERS, STARTER, UNLOCKS,
  };
})(window);
