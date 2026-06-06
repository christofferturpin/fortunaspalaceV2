/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE SIM  —  Monte-Carlo bet simulator for tuning house edge        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   STRATEGIES (pickers) — each(race) ──► { win, place, show }             │
  │       ├─ favorites : top mockSpeed → 1,2,3                               │
  │       ├─ random    : shuffle → 1,2,3                                     │
  │       ├─ longshots : bottom mockSpeed → 1,2,3                            │
  │       └─ spread    : top, then 4th & 5th favorites                       │
  │                                                                          │
  │   simulateRaces(numRaces, strategyName, betTier=100, useReal) ──► stats  │
  │       │   stats: { strategy, numRaces, betTier, totalWagered,            │
  │       │           totalPaid, meanProfit, stdDev, hitRate,                │
  │       │           houseEdge, returnPerCoin, bestRace, worstRace }        │
  │       │                                                                  │
  │       └─ loop numRaces:                                                  │
  │            generate() ──► WikiraceRealHorses.generateRealRace() ?? \\    │
  │                           WikiraceRace.generateRace()                    │
  │            strategy(race) ──► picks                                      │
  │            WikiraceRace.runRace(race) ──► order                          │
  │            WikiraceBetting.resolveBet(picks, order, betTier) ──► payout  │
  │                                                                          │
  │   simulateAllStrategies(numRaces, betTier, useReal) ──► {name: stats}    │
  │       └─ runs simulateRaces over Object.keys(STRATEGIES)                 │
  │                                                                          │
  │   Exports (window.WikiraceSim): { STRATEGIES, simulateRaces,             │
  │       simulateAllStrategies }                                            │
  │   External deps: WikiraceRace, WikiraceBetting, WikiraceRealHorses       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STRATEGIES={favorites,random,longshots,spread}: each(race)→{win,place,show}
    favorites: sort desc mockSpeed → [0,1,2]
    random: shuffle(race) → [0,1,2]
    longshots: sort asc mockSpeed → [0,1,2]
    spread: sort desc mockSpeed → win=[0], place=[3], show=[4]
  simulateRaces(numRaces,strategyName,betTier=100,useReal)→stats: strat=STRATEGIES[name] ?? throw; generate()→useReal&&RealHorses.gen()||Race.generateRace; wagerPerRace=betTier*3; ∀i<numRaces: race=gen; picks=strat(race); order=Race.runRace(race); payout=Betting.resolveBet(picks,order,betTier); profit=payout-wager; tally totalWagered/totalPaid/hits/sumProfit/sumSq/best/worst; mean=sum/N; var=sumSq/N-mean²; std=√max(0,var); ret{strategy,numRaces,betTier,totalWagered,totalPaid,meanProfit,stdDev,hitRate:hits/N,houseEdge:1-paid/wagered,returnPerCoin:paid/wagered,bestRace,worstRace}
  simulateAllStrategies(numRaces,betTier,useReal)→{name:stats}: ∀name∈keys(STRATEGIES): results[name]=simulateRaces(...)
  exports: global.WikiraceSim={STRATEGIES,simulateRaces,simulateAllStrategies}
*/

(function (global) {
  // Strategies: each takes a 9-horse race, returns picks { win, place, show }.
  const STRATEGIES = {
    favorites: function (race) {
      const sorted = race.slice().sort(function (a, b) {
        return (b.mockSpeed || 0) - (a.mockSpeed || 0);
      });
      return { win: sorted[0], place: sorted[1], show: sorted[2] };
    },
    random: function (race) {
      const shuffled = race.slice().sort(function () { return Math.random() - 0.5; });
      return { win: shuffled[0], place: shuffled[1], show: shuffled[2] };
    },
    longshots: function (race) {
      const sorted = race.slice().sort(function (a, b) {
        return (a.mockSpeed || 0) - (b.mockSpeed || 0);
      });
      return { win: sorted[0], place: sorted[1], show: sorted[2] };
    },
    // "Smart but cheap" — top favorite for WIN (where it cascades), then 4th & 5th
    // favorites for PLACE/SHOW so you don't double-bet on the same field strength.
    spread: function (race) {
      const sorted = race.slice().sort(function (a, b) {
        return (b.mockSpeed || 0) - (a.mockSpeed || 0);
      });
      return { win: sorted[0], place: sorted[3], show: sorted[4] };
    },
  };

  function simulateRaces(numRaces, strategyName, betTier, useReal) {
    if (typeof betTier !== 'number') betTier = 100;
    const strategy = STRATEGIES[strategyName];
    if (!strategy) throw new Error('Unknown strategy: ' + strategyName);
    function generate() {
      if (useReal && global.WikiraceRealHorses) {
        const r = WikiraceRealHorses.generateRealRace();
        if (r) return r;
      }
      return WikiraceRace.generateRace();
    }

    const wagerPerRace = betTier * 3;
    let totalWagered = 0;
    let totalPaid = 0;
    let hits = 0;
    let sumProfit = 0;
    let sumProfitSq = 0;
    let bestRace = -Infinity;
    let worstRace = Infinity;

    for (let i = 0; i < numRaces; i++) {
      const race = generate();
      const picks = strategy(race);
      const order = WikiraceRace.runRace(race);
      const payout = WikiraceBetting.resolveBet(picks, order, betTier);
      const profit = payout - wagerPerRace;

      totalWagered += wagerPerRace;
      totalPaid += payout;
      if (payout > 0) hits++;
      sumProfit += profit;
      sumProfitSq += profit * profit;
      if (profit > bestRace) bestRace = profit;
      if (profit < worstRace) worstRace = profit;
    }

    const meanProfit = sumProfit / numRaces;
    const variance = (sumProfitSq / numRaces) - (meanProfit * meanProfit);
    const stdDev = Math.sqrt(Math.max(0, variance));

    return {
      strategy: strategyName,
      numRaces: numRaces,
      betTier: betTier,
      totalWagered: totalWagered,
      totalPaid: totalPaid,
      meanProfit: meanProfit,
      stdDev: stdDev,
      hitRate: hits / numRaces,
      houseEdge: 1 - (totalPaid / totalWagered),
      returnPerCoin: totalPaid / totalWagered,
      bestRace: bestRace,
      worstRace: worstRace,
    };
  }

  function simulateAllStrategies(numRaces, betTier, useReal) {
    const names = Object.keys(STRATEGIES);
    const results = {};
    for (let i = 0; i < names.length; i++) {
      results[names[i]] = simulateRaces(numRaces, names[i], betTier, useReal);
    }
    return results;
  }

  global.WikiraceSim = {
    STRATEGIES: STRATEGIES,
    simulateRaces: simulateRaces,
    simulateAllStrategies: simulateAllStrategies,
  };
})(window);
