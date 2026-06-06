/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRAPS PAGE  —  3-die bet board that feeds the putt-putt overlay         │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ grabs dice/spot/wager/button/readout DOM     │
  │                          ├─ spot click/keydown ──► setPick(row,key)      │
  │                          ├─ #cp-wager input    ──► refreshHud            │
  │                          ├─ #cp-wager blur     ──► normalizeWager        │
  │                          ├─ #cp-wager-max      ──► sets max + refreshHud │
  │                          ├─ #cp-roll  click    ──► onRoll                │
  │                          ├─ #cp-clear click    ──► clearPicks            │
  │                          ├─ Wallet.onChange    ──► refreshHud            │
  │                          └─ renderDie(0,1)/(1,3)/(2,5); refreshHud()     │
  │                                                                          │
  │   Bet model: BETS{low,mid,high,black,run,red,nodoubles,doubles}          │
  │     top row     ──► ballCount on hit                                     │
  │     middle row  ──► perBall valueMult on hit                             │
  │     bottom row  ──► flat % bonus on hit                                  │
  │     isRedFace(dieIdx, value) ──► bool   (RED_FACES sets per die)         │
  │                                                                          │
  │   Helpers:                                                               │
  │     setPick(row,key)       ──► toggles picks[row], plays SFX.pickChip    │
  │     clearPicks()           ──► resets picks + readout                    │
  │     getWager()             ──► int >= 0                                  │
  │     normalizeWager()       ──► clamps input, refreshHud                  │
  │     picksComplete()        ──► bool                                      │
  │     getRollCost()          ──► wager                                     │
  │     refreshHud()           ──► spot.aria-pressed, pick labels, button   │
  │     renderDie(dieIdx,val)  ──► FACE_PIPS span grid + red/black class     │
  │                                                                          │
  │   onRoll() click pipeline:                                               │
  │     Wallet.spend(cost) ◄── aborts if false                               │
  │     Child.recordPlay()                                                   │
  │     SFX.startDiceRoll(); setInterval(tumble, 70ms)                       │
  │     settleTimes[820,980,1140] each ──► renderDie(final[i]) +             │
  │                                          SFX.diceLand()                  │
  │     on final die ──► SFX.stopDiceRoll(); settleRoll(final, wager)        │
  │                                                                          │
  │   settleRoll(dice, wager):                                               │
  │     ├─ jackpot trigger: [1,1,1]||[6,6,6] → CrapsJackpot.claim →          │
  │     │     Wallet.add(won); banner.is-won pulse; jackpotTail appended     │
  │     │     to every readout below                                         │
  │     ├─ check top/middle/bottom hits, mark .cp-spot-hit/-miss             │
  │     ├─ top miss ──► CrapsJackpot.add(ceil(bal·1%),min 1) feed;           │
  │     │     SFX.loss; readout; bail                                        │
  │     ├─ compute ballCount, valueMult, perBall, bonusPct, bonusCoins       │
  │     ├─ no CrapsPutt ──► Wallet.add fallback payout                       │
  │     └─ setTimeout 1500ms ──► CrapsPutt.show({...,                        │
  │                                onComplete(totalWon)})                    │
  │            └─► Wallet.add(totalWon); readout update; refreshHud          │
  │                                                                          │
  │     describeColors(dice) ──► 'all black'|'all red'|'N red'               │
  │                                                                          │
  │   Exports: none (IIFE, side-effect only)                                 │
  │   External deps: window.Wallet (spend/add/getBalance/onChange),          │
  │                  window.Child (recordPlay),                              │
  │                  window.SFX (pickChip/startDiceRoll/stopDiceRoll/        │
  │                              diceLand/loss),                             │
  │                  window.CrapsPutt (show),                                │
  │                  window.CrapsJackpot (add/claim/get; optional)           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  RED_FACES=[{1,2},{3,4},{5,6}] per die
  isRedFace(dieIdx,v)→bool: RED_FACES[dieIdx].has(v)
  BETS={low:top/count5/sum∈[3,7], mid:top/count3/sum∈[8,15], high:top/count11/sum∈[16,18], black:mid/×1.5/all !red, run:mid/×2/sorted seq, red:mid/×3/all red, nodoubles:bot/+22%/all distinct, doubles:bot/+28%/dup}
  FACE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}
  state: picks={top,middle,bottom:null}, rolling=F; DOM: dieEls[3], spotEls, wagerEl, wagerMaxBtn, rollBtn, clearBtn, readoutEl, pickTop/Middle/BottomEl
  init(): grab DOM; ∀spot bind click+keydown(space/enter)→setPick; wager input→refreshHud, blur→normalizeWager; wagerMax→set bal+refresh; roll→onRoll; clear→clearPicks; Wallet.onChange→refreshHud; renderDie(0,1)(1,3)(2,5); refreshHud
  setPick(row,key): guard rolling/!row/!key/!(row∈picks); toggle picks[row]; clear hit/miss classes; SFX.pickChip; refreshHud
  clearPicks(): guard rolling; reset picks; clear classes; readout='Pick one from each row…'; refreshHud
  getWager()→int: parseInt(wager.value); ret v≥1?v:0
  normalizeWager(): v=getWager; wager.value=v?str:''; refreshHud
  picksComplete()→bool: picks.top && picks.middle && picks.bottom
  getRollCost()→int: getWager
  refreshHud(): ∀spot toggle cp-picked + aria-pressed; pick*El.text=BETS[picks.row].name||—; canRoll=!rolling && wager>0 && cost≤bal && complete; roll.disabled+text by state
  renderDie(idx,v): el=dieEls[idx]; red=isRedFace; toggle cp-die-red/black; data.value=v; aria-label; build 9 pip spans by FACE_PIPS[v]
  onRoll(): guard rolling/wager/complete; Wallet.spend(cost)||ret; Child.recordPlay; rolling=T; refreshHud; readout='Rolling…'; clear classes; final=[3 rand 1..6]; settleTimes=[820,980,1140]; dieEls add cp-rolling; SFX.startDiceRoll; tumble=setInterval 70ms render rolling dice; ∀i in settleTimes setTimeout(t)→remove rolling+renderDie(final[i])+SFX.diceLand; on i=2→clearInterval+SFX.stopDiceRoll+settleRoll(final,wager)
  settleRoll(dice,wager): sum=Σdice; jackpotWon=0; triple=d0==d1==d2 && (d0==1||d0==6)→CrapsJackpot.claim()→Wallet.add+banner.is-won pulse; jackpotTail=' ★ JACKPOT +Nc ★' if won; topDef/middleDef/bottomDef=BETS[picks.*]; *Hit=def.check(dice,sum); ∀spot mark hit/miss class; head=`${dice}+= ${sum} (${describeColors})`; !topHit→CrapsJackpot.add(max(1,ceil(bal·1%)))+loss readout+jackpotTail+SFX.loss+rolling=F+refresh+ret; ballCount=topDef.count; valueMult=middleHit?def.mult:1; perBall=max(1,ceil(wager·mult)); bonusPct=bottomHit?def.bonusPct:0; bonusCoins=ceil(wager·pct/100); readout win text+jackpotTail; !CrapsPutt→Wallet.add(perBall·count+bonus)+rolling=F+refresh+ret; setTimeout 1500→openPutt
  openPutt(): CrapsPutt.show({ballCount,perBall,valueMult,bonusPct,bonusCoins, onComplete(totalWon): Wallet.add(totalWon); sunkCount=round((totalWon-bonus)/perBall); readout updated win/loss; rolling=F; refresh})
  describeColors(dice)→str: reds=Σ isRedFace; 0→'all black', 3→'all red', else `${n} red`
  exports: none (IIFE side-effect); on DOMContentLoaded→init
