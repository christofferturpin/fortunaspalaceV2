(function () {
  // ====== DICE COLORING ======
  // Die index 0..2. Each die has two red faces; the rest are black.
  const RED_FACES = [
    new Set([1, 2]), // Die 1
    new Set([3, 4]), // Die 2
    new Set([5, 6]), // Die 3
  ];

  function isRedFace(dieIdx, value) {
    return RED_FACES[dieIdx].has(value);
  }

  // ====== BETS ======
  // Top row determines the NUMBER of tokens minted on hit.
  // Bottom row determines the per-token VALUE multiplier (vs. wager) on hit.
  // Top miss → 0 tokens (no bottom bonus matters). Bottom miss → ×1.
  const BETS = {
    low:       { name: 'Low',        row: 'top',    count: 10, check: (d, sum) => sum >= 3  && sum <= 7  },
    mid:       { name: 'Mid',        row: 'top',    count: 2,  check: (d, sum) => sum >= 8  && sum <= 15 },
    high:      { name: 'High',       row: 'top',    count: 35, check: (d, sum) => sum >= 16 && sum <= 18 },
    black:     { name: 'All Black',  row: 'bottom', multiplier: 2,  check: (d) => d.every((v, i) => !isRedFace(i, v)) },
    red:       { name: 'All Red',    row: 'bottom', multiplier: 10, check: (d) => d.every((v, i) =>  isRedFace(i, v)) },
    run:       { name: 'Run',        row: 'bottom', multiplier: 5,  check: (d) => {
      const s = [...d].sort((a, b) => a - b);
      return s[1] === s[0] + 1 && s[2] === s[1] + 1;
    } },
    nodoubles: { name: 'No Doubles', row: 'third',  big: true, check: (d) => new Set(d).size === 3 },
    doubles:   { name: 'Doubles',    row: 'third',  big: true, check: (d) => new Set(d).size < 3 },
  };
  // ====== STORAGE ======
  // Shared state with the pusher module:
  //   drops:      tokens won, with the wager that minted them (per-coin value)
  //   lastBet:    most recent wager — the pusher uses this to reprice its pile
  //   rollCount:  monotonic counter the pusher watches to replenish the field
  const STORAGE_KEY = 'wendys_palace_coinpusher';

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  }

  function writeState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  function readDrops() {
    const obj = readState();
    const drops = Array.isArray(obj.drops) ? obj.drops : [];
    return drops.filter((d) => d && d.count > 0);
  }

  function writeDrops(drops) {
    const obj = readState();
    obj.drops = drops;
    writeState(obj);
  }

  // ====== STATE ======
  let picks = { top: null, bottom: null, third: null };
  let rolling = false;

  let dieEls, spotEls, wagerEl, wagerMaxBtn, rollBtn, clearBtn,
      tokensEl, readoutEl, pickTopEl, pickBottomEl, pickThirdEl;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    dieEls = [
      document.getElementById('cp-die-1'),
      document.getElementById('cp-die-2'),
      document.getElementById('cp-die-3'),
    ];
    spotEls = Array.from(document.querySelectorAll('.cp-spot'));
    wagerEl = document.getElementById('cp-wager');
    wagerMaxBtn = document.getElementById('cp-wager-max');
    rollBtn = document.getElementById('cp-roll');
    clearBtn = document.getElementById('cp-clear');
    tokensEl = document.getElementById('cp-tokens');
    readoutEl = document.getElementById('cp-readout');
    pickTopEl = document.getElementById('cp-pick-top');
    pickBottomEl = document.getElementById('cp-pick-bottom');
    pickThirdEl = document.getElementById('cp-pick-third');

    spotEls.forEach((spot) => {
      spot.addEventListener('click', () => setPick(spot.dataset.row, spot.dataset.bet));
      spot.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setPick(spot.dataset.row, spot.dataset.bet);
        }
      });
    });

    wagerEl.addEventListener('input', refreshHud);
    wagerEl.addEventListener('blur', normalizeWager);
    wagerMaxBtn.addEventListener('click', () => {
      const bal = window.Wallet ? window.Wallet.getBalance() : 0;
      wagerEl.value = String(Math.max(1, bal));
      refreshHud();
    });

    rollBtn.addEventListener('click', onRoll);
    clearBtn.addEventListener('click', clearPicks);

    if (window.Wallet && typeof window.Wallet.onChange === 'function') {
      window.Wallet.onChange(refreshHud);
    }

    renderDie(0, 1);
    renderDie(1, 3);
    renderDie(2, 5);
    refreshHud();
  }

  // ====== PICKS / WAGER ======
  function setPick(row, key) {
    if (rolling || !row || !key) return;
    if (!(row in picks)) return;
    // Click the already-selected tile to unselect it; otherwise replace.
    picks[row] = picks[row] === key ? null : key;
    spotEls.forEach((s) => s.classList.remove('cp-spot-hit', 'cp-spot-miss'));
    refreshHud();
  }

  function clearPicks() {
    if (rolling) return;
    picks.top = null;
    picks.bottom = null;
    picks.third = null;
    spotEls.forEach((s) => s.classList.remove('cp-spot-hit', 'cp-spot-miss'));
    readoutEl.className = 'cp-readout';
    readoutEl.textContent = 'Pick one from each row. Then roll.';
    refreshHud();
  }

  function getWager() {
    const v = parseInt(wagerEl.value, 10);
    return Number.isFinite(v) && v >= 1 ? v : 0;
  }

  function normalizeWager() {
    const v = getWager();
    wagerEl.value = v === 0 ? '' : String(v);
    refreshHud();
  }

  function totalTrayTokens() {
    return readDrops().reduce((s, d) => s + d.count, 0);
  }

  function picksComplete() {
    return !!(picks.top && picks.bottom && picks.third);
  }

  function refreshHud() {
    spotEls.forEach((s) => {
      const row = s.dataset.row;
      const key = s.dataset.bet;
      const picked = picks[row] === key;
      s.classList.toggle('cp-picked', picked);
      s.setAttribute('aria-pressed', picked ? 'true' : 'false');
    });
    if (pickTopEl)    pickTopEl.textContent    = picks.top    ? BETS[picks.top].name    : '—';
    if (pickBottomEl) pickBottomEl.textContent = picks.bottom ? BETS[picks.bottom].name : '—';
    if (pickThirdEl)  pickThirdEl.textContent  = picks.third  ? BETS[picks.third].name  : '—';

    tokensEl.textContent = String(totalTrayTokens());

    const wager = getWager();
    const bal = window.Wallet ? window.Wallet.getBalance() : 0;
    const canRoll = !rolling && wager > 0 && wager <= bal && picksComplete();
    rollBtn.disabled = !canRoll;
    if (rolling)                rollBtn.textContent = '…';
    else if (wager <= 0)        rollBtn.textContent = 'SET WAGER';
    else if (wager > bal)       rollBtn.textContent = 'NOT ENOUGH';
    else if (!picksComplete())  rollBtn.textContent = 'PICK 3';
    else                        rollBtn.textContent = `ROLL · ${wager}c`;
  }

  // ====== DIE RENDERING ======
  const FACE_PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  function renderDie(dieIdx, value) {
    const el = dieEls[dieIdx];
    if (!el) return;
    const red = isRedFace(dieIdx, value);
    el.classList.remove('cp-die-red', 'cp-die-black');
    el.classList.add(red ? 'cp-die-red' : 'cp-die-black');
    el.dataset.value = value;
    el.setAttribute('aria-label', `Die ${dieIdx + 1}: ${value}, ${red ? 'red' : 'black'} face`);
    const pips = new Set(FACE_PIPS[value] || []);
    let html = '';
    for (let i = 0; i < 9; i++) {
      html += `<span class="${pips.has(i) ? 'pip' : 'pip pip-empty'}"></span>`;
    }
    el.innerHTML = html;
  }

  // ====== ROLL ======
  function onRoll() {
    if (rolling) return;
    const wager = getWager();
    if (wager <= 0 || !picksComplete()) return;
    if (!window.Wallet || !window.Wallet.spend(wager)) return;

    // Stamp the bet so the pusher reprices its pre-placed coins and
    // replenishes one new coin per roll.
    const s = readState();
    s.lastBet = wager;
    s.rollCount = (s.rollCount || 0) + 1;
    writeState(s);

    rolling = true;
    refreshHud();
    readoutEl.className = 'cp-readout';
    readoutEl.textContent = 'Rolling…';
    spotEls.forEach((s) => s.classList.remove('cp-spot-hit', 'cp-spot-miss'));

    const final = [
      1 + Math.floor(Math.random() * 6),
      1 + Math.floor(Math.random() * 6),
      1 + Math.floor(Math.random() * 6),
    ];
    const settleTimes = [820, 980, 1140];
    dieEls.forEach((el) => el.classList.add('cp-rolling'));

    const tumble = setInterval(() => {
      for (let i = 0; i < 3; i++) {
        if (dieEls[i].classList.contains('cp-rolling')) {
          renderDie(i, 1 + Math.floor(Math.random() * 6));
        }
      }
    }, 70);

    settleTimes.forEach((t, i) => {
      setTimeout(() => {
        dieEls[i].classList.remove('cp-rolling');
        renderDie(i, final[i]);
        if (i === 2) {
          clearInterval(tumble);
          settleRoll(final, wager);
        }
      }, t);
    });
  }

  function settleRoll(dice, wager) {
    const sum = dice[0] + dice[1] + dice[2];

    const topDef    = picks.top    ? BETS[picks.top]    : null;
    const bottomDef = picks.bottom ? BETS[picks.bottom] : null;
    const thirdDef  = picks.third  ? BETS[picks.third]  : null;
    const topHit    = topDef    && topDef.check(dice, sum);
    const bottomHit = bottomDef && bottomDef.check(dice, sum);
    const thirdHit  = thirdDef  && thirdDef.check(dice, sum);

    const count      = topHit    ? topDef.count       : 0;
    const multiplier = bottomHit ? bottomDef.multiplier : 1;
    const big        = thirdHit  && !!thirdDef.big;

    // Highlight hits/misses on the tiles.
    if (topDef) {
      const spot = spotEls.find((s) => s.dataset.bet === picks.top);
      if (spot) spot.classList.add(topHit ? 'cp-spot-hit' : 'cp-spot-miss');
    }
    if (bottomDef) {
      const spot = spotEls.find((s) => s.dataset.bet === picks.bottom);
      if (spot) spot.classList.add(bottomHit ? 'cp-spot-hit' : 'cp-spot-miss');
    }
    if (thirdDef) {
      const spot = spotEls.find((s) => s.dataset.bet === picks.third);
      if (spot) spot.classList.add(thirdHit ? 'cp-spot-hit' : 'cp-spot-miss');
    }

    if (count > 0) {
      const drops = readDrops();
      drops.push({ count, multiplier, big });
      writeDrops(drops);
    }

    const colorLabel = describeColors(dice);
    const head = `${dice.join(' + ')} = ${sum} (${colorLabel}).`;
    if (count > 0) {
      const parts = [`${topDef.name} +${count}`];
      if (multiplier > 1) parts.push(`${bottomDef.name} ×${multiplier} value`);
      if (big)            parts.push(`${thirdDef.name} +33% size`);
      const tail = `${parts.join(' · ')} → ${count} token${count === 1 ? '' : 's'} into the tray.`;
      readoutEl.className = 'cp-readout cp-readout-win';
      readoutEl.textContent = `${head} ${tail}`;
    } else {
      readoutEl.className = 'cp-readout cp-readout-loss';
      readoutEl.textContent = `${head} ${topDef ? topDef.name : '—'} missed — no tokens.`;
    }

    if (window.Child && typeof window.Child.recordPlay === 'function') {
      window.Child.recordPlay();
    }

    rolling = false;
    refreshHud();
  }

  function describeColors(dice) {
    const reds = dice.reduce((n, v, i) => n + (isRedFace(i, v) ? 1 : 0), 0);
    if (reds === 0) return 'all black';
    if (reds === 3) return 'all red';
    return `${reds} red`;
  }
})();
