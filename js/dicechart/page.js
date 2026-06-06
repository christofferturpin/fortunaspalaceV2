/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DICE CHART — fill cells 3..18 from 3d6 (white) + 1d6 red modifier       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init() ──► resetBoard() ──► render() (IDLE)       │
  │   (does NOT auto-begin a run — wager must be staked first)               │
  │                                                                          │
  │   #dc-new ──► beginRun()                                                 │
  │                ├─ guard(!Wallet.spend(wager) → flash "not enough coins") │
  │                ├─ Child.recordPlay()  (one tick per voyage)              │
  │                ├─ resetBoard(); state.wager=wager; gameOver=F; render    │
  │                                                                          │
  │   #dc-roll ──► roll()                                                    │
  │                ├─ guard(!gameOver && !rolling)                           │
  │                ├─ first throw: whites=[d6,d6,d6]                         │
  │                ├─ subsequent: reroll every white where idx !== holdIndex │
  │                ├─ red ALWAYS rerolls (player cannot hold red)            │
  │                ├─ achievable=compute(whites,red) ∩ {unfilled cells}      │
  │                ├─ rolls++; checkStranded(); render                       │
  │                                                                          │
  │   click .dc-die ──► toggleHold(idx)  (WHITES ONLY; clicking same die     │
  │                       unholds; hold PERSISTS across turns)               │
  │                                                                          │
  │   click .dc-cell.is-achievable ──► fillCell(value)                       │
  │                                     ├─ chart[v]={filled:T, expr}; ++     │
  │                                     ├─ score += CELL_PAYOUTS[v]          │
  │                                     ├─ achievable=[]                     │
  │                                     ├─ dice + holdIndex PRESERVED        │
  │                                     ├─ filled===16 → endRun('complete')  │
  │                                     └─ render()                          │
  │                                                                          │
  │   #dc-cashout ──► cashOut() ──► endRun('cashout')                        │
  │   #dc-max     ──► wager = Wallet.getBalance()  (clamped to input.max)    │
  │                                                                          │
  │   endRun(reason): gameOver=T; endReason=reason; clearRoll();             │
  │     payout = (reason==='stranded') ? 0 : floor(score·wager / BASELINE);  │
  │     payout>0 → Wallet.add(payout); state.lastPayout=payout; render       │
  │                                                                          │
  │   Red die faces (1d6 lookup, RED_FACES[d6-1]):                           │
  │     1,2 → +       any 2 or 3 whites, all +                               │
  │     3,4 → −       any 2 or 3 whites, ≥1 minus sign                       │
  │     5   → +N      any 2 or 3 whites summed, then + N (N∈1..3)            │
  │     6   → −N      any 2 or 3 whites summed, then − N (N∈1..3)            │
  │   Results filtered to [3..18] AND unfilled cells.                        │
  │                                                                          │
  │   Per-cell payouts (CELL_PAYOUTS): score += payout[v] when v inked       │
  │     Tier 1 (×1):   cells 5..13   (face value)                            │
  │     Tier 2 (×1.5): cells 4, 14   (6, 21)                                 │
  │     Tier 3 (×2):   cells 3, 15   (6, 30)                                 │
  │     Tier 4 (×3):   cell  16      (48)                                    │
  │     Tier 5 (×4):   cell  17      (68)                                    │
  │     Tier 6 (×6):   cell  18      (108)                                   │
  │   Max score = Σ payouts = 368.                                           │
  │   Coin payout = floor(score · wager / 5) — wager 5 = 1:1 score-to-coin. │
  │                                                                          │
  │   Exports (window.DiceChart): { init, achievable, RED_FACES, state }     │
  │   External deps: Wallet (required), Child (optional — recordPlay only)   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CHART_MIN=3; CHART_MAX=18; TOTAL_CELLS=16; MAX_SCORE=Σ payouts=368
  BASELINE_WAGER=5 (wager 5 → payout==score)
  RED_FACES=[+,+,−,−,+N,−N] (1d6 lookup; each {face,glyph,label})
  CELL_PAYOUTS={3:6,4:6,5:5,…,18:108}; CELL_TIERS={3:3,4:2,…,18:6}
  state: chart, whites[], red, achievable[], rolls, filled, score,
    holdIndex, gameOver=T (idle), endReason=null (idle vs finished),
    rolling, wager=0 (locked stake of current/last run), lastPayout=0
  d6()→1..6; subsets(w)→4 subs; plusSum/minusSigns/+N/−N expr builders
  achievable(w,face,filled)→[{value,expr}] sorted, ∈[3..18] ∧ !filled
  getWager()→int≥1: parseInt(#dc-wager) clamped
  computePayout(score,wager)→floor(score·wager/BASELINE_WAGER)
  beginRun(): w=getWager(); guard(Wallet.spend(w)→F else chip msg);
    Child?.recordPlay; resetBoard; wager=w; lastPayout=0;
    gameOver=F; endReason=null; render
  roll(): guard !gameOver && !rolling; tumble 520ms; whites+red commit;
    rolls++; recompute achievable; checkStranded; render
  toggleHold(idx): whites only; persists; toggle
  fillCell(v): score+=CELL_PAYOUTS[v]; filled++;
    filled≥16→endRun('complete'); else achievable=[]; render
  cashOut(): guard !gameOver; endRun('cashout')
  endRun(reason): gameOver=T; endReason=reason; clearRoll;
    payout=(reason==='stranded')?0:computePayout(score,wager);
    payout>0→Wallet.add(payout); lastPayout=payout; render
  checkStranded(): !gameOver ∧ achievable.len===0 → endRun('stranded')
  resetBoard(): chart={3..18→{filled:F,expr:""}}; clearRoll;
    rolls=filled=score=0
  maxWager(): #dc-wager.value=clamp(Wallet.bal, min, max); fire
  render(): paint cells, dice, chips, readouts, payout, wager-locked toggle;
    button state — idle/finished: #dc-new ENABLED "BEGIN RUN — Nc",
    ROLL/CASH disabled, wager input enabled. Playing: #dc-new DISABLED
    "RUN IN PROGRESS", ROLL/CASH per rules, wager input disabled.
    Banner: idle→hidden; finished→outcome + "score X · payout Yc".
  init(): bind ROLL/CASH/NEW/MAX/wager-input; resetBoard; render
  exports: global.DiceChart={init,achievable,RED_FACES,state};
    on DOMContentLoaded→init
*/
(function (global) {
  'use strict';

  const CHART_MIN = 3;
  const CHART_MAX = 18;
  const TOTAL_CELLS = CHART_MAX - CHART_MIN + 1;
  const RED_IDX = 3;
  // wager 5 → coin payout equals raw score (max 368). Higher wagers scale
  // linearly; stranded runs forfeit the stake entirely.
  const BASELINE_WAGER = 5;

  const TUMBLE_MS = 520;
  const TUMBLE_TICK_MS = 55;
  let rollTimer = null;

  const RED_FACES = [
    { face: 'plus',   glyph: '+',  label: '+'      },
    { face: 'plus',   glyph: '+',  label: '+'      },
    { face: 'minus',  glyph: '−',  label: '−'      },
    { face: 'minus',  glyph: '−',  label: '−'      },
    { face: 'plusN',  glyph: '+N', label: '+1/2/3' },
    { face: 'minusN', glyph: '−N', label: '−1/2/3' }
  ];

  const CELL_PAYOUTS = {
    3: 6,  4: 6,  5: 5,  6: 6,  7: 7,  8: 8,  9: 9,  10: 10,
    11: 11, 12: 12, 13: 13, 14: 21, 15: 30, 16: 48, 17: 68, 18: 108
  };
  const CELL_TIERS = {
    3: 3, 4: 2,
    5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1,
    14: 2, 15: 3, 16: 4, 17: 5, 18: 6
  };

  const ROMAN = [
    '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX',
    'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII'
  ];
  function toRoman(n) { return ROMAN[n] || String(n); }

  // gameOver=true + endReason=null  →  idle (between runs, waiting on BEGIN).
  // gameOver=false                  →  run in progress.
  // gameOver=true + endReason!=null →  finished run (banner + payout shown).
  const state = {
    chart: {},
    whites: [],
    red: null,
    achievable: [],
    rolls: 0,
    filled: 0,
    score: 0,
    holdIndex: null,
    gameOver: true,
    endReason: null,
    rolling: false,
    wager: 0,
    lastPayout: 0
  };

  function computePayout(score, wager) {
    if (!score || !wager) return 0;
    return Math.floor((score * wager) / BASELINE_WAGER);
  }

  function getWagerInput() {
    return document.getElementById('dc-wager');
  }
  function getWagerValue() {
    const el = getWagerInput();
    if (!el) return BASELINE_WAGER;
    let v = parseInt(el.value, 10);
    if (!isFinite(v) || v < 1) v = 1;
    return v;
  }

  function d6() { return 1 + Math.floor(Math.random() * 6); }

  function subsets(whites) {
    return [
      { idx: [0, 1],    vals: [whites[0], whites[1]] },
      { idx: [0, 2],    vals: [whites[0], whites[2]] },
      { idx: [1, 2],    vals: [whites[1], whites[2]] },
      { idx: [0, 1, 2], vals: [whites[0], whites[1], whites[2]] }
    ];
  }

  function plusSum(sub) {
    let s = 0;
    for (let i = 0; i < sub.vals.length; i++) s += sub.vals[i];
    return s;
  }

  function minusSigns(sub) {
    const n = sub.vals.length;
    const out = [];
    for (let mask = 1; mask < (1 << n); mask++) {
      const signs = [];
      let v = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) { v -= sub.vals[i]; signs.push('-'); }
        else                 { v += sub.vals[i]; signs.push('+'); }
      }
      out.push({ value: v, signs: signs });
    }
    return out;
  }

  function formatPlusExpr(sub) {
    return sub.vals.join(' + ');
  }

  function formatSignedExpr(sub, signs) {
    let s = (signs[0] === '-' ? '−' : '') + sub.vals[0];
    for (let i = 1; i < sub.vals.length; i++) {
      s += (signs[i] === '-' ? ' − ' : ' + ') + sub.vals[i];
    }
    return s;
  }

  function formatPlusNExpr(sub, n) {
    return sub.vals.join(' + ') + ' + ' + n;
  }

  function formatMinusNExpr(sub, n) {
    return sub.vals.join(' + ') + ' − ' + n;
  }

  function achievable(whites, redFace, filledSet) {
    const map = new Map();
    function tryAdd(value, expr) {
      if (!Number.isFinite(value)) return;
      if (value < CHART_MIN || value > CHART_MAX) return;
      if (filledSet && filledSet.has(value)) return;
      if (!map.has(value)) map.set(value, expr);
    }
    const subs = subsets(whites);
    if (redFace === 'plus') {
      for (const sub of subs) tryAdd(plusSum(sub), formatPlusExpr(sub));
    } else if (redFace === 'minus') {
      for (const sub of subs) {
        for (const r of minusSigns(sub)) {
          tryAdd(r.value, formatSignedExpr(sub, r.signs));
        }
      }
    } else if (redFace === 'plusN') {
      for (const sub of subs) {
        const s = plusSum(sub);
        for (let n = 1; n <= 3; n++) tryAdd(s + n, formatPlusNExpr(sub, n));
      }
    } else if (redFace === 'minusN') {
      for (const sub of subs) {
        const s = plusSum(sub);
        for (let n = 1; n <= 3; n++) tryAdd(s - n, formatMinusNExpr(sub, n));
      }
    }
    return Array.from(map.entries())
      .sort(function (a, b) { return a[0] - b[0]; })
      .map(function (kv) { return { value: kv[0], expr: kv[1] }; });
  }

  function filledSet() {
    const set = new Set();
    for (let v = CHART_MIN; v <= CHART_MAX; v++) {
      if (state.chart[v] && state.chart[v].filled) set.add(v);
    }
    return set;
  }

  function recomputeAchievable() {
    state.achievable = achievable(state.whites, state.red.face, filledSet());
  }

  function roll() {
    if (state.gameOver) return;
    if (state.rolling) return;
    // Player can re-roll even when achievable cells exist — abandoning them
    // is a real choice (sometimes the only achievable port is a bad one).

    // Commit the final values up front so the tumble can only display them.
    const finalWhites = [
      state.holdIndex === 0 && state.whites.length ? state.whites[0] : d6(),
      state.holdIndex === 1 && state.whites.length ? state.whites[1] : d6(),
      state.holdIndex === 2 && state.whites.length ? state.whites[2] : d6()
    ];
    const finalRed = RED_FACES[d6() - 1];

    // Ensure the dice array exists so the tumble interval has slots to
    // overwrite each tick.
    if (state.whites.length === 0) {
      state.whites = [d6(), d6(), d6()];
      state.red = RED_FACES[d6() - 1];
    }

    state.rolling = true;
    state.rolls += 1;
    render();

    const start = Date.now();
    if (rollTimer) clearInterval(rollTimer);
    rollTimer = setInterval(function () {
      if (Date.now() - start >= TUMBLE_MS) {
        clearInterval(rollTimer);
        rollTimer = null;
        state.whites = finalWhites;
        state.red = finalRed;
        state.rolling = false;
        recomputeAchievable();
        checkStranded();
        render();
        return;
      }
      // Randomize non-held dice (red is never held → always randomized).
      for (let i = 0; i < 3; i++) {
        if (i !== state.holdIndex) state.whites[i] = d6();
      }
      state.red = RED_FACES[d6() - 1];
      renderDice();
    }, TUMBLE_TICK_MS);
  }

  function toggleHold(idx) {
    if (state.gameOver) return;
    if (state.rolling) return;
    if (state.whites.length === 0) return;
    // Whites only — the red die always rerolls every turn.
    if (idx !== 0 && idx !== 1 && idx !== 2) return;
    state.holdIndex = (state.holdIndex === idx) ? null : idx;
    render();
  }

  function fillCell(value) {
    if (state.rolling) return;
    if (state.gameOver) return;
    if (state.whites.length === 0) return;
    const entry = state.achievable.find(function (a) { return a.value === value; });
    if (!entry) return;
    state.chart[value] = { filled: true, expr: entry.expr };
    state.filled += 1;
    state.score += CELL_PAYOUTS[value] || value;
    state.achievable = [];
    if (state.filled >= TOTAL_CELLS) {
      endRun('complete');
      return;
    }
    render();
  }

  function cashOut() {
    if (state.gameOver) return;
    endRun('cashout');
  }

  // Called after roll(). One roll per turn — if the dice can reach no
  // unfilled port, the run ends. The bad roll stays on screen as evidence.
  function checkStranded() {
    if (state.gameOver) return;
    if (state.achievable.length > 0) return;
    endRun('stranded');
  }

  function clearRoll() {
    state.whites = [];
    state.red = null;
    state.achievable = [];
    state.holdIndex = null;
  }

  function resetBoard() {
    if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
    state.rolling = false;
    state.chart = {};
    for (let v = CHART_MIN; v <= CHART_MAX; v++) {
      state.chart[v] = { filled: false, expr: '' };
    }
    clearRoll();
    state.rolls = 0;
    state.filled = 0;
    state.score = 0;
  }

  function beginRun() {
    // Pre-run checks: already running, or no Wallet on the page (standalone
    // preview) — in the standalone case fall back to a no-cost run so the
    // page is still playable for debugging.
    if (!state.gameOver && !state.endReason) {
      // already mid-run, button shouldn't be reachable but bail safely
      return;
    }
    const wager = getWagerValue();
    const hasWallet = !!(typeof window !== 'undefined' && window.Wallet);
    if (hasWallet) {
      if (!Wallet.spend(wager)) {
        flashChip('Not enough coins to stake ' + wager + '.', 'dc-no-fill');
        return;
      }
    }
    if (typeof window !== 'undefined' && window.Child && typeof Child.recordPlay === 'function') {
      Child.recordPlay();
    }
    resetBoard();
    state.wager = wager;
    state.lastPayout = 0;
    state.gameOver = false;
    state.endReason = null;
    render();
  }

  function endRun(reason) {
    if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
    state.rolling = false;
    state.gameOver = true;
    state.endReason = reason;
    // Stranded forfeits the stake; cashout/complete pay out the scaled score.
    const payout = (reason === 'stranded') ? 0 : computePayout(state.score, state.wager);
    state.lastPayout = payout;
    if (payout > 0 && typeof window !== 'undefined' && window.Wallet) {
      Wallet.add(payout);
    }
    // Stranded leaves the dice on screen as evidence; cashout/complete clear.
    if (reason !== 'stranded') clearRoll();
    render();
  }

  function maxWager() {
    const el = getWagerInput();
    if (!el) return;
    const bal = (typeof window !== 'undefined' && window.Wallet)
      ? Wallet.getBalance() : 0;
    let target = Math.max(1, bal | 0);
    const max = parseInt(el.max, 10);
    if (isFinite(max) && target > max) target = max;
    el.value = String(target);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Brief chip flash for transient feedback (e.g. failed stake). Doesn't
  // touch state; the next render() will overwrite the chip area as usual.
  function flashChip(msg, cls) {
    const chipsEl = document.getElementById('dc-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    const m = document.createElement('div');
    m.className = cls || 'dc-hint';
    m.textContent = msg;
    chipsEl.appendChild(m);
  }

  function makeDie(idx, glyph, isRed) {
    const d = document.createElement('div');
    d.className = 'dc-die ' + (isRed ? 'dc-die-red' : 'dc-die-white');
    d.textContent = glyph;
    const rolled = state.whites.length > 0;
    const isHeld = state.holdIndex === idx;
    const holdable = rolled && !state.gameOver && !state.rolling && !isRed;
    if (isHeld) d.classList.add('is-held');
    if (state.rolling && !isHeld) {
      d.classList.add('is-rolling');
      // small random delay so dice don't shake in lockstep across re-renders
      d.style.animationDelay = (-Math.random() * 0.1).toFixed(3) + 's';
    }
    if (holdable) {
      d.classList.add('is-holdable');
      d.title = 'Click to hold for the next throw';
      d.addEventListener('click', (function (i) {
        return function () { toggleHold(i); };
      })(idx));
    }
    return d;
  }

  function renderDice() {
    const diceEl = document.getElementById('dc-dice');
    if (!diceEl) return;
    diceEl.innerHTML = '';
    const empty = state.whites.length === 0;
    for (let i = 0; i < 3; i++) {
      if (empty) {
        const d = document.createElement('div');
        d.className = 'dc-die dc-die-white dc-die-empty';
        d.textContent = '?';
        diceEl.appendChild(d);
      } else {
        diceEl.appendChild(makeDie(i, String(state.whites[i]), false));
      }
    }
    if (empty) {
      const d = document.createElement('div');
      d.className = 'dc-die dc-die-red dc-die-empty';
      d.textContent = '?';
      diceEl.appendChild(d);
    } else {
      diceEl.appendChild(makeDie(RED_IDX, state.red.glyph, true));
    }
    diceEl.classList.toggle('is-rolling', state.rolling);
  }

  function render() {
    const cellsEl = document.getElementById('dc-cells');
    if (cellsEl) {
      cellsEl.innerHTML = '';
      for (let v = CHART_MIN; v <= CHART_MAX; v++) {
        const cell = document.createElement('div');
        const tier = CELL_TIERS[v] || 1;
        const payout = CELL_PAYOUTS[v] || v;
        cell.className = 'dc-cell dc-tier-' + tier;
        const entry = state.chart[v];
        const isFilled = !!(entry && entry.filled);
        const achEntry = state.achievable.find(function (a) { return a.value === v; });
        if (isFilled) cell.classList.add('is-filled');
        if (achEntry) cell.classList.add('is-achievable');

        const num = document.createElement('span');
        num.className = 'dc-cell-num';
        num.textContent = toRoman(v);

        const middle = document.createElement('span');
        middle.className = 'dc-cell-middle';
        if (isFilled || achEntry) {
          middle.textContent = isFilled ? entry.expr : achEntry.expr;
          middle.classList.add('dc-cell-expr');
        } else {
          middle.textContent = '· · · · · · · · · · · ·';
          middle.classList.add('dc-cell-trail');
        }

        const tag = document.createElement('span');
        tag.className = 'dc-cell-payout';
        tag.textContent = '+' + payout;

        cell.appendChild(num);
        cell.appendChild(middle);
        cell.appendChild(tag);
        if (achEntry) {
          cell.title = 'Ink ' + toRoman(v) + ' (+' + payout + ') via ' + achEntry.expr;
          cell.addEventListener('click', (function (val) {
            return function () { fillCell(val); };
          })(v));
        }
        cellsEl.appendChild(cell);
      }
    }
    renderDice();
    const idle = state.gameOver && !state.endReason;
    const playing = !state.gameOver;
    const finished = state.gameOver && !!state.endReason;
    const chipsEl = document.getElementById('dc-chips');
    if (chipsEl) {
      chipsEl.innerHTML = '';
      let msg, cls;
      if (idle) {
        msg = 'Set a wager, then BEGIN RUN.';
        cls = 'dc-hint';
      } else if (finished) {
        if (state.endReason === 'stranded') {
          msg = 'No play possible — the stake is forfeit.';
          cls = 'dc-no-fill';
        } else if (state.endReason === 'complete') {
          msg = 'Ledger complete — paid out ' + state.lastPayout + ' coins.';
          cls = 'dc-hint';
        } else {
          msg = 'Cashed out — ' + state.lastPayout + ' coins.';
          cls = 'dc-hint';
        }
      } else if (state.whites.length === 0) {
        msg = 'Cast the dice.';
        cls = 'dc-hint';
      } else if (state.achievable.length > 0) {
        msg = 'Ink a glowing port.';
        cls = 'dc-hint';
      } else {
        msg = 'Hold a die, then ROLL the next turn.';
        cls = 'dc-hint';
      }
      const m = document.createElement('div');
      m.className = cls;
      m.textContent = msg;
      chipsEl.appendChild(m);
    }

    const rollsEl = document.getElementById('dc-rolls');
    if (rollsEl) rollsEl.textContent = state.rolls;
    const filledEl = document.getElementById('dc-filled');
    if (filledEl) filledEl.textContent = state.filled + ' / ' + TOTAL_CELLS;
    const scoreEl = document.getElementById('dc-score');
    if (scoreEl) scoreEl.textContent = state.score;
    const payoutEl = document.getElementById('dc-payout');
    if (payoutEl) {
      // While the run is live, show the *projected* payout if the player
      // cashed out right now. Idle: zero. Finished: the actual paid amount.
      let p;
      if (idle) p = 0;
      else if (finished) p = state.lastPayout;
      else p = computePayout(state.score, state.wager);
      payoutEl.textContent = p;
    }

    const wagerInput = getWagerInput();
    if (wagerInput) {
      // Stake is locked the moment a run begins. Re-enabled when idle or
      // when the previous run has resolved (player can re-wager).
      wagerInput.disabled = playing;
    }
    const maxBtn = document.getElementById('dc-max');
    if (maxBtn) maxBtn.disabled = playing;

    const rollBtn = document.getElementById('dc-roll');
    if (rollBtn) {
      rollBtn.disabled = !playing || state.rolling;
    }
    const cashBtn = document.getElementById('dc-cashout');
    if (cashBtn) {
      cashBtn.disabled = !playing || state.rolling;
    }
    const newBtn = document.getElementById('dc-new');
    if (newBtn) {
      // BEGIN RUN is the only entry point. Disabled mid-run so the player
      // can't accidentally forfeit a live stake by clicking it.
      newBtn.disabled = playing;
      const w = getWagerValue();
      newBtn.textContent = playing
        ? 'RUN IN PROGRESS'
        : ('BEGIN RUN — ' + w + 'c');
    }

    const banner = document.getElementById('dc-banner');
    if (banner) {
      if (finished) {
        banner.hidden = false;
        let label;
        if (state.endReason === 'complete')      label = 'LEDGER COMPLETE';
        else if (state.endReason === 'cashout')  label = 'CASHED OUT';
        else if (state.endReason === 'stranded') label = 'STRANDED';
        else                                     label = 'GAME OVER';
        banner.dataset.outcome = state.endReason;
        const payoutTxt = state.lastPayout > 0
          ? (' · paid ' + state.lastPayout + 'c')
          : ' · no payout';
        banner.textContent = label
          + ' — score ' + state.score
          + ' · ' + state.filled + '/' + TOTAL_CELLS + ' filled · '
          + state.rolls + ' rolls · stake ' + state.wager + 'c'
          + payoutTxt;
      } else {
        banner.hidden = true;
        banner.textContent = '';
        delete banner.dataset.outcome;
      }
    }
  }

  function init() {
    const rollBtn   = document.getElementById('dc-roll');
    const cashBtn   = document.getElementById('dc-cashout');
    const newBtn    = document.getElementById('dc-new');
    const maxBtn    = document.getElementById('dc-max');
    const wagerInp  = getWagerInput();
    if (rollBtn) rollBtn.addEventListener('click', roll);
    if (cashBtn) cashBtn.addEventListener('click', cashOut);
    if (newBtn)  newBtn.addEventListener('click', beginRun);
    if (maxBtn)  maxBtn.addEventListener('click', maxWager);
    // Wager input changes re-render so the BEGIN button's label updates
    // ("BEGIN RUN — Nc") even before the player clicks it.
    if (wagerInp) {
      wagerInp.addEventListener('input', render);
      wagerInp.addEventListener('change', render);
    }
    resetBoard();
    state.gameOver = true;
    state.endReason = null;
    state.wager = 0;
    state.lastPayout = 0;
    render();
  }

  global.DiceChart = {
    init: init,
    achievable: achievable,
    RED_FACES: RED_FACES,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
