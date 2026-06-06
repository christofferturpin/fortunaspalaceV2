/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BONEPILE/SCRATCH — 4×2 dice scratcher w/ real drag-scratch + dust pile  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ bindUI() + initDust() + RAF loop             │
  │                          └─ newTicket() (idle state)                     │
  │                                                                          │
  │   buyTicket() ──► readBet → Wallet.spend(bet) → Child.recordPlay         │
  │                   ──► genTicket(bet) ──► buildGrid (8 cells)             │
  │                                                                          │
  │   per cell: die face span (always rendered behind) + .bp-scratch         │
  │     <canvas> overlay covering it, pre-painted silver+hatch.              │
  │                                                                          │
  │   pointerdown on canvas ──► start drag                                   │
  │   pointermove ──► erase circular brush along path (destination-out);     │
  │                   for each move-segment spawn 2-4 dust particles into    │
  │                   the global #bp-dust system at the cell's screen pos;   │
  │                   track scratched %; >= REVEAL_THRESHOLD → fully clear   │
  │                   canvas → reveal(i) → spawn settling dust burst.        │
  │                                                                          │
  │   reveal(i): bust→ winnings=0; endTicket('BUST'). else faceCount[f]++;   │
  │              pair completed (count even) → winnings+=bet*face/4;         │
  │              flash floating +pay; allRevealed → endTicket('Spent.').     │
  │                                                                          │
  │   cashOut() ──► Wallet.add(winnings) → endTicket('CASH')                 │
  │   newTicket() ──► reset state, idle grid                                 │
  │                                                                          │
  │   Dust system (global, #bp-dust canvas fixed at viewport bottom):        │
  │     particles=[{x,y,vx,vy,color,size}];                                  │
  │     pileHeights[col] (px); RAF tick: gravity+drift; collision with       │
  │     pileHeights[col] → settle, bump column, spread to neighbors. Draw    │
  │     piles as filled jagged polygon; flying particles as small specks.    │
  │   SWEEP button → fade pileHeights to 0, clear particles.                 │
  │                                                                          │
  │   Exports: window.Bonepile = { buyTicket, cashOut, newTicket, sweep }    │
  │   External deps: Wallet (required), Child (optional via recordPlay)      │
  │   DOM: #bp-grid, #bp-winnings, #bp-status, #bp-bet, #bp-bet-max,         │
  │         #bp-buy, #bp-cashout, #bp-newticket, #bp-sweep,                  │
  │         #bp-serial, #bp-dust                                             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ROWS=2; COLS=4; CELLS=8; BUST_COUNT=1; DICE_COUNT=7
  FACE_GLYPHS={1:'⚀',…,6:'⚅'}; BUST_GLYPH='☠'
  BRUSH_R=9 (coin-thin); reveal when scratched-distance ≥ avgDim*4
  (committed: once any cell touched, others lock until it's revealed)
  PARTICLES_PER_MOVE=2
  GRAVITY=0.35; DRIFT=0.92; PILE_W=3 (pixel-col width); PILE_DECAY=0.0006
  state: active=F,bet=0,winnings=0,cells=[],faceCount={1..6:0},serial=0
  els: grid,winEl,statusEl,betEl,maxBtn,buyBtn,cashBtn,newBtn,sweepBtn,
       serialEl, dust=#bp-dust canvas + ctx
  dustState: parts=[], pile=Float32Array(width/PILE_W), needsResize=T
  readBet()→int: clamp ≥1 floor; sync betEl
  pairPayout(f,bet)→Math.round(bet*f/4)
  shuffle(a) fisher-yates
  genTicket(b): bet=b; winnings=0; faceCount={...0}; pool=7 dice rnd 1-6 +
    1 bust; shuffle; cells=pool+revealed:F; serial=1000+rnd*9000|0; active=T
  buildIdleGrid(): clear; 8 .bp-cell.idle placeholders w/ '·'
  buildGrid(): clear; ∀i create .bp-cell wrapper {.bp-face span(face glyph
    or BUST glyph), .bp-scratch canvas overlay 2*W*H to align device px};
    paintScratchCanvas(cnv): silver gradient + hatch noise + sparkle dots
    cell.dataset.i=i; track per-cell {scratched:0, totalArea:W*H, revealed:F}
  pointer events on canvas: pointerdown→capture; pointermove→ erase brush
    arc; estimate scratched area += π*BRUSH_R²; spawnDust(cell, ev) →
    push particles into dustState.parts at screen coord of pointer with
    random vy=-2..2,vx=-3..3; if scratched/totalArea>=REVEAL_PCT → fully
    clear canvas (ctx.clearRect) → reveal(i)
  reveal(i): cell=cells[i]; cell.revealed=T; bust→ winnings=0; explodeDust
    (big puff red-tinged at cell pos); endTicket('BUST'); ret.
    f=cell.face; faceCount[f]++; pairMade=(count%2===0);
    pairMade→ pay=pairPayout(f,bet); winnings+=pay; flashPay(cellEl,pay);
    renderReadout; allRevealed → endTicket('Spent.')
  cashOut(): guard !active||win<=0; Wallet.add(win); endTicket('Cashed +N')
  endTicket(msg): active=F; statusEl=msg; cashBtn dis; buyBtn hide; newBtn
    show. peel all remaining canvases (no auto-reveal of unscratched
    cells — show as "—" stub).
  newTicket(): clear state; buildIdleGrid; ui idle
  dustResize(): dust.width=innerWidth*dpr; dust.height=300*dpr; ctx scale;
    pile=Float32Array(ceil(innerWidth/PILE_W)).fill(0)
  spawnDust(srcX,srcY,n,tint): for n: push {x:srcX,y:srcY,vx:rnd*6-3,
    vy:-1-rnd*2.5, color:tint||pickBoneColor(), size:1+rnd*1.5}
  tickDust(): ∀p: p.vy+=GRAVITY; p.vx*=DRIFT; p.x+=vx; p.y+=vy;
    floorY=dustH; col=floor(p.x/PILE_W); inBounds→ ph=pile[col];
    p.y>=floorY-ph → settle: pile[col]+=size*0.8; spread half to col±1;
    splice out. clamp pile[col]≤dustH-20. pile decays *0.9994 each tick.
  drawDust(): clear; draw pile polygon (moveTo(0,h); lineTo(col*W,h-pile);
    closePath; fill bone-cream gradient + dark outline);
    draw particles (fillRect tiny dots in their color)
  rafLoop(): tickDust; drawDust; requestAnimationFrame(rafLoop)
  sweep(): pile.fill(0); parts=[]; statusEl flash 'Floor swept.'
  flashPay(cellEl,pay): floating '+pay' span append→remove after 900ms
  bindUI: buy/cash/new/sweep/max click; bet input clamp; window resize→
    dustResize
  init(): cache els; dustResize; bindUI; window.addEventListener('resize')
    →dustResize; rafLoop; newTicket
  exports: global.Bonepile={buyTicket,cashOut,newTicket,sweep}
*/

(function () {
  'use strict';

  const SHAPES = [
    { name: '4×2', cols: 4, rows: 2 },
    { name: '2×4', cols: 2, rows: 4 },
    { name: '3×3', cols: 3, rows: 3 },
    { name: '4×4', cols: 4, rows: 4 },
  ];
  const CELL_SHAPES = ['square', 'circle'];
  const BUST_COUNT = 1;
  const FACE_GLYPHS = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
  const BUST_GLYPH = '☠';

  // Combo ladder: pair-equivalents owed at a given same-face count.
  // Pair-equivalent value = bet * face / 4. Delta on each new reveal is
  // paid out, so 3 of a kind = +1 pair beyond the original pair, etc.
  const COMBO_PAIRS = [0, 0, 1, 2, 4, 6, 9, 13, 18, 24, 31, 39, 48, 58, 69, 81, 94];

  const BRUSH_R = 6;
  const PARTICLES_PER_MOVE = 2;

  // 20 modular printed-ticket designs — picked at random per BUY. Each
  // skin sets a slogan, palette, typography, border, pattern, and four
  // corner ornaments. All driven by CSS custom props + data-attrs on
  // the #bp-ticket element; no per-skin CSS rules needed.
  const TICKET_SKINS = [
    { id: 'stupid-money',   slogan: 'STUPID MONEY!',  sub: 'Pay-out is automatic·~ish',
      bg: '#fff0a3', accent: '#b8001f', accent2: '#1a1612', text: '#1a1612',
      font: 'carnival', border: 'zigzag',  corner: '★', pattern: 'dots'    },
    { id: 'crazy-chance',   slogan: 'CRAZY CHANCE!',  sub: 'Now with MORE numbers',
      bg: '#ff5fae', accent: '#1affff', accent2: '#ffffff', text: '#1a0030',
      font: 'blocky',   border: 'dashed',  corner: '✦', pattern: 'dots'    },
    { id: 'wild-luck',      slogan: 'WILD LUCK!',     sub: 'As Played In HEAVEN',
      bg: '#e8f0d0', accent: '#2a6a3a', accent2: '#a8c878', text: '#0a2010',
      font: 'serif',    border: 'double',  corner: '☘', pattern: 'none'    },
    { id: 'scratchy-slots', slogan: 'SCRATCHY SLOTS!', sub: 'Spin · Scratch · Sigh · Repeat',
      bg: '#2a0a3a', accent: '#d4af37', accent2: '#ff5fae', text: '#ffe8a8',
      font: 'deco',     border: 'groove',  corner: '◆', pattern: 'chevron' },
    { id: 'easy-easy',      slogan: 'EASY · EASY',     sub: 'A treat. For YOU.',
      bg: '#e8d8e8', accent: '#a060c8', accent2: '#a8d0e8', text: '#3a1850',
      font: 'soft',     border: 'dotted',  corner: '✿', pattern: 'none'    },
    { id: 'big-big-big',    slogan: 'BIG·BIG·BIG!',    sub: 'Bigger Is Better Is Best',
      bg: '#0e0e0e', accent: '#ff2010', accent2: '#fff5d0', text: '#fff5d0',
      font: 'blocky',   border: 'solid',   corner: '■', pattern: 'stripes' },
    { id: 'pure-profit',    slogan: 'PURE PROFIT$',    sub: 'A diversified portfolio of LUCK',
      bg: '#d8e8d0', accent: '#1a4a2a', accent2: '#d4af37', text: '#0a2010',
      font: 'sans',     border: 'double',  corner: '$', pattern: 'grid'    },
    { id: 'lucky-punk',     slogan: 'LUCKY PUNK!!',    sub: 'authorized by no one',
      bg: '#ffd8e8', accent: '#1a1612', accent2: '#ff2080', text: '#1a1612',
      font: 'punk',     border: 'dashed',  corner: '✕', pattern: 'noise'   },
    { id: 'free-money',     slogan: 'FREE MONEY!*',    sub: '*total cost not included',
      bg: '#fff5d0', accent: '#d4af37', accent2: '#8a6e1e', text: '#3a2810',
      font: 'deco',     border: 'ridge',   corner: '✦', pattern: 'none'    },
    { id: 'last-chance',    slogan: 'LAST CHANCE!',    sub: 'only minutes left to act',
      bg: '#fff0a0', accent: '#b8001f', accent2: '#1a1612', text: '#1a1612',
      font: 'carnival', border: 'solid',   corner: '⚠', pattern: 'hazard'  },
    { id: 'hot-hot-hot',    slogan: 'HOT·HOT·HOT!',    sub: 'too hot for regulation',
      bg: '#1a0a04', accent: '#ff6a00', accent2: '#ffd84a', text: '#ffe8a8',
      font: 'blocky',   border: 'groove',  corner: '◉', pattern: 'flame'   },
    { id: 'triple-triple',  slogan: 'TRIPLE·TRIPLE!',  sub: 'three times the math',
      bg: '#fff5e0', accent: '#b8001f', accent2: '#2a6a3a', text: '#1a1612',
      font: 'carnival', border: 'double',  corner: '③', pattern: 'tri'     },
    { id: 'hush-money',     slogan: 'HUSH MONEY',      sub: "you didn't see anything",
      bg: '#0a0808', accent: '#d4af37', accent2: '#8a6e1e', text: '#ecdfc4',
      font: 'deco',     border: 'double',  corner: '♛', pattern: 'none'    },
    { id: 'sneaky-win',     slogan: 'SNEAKY WIN!',     sub: "a win they don't want you to know",
      bg: '#e8e4d8', accent: '#1a1612', accent2: '#5a4e3a', text: '#1a1612',
      font: 'news',     border: 'solid',   corner: '※', pattern: 'halftone'},
    { id: 'holy-grail',     slogan: 'HOLY GRAIL!',     sub: 'drink from the gilded cup',
      bg: '#f4e8c8', accent: '#8a4a18', accent2: '#d4af37', text: '#3a1808',
      font: 'illuminated', border: 'ridge', corner: '✟', pattern: 'none'    },
    { id: 'spooky-cash',    slogan: 'SPOOKY CASH!',    sub: 'boo. pay up.',
      bg: '#180626', accent: '#ff6a00', accent2: '#a060c8', text: '#ffd84a',
      font: 'carnival', border: 'dashed',  corner: '☠', pattern: 'webs'    },
    { id: 'patriot-prize',  slogan: 'PATRIOT PRIZE',   sub: 'stake your republic',
      bg: '#f4f4f4', accent: '#b8001f', accent2: '#1a4080', text: '#0a1840',
      font: 'sans',     border: 'double',  corner: '★', pattern: 'flag'    },
    { id: 'royale-royale',  slogan: 'ROYALE·ROYALE',   sub: "a monarch's burden lifted",
      bg: '#3a0a14', accent: '#d4af37', accent2: '#fff5d0', text: '#fff5d0',
      font: 'deco',     border: 'ridge',   corner: '♠', pattern: 'deco'    },
    { id: 'goof-bucks',     slogan: 'GOOF BUCKS!',     sub: 'BIFF! BAM! BUCKS!',
      bg: '#ffd84a', accent: '#b8001f', accent2: '#1aff7f', text: '#1a1612',
      font: 'comic',    border: 'solid',   corner: '✱', pattern: 'pow'     },
    { id: 'mega-maxi',      slogan: 'MEGA · MAXI',     sub: 'subwoofers sold separately',
      bg: '#0a0e14', accent: '#a8b8c8', accent2: '#ff2080', text: '#e8eef4',
      font: 'chrome',   border: 'ridge',   corner: '▶', pattern: 'racing'  },

    // ── second roster (cultural-niche oddities) ──────────────────────
    { id: 'joy-div',        slogan: 'JOY · DIV.',       sub: 'unknown pleasures · unknown payouts',
      bg: '#0a0a0a', accent: '#f4f4f4', accent2: '#888888', text: '#f4f4f4',
      font: 'sans',     border: 'solid',   corner: '▲', pattern: 'pulse'   },
    { id: 'espresso',       slogan: 'ESPRESSO!',        sub: 'a little sweet · a little mean',
      bg: '#fde0e8', accent: '#8a4030', accent2: '#f4c8b0', text: '#5a2018',
      font: 'soft',     border: 'dotted',  corner: '♥', pattern: 'dots'    },
    { id: 'farts',          slogan: 'FARTS!!',          sub: 'silent · but profitable',
      bg: '#a8c478', accent: '#5a4818', accent2: '#c8a868', text: '#3a2810',
      font: 'comic',    border: 'dashed',  corner: '💨', pattern: 'noise'   },
    { id: 'dohbucks',       slogan: "D'OH BUCKS",       sub: 'mmmm · gambling',
      bg: '#ffd84a', accent: '#1a4080', accent2: '#ff5a90', text: '#1a1612',
      font: 'comic',    border: 'solid',   corner: '◉', pattern: 'pow'     },
    { id: 'unreal',         slogan: 'UNREAL',           sub: 'a sermon for the eternally damp',
      bg: '#c8b890', accent: '#3a1808', accent2: '#8a4a18', text: '#1a0808',
      font: 'illuminated', border: 'double', corner: '✟', pattern: 'webs'   },
    { id: '17776',          slogan: '17776',            sub: 'football for the long quiet future',
      bg: '#2a6840', accent: '#ffffff', accent2: '#c8b878', text: '#ffffff',
      font: 'sans',     border: 'solid',   corner: '⏣', pattern: 'flag'    },
    { id: 'daw-heat',       slogan: 'DAW · HEAT',       sub: 'quantize · sidechain · win',
      bg: '#0e0e1a', accent: '#5cd8d0', accent2: '#d85ca8', text: '#a8e0ff',
      font: 'chrome',   border: 'ridge',   corner: '▶', pattern: 'pulse'   },
    { id: 'boymode',        slogan: 'BOYMODE',          sub: 'just running an errand · do not perceive',
      bg: '#a8d8e8', accent: '#f5a8c0', accent2: '#ffffff', text: '#1a3050',
      font: 'comic',    border: 'dashed',  corner: '⚧', pattern: 'flag'    },
    { id: 'pride-pump',     slogan: 'PRIDE PUMP!',      sub: 'every prize, every flag',
      bg: '#ffffff', accent: '#b8001f', accent2: '#a060c8', text: '#1a1612',
      font: 'carnival', border: 'double',  corner: '✧', pattern: 'rainbow' },
    { id: 'anarcho',        slogan: 'ANARCHO!',         sub: 'no gods · no markets · one bust',
      bg: '#0a0a0a', accent: '#b8001f', accent2: '#f4f4f4', text: '#f4f4f4',
      font: 'punk',     border: 'dashed',  corner: 'Ⓐ', pattern: 'noise'   },
    { id: 'asmr',           slogan: 'A·S·M·R',          sub: 'whisper · scratch · tingle',
      bg: '#e8e0e4', accent: '#a890a8', accent2: '#c8b8c0', text: '#3a2a3a',
      font: 'soft',     border: 'dotted',  corner: '◌', pattern: 'halftone'},
    { id: 'npr-prize',      slogan: 'NPR · PRIZE',      sub: 'made possible by listeners like you',
      bg: '#f4ecdc', accent: '#1a3050', accent2: '#8a6e1e', text: '#1a3050',
      font: 'serif',    border: 'double',  corner: '◉', pattern: 'stripes' },
    { id: 'kpop',           slogan: 'K · POP!',         sub: 'bias · wrecker · payout',
      bg: '#ffd8e8', accent: '#a060c8', accent2: '#5cd8d0', text: '#4a1860',
      font: 'comic',    border: 'dotted',  corner: '♡', pattern: 'dots'    },
    { id: 'crypto',         slogan: 'CRYPTO!',          sub: 'wagmi · ngmi · bust',
      bg: '#0a120a', accent: '#1aff7f', accent2: '#d4af37', text: '#1aff7f',
      font: 'chrome',   border: 'ridge',   corner: '₿', pattern: 'grid'    },
    { id: 'bible-bux',      slogan: 'BIBLE BUX',        sub: 'seed faith · reap denarii',
      bg: '#f4e8c8', accent: '#8a001f', accent2: '#d4af37', text: '#3a0810',
      font: 'illuminated', border: 'double', corner: '✟', pattern: 'deco'   },
    { id: 'ufo-bux',        slogan: 'UFO BUX',          sub: 'classified · disclosed · paid out',
      bg: '#0a0a18', accent: '#1aff7f', accent2: '#a060c8', text: '#1aff7f',
      font: 'chrome',   border: 'dotted',  corner: '◎', pattern: 'cosmic'  },
    { id: 'therapy',        slogan: 'THERAPY$',         sub: 'gently · regulated · variance',
      bg: '#dce8d8', accent: '#5a8a6a', accent2: '#c8b890', text: '#2a4030',
      font: 'soft',     border: 'dotted',  corner: '◌', pattern: 'dots'    },
    { id: 'nascar',         slogan: 'NASCAR!',          sub: 'left turn · left turn · left turn · win',
      bg: '#f4f4f4', accent: '#b8001f', accent2: '#1a3050', text: '#1a1612',
      font: 'blocky',   border: 'solid',   corner: '▶', pattern: 'racing'  },
    { id: 'crying',         slogan: 'CRYING.',          sub: 'soft launch · soft loss',
      bg: '#f8d8e0', accent: '#8a4060', accent2: '#c890a8', text: '#3a1830',
      font: 'soft',     border: 'dashed',  corner: '◔', pattern: 'dots'    },
    { id: 'normcore',       slogan: 'NORMCORE',         sub: 'wears every winning combination evenly',
      bg: '#e8e0d0', accent: '#5a4e3a', accent2: '#a89878', text: '#3a3022',
      font: 'sans',     border: 'solid',   corner: '○', pattern: 'none'    }
  ];

  const GRAVITY = 0.34;
  const DRIFT = 0.93;
  const PILE_W = 3;
  const PILE_DECAY = 0.9996;
  const DUST_CANVAS_H = 220;

  // ~8 tickets' worth of settled flecks before you can scoop the pile and
  // rub it back over a revealed cell (one-shot bust insurance).
  const DUST_THRESHOLD = 4000;
  const DUST_STORAGE_KEY = 'wendys_palace_bonepile_dust';

  const BONE_COLORS = ['#d8c8b0', '#c8b694', '#e6d8b8', '#a89878', '#b8a888', '#ecdfc4'];

  const state = {
    active: false,
    bet: 0,
    winnings: 0,
    cells: [],          // {kind,face?,revealed,scratched,totalArea}
    faceCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    serial: 0,
    committed: -1,   // once a cell is touched, player must finish it
    rubMode: false,  // bust hit + bank sufficient → awaiting RUB decision
    rubbing: false,  // scoop animation in progress
    bustCellIdx: -1, // cell to potentially re-cover via rub
    preBustWinnings: 0,
    shape: SHAPES[0],
    cellShape: 'square',
  };

  // dust currently scooped-up, ready to rub. Caps at DUST_THRESHOLD.
  // Persisted across sessions in localStorage[DUST_STORAGE_KEY].
  let dustBanked = 0;

  function loadDust() {
    try {
      const raw = parseInt(localStorage.getItem(DUST_STORAGE_KEY) || '0', 10);
      if (isFinite(raw) && raw > 0) {
        dustBanked = Math.min(DUST_THRESHOLD, raw);
      }
    } catch (e) {}
  }
  function saveDust() {
    try { localStorage.setItem(DUST_STORAGE_KEY, String(dustBanked)); } catch (e) {}
  }

  const dustState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    parts: [],
    pile: null,
    width: 0,
    height: 0,
  };

  let grid, winEl, statusEl, betEl, maxBtn, buyBtn, cashBtn, newBtn, sweepBtn,
    rubBtn, serialEl, meterFill, meterLabel,
    ticketEl, ticketTitleEl, ticketSubEl, stackEl,
    cornerTL, cornerTR, cornerBL, cornerBR;

  const MAX_STACK = 6;

  // tiny SFX shim — silently no-ops if audio module isn't loaded
  function S(name) {
    const b = window.BonepileSound;
    if (!b || typeof b[name] !== 'function') return;
    try { b[name].apply(b, Array.prototype.slice.call(arguments, 1)); }
    catch (e) {}
  }

  // LOTTAUTO attendant — rotating taglines per BUY. First line at page
  // load is hard-coded in HTML; this fires on every print.
  const GREETER_LINES = [
    'hello, dipshit',
    'feed me coins',
    'another one?',
    "what'll it be, genius",
    'back already',
    "your money's no good here. (it is.)",
    'press buy. press buy. press buy.',
    'mmm. wager.',
    'hope dies last. so does your bankroll.',
    'i remember you',
    'you again',
    "we're gonna get you this time",
    'thank you for your contribution',
    "don't blame me",
    'i just work here',
    'they make me say this',
    'lucky numbers? lol',
    'great wager. great. great wager.',
    "i'm legally required to print one",
    'good luck. (no.)',
  ];
  let greeterIdx = 0;
  function bumpGreeter() {
    greeterIdx = (greeterIdx + 1 + Math.floor(Math.random() * (GREETER_LINES.length - 1)))
      % GREETER_LINES.length;
    const el = document.getElementById('bp-greeter-bubble');
    if (el) el.textContent = GREETER_LINES[greeterIdx];
    S('greet');
  }

  // ────────────────────────────────────────────────────────────────────
  // utility
  // ────────────────────────────────────────────────────────────────────
  function readBet() {
    let n = parseInt(betEl.value, 10);
    if (!isFinite(n) || n < 1) n = 1;
    n = Math.floor(n);
    betEl.value = String(n);
    return n;
  }
  function pairPayout(face, bet) { return Math.round((bet * face) / 4); }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function pickBoneColor() { return BONE_COLORS[Math.floor(Math.random() * BONE_COLORS.length)]; }

  // ────────────────────────────────────────────────────────────────────
  // ticket generation
  // ────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────
  // ticket archive — convert spent ticket to a static <img> in the stack
  // ────────────────────────────────────────────────────────────────────
  function snapshotCurrentTicket() {
    if (!state.cells || !state.cells.length) return null;
    const skin = state.skin || {
      bg: '#1f1a14', accent: '#d4af37', accent2: '#8a6e1e', text: '#ecdfc4',
      slogan: '★  BONEPILE  ★', sub: ''
    };
    const W = 420;
    const H = 360;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // bg + border
    ctx.fillStyle = skin.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // title
    ctx.fillStyle = skin.text;
    ctx.font = 'bold 22px "Cinzel", "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(skin.slogan || '★  BONEPILE  ★', W / 2, 18);

    // sub
    ctx.font = '11px "Special Elite", "Courier New", monospace';
    ctx.fillText('— ' + (skin.sub || '') + ' —', W / 2, 48);

    // serial
    ctx.textAlign = 'right';
    ctx.fillStyle = skin.accent;
    ctx.font = '10px "Special Elite", "Courier New", monospace';
    ctx.fillText('№ ' + String(state.serial).padStart(4, '0'), W - 16, 70);

    // dice grid
    const shape = state.shape;
    const gridTop = 92;
    const gridBottom = H - 56;
    const gridLeft = 28;
    const gridRight = W - 28;
    const gw = gridRight - gridLeft;
    const gh = gridBottom - gridTop;
    const cellW = gw / shape.cols;
    const cellH = gh / shape.rows;
    const cellSize = Math.min(cellW, cellH) - 6;
    const isCircle = state.cellShape === 'circle';

    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      const row = Math.floor(i / shape.cols);
      const col = i % shape.cols;
      const cx = gridLeft + col * cellW + cellW / 2;
      const cy = gridTop + row * cellH + cellH / 2;
      const half = cellSize / 2;

      ctx.save();
      if (isCircle) {
        ctx.beginPath();
        ctx.arc(cx, cy, half, 0, Math.PI * 2);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.rect(cx - half, cy - half, cellSize, cellSize);
      }
      if (!cell.revealed) {
        // un-scratched: leftover silver from the original surface
        const g = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
        g.addColorStop(0, '#cdb7e3');
        g.addColorStop(0.5, '#8fa4d2');
        g.addColorStop(1, '#5d7aa8');
        ctx.fillStyle = g;
      } else if (cell.kind === 'bust') {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, half);
        g.addColorStop(0, '#5a0010');
        g.addColorStop(1, '#1a0608');
        ctx.fillStyle = g;
      } else {
        const g = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
        g.addColorStop(0, '#fbeed0');
        g.addColorStop(1, '#c8b694');
        ctx.fillStyle = g;
      }
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(40,28,16,0.45)';
      ctx.stroke();
      ctx.restore();

      // glyph
      if (cell.revealed) {
        if (cell.kind === 'bust') {
          ctx.fillStyle = '#ff3a4a';
          ctx.font = (cellSize * 0.7) + 'px "Segoe UI Symbol", sans-serif';
        } else {
          ctx.fillStyle = '#1a1612';
          ctx.font = (cellSize * 0.7) + 'px "Segoe UI Symbol", sans-serif';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const glyph = cell.kind === 'bust' ? '☠' : FACE_GLYPHS[cell.face];
        ctx.fillText(glyph, cx, cy + 1);
      } else {
        ctx.fillStyle = 'rgba(40,28,16,0.5)';
        ctx.font = (cellSize * 0.3) + 'px "Cinzel", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', cx, cy);
      }
    }

    // outcome stamp
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    if (state.winnings > 0 && !state.active) {
      ctx.fillStyle = '#1aff7f';
      ctx.font = 'bold 20px "Cinzel", serif';
      ctx.fillText('+' + state.winnings, W - 18, H - 14);
    } else if (state.bustCellIdx >= 0) {
      ctx.fillStyle = '#ff3a4a';
      ctx.font = 'bold 22px "Cinzel", serif';
      ctx.save();
      ctx.translate(W - 100, H - 28);
      ctx.rotate(-0.15);
      ctx.strokeStyle = '#ff3a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(-4, -22, 80, 30);
      ctx.fillText('BUST', 70, 4);
      ctx.restore();
    }

    return c.toDataURL('image/png');
  }

  function archiveCurrentTicket() {
    if (!stackEl) return;
    const dataUrl = snapshotCurrentTicket();
    if (!dataUrl) return;
    const img = document.createElement('img');
    img.className = 'bp-archived';
    img.alt = 'spent ticket';
    img.src = dataUrl;
    const angle = (Math.random() - 0.5) * 8;     // -4..+4 deg
    const tx = (Math.random() - 0.5) * 22;       // small fan offset
    const ty = (Math.random() - 0.5) * 14;
    img.style.transform = 'translate(' + tx.toFixed(1) + 'px, ' +
      ty.toFixed(1) + 'px) rotate(' + angle.toFixed(2) + 'deg)';
    stackEl.appendChild(img);
    while (stackEl.children.length > MAX_STACK) {
      stackEl.removeChild(stackEl.firstChild);
    }
  }

  function applyTicketSkin(skin) {
    if (!ticketEl || !skin) return;
    ticketEl.style.setProperty('--skin-bg', skin.bg);
    ticketEl.style.setProperty('--skin-accent', skin.accent);
    ticketEl.style.setProperty('--skin-accent2', skin.accent2);
    ticketEl.style.setProperty('--skin-text', skin.text);
    ticketEl.dataset.skin = skin.id;
    ticketEl.dataset.font = skin.font;
    ticketEl.dataset.border = skin.border;
    ticketEl.dataset.pattern = skin.pattern;
    if (ticketTitleEl) ticketTitleEl.textContent = skin.slogan;
    if (ticketSubEl) ticketSubEl.textContent = '— ' + skin.sub + ' —';
    [cornerTL, cornerTR, cornerBL, cornerBR].forEach(function (el) {
      if (el) el.textContent = skin.corner;
    });
    // tiny print-job animation pulse
    ticketEl.classList.remove('printing');
    void ticketEl.offsetWidth;
    ticketEl.classList.add('printing');
  }

  function clearTicketSkin() {
    if (!ticketEl) return;
    ticketEl.removeAttribute('data-skin');
    ticketEl.removeAttribute('data-font');
    ticketEl.removeAttribute('data-border');
    ticketEl.removeAttribute('data-pattern');
    ticketEl.style.removeProperty('--skin-bg');
    ticketEl.style.removeProperty('--skin-accent');
    ticketEl.style.removeProperty('--skin-accent2');
    ticketEl.style.removeProperty('--skin-text');
    if (ticketTitleEl) ticketTitleEl.textContent = '★  BONEPILE  ★';
    if (ticketSubEl) ticketSubEl.textContent = '';
    [cornerTL, cornerTR, cornerBL, cornerBR].forEach(function (el) {
      if (el) el.textContent = '';
    });
  }

  function genTicket(bet) {
    state.bet = bet;
    state.winnings = 0;
    state.faceCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    state.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    state.cellShape = CELL_SHAPES[Math.floor(Math.random() * CELL_SHAPES.length)];
    state.skin = TICKET_SKINS[Math.floor(Math.random() * TICKET_SKINS.length)];
    const total = state.shape.cols * state.shape.rows;
    const dice = total - BUST_COUNT;
    const pool = [];

    // GUARANTEED MATCHES: every ticket plants
    //   • two pairs from the 3-4 range (each independently 3 or 4)
    //   • one pair from either the 1-2 range OR the 5-6 range (50/50)
    // The remaining die slots are uniform-random fillers (which may
    // happen to create extra incidental matches — bonus).
    const mid = [3, 4];
    const lowHigh = Math.random() < 0.5 ? [1, 2] : [5, 6];
    const pairA = mid[Math.floor(Math.random() * mid.length)];
    const pairB = mid[Math.floor(Math.random() * mid.length)];
    const pairC = lowHigh[Math.floor(Math.random() * lowHigh.length)];
    pool.push({ kind: 'die', face: pairA }, { kind: 'die', face: pairA });
    pool.push({ kind: 'die', face: pairB }, { kind: 'die', face: pairB });
    pool.push({ kind: 'die', face: pairC }, { kind: 'die', face: pairC });
    for (let i = pool.length; i < dice; i++) {
      pool.push({ kind: 'die', face: 1 + Math.floor(Math.random() * 6) });
    }
    for (let i = 0; i < BUST_COUNT; i++) pool.push({ kind: 'bust' });
    shuffle(pool);
    state.cells = pool.map((c) =>
      Object.assign({ revealed: false, scratched: 0, totalArea: 1 }, c)
    );
    state.serial = 1000 + Math.floor(Math.random() * 9000);
    state.active = true;
    state.committed = -1;
  }

  // ────────────────────────────────────────────────────────────────────
  // grid building (idle / active)
  // ────────────────────────────────────────────────────────────────────
  function buildIdleGrid() {
    grid.innerHTML = '';
    grid.className = 'bp-grid shape-square';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gridTemplateRows = 'repeat(2, 1fr)';
    for (let i = 0; i < 8; i++) {
      const cell = document.createElement('div');
      cell.className = 'bp-cell idle';
      const face = document.createElement('span');
      face.className = 'bp-face';
      face.textContent = '·';
      cell.appendChild(face);
      grid.appendChild(cell);
    }
  }

  // Iridescent foil palettes — one rolled per cell so a ticket reads
  // as a row of pretty oil-slick scratchies instead of dingy silver.
  const FOIL_PALETTES = [
    // violet → teal → rose (oil slick)
    ['#9c7bd1', '#5cb0d8', '#d986c4', '#c9a6f0'],
    // mint → peach → sky
    ['#a8e6c8', '#ffb89a', '#a8c8ec', '#e0c8f0'],
    // rose-gold
    ['#f5c8b8', '#e89c98', '#d4af37', '#f8e0c8'],
    // electric (blue/cyan/magenta)
    ['#5c7fd8', '#5cd8d0', '#d85ca8', '#7c8cff'],
    // jade + gold
    ['#7fc8a0', '#c8b878', '#e8d098', '#9cd4b8'],
    // sunset (coral / amber / plum)
    ['#ff9c80', '#ffc878', '#a070b8', '#ffb098'],
  ];

  function paintScratchSurface(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const palette = FOIL_PALETTES[Math.floor(Math.random() * FOIL_PALETTES.length)];
    const angle = Math.random() * Math.PI;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const cx = w / 2, cy = h / 2;
    const r = Math.max(w, h);
    const x0 = cx - cosA * r, y0 = cy - sinA * r;
    const x1 = cx + cosA * r, y1 = cy + sinA * r;

    // iridescent base gradient — 4-stop foil sweep at random angle
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0,    palette[0]);
    g.addColorStop(0.35, palette[1]);
    g.addColorStop(0.7,  palette[2]);
    g.addColorStop(1,    palette[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft radial highlight (pearlescent shimmer)
    const hx = w * (0.25 + Math.random() * 0.5);
    const hy = h * (0.2 + Math.random() * 0.4);
    const hr = ctx.createRadialGradient(hx, hy, 2, hx, hy, Math.max(w, h) * 0.7);
    hr.addColorStop(0,   'rgba(255,255,255,0.55)');
    hr.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    hr.addColorStop(1,   'rgba(255,255,255,0.0)');
    ctx.fillStyle = hr;
    ctx.fillRect(0, 0, w, h);

    // subtle diagonal sheen lines (foil grain)
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let k = -h; k < w + h; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + h, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // micro-sparkle specks
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = Math.random() < 0.5
        ? 'rgba(255,255,255,0.9)'
        : 'rgba(255,245,210,0.7)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // tiny centered glyph (works in all cell sizes & shapes)
    ctx.font = '600 ' + Math.max(10, Math.floor(Math.min(w, h) * 0.18)) +
      'px "Cinzel", serif';
    ctx.fillStyle = 'rgba(40,20,60,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', w / 2, h / 2);
  }

  function buildGrid() {
    grid.innerHTML = '';
    grid.className = 'bp-grid shape-' + state.cellShape +
      ' layout-' + state.shape.cols + 'x' + state.shape.rows;
    grid.style.gridTemplateColumns = 'repeat(' + state.shape.cols + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + state.shape.rows + ', 1fr)';
    const total = state.shape.cols * state.shape.rows;
    for (let i = 0; i < total; i++) {
      const data = state.cells[i];
      const cell = document.createElement('div');
      cell.className = 'bp-cell';
      cell.dataset.i = String(i);

      const face = document.createElement('span');
      face.className = 'bp-face';
      if (data.kind === 'bust') {
        face.textContent = BUST_GLYPH;
        face.classList.add('bust-face');
      } else {
        face.textContent = FACE_GLYPHS[data.face];
        face.classList.add('face-' + data.face);
      }
      cell.appendChild(face);

      const canvas = document.createElement('canvas');
      canvas.className = 'bp-scratch';
      cell.appendChild(canvas);

      grid.appendChild(cell);

      // size canvas after layout (next frame)
      requestAnimationFrame(function () {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(rect.width));
        canvas.height = Math.max(1, Math.round(rect.height));
        data.totalArea = canvas.width * canvas.height;
        paintScratchSurface(canvas);
      });

      attachScratchHandlers(canvas, i);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // scratch interaction
  // ────────────────────────────────────────────────────────────────────
  function attachScratchHandlers(canvas, i) {
    let dragging = false;
    let lastX = 0, lastY = 0;

    function localPoint(ev) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - r.left) / r.width) * canvas.width,
        y: ((ev.clientY - r.top) / r.height) * canvas.height,
        screenX: ev.clientX,
        screenY: ev.clientY,
      };
    }

    function eraseAt(x, y) {
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, BRUSH_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    function eraseSegment(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.floor(dist / (BRUSH_R * 0.4)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        eraseAt(x0 + dx * t, y0 + dy * t);
      }
      // distance-based "scratch budget": coin-scratch feel — must rub
      // the cell roughly 4× its average dimension before it gives up.
      const cell = state.cells[i];
      cell.scratched += dist;
      S('scratchTick', Math.min(2, dist / 28));
    }

    function revealThreshold() {
      return ((canvas.width + canvas.height) / 2) * 4;
    }

    function maybeReveal() {
      const cell = state.cells[i];
      if (cell.revealed) return;
      if (cell.scratched >= revealThreshold()) {
        // wipe the rest
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.pointerEvents = 'none';
        reveal(i);
      }
    }

    canvas.addEventListener('pointerdown', function (ev) {
      if (!state.active) return;
      const cell = state.cells[i];
      if (cell.revealed) return;
      // commit lock: once any cell has been touched, only it can be scratched
      // until it's fully revealed.
      if (state.committed === -1) {
        state.committed = i;
        markCommitted(i);
        statusEl.textContent = 'Finish scratching this one — no going back.';
        cashBtn.disabled = true;
      } else if (state.committed !== i) {
        return;
      }
      dragging = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      const p = localPoint(ev);
      lastX = p.x; lastY = p.y;
      eraseAt(p.x, p.y);
      spawnDust(p.screenX, p.screenY, PARTICLES_PER_MOVE * 2);
      maybeReveal();
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      const p = localPoint(ev);
      eraseSegment(lastX, lastY, p.x, p.y);
      lastX = p.x; lastY = p.y;
      spawnDust(p.screenX, p.screenY, PARTICLES_PER_MOVE);
      maybeReveal();
    });
    function endDrag(ev) {
      dragging = false;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () { dragging = false; });
  }

  // ────────────────────────────────────────────────────────────────────
  // reveal / end-of-ticket
  // ────────────────────────────────────────────────────────────────────
  function reveal(i) {
    const cell = state.cells[i];
    cell.revealed = true;
    state.committed = -1;
    clearCommitted();
    const cellEl = grid.children[i];
    if (cellEl) cellEl.classList.add('revealed');

    if (cell.kind === 'bust') {
      // dark burst either way
      const r = cellEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      spawnBurst(cx, cy, 120, '#5a0010');
      shakeGrid();
      S('bust');

      // If the bank is full, give the player a chance to rub the bust back.
      if (dustBanked >= DUST_THRESHOLD) {
        state.preBustWinnings = state.winnings;
        state.bustCellIdx = i;
        state.rubMode = true;
        state.active = false;
        statusEl.textContent =
          'BUST — but the pile is deep enough to scoop. RUB IT BACK to undo, or BUY a fresh ticket to move on.';
        cashBtn.disabled = true;
        rubBtn.hidden = false;
        return;
      }
      state.bustCellIdx = i;

      state.winnings = 0;
      winEl.textContent = '0';
      endTicket('BUST — the pile woke up. Ticket void.');
      return;
    }

    const f = cell.face;
    const oldCount = state.faceCount[f];
    state.faceCount[f] = oldCount + 1;
    const newCount = state.faceCount[f];
    const oldPE = COMBO_PAIRS[Math.min(oldCount, COMBO_PAIRS.length - 1)];
    const newPE = COMBO_PAIRS[Math.min(newCount, COMBO_PAIRS.length - 1)];
    const deltaPE = newPE - oldPE;
    if (deltaPE > 0) {
      const pay = deltaPE * pairPayout(f, state.bet);
      state.winnings += pay;
      flashPay(cellEl, pay, newCount);
      S('pair', f);
      if (newCount >= 3) {
        setTimeout(function () { S('combo', newCount); }, 110);
      }
    } else {
      S('revealDie');
    }
    refreshMatchedGlow();
    renderReadout();

    // all revealed?
    let unrev = 0;
    for (let k = 0; k < state.cells.length; k++) if (!state.cells[k].revealed) unrev++;
    if (unrev === 0) {
      endTicket('Pile fully scratched. ' +
        (state.winnings > 0 ? 'Tap CASH OUT.' : 'Nothing left.'));
    }
  }

  function markCommitted(i) {
    for (let k = 0; k < grid.children.length; k++) {
      const el = grid.children[k];
      if (!el) continue;
      if (k === i) el.classList.add('committed');
      else el.classList.add('locked');
    }
  }
  function clearCommitted() {
    for (let k = 0; k < grid.children.length; k++) {
      const el = grid.children[k];
      if (!el) continue;
      el.classList.remove('committed');
      el.classList.remove('locked');
    }
  }

  // Mark every revealed die that's part of a 2+ same-face set with a
  // persistent green glow, so the player can see what they've banked.
  function refreshMatchedGlow() {
    if (!state.cells) return;
    for (let i = 0; i < state.cells.length; i++) {
      const c = state.cells[i];
      const el = grid.children[i];
      if (!el) continue;
      if (c.revealed && c.kind === 'die' && state.faceCount[c.face] >= 2) {
        el.classList.add('matched');
        const n = state.faceCount[c.face];
        el.classList.toggle('matched-combo', n >= 3);
      } else {
        el.classList.remove('matched');
        el.classList.remove('matched-combo');
      }
    }
  }

  function flashPay(cellEl, pay, count) {
    if (!cellEl) return;
    cellEl.classList.add('pair-flash');
    if (count >= 3) cellEl.classList.add('combo-flash');
    setTimeout(function () {
      cellEl.classList.remove('pair-flash');
      cellEl.classList.remove('combo-flash');
    }, 800);
    const f = document.createElement('span');
    f.className = 'bp-float-pay';
    if (count >= 3) f.classList.add('combo');
    const tag = count >= 3 ? (count + 'OAK · ') : '';
    f.textContent = tag + '+' + pay;
    cellEl.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1100);
  }

  function shakeGrid() {
    grid.classList.add('bust-shake');
    setTimeout(function () { grid.classList.remove('bust-shake'); }, 700);
  }

  function endTicket(msg) {
    state.active = false;
    // bustCellIdx is intentionally preserved if we just busted, so the
    // archive snapshot can stamp a BUST mark. cleared on next buy.
    statusEl.textContent = msg || '';
    cashBtn.disabled = true;
    if (rubBtn) rubBtn.hidden = true;
    // BUY stays available — clicking it prints a fresh ticket on top.
    // disable any remaining scratch canvases
    const canvases = grid.querySelectorAll('canvas.bp-scratch');
    for (let k = 0; k < canvases.length; k++) {
      canvases[k].style.pointerEvents = 'none';
    }
  }

  function renderReadout() {
    winEl.textContent = String(state.winnings);
    // can only cash out between cells — never mid-scratch of a committed one
    const committed = state.committed >= 0;
    cashBtn.disabled = !(state.active && state.winnings > 0 && !committed);
    if (state.active) {
      if (committed) {
        // status during commit is owned by the pointerdown handler
      } else {
        statusEl.textContent = state.winnings > 0
          ? 'Banked ' + state.winnings + ' · keep scratching or cash out.'
          : 'Drag to scratch.';
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // button handlers
  // ────────────────────────────────────────────────────────────────────
  function buyTicket() {
    if (state.rubbing) return; // wait for scoop animation to finish
    const bet = readBet();
    if (!window.Wallet) return;
    const bal = window.Wallet.getBalance();
    if (bet > bal) {
      statusEl.textContent = 'Not enough coins. Need ' + bet + '.';
      return;
    }
    if (window.Wallet.spend(bet) === false) {
      statusEl.textContent = 'Not enough coins. Need ' + bet + '.';
      return;
    }
    if (window.Child && typeof window.Child.recordPlay === 'function') {
      try { window.Child.recordPlay(); } catch (e) {}
    }

    // archive whatever ticket is currently on the press, then print fresh.
    if (state.cells && state.cells.length) {
      archiveCurrentTicket();
    }
    // exit any leftover bust-rub state so the new ticket prints cleanly
    state.rubMode = false;
    state.bustCellIdx = -1;
    state.preBustWinnings = 0;
    if (rubBtn) rubBtn.hidden = true;

    genTicket(bet);
    applyTicketSkin(state.skin);
    buildGrid();
    bumpGreeter();
    S('print');
    serialEl.textContent = '№ ' + String(state.serial).padStart(4, '0');
    winEl.textContent = '0';
    statusEl.textContent = 'Drag to scratch.';
    if (newBtn) newBtn.hidden = true;
    cashBtn.disabled = true;
  }

  function cashOut() {
    if (!state.active || state.winnings <= 0) return;
    if (state.committed >= 0) return; // locked-in mid-scratch
    const paid = state.winnings;
    window.Wallet.add(paid);
    S('cashout');
    endTicket('Cashed +' + paid + ' coins.');
  }

  function newTicket() {
    // idle / pre-first-ticket state (also used as "abandon current")
    if (state.cells && state.cells.length) {
      archiveCurrentTicket();
    }
    state.cells = [];
    state.winnings = 0;
    state.active = false;
    state.rubMode = false;
    state.bustCellIdx = -1;
    state.preBustWinnings = 0;
    if (rubBtn) rubBtn.hidden = true;
    clearTicketSkin();
    buildIdleGrid();
    winEl.textContent = '0';
    statusEl.textContent = 'Set wager. BUY a ticket.';
    if (newBtn) newBtn.hidden = true;
    cashBtn.disabled = true;
    serialEl.textContent = '№ —';
  }

  function sweep() {
    if (dustState.pile) dustState.pile.fill(0);
    dustState.parts.length = 0;
    dustBanked = 0;
    renderMeter();
    S('sweepFloor');
    const prev = statusEl.textContent;
    statusEl.textContent = 'Floor swept — bank cleared.';
    setTimeout(function () {
      if (statusEl.textContent === 'Floor swept — bank cleared.') statusEl.textContent = prev;
    }, 900);
  }

  function prefillPileFromBank() {
    if (!dustState.pile || dustBanked <= 0) return;
    const baseH = (dustBanked / DUST_THRESHOLD) * (dustState.height * 0.6);
    for (let c = 0; c < dustState.pile.length; c++) {
      dustState.pile[c] = baseH * (0.78 + Math.random() * 0.44);
    }
  }

  function renderMeter() {
    saveDust();
    if (!meterFill) return;
    const pct = Math.min(1, dustBanked / DUST_THRESHOLD);
    meterFill.style.width = (pct * 100).toFixed(1) + '%';
    if (meterLabel) {
      const full = dustBanked >= DUST_THRESHOLD;
      meterLabel.textContent = full
        ? 'BONE-DUST · FULL (scoop ready)'
        : 'BONE-DUST · ' + dustBanked + ' / ' + DUST_THRESHOLD;
      meterFill.classList.toggle('full', full);
    }
  }

  function rub() {
    if (!state.rubMode) return;
    if (dustBanked < DUST_THRESHOLD) return;
    if (state.rubbing) return;
    const i = state.bustCellIdx;
    if (i < 0) return;

    state.rubbing = true;
    rubBtn.hidden = true;
    newBtn.hidden = true;
    statusEl.textContent = 'Scooping the pile…';
    S('rubScoop');

    // hide the bust glyph during the swirl — looks like the dust is
    // covering it back up as it lands.
    const cellEl = grid.children[i];
    const faceEl = cellEl && cellEl.querySelector('.bp-face');
    if (faceEl) faceEl.style.opacity = '0';

    animateScoop(i, function onScoopDone() {
      finishRub(i);
    });
  }

  function animateScoop(cellIdx, onDone) {
    const cellEl = grid.children[cellIdx];
    if (!cellEl || !dustState.pile) { onDone(); return; }
    const r = cellEl.getBoundingClientRect();
    const yOffset = window.innerHeight - DUST_CANVAS_H;
    const targetX = r.left + r.width / 2;
    const targetYDust = r.top + r.height / 2 - yOffset; // in dust-canvas coords
    const cellRadius = Math.min(r.width, r.height) * 0.45;

    const startSnapshot = new Float32Array(dustState.pile);
    const startTime = performance.now();
    const DRAIN_MS = 1100;
    let lastSpawn = 0;
    let arrived = 0;
    let totalSpawned = 0;

    function step(now) {
      const t = Math.min(1, (now - startTime) / DRAIN_MS);
      // shrink the actual pile to (1-t) of snapshot
      for (let c = 0; c < dustState.pile.length; c++) {
        dustState.pile[c] = startSnapshot[c] * (1 - t);
      }
      // spawn ~3-5 spiral particles per frame while draining
      if (now - lastSpawn > 16) {
        lastSpawn = now;
        const burst = 4 + Math.floor(Math.random() * 3);
        for (let k = 0; k < burst && t < 0.95; k++) {
          spawnScoopParticle(startSnapshot, targetX, targetYDust, cellRadius, function () {
            arrived++;
          });
          totalSpawned++;
        }
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // pile drained; wait for in-flight spiral particles to land,
        // then a brief tail-spin pause, then sparkle.
        waitForArrival();
      }
    }

    function waitForArrival() {
      const deadline = performance.now() + 600;
      function check() {
        const now = performance.now();
        if (arrived >= totalSpawned * 0.92 || now > deadline) {
          onDone();
        } else {
          requestAnimationFrame(check);
        }
      }
      check();
    }

    requestAnimationFrame(step);
  }

  function spawnScoopParticle(snapshot, tx, ty, cellRadius, onArrive) {
    // pick a column weighted by the snapshot mass
    const len = snapshot.length;
    let total = 0;
    for (let i = 0; i < len; i++) total += snapshot[i];
    if (total < 0.5) return;
    let pick = Math.random() * total;
    let col = 0;
    for (let i = 0; i < len; i++) {
      pick -= snapshot[i];
      if (pick <= 0) { col = i; break; }
    }
    const sx = col * PILE_W + (Math.random() - 0.5) * PILE_W;
    const sy = dustState.height - snapshot[col] - 2 + Math.random() * 4;
    const dist = Math.hypot(tx - sx, ty - sy);
    dustState.parts.push({
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      color: pickBoneColor(),
      size: 1.1 + Math.random() * 1.6,
      target: {
        sx: sx,
        sy: sy,
        tx: tx + (Math.random() - 0.5) * cellRadius * 0.4,
        ty: ty + (Math.random() - 0.5) * cellRadius * 0.4,
        t0: performance.now(),
        dur: 520 + Math.random() * 360,
        r: Math.min(120, cellRadius * 1.6 + dist * 0.08),
        loops: 1.2 + Math.random() * 1.6,
        spin: Math.random() * Math.PI * 2,
        onArrive: onArrive,
      },
    });
  }

  function finishRub(cellIdx) {
    // clear any tail-end pile residue
    if (dustState.pile) dustState.pile.fill(0);
    // wipe non-targeted leftover particles, keep any still-in-flight just in case
    dustBanked = 0;
    renderMeter();

    // re-cover the cell with a soft fade-in + sparkle
    const cell = state.cells[cellIdx];
    cell.revealed = false;
    cell.scratched = 0;
    const cellEl = grid.children[cellIdx];
    if (cellEl) {
      cellEl.classList.remove('revealed');
      const canvas = cellEl.querySelector('canvas.bp-scratch');
      if (canvas) {
        canvas.style.pointerEvents = '';
        canvas.style.transition = 'none';
        canvas.style.opacity = '0';
        paintScratchSurface(canvas);
        // force a reflow so the next opacity change animates
        void canvas.offsetWidth;
        canvas.style.transition = 'opacity 0.32s ease-out';
        canvas.style.opacity = '1';
      }
      const faceEl = cellEl.querySelector('.bp-face');
      if (faceEl) faceEl.style.opacity = '';
      sparkleCell(cellEl);
    }

    // resume play
    state.winnings = state.preBustWinnings;
    state.preBustWinnings = 0;
    state.rubMode = false;
    state.rubbing = false;
    state.bustCellIdx = -1;
    state.active = true;
    state.committed = -1;
    clearCommitted();

    buyBtn.hidden = true;
    cashBtn.disabled = !(state.winnings > 0);
    statusEl.textContent = 'Rubbed back. Silver again. Pick another cell.';
    winEl.textContent = String(state.winnings);
  }

  function sparkleCell(cellEl) {
    cellEl.classList.add('sparkle-burst');
    S('rubSparkle');
    setTimeout(function () { cellEl.classList.remove('sparkle-burst'); }, 900);

    // a small cluster of bright gold specks fountains outward from cell
    // center, briefly visible on the dust canvas.
    const r = cellEl.getBoundingClientRect();
    const yOffset = window.innerHeight - DUST_CANVAS_H;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2 - yOffset;
    const colors = ['#f4e8c8', '#d4af37', '#ffe8a8', '#fff5d0', '#ecdfc4'];
    for (let k = 0; k < 36; k++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 4.5;
      dustState.parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.2 + Math.random() * 2.2,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // dust system
  // ────────────────────────────────────────────────────────────────────
  function dustResize() {
    const c = dustState.canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = DUST_CANVAS_H;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    dustState.ctx = c.getContext('2d');
    dustState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dustState.dpr = dpr;
    dustState.width = cssW;
    dustState.height = cssH;
    const cols = Math.ceil(cssW / PILE_W);
    const old = dustState.pile;
    const next = new Float32Array(cols);
    if (old) {
      const n = Math.min(old.length, next.length);
      for (let i = 0; i < n; i++) next[i] = old[i];
    }
    dustState.pile = next;
  }

  function spawnDust(screenX, screenY, n, tint) {
    // convert from page coords to dust-canvas coords:
    // dust canvas is fixed at bottom: dust(0,0) === screen(0, innerHeight - DUST_CANVAS_H)
    const yOffset = window.innerHeight - DUST_CANVAS_H;
    const sx = screenX;
    const sy = screenY - yOffset;
    for (let i = 0; i < n; i++) {
      dustState.parts.push({
        x: sx + (Math.random() - 0.5) * 6,
        y: sy + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 6,
        vy: -1 - Math.random() * 2.6,
        color: tint || pickBoneColor(),
        size: 1 + Math.random() * 1.8,
      });
    }
    if (dustState.parts.length > 1200) {
      dustState.parts.splice(0, dustState.parts.length - 1200);
    }
  }

  function spawnBurst(screenX, screenY, n, tint) {
    const yOffset = window.innerHeight - DUST_CANVAS_H;
    const sx = screenX;
    const sy = screenY - yOffset;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 7;
      dustState.parts.push({
        x: sx,
        y: sy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        color: tint || pickBoneColor(),
        size: 1 + Math.random() * 2.5,
      });
    }
  }

  function tickDust() {
    const W = dustState.width;
    const H = dustState.height;
    const pile = dustState.pile;
    if (!pile) return;
    const now = performance.now();
    const parts = dustState.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      // targeted particles (scoop/swirl) follow a parametric spiral; skip
      // gravity + pile collision entirely until they reach the target.
      if (p.target) {
        const t = Math.min(1, (now - p.target.t0) / p.target.dur);
        const ease = t * t * (3 - 2 * t);
        const bx = p.target.sx + (p.target.tx - p.target.sx) * ease;
        const by = p.target.sy + (p.target.ty - p.target.sy) * ease;
        const radius = (1 - t) * p.target.r;
        const angle = p.target.spin + t * Math.PI * 2 * p.target.loops;
        p.x = bx + Math.cos(angle) * radius;
        p.y = by + Math.sin(angle) * radius;
        if (t >= 1) {
          parts.splice(i, 1);
          if (typeof p.target.onArrive === 'function') p.target.onArrive();
        }
        continue;
      }
      p.vy += GRAVITY;
      p.vx *= DRIFT;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20 || p.x > W + 20) { parts.splice(i, 1); continue; }
      const col = Math.floor(p.x / PILE_W);
      if (col < 0 || col >= pile.length) { parts.splice(i, 1); continue; }
      const floorY = H - pile[col];
      if (p.y >= floorY) {
        // settle
        const add = p.size * 0.55;
        pile[col] += add;
        if (col > 0) pile[col - 1] += add * 0.25;
        if (col < pile.length - 1) pile[col + 1] += add * 0.25;
        // cap pile so it doesn't reach into the playfield
        if (pile[col] > H - 12) pile[col] = H - 12;
        parts.splice(i, 1);
        if (dustBanked < DUST_THRESHOLD) {
          dustBanked++;
          if ((dustBanked & 31) === 0) renderMeter();
          if (dustBanked === DUST_THRESHOLD) renderMeter();
        }
      }
    }
    // slow decay so piles don't grow forever
    for (let c = 0; c < pile.length; c++) {
      if (pile[c] > 0) pile[c] *= PILE_DECAY;
      if (pile[c] < 0.02) pile[c] = 0;
    }
  }

  function drawDust() {
    const ctx = dustState.ctx;
    if (!ctx) return;
    const W = dustState.width;
    const H = dustState.height;
    ctx.clearRect(0, 0, W, H);

    const pile = dustState.pile;
    if (pile) {
      // pile polygon
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let c = 0; c < pile.length; c++) {
        const x = c * PILE_W;
        const y = H - pile[c];
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, H - 100, 0, H);
      g.addColorStop(0, 'rgba(216, 200, 176, 0.95)');
      g.addColorStop(0.7, 'rgba(168, 152, 120, 0.95)');
      g.addColorStop(1, 'rgba(90, 78, 58, 0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 28, 16, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // flying particles
    const parts = dustState.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  function rafLoop() {
    tickDust();
    drawDust();
    requestAnimationFrame(rafLoop);
  }

  // ────────────────────────────────────────────────────────────────────
  // boot
  // ────────────────────────────────────────────────────────────────────
  function bindUI() {
    buyBtn.addEventListener('click', buyTicket);
    cashBtn.addEventListener('click', cashOut);
    newBtn.addEventListener('click', newTicket);
    sweepBtn.addEventListener('click', sweep);
    rubBtn.addEventListener('click', rub);
    maxBtn.addEventListener('click', function () {
      const bal = (window.Wallet && window.Wallet.getBalance()) || 1;
      betEl.value = String(Math.max(1, bal));
    });
    betEl.addEventListener('input', function () {
      const n = parseInt(betEl.value, 10);
      if (!isFinite(n) || n < 1) betEl.value = '1';
    });
    window.addEventListener('resize', dustResize);
  }

  function init() {
    grid = document.getElementById('bp-grid');
    winEl = document.getElementById('bp-winnings');
    statusEl = document.getElementById('bp-status');
    betEl = document.getElementById('bp-bet');
    maxBtn = document.getElementById('bp-bet-max');
    buyBtn = document.getElementById('bp-buy');
    cashBtn = document.getElementById('bp-cashout');
    newBtn = document.getElementById('bp-newticket');
    sweepBtn = document.getElementById('bp-sweep');
    rubBtn = document.getElementById('bp-rub');
    serialEl = document.getElementById('bp-serial');
    meterFill = document.getElementById('bp-meter-fill');
    meterLabel = document.getElementById('bp-meter-label');
    dustState.canvas = document.getElementById('bp-dust');
    ticketEl = document.getElementById('bp-ticket');
    ticketTitleEl = document.getElementById('bp-ticket-title');
    ticketSubEl = document.getElementById('bp-ticket-sub');
    cornerTL = document.getElementById('bp-corner-tl');
    cornerTR = document.getElementById('bp-corner-tr');
    cornerBL = document.getElementById('bp-corner-bl');
    cornerBR = document.getElementById('bp-corner-br');
    stackEl = document.getElementById('bp-stack');
    if (!grid || !dustState.canvas) return;
    loadDust();
    dustResize();
    prefillPileFromBank();
    bindUI();
    requestAnimationFrame(rafLoop);
    newTicket();
    renderMeter();
  }

  window.Bonepile = {
    buyTicket: buyTicket,
    cashOut: cashOut,
    newTicket: newTicket,
    sweep: sweep,
    rub: rub,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
