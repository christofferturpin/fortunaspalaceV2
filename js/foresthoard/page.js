/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAREWARE POKER — 10 dealt, split into LEFT 5 + RIGHT 5, each scored as │
  │  a standard 5-card poker hand. One draw + 1 cross-side swap + Suggest.   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   deck (38): ranks 1..6 × suits {fish, fox, owl} × 2 copies + bee +      │
  │     child wilds. Wilds substitute for any (r, s).                        │
  │                                                                          │
  │   flow:                                                                  │
  │     DOMContentLoaded ──► init() ──► render IDLE                          │
  │     onDeal ──► spend bet, deal 10 (0..4=LEFT, 5..9=RIGHT) ──► phase=HOLD │
  │       (all 10 default to DISCARD; click toggles a card to HOLD; the      │
  │        holds[] array tracks "kept" — UI matches directly)                │
  │     onDraw ──► replace discarded (!holds) from deck ──► phase=SWAP, sR=1 │
  │     swap drag in SWAP ──► cross-side decrements swapsRem; same-side free │
  │     onScore (btn-draw label = Score) ──► phase=DONE ──► scoreAndPay      │
  │                                                                          │
  │   scoring (per side, both-must-pay) with HOUSE_TAX=2 on the sum:         │
  │     royal_flush  (2-6 same suit)                                 10×     │
  │     five_kind    (5 same rank, only via wild)                     5×     │
  │     straight_flush                                                4×     │
  │     four_kind                                                     3×     │
  │     full_house                                                    2×     │
  │     flush                                                         2×     │
  │     straight                                                      1×     │
  │     three_kind                                                    1×     │
  │     two_pair                                                      1×     │
  │     pair / nothing                                                0×     │
  │     payout = bothPay ? max(0, (L+R) − HOUSE_TAX) × bet : 0               │
  │     ⇒ floor combos (2P/Straight/3K on both sides) BUST;                  │
  │       one side at Flush/FH needed to scrape breakeven.                   │
  │                                                                          │
  │   evaluation:                                                            │
  │     profile(cards) ──► counts + per-rank/per-suit card indices           │
  │     evalConcrete(cards) ──► first PAYTABLE row whose test() passes;      │
  │       pick() returns indices into `cards` of winning cards               │
  │     bestEval(cards) ──► no wilds: direct; else brute-force every (r,s)   │
  │       substitution over wild positions, keep best by tier idx, then      │
  │       map winning indices back to original hand positions.               │
  │                                                                          │
  │   swap: two modes in SWAP phase: (1) click-to-pair — click one card to   │
  │     arm, click another to swap; clicking the armed card cancels.         │
  │     (2) HTML5 drag-and-drop. Cross-side swaps decrement                  │
  │     S.swapsRemaining (start = SWAPS_MAX = 1); same-side reorders are     │
  │     free. Click toggles HOLD in HOLD phase only.                         │
  │                                                                          │
  │   suggest: onSuggest charges 50% of potential winnings (rounded up,      │
  │     min 1 coin) from Wallet, then applies the best play:                 │
  │     HOLD ──► holds = union of bestEval(left).indices, bestEval(right).…  │
  │     SWAP ──► brute-force ≤1 cross-side swap (25 candidates + nop), pick  │
  │       partition maximizing (L.pays+R.pays) when both pay.                │
  │     Refuses (no charge) if already optimal or no improving swap exists.  │
  │                                                                          │
  │   sort: per-side, sticky. cmpByRank / cmpBySuit. Reapplied after deal    │
  │     and draw (left + right sorted separately).                           │
  │                                                                          │
  │   Exports: none (self-contained IIFE)                                    │
  │   External deps: Wallet (window.Wallet) for bet/payout                   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONSTS: HAND_SIZE=10, SIDE=5, NUM_RANKS=6, NUM_SUITS=3, COPIES=2, NUM_WILDS=2,
    DECK_SIZE=38, DEFAULT_BET=10
  SUITS=['🐟','🦊','🦉']; SUIT_NAMES=['fish','fox','owl']
  PAYTABLE: 10 rows (royal_flush..pair); each {id,name,pays,desc,test,pick}
  profile(cards)→{rankCount,suitCount,rankIdx,suitIdx,perSuitRank,perSuitRankIdx,
    pairs,trips,quads,maxRank,maxSuit,straight,straightFlush,royalSF}
  isRoyalSF: straightFlush starting at rank 1 (i.e. 2-6 in 1-6 deck)
  evalConcrete(cards5)→{idx,id,name,pays,desc,indices}
  bestEval(cards5)→…+sub: brute-force (r,s)^|wilds|, indices mapped to orig
  state S: phase∈{IDLE,HOLD,SWAP,DONE}, deck, hand[10], holds[10], bet,
    lastResult:{left,right}|null, previewEval:{left,right}|null, msg,
    newCardSet:Set<id>, sortMode∈{rank,suit}, dragSrc:int|null,
    swapPick:int|null (click-pair first index in SWAP),
    swapsRemaining:int (0 except in SWAP, set to SWAPS_MAX=1 on draw)
  leftSlice()→hand[0..4], rightSlice()→hand[5..9]
  applySort(): sort left 5 + right 5 independently by sortMode (holds follow)
  onDeal: spend; deal 10; holds=[F]×10 (all discard by default; click to hold);
    applySort; sfx.deal; render
  onDraw: ∀i:!holds[i]→hand[i]=deck.pop (discarded slots refilled);
    HOLD→SWAP+swapsRem=1; render
  onScore: SWAP→DONE; swapPick=null; scoreAndPay
  scoreAndPay: r={left:bestEval(L),right:bestEval(R)};
    bothPay=L.pays>0 && R.pays>0; payout=bothPay?(L+R)*bet:0;
    Wallet.add(payout); win/bigwin/lose status; bumpWallet
  onCardClick(i): toggle holds[i] (HOLD only; F→T flips to HOLD)
  swapPositions(i,j): SWAP-only; cross-side costs 1 of swapsRem; clears swapPick
  onSwapPick(i): SWAP-only; first call arms i, second call swaps or cancels
  onSuggest: computeSuggestion→cost=ceil(potential*0.50)|min1;
    Wallet.spend(cost); applySuggestion (mutates holds OR applies swaps)
  computeSuggestion: HOLD→union of L+R winner indices; SWAP→best ≤k swaps
  combos(arr,k)→C(n,k) subsets
  render: paytable (preview vs matched), preview cells + total, hands, controls
  events: HOLD card click=hold; SWAP card click=pick/swap or drag=swap;
    btn-deal/draw(or score)/suggest/new/sort-rank/sort-suit/mute
  on DOMContentLoaded→init
