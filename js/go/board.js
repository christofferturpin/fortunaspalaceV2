/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GO BOARD  —  9×9 rules engine (place, captures, ko, suicide, scoring)   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Pure module. No DOM. Consumed by go/ai.js (legal-move enum +           │
  │   simulation) and go/page.js (turn pipeline, history, settlement).       │
  │                                                                          │
  │   Board model:                                                           │
  │     SIZE=9; cells = Int8Array(81); 0=empty, 1=black, 2=white             │
  │     state = { cells, toMove, lastMove, koPoint, passes, captures{b,w},   │
  │                moveNum, history[] }                                      │
  │                                                                          │
  │   API (window.GoBoard):                                                  │
  │     create()                       ──► fresh state (black to move)       │
  │     clone(state)                   ──► deep copy                         │
  │     idx(r,c) / rc(i)                                                     │
  │     opp(color)                                                           │
  │     groupOf(cells,i)               ──► { stones:Set, libs:Set }          │
  │     legalMove(state,i)             ──► bool   (no suicide, no ko)        │
  │     tryPlay(state,i)               ──► nextState | null  (mutates copy)  │
  │     play(state,i)                  ──► nextState           (throws)      │
  │     pass(state)                    ──► nextState                         │
  │     isGameOver(state)              ──► bool   (two passes)               │
  │     score(state, komi)             ──► { black, white, winner, margin }  │
  │     allLegalMoves(state)           ──► int[] (cell indices, no pass)     │
  │     isEye(cells,i,color)           ──► bool   (simple-eye heuristic)     │
  │     hashBoard(cells,toMove)        ──► string (for ko)                   │
  │     territoryMap(cells)            ──► Int8Array(81) (0/B/W definite)    │
  │     influenceMap(cells, iters?)    ──► Float32Array(81) (+B/-W dilation) │
  │     controlEstimate(cells,komi,t?) ──► { black,white,dame,territory,inf }│
  │                                                                          │
  │   Rules: Tromp-Taylor area scoring + simple positional super-ko (the     │
  │   one prior-position check is enough for 9×9 casual play). Suicide is    │
  │   forbidden. Pass is always legal. Two consecutive passes end the game.  │
  │                                                                          │
  │   Exports (window.GoBoard): { SIZE, EMPTY, BLACK, WHITE, PASS, create,   │
  │     clone, idx, rc, opp, neighbors, groupOf, legalMove, tryPlay, play,   │
  │     pass, isGameOver, score, allLegalMoves, isEye, hashBoard,            │
  │     territoryMap, influenceMap, controlEstimate }                        │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIZE=9; N=81; EMPTY=0,BLACK=1,WHITE=2; PASS=-1
  idx(r,c)→r*9+c; rc(i)→[i/9|0, i%9]
  opp(c)→c==1?2:1
  neighbors(i)→int[]: 4-adj inside bounds (cached per i in NBRS[81])
  groupOf(cells,i)→{stones,libs}: BFS same-color from i; libs=Σ empty 4-adj of group
  legalMove(s,i)→bool: cells[i]≠0→F; place hypothetically; capture opp dead grps; ownLibs==0→F; hash==s.koPoint→F; T
  tryPlay(s,i)→s'|null: legal check inline; place; capture opp grps w/0 libs; own group check; suicide→null; ko check vs prior hash; ret new state w/ koPoint=newHashIfSingleStoneCap||null
  play(s,i)→s': tryPlay or throw
  pass(s)→s': passes+1, lastMove=PASS, toMove=opp, moveNum+1, koPoint=null
  isGameOver(s)→s.passes>=2
  score(s,komi)→{black,white,winner,margin}: area scoring (Tromp-Taylor): stones+territory-empty-surrounded-by-only-one-color; white+=komi; winner=cmp; margin=|b-w|
  allLegalMoves(s)→int[]: ∀i∈[0,81) legalMove(s,i)?push:skip
  isEye(cells,i,color)→bool: cells[i]==0; all 4 orthogonal neighbors color or edge; ≥(edge?2/2 corners:3/4) diagonal neighbors color or off-board
  hashBoard(cells,toMove)→str: String.fromCharCode(toMove+...cells) — short stable key
  territoryMap(cells)→Int8Array(81): flood empty regions; mark 1 if reached only by B, 2 if only by W, else 0 (dame/stone)
  influenceMap(cells,iters=4)→Float32Array(81): seed B=+4,W=-4; for iters, empty[i]=clamp(±4, prev[i]+Σnbr*0.32); ret final
  controlEstimate(cells,komi,thr=0.6)→{black,white,whiteBare,komi,dame,territory,influence}: B/W counted if stone||definite_territory|||influence|>thr; white+=komi
  create(): cells=Int8Array(81); ret {cells,toMove:BLACK,lastMove:null,koPoint:null,passes:0,captures:{b:0,w:0},moveNum:0}
  clone(s): shallow {…s, cells: new Int8Array(s.cells)} (no history needed; page.js maintains stack)
  exports: global.GoBoard={…}
