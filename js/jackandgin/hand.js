/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  meld enumerator + best-partition scorer                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.JG.Hand                                 │
  │                                                                          │
  │   Constants: BUST_LIMIT=40, MIN_MELD_SIZE=3, MAX_RANK_POSITION=14        │
  │                                                                          │
  │   Score multipliers:                                                     │
  │     lengthMult(k)         ──► 1 | 1.5 (k=4) | 2 (k≥5)                    │
  │     flushMult(sameSuit)   ──► 1.5 | 1                                    │
  │                                                                          │
  │   Combinatorics:                                                         │
  │     combinations(arr, k)        ──► arr[][]                              │
  │     cartesianProduct(arrays)    ──► arr[][]                              │
  │                                                                          │
  │   Meld builders:                                                         │
  │     makeSet(cards)   ──► {type:'set',   cards, sameSuit:false, score}    │
  │     makeRun(cards)   ──► {type:'run',   cards, sameSuit, score}          │
  │     makeFlush(cards) ──► {type:'flush', cards, sameSuit:true,  score}    │
  │                                                                          │
  │   Enumeration:                                                           │
  │     enumerateSets(hand)    ──► set[]   (group by rank)                   │
  │     enumerateRuns(hand)    ──► run[]   (ace low+high, by position)       │
  │     enumerateFlushes(hand) ──► flush[] (group by suit)                   │
  │     enumerateMelds(hand)   ──► sets + runs + flushes                     │
  │                                                                          │
  │   Entry:                                                                 │
  │     findBestPartition(hand) ──► {handTotal, isBust, melds, deadwood,     │
  │                                  meldScore, finalScore}                  │
  │       │                                                                  │
  │       ├─ if handTotal ≥ 40 ─► bust short-circuit                         │
  │       └─ enumerateMelds → bitmask DP best(mask) ──► max score subset     │
  │                                                                          │
  │   Misc:                                                                  │
  │     meldDescribe(meld)  ──► human string                                 │
  │     makeHand(specs[])   ──► card[]    (test harness, e.g. "10H","AS")    │
  │     runTests()          ──► {pass, fail}  (console-driven)               │
  │                                                                          │
  │   Exports (window.JG.Hand): {BUST_LIMIT, enumerateMelds,                 │
  │     findBestPartition, meldDescribe, makeHand, runTests}                 │
  │   External deps: JG.Cards (makeCard in test harness)                     │
  │   Consumers: JG.Dealer, JG.Round, JG.UI                                  │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  BUST_LIMIT=40; MIN_MELD_SIZE=3; MAX_RANK_POSITION=14
  lengthMult(k)→num: k<=3?1: k==4?1.5: 2
  flushMult(same)→num: same?1.5:1
  combinations(arr,k)→arr[][]: recursive k-subset
  cartesianProduct(arrays)→arr[][]: iterative concat across arrays
  makeSet(cards)→{type:'set',cards,sameSuit:F,score:Σvalue*lengthMult}
  makeRun(cards)→{type:'run',cards,sameSuit:all1stSuit,score:Σvalue*lengthMult*flushMult}
  makeFlush(cards)→{type:'flush',cards,sameSuit:T,score:Σvalue*lengthMult}
  enumerateSets(hand)→set[]: group byRank; ∀group len>=3 → ∀size [3..len] → ∀combo push makeSet
  enumerateRuns(hand)→run[]: byPos map (ace→[1,14]); ∀start[1..12]∀length[3..]: gather cardsByPos, cartesian, reject dup-card (ace both ends), push makeRun
  enumerateFlushes(hand)→flush[]: group bySuit; ∀group len>=3 → ∀size∀combo push makeFlush
  enumerateMelds(hand)→meld[]: sets++runs++flushes
  findBestPartition(hand)→{handTotal,isBust,melds,deadwood,meldScore,finalScore}: handTotal=Σvalue; total>=40→{isBust:T,melds:[],deadwood:hand,score:0}; else enumerate→build bitmask per meld→memoized best(mask): ∀m if (mask&m.mask)==m.mask: sub=best(mask&~m.mask); track maxScore; deadwood=hand\usedMask
  meldDescribe(meld)→str: tag(flush run|flush|type)+': '+labels+' = '+score
  makeHand(specs[])→card[]: parse "AS","10H" → suit=last1,rank=parsed → JG.Cards.makeCard
  runTests()→{pass,fail}: ∀cases run findBestPartition, compare finalScore vs expected, log PASS/FAIL
  exports: global.JG.Hand={BUST_LIMIT,enumerateMelds,findBestPartition,meldDescribe,makeHand,runTests}
*/

