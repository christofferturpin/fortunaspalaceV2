/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SINNERBOX SLOT MACHINE  —  reel + paytable + spin pipeline              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ bind  #bet-amount  ─► syncSelectedBet        │
  │                          ├─ bind  #bet-max     ─► (set max wager)        │
  │                          ├─ bind  #spin-btn    ─► spin()                 │
  │                          ├─ Wallet.onChange    ─► renderBetUI            │
  │                          ├─ Plinko.onState     ─► refreshSpinAvail       │
  │                          ├─ bindJackpotDisplay()  (Plinko jackpot UI)    │
  │                          └─ renderPaytable() ──► #paytable.innerHTML     │
  │                                                                          │
  │   click spin ─► spin()  (bet:int from #bet-amount)                       │
  │                  │                                                       │
  │                  ├─ Wallet.spend(bet)         ◄── aborts if false        │
  │                  ├─ Plinko.recordWager(bet)                              │
  │                  ├─ Child.recordPlay()                                   │
  │                  ├─ Sound.click() / Sound.spin()                         │
  │                  │                                                       │
  │                  ├─ rollReels() ───► reels[9]  (rollSymbol × 9, weighted)│
  │                  ├─ animateSpin(reels) ──► tumbles glyphs in 3 cols      │
  │                  ├─ detectHits(reels) ──► hits[] {line,symbol,indices}   │
  │                  ├─ highlightWins(hits) ──► .cell-win class on grid      │
  │                  ├─ renderResult(hits) ──► text into #slot-result        │
  │                  └─ Plinko.queueBalls(balls, bet, isConsolation)         │
  │                                                                          │
  │   Exports (window.Slot): { init, SYMBOLS, PAYLINES }                     │
  │   External deps: Wallet, Plinko, Sound, Child                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SYMBOLS=[{id,glyph,weight,ballsPerHit}*6]; BALLS_BY_SYMBOL={id→balls}; TOTAL_WEIGHT=Σweight; CONSO=1
  PAYLINES=[{name,indices[3]}*8] (3rows+3cols+2diag); BET_TIERS=[1,10,100]; BET_LABELS,SYMBOL_LABELS
  state: selectedBet=1, spinning=false
  rollSymbol()→sym: r=rnd*TOTW; ∀s∈SYMBOLS{r-=s.w; r<0→ret s}; ret last
  rollReels()→sym[9]: [rollSymbol×9]
  detectHits(reels)→hits[]: ∀l∈PAYLINES if reels[l.i].id all eq → push{line,symbol,indices}
  clearWinHighlights(): $$('#slot-grid .cell.cell-win').rm('cell-win')
  highlightWins(hits): ∀h.indices → cells[i].add('cell-win')
  readBetInput()→int: parseInt(#bet-amount.value) || 1
  syncSelectedBet(): selectedBet=readBetInput; refreshSpinAvail
  randomGlyph()→str: SYMBOLS[rnd].glyph
  animateSpin(finalReels)→Promise: 3 cols tumble@60ms, stop@[600,900,1200]ms, set cell.text=glyph[idx]; resolve on last col
  renderBetUI(): #bet-amount.max=max(1,bal); clamp v>bal→bal; #bet-max.disabled=bal<1; selectedBet=readBet
  renderResult(hits): balls=hits.len?Σ(BALLS_BY_SYMBOL[sym]):CONSO; #slot-result.text=`Balls:${balls}${conso?' (consolation)':''} — ${lines}`
  spin():async: guard(spinning||Plinko.busy); bet=readBet; bet<1||!Wallet.spend(bet)→ret; Plinko.recordWager(bet); Child.recordPlay; Sound.click+spin; spinning=T; refresh; clearHL; #slot-result='Spinning…'; r=rollReels; await anim(r); h=detect(r); highlightWins(h); renderResult(h); balls=h.len?Σballs:CONSO; Plinko.queueBalls(balls,bet,!h.len); spinning=F; refresh; renderBetUI
  refreshSpinAvailability(): #spin-btn.disabled = spinning||Plinko.busy||selectedBet<1||Wallet.bal<selectedBet
  renderPaytable(): #paytable.innerHTML = symbolRows+zones+tierRows (3 blocks)
  bindJackpotDisplay(): Plinko.onJackpotChange(pool)→#jackpot-value.text=pool, dataset.empty=pool>0?'false':'true'; Plinko.onJackpotHit()→reflow+'jackpot-hit' class
  init(): bind #bet-amount input→sync, change→clamp+sync; #bet-max click→max+sync; #spin-btn click→spin; Wallet.onChange→renderBetUI+refresh; Plinko.onState→refresh; bindJackpot; renderBetUI; refresh; renderPaytable
  exports: global.Slot={init,SYMBOLS,PAYLINES}; on DOMContentLoaded→init
*/
(function (global) {
  const SYMBOLS = [
    { id: 'skull',     glyph: '☠', weight: 30, ballsPerHit: 3 },
    { id: 'coffin',    glyph: '⚰', weight: 30, ballsPerHit: 3 },
    { id: 'cross',     glyph: '✟', weight: 20, ballsPerHit: 3 },
    { id: 'chains',    glyph: '⛓', weight: 12, ballsPerHit: 4 },
    { id: 'six',       glyph: '6', weight: 6,  ballsPerHit: 5 },
    { id: 'pentagram', glyph: '⛧', weight: 2,  ballsPerHit: 8 },
  ];
  const BALLS_BY_SYMBOL = Object.fromEntries(SYMBOLS.map((s) => [s.id, s.ballsPerHit]));
  const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  const CONSOLATION_BALLS = 1;

  const PAYLINES = [
    { name: 'row-top',     indices: [0, 1, 2] },
    { name: 'row-mid',     indices: [3, 4, 5] },
    { name: 'row-bot',     indices: [6, 7, 8] },
    { name: 'col-left',    indices: [0, 3, 6] },
    { name: 'col-mid',     indices: [1, 4, 7] },
    { name: 'col-right',   indices: [2, 5, 8] },
    { name: 'diag-tl-br',  indices: [0, 4, 8] },
    { name: 'diag-tr-bl',  indices: [2, 4, 6] },
  ];

  const BET_TIERS = [1, 10, 100];
  const BET_LABELS = { 1: 'MORTAL', 10: 'SINNER', 100: 'DAMNED' };
  const SYMBOL_LABELS = {
    skull: 'Skull',
    coffin: 'Coffin',
    cross: 'Cross',
    chains: 'Chains',
    six: 'Six',
    pentagram: 'Pentagram',
  };

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

  function detectHits(reels) {
    const hits = [];
    for (const line of PAYLINES) {
      const [a, b, c] = line.indices;
      if (reels[a].id === reels[b].id && reels[b].id === reels[c].id) {
        hits.push({ line: line.name, symbol: reels[a].id, indices: line.indices });
      }
    }
    return hits;
  }

  function clearWinHighlights() {
    document.querySelectorAll('#slot-grid .cell.cell-win').forEach((c) =>
      c.classList.remove('cell-win'));
  }

  function highlightWins(hits) {
    if (!hits.length) return;
    const cells = document.querySelectorAll('#slot-grid .cell');
    for (const h of hits) {
      h.indices.forEach((i) => cells[i].classList.add('cell-win'));
    }
  }

  let selectedBet = 1;
  let spinning = false;

  function readBetInput() {
    const inp = document.getElementById('bet-amount');
    if (!inp) return 1;
    const v = parseInt(inp.value, 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  function syncSelectedBet() {
    selectedBet = readBetInput();
    refreshSpinAvailability();
  }

  function randomGlyph() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].glyph;
  }

  function animateSpin(finalReels) {
    return new Promise((resolve) => {
      const cells = document.querySelectorAll('#slot-grid .cell');
      const colIndices = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
      const stopTimes = [600, 900, 1200];
      const tumbleInterval = 60;
      const intervals = colIndices.map((cellIdxs) =>
        setInterval(() => {
          cellIdxs.forEach((idx) => { cells[idx].textContent = randomGlyph(); });
        }, tumbleInterval)
      );
      stopTimes.forEach((time, col) => {
        setTimeout(() => {
          clearInterval(intervals[col]);
          colIndices[col].forEach((idx) => {
            cells[idx].textContent = finalReels[idx].glyph;
          });
          if (col === stopTimes.length - 1) resolve();
        }, time);
      });
    });
  }

  function renderBetUI() {
    const inp = document.getElementById('bet-amount');
    const maxBtn = document.getElementById('bet-max');
    const balance = Wallet.getBalance();
    if (inp) {
      inp.max = String(Math.max(1, balance));
      // Clamp the input down if balance dropped below current bet.
      const v = readBetInput();
      if (v > balance && balance > 0) {
        inp.value = String(balance);
      }
    }
    if (maxBtn) {
      maxBtn.disabled = balance < 1;
    }
    selectedBet = readBetInput();
  }

  function renderResult(hits) {
    const balls = hits.length === 0
      ? CONSOLATION_BALLS
      : hits.reduce((sum, h) => sum + BALLS_BY_SYMBOL[h.symbol], 0);
    const consolation = hits.length === 0 ? ' (consolation)' : '';
    const lines = hits
      .map((h) => h.line + ' (' + h.symbol + ' ×' + BALLS_BY_SYMBOL[h.symbol] + ')')
      .join(', ');
    document.getElementById('slot-result').textContent =
      'Balls: ' + balls + consolation + (lines ? ' — ' + lines : '');
  }

  async function spin() {
    if (spinning) return;
    if (Plinko && Plinko.isBusy()) return;
    selectedBet = readBetInput();
    const bet = selectedBet;
    if (bet < 1 || !Wallet.spend(bet)) return;
    if (global.Plinko && global.Plinko.recordWager) global.Plinko.recordWager(bet);
    if (global.Child) global.Child.recordPlay();
    if (global.Sound) {
      global.Sound.click();
      global.Sound.spin();
    }
    spinning = true;
    refreshSpinAvailability();
    clearWinHighlights();
    document.getElementById('slot-result').textContent = 'Spinning…';
    const reels = rollReels();
    await animateSpin(reels);
    const hits = detectHits(reels);
    highlightWins(hits);
    renderResult(hits);
    const isConsolation = hits.length === 0;
    const balls = isConsolation
      ? CONSOLATION_BALLS
      : hits.reduce((sum, h) => sum + BALLS_BY_SYMBOL[h.symbol], 0);
    if (global.Plinko) global.Plinko.queueBalls(balls, bet, isConsolation);
    spinning = false;
    refreshSpinAvailability();
    renderBetUI();
  }

  function refreshSpinAvailability() {
    const btn = document.getElementById('spin-btn');
    if (!btn) return;
    const busy = global.Plinko && global.Plinko.isBusy();
    btn.disabled = spinning || busy || selectedBet < 1 || Wallet.getBalance() < selectedBet;
  }

  function renderPaytable() {
    const el = document.getElementById('paytable');
    if (!el) return;
    const zones = (global.Plinko && global.Plinko.ZONE_VALUES) || [];
    const symbolRows = SYMBOLS.map((s) =>
      '<li><span class="pt-glyph">' + s.glyph + '</span>' +
      '<span class="pt-name">' + (SYMBOL_LABELS[s.id] || s.id) + '</span>' +
      '<span class="pt-payout">×' + s.ballsPerHit + ' balls per match</span></li>'
    ).join('');
    const zoneCells = zones.map((v) => '<span class="pt-zone">' + v + '</span>').join('');
    const tierRows = BET_TIERS.map((t) =>
      '<li><span class="pt-tier">' + BET_LABELS[t] + '</span>' +
      '<span class="pt-cost">' + t + ' coin' + (t === 1 ? '' : 's') + '</span></li>'
    ).join('');
    el.innerHTML =
      '<h2>The Paytable</h2>' +
      '<div class="pt-block">' +
        '<h3>Reel Symbols</h3>' +
        '<ul class="pt-symbols">' + symbolRows + '</ul>' +
        '<p class="pt-note">Match three on any of the 8 paylines (3 rows, 3 columns, 2 diagonals) to win balls. No match yields ' + CONSOLATION_BALLS + ' consolation ball' + (CONSOLATION_BALLS === 1 ? '' : 's') + '.</p>' +
      '</div>' +
      '<div class="pt-block">' +
        '<h3>Plinko Zones (× wager)</h3>' +
        '<div class="pt-zones">' + zoneCells + '</div>' +
      '</div>' +
      '<div class="pt-block">' +
        '<h3>Wagers</h3>' +
        '<ul class="pt-tiers">' + tierRows + '</ul>' +
      '</div>';
  }

  function init() {
    const inp = document.getElementById('bet-amount');
    if (inp) {
      inp.addEventListener('input', syncSelectedBet);
      inp.addEventListener('change', () => {
        const balance = Wallet.getBalance();
        let v = readBetInput();
        if (v < 1) v = 1;
        if (v > balance && balance > 0) v = balance;
        inp.value = String(v);
        syncSelectedBet();
      });
    }
    const maxBtn = document.getElementById('bet-max');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        const balance = Wallet.getBalance();
        if (balance < 1) return;
        if (inp) inp.value = String(balance);
        if (global.Sound) global.Sound.click();
        syncSelectedBet();
      });
    }
    document.getElementById('spin-btn').addEventListener('click', spin);
    Wallet.onChange(() => {
      renderBetUI();
      refreshSpinAvailability();
    });
    if (global.Plinko) global.Plinko.onStateChange(refreshSpinAvailability);
    bindJackpotDisplay();
    renderBetUI();
    refreshSpinAvailability();
    renderPaytable();
  }

  function bindJackpotDisplay() {
    const display = document.getElementById('jackpot-display');
    const value = document.getElementById('jackpot-value');
    if (!display || !value || !global.Plinko) return;
    global.Plinko.onJackpotChange((pool) => {
      value.textContent = pool;
      display.dataset.empty = pool > 0 ? 'false' : 'true';
    });
    global.Plinko.onJackpotHit(() => {
      // Re-trigger the CSS animation by removing/forcing reflow/re-adding.
      display.classList.remove('jackpot-hit');
      void display.offsetWidth;
      display.classList.add('jackpot-hit');
    });
  }

  global.Slot = { init, SYMBOLS, PAYLINES };
  document.addEventListener('DOMContentLoaded', init);
})(window);