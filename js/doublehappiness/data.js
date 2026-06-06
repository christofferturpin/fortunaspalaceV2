/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DOUBLE HAPPINESS DATA — video pairs library + zodiac ladder constants   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Entry point: IIFE on load. Synchronous shell + async upgrade.          │
  │                                                                          │
  │   Constants (window.DoubleHappinessData):                                │
  │      VIDEOS     ──► [{id?,q?,title,views}]  curated YouTube list (live)  │
  │      ZODIAC     ──► [{ name, glyph, blurb }]  12 placemat animals        │
  │      LADDER     ──► { RUNGS:12, BASE:0.35, GROWTH:1.40 }                 │
  │      FORTUNES   ──► [str]  cookie-slip aphorisms                         │
  │      ready      ──► Promise resolved after the async upgrade settles     │
  │                                                                          │
  │   VIDEOS resolution (priority high → low):                               │
  │     1. assets/json/top_1000_youtube_videos.json — fetched async. Only    │
  │        entries with a valid 11-char `id` field are kept. The current     │
  │        scrape has no IDs (only search-page URLs), so this layer is a     │
  │        no-op until someone enriches it via YouTube Data API resolver.    │
  │     2. window.DoubleHappinessGenerated — optional sync pool from         │
  │        tools/fetch-yt-videos.js. Direct embed by id.                     │
  │     3. HARDCODED — ~28 hand-verified canonical viral IDs. Direct embed.  │
  │                                                                          │
  │   Every entry MUST have `id` (11-char YouTube video ID). YouTube         │
  │   deprecated the listType=search embed mode in 2023, so titles alone     │
  │   no longer work as a fallback — entries without an `id` are dropped.    │
  │                                                                          │
  │   The JSON fetch may fail on file:// (Chrome blocks local fetches);      │
  │   running via a local server gets you the JSON pool when populated.      │
  │                                                                          │
  │   Exports (window.DoubleHappinessData): { VIDEOS, ZODIAC, LADDER,        │
  │      FORTUNES, ready }                                                   │
  │   External deps: assets/json/top_1000_youtube_videos.json (async),       │
  │     window.DoubleHappinessGenerated (sync optional)                      │
  │   Consumers: js/doublehappiness/page.js                                  │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  HARDCODED=[28 {id:str,title:str,views:int}]  range≈325M..15.4B  // hand-verified IDs
  Generated=global.DoubleHappinessGenerated  // optional; from fetch-yt-videos.js
  VIDEOS = (Array.isArray(Generated)&&Generated.length>=2 ? Generated : HARDCODED).slice()
  ready = (async()→fetch('../assets/json/top_1000_youtube_videos.json')→json→
    map v→{q:v.title,title:v.title,views:v.views} filter views>0→length≥2→
    VIDEOS.length=0; VIDEOS.push(...transformed); catch→keep sync)()
  ZODIAC=[12 {name,glyph,blurb}]  // Rat→Pig placemat order
  LADDER={RUNGS:12,BASE:0.35,GROWTH:1.40}  // breakeven rung 4, max≈22× at rung 12
  FORTUNES=[~24 str]  // fortune-cookie strips
  exports: window.DoubleHappinessData={VIDEOS,ZODIAC,LADDER,FORTUNES,ready}
*/

