/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/AI — heads-up Hold'em opponent (stack-tier strategy)         │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.BFAI = { decide, observe, mcEquity }    │
  │                                                                          │
  │   Previous design tracked villain ranges and routinely over-narrowed,    │
  │   so the boss would fold short-stacked instead of jamming for the win.   │
  │   This rewrite is decisive: STACK DEPTH dictates strategy, equity is     │
  │   measured by plain Monte Carlo against a random villain, and the boss   │
  │   has a hard rule that they NEVER fold themselves down to the felt —     │
  │   once the call price is small relative to their remaining stack OR a    │
  │   fold would leave them under 2 BB, they call or jam.                    │
  │                                                                          │
  │   Stack tiers (boss perspective, BB = current big-blind):                │
  │     DEEP      > 30 BB   — standard play, full betting tree               │
  │     SHORT     12-30 BB  — tighter opens, polarized 3-bets                │
  │     PUSHFOLD  4-12 BB   — preflop: jam top ~40% or fold; postflop: shove │
  │                            any pair / equity > 35%; never minraise       │
  │     DESPERATE < 4 BB    — preflop: jam ANY TWO; postflop: shove always   │
  │                                                                          │
  │   Personality (window.BossConfig.aiStyle, defaults 1.0):                 │
  │     aggression — sizing + bluff bet multiplier                          │
  │     tightness  — widens/narrows preflop jam ranges (>1 = tighter)        │
  │     bluffFreq  — bluff-bet / bluff-raise multiplier                      │
  │     loose      — calling-frequency multiplier (>1 = more calls)          │
  │     mixedness  — ±randomness on equity thresholds                        │
  │                                                                          │
  │   Public API:                                                            │
  │     decide(state)   → {action, amount?} — always legal                  │
  │     observe(s,...)  → updates simple aggression counter                  │
  │     mcEquity(hole,board,iters) → float ∈[0,1] — Monte Carlo vs random   │
  │                                                                          │
  │   External deps: window.BFHoldem (legalActions, blindsFor, newDeck,      │
  │     shuffle, evalBest, compare)                                          │
  │   Consumers: js/bossfight/page.js (Chavez), js/bossfight/page-generic.js │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  H=BFHoldem
  state: lastHandNumber, oppAggression (count of player bets/raises this hand, decayed each new street)
  ensureHandFresh(s): if handNumber!=last → reset oppAggression=0
  preflopScore(hole): pair? 2..14→{2:5,3:5,4:5,5:6,6:7,7:7,8:8,9:9,T:10,J:12,Q:13,K:15,A:18}; nonpair: hi base{14:9,13:7,12:6,11:5}|hi/2 + suited?+2 + gap_adj(0:+1,1:0,2:-1,3:-3,4:-5,≥5:-7) + connector_bonus(hi<12&&gap≤1?+1:0)
  preflopGroup(score): ≥15 premium, ≥10 strong, ≥6 decent, ≥3 marginal, else trash
  stackTier(myStack,bb): myStack/bb→ depth ≥30 DEEP / ≥12 SHORT / ≥4 PUSHFOLD / DESPERATE
  mcEquity(hole,board,iters=160): build deck minus known; iter: sample opp 2 + board fill from deck; eval both; return (wins+ties/2)/iters
  noFoldGuard(s,la): if !canFold → false; if afterFold I'd have <2BB → true; if callAmount < myStack*0.20 AND equity > 0.28 → true; else false
  size(kind,pot,la,agg,minBB): factor table {small:0.33, medium:0.66, big:1.0, shove:Infinity}; target=oppBet+pot*factor*agg; clamp to [minRaise|minBet, maxRaise|maxBet]; minBB floor for opens
  decide(state): la=legalActions; ensureHandFresh; style; tier=stackTier; preflop|postflop dispatch
  decidePreflop(s,la,style,tier): trash-cards = fold-when-cheap; tier=DESPERATE→any2 shove; tier=PUSHFOLD→score≥(8/tightness)?jam:fold-or-check; tier=SHORT|DEEP→ open by group thresholds; facing raise: premium→3bet; strong→call if priced; marginal→call if cheap & loose
  decidePostflop(s,la,style,tier): eq=mcEquity; tier=DESPERATE→ shove if eq>0.30 else check; tier=PUSHFOLD→ if toCall>0 call when eq>oddsReq-0.05 else fold (no fancy raises); else: facing bet→ pot-odds + commitment + equity bands; checked to→ value bet eq>0.62, protection bet eq>0.5 on draws, bluff sometimes
  observe(s,who,act,amt,prevStreet): who=player & act in (bet,raise) → oppAggression++
  exports: global.BFAI={decide,observe,mcEquity}
*/

