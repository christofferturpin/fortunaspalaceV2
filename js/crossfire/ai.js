/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CROSSFIRE AI  —  medium-tier opponent gunner                            │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   updateAI(state, world, dt) ──► may push marbles into world.marbles     │
  │      │                                                                   │
  │      ├─ trackPuck()        ── rotate aim toward puck.x                   │
  │      ├─ shouldFire(puck)   ── puck on AI half OR drifting to AI net      │
  │      └─ tryFire(state)     ── respects reaction delay + fire-rate cap    │
  │                                                                          │
  │   Exports (window.CFAI): { makeAIState, updateAI, DIFFICULTY }           │
  │   External deps: CFPhysics.makeMarble                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  DIFFICULTY: patsy/medium/hard/house — each {reactMs, fireHz, jitterDeg, aimDegPerSec, predict}
  house: 40ms react, 8Hz fire, 2° jitter, 720°/s tracking, predict=T (leads 0.25s)
  predict=T → aim at (puck.x+vx*0.25, puck.y+vy*0.25); else aim at puck center
  AI gun: x=300, y=50, fires downward (angle ≈ +PI/2 with offset)
  state: {aim:PI/2, lastFireAt:0, reactAccum:0, targetAim:PI/2, diff}
  makeAIState(diff)→state
  trackPuck(state,puck,dt): desired=atan2(puck.y-50, puck.x-300); clamp toward downward hemisphere; rotate aim toward desired by aimDegPerSec*dt (rad)
  shouldFire(puck): puck.y > H/2 || puck.vy < -20 (moving up toward AI) → F (defend); else T
    actually: fire when puck is on AI half (y<H/2) OR vy<0 (moving toward AI net) — those are the threats
  tryFire(state,now): now-lastFireAt < 1000/fireHz → F; else lastFireAt=now; angle=aim + jitter; push marble
  updateAI(s,w,dt,now): s.reactAccum+=dt*1000; s.reactAccum<reactMs→ret; trackPuck; if shouldFire→tryFire
*/
(function () {
  var DIFFICULTY = {
    patsy:  { reactMs: 700, fireHz: 1.2, jitterDeg: 38, aimDegPerSec: 100, predict: false },
    medium: { reactMs: 280, fireHz: 3.0, jitterDeg: 15, aimDegPerSec: 240, predict: false },
    hard:   { reactMs: 110, fireHz: 5.0, jitterDeg: 6,  aimDegPerSec: 420, predict: true  },
    house:  { reactMs: 40,  fireHz: 8.0, jitterDeg: 2,  aimDegPerSec: 720, predict: true  }
  };

  var AMMO_MAX = 6;
  var AMMO_START = 3;
  var AMMO_REGEN_MS = 1000;

  function makeAIState(diffName) {
    var d = DIFFICULTY[diffName] || DIFFICULTY.medium;
    var top = (window.CFPhysics && window.CFPhysics.PLAY_TOP) || 60;
    return {
      diff: d,
      aim: Math.PI / 2, // straight down
      reactAccum: 0,
      lastFireAt: 0,
      gunX: 300,
      gunY: top - 36,   // behind AI's goal line
      ammo: AMMO_START,
      ammoMax: AMMO_MAX,
      ammoRegenAccum: 0,
      ammoRegenMs: AMMO_REGEN_MS,
      startupDelayMs: 700,  // brief stall at round start so player can set up
      missiles: 2,          // magic missiles per MATCH (carries across rounds)
      missilesMax: 2,
      lastMissileAt: 0
    };
  }
  // NB: AI missile state is carried across rounds since it's per match;
  // game.js calls a separate resetAIMissiles when the match resets.

  function clampAimDown(a) {
    var span = Math.PI / 180 * 85;
    var min = Math.PI / 2 - span;
    var max = Math.PI / 2 + span;
    if (a < min) return min;
    if (a > max) return max;
    return a;
  }

  function trackPuck(state, puck, dt) {
    var tx = puck.x, ty = puck.y;
    if (state.diff.predict) {
      // lead the puck by ~0.25s of its current velocity
      tx += puck.vx * 0.25;
      ty += puck.vy * 0.25;
    }
    var desired = Math.atan2(ty - state.gunY, tx - state.gunX);
    desired = clampAimDown(desired);
    var maxStep = (state.diff.aimDegPerSec * Math.PI / 180) * dt;
    var delta = desired - state.aim;
    if (Math.abs(delta) < maxStep) state.aim = desired;
    else state.aim += Math.sign(delta) * maxStep;
  }

  function shouldFire(state, world) {
    var puck = world.puck;
    if (puck.y < world.height / 2) return true;       // threat: puck on AI's side
    if (puck.vy < -20) return true;                    // threat: moving toward AI
    return Math.random() < 0.2;                        // otherwise occasional harassment
  }

  function tryFire(state, world, now) {
    if (state.ammo <= 0) return;
    var minDelay = 1000 / state.diff.fireHz;
    if (now - state.lastFireAt < minDelay) return;
    state.lastFireAt = now;
    state.ammo--;
    var jitter = (Math.random() - 0.5) * 2 * (state.diff.jitterDeg * Math.PI / 180);
    var a = state.aim + jitter;
    world.marbles.push(window.CFPhysics.makeMarble(
      state.gunX + Math.cos(a) * 30,
      state.gunY + Math.sin(a) * 30,
      a,
      'ai'
    ));
    if (window.CFSfx) window.CFSfx.aiFire();
  }

  function tickAmmo(state, dt) {
    if (state.ammo >= state.ammoMax) { state.ammoRegenAccum = 0; return; }
    state.ammoRegenAccum += dt * 1000;
    while (state.ammoRegenAccum >= state.ammoRegenMs && state.ammo < state.ammoMax) {
      state.ammoRegenAccum -= state.ammoRegenMs;
      state.ammo++;
    }
  }

  function tryMissile(state, world, now) {
    if (state.missiles <= 0) return;
    if (now - state.lastMissileAt < 3500) return;  // cooldown between missiles
    var phys = window.CFPhysics;
    var puck = world.puck;
    var midY = (phys.PLAY_TOP + phys.PLAY_BOTTOM) / 2;
    // Use a missile when puck is on AI's half AND moving toward AI's net.
    if (puck.y > midY) return;
    if (puck.vy >= 0) return;
    // small per-frame probability so it feels reactive but not deterministic
    if (Math.random() > 0.012) return;
    var originY = puck.y - phys.PUCK_R - 22;
    if (originY < phys.PLAY_TOP + 4) return;
    phys.fireLaser(world, puck.x, originY, Math.PI / 2, 'ai');
    if (window.CFSfx) window.CFSfx.laser('ai');
    state.missiles--;
    state.lastMissileAt = now;
  }

  function updateAI(state, world, dt, now) {
    tickAmmo(state, dt);
    if (state.startupDelayMs > 0) {
      state.startupDelayMs -= dt * 1000;
      return;
    }
    state.reactAccum += dt * 1000;
    if (state.reactAccum < state.diff.reactMs) return;
    trackPuck(state, world.puck, dt);
    tryMissile(state, world, now);
    if (shouldFire(state, world)) tryFire(state, world, now);
  }

  window.CFAI = {
    makeAIState: makeAIState,
    updateAI: updateAI,
    DIFFICULTY: DIFFICULTY
  };
})();
