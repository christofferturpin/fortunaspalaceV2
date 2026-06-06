#!/usr/bin/env node
/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  RESOLVE YT TITLES — attach video IDs to top_1000_youtube_videos.json    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   main() (async)                                                         │
  │     ├─ read assets/json/top_1000_youtube_videos.json                     │
  │     ├─ snapshot a .backup.<ts> sibling before mutating                   │
  │     ├─ for each entry without a valid `id`:                              │
  │     │    └─ resolveOne(title) ──► tries each public instance in turn     │
  │     │         ├─ piped:     GET <base>/search?q=...&filter=videos        │
  │     │         └─ invidious: GET <base>/api/v1/search?q=...&type=video    │
  │     ├─ writes progress every N (25) entries for crash resilience         │
  │     └─ final write w/ counts: resolved / skipped / failed                │
  │                                                                          │
  │   Usage:                                                                 │
  │     node tools/resolve-yt-titles.js                                      │
  │     node tools/resolve-yt-titles.js --pace=800 --max=200                 │
  │     node tools/resolve-yt-titles.js --instances=https://yewtu.be,...     │
  │                                                                          │
  │   Flags:                                                                 │
  │     --pace=MS         delay between requests (default 600)               │
  │     --max=N           stop after resolving N new entries (default ∞)     │
  │     --in=PATH         input JSON (default top_1000_youtube_videos.json)  │
  │     --instances=A,B   comma-separated instance bases (defaults below)    │
  │     --redo            ignore existing `id` fields, re-resolve everything │
  │     --help            print this and exit                                │
  │                                                                          │
  │   Realities:                                                             │
  │     * Public Piped/Invidious instances go down often — the list below    │
  │       is current at write time and WILL bit-rot. Update via --instances. │
  │     * 1000 entries × 600ms ≈ 10 minutes. Drop --pace if you don't care   │
  │       about being polite. Don't drop below ~200ms or you'll get banned.  │
  │     * The script is resumable: re-run anytime to continue where it       │
  │       left off (already-resolved entries are skipped unless --redo).     │
  │     * First search result is usually the canonical video but not         │
  │       always — accept a small wrong-video rate.                          │
  │                                                                          │
  │   External deps: Node 18+ (built-in fetch). No npm packages.             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  args=parseArgs(): pace=Number(--pace||600); max=Number(--max||Infinity); inPath=--in||default; redo=--redo!==undefined; help
  INSTANCES=[piped × 2 + invidious × 3]  // public bases, will rot
  YT_ID_RE=/^[A-Za-z0-9_-]{11}$/
  sleep(ms)→Promise
  searchPiped(base,q):async→id|null: GET base+'/search?q=Q&filter=videos'; items[0].url match /v=(11chars)/
  searchInvidious(base,q):async→id|null: GET base+'/api/v1/search?q=Q&type=video'; arr[0].videoId match YT_ID_RE
  resolveOne(q):async→{id,instance}|{id:null,error}: ∀inst try search; ret first success; else last err
  main():async: read JSON; backup w/ ts suffix; ∀v∈videos: skip if v.id valid && !redo; resolve→v.id=id || ++failed; every 25 + on finish write JSON
  SIGINT→writeBack+exit(130)
*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_JSON = path.join(__dirname, '..', 'assets', 'json', 'top_1000_youtube_videos.json');

// Current Piped/Invidious bases. These rot — when the script starts erroring,
// pick fresh URLs from https://piped-instances.kavin.rocks or
// https://api.invidious.io/ and pass them with --instances=...
const DEFAULT_INSTANCES = [
  { kind: 'piped',     url: 'https://pipedapi.kavin.rocks' },
  { kind: 'piped',     url: 'https://pipedapi.adminforge.de' },
  { kind: 'invidious', url: 'https://yewtu.be' },
  { kind: 'invidious', url: 'https://vid.puffyan.us' },
  { kind: 'invidious', url: 'https://invidious.fdn.fr' },
];

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] == null ? 'true' : m[2];
  }
  return {
    pace: Math.max(0, parseInt(args.pace || '600', 10) || 600),
    max: parseInt(args.max || '0', 10) || Infinity,
    inPath: args.in || DEFAULT_JSON,
    redo: args.redo === 'true',
    instances: args.instances
      ? args.instances.split(',').map((u) => guessInstance(u.trim()))
      : DEFAULT_INSTANCES,
    help: args.help === 'true' || args.h === 'true',
  };
}

function guessInstance(url) {
  // Allow bare URLs in --instances by guessing the kind from the host.
  const kind = /pipedapi|piped\.video/i.test(url) ? 'piped' : 'invidious';
  return { kind, url };
}

