/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/AI — strong heads-up Hold'em opponent (range + dossier)      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.BFAI = { decide, observe, mcEquity,    │
  │                                            dumpDossier }                 │
  │                                                                          │
  │   Three pillars (see plan):                                              │
  │     1. FOLD GUARD     — boss never folds themselves to the felt          │
  │     2. CHALLENGE      — probe bets, squeezes, polarized rivers           │
  │     3. SHARED DOSSIER — persisted player profile across all bosses       │
  │                                                                          │
  │   Layers:                                                                │
  │     A. 169-hand strength table (computed at load, normalized 0–100)      │
  │     B. Push/fold percentile tables by stack depth (≤15 BB)               │
  │     C. Preflop opening / defending ranges by situation                   │
  │     D. Postflop range tracker (weighted Map<classKey, weight>)           │
  │     E. Equity vs range (Monte Carlo, 200 iters)                          │
  │     F. Postflop decision bands + shove triggers                          │
  │     G. Challenge profile (probe / squeeze / polarized rivers / 3-bet     │
  │        light) — applies on top of the band decision                      │
  │     H. Shared dossier (localStorage key wendys_palace_player_poker_      │
  │        dossier) — read at hand start, updated in observe()               │
  │     I. No-fold guard — last override before any fold                     │
  │                                                                          │
  │   Personality (window.BossConfig.aiStyle, defaults 1.0):                 │
  │     aggression — sizing + push frequency multiplier                      │
  │     tightness  — narrows preflop opening / call ranges                   │
  │     bluffFreq  — bluff bet/raise multiplier                              │
  │     loose      — calling-frequency multiplier                            │
  │     mixedness  — ±randomness on equity thresholds                        │
  │                                                                          │
  │   Public API:                                                            │
  │     decide(state)   → {action, amount?} — always legal                   │
  │     observe(state, who, action, amount, prevStreet)                      │
  │     mcEquity(hole, board, iters) → float ∈[0,1] (uniform-range wrapper)  │
  │     dumpDossier()   → console.log current dossier (debug aid)            │
  │                                                                          │
  │   External deps: window.BFHoldem (legalActions, blindsFor, newDeck,      │
  │     shuffle, evalBest, compare)                                          │
  │   Consumers: js/bossfight/page.js                                        │
  │   Persists:  wendys_palace_player_poker_dossier (object)                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  H=BFHoldem
  STRENGTH: 169-hand map keyed AA/AKs/T9o/etc → 0..100. Computed at load
    via score=hi*4+lo*1.5 + pair?(25+hi*2) + connector_adj + suited?+8 + ace?+5,
    normalized linearly so max(raw)→100. SORTED=descending list.
  topPercentRange(pct)→Set<classKey>: SORTED[0 .. ceil(169*pct)]
  PUSH_TABLE/CALL_TABLE: depth bb → push/call percentile (1.0 = ATC, 0.18 = 18%)
  PREFLOP_RANGES: { btnOpen:0.75, btnVsLimp:0.50, bbVsLimp:0.35, bbVsMinraise:{def:0.65,r3b:0.18}, … }
  preflopSituation(state): returns 'btnOpen'|'bbVsLimp'|'bbVsMinraise'|'bbVs3x'|'bbVs4x'|'btnVs3bet'
  villainRange: { classKey: weight } - reset on new hand, init from preflopSituation
  freshRange(pct,extra=0.05): top pct=1.0, rest=extra (so rare slowplays sampled)
  mutate functions: narrow on raise (×0.15 weak), widen on call (×1.2 medium),
    polarize on jam (only nuts+air), per board-connection tag
  connectsToBoard(class, board) → 'strong'|'medium'|'weak'
  equityVsRange(myHole, board, range, iters=200): sample weighted, fill board, evalBest
  mcEquity(hole,board,iters): wraps equityVsRange with uniform range (back-compat)
  sizeFor(kind, pot, la, agg): factor table {small:.33,medium:.66,big:1.0,shove:Inf}
  spr(state): chavezChips / max(1, state.pot)
  DOSSIER persisted at wendys_palace_player_poker_dossier:
    {vpip,pfr,aggPost,cBetFreq,foldToCBet,bluffRiverFreq,jamFreq,foldToJam,handsSeen}
    EMA update: stat = stat*0.92 + sample*0.08; only exploit when handsSeen≥12
  handContrib: {voluntary,raised,cBetSpot,cBetHit,cBetFold,etc.} - flushed per hand
  applyDossierAdjustments(thresholds, dossier): nudge equityFloor / bluffFreq based on reads
  mustNotFold(state, la, eq): the fold guard - returns true if call/jam mandatory
  challengeAction(state, la, eq, dossier): returns override {action,amount} for probe/squeeze/polarize, or null
  decidePreflop(state, la, style, dossier): shortStack→pushFold; deep→range play; 3-bet light by dossier
  decidePostflop(state, la, style, dossier): equity vs range → band; shoveCheck; challengeAction overlay; no-fold guard last
  decide(state): la; ensureHandFresh (reset range, contrib); style; dispatch
  observe(state, who, action, amount, prevStreet): track range mutate (player only) + dossier contrib + hand-end commits
  ensureHandFresh: new hand → flush dossier contrib + reset range from situation
  exports: global.BFAI={decide,observe,mcEquity,dumpDossier}
*/

