/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GO AI  —  four-level heuristic ladder for 9×9  (with RAVE)              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Pure module. Consumes GoBoard. Plays as the side whose turn it is in   │
  │   the passed state (typically WHITE).                                    │
  │                                                                          │
  │   Levels (matching wager mults 2×/4×/8×/16×):                            │
  │     1 ROADIE    random + capture-greedy                                  │
  │     2 OPENER    UCT-RAVE tree search, 200 simulations                    │
  │     3 DRUMMER   UCT-RAVE tree search, 700 simulations                    │
  │     4 HEADLINER UCT-RAVE tree search, 1800 simulations                   │
  │                                                                          │
  │   What changed (v2): tree search is now UCT + RAVE (Rapid Action Value   │
  │   Estimation, a.k.a. AMAF — All Moves As First). Pure UCT only learns    │
  │   about a move by playing it directly from a given node — at 1,800 sims │
  │   spread across ~50 candidate moves per node, most moves get fewer than  │
  │   30 visits, which is statistical noise. RAVE asks a richer question:    │
  │   "in playouts descending from this position, when point P was played    │
  │   *anywhere later* by the player to move, how often did they win?" That  │
  │   move now has hundreds of samples instead of dozens. The AMAF estimate  │
  │   is biased (a move good *later* isn't always good *now*) so it's        │
  │   blended with the true visit stats via β = √(k / (3·v + k)), starting   │
  │   AMAF-heavy and fading to pure UCT as real visits accumulate. Net       │
  │   result on 9×9: typically +250–400 Elo at these sim budgets for ~15%   │
  │   per-sim overhead.                                                      │
  │                                                                          │
  │   UCT (Upper Confidence bounds applied to Trees) descends the tree by    │
  │   max(win_rate + C·√(ln N_parent / N_child)) — exploits the best line    │
  │   while still exploring rivals. RAVE adds a second value estimate (the   │
  │   AMAF win rate) blended in via β. Rollouts use the smart policy below   │
  │   (capture > save-atari > atari > safe-random) so each simulation        │
  │   approximates real play. Why MCTS not minimax: positional eval mid-     │
  │   game is unreliable (most empty space touches both colors), so a        │
  │   minimax leaf score is noise. Simulating to game end and counting       │
  │   wins gives a far more honest signal.                                   │
  │                                                                          │
  │   Resign / pass policy:                                                  │
  │     Pass — when there are no non-eye-filling legal moves OR opp already  │
  │       passed and we're ahead by >3 (closes the game out).                │
  │     Resign (RESIGN sentinel) — L3+ ONLY (lower ranks aren't aware        │
  │       enough to know they're beat). After move 25, run 150 quick         │
  │       playouts; if win rate < 0.10 (~90% sure of losing) we concede.     │
  │       (Was 60 — bumped for variance: σ on 60 trials of Bernoulli(0.1)    │
  │       is ~3.9%, so resign was flipping on edge positions. 150 halves    │
  │       it for ~50ms more compute.)                                        │
  │       page.js converts this into an ai_resign game-end (player wins).    │
  │                                                                          │
  │   API (window.GoAI):                                                     │
  │     chooseMove(state, level, opts?) ──► Promise<int|PASS|RESIGN>         │
  │     RESIGN                          ──► sentinel constant (= -2)         │
  │                                                                          │
  │   External deps: GoBoard                                                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
*/
(function (global) {
  const G = global.GoBoard;
  if (!G) { console.warn('GoAI: GoBoard not loaded'); return; }
  const { EMPTY, BLACK, WHITE, PASS, N, SIZE } = G;
  const KOMI = 6.5;

  // Macrotask yield — gives setTimeout/Audio/etc. a chance to fire mid-
  // search so the sequencer keeps playing while UCT crunches.
  function nextTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  const RESIGN = -2;
  const RESIGN_AFTER_MOVE = 25;
  const RESIGN_THRESHOLD  = 0.10;
  const RESIGN_PLAYOUTS   = 150;   // bumped from 60 — variance reduction
  const RESIGN_MAX_PLIES  = 40;

  // RAVE equivalence parameter — controls how fast the AMAF estimate
  // gives way to the real-visit estimate. At visits = k/3 the two are
  // weighted equally. k=1000 is the Gelly & Silver default for 9×9.
  const RAVE_K = 1000;

  // UCT exploration constant. Lower than the classic √2 (1.414) because
  // RAVE already does a lot of broad exploration via AMAF — we don't need
  // as much explicit exploration on top.
  const UCT_C = 1.1;

  function rng() { return Math.random(); }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function centerDist(i) {
    const r = (i / SIZE) | 0, c = i % SIZE;
    const mid = (SIZE - 1) / 2;
    return Math.abs(r - mid) + Math.abs(c - mid);
  }

  function countColor(cells, color) {
    let c = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] === color) c++;
    return c;
  }

  // ─── Heuristic scoring (unchanged) ──────────────────────────────────────
  function scoreMoveHeuristic(state, i, color) {
    if (!G.legalMove(state, i)) return -Infinity;
    if (G.isEye(state.cells, i, color)) return -100;

    const before = state;
    const after = G.tryPlay(before, i);
    if (!after) return -Infinity;

    let s = 0;

    const beforeStones = countColor(before.cells, G.opp(color));
    const afterStones = countColor(after.cells, G.opp(color));
    const captured = beforeStones - afterStones;
    s += captured * 14;

    const enemy = G.opp(color);
    const enemySeen = new Set();
    for (const n of G.neighbors(i)) {
      if (after.cells[n] === enemy && !enemySeen.has(n)) {
        const g = G.groupOf(after.cells, n);
        for (const s2 of g.stones) enemySeen.add(s2);
        if (g.libs.size === 1) s += 6 * g.stones.size;
        else if (g.libs.size === 2) s += 1.2;
      }
    }

    const ownGroup = G.groupOf(after.cells, i);
    if (ownGroup.libs.size === 1) s -= 9 * ownGroup.stones.size;
    else if (ownGroup.libs.size === 2) s -= 1.4;
    else if (ownGroup.libs.size >= 4) s += 0.6;
    else s += 0.3;

    const ownSeen = new Set();
    for (const n of G.neighbors(i)) {
      if (before.cells[n] === color && !ownSeen.has(n)) {
        const gb = G.groupOf(before.cells, n);
        for (const s2 of gb.stones) ownSeen.add(s2);
        if (gb.libs.size === 1) {
          if (ownGroup.libs.size >= 2) s += 7 * gb.stones.size;
        } else if (gb.libs.size === 2) {
          if (ownGroup.libs.size >= 3) s += 1 * gb.stones.size;
        }
      }
    }

    if (ownSeen.size > 1 && ownGroup.libs.size >= 3) {
      s += 1.5;
    }

    if (state.moveNum < 14) {
      const r = (i / SIZE) | 0, c = i % SIZE;
      const edge = Math.min(r, SIZE - 1 - r, c, SIZE - 1 - c);
      if (edge === 0) s -= 2.0;
      else if (edge === 1) s -= 0.4;
      else if (edge === 2) s += 0.8;
      else if (edge === 3) s += 0.4;
      s += (8 - centerDist(i)) * 0.10;
    }

    s += rng() * 0.4;
    return s;
  }

  function evalForColor(state, color) {
    const s = G.score(state, KOMI);
    const mine = color === BLACK ? s.black : s.white;
    const theirs = color === BLACK ? s.white : s.black;
    return mine - theirs;
  }

  // ─── Rollout policy (unchanged behavior, atari bumped 0.85 → 0.95) ──────
  function rolloutPolicy(state) {
    const color = state.toMove;
    const enemy = G.opp(color);
    const legal = G.allLegalMoves(state);
    if (!legal.length) return PASS;

    const playable = [];
    for (const i of legal) if (!G.isEye(state.cells, i, color)) playable.push(i);
    const pool = playable.length ? playable : legal;
    if (!pool.length) return PASS;

    // 1. Captures.
    const captures = [];
    for (const i of pool) {
      for (const n of G.neighbors(i)) {
        if (state.cells[n] === enemy) {
          const g = G.groupOf(state.cells, n);
          if (g.libs.size === 1 && g.libs.has(i)) { captures.push(i); break; }
        }
      }
    }
    if (captures.length) return captures[(rng() * captures.length) | 0];

    // 2. Saves.
    const saves = [];
    for (const i of pool) {
      let savesSomeone = false;
      for (const n of G.neighbors(i)) {
        if (state.cells[n] === color) {
          const g = G.groupOf(state.cells, n);
          if (g.libs.size === 1 && g.libs.has(i)) { savesSomeone = true; break; }
        }
      }
      if (!savesSomeone) continue;
      const after = G.tryPlay(state, i);
      if (!after) continue;
      const own = G.groupOf(after.cells, i);
      if (own.libs.size >= 2) saves.push(i);
    }
    if (saves.length) return saves[(rng() * saves.length) | 0];

    // 3. Ataris — bumped from 0.85 to 0.95. With RAVE doing broad
    // generalization, we want playout *accuracy* over playout diversity.
    const ataris = [];
    for (const i of pool) {
      for (const n of G.neighbors(i)) {
        if (state.cells[n] === enemy) {
          const g = G.groupOf(state.cells, n);
          if (g.libs.size === 2 && g.libs.has(i)) { ataris.push(i); break; }
        }
      }
    }
    if (ataris.length && rng() < 0.95) {
      return ataris[(rng() * ataris.length) | 0];
    }

    // 4. Safe random.
    const safe = [];
    for (const i of pool) {
      let neighborEmpties = 0;
      let mergesAtari = true;
      for (const n of G.neighbors(i)) {
        if (state.cells[n] === EMPTY) neighborEmpties++;
        else if (state.cells[n] === color) {
          const g = G.groupOf(state.cells, n);
          if (g.libs.size >= 2) { mergesAtari = false; break; }
        }
      }
      if (neighborEmpties >= 2 || !mergesAtari) safe.push(i);
    }
    const choices = safe.length ? safe : pool;
    return choices[(rng() * choices.length) | 0];
  }

  // ─── Playout with move trace for RAVE ───────────────────────────────────
  //
  // For RAVE we need to know, for each board point, the COLOR of the first
  // player to play there during the playout. Why first-only: a point can
  // be played, captured, and replayed — those are different tactical
  // situations and shouldn't share AMAF stats. We track this with two
  // Int8Arrays sized N. Reused across playouts (reset each time) to avoid
  // GC pressure.
  //
  // Buffers are module-scoped so a single L4 search reuses them across all
  // 1,800 sims instead of allocating fresh.
  const _playoutFirstMover = new Int8Array(N); // 0 = unplayed, else BLACK/WHITE
  const _playoutMoves      = new Int32Array(N); // list of points played (in order)

  function playRandomGameWithTrace(startState, maxPlies) {
    // Reset trace.
    for (let i = 0; i < N; i++) _playoutFirstMover[i] = 0;
    let traceLen = 0;

    let s = startState;
    let plies = 0;
    while (!G.isGameOver(s) && plies < maxPlies) {
      const mover = s.toMove;
      const m = rolloutPolicy(s);
      let next;
      if (m === PASS) {
        next = G.pass(s);
      } else {
        next = G.tryPlay(s, m);
        if (!next) { next = G.pass(s); }
        else if (_playoutFirstMover[m] === 0) {
          // Record first-occurrence only.
          _playoutFirstMover[m] = mover;
          _playoutMoves[traceLen++] = m;
        }
      }
      s = next;
      plies++;
    }
    const result = G.score(s, KOMI);
    result._traceLen = traceLen;
    // Return _playoutFirstMover and _playoutMoves implicitly via module
    // scope — caller reads them before the next playout overwrites.
    return result;
  }

  // Plain playout (no trace) — used for resign assessment where AMAF
  // tracking is wasted overhead.
  function playRandomGame(startState, maxPlies) {
    let s = startState;
    let plies = 0;
    while (!G.isGameOver(s) && plies < maxPlies) {
      const m = rolloutPolicy(s);
      let next = m === PASS ? G.pass(s) : (G.tryPlay(s, m) || G.pass(s));
      s = next;
      plies++;
    }
    return G.score(s, KOMI);
  }

  async function assessWinRate(state, color, playouts, maxPlies) {
    let wins = 0;
    for (let k = 0; k < playouts; k++) {
      if (k > 0 && (k % 8) === 0) await nextTick();
      const result = playRandomGame(state, maxPlies);
      if (result.winner === color) wins++;
    }
    return wins / playouts;
  }

  // ─── UCT-RAVE tree ──────────────────────────────────────────────────────
  //
  // Each node now carries two Float32Arrays sized N for AMAF stats. These
  // are only allocated once a node is actually selected for expansion (lazy)
  // because most expanded children get few or zero visits and don't need
  // the memory.
  //
  // amafVisits[p] = total playouts (descending from this node) in which
  //                 point p was played later by this node's player-to-move
  // amafWins[p]   = subset of those where that player won the game
  //
  // The blended UCT-RAVE score for a child c with parent node n:
  //   v   = c.visits
  //   av  = n.amafVisits[c.move]  (AMAF lives on the PARENT, indexed by child move)
  //   β   = sqrt(RAVE_K / (3·v + RAVE_K))
  //   mc  = v > 0 ? c.wins / c.visits : 0
  //   amaf = av > 0 ? n.amafWins[c.move] / av : 0
  //   exploit = (1 - β) · mc + β · amaf
  //   explore = UCT_C · sqrt(ln(n.visits) / max(v, 1))
  //   score   = exploit + explore
  //
  // Unvisited children with no AMAF data fall back to a high default (just
  // return them, same as plain UCT) to force at least one direct sim.

  function makeNode(state, move, parent) {
    return {
      state, move, parent,
      children: [],
      untried: null,
      visits: 0,
      wins: 0,
      // AMAF tables, lazy — only allocated when we expand from this node.
      amafVisits: null,
      amafWins: null,
    };
  }

  function ensureAmaf(node) {
    if (node.amafVisits === null) {
      node.amafVisits = new Float32Array(N);
      node.amafWins   = new Float32Array(N);
    }
  }

  function expandIfNeeded(node) {
    if (node.untried !== null) return;
    if (G.isGameOver(node.state)) { node.untried = []; return; }
    const cells = node.state.cells;
    const mover = node.state.toMove;
    const moves = [];
    for (let i = 0; i < N; i++) {
      if (cells[i] !== EMPTY) continue;
      if (G.isEye(cells, i, mover)) continue;
      if (G.legalMove(node.state, i)) moves.push(i);
    }
    if (moves.length === 0) moves.push(PASS);
    shuffle(moves);
    node.untried = moves;
  }

  function uctRaveSelect(node) {
    const lnN = Math.log(node.visits);
    let best = null, bestScore = -Infinity;
    for (const c of node.children) {
      if (c.visits === 0) return c;

      const v = c.visits;
      const mc = c.wins / v;

      // AMAF lookup — parent stores AMAF indexed by child move.
      let amafTerm, beta;
      if (c.move !== PASS && node.amafVisits !== null && node.amafVisits[c.move] > 0) {
        const av = node.amafVisits[c.move];
        const amaf = node.amafWins[c.move] / av;
        beta = Math.sqrt(RAVE_K / (3 * v + RAVE_K));
        amafTerm = (1 - beta) * mc + beta * amaf;
      } else {
        amafTerm = mc;
      }

      const explore = UCT_C * Math.sqrt(lnN / v);
      const score = amafTerm + explore;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  async function uctSearch(rootState, perspective, simulations, maxPlies) {
    const root = makeNode(rootState, null, null);

    for (let s = 0; s < simulations; s++) {
      if (s > 0 && (s % 20) === 0) await nextTick();

      // 1. SELECTION + 2. EXPANSION — track the path so backprop can do
      // AMAF updates at every level.
      const path = [root];
      let node = root;

      while (true) {
        if (G.isGameOver(node.state)) break;
        expandIfNeeded(node);
        if (node.untried.length > 0) {
          ensureAmaf(node); // we're about to need AMAF tables here
          const move = node.untried.pop();
          const next = move === PASS
            ? G.pass(node.state)
            : (G.tryPlay(node.state, move) || G.pass(node.state));
          const child = makeNode(next, move, node);
          node.children.push(child);
          node = child;
          path.push(node);
          break;
        }
        if (node.children.length === 0) break;
        node = uctRaveSelect(node);
        path.push(node);
      }

      // 3. SIMULATION — smart-policy playout, with move trace recorded into
      // _playoutFirstMover / _playoutMoves for AMAF backprop.
      const result = playRandomGameWithTrace(node.state, maxPlies);
      const winner = result.winner;

      // 4. BACKPROP — at each node on the path:
      //    (a) update visits/wins (standard UCT)
      //    (b) for each move played in the playout by THAT NODE'S player-
      //        to-move, update the parent's AMAF table for that move
      //
      // Step (b) is the RAVE update. We also need to fold in the moves
      // ALREADY MADE in the tree path itself, because those are part of
      // the same "future" relative to ancestor nodes. We handle this by
      // walking the path in order and, for each ancestor, considering
      // both the tree-path moves below it AND the playout moves as
      // candidates — but only if they match the ancestor's player-to-move.

      // For efficiency: precompute "for each color, which points appeared
      // in the playout?" using _playoutFirstMover. The path moves are
      // walked inline.
      //
      // We also need each ancestor to know which moves were LEGAL from its
      // state — illegal moves shouldn't get AMAF credit there. We do a
      // cheap legality proxy: only count points that were EMPTY in the
      // ancestor's state. That's not perfectly precise (it admits some
      // suicide/ko moves) but it's ~99% correct and avoids per-update
      // legality checks (which would dominate runtime).

      for (let p = 0; p < path.length; p++) {
        const cur = path[p];
        cur.visits++;
        if (cur.parent) {
          const lastMover = G.opp(cur.state.toMove);
          if (winner === lastMover) cur.wins++;
        }

        // AMAF update: only if this node has children we expanded from
        // (i.e., its AMAF tables exist). For each point played LATER in
        // the tree path or in the playout by cur's player-to-move, credit.
        if (cur.amafVisits !== null) {
          const moverHere = cur.state.toMove;
          const cellsHere = cur.state.cells;
          const moverWon = (winner === moverHere);

          // Tree-path moves below this node.
          for (let q = p + 1; q < path.length; q++) {
            const m = path[q].move;
            if (m === null || m === PASS || m === undefined) continue;
            // Was this point empty in cur's state? (cheap legality proxy)
            if (cellsHere[m] !== EMPTY) continue;
            // Whose move was it? Player to move at path[q-1] played m.
            const playedBy = path[q - 1].state.toMove;
            if (playedBy !== moverHere) continue;
            cur.amafVisits[m] += 1;
            if (moverWon) cur.amafWins[m] += 1;
          }

          // Playout moves.
          const traceLen = result._traceLen;
          for (let t = 0; t < traceLen; t++) {
            const m = _playoutMoves[t];
            if (_playoutFirstMover[m] !== moverHere) continue;
            if (cellsHere[m] !== EMPTY) continue;
            // Skip if already credited via the tree-path loop above
            // (would double-count). The tree-path loop only touches points
            // that are in `path` and empty in cur — playout points are by
            // construction not in `path` (those were tree moves), so no
            // overlap to worry about.
            cur.amafVisits[m] += 1;
            if (moverWon) cur.amafWins[m] += 1;
          }
        }
      }
    }

    if (!root.children.length) return PASS;
    // Robust child rule — most visited wins, ties broken by win rate.
    let best = root.children[0];
    for (const c of root.children) {
      if (c.visits > best.visits) best = c;
      else if (c.visits === best.visits && c.visits > 0 &&
               (c.wins / c.visits) > (best.wins / best.visits)) {
        best = c;
      }
    }
    return best.move;
  }

  async function chooseMove(state, level, opts) {
    opts = opts || {};
    const color = state.toMove;
    const legal = G.allLegalMoves(state);
    const nonEye = legal.filter((i) => !G.isEye(state.cells, i, color));

    if (level >= 3 && state.moveNum >= RESIGN_AFTER_MOVE && nonEye.length) {
      const winRate = await assessWinRate(state, color, RESIGN_PLAYOUTS, RESIGN_MAX_PLIES);
      if (winRate < RESIGN_THRESHOLD) return RESIGN;
    }

    if (state.passes >= 1) {
      const cur = G.score(state, KOMI);
      const myArea = color === BLACK ? cur.black : cur.white;
      const oppArea = color === BLACK ? cur.white : cur.black;
      if (myArea > oppArea + 3) return PASS;
    }

    if (!nonEye.length) return PASS;

    if (level <= 1) {
      const enemy = G.opp(color);
      const caps = [];
      for (const i of nonEye) {
        for (const n of G.neighbors(i)) {
          if (state.cells[n] === enemy) {
            const g = G.groupOf(state.cells, n);
            if (g.libs.size === 1 && g.libs.has(i)) { caps.push(i); break; }
          }
        }
      }
      const pool = caps.length ? caps : nonEye;
      return pool[(rng() * pool.length) | 0];
    }

    const SIM_BUDGET = { 2: 200, 3: 700, 4: 1800 };
    const sims     = opts.simulations || SIM_BUDGET[level] || 400;
    const maxPlies = opts.maxPlies || 60;
    return await uctSearch(state, color, sims, maxPlies);
  }

  global.GoAI = { chooseMove, KOMI, RESIGN };
})(window);