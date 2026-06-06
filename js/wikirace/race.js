/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE RACE  —  pure race generator + deterministic finish order      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   generateRace() ──► Array<Horse>(9)                                     │
  │       └─ picks 9 unique entries from WikiraceHorses (mock pool)          │
  │                                                                          │
  │   runRace(horses) ──► Array<Horse & {racePerformance}> sorted desc       │
  │       └─ racePerformance = max(0, realSpeed ?? mockSpeed)                │
  │          (deterministic — no noise, no compression)                      │
  │                                                                          │
  │   Consumers:                                                             │
  │     WikiraceSim.simulateRaces (per-race generate+run)                    │
  │     WikiraceGame.newRace / placeBet (mock-fallback path)                 │
  │     test harness (page.js #run-race / #run-race-real)                    │
  │                                                                          │
  │   Exports (window.WikiraceRace): { generateRace, runRace }               │
  │   External deps: WikiraceHorses                                          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  generateRace()→Horse[9]: pool=WikiraceHorses.slice; ∀i<9&&pool.len: idx=rnd*pool.len; race.push(pool.splice(idx,1)[0])
  runRace(horses)→Horse[]+racePerformance sorted desc: map(h→assign(h,{racePerformance:max(0, h.realSpeed??h.mockSpeed)})); sort by racePerformance desc (deterministic, no noise)
  exports: global.WikiraceRace={generateRace,runRace}
*/

(function (global) {
  // Pick 9 unique horses from the pool.
  function generateRace() {
    const pool = WikiraceHorses.slice();
    const race = [];
    for (let i = 0; i < 9 && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      race.push(pool.splice(idx, 1)[0]);
    }
    return race;
  }

  // Pure deterministic finish order: whoever has the most pageviews wins.
  // No noise, no compression. realSpeed is the sum of both articles' average
  // daily pageviews — equivalently, the 30-day total scaled. Sorting by it is
  // the same as sorting by 30-day total.
  function runRace(horses) {
    return horses.map(function (h) {
      const raw = (typeof h.realSpeed === 'number') ? h.realSpeed : h.mockSpeed;
      return Object.assign({}, h, { racePerformance: Math.max(0, raw) });
    }).sort(function (a, b) { return b.racePerformance - a.racePerformance; });
  }

  global.WikiraceRace = {
    generateRace,
    runRace,
  };
})(window);
