/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE DEV PAGE  —  test harness for race/sim/cache (test.html)       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE on load ──► binds buttons + refreshCacheStatus()                  │
  │                                                                          │
  │   #run-race click ─► WikiraceRace.generateRace() ─► runRace ─► log()     │
  │                                                                          │
  │   #sim-1k / #sim-10k click ─► runSim(N, false)                           │
  │   #sim-1k-real / #sim-10k-real ─► runSim(N, true)                        │
  │       runSim(N, useReal)                                                 │
  │         ├─ WikiraceSim.simulateAllStrategies(N, 100, useReal)            │
  │         ├─ reportStrategy(label, r) ──► dumps stats to #output           │
  │         └─ tag(label, edge, lo, hi) ──► PASS/FAIL band check             │
  │                                                                          │
  │   #warm-cache click ─► async                                             │
  │         └─ WikiraceAPI.warmCache(WikiraceArticles, onProgress)           │
  │              onProgress ─► log line + refreshCacheStatus()               │
  │                                                                          │
  │   #clear-cache click ─► WikiraceAPI.clearCache() + refreshCacheStatus()  │
  │                                                                          │
  │   #run-race-real click ─► WikiraceRealHorses.generateRealRace()          │
  │         ├─ WikiraceRace.runRace(race)                                    │
  │         └─ WikiraceBetting.resolveBetDetailed(favorites picks, order)    │
  │                                                                          │
  │   helpers: clear(), log(msg), logInline(msg), formatHorse(h),            │
  │            pct(x), n(x), refreshCacheStatus()                            │
  │                                                                          │
  │   Exports: none (IIFE, side-effects only on test.html DOM)               │
  │   External deps: WikiraceAPI, WikiraceRace, WikiraceSim,                 │
  │       WikiraceRealHorses, WikiraceBetting, WikiraceArticles,             │
  │       document, performance, console                                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  els: outputEl=#output, cacheStatusEl=#cache-status
  clear(): outputEl.text=''
  log(m): outputEl.text+=m+'\n'; console.log
  logInline(m): outputEl.text+=m
  formatHorse(h)→str: (h.name1+' × '+h.name2).padEnd(50)
  pct(x)→str: (x*100).toFixed(2)+'%'
  n(x)→str: x.toLocaleString
  refreshCacheStatus(): s=API.cacheStatus(Articles); el.text='Cache: '+fresh+'/'+total+...; toggle cache-warm/cold class
  reportStrategy(label,r): log totalWagered/totalPaid/returnPerCoin/houseEdge/hitRate/meanProfit/stdDev/best/worst
  tag(label,edge,lo,hi)→str: edge∈[lo,hi]?'✓ in target':edge<lo?'✗ PLAYER-FAVORABLE':'✗ HOUSE-FAVORABLE'
  runSim(N,useReal): clear; log mode+multipliers; if useReal log cache; start=perf.now; all=Sim.simulateAllStrategies(N,100,useReal); elapsed=perf.now-start; reportStrategy×4 (favorites,spread,random,longshots); log tuning band tags; log elapsed
  bindings: #run-race→generate+runRace+log entrants&order; #sim-1k/10k→runSim(N,F); #sim-1k-real/10k-real→runSim(N,T); #warm-cache→async warmCache(Articles,onProg=log+refresh); #clear-cache→API.clearCache+refresh+log; #run-race-real→RealHorses.generateRealRace; if null→log need 18+; else runRace+log entrants+order+sample favorites bet detail (resolveBetDetailed) including total wager/paid/profit
  exports: none (IIFE side-effect); refreshCacheStatus called at end
*/

