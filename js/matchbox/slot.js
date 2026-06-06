/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX SLOT — 3×3 reels turn paylines into matcher moves              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ buildGrid()  (9 .cell divs into #slot-grid)  │
  │                          ├─ paintInitial() (random glyphs)               │
  │                          ├─ bind  #spin-btn  ─► spin()                   │
  │                          ├─ bind  #bet-amount input/change ─► syncBet    │
  │                          ├─ bind  #bet-max click ─► setBetToBalance      │
  │                          ├─ Wallet.onChange      ─► renderBetUI          │
  │                          ├─ Matcher.onMovesChange ─► refreshSpinAvail    │
  │                          └─ renderBetUI; refreshSpinAvail                │
  │                                                                          │
  │   click spin ─► spin()                                                   │
  │                  ├─ bet = readBetInput()                                 │
  │                  ├─ Wallet.spend(bet)         ◄── aborts if false        │
  │                  ├─ Child.recordPlay()  (decay clock; optional dep)      │
  │                  ├─ rollReels() ──► sym[9]  (rollSymbol × 9, weighted)   │
  │                  ├─ animateSpin(reels) ──► tumble 3 cols, set glyph+col  │
  │                  ├─ detectHits(reels) ──► {moves, blobIndices,           │
  │                  │     yellowIndices, yellowCount, wagerBonus}           │
  │                  │   - moves = Σ (size-2) over 4-neighbor non-nada       │
  │                  │     blobs >=3 (blue+yellow both count for adjacency)  │
  │                  │   - wagerBonus = 0.5*(1-0.5^yellowCount)  (max ×1.5)  │
  │                  ├─ highlightWins → .cell-win on the blob,               │
  │                  │     .cell-bonus on each yellow (stacks if in blob)    │
  │                  ├─ effectiveWager = ceil(bet × (1 + wagerBonus))        │
  │                  └─ MatchboxMatcher.addMoves(moves, effectiveWager)      │
  │                       only if moves>0; yellow without blue is wasted     │
  │                                                                          │
  │   While moves > 0 the bet input + SPIN are disabled (one wager per       │
  │   match cycle). refreshSpinAvail recomputes after Wallet/Matcher events. │
  │   Wager is a $10-minimum, $10-step machine. readBetInput rounds the      │
  │   user's typed value UP to the next multiple of WAGER_STEP (10), and     │
  │   floors at MIN_WAGER (10). MAX button uses floor(balance/10)*10.        │
  │                                                                          │
  │   Exports (window.MatchboxSlot): { init, SYMBOLS }                       │
  │   External deps: window.Wallet (req), window.MatchboxMatcher (req),      │
  │     window.MatchboxAudio (opt, SFX), window.Child (opt)                  │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SYMBOLS=[{id:'nada'|'blue'|'yellow',glyph,weight}*3]
    nada 70 (filler); blue 25 (touching pays moves); yellow 5 (wager booster) — tuned for ~1/3 hit rate, ~+5% EV target
  TOTW=Σweight; CONSO=0  // no consolation — burnt wager on no-hit
  state: spinning=false
  rollSymbol()→sym: r=rnd*TOTW; ∀s∈SYMBOLS{r-=s.w; r<0→ret s}; ret last
  rollReels()→sym[9]
  detectHits(reels)→{moves,blobIndices[],yellowIndices[],yellowCount,wagerBonus}:
    pass1 collect yellow positions; yellowCount=ys.len; wagerBonus = ys>0 ? 0.5*(1-0.5^ys) : 0  // max +50%
    pass2 4-neighbor flood-fill non-nada cells (blue+yellow); ∀blob size>=3 → moves+=(size-2), append cells to blobIndices
  paintCell(cell,sym): cell.text=glyph; cell.dataset.color=id; cell.style.color=`var(--mb-${id})`
  animateSpin(final)→Promise: 3 cols tumble@60ms stop@[600,900,1200]ms; on stop paint final reels[idx]; resolve when 3rd stops
  highlightWins(hits): ∀i∈h.indices → cells[i].add('cell-win')
  paintInitial(): ∀cell → random symbol
  buildGrid(): create 9 .cell into #slot-grid if empty
  MIN_WAGER=10; WAGER_STEP=10
  readBetInput()→int: n=parseInt(#bet-amount.value); max(MIN_WAGER, ceil(n/STEP)*STEP)  // rounds up to next $10
  renderBetUI(): bal=Wallet.bal; maxAff=max(MIN_WAGER,floor(bal/STEP)*STEP); #bet-amount.max=maxAff; clamp v>bal→maxAff; refreshSpinAvail
  refreshSpinAvail(): mv=Matcher.getMovesLeft; bet=readBet; bal=Wallet.bal; #bet-amount.disabled=mv>0; #bet-max.disabled=mv>0||bal<MIN_WAGER; #spin-btn.disabled=spinning||mv>0||bet<MIN_WAGER||bal<bet
  spin():async: guard(spinning); bet=readBet; bet<MIN_WAGER||!Wallet.spend(bet)→ret; spinning=T; refresh; Audio?.lever()+steam(1.2); Child?.recordPlay; clearHL; #slot-result='Spinning…'; r=rollReels; await anim(r); h=detect(r); highlightWins(h); h.moves==0→Audio?.dud; m=h.moves; eff=m>0?ceil(bet*(1+h.wagerBonus)):bet; m>0→Matcher.addMoves(m,eff); #slot-result=m>0?`+${m} move${plural} · yellow×${y}→wager ${eff}`:`No win · wager ${bet} lost${ywaste}`; spinning=F; refresh
  init(): buildGrid; paintInitial; bind #spin-btn click→spin; #bet-amount input/change→syncBet+clamp+refresh; #bet-max click→set to bal+refresh; Wallet.onChange→renderBetUI; Matcher.onMovesChange→refreshSpinAvail; renderBetUI; refreshSpinAvail
  exports: global.MatchboxSlot={init,SYMBOLS}; on DOMContentLoaded→init
*/
(function (global) {
  // Three symbol types. Blue tiles pay moves only when they touch (8-neighbor
  // blob >=3 → count-2 moves). Yellow tiles are a wager booster — each one
  // pushes the effective wager closer to 2×bet via 1 - 0.5^N (diminishing).
  // Nada is filler. Yellow without a blue blob this spin = wasted boost.
  const SYMBOLS = [
    { id: 'nada',   glyph: '·', weight: 60 },  // ceniza — empty cell
    { id: 'blue',   glyph: '☼', weight: 30 },  // sol — Spanish sun, common
    { id: 'yellow', glyph: '✠', weight: 10 },  // cruz — Spanish cross, rare
  ];
  const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  // No consolation: a no-hit spin burns the wager and yields zero moves.
  const CONSOLATION_MOVES = 0;

  let spinning = false;

  function rollSymbol() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const sym of SYMBOLS) {
      r -= sym.weight;
      if (r < 0) return sym;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function rollReels() {
    const reels = [];
    for (let i = 0; i < 9; i++) reels.push(rollSymbol());
    return reels;
  }

  // Two-pass detection:
  //   1. Locate yellows → wager bonus 1 - 0.5^yellowCount.
  //   2. Flood-fill non-nada cells on the 4-neighborhood (horizontal /
  //      vertical only — diagonals don't count). Blue AND yellow tiles all
  //      count toward the same blob; size N>=3 pays (N-2) moves. Yellow
  //      pulls double duty: contributes to the blob AND the wager boost.
  function detectHits(reels) {
    const yellowIndices = [];
    reels.forEach((sym, i) => {
      if (sym.id === 'yellow') yellowIndices.push(i);
    });
    const yellowCount = yellowIndices.length;
    // Halved yellow boost — max effective wager ×1.5 instead of ×2.
    const wagerBonus = yellowCount > 0
      ? 0.5 * (1 - Math.pow(0.5, yellowCount))
      : 0;

    const visited = new Array(9).fill(false);
    let moves = 0;
    const blobIndices = [];
    for (let i = 0; i < 9; i++) {
      if (visited[i]) continue;
      if (reels[i].id === 'nada') { visited[i] = true; continue; }
      const cells = [];
      const stack = [i];
      visited[i] = true;
      while (stack.length) {
        const cur = stack.pop();
        cells.push(cur);
        const r = Math.floor(cur / 3);
        const c = cur % 3;
        // 4-neighbor only: no diagonals.
        const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= 3 || nc < 0 || nc >= 3) continue;
          const ni = nr * 3 + nc;
          if (visited[ni] || reels[ni].id === 'nada') continue;
          visited[ni] = true;
          stack.push(ni);
        }
      }
      if (cells.length >= 3) {
        moves += cells.length - 2;
        cells.forEach((c) => blobIndices.push(c));
      }
    }

    return { moves, blobIndices, yellowIndices, yellowCount, wagerBonus };
  }

  function getCells() {
    return document.querySelectorAll('#slot-grid .cell');
  }

  function clearWinHighlights() {
    getCells().forEach((c) => {
      c.classList.remove('cell-win');
      c.classList.remove('cell-bonus');
    });
  }

  function highlightWins(hit) {
    const cells = getCells();
    const blobSet = new Set(hit.blobIndices);
    hit.blobIndices.forEach((i) => cells[i].classList.add('cell-win'));
    // Yellow only glows when it's part of a winning blob — a yellow on
    // screen with no match doesn't contribute and shouldn't advertise.
    hit.yellowIndices.forEach((i) => {
      if (blobSet.has(i)) cells[i].classList.add('cell-bonus');
    });
  }

  function paintCell(cell, sym) {
    const glyphs = cell.querySelectorAll('.cell-glyph');
    glyphs.forEach((g) => { g.textContent = sym.glyph; });
    cell.dataset.color = sym.id;
  }

  // Split-flap (Solari-board) reveal: top half flips first (rotateX 0→-90→0,
  // hinged at the seam), content swaps at the -90 edge-on midpoint; then the
  // bottom half does the same (rotateX 0→+90→0, hinged at the seam). Cell
  // color updates with the top-half swap so the card paint changes first,
  // bottom symbol follows. Total ~400ms per cell.
  const FLAP_MS = 180;
  const FLIP_TOTAL_MS = FLAP_MS * 2 + 40;
  function flipReveal(cell, sym) {
    const top = cell.querySelector('.cell-top');
    const bot = cell.querySelector('.cell-bot');
    const topGlyph = top.querySelector('.cell-glyph');
    const botGlyph = bot.querySelector('.cell-glyph');
    top.classList.remove('flap-flipping');
    bot.classList.remove('flap-flipping');
    void cell.offsetWidth;
    top.classList.add('flap-flipping');
    setTimeout(() => {
      topGlyph.textContent = sym.glyph;
      cell.dataset.color = sym.id;
    }, FLAP_MS / 2);
    setTimeout(() => {
      top.classList.remove('flap-flipping');
      bot.classList.add('flap-flipping');
      setTimeout(() => { botGlyph.textContent = sym.glyph; }, FLAP_MS / 2);
      setTimeout(() => { bot.classList.remove('flap-flipping'); }, FLAP_MS + 20);
    }, FLAP_MS + 10);
  }

  function animateSpin(finalReels) {
    return new Promise((resolve) => {
      const cells = getCells();
      const stopTimes = [600, 900, 1200];
      let stopped = 0;
      const tickers = [0, 1, 2].map((col) =>
        setInterval(() => {
          for (let row = 0; row < 3; row++) {
            const idx = row * 3 + col;
            paintCell(cells[idx], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
          }
        }, 60)
      );
      [0, 1, 2].forEach((col) => {
        setTimeout(() => {
          clearInterval(tickers[col]);
          for (let row = 0; row < 3; row++) {
            const idx = row * 3 + col;
            flipReveal(cells[idx], finalReels[idx]);
          }
          stopped++;
          if (stopped === 3) setTimeout(resolve, FLIP_TOTAL_MS);
        }, stopTimes[col]);
      });
    });
  }

  function paintInitial() {
    getCells().forEach((c) =>
      paintCell(c, SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
    );
  }

  function buildGrid() {
    const grid = document.getElementById('slot-grid');
    if (!grid || grid.children.length) return;
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML =
        '<div class="cell-half cell-top"><span class="cell-glyph"></span></div>' +
        '<div class="cell-half cell-bot"><span class="cell-glyph"></span></div>';
      grid.appendChild(cell);
    }
  }

  // $10 minimum, rounds UP to the next multiple of 10. A typed "7" lands
  // at 10; a typed "23" lands at 30.
  const MIN_WAGER = 10;
  const WAGER_STEP = 10;
  function readBetInput() {
    const el = document.getElementById('bet-amount');
    if (!el) return MIN_WAGER;
    const n = parseInt(el.value, 10);
    if (!Number.isFinite(n) || n <= 0) return MIN_WAGER;
    const stepped = Math.ceil(n / WAGER_STEP) * WAGER_STEP;
    return Math.max(MIN_WAGER, stepped);
  }

  function getMovesLeft() {
    return global.MatchboxMatcher && global.MatchboxMatcher.getMovesLeft
      ? global.MatchboxMatcher.getMovesLeft()
      : 0;
  }

  function refreshSpinAvail() {
    const movesLeft = getMovesLeft();
    const bal = global.Wallet ? global.Wallet.getBalance() : 0;
    const bet = readBetInput();
    const betEl = document.getElementById('bet-amount');
    const maxBtn = document.getElementById('bet-max');
    const spinBtn = document.getElementById('spin-btn');
    if (betEl) betEl.disabled = movesLeft > 0;
    if (maxBtn) maxBtn.disabled = movesLeft > 0 || bal < MIN_WAGER;
    if (spinBtn) {
      spinBtn.disabled =
        spinning || movesLeft > 0 || bet < MIN_WAGER || bal < bet;
    }
  }

  // Phase-class toggle, called ONLY by Matcher.onMovesChange (which the
  // matcher fires after the cascade has fully resolved and any payout
  // banner is showing). Wallet.add fires its own onChange mid-cascade, so
  // we must NOT toggle the phase from that path — otherwise the panel
  // fades the moment coins arrive, before the player sees the big show.
  function refreshPhase() {
    const movesLeft = getMovesLeft();
    const main = document.querySelector('.matchbox');
    if (main) main.classList.toggle('phase-match', movesLeft > 0);
  }

  // Clamp the visible input to a multiple of WAGER_STEP >= MIN_WAGER, and
  // never above the player's current balance (also rounded down to step).
  function renderBetUI() {
    const betEl = document.getElementById('bet-amount');
    if (!betEl) return refreshSpinAvail();
    const bal = global.Wallet ? global.Wallet.getBalance() : 0;
    const maxAffordable = Math.max(MIN_WAGER, Math.floor(bal / WAGER_STEP) * WAGER_STEP);
    betEl.max = maxAffordable;
    const current = parseInt(betEl.value, 10);
    if (Number.isFinite(current) && current > bal && bal >= MIN_WAGER) {
      betEl.value = String(maxAffordable);
    }
    refreshSpinAvail();
  }

  async function spin() {
    if (spinning) return;
    if (getMovesLeft() > 0) return;
    const bet = readBetInput();
    if (bet < MIN_WAGER) return;
    if (!global.Wallet || !global.Wallet.spend(bet)) return;

    // Jackpot contribution — every spin grows El Premio Gordo by 1% of the
    // player's current balance (rounded up). Doesn't deduct; just adds
    // value to the progressive pot.
    if (global.MatchboxJackpot && global.Wallet.getBalance) {
      const contribution = Math.ceil(global.Wallet.getBalance() * 0.01);
      if (contribution > 0) global.MatchboxJackpot.add(contribution);
    }

    spinning = true;
    refreshSpinAvail();

    const audio = global.MatchboxAudio;
    if (audio) {
      audio.lever();
      audio.steam(1.2);
    }
    if (global.Child && typeof global.Child.recordPlay === 'function') {
      global.Child.recordPlay();
    }
    clearWinHighlights();
    const result = document.getElementById('slot-result');
    if (result) result.textContent = 'Girando…';

    const reels = rollReels();
    await animateSpin(reels);
    const hit = detectHits(reels);
    highlightWins(hit);
    if (audio && hit.moves === 0) audio.dud();

    // Yellow boosts the wager that the matcher pays from — applies only if
    // there are also moves to spend. Rounded up so partial multipliers still
    // increment the integer wager.
    const moves = hit.moves > 0 ? hit.moves : CONSOLATION_MOVES;
    const effectiveWager = moves > 0
      ? Math.ceil(bet * (1 + hit.wagerBonus))
      : bet;

    // Update the result text up front so the player can see what hit.
    if (result) {
      if (moves > 0) {
        const bonusTag = hit.yellowCount > 0
          ? ` · cruz ×${hit.yellowCount} → apuesta $${effectiveWager}`
          : ` · apuesta $${bet}`;
        result.textContent =
          `+${moves} jugada${moves === 1 ? '' : 's'}${bonusTag}`;
      } else {
        const wasted = hit.yellowCount > 0 ? ' (cruz desperdiciada)' : '';
        result.textContent = `Sin premio · apuesta $${bet} perdida${wasted}`;
      }
    }

    // Hold beat — on a win, let the highlighted cells glow and "hit"
    // visibly before we hand control over to the matcher. Brief pause on
    // a no-win spin too so the player registers the result.
    if (moves > 0) {
      if (audio) audio.slotHit();
      const grid = document.getElementById('slot-grid');
      if (grid) {
        grid.classList.add('slot-grid-hit');
        setTimeout(() => grid.classList.remove('slot-grid-hit'), 1100);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    if (moves > 0 && global.MatchboxMatcher && global.MatchboxMatcher.addMoves) {
      global.MatchboxMatcher.addMoves(moves, effectiveWager);
    }

    spinning = false;
    refreshSpinAvail();
  }

  function init() {
    buildGrid();
    paintInitial();

    const spinBtn = document.getElementById('spin-btn');
    if (spinBtn) spinBtn.addEventListener('click', spin);

    const betEl = document.getElementById('bet-amount');
    if (betEl) {
      betEl.addEventListener('input', refreshSpinAvail);
      betEl.addEventListener('change', renderBetUI);
    }
    const maxBtn = document.getElementById('bet-max');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        const bal = global.Wallet ? global.Wallet.getBalance() : 0;
        const maxAff = Math.max(MIN_WAGER, Math.floor(bal / WAGER_STEP) * WAGER_STEP);
        if (betEl && bal >= MIN_WAGER) betEl.value = String(maxAff);
        refreshSpinAvail();
      });
    }

    if (global.Wallet && global.Wallet.onChange) {
      global.Wallet.onChange(renderBetUI);
    }
    if (global.MatchboxMatcher && global.MatchboxMatcher.onMovesChange) {
      global.MatchboxMatcher.onMovesChange(refreshSpinAvail);
      global.MatchboxMatcher.onMovesChange(refreshPhase);
    }

    renderBetUI();
    refreshSpinAvail();
    refreshPhase();
  }

  global.MatchboxSlot = { init, SYMBOLS };
  document.addEventListener('DOMContentLoaded', init);
})(window);
