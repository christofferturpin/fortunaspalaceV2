/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOLDEM — heads-up Texas Hold'em engine (cards, 7-card eval, state)      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.BFHoldem                                │
  │                                                                          │
  │   Card primitives:                                                       │
  │     SUITS, GLYPHS, COLORS, rankLabel(r) ──► 'A'/'K'/.../'2'              │
  │     makeCard(r,s) ──► {rank, suit, label, color}                         │
  │     newDeck() ──► card[52]   (rank 2..14, 14=A)                          │
  │     shuffle(deck) ──► deck   (Fisher–Yates, in place)                    │
  │                                                                          │
  │   Hand evaluation (7-card best-of-5):                                    │
  │     categories 9..1: straight flush, quads, full house, flush, straight, │
  │       trips, two pair, pair, high                                        │
  │     eval5(cards5) ──► {cat:int, tb:int[]}    (tb = tiebreakers)          │
  │     evalBest(cards) ──► {cat, tb}   (best over C(n,5))                   │
  │     compare(a,b) ──► neg / 0 / pos                                       │
  │     handName({cat}) ──► display string                                   │
  │                                                                          │
  │   Match state machine:                                                   │
  │     createMatch({playerChips, chavezChips}) ──► state                    │
  │     blindsFor(handNo) ──► {sb, bb}                                       │
  │     startHand(state) ──► mutates: deal hole, post blinds, set toAct      │
  │     legalActions(state) ──► {fold,check,call,bet,raise: bool, ...}       │
  │     act(state, who, action, amount) ──► mutates; advances toAct or       │
  │       street; on terminal: showdown or uncontested                       │
  │     resolveHand(state) ──► sets winner, transfers pot, advances handNo,  │
  │       flips button. Marks match complete on bust.                        │
  │                                                                          │
  │   Persistence (handled by page.js):                                      │
  │     match snapshot serialized to wendys_palace_boss_chavez between hands │
  │                                                                          │
  │   Exports: window.BFHoldem = { …card primitives, eval fns, state fns }   │
  │   External deps: none (pure JS)                                          │
  │   Consumers: js/bossfight/ai.js, js/bossfight/page.js                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SUITS=['S','H','D','C']; GLYPHS={S:♠,H:♥,D:♦,C:♣}; COLORS={S/C:black,H/D:red(#9b1d20)}
  rankLabel(r): r≤10→String; 11→J,12→Q,13→K,14→A
  makeCard(r,s)→{rank,suit,label:rankLabel+glyph,color}
  newDeck()→card[52]: ∀s∀r∈[2..14] push makeCard
  shuffle(d)→d: Fisher-Yates in-place
  eval5(c5)→{cat,tb}: count ranks; flush=∀suit==; straight=grouped.len==5 && (max-min==4 || wheel A2345); cat: 9SF/8Q/7FH/6F/5S/4T/3TP/2P/1H; tb descending
  evalBest(cards)→{cat,tb}: ∀C(n,5) eval5; pick max via compare
  compare(a,b)→±: cat diff || tb pairwise
  handName({cat})→str
  BLINDS: hand∈[1..10]→1/2; [11..20]→2/3; ≥21→5/10
  blindsFor(n)→{sb,bb}
  createMatch({pC,cC})→state{playerChips:pC,chavezChips:cC,handNumber:1,buttonOnPlayer:T,complete:F,won:F,...}
  startHand(s): deck=shuffle(newDeck); hole=2 each; board=[]; pot=0; bets=0; blinds=blindsFor(handNumber); SB=button,BB=other; pot+=blinds(capped to stack); allIn if stack<blind; toAct=button preflop; street='preflop'; lastRaiseTo=BB; minRaise=BB
  legalActions(s)→{fold:!folded,check:toCall==0,call:toCall>0,bet:toCall==0&&stack>0,raise:toCall>0&&stack>toCall, minBet,minRaiseTo,maxBet}
  act(s,who,action,amount): switch action: fold→other wins pot; check→passTurn; call→stack-=toCall, pot+=, bet=match; bet→stack-=amount,pot+=,lastRaiseTo=amount,minRaise=amount; raise→same but raiseTo=amount; aggressor=who; passTurn or advanceStreet
  advanceStreet(s): preflop→flop(3); flop→turn(1); turn→river(1); river→showdown; reset bets, lastAggressor=null, toAct=non-button (BB postflop heads-up)
  showdown(s): compare hands; pot→winner (or split); resolveHand
  resolveHand(s): handNumber++; buttonOnPlayer=!; check bust (playerChips==0→lost,chavezChips==0→won); complete=bust
  exports: global.BFHoldem={SUITS,GLYPHS,COLORS,rankLabel,makeCard,newDeck,shuffle,eval5,evalBest,compare,handName,blindsFor,createMatch,startHand,legalActions,act}
*/

(function (global) {
  const SUITS = ['S', 'H', 'D', 'C'];
  const GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const COLORS = { S: '#0a0a0a', H: '#9b1d20', D: '#9b1d20', C: '#0a0a0a' };
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  function rankLabel(r) {
    return r <= 10 ? String(r) : RANK_LABEL[r];
  }

  function makeCard(rank, suit) {
    return {
      rank,
      suit,
      label: rankLabel(rank) + GLYPHS[suit],
      color: COLORS[suit],
    };
  }

  function newDeck() {
    const d = [];
    for (const s of SUITS) {
      for (let r = 2; r <= 14; r++) d.push(makeCard(r, s));
    }
    return d;
  }

  function shuffle(d) {
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  // ───────────────────────── Hand evaluation ─────────────────────────

  function eval5(cards) {
    const ranks = cards.map(c => c.rank).slice().sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const grouped = Object.keys(counts)
      .map(r => [+r, counts[+r]])
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = suits.every(s => s === suits[0]);

    let straight = false, straightHigh = 0;
    if (grouped.length === 5) {
      const s = ranks; // already descending
      if (s[0] === 14 && s[1] === 5 && s[2] === 4 && s[3] === 3 && s[4] === 2) {
        straight = true; straightHigh = 5; // wheel
      } else if (s[0] - s[4] === 4) {
        straight = true; straightHigh = s[0];
      }
    }

    if (straight && flush) return { cat: 9, tb: [straightHigh] };
    if (grouped[0][1] === 4) return { cat: 8, tb: [grouped[0][0], grouped[1][0]] };
    if (grouped[0][1] === 3 && grouped[1][1] === 2) return { cat: 7, tb: [grouped[0][0], grouped[1][0]] };
    if (flush) return { cat: 6, tb: ranks };
    if (straight) return { cat: 5, tb: [straightHigh] };
    if (grouped[0][1] === 3) return { cat: 4, tb: [grouped[0][0], grouped[1][0], grouped[2][0]] };
    if (grouped[0][1] === 2 && grouped[1][1] === 2) return { cat: 3, tb: [grouped[0][0], grouped[1][0], grouped[2][0]] };
    if (grouped[0][1] === 2) return { cat: 2, tb: [grouped[0][0], grouped[1][0], grouped[2][0], grouped[3][0]] };
    return { cat: 1, tb: ranks };
  }

  function evalBest(cards) {
    let best = null;
    let bestFive = null;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
    for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++)
    for (let e = d + 1; e < n; e++) {
      const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
      const r = eval5(five);
      if (!best || compare(r, best) > 0) { best = r; bestFive = five; }
    }
    if (best) best.cards = bestFive;
    return best;
  }

  function compare(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    const len = Math.min(a.tb.length, b.tb.length);
    for (let i = 0; i < len; i++) {
      if (a.tb[i] !== b.tb[i]) return a.tb[i] - b.tb[i];
    }
    return 0;
  }

  const HAND_NAMES = {
    9: 'Straight Flush', 8: 'Four of a Kind', 7: 'Full House',
    6: 'Flush', 5: 'Straight', 4: 'Three of a Kind',
    3: 'Two Pair', 2: 'Pair', 1: 'High Card',
  };
  function handName(h) { return HAND_NAMES[h.cat] || '???'; }

  // ───────────────────────── Match state machine ─────────────────────────

  function blindsFor(handNo) {
    if (handNo <= 10) return { sb: 1, bb: 2 };
    if (handNo <= 20) return { sb: 2, bb: 3 };
    return { sb: 5, bb: 10 };
  }

  function createMatch(opts) {
    return {
      playerChips: opts.playerChips,
      chavezChips: opts.chavezChips,
      handNumber: 1,
      buttonOnPlayer: true,
      complete: false,
      won: false,
      // hand-scoped state — zeroed until startHand runs
      street: 'idle',
      deck: [],
      playerHole: [],
      chavezHole: [],
      board: [],
      pot: 0,
      playerBet: 0,
      chavezBet: 0,
      playerFolded: false,
      chavezFolded: false,
      playerAllIn: false,
      chavezAllIn: false,
      lastRaiseTo: 0,
      minRaise: 0,
      toAct: 'player',
      lastAggressor: null,
      handResult: null, // populated after showdown / uncontested
    };
  }

  function startHand(s) {
    s.deck = shuffle(newDeck());
    s.playerHole = [s.deck.pop(), s.deck.pop()];
    s.chavezHole = [s.deck.pop(), s.deck.pop()];
    s.board = [];
    s.pot = 0;
    s.playerBet = 0;
    s.chavezBet = 0;
    s.playerFolded = false;
    s.chavezFolded = false;
    s.playerAllIn = false;
    s.chavezAllIn = false;
    s.street = 'preflop';
    s.handResult = null;
    s.lastAggressor = null;

    const { sb, bb } = blindsFor(s.handNumber);
    // Heads-up: button posts SB, opponent posts BB
    const buttonIsPlayer = s.buttonOnPlayer;
    const sbWho = buttonIsPlayer ? 'player' : 'chavez';
    const bbWho = buttonIsPlayer ? 'chavez' : 'player';
    postBlind(s, sbWho, sb);
    postBlind(s, bbWho, bb);
    s.lastRaiseTo = bb;
    s.minRaise = bb;
    // Pre-flop: button (SB) acts first
    s.toAct = sbWho;

    // If someone is already all-in from blinds, skip straight to runout.
    if (s.playerAllIn || s.chavezAllIn) {
      // Both committed; only meaningful if both all-in or non-all-in has option.
      // For simplicity: if non-all-in still has chips and matches, run out.
      maybeAdvanceAfterAction(s);
    }
  }

  function postBlind(s, who, amount) {
    const stack = who === 'player' ? s.playerChips : s.chavezChips;
    const post = Math.min(stack, amount);
    if (who === 'player') {
      s.playerChips -= post;
      s.playerBet += post;
      if (s.playerChips === 0) s.playerAllIn = true;
    } else {
      s.chavezChips -= post;
      s.chavezBet += post;
      if (s.chavezChips === 0) s.chavezAllIn = true;
    }
    s.pot += post;
  }

  function chips(s, who) { return who === 'player' ? s.playerChips : s.chavezChips; }
  function bet(s, who) { return who === 'player' ? s.playerBet : s.chavezBet; }
  function setChips(s, who, v) { if (who === 'player') s.playerChips = v; else s.chavezChips = v; }
  function setBet(s, who, v) { if (who === 'player') s.playerBet = v; else s.chavezBet = v; }
  function other(who) { return who === 'player' ? 'chavez' : 'player'; }
  function allIn(s, who) { return who === 'player' ? s.playerAllIn : s.chavezAllIn; }
  function setAllIn(s, who, v) { if (who === 'player') s.playerAllIn = v; else s.chavezAllIn = v; }
  function folded(s, who) { return who === 'player' ? s.playerFolded : s.chavezFolded; }

  function legalActions(s) {
    const who = s.toAct;
    const myBet = bet(s, who);
    const oppBet = bet(s, other(who));
    const toCall = Math.max(0, oppBet - myBet);
    const myStack = chips(s, who);
    const oppStack = chips(s, other(who));
    // Cap: can't raise past opponent's effective stack
    const callAmount = Math.min(toCall, myStack);
    const canCheck = toCall === 0;
    const canCall = toCall > 0 && myStack > 0;
    // Heads-up: facing a shove (opp has nothing behind) you can't slink out —
    // call it or call it. Removes the chicken exit when the boss jams.
    const oppAllIn = allIn(s, other(who));
    const canFold = toCall > 0 && !oppAllIn;
    // Bet (open): only legal when no outstanding bet AND opp has chips behind
    const canBet = canCheck && myStack > 0 && oppStack > 0;
    // Raise: opp has bet AND I have more than call AND opp has chips behind
    const canRaise = toCall > 0 && myStack > toCall && oppStack > 0;
    const minBet = Math.min(myStack, s.minRaise);
    // raise to N = oppBet + at least minRaise increment (capped by my stack-effective)
    const minRaiseTo = Math.min(myBet + myStack, oppBet + s.minRaise);
    const maxRaiseTo = myBet + myStack;
    const maxBet = myStack;
    return {
      who, toCall, callAmount, canCheck, canCall, canFold,
      canBet, canRaise, minBet, maxBet, minRaiseTo, maxRaiseTo,
    };
  }

  function act(s, who, action, amount) {
    if (s.toAct !== who) return { error: 'not your turn' };
    const la = legalActions(s);
    const opp = other(who);

    if (action === 'fold') {
      if (!la.canFold && !la.canCheck) return { error: 'cannot fold' };
      // Even if check is legal you can fold (folding when free is silly but allowed)
      if (who === 'player') s.playerFolded = true; else s.chavezFolded = true;
      s.handResult = { type: 'fold', winner: opp };
      transferPot(s, opp);
      return { ok: true, terminal: true };
    }

    if (action === 'check') {
      if (!la.canCheck) return { error: 'cannot check' };
      // Acting check: pass turn unless street is closed
      passOrAdvance(s, who);
      return { ok: true, terminal: s.street === 'showdown' || s.complete };
    }

    if (action === 'call') {
      if (!la.canCall) return { error: 'cannot call' };
      const pay = Math.min(la.toCall, chips(s, who));
      setChips(s, who, chips(s, who) - pay);
      setBet(s, who, bet(s, who) + pay);
      s.pot += pay;
      if (chips(s, who) === 0) setAllIn(s, who, true);
      passOrAdvance(s, who);
      return { ok: true, terminal: s.street === 'showdown' || s.complete };
    }

    if (action === 'bet') {
      if (!la.canBet) return { error: 'cannot bet' };
      const amt = Math.max(la.minBet, Math.min(la.maxBet, amount | 0));
      setChips(s, who, chips(s, who) - amt);
      setBet(s, who, bet(s, who) + amt);
      s.pot += amt;
      s.lastRaiseTo = amt;
      s.minRaise = amt;
      s.lastAggressor = who;
      if (chips(s, who) === 0) setAllIn(s, who, true);
      s.toAct = opp;
      maybeAdvanceAfterAction(s);
      return { ok: true, terminal: s.street === 'showdown' || s.complete };
    }

    if (action === 'raise') {
      if (!la.canRaise) return { error: 'cannot raise' };
      // amount = new total bet (raise-to)
      const target = Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, amount | 0));
      const pay = target - bet(s, who);
      const raiseIncrement = target - bet(s, opp);
      setChips(s, who, chips(s, who) - pay);
      setBet(s, who, target);
      s.pot += pay;
      s.lastRaiseTo = target;
      s.minRaise = Math.max(s.minRaise, raiseIncrement);
      s.lastAggressor = who;
      if (chips(s, who) === 0) setAllIn(s, who, true);
      s.toAct = opp;
      maybeAdvanceAfterAction(s);
      return { ok: true, terminal: s.street === 'showdown' || s.complete };
    }

    return { error: 'unknown action' };
  }

  function passOrAdvance(s, who) {
    // Pass turn to opponent; if betting round is now closed, advance street.
    const opp = other(who);
    s.toAct = opp;
    maybeAdvanceAfterAction(s);
  }

  function bettingRoundClosed(s) {
    // Round is closed when both bets match AND each player has had a chance to act
    // Heads-up: a round closes when the player facing the last aggression calls
    // (or both check). We model this: if betsMatch && (no outstanding action), done.
    // Treat "no outstanding action" as: lastAggressor==null (both checked) OR
    // the non-aggressor has just matched (we'll only call this AFTER an action).
    if (s.playerBet !== s.chavezBet) return false;
    // If someone is all-in and bets match, round is over.
    if (s.playerAllIn || s.chavezAllIn) return true;
    // If no aggressor, both have checked at least once if both have acted.
    // We track this implicitly: we only enter this check after an action; the
    // caller flags `_actedThisStreet` for the actor.
    // Simpler heuristic: round is closed when bets are equal AND
    //   (a) lastAggressor exists and toAct == lastAggressor (action came back), OR
    //   (b) both have acted at least once this street
    if (s.lastAggressor && s.toAct === s.lastAggressor) return true;
    if (s._playerActed && s._chavezActed) return true;
    return false;
  }

  function maybeAdvanceAfterAction(s) {
    // mark actor as acted
    const justActed = other(s.toAct); // toAct was already flipped to opponent
    if (justActed === 'player') s._playerActed = true;
    else s._chavezActed = true;

    if (bettingRoundClosed(s)) {
      advanceStreet(s);
    } else {
      // If next-to-act is all-in or folded, that player can't act; skip them
      // and check again.
      const next = s.toAct;
      if (folded(s, next) || (allIn(s, next) && bet(s, next) >= bet(s, other(next)))) {
        // Skip and re-check closure
        if (bettingRoundClosed(s)) advanceStreet(s);
      }
    }
  }

  function advanceStreet(s) {
    // If either all-in and bets are matched, run out remaining streets then showdown
    const runOut = (s.playerAllIn || s.chavezAllIn) && s.playerBet === s.chavezBet;
    // reset per-street markers
    s._playerActed = false;
    s._chavezActed = false;
    s.lastAggressor = null;
    s.playerBet = 0;
    s.chavezBet = 0;
    s.minRaise = blindsFor(s.handNumber).bb;

    function dealBoard(n) {
      s.deck.pop(); // burn
      for (let i = 0; i < n; i++) s.board.push(s.deck.pop());
    }

    if (s.street === 'preflop') {
      dealBoard(3);
      s.street = 'flop';
    } else if (s.street === 'flop') {
      dealBoard(1);
      s.street = 'turn';
    } else if (s.street === 'turn') {
      dealBoard(1);
      s.street = 'river';
    } else if (s.street === 'river') {
      doShowdown(s);
      return;
    }

    // Post-flop: non-button (BB) acts first in heads-up.
    s.toAct = s.buttonOnPlayer ? 'chavez' : 'player';

    if (runOut) {
      // Skip betting; deal next street immediately
      // unless we just dealt river → already handled above.
      if (s.street !== 'river') advanceStreet(s);
      else doShowdown(s);
    }
  }

  function doShowdown(s) {
    const me = evalBest(s.playerHole.concat(s.board));
    const them = evalBest(s.chavezHole.concat(s.board));
    const cmp = compare(me, them);
    let winner;
    if (cmp > 0) winner = 'player';
    else if (cmp < 0) winner = 'chavez';
    else winner = 'split';
    s.street = 'showdown';
    s.handResult = {
      type: 'showdown',
      winner,
      playerEval: me,
      chavezEval: them,
    };
    transferPot(s, winner);
  }

  function transferPot(s, winner) {
    if (winner === 'split') {
      const half = Math.floor(s.pot / 2);
      s.playerChips += half;
      s.chavezChips += s.pot - half;
    } else if (winner === 'player') {
      s.playerChips += s.pot;
    } else {
      s.chavezChips += s.pot;
    }
    s.pot = 0;
    // Check bust
    if (s.playerChips === 0) {
      s.complete = true;
      s.won = false;
    } else if (s.chavezChips === 0) {
      s.complete = true;
      s.won = true;
    }
  }

  // Called externally between hands to advance the button and hand counter.
  function nextHand(s) {
    if (s.complete) return;
    s.handNumber += 1;
    s.buttonOnPlayer = !s.buttonOnPlayer;
  }

  global.BFHoldem = {
    SUITS, GLYPHS, COLORS,
    rankLabel, makeCard, newDeck, shuffle,
    eval5, evalBest, compare, handName,
    blindsFor, createMatch, startHand, legalActions, act, nextHand,
  };
})(window);
