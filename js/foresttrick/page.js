/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FOREST TRICK — owl/fox/fish 1-6 (×2 copies) + bee/child wilds; 3 players│
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   deck (38): ranks 1..6 × suits {fish, fox, owl}, two copies each (30)   │
  │     + 2 wild cards {bee, child}. Each physical card has a unique `id`.   │
  │   wilds substitute for any rank+suit; classify picks the best legal      │
  │     interpretation by brute force over substitutions.                    │
  │                                                                          │
  │   hand ladder (weakest → strongest):                                     │
  │     single < pair < two pair < trips < straight < flush < full house     │
  │     < four-of-a-kind < straight flush                                    │
  │                                                                          │
  │   DOMContentLoaded ──► init() ──► startGame ──► 3 personal 38-card decks │
  │     each player draws HAND_SIZE (10); render; await human action         │
  │                                                                          │
  │   per-trick action: play (1/2/3/4/5 legal hand). No discarding —         │
  │     decks shrink monotonically toward the first-out finish.              │
  │     You always lead trick 1; thereafter the trick winner leads next.     │
  │     Turn order within a trick starts from                                 │
  │     S.starter; followers see prior plays before deciding. No forced      │
  │     types, no forced beats — play anything legal.                        │
  │                                                                          │
  │   trick resolution:                                                      │
  │     compareHand: TIER asc → rank → sortVals (lex desc). sortVals is      │
  │       every card's cardVal desc — encodes "highest in the set, then      │
  │       kicker". Only if hands are card-for-card identical does            │
  │       computeTrickWinner fall back to first-in-turn-order via iterating  │
  │       from S.starter with strict cmp > 0.                                │
  │     winner sweeps all played cards into their collected pile.            │
  │     refill all hands back up to HAND_SIZE from each player's own draw.   │
  │                                                                          │
  │   classify(cards) ──► {type, rank, cards, sortVals} | null               │
  │     ├─ no wilds: classifyNatural(cs)                                     │
  │     └─ with wilds: enumerate (r,s) substitutions; pick best per compareH │
  │                                                                          │
  │   aiPickAction(seat, priorActions) ──► {play}                            │
  │     1. Card-counting sampler: each seat tracks playedCards (every card  │
  │        that seat has put on the table over the game). Sampling an opp's │
  │        hypothetical hand draws from THEIR 38-card composition minus     │
  │        what they've played — tight, realistic estimates.                │
  │     2. Tier-best candidates × MC sim. Each opp modeled by               │
  │        modelOpponentPlay (cheap-viable beat). Sequential: earlier opps  │
  │        raise the table for later ones.                                  │
  │     3. Reliability-first selection: any cand with winProb ≥ threshold   │
  │        is "reliable". Threshold = 0.85 ± tempo (ahead in score → up,    │
  │        behind → down). Among reliable, sort by SIZE (early/mid:         │
  │        smallest = conserve; late: largest = race), tiebreak by          │
  │        structure preservation (tierDrop ascending).                      │
  │     4. No reliable winners → max EV with penalties: conservPenalty +    │
  │        leadingPenalty + wildRisk + structurePenalty.                    │
  │                                                                          │
  │   strongestPossibleHand(h): max compareHand over tier-best of each      │
  │     combo length. Used to measure "potential lost" by a candidate —      │
  │     plays that crater the remaining hand's potential get penalized.     │
  │                                                                          │
  │   game end: any player's hand AND draw both empty → over.                │
  │     final score = collected + tricks + wilds-collected + FIRST_OUT_BONUS │
  │       (the player who emptied first).                                    │
  │                                                                          │
  │   sound: window.FTSfx — synthesized via Web Audio (bell partials + harp  │
  │     pluck + filtered noise + feedback-delay reverb). Methods: select,    │
  │     drag, button, deny, play, aiPlay, discard, submit, trickWin,         │
  │     gameStart, gameOver, plus setMuted/isMuted.                          │
  │                                                                          │
  │   Exports: none (self-contained IIFE)                                    │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONSTS: HAND_SIZE=10, AI_DELAY_MS=450, REVEAL_DELAY_MS=1100,
    AI_N_SIM=40, FIRST_OUT_BONUS=10, NUM_RANKS=6, NUM_SUITS=3, DECK_SIZE=38
  ranks 0..5 (display r+1); suits=[fish🐟,fox🦊,owl🦉] idx 0..2
  card: natural={r,s,id}; wild={wild:'bee'|'child',id}; cardId(c)=c.id
  TYPE={SINGLE:1,PAIR:2,TWO_PAIR:25,TRIPLE:3,STRAIGHT:5,FLUSH:6,FULL_HOUSE:7,FOUR_KIND:8,STRAIGHT_FLUSH:9}
  TIER asc: single<pair<2p<trips<straight<flush<fullH<4k<SF
  compareHand(a,b): TIER cmp || rank cmp || 0 (tie); starter wins ties via computeTrickWinner
  classifyNatural(cs): n=1 single; n=2 pair-same-r; n=3 trips-same-r; n=4 2-pair (2+2 distinct); n=5 sf>4k>fh>flush>straight
  classify(cs): if no wild→classifyNatural; else ∀sub∈{(r,s)}^|wilds|, pick max compareHand
  enum*: enumPairs/enumTwoPair/enumTriples/enum5 (pass through wilds)
  modelOpponentPlay(h, table): cheap-viable response — if table, smallest hand that beats it (else lowest single); if leading, weighted random size
  state S: players[3]={draw,hand,collected}, pendingActions[3], phase∈{SELECT,AI,RESOLVE,END},
    selPlay/Discard:Set<handIdx>, suggestionMode:bool, starter/currentSeat:0..2, handSort∈{rank,suit},
    tricksWon[3], collected piles, log[], over/winner/firstOut/finalScores, animatedSeats/revealedSeats
  aiPickAction(seat, priors): card-counting sampler reads playedCards-per-seat; MC sim each future opp from THEIR remaining pool. tempoAdjust tightens/loosens threshold by score lead. Reliability-first pick by size, tiebreak by tierDrop (structure preservation). EV fallback adds structurePenalty.
    else MC win-rate × (myCards+priorCards+oppCards), minus conservation penalty (deckRatio×0.55×extra
    + 0.35×extra if leading early); argmax.
  flow: submitHumanAction → reveal → advanceTurn → either runAiTurn or wait human → on all played:
    showWinnerBanner → animateCollect → resolveTrick → next trick (winner leads) or finalizeGame
  events: #btn-play→submit; #btn-clear→clearSel; #btn-new→startGame; #btn-suggest→autoSuggest;
    #btn-mute→toggle FTSfx; sort-rank/sort-suit→handSort; card click=toggle play
  on DOMContentLoaded→init
