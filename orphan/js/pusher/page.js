/* The Pusher — attached to the bottom of the craps page.
   Top-down 2D. The deck is pre-seeded with house chips (1 / 5 / 50 / 100 /
   1000 denominations) so the player walks in to a packed table. Tokens
   minted on the craps roll drop in from the chute and shove the pile
   forward. Anything that plinks off the front edge pays its denomination
   straight to the wallet.

   The pusher's physics body is tall (face thickness + full travel) so its
   trailing edge ALWAYS reaches the back wall. A static back-fill body
   covers the exposed area behind the bar; collision filters let the bar
   slide through the back-fill but block coins from entering it. Nothing
   can get stuck behind the launcher.
*/
(function () {
  // ====== GEOMETRY ======
  const CABINET_W = 320;
  const CABINET_H = 380;

  const CHUTE_H  = 50;
  const DECK_Y0  = CHUTE_H;
  const DECK_Y1  = 310;            // front edge — plink line
  const PAYOUT_H = CABINET_H - DECK_Y1;

  // PUSHER — tall body so the back always touches the back wall.
  const PUSHER_W            = 280;
  const PUSHER_FACE_THICK   = 22;       // visible bright leading edge
  const PUSHER_TRAVEL       = 56;
  const PUSHER_BODY_H       = PUSHER_FACE_THICK + PUSHER_TRAVEL;
  const PUSHER_PERIOD_MS    = 1400;
  const PUSHER_REST_CENTER  = DECK_Y0 + PUSHER_BODY_H / 2;
  const PUSHER_REST_FRONT   = PUSHER_REST_CENTER + PUSHER_BODY_H / 2;
  const PUSHER_MAX_FRONT    = PUSHER_REST_FRONT + PUSHER_TRAVEL;
  const PUSHER_MAX_BACK     = DECK_Y0 + PUSHER_TRAVEL;
  const PUSHER_MAX_VEL_PER_MS = (PUSHER_TRAVEL * Math.PI) / PUSHER_PERIOD_MS;

  const CHUTE_X_MIN = 28;
  const CHUTE_X_MAX = CABINET_W - 28;
  // Spawn well past the pusher's max-back position (so coins can never be
  // ejected backward into the back-fill area) AND ahead of the rest front
  // face so a fresh drop sits in the sweep zone for the next forward stroke.
  const SPAWN_Y = 158;

  // ====== COINS ======
  const TOKEN_BASE_RADIUS = 13;
  // House chips — smaller and tiered by denomination.
  const CHIP_DENOMS = [
    { value: 1,    weight: 30, radius: 9,  colorKey: 'bronze' },
    { value: 5,    weight: 18, radius: 10, colorKey: 'silver' },
    { value: 50,   weight: 8,  radius: 11, colorKey: 'gold'   },
    { value: 100,  weight: 3,  radius: 12, colorKey: 'goldhot'},
    { value: 1000, weight: 1,  radius: 14, colorKey: 'prize'  },
  ];
  const COIN_COLORS = {
    bronze:  { rim: '#3a1810', dark: '#5a3010', base: '#9a6230', high: '#cc8050', text: '#1a0a04' },
    silver:  { rim: '#383c40', dark: '#586068', base: '#a8b0b8', high: '#e0e4e8', text: '#1a1c20' },
    gold:    { rim: '#5a3a14', dark: '#8a6420', base: '#d4af37', high: '#f5dc7e', text: '#1a0e08' },
    goldhot: { rim: '#6a4810', dark: '#a87820', base: '#f0c040', high: '#fff0a0', text: '#1a0e08' },
    prize:   { rim: '#d4af37', dark: '#5a0a14', base: '#b02030', high: '#ec6878', text: '#fae0d0' },
    token:   { rim: '#1a6840', dark: '#0e3a24', base: '#2a8a52', high: '#7adfa0', text: '#08180e' },
    tokenbig:{ rim: '#d4af37', dark: '#0e3a24', base: '#2a8a52', high: '#7adfa0', text: '#08180e' },
  };

  // ====== PHYSICS ======
  // Coins are heavy and have meaningful friction so the pile reads as a
  // mass — pushes propagate through it, but no single token blasts forward.
  const COIN_FRICTION_AIR = 0.06;
  const COIN_FRICTION     = 0.35;
  const COIN_RESTITUTION  = 0.04;
  const COIN_DENSITY      = 0.0045;
  // Dialed back from earlier "way too much umph". Peak hits move ~150 units
  // alone; the rest of the playfield's worth of distance comes from chain
  // reactions through the pile.
  const FORCE_AMPLIFIER   = 4;
  const PLINK_ANIM_MS     = 600;

  // ====== COLLISION FILTERS ======
  // The back-fill blocks coins from ever entering the area behind the
  // pusher's trailing edge. The pusher's collision mask deliberately
  // excludes the back-fill so the bar can slide through it freely.
  const COIN_CAT     = 0x0001;
  const PUSHER_CAT   = 0x0002;
  const BACKFILL_CAT = 0x0004;
  const WALL_CAT     = 0x0008;

  // ====== STORAGE (shared with the craps half above) ======
  const STORAGE_KEY = 'wendys_palace_coinpusher';

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  }
  function writeStorage(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }
  function readDrops() {
    const obj = readStorage();
    const arr = Array.isArray(obj.drops) ? obj.drops : [];
    return arr.filter((d) => d && d.count > 0 && d.value > 0);
  }
  function totalTrayTokens() {
    return readDrops().reduce((s, d) => s + d.count, 0);
  }
  function consumeOneToken() {
    const obj = readStorage();
    const drops = Array.isArray(obj.drops) ? obj.drops : [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d && d.count > 0 && d.value > 0) {
        const spec = { value: d.value, sizeMult: d.sizeMult || 1 };
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
  let coins = [];          // both house chips and player tokens
  let plinking = [];       // animating-off-edge coins
  let canvas, ctx;
  let renderScale = 1;
  let chuteX = CABINET_W / 2;
  let mouseOverCanvas = false;
  let mouseX = chuteX;
  let keyState = {};
  let lastDrop = 0;
  let pusherTimeStart = 0;
  let pusherVelY = 0;
  let sessionWon = 0;
  let trayEl, wonEl, powerEl, emptyNoteEl;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    canvas = document.getElementById('pu-canvas');
    if (!canvas) return;
    if (typeof Matter === 'undefined') {
      console.warn('[pusher] Matter.js missing — pusher disabled.');
      return;
    }
    setupCanvas();

    trayEl      = document.getElementById('pu-tray');
    wonEl       = document.getElementById('pu-won');
    powerEl     = document.getElementById('pu-power-fill');
    emptyNoteEl = document.getElementById('pu-empty-note');

    engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    engine.positionIterations = 8;
    engine.velocityIterations = 8;
    world = engine.world;

    buildStaticBodies();
    seedHouseChips();

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseenter', () => { mouseOverCanvas = true; });
    canvas.addEventListener('mouseleave', () => { mouseOverCanvas = false; });
    canvas.addEventListener('click', () => { canvas.focus(); tryDrop(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    Matter.Events.on(engine, 'collisionStart',  onCollision);
    Matter.Events.on(engine, 'collisionActive', onCollision);

    setInterval(refreshHud, 500);

    pusherTimeStart = performance.now();
    refreshHud();
    requestAnimationFrame(loop);
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    renderScale = (360 / CABINET_W) * dpr;
    canvas.width  = Math.round(CABINET_W * renderScale);
    canvas.height = Math.round(CABINET_H * renderScale);
    ctx = canvas.getContext('2d');
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function buildStaticBodies() {
    const wallFilter = { category: WALL_CAT, mask: 0xFFFFFFFF };
    const wallOpts = {
      isStatic: true, label: 'wall', friction: 0.2, restitution: 0.04,
      collisionFilter: wallFilter,
    };

    Matter.Composite.add(world, [
      Matter.Bodies.rectangle(-10,            CABINET_H / 2, 20, CABINET_H + 60, wallOpts),
      Matter.Bodies.rectangle(CABINET_W + 10, CABINET_H / 2, 20, CABINET_H + 60, wallOpts),
      Matter.Bodies.rectangle(CABINET_W / 2,  DECK_Y0 - 10,  CABINET_W + 60, 20, wallOpts),
    ]);

    // Back-fill: blocks coins from ever entering the area the pusher's
    // trailing edge has uncovered. Collision filter excludes the pusher.
    const backfillW = CABINET_W;
    const backfillH = PUSHER_MAX_BACK - DECK_Y0;
    Matter.Composite.add(world, Matter.Bodies.rectangle(
      CABINET_W / 2,
      DECK_Y0 + backfillH / 2,
      backfillW,
      backfillH,
      {
        isStatic: true, label: 'backfill', friction: 0.3, restitution: 0.02,
        collisionFilter: { category: BACKFILL_CAT, mask: COIN_CAT | WALL_CAT },
      }
    ));

    // Pusher: tall body so its back is always at the back wall; collision
    // filter excludes the back-fill so the bar slides through it.
    pusherBody = Matter.Bodies.rectangle(
      CABINET_W / 2,
      PUSHER_REST_CENTER,
      PUSHER_W,
      PUSHER_BODY_H,
      {
        isStatic: true, label: 'pusher', friction: 0.1, restitution: 0,
        collisionFilter: { category: PUSHER_CAT, mask: COIN_CAT | WALL_CAT },
      }
    );
    Matter.Composite.add(world, pusherBody);
  }

  // ====== SEED ======
  function seedHouseChips() {
    const safeY0 = SPAWN_Y + 6;
    const safeY1 = DECK_Y1 - 20;
    for (const spec of CHIP_DENOMS) {
      for (let i = 0; i < spec.weight; i++) {
        const x = 22 + Math.random() * (CABINET_W - 44);
        const y = safeY0 + Math.random() * (safeY1 - safeY0);
        spawnChip(x, y, spec);
      }
    }
  }

  function spawnChip(x, y, spec) {
    const body = Matter.Bodies.circle(x, y, spec.radius, {
      frictionAir: COIN_FRICTION_AIR,
      friction:    COIN_FRICTION,
      restitution: COIN_RESTITUTION,
      density:     COIN_DENSITY * 1.3, // chips weighty even at low values
      label:       'chip',
      collisionFilter: { category: COIN_CAT, mask: 0xFFFFFFFF },
    });
    Matter.Composite.add(world, body);
    coins.push({
      body, kind: 'chip', value: spec.value, radius: spec.radius,
      colorKey: spec.colorKey,
    });
  }

  // ====== INPUT ======
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) * (CABINET_W / rect.width));
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      keyState[e.key] = true;
    } else if (e.key === ' ') {
      e.preventDefault();
      tryDrop();
    }
  }
  function onKeyUp(e) { keyState[e.key] = false; }

  // ====== DROP ======
  function spawnToken(x, spec) {
    const r = TOKEN_BASE_RADIUS * (spec.sizeMult || 1);
    const body = Matter.Bodies.circle(x, SPAWN_Y, r, {
      frictionAir: COIN_FRICTION_AIR,
      friction:    COIN_FRICTION,
      restitution: COIN_RESTITUTION,
      density:     COIN_DENSITY,
      label:       'token',
      collisionFilter: { category: COIN_CAT, mask: 0xFFFFFFFF },
    });
    Matter.Composite.add(world, body);
    coins.push({
      body, kind: 'token', value: spec.value,
      radius: r, sizeMult: spec.sizeMult || 1,
      colorKey: (spec.sizeMult > 1.3 ? 'tokenbig' : 'token'),
      spawnedAt: performance.now(),
    });
  }

  function tryDrop() {
    const now = performance.now();
    if (now - lastDrop < 180) return;
    const spec = consumeOneToken();
    if (!spec) return;
    lastDrop = now;
    spawnToken(chuteX, spec);
    refreshHud();
  }

  // ====== COLLISION → FORCE ======
  // When the pusher's leading edge contacts a coin during a forward stroke,
  // set the coin's Y velocity to pusherVelY × amplifier. Backward strokes
  // and near-rest moments produce no push (so tokens dropped at the wrong
  // time will sit and wait for the next sweep).
  function onCollision(e) {
    if (pusherVelY <= 0.005) return;
    const targetVy = pusherVelY * FORCE_AMPLIFIER * 1000 / 60;
    for (const pair of e.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      const pusher = a.label === 'pusher' ? a : b.label === 'pusher' ? b : null;
      const coin = (a.label === 'token' || a.label === 'chip') ? a
                 : (b.label === 'token' || b.label === 'chip') ? b
                 : null;
      if (!pusher || !coin) continue;
      if (coin.velocity.y < targetVy) {
        Matter.Body.setVelocity(coin, { x: coin.velocity.x * 0.7, y: targetVy });
      }
    }
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
    const u  = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const newCenter = PUSHER_REST_CENTER + PUSHER_TRAVEL * u;
    pusherVelY = (PUSHER_TRAVEL * Math.PI / PUSHER_PERIOD_MS) * Math.sin(phase * Math.PI * 2);
    Matter.Body.setPosition(pusherBody, { x: CABINET_W / 2, y: newCenter });
  }

  function checkExits(now) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const y = c.body.position.y;
      if (y > DECK_Y1) {
        const r = c.radius;
        plinking.push({
          x: c.body.position.x,
          y: c.body.position.y,
          angle: c.body.angle,
          r,
          value: c.value,
          colorKey: c.colorKey,
          start: now,
        });
        if (c.value > 0 && window.Wallet) {
          window.Wallet.add(c.value);
          sessionWon += c.value;
        }
        Matter.Composite.remove(world, c.body);
        coins.splice(i, 1);
      } else if (y > CABINET_H + 30) {
        Matter.Composite.remove(world, c.body);
        coins.splice(i, 1);
      }
    }
    for (let i = plinking.length - 1; i >= 0; i--) {
      if (now - plinking[i].start > PLINK_ANIM_MS) plinking.splice(i, 1);
    }
  }

  function refreshHud() {
    const trayCount = totalTrayTokens();
    if (trayEl) trayEl.textContent = String(trayCount);
    if (wonEl)  wonEl.textContent  = String(sessionWon);
    if (emptyNoteEl) emptyNoteEl.hidden = trayCount > 0;
    if (powerEl) {
      const v = Math.max(0, pusherVelY) / PUSHER_MAX_VEL_PER_MS;
      powerEl.style.width = (Math.min(1, v) * 100).toFixed(1) + '%';
      powerEl.classList.toggle('pu-power-hot', v > 0.7);
    }
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
    refreshHud();
    render(t);

    requestAnimationFrame(loop);
  }

  // ====== RENDER ======
  function render(t) {
    ctx.clearRect(0, 0, CABINET_W, CABINET_H);
    drawChuteHousing(t);
    drawDeck();
    drawPusher(t);
    drawDropIndicator(t);
    // Sort by Y so coins overlap in painter order
    const sorted = coins.slice().sort((a, b) => a.body.position.y - b.body.position.y);
    for (const c of sorted) drawCoin(c, t);
    for (const pl of plinking) drawPlinking(pl, t);
    drawPayout(t);
    drawCabinetFrame();
  }

  function drawChuteHousing(t) {
    const g = ctx.createLinearGradient(0, 0, 0, CHUTE_H);
    g.addColorStop(0, '#221412');
    g.addColorStop(0.6, '#1a0e0c');
    g.addColorStop(1, '#080404');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CABINET_W, CHUTE_H);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, CHUTE_H - 3, CABINET_W, 2);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.fillRect(0, CHUTE_H - 1, CABINET_W, 1);

    ctx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.font = 'bold 10px "VT323", "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('▼ DROP', 10, 4);

    const cw = 30;
    const cTop = 6, cBot = CHUTE_H - 6;
    const cg = ctx.createLinearGradient(0, cTop, 0, cBot);
    cg.addColorStop(0, '#9a7848');
    cg.addColorStop(0.5, '#5a3e22');
    cg.addColorStop(1, '#1a1010');
    ctx.fillStyle = cg;
    ctx.fillRect(chuteX - cw / 2, cTop, cw, cBot - cTop);
    ctx.strokeStyle = '#b8965c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(chuteX - cw / 2, cTop, cw, cBot - cTop);
    ctx.fillStyle = '#020101';
    ctx.fillRect(chuteX - cw / 2 + 2, cBot - 4, cw - 4, 4);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(chuteX - cw / 2, cBot - 1, cw, 1);
  }

  function drawDeck() {
    // Felt
    const g = ctx.createLinearGradient(0, DECK_Y0, 0, DECK_Y1);
    g.addColorStop(0, '#163a2c');
    g.addColorStop(0.5, '#0d2a1c');
    g.addColorStop(1, '#082014');
    ctx.fillStyle = g;
    ctx.fillRect(0, DECK_Y0, CABINET_W, DECK_Y1 - DECK_Y0);

    // Felt grain
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = DECK_Y0 + 6; y < DECK_Y1; y += 12) {
      for (let x = ((y / 12) | 0) % 2 === 0 ? 8 : 16; x < CABINET_W; x += 18) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Front-edge shadow
    const fade = ctx.createLinearGradient(0, DECK_Y1 - 14, 0, DECK_Y1);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, DECK_Y1 - 14, CABINET_W, 14);

    // Dashed gold win line
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0, DECK_Y1 - 0.5);
    ctx.lineTo(CABINET_W, DECK_Y1 - 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPusher(t) {
    const cx = pusherBody.position.x;
    const cy = pusherBody.position.y;
    const x0 = cx - PUSHER_W / 2;
    // The visible leading "bar" is the front PUSHER_FACE_THICK of the body.
    const yBodyTop  = cy - PUSHER_BODY_H / 2;
    const yFaceTop  = cy + PUSHER_BODY_H / 2 - PUSHER_FACE_THICK;
    const yFaceBot  = cy + PUSHER_BODY_H / 2;

    const power = Math.max(0, pusherVelY) / PUSHER_MAX_VEL_PER_MS;

    // Tongue: the dark "housing" portion of the body. Always reaches the
    // back wall because the body's back edge is pinned there at rest and
    // only the front edge moves forward of it.
    const tongueTop = Math.max(yBodyTop, DECK_Y0);
    if (yFaceTop > tongueTop) {
      const tg = ctx.createLinearGradient(0, tongueTop, 0, yFaceTop);
      tg.addColorStop(0,   '#0c0606');
      tg.addColorStop(0.5, '#1a0e08');
      tg.addColorStop(1,   '#2a1a10');
      ctx.fillStyle = tg;
      ctx.fillRect(x0 + 18, tongueTop, PUSHER_W - 36, yFaceTop - tongueTop);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x0 + 16, tongueTop, 2, yFaceTop - tongueTop);
      ctx.fillRect(x0 + PUSHER_W - 18, tongueTop, 2, yFaceTop - tongueTop);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.30)';
      ctx.fillRect(x0 + 28, tongueTop, 1, yFaceTop - tongueTop);
      ctx.fillRect(x0 + PUSHER_W - 28, tongueTop, 1, yFaceTop - tongueTop);
    }

    // Front face bar
    const fg = ctx.createLinearGradient(0, yFaceTop, 0, yFaceBot);
    fg.addColorStop(0,    '#3a2418');
    fg.addColorStop(0.3,  '#6a4828');
    fg.addColorStop(0.7,  '#a8845a');
    fg.addColorStop(1,    '#5a3e22');
    ctx.fillStyle = fg;
    ctx.fillRect(x0, yFaceTop, PUSHER_W, PUSHER_FACE_THICK);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x0, yFaceTop, PUSHER_W, 1.5);

    // Leading brass edge — glows hot at peak velocity
    const hot = 0.55 + power * 0.45;
    ctx.fillStyle = `rgba(${Math.round(212 + power * 40)}, ${Math.round(175 + power * 60)}, ${Math.round(55 + power * 100)}, ${hot})`;
    ctx.fillRect(x0, yFaceBot - 2.5, PUSHER_W, 2.5);
    ctx.fillStyle = `rgba(255, 230, 150, ${0.55 + power * 0.4})`;
    ctx.fillRect(x0, yFaceBot - 2.5, PUSHER_W, 0.8);

    if (power > 0.55) {
      const a = (power - 0.55) / 0.45;
      const grad = ctx.createLinearGradient(0, yFaceBot, 0, yFaceBot + 10);
      grad.addColorStop(0, `rgba(255, 220, 120, ${0.55 * a})`);
      grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, yFaceBot, PUSHER_W, 10);
    }

    // Forward chevrons on the bar
    ctx.strokeStyle = `rgba(255, 220, 160, ${0.4 + power * 0.4})`;
    ctx.lineWidth = 1.2;
    const chevCount = 7;
    for (let i = 0; i < chevCount; i++) {
      const cxC = x0 + 10 + ((PUSHER_W - 20) / chevCount) * (i + 0.5);
      const yMid = yFaceTop + PUSHER_FACE_THICK * 0.5;
      ctx.beginPath();
      ctx.moveTo(cxC - 5, yMid - 3);
      ctx.lineTo(cxC,     yMid + 3);
      ctx.lineTo(cxC + 5, yMid - 3);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x0,                  yFaceTop, 1.5, PUSHER_FACE_THICK);
    ctx.fillRect(x0 + PUSHER_W - 1.5, yFaceTop, 1.5, PUSHER_FACE_THICK);
  }

  function drawDropIndicator(t) {
    const power = Math.max(0, pusherVelY) / PUSHER_MAX_VEL_PER_MS;
    const pulse = 0.4 + power * 0.55;
    const trail = ctx.createLinearGradient(0, CHUTE_H, 0, SPAWN_Y);
    trail.addColorStop(0, `rgba(212, 175, 55, ${0.32 * pulse})`);
    trail.addColorStop(1, `rgba(255, 220, 120, ${0.85 * pulse})`);
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(chuteX, CHUTE_H + 1);
    ctx.lineTo(chuteX, SPAWN_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = `rgba(255, 220, 130, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(chuteX, SPAWN_Y, TOKEN_BASE_RADIUS + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCoin(c, t) {
    const p = c.body.position;
    const r = c.radius;
    const colors = COIN_COLORS[c.colorKey] || COIN_COLORS.bronze;

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.arc(p.x + 1.2, p.y + 1.7, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Disc
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(c.body.angle);
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r);
    g.addColorStop(0,    colors.high);
    g.addColorStop(0.55, colors.base);
    g.addColorStop(1,    colors.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    // Reeded edge
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.6;
    const ticks = 24;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      const x1 = Math.cos(a) * (r - 0.8);
      const y1 = Math.sin(a) * (r - 0.8);
      const x2 = Math.cos(a) * (r - 0.1);
      const y2 = Math.sin(a) * (r - 0.1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Specular
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.2, r * 0.09, -0.45, 0, Math.PI * 2);
    ctx.fill();
    // Outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Value text (prize chips get a faint pulse so they stand out)
    if (c.colorKey === 'prize') {
      const t2 = performance.now() / 380;
      const glow = (Math.sin(t2) + 1) / 2;
      ctx.save();
      ctx.globalAlpha = 0.2 + glow * 0.2;
      ctx.strokeStyle = '#ff8090';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = colors.text;
    const baseFont = Math.max(7, Math.round(r * 0.82));
    const font = c.value >= 1000 ? Math.max(6, baseFont - 3)
              : c.value >= 100  ? Math.max(7, baseFont - 1)
              : baseFont;
    ctx.font = `bold ${font}px "VT323", "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.value), p.x, p.y);
  }

  function drawPlinking(plink, now) {
    const dp = Math.min(1, (now - plink.start) / PLINK_ANIM_MS);
    const dy = dp * dp * 55;
    const dx = Math.sin(dp * Math.PI * 3) * 4 * (1 - dp);
    const scale = 1 - dp * 0.55;
    const alpha = 1 - dp;
    const spin  = plink.angle + dp * Math.PI * 2;
    const x = plink.x + dx;
    const y = plink.y + dy;
    const colors = COIN_COLORS[plink.colorKey] || COIN_COLORS.bronze;

    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 1.3, y + 1.8, plink.r * 0.9 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(scale, scale);
    const r = plink.r;
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r);
    g.addColorStop(0,    colors.high);
    g.addColorStop(0.55, colors.base);
    g.addColorStop(1,    colors.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (plink.value > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - dp * 1.1);
      ctx.fillStyle = '#1aff7f';
      ctx.font = `bold ${Math.round(13 + dp * 5)}px "VT323", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + plink.value, plink.x, plink.y - 14 - dp * 30);
      ctx.restore();
    }
  }

  function drawPayout(t) {
    const y0 = DECK_Y1;
    const y1 = CABINET_H;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0,    '#1a0a0c');
    g.addColorStop(0.5,  '#0a0405');
    g.addColorStop(1,    '#020101');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, CABINET_W, y1 - y0);

    const innerShadow = ctx.createLinearGradient(0, y0, 0, y0 + 14);
    innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = innerShadow;
    ctx.fillRect(0, y0, CABINET_W, 14);

    const sideW = 26;
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(0, y0, sideW, y1 - y0);
    ctx.fillRect(CABINET_W - sideW, y0, sideW, y1 - y0);
    ctx.strokeStyle = 'rgba(180, 140, 70, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sideW, y0); ctx.lineTo(sideW, y1);
    ctx.moveTo(CABINET_W - sideW, y0); ctx.lineTo(CABINET_W - sideW, y1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CABINET_W / 2 - 12, y0 + 16);
    ctx.lineTo(CABINET_W / 2,      y0 + 22);
    ctx.lineTo(CABINET_W / 2 + 12, y0 + 16);
    ctx.stroke();

    const recentPlink = plinking.length > 0
      ? Math.max(...plinking.map((p) => 1 - Math.min(1, (t - p.start) / PLINK_ANIM_MS)))
      : 0;
    ctx.fillStyle = `rgba(212, 175, 55, ${0.55 + recentPlink * 0.4})`;
    ctx.font = 'bold 12px "VT323", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ PAYOUT ▼', CABINET_W / 2, (y0 + y1) / 2 + 4);
  }

  function drawCabinetFrame() {
    ctx.strokeStyle = '#7a5828';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CABINET_W - 2, CABINET_H - 2);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 2.5, CABINET_W - 5, CABINET_H - 5);
  }
})();
