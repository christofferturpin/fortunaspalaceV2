/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLLERWORKS SLOT — 20×20 reels of color+arrow tiles                     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ buildGrid()   ─► 400 .cell divs              │
  │                          ├─ bind  #bet-amount  ─► syncSelectedBet        │
  │                          ├─ bind  #bet-max     ─► (set max wager)        │
  │                          ├─ bind  #spin-btn    ─► spin()                 │
  │                          ├─ Wallet.onChange    ─► renderBetUI            │
  │                          ├─ Intersection.onState ─► refreshSpinAvail     │
  │                          └─ renderBetUI() / refreshSpinAvail()           │
  │                                                                          │
  │   Tile model:                                                            │
  │     {color, dir, isDiamond}  —  color ∈ {red, yellow, green, black}     │
  │                                  dir   ∈ {up ↑, down ↓, left ←, right →}│
  │                                  isDiamond = rare overlay (~4%)         │
  │                                                                          │
  │   click DROP THE FLAG ─► spin() (orchestrates the whole cabinet flow)  │
  │                  │                                                       │
  │                  ├─ Wallet.spend(bet)         ◄── aborts if false        │
  │                  ├─ Child.recordPlay()                                   │
  │                  ├─ Sound.click() / Sound.spin()                         │
  │                  │                                                       │
  │                  ├─ rollGrid() ──► tile[400]                             │
  │                  ├─ animateSpin(grid) ──► 20 cols tumble & stop L→R      │
  │                  ├─ detectTriplets(grid) ──► hits[]                      │
  │                  ├─ highlightWins(hits) + renderResult(hits)             │
  │                  │                                                       │
  │                  │   if no hits → stay on slot, re-enable                │
  │                  │                                                       │
  │                  ├─ await wait(1000)         ◄─ "see the triplets"      │
  │                  ├─ showArena()              ◄─ hide slot, show canvas  │
  │                  ├─ Intersection.fireCars(descriptors)                  │
  │                  ├─ await waitForRoundEnd()  ◄─ polls isBusy()          │
  │                  ├─ await waitForContinueClick() ◄ unhide #continue-btn │
  │                  └─ showSlot()               ◄─ hide canvas, show slot  │
  │                                                                          │
  │   Triplet rule: 3-in-a-row SAME COLOR (arrow ignored). Direction of     │
  │   spawned car = a random tile's arrow from the 3. Diamond on ANY of    │
  │   the 3 tiles → car becomes a truck. Sweep covers E, S, SE, SW.        │
  │                                                                          │
  │   Exports (window.Slot): { init, COLORS, DIRS, GRID_W, GRID_H }         │
  │   External deps: Wallet, Intersection, Sound, Child                      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  GRID_W=20; GRID_H=20; CELL_COUNT=400
  COLORS=[{id,cell,car}*4]; DIRS=[{id,glyph,dir}*4]; DIAMOND_CHANCE=.04
  state: selectedBet=1, spinning=F, grid=tile[400]
  rollTile()→{color,dir,isDiamond}: color=COLORS[rnd4]; dir=DIRS[rnd4];
    isDiamond=rnd<DIAMOND_CHANCE
  rollGrid()→tile[400]
  at(r,c)→tile; idx(r,c)→i=r*20+c
  tripletInfo(t1,t2,t3)→{color,dir,isTruck}|null:
    same-color guard; pick random tile's dir; isTruck=any.isDiamond
  detectTriplets(g)→hits[]: ∀(r,c) sweep 4 dirs (E,S,SE,SW); push tripletInfo
  buildGrid(): #slot-grid.html=400 .cell w/ default red↑
  applyTileVisual(cell, tile): className=cell+cell-COLOR(+cell-diamond);
    textContent=tile.dir.glyph  (diamond mod = ::after corner '◆')
  randomTile()→tile (used by tumble)
  animateSpin(final)→Promise: ∀col setInterval(50ms) tumble rows w/ randomTile;
    stopAt[col]=350+col*30ms→clearInterval+applyTileVisual; last col resolves
  clearWinHighlights(): $$('.cell.cell-win').rm
  highlightWins(hits): ∀h.indices→.add('cell-win')
  readBetInput()→int; syncSelectedBet; renderBetUI; refreshSpinAvailability
  renderResult(hits): #slot-result.text='${n} hits → ${cars}c+${trucks}t'
  showSlot()/showArena(): toggle .hidden on #slot-section / #intersection-section
  wait(ms)→Promise; waitForRoundEnd()→Promise: poll 150ms while Intersection.busy
  spin():async: guard(spinning||busy); bet>=1&&Wallet.spend→Sound.click+spin;
    spinning=T; clearHL; g=rollGrid; await anim(g); h=detect(g);
    highlight(h); renderResult(h);
    h.len==0→spinning=F+refresh+return;
    await wait(1000); showArena; descs=h.map(→{dir,color,isTruck});
    Intersection.fireCars(descs); await waitForRoundEnd;
    await waitForContinueClick; showSlot; spinning=F; refresh
  init(): buildGrid; bind input/change/max/spin; Wallet+Intersection→refresh
  exports: global.Slot={init,COLORS,DIRS,GRID_W,GRID_H}; on DOMContentLoaded→init