*/
(function () {
  const HAND_SIZE = 10;
  const AI_DELAY_MS = 450;
  const REVEAL_DELAY_MS = 1100;
  const AI_N_SIM = 40;
  const FIRST_OUT_BONUS_SOLO = 10;  // solo: one player empties alone
  const FIRST_OUT_BONUS_PAIR = 5;   // two-way tie: each gets half
  const FIRST_OUT_BONUS_TRIO = 0;   // three-way tie: nobody — the table cracked
  const FIRST_OUT_BONUS = FIRST_OUT_BONUS_SOLO; // legacy alias for log text
  const BET_PAYOUT_MULTIPLIER = 2.5; // win returns bet × 2.5 (was 1.75)
  const NUM_RANKS = 6;
  const NUM_SUITS = 3;
  const COPIES_PER_CARD = 2;
  const NUM_WILDS = 2;
  const DECK_SIZE = NUM_RANKS * NUM_SUITS * COPIES_PER_CARD + NUM_WILDS; // 38

  // ---- magical-forest sound effects (Web Audio, no files) ----
  // bells = stacked inharmonic sines (real-bell partial ratios); harp = filter-swept triangle;
  // shared shimmery reverb tail via feedback delay so every sound has space and air.
  (function installFTSfx() {
    if (window.FTSfx) return;
    let ctx = null;
    let muted = false;
    let masterDry = null;
    let masterWet = null;
    function ensure() {
      if (muted) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        // build the shared reverb-ish bus: comb delay + lowpass feedback
        masterDry = ctx.createGain(); masterDry.gain.value = 1.0;
        masterDry.connect(ctx.destination);
        masterWet = ctx.createGain(); masterWet.gain.value = 0.45;
        const d1 = ctx.createDelay(); d1.delayTime.value = 0.18;
        const d2 = ctx.createDelay(); d2.delayTime.value = 0.31;
        const fb = ctx.createGain(); fb.gain.value = 0.42;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        masterWet.connect(d1); d1.connect(lp); lp.connect(d2); d2.connect(fb); fb.connect(d1);
        d2.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function out(node, wet) {
      node.connect(masterDry);
      if (wet > 0) {
        const w = ctx.createGain(); w.gain.value = wet;
        node.connect(w); w.connect(masterWet);
      }
    }
    // Stacked-sine bell (real bell partials: 1, 2.0, 2.76, 5.4, 8.93).
    function bell(freq, dur, gain = 0.18, delay = 0, wet = 0.6) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + delay;
      const partials = [
        { r: 1.00, g: 1.00, t: dur },
        { r: 2.00, g: 0.55, t: dur * 0.85 },
        { r: 2.76, g: 0.35, t: dur * 0.7 },
        { r: 5.40, g: 0.16, t: dur * 0.45 },
        { r: 8.93, g: 0.08, t: dur * 0.25 }
      ];
      partials.forEach(p => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * p.r;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(gain * p.g, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.t);
        osc.connect(g);
        out(g, wet);
        osc.start(now);
        osc.stop(now + p.t + 0.05);
      });
    }
    // Plucked-string voice (triangle through fast-sweeping lowpass).
    function pluck(freq, dur, gain = 0.18, delay = 0, wet = 0.4) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + delay;
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 9, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + dur * 0.8);
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(filter).connect(g);
      out(g, wet);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
    // Filtered noise — "leaf rustle".
    function rustle(dur, gain, filterFreq, filterQ, delay = 0, wet = 0.3) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + delay;
      const bufSize = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        const t = i / bufSize;
        // soft attack + decay envelope baked into the buffer
        data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * (1 - t * 0.5);
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = filterQ;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(filter).connect(g);
      out(g, wet);
      src.start(now);
    }
    // Wooden "thunk" — short low sine + filtered impulse.
    function thunk(freq = 180, dur = 0.18, gain = 0.18, delay = 0, wet = 0.2) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + delay;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), now + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      out(g, wet);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
    // Pentatonic scale (minor pentatonic on A: A C D E G — feels mystical/ancient)
    const PENT = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];

    window.FTSfx = {
      setMuted(v) { muted = !!v; },
      isMuted() { return muted; },
      // soft sparkle — chime for selection
      select()  { bell(1568, 0.4, 0.05, 0, 0.4); }, // G6 chime
      drag()    { bell(1318, 0.25, 0.03, 0, 0.3); },
      button()  { pluck(523, 0.18, 0.10, 0, 0.3); pluck(659, 0.18, 0.08, 0.02, 0.3); },
      deny()    {
        // dissonant minor-second cluster, low and brief
        pluck(196, 0.35, 0.12, 0, 0.4);
        pluck(207, 0.35, 0.09, 0, 0.4);
      },
      // playing a card: soft leaf rustle + low wooden thunk + sparkle on top
      play() {
        rustle(0.22, 0.10, 2400, 3, 0, 0.35);
        thunk(190, 0.16, 0.16, 0, 0.25);
        bell(2093, 0.55, 0.07, 0.02, 0.55);  // C7 — high airy chime
      },
      aiPlay() {
        // quieter, deeper — opponents feel mossier
        rustle(0.18, 0.08, 1600, 3, 0, 0.4);
        thunk(150, 0.18, 0.12, 0, 0.3);
        bell(1568, 0.5, 0.05, 0.03, 0.5);    // G6
      },
      discard() {
        // long whoosh — leaves blown back into the wood
        rustle(0.5, 0.12, 1200, 1.5, 0, 0.55);
        pluck(330, 0.5, 0.07, 0, 0.5);
        pluck(247, 0.55, 0.05, 0.08, 0.5);
      },
      submit() {
        // 3-note harp arpeggio — perfect fifth resolved up
        pluck(523, 0.5, 0.13, 0.00, 0.45);  // C5
        pluck(659, 0.5, 0.13, 0.07, 0.45);  // E5
        pluck(784, 0.6, 0.14, 0.14, 0.5);   // G5
      },
      // shimmering bell cascade — 6 notes climbing the pentatonic
      trickWin() {
        const notes = [PENT[3], PENT[4], PENT[5], PENT[7], PENT[8], PENT[10]];
        notes.forEach((f, i) => bell(f, 1.1, 0.13, i * 0.07, 0.65));
      },
      gameStart() {
        // sunrise: three soft chimes ascending
        bell(523, 0.8, 0.10, 0.00, 0.6);
        bell(659, 0.9, 0.10, 0.12, 0.6);
        bell(784, 1.1, 0.11, 0.24, 0.7);
      },
      // Spinner: schedule decelerating "tick" clicks over `dur` seconds.
      // Pitch climbs slightly as ticks slow, then a landing chime resolves it.
      spin(dur) {
        const c = ensure(); if (!c) return;
        const startT = c.currentTime;
        // Generate decelerating event times via inverse-easing: more ticks early, sparser late.
        const N = 36;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          // ease-out so dt increases over time
          const eased = 1 - Math.pow(1 - u, 2.2);
          const t = eased * dur;
          const freq = 1400 - eased * 600; // 1400 → 800 Hz as it slows
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'square';
          osc.frequency.value = freq;
          const now = startT + t;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.05, now + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
          osc.connect(g);
          out(g, 0.15);
          osc.start(now);
          osc.stop(now + 0.04);
        }
      },
      spinLand() {
        // Resolving chime — pure bell ringing the winning slot.
        bell(880, 1.0, 0.16, 0, 0.7);
        bell(1320, 1.1, 0.12, 0.08, 0.7);
      },
      gameOver() {
        // grand magical fanfare: lush C major chord with shimmer cascade on top
        const root = 261.63;
        [root, root * 1.25, root * 1.5, root * 2].forEach((f, i) => {
          pluck(f, 1.8, 0.13, i * 0.04, 0.65);
        });
        // sparkle: 5 bells dancing above the chord
        [1046.5, 1318.5, 1567.98, 2093, 2637].forEach((f, i) => {
          bell(f, 1.6, 0.08, 0.25 + i * 0.09, 0.75);
        });
      }
    };
  })();

  const SUITS = ['🐟', '🦊', '🦉']; // idx 0=fish(low), 1=fox, 2=owl(high)
  const SUIT_NAMES = ['fish', 'fox', 'owl'];
  const SEAT_NAMES = ['You', 'Summer', 'Winter'];
  const NUM_PLAYERS = SEAT_NAMES.length;

  const TYPE = {
    SINGLE: 1, PAIR: 2, TWO_PAIR: 25, TRIPLE: 3,
    STRAIGHT: 5, FLUSH: 6, FULL_HOUSE: 7, FOUR_KIND: 8, STRAIGHT_FLUSH: 9
  };
  const TIER = { 1:1, 2:2, 25:3, 3:4, 5:5, 6:6, 7:7, 8:8, 9:9 };
  const TYPE_LABEL = {
    [TYPE.SINGLE]: 'single', [TYPE.PAIR]: 'pair', [TYPE.TWO_PAIR]: 'two pair',
    [TYPE.TRIPLE]: 'three of a kind',
    [TYPE.STRAIGHT]: 'straight', [TYPE.FLUSH]: 'flush',
    [TYPE.FULL_HOUSE]: 'full house', [TYPE.FOUR_KIND]: 'four of a kind',
    [TYPE.STRAIGHT_FLUSH]: 'straight flush'
  };

  const isWild = (c) => !!c.wild;
  const cardVal = (c) => c.r * NUM_SUITS + c.s;
  // Each physical card gets a unique numeric id. Required because the deck
  // contains two copies of each (rank, suit) pair, so identity != rank+suit.
  let _cardIdCounter = 0;
  const cardId = (c) => c.id;
  const cardLabel = (c) => isWild(c) ? (c.wild === 'bee' ? '🐝' : '🧒') : ((c.r + 1) + SUITS[c.s]);
  const cardArt = (c) => {
    if (isWild(c)) return `../assets/images/${c.wild}.svg`;
    return `../assets/images/${['fish','fox','owl'][c.s]}.svg`;
  };
  const cardRankText = (c) => isWild(c) ? (c.wild === 'bee' ? 'Bee' : 'Child') : String(c.r + 1);
  // sort: wilds last (treat as highest); naturals by cardVal asc
  const sortKey = (c) => isWild(c) ? 100 + (c.wild === 'bee' ? 0 : 1) : cardVal(c);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function newShuffledDeck() {
    const d = [];
    // Two copies of each (rank, suit) — 5 × 3 × 2 = 30 numbered cards.
    for (let r = 0; r < NUM_RANKS; r++)
      for (let s = 0; s < NUM_SUITS; s++)
        for (let copy = 0; copy < 2; copy++)
          d.push({ r, s, id: ++_cardIdCounter });
    d.push({ wild: 'bee', id: ++_cardIdCounter });
    d.push({ wild: 'child', id: ++_cardIdCounter });
    return shuffle(d);
  }
  const sortHand = (h) => h.sort((a, b) => sortKey(a) - sortKey(b));

  // ---- classification ----
  function classifyNatural(cards) {
    if (!cards || cards.length === 0) return null;
    const cs = cards.slice().sort((a, b) => cardVal(a) - cardVal(b));
    const n = cs.length;
    // `sortVals` is every card's cardVal sorted descending — used by compareHand
    // for the post-rank tiebreak ("highest card in the set, then the kicker").
    // For set-style hands the set's high suit lands first; kicker lands last.
    const sortVals = cs.map(cardVal).sort((a, b) => b - a);

    if (n === 1) return { type: TYPE.SINGLE, rank: cs[0].r, cards: cs, sortVals };
    if (n === 2) {
      if (cs[0].r !== cs[1].r) return null;
      return { type: TYPE.PAIR, rank: cs[1].r, cards: cs, sortVals };
    }
    if (n === 3) {
      if (cs[0].r !== cs[1].r || cs[1].r !== cs[2].r) return null;
      return { type: TYPE.TRIPLE, rank: cs[2].r, cards: cs, sortVals };
    }
    if (n === 4) {
      const counts = {}; cs.forEach(c => counts[c.r] = (counts[c.r] || 0) + 1);
      const ranks = Object.keys(counts).map(Number);
      // Four-of-a-kind: all four cards share one rank (top of the 4-card tier).
      if (ranks.length === 1) {
        return { type: TYPE.FOUR_KIND, rank: ranks[0], cards: cs, sortVals };
      }
      // Two pair: exactly two ranks, each with exactly 2 cards.
      if (ranks.length === 2 && counts[ranks[0]] === 2 && counts[ranks[1]] === 2) {
        const hi = Math.max(ranks[0], ranks[1]);
        const lo = Math.min(ranks[0], ranks[1]);
        return { type: TYPE.TWO_PAIR, rank: hi * 256 + lo, cards: cs, sortVals };
      }
      return null;
    }
    if (n === 5) {
      const ranks = cs.map(c => c.r);
      const suits = cs.map(c => c.s);
      const sameSuit = suits.every(s => s === suits[0]);
      const isStraight = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
      const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
      const countVals = Object.values(counts).sort((a, b) => b - a);

      if (sameSuit && isStraight) return { type: TYPE.STRAIGHT_FLUSH, rank: cs[4].r, cards: cs, sortVals };
      if (countVals[0] === 3 && countVals[1] === 2) {
        const tripRank = Number(Object.keys(counts).find(k => counts[k] === 3));
        return { type: TYPE.FULL_HOUSE, rank: tripRank, cards: cs, sortVals };
      }
      if (sameSuit) return { type: TYPE.FLUSH, rank: cs[4].r, cards: cs, sortVals };
      if (isStraight) return { type: TYPE.STRAIGHT, rank: cs[4].r, cards: cs, sortVals };
      // n=5 four-of-a-kind (4+kicker) is no longer legal — play 4-kind as 4 cards.
      return null;
    }
    return null;
  }

  // Tie-break order: TIER → rank → sortVals lexicographically.
  // sortVals is "every card's cardVal desc", which naturally encodes
  // "highest card in the set, then the kicker, then the next..."
  function compareHand(a, b) {
    const dt = TIER[a.type] - TIER[b.type];
    if (dt !== 0) return dt;
    const dr = a.rank - b.rank;
    if (dr !== 0) return dr;
    const av = a.sortVals || [];
    const bv = b.sortVals || [];
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
      const x = i < av.length ? av[i] : -1;
      const y = i < bv.length ? bv[i] : -1;
      if (x !== y) return x - y;
    }
    return 0;
    // Truly identical sortVals → 0. computeTrickWinner falls back to first-
    // seat-in-turn-order via its strict cmp > 0 iteration from S.starter.
  }

  // brute-force substitution. wilds: array of wild card objects in input order.
  // Returns best classification using cards.length wild substitutions, or null.
  function classifyWithWilds(nats, wilds) {
    const subs = [];
    for (let r = 0; r < NUM_RANKS; r++)
      for (let s = 0; s < NUM_SUITS; s++) subs.push({ r, s });
    let best = null;
    const original = [...nats, ...wilds];
    if (wilds.length === 1) {
      for (const sub of subs) {
        const cls = classifyNatural([...nats, sub]);
        if (cls && (!best || compareHand(cls, best) > 0)) best = { ...cls, cards: original.slice() };
      }
    } else if (wilds.length === 2) {
      // dedupe: (i, j) and (j, i) equivalent since wilds are interchangeable
      for (let i = 0; i < subs.length; i++) {
        for (let j = i; j < subs.length; j++) {
          const cls = classifyNatural([...nats, subs[i], subs[j]]);
          if (cls && (!best || compareHand(cls, best) > 0)) best = { ...cls, cards: original.slice() };
        }
      }
    }
    return best;
  }

  function classify(cards) {
    if (!cards || cards.length === 0) return null;
    const wilds = cards.filter(isWild);
    if (wilds.length === 0) return classifyNatural(cards);
    const nats = cards.filter(c => !isWild(c));
    return classifyWithWilds(nats, wilds);
  }

  // ---- enumerations ----
  // For combos, we enumerate over the hand's cards directly. Wilds are passed
  // through to classify(), which substitutes.
  function enumPairs(hand) {
    const out = [];
    for (let i = 0; i < hand.length; i++)
      for (let j = i + 1; j < hand.length; j++) {
        const cls = classify([hand[i], hand[j]]);
        if (cls) out.push(cls);
      }
    return out;
  }
  function enumTriples(hand) {
    const out = [];
    const n = hand.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          const cls = classify([hand[i], hand[j], hand[k]]);
          if (cls) out.push(cls);
        }
    return out;
  }
  function enumTwoPair(hand) {
    const out = [];
    const n = hand.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++) {
            const cls = classify([hand[a], hand[b], hand[c], hand[d]]);
            if (cls) out.push(cls);
          }
    return out;
  }
  function enum5(hand) {
    const out = [];
    const n = hand.length;
    if (n < 5) return out;
    for (let a = 0; a < n - 4; a++)
      for (let b = a + 1; b < n - 3; b++)
        for (let c = b + 1; c < n - 2; c++)
          for (let d = c + 1; d < n - 1; d++)
            for (let e = d + 1; e < n; e++) {
              const cls = classify([hand[a], hand[b], hand[c], hand[d], hand[e]]);
              if (cls) out.push(cls);
            }
    return out;
  }

  // ---- AI (EV-maximizing Monte Carlo) ----
  function tierBestOf(arr) {
    if (!arr.length) return null;
    let best = arr[0];
    for (const c of arr) if (compareHand(c, best) > 0) best = c;
    return best;
  }
  function highestSingleCls(hand) {
    if (!hand.length) return null;
    // Wilds are very valuable: each wild collected is worth +1 score, and they
    // substitute for any rank in multi-card hands. Burning one as a single is
    // wasteful. Prefer the highest *natural* card; only fall back to a wild-
    // single if the hand has nothing but wilds.
    const naturals = hand.filter(c => !isWild(c));
    const pool = naturals.length ? naturals : hand;
    let best = null;
    for (const c of pool) {
      const cls = classify([c]);
      if (cls && (!best || compareHand(cls, best) > 0)) best = cls;
    }
    return best;
  }

  // Card-counting sampler. Each seat keeps a `playedCards` list — every card
  // that seat has put on the table over the whole game (updated in
  // resolveTrick). Their remaining-deck composition = full 38-card spread
  // minus those plays (matched by rank+suit signature for naturals, name for
  // wilds). Sampling their hand draws HAND_SIZE from that constrained pool —
  // dramatically tighter than sampling from a fresh 38-card deck.
  function cardSig(c) {
    return isWild(c) ? ('W:' + c.wild) : (c.r * NUM_SUITS + c.s);
  }
  function sampleOpponentHand(seat) {
    // Build the full 38-card composition fresh (new ids).
    const pool = [];
    for (let r = 0; r < NUM_RANKS; r++)
      for (let s = 0; s < NUM_SUITS; s++)
        for (let copy = 0; copy < 2; copy++)
          pool.push({ r, s, id: ++_cardIdCounter });
    pool.push({ wild: 'bee', id: ++_cardIdCounter });
    pool.push({ wild: 'child', id: ++_cardIdCounter });
    // Subtract this seat's known plays (one match per played card, by sig).
    const played = (S.players[seat] && S.players[seat].playedCards) || [];
    const sigCount = {};
    for (const c of played) {
      const k = cardSig(c);
      sigCount[k] = (sigCount[k] || 0) + 1;
    }
    const remaining = [];
    for (const c of pool) {
      const k = cardSig(c);
      if (sigCount[k] > 0) { sigCount[k]--; continue; }
      remaining.push(c);
    }
    shuffle(remaining);
    const h = remaining.slice(0, HAND_SIZE);
    sortHand(h);
    return h;
  }

  // The strongest play already on the table this trick (or null if no one has
  // played yet). Used by the must-match-or-beat rule for followers.
  function bestPriorPlay() {
    let best = null;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const a = S.pendingActions[i];
      if (a && (!best || compareHand(a.play, best) > 0)) best = a.play;
    }
    return best;
  }
  // Can the hand produce any legal play that strictly beats `top`? Followers
  // who can beat MUST beat; followers who can't beat must instead play their
  // strongest possible hand (no donating low cards to dodge the commitment).
  function canBeat(hand, top) {
    if (!top || !hand.length) return false;
    const hs = highestSingleCls(hand);
    if (hs && compareHand(hs, top) > 0) return true;
    const p = tierBestOf(enumPairs(hand));
    if (p && compareHand(p, top) > 0) return true;
    const tp = tierBestOf(enumTwoPair(hand));
    if (tp && compareHand(tp, top) > 0) return true;
    const t = tierBestOf(enumTriples(hand));
    if (t && compareHand(t, top) > 0) return true;
    const f = tierBestOf(enum5(hand));
    if (f && compareHand(f, top) > 0) return true;
    return false;
  }

  // Strongest legal hand a player can construct from this card pool. Used for
  // "structure preservation" — measuring how badly a candidate play crushes
  // your remaining potential.
  function strongestPossibleHand(hand) {
    if (!hand.length) return null;
    const cands = [];
    const hs = highestSingleCls(hand); if (hs) cands.push(hs);
    const p = tierBestOf(enumPairs(hand)); if (p) cands.push(p);
    const tp = tierBestOf(enumTwoPair(hand)); if (tp) cands.push(tp);
    const t = tierBestOf(enumTriples(hand)); if (t) cands.push(t);
    const f = tierBestOf(enum5(hand)); if (f) cands.push(f);
    let best = null;
    for (const c of cands) if (!best || compareHand(c, best) > 0) best = c;
    return best;
  }

  // Opponent model: what a "reasonable" opponent would play given the table.
  // Cheaper than strongestHand and more realistic — they conserve big hands
  // when small ones suffice. If they can't beat the table they donate a low
  // single. When leading, they pick a play size by weighted roll.
  function modelOpponentPlay(oppHand, table) {
    if (!oppHand.length) return null;
    if (table) {
      // Try sizes from smallest up — cheapest viable hand wins for them too.
      const hs = highestSingleCls(oppHand);
      if (hs && compareHand(hs, table) > 0) return hs;
      const p = tierBestOf(enumPairs(oppHand));
      if (p && compareHand(p, table) > 0) return p;
      const tp = tierBestOf(enumTwoPair(oppHand));
      if (tp && compareHand(tp, table) > 0) return tp;
      const tr = tierBestOf(enumTriples(oppHand));
      if (tr && compareHand(tr, table) > 0) return tr;
      const fi = tierBestOf(enum5(oppHand));
      if (fi && compareHand(fi, table) > 0) return fi;
      // Can't beat — donate cheapest card.
      return classify([oppHand[0]]);
    }
    // Leading: weighted roll over play sizes.
    const r = Math.random();
    const tryOrFallback = (cls) => cls || highestSingleCls(oppHand);
    if (r < 0.55) return tryOrFallback(highestSingleCls(oppHand));
    if (r < 0.75) return tryOrFallback(tierBestOf(enumPairs(oppHand)));
    if (r < 0.85) return tryOrFallback(tierBestOf(enumTwoPair(oppHand)));
    if (r < 0.93) return tryOrFallback(tierBestOf(enumTriples(oppHand)));
    return tryOrFallback(tierBestOf(enum5(oppHand)));
  }

  // priorActions: S.pendingActions snapshot; entries are non-null for seats that already played this trick.
  function aiPickAction(seat, priorActions) {
    const hand = S.players[seat].hand;
    if (!hand.length) return null;

    // Strongest prior play and count of cards already on the table.
    let bestPrior = null;
    let priorCardSum = 0;
    let priorsCount = 0;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const a = priorActions[i];
      if (a) {
        priorsCount++;
        priorCardSum += a.play.cards.length;
        if (!bestPrior || compareHand(a.play, bestPrior) > 0) bestPrior = a.play;
      }
    }
    const numFuture = NUM_PLAYERS - 1 - priorsCount;

    // Build candidate set: tier-best of each combo length.
    const cands = [];
    const p = tierBestOf(enumPairs(hand));
    const tp = tierBestOf(enumTwoPair(hand));
    const t = tierBestOf(enumTriples(hand));
    const f = tierBestOf(enum5(hand));

    // Smart-single: avoid wilds (already in highestSingleCls) AND avoid cards
    // that are load-bearing in any combo candidate. If you have a near-flush
    // 4 owls, don't burn one as your "highest single" — it's worth more in
    // the combo. Fallback to highestSingleCls (which still prefers naturals)
    // when every natural is part of some combo.
    const comboIds = new Set();
    [p, tp, t, f].forEach(c => { if (c) c.cards.forEach(card => comboIds.add(cardId(card))); });
    let hs;
    const offDuty = hand.filter(c => !isWild(c) && !comboIds.has(cardId(c)));
    if (offDuty.length) {
      // Highest single from the non-combo, non-wild remainder.
      let best = null;
      for (const c of offDuty) {
        const cls = classify([c]);
        if (cls && (!best || compareHand(cls, best) > 0)) best = cls;
      }
      hs = best;
    } else {
      hs = highestSingleCls(hand);
    }

    if (hs) cands.push(hs);
    if (p) cands.push(p);
    if (tp) cands.push(tp);
    if (t) cands.push(t);
    if (f) cands.push(f);

    // Viable = strictly beats current best prior. Followers who can beat
    // MUST beat. Followers who can't beat are forced into their strongest
    // possible hand instead (handled in the !viable branch below).
    const viable = bestPrior ? cands.filter(c => compareHand(c, bestPrior) > 0) : cands.slice();

    let bestCand;
    if (!viable.length) {
      // Cannot beat the table → free to play anything legal. Donate the
      // cheapest card (lowest natural single — wilds never end up at hand[0]
      // since sortKey puts them at the top).
      bestCand = classify([hand[0]]);
    } else {
      // ---- Game-state awareness ----
      const myDeck = S.players[seat].hand.length + S.players[seat].draw.length;
      const deckRatio = Math.min(1, myDeck / DECK_SIZE);
      const phaseMod = 2 * deckRatio - 1; // +1 full → -1 empty
      const earlyPhase = phaseMod > 0;

      // Score-aware tempo: compare our current "score-ish" tally vs the best
      // opponent. Ahead → tighter (be picky); behind → looser (gamble more).
      const scoreOf = (i) => {
        const col = S.players[i].collected;
        return col.length + col.filter(isWild).length + S.tricksWon[i];
      };
      const myScore = scoreOf(seat);
      let maxOppScore = 0;
      for (let i = 0; i < NUM_PLAYERS; i++) {
        if (i === seat) continue;
        if (scoreOf(i) > maxOppScore) maxOppScore = scoreOf(i);
      }
      const scoreLead = myScore - maxOppScore;
      const tempoAdjust = -0.05 * Math.tanh(scoreLead / 12); // ±0.05 around the base threshold
      const RELIABLE_THRESHOLD = 0.85 + tempoAdjust;

      // Identify which seats are future opps in turn order — needed by the
      // card-counting sampler so each opp draws from THEIR own remaining pool.
      const myTurnIdx = (seat - S.starter + NUM_PLAYERS) % NUM_PLAYERS;
      const futureOpps = [];
      for (let k = myTurnIdx + 1; k < NUM_PLAYERS; k++) {
        futureOpps.push((S.starter + k) % NUM_PLAYERS);
      }

      // Hand-structure baseline: what's the strongest hand we could make
      // BEFORE committing anything? Used to penalize candidates that demolish
      // our remaining potential.
      const beforeBest = strongestPossibleHand(hand);
      const beforeTier = beforeBest ? TIER[beforeBest.type] : 0;

      // ---- Score each candidate via MC ----
      const scored = [];
      for (const cand of viable) {
        let wins = 0;
        let totalGain = 0;
        if (numFuture === 0) {
          wins = AI_N_SIM;
          totalGain = AI_N_SIM * (cand.cards.length + priorCardSum);
        } else {
          for (let s = 0; s < AI_N_SIM; s++) {
            let tableHigh = cand;
            let stillOurs = true;
            let oppCardSum = 0;
            for (let o = 0; o < numFuture; o++) {
              const oppSeat = futureOpps[o];
              const oppPlay = modelOpponentPlay(sampleOpponentHand(oppSeat), tableHigh);
              if (!oppPlay) continue;
              oppCardSum += oppPlay.cards.length;
              if (compareHand(oppPlay, tableHigh) > 0) {
                tableHigh = oppPlay;
                stillOurs = false;
              }
            }
            if (stillOurs) {
              wins++;
              totalGain += cand.cards.length + priorCardSum + oppCardSum;
            }
          }
        }
        const winProb = wins / AI_N_SIM;
        const rawEv = totalGain / AI_N_SIM;

        // Structure cost: how much does playing this candidate crater our
        // remaining hand's strongest possible play? A 5-card flush that
        // leaves us with junk pays a bigger cost than a pair that leaves
        // the rest intact.
        const playIds = new Set(cand.cards.map(cardId));
        const remainingHand = hand.filter(c => !playIds.has(cardId(c)));
        const afterBest = strongestPossibleHand(remainingHand);
        const afterTier = afterBest ? TIER[afterBest.type] : 0;
        const tierDrop = Math.max(0, beforeTier - afterTier);
        scored.push({ cand, winProb, rawEv, tierDrop });
      }

      const reliable = scored.filter(s => s.winProb >= RELIABLE_THRESHOLD);
      // Reliable-first heuristic assumes "must win this trick". That breaks
      // when WE'RE leading early — every candidate dominates the empty table
      // so they all look reliable, and "smallest reliable" can still mean a
      // straight flush when our only smaller candidates also pass the model.
      // Skip the heuristic when leading early so the EV path can apply
      // conservation + structure penalties properly.
      const skipReliable = priorsCount === 0 && earlyPhase;
      if (!skipReliable && reliable.length > 0) {
        // Among reliable winners, sort by size (early/mid: smallest = save
        // material; late: largest = race & maximize collected). Ties broken
        // by structure preservation (smaller tierDrop wins), then by rank.
        if (earlyPhase) {
          reliable.sort((a, b) =>
            a.cand.cards.length - b.cand.cards.length ||
            a.tierDrop - b.tierDrop ||
            compareHand(a.cand, b.cand)
          );
        } else {
          reliable.sort((a, b) =>
            b.cand.cards.length - a.cand.cards.length ||
            a.tierDrop - b.tierDrop ||
            compareHand(b.cand, a.cand)
          );
        }
        bestCand = reliable[0].cand;
      } else {
        // Risky trick — max EV with the full kit of penalties.
        let bestEV = -Infinity;
        bestCand = scored[0].cand;
        for (const { cand, winProb, rawEv, tierDrop } of scored) {
          const isFiveCard = cand.cards.length === 5;
          const extra = isFiveCard ? 4 : Math.min(2, Math.max(0, cand.cards.length - 1));
          const conservPenalty = phaseMod * 0.55 * extra;
          const leadingPenalty = (priorsCount === 0 && phaseMod > 0) ? phaseMod * 0.35 * extra : 0;
          const playWildCount = cand.cards.filter(isWild).length;
          const wildRisk = playWildCount * (1 - winProb);
          // Structure penalty — proportional to potential tier-drop. Scales
          // down in late game (when we want to spend our hand anyway).
          // Weight is high enough to actually flip preference away from
          // big-hand leads when smaller hands preserve much more potential.
          const structurePenalty = tierDrop * 1.1 * Math.max(0, phaseMod);
          const ev = rawEv - conservPenalty - leadingPenalty - wildRisk - structurePenalty + cand.cards.length * 1e-6;
          if (ev > bestEV) { bestEV = ev; bestCand = cand; }
        }
      }
    }

    return { play: bestCand, discard: [] };
  }

  // ---- state ----
  const S = {
    players: Array.from({ length: NUM_PLAYERS }, () => ({ draw: [], hand: [], collected: [], playedCards: [] })),
    pendingActions: Array(NUM_PLAYERS).fill(null),
    animatedSeats: new Set(),    // seats whose trick cards have already played their fly-in
    revealedSeats: new Set(),    // seats whose plays are currently visible
    starter: 0,                  // seat that opens the trick; rotates each round
    currentSeat: 0,              // whose turn it is to act within the current trick
    phase: 'SELECT',             // SELECT (human's turn) | AI | RESOLVE | END
    handSort: 'rank',            // 'rank' | 'suit' — display order of your hand
    suggestionMode: false,       // true: current selPlay is an auto-suggestion (not user picks)
    currentBet: 0,               // coins wagered on this game (0 = nothing on the line yet)
    awaitingBet: true,           // gate: true → show bet form, block startGame
    selPlay: new Set(),
    tricksWon: Array(NUM_PLAYERS).fill(0),
    log: [],
    over: false,
    winner: null,           // game winner (most cards)
    firstOut: null,         // first seat in firstOuts (back-compat)
    firstOuts: null,        // all seats that emptied on the same trick
    finalScores: null,      // [{seat, collected, bonus, total}, ...]
    lastTrickWinner: null
  };

  function refill(seat) {
    const p = S.players[seat];
    while (p.hand.length < HAND_SIZE && p.draw.length > 0) p.hand.push(p.draw.shift());
    sortHand(p.hand);
  }

  function startGame() {
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const deck = newShuffledDeck();
      S.players[i] = { draw: deck, hand: [], collected: [], playedCards: [] };
      refill(i);
    }
    S.pendingActions = Array(NUM_PLAYERS).fill(null);
    S.animatedSeats.clear();
    S.revealedSeats.clear();
    S.starter = 0;
    S.currentSeat = 0;
    S.phase = (S.currentSeat === 0) ? 'SELECT' : 'AI';
    S.selPlay.clear();
    // (auto-suggest disabled — user triggers it manually via the Suggest button)
    S.tricksWon = Array(NUM_PLAYERS).fill(0);
    S.log = ['New game. Each player has a 38-card deck (1-6 × 🐟🦊🦉 ×2 + 🐝 + 🧒). Drew 10 each.'];
    S.over = false;
    S.winner = null;
    S.firstOut = null;
    S.firstOuts = null;
    S.finalScores = null;
    S.lastTrickWinner = null;
  }

  // Human-readable hand description for trick narration.
  function handDescription(play) {
    const r = play.rank;
    const t = play.type;
    // Derive the "play's suit" from the cards: high suit on top of sortVals,
    // or the first non-wild card's suit for flush/straight-flush.
    const flushSuit = () => {
      for (const c of play.cards) if (!isWild(c)) return c.s;
      return 2; // all-wild edge: default to owl
    };
    const topSuitForSingle = () => {
      const c = play.cards[0];
      if (!isWild(c)) return c.s;
      // single is a wild — sortVals[0] is the substituted cardVal
      const v = (play.sortVals && play.sortVals[0]) || 0;
      return v % NUM_SUITS;
    };
    if (t === TYPE.SINGLE) return `${r + 1}${SUITS[topSuitForSingle()]}`;
    if (t === TYPE.PAIR) return `pair of ${r + 1}s`;
    if (t === TYPE.TWO_PAIR) {
      const hi = Math.floor(r / 256), lo = r % 256;
      return `two pair: ${hi + 1}s & ${lo + 1}s`;
    }
    if (t === TYPE.TRIPLE) return `three ${r + 1}s`;
    if (t === TYPE.STRAIGHT) return `straight to ${r + 1}`;
    if (t === TYPE.FLUSH) return `${SUIT_NAMES[flushSuit()]} flush (high ${r + 1})`;
    if (t === TYPE.FULL_HOUSE) return `full house, ${r + 1}s up`;
    if (t === TYPE.FOUR_KIND) return `four ${r + 1}s`;
    if (t === TYPE.STRAIGHT_FLUSH) return `${SUIT_NAMES[flushSuit()]} straight flush to ${r + 1}`;
    return TYPE_LABEL[t] || 'hand';
  }

  // Build the "Winter wins: X beats Y because Z" line. Compares the winner to
  // their strongest opponent and explains the deciding axis: hand type, rank,
  // sortVals (highest in the set then kicker), or — last resort — turn order.
  function explainTrickResult(winner, actions) {
    const winPlay = actions[winner].play;
    let bestLoser = null, bestLoserSeat = -1;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (i === winner) continue;
      if (!bestLoser || compareHand(actions[i].play, bestLoser) > 0) {
        bestLoser = actions[i].play;
        bestLoserSeat = i;
      }
    }
    const wn = SEAT_NAMES[winner], ln = SEAT_NAMES[bestLoserSeat];
    const wDesc = handDescription(winPlay), lDesc = handDescription(bestLoser);
    if (winPlay.type !== bestLoser.type) {
      return `${wn} wins: ${wDesc} beats ${ln}'s ${lDesc} — ${TYPE_LABEL[winPlay.type]} outranks ${TYPE_LABEL[bestLoser.type]}.`;
    }
    if (winPlay.rank !== bestLoser.rank) {
      return `${wn} wins: ${wDesc} beats ${ln}'s ${lDesc} — higher card.`;
    }
    // Same type and same rank — sortVals decides.
    const av = winPlay.sortVals || [];
    const bv = bestLoser.sortVals || [];
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const x = i < av.length ? av[i] : -1;
      const y = i < bv.length ? bv[i] : -1;
      if (x !== y) {
        // Translate the cardVal back to "rank+suit" so the player can see it.
        const role = (i === 0) ? 'high card in the set' : (i < av.length - 1 ? `card #${i + 1} in the set` : 'kicker');
        const xLabel = (x >= 0) ? `${(Math.floor(x / NUM_SUITS) + 1)}${SUITS[x % NUM_SUITS]}` : '—';
        const yLabel = (y >= 0) ? `${(Math.floor(y / NUM_SUITS) + 1)}${SUITS[y % NUM_SUITS]}` : '—';
        return `${wn} wins: ${wDesc} beats ${ln}'s ${lDesc} — better ${role} (${xLabel} vs ${yLabel}).`;
      }
    }
    // Identical sortVals — fallback to turn-order priority.
    const turnOrder = [];
    for (let k = 0; k < NUM_PLAYERS; k++) turnOrder.push((S.starter + k) % NUM_PLAYERS);
    const orderStr = turnOrder.map(s => SEAT_NAMES[s]).join(' → ');
    return `${wn} wins: ${wDesc} matches ${ln}'s ${lDesc} card-for-card — ${wn} played first in turn order (${orderStr}).`;
  }

  // Banner control — flashes "X WINS" + reason over the trick area at resolve time.
  function showWinnerBanner(winner, actions) {
    const banner = document.getElementById('trick-banner');
    if (!banner) return;
    const name = banner.querySelector('.winner-name');
    const reason = banner.querySelector('.winner-reason');
    name.textContent = `${SEAT_NAMES[winner]} wins!`;
    // strip the redundant "X wins: " prefix from explanation
    let full = explainTrickResult(winner, actions);
    full = full.replace(/^[^:]+:\s*/, '');
    reason.textContent = full;
    banner.classList.add('show');
  }
  function hideWinnerBanner() {
    const banner = document.getElementById('trick-banner');
    if (banner) banner.classList.remove('show');
  }

  // pure: who wins the trick given the current pendingActions (starter wins ties).
  function computeTrickWinner() {
    let winner = S.starter;
    for (let k = 1; k < NUM_PLAYERS; k++) {
      const i = (S.starter + k) % NUM_PLAYERS;
      if (compareHand(S.pendingActions[i].play, S.pendingActions[winner].play) > 0) winner = i;
    }
    return winner;
  }

  function resolveTrick(winner) {
    if (winner === undefined) winner = computeTrickWinner();
    S.tricksWon[winner]++;
    S.lastTrickWinner = winner;

    // ALL played cards (winner's + losers') go to the trick winner's collected pile.
    // Each player's hand loses their own play cards. Also append to each
    // seat's `playedCards` — the card-counting sampler reads this list to
    // exclude already-played cards from opponent-hand samples.
    let allPlayed = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const playCards = S.pendingActions[i].play.cards;
      const pIds = new Set(playCards.map(cardId));
      S.players[i].hand = S.players[i].hand.filter(c => !pIds.has(cardId(c)));
      S.players[i].playedCards.push(...playCards);
      allPlayed = allPlayed.concat(playCards);
    }
    S.players[winner].collected.push(...allPlayed);

    // Everyone refills from their own draw pile.
    for (let i = 0; i < NUM_PLAYERS; i++) refill(i);

    const summary = Array.from({length: NUM_PLAYERS}, (_, i) => i).map(i => {
      const a = S.pendingActions[i];
      return `${SEAT_NAMES[i]}: ${a.play.cards.map(cardLabel).join(' ')} (${TYPE_LABEL[a.play.type]})`;
    }).join('  |  ');
    S.log.push(summary);
    S.log.push(explainTrickResult(winner, S.pendingActions));
    S.log.push(`${SEAT_NAMES[winner]} collects ${allPlayed.length} card${allPlayed.length>1?'s':''} (now ${S.players[winner].collected.length} total).`);

    // Game ends when any player has emptied their deck (hand + draw).
    // Multiple players can empty on the same trick — collect all of them
    // so the bonus can split correctly (solo / pair / trio rules).
    const outsThisTrick = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (S.players[i].hand.length === 0 && S.players[i].draw.length === 0) {
        outsThisTrick.push(i);
      }
    }
    if (outsThisTrick.length > 0) {
      S.over = true;
      S.firstOuts = outsThisTrick;
      // Back-compat: keep firstOut pointing at the first seat in iteration
      // order so older render code that reads S.firstOut still resolves.
      S.firstOut = outsThisTrick[0];
      finalizeGame();
    }
  }

  function finalizeGame() {
    // Final score = collected count + tricks won + 1 per wild (bee/child) in
    //              collected pile + first-out bonus (tiered by how many
    //              players emptied on the same trick: 10 solo / 5 each on
    //              a pair / 0 on a trio).
    const outs = S.firstOuts || (S.firstOut != null ? [S.firstOut] : []);
    let bonusPerOut = 0;
    if (outs.length === 1)      bonusPerOut = FIRST_OUT_BONUS_SOLO;
    else if (outs.length === 2) bonusPerOut = FIRST_OUT_BONUS_PAIR;
    else                        bonusPerOut = FIRST_OUT_BONUS_TRIO;
    const outSet = new Set(outs);
    const scores = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const collected = S.players[i].collected.length;
      const tricks = S.tricksWon[i];
      const wilds = S.players[i].collected.filter(c => isWild(c)).length;
      const bonus = outSet.has(i) ? bonusPerOut : 0;
      scores.push({ seat: i, collected, tricks, wilds, bonus, total: collected + tricks + wilds + bonus });
    }
    S.finalScores = scores;
    let winner = 0;
    for (let i = 1; i < NUM_PLAYERS; i++) {
      if (scores[i].total > scores[winner].total) winner = i;
    }
    S.winner = winner;
    if (outs.length === 1) {
      S.log.push(`*** ${SEAT_NAMES[outs[0]]} emptied their deck first — +${bonusPerOut} bonus. ***`);
    } else if (outs.length === 2) {
      S.log.push(`*** ${SEAT_NAMES[outs[0]]} and ${SEAT_NAMES[outs[1]]} emptied together — +${bonusPerOut} each. ***`);
    } else {
      S.log.push(`*** All three emptied at once — no bonus. ***`);
    }
    const lines = scores
      .slice().sort((a, b) => b.total - a.total)
      .map(s => `${SEAT_NAMES[s.seat]}: ${s.collected} cards + ${s.tricks} tricks + ${s.wilds} wilds${s.bonus ? ` + ${s.bonus} bonus` : ''} = ${s.total}`)
      .join('  |  ');
    S.log.push(`Final: ${lines}`);
    S.log.push(`${SEAT_NAMES[winner]} wins with ${scores[winner].total} points.`);

    // Bet settlement — only the human (seat 0) can win the wager.
    if (S.currentBet > 0 && window.Wallet) {
      if (winner === 0) {
        const payout = Math.floor(S.currentBet * BET_PAYOUT_MULTIPLIER);
        window.Wallet.add(payout);
        S.log.push(`*** You won the wager: +${payout} coins (${payout - S.currentBet} profit). ***`);
      } else {
        S.log.push(`*** Lost the ${S.currentBet}-coin wager to ${SEAT_NAMES[winner]}. ***`);
      }
    }
  }

  // ---- animations ----
  // Per-seat "exit vector" for cards being collected by the winner
  // (or discarded). Negative dx/dy = off-screen left/up.
  function seatExitVector(seat) {
    if (seat === 0) return { dx: 0, dy: window.innerHeight * 0.6, rot: 6 };       // bottom (You)
    if (seat === 1) return { dx: -window.innerWidth * 0.55, dy: -40, rot: -22 };  // left  (Winter)
    return { dx: window.innerWidth * 0.55, dy: -40, rot: 22 };                    // right (Summer)
  }

  function animateCollect(winnerSeat, onDone) {
    const v = seatExitVector(winnerSeat);
    const cards = document.querySelectorAll('#trick .trick-card');
    if (!cards.length) { onDone(); return; }
    cards.forEach((el, i) => {
      el.style.transition = 'transform 0.65s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.65s ease-in';
      el.style.transitionDelay = (i * 0.03) + 's';
      el.style.transform = `translate(${v.dx}px, ${v.dy}px) rotate(${v.rot}deg) scale(0.55)`;
      el.style.opacity = '0.25';
    });
    setTimeout(onDone, 750);
  }

  // ---- flow ----
  // Pre-populate selPlay with the AI's recommended play for the
  // human seat, honoring the follow-the-lead rule. Called when phase enters
  // SELECT for seat 0. Only runs if the user hasn't already picked something.
  function autoSuggestForHuman() {
    if (S.currentSeat !== 0 || S.over) return;
    if (S.selPlay.size > 0) return; // don't clobber user choices
    const action = aiPickAction(0, S.pendingActions);
    if (!action) return;
    const playIds = new Set(action.play.cards.map(cardId));
    S.players[0].hand.forEach((c, idx) => {
      if (playIds.has(cardId(c))) S.selPlay.add(idx);
    });
    S.suggestionMode = S.selPlay.size > 0;
  }

  // ---- betting ----
  // Place a wager and start the deal. Pulls Wallet.spend; on game-end the
  // winning player (only if seat 0) receives bet × BET_PAYOUT_MULTIPLIER back.
  // Coin cost to consult the AI suggestion this turn — 5% of the current
  // wager, rounded up. Min 1 coin if there's any bet in play. Free pre-bet.
  function suggestionCost() {
    if (S.currentBet <= 0) return 0;
    return Math.max(1, Math.ceil(S.currentBet * 0.05));
  }

  function placeBet() {
    if (!S.awaitingBet) return;
    const input = document.getElementById('bet-amount');
    const amt = Math.max(1, Math.floor(parseInt(input.value, 10) || 0));
    if (!window.Wallet) { flash('Wallet unavailable.'); return; }
    const balance = window.Wallet.getBalance();
    if (amt > balance) {
      if (window.FTSfx) window.FTSfx.deny();
      flash(`Not enough coins (you have ${balance}).`);
      return;
    }
    if (!window.Wallet.spend(amt)) {
      if (window.FTSfx) window.FTSfx.deny();
      flash('Bet rejected.');
      return;
    }
    if (window.FTSfx) { window.FTSfx.button(); window.FTSfx.gameStart(); }
    if (window.Child && window.Child.recordPlay) window.Child.recordPlay();
    startGame();
    S.currentBet = amt;
    S.awaitingBet = false;
    S.log.push(`Wagered ${amt} coin${amt === 1 ? '' : 's'}. Win pays ${Math.floor(amt * BET_PAYOUT_MULTIPLIER)}.`);
    render();
    if (S.currentSeat !== 0 && !S.over) setTimeout(runAiTurn, AI_DELAY_MS);
  }

  function resetToBettingPhase() {
    // Tear down the table so the next bet starts from a clean slate.
    S.players = Array.from({ length: NUM_PLAYERS }, () => ({ draw: [], hand: [], collected: [], playedCards: [] }));
    S.pendingActions = Array(NUM_PLAYERS).fill(null);
    S.animatedSeats.clear();
    S.revealedSeats.clear();
    S.selPlay.clear();
    S.suggestionMode = false;
    S.tricksWon = Array(NUM_PLAYERS).fill(0);
    S.starter = 0;
    S.currentSeat = 0;
    S.phase = 'BETTING';
    S.over = false;
    S.winner = null;
    S.firstOut = null;
    S.firstOuts = null;
    S.finalScores = null;
    S.lastTrickWinner = null;
    S.currentBet = 0;
    S.awaitingBet = true;
    S.log = [];
  }

  function updateBetPanel() {
    const balance = window.Wallet ? window.Wallet.getBalance() : 0;
    const balEl = document.getElementById('bet-balance');
    if (balEl) balEl.textContent = balance;
    const form = document.getElementById('bet-form');
    const active = document.getElementById('bet-active');
    if (!form || !active) return;
    if (S.awaitingBet) {
      form.style.display = 'flex';
      active.style.display = 'none';
      const input = document.getElementById('bet-amount');
      if (input) {
        input.max = Math.max(1, balance);
        const amt = Math.max(1, Math.min(balance || 1, parseInt(input.value, 10) || 1));
        const out = document.getElementById('bet-payout');
        if (out) out.textContent = Math.floor(amt * BET_PAYOUT_MULTIPLIER);
      }
      const btnBet = document.getElementById('btn-bet');
      if (btnBet) btnBet.disabled = balance < 1;
    } else {
      form.style.display = 'none';
      active.style.display = 'flex';
      const a = document.getElementById('bet-active-amount');
      const p = document.getElementById('bet-active-payout');
      if (a) a.textContent = S.currentBet + ' coin' + (S.currentBet === 1 ? '' : 's');
      if (p) p.textContent = Math.floor(S.currentBet * BET_PAYOUT_MULTIPLIER) + ' coins';
    }
  }

  function submitHumanAction() {
    if (S.phase !== 'SELECT' || S.over || S.currentSeat !== 0) return;
    const playCards = [...S.selPlay].map(i => S.players[0].hand[i]).filter(Boolean);
    if (!playCards.length) {
      if (window.FTSfx) window.FTSfx.deny();
      flash('Select cards to play.'); return;
    }
    const cls = classify(playCards);
    if (!cls) {
      if (window.FTSfx) window.FTSfx.deny();
      flash('Play must be 1, 2, 3, 4 (two pair / four-of-a-kind), or 5 cards as a legal hand.'); return;
    }
    // Must-beat rule (soft). If a prior is on the table AND our hand can beat
    // it, we MUST play a beating hand. If we can't beat, anything legal is
    // allowed — donate junk, conserve material, your call.
    const top = bestPriorPlay();
    if (top && compareHand(cls, top) <= 0 && canBeat(S.players[0].hand, top)) {
      if (window.FTSfx) window.FTSfx.deny();
      flash('You can beat the table — you must.'); return;
    }
    if (window.FTSfx) window.FTSfx.submit();
    S.pendingActions[0] = { play: cls, discard: [] };
    S.selPlay.clear();
    S.suggestionMode = false;
    S.revealedSeats.add(0);
    S.phase = 'AI';
    render();
    if (window.FTSfx) window.FTSfx.play();
    setTimeout(advanceTurn, REVEAL_DELAY_MS);
  }

  // sequential-turn driver
  function advanceTurn() {
    if (S.over) return;
    const played = S.pendingActions.filter(p => p).length;
    if (played >= NUM_PLAYERS) {
      // all 3 have acted → resolve the trick
      S.phase = 'RESOLVE';
      render();
      setTimeout(() => {
        const proceedWithWinner = (winner) => {
          showWinnerBanner(winner, S.pendingActions);
          if (window.FTSfx) window.FTSfx.trickWin();
          setTimeout(() => {
            animateCollect(winner, () => {
              hideWinnerBanner();
              resolveTrick(winner);
              if (S.over) {
                S.phase = 'END';
                if (window.FTSfx) window.FTSfx.gameOver();
                render();
                return;
              }
              // next trick
              S.pendingActions = Array(NUM_PLAYERS).fill(null);
              S.animatedSeats.clear();
              S.revealedSeats.clear();
              // Winner of the trick leads the next one (You always start the
              // game's first trick — set at startGame).
              S.starter = winner;
              S.currentSeat = S.starter;
              S.phase = (S.currentSeat === 0) ? 'SELECT' : 'AI';
              // (auto-suggest disabled — user triggers it manually via the Suggest button)
              render();
              if (S.currentSeat !== 0) setTimeout(runAiTurn, AI_DELAY_MS);
            });
          }, 1500);
        };
        // Ties resolve via starter-priority inside computeTrickWinner.
        proceedWithWinner(computeTrickWinner());
      }, REVEAL_DELAY_MS);
      return;
    }
    // advance to next seat in turn order
    S.currentSeat = (S.currentSeat + 1) % NUM_PLAYERS;
    if (S.currentSeat === 0) {
      S.phase = 'SELECT';
      render();
    } else {
      S.phase = 'AI';
      render();
      setTimeout(runAiTurn, AI_DELAY_MS);
    }
  }

  function runAiTurn() {
    if (S.over) return;
    const seat = S.currentSeat;
    if (seat === 0) return; // safety
    const action = aiPickAction(seat, S.pendingActions);
    S.pendingActions[seat] = action;
    S.revealedSeats.add(seat);
    if (window.FTSfx) window.FTSfx.aiPlay();
    render();
    setTimeout(advanceTurn, REVEAL_DELAY_MS);
  }

  // ---- DOM ----
  let elOpp, elHand, elStatus, elTrick, elLog, elPlay, elNew, elFlash, elPreview, elScores, elClearSel;

  function flash(msg) {
    elFlash.textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { elFlash.textContent = ''; }, 2200);
  }

  function previewSelection() {
    const playCards = [...S.selPlay].map(i => S.players[0].hand[i]).filter(Boolean);
    const escape = (s) => String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
    if (!playCards.length) return '<span class="hand-bad">click cards to play</span>';
    const cls = classify(playCards);
    if (cls) {
      const label = TYPE_LABEL[cls.type];
      const cards = playCards.map(c => escape(cardLabel(c))).join(' ');
      return `<span class="hand-type">${escape(label)}</span><span class="hand-cards">${cards}</span>`;
    }
    const n = playCards.length;
    return `<span class="hand-bad">${n} card${n>1?'s':''} — not a legal hand</span>`;
  }

  function suitClassFor(c) {
    if (isWild(c)) return 'wild';
    return ['fish', 'fox', 'owl'][c.s];
  }

  function render() {
    // Scoreboard rows: name + primary stats (collected, tricks — the things
    // that drive final score) get gold emphasis via .sc-stat-pri; secondary
    // stats (hand, deck) stay in the quieter .sc-stat treatment.
    function scoreRowHtml(name, p, tricks) {
      return (
        `<span class="sc-name">${name}</span>` +
        `<span class="sc-stat-pri">Collected<b>${p.collected.length}</b></span>` +
        `<span class="sc-stat-pri">Tricks<b>${tricks}</b></span>` +
        `<span class="sc-stat">Hand<b>${p.hand.length}</b></span>` +
        `<span class="sc-stat">Deck<b>${p.draw.length}</b></span>`
      );
    }
    elOpp.innerHTML = '';
    for (let i = 1; i < NUM_PLAYERS; i++) {
      const p = S.players[i];
      const div = document.createElement('div');
      div.className = 'opp';
      div.innerHTML = scoreRowHtml(SEAT_NAMES[i], p, S.tricksWon[i]);
      elOpp.appendChild(div);
    }
    elScores.innerHTML = '';
    const me = S.players[0];
    const meRow = document.createElement('div');
    meRow.className = 'me-stats';
    meRow.innerHTML = scoreRowHtml('You', me, S.tricksWon[0]);
    elScores.appendChild(meRow);
    if (S.over && S.finalScores) {
      const final = document.createElement('div');
      final.className = 'final-board';
      const sorted = S.finalScores.slice().sort((a, b) => b.total - a.total);
      final.innerHTML = sorted.map(s => {
        const trophy = (s.seat === S.winner) ? ' 👑' : '';
        const bonusStr = s.bonus ? ` + ${s.bonus} first-out` : '';
        return `<div>${SEAT_NAMES[s.seat]}: ${s.collected} cards + ${s.tricks} tricks + ${s.wilds} wilds${bonusStr} = <b>${s.total}</b>${trophy}</div>`;
      }).join('');
      elScores.appendChild(final);
    }

    elTrick.innerHTML = '';
    // animation start offsets per seat (where cards translate FROM)
    const flyFrom = [
      { x: 0,    y: 380 },   // 0: You — from below (your hand)
      { x: -420, y: -80 },   // 1: Summer — upper-left
      { x: 420,  y: -80 }    // 2: Winter — upper-right
    ];
    // Visual seating: Summer (L), You (center), Winter (R). Turn-order logic
    // stays untouched — this only reorders the three .trick-slot columns so
    // the human card lands in the middle, framed by the two AIs.
    const DISPLAY_ORDER = [1, 0, 2];
    for (const i of DISPLAY_ORDER) {
      const slot = document.createElement('div');
      slot.className = 'trick-slot';
      if (S.lastTrickWinner === i && S.phase !== 'REVEAL') slot.classList.add('won-last');
      const lbl = document.createElement('div');
      lbl.className = 'trick-label';
      lbl.textContent = SEAT_NAMES[i];
      slot.appendChild(lbl);
      const body = document.createElement('div');
      body.className = 'trick-cards';
      const a = S.pendingActions[i];
      const shown = a && S.revealedSeats.has(i);
      if (shown) {
        const newlyRevealed = !S.animatedSeats.has(i);
        if (newlyRevealed) S.animatedSeats.add(i);
        a.play.cards.forEach((c, ci) => {
          const tc = document.createElement('div');
          tc.className = 'card trick-card ' + suitClassFor(c);
          if (isWild(c)) tc.dataset.wild = c.wild;
          const r = document.createElement('div');
          r.className = 'card-rank';
          r.textContent = cardRankText(c);
          tc.appendChild(r);
          if (newlyRevealed) {
            tc.classList.add('animate-in');
            tc.style.setProperty('--from-x', flyFrom[i].x + 'px');
            tc.style.setProperty('--from-y', flyFrom[i].y + 'px');
            tc.style.animationDelay = (ci * 0.08) + 's';
          }
          body.appendChild(tc);
        });
        slot.appendChild(body);
        const sub = document.createElement('div');
        sub.className = 'trick-sub';
        sub.textContent = TYPE_LABEL[a.play.type];
        slot.appendChild(sub);
      } else {
        body.textContent = '—';
        slot.appendChild(body);
      }
      elTrick.appendChild(slot);
    }

    elHand.innerHTML = '';
    const disabled = S.phase !== 'SELECT' || S.over || S.currentSeat !== 0;
    // sort order for display only — hand array stays canonical (so sel indices remain stable)
    const hand = S.players[0].hand;
    // Hide cards the human has already played this trick — they show in the
    // trick area instead. resolveTrick still filters them out of S.players[0].hand
    // at trick end, so this is a render-only exclusion.
    const pendingPlayIds = (S.pendingActions[0] && S.pendingActions[0].play)
      ? new Set(S.pendingActions[0].play.cards.map(cardId))
      : null;
    const order = hand.map((_, i) => i).filter(i => !pendingPlayIds || !pendingPlayIds.has(cardId(hand[i])));
    if (S.handSort === 'suit') {
      order.sort((a, b) => {
        const ca = hand[a], cb = hand[b];
        const ka = isWild(ca) ? 1000 + (ca.wild === 'bee' ? 0 : 1) : ca.s * 100 + ca.r;
        const kb = isWild(cb) ? 1000 + (cb.wild === 'bee' ? 0 : 1) : cb.s * 100 + cb.r;
        return ka - kb;
      });
    }
    order.forEach((idx) => {
      const c = hand[idx];
      const cardEl = document.createElement('div');
      cardEl.className = 'card ' + suitClassFor(c);
      if (isWild(c)) cardEl.dataset.wild = c.wild;
      const rnk = document.createElement('div');
      rnk.className = 'card-rank';
      rnk.textContent = cardRankText(c);
      cardEl.appendChild(rnk);
      // Suggestion vs. selection — same cards, distinct visual.
      if (S.selPlay.has(idx)) cardEl.classList.add(S.suggestionMode ? 'sugg-play' : 'sel-play');
      if (!disabled) {
        cardEl.style.cursor = 'pointer';
        cardEl.addEventListener('click', () => {
          // First user touch promotes the auto-suggestion into a real selection.
          if (S.suggestionMode) S.suggestionMode = false;
          const wasOn = S.selPlay.has(idx);
          if (wasOn) S.selPlay.delete(idx); else S.selPlay.add(idx);
          if (window.FTSfx) (wasOn ? window.FTSfx.select() : window.FTSfx.play());
          render();
        });
      }
      elHand.appendChild(cardEl);
    });

    if (S.over) {
      const winScore = S.finalScores ? S.finalScores[S.winner].total : '?';
      const outs = S.firstOuts || (S.firstOut != null ? [S.firstOut] : []);
      let outDesc;
      if (outs.length <= 1)      outDesc = `${SEAT_NAMES[outs[0]]} emptied their deck first`;
      else if (outs.length === 2) outDesc = `${SEAT_NAMES[outs[0]]} and ${SEAT_NAMES[outs[1]]} emptied together`;
      else                        outDesc = 'all three emptied at once';
      elStatus.textContent = `Game over — ${outDesc}; ${SEAT_NAMES[S.winner]} wins with ${winScore} cards.`;
      elPreview.textContent = '';
    } else if (S.phase === 'SELECT') {
      let note;
      if (S.currentSeat === S.starter) {
        note = ' — you lead this trick';
      } else {
        const top = bestPriorPlay();
        if (top && canBeat(S.players[0].hand, top)) {
          note = ' — you must beat the table';
        } else if (top) {
          note = " — can't beat; play anything legal";
        } else {
          note = '';
        }
      }
      const tail = S.suggestionMode ? ' (suggestion shown — adjust, or press Play turn to accept)' : '';
      elStatus.textContent = `Your turn${note}.${tail}`;
      elPreview.innerHTML = previewSelection();
    } else if (S.phase === 'AI') {
      elStatus.textContent = `${SEAT_NAMES[S.currentSeat]} is thinking…`;
      elPreview.textContent = '';
    } else if (S.phase === 'RESOLVE') {
      elStatus.textContent = 'All plays in — resolving the trick…';
      elPreview.textContent = '';
    } else if (S.phase === 'BETTING') {
      elStatus.textContent = 'Place your bet to begin.';
      elPreview.textContent = '';
    } else {
      elPreview.textContent = '';
    }
    updateBetPanel();
    elPlay.disabled = S.over || S.phase !== 'SELECT' || S.currentSeat !== 0;
    elClearSel.disabled = elPlay.disabled || S.selPlay.size === 0;
    const elSuggest2 = document.getElementById('btn-suggest');
    if (elSuggest2) {
      const sc = suggestionCost();
      elSuggest2.textContent = sc > 0 ? `Suggest (−${sc})` : 'Suggest';
      const cannotAfford = sc > 0 && window.Wallet && window.Wallet.getBalance() < sc;
      elSuggest2.disabled = elPlay.disabled || cannotAfford;
      elSuggest2.title = sc > 0 ? `Costs ${sc} coins (5% of your ${S.currentBet}-coin wager)` : 'Suggest a play';
    }

    elLog.innerHTML = '';
    S.log.slice(-10).forEach(line => {
      const d = document.createElement('div');
      d.textContent = line;
      elLog.appendChild(d);
    });
  }

  function init() {
    elOpp = document.getElementById('opp');
    elHand = document.getElementById('hand');
    elStatus = document.getElementById('status');
    elTrick = document.getElementById('trick');
    elLog = document.getElementById('log');
    elPlay = document.getElementById('btn-play');
    elNew = document.getElementById('btn-new');
    elFlash = document.getElementById('flash');
    elPreview = document.getElementById('preview');
    elScores = document.getElementById('scores');
    elClearSel = document.getElementById('btn-clear');

    elPlay.addEventListener('click', submitHumanAction);
    elNew.addEventListener('click', () => {
      if (window.FTSfx) window.FTSfx.button();
      resetToBettingPhase();
      render();
    });
    const elBet = document.getElementById('btn-bet');
    if (elBet) elBet.addEventListener('click', placeBet);
    const betAmt = document.getElementById('bet-amount');
    if (betAmt) {
      // Keep the payout preview in sync as the user types.
      betAmt.addEventListener('input', () => updateBetPanel());
      betAmt.addEventListener('keydown', (e) => { if (e.key === 'Enter') placeBet(); });
    }
    // Refresh the panel whenever the wallet changes elsewhere on the page.
    if (window.Wallet && window.Wallet.onChange) window.Wallet.onChange(() => updateBetPanel());
    const elMute = document.getElementById('btn-mute');
    if (elMute) {
      elMute.addEventListener('click', () => {
        if (!window.FTSfx) return;
        const nowMuted = !window.FTSfx.isMuted();
        window.FTSfx.setMuted(nowMuted);
        elMute.textContent = nowMuted ? '🔇 Muted' : '🔊 Sound';
        if (!nowMuted) window.FTSfx.button();
      });
    }
    elClearSel.addEventListener('click', () => {
      if (window.FTSfx) window.FTSfx.button();
      S.selPlay.clear(); S.suggestionMode = false; render();
    });
    const elSuggest = document.getElementById('btn-suggest');
    if (elSuggest) {
      elSuggest.addEventListener('click', () => {
        if (S.phase !== 'SELECT' || S.over || S.currentSeat !== 0) return;
        // Suggestion fee: 5% of the current wager (min 1 coin, rounded up).
        const cost = suggestionCost();
        if (cost > 0) {
          if (!window.Wallet || window.Wallet.getBalance() < cost) {
            if (window.FTSfx) window.FTSfx.deny();
            flash(`Suggestion costs ${cost} — not enough coins.`);
            return;
          }
          if (!window.Wallet.spend(cost)) {
            if (window.FTSfx) window.FTSfx.deny();
            flash('Suggestion fee failed.');
            return;
          }
          S.log.push(`Consulted the wood — paid ${cost} coin${cost === 1 ? '' : 's'} for a suggestion.`);
        }
        if (window.FTSfx) window.FTSfx.button();
        // wipe any prior selection so the suggestion populates cleanly
        S.selPlay.clear();
        autoSuggestForHuman();
        render();
      });
    }
    document.getElementById('sort-rank').addEventListener('click', () => {
      S.handSort = 'rank';
      document.getElementById('sort-rank').classList.add('active');
      document.getElementById('sort-suit').classList.remove('active');
      render();
    });
    document.getElementById('sort-suit').addEventListener('click', () => {
      S.handSort = 'suit';
      document.getElementById('sort-suit').classList.add('active');
      document.getElementById('sort-rank').classList.remove('active');
      render();
    });

    // Don't deal until the player places a wager.
    resetToBettingPhase();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
