/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRITICAL HIT — wagered dice-merging round (13d4, threshold 20)          │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init() ─► phase='idle', empty pool, bind buttons  │
  │                                                                          │
  │   Phases:                                                                │
  │     idle      ──► wager editable, MAIN="DEAL"                            │
  │     live      ──► dice dealt, wager locked, MAIN="CASH OUT"              │
  │     settled   ──► result banner shown, MAIN="NEW ROUND"                  │
  │                                                                          │
  │   DEAL  (idle→live):                                                     │
  │     guard wager>0 + Wallet.spend(wager); Child.recordPlay;               │
  │     initDice (13 d4 in dice pool); rollAllFree (initial tumble)          │
  │                                                                          │
  │   merge / hold / ROLL  (only in live phase, before CASH OUT)             │
  │                                                                          │
  │   CASH OUT (live→settled):                                               │
  │     score=computeScore; tier=payoutTier(score);                          │
  │     payout=wager*tier.mult; Wallet.add(payout); show banner              │
  │                                                                          │
  │   NEW ROUND (settled→idle):                                              │
  │     dice=[]; rerollsLeft=2; payout=0; hide banner; back to idle          │
  │                                                                          │
  │   RESET (any phase→idle): forfeit if mid-round (no refund), back to idle │
  │                                                                          │
  │   Payout tiers (require score ≥ 20 to break even):                       │
  │     ≤19        lose wager                                                │
  │     20–33      wager × 1   (PUFF — stake refund)                         │
  │     34–49      wager × 2   (HIT — one d20)                               │
  │     50–67      wager × 3   (BIG HIT — d20+d12 territory)                 │
  │     68+        wager × 6   (CRITICAL HIT — needs 2× d20)                 │
  │                                                                          │
  │   Exports (window.CriticalHit): { init, state, SIZES, PAYOUT_TIERS }     │
  │   External deps: Wallet, Child                                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIZES=[4,6,8,10,12,20]; SCORE_BY_SIZE={4:1,6:3,8:7,10:13,12:21,20:36}
  START_COUNT=13; START_SIZE=4; START_REROLLS=2; MIN_WIN_SCORE=20
  PAYOUT_TIERS=[{min:68,mult:6},{min:50,mult:3},{min:34,mult:2},{min:20,mult:1}]
  TICK_MS=55; TICKS=9
  state: phase='idle', wager=5, payout=0, dice=[], rolling=Set, draggingId,
    nextId=0, rerollsLeft=2
  rollFace(s)→int; nextSize(s)→int|null; mkDie(size)→die; findDie(id)
  computeScore()→int: Σ SCORE_BY_SIZE[d.size]
  payoutFor(score)→{mult,tierLabel}: scan tiers, first matching min; below 8 → mult=0
  readWager()→int: max(1, parseInt(#dm-wager.value))
  deal(): guard phase==='idle'; w=readWager; w<1||!Wallet.spend(w)→ret;
    state.wager=w; phase='live'; rerollsLeft=2; payout=0;
    Child?.recordPlay; initDice; render; rollAllFree
  cashOut(): guard phase==='live'&&!rolling.size; phase='settled';
    s=computeScore; t=payoutFor(s); payout=wager*t.mult;
    payout>0→Wallet.add(payout); render (show banner)
  newRound(): phase='idle'; dice=[]; rolling.clear; payout=0; rerollsLeft=2; render
  reset(): newRound (forfeit if mid-round, no refund)
  rollAllFree() ─ unchanged (only in 'live' phase)
  tryMerge / toggleHold ─ unchanged (only when phase==='live'&&!rolling)
  onMainClick(): idle→deal; live→cashOut; settled→newRound
  render(): paint pool, update Coins/Wager/Rerolls/Score readouts, set MAIN
    label by phase, enable/disable ROLL, show/hide #dm-result banner with
    score+payout copy
  init(): bind controls, sub Wallet.onChange→#balance, render
  exports: global.CriticalHit={init,state,SIZES,PAYOUT_TIERS}; on DOMContentLoaded→init
*/
(function (global) {
  'use strict';

  const SIZES = [4, 6, 8, 10, 12, 20];
  // Rebalanced from the old 2^n−1 series. That curve made the headline
  // CRITICAL HIT (2× d20 = 126 pts) effectively unreachable and left the
  // middle tiers (HIT, BIG HIT) starved. The new table compresses the
  // upper end so the ladder bends middle-heavy: a single d20 still feels
  // big but two of them is now actually approachable, and the value
  // distance d12 → d20 is no longer a doubling cliff.
  // Floor d4=1 so the opening table reads as "10 pts" instead of zero.
  const SCORE_BY_SIZE = { 4: 1, 6: 3, 8: 7, 10: 13, 12: 21, 20: 36 };
  const START_COUNT = 13;
  const START_SIZE = 4;
  const START_REROLLS = 2;
  const MIN_WIN_SCORE = 20;
  const TICK_MS = 55;
  const TICKS = 9;

  // Highest tier first — payoutFor() scans top-down. Anchored to the
  // material the player actually has: 13 d4 caps the pool at 2× d20 + a
  // small leftover die (theoretical ceiling ≈ 79). Reference scores:
  //   13× d4 = 13                    (bust floor)
  //   1× d20 + scraps  ≈ 36–44       (HIT band, the common "good round")
  //   1× d20 + 1× d12 + scraps ≈ 60  (BIG HIT band, takes real play)
  //   2× d20 + scraps  ≈ 73–79       (CRITICAL HIT, near-ceiling)
  const PAYOUT_TIERS = [
    { min: 68, mult:  6, label: 'CRITICAL HIT' },  // needs both d20s
    { min: 50, mult:  3, label: 'BIG HIT'      },  // d20 + d12 territory
    { min: 34, mult:  2, label: 'HIT'          },  // ~single d20
    { min: 20, mult:  1, label: 'PUFF'         },  // refund
  ];

  const state = {
    phase: 'idle',
    wager: 5,
    payout: 0,
    dice: [],
    rolling: new Set(),
    draggingId: null,
    nextId: 0,
    rerollsLeft: START_REROLLS,
  };

  function rollFace(size) { return 1 + Math.floor(Math.random() * size); }
  function nextSize(size) {
    const idx = SIZES.indexOf(size);
    if (idx < 0 || idx === SIZES.length - 1) return null;
    return SIZES[idx + 1];
  }
  function mkDie(size) {
    return { id: state.nextId++, size, value: rollFace(size) };
  }
  function findDie(id) { return state.dice.find((d) => d.id === id) || null; }
  function isRolling(id) { return state.rolling.has(id); }

  function initDice() {
    state.dice = [];
    state.nextId = 0;
    state.rolling.clear();
    state.draggingId = null;
    state.rerollsLeft = START_REROLLS;
    for (let i = 0; i < START_COUNT; i++) state.dice.push(mkDie(START_SIZE));
  }

  function computeScore() {
    let s = 0;
    for (const d of state.dice) s += (SCORE_BY_SIZE[d.size] || 0);
    return s;
  }

  function payoutFor(score) {
    if (score < MIN_WIN_SCORE) return { mult: 0, label: 'BUST' };
    for (const t of PAYOUT_TIERS) if (score >= t.min) return t;
    return { mult: 0, label: 'BUST' };
  }

  function readWager() {
    const el = document.getElementById('dm-wager');
    if (!el) return 1;
    const n = parseInt(el.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function deal() {
    if (state.phase !== 'idle') return;
    const W = global.Wallet;
    const w = readWager();
    if (w < 1) return;
    if (W && typeof W.spend === 'function' && !W.spend(w)) return; // not enough coins
    state.wager = w;
    state.payout = 0;
    state.phase = 'live';
    if (global.Child && typeof global.Child.recordPlay === 'function') {
      global.Child.recordPlay();
    }
    if (global.CritSFX) global.CritSFX.deal();
    initDice();
    render();
    rollAllFree();
  }

  function newRound() {
    state.phase = 'idle';
    state.dice = [];
    state.rolling.clear();
    state.payout = 0;
    state.rerollsLeft = START_REROLLS;
    state.draggingId = null;
    const pool = document.getElementById('dm-pool');
    if (pool) pool.classList.remove('dm-flash-win', 'dm-flash-crit', 'dm-flash-bust');
    render();
  }

  function reset() {
    // Hard reset — abandon any live round without refund.
    newRound();
  }

  // ── Rolling / merging ────────────────────────────────────────────────────

  function animateRoll(el, finalSize, finalValue) {
    return new Promise((resolve) => {
      const currentSize = Number(el.dataset.size);
      if (currentSize !== finalSize) {
        for (const s of SIZES) el.classList.remove('dm-die-d' + s);
        el.classList.add('dm-die-d' + finalSize);
        el.dataset.size = String(finalSize);
        const shape = el.querySelector('.dm-die-shape');
        if (shape) {
          const wrap = document.createElement('div');
          wrap.innerHTML = shapeSvgMarkup(finalSize);
          const fresh = wrap.firstElementChild;
          if (fresh) shape.replaceWith(fresh);
        }
        const lbl = el.querySelector('.dm-die-label');
        if (lbl) lbl.textContent = 'd' + finalSize;
      }
      el.classList.add('dm-rolling');
      if (global.CritSFX) global.CritSFX.startDiceRoll();
      const valEl = el.querySelector('.dm-die-value');
      let i = 0;
      const step = () => {
        i++;
        if (i >= TICKS) {
          if (valEl) valEl.textContent = String(finalValue);
          el.classList.remove('dm-rolling');
          el.dataset.value = String(finalValue);
          if (global.CritSFX) {
            global.CritSFX.stopDiceRoll();
            global.CritSFX.diceLand();
          }
          resolve();
          return;
        }
        if (valEl) valEl.textContent = String(1 + Math.floor(Math.random() * finalSize));
        setTimeout(step, TICK_MS);
      };
      setTimeout(step, TICK_MS);
    });
  }

  function rollAllFree() {
    if (state.phase !== 'live') return Promise.resolve();
    const targets = state.dice.filter((d) => !isRolling(d.id));
    if (targets.length === 0) return Promise.resolve();
    for (const d of targets) state.rolling.add(d.id);
    render();
    const promises = targets.map((d) => {
      const final = rollFace(d.size);
      const el = document.querySelector('.dm-die[data-id="' + d.id + '"]');
      const p = el ? animateRoll(el, d.size, final) : Promise.resolve();
      return p.then(() => { d.value = final; });
    });
    return Promise.all(promises).then(() => {
      for (const d of targets) state.rolling.delete(d.id);
      render();
      maybeAutoSettle();
    });
  }

  function tryMerge(srcId, tgtId) {
    if (state.phase !== 'live') return;
    if (srcId === null || tgtId === null || srcId === tgtId) return;
    const a = findDie(srcId);
    const b = findDie(tgtId);
    if (!a || !b) return;
    if (isRolling(a.id) || isRolling(b.id)) return;
    if (a.value !== b.value) return;
    const ns = nextSize(Math.max(a.size, b.size));
    if (!ns) return;
    state.dice = state.dice.filter((x) => x !== a);
    b.size = ns;
    state.rolling.add(b.id);
    if (global.CritSFX) global.CritSFX.merge();
    render();
    const final = rollFace(ns);
    const el = document.querySelector('.dm-die[data-id="' + b.id + '"]');
    const p = el ? animateRoll(el, ns, final) : Promise.resolve();
    p.then(() => {
      b.value = final;
      state.rolling.delete(b.id);
      render();
      maybeAutoSettle();
    });
  }

  function hasAvailableMerges() {
    const byVal = new Map();
    for (const d of state.dice) {
      if (!byVal.has(d.value)) byVal.set(d.value, []);
      byVal.get(d.value).push(d);
    }
    for (const arr of byVal.values()) {
      if (arr.length < 2) continue;
      const maxS = Math.max.apply(null, arr.map((d) => d.size));
      if (nextSize(maxS)) return true;
    }
    return false;
  }

  function maybeAutoSettle() {
    if (state.phase !== 'live') return;
    if (state.rolling.size > 0) return;
    if (state.rerollsLeft > 0) return;
    if (hasAvailableMerges()) return;
    // Out of rerolls AND no merges available — round is done.
    settle();
  }

  function settle() {
    if (state.phase !== 'live') return;
    const score = computeScore();
    const tier = payoutFor(score);
    state.payout = state.wager * tier.mult;
    state.phase = 'settled';
    if (state.payout > 0 && global.Wallet && typeof global.Wallet.add === 'function') {
      global.Wallet.add(state.payout);
    }
    if (global.CritSFX) {
      if (state.payout <= 0)              global.CritSFX.bust();
      else if (tier.mult >= 6)            global.CritSFX.crit();
      else if (tier.mult >= 2)            global.CritSFX.win();
      else                                global.CritSFX.diceLand(); // soft ×1 acknowledgment
    }
    // Visual flash on the pool — gives the player a clear "you won" beat
    // that lasts past the banner-fade. Tier dictates intensity class.
    const pool = document.getElementById('dm-pool');
    if (pool) {
      pool.classList.remove('dm-flash-win', 'dm-flash-crit', 'dm-flash-bust');
      void pool.offsetWidth;
      if (state.payout <= 0)         pool.classList.add('dm-flash-bust');
      else if (tier.mult >= 6)       pool.classList.add('dm-flash-crit');
      else if (tier.mult >= 2)       pool.classList.add('dm-flash-win');
    }
    render();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function shapeSvgMarkup(size) {
    const points = {
      4:  '50,8 92,86 8,86',
      6:  '12,12 88,12 88,88 12,88',
      8:  '50,6 90,50 50,94 10,50',
      10: '50,6 92,38 76,88 24,88 8,38',
      12: '50,6 90,28 90,72 50,94 10,72 10,28',
      20: '30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30',
    };
    const pts = points[size] || points[6];
    return (
      '<svg class="dm-die-shape" viewBox="0 0 100 100" aria-hidden="true">' +
      '<polygon points="' + pts + '" />' +
      '</svg>'
    );
  }

  function dieEl(d) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dm-die dm-die-d' + d.size;
    if (isRolling(d.id)) btn.classList.add('dm-rolling');
    btn.dataset.id = String(d.id);
    btn.dataset.size = String(d.size);
    btn.dataset.value = String(d.value);
    btn.draggable = !isRolling(d.id) && state.phase === 'live';
    btn.setAttribute('aria-label', 'd' + d.size + ' showing ' + d.value);
    btn.innerHTML =
      shapeSvgMarkup(d.size) +
      '<span class="dm-die-value">' + d.value + '</span>' +
      '<span class="dm-die-label">d' + d.size + '</span>';

    btn.addEventListener('dragstart', function (e) {
      if (state.phase !== 'live' || isRolling(d.id)) { e.preventDefault(); return; }
      state.draggingId = d.id;
      e.dataTransfer.setData('text/plain', String(d.id));
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dm-dragging');
      markDropEligible(d);
    });
    btn.addEventListener('dragend', function () {
      btn.classList.remove('dm-dragging');
      state.draggingId = null;
      clearDropMarks();
    });
    btn.addEventListener('dragover', function (e) {
      if (state.draggingId === null || state.draggingId === d.id) return;
      const src = findDie(state.draggingId);
      if (!src) return;
      if (src.value !== d.value) return;
      if (!nextSize(Math.max(src.size, d.size))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      btn.classList.add('dm-drop-target');
    });
    btn.addEventListener('dragleave', function () {
      btn.classList.remove('dm-drop-target');
    });
    btn.addEventListener('drop', function (e) {
      e.preventDefault();
      btn.classList.remove('dm-drop-target');
      const id = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isFinite(id)) return;
      tryMerge(id, d.id);
    });
    return btn;
  }

  function markDropEligible(src) {
    for (const d of state.dice) {
      if (d.id === src.id) continue;
      if (d.value !== src.value) continue;
      if (!nextSize(Math.max(src.size, d.size))) continue;
      const el = document.querySelector('.dm-die[data-id="' + d.id + '"]');
      if (el) el.classList.add('dm-drop-eligible');
    }
  }

  function clearDropMarks() {
    for (const el of document.querySelectorAll('.dm-drop-eligible, .dm-drop-target')) {
      el.classList.remove('dm-drop-eligible');
      el.classList.remove('dm-drop-target');
    }
  }

  function render() {
    const pool = document.getElementById('dm-pool');
    if (pool) {
      for (const el of pool.querySelectorAll('.dm-die')) el.remove();
      for (const d of state.dice) pool.appendChild(dieEl(d));
    }

    setText('dm-rerolls', String(state.rerollsLeft));
    setText('dm-score', String(computeScore()));
    setText('dm-balance', String(walletBalance()));
    setText('dm-wager-readout', String(state.wager));

    // Wager input behavior + UI gates
    const wagerInput = document.getElementById('dm-wager');
    if (wagerInput) wagerInput.disabled = (state.phase !== 'idle');

    const wagerMax = document.getElementById('dm-wager-max');
    if (wagerMax) wagerMax.disabled = (state.phase !== 'idle');

    const mainBtn = document.getElementById('dm-main');
    if (mainBtn) {
      mainBtn.textContent = mainLabel();
      mainBtn.disabled = mainDisabled();
      mainBtn.dataset.phase = state.phase;
    }

    const rollBtn = document.getElementById('dm-roll');
    if (rollBtn) {
      rollBtn.disabled =
        state.phase !== 'live' ||
        state.rolling.size > 0 ||
        state.rerollsLeft <= 0;
    }

    setText('dm-hint', computeHint());

    // Result banner
    const banner = document.getElementById('dm-result');
    if (banner) {
      if (state.phase === 'settled') {
        const s = computeScore();
        const t = payoutFor(s);
        banner.hidden = false;
        // outcome: bust (no payout), even (×1 refund), win (×2+)
        banner.dataset.outcome =
          state.payout <= 0     ? 'bust' :
          t.mult === 1          ? 'even' :
                                  'win';
        const labelEl  = banner.querySelector('.dm-result-label');
        const amountEl = banner.querySelector('.dm-result-amount');
        const detailEl = banner.querySelector('.dm-result-detail');
        if (labelEl) labelEl.textContent = state.payout > 0 ? t.label : 'BUST';
        if (amountEl) {
          // The headline number: how much the wallet just changed by.
          // ×1 PUFF returns the stake (net 0 change); win tiers show the
          // full positive payout including the stake refund.
          if (state.payout <= 0) {
            amountEl.textContent = `−${state.wager} coins`;
          } else if (t.mult === 1) {
            amountEl.textContent = `±0 (refund)`;
          } else {
            const net = state.payout - state.wager;
            amountEl.textContent = `+${net} coins`;
          }
          // Re-trigger pop animation on every settle.
          amountEl.style.animation = 'none';
          void amountEl.offsetWidth;
          amountEl.style.animation = '';
        }
        if (detailEl) {
          if (state.payout <= 0) {
            detailEl.textContent =
              `Score ${s} · need ${MIN_WIN_SCORE} to break even.`;
          } else if (t.mult === 1) {
            detailEl.textContent =
              `Score ${s} · ${state.wager} stake returned.`;
          } else {
            detailEl.textContent =
              `Score ${s} · ${state.wager} → ${state.payout} (×${t.mult})`;
          }
        }
      } else {
        banner.hidden = true;
      }
    }
  }

  function mainLabel() {
    if (state.phase === 'idle')    return 'DEAL';
    if (state.phase === 'live')    return 'PLAYING…';
    if (state.phase === 'settled') return 'NEW ROUND';
    return 'DEAL';
  }

  function mainDisabled() {
    if (state.phase === 'idle') {
      const w = readWager();
      return w < 1 || walletBalance() < w;
    }
    if (state.phase === 'live')    return true;
    return false;
  }

  function walletBalance() {
    if (global.Wallet && typeof global.Wallet.getBalance === 'function') {
      return global.Wallet.getBalance();
    }
    return 0;
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function computeHint() {
    if (state.phase === 'idle') {
      return `Place your wager. ${MIN_WIN_SCORE}+ to break even. DEAL when ready.`;
    }
    if (state.phase === 'settled') {
      return state.payout > 0
        ? 'NEW ROUND to play again.'
        : 'NEW ROUND to try again.';
    }
    if (state.rolling.size > 0) return 'rolling…';
    if (hasAvailableMerges()) return 'Matches available — drag a die onto its twin.';
    if (state.rerollsLeft > 0) return 'No merges. ROLL to fish for new matches.';
    return 'Settling…';
  }

  // ── Bindings ─────────────────────────────────────────────────────────────

  function bindControls() {
    const main = document.getElementById('dm-main');
    if (main) main.addEventListener('click', function () {
      if (state.phase === 'idle')    return deal();
      if (state.phase === 'settled') return newRound();
      // 'live' is a no-op — round auto-settles when out of rerolls + no merges.
    });

    const roll = document.getElementById('dm-roll');
    if (roll) roll.addEventListener('click', function () {
      if (state.phase !== 'live' || state.rerollsLeft <= 0 || state.rolling.size > 0) return;
      state.rerollsLeft -= 1;
      rollAllFree();
    });

    const rst = document.getElementById('dm-reset');
    if (rst) rst.addEventListener('click', reset);

    const wagerInput = document.getElementById('dm-wager');
    if (wagerInput) wagerInput.addEventListener('input', function () { render(); });

    const wagerMax = document.getElementById('dm-wager-max');
    if (wagerMax) wagerMax.addEventListener('click', function () {
      if (state.phase !== 'idle') return;
      const w = walletBalance();
      if (wagerInput) wagerInput.value = String(Math.max(1, w));
      render();
    });

    // Wallet listener → re-render when balance changes (spend/add)
    if (global.Wallet && typeof global.Wallet.onChange === 'function') {
      global.Wallet.onChange(function () { render(); });
    }
  }

  function init() {
    state.phase = 'idle';
    state.dice = [];
    state.rolling.clear();
    state.payout = 0;
    state.rerollsLeft = START_REROLLS;
    bindControls();
    render();
  }

  global.CriticalHit = { init, state, SIZES, PAYOUT_TIERS };
  document.addEventListener('DOMContentLoaded', init);
})(window);