(function (global) {
  const BUST_LIMIT = 40;
  const MIN_MELD_SIZE = 3;
  const MAX_RANK_POSITION = 14;

  function lengthMult(k) {
    if (k <= 3) return 1;
    if (k === 4) return 1.5;
    return 2;
  }

  function flushMult(sameSuit) {
    return sameSuit ? 1.5 : 1;
  }

  function combinations(arr, k) {
    const result = [];
    const combo = [];
    (function recurse(start) {
      if (combo.length === k) {
        result.push(combo.slice());
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        recurse(i + 1);
        combo.pop();
      }
    })(0);
    return result;
  }

  function cartesianProduct(arrays) {
    let result = [[]];
    for (const arr of arrays) {
      const next = [];
      for (const prefix of result) {
        for (const item of arr) {
          next.push(prefix.concat([item]));
        }
      }
      result = next;
    }
    return result;
  }

  function makeSet(cards) {
    const sum = cards.reduce((s, c) => s + c.value, 0);
    return {
      type: 'set',
      cards: cards.slice(),
      sameSuit: false,
      score: sum * lengthMult(cards.length),
    };
  }

  function makeRun(cards) {
    const sameSuit = cards.every((c) => c.suit === cards[0].suit);
    const sum = cards.reduce((s, c) => s + c.value, 0);
    return {
      type: 'run',
      cards: cards.slice(),
      sameSuit,
      score: sum * lengthMult(cards.length) * flushMult(sameSuit),
    };
  }

  function makeFlush(cards) {
    const sum = cards.reduce((s, c) => s + c.value, 0);
    return {
      type: 'flush',
      cards: cards.slice(),
      sameSuit: true,
      score: sum * lengthMult(cards.length),
    };
  }

  function enumerateSets(hand) {
    const byRank = new Map();
    for (const c of hand) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank).push(c);
    }
    const sets = [];
    for (const cards of byRank.values()) {
      if (cards.length < MIN_MELD_SIZE) continue;
      for (let size = MIN_MELD_SIZE; size <= cards.length; size++) {
        for (const combo of combinations(cards, size)) {
          sets.push(makeSet(combo));
        }
      }
    }
    return sets;
  }

  function enumerateRuns(hand) {
    // Build position -> cards, with ace appearing at both pos 1 and pos 14.
    const byPos = new Map();
    for (const c of hand) {
      const positions = c.rank === 1 ? [1, MAX_RANK_POSITION] : [c.rank];
      for (const pos of positions) {
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos).push(c);
      }
    }

    const runs = [];
    for (let start = 1; start <= MAX_RANK_POSITION - MIN_MELD_SIZE + 1; start++) {
      for (let length = MIN_MELD_SIZE; start + length - 1 <= MAX_RANK_POSITION; length++) {
        const cardsByPos = [];
        let ok = true;
        for (let pos = start; pos < start + length; pos++) {
          const cards = byPos.get(pos);
          if (!cards || cards.length === 0) { ok = false; break; }
          cardsByPos.push(cards);
        }
        if (!ok) continue;
        for (const combo of cartesianProduct(cardsByPos)) {
          // Reject if same card used twice (only possible when ace appears at both ends).
          const seen = new Set();
          let dup = false;
          for (const c of combo) {
            if (seen.has(c)) { dup = true; break; }
            seen.add(c);
          }
          if (!dup) runs.push(makeRun(combo));
        }
      }
    }
    return runs;
  }

  function enumerateFlushes(hand) {
    const bySuit = new Map();
    for (const c of hand) {
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit).push(c);
    }
    const flushes = [];
    for (const cards of bySuit.values()) {
      if (cards.length < MIN_MELD_SIZE) continue;
      for (let size = MIN_MELD_SIZE; size <= cards.length; size++) {
        for (const combo of combinations(cards, size)) {
          flushes.push(makeFlush(combo));
        }
      }
    }
    return flushes;
  }

  function enumerateMelds(hand) {
    return enumerateSets(hand)
      .concat(enumerateRuns(hand))
      .concat(enumerateFlushes(hand));
  }

  function findBestPartition(hand) {
    const handTotal = hand.reduce((s, c) => s + c.value, 0);
    if (handTotal >= BUST_LIMIT) {
      return {
        handTotal,
        isBust: true,
        melds: [],
        deadwood: hand.slice(),
        meldScore: 0,
        finalScore: 0,
      };
    }

    const melds = enumerateMelds(hand);
    const cardIndex = new Map();
    hand.forEach((c, i) => cardIndex.set(c, i));
    for (const m of melds) {
      let mask = 0;
      for (const c of m.cards) mask |= 1 << cardIndex.get(c);
      m.mask = mask;
    }

    const fullMask = (1 << hand.length) - 1;
    const memo = new Map();

    function best(mask) {
      if (memo.has(mask)) return memo.get(mask);
      let bestScore = 0;
      let bestMelds = [];
      for (const m of melds) {
        if ((mask & m.mask) !== m.mask) continue;
        const sub = best(mask & ~m.mask);
        const score = m.score + sub.score;
        if (score > bestScore) {
          bestScore = score;
          bestMelds = [m].concat(sub.melds);
        }
      }
      const result = { score: bestScore, melds: bestMelds };
      memo.set(mask, result);
      return result;
    }

    const result = best(fullMask);
    const usedMask = result.melds.reduce((acc, m) => acc | m.mask, 0);
    const deadwood = hand.filter((_, i) => !(usedMask & (1 << i)));
    const meldScore = result.score;

    return {
      handTotal,
      isBust: false,
      melds: result.melds,
      deadwood,
      meldScore,
      finalScore: meldScore,
    };
  }

  function meldDescribe(meld) {
    const tag = meld.type === 'run' && meld.sameSuit ? 'flush run'
      : meld.type === 'flush' ? 'flush'
      : meld.type;
    const cards = meld.cards.map((c) => c.label).join(' ');
    return tag + ': ' + cards + ' = ' + meld.score;
  }

  // ----- Test harness -----

  function makeHand(specs) {
    // specs: array of strings like "AS", "10H", "QD"
    return specs.map((s) => {
      const suit = s.slice(-1);
      const rankStr = s.slice(0, -1);
      const rank = rankStr === 'A' ? 1
        : rankStr === 'J' ? 11
        : rankStr === 'Q' ? 12
        : rankStr === 'K' ? 13
        : Number(rankStr);
      return JG.Cards.makeCard(rank, suit);
    });
  }

  function runTests() {
    const cases = [
      { name: 'empty hand', specs: [], expected: 0 },
      { name: 'set of 3 (7s)', specs: ['7S', '7H', '7D'], expected: 21 },
      { name: 'set of 4 (7s) — sum 28 ×1.5', specs: ['7S', '7H', '7D', '7C'], expected: 42 },
      { name: 'rainbow run 5-6-7 — 18 ×1', specs: ['5S', '6H', '7D'], expected: 18 },
      { name: 'flush run 5-6-7 — 18 ×1×1.5', specs: ['5S', '6S', '7S'], expected: 27 },
      { name: 'flush run 5-6-7-8 — 26 ×1.5×1.5', specs: ['5S', '6S', '7S', '8S'], expected: 58.5 },
      { name: 'run + leftover K (no penalty)', specs: ['5S', '6H', '7D', 'KC'], expected: 18 },
      { name: '3-card flush (2♠ 7♠ K♠)', specs: ['2S', '7S', 'KS'], expected: 19 },
      { name: '4-card flush (sum 24 ×1.5)', specs: ['2S', '5S', '7S', 'KS'], expected: 36 },
      { name: '5-card flush no run (sum 25 ×2)', specs: ['AS', '3S', '5S', '7S', '9S'], expected: 50 },
      {
        name: 'flush run beats plain flush on same cards',
        specs: ['5S', '6S', '7S'],
        // already covered above as 27 — runs are evaluated and chosen over the plain flush
        expected: 27,
      },
      { name: 'A-2-3 ace low — 1+2+3 ×1', specs: ['AS', '2H', '3D'], expected: 6 },
      { name: 'Q-K-A ace high — 10+10+1 ×1', specs: ['QS', 'KH', 'AD'], expected: 21 },
      {
        name: 'split better than collapse: 4 fives + 4♠6♠ (total 30)',
        specs: ['5S', '5H', '5D', '5C', '4S', '6S'],
        // Best: flush run 4♠5♠6♠ (15 ×1×1.5 = 22.5) + set 5H 5D 5C (15 ×1 = 15) = 37.5
        // Collapse: set of 4 fives (20 ×1.5 = 30) − deadwood 4♠+6♠ (10) = 20
        expected: 37.5,
      },
      { name: 'bust at exactly 40 (4 tens)', specs: ['10S', '10H', '10D', '10C'], expected: 0 },
      {
        name: '39 is safe (3 Ks + 9D)',
        specs: ['KS', 'KH', 'KC', '9D'],
        // sum 39 < 40. Set of 3 Ks scores 30, 9D unused. Score 30.
        expected: 30,
      },
      {
        name: '31 is safe (sum 31, no melds)',
        specs: ['KS', 'KH', 'JC', 'AD'],
        // Different suits, ranks not a meld. Score 0 (no penalty).
        expected: 0,
      },
    ];

    let pass = 0;
    let fail = 0;
    for (const tc of cases) {
      const hand = makeHand(tc.specs);
      const result = findBestPartition(hand);
      const ok = result.finalScore === tc.expected;
      if (ok) {
        pass++;
        console.log('PASS  ' + tc.name + ' → ' + result.finalScore);
      } else {
        fail++;
        console.error('FAIL  ' + tc.name +
          ' → got ' + result.finalScore + ', expected ' + tc.expected);
        console.error('  melds: ' + result.melds.map(meldDescribe).join('; '));
        console.error('  deadwood: ' + result.deadwood.map((c) => c.label).join(' ') +
          ' = -' + result.deadwoodPenalty);
      }
    }
    console.log('—');
    console.log(pass + ' pass, ' + fail + ' fail');
    return { pass, fail };
  }

  global.JG = global.JG || {};
  global.JG.Hand = {
    BUST_LIMIT,
    enumerateMelds,
    findBestPartition,
    meldDescribe,
    makeHand,
    runTests,
  };
})(window);
