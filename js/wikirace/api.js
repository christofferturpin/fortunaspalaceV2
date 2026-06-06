/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE API  —  Wikimedia pageview fetch + 24h localStorage cache      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   localStorage key: 'wikirace_pageview_cache'   TTL: 24h                 │
  │   API: wikimedia.org REST v1 pageviews/per-article (past 30-day window)  │
  │                                                                          │
  │   fetchPageviews(title) ──► Promise<{avg,fromCache}|{avg:null,error}>    │
  │       │                                                                  │
  │       ├─ readCache() ──► cache obj from localStorage                     │
  │       ├─ isFresh(entry) ──► bool (within 24h)                            │
  │       ├─ if fresh+ok ─► return cached                                    │
  │       ├─ if fresh+failed(non-network) ─► return cached error             │
  │       ├─ dateWindow() ──► {start,end} YYYYMMDD (yest-30d..yest)          │
  │       ├─ urlFor(title,start,end) ──► REST URL                            │
  │       ├─ fetch ─► parse items[] ─► avg = round(sum/len)                  │
  │       └─ setCached(title,avg) or setCachedFailed(title,errorTag)         │
  │                                                                          │
  │   warmCache(articles, onProgress) ──► {done,fetched,cached,failed}       │
  │       └─ loops fetchPageviews serially with SERIAL_DELAY_MS=60ms         │
  │                                                                          │
  │   getCached(title) ──► avg|null   (fresh successful entries only)        │
  │   getVerifiedArticles(articles) ──► subset with fresh +ve avg            │
  │   cacheStatus(articles) ──► {total,fresh,stale,missing,failed}           │
  │   clearCache() ──► wipes localStorage entry                              │
  │                                                                          │
  │   Exports (window.WikiraceAPI): { fetchPageviews, warmCache, getCached,  │
  │       getVerifiedArticles, cacheStatus, clearCache, CACHE_KEY,           │
  │       CACHE_TTL_MS }                                                     │
  │   External deps: fetch, localStorage, console                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CACHE_KEY='wikirace_pageview_cache'; CACHE_TTL_MS=24h; API_BASE=wikimedia REST per-article; SERIAL_DELAY_MS=60
  readCache()→obj: try JSON.parse(localStorage[KEY])||{} catch→{}
  writeCache(c): try localStorage[KEY]=JSON(c)
  isFresh(e)→T/F: e && now-e.fetchedAt<=TTL
  getCached(t)→avg|null: e=cache[t]; !fresh||e.failed→null; ret e.avg
  setCached(t,avg): cache[t]={avg,fetchedAt:now}; write
  setCachedFailed(t,err): cache[t]={avg:null,failed:T,error:err,fetchedAt:now}; write
  getVerifiedArticles(arts)→string[]: ∀t∈arts if fresh && !failed && avg>0 → push
  clearCache(): try localStorage.rm(KEY)
  fmtDate(d)→YYYYMMDD: UTC y+m(pad)+d(pad)
  urlFor(t,s,e)→url: API_BASE+'/'+encode(t.replace(' ','_'))+'/daily/'+s+'/'+e
  dateWindow()→{start,end}: end=yest, start=end-29d (30d window)
  fetchPageviews(t)→async{avg,fromCache}|{avg:null,error}: e=cache[t]; fresh+ok→ret cached; fresh+failed(non-net)→ret cached err; fetch(url); !ok→setCachedFailed+ret http_; data.items.len==0→setCachedFailed('no_data'); avg=round(Σviews/len); avg<=0→setCachedFailed('no_views'); setCached(t,avg)→ret{avg,fromCache:F}; catch→{avg:null,error:'network'} (no persist)
  warmCache(arts,onProg)→async{done,fetched,cached,failed}: ∀t serial: res=await fetchPageviews; tally; onProg({done,total,title,result,...}); if !fromCache && avg!==null → await delay(SERIAL_DELAY_MS)
  cacheStatus(arts)→{total,fresh,stale,missing,failed}: ∀t∈arts classify cache[t]
  exports: global.WikiraceAPI={fetchPageviews,warmCache,getCached,getVerifiedArticles,cacheStatus,clearCache,CACHE_KEY,CACHE_TTL_MS}
*/