(function (global) {
  const H = global.BFHoldem;

  // ───────────────────── A. Strength table (169 hands) ─────────────────────

  function rankLabel(r) {
    if (r === 14) return 'A';
    if (r === 13) return 'K';
    if (r === 12) return 'Q';
    if (r === 11) return 'J';
    if (r === 10) return 'T';
    return String(r);
  }
  function classKey(hole) {
    const a = hole[0], b = hole[1];
    const hi = Math.max(a.rank, b.rank);
    const lo = Math.min(a.rank, b.rank);
    if (hi === lo) return rankLabel(hi) + rankLabel(hi);
    return rankLabel(hi) + rankLabel(lo) + (a.suit === b.suit ? 's' : 'o');
  }

  // Raw score formula — weights heads-up reality: pairs strong, aces strong,
  // suited + connectors get meaningful bonuses, big gaps hurt.
  function rawScore(hi, lo, suited) {
    let s = hi * 4 + lo * 1.5;
    if (hi === lo) {
      s += 25 + hi * 2;            // pair bonus scales with rank
    } else {
      const gap = hi - lo - 1;
      if (gap === 0)      s += 6;  // connector
      else if (gap === 1) s += 3;  // 1-gapper
      else if (gap === 2) s -= 1;
      else if (gap === 3) s -= 4;
      else                s -= 7;
      if (suited)         s += 8;
      if (hi === 14)      s += 5;  // ace blocker bonus
    }
    return s;
  }

  const HAND_CLASSES = {};   // key → { hi, lo, suited, pair, strength (0..100) }
  const SORTED_KEYS = [];    // descending by strength

  (function buildStrengthTable() {
    let maxRaw = -Infinity, minRaw = Infinity;
    const raw = {};
    for (let hi = 14; hi >= 2; hi--) {
      for (let lo = 2; lo <= hi; lo++) {
        if (hi === lo) {
          const key = rankLabel(hi) + rankLabel(hi);
          const r = rawScore(hi, lo, false);
          raw[key] = { hi, lo, pair: true, suited: false, r };
          if (r > maxRaw) maxRaw = r;
          if (r < minRaw) minRaw = r;
        } else {
          const sKey = rankLabel(hi) + rankLabel(lo) + 's';
          const oKey = rankLabel(hi) + rankLabel(lo) + 'o';
          const rs = rawScore(hi, lo, true);
          const ro = rawScore(hi, lo, false);
          raw[sKey] = { hi, lo, pair: false, suited: true,  r: rs };
          raw[oKey] = { hi, lo, pair: false, suited: false, r: ro };
          if (rs > maxRaw) maxRaw = rs;
          if (ro > maxRaw) maxRaw = ro;
          if (rs < minRaw) minRaw = rs;
          if (ro < minRaw) minRaw = ro;
        }
      }
    }
    const span = Math.max(1, maxRaw - minRaw);
    for (const k in raw) {
      const o = raw[k];
      const strength = Math.round(((o.r - minRaw) / span) * 100);
      HAND_CLASSES[k] = {
        hi: o.hi, lo: o.lo, pair: o.pair, suited: o.suited, strength,
      };
      SORTED_KEYS.push({ key: k, strength });
    }
    SORTED_KEYS.sort((a, b) => b.strength - a.strength);
  })();

  function strengthOf(hole) {
    const k = classKey(hole);
    const c = HAND_CLASSES[k];
    return c ? c.strength : 0;
  }

  // Top-percentile range (1.0 = all 169, 0.18 = top ~30 hands)
  function topPercentRange(pct) {
    const n = Math.max(1, Math.ceil(SORTED_KEYS.length * pct));
    const set = new Set();
    for (let i = 0; i < n; i++) set.add(SORTED_KEYS[i].key);
    return set;
  }

  // ───────────────────── B. Push/fold tables ─────────────────────
  //
  // Heads-up push/fold is near-solved. Tables below are derived from
  // standard HU Nash equilibrium ranges, rounded to coarse percentiles.

  function pushPercentForDepth(bb) {
    if (bb <= 3)  return 1.00;   // any two cards
    if (bb <= 6)  return 0.80;   // was 0.65 — punt more often
    if (bb <= 10) return 0.55;   // was 0.45
    if (bb <= 15) return 0.36;   // was 0.28
    return 0;
  }
  function callPercentForDepth(bb) {
    if (bb <= 3)  return 0.80;
    if (bb <= 6)  return 0.58;
    if (bb <= 10) return 0.38;
    if (bb <= 15) return 0.24;
    return 0;
  }

  // ───────────────────── C. Preflop range pcts ─────────────────────

  // Aggressive heads-up baseline. These ranges open / defend wide so the
  // boss is constantly putting chips in the pot. Defend ranges include
  // 3-bet light percentages that the dossier widens further when the
  // player shows fold-to-3bet tendency.
  const PREFLOP_PCTS = {
    btnOpen:        0.92,    // open damn near everything
    btnVsLimp:      0.70,
    bbVsLimp:       0.62,    // attack limps hard — iso big
    bbVsMinraise:   { defend: 0.78, threeBet: 0.28 },
    bbVs3x:         { defend: 0.65, threeBet: 0.22 },
    bbVs4xPlus:     { defend: 0.48, threeBet: 0.15 },
    btnVs3bet:      { call:   0.38, fourBet:  0.14 },
  };

  function preflopSituation(state, la) {
    const bb = H.blindsFor(state.handNumber).bb;
    const oppBet = la.who === 'player' ? state.chavezBet : state.playerBet;
    const myBet  = la.who === 'player' ? state.playerBet : state.chavezBet;
    void myBet;
    const buttonIsMe = !state.buttonOnPlayer; // chavez is button when player isn't
    const toCall = la.toCall;
    // Open (no action yet — only SB blind in or only one BB equivalent)
    if (buttonIsMe && toCall <= 0) return 'btnOpen';
    if (buttonIsMe && toCall > 0)  return 'btnVs3bet';   // BB raised back
    // Big blind decisions
    if (!buttonIsMe) {
      if (toCall === 0)            return 'bbVsLimp';    // SB just limped in
      const sizeBB = oppBet / Math.max(1, bb);
      if (sizeBB <= 2.2)           return 'bbVsMinraise';
      if (sizeBB <= 3.5)           return 'bbVs3x';
      return                              'bbVs4xPlus';
    }
    return 'btnOpen';
  }

  // ───────────────────── D. Range tracker ─────────────────────

  let villainRange = null;     // { classKey: weight }
  let villainPctSnapshot = 1.0; // last-known range size, used for sizing reads

  function freshRange(pct, baseline) {
    const top = topPercentRange(pct);
    const r = {};
    const wIn  = 1.0;
    const wOut = baseline == null ? 0.05 : baseline;
    for (const k in HAND_CLASSES) r[k] = top.has(k) ? wIn : wOut;
    return r;
  }
  function normalizeRange(r) {
    let total = 0;
    for (const k in r) total += r[k];
    if (total <= 0) return;
    for (const k in r) r[k] /= total;
  }

  function connectsToBoard(c, board) {
    if (!board || board.length === 0) return 'medium';
    const bRanks = board.map(x => x.rank);
    const maxB = Math.max.apply(null, bRanks);
    const minB = Math.min.apply(null, bRanks);
    if (c.pair) {
      if (bRanks.indexOf(c.hi) >= 0) return 'strong';     // set
      if (c.hi > maxB) return 'medium';                    // overpair
      return 'weak';                                       // underpair
    }
    // Non-pair
    if (bRanks.indexOf(c.hi) >= 0 || bRanks.indexOf(c.lo) >= 0) return 'strong'; // pair the board
    if (c.hi > maxB) return 'medium';                                            // overcards
    if (c.hi >= minB) return 'weak';
    return 'weak';
  }

  // Bet/raise mutators now take betFrac = amount / (pot after the bet),
  // i.e. how big the bet was relative to the pot it created. Small bets
  // (≤0.35 pot) keep the range wide — could be a probe with anything;
  // big bets (≥0.7 pot) polarize hard toward value + air. Texture also
  // shifts weights: paired boards = trips much more likely; wet boards
  // (monotone/connected) = draws weighted up.
  function sizingTier(betFrac) {
    if (betFrac == null)        return 'medium';
    if (betFrac <= 0.35)        return 'small';
    if (betFrac >= 0.70)        return 'big';
    return                            'medium';
  }
  function textureBias(c, board, tex) {
    // Returns a multiplier on the existing connection weight, accounting
    // for hand–texture interactions the bet sizing tier didn't capture.
    if (!tex || !board || board.length === 0) return 1.0;
    let bias = 1.0;
    if (tex.paired) {
      // Paired board — trips much more likely if villain bets big; under-
      // pairs less likely (board pair dominates).
      if (c.pair && board.some(b => b.rank === c.hi)) bias *= 1.6; // set on paired
      if (!c.pair && board.some(b => b.rank === c.hi || b.rank === c.lo)) bias *= 1.25;
    }
    if (tex.monotone || tex.twoTone) {
      // Flush(draw) heavy — suited hands more likely; offsuit broadways less
      if (c.suited) bias *= 1.20;
    }
    if (tex.connected && !c.pair) {
      // Connected board → straight(draw) possible; connectors more likely
      const gap = c.hi - c.lo;
      if (gap >= 1 && gap <= 2) bias *= 1.15;
    }
    return bias;
  }
  function mutateForBet(range, board, betFrac) {
    const tier = sizingTier(betFrac);
    const tex = boardTexture(board);
    // Per-tier weights — small bet wide, big bet polar
    const wStrong = tier === 'big' ? 1.8 : tier === 'small' ? 1.20 : 1.50;
    const wMed    = tier === 'big' ? 0.45 : tier === 'small' ? 1.05 : 0.95;
    const wWeak   = tier === 'big' ? 0.22 : tier === 'small' ? 0.55 : 0.30;
    for (const k in range) {
      const c = HAND_CLASSES[k];
      const conn = connectsToBoard(c, board);
      let m;
      if      (conn === 'strong') m = wStrong;
      else if (conn === 'medium') m = wMed;
      else                         m = wWeak;
      m *= textureBias(c, board, tex);
      range[k] *= m;
    }
    normalizeRange(range);
  }
  function mutateForRaise(range, board, betFrac) {
    // Raises are stronger than bets — narrow further across the board,
    // but still respect the sizing tell (min-raise ≠ pot-raise).
    const tier = sizingTier(betFrac);
    const tex = boardTexture(board);
    const wStrong = tier === 'big' ? 2.6 : tier === 'small' ? 1.7 : 2.2;
    const wMed    = tier === 'big' ? 0.30 : tier === 'small' ? 0.60 : 0.45;
    const wWeak   = tier === 'big' ? 0.12 : tier === 'small' ? 0.30 : 0.20;
    for (const k in range) {
      const c = HAND_CLASSES[k];
      const conn = connectsToBoard(c, board);
      let m;
      if      (conn === 'strong') m = wStrong;
      else if (conn === 'medium') m = wMed;
      else                         m = wWeak;
      m *= textureBias(c, board, tex);
      range[k] *= m;
    }
    normalizeRange(range);
  }
  function mutateForCall(range, board) {
    for (const k in range) {
      const c = HAND_CLASSES[k];
      const conn = connectsToBoard(c, board);
      if      (conn === 'strong') range[k] *= 1.0;   // some slowplays
      else if (conn === 'medium') range[k] *= 1.25;  // marginal calls / draws
      else                         range[k] *= 0.40;
    }
    normalizeRange(range);
  }
  function mutateForCheck(range, board) {
    for (const k in range) {
      const c = HAND_CLASSES[k];
      const conn = connectsToBoard(c, board);
      if      (conn === 'strong') range[k] *= 0.55;
      else if (conn === 'medium') range[k] *= 1.0;
      else                         range[k] *= 0.95;
    }
    normalizeRange(range);
  }
  function mutateForJam(range, board) {
    // Polarize: keep nuts + air, kill medium hands
    for (const k in range) {
      const c = HAND_CLASSES[k];
      const conn = connectsToBoard(c, board);
      if      (conn === 'strong') range[k] *= 2.5;
      else if (conn === 'medium') range[k] *= 0.20;
      else                         range[k] *= 0.85;   // some bluffs
    }
    normalizeRange(range);
  }
  function mutateForPreflopRaise(range, sizeBB) {
    // Sharper narrowing on bigger sizes
    const cutPct = sizeBB > 4 ? 0.14 : (sizeBB > 2.5 ? 0.28 : 0.55);
    const keepers = topPercentRange(cutPct);
    for (const k in range) {
      if (!keepers.has(k)) range[k] *= 0.10;
    }
    normalizeRange(range);
  }

  // ───────────────────── E. Equity vs range ─────────────────────

  const SUITS = ['S', 'H', 'D', 'C'];

  function shuffleInPlace(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function expandClass(key, knownSet) {
    const c = HAND_CLASSES[key];
    if (!c) return null;
    if (c.pair) {
      const avail = [];
      for (let i = 0; i < SUITS.length; i++) {
        if (!knownSet.has(c.hi + ':' + SUITS[i])) avail.push(SUITS[i]);
      }
      if (avail.length < 2) return null;
      shuffleInPlace(avail);
      return [
        { rank: c.hi, suit: avail[0] },
        { rank: c.hi, suit: avail[1] },
      ];
    }
    if (c.suited) {
      const order = shuffleInPlace(SUITS.slice());
      for (let i = 0; i < order.length; i++) {
        const s = order[i];
        if (!knownSet.has(c.hi + ':' + s) && !knownSet.has(c.lo + ':' + s)) {
          return [
            { rank: c.hi, suit: s },
            { rank: c.lo, suit: s },
          ];
        }
      }
      return null;
    }
    // Offsuit
    const order = shuffleInPlace(SUITS.slice());
    for (let i = 0; i < order.length; i++) {
      const s1 = order[i];
      if (knownSet.has(c.hi + ':' + s1)) continue;
      for (let j = 0; j < SUITS.length; j++) {
        const s2 = SUITS[j];
        if (s2 === s1) continue;
        if (!knownSet.has(c.lo + ':' + s2)) {
          return [
            { rank: c.hi, suit: s1 },
            { rank: c.lo, suit: s2 },
          ];
        }
      }
    }
    return null;
  }

  function sampleHandFromRange(range, knownSet) {
    let total = 0;
    for (const k in range) total += range[k];
    if (total <= 0) return null;
    let pick = Math.random() * total;
    let chosen = null;
    for (const k in range) {
      pick -= range[k];
      if (pick <= 0) { chosen = k; break; }
    }
    if (!chosen) {
      for (const k in range) chosen = k;
    }
    return expandClass(chosen, knownSet);
  }

  function equityVsRange(myHole, board, range, iters) {
    iters = iters || 200;
    const known = myHole.concat(board);
    const knownSet = new Set();
    for (let i = 0; i < known.length; i++) {
      knownSet.add(known[i].rank + ':' + known[i].suit);
    }
    let wins = 0, ties = 0, valid = 0;
    for (let i = 0; i < iters; i++) {
      const opp = sampleHandFromRange(range, knownSet);
      if (!opp) continue;
      const used = new Set(knownSet);
      used.add(opp[0].rank + ':' + opp[0].suit);
      used.add(opp[1].rank + ':' + opp[1].suit);
      const fresh = H.newDeck().filter(c => !used.has(c.rank + ':' + c.suit));
      H.shuffle(fresh);
      const need = 5 - board.length;
      const fullBoard = board.concat(fresh.slice(0, need));
      const me = H.evalBest(myHole.concat(fullBoard));
      const them = H.evalBest(opp.concat(fullBoard));
      const cmp = H.compare(me, them);
      if (cmp > 0) wins++;
      else if (cmp === 0) ties++;
      valid++;
    }
    return valid === 0 ? 0.5 : (wins + ties / 2) / valid;
  }

  // Uniform-range wrapper — preserves public API for legacy callers.
  let UNIFORM_RANGE = null;
  function mcEquity(hole, board, iters) {
    if (!UNIFORM_RANGE) UNIFORM_RANGE = freshRange(1.0, 1.0);
    return equityVsRange(hole, board, UNIFORM_RANGE, iters || 200);
  }

  // ───────────────────── F. Board texture / SPR / sizing ─────────────────────

  function boardTexture(board) {
    if (!board || board.length === 0) {
      return { paired: false, monotone: false, twoTone: false,
               connected: false, highHand: 'middle' };
    }
    const ranks = board.map(c => c.rank);
    const suitCounts = {};
    for (const c of board) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    let maxSuit = 0;
    for (const k in suitCounts) if (suitCounts[k] > maxSuit) maxSuit = suitCounts[k];
    const sortedR = ranks.slice().sort((a, b) => a - b);
    const maxR = sortedR[sortedR.length - 1];
    const paired = (new Set(ranks)).size < ranks.length;
    const monotone = maxSuit >= 3;
    const twoTone = !monotone && maxSuit === 2;
    const connected = sortedR.length >= 2 && (maxR - sortedR[0]) <= 4;
    const highHand = maxR >= 11 ? 'broadway' : maxR >= 8 ? 'middle' : 'low';
    return { paired, monotone, twoTone, connected, highHand };
  }

  function sprFor(state) {
    return state.chavezChips / Math.max(1, state.pot);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // kind: 'small'|'medium'|'big'|'over'|'shove'
  function sizeFor(kind, pot, la, agg) {
    if (kind === 'shove') {
      if (la.canRaise) return la.maxRaiseTo;
      if (la.canBet)   return la.maxBet;
      return 0;
    }
    let factor;
    if      (kind === 'small')  factor = 0.33;
    else if (kind === 'medium') factor = 0.66;
    else if (kind === 'big')    factor = 1.0;
    else if (kind === 'over')   factor = 1.35;   // polarized over-bet
    else                        factor = 0.5;
    factor *= agg;
    if (la.canRaise) {
      const oppBet = la.toCall || 0;
      const target = Math.ceil(oppBet + Math.max(pot, 1) * factor);
      return clamp(target, la.minRaiseTo, la.maxRaiseTo);
    }
    if (la.canBet) {
      const target = Math.ceil(Math.max(la.minBet, pot * factor));
      return clamp(target, la.minBet, la.maxBet);
    }
    return 0;
  }

  // ───────────────────── Personality ─────────────────────

  function getStyle() {
    const s = (global.BossConfig && global.BossConfig.aiStyle) || {};
    return {
      bluffFreq:  s.bluffFreq  == null ? 1.0 : s.bluffFreq,
      tightness:  s.tightness  == null ? 1.0 : s.tightness,
      aggression: s.aggression == null ? 1.0 : s.aggression,
      loose:      s.loose      == null ? 1.0 : s.loose,
      mixedness:  s.mixedness  == null ? 1.0 : s.mixedness,
    };
  }

  function bossSlug() {
    return (global.BossConfig && global.BossConfig.slug) || 'unknown';
  }
  // Per-boss fold-guard tightness — Chavez/Fortuna +5% to floors, Malech/Nahual -5%
  function guardFloorAdj() {
    const s = bossSlug();
    if (s === 'chavez' || s === 'fortuna') return  0.05;
    if (s === 'malechstone' || s === 'nahual') return -0.05;
    return 0;
  }

  // ───────────────────── H. Shared dossier (cross-boss localStorage) ─────────────────────

  const DOSSIER_KEY = 'wendys_palace_player_poker_dossier';
  const DOSSIER_DEFAULT = {
    vpip: 0.50, pfr: 0.25, aggPost: 1.00,
    cBetFreq: 0.65, foldToCBet: 0.40,
    bluffRiverFreq: 0.20,
    jamFreq: 0.05, foldToJam: 0.60,
    foldTo3Bet: 0.50,           // player folds to our preflop 3-bet
    foldToTurnBarrel: 0.45,     // player folds when we double-barrel turn
    handsSeen: 0,
  };
  const DOSSIER_ALPHA = 0.14;  // EMA learning rate — weight recent hands harder

  function loadDossier() {
    try {
      const raw = localStorage.getItem(DOSSIER_KEY);
      if (!raw) return Object.assign({}, DOSSIER_DEFAULT);
      const parsed = JSON.parse(raw);
      // Defensive merge with defaults so missing keys don't break things
      return Object.assign({}, DOSSIER_DEFAULT, parsed);
    } catch { return Object.assign({}, DOSSIER_DEFAULT); }
  }
  function saveDossier() {
    try { localStorage.setItem(DOSSIER_KEY, JSON.stringify(dossier)); } catch {}
  }
  function ema(prev, sample) {
    return prev * (1 - DOSSIER_ALPHA) + sample * DOSSIER_ALPHA;
  }

  let dossier = loadDossier();

  // Per-hand accumulator: what did the player do this hand, for EMA flush at hand-end.
  // Reset in ensureHandFresh.
  let handContrib = makeHandContrib();
  function makeHandContrib() {
    return {
      voluntaryPre: 0,   // 1 if player put money in pre voluntarily
      raisedPre:    0,   // 1 if player raised pre
      jams:         0,
      bettingActs:  0,   // bet/raise/call total (for jam frequency denom)
      facedJam:     0,   // 1 if player was ever faced with our jam this hand
      foldedToJam:  0,   // 1 if they folded to a jam this hand
      cBetSpot:     0,   // 1 if player had a c-bet opportunity (raised pre, flop)
      cBetTook:     0,   // 1 if they actually c-bet
      cBetFaced:    0,   // 1 if player faced a c-bet from us
      cBetFolded:   0,   // 1 if they folded to our c-bet
      riverBluffSpot: 0, // 1 if river action went check-check on flop+turn → river bet?
      riverBluffTook: 0,
      // New reads (set by tracking in observe + decision sites)
      threeBetFaced: 0,  // 1 if player faced our preflop 3-bet
      threeBetFolded: 0, // 1 if they folded to it
      turnBarrelFaced: 0,// 1 if player faced our turn double-barrel
      turnBarrelFolded: 0,
      postBets:     0,
      postCalls:    0,
    };
  }

  function flushHandContribToDossier() {
    if (handContrib.voluntaryPre || handContrib.raisedPre || handContrib.bettingActs) {
      dossier.handsSeen += 1;
    } else {
      // Player never acted — likely walked/folded blinds in. Don't bump.
      return;
    }
    dossier.vpip = ema(dossier.vpip, handContrib.voluntaryPre);
    dossier.pfr  = ema(dossier.pfr,  handContrib.raisedPre);
    if (handContrib.bettingActs > 0) {
      dossier.jamFreq = ema(dossier.jamFreq, handContrib.jams / handContrib.bettingActs);
    }
    if (handContrib.facedJam) {
      dossier.foldToJam = ema(dossier.foldToJam, handContrib.foldedToJam);
    }
    if (handContrib.cBetSpot) {
      dossier.cBetFreq = ema(dossier.cBetFreq, handContrib.cBetTook);
    }
    if (handContrib.cBetFaced) {
      dossier.foldToCBet = ema(dossier.foldToCBet, handContrib.cBetFolded);
    }
    if (handContrib.riverBluffSpot) {
      dossier.bluffRiverFreq = ema(dossier.bluffRiverFreq, handContrib.riverBluffTook);
    }
    if (handContrib.threeBetFaced) {
      dossier.foldTo3Bet = ema(dossier.foldTo3Bet, handContrib.threeBetFolded);
    }
    if (handContrib.turnBarrelFaced) {
      dossier.foldToTurnBarrel = ema(dossier.foldToTurnBarrel, handContrib.turnBarrelFolded);
    }
    if (handContrib.postCalls > 0 || handContrib.postBets > 0) {
      const sample = handContrib.postBets / Math.max(1, handContrib.postCalls);
      dossier.aggPost = ema(dossier.aggPost, Math.min(5, sample));
    }
    saveDossier();
  }

  // ───────────────────── Dossier-driven decision adjustments ─────────────────────
  //
  // Each adjuster returns deltas the decision layers fold into thresholds /
  // bluff frequencies. Only meaningful when dossier.handsSeen >= 12 (else
  // the sample is too small to exploit — return zeros).

  function dossierAdj(opts) {
    // opts: { facingBet, street }
    // Threshold lowered 12 → 6: start exploiting earlier. EMA α 0.14
    // means recent hands move stats fast, so 6 samples is meaningful.
    if (dossier.handsSeen < 6) {
      return {
        bluffMult: 1.0, callEqDelta: 0, valueEqDelta: 0,
        trapMore: false, threeBetLightBoost: 1.0,
      };
    }
    let bluffMult = 1.0, callEqDelta = 0, valueEqDelta = 0;
    let trapMore = false, threeBetLightBoost = 1.0;

    // Maniac read — high VPIP + high AGG (bluff-catch lighter, value thinner)
    if (dossier.vpip > 0.65 && dossier.aggPost > 1.5) {
      trapMore = true;
      callEqDelta -= 0.08;
      valueEqDelta -= 0.06;
    }
    // Nit read — low VPIP + low AGG (steal more)
    if (dossier.vpip < 0.35 && dossier.aggPost < 0.7) {
      bluffMult *= 1.8;
      threeBetLightBoost *= 1.6;
    }
    // Barreler who folds — high cBet + high foldToCBet
    if (dossier.cBetFreq > 0.75 && dossier.foldToCBet > 0.55) {
      bluffMult *= 1.3;
      callEqDelta -= 0.05;
    }
    // 3-bet folder — exploit hard with light 3-bets
    if (dossier.foldTo3Bet > 0.55) {
      threeBetLightBoost *= 1.8;
    }
    // Turn-barrel folder — exploit by double-barreling more (handled
    // explicitly in challengeOverride; also bump bluff mult globally)
    if (dossier.foldToTurnBarrel > 0.55) {
      bluffMult *= 1.25;
    }
    // River bluffer
    if (opts && opts.street === 'river' && dossier.bluffRiverFreq > 0.30) {
      callEqDelta -= 0.10;
    }
    // Ships-it
    if (dossier.jamFreq > 0.15) {
      callEqDelta -= 0.06;
    }
    // Jam-folder
    if (dossier.foldToJam > 0.70) {
      bluffMult *= 1.8;
    }

    return { bluffMult, callEqDelta, valueEqDelta, trapMore, threeBetLightBoost };
  }

  // ───────────────────── I. No-fold guard (the spine) ─────────────────────

  function mustNotFold(state, la, eq) {
    if (!la.canFold) return false;     // already not foldable — engine handles
    const myStack = state.chavezChips;
    const bb = H.blindsFor(state.handNumber).bb;
    const callAmount = la.callAmount;
    const adj = guardFloorAdj();       // per-boss tightness on the floor

    // Facing an all-in — NEVER fold. Closing the action goes to showdown;
    // folding here just gifts the pot. Checked BEFORE the "drawing dead"
    // escape because even a tiny equity is better than giving up chips
    // that are effectively already committed.
    const playerAllIn = state.playerChips <= 0;
    const allInToCall = callAmount > 0 && callAmount >= myStack;
    if (playerAllIn || allInToCall) return true;

    // Hopeless escape — even with commitment, never call when truly drawing
    // dead. Plugs a leak where the guard forced calls into 90/10 spots.
    // (Only applies when not facing an all-in — handled above.)
    if (eq < 0.12) return false;

    // Stack would fall below 2 BB on fold
    if (myStack < 2 * bb) return true;

    // Cheap bargain — never fold
    if (callAmount > 0
        && callAmount <= myStack * 0.18
        && eq >= 0.28 + adj) return true;

    // Pot-committed
    const myCommitted = state.chavezBet;
    if (myCommitted > myStack * 0.6 && eq >= 0.30 + adj) return true;

    // Player at ≤5 BB and boss covers — don't let them fold-out the finish
    if (state.playerChips <= 5 * bb
        && state.chavezChips > state.playerChips
        && callAmount <= state.chavezChips * 0.4) {
      return true;
    }
    return false;
  }

  // ───────────────────── G. Challenge profile ─────────────────────
  //
  // Returns { action, amount } override or null.

  let playerLimpedPre = false;

  function resetHandFlags() {
    playerLimpedPre = false;
  }

  function challengeOverride(state, la, eq, style, adj) {
    const street = state.street;
    const pot = state.pot;
    const toCall = la.toCall;
    const board = state.board || [];
    const aggBoost = style.aggression;

    // === Squeeze passivity ===
    // Player limped pre and now we're BB → iso-raise BIG. Limps get punished.
    if (street === 'preflop' && playerLimpedPre && toCall === 0
        && Math.random() < 0.88 * aggBoost) {
      const sized = sizeFor('big', pot, la, aggBoost);
      if (la.canBet || la.canRaise) {
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
    }

    // === Explicit flop c-bet ===
    // We were preflop aggressor, action checked to us on the flop. Bet with
    // wide range — sizing depends on board texture (dry = small, wet = big
    // for protection/polarization).
    if (street === 'flop' && toCall === 0 && !playerRaisedPre
        && (la.canBet || la.canRaise)) {
      const tex = boardTexture(board);
      const dry = !tex.monotone && !tex.connected && !tex.paired;
      // C-bet probability: dry boards almost always, wet boards selectively.
      // Bumped by foldToCBet read (already in adj indirectly via bluffMult,
      // but make explicit so dossier reads land on flop spots).
      const baseProb = dry ? 0.90 : 0.62;
      const probMult = dossier.handsSeen >= 6 && dossier.foldToCBet > 0.55 ? 1.15 : 1.0;
      if (eq > 0.32 || Math.random() < baseProb * style.bluffFreq * probMult * adj.bluffMult) {
        const kind = dry ? (eq > 0.55 ? 'medium' : 'small') : 'medium';
        const sized = sizeFor(kind, pot, la, aggBoost);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
    }

    // === Turn double-barrel ===
    // We c-bet flop, player called, we're checked-to on turn. Fire again
    // with most of our range — especially if dossier shows fold-to-turn.
    if (street === 'turn' && toCall === 0 && weCBetFlop && playerCalledOurCBet
        && (la.canBet || la.canRaise)) {
      const foldyTurn = dossier.handsSeen >= 6 && dossier.foldToTurnBarrel > 0.50;
      const baseProb = foldyTurn ? 0.85 : 0.65;
      if (eq > 0.38 || Math.random() < baseProb * style.bluffFreq * adj.bluffMult) {
        // Bigger barrel when player is fold-prone, medium otherwise
        const kind = foldyTurn ? 'big' : 'medium';
        const sized = sizeFor(kind, pot, la, aggBoost);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
    }

    // === Probe bets (any postflop street when checked to) ===
    // Probe more aggressively — the boss should not be passing up free
    // chances to take down the pot.
    if (toCall === 0 && street !== 'preflop'
        && eq > 0.18 && eq < 0.62
        && Math.random() < 0.75 * aggBoost && (la.canBet || la.canRaise)) {
      const sized = sizeFor('small', pot, la, aggBoost);
      return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
    }

    // === Polarized rivers ===
    // Bet bigger for value (over-bet polarized) and bluff more often than
    // the prior 38%. Rivers are where the boss extracts.
    if (street === 'river' && toCall === 0 && (la.canBet || la.canRaise)) {
      if (eq > 0.72) {
        // Strong value — over-bet for max extraction
        const sized = sizeFor('over', pot, la, aggBoost);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      if (eq > 0.55) {
        const sized = sizeFor('big', pot, la, aggBoost);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      // Bluff frequency cranked 38% → 55%, scaled by dossier reads
      if (eq < 0.32 && Math.random() < 0.55 * style.bluffFreq * adj.bluffMult) {
        // If player folds-to-jam well, polarize huge
        const huge = dossier.handsSeen >= 6 && dossier.foldToJam > 0.60;
        const sized = sizeFor(huge ? 'over' : 'big', pot, la, aggBoost);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
    }

    // === Stack-pressure jam ===
    // SPR < 1.8 and equity > 0.48 → jam instead of small sizes
    if (street !== 'preflop' && eq > 0.48) {
      const spr = sprFor(state);
      if (spr < 1.8 && (la.canBet || la.canRaise)) {
        return { action: la.canRaise ? 'raise' : 'bet',
                 amount: la.canRaise ? la.maxRaiseTo : la.maxBet };
      }
    }

    return null;
  }

  // ───────────────────── Decisions: preflop ─────────────────────

  function decidePreflop(state, la, style, adj) {
    const hole = state.chavezHole;
    const strength = strengthOf(hole);
    const cls = HAND_CLASSES[classKey(hole)];
    const bb = H.blindsFor(state.handNumber).bb;
    const myStack = state.chavezChips;
    const depth = myStack / Math.max(1, bb);
    const toCall = la.toCall;
    const pot = state.pot;
    const aggBoost = style.aggression;
    void cls;

    // === Push/fold zone (≤15 BB) ===
    if (depth <= 15) {
      if (toCall === 0) {
        // Open jam by push percentile (button or BB-with-check option)
        const pushPct = pushPercentForDepth(depth) / Math.max(0.5, style.tightness);
        const top = topPercentRange(pushPct);
        if (top.has(classKey(hole))) {
          if (la.canRaise) return { action: 'raise', amount: la.maxRaiseTo };
          if (la.canBet)   return { action: 'bet',   amount: la.maxBet };
        }
        if (la.canCheck) return { action: 'check' };
        return { action: 'fold' };
      } else {
        // Facing a bet — call-shove range
        const oppBet = la.who === 'chavez' ? state.playerBet : state.chavezBet;
        const oppDepthInBB = oppBet / Math.max(1, bb);
        // Combine: my own depth and the opp's pressure size
        const effectiveDepth = Math.min(depth, oppDepthInBB);
        const callPct = callPercentForDepth(effectiveDepth) * style.loose;
        const top = topPercentRange(callPct);
        // Re-raise jam with the strongest call-range hands
        if (top.has(classKey(hole)) && strength >= 70 && la.canRaise) {
          return { action: 'raise', amount: la.maxRaiseTo };
        }
        if (top.has(classKey(hole))) {
          if (la.canCall) return { action: 'call' };
        }
        // No-fold guard catches commit/cheap-call cases
        if (mustNotFold(state, la, 0.30)) {
          if (la.canCall) return { action: 'call' };
        }
        return { action: 'fold' };
      }
    }

    // === Deep (>15 BB) range play ===
    const situation = preflopSituation(state, la);

    if (situation === 'btnOpen') {
      const pct = (PREFLOP_PCTS.btnOpen) / Math.max(0.6, style.tightness);
      const top = topPercentRange(pct);
      if (top.has(classKey(hole))) {
        // Mix open size: premium → larger, others → 2.2x
        const kind = strength >= 80 ? 'medium' : 'small';
        const sized = sizeFor(kind, Math.max(pot, bb * 2), la, aggBoost);
        if (la.canRaise) return { action: 'raise', amount: sized };
        if (la.canBet)   return { action: 'bet',   amount: Math.max(sized, la.minBet) };
      }
      // Steal frequency — small open with trash (heads-up SB steals a LOT)
      if (Math.random() < 0.28 * style.bluffFreq && (la.canBet || la.canRaise)) {
        const sized = sizeFor('small', Math.max(pot, bb * 2), la, aggBoost);
        if (la.canRaise) return { action: 'raise', amount: sized };
        if (la.canBet)   return { action: 'bet',   amount: Math.max(sized, la.minBet) };
      }
      if (la.canCheck) return { action: 'check' };
      // Heads-up SB has to put a chip in if no other option
      if (la.canCall) return { action: 'call' };
      return { action: 'fold' };
    }

    if (situation === 'bbVsLimp') {
      // Player limped — we're BB, can check or iso-raise
      const pct = PREFLOP_PCTS.bbVsLimp / Math.max(0.6, style.tightness);
      const top = topPercentRange(pct);
      if (top.has(classKey(hole))) {
        const sized = sizeFor('medium', Math.max(pot, bb * 2), la, aggBoost);
        if (la.canRaise) return { action: 'raise', amount: sized };
        if (la.canBet)   return { action: 'bet',   amount: sized };
      }
      if (la.canCheck) return { action: 'check' };
      return { action: 'fold' };
    }

    if (situation === 'btnVsLimp') {
      const pct = PREFLOP_PCTS.btnVsLimp / Math.max(0.6, style.tightness);
      const top = topPercentRange(pct);
      if (top.has(classKey(hole))) {
        const sized = sizeFor('medium', Math.max(pot, bb * 2), la, aggBoost);
        if (la.canRaise) return { action: 'raise', amount: sized };
        if (la.canBet)   return { action: 'bet',   amount: sized };
      }
      if (la.canCheck) return { action: 'check' };
      if (la.canCall) return { action: 'call' };
      return { action: 'fold' };
    }

    // BB facing a raise OR btn facing 3-bet — defending logic
    let defendCfg;
    if      (situation === 'bbVsMinraise') defendCfg = PREFLOP_PCTS.bbVsMinraise;
    else if (situation === 'bbVs3x')       defendCfg = PREFLOP_PCTS.bbVs3x;
    else if (situation === 'bbVs4xPlus')   defendCfg = PREFLOP_PCTS.bbVs4xPlus;
    else                                   defendCfg = PREFLOP_PCTS.btnVs3bet;

    const defendPct = (defendCfg.defend || defendCfg.call) * style.loose / Math.max(0.6, style.tightness);
    const threeBetPct = (defendCfg.threeBet || defendCfg.fourBet) * adj.threeBetLightBoost;
    const callAmount = la.callAmount;
    const oddsReq = callAmount > 0 ? callAmount / Math.max(1, pot + callAmount) : 0;

    const threeBetTop = topPercentRange(threeBetPct);
    const defendTop = topPercentRange(defendPct);

    if (threeBetTop.has(classKey(hole)) && la.canRaise) {
      // Value or balanced 3-bet — bigger if premium, polar small if blocker/bluff
      const kind = strength >= 80 ? 'big' : 'medium';
      const sized = sizeFor(kind, pot, la, aggBoost);
      return { action: 'raise', amount: sized };
    }
    if (defendTop.has(classKey(hole))) {
      if (la.canCall && oddsReq < 0.42) return { action: 'call' };
      if (la.canCall && strength >= 60) return { action: 'call' };
    }
    if (mustNotFold(state, la, 0.30)) {
      if (la.canCall) return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // ───────────────────── Decisions: postflop ─────────────────────

  function decidePostflop(state, la, style, adj) {
    const hole = state.chavezHole;
    const board = state.board;
    const pot = state.pot;
    const myStack = state.chavezChips;
    const toCall = la.toCall;
    const callAmount = la.callAmount;
    const allInToCall = callAmount > 0 && callAmount === myStack;
    const oddsReq = callAmount > 0 ? callAmount / Math.max(1, pot + callAmount) : 0;

    if (!villainRange) villainRange = freshRange(1.0);
    const eq = equityVsRange(hole, board, villainRange, 400);
    const mix = (Math.random() - 0.5) * 0.06 * style.mixedness;
    const adjEq = eq + adj.valueEqDelta;     // shift bands for thin value when reads support it

    // Closing the action: opp jammed → ALWAYS call. Folding to an all-in
    // gifts the pot; even drawing dead, the showdown gamble is the right
    // line for a boss that's supposed to play the whole stack.
    if (allInToCall || (state.playerChips <= 0 && toCall > 0)) {
      if (la.canCall)  return { action: 'call' };
      if (la.canCheck) return { action: 'check' };
      return { action: 'fold' };  // defensive — should be unreachable
    }

    // Challenge profile first — may override the band
    const override = challengeOverride(state, la, eq, style, adj);
    if (override) {
      // Don't override a fold here; challenge only fires for action spots
      return override;
    }

    // Always-shove triggers
    if (eq > 0.80 && sprFor(state) < 2 && (la.canBet || la.canRaise)) {
      return { action: la.canRaise ? 'raise' : 'bet',
               amount: la.canRaise ? la.maxRaiseTo : la.maxBet };
    }

    // === Checked to ===
    if (toCall === 0) {
      // Trap-check on monster against suspected maniac
      if (adj.trapMore && adjEq > 0.78 && Math.random() < 0.45) {
        return { action: 'check' };
      }
      if (adjEq > 0.68 + mix && (la.canBet || la.canRaise)) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      if (adjEq > 0.52 + mix && (la.canBet || la.canRaise)) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      if (adjEq > 0.38 && (la.canBet || la.canRaise) && Math.random() < 0.55) {
        const sized = sizeFor('small', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      // Bluff bet — heads-up wants action, fire more than a tight game
      if (adjEq < 0.32
          && pot > 0
          && (la.canBet || la.canRaise)
          && Math.random() < 0.28 * style.bluffFreq * adj.bluffMult) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      return { action: 'check' };
    }

    // === Facing a bet ===
    if (adjEq > 0.80 + mix && la.canRaise) {
      // Shove if SPR low, else big raise
      if (sprFor(state) < 2) return { action: 'raise', amount: la.maxRaiseTo };
      const sized = sizeFor('big', pot, la, style.aggression);
      return { action: 'raise', amount: sized };
    }
    if (adjEq > 0.62 + mix && la.canRaise) {
      const sized = sizeFor('medium', pot, la, style.aggression);
      return { action: 'raise', amount: sized };
    }
    const callEq = eq + adj.callEqDelta;
    if (callEq > 0.48) return { action: 'call' };           // call wider
    if (callEq >= oddsReq + 0.03) return { action: 'call' };
    if (callEq >= oddsReq - 0.04 && callAmount < myStack * 0.25) return { action: 'call' };
    // Refuse to fold to small bets — heads-up small-bet folds bleed chips
    if (callAmount < myStack * 0.07 && callEq > 0.22) return { action: 'call' };

    // Bluff-catch on cheap rivers — fire more
    if (state.street === 'river'
        && callAmount < myStack * 0.12
        && Math.random() < 0.20 * style.bluffFreq * style.loose * adj.bluffMult) {
      return { action: 'call' };
    }

    // No-fold guard last
    if (mustNotFold(state, la, eq)) {
      if (la.canCall) return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // ───────────────────── Main entry + hand lifecycle ─────────────────────

  let lastHandNumber = -1;
  let lastObservedStreet = 'idle';
  // For dossier per-action tracking — last hand we flushed contrib for
  let lastFlushedHand = -1;
  // Track whether player has acted voluntarily this hand (for VPIP)
  let playerActedThisHand = false;
  let playerRaisedThisHand = false;
  // For c-bet detection — we need to remember if player raised pre
  let playerRaisedPre = false;
  // For river bluff detection: did the flop AND turn check through?
  let flopCheckedThrough = false;
  let turnCheckedThrough = false;
  // For new reads:
  let weThreeBetPre = false;       // we re-raised preflop after they raised
  let weCBetFlop = false;          // we bet/raised flop after being preflop aggressor
  let playerCalledOurCBet = false; // they called our flop c-bet → turn is barrel spot

  function ensureHandFresh(state) {
    if (state.handNumber !== lastHandNumber) {
      // Flush prior hand's contributions before reset
      if (lastFlushedHand !== lastHandNumber && lastHandNumber !== -1) {
        flushHandContribToDossier();
      }
      handContrib = makeHandContrib();
      lastFlushedHand = lastHandNumber;
      lastHandNumber = state.handNumber;
      lastObservedStreet = state.street;
      // Reset hand flags
      resetHandFlags();
      playerActedThisHand = false;
      playerRaisedThisHand = false;
      playerRaisedPre = false;
      flopCheckedThrough = false;
      turnCheckedThrough = false;
      weThreeBetPre = false;
      weCBetFlop = false;
      playerCalledOurCBet = false;
      // Reset range — will be re-initialized on first decide based on player's
      // first preflop action (in observe). Start uniform until we see them.
      villainRange = freshRange(1.0);
      villainPctSnapshot = 1.0;
    }
    if (state.street !== lastObservedStreet) {
      lastObservedStreet = state.street;
    }
  }

  function decide(state) {
    const la = H.legalActions(state);
    if (!la || la.who !== 'chavez') return { action: 'check' };
    ensureHandFresh(state);
    const style = getStyle();
    const adj = dossierAdj({
      facingBet: la.toCall > 0,
      street: state.street,
    });
    const raw = state.street === 'preflop'
      ? decidePreflop(state, la, style, adj)
      : decidePostflop(state, la, style, adj);
    return gateShove(state, la, raw);
  }

  // ──────────────── Shove gate (universal across all bosses) ────────────
  // Rule: the AI may only commit its full stack (bet/raise to maxBet /
  // maxRaiseTo) when one of these is true:
  //   • hand number ≥ 10              (late-game push/fold zone)
  //   • hole cards are pocket aces    (AA)
  //   • hole cards are AK suited      (AKs — Big Slick on the same suit)
  // Otherwise, the chosen aggressive sizing is capped at ~⅔ of the
  // effective stack so the AI keeps chips behind. This keeps early-game
  // pacing slower and prevents Chavez/Malechstone/etc. from jamming with
  // marginal holdings before the player has had a chance to settle in.
  function gateShove(state, la, dec) {
    if (!dec) return dec;
    if (dec.action !== 'bet' && dec.action !== 'raise') return dec;
    const amt = dec.amount | 0;
    const isShove = (dec.action === 'raise' && amt >= la.maxRaiseTo) ||
                    (dec.action === 'bet'   && amt >= la.maxBet);
    if (!isShove) return dec;

    // Allowed late-game
    if ((state.handNumber | 0) >= 10) return dec;

    // Allowed if AA or AKs
    const hole = state.chavezHole;
    if (hole && hole.length === 2) {
      const r1 = hole[0].rank, r2 = hole[1].rank;
      const s1 = hole[0].suit, s2 = hole[1].suit;
      if (r1 === 14 && r2 === 14) return dec;                          // AA
      const isAK = (r1 === 14 && r2 === 13) || (r1 === 13 && r2 === 14);
      if (isAK && s1 === s2) return dec;                               // AKs
    }

    // Downsize: aim for ~⅔ effective stack, clamped into the legal range
    // so the AI is still aggressive but keeps chips behind.
    if (dec.action === 'raise') {
      const cap = Math.max(la.minRaiseTo, Math.floor(la.maxRaiseTo * 0.66));
      return { action: 'raise', amount: Math.min(cap, la.maxRaiseTo - 1) };
    }
    // bet
    const cap = Math.max(la.minBet, Math.floor(la.maxBet * 0.66));
    return { action: 'bet', amount: Math.min(cap, la.maxBet - 1) };
  }

  // ───────────────────── Observer ─────────────────────

  function observe(state, who, action, amount, prevStreet) {
    ensureHandFresh(state);

    const bb = H.blindsFor(state.handNumber).bb;
    const street = prevStreet || state.street;
    const sizeBB = (amount || 0) / Math.max(1, bb);
    // betFrac = bet/raise amount relative to the pot it created. Used by
    // mutateForBet/Raise to scale how hard a sizing tell narrows the range.
    const betFrac = (action === 'bet' || action === 'raise')
      ? (amount || 0) / Math.max(1, state.pot)
      : null;

    if (who === 'player') {
      playerActedThisHand = true;

      // --- VPIP / PFR tracking ---
      if (street === 'preflop') {
        if (action === 'bet' || action === 'raise') {
          handContrib.voluntaryPre = 1;
          handContrib.raisedPre = 1;
          playerRaisedPre = true;
          playerRaisedThisHand = true;
        } else if (action === 'call') {
          handContrib.voluntaryPre = 1;
        }
        // Range narrowing: player raised pre → narrow our model of villain
        if (action === 'raise' || action === 'bet') {
          mutateForPreflopRaise(villainRange, sizeBB);
          villainPctSnapshot *= 0.4;
        } else if (action === 'call') {
          // Calling station — slight narrowing
          for (const k in villainRange) {
            const c = HAND_CLASSES[k];
            if (c.strength < 30) villainRange[k] *= 0.45;
          }
          normalizeRange(villainRange);
        }
        if (action === 'check' || action === 'call') {
          // Note limp for squeeze logic
          if (action === 'call' && sizeBB < 1.5) playerLimpedPre = true;
        }
      } else {
        // postflop
        if (action === 'bet' || action === 'raise') {
          handContrib.postBets += 1;
        } else if (action === 'call') {
          handContrib.postCalls += 1;
        }

        const board = state.board || [];
        // Mutate range based on player's postflop action
        const isJam = (state.playerChips === 0) || (sizeBB >= state.chavezChips / bb);
        if (isJam && (action === 'bet' || action === 'raise')) {
          mutateForJam(villainRange, board);
          handContrib.jams += 1;
          handContrib.bettingActs += 1;
        } else if (action === 'raise') {
          mutateForRaise(villainRange, board, betFrac);
          handContrib.bettingActs += 1;
        } else if (action === 'bet') {
          mutateForBet(villainRange, board, betFrac);
          handContrib.bettingActs += 1;
        } else if (action === 'call') {
          mutateForCall(villainRange, board);
          handContrib.bettingActs += 1;
        } else if (action === 'check') {
          mutateForCheck(villainRange, board);
        }

        // C-bet detection — player raised pre, now on flop, they bet
        if (street === 'flop' && playerRaisedPre) {
          // First flop action by player
          if (handContrib.cBetSpot === 0) {
            handContrib.cBetSpot = 1;
            if (action === 'bet' || action === 'raise') handContrib.cBetTook = 1;
          }
        }

        // Flop check-through tracking
        if (street === 'flop' && action === 'check') {
          // If both check, flop went check-through (will only know after opp acts too)
          flopCheckedThrough = true;
        }
        if (street === 'turn' && action === 'check') {
          turnCheckedThrough = true;
        }

        // River bluff frequency
        if (street === 'river' && flopCheckedThrough && turnCheckedThrough) {
          handContrib.riverBluffSpot = 1;
          if (action === 'bet' || action === 'raise') handContrib.riverBluffTook = 1;
        }
      }
    } else {
      // who === 'chavez' — our own action
      if (street === 'preflop' && (action === 'raise' || action === 'bet')) {
        // 3-bet detection: we raised after player put in a raise. Engine
        // sets toCall before our action — if player had already raised
        // pre, our raise is a 3-bet (or higher).
        if (playerRaisedPre) {
          weThreeBetPre = true;
          handContrib.threeBetFaced = 1;
        }
      }
      if (street === 'flop' && playerRaisedPre === false) {
        // We were the preflop aggressor (or both checked) — c-bet spot
        if (action === 'bet' || action === 'raise') {
          // We made a c-bet — note this so when player responds we can track foldToCBet
          handContrib.cBetFaced = 1;
          weCBetFlop = true;
        }
      }
      // Turn double-barrel: we c-bet flop, player called, now we bet turn
      if (street === 'turn' && weCBetFlop && playerCalledOurCBet
          && (action === 'bet' || action === 'raise')) {
        handContrib.turnBarrelFaced = 1;
      }
      // Was this a jam from us?
      const isOurJam = (action === 'raise' || action === 'bet') &&
        (state.chavezChips === 0);
      if (isOurJam) handContrib.facedJam = 1;
    }

    // Player's response to our flop c-bet
    if (who === 'player' && handContrib.cBetFaced && street === 'flop') {
      if (action === 'fold') handContrib.cBetFolded = 1;
      if (action === 'call') playerCalledOurCBet = true;
    }
    // Player's response to our preflop 3-bet
    if (who === 'player' && weThreeBetPre && street === 'preflop') {
      if (action === 'fold') handContrib.threeBetFolded = 1;
    }
    // Player's response to our turn double-barrel
    if (who === 'player' && handContrib.turnBarrelFaced && street === 'turn') {
      if (action === 'fold') handContrib.turnBarrelFolded = 1;
    }
    // Player's response to a jam
    if (who === 'player' && handContrib.facedJam) {
      if (action === 'fold') handContrib.foldedToJam = 1;
    }

    // Tally postflop check-through after action sequences
    // (handled above by booleans)

    // Hand-end detection: state.handResult is set → flush
    if (state.handResult && state.handNumber === lastHandNumber
        && lastFlushedHand !== state.handNumber) {
      flushHandContribToDossier();
      lastFlushedHand = state.handNumber;
    }
  }

  // ───────────────────── Public exports ─────────────────────

  function dumpDossier() {
    try { console.log('[BFAI dossier]', JSON.parse(JSON.stringify(dossier))); }
    catch { console.log('[BFAI dossier]', dossier); }
    return dossier;
  }

  global.BFAI = { decide, observe, mcEquity, dumpDossier };
})(window);