(function () {
  const outputEl = document.getElementById('output');
  const cacheStatusEl = document.getElementById('cache-status');

  function clear() { outputEl.textContent = ''; }
  function log(msg) {
    outputEl.textContent += (msg == null ? '' : msg) + '\n';
    if (typeof console !== 'undefined' && console.log) console.log(msg);
  }
  function logInline(msg) {
    outputEl.textContent += msg;
  }

  function formatHorse(h) {
    return ((h.name1 + ' × ' + h.name2)).padEnd(50, ' ');
  }
  function pct(x) { return (x * 100).toFixed(2) + '%'; }
  function n(x) { return x.toLocaleString(); }

  function refreshCacheStatus() {
    if (!cacheStatusEl) return;
    const s = WikiraceAPI.cacheStatus(WikiraceArticles || []);
    cacheStatusEl.textContent =
      'Cache: ' + s.fresh + '/' + s.total + ' fresh' +
      (s.stale ? '  · ' + s.stale + ' stale' : '') +
      (s.missing ? '  · ' + s.missing + ' missing' : '');
    if (s.fresh === s.total && s.total > 0) {
      cacheStatusEl.classList.add('cache-warm');
      cacheStatusEl.classList.remove('cache-cold');
    } else {
      cacheStatusEl.classList.remove('cache-warm');
      cacheStatusEl.classList.add('cache-cold');
    }
  }

  // === Mock Level 1 ===

  document.getElementById('run-race').addEventListener('click', function () {
    clear();
    const race = WikiraceRace.generateRace();
    const order = WikiraceRace.runRace(race);
    log('=== MOCK RACE ENTRANTS ===');
    race.forEach(function (h) {
      log('  ' + formatHorse(h) + 'base ' + n(h.mockSpeed));
    });
    log('');
    log('=== FINISH ORDER ===');
    order.forEach(function (h, i) {
      const pos = String(i + 1).padStart(2, ' ');
      log('  ' + pos + '. ' + formatHorse(h) + 'perf ' + n(Math.round(h.racePerformance)));
    });
  });

  function reportStrategy(label, r) {
    log('--- ' + label.toUpperCase() + ' ---');
    log('  total wagered      ' + n(r.totalWagered));
    log('  total paid         ' + n(r.totalPaid));
    log('  return per coin    ' + r.returnPerCoin.toFixed(4));
    log('  house edge         ' + pct(r.houseEdge));
    log('  hit rate           ' + pct(r.hitRate));
    log('  mean profit/race   ' + r.meanProfit.toFixed(1) + '  (wager ' + (r.betTier * 3) + ')');
    log('  std dev profit     ' + r.stdDev.toFixed(1));
    log('  best/worst race    +' + r.bestRace + ' / ' + r.worstRace);
    log('');
  }

  function tag(label, edge, lo, hi) {
    if (edge >= lo && edge <= hi) return label + ' ✓ in target band';
    if (edge < lo)  return label + ' ✗ TOO PLAYER-FAVORABLE (lower multipliers)';
    return label + ' ✗ TOO HOUSE-FAVORABLE (raise multipliers)';
  }

  function runSim(N, useReal) {
    clear();
    const mode = useReal ? 'REAL DATA' : 'MOCK DATA';
    log('Simulating ' + n(N) + ' races per strategy. Mode: ' + mode + '. Tier = 100 (total wager 300/race).');
    log('Multipliers: WIN=' + WikiraceBetting.WIN_MULTIPLIER +
        '  PLACE=' + WikiraceBetting.PLACE_MULTIPLIER +
        '  SHOW=' + WikiraceBetting.SHOW_MULTIPLIER);
    if (useReal) {
      const s = WikiraceAPI.cacheStatus(WikiraceArticles || []);
      log('Cache: ' + s.fresh + '/' + s.total + ' fresh — missing/stale articles fall back to median pool speed.');
    }
    log('');
    const start = performance.now();
    const all = WikiraceSim.simulateAllStrategies(N, 100, useReal);
    const elapsed = (performance.now() - start).toFixed(0);

    reportStrategy('favorites', all.favorites);
    reportStrategy('spread', all.spread);
    reportStrategy('random', all.random);
    reportStrategy('longshots', all.longshots);

    log('=== TUNING TARGETS ===');
    log('  ' + tag('favorites', all.favorites.houseEdge, 0.05, 0.10));
    log('  ' + tag('random   ', all.random.houseEdge,    0.15, 0.20));
    log('Sim took ' + elapsed + 'ms.');
  }

  document.getElementById('sim-1k').addEventListener('click', function () { runSim(1000, false); });
  document.getElementById('sim-10k').addEventListener('click', function () { runSim(10000, false); });

  // === Real Level 2 ===

  document.getElementById('warm-cache').addEventListener('click', async function () {
    clear();
    const articles = WikiraceArticles || [];
    log('Warming cache for ' + articles.length + ' articles…');
    log('(Cached entries are skipped. Network calls run serially with a polite delay.)');
    log('');

    const startTime = performance.now();
    const result = await WikiraceAPI.warmCache(articles, function (p) {
      const status = p.result.avg !== null
        ? (p.result.fromCache ? 'cached' : 'fetched ' + p.result.avg + '/day')
        : 'FAILED (' + (p.result.error || 'unknown') + ')';
      const line = String(p.done).padStart(3, ' ') + '/' + p.total + '  ' +
        p.title.padEnd(40, ' ').slice(0, 40) + '  ' + status;
      log(line);
      refreshCacheStatus();
    });
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    log('');
    log('Warmup complete in ' + elapsed + 's.');
    log('  Fetched fresh: ' + result.fetched);
    log('  Already cached: ' + result.cached);
    log('  Failed: ' + result.failed);
    refreshCacheStatus();
  });

  document.getElementById('clear-cache').addEventListener('click', function () {
    WikiraceAPI.clearCache();
    refreshCacheStatus();
    log('Cleared pageview cache.');
  });

  document.getElementById('run-race-real').addEventListener('click', function () {
    clear();
    const race = WikiraceRealHorses.generateRealRace();
    if (!race) {
      const status = WikiraceAPI.cacheStatus(WikiraceArticles || []);
      log('Cannot run a real race — only ' + status.fresh + ' verified articles in cache (need 18+).');
      log('Click "Warm Cache" first.');
      return;
    }
    const order = WikiraceRace.runRace(race);
    log('=== REAL RACE ENTRANTS ===');
    race.forEach(function (h) {
      log('  ' + formatHorse(h) + n(h.pageviews1) + ' + ' + n(h.pageviews2) + ' = ' + n(h.realSpeed));
    });
    log('');
    log('=== FINISH ORDER ===');
    order.forEach(function (h, i) {
      const pos = String(i + 1).padStart(2, ' ');
      log('  ' + pos + '. ' + formatHorse(h) + 'perf ' + n(Math.round(h.racePerformance)));
    });

    log('');
    log('=== SAMPLE BET (favorites strategy, tier 100) ===');
    const picks = WikiraceSim.STRATEGIES.favorites(race);
    const detail = WikiraceBetting.resolveBetDetailed(picks, order, 100);
    ['win', 'place', 'show'].forEach(function (slot) {
      const d = detail[slot];
      const finishLabel = (d.finishPos === -1) ? '—' : ('finish ' + (d.finishPos + 1));
      log('  ' + slot.toUpperCase().padEnd(6, ' ') + formatHorse(d.horse) +
          finishLabel.padEnd(12, ' ') + 'tier=' + d.tier.padEnd(6, ' ') + 'paid ' + d.payout);
    });
    const profit = detail.totalPayout - 300;
    log('  Total wager: 300 | Total paid: ' + detail.totalPayout +
        ' | Profit: ' + (profit >= 0 ? '+' : '') + profit);
  });

  document.getElementById('sim-1k-real').addEventListener('click', function () { runSim(1000, true); });
  document.getElementById('sim-10k-real').addEventListener('click', function () { runSim(10000, true); });

  refreshCacheStatus();
})();