*/
(function (global) {
  const SIZE = 9;
  const N = SIZE * SIZE;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const PASS = -1;

  function idx(r, c) { return r * SIZE + c; }
  function rc(i) { return [(i / SIZE) | 0, i % SIZE]; }
  function opp(color) { return color === BLACK ? WHITE : BLACK; }

  // Precompute orthogonal + diagonal neighbors for every cell.
  const NBRS = new Array(N);
  const DIAGS = new Array(N);
  for (let i = 0; i < N; i++) {
    const r = (i / SIZE) | 0;
    const c = i % SIZE;
    const nb = [];
    if (r > 0)         nb.push(idx(r - 1, c));
    if (r < SIZE - 1)  nb.push(idx(r + 1, c));
    if (c > 0)         nb.push(idx(r, c - 1));
    if (c < SIZE - 1)  nb.push(idx(r, c + 1));
    NBRS[i] = nb;
    const dg = [];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) dg.push(idx(nr, nc));
    }
    DIAGS[i] = dg;
  }
  function neighbors(i) { return NBRS[i]; }

  function groupOf(cells, start) {
    const color = cells[start];
    const stones = new Set();
    const libs = new Set();
    if (color === EMPTY) return { stones, libs };
    const stack = [start];
    stones.add(start);
    while (stack.length) {
      const i = stack.pop();
      for (const n of NBRS[i]) {
        const v = cells[n];
        if (v === EMPTY) {
          libs.add(n);
        } else if (v === color && !stones.has(n)) {
          stones.add(n);
          stack.push(n);
        }
      }
    }
    return { stones, libs };
  }

  function hashBoard(cells, toMove) {
    // Compact stable string. cells values are 0/1/2 → safe charCodes.
    let s = String.fromCharCode(toMove);
    for (let i = 0; i < N; i++) s += String.fromCharCode(cells[i] + 48);
    return s;
  }

  function create() {
    return {
      cells: new Int8Array(N),
      toMove: BLACK,
      lastMove: null,
      koPoint: null,     // hash of prior position banned by simple ko
      passes: 0,
      captures: { b: 0, w: 0 },
      moveNum: 0,
    };
  }

  function clone(state) {
    return {
      cells: new Int8Array(state.cells),
      toMove: state.toMove,
      lastMove: state.lastMove,
      koPoint: state.koPoint,
      passes: state.passes,
      captures: { b: state.captures.b, w: state.captures.w },
      moveNum: state.moveNum,
    };
  }

  // Try to play at i; return next state or null if illegal.
  function tryPlay(state, i) {
    if (i === PASS) return passMove(state);
    if (i < 0 || i >= N) return null;
    if (state.cells[i] !== EMPTY) return null;
    const color = state.toMove;
    const enemy = opp(color);

    const cells = new Int8Array(state.cells);
    cells[i] = color;

    // Capture any enemy groups adjacent to i with zero liberties.
    let captured = 0;
    const seen = new Set();
    for (const n of NBRS[i]) {
      if (cells[n] === enemy && !seen.has(n)) {
        const g = groupOf(cells, n);
        for (const s of g.stones) seen.add(s);
        if (g.libs.size === 0) {
          for (const s of g.stones) cells[s] = EMPTY;
          captured += g.stones.size;
        }
      }
    }

    // Suicide check on own group after captures.
    const own = groupOf(cells, i);
    if (own.libs.size === 0) return null;

    // Positional ko: forbid recreating the immediately-prior board+toMove.
    const nextToMove = enemy;
    const newHash = hashBoard(cells, nextToMove);
    if (state.koPoint && state.koPoint === newHash) return null;

    // Set koPoint only when a single-stone capture occurred AND the placed
    // stone is itself in atari (classic ko shape). This keeps simple ko
    // tight without a full superko table.
    let nextKo = null;
    if (captured === 1 && own.stones.size === 1 && own.libs.size === 1) {
      nextKo = hashBoard(state.cells, color); // the board we'd be reverting to
    }

    return {
      cells,
      toMove: nextToMove,
      lastMove: i,
      koPoint: nextKo,
      passes: 0,
      captures: {
        b: state.captures.b + (color === BLACK ? captured : 0),
        w: state.captures.w + (color === WHITE ? captured : 0),
      },
      moveNum: state.moveNum + 1,
    };
  }

  function play(state, i) {
    const s = tryPlay(state, i);
    if (!s) throw new Error('illegal move at ' + i);
    return s;
  }

  function passMove(state) {
    return {
      cells: new Int8Array(state.cells),
      toMove: opp(state.toMove),
      lastMove: PASS,
      koPoint: null,
      passes: state.passes + 1,
      captures: { b: state.captures.b, w: state.captures.w },
      moveNum: state.moveNum + 1,
    };
  }

  function legalMove(state, i) {
    if (i === PASS) return true;
    if (i < 0 || i >= N) return false;
    if (state.cells[i] !== EMPTY) return false;
    return tryPlay(state, i) !== null;
  }

  function isGameOver(state) { return state.passes >= 2; }

  function allLegalMoves(state) {
    const out = [];
    for (let i = 0; i < N; i++) {
      if (state.cells[i] !== EMPTY) continue;
      if (legalMove(state, i)) out.push(i);
    }
    return out;
  }

  // Tromp-Taylor area scoring: each color's score = stones on board + empty
  // points reachable only from that color. Komi added to white.
  function score(state, komi) {
    const cells = state.cells;
    let black = 0, white = 0;
    const visited = new Uint8Array(N);

    for (let i = 0; i < N; i++) {
      if (cells[i] === BLACK) black++;
      else if (cells[i] === WHITE) white++;
      else if (!visited[i]) {
        // Flood-fill the empty region and track which colors border it.
        const region = [];
        const stack = [i];
        visited[i] = 1;
        let touchesBlack = false, touchesWhite = false;
        while (stack.length) {
          const j = stack.pop();
          region.push(j);
          for (const n of NBRS[j]) {
            const v = cells[n];
            if (v === EMPTY) {
              if (!visited[n]) { visited[n] = 1; stack.push(n); }
            } else if (v === BLACK) {
              touchesBlack = true;
            } else if (v === WHITE) {
              touchesWhite = true;
            }
          }
        }
        if (touchesBlack && !touchesWhite) black += region.length;
        else if (touchesWhite && !touchesBlack) white += region.length;
        // dame (touches both or neither) → unscored
      }
    }
    const whiteFinal = white + (komi || 0);
    const margin = Math.abs(black - whiteFinal);
    const winner = black > whiteFinal ? BLACK : (whiteFinal > black ? WHITE : 0);
    return { black, white: whiteFinal, whiteBare: white, komi: komi || 0, winner, margin };
  }

  // Territory map (definite, Tromp-Taylor):
  //   returns Int8Array(81): 0 = stone or dame, BLACK = black territory,
  //   WHITE = white territory. "Definite" here means the empty region is
  //   reachable only from one color — same rule that drives final scoring.
  function territoryMap(cells) {
    const out = new Int8Array(N);
    const visited = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (cells[i] !== EMPTY || visited[i]) continue;
      const region = [];
      const stack = [i];
      visited[i] = 1;
      let touchesBlack = false, touchesWhite = false;
      while (stack.length) {
        const j = stack.pop();
        region.push(j);
        for (const n of NBRS[j]) {
          const v = cells[n];
          if (v === EMPTY) {
            if (!visited[n]) { visited[n] = 1; stack.push(n); }
          } else if (v === BLACK) touchesBlack = true;
          else if (v === WHITE) touchesWhite = true;
        }
      }
      if (touchesBlack && !touchesWhite) {
        for (const j of region) out[j] = BLACK;
      } else if (touchesWhite && !touchesBlack) {
        for (const j of region) out[j] = WHITE;
      }
    }
    return out;
  }

  // Influence map (estimated control of unsettled space):
  //   Dilation-style: each stone emits influence (black +SEED, white -SEED);
  //   over N iterations the value at every empty point becomes a weighted
  //   sum of neighbor values (stones stay clamped to ±SEED). Sign indicates
  //   the leading color; magnitude indicates confidence. Returns Float32Array
  //   of length 81, positive = black, negative = white, near-zero = dame.
  function influenceMap(cells, iterations) {
    const iters = iterations || 4;
    const SEED = 4;
    const SPREAD = 0.32;
    let inf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (cells[i] === BLACK) inf[i] = SEED;
      else if (cells[i] === WHITE) inf[i] = -SEED;
    }
    for (let k = 0; k < iters; k++) {
      const next = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        if (cells[i] === BLACK) { next[i] = SEED; continue; }
        if (cells[i] === WHITE) { next[i] = -SEED; continue; }
        let sum = inf[i];
        for (const n of NBRS[i]) sum += inf[n] * SPREAD;
        // Don't let influence run away past stone seed magnitude.
        if (sum > SEED) sum = SEED;
        else if (sum < -SEED) sum = -SEED;
        next[i] = sum;
      }
      inf = next;
    }
    return inf;
  }

  // Combined estimate: counts a point for a color if either (a) it's that
  // color's stone, (b) it's that color's definite territory, or (c) the
  // influence magnitude crosses INFLUENCE_THRESHOLD. Komi is added to white.
  // Returns { black, white, dame, territory: Int8Array, influence: Float32Array }.
  function controlEstimate(cells, komi, influenceThreshold) {
    const t = territoryMap(cells);
    const inf = influenceMap(cells, 4);
    const thr = influenceThreshold == null ? 0.6 : influenceThreshold;
    let black = 0, white = 0, dame = 0;
    for (let i = 0; i < N; i++) {
      if (cells[i] === BLACK) black++;
      else if (cells[i] === WHITE) white++;
      else if (t[i] === BLACK) black++;
      else if (t[i] === WHITE) white++;
      else if (inf[i] >  thr) black++;
      else if (inf[i] < -thr) white++;
      else dame++;
    }
    return {
      black,
      white: white + (komi || 0),
      whiteBare: white,
      komi: komi || 0,
      dame,
      territory: t,
      influence: inf,
    };
  }

  // Simple-eye heuristic: empty point i is an "eye" for color iff all
  // orthogonal neighbors are color (or edge), AND enough diagonal neighbors
  // are color (≥3 of 4 in middle; ≥all available on edge/corner). Used by
  // the AI to avoid filling its own eyes.
  function isEye(cells, i, color) {
    if (cells[i] !== EMPTY) return false;
    for (const n of NBRS[i]) {
      if (cells[n] !== color) return false;
    }
    const dg = DIAGS[i];
    const isEdge = dg.length < 4;
    let friendly = 0;
    for (const d of dg) {
      if (cells[d] === color) friendly++;
    }
    if (isEdge) return friendly === dg.length;
    return friendly >= 3;
  }

  global.GoBoard = {
    SIZE, N, EMPTY, BLACK, WHITE, PASS,
    idx, rc, opp, neighbors,
    groupOf, legalMove, tryPlay, play, pass: passMove,
    isGameOver, score, allLegalMoves, isEye, hashBoard,
    territoryMap, influenceMap, controlEstimate,
    create, clone,
  };
})(window);