*/
(function (global) {
  const GRID_W = 20;
  const GRID_H = 20;
  const CELL_COUNT = GRID_W * GRID_H;

  // 4 tile colors (3 + black). `cell` = slot-tile background, `car` = the
  // car-body color the intersection draws. They share the same hue but the
  // tile is darkened so the gold cabinet frame still reads against it.
  const COLORS = [
    { id: 'red',    cell: '#7a1218', car: '#ff2848' },
    { id: 'yellow', cell: '#6e5410', car: '#ffd640' },
    { id: 'green',  cell: '#3a5a2e', car: '#48ff5a' },
  ];
  // Arrow direction → intersection.js dir code:
  //   0=SB (spawn top, drive down)  → '↓'
  //   1=WB (spawn right, drive left) → '←'
  //   2=NB (spawn bottom, drive up)  → '↑'
  //   3=EB (spawn left, drive right) → '→'
  const DIRS = [
    { id: 'up',    glyph: '↑', dir: 2 },
    { id: 'down',  glyph: '↓', dir: 0 },
    { id: 'left',  glyph: '←', dir: 1 },
    { id: 'right', glyph: '→', dir: 3 },
  ];
  // Tile mods (mutually exclusive per tile):
  //   diamond → regular truck
  //   cow     → cow truck (releases 6 cows on wreck)
  //   gas     → gas truck (explodes, chain-wrecks nearby cars)
  //   acid    → acid truck (drops kill-zone pool; bodies dissolve crossing it)
  //   pizza   → pizza truck (scatters pizzas — flavor only)
  // Specials are rarer than diamond. Priority on triplet match:
  //   gas > cow > acid > pizza > diamond > none.
  const DIAMOND_CHANCE = 0.04;
  const COW_CHANCE     = 0.004;
  const GAS_CHANCE     = 0.002;
  const ACID_CHANCE    = 0.003;
  const PIZZA_CHANCE   = 0.005;
  function rollMod() {
    const r = Math.random();
    let c = GAS_CHANCE;                       if (r < c) return 'gas';
    c += COW_CHANCE;                          if (r < c) return 'cow';
    c += ACID_CHANCE;                         if (r < c) return 'acid';
    c += PIZZA_CHANCE;                        if (r < c) return 'pizza';
    c += DIAMOND_CHANCE;                      if (r < c) return 'diamond';
    return null;
  }

  // Per-spin variance on the number of cars actually fired. The slot's
  // natural triplet count clusters tightly around ~150; the player asked
  // for wider swings. Each spin picks a target from a triangular dist
  // (a=25, mode=75, b=200) → mean ≈100, light right-skew toward the rare
  // big spin. If the grid produced fewer triplets than the target, we
  // fire all of them.
  const TARGET_CARS_MIN  = 25;
  const TARGET_CARS_MODE = 75;
  const TARGET_CARS_MAX  = 200;
  function pickTargetCarCount() {
    const a = TARGET_CARS_MIN, b = TARGET_CARS_MAX, mode = TARGET_CARS_MODE;
    const u = Math.random();
    const c = (mode - a) / (b - a);
    const v = u < c
      ? a + Math.sqrt(u * (b - a) * (mode - a))
      : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
    return Math.max(a, Math.min(b, Math.floor(v)));
  }
  // Random subset of size n (partial Fisher–Yates).
  function sampleHits(arr, n) {
    if (arr.length <= n) return arr.slice();
    const out = arr.slice();
    const take = Math.min(n, out.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(Math.random() * (out.length - i));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.slice(0, take);
  }

  // Payout formula:
  //   payout = bet × 0.01 × wrecks × max(1, splats)
  // Wrecks and splats multiply, but splats floor at 1 so a carnage-only
  // spin (no pedestrian kills) still pays out on the wrecks alone.
  // Escapes pay nothing — this is a carnage slot. The JACKPOT payout
  // lives in its own system (persistent pool + 💰-body splat or
  // pizza-jackpot-car wreck).
  const PAYOUT_RATE = 0.01;

  let selectedBet = 1;
  let spinning = false;
  let grid = new Array(CELL_COUNT);

  function rollTile() {
    return {
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      dir:   DIRS[Math.floor(Math.random() * DIRS.length)],
      mod:   rollMod(),
    };
  }

  function rollGrid() {
    const g = new Array(CELL_COUNT);
    for (let i = 0; i < CELL_COUNT; i++) g[i] = rollTile();
    return g;
  }

  // Triplet match: same color across all 3 tiles (arrow ignored). Direction
  // of the spawned car is taken from a random member tile's arrow — so 3
  // reds with mixed arrows still produce one red car, but you don't know
  // which way it'll come from until the spin lands. Diamond on any of the
  // 3 tiles upgrades the car to a truck.
  function tripletInfo(t1, t2, t3) {
    if (t1.color.id !== t2.color.id || t1.color.id !== t3.color.id) return null;
    const picks = [t1, t2, t3];
    const pick  = picks[Math.floor(Math.random() * 3)];
    const mods  = [t1.mod, t2.mod, t3.mod];
    let truckType = null;
    if (mods.indexOf('gas') >= 0)        truckType = 'gas';
    else if (mods.indexOf('cow') >= 0)   truckType = 'cow';
    else if (mods.indexOf('acid') >= 0)  truckType = 'acid';
    else if (mods.indexOf('pizza') >= 0) truckType = 'pizza';
    const isTruck = truckType !== null || mods.indexOf('diamond') >= 0;
    return {
      color: t1.color,
      dir: pick.dir,
      isTruck,
      truckType, // null (regular truck or car), 'cow', or 'gas'
    };
  }

  function detectTriplets(g) {
    const hits = [];
    const at = (r, c) => g[r * GRID_W + c];
    const idx = (r, c) => r * GRID_W + c;
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        if (c + 2 < GRID_W) {
          const k = tripletInfo(at(r, c), at(r, c + 1), at(r, c + 2));
          if (k) hits.push(Object.assign(k, {
            indices: [idx(r, c), idx(r, c + 1), idx(r, c + 2)],
          }));
        }
        if (r + 2 < GRID_H) {
          const k = tripletInfo(at(r, c), at(r + 1, c), at(r + 2, c));
          if (k) hits.push(Object.assign(k, {
            indices: [idx(r, c), idx(r + 1, c), idx(r + 2, c)],
          }));
        }
        if (r + 2 < GRID_H && c + 2 < GRID_W) {
          const k = tripletInfo(at(r, c), at(r + 1, c + 1), at(r + 2, c + 2));
          if (k) hits.push(Object.assign(k, {
            indices: [idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2)],
          }));
        }
        if (r + 2 < GRID_H && c - 2 >= 0) {
          const k = tripletInfo(at(r, c), at(r + 1, c - 1), at(r + 2, c - 2));
          if (k) hits.push(Object.assign(k, {
            indices: [idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2)],
          }));
        }
      }
    }
    return hits;
  }

  function colorClassFor(tile) { return 'cell-' + tile.color.id; }

  function applyTileVisual(cell, tile) {
    const modClass = tile.mod ? ' cell-' + tile.mod : '';
    cell.className = 'cell ' + colorClassFor(tile) + modClass;
    cell.textContent = tile.dir.glyph;
  }

  function buildGrid() {
    const el = document.getElementById('slot-grid');
    if (!el) return;
    let html = '';
    for (let i = 0; i < CELL_COUNT; i++) {
      html += '<div class="cell cell-black">↑</div>';
    }
    el.innerHTML = html;
  }

  function animateSpin(finalGrid) {
    return new Promise((resolve) => {
      const cells = document.querySelectorAll('#slot-grid .cell');
      const tumbleInterval = 50;
      const baseStop = 350;
      const colStagger = 30;
      const intervals = new Array(GRID_W);
      for (let col = 0; col < GRID_W; col++) {
        intervals[col] = setInterval(() => {
          for (let row = 0; row < GRID_H; row++) {
            applyTileVisual(cells[row * GRID_W + col], rollTile());
          }
        }, tumbleInterval);
      }
      for (let col = 0; col < GRID_W; col++) {
        setTimeout(() => {
          clearInterval(intervals[col]);
          for (let row = 0; row < GRID_H; row++) {
            const i = row * GRID_W + col;
            applyTileVisual(cells[i], finalGrid[i]);
          }
          if (col === GRID_W - 1) resolve();
        }, baseStop + col * colStagger);
      }
    });
  }

  function clearWinHighlights() {
    document.querySelectorAll('#slot-grid .cell.cell-win').forEach((c) =>
      c.classList.remove('cell-win'));
  }

  function highlightWins(hits) {
    if (!hits.length) return;
    const cells = document.querySelectorAll('#slot-grid .cell');
    for (const h of hits) {
      for (const i of h.indices) cells[i].classList.add('cell-win');
    }
  }

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

  function renderBetUI() {
    const inp = document.getElementById('bet-amount');
    const maxBtn = document.getElementById('bet-max');
    const balance = Wallet.getBalance();
    if (inp) {
      inp.max = String(Math.max(1, balance));
      const v = readBetInput();
      if (v > balance && balance > 0) inp.value = String(balance);
    }
    if (maxBtn) maxBtn.disabled = balance < 1;
    selectedBet = readBetInput();
  }

  function refreshSpinAvailability() {
    const btn = document.getElementById('spin-btn');
    if (!btn) return;
    const busy = global.Intersection && global.Intersection.isBusy();
    btn.disabled = spinning || busy || selectedBet < 1 || Wallet.getBalance() < selectedBet;
  }

  function renderResult(hits) {
    const el = document.getElementById('slot-result');
    if (!el) return;
    if (hits.length === 0) {
      el.textContent = 'No triplets. No vehicles.';
      return;
    }
    const truckHits = hits.reduce((n, h) => n + (h.isTruck ? 1 : 0), 0);
    const carHits = hits.length - truckHits;
    let line = hits.length + ' hit' + (hits.length === 1 ? '' : 's') +
      ' → ' + carHits + ' car' + (carHits === 1 ? '' : 's');
    if (truckHits > 0) {
      line += ' + ' + truckHits + ' TRUCK' + (truckHits === 1 ? '' : 'S');
    }
    el.textContent = line + ' firing.';
  }

  // Game-flow helpers — toggle which cabinet panel is visible.
  function showSlot() {
    const slot  = document.getElementById('slot-section');
    const inter = document.getElementById('intersection-section');
    if (slot)  slot.classList.remove('hidden');
    if (inter) inter.classList.add('hidden');
  }
  function showArena() {
    const slot  = document.getElementById('slot-section');
    const inter = document.getElementById('intersection-section');
    if (slot)  slot.classList.add('hidden');
    if (inter) inter.classList.remove('hidden');
  }
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function waitForRoundEnd() {
    return new Promise((resolve) => {
      const poll = () => {
        if (!global.Intersection || !global.Intersection.isBusy()) resolve();
        else setTimeout(poll, 150);
      };
      poll();
    });
  }
  function waitForContinueClick() {
    return new Promise((resolve) => {
      const btn = document.getElementById('continue-btn');
      if (!btn) { resolve(); return; }
      const onClick = () => {
        btn.removeEventListener('click', onClick);
        if (global.Sound) global.Sound.click();
        resolve();
      };
      btn.addEventListener('click', onClick);
    });
  }

  // Populate and reveal the broadcast-style summary card. While visible,
  // a background poll keeps stats + payout fresh — so the ambulance's
  // post-race splat bonuses tick up the player's payout in real time.
  let summaryPoll = null;
  let pendingAmbulance = null;
  function showRaceSummary(bet, stats, payout) {
    const summary = document.getElementById('tv-summary');
    if (!summary) return;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('tv-stat-escaped', stats.escaped);
    setText('tv-stat-wrecked', stats.wrecked);
    setText('tv-stat-dead',    stats.deaths);
    setText('tv-stat-splats',  stats.splats);
    applyNet('tv-stat-payout', payout - bet);
    summary.classList.remove('hidden');

    let running = payout;
    if (summaryPoll) clearInterval(summaryPoll);
    summaryPoll = setInterval(() => {
      if (!global.Intersection) return;
      const live = global.Intersection.getStats();
      setText('tv-stat-wrecked', live.wrecked);
      setText('tv-stat-dead',    live.deaths);
      setText('tv-stat-splats',  live.splats);
      const fresh = Math.max(0, Math.floor(
        bet * PAYOUT_RATE * live.wrecked * Math.max(1, live.splats)
      ));
      if (fresh !== running) {
        if (fresh > running) Wallet.add(fresh - running);
        running = fresh;
        applyNet('tv-stat-payout', running - bet);
      }
    }, 250);
  }
  // Format a net-winnings value with sign + win/loss/even class so CSS
  // can paint it green / red / neutral.
  function applyNet(id, net) {
    const el = document.getElementById(id);
    if (!el) return;
    if (net > 0)      el.textContent = '+' + net;
    else if (net < 0) el.textContent = '−' + Math.abs(net);
    else              el.textContent = '0';
    el.classList.remove('win', 'loss', 'even');
    el.classList.add(net > 0 ? 'win' : (net < 0 ? 'loss' : 'even'));
  }
  function hideRaceSummary() {
    if (summaryPoll) { clearInterval(summaryPoll); summaryPoll = null; }
    const summary = document.getElementById('tv-summary');
    if (summary) summary.classList.add('hidden');
  }

  async function spin() {
    if (spinning) return;
    if (global.Intersection && global.Intersection.isBusy()) return;
    // Cancel any leftover ambulance timer from a previous round before
    // a new race begins.
    if (pendingAmbulance) { clearTimeout(pendingAmbulance); pendingAmbulance = null; }
    selectedBet = readBetInput();
    const bet = selectedBet;
    if (bet < 1 || !Wallet.spend(bet)) return;
    if (global.Child) global.Child.recordPlay();
    if (global.Sound) {
      global.Sound.click();
      global.Sound.spin();
    }
    spinning = true;
    refreshSpinAvailability();
    clearWinHighlights();
    document.getElementById('slot-result').textContent = 'Lining ’em up…';
    const g = rollGrid();
    grid = g;
    await animateSpin(g);
    const allHits = detectTriplets(g);
    // Sample a random subset of hits to widen variance in the actual car
    // count (mean ~100, range 25–200).
    const targetCount = pickTargetCarCount();
    const hits = sampleHits(allHits, targetCount);
    highlightWins(hits);
    renderResult(hits);
    // Ascending plink arpeggio — one note per hit up to a pentatonic cap.
    if (hits.length > 0 && global.Sound && global.Sound.plink) {
      const notes = [659, 784, 880, 1046, 1175, 1318, 1568, 1760];
      const count = Math.min(hits.length, notes.length);
      for (let i = 0; i < count; i++) {
        setTimeout(() => global.Sound.plink(notes[i]), i * 50);
      }
    }

    // No hits → no arena swap, stay on slot.
    if (hits.length === 0) {
      spinning = false;
      refreshSpinAvailability();
      renderBetUI();
      return;
    }

    // Let the player see the lit triplets briefly before we cut to chaos.
    await wait(1000);
    showArena();
    if (global.Intersection) {
      const descriptors = hits.map((h) => ({
        dir: h.dir.dir,
        color: h.color.car,
        isTruck: h.isTruck,
        truckType: h.truckType || null,
      }));
      global.Intersection.fireCars(descriptors);
      await waitForRoundEnd();

      // Payout: bet × 0.01 × (wrecks × splats). Bet was already
      // deducted at spin start — this is the gross return.
      const stats = global.Intersection.getStats();
      const payout = Math.max(0, Math.floor(
        bet * PAYOUT_RATE * stats.wrecked * Math.max(1, stats.splats)
      ));
      if (payout > 0) Wallet.add(payout);

      // Hold on the carnage for a beat, then surface the broadcast-style
      // summary card with the final stats + BACK TO PIT button.
      await wait(3000);
      showRaceSummary(bet, stats, payout);
      // 5 seconds after the race actually ended (we've already waited 3s
      // for the summary, so 2 more here), the ambulance rolls in to splat
      // any survivors still crawling. Tracked so we can cancel it if the
      // player starts a new spin before it fires.
      if (pendingAmbulance) clearTimeout(pendingAmbulance);
      pendingAmbulance = setTimeout(() => {
        pendingAmbulance = null;
        if (global.Intersection && global.Intersection.spawnAmbulance) {
          global.Intersection.spawnAmbulance();
        }
      }, 2000);
      await waitForContinueClick();
      hideRaceSummary();
    }
    showSlot();
    spinning = false;
    refreshSpinAvailability();
    renderBetUI();
  }

  function init() {
    buildGrid();
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
    const spinBtn = document.getElementById('spin-btn');
    if (spinBtn) spinBtn.addEventListener('click', spin);
    Wallet.onChange(() => { renderBetUI(); refreshSpinAvailability(); });
    if (global.Intersection) {
      global.Intersection.onStateChange(refreshSpinAvailability);
      global.Intersection.onStateChange(updatePopulation);
      // Jackpot wiring — pizza wrecks feed the pool, jackpot-body
      // splats empty it into the wallet.
      if (global.Intersection.onPizzaDrop) {
        global.Intersection.onPizzaDrop(onPizzaDrop);
      }
      if (global.Intersection.onJackpotSplat) {
        global.Intersection.onJackpotSplat(onJackpotSplat);
      }
      if (global.Intersection.onJackpotCarWreck) {
        global.Intersection.onJackpotCarWreck(onJackpotCarWreck);
      }
    }
    renderBetUI();
    renderJackpot();
    refreshSpinAvailability();
  }

  // ── Jackpot pool ──
  // Persistent across spins via localStorage. A pizza-truck wreck adds
  // 1-5% of the player's bank (just *calculated against* it, not
  // deducted). When the 💰 jackpot body is splatted, the whole pool
  // dumps into the wallet and resets to 0.
  const JACKPOT_KEY = 'wendys_palace_hollerworks_jackpot';
  let jackpotPool = loadJackpot();
  function loadJackpot() {
    try {
      const v = parseInt(localStorage.getItem(JACKPOT_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function saveJackpot() {
    try { localStorage.setItem(JACKPOT_KEY, String(jackpotPool)); } catch (e) {}
  }
  function renderJackpot() {
    const el = document.getElementById('jackpot-pool');
    if (el) el.textContent = jackpotPool.toLocaleString();
  }
  // Bump the jackpot bar visually + audibly. Adds a transient .bumped class
  // to the bar (CSS animates a brighter glow + scale beat) and plays the
  // cha-ching. The class is removed after the animation so it can fire again
  // on the next pizza drop.
  function flashJackpotBump() {
    const bar = document.querySelector('.jackpot-bar');
    if (!bar) return;
    bar.classList.remove('jackpot-bumped');
    void bar.offsetWidth;
    bar.classList.add('jackpot-bumped');
    setTimeout(() => bar.classList.remove('jackpot-bumped'), 900);
  }
  function flashJackpotWin() {
    const bar = document.querySelector('.jackpot-bar');
    if (!bar) return;
    bar.classList.remove('jackpot-won');
    void bar.offsetWidth;
    bar.classList.add('jackpot-won');
    setTimeout(() => bar.classList.remove('jackpot-won'), 2400);
  }
  function onPizzaDrop() {
    const bank = Wallet.getBalance();
    if (bank <= 0) return;
    const pct = 0.01 + Math.random() * 0.04;          // 1-5%
    const add = Math.max(1, Math.floor(bank * pct));
    jackpotPool += add;
    saveJackpot();
    renderJackpot();
    flashJackpotBump();
    if (global.Sound && global.Sound.jackpotBump) global.Sound.jackpotBump();
  }
  function onJackpotSplat() {
    if (jackpotPool <= 0) return;
    const won = jackpotPool;
    jackpotPool = 0;
    saveJackpot();
    renderJackpot();
    Wallet.add(won);
    flashJackpotWin();
    if (global.Sound && global.Sound.jackpotWin) {
      global.Sound.jackpotWin();
    } else if (global.Sound && global.Sound.plink) {
      const notes = [659, 784, 880, 1046, 1175, 1318, 1568, 1760, 2093, 2349];
      for (let i = 0; i < notes.length; i++) {
        setTimeout(() => global.Sound.plink(notes[i]), i * 60);
      }
    }
  }
  // Pizza JACKPOT car wreck — sister payout to onJackpotSplat. Cashes the
  // pool same as a 💰-body splat does. The FLASH-FLASH-YAY-JACKPOT canvas
  // animation already played from intersection.js; this is just the wallet
  // side of things + bar flare + bell cascade.
  function onJackpotCarWreck() {
    if (jackpotPool <= 0) {
      // Pool is empty but the car still wrecked spectacularly — give a
      // small consolation so the celebration isn't a tease.
      const bank = Wallet.getBalance();
      const consolation = Math.max(5, Math.floor(bank * 0.02));
      Wallet.add(consolation);
      flashJackpotBump();
      if (global.Sound && global.Sound.jackpotBump) global.Sound.jackpotBump();
      return;
    }
    const won = jackpotPool;
    jackpotPool = 0;
    saveJackpot();
    renderJackpot();
    Wallet.add(won);
    flashJackpotWin();
    if (global.Sound && global.Sound.jackpotWin) {
      global.Sound.jackpotWin();
    }
  }

  // Providence & North Tulane has 35,300 souls on file. Every death the
  // intersection logs ticks the marquee population down in real time.
  const BASE_POPULATION = 35300;
  function updatePopulation() {
    if (!global.Intersection) return;
    const stats = global.Intersection.getStats();
    const remaining = Math.max(0, BASE_POPULATION - (stats.deaths || 0));
    const el = document.getElementById('tagline-pop');
    if (el) el.textContent = remaining.toLocaleString();
  }

  global.Slot = { init, COLORS, DIRS, GRID_W, GRID_H };
  document.addEventListener('DOMContentLoaded', init);
})(window);