*/

(function () {
  // ====== DICE COLORING ======
  // Each die has two red faces; the rest are black.
  const RED_FACES = [
    new Set([1, 2]), // Die 1
    new Set([3, 4]), // Die 2
    new Set([5, 6]), // Die 3
  ];

  function isRedFace(dieIdx, value) {
    return RED_FACES[dieIdx].has(value);
  }

  // ====== BETS ======
  // Top row: BALL COUNT on a hit (mini-golf shots you get on the course).
  //   Top miss → no mini-golf, wager is lost.
  // Middle row: per-sunk-ball VALUE MULTIPLIER on a hit (1.5/2/3 by rarity).
  //   Middle miss → each sunk ball just pays wager × 1.
  // Bottom row: flat % BONUS of wager on a hit. Pct = (100 - hit%)/2 so the
  //   rarer pick pays more. Bonus is added to the round's total payout.
  const BETS = {
    low:       { name: 'Low',        row: 'top',    count: 5,             check: (d, sum) => sum >= 3  && sum <= 7  },
    mid:       { name: 'Mid',        row: 'top',    count: 3,             check: (d, sum) => sum >= 8  && sum <= 15 },
    high:      { name: 'High',       row: 'top',    count: 11,            check: (d, sum) => sum >= 16 && sum <= 18 },
    black:     { name: 'All Black',  row: 'middle', mult: 1.5,            check: (d) => d.every((v, i) => !isRedFace(i, v)) },
    run:       { name: 'Run',        row: 'middle', mult: 2,              check: (d) => {
      const s = [...d].sort((a, b) => a - b);
      return s[1] === s[0] + 1 && s[2] === s[1] + 1;
    } },
    red:       { name: 'All Red',    row: 'middle', mult: 3,              check: (d) => d.every((v, i) =>  isRedFace(i, v)) },
    nodoubles: { name: 'No Doubles', row: 'bottom', bonusPct: 22,         check: (d) => new Set(d).size === 3 },
    doubles:   { name: 'Doubles',    row: 'bottom', bonusPct: 28,         check: (d) => new Set(d).size < 3 },
  };

  // ====== STATE ======
  let picks = { top: null, middle: null, bottom: null };
  let rolling = false;

  let dieEls, spotEls, wagerEl, wagerMaxBtn, rollBtn, clearBtn,
      readoutEl, pickTopEl, pickMiddleEl, pickBottomEl;

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
    readoutEl    = document.getElementById('cp-readout');
    pickTopEl    = document.getElementById('cp-pick-top');
    pickMiddleEl = document.getElementById('cp-pick-middle');
    pickBottomEl = document.getElementById('cp-pick-bottom');

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
    picks[row] = picks[row] === key ? null : key;
    spotEls.forEach((s) => s.classList.remove('cp-spot-hit', 'cp-spot-miss'));
    if (window.SFX) window.SFX.pickChip();
    refreshHud();
  }

  function clearPicks() {
    if (rolling) return;
    picks.top = null;
    picks.middle = null;
    picks.bottom = null;
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

  function picksComplete() {
    return !!(picks.top && picks.middle && picks.bottom);
  }

  // Cost of a roll is just the wager. Middle row only affects payout on hit.
  function getRollCost() {
    return getWager();
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
    if (pickMiddleEl) pickMiddleEl.textContent = picks.middle ? BETS[picks.middle].name : '—';
    if (pickBottomEl) pickBottomEl.textContent = picks.bottom ? BETS[picks.bottom].name : '—';

    const wager = getWager();
    const cost  = getRollCost();
    const bal = window.Wallet ? window.Wallet.getBalance() : 0;
    const canRoll = !rolling && wager > 0 && cost <= bal && picksComplete();
    rollBtn.disabled = !canRoll;
    if (rolling)                rollBtn.textContent = '…';
    else if (wager <= 0)        rollBtn.textContent = 'SET WAGER';
    else if (!picksComplete())  rollBtn.textContent = 'PICK 3';
    else if (cost > bal)        rollBtn.textContent = 'NOT ENOUGH';
    else                        rollBtn.textContent = `ROLL · ${cost}c`;
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
    const cost = getRollCost();
    if (!window.Wallet || !window.Wallet.spend(cost)) return;
    if (window.Child && typeof window.Child.recordPlay === 'function') {
      window.Child.recordPlay();
    }

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
    if (window.SFX) window.SFX.startDiceRoll();

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
        if (window.SFX) window.SFX.diceLand();
        if (i === 2) {
          clearInterval(tumble);
          if (window.SFX) window.SFX.stopDiceRoll();
          settleRoll(final, wager);
        }
      }, t);
    });
  }

  function settleRoll(dice, wager) {
    const sum = dice[0] + dice[1] + dice[2];

    // Jackpot trigger fires first. Triple 1s or triple 6s drain the pot to
    // the wallet on top of (or in spite of) whatever the wager resolves to.
    // jackpotTail gets appended to whichever readout the round ends with.
    let jackpotWon = 0;
    if (window.CrapsJackpot) {
      const triple = dice[0] === dice[1] && dice[1] === dice[2];
      if (triple && (dice[0] === 1 || dice[0] === 6)) {
        jackpotWon = window.CrapsJackpot.claim();
        if (jackpotWon > 0 && window.Wallet) window.Wallet.add(jackpotWon);
        const banner = document.getElementById('cp-jackpot-banner');
        if (banner) {
          banner.classList.remove('is-won');
          void banner.offsetWidth;
          banner.classList.add('is-won');
        }
      }
    }
    const jackpotTail = jackpotWon > 0 ? ` ★ JACKPOT +${jackpotWon}c ★` : '';

    const topDef    = picks.top    ? BETS[picks.top]    : null;
    const middleDef = picks.middle ? BETS[picks.middle] : null;
    const bottomDef = picks.bottom ? BETS[picks.bottom] : null;
    const topHit    = topDef    && topDef.check(dice, sum);
    const middleHit = middleDef && middleDef.check(dice, sum);
    const bottomHit = bottomDef && bottomDef.check(dice, sum);

    // Mark every spot whose bet condition matched the dice — even ones the
    // player didn't pick — so the board shows which bets paid out. Picked
    // spots additionally get a ✓ (hit) or ✗ (miss) overlay via CSS.
    spotEls.forEach((spot) => {
      spot.classList.remove('cp-spot-hit', 'cp-spot-miss');
      const key = spot.dataset.bet;
      const def = BETS[key];
      if (!def) return;
      const hit = def.check(dice, sum);
      const picked = picks[def.row] === key;
      if (hit) spot.classList.add('cp-spot-hit');
      else if (picked) spot.classList.add('cp-spot-miss');
    });

    const colorLabel = describeColors(dice);
    const head = `${dice.join(' + ')} = ${sum} (${colorLabel}).`;

    if (!topHit) {
      // Forfeit feeds the jackpot: 1% of current Tribute, min 1 coin.
      if (window.CrapsJackpot && window.Wallet) {
        const bal = window.Wallet.getBalance();
        window.CrapsJackpot.add(Math.max(1, Math.ceil(bal * 0.01)));
      }
      readoutEl.className = 'cp-readout cp-readout-loss';
      readoutEl.textContent = `${head} ${topDef ? topDef.name : '—'} missed — no game, wager lost.${jackpotTail}`;
      if (window.SFX) window.SFX.loss();
      rolling = false;
      refreshHud();
      return;
    }

    const ballCount   = topDef.count;
    const valueMult   = middleHit ? middleDef.mult : 1;
    const perBall     = Math.max(1, Math.ceil(wager * valueMult));
    const bonusPct    = bottomHit ? bottomDef.bonusPct : 0;
    const bonusCoins  = bonusPct > 0 ? Math.ceil(wager * bonusPct / 100) : 0;

    const summary = [`${topDef.name} hit · ${ballCount} ball${ballCount === 1 ? '' : 's'}`];
    if (middleHit) summary.push(`${middleDef.name} ×${valueMult}`);
    if (bottomHit) summary.push(`${bottomDef.name} +${bonusPct}% (${bonusCoins}c)`);
    readoutEl.className = 'cp-readout cp-readout-win';
    readoutEl.textContent = `${head} ${summary.join(' · ')} → ${ballCount} putt${ballCount === 1 ? '' : 's'}.${jackpotTail}`;

    if (!window.CrapsPutt) {
      // Fallback if the overlay script failed to load: pay as if every ball sunk.
      const fallback = perBall * ballCount + bonusCoins;
      if (window.Wallet) window.Wallet.add(fallback);
      readoutEl.textContent += ` (overlay missing — auto-paid ${fallback}c.)${jackpotTail}`;
      rolling = false;
      refreshHud();
      return;
    }

    // Hold on the result for a beat so the player sees the ✓/✗ marks and
    // readout before the putt-putt overlay covers the board.
    setTimeout(() => openPutt(), 1500);

    function openPutt() {
    window.CrapsPutt.show({
      ballCount,
      perBall,
      valueMult,
      bonusPct,
      bonusCoins,
      onComplete(totalWon) {
        // totalWon from the overlay already includes the bonus, since putt.js
        // folds bonusCoins in at finish().
        if (totalWon > 0 && window.Wallet) window.Wallet.add(totalWon);
        const sinks = Math.max(0, totalWon - bonusCoins);
        const sunkCount = perBall > 0 ? Math.round(sinks / perBall) : 0;
        const tail = totalWon > 0
          ? `Sank ${sunkCount}/${ballCount} (${sinks}c)${bonusCoins ? ` + ${bonusCoins}c bonus` : ''} = ${totalWon} coin${totalWon === 1 ? '' : 's'}.`
          : `Sank 0/${ballCount} — no coin won.`;
        readoutEl.className = totalWon > 0 ? 'cp-readout cp-readout-win' : 'cp-readout cp-readout-loss';
        readoutEl.textContent = `${head} ${summary.join(' · ')} · ${tail}${jackpotTail}`;
        rolling = false;
        refreshHud();
      },
    });
    } // end openPutt
  }

  function describeColors(dice) {
    const reds = dice.reduce((n, v, i) => n + (isRedFace(i, v) ? 1 : 0), 0);
    if (reds === 0) return 'all black';
    if (reds === 3) return 'all red';
    return `${reds} red`;
  }
})();