function printHelp() {
  process.stdout.write([
    'Usage: node tools/resolve-yt-titles.js [options]',
    '',
    'Reads assets/json/top_1000_youtube_videos.json, attaches an `id` field',
    'to each entry by querying public Piped/Invidious instances, and writes',
    'the JSON back. Resumable — re-run to continue.',
    '',
    'Options:',
    '  --pace=MS          Delay between requests in ms. Default 600.',
    '  --max=N            Stop after resolving N new entries.',
    '  --in=PATH          Input JSON path. Defaults to top_1000_youtube_videos.json.',
    '  --instances=A,B,C  Comma-separated Piped/Invidious bases.',
    '  --redo             Re-resolve entries that already have an id.',
    '  --help             This message.',
    '',
  ].join('\n'));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'doublehappiness-resolver/1.0' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function searchPiped(base, query) {
  const url = base + '/search?q=' + encodeURIComponent(query) + '&filter=videos';
  const data = await fetchJson(url);
  const items = (data && data.items) || [];
  for (const it of items) {
    if (typeof it.url === 'string') {
      const m = it.url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  }
  return null;
}

async function searchInvidious(base, query) {
  const url = base + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=video';
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return null;
  for (const it of data) {
    if (it && typeof it.videoId === 'string' && YT_ID_RE.test(it.videoId)) {
      return it.videoId;
    }
  }
  return null;
}

async function resolveOne(query, instances) {
  let lastErr = null;
  for (const inst of instances) {
    try {
      const id = inst.kind === 'piped'
        ? await searchPiped(inst.url, query)
        : await searchInvidious(inst.url, query);
      if (id) return { id, instance: inst.url };
    } catch (e) {
      lastErr = e;
    }
  }
  return { id: null, error: lastErr };
}

let doc, outPath, dirty;

function writeBack() {
  if (!dirty) return;
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
  dirty = false;
}

async function main() {
  const opts = parseArgs();
  if (opts.help) { printHelp(); return; }

  outPath = opts.inPath;
  console.log('Resolver — Piped/Invidious title-to-ID');
  console.log('Input:     ' + outPath);
  console.log('Pace:      ' + opts.pace + 'ms');
  console.log('Max new:   ' + (opts.max === Infinity ? '∞' : opts.max));
  console.log('Instances: ' + opts.instances.map((i) => i.url).join(', '));
  console.log('');

  let raw;
  try { raw = fs.readFileSync(outPath, 'utf8'); }
  catch (e) {
    process.stderr.write('Cannot read ' + outPath + ': ' + e.message + '\n');
    process.exit(1);
  }
  doc = JSON.parse(raw);
  if (!Array.isArray(doc.videos)) {
    process.stderr.write('Invalid JSON: expected { videos: [...] }\n');
    process.exit(1);
  }

  // Snapshot before mutating, just in case.
  const backupPath = outPath + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, raw, 'utf8');
  console.log('Backup written: ' + backupPath);
  console.log('');

  // Save partial progress on Ctrl-C.
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log('\nInterrupted — saving partial progress…');
    writeBack();
    process.exit(130);
  });

  const total = doc.videos.length;
  let resolved = 0;
  let skipped = 0;
  let failed = 0;
  let processedNew = 0;

  for (let i = 0; i < total; i++) {
    if (interrupted) break;
    const v = doc.videos[i];
    if (!opts.redo && typeof v.id === 'string' && YT_ID_RE.test(v.id)) {
      skipped++;
      continue;
    }
    const title = (v.title || '').trim();
    if (!title) {
      failed++;
      continue;
    }

    const { id, error } = await resolveOne(title, opts.instances);
    if (id) {
      v.id = id;
      resolved++;
      dirty = true;
    } else {
      failed++;
      if (error) console.warn('  rank ' + v.rank + ' "' + title.slice(0, 50) + '" — ' + error.message);
    }
    processedNew++;

    if (processedNew % 25 === 0) {
      console.log(
        '  [' + String(i + 1).padStart(4) + '/' + total + ']' +
        ' resolved=' + resolved +
        ' failed=' + failed +
        '   (saving…)'
      );
      writeBack();
    }

    if (processedNew >= opts.max) {
      console.log('Hit --max=' + opts.max + ', stopping.');
      break;
    }

    await sleep(opts.pace);
  }

  writeBack();
  console.log('');
  console.log('Done. resolved=' + resolved + ' skipped=' + skipped + ' failed=' + failed);
  console.log('Output: ' + outPath);
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + (err && err.stack || err) + '\n');
  writeBack();
  process.exit(1);
});
