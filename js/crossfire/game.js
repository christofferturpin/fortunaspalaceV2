/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CROSSFIRE GAME  —  main loop, input, state, round lifecycle             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │      │                                                                   │
  │      ├─ resolve #cf-canvas, #cf-status, #cf-restart,                     │
  │      │     #cf-score-player, #cf-score-ai                                │
  │      ├─ resetMatch()  ── zero scores + first round                       │
  │      ├─ bind keydown/keyup (←,→,space)                                   │
  │      ├─ bind canvas mousemove/mousedown/mouseleave                       │
  │      │     mouse aim overrides keys until next arrow press               │
  │      ├─ bind #cf-restart click ──► resetMatch()                          │
  │      └─ requestAnimationFrame(loop)                                      │
  │                                                                          │
  │   loop(t):                                                               │
  │      dt = (t - lastT) / 1000  (clamp 0..0.05)                            │
  │      running:                                                            │
  │        updatePlayer(dt)   ── rotate aim from held arrow keys             │
  │        tickAmmo(dt)       ── regen 1 shot per AMMO_REGEN_MS (1500ms)     │
  │        tryFirePlayer()    ── if space held + cooldown + ammo>0           │
  │        CFAI.updateAI(ai,world,dt,now)                                    │
  │        winner = CFPhysics.stepWorld(world,dt)                            │
  │        CFRender.drawFrame(ctx,world,player,ai)                           │
  │        winner → endRound(winner)                                         │
  │      else: drawFrame; auto-rerack when now >= nextRoundAt                │
  │                                                                          │
  │   endRound(winner): score[winner]++; pulse score chip; if >= WIN_SCORE   │
  │     ──► matchOver, show #cf-restart; else schedule nextRoundAt           │
  │                                                                          │
  │   Exports (window.CFGame): { init, resetRound, resetMatch }              │
  │   External deps: CFPhysics, CFAI, CFRender                               │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  W=600,H=800; PLAYER_GUN={x:300,y:H-50}; AI_GUN={x:300,y:50}
  PLAYER_FIRE_COOLDOWN_MS=90; AIM_DEG_PER_SEC=180
  WIN_SCORE=3; ROUND_PAUSE_MS=1300
  state: running, matchOver, nextRoundAt, score={player,ai}, keys={left,right,space}, spaceWasUp, mouseAim, mouseActive
  resetRound(): world.marbles=[]; puck=makePuck(W/2,H/2); aim=-PI/2; ai=makeAIState('medium'); running=T; nextRoundAt=0; clear status; hide restart
  resetMatch(): score={0,0}; matchOver=F; renderScore; resetRound
  renderScore(): write score values to chips
  pulseScore(w): remove+force-reflow+add .cf-pulse on chip
  updatePlayer(dt): keys.dir!=0 → mouseActive=F, aim += dir*AIM_RAD*dt; else mouseActive && mouseAim!=null → aim=mouseAim; clamp ±60° from -PI/2
  firePlayer(now)→bool: running && now-lastFire>=COOL → push marble, lastFire=now, ret T
  tryFirePlayer(now): keys.space && spaceWasUp → firePlayer; success→spaceWasUp=F
  keyup space → spaceWasUp=T
  canvasMouse(e)→{x,y}: rect-relative scaled to canvas internal coords
  onMouseMove: mouseAim=atan2(my-gunY,mx-gunX); mouseActive=T
  onMouseDown(left): snap aim from mouse; firePlayer(now)
  onMouseLeave: mouseActive=F
  endRound(w): running=F; score[w]++; renderScore; pulseScore(w); score[w]>=WIN_SCORE → matchOver, status='Match: …', show restart, ret; else status='round msg'; nextRoundAt=now+PAUSE
  loop(t): running → update/fire/AI/step/draw, winner→endRound; !running → draw; !matchOver && nextRoundAt && now>=nextRoundAt → resetRound
  init(): grab DOM; resetMatch; bind keys; bind restart→resetMatch; rAF(loop)
