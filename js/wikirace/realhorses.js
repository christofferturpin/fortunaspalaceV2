/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE REAL HORSES  —  9-horse race built from live cached pageviews  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   canGenerateRealRace() ──► bool                                         │
  │       └─ WikiraceAPI.getVerifiedArticles(WikiraceArticles).length >= 18  │
  │                                                                          │
  │   generateRealRace() ──► Array<Horse>(9) | null                          │
  │       │   Horse: { name1, name2, pageviews1, pageviews2,                 │
  │       │           realSpeed, mockSpeed, isReal:true }                    │
  │       │                                                                  │
  │       ├─ WikiraceAPI.getVerifiedArticles(...)  (needs ≥18)               │
  │       ├─ pickUnique(pool, 18)  ──► 18 random titles                      │
  │       └─ pairs i*2 + i*2+1 ──► each horse                                │
  │            realSpeed = WikiraceAPI.getCached(a) + getCached(b)           │
  │            mockSpeed mirrored so sort-strategies still work              │
  │                                                                          │
  │   pickUnique(arr, count) ──► Array  (internal helper, random no-replace) │
  │                                                                          │
  │   Exports (window.WikiraceRealHorses): { generateRealRace,               │
  │       canGenerateRealRace }                                              │
  │   External deps: WikiraceAPI, WikiraceArticles                           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  pickUnique(arr,count)→[]: copy=arr.slice; ∀i<count&&copy.len: idx=rnd*copy.len; out.push(copy.splice(idx,1)[0])
  canGenerateRealRace()→T/F: WikiraceAPI.getVerifiedArticles(global.WikiraceArticles||[]).len>=18
  generateRealRace()→Horse[9]|null: pool=getVerifiedArticles; pool.len<18→null; picked=pickUnique(pool,18); ∀i<9: a=picked[2i],b=picked[2i+1]; va=getCached(a),vb=getCached(b); push{name1:a,name2:b,pageviews1:va,pageviews2:vb,realSpeed:va+vb,mockSpeed:va+vb,isReal:T}
  exports: global.WikiraceRealHorses={generateRealRace,canGenerateRealRace}
*/

(function (global) {
  function pickUnique(arr, count) {
    const copy = arr.slice();
    const out = [];
    for (let i = 0; i < count && copy.length; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }

  // True if there are at least 18 verified articles available — enough to fill
  // a 9-horse race. Verified = fresh cache hit with a positive pageview avg.
  function canGenerateRealRace() {
    const pool = WikiraceAPI.getVerifiedArticles(global.WikiraceArticles || []);
    return pool.length >= 18;
  }

  // Generate a 9-horse race from the verified article pool. Each horse pairs
  // two random articles; the horse's `realSpeed` = sum of pageview averages.
  // No fallback values — if there aren't enough verified articles, returns
  // null and callers should fall back to a mock race.
  function generateRealRace() {
    const pool = WikiraceAPI.getVerifiedArticles(global.WikiraceArticles || []);
    if (pool.length < 18) return null;
    const picked = pickUnique(pool, 18);
    const horses = [];
    for (let i = 0; i < 9; i++) {
      const a = picked[i * 2];
      const b = picked[i * 2 + 1];
      const va = WikiraceAPI.getCached(a);
      const vb = WikiraceAPI.getCached(b);
      horses.push({
        name1: a,
        name2: b,
        pageviews1: va,
        pageviews2: vb,
        realSpeed: va + vb,
        // mockSpeed kept in sync so strategies (which sort by mockSpeed) work.
        mockSpeed: va + vb,
        isReal: true,
      });
    }
    return horses;
  }

  global.WikiraceRealHorses = {
    generateRealRace: generateRealRace,
    canGenerateRealRace: canGenerateRealRace,
  };
})(window);
