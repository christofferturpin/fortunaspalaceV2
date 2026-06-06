/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  VAN GO PAGE  —  bottle caps on a pizza-box lid: render, click, undo     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ bind difficulty buttons, wager input/MAX,    │
  │                          ├─ bind #go-begin, #go-pass, #go-takeback,      │
  │                          ├─ bind #go-resign, canvas click                │
  │                          ├─ Wallet.onChange → renderWagerUI              │
  │                          ├─ renderWagerUI; renderPaySummary              │
  │                          └─ renderBoard (empty pre-game)                 │
  │                                                                          │
  │   beginGame()                                                            │
  │     ├─ Wallet.spend(cost=ceil(stake*1.1))     ◄── abort if false         │
  │     ├─ Child.recordPlay                                                  │
  │     ├─ history=[ GoBoard.create() ]                                      │
  │     ├─ takebacksLeft=3                                                   │
  │     ├─ enable board controls; disable setup                              │
  │     └─ renderBoard; setStatus('Your move')                               │
  │                                                                          │
  │   canvasClick(evt)                                                       │
  │     ├─ guard playing && current.toMove==BLACK && !aiThinking             │
  │     ├─ pixel→(r,c) snap; cell = idx(r,c)                                 │
  │     ├─ next = GoBoard.tryPlay(current, cell)                             │
  │     ├─ illegal → flashCell(cell) + setStatus reason                      │
  │     └─ legal → pushHistory(next); renderBoard; maybeEndGame || aiTurn    │
  │                                                                          │
  │   aiTurn()                                                               │
  │     ├─ aiThinking=true; setStatus('The house considers…')                │
  │     ├─ setTimeout 40-220ms (perceived thought)                           │
  │     ├─ move = GoAI.chooseMove(current, level)                            │
  │     ├─ move==AI.RESIGN ──► endGame(PLAYER, 'ai_resign'); return          │
  │     ├─ next = GoBoard.tryPlay(current, move) || GoBoard.pass(current)    │
  │     ├─ pushHistory(next); renderBoard; maybeEndGame ──► return           │
  │     ├─ pairCount++; remaining = nextBumpAt - pairCount                   │
  │     ├─ remaining ∈ {1,2,3} ──► flashBumpOverlay('BUMP IN N')             │
  │     ├─ remaining ≤ 0 ──► flashBumpOverlay('BUMP!')+shakeBody+performBump │
  │     └─ setStatus('Your move')                                            │
  │                                                                          │
  │   takeback()                                                             │
  │     ├─ guard takebacksLeft>0 && playing                                  │
  │     ├─ history.pop twice (AI move + player move) → restore prior         │
  │     ├─ takebacksLeft--                                                   │
  │     └─ renderBoard; refresh buttons                                      │
  │                                                                          │
  │   passMove()/resign()                                                    │
  │     ├─ pass: push GoBoard.pass(current); maybeEndGame || aiTurn          │
  │     └─ resign: endGame('white', 'resign')                                │
  │                                                                          │
  │   maybeEndGame() → bool                                                  │
  │     ├─ isGameOver(current) → endGame from score                          │
  │     └─ ret false otherwise                                               │
  │                                                                          │
  │   endGame(winnerColor, reason)                                           │
  │     ├─ playing=false                                                     │
  │     ├─ if winner==BLACK: Wallet.add(stake * WIN_MULT[level])             │
  │     ├─ render result panel (score breakdown)                             │
  │     └─ re-enable setup, disable board controls                           │
  │                                                                          │
  │   renderBoard() draws gridlines, hoshi, control overlay (toggleable),    │
  │     stones, last-move marker, hover ghost.                               │
  │                                                                          │
  │   Control overlay (showControl):                                         │
  │     definite territory (Tromp-Taylor) ── strong tinted diamond           │
  │     influence-leaning empty point ───── soft tinted diamond              │
  │     refreshEstimate() pushes black/white/dame counts into status row.    │
  │                                                                          │
  │   Bump ("pothole") system:                                               │
  │     Every 5-10 completed pairs (player+AI), the van hits a bump.         │
  │     Warnings are pair-paced, not timed: at 3, 2, and 1 pairs before      │
  │     the impact, a full-page #go-bump-flash overlay pulses "BUMP IN N"    │
  │     in amber — player keeps playing normally underneath. On the          │
  │     trigger pair, an impact flash ("BUMP!", red) fires and the body      │
  │     gets a .go-bumping shake (mountain stays put — it's on html).        │
  │     planBump() picks up to 3 cap-moves per color (one step in any        │
  │     8-way direction into an empty cell, no collisions), trimmed so       │
  │     both sides move the same number. startBumpAnimation walks the        │
  │     sequence one cap at a time (B, W, B, W …) with an amber highlight    │
  │     ring + glow. Final state pushed as a bump entry (isBumpResult).      │
  │     Player input is locked during the animation only. Takeback skips     │
  │     bump entries when popping.                                           │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet, window.Child, window.GoBoard,            │
  │     window.GoAI                                                          │
  │   Assets: preloads ../assets/images/bottlecapred.png (PLAYER) and        │
  │     ../assets/images/bottlecapblue.png (HOUSE) as cap bitmaps (drawn in  │
  │     place of the procedural caps once each loads).                       │
  │     Also preloads ../assets/images/cardboard.jpeg as the board surface   │
  │     (center-square cropped onto the 540×540 canvas).                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  KOMI=6.5; COST_MULT=1.1; WIN_MULT={1:2,2:4,3:8,4:16}; MAX_TAKEBACKS=3; DIFF_NAME={1:'Lady in Waiting',2:'Consort',3:'High-Consort',4:'Emperess'} (matches .go-knob-mark-name in HTML); MOUNTAIN_DURATIONS={1:'90s',2:'45s',3:'18s',4:'7s'}
  applyLevel(lv): set level, write data-level on #go-difficulty (rotates chrome dial via CSS), sync aria-checked on each .go-knob-mark, set --vg-mountain-duration on documentElement (higher rank → faster scroll), renderPaySummary
  CAPS={PLAYER:{red brand, image:'../assets/images/bottlecapred.png'},HOUSE:{blue brand, image:'../assets/images/bottlecapblue.png'}} (face/faceLight/faceDark/crimp/label/accent/letter/letterColor + optional image URL)
  CAP_IMAGES={color→{img:HTMLImageElement, ready:bool}}: preloaded on script parse; on load, redraw if canvas ready
  capRotation(i,color)→radians: stable hash so a placed cap looks identical across redraws / takebacks
  state: level=1, stake=5, playing=F, aiThinking=F, history=[], takebacksLeft=3, hoverCell=-1, showControl=T, pairCount=0, nextBumpAt=rollBumpInterval(), bumpAnimation=null, activeCol=-1, activeRow=-1 (sequencer playhead — one axis at a time; col phase sweeps 8→0, row phase sweeps 0→8), rootOffset=0 (semitones above A, cycled by #go-key), KEY_NAMES=['A','A#','B','C',…,'G#'], bpm=90 (#go-bpm 40-240), tailPieces=10 (#go-pieces 1-81 — rolling-tail length feeding the pad)
  DIV_MULTS=[1,0.75,0.5,0.375,0.25] (quarter→dotted-8→8→dotted-16→16); DIV_MOVES_PER_BAND=16 (moveNum/band → division index, clamped at 16ths)
  BUMP_MIN_PAIRS=5; BUMP_MAX_PAIRS=10; BUMP_PIECES_MAX=3; BUMP_DURATION_PER_PIECE_MS=360; BUMP_PAUSE_BETWEEN_MS=130; BUMP_DIRS=8-way
  flashBumpOverlay(text, impact?): set #go-bump-flash text, toggle .go-bump-flash-impact, restart .show animation via remove→reflow→add
  shakeBody(): toggle body.go-bumping (animation: vg-bump-shake .62s), strip class after 700ms
  planBumpForColor(cells,color,maxCount,blocked)→moves[]: shuffle stones; for each, try shuffled directions; pick first empty-destination not colliding w/ used or blocked
  planBump(cells)→[B,W,B,W,…]: target=1+rnd(3); plan PLAYER moves; block their src+dest; plan HOUSE moves; trim to min count; interleave
  startBumpAnimation(initialCells, moves, onComplete): live Int8Array copy; rAF loop per move, eased interp; commit cell change on t=1; onComplete(finalCells) when queue empty
  performBump(): seq=planBump(cur.cells); seq empty→reset counter+noop; else startBumpAnimation→on complete push isBumpResult state, reset pairCount+nextBumpAt
  recomputePairCount(): walk history backwards to last bump; pairCount=⌊moves/2⌋
  current()→history[last]
  cellGeom()→{cs:cellSize, pad:padding}: based on canvas size & SIZE
  pixelToCell(x,y)→i|-1: nearest intersection within radius cs*0.45
  drawBoard(): drawCardboardSurface(w)+hand-drawn sharpie grid (drawHandDrawnLine ×18 lines, deterministic seeds)+sequencer playhead (translucent amber strip: vertical on activeCol during col-phase 8→0, horizontal on activeRow during row-phase 0→8)+fuzzy hoshi+drawControlOverlay(if on)+hover ghost (skipped during bump)+drawCap×stones (skip animating piece's source; cells from bumpAnimation.cells if active)+animated bump piece w/ amber ring+glow at interp pos+lastCap marker (suppressed during bump): if opp move → big amber halo (shadowBlur 38 outer + shadowBlur 18 inner bright ring); else small subtle ring on player's own
  drawCardboardSurface(w): if BOARD_IMG.ready→drawImage center-square cropped to w×w; else flat #c4a070 fill; +drawPizzeriaLogo (faded chain badge upper-left)+drawPizzaScrawl (random pick from PIZZAS, marker upper-right)+edge vignette
  PIZZAS=[{name,tops}×4]; SCRAWL_SPOTS=[{x,y}×4 marginal anchors]; PIZZA_PICK / SCRAWL_SPOT / SCRAWL_ROT all randomized at module load (ROT in ±0.21 rad ≈ ±12°)
  drawPizzaScrawl(w): translate (w·SCRAWL_SPOT.x, w·SCRAWL_SPOT.y), rotate SCRAWL_ROT, "Permanent Marker" font; name line + 1-2 topping lines split on \n
  drawHandDrawnLine(x1,y1,x2,y2,seed): 18 segments along the line w/ sine-tapered perpendicular jitter (peaks mid-line, ~zero at tips), plus startOver/endOver tip overshoot. round caps, deterministic via hash01(seed,step)
  hash01(seed,step)→[0,1): tiny LCG for deterministic per-line/per-step wobble
  drawCap(x,y,color,r,i): cast shadow; rotate by capRotation; if CAP_IMAGES[color].ready→drawImage at r*2 and return; else procedural — domed metal disk gradient, 21 crimped rim scores, inset label disk, brand spot+letter, specular highlight
  drawControlOverlay(state,cs,pad): est=B.controlEstimate; ∀empty i: definite→strong diamond, |inf|>thr→soft diamond (red for player, blue for opp)
  refreshEstimate(): est=controlEstimate; #go-est-b/w/d ← red/blue/dame
  drawStone(ctx,x,y,color,r): radial gradient + outline
  flashCell(i,reason): brief red overlay + set status
  pushHistory(next): history.push(next); refreshUI
  refreshUI(): #go-tomove, #go-captures-*, #go-takebacks-left, button enabled-states; renderBoard
  beginGame(): cost=ceil(stake*COST_MULT); Wallet.spend(cost)→abort; Child.recordPlay; history=[GoBoard.create()]; takebacksLeft=3; playing=T; refresh; status='Your move'
  canvasClick(e): playing && toMove==BLACK && !aiThinking; i=pixelToCell; next=GoBoard.tryPlay(cur,i); !next→flashCell+'illegal'; pushHistory; if !endGame→setTimeout(aiTurn,…)
  aiTurn() (async): aiThinking=T; status='thinking'; setTimeout: capture token=++aiThinkToken; await GoAI.chooseMove(cur,level) (yields every ~20 sims so audio keeps playing); on resolve: if token!=aiThinkToken||!playing→return (stale); m==AI.RESIGN→endGame(PLAYER,'ai_resign')+return; else next=tryPlay||pass; pushHistory; aiThinking=F; endGame? else pairCount++; remaining=nextBumpAt-pairCount; remaining∈{1,2,3}→flashBumpOverlay('BUMP IN '+remaining); remaining≤0→flashBumpOverlay+shakeBody+performBump+return; else status='Your move'
  aiThinkToken: monotonically increments on each AI turn AND on beginGame / takeback / endGame — any awaited chooseMove that resolves with a stale token noops
  takeback(): guard !locked && tbleft>0; walk history backwards, count non-bump entries; truncate at index of 2nd non-bump; tbleft--; recomputePairCount; refresh (bumps below the popped pair stay in place)
  passMove(): pushHistory(GoBoard.pass(cur)); endGame? else aiTurn()
  resign(): endGame(WHITE,'resign')
  maybeEndGame()→bool: isGameOver(cur)? endGame(score.winner,'pass'):F
  endGame(winner,reason): playing=F; if winner==BLACK: payout=stake*WIN_MULT[level]; Wallet.add(payout); result panel w/ score breakdown (suppressed for ai_resign); lock board controls; unlock setup. reasons: 'pass' (two passes), 'resign' (player folded), 'ai_resign' (AI conceded losing position)
  renderWagerUI(): max=Wallet.bal/COST_MULT|0; clamp stake; #go-pay-summary text
  bindDifficulty(): #go-difficulty knob; click on .go-knob-mark→applyLevel; pointerdown on .go-knob→drag rotation (atan2 cursor→knob center +90°, clamp [-90,+90]); pointerup→snap to nearest of -90/-30/+30/+90 → applyLevel; PointerEvent preferred (mouse+touch+pen), falls back to mouse events
  LEVEL_ANGLES={1:-90,2:-30,3:30,4:90}; ANGLE_LEVELS=[{lv,ang}×4]; cursorDialAngle(e,knobEl)→deg in [-90,90]; nearestLevelForAngle(ang)→lv
  recentlyPlacedCells(maxN=10)→int[]: walk history backwards; per (prev→curr) transition collect new fills (1 per move, several per bump); skip captured/vacated; ret up to maxN cell indices still on board
  buildSequencerCells()→Int8Array(81): cur=bumpAnimation?bumpAnimation.cells:current().cells; out[k]=cur[k] for k in recentlyPlacedCells(10); other cells 0
  noteDivMult(mn)→mult: DIV_MULTS[min(4, floor(mn/DIV_MOVES_PER_BAND))]
  getStepMs()→ms: max(40, 60000/bpm * noteDivMult(moveNum)) — BPM is user-set; moveNum now picks note division (wholes at the opening, shortening to 16ths in the endgame), not raw tempo
  clampInputInt(el, fallback)→int: parseInt(el.value); empty/NaN→fallback; clamp to el.min/max
  init(): grab DOM; bind everything (incl #go-show-control→toggle, #go-bpm/#go-pieces→input+change→clamp+update bpm/tailPieces live); Wallet.onChange→renderWagerUI; GoSequencer.init(buildSequencerCells, onStep(idx,axis)→{axis==='row'?(activeCol=-1,activeRow=idx):(activeRow=-1,activeCol=idx)}+drawBoard, getStepMs, ()=>level, ()=>aiThinking (fires stutter-snare triplet per step while AI thinks)); arm GoSequencer.start() on first click/keydown/pointerdown (audio gesture gate); first render; show empty board. (Translate trap: handled entirely in translate-trap.js — swaps chrome + rules body to Spanish synth manual when Chrome auto-translates the zh-CN page.)
  exports: DOMContentLoaded→init
*/
(function (global) {
  const B = global.GoBoard;
  const AI = global.GoAI;
  if (!B || !AI) { console.warn('Go page.js: GoBoard / GoAI not loaded'); return; }

  const KOMI = 6.5;
  const COST_MULT = 1.1;
  const WIN_MULT = { 1: 2, 2: 4, 3: 8, 4: 16 };
  // Matches the rank labels in pages/go.html (.go-knob-mark-name spans).
  const DIFF_NAME = { 1: 'Lady in Waiting', 2: 'Consort', 3: 'High-Consort', 4: 'Emperess' };
  // Mountain scroll duration per knob position (higher rank → faster scroll).
  // Written to documentElement style as --vg-mountain-duration when the
  // level changes; CSS in html::before consumes it via var().
  const MOUNTAIN_DURATIONS = { 1: '90s', 2: '45s', 3: '18s', 4: '7s' };
  const MAX_TAKEBACKS = 3;
  const PLAYER = B.BLACK;
  const HOUSE  = B.WHITE;

  // ── Bump ("pothole") system ────────────────────────────────────────────
  // Every BUMP_MIN..BUMP_MAX completed turn pairs, the van hits a bump:
  // 1-3 caps of each color slide one cell in an 8-way direction (orthogonal
  // or diagonal) into an empty square. Animated one at a time, alternating
  // BLACK then WHITE. Player is given a 3-second warning first.
  const BUMP_MIN_PAIRS = 5;
  const BUMP_MAX_PAIRS = 10;
  const BUMP_PIECES_MAX = 3;
  const BUMP_DURATION_PER_PIECE_MS = 360;
  const BUMP_PAUSE_BETWEEN_MS = 130;
  const BUMP_DIRS = [
    [-1,  0], [ 1,  0], [ 0, -1], [ 0,  1],     // orthogonal
    [-1, -1], [-1,  1], [ 1, -1], [ 1,  1],     // diagonal
  ];
  function rollBumpInterval() {
    return BUMP_MIN_PAIRS + Math.floor(Math.random() * (BUMP_MAX_PAIRS - BUMP_MIN_PAIRS + 1));
  }


  // Bottle-cap brand swatches. PLAYER plays the red caps (your half of the
  // milk crate); HOUSE plays the blue ones (bandmate's stash). When a color
  // has an `image` URL, drawCap blits that bitmap instead of drawing a cap
  // procedurally — same shadow, same per-cell rotation. The non-image
  // fields below remain as a fallback rendering if the bitmap fails to load.
  const CAPS = {
    [PLAYER]: {
      image:       '../assets/images/bottlecapred.png',
      face:        '#b41822',
      faceLight:   '#e84a55',
      faceDark:    '#5a0010',
      crimp:       '#3a0008',
      label:       '#f4e8c8',
      accent:      '#5a0010',
      letter:      'R',
      letterColor: '#5a0010',
    },
    [HOUSE]: {
      image:       '../assets/images/bottlecapblue.png',
      face:        '#cabc88',
      faceLight:   '#f0e8c8',
      faceDark:    '#6a5e38',
      crimp:       '#2a2010',
      label:       '#1c2860',
      accent:      '#1c2860',
      letter:      '8',
      letterColor: '#f0e8c8',
    },
  };

  // Per-color image cache. Each entry = { img: HTMLImageElement, ready: bool }.
  // Drawing falls back to the procedural cap until ready becomes true.
  const CAP_IMAGES = {};
  (function preloadCapImages() {
    for (const color of [PLAYER, HOUSE]) {
      const url = CAPS[color] && CAPS[color].image;
      if (!url) continue;
      const img = new Image();
      const entry = { img, ready: false };
      img.addEventListener('load', () => {
        entry.ready = true;
        // Repaint once if the board is already up; harmless otherwise.
        if (canvas && ctx) drawBoard();
      });
      img.addEventListener('error', () => {
        console.warn('Van Go: failed to load cap image at ' + url);
      });
      img.src = url;
      CAP_IMAGES[color] = entry;
    }
  })();

  // Board-surface image (the cardboard from a pizza-box flap). Loaded once
  // on script parse; drawBoard uses it when ready, falls back to a flat
  // kraft-tan fill until then. ~24MB asset — first paint may lag.
  const BOARD_IMG = { img: new Image(), ready: false };
  BOARD_IMG.img.addEventListener('load', () => {
    BOARD_IMG.ready = true;
    if (canvas && ctx) drawBoard();
  });
  BOARD_IMG.img.addEventListener('error', () => {
    console.warn('Van Go: failed to load board image at ../assets/images/cardboard.jpeg');
  });
  BOARD_IMG.img.src = '../assets/images/cardboard.jpeg';

  // Bottle caps drawn from a coffee can — deterministic per-cell rotation so
  // the same cap always looks the same (survives takeback / redraw).
  function capRotation(i, color) {
    const seed = (i * 9301 + color * 49297 + 7) % 233280;
    return (seed / 233280) * Math.PI * 2;
  }

  // ─── Per-game runtime state ──────────────────────────────────────────────
  let level = 1;
  let stake = 5;
  let playing = false;
  let aiThinking = false;
  let history = [B.create()];
  let takebacksLeft = MAX_TAKEBACKS;
  let hoverCell = -1;
  let lastCommittedCost = 0; // for display only
  let showControl = true;
  // Bump runtime state
  let pairCount = 0;              // completed pairs since the last bump
  let nextBumpAt = rollBumpInterval();
  let bumpAnimation = null;       // { cells, queue, current, startTime, … } during animation
  let activeCol = -1;             // vertical playhead column (0..8, -1 = none)
  let activeRow = -1;             // horizontal playhead row (0..8, -1 = none)
  let aiThinkToken = 0;           // incremented per AI turn; lets stale Promise resolutions noop
  let rootOffset = 0;             // semitones above A — cycles 0..11 via KEY button (mode locked to minor pent)
  const KEY_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
  // ── Sequencer user-set knobs ──────────────────────────────────────────
  // BPM is the fundamental pulse the sequencer locks to (#go-bpm input);
  // moveNum no longer controls tempo — it now picks the note division
  // (see noteDivMult below) so the step shortens from whole notes at the
  // opening to 16ths in the deep endgame against the user-set beat.
  // tailPieces caps how many of the most-recent placements still sing
  // (#go-pieces input — was a hardcoded 10).
  let bpm = 90;
  let tailPieces = 10;
  // Note-division progression: every 16 moves the step duration shortens.
  // Old curve started at WHOLE notes (×4), which made each opening tick last
  // 2.6s at bpm=90 — and made the BPM knob feel inert (you were waiting on
  // the division, not the beat). Now the opening sits at quarter notes (×1)
  // so the user-set BPM is what you actually hear, and the endgame still
  // tightens down to 16ths against any BPM.
  //   0..15 quarters, 16..31 dotted-8ths, 32..47 8ths, 48..63 dotted-16ths, 64+ 16ths.
  const DIV_MULTS = [1, 0.75, 0.5, 0.375, 0.25];
  const DIV_MOVES_PER_BAND = 16;

  // ─── DOM cache ───────────────────────────────────────────────────────────
  let canvas, ctx;
  let elStatus, elResult, elTomove, elCapB, elCapW, elTbLeft;
  let elWager, elWagerMax, elBegin, elPass, elTakeback, elResign;
  let elDiffGrid, elPaySummary;
  let elShowControl, elEstB, elEstW, elEstD;
  let elBumpFlash;
  let elKey;
  let elBpm, elPieces;

  function current() { return history[history.length - 1]; }

  // ─── Canvas geometry ─────────────────────────────────────────────────────
  function cellGeom() {
    // Inner padding so edge stones don't clip; cellSize is intersection spacing.
    const w = canvas.width;
    const pad = Math.round(w * 0.06);
    const cs = (w - pad * 2) / (B.SIZE - 1);
    return { cs, pad, w };
  }

  function cellToXY(i) {
    const { cs, pad } = cellGeom();
    const r = (i / B.SIZE) | 0;
    const c = i % B.SIZE;
    return { x: pad + c * cs, y: pad + r * cs };
  }

  function pixelToCell(px, py) {
    const { cs, pad } = cellGeom();
    const rNum = (py - pad) / cs;
    const cNum = (px - pad) / cs;
    const r = Math.round(rNum);
    const c = Math.round(cNum);
    if (r < 0 || r >= B.SIZE || c < 0 || c >= B.SIZE) return -1;
    // Only register click if reasonably close to the intersection.
    const dx = cNum - c, dy = rNum - r;
    if (Math.hypot(dx, dy) * cs > cs * 0.45) return -1;
    return B.idx(r, c);
  }

  // ─── Rendering ───────────────────────────────────────────────────────────
  function drawBoard() {
    const { cs, pad, w } = cellGeom();
    const s = current();
    // While a bump is animating, draw from the bump's live cells instead of
    // the locked history state so each step's commit shows immediately.
    const liveCells = bumpAnimation ? bumpAnimation.cells : s.cells;
    const animMove  = bumpAnimation && bumpAnimation.current;

    // The board face is the cardboard.jpeg image — center-square cropped
    // and stretched to the canvas. Falls back to a flat kraft-tan fill
    // until the image (which is hefty) finishes loading.
    drawCardboardSurface(w);

    // Sharpie grid lines — hand-drawn wobbly strokes (not perfect rules).
    const sharpieEnd1 = pad;
    const sharpieEnd2 = pad + (B.SIZE - 1) * cs;
    ctx.strokeStyle = '#120608';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < B.SIZE; i++) {
      const p = pad + i * cs;
      // horizontal line, seed by row index
      drawHandDrawnLine(sharpieEnd1, p, sharpieEnd2, p, 17 + i * 31);
      // vertical line, seed offset so it doesn't mirror the horizontal jitter
      drawHandDrawnLine(p, sharpieEnd1, p, sharpieEnd2, 401 + i * 41);
    }

    // Sequencer playhead — translucent glow on the currently-sounding
    // line. The sweep alternates: vertical strip while reading columns
    // right→left, then horizontal strip while reading rows top→bottom.
    if (activeCol >= 0 && activeCol < B.SIZE) {
      const stripCx = pad + activeCol * cs;
      const stripHalf = cs * 0.50;
      const yTop = pad - cs * 0.45;
      const yBot = pad + (B.SIZE - 1) * cs + cs * 0.45;
      const grad = ctx.createLinearGradient(stripCx - stripHalf, 0, stripCx + stripHalf, 0);
      grad.addColorStop(0,   'rgba(255, 184, 96, 0)');
      grad.addColorStop(0.5, 'rgba(255, 184, 96, 0.32)');
      grad.addColorStop(1,   'rgba(255, 184, 96, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(stripCx - stripHalf, yTop, stripHalf * 2, yBot - yTop);
    } else if (activeRow >= 0 && activeRow < B.SIZE) {
      const stripCy = pad + activeRow * cs;
      const stripHalf = cs * 0.50;
      const xLeft  = pad - cs * 0.45;
      const xRight = pad + (B.SIZE - 1) * cs + cs * 0.45;
      const grad = ctx.createLinearGradient(0, stripCy - stripHalf, 0, stripCy + stripHalf);
      grad.addColorStop(0,   'rgba(255, 184, 96, 0)');
      grad.addColorStop(0.5, 'rgba(255, 184, 96, 0.32)');
      grad.addColorStop(1,   'rgba(255, 184, 96, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(xLeft, stripCy - stripHalf, xRight - xLeft, stripHalf * 2);
    }

    // Hoshi (star points) — 9x9 conventional: (2,2)(2,6)(6,2)(6,6) + center.
    // Drawn as small fuzzy sharpie blots, not crisp dots.
    [[2,2],[2,6],[6,2],[6,6],[4,4]].forEach(([r, c], k) => {
      const x = pad + c * cs, y = pad + r * cs;
      // soft halo
      ctx.fillStyle = 'rgba(18, 6, 8, 0.45)';
      ctx.beginPath();
      ctx.arc(x + (hash01(91 + k, 0) - 0.5) * 1.2,
              y + (hash01(91 + k, 1) - 0.5) * 1.2,
              4.4, 0, Math.PI * 2);
      ctx.fill();
      // dark center
      ctx.fillStyle = '#0a0408';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Control overlay (under the hover ghost + stones, so they sit on top).
    if (showControl) drawControlOverlay(s, cs, pad);

    // Hover ghost (only when it's the player's turn, no bump pending).
    if (playing && !aiThinking && !bumpAnimation &&
        s.toMove === PLAYER && hoverCell >= 0 &&
        s.cells[hoverCell] === B.EMPTY && B.legalMove(s, hoverCell)) {
      const { x, y } = cellToXY(hoverCell);
      ctx.globalAlpha = 0.35;
      drawCap(x, y, PLAYER, cs * 0.46, hoverCell);
      ctx.globalAlpha = 1;
    }

    // Caps on the board (from live cells if mid-bump, else current state).
    // Skip the source cell of the currently-animating bump move — that
    // cap is drawn separately at interpolated position below.
    const skipCell = animMove ? animMove.src : -1;
    for (let i = 0; i < B.N; i++) {
      if (i === skipCell) continue;
      const v = liveCells[i];
      if (v === B.EMPTY) continue;
      const { x, y } = cellToXY(i);
      drawCap(x, y, v, cs * 0.46, i);
    }

    // Animated bump piece — interpolated position, amber highlight ring.
    if (animMove) {
      const elapsed = performance.now() - bumpAnimation.startTime;
      const t = Math.min(1, elapsed / bumpAnimation.duration);
      // Ease-in-out cubic so the slide eases out of the cell and into the next.
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const p1 = cellToXY(animMove.src);
      const p2 = cellToXY(animMove.dest);
      const x = p1.x + (p2.x - p1.x) * eased;
      const y = p1.y + (p2.y - p1.y) * eased;
      // Highlight ring + amber glow under the moving cap.
      ctx.save();
      ctx.shadowColor = 'rgba(255, 208, 120, 0.85)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffd078';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.56, 0, Math.PI * 2);
      ctx.stroke();
      drawCap(x, y, animMove.color, cs * 0.46, animMove.src);
      ctx.restore();
    }

    // Last-cap marker — subtle ring on the player's own move; a big
    // shadow-blur halo on the opponent's so you immediately see where
    // they just played. Both suppressed mid-bump (the moving piece has
    // its own amber highlight).
    if (!bumpAnimation && s.lastMove != null && s.lastMove !== B.PASS &&
        s.cells[s.lastMove] !== B.EMPTY) {
      const { x, y } = cellToXY(s.lastMove);
      const oppMove = s.cells[s.lastMove] === HOUSE;
      if (oppMove) {
        ctx.save();
        // Outer soft halo — wide shadowBlur, faint stroke. This is the
        // part that catches the eye from across the board.
        ctx.shadowColor = 'rgba(255, 208, 120, 0.95)';
        ctx.shadowBlur = 38;
        ctx.strokeStyle = 'rgba(255, 224, 144, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, cs * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        // Inner bright ring sitting just outside the cap edge.
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#ffe49a';
        ctx.lineWidth = 3.5;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(x, y, cs * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        // Player's own move — quiet acknowledgement.
        ctx.strokeStyle = '#ffd078';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(x, y, cs * 0.52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── Cardboard surface ──────────────────────────────────────────────────
  // The board face is cardboard.jpeg (8192×3584) cropped to a centered
  // square so detail isn't stretched. Falls back to a flat kraft-tan rect
  // while the image loads — the asset is hefty so first paint may lag.
  // The "Large Luigi's" pizzeria logo is painted over the cardboard but
  // before the sharpie grid; the order-taker's pizza scrawl sits in the
  // upper-right corner, also pre-grid (the kid sharpied a Go board over
  // an already-used box). Layer order:
  //   cardboard image → Luigi's badge → pizza-order scrawl → vignette
  //   → sharpie grid (drawn by drawBoard, on top of everything here).
  function drawCardboardSurface(w) {
    if (BOARD_IMG.ready) {
      const img = BOARD_IMG.img;
      const sw = Math.min(img.width, img.height);
      const sx = (img.width  - sw) / 2;
      const sy = (img.height - sw) / 2;
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, w, w);
    } else {
      ctx.fillStyle = '#c4a070';
      ctx.fillRect(0, 0, w, w);
    }
    // Faded pizzeria badge in the upper-left.
    drawPizzeriaLogo(w * 0.17, w * 0.14, w * 0.105);
    // Order-taker's scrawl in the upper-right (single random pick per page load).
    drawPizzaScrawl(w);
    // Edge vignette — sells the curl of the box edges in the dim van.
    const v = ctx.createRadialGradient(w / 2, w / 2, w * 0.34, w / 2, w / 2, w * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20, 8, 4, 0.32)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, w);
  }

  // Pizza-order pool — randomly picked once per page load. Toppings can
  // include \n to wrap when the ingredient list is too long for one line.
  const PIZZAS = [
    { name: 'THE MELTY MEDITERRANEAN',
      tops: 'feta · spinach · artichoke · garlic' },
    { name: 'OLD NEW YORKER',
      tops: 'cheese' },
    { name: 'THE OLD QUEEN',
      tops: 'old-world pepperoni · hot honey' },
    { name: 'THE MOTHERCLUCKER',
      tops: 'buffalo chicken · celery · 1 wing\nbuf sauce · blue cheese' },
  ];
  // Four marginal spots around the playing field (clear of the Tony's
  // badge in the upper-left and the grid in the center). Lower spots
  // are placed high enough that wrapped topping lines still fit on the
  // canvas. The scrawl tilts to a random angle in ±12°.
  const SCRAWL_SPOTS = [
    { x: 0.74, y: 0.10 },   // upper-right (opposite the Luigi's badge)
    { x: 0.30, y: 0.86 },   // lower-left
    { x: 0.70, y: 0.86 },   // lower-right
    { x: 0.50, y: 0.88 },   // lower-center
  ];
  const PIZZA_PICK  = PIZZAS[Math.floor(Math.random() * PIZZAS.length)];
  const SCRAWL_SPOT = SCRAWL_SPOTS[Math.floor(Math.random() * SCRAWL_SPOTS.length)];
  const SCRAWL_ROT  = (Math.random() - 0.5) * 0.42;  // ±0.21 rad ≈ ±12°

  // Sharpie scrawl: pizza name + topping list, placed at a random one of
  // the marginal spots, rotated at a random angle. Permanent Marker font
  // for hand-drawn weight; both name and toppings rotate together so the
  // scrawl reads as one continuous handwritten note.
  function drawPizzaScrawl(w) {
    ctx.save();
    ctx.translate(w * SCRAWL_SPOT.x, w * SCRAWL_SPOT.y);
    ctx.rotate(SCRAWL_ROT);
    ctx.fillStyle = '#1a0a04';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameSize    = Math.round(w * 0.032);
    const toppingSize = Math.round(w * 0.024);
    const lineGap     = Math.round(w * 0.030);
    ctx.font = nameSize + 'px "Permanent Marker", "Special Elite", cursive';
    ctx.fillText(PIZZA_PICK.name, 0, 0);
    ctx.font = toppingSize + 'px "Permanent Marker", "Special Elite", cursive';
    const toppingLines = PIZZA_PICK.tops.split('\n');
    for (let i = 0; i < toppingLines.length; i++) {
      ctx.fillText(toppingLines[i], 0, lineGap + i * toppingSize * 1.15);
    }
    ctx.restore();
  }

  // Faded circular pizza-chain badge: green-red Italian-pizzeria vibe,
  // arched "LARGE LUIGI'S" on top, "PIZZA & PASTA" stamp in the middle,
  // with a smudge wiping out a quarter of it.
  function drawPizzeriaLogo(cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.42;

    // Outer green rim (Luigi's color)
    ctx.strokeStyle = '#2a6a28';
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thin red ring (Italian flag accent)
    ctx.strokeStyle = '#8c2418';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    // Arched top text
    drawArcText("LARGE LUIGI'S", 0, 0, r * 0.66, -Math.PI / 2, Math.PI * 0.85,
                'bold ' + Math.round(r * 0.22) + 'px Cinzel, Georgia, serif',
                '#1a4a18');

    // Center stamp
    ctx.fillStyle = '#8c2418';
    ctx.font = 'bold ' + Math.round(r * 0.18) + 'px "Special Elite", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PIZZA', 0, -r * 0.04);
    ctx.fillText('& PASTA', 0,  r * 0.18);

    // Smudge — the logo is half wiped off (use cardboard tan to "erase")
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#c4a070';
    ctx.beginPath();
    ctx.ellipse(r * 0.38, -r * 0.22, r * 0.55, r * 0.42, 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw `text` along an arc of `radius` centered at (cx,cy). startAngle is
  // where the first character sits; sweep is total arc length in radians.
  function drawArcText(text, cx, cy, radius, startAngle, sweep, font, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = text.length;
    const step = sweep / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const a = startAngle + step * i;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(text.charAt(i), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // Deterministic [0,1) hash — used to give hand-drawn lines and hoshi
  // their wobble. Same (seed, step) always yields the same value so the
  // board doesn't churn between redraws / takebacks.
  function hash01(seed, step) {
    return (((seed * 9301 + step * 49297 + 13) % 233280) | 0) / 233280;
  }

  // A wobbly sharpie line from (x1,y1) to (x2,y2): 18 small segments with
  // perpendicular jitter that peaks in the middle and tapers at the ends,
  // plus a small overshoot/undershoot at each tip so corners aren't crisp.
  function drawHandDrawnLine(x1, y1, x2, y2, seed) {
    const SEG = 18;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const perpX = -uy,    perpY = ux;
    // Tip overshoot (a stroke that doesn't quite stop at the intersection).
    const startOver = (hash01(seed, 1) - 0.5) * 4.5;
    const endOver   = (hash01(seed, 2) - 0.5) * 4.5;
    const sx = x1 - ux * startOver;
    const sy = y1 - uy * startOver;
    const ex = x2 + ux * endOver;
    const ey = y2 + uy * endOver;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG;
      const baseX = sx + (ex - sx) * t;
      const baseY = sy + (ey - sy) * t;
      // Sine taper keeps jitter near zero at endpoints, peaks mid-line.
      const taper = Math.sin(t * Math.PI);
      const j = (hash01(seed, i + 7) - 0.5) * 2.6 * taper;
      ctx.lineTo(baseX + perpX * j, baseY + perpY * j);
    }
    ctx.stroke();
  }

  // Control overlay — definite territory (strong tint) + influence-leaning
  // empty points (soft tint). Painted as little rotated diamonds at each
  // intersection so they don't clobber the grid lines.
  function drawControlOverlay(state, cs, pad) {
    const est = B.controlEstimate(state.cells, KOMI, 0.6);
    const t = est.territory;
    const inf = est.influence;
    const definiteR = cs * 0.22;
    const softR = cs * 0.13;
    for (let i = 0; i < B.N; i++) {
      if (state.cells[i] !== B.EMPTY) continue;
      const r = (i / B.SIZE) | 0, c = i % B.SIZE;
      const x = pad + c * cs, y = pad + r * cs;
      let color = null;
      let radius = 0;
      let alpha = 0;
      // Tint matches the cap brand controlling that point.
      if (t[i] === B.BLACK)       { color = '#b41822'; radius = definiteR; alpha = 0.55; }
      else if (t[i] === B.WHITE)  { color = '#1c3a80'; radius = definiteR; alpha = 0.52; }
      else if (inf[i] >  0.6)     { color = '#b41822'; radius = softR;     alpha = 0.24 + Math.min(0.18, (inf[i] - 0.6) * 0.08); }
      else if (inf[i] < -0.6)     { color = '#1c3a80'; radius = softR;     alpha = 0.22 + Math.min(0.18, (-inf[i] - 0.6) * 0.08); }
      if (!color) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  // A pried-off bottle cap, viewed top-down: domed metal disk with a
  // crimped rim (21 teeth) and a printed label face. Per-cell rotation is
  // deterministic so the same cap always looks the same.
  function drawCap(x, y, color, r, cellIdx) {
    const c = CAPS[color];
    if (!c) return;
    const rot = capRotation(cellIdx, color);

    ctx.save();
    ctx.translate(x, y);

    // Cast shadow on the pizza-box top.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
    ctx.beginPath();
    ctx.arc(1.8, 2.4, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(rot);

    // If we have a bitmap for this color, blit it (sized to the procedural
    // diameter so cell geometry stays identical) and skip the painted cap.
    const imgEntry = CAP_IMAGES[color];
    if (imgEntry && imgEntry.ready) {
      ctx.drawImage(imgEntry.img, -r, -r, r * 2, r * 2);
      ctx.restore();
      return;
    }

    // Cap body — slightly domed metal disk, lit from upper-left.
    const body = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.15, 0, 0, r);
    body.addColorStop(0,    c.faceLight);
    body.addColorStop(0.55, c.face);
    body.addColorStop(1,    c.faceDark);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Crimped rim — 21 short radial scores around the perimeter.
    const TEETH = 21;
    ctx.strokeStyle = c.crimp;
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.lineCap = 'butt';
    for (let k = 0; k < TEETH; k++) {
      const a = (k / TEETH) * Math.PI * 2;
      const r1 = r * 0.86;
      const r2 = r * 0.99;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }

    // Inset label disk.
    ctx.fillStyle = c.label;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Brand spot (color accent at center).
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // Brand letter (only if cap is big enough to read).
    if (r > 13 && c.letter) {
      ctx.fillStyle = c.letterColor;
      ctx.font = 'bold ' + Math.round(r * 0.62) + 'px ' +
        'Cinzel, Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Counter-rotate the letter so it always reads upright.
      ctx.save();
      ctx.rotate(-rot);
      ctx.fillText(c.letter, 0, r * 0.04);
      ctx.restore();
    }

    // Upper-left specular highlight (the dome).
    const hl = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, -r * 0.2, -r * 0.25, r * 0.55);
    hl.addColorStop(0,   'rgba(255, 255, 255, 0.30)');
    hl.addColorStop(1,   'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Outer rim line — softens the cap edge against the box.
    ctx.strokeStyle = c.crimp;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // ─── UI status refresh ───────────────────────────────────────────────────
  function refreshUI() {
    const s = current();
    if (elTomove) {
      if (!playing) elTomove.textContent = '—';
      else elTomove.textContent = s.toMove === PLAYER ? 'YOU (red caps)' : (DIFF_NAME[level] || 'Emperess') + ' (blue)';
    }
    if (elCapB) elCapB.textContent = String(s.captures.b);
    if (elCapW) elCapW.textContent = String(s.captures.w);
    if (elTbLeft) elTbLeft.textContent = String(takebacksLeft);

    const locked = !playing || aiThinking || !!bumpAnimation;
    if (elPass) elPass.disabled = locked || s.toMove !== PLAYER;
    if (elResign) elResign.disabled = locked;
    if (elTakeback) {
      // Need at least one full pair of non-bump moves recorded since start.
      let nonBumpMoves = 0;
      for (let i = history.length - 1; i >= 1 && nonBumpMoves < 2; i--) {
        if (!history[i].isBumpResult) nonBumpMoves++;
      }
      elTakeback.disabled = locked || takebacksLeft <= 0 || nonBumpMoves < 2;
    }
    if (elBegin) elBegin.disabled = playing || Wallet.getBalance() < Math.ceil(stake * COST_MULT) || stake < 1;
    if (elWager) elWager.disabled = playing;
    if (elWagerMax) elWagerMax.disabled = playing;
    if (elDiffGrid) {
      elDiffGrid.querySelectorAll('.go-knob-mark').forEach((btn) => {
        btn.disabled = playing;
      });
    }
    if (elShowControl) {
      elShowControl.setAttribute('aria-pressed', showControl ? 'true' : 'false');
      elShowControl.classList.toggle('go-btn-toggle-on', showControl);
    }
    refreshEstimate();
    drawBoard();
  }

  function refreshEstimate() {
    if (!elEstB || !elEstW || !elEstD) return;
    const est = B.controlEstimate(current().cells, KOMI, 0.6);
    elEstB.textContent = String(est.black);
    // white already includes komi from controlEstimate.
    const w = est.white;
    elEstW.textContent = Number.isInteger(w) ? String(w) : w.toFixed(1);
    elEstD.textContent = String(est.dame);
  }

  function setStatus(text, cls) {
    if (!elStatus) return;
    elStatus.textContent = text;
    elStatus.className = 'go-status' + (cls ? ' go-status-' + cls : '');
  }

  function setResult(html, cls) {
    if (!elResult) return;
    elResult.innerHTML = html;
    elResult.className = 'go-result' + (cls ? ' go-result-' + cls : '');
  }

  function renderPaySummary() {
    if (!elPaySummary) return;
    const cost = Math.max(1, Math.ceil(stake * COST_MULT));
    const win = stake * (WIN_MULT[level] || 2);
    elPaySummary.innerHTML =
      'Cost <span class="go-pay-cost">' + cost + '</span> · Win pays <span class="go-pay-win">' + win + '</span>';
  }

  function renderWagerUI() {
    if (!elWager) return;
    const bal = Wallet.getBalance();
    const maxAffordable = Math.max(0, Math.floor(bal / COST_MULT));
    elWager.max = String(Math.max(1, maxAffordable));
    if (!playing) {
      let v = parseInt(elWager.value, 10);
      if (!Number.isFinite(v) || v < 1) v = 1;
      if (v > maxAffordable && maxAffordable > 0) v = maxAffordable;
      elWager.value = String(v);
      stake = v;
    }
    if (elWagerMax) elWagerMax.disabled = playing || maxAffordable < 1;
    renderPaySummary();
    refreshUI();
  }

  // ─── Game flow ───────────────────────────────────────────────────────────
  function beginGame() {
    if (playing) return;
    stake = readStake();
    const cost = Math.max(1, Math.ceil(stake * COST_MULT));
    if (stake < 1 || !Wallet.spend(cost)) {
      setStatus('Not enough coin for that stake.', 'warn');
      return;
    }
    lastCommittedCost = cost;
    if (global.Child && global.Child.recordPlay) global.Child.recordPlay();
    history = [B.create()];
    takebacksLeft = MAX_TAKEBACKS;
    playing = true;
    aiThinking = false;
    aiThinkToken++;             // invalidate any stale in-flight AI Promise
    pairCount = 0;
    nextBumpAt = rollBumpInterval();
    bumpAnimation = null;
    setResult('', '');
    setStatus('Your move. Plant a cap.');
    refreshUI();
  }

  function readStake() {
    const v = parseInt(elWager && elWager.value, 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  // Parse a number <input>'s current value, clamp to its min/max, and
  // return the result. If the field is empty / non-numeric (mid-typing),
  // return `fallback` so we don't snap the running BPM/pieces to 0.
  function clampInputInt(el, fallback) {
    const v = parseInt(el.value, 10);
    if (!Number.isFinite(v)) return fallback;
    const min = parseInt(el.min, 10);
    const max = parseInt(el.max, 10);
    let out = v;
    if (Number.isFinite(min) && out < min) out = min;
    if (Number.isFinite(max) && out > max) out = max;
    return out;
  }

  function pushHistory(next) {
    history.push(next);
    refreshUI();
  }

  function tryPlayerMove(cell) {
    if (!playing || aiThinking || bumpAnimation) return;
    const s = current();
    if (s.toMove !== PLAYER) return;
    if (cell < 0) return;
    const next = B.tryPlay(s, cell);
    if (!next) {
      // Diagnose why it was illegal for feedback.
      let why = 'Can\'t plant there.';
      if (s.cells[cell] !== B.EMPTY) why = 'Cap already on that spot.';
      else {
        // Suicide vs ko vs other — re-derive briefly.
        const probe = new Int8Array(s.cells);
        probe[cell] = PLAYER;
        let captured = 0;
        const seen = new Set();
        for (const n of B.neighbors(cell)) {
          if (probe[n] === HOUSE && !seen.has(n)) {
            const g = B.groupOf(probe, n);
            for (const st of g.stones) seen.add(st);
            if (g.libs.size === 0) {
              for (const st of g.stones) probe[st] = B.EMPTY;
              captured += g.stones.size;
            }
          }
        }
        const ownG = B.groupOf(probe, cell);
        if (ownG.libs.size === 0) why = 'Suicide — your cap would have no breathing room.';
        else why = 'Ko — can\'t snag it right back the next turn.';
      }
      setStatus(why, 'warn');
      return;
    }
    setStatus((DIFF_NAME[level] || 'Emperess') + ' squints at the board…');
    pushHistory(next);
    if (maybeEndGame()) return;
    scheduleAITurn();
  }

  function scheduleAITurn() {
    aiThinking = true;
    refreshUI();
    // Slight perceived-thought delay — L4 actually computes, others mostly snap.
    const delay = level === 4 ? 250 : (level === 3 ? 180 : 110);
    setTimeout(runAITurn, delay);
  }

  async function runAITurn() {
    if (!playing) { aiThinking = false; return; }
    const s = current();
    if (s.toMove !== HOUSE) { aiThinking = false; refreshUI(); return; }
    // Take a token for THIS turn. AI.chooseMove is async (yields to the
    // event loop periodically so the sequencer keeps playing); if a new
    // game / takeback / end-game happens before it resolves, the token
    // won't match and we bail without touching history.
    const myToken = ++aiThinkToken;
    let move;
    try {
      move = await AI.chooseMove(s, level, { maxPlies: 60 });
    } catch (err) {
      console.error('AI error', err);
      move = B.PASS;
    }
    if (myToken !== aiThinkToken || !playing) {
      // Superseded or game ended during the await — quietly drop.
      return;
    }
    // AI conceded — figures the position is past saving. End the game in
    // the player's favor.
    if (move === AI.RESIGN) {
      aiThinking = false;
      endGame(PLAYER, 'ai_resign');
      return;
    }
    let next = B.tryPlay(s, move);
    if (!next) next = B.pass(s);
    aiThinking = false;
    pushHistory(next);
    if (maybeEndGame()) return;
    // A full pair (player + AI) just completed. Tick the bump counter.
    // Warnings fire as on-screen flashes 3, 2, 1 pairs before the impact —
    // player keeps playing normally during the countdown. On the trigger
    // pair (remaining ≤ 0) the bump fires immediately with a shake.
    pairCount++;
    const remaining = nextBumpAt - pairCount;
    if (remaining > 0 && remaining <= 3) {
      flashBumpOverlay('BUMP IN ' + remaining);
    }
    if (remaining <= 0) {
      flashBumpOverlay('BUMP!', true);
      shakeBody();
      performBump();
      return;
    }
    const oppName = DIFF_NAME[level] || 'Emperess';
    const desc = next.lastMove === B.PASS
      ? oppName + ' passes — taps the cap on the box. Your move.'
      : 'Your move.';
    setStatus(desc);
  }

  function takeback() {
    if (!playing || aiThinking || bumpAnimation) return;
    if (takebacksLeft <= 0) return;
    // Find the index of the 2nd-most-recent non-bump entry from the top.
    // Truncating to that index pops the last pair of real moves while
    // leaving any bump entries below them in place.
    let moves = 0, truncateAt = -1;
    for (let i = history.length - 1; i >= 1; i--) {
      if (!history[i].isBumpResult) {
        moves++;
        if (moves === 2) { truncateAt = i; break; }
      }
    }
    if (truncateAt < 0) return;
    history.length = truncateAt;
    takebacksLeft--;
    aiThinkToken++;             // invalidate stale AI Promise (rare but possible)
    recomputePairCount();
    setStatus('You flip the last cap back into the can. Your move.', 'soft');
    refreshUI();
  }

  function passMove() {
    if (!playing || aiThinking || bumpAnimation) return;
    const s = current();
    if (s.toMove !== PLAYER) return;
    const next = B.pass(s);
    pushHistory(next);
    setStatus('You knuckle the box. Pass.');
    if (maybeEndGame()) return;
    scheduleAITurn();
  }

  function resign() {
    if (!playing || bumpAnimation) return;
    endGame(HOUSE, 'resign');
  }

  function maybeEndGame() {
    const s = current();
    if (!B.isGameOver(s)) return false;
    const sc = B.score(s, KOMI);
    endGame(sc.winner, 'pass', sc);
    return true;
  }

  function endGame(winner, reason, scoreObj) {
    playing = false;
    aiThinking = false;
    aiThinkToken++;           // any in-flight AI Promise resolves into a noop
    bumpAnimation = null;     // halts any pending rAF step on its !playing/!bumpAnimation guards
    let payout = 0;
    if (winner === PLAYER) {
      payout = stake * (WIN_MULT[level] || 2);
      Wallet.add(payout);
    }
    const sc = scoreObj || B.score(current(), KOMI);
    const oppName = DIFF_NAME[level] || 'Emperess';
    const winnerName = winner === PLAYER ? 'YOU' : (winner === HOUSE ? oppName : 'DRAW');
    let reasonText;
    if (reason === 'ai_resign') {
      reasonText = oppName + ' tips a cap over — figures the spread is past saving.';
    } else if (reason === 'resign') {
      reasonText = winner === HOUSE
        ? 'You tipped your last cap over — folded.'
        : oppName + ' tipped a cap over.';
    } else if (winner === 0) {
      reasonText = 'Even count.';
    } else {
      reasonText = 'Both passed. Caps counted.';
    }
    // No score breakdown when the AI resigned — caps weren't counted, the
    // position was just judged unwinnable.
    const breakdown = reason === 'ai_resign'
      ? ''
      : (winner === 0
        ? ('Counted: red ' + sc.black + ' · blue ' + sc.white + ' (komi ' + sc.komi + ')')
        : ('Counted: red ' + sc.black + ' · blue ' + sc.white + ' (komi ' + sc.komi + ') · margin ' + sc.margin.toFixed(1)));
    const wager = lastCommittedCost;
    const payLine = winner === PLAYER
      ? '<div class="go-result-pay go-result-win">+' + payout + ' coins (' + DIFF_NAME[level] + ' · ' + WIN_MULT[level] + '×). Tab to play was ' + wager + '.</div>'
      : '<div class="go-result-pay go-result-lose">Lost your stake (' + wager + ' coins on the box).</div>';
    const headline = winner === PLAYER
      ? 'YOU TAKE IT.'
      : (winner === HOUSE ? oppName + ' takes it.' : 'DRAW.');
    setResult(
      '<div class="go-result-headline">' + headline + '</div>' +
      '<div class="go-result-reason">' + reasonText + '</div>' +
      (breakdown ? '<div class="go-result-breakdown">' + breakdown + '</div>' : '') +
      payLine,
      winner === PLAYER ? 'win' : (winner === HOUSE ? 'lose' : 'draw')
    );
    setStatus(reason === 'resign' && winner === HOUSE
      ? 'You folded. Pick a rank and a stake to deal another.'
      : 'Game over. Pick a rank and a stake to deal another.');
    refreshUI();
    renderWagerUI();
  }

  // ─── Input bindings ──────────────────────────────────────────────────────
  // Switch to a new difficulty: writes data-level on the knob wrap (CSS
  // rotates the dial), syncs aria-checked on each mark, updates the
  // mountain-scroll duration (higher rank → faster scroll), refreshes
  // the pay summary text.
  function applyLevel(lv) {
    if (!WIN_MULT[lv]) return;
    level = lv;
    if (elDiffGrid) {
      elDiffGrid.dataset.level = String(lv);
      elDiffGrid.querySelectorAll('.go-knob-mark').forEach((b) => {
        const selected = parseInt(b.dataset.level, 10) === lv;
        b.setAttribute('aria-checked', selected ? 'true' : 'false');
      });
    }
    document.documentElement.style.setProperty(
      '--vg-mountain-duration', MOUNTAIN_DURATIONS[lv] || '90s'
    );
    renderPaySummary();
  }

  // Knob math: the dial sits at -90°/-30°/+30°/+90° for levels 1..4.
  // The pointer is drawn pointing up (12 o'clock) at rotation 0, so the
  // mapping from cursor-relative-angle to dial-rotation is:
  //   dialAngle = atan2(dy, dx) + 90  (then clamp to [-90, +90])
  const LEVEL_ANGLES = { 1: -90, 2: -30, 3: 30, 4: 90 };
  const ANGLE_LEVELS = [
    { lv: 1, ang: -90 }, { lv: 2, ang: -30 },
    { lv: 3, ang:  30 }, { lv: 4, ang:  90 },
  ];

  function cursorDialAngle(e, knobEl) {
    const r = knobEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    const dy = (e.clientY != null ? e.clientY : 0) - cy;
    const dx = (e.clientX != null ? e.clientX : 0) - cx;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    if (ang >  180) ang -= 360;
    if (ang < -180) ang += 360;
    if (ang >  90) ang =  90;
    if (ang < -90) ang = -90;
    return ang;
  }

  function nearestLevelForAngle(ang) {
    let best = ANGLE_LEVELS[0], bestD = Infinity;
    for (const p of ANGLE_LEVELS) {
      const d = Math.abs(ang - p.ang);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best.lv;
  }

  function bindDifficulty() {
    if (!elDiffGrid) return;
    const knob = elDiffGrid.querySelector('.go-knob');
    const body = knob && knob.querySelector('.go-knob-body');

    // --- mark click → set that level ---------------------------------------
    elDiffGrid.addEventListener('click', (e) => {
      const mark = e.target.closest('.go-knob-mark');
      if (!mark || mark.disabled) return;
      applyLevel(parseInt(mark.dataset.level, 10));
    });

    // --- drag the knob -----------------------------------------------------
    if (knob && body) {
      let dragging = false;
      let currentAng = LEVEL_ANGLES[level || 1];

      function onDown(e) {
        if (playing) return;                       // input locked mid-game
        if (e.target.closest('.go-knob-mark')) return;
        dragging = true;
        knob.classList.add('go-knob-dragging');
        currentAng = cursorDialAngle(e, knob);
        body.style.transform = 'rotate(' + currentAng + 'deg)';
        if (knob.setPointerCapture && e.pointerId != null) {
          try { knob.setPointerCapture(e.pointerId); } catch (_) {}
        }
        e.preventDefault();
      }
      function onMove(e) {
        if (!dragging) return;
        currentAng = cursorDialAngle(e, knob);
        body.style.transform = 'rotate(' + currentAng + 'deg)';
      }
      function onUp(e) {
        if (!dragging) return;
        dragging = false;
        knob.classList.remove('go-knob-dragging');
        // Clear inline transform so the CSS data-level rule resumes control
        // (it will animate to the snapped angle).
        body.style.transform = '';
        applyLevel(nearestLevelForAngle(currentAng));
      }

      // Prefer Pointer Events (mouse + touch + pen unified, captures cleanly).
      if (window.PointerEvent) {
        knob.addEventListener('pointerdown', onDown);
        knob.addEventListener('pointermove', onMove);
        knob.addEventListener('pointerup', onUp);
        knob.addEventListener('pointercancel', onUp);
      } else {
        // Fallback: mouse events on knob, listened on document so the drag
        // continues even if cursor leaves the knob bounds.
        knob.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('mouseup', onUp);
      }

      // A plain click on the knob is just a zero-distance drag — the
      // pointer-down/up handlers above will snap to whichever level
      // sector the cursor is sitting in.
    }

    applyLevel(level || 1);
  }

  function bindCanvas() {
    if (!canvas) return;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const cell = pixelToCell(x, y);
      if (cell < 0) return;
      tryPlayerMove(cell);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!playing || aiThinking) {
        if (hoverCell !== -1) { hoverCell = -1; drawBoard(); }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const cell = pixelToCell(x, y);
      if (cell !== hoverCell) { hoverCell = cell; drawBoard(); }
    }, { passive: true });
    canvas.addEventListener('mouseleave', () => {
      if (hoverCell !== -1) { hoverCell = -1; drawBoard(); }
    });
  }

  // ─── Bump engine ─────────────────────────────────────────────────────────
  // Plan up to maxCount one-step moves for `color`. Each move = {src, dest,
  // color}. Destinations must be empty in the initial cells AND not collide
  // with any other planned destination or `blocked` cell. Sources can't be
  // reused. Returns 0..maxCount moves.
  function planBumpForColor(cells, color, maxCount, blocked) {
    const stones = [];
    for (let i = 0; i < B.N; i++) if (cells[i] === color) stones.push(i);
    shuffleInPlace(stones);
    const moves = [];
    const usedDests = new Set();
    for (const src of stones) {
      if (moves.length >= maxCount) break;
      if (blocked.has(src)) continue;
      const sr = (src / B.SIZE) | 0;
      const sc = src % B.SIZE;
      const dirs = BUMP_DIRS.slice();
      shuffleInPlace(dirs);
      for (const [dr, dc] of dirs) {
        const nr = sr + dr, ncc = sc + dc;
        if (nr < 0 || nr >= B.SIZE || ncc < 0 || ncc >= B.SIZE) continue;
        const dest = nr * B.SIZE + ncc;
        if (cells[dest] !== B.EMPTY) continue;
        if (usedDests.has(dest) || blocked.has(dest)) continue;
        moves.push({ src, dest, color });
        usedDests.add(dest);
        break;
      }
    }
    return moves;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Plan a full bump: equal number of player and house moves (1-3 each),
  // interleaved as B, W, B, W, … Returns [] if nothing is movable.
  function planBump(cells) {
    const target = 1 + Math.floor(Math.random() * BUMP_PIECES_MAX);
    const playerMoves = planBumpForColor(cells, PLAYER, target, new Set());
    const block = new Set();
    for (const m of playerMoves) { block.add(m.src); block.add(m.dest); }
    const houseMoves = planBumpForColor(cells, HOUSE, target, block);
    const n = Math.min(playerMoves.length, houseMoves.length);
    const seq = [];
    for (let i = 0; i < n; i++) {
      seq.push(playerMoves[i]);
      seq.push(houseMoves[i]);
    }
    return seq;
  }

  function startBumpAnimation(initialCells, moves, onComplete) {
    const liveCells = new Int8Array(initialCells);
    bumpAnimation = {
      cells: liveCells,
      queue: moves.slice(),
      current: null,
      startTime: 0,
      duration: BUMP_DURATION_PER_PIECE_MS,
    };
    function nextMove() {
      if (!bumpAnimation || !bumpAnimation.queue.length) {
        const finalCells = bumpAnimation ? bumpAnimation.cells : initialCells;
        bumpAnimation = null;
        drawBoard();
        onComplete(finalCells);
        return;
      }
      bumpAnimation.current = bumpAnimation.queue.shift();
      bumpAnimation.startTime = performance.now();
      requestAnimationFrame(step);
    }
    function step(now) {
      if (!bumpAnimation || !bumpAnimation.current) return;
      const elapsed = now - bumpAnimation.startTime;
      const t = Math.min(1, elapsed / bumpAnimation.duration);
      drawBoard();
      if (t >= 1) {
        const { src, dest, color } = bumpAnimation.current;
        bumpAnimation.cells[src] = B.EMPTY;
        bumpAnimation.cells[dest] = color;
        bumpAnimation.current = null;
        drawBoard();
        setTimeout(nextMove, BUMP_PAUSE_BETWEEN_MS);
      } else {
        requestAnimationFrame(step);
      }
    }
    nextMove();
  }

  // Flash the bump overlay with `text` (e.g. "BUMP IN 2", "BUMP!"). Resets
  // the animation by toggling the class off-on so consecutive flashes
  // visibly restart instead of running together.
  function flashBumpOverlay(text, impact) {
    if (!elBumpFlash) return;
    elBumpFlash.textContent = text;
    elBumpFlash.classList.remove('show');
    elBumpFlash.classList.toggle('go-bump-flash-impact', !!impact);
    // Force reflow so removing+adding .show restarts the animation.
    void elBumpFlash.offsetWidth;
    elBumpFlash.classList.add('show');
  }

  // Shake the cabin (body) for ~620 ms. html::before (the mountain layer)
  // sits outside body so it stays put — sells the "pothole" feel.
  function shakeBody() {
    const b = document.body;
    if (!b) return;
    b.classList.remove('go-bumping');
    void b.offsetWidth;
    b.classList.add('go-bumping');
    setTimeout(() => b.classList.remove('go-bumping'), 700);
  }

  function performBump() {
    const cur = current();
    const seq = planBump(cur.cells);
    if (!seq.length) {
      // Nothing movable. Reset counter, keep going.
      pairCount = 0;
      nextBumpAt = rollBumpInterval();
      setStatus('The box jostles, but nothing slides. Your move.', 'soft');
      refreshUI();
      return;
    }
    setStatus('BUMP. Caps slide on the box.', 'soft');
    refreshUI();
    startBumpAnimation(cur.cells, seq, (finalCells) => {
      if (!playing) return;  // game ended mid-bump; drop the result
      // Commit the post-bump state as a new history entry, marked as a
      // bump result so takeback can skip it.
      const bumpState = {
        cells: new Int8Array(finalCells),
        toMove: cur.toMove,
        lastMove: null,
        koPoint: null,         // reset ko — positions just shifted around
        passes: cur.passes,
        captures: { b: cur.captures.b, w: cur.captures.w },
        moveNum: cur.moveNum,
        isBumpResult: true,
      };
      history.push(bumpState);
      pairCount = 0;
      nextBumpAt = rollBumpInterval();
      if (bumpState.toMove === PLAYER) {
        setStatus('Caps settle. Your move.');
        refreshUI();
      } else {
        // Shouldn't happen — bumps fire after AI move, so toMove == PLAYER.
        // Fallback: hand back to AI.
        refreshUI();
        scheduleAITurn();
      }
    });
  }

  // After a takeback that crossed past bumps, the pair counter no longer
  // matches reality. Recompute it: count non-bump entries above the most
  // recent bump (or initial) and divide by 2.
  function recomputePairCount() {
    let moves = 0;
    for (let i = history.length - 1; i >= 1; i--) {
      if (history[i].isBumpResult) break;
      moves++;
    }
    pairCount = Math.floor(moves / 2);
  }

  // ─── Sequencer feed ─────────────────────────────────────────────────────
  //
  // Walk history newest→oldest, collecting cells that became occupied at
  // each step (a single fill per normal move; multiple fills per bump
  // result). Skip captured/vacated cells (we only want still-on-board).
  // Return the last `maxN` such cell indices.
  function recentlyPlacedCells(maxN) {
    maxN = maxN || 10;
    const cur = current().cells;
    const seen = new Set();
    const result = [];
    for (let i = history.length - 1; i >= 1 && result.length < maxN; i--) {
      const c = history[i].cells;
      const p = history[i - 1].cells;
      for (let k = 0; k < B.N; k++) {
        if (c[k] !== B.EMPTY && p[k] === B.EMPTY) {
          if (cur[k] !== B.EMPTY && !seen.has(k)) {
            seen.add(k);
            result.push(k);
            if (result.length >= maxN) break;
          }
        }
      }
    }
    return result;
  }

  // Build the cells array the sequencer plays from: only the most-recent
  // `tailPieces` placements that are still on the board show their color;
  // everything else is empty (silent). The cap is user-set via #go-pieces.
  // Mid-bump, prefer the live animation cells so sliding caps sing
  // immediately at their new spots.
  function buildSequencerCells() {
    const cur = bumpAnimation ? bumpAnimation.cells : current().cells;
    const recent = recentlyPlacedCells(tailPieces);
    const out = new Int8Array(B.N);
    for (const k of recent) {
      if (cur[k] !== B.EMPTY) out[k] = cur[k];
    }
    return out;
  }

  // Note division for the current moveNum: wholes at the opening, halving
  // every DIV_MOVES_PER_BAND moves down to 16ths. Clamps at the smallest
  // division (16ths) once the band index runs off the end.
  function noteDivMult(moveNum) {
    const idx = Math.min(DIV_MULTS.length - 1,
                         Math.max(0, Math.floor(moveNum / DIV_MOVES_PER_BAND)));
    return DIV_MULTS[idx];
  }

  // Step duration is now (60000/BPM) × note-division, where BPM is
  // user-set and the division shortens as moveNum climbs (wholes →
  // halves → quarters → 8ths → 16ths). 40ms floor guards against
  // pathological BPM × tiny-division combos in the deep endgame.
  function getStepMs() {
    const mn = (current() && current().moveNum) || 0;
    const beatMs = 60000 / Math.max(20, bpm);
    return Math.max(40, beatMs * noteDivMult(mn));
  }

  // Cycle the minor-pentatonic root through all 12 chromatic options on
  // click. Mode stays minor — only the root shifts. Audio picks up the
  // change on the next sequencer tick (no need to restart).
  function cycleKey() {
    rootOffset = (rootOffset + 1) % 12;
    updateKeyDisplay();
  }
  function updateKeyDisplay() {
    if (elKey) elKey.textContent = KEY_NAMES[rootOffset] + 'm';
  }

  function init() {
    canvas = document.getElementById('go-canvas');
    ctx = canvas && canvas.getContext('2d');
    elStatus = document.getElementById('go-status');
    elResult = document.getElementById('go-result');
    elTomove = document.getElementById('go-tomove');
    elCapB = document.getElementById('go-captures-b');
    elCapW = document.getElementById('go-captures-w');
    elTbLeft = document.getElementById('go-takebacks-left');
    elWager = document.getElementById('go-wager');
    elWagerMax = document.getElementById('go-wager-max');
    elBegin = document.getElementById('go-begin');
    elPass = document.getElementById('go-pass');
    elTakeback = document.getElementById('go-takeback');
    elResign = document.getElementById('go-resign');
    elDiffGrid = document.getElementById('go-difficulty');
    elPaySummary = document.getElementById('go-pay-summary');
    elShowControl = document.getElementById('go-show-control');
    elEstB = document.getElementById('go-est-b');
    elEstW = document.getElementById('go-est-w');
    elEstD = document.getElementById('go-est-d');
    elBumpFlash = document.getElementById('go-bump-flash');
    elKey       = document.getElementById('go-key');
    elBpm       = document.getElementById('go-bpm');
    elPieces    = document.getElementById('go-pieces');
    if (elKey) {
      elKey.addEventListener('click', cycleKey);
      updateKeyDisplay();
    }
    // BPM + rolling-tail length: live, no game-state gating. Both clamp
    // to their input min/max; an invalid intermediate state during typing
    // (empty / non-numeric) is ignored so the sequencer doesn't hiccup.
    if (elBpm) {
      bpm = clampInputInt(elBpm, bpm);
      elBpm.addEventListener('input', () => { bpm = clampInputInt(elBpm, bpm); });
      elBpm.addEventListener('change', () => {
        bpm = clampInputInt(elBpm, bpm);
        elBpm.value = String(bpm);
      });
    }
    if (elPieces) {
      tailPieces = clampInputInt(elPieces, tailPieces);
      elPieces.addEventListener('input', () => { tailPieces = clampInputInt(elPieces, tailPieces); });
      elPieces.addEventListener('change', () => {
        tailPieces = clampInputInt(elPieces, tailPieces);
        elPieces.value = String(tailPieces);
      });
    }

    bindDifficulty();
    bindCanvas();

    if (elShowControl) {
      elShowControl.addEventListener('click', () => {
        showControl = !showControl;
        refreshUI();
      });
    }

    if (elWager) {
      elWager.addEventListener('input', () => { stake = readStake(); renderWagerUI(); });
      elWager.addEventListener('change', () => {
        let v = readStake();
        const maxAffordable = Math.max(1, Math.floor(Wallet.getBalance() / COST_MULT));
        if (v < 1) v = 1;
        if (v > maxAffordable) v = maxAffordable;
        elWager.value = String(v);
        stake = v;
        renderWagerUI();
      });
    }
    if (elWagerMax) {
      elWagerMax.addEventListener('click', () => {
        const maxAffordable = Math.max(1, Math.floor(Wallet.getBalance() / COST_MULT));
        if (elWager) elWager.value = String(maxAffordable);
        stake = maxAffordable;
        renderWagerUI();
      });
    }
    if (elBegin) elBegin.addEventListener('click', beginGame);
    if (elPass) elPass.addEventListener('click', passMove);
    if (elTakeback) elTakeback.addEventListener('click', takeback);
    if (elResign) elResign.addEventListener('click', resign);

    // Translate trap (Chrome-native): handled entirely by translate-trap.js
    // — when Chrome auto-translates the zh-CN page, the trap intercepts
    // and swaps the chrome + rules body to a Spanish synth manual.

    if (global.Wallet && global.Wallet.onChange) {
      Wallet.onChange(() => renderWagerUI());
    }

    // Pad-sequencer: the board doubles as a slow ambient pad, columns
    // sweeping left→right. Only the most-recent `tailPieces` caps still
    // on the board sound — older moves fall out of the rolling tail.
    // BPM is user-set (#go-bpm); moveNum selects the note division so
    // the opening breathes in whole notes and the endgame snaps into
    // 16ths. Audio init needs a user gesture so we arm start() on the
    // first click/keydown anywhere on the page.
    if (global.GoSequencer) {
      global.GoSequencer.init(
        buildSequencerCells,
        (idx, axis) => {
          if (axis === 'row') { activeCol = -1; activeRow = idx; }
          else                { activeRow = -1; activeCol = idx; }
          drawBoard();
        },
        getStepMs,
        () => level,
        () => aiThinking,
        () => rootOffset
      );
      const arm = () => {
        global.GoSequencer.start();
        document.removeEventListener('click', arm, true);
        document.removeEventListener('keydown', arm, true);
        document.removeEventListener('pointerdown', arm, true);
      };
      document.addEventListener('click', arm, true);
      document.addEventListener('keydown', arm, true);
      document.addEventListener('pointerdown', arm, true);
    }

    // Debug peek-hole: lets you verify in the console that the BPM and
    // tail-length inputs are actually wiring through to the sequencer.
    //   > GoDebug.bpm, GoDebug.tailPieces, GoDebug.stepMs()
    global.GoDebug = Object.assign(global.GoDebug || {}, {
      get bpm()        { return bpm; },
      get tailPieces() { return tailPieces; },
      stepMs()         { return getStepMs(); },
      get moveNum()    { return (current() && current().moveNum) || 0; },
    });

    renderPaySummary();
    renderWagerUI();
    refreshUI();

    // The pizza-scrawl uses a web font; the first drawBoard runs before
    // it loads, so re-render once fonts are ready.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (canvas) drawBoard(); });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