*/
(function () {
  var W = 720, H = 900;
  var AIM_DEG_PER_SEC = 180;
  var PLAYER_FIRE_COOLDOWN_MS = 90;
  var WIN_SCORE = 3;          // first to 3 wins the match
  var ROUND_PAUSE_MS = 1300;  // pause after a goal before next round
  // Red zone collapse: at 15s the RED ZONE banner pops; from that moment the
  // goal lines slide inward LIVE, reaching the 25-yards-apart cap over ~35s.
  var COLLAPSE_START_MS = 15000;
  var COLLAPSE_DURATION_MS = 35000;
  var YARD_PX = 0;            // computed from PLAY field height once physics is loaded
  var MAX_SHIFT_PX = 0;
  var matchStartTime = 0;
  var redZoneAnnounced = false;
  var AMMO_MAX = 6;
  var AMMO_START = 3;         // begin each round with 3, regen up to the cap
  var AMMO_REGEN_MS = 1000;   // +1 every second
  var MISSILE_MAX = 2;        // magic missiles per MATCH (not per round)
  var MISSILE_OFFSET = 22;    // gap between puck edge and missile spawn

  var canvas, ctx;
  var world, player, ai;
  var keys = { left: false, right: false, space: false };
  var spaceWasUp = true;
  var mouseAim = null;         // last aim angle from mouse pos, or null if mouse hasn't moved
  var mouseActive = false;     // true if mouse was the last input device used
  var lastT = 0;
  var running = false;
  var matchOver = false;
  var nextRoundAt = 0;        // when to auto-rerack after a goal (0 = not scheduled)
  var score = { player: 0, ai: 0 };
  var playerMissiles = MISSILE_MAX;
  var statusEl, restartBtn, scorePlayerEl, scoreAIEl, diffButtons;
  var ammoPips, ammoMeterEl, ammoCountEl;
  var aiAmmoPips, aiAmmoCountEl;
  var missilePips, aiMissilePips;
  var qtrEl, flashEl, paEl;
  var betbarEl, betAmountEl, betMaxBtn, betTierBtns;
  var wager = 0;              // coins on the line this match
  var awaitingKickoff = true; // pre-match: bet panel shown, world frozen
  // Payout multipliers scale with bracket difficulty.
  var WIN_MULTIPLIERS = {
    patsy:  1.10,   // Pee-Wee
    medium: 1.20,   // JV
    hard:   2.00,   // Varsity
    house:  4.00    // The League
  };
  var paTickTimer = null;
  var KICKOFF_LINES = [
    'Kickoff. Home receives at the 25.',
    'Whistle blows. Helmet in play.',
    'Snap. Brain rattles. It begins.',
    'Game ball spotted. Crowd hushes.',
    'Wartburg lights up. Drive begins.'
  ];
  var IDLE_LINES = [
    'Wartburg Memorial. Welcome to the Bowl.',
    'Concession stands closed. They never opened.',
    'PA system—feedback whine.',
    'Visitors’ bench: silent.',
    'A scout in row twelve is taking notes.',
    'Wind out of the north. No flags.',
    'The crowd is wearing coats indoors.',
    'Brain is in the helmet. Helmet is in play.'
  ];
  var DIFF_STORAGE_KEY = 'wendys_palace_crossfire_diff';
  var selectedDiff = 'medium';

  // Gun sits behind the goal line and aims into the field with a ±85° cone,
  // so it can hit anywhere along its own back line including the corners.
  function clampAimUp(a) {
    var span = Math.PI / 180 * 85;
    var min = -Math.PI / 2 - span;
    var max = -Math.PI / 2 + span;
    if (a < min) return min;
    if (a > max) return max;
    return a;
  }

  function resetRound() {
    var phys = window.CFPhysics;
    var midY = (phys.PLAY_TOP + phys.PLAY_BOTTOM) / 2;
    var fromLeft = Math.random() < 0.5;
    var startX = fromLeft ? (phys.PUCK_R + 8) : (W - phys.PUCK_R - 8);
    var speed = 200 + Math.random() * 250;  // 200–450 px/s
    var puck = phys.makePuck(startX, midY);
    puck.vx = fromLeft ? speed : -speed;
    world = {
      width: W,
      height: H,
      marbles: [],
      puck: puck
    };
    player = {
      gunX: W / 2,
      gunY: window.CFPhysics.PLAY_BOTTOM + 36,  // behind player's goal line
      aim: -Math.PI / 2,
      lastFireAt: 0,
      ammo: AMMO_START,
      ammoRegenAccum: 0
    };
    var carryMissiles = ai ? ai.missiles : MISSILE_MAX;
    ai = window.CFAI.makeAIState(selectedDiff);
    ai.missiles = carryMissiles;
    // Red-zone collapse resets per round: full-length field, fresh 15s timer.
    world.goalShiftPx = 0;
    matchStartTime = performance.now();
    redZoneAnnounced = false;
    renderAmmo();
    renderAIAmmo();
    renderMissiles();
    setPA(pickKickoff());
    spaceWasUp = true;
    running = true;
    nextRoundAt = 0;
    if (statusEl) statusEl.textContent = '';
  }

  function resetMatch() {
    score.player = 0;
    score.ai = 0;
    matchOver = false;
    playerMissiles = MISSILE_MAX;
    ai = null;  // so resetRound's carryover defaults to MISSILE_MAX
    matchStartTime = performance.now();
    redZoneAnnounced = false;
    if (world) world.goalShiftPx = 0;
    // Compute per-yard pixels and the max collapse once physics is available.
    var P = window.CFPhysics;
    if (P) {
      var playH = P.PLAY_BOTTOM - P.PLAY_TOP;
      YARD_PX = playH / 100;                    // 100 yards spans the play field
      MAX_SHIFT_PX = ((100 - 25) / 2) * YARD_PX; // cap: 25 yards remaining → 37.5 yards each side
    }
    renderScore();
    updateQtr();
    resetRound();
  }

  // After a touchdown the red zone backs off by N yards (between the goals)
  // and the live collapse continues from the new, looser position.
  function relieveRedZone(yardsBetween) {
    if (!world || !MAX_SHIFT_PX || !YARD_PX) return;
    if ((world.goalShiftPx || 0) <= 0) return;
    var pxRelief = (yardsBetween / 2) * YARD_PX;
    var newShift = Math.max(0, world.goalShiftPx - pxRelief);
    world.goalShiftPx = newShift;
    // Rewind the match clock so the smooth interpolation picks up where the
    // relieved shift now sits, instead of snapping back next frame.
    var newT = newShift / MAX_SHIFT_PX;
    matchStartTime = performance.now() - (COLLAPSE_START_MS + newT * COLLAPSE_DURATION_MS);
    setPA('Whistle stops the clock — goals back 10.');
  }

  // Per-frame: advance the red-zone collapse smoothly once the timer trips.
  function updateRedZone() {
    if (!world || !running || matchOver) return;
    if (matchStartTime <= 0) return;
    var elapsed = performance.now() - matchStartTime;
    if (elapsed < COLLAPSE_START_MS) return;
    // Smooth, frame-by-frame interpolation from 0 → MAX_SHIFT over COLLAPSE_DURATION_MS.
    var t = (elapsed - COLLAPSE_START_MS) / COLLAPSE_DURATION_MS;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    world.goalShiftPx = t * MAX_SHIFT_PX;
    if (!redZoneAnnounced) {
      redZoneAnnounced = true;
      flashScore('RED ZONE!', 'ai', 'goals closing in', 'redzone');
      if (window.CFSfx) window.CFSfx.score('ai');
      setPA('RED ZONE — the field collapses. Closing live.');
    }
  }

  // Pre-match idle: build a visible world but don't run physics. Show bet bar.
  function showBetBar() {
    awaitingKickoff = true;
    running = false;
    matchOver = false;
    if (betbarEl) betbarEl.classList.add('cf-bet-visible');
    if (statusEl) {
      var bal = window.Wallet ? window.Wallet.getBalance() : 0;
      statusEl.textContent = bal > 0
        ? 'Place your wager. Kick off when ready.'
        : 'Balance is empty. Hit the Lobby and earn coin.';
    }
    syncBetMaxFromBalance();
    // Build an idle world so the canvas isn't blank.
    if (!world) {
      world = {
        width: W, height: H, marbles: [],
        puck: window.CFPhysics.makePuck(W / 2, (window.CFPhysics.PLAY_TOP + window.CFPhysics.PLAY_BOTTOM) / 2)
      };
      player = {
        gunX: W / 2,
        gunY: window.CFPhysics.PLAY_BOTTOM + 36,
        aim: -Math.PI / 2,
        lastFireAt: 0,
        ammo: AMMO_START,
        ammoRegenAccum: 0
      };
      ai = window.CFAI.makeAIState(selectedDiff);
    }
  }

  function hideBetBar() {
    if (betbarEl) betbarEl.classList.remove('cf-bet-visible');
  }

  function readBet() {
    if (!betAmountEl) return 0;
    var v = parseInt(betAmountEl.value, 10);
    if (!isFinite(v) || v < 1) return 0;
    return v;
  }

  function syncBetMaxFromBalance() {
    if (!betAmountEl || !window.Wallet) return;
    var bal = window.Wallet.getBalance();
    betAmountEl.max = Math.max(1, bal);
    var v = readBet();
    if (v > bal) betAmountEl.value = bal;
    var btn = document.getElementById('cf-restart');
    if (btn) btn.disabled = bal < 1;
  }

  function kickoff() {
    if (!awaitingKickoff) return;
    if (!window.Wallet) return;
    var bet = readBet();
    if (bet < 1) {
      if (statusEl) statusEl.textContent = 'Pick a wager first.';
      return;
    }
    if (!window.Wallet.spend(bet)) {
      if (statusEl) statusEl.textContent = 'Not enough coin. Lower the wager.';
      return;
    }
    wager = bet;
    awaitingKickoff = false;
    hideBetBar();
    if (window.Child && typeof window.Child.recordPlay === 'function') {
      window.Child.recordPlay();
    }
    if (window.CFSfx) window.CFSfx.kickoff();
    resetMatch();
    setPA('Kickoff. ' + bet + ' on the line.');
  }

  function renderMissiles() {
    if (!missilePips) return;
    for (var i = 0; i < missilePips.length; i++) {
      if (i < playerMissiles) missilePips[i].classList.add('cf-missile-loaded');
      else                    missilePips[i].classList.remove('cf-missile-loaded');
    }
    if (aiMissilePips) {
      for (var j = 0; j < aiMissilePips.length; j++) {
        if (ai && j < ai.missiles) aiMissilePips[j].classList.add('cf-missile-loaded');
        else                       aiMissilePips[j].classList.remove('cf-missile-loaded');
      }
    }
  }

  function fireMissile() {
    if (!running) return;
    if (playerMissiles <= 0) {
      if (window.CFSfx) window.CFSfx.deny();
      return;
    }
    var puck = world.puck;
    var phys = window.CFPhysics;
    var originY = puck.y + phys.PUCK_R + MISSILE_OFFSET;
    phys.fireLaser(world, puck.x, originY, -Math.PI / 2, 'player');
    playerMissiles--;
    renderMissiles();
    if (window.CFSfx) window.CFSfx.laser('player');
    setPA('HAIL MARY — Home throws deep…');
  }

  function renderScore() {
    if (scorePlayerEl) scorePlayerEl.textContent = String(score.player);
    if (scoreAIEl)     scoreAIEl.textContent     = String(score.ai);
  }

  function pulseScore(which) {
    var el = which === 'player' ? scorePlayerEl : scoreAIEl;
    if (!el) return;
    el.classList.remove('cf-pulse');
    // force reflow so the animation restarts
    void el.offsetWidth;
    el.classList.add('cf-pulse');
  }

  function flashScore(text, who, sub, variant) {
    if (!flashEl) return;
    flashEl.innerHTML = text + (sub
      ? '<span class="cf-flash-sub">' + sub + '</span>'
      : '');
    flashEl.classList.remove('cf-flash-on', 'cf-flash-home', 'cf-flash-vis', 'cf-flash-redzone');
    void flashEl.offsetWidth;
    flashEl.classList.add('cf-flash-on');
    if (variant === 'redzone') {
      flashEl.classList.add('cf-flash-redzone');
    } else {
      flashEl.classList.add(who === 'player' ? 'cf-flash-home' : 'cf-flash-vis');
    }
  }

  function setPA(text) {
    if (!paEl) return;
    paEl.textContent = text;
  }

  function pickKickoff() {
    return KICKOFF_LINES[Math.floor(Math.random() * KICKOFF_LINES.length)];
  }
  function pickIdle() {
    return IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
  }
  function startPATicker() {
    if (paTickTimer) clearInterval(paTickTimer);
    paTickTimer = setInterval(function () {
      if (!matchOver && Math.random() < 0.45) setPA(pickIdle());
    }, 6000);
  }

  function updateQtr() {
    if (!qtrEl) return;
    // Quarters tick up with combined score, capped at 4
    var combined = score.player + score.ai;
    var q = Math.min(4, combined + 1);
    qtrEl.textContent = String(q);
  }

  function updatePlayer(dt) {
    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir !== 0) {
      mouseActive = false; // arrows override mouse until next mousemove
      player.aim += dir * (AIM_DEG_PER_SEC * Math.PI / 180) * dt;
      player.aim = clampAimUp(player.aim);
    } else if (mouseActive && mouseAim != null) {
      player.aim = clampAimUp(mouseAim);
    }
  }

  function firePlayer(now) {
    if (!running) return false;
    if (player.ammo <= 0) {
      if (window.CFSfx) window.CFSfx.deny();
      return false;
    }
    if (now - player.lastFireAt < PLAYER_FIRE_COOLDOWN_MS) return false;
    player.lastFireAt = now;
    player.ammo--;
    renderAmmo();
    var a = player.aim;
    world.marbles.push(window.CFPhysics.makeMarble(
      player.gunX + Math.cos(a) * 30,
      player.gunY + Math.sin(a) * 30,
      a,
      'player'
    ));
    if (window.CFSfx) window.CFSfx.fire();
    return true;
  }

  function tickAmmo(dt) {
    if (player.ammo >= AMMO_MAX) {
      player.ammoRegenAccum = 0;
      setAmmoMeter(1);
      return;
    }
    player.ammoRegenAccum += dt * 1000;
    while (player.ammoRegenAccum >= AMMO_REGEN_MS && player.ammo < AMMO_MAX) {
      player.ammoRegenAccum -= AMMO_REGEN_MS;
      player.ammo++;
      renderAmmo();
    }
    setAmmoMeter(player.ammo >= AMMO_MAX ? 1 : player.ammoRegenAccum / AMMO_REGEN_MS);
  }

  function renderAmmo() {
    if (ammoPips) {
      for (var i = 0; i < ammoPips.length; i++) {
        if (i < player.ammo) ammoPips[i].classList.add('cf-ammo-loaded');
        else                 ammoPips[i].classList.remove('cf-ammo-loaded');
      }
    }
    if (ammoCountEl) ammoCountEl.textContent = player.ammo + ' / ' + AMMO_MAX;
  }

  function renderAIAmmo() {
    if (!ai) return;
    if (aiAmmoPips) {
      for (var i = 0; i < aiAmmoPips.length; i++) {
        if (i < ai.ammo) aiAmmoPips[i].classList.add('cf-ammo-loaded');
        else             aiAmmoPips[i].classList.remove('cf-ammo-loaded');
      }
    }
    if (aiAmmoCountEl) aiAmmoCountEl.textContent = ai.ammo + ' / ' + ai.ammoMax;
  }
  function setAmmoMeter(frac) {
    if (!ammoMeterEl) return;
    ammoMeterEl.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
  }

  function tryFirePlayer(now) {
    if (!keys.space || !spaceWasUp) return;
    if (firePlayer(now)) spaceWasUp = false; // require release before next shot
  }

  function endRound(winner) {
    running = false;
    score[winner]++;
    renderScore();
    pulseScore(winner);
    var subScore = winner === 'player'
      ? 'HOME ' + score.player + ' — ' + score.ai + ' VIS'
      : 'VIS ' + score.ai + ' — ' + score.player + ' HOME';
    flashScore('TOUCHDOWN', winner, subScore);
    if (window.CFSfx) window.CFSfx.score(winner);
    relieveRedZone(10);
    if (winner === 'ai' && playerMissiles < MISSILE_MAX) {
      playerMissiles++;
    } else if (winner === 'player' && ai && ai.missiles < ai.missilesMax) {
      ai.missiles++;
    }
    renderMissiles();
    updateQtr();
    if (score[winner] >= WIN_SCORE) {
      matchOver = true;
      var payout = 0;
      if (winner === 'player' && wager > 0 && window.Wallet) {
        var mul = WIN_MULTIPLIERS[selectedDiff] || 2;
        payout = Math.floor(wager * mul);
        window.Wallet.add(payout);
      }
      var finalMsg = winner === 'player'
        ? "FINAL — HOME takes the Bowl, " + score.player + "–" + score.ai +
          ". Payout: " + payout + " coin."
        : "FINAL — Visitors win it, " + score.ai + "–" + score.player +
          ". Wager of " + wager + " lost. Long ride home.";
      if (statusEl) statusEl.textContent = finalMsg;
      if (window.CFSfx) setTimeout(() => window.CFSfx.matchEnd(winner), 600);
      setPA(winner === 'player'
        ? 'Trophy presentation at midfield. Confetti reluctant.'
        : 'The visitors’ bus is already running.');
      wager = 0;
      // Give the player a beat to read the result, then reopen the bet bar.
      setTimeout(showBetBar, 1400);
      return;
    }
    if (statusEl) {
      statusEl.textContent = winner === 'player'
        ? 'TOUCHDOWN — HOME punches it in. ' + score.player + '–' + score.ai + '.'
        : 'VISITORS find the end zone. ' + score.ai + '–' + score.player + '.';
    }
    setPA(winner === 'player'
      ? 'Crowd rises. Brief, embarrassed cheer.'
      : 'Visitors’ sideline subdued. They know what this is.');
    nextRoundAt = performance.now() + ROUND_PAUSE_MS;
  }

  function loop(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    var now = t;
    if (running) {
      updatePlayer(dt);
      tickAmmo(dt);
      updateRedZone();
      tryFirePlayer(now);
      var prevAIMissiles = ai.missiles;
      window.CFAI.updateAI(ai, world, dt, now);
      renderAIAmmo();
      if (ai.missiles !== prevAIMissiles) renderMissiles();
      var winner = window.CFPhysics.stepWorld(world, dt);
      window.CFRender.drawFrame(ctx, world, player, ai);
      if (winner) endRound(winner);
    } else {
      window.CFRender.drawFrame(ctx, world, player, ai);
      if (!matchOver && nextRoundAt && now >= nextRoundAt) resetRound();
    }
    requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft')  { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    if (e.key === ' ' || e.code === 'Space') { keys.space = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft')  keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === ' ' || e.code === 'Space') { keys.space = false; spaceWasUp = true; }
  }

  function canvasMouse(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    var my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    return { x: mx, y: my };
  }
  function onMouseMove(e) {
    if (!player) return;
    var m = canvasMouse(e);
    mouseAim = Math.atan2(m.y - player.gunY, m.x - player.gunX);
    mouseActive = true;
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;     // left button only
    // ignore clicks on interactive UI so the difficulty/restart buttons still work
    if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    var m = canvasMouse(e);
    mouseAim = Math.atan2(m.y - player.gunY, m.x - player.gunX);
    mouseActive = true;
    player.aim = clampAimUp(mouseAim);
    firePlayer(performance.now());
  }
  function onContextMenu(e) {
    if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    fireMissile();
  }

  function bindBetUI() {
    if (betAmountEl) {
      betAmountEl.addEventListener('input', syncBetMaxFromBalance);
    }
    if (betMaxBtn) {
      betMaxBtn.addEventListener('click', function () {
        if (!window.Wallet || !betAmountEl) return;
        if (window.CFSfx) window.CFSfx.button();
        var b = window.Wallet.getBalance();
        betAmountEl.value = Math.max(1, b);
        syncBetMaxFromBalance();
      });
    }
    if (betTierBtns) {
      for (var i = 0; i < betTierBtns.length; i++) {
        (function (b) {
          b.addEventListener('click', function () {
            if (!betAmountEl) return;
            if (window.CFSfx) window.CFSfx.button();
            betAmountEl.value = parseInt(b.getAttribute('data-bet'), 10);
            syncBetMaxFromBalance();
          });
        })(betTierBtns[i]);
      }
    }
    if (window.Wallet && typeof window.Wallet.onChange === 'function') {
      window.Wallet.onChange(syncBetMaxFromBalance);
    }
  }

  function bindDifficultyButtons() {
    diffButtons = document.querySelectorAll('.cf-diff-btn');
    for (var i = 0; i < diffButtons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var d = btn.getAttribute('data-diff');
          if (!d || !window.CFAI.DIFFICULTY[d]) return;
          if (window.CFSfx) window.CFSfx.button();
          selectedDiff = d;
          try { localStorage.setItem(DIFF_STORAGE_KEY, d); } catch (e) {}
          renderDifficulty();
          // Difficulty change takes effect on next kickoff — don't dump
          // an in-progress match (the wager would be lost without payout).
          if (awaitingKickoff && statusEl) {
            statusEl.textContent = 'Bracket: ' + btn.textContent + '. Place your wager.';
          }
        });
      })(diffButtons[i]);
    }
  }

  function renderDifficulty() {
    if (!diffButtons) return;
    for (var i = 0; i < diffButtons.length; i++) {
      var btn = diffButtons[i];
      if (btn.getAttribute('data-diff') === selectedDiff) btn.classList.add('cf-diff-active');
      else btn.classList.remove('cf-diff-active');
    }
    renderPayoutLabel();
  }

  function renderPayoutLabel() {
    var el = document.getElementById('cf-payout-label');
    if (!el) return;
    var mul = WIN_MULTIPLIERS[selectedDiff] || 2;
    // Display 1.10/1.20 as ×1.1/×1.2; whole numbers as ×2/×4.
    el.textContent = '×' + (Number.isInteger(mul) ? mul : mul.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }

  function init() {
    canvas = document.getElementById('cf-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    statusEl = document.getElementById('cf-status');
    restartBtn = document.getElementById('cf-restart');
    scorePlayerEl = document.getElementById('cf-score-player');
    scoreAIEl = document.getElementById('cf-score-ai');
    ammoPips = document.querySelectorAll('#cf-ammo-pips .cf-ammo-pip');
    ammoMeterEl = document.getElementById('cf-ammo-meter-fill');
    ammoCountEl = document.getElementById('cf-ammo-count');
    aiAmmoPips = document.querySelectorAll('#cf-ai-ammo-pips .cf-ammo-pip');
    aiAmmoCountEl = document.getElementById('cf-ai-ammo-count');
    missilePips = document.querySelectorAll('#cf-missiles .cf-missile-pip');
    aiMissilePips = document.querySelectorAll('#cf-ai-missiles .cf-missile-pip');
    qtrEl = document.getElementById('cf-qtr');
    flashEl = document.getElementById('cf-score-flash');
    paEl = document.getElementById('cf-pa');
    betbarEl = document.getElementById('cf-betbar');
    betAmountEl = document.getElementById('cf-bet-amount');
    betMaxBtn = document.getElementById('cf-bet-max');
    betTierBtns = document.querySelectorAll('.cf-bet-tier');
    updateQtr();
    startPATicker();
    bindBetUI();
    // restore last difficulty
    try {
      var saved = localStorage.getItem(DIFF_STORAGE_KEY);
      if (saved && window.CFAI.DIFFICULTY[saved]) selectedDiff = saved;
    } catch (e) {}
    bindDifficultyButtons();
    renderDifficulty();
    showBetBar();
    // Center the arena in the viewport so the player's first sight is the field.
    try { canvas.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // Track mouse on the whole document so aim keeps following when the
    // cursor leaves the canvas / browser window. Click still only fires
    // when the canvas itself was the target.
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('contextmenu', onContextMenu);
    if (restartBtn) restartBtn.addEventListener('click', kickoff);
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.CFGame = { init: init, resetRound: resetRound, resetMatch: resetMatch };
})();