(function (global) {
  const CACHE_KEY = 'wikirace_pageview_cache';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const API_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents';
  // Wikipedia's REST gateway is generous on read limits but be polite.
  const SERIAL_DELAY_MS = 60;

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function writeCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
    catch (e) {}
  }

  function isFresh(entry) {
    return entry && (Date.now() - entry.fetchedAt <= CACHE_TTL_MS);
  }

  // Returns the average daily pageviews for `title` if cached, fresh, and
  // successful (not a known failure). Otherwise null.
  function getCached(title) {
    const entry = readCache()[title];
    if (!isFresh(entry)) return null;
    if (entry.failed) return null;
    return entry.avg;
  }

  function setCached(title, avg) {
    const cache = readCache();
    cache[title] = { avg: avg, fetchedAt: Date.now() };
    writeCache(cache);
  }

  function setCachedFailed(title, errorTag) {
    const cache = readCache();
    cache[title] = { avg: null, failed: true, error: errorTag, fetchedAt: Date.now() };
    writeCache(cache);
  }

  // Subset of `articles` whose cache entries are fresh, successful, and have
  // a positive avg pageview. These are the only titles safe to use for races
  // — pageview totals will be revealed to the player at race end.
  function getVerifiedArticles(articles) {
    const cache = readCache();
    const out = [];
    for (let i = 0; i < articles.length; i++) {
      const t = articles[i];
      const e = cache[t];
      if (isFresh(e) && !e.failed && typeof e.avg === 'number' && e.avg > 0) {
        out.push(t);
      }
    }
    return out;
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  function fmtDate(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + m + day;
  }

  function urlFor(title, startYmd, endYmd) {
    const safe = encodeURIComponent(title.replace(/ /g, '_'));
    return API_BASE + '/' + safe + '/daily/' + startYmd + '/' + endYmd;
  }

  // Past-30-day window: yesterday minus 30 days, through yesterday.
  // Wikimedia's pageview API doesn't return today (still aggregating).
  function dateWindow() {
    const now = new Date();
    const end = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  // Returns Promise resolving to { avg, fromCache } or { avg: null, error }.
  // Failures are persisted to cache so subsequent races can filter them out
  // without re-trying every load. Network failures use a shorter retry window.
  async function fetchPageviews(title) {
    const cache = readCache();
    const existing = cache[title];
    if (isFresh(existing) && !existing.failed && typeof existing.avg === 'number') {
      return { avg: existing.avg, fromCache: true };
    }
    if (isFresh(existing) && existing.failed && existing.error !== 'network') {
      // Known-bad title (404, no_data) — don't retry within TTL.
      return { avg: null, error: existing.error, fromCache: true };
    }

    const w = dateWindow();
    try {
      const res = await fetch(urlFor(title, w.start, w.end));
      if (!res.ok) {
        console.warn('[wikirace] HTTP ' + res.status + ' for', title);
        setCachedFailed(title, 'http_' + res.status);
        return { avg: null, error: 'http_' + res.status };
      }
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        console.warn('[wikirace] no items for', title);
        setCachedFailed(title, 'no_data');
        return { avg: null, error: 'no_data' };
      }
      const total = data.items.reduce(function (s, it) { return s + (it.views || 0); }, 0);
      const avg = Math.round(total / data.items.length);
      if (avg <= 0) {
        // Article returned 0 views — treat as failed so we don't show 0/day in reveals.
        setCachedFailed(title, 'no_views');
        return { avg: null, error: 'no_views' };
      }
      setCached(title, avg);
      return { avg: avg, fromCache: false };
    } catch (e) {
      console.warn('[wikirace] fetch error for', title, e);
      // Don't persist network failures — they should be retried.
      return { avg: null, error: 'network' };
    }
  }

  // Walk the article list, fetching any not already fresh in cache.
  // onProgress(done, total, title, result) called after each.
  async function warmCache(articles, onProgress) {
    let done = 0;
    let fetched = 0;
    let cached = 0;
    let failed = 0;
    for (let i = 0; i < articles.length; i++) {
      const title = articles[i];
      const result = await fetchPageviews(title);
      done++;
      if (result.avg !== null) {
        if (result.fromCache) cached++;
        else fetched++;
      } else {
        failed++;
      }
      if (onProgress) onProgress({ done: done, total: articles.length, title: title, result: result, fetched: fetched, cached: cached, failed: failed });
      if (!result.fromCache && result.avg !== null && SERIAL_DELAY_MS > 0) {
        await new Promise(function (r) { setTimeout(r, SERIAL_DELAY_MS); });
      }
    }
    return { done: done, fetched: fetched, cached: cached, failed: failed };
  }

  // Snapshot of which titles in `articles` have fresh cached values.
  function cacheStatus(articles) {
    const cache = readCache();
    let fresh = 0;
    let stale = 0;
    let missing = 0;
    let failed = 0;
    for (let i = 0; i < articles.length; i++) {
      const entry = cache[articles[i]];
      if (!entry) missing++;
      else if (!isFresh(entry)) stale++;
      else if (entry.failed) failed++;
      else fresh++;
    }
    return { total: articles.length, fresh: fresh, stale: stale, missing: missing, failed: failed };
  }

  global.WikiraceAPI = {
    fetchPageviews: fetchPageviews,
    warmCache: warmCache,
    getCached: getCached,
    getVerifiedArticles: getVerifiedArticles,
    cacheStatus: cacheStatus,
    clearCache: clearCache,
    CACHE_KEY: CACHE_KEY,
    CACHE_TTL_MS: CACHE_TTL_MS,
  };
})(window);