(function (global) {
  // Hand-curated fallback list. Used when videos.generated.js isn't present.
  // Every ID below is a canonical viral video unlikely to be deleted; counts
  // are snapshots and will drift, but the relative ordering is correct.
  //
  // To grow this beyond ~28 entries, run the fetcher:
  //   node tools/fetch-yt-videos.js --key=YOUR_YOUTUBE_API_KEY
  // That writes js/doublehappiness/videos.generated.js with 200–1000 fresh
  // entries verified embeddable via the YouTube Data API.
  const HARDCODED = [
    { id: 'XqZsoesa55w', title: 'Baby Shark Dance — Pinkfong',                  views: 15_400_000_000 },
    { id: 'kJQP7kiw5Fk', title: 'Despacito — Luis Fonsi ft. Daddy Yankee',      views:  8_700_000_000 },
    { id: 'RgKAFK5djSk', title: 'See You Again — Wiz Khalifa ft. Charlie Puth', views:  6_500_000_000 },
    { id: 'JGwWNGJdvx8', title: 'Shape of You — Ed Sheeran',                    views:  6_300_000_000 },
    { id: 'OPf0YbXqDm0', title: 'Uptown Funk — Mark Ronson ft. Bruno Mars',     views:  5_700_000_000 },
    { id: '9bZkp7q19f0', title: 'Gangnam Style — PSY',                          views:  5_400_000_000 },
    { id: 'hT_nvWreIhg', title: 'Counting Stars — OneRepublic',                 views:  4_700_000_000 },
    { id: '09R8_2nJtjg', title: 'Sugar — Maroon 5',                             views:  4_500_000_000 },
    { id: 'CevxZvSJLk8', title: 'Roar — Katy Perry',                            views:  4_200_000_000 },
    { id: '60ItHLz5WEA', title: 'Faded — Alan Walker',                          views:  3_900_000_000 },
    { id: 'fRh_vgS2dFE', title: 'Sorry — Justin Bieber',                        views:  3_900_000_000 },
    { id: 'YQHsXMglC9A', title: 'Hello — Adele',                                views:  3_700_000_000 },
    { id: 'lp-EO5I60KA', title: 'Thinking Out Loud — Ed Sheeran',               views:  3_600_000_000 },
    { id: 'nfWlot6h_JM', title: 'Shake It Off — Taylor Swift',                  views:  3_500_000_000 },
    { id: 'kffacxfA7G4', title: 'Baby — Justin Bieber ft. Ludacris',            views:  3_300_000_000 },
    { id: 'uelHwf8o7_U', title: 'Love the Way You Lie — Eminem ft. Rihanna',    views:  2_500_000_000 },
    { id: 'rYEDA3JcQqw', title: 'Rolling in the Deep — Adele',                  views:  2_300_000_000 },
    { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody — Queen',                    views:  2_100_000_000 },
    { id: 'hTWKbfoikeg', title: 'Smells Like Teen Spirit — Nirvana',            views:  2_000_000_000 },
    { id: 'QGJuMBdaqIw', title: 'Firework — Katy Perry',                        views:  1_900_000_000 },
    { id: 'qrO4YZeyl0I', title: 'Bad Romance — Lady Gaga',                      views:  1_700_000_000 },
    { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up — Rick Astley',        views:  1_700_000_000 },
    { id: 'ASO_zypdnsQ', title: 'Gentleman — PSY',                              views:  1_600_000_000 },
    { id: 'y6Sxv-sUYtM', title: 'Happy — Pharrell Williams',                    views:  1_300_000_000 },
    { id: 'sOnqjkJTMaA', title: 'Thriller — Michael Jackson',                   views:  1_100_000_000 },
    { id: 'dvgZkm1xWPE', title: 'Viva la Vida — Coldplay',                      views:    770_000_000 },
    { id: 'jNQXAC9IVRw', title: 'Me at the zoo — jawed (first YouTube video)',  views:    370_000_000 },
    { id: 'KQ6zr6kCPj8', title: 'We Are Number One — LazyTown',                 views:    325_000_000 },
  ];

  // Sync layer. The fetcher-generated pool (videos.generated.js, optional)
  // wins if present; otherwise we start with HARDCODED so the first pair is
  // never empty. We `slice()` so the async upgrade below can mutate the
  // array without clobbering HARDCODED.
  const Generated = global.DoubleHappinessGenerated;
  const VIDEOS = (Array.isArray(Generated) && Generated.length >= 2
    ? Generated
    : HARDCODED
  ).slice();

  // Async layer. Fetch assets/json/top_1000_youtube_videos.json if present.
  // Only entries with a valid 11-char YouTube ID are usable (YouTube
  // deprecated the listType=search embed mode in 2023, so titles alone
  // can't be embedded). Once someone enriches that JSON with `id` fields
  // (e.g., via a YouTube Data API resolver script), this picks them up.
  // Until then we silently keep the sync fallback.
  const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const ready = (async () => {
    try {
      const r = await fetch('../assets/json/top_1000_youtube_videos.json');
      if (!r.ok) return;
      const data = await r.json();
      if (!data || !Array.isArray(data.videos)) return;
      const transformed = data.videos
        .filter((v) => v && typeof v.id === 'string' && YT_ID_RE.test(v.id) &&
                       typeof v.views === 'number' && v.views > 0)
        .map((v) => ({
          id: v.id,
          title: (typeof v.title === 'string' && v.title) || v.id,
          views: v.views,
        }));
      if (transformed.length >= 2) {
        VIDEOS.length = 0;
        VIDEOS.push(...transformed);
      }
    } catch (e) {
      // Silent — keep whatever VIDEOS already is.
    }
  })();

  // 12-animal placemat ladder. Order matches the standard zodiac cycle
  // (Rat→Ox→Tiger→...→Pig). Each rung the player climbs lights its animal.
  // Blurbs are 70s-strip-mall placemat voice — overly confident, vaguely
  // contradictory, "you are observant... but stubborn..." energy.
  const ZODIAC = [
    { name: 'Rat',     glyph: '🐀', blurb: 'Quick wit. Hoards.'             },
    { name: 'Ox',      glyph: '🐂', blurb: 'Patient. Plows ahead.'          },
    { name: 'Tiger',   glyph: '🐅', blurb: 'Brave. Often loud.'             },
    { name: 'Rabbit',  glyph: '🐇', blurb: 'Lucky. Easily frightened.'      },
    { name: 'Dragon',  glyph: '🐉', blurb: 'Charismatic. Hard to argue.'    },
    { name: 'Snake',   glyph: '🐍', blurb: 'Clever. Says little.'           },
    { name: 'Horse',   glyph: '🐎', blurb: 'Restless. Loves a road trip.'   },
    { name: 'Goat',    glyph: '🐐', blurb: 'Gentle. Prone to worry.'        },
    { name: 'Monkey',  glyph: '🐒', blurb: 'Sharp. Mischief follows.'       },
    { name: 'Rooster', glyph: '🐓', blurb: 'Punctual. Speaks freely.'       },
    { name: 'Dog',     glyph: '🐕', blurb: 'Loyal. Will defend the table.'  },
    { name: 'Pig',     glyph: '🐖', blurb: 'Honest. Eats well.'             },
  ];

  // Wager ladder. Top end was paying ~70× which made the game strictly
  // dominate every other table — pulled GROWTH 1.60 → 1.40 and BASE
  // 0.40 → 0.35 so the climb has more rungs that matter and the max
  // tops out around ~22× instead of ~70×.
  //   rung 1  = 0.35×wager (cash-out is a small loss)
  //   rung 4  ≈ 0.96× (breakeven now sits at rung 4)
  //   rung 5  ≈ 1.34× (first real profit)
  //   rung 12 ≈ 22× (max payout)
  // Strike-out wipes the pot in full.
  const LADDER = {
    RUNGS: 12,
    BASE: 0.35,
    GROWTH: 1.40,
  };

  // Fortune-cookie slips. Pulled at random for cash-out and bust flavor text
  // inside the on-screen tray. Mix of half-meant aphorisms and the small,
  // damp menace the Palace carries everywhere.
  const FORTUNES = [
    'A small loss now prevents a large one. Maybe.',
    'The wise woman bets big.',
    'You are nearer to the truth than the truth is to you.',
    'Eat slowly. The bowl is deeper than it looks.',
    'You will be remembered for the wrong reasons.',
    'Bring an umbrella.',
    'A small child watches you from far away.',
    'You have already won. The screen has not caught up.',
    'Speak less. Tip more.',
    'Your number was called. You were in the bathroom.',
    'A grandmother is proud of you for the wrong reasons.',

      // additions
  'The mountains here look like home. They are not.',
  'Your mother also liked this game.',
  'The baby is sleeping. The baby will sleep.',
  'You did the right thing.',
  'Someone in this room is from your county.',
  'You are doing better than your mother did at your age.',
  'The headache is not from the lights.',
  'The next one. The next one. The next one.',
  'Your luck has been arriving for hours. Wait.',
  'You read a book once that explained all of this.',
  'Things are looking up for the baby.',
  'The ceiling is not as high as it looks.',
  ];

  global.DoubleHappinessData = { VIDEOS, ZODIAC, LADDER, FORTUNES, ready };
})(window);