*/
(function () {
  'use strict';

  // ---- constants ----
  const HAND_SIZE = 10;
  const SIDE = 5;
  const NUM_RANKS = 6;
  const NUM_SUITS = 3;
  const COPIES = 2;
  const NUM_WILDS = 2;
  const DECK_SIZE = NUM_RANKS * NUM_SUITS * COPIES + NUM_WILDS; // 38
  const DEFAULT_BET = 10;
  const MIN_BET = 1;

  const SUITS = ['🐟', '🦊', '🦉'];
  const SUIT_NAMES = ['fish', 'fox', 'owl'];

  // ---- card primitives ----
  let _cardIdCounter = 0;
  const isWild = (c) => !!c.wild;
  const cardLabel = (c) => isWild(c)
    ? (c.wild === 'bee' ? '🐝' : '🧒')
    : ((c.r + 1) + SUITS[c.s]);

  function cmpByRank(a, b) {
    const aw = isWild(a), bw = isWild(b);
    if (aw && bw) return (a.wild === 'bee' ? 0 : 1) - (b.wild === 'bee' ? 0 : 1);
    if (aw) return 1;
    if (bw) return -1;
    return (a.r - b.r) || (a.s - b.s);
  }
  function cmpBySuit(a, b) {
    const aw = isWild(a), bw = isWild(b);
    if (aw && bw) return (a.wild === 'bee' ? 0 : 1) - (b.wild === 'bee' ? 0 : 1);
    if (aw) return 1;
    if (bw) return -1;
    return (a.s - b.s) || (a.r - b.r);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function newDeck() {
    const d = [];
    for (let r = 0; r < NUM_RANKS; r++)
      for (let s = 0; s < NUM_SUITS; s++)
        for (let copy = 0; copy < COPIES; copy++)
          d.push({ r, s, id: ++_cardIdCounter });
    d.push({ wild: 'bee',   id: ++_cardIdCounter });
    d.push({ wild: 'child', id: ++_cardIdCounter });
    return shuffle(d);
  }

  // ---- paytable (5-card standard) ----
  // royal_flush = max straight flush (in 1-6 deck, that's ranks 2-6 of one suit)
  // five_kind requires a wild (deck has only 2 copies per (r,s), max 6 of a rank natively)
  function topRanks(p, minCount, n) {
    const items = [];
    for (let r = 0; r < NUM_RANKS; r++) if (p.rankCount[r] >= minCount) items.push(r);
    items.sort((a, b) => (p.rankCount[b] - p.rankCount[a]) || (b - a));
    return items.slice(0, n);
  }
  function maxSuitIdx(p) {
    let s = 0;
    for (let i = 1; i < NUM_SUITS; i++) if (p.suitCount[i] > p.suitCount[s]) s = i;
    return s;
  }
  function pickFlush(p, n) { return p.suitIdx[maxSuitIdx(p)].slice(0, n); }
  function pickRank(p, rank, n) { return p.rankIdx[rank].slice(0, n); }
  function pickStraight(rankCount, rankIdx) {
    for (let lo = 0; lo <= NUM_RANKS - 5; lo++) {
      let ok = true;
      for (let i = 0; i < 5; i++) if (rankCount[lo + i] === 0) { ok = false; break; }
      if (ok) { const out = []; for (let i = 0; i < 5; i++) out.push(rankIdx[lo + i][0]); return out; }
    }
    return [];
  }
  function pickStraightFlush(p, requireLo) {
    for (let s = 0; s < NUM_SUITS; s++) {
      for (let lo = 0; lo <= NUM_RANKS - 5; lo++) {
        if (requireLo !== undefined && lo !== requireLo) continue;
        let ok = true;
        for (let i = 0; i < 5; i++) if (p.perSuitRank[s][lo + i] === 0) { ok = false; break; }
        if (ok) {
          const out = [];
          for (let i = 0; i < 5; i++) out.push(p.perSuitRankIdx[s][lo + i][0]);
          return out;
        }
      }
    }
    return [];
  }

  // Payouts kept tight + HOUSE_TAX of 2 applied to the sum. Floor combos
  // (Two Pair / Straight / Three of a Kind paired on both sides) BUST; one
  // side needs Flush or better to scrape breakeven. Royal+Royal pays 18× bet.
  const PAYTABLE = [
    { id: 'royal_flush',    name: 'Royal Flush',    pays: 10, desc: '2-3-4-5-6 of one suit',         test: (p) => p.royalSF,            pick: (p) => pickStraightFlush(p, 1) },
    { id: 'five_kind',      name: 'Five of a Kind', pays: 5,  desc: '5 of one rank (needs a wild)',  test: (p) => p.maxRank >= 5,       pick: (p) => pickRank(p, topRanks(p, 5, 1)[0], 5) },
    { id: 'straight_flush', name: 'Straight Flush', pays: 4,  desc: '5 consecutive of one suit',     test: (p) => p.straightFlush,      pick: (p) => pickStraightFlush(p) },
    { id: 'four_kind',      name: 'Four of a Kind', pays: 3,  desc: '4 of one rank',                 test: (p) => p.maxRank >= 4,       pick: (p) => pickRank(p, topRanks(p, 4, 1)[0], 4) },
    { id: 'full_house',     name: 'Full House',     pays: 2,  desc: 'Three + pair, different ranks', test: (p) => isFullHouse(p),
      pick: (p) => {
        const tr = topRanks(p, 3, 1)[0];
        const pr = topRanks(p, 2, NUM_RANKS).find(r => r !== tr);
        return [...pickRank(p, tr, 3), ...pickRank(p, pr, 2)];
      } },
    { id: 'flush',          name: 'Flush',          pays: 2,  desc: '5 of one suit',                 test: (p) => p.maxSuit >= 5,       pick: (p) => pickFlush(p, 5) },
    { id: 'straight',       name: 'Straight',       pays: 1,  desc: '5 consecutive ranks',           test: (p) => p.straight,           pick: (p) => pickStraight(p.rankCount, p.rankIdx) },
    { id: 'three_kind',     name: 'Three of a Kind',pays: 1,  desc: '3 of one rank',                 test: (p) => p.maxRank >= 3,       pick: (p) => pickRank(p, topRanks(p, 3, 1)[0], 3) },
    { id: 'two_pair',       name: 'Two Pair',       pays: 1,  desc: 'Two distinct pairs',            test: (p) => p.pairs >= 2,         pick: (p) => topRanks(p, 2, 2).flatMap(r => pickRank(p, r, 2)) }
  ];
  const NOTHING = { idx: PAYTABLE.length, name: 'Nothing', pays: 0, desc: '—', indices: [] };

  function isFullHouse(p) {
    // 3+2 structurally requires one rank with count≥3 AND another DIFFERENT rank with count≥2.
    if (p.trips < 1) return false;
    // pairs counts distinct ranks with ≥2 — must be ≥2 since trips counts as ≥2 too.
    return p.pairs >= 2;
  }

  // ---- evaluation ----
  function profile(cards) {
    const rankCount = new Array(NUM_RANKS).fill(0);
    const suitCount = new Array(NUM_SUITS).fill(0);
    const rankIdx = Array.from({ length: NUM_RANKS }, () => []);
    const suitIdx = Array.from({ length: NUM_SUITS }, () => []);
    const perSuitRank = [
      new Array(NUM_RANKS).fill(0),
      new Array(NUM_RANKS).fill(0),
      new Array(NUM_RANKS).fill(0)
    ];
    const perSuitRankIdx = [
      Array.from({ length: NUM_RANKS }, () => []),
      Array.from({ length: NUM_RANKS }, () => []),
      Array.from({ length: NUM_RANKS }, () => [])
    ];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      rankCount[c.r]++;
      suitCount[c.s]++;
      perSuitRank[c.s][c.r]++;
      rankIdx[c.r].push(i);
      suitIdx[c.s].push(i);
      perSuitRankIdx[c.s][c.r].push(i);
    }
    let pairs = 0, trips = 0, quads = 0, maxRank = 0;
    for (let r = 0; r < NUM_RANKS; r++) {
      const k = rankCount[r];
      if (k > maxRank) maxRank = k;
      if (k >= 2) pairs++;
      if (k >= 3) trips++;
      if (k >= 4) quads++;
    }
    const maxSuit = Math.max(suitCount[0], suitCount[1], suitCount[2]);
    const straight = hasStraight(rankCount);
    const straightFlush = perSuitRank.some(hasStraight);
    // Royal = max straight flush = ranks 2-6 (indices 1..5)
    const royalSF = perSuitRank.some(sr => {
      for (let i = 1; i <= 5; i++) if (sr[i] === 0) return false;
      return true;
    });
    return { rankCount, suitCount, rankIdx, suitIdx, perSuitRank, perSuitRankIdx,
             pairs, trips, quads, maxRank, maxSuit, straight, straightFlush, royalSF };
  }
  function hasStraight(arr) {
    for (let lo = 0; lo <= NUM_RANKS - 5; lo++) {
      let ok = true;
      for (let i = 0; i < 5; i++) { if (arr[lo + i] === 0) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }

  function evalConcrete(cards) {
    const p = profile(cards);
    for (let i = 0; i < PAYTABLE.length; i++) {
      const e = PAYTABLE[i];
      if (e.test(p)) {
        return { idx: i, id: e.id, name: e.name, pays: e.pays, desc: e.desc, indices: e.pick(p) };
      }
    }
    return { idx: NOTHING.idx, id: 'nothing', name: 'Nothing', pays: 0, desc: '—', indices: [] };
  }

  // Brute-force wild substitution over a 5-card hand. Returns indices mapped
  // back to positions in the *original* cards array so wilds highlight properly.
  function bestEval(cards) {
    const nats = [], wilds = [];
    const natOrigIdx = [], wildOrigIdx = [];
    for (let i = 0; i < cards.length; i++) {
      if (isWild(cards[i])) { wilds.push(cards[i]); wildOrigIdx.push(i); }
      else { nats.push(cards[i]); natOrigIdx.push(i); }
    }
    const subToOrig = (k) => k < nats.length ? natOrigIdx[k] : wildOrigIdx[k - nats.length];

    if (wilds.length === 0) {
      const e = evalConcrete(cards);
      return { ...e, sub: null };
    }

    const subs = [];
    for (let r = 0; r < NUM_RANKS; r++)
      for (let s = 0; s < NUM_SUITS; s++) subs.push({ r, s });

    let best = null;
    let bestSub = null;
    if (wilds.length === 1) {
      for (const a of subs) {
        const e = evalConcrete([...nats, a]);
        if (!best || e.idx < best.idx) { best = e; bestSub = [a]; }
      }
    } else {
      for (let i = 0; i < subs.length; i++) {
        for (let j = i; j < subs.length; j++) {
          const e = evalConcrete([...nats, subs[i], subs[j]]);
          if (!best || e.idx < best.idx) { best = e; bestSub = [subs[i], subs[j]]; }
        }
      }
    }
    const mappedIndices = (best.indices || []).map(subToOrig);
    return { ...best, indices: mappedIndices, sub: { wilds, subs: bestSub } };
  }

  function subLabel(e) {
    if (!e.sub) return '';
    const { wilds, subs } = e.sub;
    return wilds.map((w, i) => {
      const wn = w.wild === 'bee' ? '🐝' : '🧒';
      const s = subs[i];
      return `${wn}→${(s.r + 1) + SUITS[s.s]}`;
    }).join(', ');
  }

  // ---- state ----
  // Phase flow: IDLE → HOLD (set holds, one draw) → SWAP (≤2 cross-side
  // swaps, then score) → DONE.
  const PHASE = { IDLE: 0, HOLD: 1, SWAP: 2, DONE: 3 };
  const SWAPS_MAX = 1;
  const SUGGEST_PCT = 0.50;   // 50% of potential winnings
  // House tax: payout = max(0, (L.pays + R.pays) - HOUSE_TAX) × bet. With
  // HOUSE_TAX = 2, any pair of floor hands (Two Pair / Straight / Three of a
  // Kind on both sides) BUSTS — you need one side at Flush or better to even
  // scrape breakeven.
  const HOUSE_TAX = 2;
  const S = {
    phase: PHASE.IDLE,
    deck: [],
    hand: [],        // 10 cards: [0..4] LEFT, [5..9] RIGHT
    holds: [],       // 10 booleans, parallel to hand
    bet: DEFAULT_BET,
    lastResult: null,  // { left: eval, right: eval } | null
    previewEval: null, // { left: eval, right: eval } | null
    msg: '',
    newCardSet: new Set(),
    dealAnim: false,
    swapPopIds: new Set(),
    statusClass: '',
    sortMode: 'rank',
    dragSrc: null,
    swapPick: null,    // click-to-pair swap: index of first-picked card, or null
    swapsRemaining: 0  // cross-side swaps left in SWAP phase
  };

  const leftSlice  = () => S.hand.slice(0, SIDE);
  const rightSlice = () => S.hand.slice(SIDE, HAND_SIZE);

  // Sort each side independently (left 5, right 5). Holds follow the cards.
  function applySort() {
    if (S.hand.length === 0) return;
    const cmp = S.sortMode === 'suit' ? cmpBySuit : cmpByRank;
    for (const base of [0, SIDE]) {
      const slots = [base, base+1, base+2, base+3, base+4];
      const idx = slots.slice().sort((a, b) => cmp(S.hand[a], S.hand[b]));
      const newHand = idx.map(i => S.hand[i]);
      const newHolds = idx.map(i => S.holds[i]);
      for (let k = 0; k < SIDE; k++) {
        S.hand[base + k]  = newHand[k];
        S.holds[base + k] = newHolds[k];
      }
    }
  }

  // ---- DOM refs ----
  let dom = {};

  // ---- audio ----
  const sfx = (function () {
    let ctx = null, muted = false;
    function ensure() {
      if (muted) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function tone(freq, dur, gain, type, delay) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(c.destination);
      osc.start(now); osc.stop(now + dur + 0.05);
    }
    function chord(freqs, dur, gain) { freqs.forEach((f, i) => tone(f, dur, gain, 'sine', i * 0.04)); }
    return {
      select() { tone(660, 0.07, 0.12, 'triangle'); },
      deal()   { for (let i = 0; i < 4; i++) tone(540 + i * 30, 0.06, 0.09, 'square', i * 0.05); },
      draw()   { for (let i = 0; i < 3; i++) tone(420 + i * 40, 0.07, 0.09, 'triangle', i * 0.06); },
      swap()   { tone(700, 0.05, 0.08, 'triangle'); tone(560, 0.06, 0.08, 'triangle', 0.04); },
      win()    { chord([523, 659, 784, 1047], 0.6, 0.13); },
      bigwin() { chord([523, 659, 784, 1047, 1319], 1.1, 0.14); chord([261, 392, 523], 1.2, 0.10); },
      lose()   { tone(220, 0.25, 0.10, 'sawtooth'); tone(180, 0.35, 0.10, 'sawtooth', 0.05); },
      deny()   { tone(180, 0.15, 0.10, 'square'); },
      button() { tone(900, 0.05, 0.07, 'sine'); },
      setMuted(m) { muted = !!m; },
      isMuted() { return muted; }
    };
  })();

  // ---- actions ----
  function readBet() {
    const v = parseInt(dom.betAmount.value, 10);
    if (!Number.isFinite(v) || v < MIN_BET) return MIN_BET;
    const max = (window.Wallet && window.Wallet.getBalance) ? window.Wallet.getBalance() : v;
    return Math.min(v, Math.max(MIN_BET, max));
  }

  function onDeal() {
    if (S.phase !== PHASE.IDLE && S.phase !== PHASE.DONE) return;
    const bet = readBet();
    if (!window.Wallet || !window.Wallet.spend(bet)) {
      flash("Not enough coins.");
      sfx.deny();
      return;
    }
    S.bet = bet;
    S.deck = newDeck();
    S.hand = S.deck.splice(0, HAND_SIZE);
    // Default = all cards discarded. The player CLICKS to HOLD.
    // S.holds[i] === true means "stays through the draw".
    S.holds = new Array(HAND_SIZE).fill(false);
    S.lastResult = null;
    S.previewEval = null;
    S.msg = 'Click cards to HOLD, then click DRAW.';
    S.phase = PHASE.HOLD;
    S.swapsRemaining = 0;
    S.swapPick = null;
    S.newCardSet = new Set(S.hand.map(c => c.id));
    S.dealAnim = true;
    S.statusClass = '';
    if (window.Child && typeof window.Child.recordPlay === 'function') {
      window.Child.recordPlay();
    }
    applySort();
    sfx.deal();
    render();
  }

  function onDraw() {
    if (S.phase !== PHASE.HOLD) return;
    const drawn = new Set();
    for (let i = 0; i < HAND_SIZE; i++) {
      if (!S.holds[i]) {
        const c = S.deck.pop();
        if (c) {
          S.hand[i] = c;
          drawn.add(c.id);
        }
      }
    }
    S.newCardSet = drawn;
    applySort();
    sfx.draw();
    // Cards are now final. Player gets up to SWAPS_MAX cross-side swaps,
    // then SCORE.
    S.phase = PHASE.SWAP;
    S.swapsRemaining = SWAPS_MAX;
    S.msg = `You have ${SWAPS_MAX} swap between LEFT and RIGHT, then click SCORE.`;
    render();
  }

  function onScore() {
    if (S.phase !== PHASE.SWAP) return;
    S.phase = PHASE.DONE;
    S.swapPick = null;
    scoreAndPay();
    render();
  }

  // ---- suggest ----
  // Computes the best play available NOW and returns it without applying.
  // In HOLD: which cards to hold for the draw (heuristic — keep cards in the
  //   current best per-side hand; the draw replaces everything else).
  // In SWAP: the ≤2 cross-side swaps that maximize total pays. Brute-force
  //   over 1 + 25 + 100 = 126 reachable partitions.
  function computeSuggestion() {
    if (S.phase === PHASE.HOLD) {
      const L = bestEval(leftSlice());
      const R = bestEval(rightSlice());
      const holds = new Set();
      (L.indices || []).forEach(i => holds.add(i));
      (R.indices || []).forEach(i => holds.add(i));
      const { payout } = payoutFor(L, R, S.bet);
      return { kind: 'hold', holds, total: payout, left: L, right: R };
    }
    if (S.phase === PHASE.SWAP) {
      // start with current
      const cur = S.hand.slice();
      const curL = bestEval(cur.slice(0, SIDE));
      const curR = bestEval(cur.slice(SIDE, HAND_SIZE));
      const curScore = payoutFor(curL, curR, S.bet).payout;
      let best = { swaps: [], left: curL, right: curR, score: curScore };
      const lIdx = [0, 1, 2, 3, 4];
      const rIdx = [5, 6, 7, 8, 9];
      const maxK = Math.min(SWAPS_MAX, S.swapsRemaining);
      for (let k = 1; k <= maxK; k++) {
        const ls = combos(lIdx, k);
        const rs = combos(rIdx, k);
        for (const lc of ls) for (const rc of rs) {
          const tmp = cur.slice();
          for (let m = 0; m < k; m++) {
            [tmp[lc[m]], tmp[rc[m]]] = [tmp[rc[m]], tmp[lc[m]]];
          }
          const L = bestEval(tmp.slice(0, SIDE));
          const R = bestEval(tmp.slice(SIDE, HAND_SIZE));
          const score = payoutFor(L, R, S.bet).payout;
          if (score > best.score) {
            const pairs = [];
            for (let m = 0; m < k; m++) pairs.push([lc[m], rc[m]]);
            best = { swaps: pairs, left: L, right: R, score };
          }
        }
      }
      return { kind: 'swap', swaps: best.swaps, total: best.score, left: best.left, right: best.right };
    }
    return null;
  }

  // Generate all k-subsets of arr.
  function combos(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    if (arr.length === k) return [arr.slice()];
    const out = [];
    const first = arr[0];
    const rest = arr.slice(1);
    for (const c of combos(rest, k - 1)) out.push([first, ...c]);
    for (const c of combos(rest, k))      out.push(c);
    return out;
  }

  // Cost = 5% of the BETTER OF current preview or suggested potential, min 1
  // coin if there's any potential at all. Returns 0 when no suggestion is
  // available (idle / done / nothing useful to suggest).
  function computeSuggestCost() {
    if (S.phase !== PHASE.HOLD && S.phase !== PHASE.SWAP) return 0;
    const sug = computeSuggestion();
    if (!sug) return 0;
    if (sug.kind === 'swap' && sug.swaps.length === 0) return 0; // no useful swap
    // Cost is based on potential the suggestion unlocks.
    const potential = sug.total;
    if (potential <= 0) return 1; // tiny fee if no payout is available
    return Math.max(1, Math.ceil(potential * SUGGEST_PCT));
  }

  function applySuggestion(sug) {
    if (sug.kind === 'hold') {
      for (let i = 0; i < HAND_SIZE; i++) S.holds[i] = sug.holds.has(i);
      // mark all targeted cards for a swap-pop visual (re-using the same
      // animation as feedback that the suggestion did something)
      S.swapPopIds = new Set();
      for (let i = 0; i < HAND_SIZE; i++) if (S.holds[i]) S.swapPopIds.add(S.hand[i].id);
      setTimeout(() => { S.swapPopIds = new Set(); render(); }, 380);
    } else if (sug.kind === 'swap') {
      for (const [l, r] of sug.swaps) {
        [S.hand[l], S.hand[r]] = [S.hand[r], S.hand[l]];
        [S.holds[l], S.holds[r]] = [S.holds[r], S.holds[l]];
        S.swapsRemaining--;
      }
      const popIds = new Set();
      sug.swaps.forEach(([l, r]) => {
        popIds.add(S.hand[l].id);
        popIds.add(S.hand[r].id);
      });
      S.swapPopIds = popIds;
      setTimeout(() => { S.swapPopIds = new Set(); render(); }, 380);
    }
  }

  function onSuggest() {
    if (S.phase !== PHASE.HOLD && S.phase !== PHASE.SWAP) return;
    const sug = computeSuggestion();
    if (!sug) return;
    if (sug.kind === 'swap' && sug.swaps.length === 0) {
      flash('No improving swap available.');
      sfx.deny();
      return;
    }
    if (sug.kind === 'hold') {
      // No-op detection: if all suggested holds already match current state.
      let same = true;
      for (let i = 0; i < HAND_SIZE; i++) {
        if (S.holds[i] !== sug.holds.has(i)) { same = false; break; }
      }
      if (same) {
        flash('Already optimal.');
        sfx.deny();
        return;
      }
    }
    const cost = computeSuggestCost();
    if (!window.Wallet || !window.Wallet.spend(cost)) {
      flash(`Suggest costs ${cost} coins.`);
      sfx.deny();
      return;
    }
    applySuggestion(sug);
    flash(`Suggest applied (−${cost}).`);
    sfx.button();
    render();
  }

  // Single source of truth for payout math. Both-must-pay rule + HOUSE_TAX
  // floor. Returns { mult, payout, bothPay, breakeven }.
  function payoutFor(left, right, bet) {
    const bothPay = left.pays > 0 && right.pays > 0;
    if (!bothPay) return { mult: 0, payout: 0, bothPay: false, breakeven: false };
    const mult = Math.max(0, (left.pays + right.pays) - HOUSE_TAX);
    return { mult, payout: mult * bet, bothPay: true, breakeven: mult === 1 };
  }

  function scoreAndPay() {
    const left  = bestEval(leftSlice());
    const right = bestEval(rightSlice());
    S.lastResult = { left, right };
    const { mult: totalMult, payout, bothPay, breakeven } = payoutFor(left, right, S.bet);
    const lName = left.pays  > 0 ? `${left.name} (${left.pays}×)`   : 'Nothing';
    const rName = right.pays > 0 ? `${right.name} (${right.pays}×)` : 'Nothing';
    if (payout > 0) {
      window.Wallet && window.Wallet.add(payout);
      S.msg = breakeven
        ? `LEFT: ${lName} · RIGHT: ${rName} → ${payout} coins (BREAKEVEN).`
        : `LEFT: ${lName} · RIGHT: ${rName} → ${payout} coins.`;
      if (totalMult >= 10) {
        sfx.bigwin();
        S.statusClass = 'bigwin';
        triggerScreenShake();
        flashBigWin();
      } else if (breakeven) {
        sfx.button();
        S.statusClass = '';
      } else {
        sfx.win();
        S.statusClass = 'win';
      }
      bumpWallet();
    } else {
      const halfHit = left.pays > 0 || right.pays > 0;
      const tail = halfHit ? ' — both sides must pay.' : '';
      S.msg = `LEFT: ${lName} · RIGHT: ${rName}.${tail}`;
      S.statusClass = 'lose';
      sfx.lose();
    }
  }

  function triggerScreenShake() {
    const m = document.querySelector('main');
    if (!m) return;
    m.classList.remove('shake');
    void m.offsetWidth;
    m.classList.add('shake');
    setTimeout(() => m.classList.remove('shake'), 500);
  }
  function flashBigWin() {
    setTimeout(() => {
      if (!dom.paytable) return;
      dom.paytable.querySelectorAll('.pt-row.matched').forEach(row => {
        row.classList.remove('bigwin-flash');
        void row.offsetWidth;
        row.classList.add('bigwin-flash');
      });
    }, 30);
  }
  function bumpWallet() {
    if (!dom.walletBal) return;
    dom.walletBal.classList.remove('bump');
    void dom.walletBal.offsetWidth;
    dom.walletBal.classList.add('bump');
    setTimeout(() => dom.walletBal && dom.walletBal.classList.remove('bump'), 550);
  }

  function onCardClick(i) {
    // Holds toggle in HOLD phase only. In SWAP phase, cards are final and
    // click is a no-op (drag is the only action).
    if (S.phase !== PHASE.HOLD) return;
    S.holds[i] = !S.holds[i];
    sfx.select();
    render();
  }

  function swapPositions(i, j) {
    if (i === j) return;
    // Swaps are only allowed in SWAP phase, and cross-side swaps cost one
    // of the SWAPS_MAX budget. Same-side reorderings (cosmetic) are free.
    if (S.phase !== PHASE.SWAP) return;
    const crossSide = (i < SIDE) !== (j < SIDE);
    if (crossSide) {
      if (S.swapsRemaining <= 0) {
        flash('No swaps remaining.');
        sfx.deny();
        return;
      }
      S.swapsRemaining--;
    }
    S.swapPick = null;
    S.swapPopIds = new Set([S.hand[i].id, S.hand[j].id]);
    [S.hand[i], S.hand[j]]   = [S.hand[j], S.hand[i]];
    [S.holds[i], S.holds[j]] = [S.holds[j], S.holds[i]];
    sfx.swap();
    render();
    setTimeout(() => { S.swapPopIds = new Set(); }, 380);
  }

  // Click-to-pair swap: first click arms a card, second click commits the
  // swap with the partner (or, if same index, cancels). All the budget logic
  // (cross-side cost, same-side free) lives inside swapPositions.
  function onSwapPick(i) {
    if (S.phase !== PHASE.SWAP) return;
    if (S.swapPick === null) {
      S.swapPick = i;
      sfx.select();
      render();
      return;
    }
    if (S.swapPick === i) {
      S.swapPick = null;
      sfx.select();
      render();
      return;
    }
    const a = S.swapPick;
    S.swapPick = null;
    swapPositions(a, i);
  }

  function onSort(mode) {
    if (mode !== 'rank' && mode !== 'suit') return;
    S.sortMode = mode;
    applySort();
    sfx.button();
    render();
  }

  function onNew() {
    S.phase = PHASE.IDLE;
    S.hand = [];
    S.holds = [];
    S.lastResult = null;
    S.previewEval = null;
    S.swapPick = null;
    S.msg = 'Place a bet and deal.';
    S.statusClass = '';
    sfx.button();
    render();
  }

  function flash(text) {
    if (!dom.flash) return;
    dom.flash.textContent = text;
    setTimeout(() => { if (dom.flash.textContent === text) dom.flash.textContent = ''; }, 2400);
  }

  // ---- render ----
  function render() {
    // preview must compute first (sets S.previewEval which paytable + hand read)
    computePreview();
    renderPaytable();
    renderWallet();
    renderPreview();
    renderHands();
    renderControls();
    renderStatus();
    // One-shot animation flags: clear so a subsequent render (hold toggle,
    // bet change) doesn't replay the entrance/draw animation.
    S.dealAnim = false;
    S.newCardSet = new Set();
    // statusClass stays until the next deal so the status pulse persists
    // visually after scoring; cleared explicitly on onDeal/onNew.
  }

  function computePreview() {
    if (S.phase === PHASE.HOLD || S.phase === PHASE.SWAP) {
      S.previewEval = {
        left:  bestEval(leftSlice()),
        right: bestEval(rightSlice())
      };
    } else if (S.phase !== PHASE.DONE) {
      S.previewEval = null;
    }
  }

  function renderWallet() {
    const bal = (window.Wallet && window.Wallet.getBalance) ? window.Wallet.getBalance() : 0;
    if (dom.walletBal) dom.walletBal.textContent = bal;
  }

  function renderPaytable() {
    if (!dom.paytable) return;
    const matchedIds = new Set();
    if (S.lastResult) {
      if (S.lastResult.left.pays  > 0) matchedIds.add(S.lastResult.left.id);
      if (S.lastResult.right.pays > 0) matchedIds.add(S.lastResult.right.id);
    }
    const previewIds = new Set();
    if (S.previewEval && S.lastResult === null) {
      if (S.previewEval.left.pays  > 0) previewIds.add(S.previewEval.left.id);
      if (S.previewEval.right.pays > 0) previewIds.add(S.previewEval.right.id);
    }
    if (dom.paytable.querySelectorAll('.pt-row').length === 0) {
      const html = PAYTABLE.map(e =>
        `<div class="pt-row" data-id="${e.id}">
           <span class="pt-name">${e.name}</span>
           <span class="pt-desc">${e.desc}</span>
           <span class="pt-pays">${e.pays}×</span>
         </div>`
      ).join('');
      dom.paytable.innerHTML = html;
    }
    dom.paytable.querySelectorAll('.pt-row').forEach(row => {
      row.classList.remove('matched', 'previewed');
      const id = row.getAttribute('data-id');
      if (matchedIds.has(id)) row.classList.add('matched');
      else if (previewIds.has(id)) row.classList.add('previewed');
    });
  }

  function evalText(e) {
    if (!e) return '';
    const sub = subLabel(e);
    return `${e.name}${sub ? ' (' + sub + ')' : ''}${e.pays > 0 ? ` — ${e.pays}× = ${e.pays * S.bet}` : ''}`;
  }

  function renderPreview() {
    if (!dom.previewLeft || !dom.previewRight) return;
    if (S.phase === PHASE.IDLE) {
      dom.previewLeft.innerHTML  = '<span class="prev-hint">Place a bet, then DEAL.</span>';
      dom.previewRight.innerHTML = '<span class="prev-hint">Both sides must pay to win.</span>';
      if (dom.previewTotal) dom.previewTotal.innerHTML = '';
      return;
    }
    const src = (S.phase === PHASE.DONE) ? S.lastResult : S.previewEval;
    if (!src) return;
    const bothPay = src.left.pays > 0 && src.right.pays > 0;
    const styleFor = (e, label) => {
      const cls = e.pays > 0 ? 'prev-win' : 'prev-bust';
      const subL = subLabel(e);
      // If this side qualifies but the OTHER doesn't, mark the prize "void"
      const showPays = e.pays > 0;
      const paysCls = bothPay ? 'prev-pays' : 'prev-pays void';
      // Per-side multiplier only — the actual payout depends on BOTH sides
      // (HOUSE_TAX applies to the sum), so don't show "= X" per side.
      return `<span class="prev-label">${label}</span>` +
             `<span class="prev-name ${cls}">${e.name}</span>` +
             (subL ? `<span class="prev-sub"> (${subL})</span>` : '') +
             (showPays
                ? `<span class="${paysCls}">${e.pays}×${bothPay ? '' : ' (void)'}</span>`
                : '');
    };
    dom.previewLeft.innerHTML  = styleFor(src.left,  'LEFT');
    dom.previewRight.innerHTML = styleFor(src.right, 'RIGHT');
    if (dom.previewTotal) {
      if (bothPay) {
        const { mult, payout, breakeven } = payoutFor(src.left, src.right, S.bet);
        const verb = S.phase === PHASE.DONE ? 'PAID' : 'WOULD PAY';
        const label = breakeven ? 'BREAKEVEN' : verb;
        const formula = `(${src.left.pays} + ${src.right.pays} − ${HOUSE_TAX}) × ${S.bet}`;
        dom.previewTotal.innerHTML =
          `<span class="ptot-label">${label}</span>` +
          `<span class="ptot-amt">${payout} coins</span>` +
          `<span class="ptot-formula">${formula}</span>`;
      } else {
        const half = (src.left.pays > 0) || (src.right.pays > 0);
        dom.previewTotal.innerHTML = half
          ? `<span class="ptot-label">NO PAYOUT</span><span class="ptot-bust">one side empty — both hands must pay (Two Pair or better)</span>`
          : `<span class="ptot-label">NO PAYOUT</span><span class="ptot-bust">need a paying hand (Two Pair or better) on each side</span>`;
      }
    }
  }

  function renderHands() {
    renderSide(dom.handLeft,  0,    'left');
    renderSide(dom.handRight, SIDE, 'right');
  }

  function renderSide(container, base, sideName) {
    if (!container) return;
    container.innerHTML = '';
    if (S.hand.length === 0) {
      container.innerHTML = `<div class="hand-empty">—</div>`;
      return;
    }
    const ev = (S.phase === PHASE.DONE)
        ? (S.lastResult && S.lastResult[sideName])
        : (S.previewEval && S.previewEval[sideName]);
    const winnerSet = (ev && ev.pays > 0 && ev.indices)
        ? new Set(ev.indices)
        : null;
    for (let k = 0; k < SIDE; k++) {
      const i = base + k;
      const c = S.hand[i];
      const wrap = document.createElement('div');
      wrap.className = 'card-wrap';
      wrap.setAttribute('data-idx', String(i));
      // Click toggles hold (HOLD phase). Drag swaps cards (SWAP phase).
      // Behaviors are deliberately split between phases per the new rule:
      // pre-draw is hold-only, post-draw is swap-only.
      if (S.phase === PHASE.HOLD) {
        wrap.addEventListener('click', () => onCardClick(i));
        wrap.style.cursor = 'pointer';
      } else if (S.phase === PHASE.SWAP) {
        // Two ways to swap: (1) click one card to arm it then click another
        // to swap, (2) drag a card onto another. The click path is the
        // discoverable default — easier than drag for trackpad / mobile.
        wrap.addEventListener('click', () => onSwapPick(i));
        wrap.setAttribute('draggable', 'true');
        wrap.addEventListener('dragstart', (ev) => {
          S.dragSrc = i;
          // Drag overrides any pending click-pick so the two modes don't fight.
          S.swapPick = null;
          try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) {}
          ev.dataTransfer.effectAllowed = 'move';
          wrap.classList.add('dragging');
        });
        wrap.addEventListener('dragend', () => {
          wrap.classList.remove('dragging');
          document.querySelectorAll('.card-wrap.drag-over').forEach(el => el.classList.remove('drag-over'));
          S.dragSrc = null;
        });
        wrap.addEventListener('dragover', (ev) => {
          if (S.dragSrc === null || S.dragSrc === i) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          wrap.classList.add('drag-over');
        });
        wrap.addEventListener('dragleave', () => { wrap.classList.remove('drag-over'); });
        wrap.addEventListener('drop', (ev) => {
          ev.preventDefault();
          wrap.classList.remove('drag-over');
          const src = S.dragSrc;
          S.dragSrc = null;
          if (src !== null && src !== i) swapPositions(src, i);
        });
        wrap.style.cursor = 'pointer';
      }

      const card = document.createElement('div');
      card.className = 'card ' + (isWild(c) ? 'wild' : SUIT_NAMES[c.s]);
      if (isWild(c)) card.setAttribute('data-wild', c.wild);
      // HOLD phase = "click to hold" UX: discard-default, mark held as
      // .held. After the draw, the kept marker isn't user-relevant.
      if (S.phase === PHASE.HOLD) {
        if (S.holds[i]) card.classList.add('held');
      } else if (S.holds[i]) {
        card.classList.add('held');
      }
      if (winnerSet && winnerSet.has(i)) card.classList.add('winner');
      else if (winnerSet) card.classList.add('off-hand');
      // Animation classes. deal-in dominates flip-in when both would apply
      // (the initial deal is a single event). Stagger via --idx custom prop.
      if (S.dealAnim && S.newCardSet && S.newCardSet.has(c.id)) {
        card.classList.add('deal-in');
        card.style.setProperty('--idx', String(i));
      } else if (S.newCardSet && S.newCardSet.has(c.id)) {
        card.classList.add('flip-in');
        card.style.setProperty('--idx', String(k));
      }
      if (S.swapPopIds && S.swapPopIds.has(c.id)) card.classList.add('swap-pop');
      if (S.phase === PHASE.SWAP && S.swapPick === i) card.classList.add('swap-pick');

      const rank = document.createElement('div');
      rank.className = 'card-rank';
      rank.textContent = isWild(c) ? '' : (c.r + 1);
      card.appendChild(rank);

      wrap.appendChild(card);

      const holdBadge = document.createElement('div');
      // Filled badge = HOLD (the explicit kept-through-the-draw mark).
      const badgeOn = (S.phase === PHASE.HOLD && S.holds[i]);
      holdBadge.className = 'hold-badge' + (badgeOn ? ' on' : '');
      if (S.phase === PHASE.HOLD)      holdBadge.textContent = S.holds[i] ? 'HOLD' : 'click to hold';
      else if (S.phase === PHASE.SWAP) {
        if (S.swapPick === i)            holdBadge.textContent = 'click to cancel';
        else if (S.swapPick !== null)    holdBadge.textContent = 'click to swap here';
        else                             holdBadge.textContent = 'click to pick';
      }
      else                             holdBadge.textContent = '';
      wrap.appendChild(holdBadge);

      container.appendChild(wrap);
    }
  }

  function renderControls() {
    if (!dom.btnDeal) return;
    const idle = (S.phase === PHASE.IDLE || S.phase === PHASE.DONE);
    dom.btnDeal.disabled = !idle;
    dom.btnDeal.textContent = (S.phase === PHASE.DONE) ? 'Deal again' : 'Deal';
    // btn-draw doubles as Score in SWAP phase.
    dom.btnDraw.disabled = !(S.phase === PHASE.HOLD || S.phase === PHASE.SWAP);
    dom.btnDraw.textContent = (S.phase === PHASE.SWAP) ? 'Score' : 'Draw';
    dom.btnNew.disabled = (S.phase === PHASE.IDLE);
    if (dom.btnSuggest) {
      dom.btnSuggest.disabled = !(S.phase === PHASE.HOLD || S.phase === PHASE.SWAP);
      const cost = computeSuggestCost();
      dom.btnSuggest.textContent = (cost > 0)
        ? `Suggest (${cost})`
        : 'Suggest';
    }
    if (dom.swapCounter) {
      if (S.phase === PHASE.SWAP) {
        dom.swapCounter.style.display = '';
        const label = SWAPS_MAX === 1 ? 'Swap remaining' : 'Swaps remaining';
        dom.swapCounter.textContent = `${label}: ${S.swapsRemaining} / ${SWAPS_MAX}`;
      } else {
        dom.swapCounter.style.display = 'none';
      }
    }
    dom.betAmount.disabled = !idle;
    if (dom.btnSortRank) dom.btnSortRank.classList.toggle('active', S.sortMode === 'rank');
    if (dom.btnSortSuit) dom.btnSortSuit.classList.toggle('active', S.sortMode === 'suit');
  }

  function renderStatus() {
    if (!dom.status) return;
    const prevText = dom.status.textContent;
    dom.status.textContent = S.msg;
    // Re-trigger CSS animation when the text changes OR when we just resolved.
    if (S.statusClass) {
      dom.status.classList.remove('win', 'bigwin', 'lose');
      void dom.status.offsetWidth;
      dom.status.classList.add(S.statusClass);
    } else if (prevText !== S.msg) {
      dom.status.classList.remove('win', 'bigwin', 'lose');
    }
  }

  // ---- init ----
  function init() {
    dom = {
      paytable:     document.getElementById('paytable'),
      handLeft:     document.getElementById('hand-left'),
      handRight:    document.getElementById('hand-right'),
      previewLeft:  document.getElementById('preview-left'),
      previewRight: document.getElementById('preview-right'),
      previewTotal: document.getElementById('preview-total'),
      status:       document.getElementById('status'),
      flash:        document.getElementById('flash'),
      betAmount:    document.getElementById('bet-amount'),
      walletBal:    document.getElementById('bet-balance'),
      btnDeal:      document.getElementById('btn-deal'),
      btnDraw:      document.getElementById('btn-draw'),
      btnSuggest:   document.getElementById('btn-suggest'),
      btnNew:       document.getElementById('btn-new'),
      btnMute:      document.getElementById('btn-mute'),
      btnSortRank:  document.getElementById('sort-rank'),
      btnSortSuit:  document.getElementById('sort-suit'),
      swapCounter:  document.getElementById('swap-counter')
    };

    dom.btnDeal.addEventListener('click', onDeal);
    dom.btnDraw.addEventListener('click', () => {
      if (S.phase === PHASE.HOLD) onDraw();
      else if (S.phase === PHASE.SWAP) onScore();
    });
    if (dom.btnSuggest) dom.btnSuggest.addEventListener('click', onSuggest);
    dom.btnNew.addEventListener('click', onNew);
    if (dom.btnSortRank) dom.btnSortRank.addEventListener('click', () => onSort('rank'));
    if (dom.btnSortSuit) dom.btnSortSuit.addEventListener('click', () => onSort('suit'));
    dom.betAmount.value = DEFAULT_BET;
    dom.betAmount.addEventListener('change', () => { S.bet = readBet(); dom.betAmount.value = S.bet; renderPreview(); });
    if (dom.btnMute) {
      const updateMute = () => {
        dom.btnMute.textContent = sfx.isMuted() ? 'Sound: Off' : 'Sound: On';
      };
      dom.btnMute.addEventListener('click', () => { sfx.setMuted(!sfx.isMuted()); updateMute(); });
      updateMute();
    }
    if (window.Wallet && window.Wallet.onChange) {
      window.Wallet.onChange(renderWallet);
    }

    S.msg = 'Place a bet and deal.';
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