(function (global) {
  const H = global.BFHoldem;

  // ──────────────────────── Module state ────────────────────────

  let lastHandNumber = -1;
  let oppAggression = 0;   // count of player bets/raises this hand
  let lastStreet = 'idle';

  function ensureHandFresh(s) {
    if (s.handNumber !== lastHandNumber) {
      oppAggression = 0;
      lastStreet = 'idle';
      lastHandNumber = s.handNumber;
    }
    if (s.street !== lastStreet) {
      // soft-decay on each new street — past aggression matters less as
      // new info arrives
      oppAggression = Math.floor(oppAggression / 2);
      lastStreet = s.street;
    }
  }

  // ──────────────────────── Personality ────────────────────────

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

  // ──────────────────────── Preflop scoring (Chen-ish) ────────────────────────

  const PAIR_VAL = {
    2: 5, 3: 5, 4: 5, 5: 6, 6: 7, 7: 7, 8: 8, 9: 9, 10: 10,
    11: 12, 12: 13, 13: 15, 14: 18,
  };
  function preflopScore(hole) {
    const a = hole[0], b = hole[1];
    const hi = Math.max(a.rank, b.rank);
    const lo = Math.min(a.rank, b.rank);
    const suited = a.suit === b.suit;
    if (hi === lo) return PAIR_VAL[hi];

    // High-card base
    let s;
    if (hi === 14)      s = 9;
    else if (hi === 13) s = 7;
    else if (hi === 12) s = 6;
    else if (hi === 11) s = 5;
    else                s = hi / 2;

    if (suited) s += 2;

    const gap = hi - lo - 1;
    if (gap === 0)      s += 1;
    else if (gap === 1) s += 0;
    else if (gap === 2) s -= 1;
    else if (gap === 3) s -= 3;
    else if (gap === 4) s -= 5;
    else                s -= 7;

    if (hi < 12 && gap <= 1) s += 1;   // small connectors bonus
    return Math.max(0, s);
  }

  // ──────────────────────── Stack tiers ────────────────────────

  function stackTier(myStack, bb) {
    const depth = myStack / Math.max(1, bb);
    if (depth >= 30) return 'DEEP';
    if (depth >= 12) return 'SHORT';
    if (depth >= 4)  return 'PUSHFOLD';
    return 'DESPERATE';
  }

  // ──────────────────────── Monte Carlo equity ────────────────────────

  function mcEquity(hole, board, iters) {
    iters = iters || 160;
    const known = hole.concat(board);
    const fresh = H.newDeck().filter(function (c) {
      for (let i = 0; i < known.length; i++) {
        if (known[i].rank === c.rank && known[i].suit === c.suit) return false;
      }
      return true;
    });
    let wins = 0, ties = 0;
    for (let i = 0; i < iters; i++) {
      const d = H.shuffle(fresh.slice());
      const opp = [d[0], d[1]];
      const need = 5 - board.length;
      const fullBoard = board.concat(d.slice(2, 2 + need));
      const me = H.evalBest(hole.concat(fullBoard));
      const them = H.evalBest(opp.concat(fullBoard));
      const cmp = H.compare(me, them);
      if (cmp > 0) wins++;
      else if (cmp === 0) ties++;
    }
    return (wins + ties / 2) / iters;
  }

  // ──────────────────────── Sizing ────────────────────────

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // kind: 'small' (1/3 pot), 'medium' (2/3 pot), 'big' (pot), 'shove' (all-in)
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
    else                        factor = 0.5;
    factor *= agg;
    if (la.canRaise) {
      const lo = la.minRaiseTo;
      const hi = la.maxRaiseTo;
      const oppBet = la.toCall || 0;
      const target = Math.ceil(oppBet + Math.max(pot, 1) * factor);
      return clamp(target, lo, hi);
    }
    if (la.canBet) {
      const lo = la.minBet;
      const hi = la.maxBet;
      const target = Math.ceil(Math.max(lo, pot * factor));
      return clamp(target, lo, hi);
    }
    return 0;
  }

  // ──────────────────────── No-fold guard ────────────────────────
  //
  // The boss must never fold themselves into oblivion. If a fold would leave
  // them under 2 BB, OR the call is a tiny price relative to remaining stack
  // and we have any meaningful equity, calling is mandatory. This catches
  // the "fold on the final hand" failure where the AI would surrender the
  // match chip-by-chip instead of going to a showdown.
  function mustNotFold(state, la, equity) {
    if (!la.canFold) return false;
    const myStack = state.chavezChips;
    const bb = H.blindsFor(state.handNumber).bb;
    const callAmount = la.callAmount;
    // Fold would leave us short (or already does)
    const stackAfterFold = myStack; // chips don't change on fold
    if (stackAfterFold < 2 * bb) return true;
    // Cheap call with non-trivial equity — never fold a bargain
    if (callAmount > 0
        && callAmount <= myStack * 0.18
        && equity >= 0.28) {
      return true;
    }
    // Pot-committed: more than half my stack is already in
    const myCommitted = state.chavezBet;
    if (myCommitted > myStack * 0.6 && equity >= 0.30) return true;
    return false;
  }

  // ──────────────────────── Preflop ────────────────────────

  function decidePreflop(state, la, style, tier) {
    const hole = state.chavezHole;
    const score = preflopScore(hole);
    const pot = state.pot;
    const bb = H.blindsFor(state.handNumber).bb;
    const myStack = state.chavezChips;
    const toCall = la.toCall;
    const callAmount = la.callAmount;
    const oddsReq = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

    // DESPERATE — < 4 BB. Jam any two cards, every time.
    if (tier === 'DESPERATE') {
      if (la.canRaise) return { action: 'raise', amount: la.maxRaiseTo };
      if (la.canBet)   return { action: 'bet',   amount: la.maxBet };
      if (la.canCall)  return { action: 'call' };
      if (la.canCheck) return { action: 'check' };
      return { action: 'call' }; // fallback
    }

    // PUSHFOLD — 4-12 BB. Jam-or-fold preflop. Threshold scales with tightness.
    if (tier === 'PUSHFOLD') {
      const jamThresh = 8 / style.tightness;
      if (toCall === 0) {
        // Open by jamming or limping
        if (score >= jamThresh && la.canBet) {
          return { action: 'bet', amount: la.maxBet };
        }
        if (la.canCheck) return { action: 'check' };
        if (la.canCall)  return { action: 'call' };
      } else {
        // Facing a raise — jam premium, otherwise the guard or fold
        if (score >= jamThresh && la.canRaise) {
          return { action: 'raise', amount: la.maxRaiseTo };
        }
        if (score >= 6 && la.canCall) return { action: 'call' };
        // Last-resort: no-fold guard
        if (mustNotFold(state, la, 0.30)) {
          if (la.canCall) return { action: 'call' };
        }
        return { action: 'fold' };
      }
    }

    // SHORT and DEEP — full betting tree

    // Facing an open / raise
    if (toCall > 0) {
      const valueThresh  = 14 / style.tightness;   // premium 3-bet
      const callThresh   = 7 / style.tightness;    // strong/decent call
      const oppAggBoost  = oppAggression >= 2 ? 1.0 : 0; // tighten if opp is hot
      const adjValue     = valueThresh + oppAggBoost;
      const adjCall      = callThresh - (style.loose - 1) * 2;

      if (score >= adjValue && la.canRaise) {
        const sized = sizeFor('big', pot, la, style.aggression);
        return { action: 'raise', amount: sized };
      }
      if (score >= adjCall) {
        if (oddsReq < 0.40 || score >= adjCall + 3) return { action: 'call' };
        // Cheap call when priced in
        if (callAmount < myStack * 0.10) return { action: 'call' };
      }
      // Occasional 3-bet bluff with cheap hands when very cheap
      if (la.canRaise
          && Math.random() < 0.04 * style.bluffFreq
          && callAmount < myStack * 0.12
          && oppAggression === 0) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: 'raise', amount: sized };
      }
      if (mustNotFold(state, la, 0.30)) {
        if (la.canCall) return { action: 'call' };
      }
      return { action: 'fold' };
    }

    // No bet to face — open or check
    const openThresh = 7 / style.tightness;
    if (score >= openThresh) {
      const kind = score >= 14 ? 'big' : 'medium';
      const sized = sizeFor(kind, pot, la, style.aggression);
      if (la.canRaise) return { action: 'raise', amount: sized };
      if (la.canBet)   return { action: 'bet',   amount: sized };
    }
    // Small steal
    if (Math.random() < 0.12 * style.bluffFreq && (la.canBet || la.canRaise)) {
      const sized = sizeFor('small', pot, la, style.aggression);
      if (la.canRaise) return { action: 'raise', amount: sized };
      if (la.canBet)   return { action: 'bet',   amount: sized };
    }
    if (la.canCheck) return { action: 'check' };
    if (la.canCall)  return { action: 'call' };
    return { action: 'fold' };
  }

  // ──────────────────────── Postflop ────────────────────────

  function decidePostflop(state, la, style, tier) {
    const hole = state.chavezHole;
    const board = state.board;
    const pot = state.pot;
    const myStack = state.chavezChips;
    const toCall = la.toCall;
    const callAmount = la.callAmount;
    const oddsReq = callAmount > 0 ? callAmount / (pot + callAmount) : 0;
    const allInToCall = callAmount > 0 && callAmount === myStack;
    const eq = mcEquity(hole, board, 160);
    const mix = (Math.random() - 0.5) * 0.06 * style.mixedness;

    // Closing the action (player went all-in) — no fold equity to chase,
    // just take the pot odds.
    if (allInToCall) {
      if (eq + mix >= oddsReq - 0.05) return { action: 'call' };
      if (mustNotFold(state, la, eq)) return { action: 'call' };
      return { action: 'fold' };
    }

    // DESPERATE — short-stack shove or fold based purely on hand strength.
    if (tier === 'DESPERATE') {
      if (toCall === 0) {
        if (eq > 0.45 + mix && (la.canBet || la.canRaise)) {
          return { action: la.canRaise ? 'raise' : 'bet', amount: la.canRaise ? la.maxRaiseTo : la.maxBet };
        }
        return { action: la.canCheck ? 'check' : 'call' };
      }
      // Facing a bet — call wide, jam when ahead
      if (eq > 0.55 + mix && la.canRaise) {
        return { action: 'raise', amount: la.maxRaiseTo };
      }
      if (eq + mix >= oddsReq - 0.05) return { action: 'call' };
      if (mustNotFold(state, la, eq)) return { action: 'call' };
      return { action: 'fold' };
    }

    // PUSHFOLD — straightforward, no bluffs, no tricky raises
    if (tier === 'PUSHFOLD') {
      if (toCall === 0) {
        if (eq > 0.55 + mix && (la.canBet || la.canRaise)) {
          // Jam — at this depth there's nothing to gain from sizing down
          return { action: la.canRaise ? 'raise' : 'bet', amount: la.canRaise ? la.maxRaiseTo : la.maxBet };
        }
        return { action: la.canCheck ? 'check' : 'call' };
      }
      // Facing a bet
      if (eq > 0.65 + mix && la.canRaise) {
        return { action: 'raise', amount: la.maxRaiseTo };
      }
      if (eq + mix >= oddsReq - 0.04) return { action: 'call' };
      if (mustNotFold(state, la, eq)) return { action: 'call' };
      return { action: 'fold' };
    }

    // SHORT and DEEP — full betting tree

    // Checked to — value bet, protection bet, or pot-controlled check
    if (toCall === 0) {
      if (eq > 0.72 + mix && (la.canBet || la.canRaise)) {
        const sized = sizeFor('big', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      if (eq > 0.58 + mix && (la.canBet || la.canRaise)) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      if (eq > 0.46 && (la.canBet || la.canRaise) && Math.random() < 0.55) {
        const sized = sizeFor('small', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      // Bluff bet — rare, only on dry-ish low-equity boards
      if (eq < 0.30
          && (la.canBet || la.canRaise)
          && pot > 0
          && Math.random() < 0.16 * style.bluffFreq) {
        const sized = sizeFor('medium', pot, la, style.aggression);
        return { action: la.canRaise ? 'raise' : 'bet', amount: sized };
      }
      return { action: 'check' };
    }

    // Facing a bet
    if (eq > 0.80 + mix && la.canRaise) {
      const sized = sizeFor('big', pot, la, style.aggression);
      return { action: 'raise', amount: sized };
    }
    if (eq > 0.65 + mix && la.canRaise) {
      const sized = sizeFor('medium', pot, la, style.aggression);
      return { action: 'raise', amount: sized };
    }
    if (eq > 0.50) return { action: 'call' };
    if (eq + mix >= oddsReq + 0.04) return { action: 'call' };
    if (eq + mix >= oddsReq - 0.02 && callAmount < myStack * 0.20) return { action: 'call' };

    // Bluff-catch on cheap rivers
    if (callAmount < myStack * 0.10
        && Math.random() < 0.08 * style.bluffFreq * style.loose) {
      return { action: 'call' };
    }

    // No-fold guard always last
    if (mustNotFold(state, la, eq)) {
      if (la.canCall) return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // ──────────────────────── Main entry ────────────────────────

  function decide(state) {
    const la = H.legalActions(state);
    if (!la || la.who !== 'chavez') return { action: 'check' };
    ensureHandFresh(state);
    const style = getStyle();
    const bb = H.blindsFor(state.handNumber).bb;
    const tier = stackTier(state.chavezChips, bb);
    if (state.street === 'preflop') return decidePreflop(state, la, style, tier);
    return decidePostflop(state, la, style, tier);
  }

  // ──────────────────────── Observer ────────────────────────

  function observe(state, who, action, amount, prevStreet) {
    void prevStreet;
    if (who !== 'player') return;
    if (action === 'bet' || action === 'raise') {
      oppAggression += 1;
    }
  }

  global.BFAI = { decide, observe, mcEquity };
})(window);
