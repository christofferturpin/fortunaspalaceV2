#!/usr/bin/env node
/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FETCH YT VIDEOS — populate Double Happiness's pool from the YT API      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   main() (async) ──► searches a set of seed queries → de-dupes IDs       │
  │                  └─► hits videos.list for stats+embeddable check         │
  │                  └─► filters by viewCount + embeddable                   │
  │                  └─► sorts desc, slices to --count, writes the .js file  │
  │                                                                          │
  │   Helpers:                                                               │
  │     apiGet(endpoint,params)         ──► JSON response or throws          │
  │     searchIds(query)                ──► up to 50 video IDs               │
  │     fetchVideoDetails(ids)          ──► [{id,title,views}] filtered      │
  │     cleanTitle(s)                   ──► strip noise from snippet.title   │
  │     parseArgs()                     ──► { key, count, out, minviews }    │
  │                                                                          │
  │   Usage:                                                                 │
  │     YOUTUBE_API_KEY=... node tools/fetch-yt-videos.js                    │
  │     node tools/fetch-yt-videos.js --key=... --count=500                  │
  │     node tools/fetch-yt-videos.js --key=... --out=path/to/file.js        │
  │                                                                          │
  │   Quota math:                                                            │
  │     search.list = 100 units × ~12 seed queries          ≈ 1200 units     │
  │     videos.list =   1 unit  × ⌈candidates/50⌉ batches   ≈   12 units     │
  │     total ≈ 1212 / 10000 daily quota — re-runnable several times/day     │
  │                                                                          │
  │   Output: writes a JS file that does `window.DoubleHappinessGenerated =  │
  │     [{id,title,views}, ...]`. data.js auto-picks that up if present.     │
  │                                                                          │
  │   External deps: Node 18+ (built-in fetch). No npm packages.             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  args=parseArgs(): key=env.YOUTUBE_API_KEY||--key; count=parseInt(--count||500); out=--out||defaultPath; minviews=parseInt(--minviews||1_000_000)
  guard(!key)→err+exit(1)
  SEED_QUERIES=[~14 str spanning genres: music/viral/funny/kids/gaming/movie/cooking/...]
  apiGet(endpoint,params):async→json: URL=youtube/v3+endpoint+?key+params; fetch; !ok→throw; ret json
  searchIds(q):async→ids: apiGet('search',{part:id,q,type:video,order:viewCount,maxResults:50}); map items→id.videoId; filter Boolean
  fetchVideoDetails(ids):async→[]: chunks of 50; ∀chunk apiGet('videos',{part:snippet,statistics,status,id:chunk.join(',')}); ∀v viewCount=parseInt(stats.viewCount); embeddable=status.embeddable!==F; guard(!emb||vc<minviews); push {id,title:cleanTitle(snip.title),views:viewCount}
  cleanTitle(t)→str: strip parentheticals; collapse whitespace; truncate at 80 chars
  main():async: log; ∀q∈SEED_QUERIES try searchIds(q)→allIds add; catch→warn; log allIds.size; details=fetchVideoDetails([...allIds]); details.sort desc views; final=slice(count); banner+JSON.stringify→writeFileSync(out)
  on err in main→console.error+exit(1)
*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs() {
  const raw = process.argv.slice(2);
  const args = {};
  for (const arg of raw) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] == null ? 'true' : m[2];
  }
  return {
    key: args.key || process.env.YOUTUBE_API_KEY,
    count: Math.max(2, parseInt(args.count || '500', 10) || 500),
    out: args.out || path.join(
      __dirname, '..', 'js', 'doublehappiness', 'videos.generated.js'
    ),
    minviews: Math.max(0, parseInt(args.minviews || '1000000', 10) || 1_000_000),
    help: args.help === 'true' || args.h === 'true',
  };
}

function printHelp() {
  process.stdout.write([
    'Usage: node tools/fetch-yt-videos.js [options]',
    '',
    'Options:',
    '  --key=KEY           YouTube Data API v3 key. Falls back to',
    '                      $YOUTUBE_API_KEY. Required.',
    '  --count=N           Target number of entries to write. Default 500.',
    '  --out=PATH          Output JS file path. Default:',
    '                      js/doublehappiness/videos.generated.js',
    '  --minviews=N        Filter out videos with fewer than N views.',
    '                      Default 1,000,000.',
    '  --help, -h          Show this and exit.',
    '',
    'Get a key at https://console.cloud.google.com/apis/credentials',
    'after enabling "YouTube Data API v3".',
    '',
  ].join('\n'));
}

