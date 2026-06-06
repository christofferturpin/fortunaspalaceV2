/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX MATCHER — 6×6 four-color match-3 board, swap-driven            │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ buildGrid()  (36 .tile divs into #match-grid)│
  │                          ├─ generateBoard()  (random, no initial 3-runs) │
  │                          ├─ render()                                     │
  │                          └─ updateHud()                                  │
  │                                                                          │
  │   click tile ─► onTileClick(r,c)                                         │
  │                   ├─ guard resolving || movesLeft<=0                     │
  │                   ├─ no selected → select cell                           │
  │                   ├─ same cell → deselect                                │
  │                   ├─ adjacent → attemptSwap(a,b)                         │
  │                   │      ├─ swap; if no blobs → unswap (free)            │
  │                   │      ├─ else moves--; resolveCascades() → payout     │
  │                   │      └─ Wallet.add(payout)                           │
  │                   └─ non-adjacent → re-select                            │
  │                                                                          │
  │   Match detection is FLOOD-FILL on 4-neighborhood. Threshold depends     │
  │   on context:                                                            │
  │     • Player swap → blobs of 3+ resolve (3s clear, just don't pay).      │
  │     • Cascade refill tiers → only blobs of 4+ auto-resolve. A 3-cluster  │
  │       formed by random drops sits on the board until the player extends  │
  │       it into a 4+ shape with a deliberate swap.                         │
  │   Depth-0 (swap tier) only resolves blobs that TOUCH the swapped cells   │
  │   — except stray 4+ blobs anywhere, which always resolve (per "any 4+    │
  │   on the board still resolves and pays"). A 3-blob unrelated to the      │
  │   swap stays put. Depth 1+: gravity-only cascade resolves 4+ blobs       │
  │   from falling tiles. When the cascade has nothing left to clear, a      │
  │   SINGLE refill drops new pieces into the top empties — that's the only  │
  │   refill per turn. Refill-formed blobs (3+ or 4+) sit until the player   │
  │   swaps to disrupt them next move.                                       │
  │   Payout (3-blobs clear free; pay scale starts at 4):                    │
  │     3 → 0   4 → 1×   5 → 2×   6 → 3×   7 → 4×   8 → 5×   9 → 6×          │
  │   Linear base = Σ wager × (blob.length - 3) for length >= 4.             │
  │   Cascade tiers diminish: 0.5^depth — chains still reward setup but     │
  │   long cascades don't outpace the moves spent earning them.             │
  │   (1, 0.5, 0.25, 0.125, …).                                              │
  │   NOTE: Candy-Crush specials (striped/wrapped/color bomb + their swap    │
  │   combos) are NOT YET wired. Planned follow-up.                          │
  │                                                                          │
  │   slot.js calls addMoves(n, wager) — wager from that spin's bet, kept    │
  │   as activeWager until the next addMoves overwrites it.                  │
  │   onMovesChange(fn) fires whenever movesLeft changes (used by slot to    │
  │   gate the bet input + SPIN button while moves are pending).             │
  │                                                                          │
  │   Exports (window.MatchboxMatcher):                                      │
  │     { init, addMoves, getMovesLeft, onMovesChange, COLORS, SIZE }        │
  │   External deps: window.Wallet (opt; payout on clears),                  │
  │                  window.MatchboxAudio (opt; tick/engage/clear/payout)    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIZE=6; COLORS=['red','blue','green','yellow']
  state: board[6][6]=color|null, movesLeft=0, activeWager=0, selected={r,c}|null, resolving=F, clearingCells=Set
  listeners: movesChangeListeners[]
  randColor()→str: COLORS[rnd*4]
  pickRefillColor(r,c)→str: filter COLORS to those that DON'T form a 4+ blob at (r,c); weighted-random among them (w *= REPEAT_BIAS=0.7 per same-color 4-neighbor). Guarantees no 4+ spawn on refill (with fallback if all colors would 4+).
  generateBoard(): rand fill 6×6; loop findBlobs(4) → re-roll first cell of each 4+ blob until none remain (3-clusters are fine at start)
  findBlobs(minSize=4)→[{indices[],length}]: BFS/DFS 4-neighborhood flood-fill ∀ unvisited cells; collect components size>=minSize. Called w/ 3 by swap-validity + depth-0 cascade, 4 by depth>=1 cascade tiers.
  gravityCompact(): ∀col → stack non-null down; top empties stay null (no refill mid-cascade)
  refillBoard()→bool: ∀null cell → pickRefillColor(r,c); ret didFill. Called from resolveCascades when no clearable blobs are left.
  payoutForLength(L,wager)→int: L<4→0; wager*(L-3)  // linear; 4→1,5→2,6→3,7→4,8→5,9→6
  cascadeTierMul(depth)→float: 0.5^depth  // depth-0 1.0, depth-1 0.5, depth-2 0.25, depth-3 0.125
  delay(ms)→Promise
  resolveCascades(swapCells:Set):async→{payout,longest,chains}: resolving=T; depth=0; loop{min=depth===0?3:4; blobs=findBlobs(min); depth==0&&swapCells→filter(b.len>=4||any i∈swapCells); blobs.empty→break; mul=0.6^depth; ∀blob in sequence: pay+=floor(*mul); clearingCells={blob.idx}; render; delay160; null cells; render; delay70; (next blob...). after all: gravityCompact; render; delay180; depth++}; delay280 (settle beat); refillBoard()→filled?delay220; resolving=F; ret  // sequenced clear, beat after cascade ends, then refill
  adjacent(a,b)→bool: |dr|+|dc|==1
  swap(a,b): board[a]↔board[b]
  notifyMovesChange(): ∀fn→fn(movesLeft)
  showPayout(payout,longest,chains): #match-payout.text=`+${payout}c${longest>=4?` · MATCH-${longest}`:''}${chains>=2?` · ${chains}-CHAIN`:''}`; add .show class
  attemptSwap(a,b):async: swap; aIdx,bIdx=…; swapCells=Set{aIdx,bIdx}; trigger=findBlobs(3).filter(any i∈swapCells in b.indices); trigger.empty→unswap+Audio?.noMatch+render; ret. Audio?.gearEngage; movesLeft--; updateHud; notifyMovesChange; render; delay 80; {payout,longest,chains}=resolveCascades(swapCells); longest>=3→Audio?.clear(longest); payout>0&&Wallet→Wallet.add(payout)+showPayout+Audio?.payout
  onTileClick(r,c): guard resolving||movesLeft<=0||board[r][c]==null; selected==null→select+render; same→deselect+render; adj→attemptSwap; non-adj→re-select+render
  render(): grid.locked=movesLeft<=0; ∀tile.className='tile tile-'+color (or tile-empty); add tile-selected if eq selected; add tile-clearing if idx∈clearingCells
  updateHud(): #moves-count.text=movesLeft
  addMoves(n,wager): movesLeft+=n; if wager>0→activeWager=wager; updateHud; notifyMovesChange; render
  getMovesLeft()→int
  onMovesChange(fn): listeners.push
  buildGrid(): create 36 .tile divs w/ click listeners
  init(): buildGrid; generateBoard; render; updateHud
  exports: global.MatchboxMatcher={init,addMoves,getMovesLeft,onMovesChange,COLORS,SIZE}; on DOMContentLoaded→init
*/
(function (global) {
  const SIZE = 6;
  const COLORS = ['red', 'blue', 'green', 'yellow'];

  const board = [];
  let movesLeft = 0;
  let activeWager = 0;
  let selected = null;
  let resolving = false;
  let clearingCells = new Set();
  const movesChangeListeners = [];

  function notifyMovesChange() {
    for (const fn of movesChangeListeners) {
      try { fn(movesLeft); } catch (e) { /* swallow */ }
    }
  }

  let payoutTimer = null;
  function showPayout(payout, longest, chains, jackpot) {
    const el = document.getElementById('match-payout');
    if (!el) return;
    const matchTag = longest >= 4 ? ` · RACHA-${longest}` : '';
    const chainTag = chains >= 2 ? ` · CADENA-${chains}` : '';
    const jpTag = jackpot > 0 ? ` · ¡PREMIO GORDO! +$${jackpot.toLocaleString()}` : '';
    el.textContent = `+$${payout}${matchTag}${chainTag}${jpTag}`;
    el.classList.add('show');
    el.classList.toggle('premio-gordo', jackpot > 0);
    if (payoutTimer) clearTimeout(payoutTimer);
    const hold = jackpot > 0 ? 3600 : 2200;
    payoutTimer = setTimeout(() => {
      el.classList.remove('show');
      el.classList.remove('premio-gordo');
    }, hold);
  }

  // Scale starts at length 4 but is HALVED across the board to keep matcher
  // payouts in line with slot wager. Half of (L-3)×bet, floored:
  //   4→bet/2, 5→bet, 6→1.5×bet, 7→2×bet, 8→2.5×bet, 9→3×bet.
  // 3-blobs still clear free. Cascade tier multiplier (0.5^depth) compounds —
  // chains pay 0.5, 0.25, 0.125 of their base per tier. Slightly steeper
  // than the prior 0.6^depth so long cascades don't pile up payout faster
  // than the player can spend the moves earning them.
  function payoutForLength(len, wager) {
    if (len < 4 || wager <= 0) return 0;
    return Math.floor(wager * (len - 3) / 2);
  }

  function randColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  // Refill color picker. Two layers:
  //   1. Hard constraint — never pick a color that would create a 4+ blob
  //      including the cell being filled. Refill cannot spawn an
  //      auto-resolving blob on the final stage.
  //   2. Soft bias — among the colors that pass (1), each color's weight is
  //      multiplied by REPEAT_BIAS for every adjacent (4-neighbor) cell
  //      already showing that color, gently nudging refills away from
  //      clustering even at the 3-blob level.
  // Fallback: if every color would create a 4+ (rare; requires the cell to
  // be surrounded by 3-clusters in all directions), fall back to the
  // unfiltered weighted pool.
  const REPEAT_BIAS = 0.7;
  function pickRefillColor(r, c) {
    const idx = r * SIZE + c;
    const weights = COLORS.map((color) => {
      let w = 1;
      const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (board[nr][nc] === color) w *= REPEAT_BIAS;
      }
      return w;
    });
    const candidates = [];
    for (let i = 0; i < COLORS.length; i++) {
      board[r][c] = COLORS[i];
      const wouldForm4 = findBlobs(4).some((blob) =>
        blob.indices.includes(idx)
      );
      if (!wouldForm4) candidates.push({ color: COLORS[i], weight: weights[i] });
    }
    board[r][c] = null;
    const pool = candidates.length > 0
      ? candidates
      : COLORS.map((color, i) => ({ color, weight: weights[i] }));
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * total;
    for (const p of pool) {
      roll -= p.weight;
      if (roll < 0) return p.color;
    }
    return pool[pool.length - 1].color;
  }

  function generateBoard() {
    board.length = 0;
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) row.push(randColor());
      board.push(row);
    }
    // Re-roll any starting 4+ blob — those would auto-resolve on the
    // player's first swap and look broken. 3-clusters are allowed to sit:
    // they're raw material the player can extend into a paying match.
    let safety = 400;
    while (safety-- > 0) {
      const blobs = findBlobs(4);
      if (blobs.length === 0) break;
      for (const blob of blobs) {
        const idx = blob.indices[0];
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        const old = board[r][c];
        let next;
        do { next = randColor(); } while (next === old);
        board[r][c] = next;
      }
    }
  }

  // Flood-fill match detection on 4-neighborhood. Any connected group of
  // same-color tiles with size >= minSize is collected as a blob. Default
  // minSize is 4 — used by cascade tiers and board generation, so random
  // refill 3-clusters don't auto-resolve. attemptSwap and the first cascade
  // tier (depth 0) call findBlobs(3): the player IS allowed to clear a 3,
  // they just don't get paid for it (payoutForLength returns 0 for L<4).
  function findBlobs(minSize) {
    const min = minSize == null ? 4 : minSize;
    const N = SIZE * SIZE;

    // ── Pass 1: identify pure-colored components (wild as barrier) so we
    //    can know each colored region's size + color before assigning wilds.
    const compId = new Array(N).fill(-1);
    const compSize = [];
    const compColor = [];
    {
      const seen = new Array(N).fill(false);
      for (let r0 = 0; r0 < SIZE; r0++) {
        for (let c0 = 0; c0 < SIZE; c0++) {
          const idx = r0 * SIZE + c0;
          if (seen[idx]) continue;
          const color = board[r0][c0];
          if (color == null || color === 'wild') { seen[idx] = true; continue; }
          const cid = compSize.length;
          let size = 0;
          const stack = [[r0, c0]];
          seen[idx] = true;
          while (stack.length) {
            const [r, c] = stack.pop();
            const i = r * SIZE + c;
            compId[i] = cid;
            size++;
            const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (const [nr, nc] of neighbors) {
              if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
              const ni = nr * SIZE + nc;
              if (seen[ni]) continue;
              if (board[nr][nc] !== color) continue;
              seen[ni] = true;
              stack.push([nr, nc]);
            }
          }
          compSize.push(size);
          compColor.push(color);
        }
      }
    }

    // ── Pass 2: each wild picks the color whose total adjacent-component
    //    size is largest. So a wild bridging two same-color regions joins
    //    THEIR color (which merges them). A wild between a small red blob
    //    and a big blue blob joins blue.
    const wildPref = new Map();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== 'wild') continue;
        const idx = r * SIZE + c;
        const scores = new Map();
        const counted = new Set();
        const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          const ni = nr * SIZE + nc;
          const cid = compId[ni];
          if (cid < 0) continue;
          if (counted.has(cid)) continue;
          counted.add(cid);
          const cl = compColor[cid];
          scores.set(cl, (scores.get(cl) || 0) + compSize[cid]);
        }
        let bestColor = null;
        let bestScore = -1;
        scores.forEach((s, cl) => {
          if (s > bestScore) { bestScore = s; bestColor = cl; }
        });
        if (bestColor !== null) wildPref.set(idx, bestColor);
      }
    }

    // ── Pass 3: real flood-fill. Each wild expands as part of its
    //    preferred color only. Adjacent wilds with matching prefs chain
    //    together, which can bridge two same-color components into one.
    const visited = new Array(N).fill(false);
    const blobs = [];
    for (let r0 = 0; r0 < SIZE; r0++) {
      for (let c0 = 0; c0 < SIZE; c0++) {
        const startIdx = r0 * SIZE + c0;
        if (visited[startIdx]) continue;
        const color = board[r0][c0];
        if (color == null) { visited[startIdx] = true; continue; }
        if (color === 'wild') continue; // wilds don't seed
        const cells = [];
        const stack = [[r0, c0]];
        visited[startIdx] = true;
        while (stack.length) {
          const [r, c] = stack.pop();
          cells.push(r * SIZE + c);
          const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            const ni = nr * SIZE + nc;
            if (visited[ni]) continue;
            const ncolor = board[nr][nc];
            if (ncolor == null) continue;
            const match = ncolor === color ||
                          (ncolor === 'wild' && wildPref.get(ni) === color);
            if (!match) continue;
            visited[ni] = true;
            stack.push([nr, nc]);
          }
        }
        if (cells.length >= min) blobs.push({ indices: cells, length: cells.length });
      }
    }
    return blobs;
  }

  // Compacts each column — survivors drop down, top empties stay null. New
  // pieces don't spawn here; refillBoard handles that after the cascade
  // chain finishes. Falling tiles can still align into new blobs and chain
  // another tier; the empties at the top just don't auto-fill mid-cascade.
  function gravityCompact() {
    for (let c = 0; c < SIZE; c++) {
      const stack = [];
      for (let r = 0; r < SIZE; r++) {
        if (board[r][c] !== null) stack.push(board[r][c]);
      }
      const empties = SIZE - stack.length;
      for (let r = 0; r < SIZE; r++) {
        board[r][c] = r < empties ? null : stack[r - empties];
      }
    }
  }

  // Fills every null cell with a fresh random tile. Called once at the end
  // of resolveCascades, after all the player-triggered clearing settles —
  // so new pieces only "drop in" after the cycle is over. Returns true iff
  // any cell was filled. Refill-formed blobs are NOT auto-cleared (player
  // has to swap to disrupt them on the next move).
  function refillBoard() {
    let filled = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] == null) {
          board[r][c] = pickRefillColor(r, c);
          filled = true;
        }
      }
    }
    return filled;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Candy-Crush-style cascade: find every blob anywhere on the board, clear
  // it, drop+spawn, check again. Repeats until no more blobs exist. The
  // 0.6^depth tier multiplier still applies to keep EV bounded on long
  // chains; tier-0 (the swap-triggered match) pays full, each cascade tier
  // after pays half / quarter / ...
  async function resolveCascades(swapCells, spawnWild) {
    resolving = true;
    let totalPayout = 0;
    let longest = 0;
    let depth = 0;
    let jackpotWon = 0;
    const jackpotTrigger = (global.MatchboxJackpot && global.MatchboxJackpot.TRIGGER_BLOB) || 7;
    // Cascade loop. Within each tier, blobs are SEQUENCED — one clears, a
    // brief pause, the next clears, etc. — so the player can watch the
    // chain happen instead of everything vanishing in one frame. After all
    // blobs in a tier are gone, gravity drops the survivors. No refill
    // mid-chain.
    while (true) {
      const minSize = depth === 0 ? 3 : 4;
      let blobs = findBlobs(minSize);
      if (depth === 0 && swapCells) {
        blobs = blobs.filter((blob) =>
          blob.length >= 4 || blob.indices.some((i) => swapCells.has(i))
        );
      }
      if (blobs.length === 0) break;

      const tierMul = Math.pow(0.5, depth);
      // One blob at a time: flash → null → brief hold → next blob.
      for (const blob of blobs) {
        // Wilds bridge matches but don't pad payout — count only colored
        // cells toward the paying length. A red-red-wild-red (length 4) is
        // effectively a 3 for payout and pays nothing; a red-red-red-wild-red
        // (length 5) pays as a 4-blob.
        let wildCount = 0;
        for (const idx of blob.indices) {
          const rr = Math.floor(idx / SIZE);
          const cc = idx % SIZE;
          if (board[rr][cc] === 'wild') wildCount++;
        }
        const payLen = blob.length - wildCount;
        const base = payoutForLength(payLen, activeWager);
        totalPayout += Math.floor(base * tierMul);
        if (blob.length > longest) longest = blob.length;

        // El Premio Gordo — first blob in the cascade that's TRIGGER_BLOB+
        // long claims the entire accumulated jackpot. Only one claim per
        // swap; subsequent big blobs just play normally.
        if (jackpotWon === 0 && blob.length >= jackpotTrigger && global.MatchboxJackpot) {
          jackpotWon = global.MatchboxJackpot.claim();
        }

        clearingCells = new Set(blob.indices);
        render();
        await delay(160);

        clearingCells = new Set();
        blob.indices.forEach((idx) => {
          const r = Math.floor(idx / SIZE);
          const c = idx % SIZE;
          board[r][c] = null;
        });
        render();
        await delay(70);
      }

      // After every blob in this tier has cleared, drop survivors.
      gravityCompact();
      render();
      await delay(180);
      depth++;
    }

    // Pause once the cascade is fully settled so the player can read the
    // post-chain board (gaps and survivors) before new pieces drop in.
    await delay(280);

    // Single refill, only after the cascade has fully resolved. Refill-
    // formed blobs are NOT auto-cleared — they sit until the player swaps
    // to disrupt them next move.
    const filled = refillBoard();
    if (filled) {
      render();
      await delay(220);
    }
    // Double-match reward: the swap produced 2+ blobs (≥3 each) touching
    // the swap cells, so drop a wild into one of the swap positions. The
    // wild matches any color in future flood-fills until it's cleared.
    if (spawnWild && swapCells) {
      const swapArr = Array.from(swapCells);
      const wildIdx = swapArr[Math.floor(Math.random() * swapArr.length)];
      const wr = Math.floor(wildIdx / SIZE);
      const wc = wildIdx % SIZE;
      board[wr][wc] = 'wild';
      render();
      await delay(260);
    }
    resolving = false;
    render();
    return { payout: totalPayout, longest, chains: depth, jackpot: jackpotWon };
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function swap(a, b) {
    const tmp = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = tmp;
  }

  async function attemptSwap(a, b) {
    const audio = global.MatchboxAudio;
    swap(a, b);
    const aIdx = a.r * SIZE + a.c;
    const bIdx = b.r * SIZE + b.c;
    const swapCells = new Set([aIdx, bIdx]);
    // Valid only if the swap itself produces a blob touching one of the
    // swapped cells. A stray pre-existing 3-blob elsewhere does NOT make
    // the swap legal — keeps the player from clicking randomly to clear
    // someone else's leftover cluster.
    const triggerBlobs = findBlobs(3).filter((blob) =>
      blob.indices.some((i) => swapCells.has(i))
    );
    if (triggerBlobs.length === 0) {
      swap(a, b);
      if (audio) audio.noMatch();
      render();
      return;
    }
    // Two or more simultaneous blobs (≥3 each) from a single swap → reward
    // the player with a wild dropped onto one of the swap cells after the
    // cascade settles.
    const spawnWild = triggerBlobs.length >= 2;
    if (audio) audio.gearEngage();
    movesLeft = Math.max(0, movesLeft - 1);
    updateHud();
    render();
    await delay(80);
    const { payout, longest, chains, jackpot } = await resolveCascades(swapCells, spawnWild);
    if (audio && longest >= 3) audio.clear(longest);
    const totalWin = payout + (jackpot || 0);
    if (totalWin > 0 && global.Wallet && global.Wallet.add) {
      global.Wallet.add(totalWin);
      showPayout(payout, longest, chains, jackpot);
      if (audio) audio.payout(totalWin);
    }
    // Hold the match panel bright while the BIG SHOW payout banner is up.
    // Jackpots get a longer hold so the player can read ¡PREMIO GORDO!.
    const hold = jackpot > 0 ? 3000 : (payout > 0 ? 1600 : 400);
    await delay(hold);
    saveState();
    notifyMovesChange();
  }

  function onTileClick(r, c) {
    if (resolving || movesLeft <= 0) return;
    if (board[r] == null || board[r][c] == null) return;
    const here = { r, c };
    const audio = global.MatchboxAudio;
    if (!selected) {
      selected = here;
      if (audio) audio.gearTick();
      render();
      return;
    }
    if (selected.r === r && selected.c === c) {
      selected = null;
      if (audio) audio.gearTick();
      render();
      return;
    }
    if (adjacent(selected, here)) {
      const a = selected;
      selected = null;
      attemptSwap(a, here);
      return;
    }
    selected = here;
    if (audio) audio.gearTick();
    render();
  }

  function render() {
    const grid = document.getElementById('match-grid');
    if (!grid) return;
    grid.classList.toggle('locked', movesLeft <= 0);
    const tiles = grid.children;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = tiles[r * SIZE + c];
        if (!tile) continue;
        const color = board[r] && board[r][c];
        tile.className = 'tile ' + (color ? 'tile-' + color : 'tile-empty');
        if (selected && selected.r === r && selected.c === c) {
          tile.classList.add('tile-selected');
        }
        if (clearingCells.has(r * SIZE + c)) {
          tile.classList.add('tile-clearing');
        }
      }
    }
  }

  function updateHud() {
    const el = document.getElementById('moves-count');
    if (el) el.textContent = String(movesLeft);
  }

  function buildGrid() {
    const grid = document.getElementById('match-grid');
    if (!grid || grid.children.length) return;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.addEventListener('click', () => onTileClick(r, c));
        grid.appendChild(tile);
      }
    }
  }

  function addMoves(n, wager) {
    movesLeft += n;
    if (typeof wager === 'number' && wager > 0) activeWager = wager;
    updateHud();
    notifyMovesChange();
    render();
    saveState();
  }

  function getMovesLeft() {
    return movesLeft;
  }

  function onMovesChange(fn) {
    if (typeof fn === 'function') movesChangeListeners.push(fn);
  }

  // Persisted across sessions so the player can leave mid-round and come back
  // to the same board, the same wilds in the same cells, and the same wager
  // attached to whatever moves they hadn't spent yet.
  const STORAGE_KEY = 'wendys_palace_matchbox';
  const STORAGE_VERSION = 1;

  function saveState() {
    try {
      const payload = {
        v: STORAGE_VERSION,
        board: board,
        movesLeft: movesLeft,
        activeWager: activeWager,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) { /* quota or unavailable — silently skip */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== STORAGE_VERSION) return false;
      if (!Array.isArray(data.board) || data.board.length !== SIZE) return false;
      for (let r = 0; r < SIZE; r++) {
        if (!Array.isArray(data.board[r]) || data.board[r].length !== SIZE) return false;
      }
      board.length = 0;
      for (let r = 0; r < SIZE; r++) {
        const row = [];
        for (let c = 0; c < SIZE; c++) row.push(data.board[r][c]);
        board.push(row);
      }
      movesLeft = typeof data.movesLeft === 'number' ? data.movesLeft : 0;
      activeWager = typeof data.activeWager === 'number' ? data.activeWager : 0;
      return true;
    } catch (e) {
      return false;
    }
  }

  function init() {
    buildGrid();
    if (!loadState()) {
      generateBoard();
      saveState();
    }
    render();
    updateHud();
    notifyMovesChange();
  }

  global.MatchboxMatcher = {
    init,
    addMoves,
    getMovesLeft,
    onMovesChange,
    COLORS,
    SIZE,
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
