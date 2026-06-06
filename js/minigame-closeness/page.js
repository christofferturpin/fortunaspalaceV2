/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MINIGAME-CLOSENESS PAGE — shell + meters for the single wheel game      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ inject rules drawer + meter bar + #cls-mount │
  │                          │  + #cls-status                                │
  │                          └─ ClosenessWheel.mount(#cls-mount)             │
  │                                                                          │
  │   OUTCOMES — wheel.js calls window.Closeness.applyOutcome(kind):         │
  │     closetick ──► closeTicks++; if 3 → Child.applyEffects({closeness:1});│
  │                   reset; Sound.close; ❤ particles. Status beat reflects  │
  │                   meter progress (1/3, 2/3, full)                        │
  │     money1    ──► +1% of wallet → coins; Sound.coin; ◆ particles         │
  │     money5    ──► +5% of wallet → coins; Sound.coin; ◆ particles         │
  │     money10   ──► +10% of wallet → coins; Sound.bigCoin; ★ particles     │
  │     strike    ──► strikes++; if 2 → Child.applyEffects({wellness:-1});   │
  │                   reset; Sound.bust; ✕ splash. Status beat reflects      │
  │                   1/2 vs full                                             │
  │     hurt      ──► Child.applyEffects({wellness:-1}); Sound.bust;         │
  │                   ✕ splash (no meter — instantaneous)                    │
  │     meal      ──► Child.applyEffects({hunger:1}); Sound.coin;            │
  │                   ⌇ particles                                            │
  │     again     ──► flavor beat only; wheel.js handles the auto-respin     │
  │                                                                          │
  │   Meters (top of mount):                                                 │
  │     closeness: 3 pips (rose), fills per closetick, full → applies +1     │
  │     strikes:   2 X marks (dark red), fills per strike, full → applies -1 │
  │                wellness                                                  │
  │                                                                          │
  │   Sound (inner IIFE): init/tick/flip/close/coin/bigCoin/bust             │
  │     lazy AudioContext + bell(freq,dur,peak) sine+harmonic                │
  │                                                                          │
  │   Particles (inner IIFE): heart/coin/splash burst at the mount rect,     │
  │     transient absolute spans removed on animationend                     │
  │                                                                          │
  │   Exports (window.Closeness): { applyOutcome, setStatus, Sound, burst }  │
  │   External deps: window.Wallet, window.Child, window.ClosenessWheel      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: statusEl, mountEl, closeMeterEl, strikeMeterEl, closeTicks=0, strikes=0
  CONST: CLOSE_TARGET=3, STRIKE_TARGET=2
  BEATS: CLOSE_PROGRESS[]/CLOSE_FULL[]/COIN[]/BIG_COIN[]/MEAL[]/STRIKE_PROGRESS[]/STRIKE_FULL[]/HURT[]/AGAIN[]
  init(): guard #closeness-main; inject rules drawer + meter-bar (#cls-close-meter, #cls-strike-meter) + #cls-mount + #cls-status; refs; updateMeters; ClosenessWheel.mount(mountEl)
  rulesHtml()→html: list of all 8 outcomes w/ percentages + meter explainer
  pctReward(pct)→int: bal=Wallet.bal||0; max(1, floor(bal·pct/100))
  applyOutcome(kind): Sound.init; switch kind:
    closetick→closeTicks++; if closeTicks>=3→Child.applyEffects({closeness:1}); closeTicks=0; Sound.close; burst(❤,big); pick(CLOSE_FULL); else Sound.tick(double); burst(❤,small); pick(CLOSE_PROGRESS)
    money{1,5,10}→pct; won=pctReward(pct); Wallet.add(won); coin|bigCoin (pct≥10); burst(◆|★); pick(COIN|BIG_COIN_BEATS)+won
    strike→strikes++; if strikes>=2→Child.applyEffects({wellness:-1}); strikes=0; Sound.bust; burst(✕,splash); pick(STRIKE_FULL); else Sound.flip+pause; burst(·,small); pick(STRIKE_PROGRESS)
    hurt→Child.applyEffects({wellness:-1}); Sound.bust; burst(✕,splash); pick(HURT_BEATS)
    meal→Child.applyEffects({hunger:1}); Sound.coin; burst(⌇,green); pick(MEAL_BEATS)
    again→Sound.flip; pick(AGAIN_BEATS); (no state change; wheel.js auto-respins)
    Child.recordPlay; updateMeters
  updateMeters(): closeMeterEl.html=3 pips w/ filled state; strikeMeterEl.html=2 X marks w/ filled state; trigger flash on completion via classList toggle
  setStatus(t): statusEl.text=t
  burst({symbol,color,count,splash}): N spans from mount rect, random angles, --tx/--ty CSS vars
  Sound IIFE: ctx lazy; bell/tick/flip/close/coin/bigCoin/bust
  exports: global.Closeness={applyOutcome,setStatus,Sound,burst}; DOMContentLoaded→init
*/

(function () {
  const CLOSE_TARGET = 3;
  const STRIKE_TARGET = 2;

  let statusEl = null;
  let mountEl = null;
  let closeMeterEl = null;
  let strikeMeterEl = null;
  // LCD house — green-screen tamagotchi pane on the right of the wheel. The
  // ASCII scene is picked per housing tier (Child.hasPurchasedInvestment);
  // {FACE} in the art is replaced each tick with the current kaomoji from
  // Child.describeFace(), so the idle face tracks Your Child's actual state.
  // When the wheel resolves we override frames with the matching mood for
  // REACTION_HOLD_MS and spawn an animated "toy" in the toys overlay.
  let lcdSymbolEl = null;
  let lcdFaceEl = null;
  let lcdLabelEl = null;
  let lcdScreenEl = null;
  let tellsEl = null;
  let houseEventsEl = null;
  let housingKey = 'truck';
  let faceFrames = ['(•‿•)'];
  let faceIndex = 0;
  let faceTicker = null;
  let outcomeFaceFrames = null;     // non-null while a reaction is playing
  let outcomeFaceTimer = null;

  let closeTicks = 0;
  let strikes = 0;

  // Mood frames per outcome — pulled from the same kaomoji palette as
  // [js/child.js describeFace()](../child.js) so the face style is
  // identical to child.html.
  const OUTCOME_FRAMES = {
    closetick: ['(◠‿◠)', '(•‿•)', '(◠‿◠)', '(•‿•)'],   // pleased
    money1:    ['($_$)', '(^_^)', '($_$)', '(^_^)'],   // greedy-happy
    money5:    ['($_$)', '(^o^)', '($_$)', '(^o^)'],   // bigger
    money10:   ['(★_★)', '(^o^)', '(★_★)', '(^o^)'],   // ecstatic
    meal:      ['(^_^)', '(^˘^)', '(^_^)', '(^_^)'],   // content
    again:     ['(o_O)', '(O_o)', '(O_O)', '(O_o)'],   // surprised
    strike:    ['(>_<)', '(>~<)', '(>_<)', '(⊙_⊙)'],   // distressed
    hurt:      ['(T_T)', '(;_;)', '(T_T)', '(;~;)'],   // crying
  };
  const FRAME_MS = 190;             // halved — faster face cadence
  const REACTION_HOLD_MS = 1200;    // halved — outcome face overrides briefly

  // Event particles that spawn inside the LCD when the wheel resolves —
  // tuned green-on-black to match the tamagotchi screen. Kept all-monospace
  // so they line up with the ASCII scenery.
  const HOUSE_EVENTS = {
    closetick: { symbol: '♥',  cls: 'evt-float',  count: 6,  color: '#3a5a18' },
    money1:    { symbol: '¢',  cls: 'evt-fall',   count: 4,  color: '#1a3010' },
    money5:    { symbol: '$',  cls: 'evt-fall',   count: 8,  color: '#1a3010' },
    money10:   { symbol: '$',  cls: 'evt-fall',   count: 14, color: '#0a1808' },
    meal:      { symbol: '⊠',  cls: 'evt-bounce', count: 1,  color: '#1a3010' },
    again:     { symbol: '↻',  cls: 'evt-spin',   count: 1,  color: '#1a3010' },
    strike:    { symbol: '!',  cls: 'evt-shake',  count: 3,  color: '#0a1808' },
    hurt:      { symbol: '✕',  cls: 'evt-splash', count: 9,  color: '#0a1808' },
  };

  // One big LCD emoji per housing tier — silhouetted white via CSS filter
  // so it reads as a chunky LCD pixel symbol behind Your Child's kaomoji.
  // Picked at init time based on what Child.hasPurchasedInvestment() returns.
  const SCENES = {
    truck:     { label: 'in the C10',      emoji: '🛻' },
    motel:     { label: 'at the motel',    emoji: '🏨' },
    trailer:   { label: 'in the trailer',  emoji: '🏚️' },
    apartment: { label: 'in the apartment', emoji: '🏢' },
    house:     { label: 'at the house',    emoji: '🏡' },
    college:   { label: 'at college',      emoji: '🎓' },
  };

  function pickHousing() {
    if (!window.Child || typeof window.Child.hasPurchasedInvestment !== 'function') {
      return 'truck';
    }
    const has = (id) => window.Child.hasPurchasedInvestment(id);
    if (has('invest-college'))    return 'college';
    if (has('invest-house'))      return 'house';
    if (has('invest-apartment'))  return 'apartment';
    if (has('invest-trailer'))    return 'trailer';
    if (has('invest-motel'))      return 'motel';
    return 'truck';
  }

  const CLOSE_PROGRESS_BEATS = [
    'A tick toward Your Child.',
    'A small moment lands.',
    'Your Child softens a little.',
    'Closer. Not all the way yet.',
    'Something is gathering.',
  ];
  const CLOSE_FULL_BEATS = [
    'The meter fills. Your Child knows you. Closeness grows.',
    'You held on long enough. Closeness grows.',
    'Three small moments add up. Closeness grows.',
    'Your Child breathes you in. Closeness grows.',
    'You belong to each other for a second. Closeness grows.',
  ];
  const COIN_BEATS = [
    'Loose change on the carpet.',
    'A coin under the bedside lamp.',
    'A folded bill in the diaper bag.',
    'Quarters from the laundry pile.',
  ];
  const BIG_COIN_BEATS = [
    'A chip you forgot you had.',
    'A jackpot ticket from yesterday.',
    'The casino floor owes you.',
    'Cash in the lining of your coat.',
  ];
  const MEAL_BEATS = [
    'Crumbs in the bedside drawer. Your Child eats.',
    "A bottle you'd forgotten about — still warm enough. +1 hunger.",
    'A neighbor leaves a plate at the door. +1 hunger.',
    'Something in the freezer. Your Child is fed.',
  ];
  const STRIKE_PROGRESS_BEATS = [
    'Strike. You feel it. (1 of 2.)',
    'A wrong note. Strike one.',
    'You looked away. Strike one.',
    'A near miss. Strike one stands.',
  ];
  const STRIKE_FULL_BEATS = [
    'Two strikes. Your Child hurt itself.',
    'The meter fills. Your Child cries out.',
    'You ran out of warnings. Your Child hurt itself.',
    'Strike two. The room turns cold.',
  ];
  const HURT_BEATS = [
    'A sharp wrong moment. Your Child hurt itself.',
    'The wheel lands hard. Your Child cries out.',
    'No warning. Your Child hurt itself.',
    'It happens fast. Your Child hurt itself.',
  ];
  const AGAIN_BEATS = [
    'The wheel is not finished with you.',
    'Spin again — on the house.',
    'Free turn. The wheel resets itself.',
    'Again. The room waits.',
  ];
  const MINISLOT_BEATS = [
    'Three reels click on. Hold your breath.',
    'The little box wakes up. Three slots, four faces.',
    'Mini-slot: the wheel inside the wheel.',
    'A side game opens. You wait for it to land.',
  ];

  // 1×3 mini-slot symbols → outcome kinds they map to. Each reel rolls one
  // uniformly. Effects are queued with a stagger so the player sees each
  // symbol resolve in turn rather than all at once.
  const MINISLOT_SYMBOLS = [
    { sym: '♥', kind: 'closetick' },
    { sym: '✕', kind: 'strike'    },
    { sym: '$', kind: 'money1'    },
    { sym: '↻', kind: 'again'     },
  ];

  document.addEventListener('DOMContentLoaded', init);
  // (Snow canvas removed in the wireframe reset.)
  function _startSnow_unused() {
    let canvas = document.getElementById('cls-snow');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'cls-snow';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    const SCALE = 4;                          // 1 canvas px = 4 display px
    const MOUSE_RADIUS_SQ = 1600;             // in canvas (low-res) units²
    const MOUSE_LIFT = 55;                    // max brightness boost
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;

    function resize() {
      canvas.width  = Math.max(1, Math.ceil(window.innerWidth  / SCALE));
      canvas.height = Math.max(1, Math.ceil(window.innerHeight / SCALE));
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
    }, { passive: true });

    function tick() {
      const w = canvas.width;
      const h = canvas.height;
      const mxc = mx / SCALE;
      const myc = my / SCALE;
      const img = ctx.createImageData(w, h);
      const buf = img.data;
      let i = 0;
      for (let y = 0; y < h; y++) {
        const dy = y - myc;
        const dy2 = dy * dy;
        for (let x = 0; x < w; x++) {
          // Base grayscale noise — full 0..220 range so it looks like
          // analog snow, not just blacks-and-whites.
          let v = (Math.random() * 220) | 0;
          // Cursor lift — quadratic falloff so the brightening fades
          // smoothly into the surrounding static.
          const dx = x - mxc;
          const d2 = dx * dx + dy2;
          if (d2 < MOUSE_RADIUS_SQ) {
            v += ((1 - d2 / MOUSE_RADIUS_SQ) * MOUSE_LIFT) | 0;
            if (v > 255) v = 255;
          }
          buf[i++] = v;
          buf[i++] = v;
          buf[i++] = v;
          buf[i++] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function init() {
    const main = document.getElementById('closeness-main');
    if (!main) return;

    main.innerHTML = `
      <details class="rules-drawer">
        <summary>Rules</summary>
        <div class="rules-body" id="cls-rules-body"></div>
      </details>

      <div class="closeness-wrap">
        <div class="meter-bar">
          <div class="meter meter-close">
            <span class="meter-label">Closeness</span>
            <div class="meter-pips" id="cls-close-meter"></div>
            <span class="meter-target">/ ${CLOSE_TARGET}</span>
          </div>
          <div class="meter meter-strike">
            <span class="meter-label">Strikes</span>
            <div class="meter-pips" id="cls-strike-meter"></div>
            <span class="meter-target">/ ${STRIKE_TARGET}</span>
          </div>
        </div>
        <div class="arena">
          <div id="cls-mount" class="cls-mount"></div>
          <aside class="lcd-house" aria-label="Your Child at home">
            <div class="lcd-screen" id="cls-lcd-screen">
              <div class="lcd-symbol" id="cls-lcd-symbol" aria-hidden="true"></div>
              <div class="lcd-face" id="cls-lcd-face">(•‿•)</div>
              <div class="lcd-toys" id="cls-house-events"></div>
              <div class="lcd-scanlines"></div>
            </div>
            <div class="lcd-housing-label" id="cls-lcd-label">in the C10</div>
            <div class="tama-tells" id="cls-house-tells"></div>
          </aside>
        </div>
        <div class="closeness-status" id="cls-status">Your Child is watching you.</div>
      </div>
    `;

    statusEl = document.getElementById('cls-status');
    mountEl = document.getElementById('cls-mount');
    closeMeterEl = document.getElementById('cls-close-meter');
    strikeMeterEl = document.getElementById('cls-strike-meter');
    lcdSymbolEl = document.getElementById('cls-lcd-symbol');
    lcdFaceEl = document.getElementById('cls-lcd-face');
    lcdLabelEl = document.getElementById('cls-lcd-label');
    lcdScreenEl = document.getElementById('cls-lcd-screen');
    tellsEl = document.getElementById('cls-house-tells');
    houseEventsEl = document.getElementById('cls-house-events');

    // Pick housing tier once at mount; persists for the session.
    housingKey = pickHousing();
    const scene = SCENES[housingKey] || SCENES.truck;
    if (lcdScreenEl) lcdScreenEl.dataset.housing = housingKey;
    if (lcdSymbolEl) lcdSymbolEl.textContent = scene.emoji;
    if (lcdLabelEl)  lcdLabelEl.textContent = scene.label;

    startFaceTicker();

    document.getElementById('cls-rules-body').innerHTML = rulesHtml();
    updateMeters(false);

    if (window.ClosenessWheel && typeof window.ClosenessWheel.mount === 'function') {
      window.ClosenessWheel.mount(mountEl);
    }
  }

  function rulesHtml() {
    return `
      <p>One wheel, 20 wedges, all equal weight:</p>
      <ul class="rules-list">
        <li><span class="rules-tag rules-tag-close">♥ × 5</span> 25% — fills the closeness meter; every 3rd tick gives +1 closeness</li>
        <li><span class="rules-tag rules-tag-strike">✕ × 5</span> 25% — fills the strike meter; on the 2nd strike Your Child hurts itself</li>
        <li><span class="rules-tag rules-tag-again">↻ × 4</span> 20% — free auto-respin</li>
        <li><span class="rules-tag rules-tag-coin">$ × 2</span> 10% — +1% of wallet</li>
        <li><span class="rules-tag rules-tag-coin">$$ × 1</span> 5% — +5% of wallet</li>
        <li><span class="rules-tag rules-tag-coin">$$$ × 1</span> 5% — +10% of wallet (jackpot)</li>
        <li><span class="rules-tag rules-tag-bust">☠ × 1</span> 5% — instant −1 wellness, no warning</li>
        <li><span class="rules-tag rules-tag-meal">◆ × 1</span> 5% — +1 hunger for Your Child</li>
      </ul>
      <p>The meters carry between spins. Reload the page to reset them.</p>
    `;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pctReward(pct) {
    const raw = window.Wallet ? window.Wallet.getBalance() : 0;
    const bal = (typeof raw === 'number' && isFinite(raw)) ? raw : 0;
    return Math.max(1, Math.floor(bal * pct / 100));
  }

  function updateMeters(flash) {
    if (closeMeterEl) {
      let html = '';
      for (let i = 0; i < CLOSE_TARGET; i++) {
        const on = i < closeTicks;
        html += `<span class="meter-pip pip-close${on ? ' on' : ''}"></span>`;
      }
      closeMeterEl.innerHTML = html;
      closeMeterEl.classList.toggle('meter-flash', flash === 'close');
      if (flash === 'close') {
        setTimeout(() => closeMeterEl.classList.remove('meter-flash'), 600);
      }
    }
    if (strikeMeterEl) {
      let html = '';
      for (let i = 0; i < STRIKE_TARGET; i++) {
        const on = i < strikes;
        html += `<span class="meter-pip pip-strike${on ? ' on' : ''}">${on ? '✕' : ''}</span>`;
      }
      strikeMeterEl.innerHTML = html;
      strikeMeterEl.classList.toggle('meter-flash', flash === 'strike');
      if (flash === 'strike') {
        setTimeout(() => strikeMeterEl.classList.remove('meter-flash'), 600);
      }
    }
  }

  // Every wheel outcome routes through here so wheel.js stays narrow:
  // it only knows about kinds, not Wallet/Child wiring or meter state.
  function applyOutcome(kind) {
    Sound.init();
    let msg = '';
    let flash = null;

    switch (kind) {
      case 'closetick': {
        closeTicks++;
        if (closeTicks >= CLOSE_TARGET) {
          closeTicks = 0;
          if (window.Child) window.Child.applyEffects({ closeness: 1 });
          msg = pick(CLOSE_FULL_BEATS);
          Sound.close();
          burst({ symbol: '❤', color: '#c44060', count: 12 });
          flash = 'close';
        } else {
          msg = `${pick(CLOSE_PROGRESS_BEATS)} (${closeTicks}/${CLOSE_TARGET})`;
          Sound.tick(); setTimeout(Sound.tick, 60);
          burst({ symbol: '❤', color: '#c89090', count: 4 });
        }
        break;
      }
      case 'money1':
      case 'money5':
      case 'money10': {
        const pctMap = { money1: 1, money5: 5, money10: 10 };
        const pct = pctMap[kind];
        const won = pctReward(pct);
        if (window.Wallet) window.Wallet.add(won);
        const big = pct >= 10;
        const tail = `+${won} coin${won === 1 ? '' : 's'} (+${pct}%).`;
        msg = `${pick(big ? BIG_COIN_BEATS : COIN_BEATS)} ${tail}`;
        if (big) Sound.bigCoin(); else Sound.coin();
        burst({ symbol: big ? '★' : '◆', color: big ? '#f3c84a' : '#d8b860', count: big ? 12 : 7 });
        break;
      }
      case 'strike': {
        strikes++;
        if (strikes >= STRIKE_TARGET) {
          strikes = 0;
          if (window.Child) window.Child.applyEffects({ wellness: -1 });
          msg = pick(STRIKE_FULL_BEATS);
          Sound.bust();
          burst({ symbol: '✕', color: '#9a2020', count: 14, splash: true });
          flash = 'strike';
        } else {
          msg = pick(STRIKE_PROGRESS_BEATS);
          Sound.flip();
          burst({ symbol: '·', color: '#6a3030', count: 5 });
        }
        break;
      }
      case 'hurt': {
        if (window.Child) window.Child.applyEffects({ wellness: -1 });
        msg = pick(HURT_BEATS);
        Sound.bust();
        burst({ symbol: '✕', color: '#9a2020', count: 14, splash: true });
        break;
      }
      case 'meal': {
        if (window.Child) window.Child.applyEffects({ hunger: 1 });
        msg = pick(MEAL_BEATS);
        Sound.coin();
        burst({ symbol: '⌇', color: '#608848', count: 8 });
        break;
      }
      case 'again': {
        // Pure flavor — wheel.js handles the auto-respin itself.
        msg = pick(AGAIN_BEATS);
        Sound.flip();
        burst({ symbol: '↻', color: '#8a6048', count: 5 });
        break;
      }
      case 'minislot': {
        // 1×3 sub-game: roll 3 symbols from {♥, ✕, $, ↻} and apply each
        // effect with a stagger so the player sees them resolve one by one.
        // See playMiniSlot() for the visual + scheduling.
        playMiniSlot();
        msg = pick(MINISLOT_BEATS);
        Sound.flip();
        burst({ symbol: '⊞', color: '#00d0ff', count: 6 });
        break;
      }
      default:
        return;
    }

    setStatus(msg);
    updateMeters(flash);
    playReaction(kind);
    if (window.Child && typeof window.Child.recordPlay === 'function' && !_skipRecordPlay) {
      window.Child.recordPlay();
    }
  }

  // Set during a minislot sub-application so the 3 staggered effects don't
  // each fire Child.recordPlay (one play per spin is plenty — the minislot
  // itself already called recordPlay when the wheel resolved on it).
  let _skipRecordPlay = false;
  let miniSlotEl = null;

  function ensureMiniSlotOverlay() {
    if (miniSlotEl) return miniSlotEl;
    miniSlotEl = document.createElement('div');
    miniSlotEl.id = 'cls-minislot';
    miniSlotEl.className = 'minislot-overlay';
    miniSlotEl.innerHTML =
      '<span class="minislot-reel" data-i="0">?</span>' +
      '<span class="minislot-reel" data-i="1">?</span>' +
      '<span class="minislot-reel" data-i="2">?</span>';
    document.body.appendChild(miniSlotEl);
    return miniSlotEl;
  }

  // The 1×3 mini-slot: pick 3 symbols at random, animate each reel
  // cycling through the 4 faces and landing on its result, then apply
  // each effect with a small stagger (per-reel lands at 600/800/1000ms,
  // effect applies right after each lands).
  function playMiniSlot() {
    const el = ensureMiniSlotOverlay();
    const results = [0, 0, 0].map(() =>
      MINISLOT_SYMBOLS[Math.floor(Math.random() * MINISLOT_SYMBOLS.length)]
    );
    const reels = el.querySelectorAll('.minislot-reel');
    el.classList.add('is-active');

    // Cycle each reel through all 4 symbols, then land on its result.
    const TOTAL_MS = 1000;
    const LAND_AT = [600, 800, 1000];
    reels.forEach((reel, i) => {
      const cycle = setInterval(() => {
        const r = MINISLOT_SYMBOLS[Math.floor(Math.random() * MINISLOT_SYMBOLS.length)];
        reel.textContent = r.sym;
      }, 65);
      setTimeout(() => {
        clearInterval(cycle);
        reel.textContent = results[i].sym;
        reel.classList.add('is-landed');
        Sound.tick();
        // Apply this reel's effect right after it lands.
        const kind = results[i].kind;
        _skipRecordPlay = true;
        if (kind === 'again'
            && window.ClosenessWheel
            && typeof window.ClosenessWheel.requestRespin === 'function') {
          window.ClosenessWheel.requestRespin();
        } else {
          applyOutcome(kind);
        }
        _skipRecordPlay = false;
      }, LAND_AT[i]);
    });

    // Tear the overlay down after the 3rd reel resolves + a beat.
    setTimeout(() => {
      el.classList.remove('is-active');
      reels.forEach((r) => r.classList.remove('is-landed'));
    }, TOTAL_MS + 1400);
  }

  // Pull the current state-derived face frames straight from the shared
  // Child module so the idle face matches what child.html would show — when
  // hunger/wellness/closeness drop, this face changes accordingly without us
  // duplicating the mood logic.
  function currentIdleFrames() {
    if (window.Child && typeof window.Child.describeFace === 'function') {
      const d = window.Child.describeFace();
      return d.frames && d.frames.length ? d.frames : ['(•‿•)'];
    }
    return ['(•‿•)'];
  }

  function currentIdleTells() {
    if (window.Child && typeof window.Child.describeFace === 'function') {
      const d = window.Child.describeFace();
      return (d.tells || []).join(' · ');
    }
    return '';
  }

  function startFaceTicker() {
    if (faceTicker) return;
    faceIndex = 0;
    renderScene();
    if (tellsEl) tellsEl.textContent = currentIdleTells();
    faceTicker = setInterval(() => {
      const frames = outcomeFaceFrames || currentIdleFrames();
      faceIndex = (faceIndex + 1) % frames.length;
      renderScene();
      if (tellsEl && !outcomeFaceFrames) tellsEl.textContent = currentIdleTells();
    }, FRAME_MS);
  }

  // Update the kaomoji face on the LCD. The big tier emoji sits behind it
  // (set once at init) and the face cycles on top each frame tick.
  function renderScene() {
    if (!lcdFaceEl) return;
    const frames = outcomeFaceFrames || currentIdleFrames();
    const face = frames[faceIndex % frames.length] || '(•‿•)';
    lcdFaceEl.textContent = face;
  }

  // Per-outcome: override the face frames for REACTION_HOLD_MS so the player
  // sees a clear emotional response, then go back to whatever Child.describe
  // Face() says (which reflects the actual updated state). Also spawn the
  // matching event particles into the LCD.
  function playReaction(kind) {
    const frames = OUTCOME_FRAMES[kind];
    if (frames) {
      outcomeFaceFrames = frames;
      faceIndex = 0;
      renderScene();
      if (tellsEl) tellsEl.textContent = '';
      if (outcomeFaceTimer) clearTimeout(outcomeFaceTimer);
      outcomeFaceTimer = setTimeout(() => {
        outcomeFaceFrames = null;
        faceIndex = 0;
        renderScene();
        if (tellsEl) tellsEl.textContent = currentIdleTells();
      }, REACTION_HOLD_MS);
    }
    spawnHouseEvent(kind);
  }

  // Spawn the appropriate event particles into the .house-events overlay.
  // Each particle is a short-lived span with one of the evt-* animation
  // classes (defined in the closeness CSS); animationend removes it.
  function spawnHouseEvent(kind) {
    if (!houseEventsEl) return;
    const cfg = HOUSE_EVENTS[kind];
    if (!cfg) return;
    const rect = houseEventsEl.getBoundingClientRect();
    if (!rect.width) return;
    for (let i = 0; i < cfg.count; i++) {
      const span = document.createElement('span');
      span.className = `house-evt ${cfg.cls}`;
      span.textContent = cfg.symbol;
      span.style.color = cfg.color;
      span.style.left = (12 + Math.random() * (rect.width - 24)) + 'px';
      span.style.animationDelay = (i * 90) + 'ms';
      houseEventsEl.appendChild(span);
      span.addEventListener('animationend', () => span.remove(), { once: true });
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  // ====== PARTICLES ======
  // Each burst spawns a handful of short-lived spans that fly outward from the
  // mount and fade. Pure CSS animation; we just write inline --tx/--ty vars.
  function burst({ symbol = '★', color = '#fff', count = 8, splash = false } = {}) {
    if (!mountEl) return;
    const rect = mountEl.getBoundingClientRect();
    if (!rect.width) return;
    const cx = rect.left + rect.width / 2 + window.scrollX;
    const cy = rect.top + rect.height / 2 + window.scrollY;
    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'closeness-particle' + (splash ? ' is-splash' : '');
      span.textContent = symbol;
      span.style.color = color;
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.6 - 0.3);
      const dist = 60 + Math.random() * 70;
      span.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
      span.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
      span.style.left = `${cx}px`;
      span.style.top = `${cy}px`;
      span.style.animationDuration = `${700 + Math.random() * 400}ms`;
      document.body.appendChild(span);
      span.addEventListener('animationend', () => span.remove(), { once: true });
    }
  }

  // ====== SOUND ======
  const Sound = (function () {
    let ctx = null;
    let muted = false;
    // Grinding-wheel sustain: a sawtooth + a slow noise drone, both gated by
    // grindGain so we can fade in on spin start and fade out on spin end.
    let grindOsc = null;
    let grindNoise = null;
    let grindGain = null;

    function init() {
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        ctx = null;
      }
      return ctx;
    }

    function makeNoiseBuffer() {
      if (!ctx) return null;
      const len = ctx.sampleRate * 0.5;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    function grindStart() {
      if (muted || !ctx || grindOsc) return;
      const t0 = ctx.currentTime;
      grindGain = ctx.createGain();
      grindGain.gain.setValueAtTime(0, t0);
      grindGain.gain.linearRampToValueAtTime(0.05, t0 + 0.12);
      grindGain.connect(ctx.destination);

      // Sawtooth body — the metallic edge.
      grindOsc = ctx.createOscillator();
      grindOsc.type = 'sawtooth';
      grindOsc.frequency.setValueAtTime(110, t0);
      grindOsc.frequency.linearRampToValueAtTime(80, t0 + 2.4);
      const sawGain = ctx.createGain();
      sawGain.gain.value = 0.6;
      grindOsc.connect(sawGain).connect(grindGain);
      grindOsc.start(t0);

      // Noise hiss — the friction.
      grindNoise = ctx.createBufferSource();
      grindNoise.buffer = makeNoiseBuffer();
      grindNoise.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.4;
      grindNoise.connect(hp).connect(noiseGain).connect(grindGain);
      grindNoise.start(t0);
    }

    function grindStop() {
      if (!ctx || !grindGain) return;
      const t0 = ctx.currentTime;
      const g = grindGain;
      const osc = grindOsc;
      const noise = grindNoise;
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(g.gain.value, t0);
      g.gain.linearRampToValueAtTime(0, t0 + 0.18);
      if (osc) osc.stop(t0 + 0.22);
      if (noise) noise.stop(t0 + 0.22);
      grindOsc = null;
      grindNoise = null;
      grindGain = null;
    }

    function bell(freq, dur, peak) {
      if (muted || !ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.01;
      g2.gain.setValueAtTime(0, t0);
      g2.gain.linearRampToValueAtTime(peak * 0.25, t0 + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.start(t0); osc2.stop(t0 + dur * 0.6);
    }

    // Metallic clink — three voices stacked at a struck-metal's inharmonic
    // ratios (1 / 2.76 / 5.40), each its own short envelope:
    //   • Attack:   square burst, ~15 ms — the "tk" transient of the strike
    //   • Body:     triangle, ~280 ms, slight pitch droop — the ringing bell
    //   • Overtone: sine at 2.76× fundamental, ~180 ms — the "ting" sheen
    //   • Air:      sine at 5.40× fundamental, ~80 ms — the high sparkle
    // Tiny random pitch jitter per call so successive clinks don't sound
    // perfectly identical (real metal tabs are never quite identical either).
    function tick() {
      if (muted || !ctx) return;
      const t0 = ctx.currentTime;
      const jitter = 1 + (Math.random() - 0.5) * 0.06;   // ±3% pitch
      const fund = 1180 * jitter;

      // Attack — sharp, brief
      const a = ctx.createOscillator();
      const ag = ctx.createGain();
      a.type = 'square';
      a.frequency.value = 2400;
      ag.gain.setValueAtTime(0.10, t0);
      ag.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.015);
      a.connect(ag).connect(ctx.destination);
      a.start(t0); a.stop(t0 + 0.02);

      // Body — the bell of the clink
      const b = ctx.createOscillator();
      const bg = ctx.createGain();
      b.type = 'triangle';
      b.frequency.setValueAtTime(fund * 1.04, t0);
      b.frequency.exponentialRampToValueAtTime(fund, t0 + 0.05);
      bg.gain.setValueAtTime(0.16, t0);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      b.connect(bg).connect(ctx.destination);
      b.start(t0); b.stop(t0 + 0.30);

      // Overtone — gives it the "ting" sheen
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = fund * 2.76;
      og.gain.setValueAtTime(0.07, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(og).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.20);

      // Air — high sparkle
      const h = ctx.createOscillator();
      const hg = ctx.createGain();
      h.type = 'sine';
      h.frequency.value = fund * 5.40;
      hg.gain.setValueAtTime(0.035, t0);
      hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      h.connect(hg).connect(ctx.destination);
      h.start(t0); h.stop(t0 + 0.10);
    }

    function flip() {
      if (muted || !ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, t0);
      osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.06);
      g.gain.setValueAtTime(0.10, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.08);
    }

    function close() {
      bell(659.25, 0.45, 0.14);
      setTimeout(() => bell(987.77, 0.40, 0.12), 90);
    }
    function coin() {
      bell(1318.51, 0.20, 0.11);
      setTimeout(() => bell(1567.98, 0.30, 0.10), 80);
    }
    function bigCoin() {
      bell(1318.51, 0.25, 0.13);
      setTimeout(() => bell(1760.00, 0.30, 0.12), 80);
      setTimeout(() => bell(2093.00, 0.40, 0.11), 160);
    }
    function bust() {
      if (muted || !ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t0);
      osc.frequency.exponentialRampToValueAtTime(110, t0 + 1.3);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 1.3);
    }

    return {
      init, tick, flip, close, coin, bigCoin, bust,
      grindStart, grindStop,
      setMuted: (v) => { muted = !!v; },
    };
  })();

  window.Closeness = { applyOutcome, setStatus, Sound, burst };
})();