// Seed queries — designed to spread the pool across genres + view-count tiers.
// Each query yields up to 50 results from search.list, sorted by viewCount.
const SEED_QUERIES = [
  'official music video',
  'official video',
  'lyric video',
  'most viewed',
  'viral video',
  'funny animals',
  'movie trailer',
  'gaming highlights',
  'kids song',
  'cooking recipe',
  'reaction video',
  'tutorial',
  'commercial',
  'live performance',
];

async function apiGet(endpoint, params, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + endpoint);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(endpoint + ' ' + res.status + ' ' + res.statusText + ': ' + body.slice(0, 300));
  }
  return res.json();
}

async function searchIds(query, key) {
  const data = await apiGet('search', {
    part: 'id',
    q: query,
    type: 'video',
    order: 'viewCount',
    maxResults: 50,
  }, key);
  return (data.items || [])
    .map((it) => it.id && it.id.videoId)
    .filter(Boolean);
}

function cleanTitle(t) {
  if (!t) return '';
  let s = t;
  // Strip the common label suffixes that pad music-video titles.
  s = s.replace(/\((Official\s+(Music\s+)?Video|Official\s+Audio|Lyrics?\s+Video|HD|HQ|4K|Live|Audio)\)/gi, ' ');
  s = s.replace(/\[(Official\s+(Music\s+)?Video|Official\s+Audio|Lyrics?\s+Video|HD|HQ|4K|Live|Audio)\]/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, 77).trimEnd() + '…';
  return s;
}

async function fetchVideoDetails(ids, key, minViews) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let data;
    try {
      data = await apiGet('videos', {
        part: 'snippet,statistics,status',
        id: chunk.join(','),
      }, key);
    } catch (e) {
      console.warn('  videos.list error on chunk:', e.message);
      continue;
    }
    for (const v of (data.items || [])) {
      const viewCount = parseInt((v.statistics && v.statistics.viewCount) || '0', 10);
      const status = v.status || {};
      // status.embeddable defaults to true if absent.
      const embeddable = status.embeddable !== false;
      // privacyStatus must be public for embeds to load.
      const isPublic = !status.privacyStatus || status.privacyStatus === 'public';
      if (!embeddable || !isPublic) continue;
      if (viewCount < minViews) continue;
      const snippet = v.snippet || {};
      const title = cleanTitle(snippet.title || '') +
        (snippet.channelTitle ? ' — ' + snippet.channelTitle : '');
      out.push({ id: v.id, title, views: viewCount });
    }
  }
  return out;
}

async function main() {
  const { key, count, out, minviews, help } = parseArgs();
  if (help) {
    printHelp();
    return;
  }
  if (!key) {
    process.stderr.write('YouTube API key required. Set YOUTUBE_API_KEY or pass --key=...\n');
    process.stderr.write('Run with --help for usage.\n');
    process.exit(1);
  }

  console.log('Double Happiness — YouTube video pool fetcher');
  console.log('Target: ' + count + ' entries · min views: ' + minviews.toLocaleString());
  console.log('Output: ' + out);
  console.log('');
  console.log('Searching ' + SEED_QUERIES.length + ' seed queries…');

  const allIds = new Set();
  for (const q of SEED_QUERIES) {
    try {
      const ids = await searchIds(q, key);
      for (const id of ids) allIds.add(id);
      console.log('  [' + q.padEnd(24) + '] +' + ids.length + ' (pool ' + allIds.size + ')');
    } catch (e) {
      console.warn('  [' + q + '] error: ' + e.message);
    }
  }

  if (allIds.size < 2) {
    process.stderr.write('Pool too small (' + allIds.size + '). Aborting.\n');
    process.exit(1);
  }

  console.log('');
  console.log('Fetching details + stats for ' + allIds.size + ' candidates…');
  const details = await fetchVideoDetails([...allIds], key, minviews);
  console.log('  passed filter: ' + details.length);

  details.sort((a, b) => b.views - a.views);
  const final = details.slice(0, count);

  const banner = [
    '// Auto-generated by tools/fetch-yt-videos.js — DO NOT HAND-EDIT.',
    '// Re-run the fetcher to refresh. View counts are point-in-time snapshots.',
    '// Generated: ' + new Date().toISOString(),
    '// Entries:   ' + final.length,
    '// Filter:    embeddable & public, viewCount >= ' + minviews,
    '',
  ].join('\n');
  const body = 'window.DoubleHappinessGenerated = ' +
    JSON.stringify(final, null, 2) + ';\n';

  // Make sure the output directory exists.
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, banner + body, 'utf8');

  console.log('');
  console.log('Wrote ' + final.length + ' entries to ' + out);
  console.log('Top of pool:');
  for (const v of final.slice(0, 5)) {
    console.log('  ' + (v.views + '').padStart(13) + '  ' + v.title);
  }
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + (err && err.stack || err) + '\n');
  process.exit(1);
});
