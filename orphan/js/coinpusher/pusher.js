/* Coin Pusher — clean rebuild.
   Top-down 2D. One deck, one pusher. Coins drop from the chute, pile up,
   get pushed forward by the bar, and plink off the front edge into the
   payout chute with a little animation. Clunky, heavy-feeling physics.
*/
(function () {
  // ====== GEOMETRY (sim units = canvas pixels) ======
  const CABINET_W = 320;
  const CABINET_H = 380;

  const CHUTE_H = 56;                 // top header (chute mechanism area)
  const DECK_Y0 = CHUTE_H;            // back wall of the playfield
  const DECK_Y1 = 320;                // front edge (the plink line)
  const PAYOUT_H = CABINET_H - DECK_Y1;

  // Pusher: a wide horizontal bar that slides forward in +Y. The physics
  // body is just the front face — when it strokes forward, the front edge
  // sweeps through coins and pushes them. A separate visual "tongue" is
  // rendered behind it to read as connected to the back wall.
  const PUSHER_W            = 280;
  const PUSHER_FACE_THICK   = 22;
  const PUSHER_TRAVEL       = 32;
  const PUSHER_PERIOD_MS    = 2800;
  const PUSHER_REST_CENTER_Y    = DECK_Y0 + PUSHER_FACE_THICK / 2;          // body top flush w/ back wall
  const PUSHER_REST_FRONT_Y     = PUSHER_REST_CENTER_Y + PUSHER_FACE_THICK / 2;
  const PUSHER_FORWARD_FRONT_Y  = PUSHER_REST_FRONT_Y + PUSHER_TRAVEL;

  const CHUTE_X_MIN = 28;
  const CHUTE_X_MAX = CABINET_W - 28;

  // ====== COINS ======
  const COIN_RADIUS      = 10;
  const TOKEN_RADIUS     = 12;
  const TOKEN_RADIUS_BIG = 16;

  // Spawn INSIDE the pusher's sweep zone — slightly past the midpoint between
  // its rest and forward front-face positions. Sitting on the "front" half of
  // the sweep means if a spawn happens to overlap the pusher mid-stroke, the
  // closest face is the front face, so the coin gets ejected FORWARD (not
  // backward, which would put it behind the bar).
  const SPAWN_Y = Math.round((PUSHER_REST_FRONT_Y + PUSHER_FORWARD_FRONT_Y) / 2 + 8);

  const CANVAS_W = CABINET_W;
  const CANVAS_H = CABINET_H;
  const CSS_W    = 360;

  // ====== PHYSICS — clunky/heavy ======
  const COIN_FRICTION_AIR = 0.10;     // tabletop drag — coins slow down decisively
  const COIN_FRICTION     = 0.40;     // grip when coins touch each other
  const COIN_RESTITUTION  = 0.08;     // barely any bounce
  const COIN_DENSITY      = 0.004;    // 4× Matter's default — they feel weighty
  const PERSIST_INTERVAL_MS = 5000;

  // ====== ANIMATIONS ======
  const DROP_ANIM_MS  = 260;
  const PLINK_ANIM_MS = 600;

  // ====== TIERS ======
  const TIER_WEIGHTS = [
    { tier: 10,   weight: 0.72 },
    { tier: 100,  weight: 0.25 },
    { tier: 1000, weight: 0.03 },
  ];
  // Seed counts per tier — lots of 10s, a handful of 100s, the occasional 1000.
  const STARTER_TIER_10   = 70;
  const STARTER_TIER_100  = 22;
  const STARTER_TIER_1000 = 3;
  const STARTER_FILLER_COUNT = 0;

  const COIN_COLORS = {
    // Common 10s — brushed copper/bronze.
    10:     { base: '#bf9b5a', highlight: '#ecc88a', dark: '#6a4a20', rim: '#3a2810', text: '#1a0e08' },
    // Hundred coins — gold.
    100:    { base: '#d4af37', highlight: '#f5dc7e', dark: '#8a6420', rim: '#5a3a14', text: '#1a0e08' },
    // Thousand coins — the rare prize chips. Red face, gold rim.
    1000:   { base: '#b02030', highlight: '#ec6878', dark: '#5a0a14', rim: '#d4af37', text: '#fae0d0' },
    token:      { base: '#2a8a52', highlight: '#7adfa0', dark: '#0e3a24', rim: '#1a6840', text: '#08180e' },
    'token-big':{ base: '#2a8a52', highlight: '#7adfa0', dark: '#0e3a24', rim: '#d4af37', text: '#08180e' },
    filler: { base: '#52504c', highlight: '#787268', dark: '#2a2824', rim: '#1a1816', text: '#1a1816' },
  };

  // ====== STORAGE ======
  const STORAGE_KEY    = 'wendys_palace_coinpusher';
  const SCHEMA_VERSION = 8;

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  }
  function writeStorage(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  function readDrops() {
    const obj = readStorage();
    const drops = Array.isArray(obj.drops) ? obj.drops : [];
    return drops.filter((d) => d && d.count > 0);
  }
  function totalTokensInStorage() {
    return readDrops().reduce((s, d) => s + d.count, 0);
  }
  function dropTokenSpec(d) {
    if (typeof d.multiplier === 'number') return { multiplier: d.multiplier, big: !!d.big };
    const legacy = typeof d.wager === 'number' ? d.wager : 0;
    const inferred = legacy > 0 ? Math.max(1, legacy / Math.max(1, cachedLastBet)) : 1;
    return { multiplier: inferred, big: false };
  }
  function consumeOneToken() {
    const obj = readStorage();
    const drops = Array.isArray(obj.drops) ? obj.drops : [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d && d.count > 0) {
        const spec = dropTokenSpec(d);
        d.count -= 1;
        if (d.count === 0) drops.splice(i, 1);
        obj.drops = drops;
        writeStorage(obj);
        return spec;
      }
    }
    return null;
  }

  // ====== STATE ======
  let engine, world, pusherBody;
  let coins = [];
  let plinking = [];           // coins currently animating off the edge
  let canvas, ctx;
  let renderScale = 1;
  let chuteX = CABINET_W / 2;
  let mouseOverCanvas = false;
  let mouseX = chuteX;
  let keyState = {};
  let lastDrop = 0;
  let pusherTimeStart = 0;
  let sessionWon = 0;
  let cachedLastBet = 1;
  let lastSeenRollCount = 0;
  let lastPersist = 0;
  let queueEl, onfieldEl, wonEl;
  const sprites = {};

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => persistFieldCoins());
  window.addEventListener('pagehide',     () => persistFieldCoins());

  function init() {
    canvas = document.getElementById('cp-pusher-canvas');
    if (!canvas) return;
    if (typeof Matter === 'undefined') {
      console.warn('[coinpusher] Matter.js not loaded — pusher disabled.');
      return;
    }
    setupCanvas();

    queueEl   = document.getElementById('cp-pusher-queue');
    onfieldEl = document.getElementById('cp-pusher-onfield');
    wonEl     = document.getElementById('cp-pusher-won');

    engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    engine.positionIterations = 8;
    engine.velocityIterations = 8;
    world = engine.world;

    buildStaticBodies();
    refreshLastBet();
    loadOrSeedField();

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseenter', () => { mouseOverCanvas = true; });
    canvas.addEventListener('mouseleave', () => { mouseOverCanvas = false; });
    canvas.addEventListener('click', () => { canvas.focus(); tryDrop(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    setInterval(pollStorage, 500);

    pusherTimeStart = performance.now();
    updateHud();
    requestAnimationFrame(loop);
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    renderScale = (CSS_W / CANVAS_W) * dpr;
    canvas.width  = Math.round(CANVAS_W * renderScale);
    canvas.height = Math.round(CANVAS_H * renderScale);
    ctx = canvas.getContext('2d');
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function buildStaticBodies() {
    const wallOpts = {
      isStatic: true,
      label: 'wall',
      friction: 0.2,
      restitution: 0.05,
    };

    Matter.Composite.add(world, [
      Matter.Bodies.rectangle(-10,            CABINET_H / 2, 20, CABINET_H + 60, wallOpts),
      Matter.Bodies.rectangle(CABINET_W + 10, CABINET_H / 2, 20, CABINET_H + 60, wallOpts),
      // Back wall sits just inside the chute housing so coins can't enter the header
      Matter.Bodies.rectangle(CABINET_W / 2, DECK_Y0 - 10, CABINET_W + 60, 20, wallOpts),
    ]);

    // Pusher: thin front-face body. Slides forward in +Y and its leading
    // edge pushes coins sitting in its sweep zone.
    pusherBody = Matter.Bodies.rectangle(
      CABINET_W / 2,
      PUSHER_REST_CENTER_Y,
      PUSHER_W,
      PUSHER_FACE_THICK,
      { isStatic: true, label: 'pusher', friction: 0.15, restitution: 0 }
    );
    Matter.Composite.add(world, pusherBody);
  }

  // ====== INPUT ======
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) * (CANVAS_W / rect.width));
  }
  function isPusherFocused() {
    return mouseOverCanvas || document.activeElement === canvas;
  }
  function onKeyDown(e) {
    if (!isPusherFocused()) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      keyState[e.key] = true;
    } else if (e.key === ' ') {
      e.preventDefault();
      tryDrop();
    }
  }
  function onKeyUp(e) { keyState[e.key] = false; }

  // ====== FIELD ======
  function refreshLastBet() {
    const obj = readStorage();
    cachedLastBet     = Math.max(1, obj.lastBet || 1);
    lastSeenRollCount = obj.rollCount || 0;
  }

  function loadOrSeedField() {
    const obj = readStorage();
    if (obj.version === SCHEMA_VERSION && Array.isArray(obj.fieldCoins) && obj.fieldCoins.length > 0) {
      for (const fc of obj.fieldCoins) restoreCoin(fc);
    } else {
      seedStarterField();
      persistFieldCoins();
    }
  }

  function randomTier() {
    const r = Math.random();
    let acc = 0;
    for (const tw of TIER_WEIGHTS) {
      acc += tw.weight;
      if (r < acc) return tw.tier;
    }
    return TIER_WEIGHTS[0].tier;
  }

  function seedStarterField() {
    // Pack the deck with a stacked pile of coins so the player walks into a
    // tempting full table: mostly 10s, a handful of 100s, the occasional
    // 1000-coin prize chip. No filler — every coin pays out.
    const safeY0 = SPAWN_Y;
    const safeY1 = DECK_Y1 - COIN_RADIUS - 4;
    function placeTier(count, tier) {
      for (let i = 0; i < count; i++) {
        const x = 22 + Math.random() * (CABINET_W - 44);
        const y = safeY0 + Math.random() * (safeY1 - safeY0);
        spawnPreplacedCoin(x, y, tier);
      }
    }
    placeTier(STARTER_TIER_10,   10);
    placeTier(STARTER_TIER_100,  100);
    placeTier(STARTER_TIER_1000, 1000);
  }

  function restoreCoin(fc) {
    if (!fc) return;
    const x = clampSafe(fc.x, 4, CABINET_W - 4);
    const y = clampSafe(fc.y, SPAWN_Y - 4, DECK_Y1 - 4);
    if (fc.kind === 'preplaced' || fc.tier != null) {
      const t = TIER_WEIGHTS.some((w) => w.tier === fc.tier) ? fc.tier : 1;
      spawnPreplacedCoin(x, y, t);
    } else if (fc.kind === 'token') {
      const mult = typeof fc.multiplier === 'number' ? fc.multiplier : 1;
      spawnTokenCoin(x, y, mult, !!fc.big);
    } else if (fc.kind === 'filler') {
      spawnFillerCoin(x, y);
    }
  }

  function clampSafe(v, min, max) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return (min + max) / 2;
    return Math.max(min, Math.min(max, v));
  }

  // ====== SPAWN ======
  function radiusOf(c) {
    if (!c) return COIN_RADIUS;
    if (c.kind === 'token') return c.big ? TOKEN_RADIUS_BIG : TOKEN_RADIUS;
    return COIN_RADIUS;
  }
  function coinTierKey(c) {
    if (c.kind === 'token')  return c.big ? 'token-big' : 'token';
    if (c.kind === 'filler') return 'filler';
    return c.tier;
  }
  function buildCircleBody(x, y, radius) {
    return Matter.Bodies.circle(x, y, radius, {
      frictionAir: COIN_FRICTION_AIR,
      friction:    COIN_FRICTION,
      restitution: COIN_RESTITUTION,
      density:     COIN_DENSITY,
      label:       'coin',
    });
  }
  function spawnPreplacedCoin(x, y, tier) {
    const body = buildCircleBody(x, y, COIN_RADIUS);
    const c = { body, kind: 'preplaced', tier };
    updateCoinMass(c);
    Matter.Composite.add(world, body);
    coins.push(c);
    return c;
  }
  function spawnTokenCoin(x, y, multiplier, big, freshDrop) {
    const radius = big ? TOKEN_RADIUS_BIG : TOKEN_RADIUS;
    const body = buildCircleBody(x, y, radius);
    const c = { body, kind: 'token', multiplier, big: !!big };
    updateCoinMass(c);
    Matter.Composite.add(world, body);
    if (freshDrop) {
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      c.dropAt = performance.now();
    }
    coins.push(c);
    return c;
  }
  function spawnFillerCoin(x, y) {
    const body = buildCircleBody(x, y, COIN_RADIUS);
    Matter.Body.setMass(body, 1.2);
    Matter.Composite.add(world, body);
    coins.push({ body, kind: 'filler' });
  }

  function coinValue(c) {
    if (c.kind === 'token')     return Math.max(1, Math.ceil(cachedLastBet * c.multiplier));
    if (c.kind === 'preplaced') return Math.max(1, Math.floor(cachedLastBet * c.tier));
    return 0;
  }
  function updateCoinMass(c) {
    Matter.Body.setMass(c.body, Math.max(1, Math.sqrt(coinValue(c))) * 1.6);
  }

  // ====== DROP ======
  function tryDrop() {
    const now = performance.now();
    if (now - lastDrop < 220) return;
    const spec = consumeOneToken();
    if (spec == null) return;
    lastDrop = now;
    spawnTokenCoin(chuteX, SPAWN_Y, spec.multiplier, spec.big, true);
    persistFieldCoins();
    updateHud();
  }

  // ====== TICK ======
  function updateChute() {
    if (mouseOverCanvas) chuteX = mouseX;
    else {
      if (keyState['ArrowLeft'])  chuteX -= 5;
      if (keyState['ArrowRight']) chuteX += 5;
    }
    chuteX = Math.max(CHUTE_X_MIN, Math.min(CHUTE_X_MAX, chuteX));
  }

  function updatePusher(t) {
    const phase = ((t - pusherTimeStart) % PUSHER_PERIOD_MS) / PUSHER_PERIOD_MS;
    const u = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    Matter.Body.setPosition(pusherBody, {
      x: CABINET_W / 2,
      y: PUSHER_REST_CENTER_Y + PUSHER_TRAVEL * u,
    });
  }

  function checkExits(now) {
    let fieldChanged = false;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const y = c.body.position.y;
      if (y > DECK_Y1) {
        // Hand the coin over to the plink animation list. Pay out immediately
        // so the player feels the reward as the animation starts.
        const value = coinValue(c);
        plinking.push({
          x: c.body.position.x,
          y: c.body.position.y,
          angle: c.body.angle,
          r: radiusOf(c),
          tierKey: coinTierKey(c),
          value,
          start: now,
        });
        if (value > 0) payOut(value);
        Matter.Composite.remove(world, c.body);
        coins.splice(i, 1);
        fieldChanged = true;
      }
    }
    if (fieldChanged) persistFieldCoins();
  }

  function updatePlinking(now) {
    for (let i = plinking.length - 1; i >= 0; i--) {
      if (now - plinking[i].start > PLINK_ANIM_MS) plinking.splice(i, 1);
    }
  }

  function payOut(amount) {
    if (amount <= 0) return;
    sessionWon += amount;
    if (window.Wallet) window.Wallet.add(amount);
    updateHud();
  }

  function persistFieldCoins() {
    const obj = readStorage();
    obj.version = SCHEMA_VERSION;
    obj.fieldCoins = coins.map((c) => {
      const base = {
        x: c.body.position.x,
        y: c.body.position.y,
        kind: c.kind,
      };
      if (c.kind === 'preplaced')   base.tier = c.tier;
      else if (c.kind === 'token') {
        base.multiplier = c.multiplier;
        base.big        = !!c.big;
      }
      return base;
    });
    writeStorage(obj);
  }

  function pollStorage() {
    const obj = readStorage();
    const newLastBet   = Math.max(1, obj.lastBet || 1);
    const newRollCount = obj.rollCount || 0;
    if (newLastBet !== cachedLastBet) {
      cachedLastBet = newLastBet;
      for (const c of coins) {
        if (c.kind === 'preplaced' || c.kind === 'token') updateCoinMass(c);
      }
    }
    if (newRollCount > lastSeenRollCount) {
      const delta = newRollCount - lastSeenRollCount;
      for (let i = 0; i < delta; i++) replenishOneCoin();
      lastSeenRollCount = newRollCount;
      persistFieldCoins();
    }
    updateHud();
  }

  function replenishOneCoin() {
    const tier = randomTier();
    const x = 30 + Math.random() * (CABINET_W - 60);
    spawnPreplacedCoin(x, SPAWN_Y, tier);
  }

  function updateHud() {
    if (queueEl)   queueEl.textContent   = String(totalTokensInStorage());
    if (onfieldEl) onfieldEl.textContent = String(coins.length);
    if (wonEl)     wonEl.textContent     = String(sessionWon);
  }

  // ====== LOOP ======
  let lastFrame = 0;
  function loop(t) {
    if (!lastFrame) lastFrame = t;
    const dt = Math.min(t - lastFrame, 1000 / 30);
    lastFrame = t;

    updateChute();
    updatePusher(t);
    Matter.Engine.update(engine, dt);
    checkExits(t);
    updatePlinking(t);

    if (t - lastPersist > PERSIST_INTERVAL_MS) {
      persistFieldCoins();
      lastPersist = t;
    }

    render(t);
    requestAnimationFrame(loop);
  }

  // ====== RENDER ======
  function render(t) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawChuteHousing();
    drawDeck();
    drawPusher();
    drawEdgeGlow(t);
    if (totalTokensInStorage() > 0) drawDropIndicator(t);
    for (const c of coins) drawCoin(c, t);
    for (const p of plinking) drawPlinking(p, t);
    drawPayoutChute(t);
    drawCabinetFrame();
  }

  function drawChuteHousing() {
    const g = ctx.createLinearGradient(0, 0, 0, CHUTE_H);
    g.addColorStop(0,    '#221412');
    g.addColorStop(0.6,  '#1a0e0c');
    g.addColorStop(1,    '#080404');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CHUTE_H);

    // Brass divider — seam between housing and deck
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, CHUTE_H - 3, CANVAS_W, 2);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.fillRect(0, CHUTE_H - 1, CANVAS_W, 1);

    // "▼ DROP COIN" label
    ctx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.font = 'bold 9px "VT323", "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('▼ DROP COIN', 10, 4);

    // The movable chute opening
    const cw = TOKEN_RADIUS_BIG * 2 + 12;
    const cTop = 8;
    const cBot = CHUTE_H - 6;
    const cGrad = ctx.createLinearGradient(0, cTop, 0, cBot);
    cGrad.addColorStop(0,    '#9a7848');
    cGrad.addColorStop(0.45, '#5a3e22');
    cGrad.addColorStop(1,    '#1a1010');
    ctx.fillStyle = cGrad;
    ctx.fillRect(chuteX - cw / 2, cTop, cw, cBot - cTop);
    ctx.strokeStyle = '#b8965c';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(chuteX - cw / 2, cTop, cw, cBot - cTop);
    ctx.fillStyle = '#020101';
    ctx.fillRect(chuteX - cw / 2 + 2, cBot - 4, cw - 4, 4);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(chuteX - cw / 2, cBot - 1, cw, 1);
    ctx.fillStyle = 'rgba(240, 220, 160, 0.7)';
    ctx.font = 'bold 9px "VT323", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHUTE', chuteX, (cTop + cBot) / 2);
  }

  function drawDeck() {
    // Felt
    const g = ctx.createLinearGradient(0, DECK_Y0, 0, DECK_Y1);
    g.addColorStop(0,    '#163a2c');
    g.addColorStop(0.5,  '#0d2a1c');
    g.addColorStop(1,    '#082014');
    ctx.fillStyle = g;
    ctx.fillRect(0, DECK_Y0, CANVAS_W, DECK_Y1 - DECK_Y0);

    // Felt grain
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = DECK_Y0 + 6; y < DECK_Y1; y += 12) {
      for (let x = ((y / 12) | 0) % 2 === 0 ? 8 : 16; x < CANVAS_W; x += 18) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Front-edge shadow (the lip the coins plink over)
    const fade = ctx.createLinearGradient(0, DECK_Y1 - 14, 0, DECK_Y1);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, DECK_Y1 - 14, CANVAS_W, 14);

    // Dashed gold win line
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0,        DECK_Y1 - 0.5);
    ctx.lineTo(CANVAS_W, DECK_Y1 - 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawEdgeGlow(t) {
    // Subtle pulse along the win line so the eye keeps coming back to it.
    const pulse = 0.4 + 0.2 * Math.sin(t / 600);
    ctx.fillStyle = `rgba(212, 175, 55, ${pulse * 0.18})`;
    ctx.fillRect(0, DECK_Y1 - 4, CANVAS_W, 3);
  }

  function drawPusher() {
    const cx = pusherBody.position.x;
    const cy = pusherBody.position.y;
    const x0 = cx - PUSHER_W / 2;
    const yFrontFaceTop = cy - PUSHER_FACE_THICK / 2;  // top of the face block (= back of pusher)

    // ---- Tongue: dark housing rail extending from the back wall to the
    // pusher's trailing edge. Grows as the pusher strokes forward so the
    // bar always reads as connected to the cabinet's back wall.
    const tongueH = yFrontFaceTop - DECK_Y0;
    if (tongueH > 0) {
      const tg = ctx.createLinearGradient(0, DECK_Y0, 0, yFrontFaceTop);
      tg.addColorStop(0,   '#0c0606');
      tg.addColorStop(0.5, '#1a0e08');
      tg.addColorStop(1,   '#2a1a10');
      ctx.fillStyle = tg;
      ctx.fillRect(x0 + 18, DECK_Y0, PUSHER_W - 36, tongueH);

      // Twin rails along the tongue
      ctx.fillStyle = 'rgba(212, 175, 55, 0.32)';
      ctx.fillRect(x0 + 28, DECK_Y0, 1, tongueH);
      ctx.fillRect(x0 + PUSHER_W - 28, DECK_Y0, 1, tongueH);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x0 + 16, DECK_Y0, 2, tongueH);
      ctx.fillRect(x0 + PUSHER_W - 18, DECK_Y0, 2, tongueH);
    }

    // ---- Front face (the visible "bar"): slab with brass leading edge.
    const fg = ctx.createLinearGradient(0, yFrontFaceTop, 0, yFrontFaceTop + PUSHER_FACE_THICK);
    fg.addColorStop(0,    '#3a2418');
    fg.addColorStop(0.3,  '#6a4828');
    fg.addColorStop(0.7,  '#a8845a');
    fg.addColorStop(1,    '#5a3e22');
    ctx.fillStyle = fg;
    ctx.fillRect(x0, yFrontFaceTop, PUSHER_W, PUSHER_FACE_THICK);

    // Trailing edge — dark
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x0, yFrontFaceTop, PUSHER_W, 1.5);

    // Leading edge — bright brass, this is the pushing face
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(x0, yFrontFaceTop + PUSHER_FACE_THICK - 2, PUSHER_W, 2);
    ctx.fillStyle = 'rgba(255, 230, 150, 0.55)';
    ctx.fillRect(x0, yFrontFaceTop + PUSHER_FACE_THICK - 2, PUSHER_W, 0.6);

    // Forward chevrons stamped on the front face
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.5)';
    ctx.lineWidth = 1.2;
    const chevCount = 7;
    for (let i = 0; i < chevCount; i++) {
      const cxC = x0 + 10 + ((PUSHER_W - 20) / chevCount) * (i + 0.5);
      const yMid = yFrontFaceTop + PUSHER_FACE_THICK * 0.5;
      ctx.beginPath();
      ctx.moveTo(cxC - 5, yMid - 3);
      ctx.lineTo(cxC,     yMid + 3);
      ctx.lineTo(cxC + 5, yMid - 3);
      ctx.stroke();
    }

    // Side bevels on the front face
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x0,                  yFrontFaceTop, 1.5, PUSHER_FACE_THICK);
    ctx.fillRect(x0 + PUSHER_W - 1.5, yFrontFaceTop, 1.5, PUSHER_FACE_THICK);
  }

  function drawDropIndicator(t) {
    const pulse = 0.55 + 0.35 * Math.sin(t / 600);

    // Trail line from chute mouth down to the spawn point on the deck.
    const yStart = CHUTE_H + 2;
    const yEnd   = SPAWN_Y - TOKEN_RADIUS_BIG - 2;
    const trail = ctx.createLinearGradient(0, yStart, 0, yEnd);
    trail.addColorStop(0, `rgba(212, 175, 55, ${0.45 * pulse})`);
    trail.addColorStop(1, `rgba(212, 175, 55, ${0.85 * pulse})`);
    ctx.strokeStyle = trail;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(chuteX, yStart);
    ctx.lineTo(chuteX, yEnd);
    ctx.stroke();
    ctx.setLineDash([]);

    // Landing ring at the spawn point
    ctx.strokeStyle = `rgba(255, 220, 130, ${0.85 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(chuteX, SPAWN_Y, TOKEN_RADIUS_BIG + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center dot
    ctx.fillStyle = `rgba(255, 235, 160, ${0.85 * pulse})`;
    ctx.beginPath();
    ctx.arc(chuteX, SPAWN_Y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoin(c, now) {
    const p = c.body.position;
    const r = radiusOf(c);
    const tierKey = coinTierKey(c);
    const sprite  = getSprite(tierKey);
    const colors  = COIN_COLORS[tierKey];
    const val     = coinValue(c);

    // Drop animation: brief scale-up + golden ring on impact.
    let scaleMod = 1;
    let ringAlpha = 0;
    let ringR = r;
    if (c.dropAt) {
      const dp = (now - c.dropAt) / DROP_ANIM_MS;
      if (dp >= 1) {
        delete c.dropAt;
      } else {
        const eased = 1 - dp;
        scaleMod = 1 + eased * 0.28;       // 1.28 → 1
        ringAlpha = eased * 0.7;
        ringR = r + eased * r * 1.4;
      }
    }

    // Ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.arc(p.x + 1.4, p.y + 2, r * 0.95 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Impact ring (drop animation)
    if (ringAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = '#ffd84a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Coin body — rotates with physics
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(c.body.angle);
    ctx.scale(scaleMod, scaleMod);
    const half = sprite.cssSize / 2;
    ctx.drawImage(sprite.canvas, -half, -half, sprite.cssSize, sprite.cssSize);
    ctx.restore();

    // Value text
    if (c.kind !== 'filler') {
      ctx.fillStyle = colors.text;
      const baseFont = Math.max(7, Math.round(r * 0.82 * scaleMod));
      const font = val >= 1000 ? Math.max(6, baseFont - 3)
                : val >= 100  ? Math.max(7, baseFont - 1)
                : baseFont;
      ctx.font = `bold ${font}px "VT323", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(val), p.x, p.y);
    }
  }

  function drawPlinking(plink, now) {
    const dp = Math.min(1, (now - plink.start) / PLINK_ANIM_MS);
    // Fall forward, spin, shrink, fade.
    const dy = dp * dp * 55;
    const dx = Math.sin(dp * Math.PI * 3) * 4 * (1 - dp);
    const scale = 1 - dp * 0.55;
    const alpha = 1 - dp;
    const spin = plink.angle + dp * Math.PI * 1.8;
    const x = plink.x + dx;
    const y = plink.y + dy;
    const sprite = getSprite(plink.tierKey);
    const colors = COIN_COLORS[plink.tierKey];

    // Shadow shrinks/fades
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 1.4, y + 2 + dy * 0.2, plink.r * 0.9 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Coin disc
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(scale, scale);
    const half = sprite.cssSize / 2;
    ctx.drawImage(sprite.canvas, -half, -half, sprite.cssSize, sprite.cssSize);
    ctx.restore();

    // Floating "+VALUE" text — only for scoring coins
    if (plink.value > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - dp * 1.1);
      ctx.fillStyle = '#1aff7f';
      ctx.font = `bold ${Math.round(12 + dp * 4)}px "VT323", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + plink.value, plink.x, plink.y - 12 - dp * 26);
      ctx.restore();
    }
  }

  function drawPayoutChute(t) {
    const y0 = DECK_Y1;
    const y1 = CABINET_H;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0,    '#1a0a0c');
    g.addColorStop(0.5,  '#0a0405');
    g.addColorStop(1,    '#020101');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, CANVAS_W, y1 - y0);

    // Hard top shadow — the deck's lip casting into the chute
    const innerShadow = ctx.createLinearGradient(0, y0, 0, y0 + 14);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = innerShadow;
    ctx.fillRect(0, y0, CANVAS_W, 14);

    // Side rails to frame the chute
    const sideW = 26;
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(0,                y0, sideW, y1 - y0);
    ctx.fillRect(CANVAS_W - sideW, y0, sideW, y1 - y0);
    ctx.strokeStyle = 'rgba(180, 140, 70, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sideW,             y0);
    ctx.lineTo(sideW,             y1);
    ctx.moveTo(CANVAS_W - sideW,  y0);
    ctx.lineTo(CANVAS_W - sideW,  y1);
    ctx.stroke();

    // PAYOUT label — flickers brighter when something is plinking
    const recent = plinking.length > 0
      ? Math.max(...plinking.map((p) => 1 - Math.min(1, (t - p.start) / PLINK_ANIM_MS)))
      : 0;
    ctx.fillStyle = `rgba(212, 175, 55, ${0.55 + recent * 0.4})`;
    ctx.font = 'bold 12px "VT323", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼  PAYOUT  ▼', CANVAS_W / 2, (y0 + y1) / 2);
  }

  function drawCabinetFrame() {
    ctx.strokeStyle = '#7a5828';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 2.5, CANVAS_W - 5, CANVAS_H - 5);
  }

  // ====== SPRITES ======
  function getSprite(tierKey) {
    if (sprites[tierKey]) return sprites[tierKey];
    const colors = COIN_COLORS[tierKey];
    const isFiller = tierKey === 'filler';
    const isToken  = tierKey === 'token' || tierKey === 'token-big';
    const r = tierKey === 'token-big' ? TOKEN_RADIUS_BIG
           : isToken                  ? TOKEN_RADIUS
           : COIN_RADIUS;
    const pad = 3;
    const cssSize = (r + pad) * 2;
    const ss = 3;
    const internalSize = Math.round(cssSize * ss);
    const c = document.createElement('canvas');
    c.width = c.height = internalSize;
    const k = c.getContext('2d');
    k.scale(ss, ss);
    k.translate(r + pad, r + pad);

    // Outer rim
    k.fillStyle = colors.dark;
    k.beginPath();
    k.arc(0, 0, r, 0, Math.PI * 2);
    k.fill();

    // Face with radial gradient
    const g = k.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r);
    g.addColorStop(0,    colors.highlight);
    g.addColorStop(0.55, colors.base);
    g.addColorStop(1,    colors.dark);
    k.fillStyle = g;
    k.beginPath();
    k.arc(0, 0, r - 1.2, 0, Math.PI * 2);
    k.fill();

    if (!isFiller) {
      // Inner ring
      k.strokeStyle = colors.rim;
      k.lineWidth = 1;
      k.beginPath();
      k.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      k.stroke();

      // Reeded edge (a few more ticks for clunky-coin feel)
      k.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      k.lineWidth = 0.6;
      const ticks = 28;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const x1 = Math.cos(a) * (r - 0.9);
        const y1 = Math.sin(a) * (r - 0.9);
        const x2 = Math.cos(a) * (r - 0.1);
        const y2 = Math.sin(a) * (r - 0.1);
        k.beginPath();
        k.moveTo(x1, y1);
        k.lineTo(x2, y2);
        k.stroke();
      }

      // Specular highlight (top-left)
      k.fillStyle = 'rgba(255, 255, 255, 0.45)';
      k.beginPath();
      k.ellipse(-r * 0.38, -r * 0.45, r * 0.2, r * 0.09, -0.45, 0, Math.PI * 2);
      k.fill();
    } else {
      // Filler is scuffed steel
      k.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      k.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        k.beginPath();
        k.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        k.lineTo(Math.cos(a + 0.2) * r * 0.75, Math.sin(a + 0.2) * r * 0.75);
        k.stroke();
      }
      k.fillStyle = 'rgba(255, 255, 255, 0.08)';
      k.beginPath();
      k.ellipse(-r * 0.3, -r * 0.45, r * 0.5, r * 0.18, 0, 0, Math.PI * 2);
      k.fill();
    }

    // Outline
    k.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    k.lineWidth = 0.7;
    k.beginPath();
    k.arc(0, 0, r - 0.3, 0, Math.PI * 2);
    k.stroke();

    sprites[tierKey] = { canvas: c, cssSize };
    return sprites[tierKey];
  }
})();
