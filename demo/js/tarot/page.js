/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  TAROT/PAGE.JS — Fortuna's AIC mash, single-page flow, two-major glitch  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  clickDeck ──► draw()                                                    │
  │                 ├─ drawCount<2: drawReading()                            │
  │                 │     ├─ findValidatedSpread → searchArtworks (≤200)     │
  │                 │     ├─ renderFrame(art) — sets img.src, waits, fills   │
  │                 │     │   plaque; returns false if image fails (404 /    │
  │                 │     │   decode / taint) → re-roll up to MAX_IMAGE_     │
  │                 │     │   RETRIES (3) fresh spreads before giving up.    │
  │                 │     └─ animateSpread(majors, minors, picks)            │
  │                 └─ drawCount=2: drawFinalMajors()                        │
  │                       ├─ pickTwoDistinct(MAJORS) → [m1, m2]              │
  │                       ├─ animateGlitchCard×2 (slot 0: m1.warp; slot 1:   │
  │                       │   m2.color — each card shows its active half)    │
  │                       └─ renderGlitch([m1, m2])  — 2-pass chain          │
  │                             ├─ applyEffect(m1.warp,  ctx, A,     B)      │
  │                             ├─ applyEffect(m2.color, ctx, snap,  B)      │
  │                             ├─ overlaySplatter (5 hues × overlay blend)  │
  │                             └─ overlayChildFace (burned, 5-pass)         │
  │                                                                          │
  │  clickReset ──► resetReading + drawCount=0 + scroll back to decks        │
  │                                                                          │
  │  Effects (18 total — each major carries one warp + one color):           │
  │    WARPS (9):  datamosh · sliceshuffle · wavewarp · shear · ripple ·     │
  │                scanshift · pixelsort · mirror · swirl                    │
  │    COLORS (9): channelswap · difference · invert · huerotate · duotone · │
  │                colorize · threshold · posterize · gradient               │
  │  External deps: window.Child.describeFace, window.TarotFortune.compose,  │
  │                 AIC API.                                                 │
  │  No exports.                                                             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  data: MAJORS[22]={name,meaning,year,mediums[3],effect∈{difference,
        datamosh,channelswap,sliceshuffle,wavewarp}}; MINORS[56]={name,
        meaning,searches[3]}; EFFECT_LABEL={fx→Title Case}.
  consts: API='api.artic.edu/api/v1/'; IIIF='www.artic.edu/iiif/2/';
        ARTIC_PAGE='www.artic.edu/artworks/'; FIELDS=id,title,...,
        image_id; VALIDATE_MAX_TRIES=200.
  state: drawing=F; drawCount∈{0,1,2,3}; QUOTES=[3 fallback strings];
        el={status,decks,spread,glitch,glitchCanvas,glitchLabel,frames[2],
        majorDeck,minorDeck,majorPile,minorPile,ctaReset}.
  helpers: pickOne(arr)→rnd; pickTwoDistinct(arr)→[a,b,a≠b];
        sleep(ms); nextFrame()→rAF×2; escapeHtml; setStatus(t,err?);
        setMood(m); setLastLogin()→writes today's date to #profile-login.
  query: buildQuery(terms,classification,y0,y1) → 'params='+encode(JSON{
        q:terms.join(' '), query.bool.must:[term is_public_domain=T,
        term classification_titles.keyword=cls, range date_start lte y1,
        range date_end gte y0, multi_match q={terms} fields=[title,
        description,subject_titles,term_titles,category_titles]
        operator='and'], fields, limit:50}).
  jitteredYearWindow(y) → [y-rnd(30,90), y+rnd(30,90)].
  search: searchArtworks(q)→data.data[] | throw.
  art: pickOneArt(arts)→rnd w/ image_id | null.
  validate: findValidatedSpread() loops≤200: pick m0,m1∈MAJORS + n0,n1∈
        MINORS, pickOne medium/search0/search1, jitteredYearWindow,
        searchArtworks → pickOneArt → {m0,m1,n0,n1,picks,art} | null.
        Every 5 misses setStatus('Still shuffling… (i)').
  animation: makeSlot(role,card,val,rot) → div.slot > div.flipper >
        div.face.back + div.face.front. placeSlotAtDeck(slot,pile) sets
        flipper --fx,--fy from rect deltas. pulseDeck(deck) toggles
        .dealing for top-shell lift anim.
  spread: animateSpread(m0,m1,n0,n1,drawIdx,picks): makeSlot×4
        (Year/Medium/Term/Term, data-draw=drawIdx) → spread, place×4,
        nextFrame, pulseDeck+dealt staggered 240ms, flipped staggered
        280ms.
  finalCard: animateGlitchCard(major,slotIdx) → data-draw=2 +
        data-glitchSlot=slotIdx (0|1 → col 2|3), place,deal,flip.
  effects (parameters jittered per call):
    effectDifference: drawA, composite='difference', drawB, getImageData
        → histogram-stretch [0,maxChannel]→255 × rnd(1.0,1.8), put.
    effectDatamosh: drawA + 4..8 tearBlocks (random src + ±20..50% tear
        offset) + 10..20 hBands + 6..14 vBands + 0..3 stutterCopies
        (getImageData→shifted putImageData) + 150..400 noise pixels in
        #ff66cc/#9bdc82.
    effectChannelSwap: dataA + dataB → R=A,G=B,B=A; then shift R (60%) or
        G (40%) channel ±2..8 px.
    effectSliceShuffle: loop y<size: pick A|B, rnd src Y, drawImage one
        slice height ∈ [3,30] px.
    effectWaveWarp: rowH=2 row-by-row: drawImage A with offset=
        sin(y*freq)*amplitude (amp 8..36, freq 0.03..0.08); then
        composite='screen' drawB on top.
  chain: applyEffect(fx,ctx,a,b,size) is the 5-way dispatcher.
        snapshotCanvas(canvas)→Image from canvas.toDataURL.
        renderGlitch([m1,m2]): waitImage A,B; applyEffect(m1.effect,A,B);
        snap1=snapshot; applyEffect(m2.effect,snap1,B); snap2=snapshot;
        effectChannelSwap(snap2,B) [guaranteed color pass]; overlayQuote
        + overlayChildFace; glitchLabel='m1.label × m2.label';
        glitch.hidden=F; .shown; scrollIntoView.
  overlays:
    overlayQuote(ctx,size): rnd QUOTES; ensureQuoteFont(fontPx); wrapLines
        to 84%; 3-pass shadowBlur 36/14/4 in #c2dca2/#9bdc82 on italic
        IM Fell English.
    overlayChildFace(ctx,size): face=Child.describeFace(state).frames[0]
        | '(o_o)'; Press Start 2P 14% size; 5-pass shadowBlur 120/72/40/
        18/6 in #c2dca2/#9bdc82; bias bottom-third.
  main:
    drawReading(): el.decks +.shuffling; findValidatedSpread; renderFrame
        (gallery img + later sampled by renderGlitch); animateSpread;
        drawCount++; setMood half-drawn|ready to mash.
    drawFinalMajors(): pickTwoDistinct(MAJORS); animateGlitchCard(m1,0)
        + animateGlitchCard(m2,1); renderGlitch([m1,m2]); drawCount=3.
    draw(): guard drawing || drawCount>=3; drawCount<2→drawReading else
        drawFinalMajors.
    resetReading(): clear frames + spread.innerHTML + glitch (.shown,
        hidden) + canvas.clearRect + glitchLabel.text=''.
  bind: decks.click + keydown(Enter|Space)→draw; ctaReset.click→
        resetReading + drawCount=0 + setMood(bored) + scroll to decks.
  init: setMood('bored'); setStatus('Click a deck.'); setLastLogin(today);
        loadQuotes() async-fetches assets/json/quotes.json into QUOTES.
*/
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────
  //  MAJOR ARCANA — 22 cards. Three fields used:
  //    `year`    — Year slot (1st reading) → dateBegin/dateEnd with a
  //                per-draw jittered half-window in [30, 90].
  //    `mediums` — Medium slot (1st reading) → random pick per draw →
  //                classification_titles.keyword filter.
  //    `effect`  — Final glitch slot → one of 5 canvas effects. Two
  //                distinct majors are pulled and their effects are
  //                chained (effect 1 → snapshot → effect 2 → guaranteed
  //                channelswap color pass at the end).
  // ────────────────────────────────────────────────────────────────────
  const MAJORS = [
    { name: '0 - The Fool',            meaning: 'New beginnings; leaps of faith.',     year:  1500, mediums: ['print', 'drawing', 'mask'],          warp: 'datamosh',     color: 'huerotate'   },
    { name: 'I - The Magician',        meaning: 'Manifestation; willpower.',           year:  1600, mediums: ['book', 'manuscript', 'print'],       warp: 'pixelsort',    color: 'channelswap' },
    { name: 'II - The High Priestess', meaning: 'Intuition; hidden knowledge.',        year:  -100, mediums: ['vessel', 'manuscript', 'jewelry'],   warp: 'sliceshuffle', color: 'threshold'   },
    { name: 'III - The Empress',       meaning: 'Abundance; nurture.',                 year:  1500, mediums: ['painting', 'textile', 'vessel'],     warp: 'mirror',       color: 'colorize'    },
    { name: 'IV - The Emperor',        meaning: 'Authority; structure.',               year:  1700, mediums: ['sculpture', 'coin', 'armor'],        warp: 'shear',        color: 'posterize'   },
    { name: 'V - The Hierophant',      meaning: 'Tradition; doctrine.',                year:  1500, mediums: ['textile', 'manuscript', 'sculpture'],warp: 'sliceshuffle', color: 'duotone'     },
    { name: 'VI - The Lovers',         meaning: 'Union; choice.',                      year:  1850, mediums: ['painting', 'drawing', 'jewelry'],    warp: 'ripple',       color: 'invert'      },
    { name: 'VII - The Chariot',       meaning: 'Drive; victory through will.',        year:  -500, mediums: ['sculpture', 'weapon', 'coin'],       warp: 'swirl',        color: 'channelswap' },
    { name: 'VIII - Strength',         meaning: 'Inner force; courage.',               year:  1700, mediums: ['sculpture', 'painting', 'jewelry'],  warp: 'shear',        color: 'difference'  },
    { name: 'IX - The Hermit',         meaning: 'Solitude; inward search.',            year:  1300, mediums: ['book', 'manuscript', 'drawing'],     warp: 'ripple',       color: 'huerotate'   },
    { name: 'X - Wheel of Fortune',    meaning: 'Cycles; turning points.',             year:  1500, mediums: ['textile', 'print', 'ornament'],      warp: 'sliceshuffle', color: 'huerotate'   },
    { name: 'XI - Justice',            meaning: 'Cause and effect; fairness.',         year:  1750, mediums: ['print', 'coin', 'sculpture'],        warp: 'wavewarp',     color: 'channelswap' },
    { name: 'XII - The Hanged Man',    meaning: 'Surrender; new perspective.',         year:  1400, mediums: ['painting', 'print', 'manuscript'],   warp: 'wavewarp',     color: 'invert'      },
    { name: 'XIII - Death',            meaning: 'Endings; transformation.',            year:  1600, mediums: ['print', 'drawing', 'mask'],          warp: 'datamosh',     color: 'difference'  },
    { name: 'XIV - Temperance',        meaning: 'Balance; patience.',                  year:  1500, mediums: ['vessel', 'glass', 'jewelry'],        warp: 'swirl',        color: 'duotone'     },
    { name: 'XV - The Devil',          meaning: 'Bondage; the shadow self.',           year:  1500, mediums: ['drawing', 'mask', 'print'],          warp: 'pixelsort',    color: 'gradient'    },
    { name: 'XVI - The Tower',         meaning: 'Sudden upheaval.',                    year:  1800, mediums: ['drawing', 'painting', 'photograph'], warp: 'datamosh',     color: 'posterize'   },
    { name: 'XVII - The Star',         meaning: 'Hope; renewal.',                      year:  1900, mediums: ['photograph', 'painting', 'glass'],   warp: 'wavewarp',     color: 'gradient'    },
    { name: 'XVIII - The Moon',        meaning: 'Illusion; the unconscious.',          year:  1850, mediums: ['print', 'photograph', 'drawing'],    warp: 'scanshift',    color: 'threshold'   },
    { name: 'XIX - The Sun',           meaning: 'Vitality; clarity.',                  year:  1700, mediums: ['vessel', 'ceramic', 'painting'],     warp: 'mirror',       color: 'colorize'    },
    { name: 'XX - Judgement',          meaning: 'Reckoning; awakening.',               year:  1550, mediums: ['painting', 'print', 'sculpture'],    warp: 'scanshift',    color: 'threshold'   },
    { name: 'XXI - The World',         meaning: 'Completion; integration.',            year:  1700, mediums: ['print', 'textile', 'design'],        warp: 'pixelsort',    color: 'channelswap' },
  ];

  // 18 effects, split by category. Each major carries one warp + one color.
  const WARPS = [
    'datamosh', 'sliceshuffle', 'wavewarp',
    'shear', 'ripple', 'scanshift',
    'pixelsort', 'mirror', 'swirl'
  ];
  const COLORS = [
    'channelswap', 'difference', 'invert',
    'huerotate', 'duotone', 'colorize',
    'threshold', 'posterize', 'gradient'
  ];
  const EFFECT_LABEL = {
    // warps
    datamosh:     'Datamosh',
    sliceshuffle: 'Slice Shuffle',
    wavewarp:     'Wave Warp',
    shear:        'Shear',
    ripple:       'Ripple',
    scanshift:    'Scan Shift',
    pixelsort:    'Pixel Sort',
    mirror:       'Mirror',
    swirl:        'Swirl',
    // colors
    channelswap:  'Channel Swap',
    difference:   'Difference',
    invert:       'Invert',
    huerotate:    'Hue Rotate',
    duotone:      'Duotone',
    colorize:     'Colorize',
    threshold:    'Threshold',
    posterize:    'Posterize',
    gradient:     'Gradient',
  };

  // ────────────────────────────────────────────────────────────────────
  //  MINOR ARCANA — 56 cards. `searches` is an array of 3 related single-
  //  word keywords; one is picked per draw.
  // ────────────────────────────────────────────────────────────────────
  const MINORS = [
    // ─── Wands ───────────────────────────────────────────────────────
    { name: 'Ace of Wands',        meaning: 'A spark of inspiration.',           searches: ['fire', 'flame', 'torch'] },
    { name: 'Two of Wands',        meaning: 'Planning the next horizon.',        searches: ['map', 'compass', 'horizon'] },
    { name: 'Three of Wands',      meaning: 'Expansion; ships on the way.',      searches: ['ship', 'sail', 'mast'] },
    { name: 'Four of Wands',       meaning: 'Celebration; homecoming.',          searches: ['festival', 'feast', 'celebration'] },
    { name: 'Five of Wands',       meaning: 'Friction; competition.',            searches: ['weapon', 'battle', 'struggle'] },
    { name: 'Six of Wands',        meaning: 'Victory; recognition.',             searches: ['crown', 'victory', 'triumph'] },
    { name: 'Seven of Wands',      meaning: 'Defending your ground.',            searches: ['shield', 'defense', 'bastion'] },
    { name: 'Eight of Wands',      meaning: 'Swift movement; arrows in flight.', searches: ['bird', 'flight', 'wing'] },
    { name: 'Nine of Wands',       meaning: 'Resilience; the last stand.',       searches: ['tool', 'staff', 'guard'] },
    { name: 'Ten of Wands',        meaning: 'Burdens; overextension.',           searches: ['stone', 'burden', 'weight'] },
    { name: 'Page of Wands',       meaning: 'Enthusiastic messenger.',           searches: ['letter', 'scroll', 'message'] },
    { name: 'Knight of Wands',     meaning: 'Bold action; sometimes reckless.',  searches: ['horse', 'charge', 'gallop'] },
    { name: 'Queen of Wands',      meaning: 'Confident; charismatic.',           searches: ['cat', 'feline', 'tiger'] },
    { name: 'King of Wands',       meaning: 'Visionary leader.',                 searches: ['lion', 'throne', 'leader'] },

    // ─── Cups ────────────────────────────────────────────────────────
    { name: 'Ace of Cups',         meaning: 'An overflow of feeling.',           searches: ['chalice', 'cup', 'water'] },
    { name: 'Two of Cups',         meaning: 'Partnership; mutual attraction.',   searches: ['couple', 'kiss', 'lovers'] },
    { name: 'Three of Cups',       meaning: 'Friendship; celebration.',          searches: ['flower', 'garland', 'dance'] },
    { name: 'Four of Cups',        meaning: 'Apathy; contemplation.',            searches: ['mirror', 'reflection', 'pool'] },
    { name: 'Five of Cups',        meaning: 'Loss; regret; what remains.',       searches: ['face', 'tears', 'mourning'] },
    { name: 'Six of Cups',         meaning: 'Nostalgia; innocence.',             searches: ['child', 'baby', 'youth'] },
    { name: 'Seven of Cups',       meaning: 'Choices; fantasies; illusion.',     searches: ['cloud', 'fog', 'mist'] },
    { name: 'Eight of Cups',       meaning: 'Walking away; deeper seeking.',     searches: ['boat', 'pilgrim', 'shore'] },
    { name: 'Nine of Cups',        meaning: 'Contentment; wishes fulfilled.',    searches: ['fruit', 'feast', 'wine'] },
    { name: 'Ten of Cups',         meaning: 'Family harmony; lasting joy.',      searches: ['family', 'home', 'rainbow'] },
    { name: 'Page of Cups',        meaning: 'Creative dreamer.',                 searches: ['fish', 'sea', 'shell'] },
    { name: 'Knight of Cups',      meaning: 'Romantic seeker.',                  searches: ['rider', 'cavalier', 'horseman'] },
    { name: 'Queen of Cups',       meaning: 'Compassion; deep intuition.',       searches: ['woman', 'crown', 'throne'] },
    { name: 'King of Cups',        meaning: 'Emotional mastery.',                searches: ['man', 'beard', 'sea'] },

    // ─── Swords ──────────────────────────────────────────────────────
    { name: 'Ace of Swords',       meaning: 'Clarity; clean breakthrough.',      searches: ['sword', 'blade', 'point'] },
    { name: 'Two of Swords',       meaning: 'Stalemate; a choice deferred.',     searches: ['duel', 'pair', 'blindfold'] },
    { name: 'Three of Swords',     meaning: 'Heartbreak; piercing sorrow.',      searches: ['dagger', 'heart', 'wound'] },
    { name: 'Four of Swords',      meaning: 'Rest; recovery from the field.',    searches: ['armor', 'rest', 'tomb'] },
    { name: 'Five of Swords',      meaning: 'A hollow victory.',                 searches: ['helmet', 'shield', 'sword'] },
    { name: 'Six of Swords',       meaning: 'Transition; carrying away.',        searches: ['river', 'ferry', 'boat'] },
    { name: 'Seven of Swords',     meaning: 'Stealth; what is taken sideways.',  searches: ['thief', 'shadow', 'spy'] },
    { name: 'Eight of Swords',     meaning: 'Restriction; often self-imposed.',  searches: ['rope', 'chain', 'binding'] },
    { name: 'Nine of Swords',      meaning: 'Anxiety; night thoughts.',          searches: ['skull', 'night', 'mourning'] },
    { name: 'Ten of Swords',       meaning: 'Rock bottom; the worst is past.',   searches: ['siege', 'fall', 'ruin'] },
    { name: 'Page of Swords',      meaning: 'Curious; vigilant.',                searches: ['scout', 'wind', 'cliff'] },
    { name: 'Knight of Swords',    meaning: 'Charging forward.',                 searches: ['knight', 'lance', 'gallop'] },
    { name: 'Queen of Swords',     meaning: 'Sharp wit; perceptive.',            searches: ['hat', 'cap', 'crown'] },
    { name: 'King of Swords',      meaning: 'Authority of intellect.',           searches: ['judge', 'gavel', 'throne'] },

    // ─── Pentacles ───────────────────────────────────────────────────
    { name: 'Ace of Pentacles',    meaning: 'A new material opportunity.',       searches: ['coin', 'wealth', 'hand'] },
    { name: 'Two of Pentacles',    meaning: 'Balance; juggling demands.',        searches: ['scale', 'balance', 'juggler'] },
    { name: 'Three of Pentacles',  meaning: 'Collaboration; craft.',             searches: ['craftsman', 'mason', 'tool'] },
    { name: 'Four of Pentacles',   meaning: 'Holding tight; possession.',        searches: ['treasure', 'chest', 'gold'] },
    { name: 'Five of Pentacles',   meaning: 'Hardship; exclusion from warmth.',  searches: ['beggar', 'cold', 'snow'] },
    { name: 'Six of Pentacles',    meaning: 'Generosity; rightful exchange.',    searches: ['alms', 'gift', 'charity'] },
    { name: 'Seven of Pentacles',  meaning: 'Patience; waiting on the harvest.', searches: ['harvest', 'field', 'vine'] },
    { name: 'Eight of Pentacles',  meaning: 'Mastery through diligence.',        searches: ['workshop', 'apprentice', 'hand'] },
    { name: 'Nine of Pentacles',   meaning: 'Self-sufficiency; earned luxury.',  searches: ['garden', 'bird', 'orchard'] },
    { name: 'Ten of Pentacles',    meaning: 'Legacy; established wealth.',       searches: ['tapestry', 'house', 'feast'] },
    { name: 'Page of Pentacles',   meaning: 'Diligent student.',                 searches: ['scribe', 'pen', 'tablet'] },
    { name: 'Knight of Pentacles', meaning: 'Steady, dependable worker.',        searches: ['farmer', 'field', 'plow'] },
    { name: 'Queen of Pentacles',  meaning: 'Nurturing provider.',               searches: ['Madonna', 'mother', 'infant'] },
    { name: 'King of Pentacles',   meaning: 'Established wealth; rooted power.', searches: ['estate', 'manor', 'crown'] },
  ];

  // ────────────────────────────────────────────────────────────────────
  //  API
  // ────────────────────────────────────────────────────────────────────
  const API  = 'https://api.artic.edu/api/v1/';
  const IIIF = 'https://www.artic.edu/iiif/2/';
  const ARTIC_PAGE = 'https://www.artic.edu/artworks/';
  const FIELDS = [
    'id', 'title', 'artist_display', 'date_display',
    'medium_display', 'classification_titles',
    'image_id', 'date_start', 'date_end',
    'department_title', 'credit_line'
  ].join(',');

  function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function yearLabel(y) {
    return y < 0 ? Math.abs(y) + ' BCE' : y + ' CE';
  }

  function jitteredYearWindow(y) {
    const halfWin = 30 + Math.floor(Math.random() * 61);
    return [y - halfWin, y + halfWin];
  }

  function buildQuery(terms, classification, y0, y1) {
    const q = terms.join(' ');
    const params = {
      q: q,
      query: {
        bool: {
          must: [
            { term:  { is_public_domain: true } },
            { term:  { 'classification_titles.keyword': classification } },
            { range: { date_start: { lte: y1 } } },
            { range: { date_end:   { gte: y0 } } },
            { multi_match: {
                query: q,
                fields: [
                  'title', 'description', 'subject_titles',
                  'term_titles', 'category_titles'
                ],
                operator: 'and'
            }}
          ]
        }
      },
      fields: FIELDS,
      limit: 50
    };
    return 'params=' + encodeURIComponent(JSON.stringify(params));
  }

  async function searchArtworks(query) {
    const res = await fetch(API + 'artworks/search?' + query);
    if (!res.ok) throw new Error('search ' + res.status);
    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  }

  function imageUrl(imageId) {
    return IIIF + imageId + '/full/843,/0/default.jpg';
  }

  // ────────────────────────────────────────────────────────────────────
  //  RENDER & ANIMATION
  // ────────────────────────────────────────────────────────────────────
  const el = {
    status:        document.getElementById('status'),
    decks:         document.getElementById('decks'),
    spread:        document.getElementById('spread-0'),  // back-compat — legacy refs
    spreadRows:    [
      document.getElementById('spread-0'),
      document.getElementById('spread-1'),
      document.getElementById('spread-2'),
    ],
    glitch:        document.getElementById('glitch'),
    glitchCanvas:  document.getElementById('glitch-canvas'),
    glitchLabel:   document.getElementById('glitch-label'),
    frames:        Array.from(document.querySelectorAll('#gallery .artwork-frame')),
    majorDeck:     document.querySelector('.deck[data-role="major"]'),
    minorDeck:     document.querySelector('.deck[data-role="minor"]'),
    majorPile:     document.querySelector('.deck[data-role="major"] .deck-pile'),
    minorPile:     document.querySelector('.deck[data-role="minor"] .deck-pile'),
    gallery:       document.getElementById('gallery'),
    shuffleOverlay: document.getElementById('shuffle-overlay'),
    shuffleSub:     document.getElementById('shuffle-sub'),
    ctaReset:      document.getElementById('cta-reset'),
    mashCredits:   document.getElementById('mash-credits'),
    mashCreditsBody: document.getElementById('mash-credits-body'),
    symbolBook:    document.getElementById('symbol-book'),
    bookGrid:      document.getElementById('symbol-book-grid'),
  };

  // Tracked across the three draws so the collapsed credits under the
  // mash can list both source artworks and the full six-card spread.
  const spreadState = {
    readings: [null, null],   // each: { major0, major1, minor0, minor1, picks, art }
    effects: null,            // [majorWarp, majorColor]
    fortune: null,            // last compose() result — sourceWords flow to the book
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function nextFrame() {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function setStatus(text, isError) {
    el.status.textContent = text || '';
    el.status.classList.toggle('error', !!isError);
  }

  // Mark whichever element the player should click next with a
  // pink-gold halo pulse (CSS .click-me). Stages 0–2 light up both
  // decks; stage 3 (after the mash) lights up the Booke. While we're
  // mid-draw, nothing glows — no double-click invitations.
  function updateClickGlow() {
    [el.majorDeck, el.minorDeck, el.symbolBook].forEach(node => {
      if (node) node.classList.remove('click-me');
    });
    if (drawing) return;
    if (drawCount < 3) {
      if (el.majorDeck) el.majorDeck.classList.add('click-me');
      if (el.minorDeck) el.minorDeck.classList.add('click-me');
    } else if (el.symbolBook && !el.symbolBook.open) {
      el.symbolBook.classList.add('click-me');
    }
  }

  // Pace the reveal: after each reading, scroll so the spread (cards
  // drawn) and the gallery (new painting) are on screen together —
  // never just the cards, never just the painting.
  function scrollSpreadAndGallery() {
    if (!el.gallery) return;
    el.gallery.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Fullscreen shuffling overlay — shown while findValidatedSpread is
  // hammering the AIC API, hidden before the cards animate.
  function showShuffleOverlay() {
    if (!el.shuffleOverlay) return;
    setShuffleSub('');
    el.shuffleOverlay.hidden = false;
  }
  function hideShuffleOverlay() {
    if (!el.shuffleOverlay) return;
    el.shuffleOverlay.hidden = true;
    setShuffleSub('');
  }
  function setShuffleSub(text) {
    if (el.shuffleSub) el.shuffleSub.textContent = text || '';
  }

  // Quick helper — call a TarotSound voice if the module loaded and
  // the call is safe. Lets us scatter sfx without guard boilerplate.
  function sfx(name) {
    if (window.TarotSound && typeof window.TarotSound[name] === 'function') {
      try { window.TarotSound[name](); } catch (e) { /* swallow */ }
    }
  }

  // For every 5 seconds the AIC API spends shuffling, the player gets
  // one coin as compensation for the wait.
  function awardShuffleBonus(elapsedMs) {
    if (!window.Wallet || typeof window.Wallet.add !== 'function') return 0;
    const coins = Math.floor(elapsedMs / 5000);
    if (coins > 0) {
      window.Wallet.add(coins);
      sfx('coin');
    }
    return coins;
  }

  const moodEl = document.getElementById('profile-mood');
  function setMood(mood) {
    if (moodEl) moodEl.textContent = mood;
  }

  (function setLastLogin() {
    const elx = document.getElementById('profile-login');
    if (!elx) return;
    const d = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    elx.textContent = months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  })();

  function makeSlot(role, card, valueHtml, rot) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    // Majors carry warp/color effect keys; minors carry a `searches`
    // pool. Tag the slot so its back design matches the deck it came
    // from (gold compass-star for majors, hot-pink five-point for
    // minors).
    slot.dataset.arcana = (card && (card.warp || card.color)) ? 'major' : 'minor';
    slot.innerHTML =
      '<div class="flipper" style="--rot: ' + rot + 'deg">' +
        '<div class="face back"></div>' +
        '<div class="face front">' +
          '<div class="role">' + escapeHtml(role) + '</div>' +
          '<div class="title">' + escapeHtml(card.name) + '</div>' +
          '<div class="value">' + valueHtml + '</div>' +
          '<div class="mean">' + escapeHtml(card.meaning) + '</div>' +
        '</div>' +
      '</div>';
    return slot;
  }

  function placeSlotAtDeck(slot, pile) {
    const flipper = slot.querySelector('.flipper');
    const sr = slot.getBoundingClientRect();
    const pr = pile.getBoundingClientRect();
    const dx = (pr.left + pr.width / 2) - (sr.left + sr.width / 2);
    const dy = (pr.top  + pr.height / 2) - (sr.top  + sr.height / 2);
    flipper.style.setProperty('--fx', dx + 'px');
    flipper.style.setProperty('--fy', dy + 'px');
  }

  function pulseDeck(deckEl) {
    deckEl.classList.remove('dealing');
    void deckEl.offsetHeight;
    deckEl.classList.add('dealing');
  }

  function resetReading() {
    el.frames.forEach(f => {
      f.classList.remove('shown');
      const img = f.querySelector('.art-image');
      img.removeAttribute('src');
      img.alt = '';
      f.querySelector('.art-title').textContent = '';
      f.querySelector('.art-meta').textContent = '';
      f.querySelector('.art-link').removeAttribute('href');
    });
    el.spreadRows.forEach(row => { if (row) row.innerHTML = ''; });
    el.glitch.classList.remove('shown');
    el.glitch.hidden = true;
    const gctx = el.glitchCanvas.getContext('2d');
    gctx.clearRect(0, 0, el.glitchCanvas.width, el.glitchCanvas.height);
    el.glitchLabel.textContent = '';
    if (el.mashCreditsBody) el.mashCreditsBody.innerHTML = '';
    if (el.mashCredits) {
      el.mashCredits.classList.remove('shown');
      el.mashCredits.hidden = true;
      el.mashCredits.open = false;
    }
    if (el.symbolBook) {
      el.symbolBook.classList.remove('shown');
      el.symbolBook.hidden = true;
      el.symbolBook.open = false;
    }
    if (el.bookGrid) el.bookGrid.innerHTML = '';
    spreadState.readings[0] = null;
    spreadState.readings[1] = null;
    spreadState.effects = null;
    spreadState.fortune = null;
  }

  // Set the frame's image src, wait for load, then fill the plaque. If
  // the image fails (404, decode, taint), strip the src so the empty
  // placeholder shows again and return false — caller will try another
  // artwork. Returns true on success.
  async function renderFrame(frame, art) {
    const img   = frame.querySelector('.art-image');
    const title = frame.querySelector('.art-title');
    const meta  = frame.querySelector('.art-meta');
    const link  = frame.querySelector('.art-link');

    img.src = imageUrl(art.image_id);
    const ok = await waitForImageLoad(img);
    if (!ok) {
      img.removeAttribute('src');
      return false;
    }

    img.alt = (art.title || 'Untitled') +
              (art.artist_display ? ' — ' + art.artist_display : '');
    title.textContent = art.title || 'Untitled';

    const parts = [
      art.artist_display, art.date_display,
      art.medium_display, art.department_title
    ].filter(Boolean);
    meta.textContent = parts.join(' · ');

    link.href = ARTIC_PAGE + art.id;
    frame.classList.add('shown');
    return true;
  }

  async function animateSpread(major0, major1, minor0, minor1, drawIndex, picks) {
    setStatus('');

    const yearSlot   = makeSlot('Year',   major0, '<b>' + escapeHtml(yearLabel(major0.year)) + '</b>',   -6);
    const mediumSlot = makeSlot('Medium', major1, '<b>' + escapeHtml(picks.medium) + '</b>',             -2);
    const term1Slot  = makeSlot('Term',   minor0, '<b>' + escapeHtml(picks.search0) + '</b>',             2);
    const term2Slot  = makeSlot('Term',   minor1, '<b>' + escapeHtml(picks.search1) + '</b>',             6);
    [yearSlot, mediumSlot, term1Slot, term2Slot].forEach(s => { s.dataset.draw = String(drawIndex); });

    // First reading goes ABOVE the gallery (spreadRows[0]); second
    // reading goes BELOW the gallery (spreadRows[1]).
    const row = el.spreadRows[drawIndex] || el.spreadRows[0];
    row.appendChild(yearSlot);
    row.appendChild(mediumSlot);
    row.appendChild(term1Slot);
    row.appendChild(term2Slot);

    placeSlotAtDeck(yearSlot,   el.majorPile);
    placeSlotAtDeck(mediumSlot, el.majorPile);
    placeSlotAtDeck(term1Slot,  el.minorPile);
    placeSlotAtDeck(term2Slot,  el.minorPile);

    await nextFrame();

    pulseDeck(el.majorDeck);
    sfx('deal');
    yearSlot.classList.add('dealt');
    await sleep(240);
    pulseDeck(el.majorDeck);
    sfx('deal');
    mediumSlot.classList.add('dealt');
    await sleep(240);
    pulseDeck(el.minorDeck);
    sfx('deal');
    term1Slot.classList.add('dealt');
    await sleep(240);
    pulseDeck(el.minorDeck);
    sfx('deal');
    term2Slot.classList.add('dealt');
    await sleep(900);
    el.majorDeck.classList.remove('dealing');
    el.minorDeck.classList.remove('dealing');

    yearSlot.classList.add('flipped');
    sfx('flip');
    await sleep(280);
    mediumSlot.classList.add('flipped');
    sfx('flip');
    await sleep(280);
    term1Slot.classList.add('flipped');
    sfx('flip');
    await sleep(280);
    term2Slot.classList.add('flipped');
    sfx('flip');
    await sleep(300);
  }

  // Slot 0 contributes its WARP; slot 1 contributes its COLOR.
  // The card only displays its active effect.
  async function animateGlitchCard(major, slotIndex) {
    const rot       = slotIndex === 0 ? -3 : 3;
    const activeKey = slotIndex === 0 ? 'warp' : 'color';
    const role      = slotIndex === 0 ? 'Warp' : 'Color';
    const label     = EFFECT_LABEL[major[activeKey]] || major[activeKey];
    const slot = makeSlot(
      role, major,
      '<b>' + escapeHtml(label) + '</b>',
      rot
    );
    slot.dataset.draw = '2';
    slot.dataset.glitchSlot = String(slotIndex);
    // Merge / effect majors land BETWEEN the readings and the mash.
    (el.spreadRows[2] || el.spread).appendChild(slot);
    placeSlotAtDeck(slot, el.majorPile);
    await nextFrame();

    pulseDeck(el.majorDeck);
    sfx('deal');
    slot.classList.add('dealt');
    await sleep(700);
    el.majorDeck.classList.remove('dealing');

    slot.classList.add('flipped');
    sfx('flip');
    await sleep(380);
  }

  // ────────────────────────────────────────────────────────────────────
  //  EFFECTS — five canvas mashup operations. Parameters jitter inside.
  //  CORS: gallery images load with crossorigin='anonymous' (AIC serves
  //  Access-Control-Allow-Origin:*) so getImageData stays untainted.
  // ────────────────────────────────────────────────────────────────────
  function loadCorsImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function effectDifference(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    ctx.globalCompositeOperation = 'difference';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
    // Raw differences are mostly dark — histogram-stretch to fill [0,255]
    // then apply a jittered extra multiplier on top.
    const id = ctx.getImageData(0, 0, size, size);
    const px = id.data;
    let max = 1;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]     > max) max = px[i];
      if (px[i + 1] > max) max = px[i + 1];
      if (px[i + 2] > max) max = px[i + 2];
    }
    const scale = 255 / max;
    const extra = 1.0 + Math.random() * 0.8;
    for (let i = 0; i < px.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        let v = px[i + k] * scale * extra;
        if (v > 255) v = 255;
        px[i + k] = v;
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  function effectDatamosh(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const sources = [a, b];

    // (1) Big tear blocks (4..8).
    const blocks = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < blocks; i++) {
      const w = (0.18 + Math.random() * 0.45) * size;
      const h = (0.10 + Math.random() * 0.40) * size;
      const x = Math.random() * (size - w);
      const y = Math.random() * (size - h);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearXMag = (0.20 + Math.random() * 0.30) * size;
      const tearYMag = (0.10 + Math.random() * 0.15) * size;
      const tearX = (Math.random() - 0.5) * 2 * tearXMag;
      const tearY = (Math.random() - 0.5) * 2 * tearYMag;
      let sx = (x + tearX) / size * srcW;
      let sy = (y + tearY) / size * srcH;
      const sw = w / size * srcW;
      const sh = h / size * srcH;
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx + sw > srcW) sx = srcW - sw;
      if (sy + sh > srcH) sy = srcH - sh;
      ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
    }

    // (2) Horizontal shred bands (10..20).
    const hBands = 10 + Math.floor(Math.random() * 11);
    for (let i = 0; i < hBands; i++) {
      const bandH = 2 + Math.floor(Math.random() * 9);
      const y = Math.random() * (size - bandH);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearY = (Math.random() - 0.5) * size * 0.6;
      let sy = (y + tearY) / size * srcH;
      const sh = bandH / size * srcH;
      if (sy < 0) sy = 0;
      if (sy + sh > srcH) sy = srcH - sh;
      ctx.drawImage(src, 0, sy, srcW, sh, 0, y, size, bandH);
    }

    // (3) Vertical shred bands (6..14).
    const vBands = 6 + Math.floor(Math.random() * 9);
    for (let i = 0; i < vBands; i++) {
      const bandW = 2 + Math.floor(Math.random() * 9);
      const x = Math.random() * (size - bandW);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearX = (Math.random() - 0.5) * size * 0.5;
      let sx = (x + tearX) / size * srcW;
      const sw = bandW / size * srcW;
      if (sx < 0) sx = 0;
      if (sx + sw > srcW) sx = srcW - sw;
      ctx.drawImage(src, sx, 0, sw, srcH, x, 0, bandW, size);
    }

    // (4) Stutter copies (0..3).
    const stutters = Math.floor(Math.random() * 4);
    for (let i = 0; i < stutters; i++) {
      const w = (0.20 + Math.random() * 0.35) * size;
      const h = (0.15 + Math.random() * 0.30) * size;
      const x = Math.random() * (size - w);
      const y = Math.random() * (size - h);
      const dx = (Math.random() - 0.5) * 30;
      const dy = (Math.random() - 0.5) * 20;
      const cap = ctx.getImageData(x, y, w, h);
      ctx.putImageData(cap, x + dx, y + dy);
    }

    // (5) Pixel noise (150..400).
    const noiseCount = 150 + Math.floor(Math.random() * 251);
    for (let i = 0; i < noiseCount; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      const sz = 1 + Math.floor(Math.random() * 3);
      ctx.fillStyle = Math.random() < 0.55 ? '#ff66cc' : '#9bdc82';
      ctx.fillRect(x, y, sz, sz);
    }
  }

  function effectChannelSwap(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const dataA = ctx.getImageData(0, 0, size, size).data;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(b, 0, 0, size, size);
    const dataB = ctx.getImageData(0, 0, size, size).data;
    const out = ctx.createImageData(size, size);
    const op = out.data;
    for (let i = 0; i < op.length; i += 4) {
      op[i]     = dataA[i];
      op[i + 1] = dataB[i + 1];
      op[i + 2] = dataA[i + 2];
      op[i + 3] = 255;
    }
    // Jittered chromatic shift: ±2..8 px, R (60%) or G (40%) channel.
    const magnitude = 2 + Math.floor(Math.random() * 7);
    const dir       = Math.random() < 0.5 ? 1 : -1;
    const shift     = magnitude * dir;
    const channel   = Math.random() < 0.4 ? 1 : 0;
    for (let y = 0; y < size; y++) {
      const rowOff = y * size * 4;
      if (shift > 0) {
        for (let x = size - 1; x >= shift; x--) {
          op[rowOff + x * 4 + channel] = op[rowOff + (x - shift) * 4 + channel];
        }
      } else {
        const abs = -shift;
        for (let x = 0; x < size - abs; x++) {
          op[rowOff + x * 4 + channel] = op[rowOff + (x + abs) * 4 + channel];
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function effectSliceShuffle(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const sources = [a, b];
    let y = 0;
    while (y < size) {
      const sliceH = 3 + Math.floor(Math.random() * 28);
      const h = Math.min(sliceH, size - y);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const sh = (h / size) * srcH;
      const maxSY = Math.max(0, srcH - sh);
      const sy = Math.floor(Math.random() * maxSY);
      ctx.drawImage(src, 0, sy, srcW, sh, 0, y, size, h);
      y += h;
    }
  }

  function effectWaveWarp(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const amplitude = 8 + Math.random() * 28;
    const frequency = 0.03 + Math.random() * 0.05;
    const rowH = 2;
    const srcWA = a.naturalWidth  || size;
    const srcHA = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = Math.sin(y * frequency) * amplitude;
      const sy = (y / size) * srcHA;
      const sh = (rowH / size) * srcHA;
      ctx.drawImage(a, 0, sy, srcWA, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Proportional horizontal shear: row-by-row offset that grows linearly
  // with y. Image B screen-blended on top for richness.
  function effectShear(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const shear = (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1);
    const rowH = 2;
    const srcW = a.naturalWidth  || size;
    const srcH = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = (y / size - 0.5) * shear * size;
      const sy = (y / size) * srcH;
      const sh = (rowH / size) * srcH;
      ctx.drawImage(a, 0, sy, srcW, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Interlaced-sine pixel displacement: x shifted by sin(y), y shifted by
  // sin(x). Slower (per-pixel) but reads as a rippling under-glass effect.
  function effectRipple(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const src = ctx.getImageData(0, 0, size, size);
    const out = ctx.createImageData(size, size);
    const amp   = 4 + Math.random() * 16;
    const freqX = 0.04 + Math.random() * 0.06;
    const freqY = 0.04 + Math.random() * 0.06;
    for (let y = 0; y < size; y++) {
      const yShift = Math.sin(y * freqX) * amp;
      for (let x = 0; x < size; x++) {
        const xShift = Math.sin(x * freqY) * amp;
        let sx = (x + yShift) | 0;
        let sy = (y + xShift) | 0;
        if (sx < 0) sx = 0; else if (sx >= size) sx = size - 1;
        if (sy < 0) sy = 0; else if (sy >= size) sy = size - 1;
        const srcIdx = (sy * size + sx) * 4;
        const dstIdx = (y * size + x) * 4;
        out.data[dstIdx]     = src.data[srcIdx];
        out.data[dstIdx + 1] = src.data[srcIdx + 1];
        out.data[dstIdx + 2] = src.data[srcIdx + 2];
        out.data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // Random horizontal offset per scan line — CRT tracking damage.
  function effectScanShift(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const rowH = 1 + Math.floor(Math.random() * 2);
    const maxShift = 10 + Math.floor(Math.random() * 30);
    const srcW = a.naturalWidth  || size;
    const srcH = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = (Math.random() - 0.5) * 2 * maxShift;
      const sy = (y / size) * srcH;
      const sh = (rowH / size) * srcH;
      ctx.drawImage(a, 0, sy, srcW, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Invert A then mix in B per-pixel. Brutal negative-image vibe.
  function effectInvert(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const da = ctx.getImageData(0, 0, size, size);
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(b, 0, 0, size, size);
    const db = tctx.getImageData(0, 0, size, size);
    const mix = 0.3 + Math.random() * 0.4;
    const inv = 1 - mix;
    for (let i = 0; i < da.data.length; i += 4) {
      da.data[i]     = (255 - da.data[i])     * inv + db.data[i]     * mix;
      da.data[i + 1] = (255 - da.data[i + 1]) * inv + db.data[i + 1] * mix;
      da.data[i + 2] = (255 - da.data[i + 2]) * inv + db.data[i + 2] * mix;
    }
    ctx.putImageData(da, 0, 0);
  }

  // Hue rotation via canvas filter (GPU-accelerated) + screen blend B.
  function effectHueRotate(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const hueDeg = Math.floor(Math.random() * 360);
    const sat = (1.2 + Math.random() * 0.8).toFixed(2);
    ctx.filter = 'hue-rotate(' + hueDeg + 'deg) saturate(' + sat + ')';
    ctx.drawImage(a, 0, 0, size, size);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Duotone: map brightness to a 2-color gradient. Palette picked at random.
  function effectDuotone(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const palettes = [
      [{r: 30, g:  5, b: 50}, {r: 255, g: 120, b: 200}], // deep purple → hot pink
      [{r: 10, g: 30, b: 20}, {r: 155, g: 220, b: 130}], // dark green → phosphor
      [{r: 50, g:  5, b: 30}, {r: 230, g: 160, b:  80}], // wine → gold
      [{r:  0, g:  0, b:  0}, {r: 240, g: 200, b: 255}], // black → lavender
      [{r:  8, g: 12, b: 40}, {r: 255, g: 230, b: 100}], // navy → cream-gold
    ];
    const [lo, hi] = palettes[Math.floor(Math.random() * palettes.length)];
    const dr = hi.r - lo.r, dg = hi.g - lo.g, db = hi.b - lo.b;
    for (let i = 0; i < data.data.length; i += 4) {
      const bright = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / (3 * 255);
      data.data[i]     = lo.r + dr * bright;
      data.data[i + 1] = lo.g + dg * bright;
      data.data[i + 2] = lo.b + db * bright;
    }
    ctx.putImageData(data, 0, 0);
  }

  // Pixel sort along bright horizontal runs — classic glitch art look.
  function effectPixelSort(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const id = ctx.getImageData(0, 0, size, size);
    const d = id.data;
    const thresh = (60 + Math.floor(Math.random() * 90)) * 3;
    const minRun = 6;
    for (let y = 0; y < size; y++) {
      let start = -1;
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const sum = d[i] + d[i + 1] + d[i + 2];
        if (sum > thresh) {
          if (start === -1) start = x;
        } else if (start !== -1) {
          if (x - start >= minRun) sortRun(d, y, start, x, size);
          start = -1;
        }
      }
      if (start !== -1 && size - start >= minRun) sortRun(d, y, start, size, size);
    }
    ctx.putImageData(id, 0, 0);
  }
  function sortRun(d, y, start, end, size) {
    const buf = [];
    for (let x = start; x < end; x++) {
      const i = (y * size + x) * 4;
      buf.push([d[i] + d[i + 1] + d[i + 2], d[i], d[i + 1], d[i + 2]]);
    }
    buf.sort((p, q) => p[0] - q[0]);
    for (let k = 0; k < buf.length; k++) {
      const i = (y * size + (start + k)) * 4;
      d[i]     = buf[k][1];
      d[i + 1] = buf[k][2];
      d[i + 2] = buf[k][3];
    }
  }

  // Mirror one half onto the other (random axis + direction).
  function effectMirror(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
    const mode = Math.floor(Math.random() * 4);
    const half = size / 2;
    ctx.save();
    if (mode === 0) {
      // Mirror left half onto right.
      ctx.translate(size, 0); ctx.scale(-1, 1);
      ctx.drawImage(tmp, 0, 0, half, size, 0, 0, half, size);
    } else if (mode === 1) {
      // Mirror right half onto left.
      ctx.translate(size, 0); ctx.scale(-1, 1);
      ctx.drawImage(tmp, half, 0, half, size, half, 0, half, size);
    } else if (mode === 2) {
      // Mirror top half onto bottom.
      ctx.translate(0, size); ctx.scale(1, -1);
      ctx.drawImage(tmp, 0, 0, size, half, 0, 0, size, half);
    } else {
      // Mirror bottom half onto top.
      ctx.translate(0, size); ctx.scale(1, -1);
      ctx.drawImage(tmp, 0, half, size, half, 0, half, size, half);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Swirl: radial rotation around a (jittered) center. Falls off with
  // distance — outer pixels stay put, inner ones twist hard.
  function effectSwirl(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const src = ctx.getImageData(0, 0, size, size);
    const out = ctx.createImageData(size, size);
    const cx = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const cy = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const maxR = size * 0.6;
    const twist = (1.5 + Math.random() * 2.5) * (Math.random() < 0.5 ? 1 : -1);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const f = Math.max(0, 1 - r / maxR);
        const a2 = Math.atan2(dy, dx) + twist * f;
        let sx = (cx + Math.cos(a2) * r) | 0;
        let sy = (cy + Math.sin(a2) * r) | 0;
        if (sx < 0) sx = 0; else if (sx >= size) sx = size - 1;
        if (sy < 0) sy = 0; else if (sy >= size) sy = size - 1;
        const si = (sy * size + sx) * 4;
        const di = (y  * size + x)  * 4;
        out.data[di]     = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // Binary threshold with a random 2-color palette.
  function effectThreshold(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const thresh3 = (100 + Math.floor(Math.random() * 80)) * 3;
    const palettes = [
      [{r:30, g:5,  b:50},  {r:255, g:102, b:204}],
      [{r:10, g:10, b:10},  {r:155, g:220, b:130}],
      [{r:0,  g:0,  b:0},   {r:255, g:255, b:255}],
      [{r:40, g:8,  b:50},  {r:230, g:200, b:80}],
      [{r:20, g:0,  b:30},  {r:255, g:153, b:221}],
    ];
    const [lo, hi] = palettes[Math.floor(Math.random() * palettes.length)];
    for (let i = 0; i < data.data.length; i += 4) {
      const sum = data.data[i] + data.data[i + 1] + data.data[i + 2];
      const c = sum > thresh3 ? hi : lo;
      data.data[i]     = c.r;
      data.data[i + 1] = c.g;
      data.data[i + 2] = c.b;
    }
    ctx.putImageData(data, 0, 0);
  }

  // Posterize: reduce each channel to N levels for chunky color regions.
  function effectPosterize(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const levels = 2 + Math.floor(Math.random() * 5);
    const step = 255 / (levels - 1);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i]     = Math.round(Math.round(data.data[i]     / step) * step);
      data.data[i + 1] = Math.round(Math.round(data.data[i + 1] / step) * step);
      data.data[i + 2] = Math.round(Math.round(data.data[i + 2] / step) * step);
    }
    ctx.putImageData(data, 0, 0);
    // Screen-blend B for a touch of detail.
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Gradient overlay with a randomly picked goth palette + blend mode.
  function effectGradient(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const palettes = [
      ['#ff66cc', '#9bdc82'],
      ['#aa66ff', '#ff66cc'],
      ['#ffaa44', '#aa66ff'],
      ['#66ccff', '#ff66cc'],
      ['#ff5577', '#9bdc82'],
      ['#ff99dd', '#3a0a4a'],
    ];
    const [c1, c2] = palettes[Math.floor(Math.random() * palettes.length)];
    const ang = Math.random() * Math.PI * 2;
    const half = size / 2;
    const grad = ctx.createLinearGradient(
      half + Math.cos(ang) * half, half + Math.sin(ang) * half,
      half - Math.cos(ang) * half, half - Math.sin(ang) * half
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    const ops = ['overlay', 'soft-light', 'color', 'hue', 'multiply', 'hard-light'];
    ctx.globalCompositeOperation = ops[Math.floor(Math.random() * ops.length)];
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Solid color overlay with a random blend mode.
  function effectColorize(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const colors = ['#ff66cc', '#9bdc82', '#ffaa44', '#aa66ff', '#66ccff', '#ff5577'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const ops = ['multiply', 'screen', 'overlay', 'color-burn', 'soft-light', 'hard-light'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Mean brightness of a sub-rect of the canvas, normalized to [0, 1].
  // Subsamples every 4th column/row (step = 16 bytes × 4 stride) so even
  // the full canvas is cheap (~6k samples on a 600×600).
  function sampleCanvasBrightness(ctx, x, y, w, h) {
    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    const id = ctx.getImageData(x, y, w, h);
    const d = id.data;
    let total = 0, count = 0;
    for (let i = 0; i < d.length; i += 64) {
      total += d[i] + d[i + 1] + d[i + 2];
      count += 3;
    }
    return total / count / 255;
  }

  // Pick a legible core fill based on local brightness:
  //   dark zone   → cream white          (text reads on dark canvas)
  //   light zone  → burned near-black    (text reads on light canvas)
  //   midtones    → VHS subtitle yellow  (the unkillable in-between)
  function pickTextFill(brightness) {
    if (brightness < 0.35) return '#f3eee8';
    if (brightness > 0.65) return '#1a0a05';
    return '#f5d24a';
  }

  async function overlayChildFace(ctx, size) {
    let face = '(o_o)';
    let state = {};
    try {
      state = JSON.parse(localStorage.getItem('wendys_palace_child') || '{}');
      if (window.Child && typeof window.Child.describeFace === 'function') {
        const desc = window.Child.describeFace(state);
        if (desc && desc.frames && desc.frames.length) face = desc.frames[0];
      }
    } catch (err) { /* keep default */ }
    const fontPx = Math.floor(size * 0.08);
    if (document.fonts && document.fonts.load) {
      try { await document.fonts.load(fontPx + 'px "Press Start 2P"'); } catch {}
    }
    ctx.save();
    ctx.font = fontPx + 'px "Press Start 2P", "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Smaller child, kept in the upper third of the canvas — the
    // fortune now lives along the bottom, so leave it room.
    const x = size * (0.20 + Math.random() * 0.60);
    const y = size * (0.12 + Math.random() * 0.30);

    // Sample the bounding rect under the face, pick a core color.
    const sw = fontPx * 6;
    const sh = fontPx * 1.5;
    const fill = pickTextFill(sampleCanvasBrightness(
      ctx, x - sw / 2, y - sh / 2, sw, sh
    ));

    // Same 5-pass burned stack; only the crisp core fill adapts.
    ctx.shadowColor = '#ff4422';
    ctx.shadowBlur  = 80;
    ctx.fillStyle   = 'rgba(255, 70, 20, 0.4)';
    ctx.fillText(face, x, y);
    ctx.shadowBlur  = 40;
    ctx.fillStyle   = 'rgba(255, 90, 20, 0.5)';
    ctx.fillText(face, x, y);
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = '#0a0403';
    ctx.fillText(face, x, y);
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#180806';
    ctx.fillText(face, x, y);
    ctx.shadowBlur  = 2;
    ctx.fillStyle   = fill;
    ctx.fillText(face, x, y);

    // Paint the child's stats right under the face: H:n W:n C:n.
    // Smaller pixel font, same burned shadow stack so it matches.
    const fmt = (v) => (typeof v === 'number' ? Math.max(0, Math.round(v)) : '?');
    const stats =
      'H:' + fmt(state.hunger)    + '  ' +
      'W:' + fmt(state.wellness)  + '  ' +
      'C:' + fmt(state.closeness);
    const statsPx = Math.max(8, Math.floor(fontPx * 0.34));
    const statsY  = Math.min(size - statsPx, y + fontPx * 0.85);
    if (document.fonts && document.fonts.load) {
      try { await document.fonts.load(statsPx + 'px "Press Start 2P"'); } catch {}
    }
    ctx.font = statsPx + 'px "Press Start 2P", "VT323", monospace';
    const statsW = ctx.measureText(stats).width + 12;
    const statsFill = pickTextFill(sampleCanvasBrightness(
      ctx, x - statsW / 2, statsY - statsPx, statsW, statsPx * 2
    ));
    ctx.shadowColor = '#ff4422';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = 'rgba(255, 90, 20, 0.45)';
    ctx.fillText(stats, x, statsY);
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#0a0403';
    ctx.fillText(stats, x, statsY);
    ctx.shadowBlur  = 2;
    ctx.fillStyle   = statsFill;
    ctx.fillText(stats, x, statsY);
    ctx.restore();
  }

  // Resolves true if the image finished loading with usable pixels, false
  // if it errored (404, network failure, decode error, CORS taint) or
  // finished with zero dimensions.
  // Splatter neon-blood spots across the canvas. Each splat = jittered
  // main blob (3–5 overlapping circles) + 4–11 droplet satellites at
  // mid-distance + 6–17 tiny specks further out. Five neon hues; each
  // splat picks a composite mode (mostly 'overlay', spiced with
  // 'hard-light' and 'screen') so the splat blends with the canvas
  // underneath instead of stamping flat color on top.
  // Push the two raw paintings to the front of the mash. We pre-compose
  // a 50/50 A+B cross-fade off-screen, then lay it on top of the
  // effected canvas at high alpha so the effect chain reads as a glitch
  // overlay over the paintings — not the other way around.
  //
  // Final mix per pixel ≈ 36% A + 36% B + 28% effects (alpha 0.72 over
  // an even 0.5/0.5 off-screen cross-fade).
  function blendBothSources(ctx, imgA, imgB, size) {
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.drawImage(imgA, 0, 0, size, size);
    octx.globalAlpha = 0.5;
    octx.drawImage(imgB, 0, 0, size, size);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.72;
    ctx.drawImage(off, 0, 0, size, size);
    ctx.restore();
  }

  function overlaySplatter(ctx, size) {
    ctx.save();
    const palette = [
      'rgba(255, 102, 204, 0.88)', // pink
      'rgba(255, 238,  68, 0.78)', // yellow
      'rgba(170, 102, 255, 0.88)', // purple
      'rgba(255,  68, 102, 0.88)', // red
      'rgba(102, 153, 255, 0.85)', // blue
    ];
    const modes = ['overlay', 'overlay', 'overlay', 'hard-light', 'screen'];
    const splats = 3 + Math.floor(Math.random() * 5); // 3..7 main splats
    for (let i = 0; i < splats; i++) {
      ctx.globalCompositeOperation = modes[Math.floor(Math.random() * modes.length)];
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const mainR = 14 + Math.random() * 42; // 14..56 px
      // Main blob: 3..5 overlapping circles offset within mainR*0.5.
      const blobs = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < blobs; j++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * mainR * 0.5;
        const r = mainR * (0.55 + Math.random() * 0.55);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mid droplets.
      const drops = 4 + Math.floor(Math.random() * 8);
      for (let j = 0; j < drops; j++) {
        const a = Math.random() * Math.PI * 2;
        const d = mainR + Math.random() * mainR * 2;
        const r = 2 + Math.random() * 7;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Far specks.
      const specks = 6 + Math.floor(Math.random() * 12);
      for (let j = 0; j < specks; j++) {
        const a = Math.random() * Math.PI * 2;
        const d = mainR * 1.6 + Math.random() * mainR * 3;
        const r = 0.5 + Math.random() * 2.2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function waitForImageLoad(img) {
    if (img.complete) return Promise.resolve(!!img.naturalWidth);
    return new Promise(resolve => {
      img.addEventListener('load',  () => resolve(!!img.naturalWidth), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  // 18-way dispatcher (9 warps + 9 colors).
  function applyEffect(fx, ctx, a, b, size) {
    switch (fx) {
      // warps
      case 'datamosh':     return effectDatamosh(ctx, a, b, size);
      case 'sliceshuffle': return effectSliceShuffle(ctx, a, b, size);
      case 'wavewarp':     return effectWaveWarp(ctx, a, b, size);
      case 'shear':        return effectShear(ctx, a, b, size);
      case 'ripple':       return effectRipple(ctx, a, b, size);
      case 'scanshift':    return effectScanShift(ctx, a, b, size);
      case 'pixelsort':    return effectPixelSort(ctx, a, b, size);
      case 'mirror':       return effectMirror(ctx, a, b, size);
      case 'swirl':        return effectSwirl(ctx, a, b, size);
      // colors
      case 'channelswap':  return effectChannelSwap(ctx, a, b, size);
      case 'difference':   return effectDifference(ctx, a, b, size);
      case 'invert':       return effectInvert(ctx, a, b, size);
      case 'huerotate':    return effectHueRotate(ctx, a, b, size);
      case 'duotone':      return effectDuotone(ctx, a, b, size);
      case 'colorize':     return effectColorize(ctx, a, b, size);
      case 'threshold':    return effectThreshold(ctx, a, b, size);
      case 'posterize':    return effectPosterize(ctx, a, b, size);
      case 'gradient':     return effectGradient(ctx, a, b, size);
      default:             return effectDifference(ctx, a, b, size);
    }
  }

  function snapshotCanvas(canvas) {
    const snap = new Image();
    return new Promise((resolve, reject) => {
      snap.onload = () => resolve(snap);
      snap.onerror = reject;
      snap.src = canvas.toDataURL('image/png');
    });
  }

  // Posterize the first intermediary to a 4-step palette per channel and
  // stamp a Laplacian edge-detect on top in dark ink. Used only when the
  // image is being combined into the mash — the gallery display stays raw.
  // Returns an Image (same shape applyEffect already expects) so the rest
  // of the chain doesn't need to know.
  function posterizeAndInk(img, size) {
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, 0, 0, size, size);

    const id  = octx.getImageData(0, 0, size, size);
    const src = id.data;
    const out = new Uint8ClampedArray(src);
    // 8 levels per channel (was 4) — keeps a touch of silkscreen flatness
    // without crushing tonal gradients into hard bands.
    const step = 255 / 7;

    // Pass 1: gentle posterize per pixel.
    for (let i = 0; i < src.length; i += 4) {
      out[i]     = Math.round(src[i]     / step) * step;
      out[i + 1] = Math.round(src[i + 1] / step) * step;
      out[i + 2] = Math.round(src[i + 2] / step) * step;
    }

    // Pass 2: only the strongest edges become ink, and the ink is faint.
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, g = 0; i < src.length; i += 4, g++) {
      gray[g] = (src[i] + src[i + 1] + src[i + 2]) / 3;
    }
    const THRESH = 80;   // was 32 — fewer edges
    const INK    = 90;   // was 220 — darker by ~35% instead of crushed
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const g = y * size + x;
        const lap = 8 * gray[g]
          - gray[g - size - 1] - gray[g - size] - gray[g - size + 1]
          - gray[g - 1]                          - gray[g + 1]
          - gray[g + size - 1] - gray[g + size] - gray[g + size + 1];
        if (Math.abs(lap) > THRESH) {
          const j = g * 4;
          out[j]     = Math.max(0, out[j]     - INK);
          out[j + 1] = Math.max(0, out[j + 1] - INK);
          out[j + 2] = Math.max(0, out[j + 2] - INK);
        }
      }
    }

    octx.putImageData(new ImageData(out, size, size), 0, 0);
    return new Promise((resolve, reject) => {
      const inked = new Image();
      inked.onload = () => resolve(inked);
      inked.onerror = reject;
      inked.src = off.toDataURL('image/png');
    });
  }

  // ─── Fortune generator ───────────────────────────────────────────
  // Composition lives in js/tarot/fortune.js. This file just bundles the
  // drawn cards + painting titles. The fortune module picks:
  //   PAST    = arcana-word from effect1 + " of " + title-word from t1
  //   PRESENT = arcana-word from effect2 + " of " + title-word from t2
  //   FUTURE  = arcana-word from a random drawn major + " of " + a
  //              random title-word from either painting
  //   LUCKY   = djb2 hash of the two titles, mod 10000, zero-padded
  // Paint the symbol dictionary. Called once on page load with no
  // titles (purely static), then re-called after each mash so painting
  // words can quietly take over six random slots.
  // The three per-tense source strings the canvas fortune AND the
  // symbol book both pull their painted-in words from. Centralizing
  // this guarantees the three words that appear on the mash also turn
  // up in the book's painted-in entries (and vice versa).
  function spreadTitleSources() {
    const r0 = spreadState.readings[0];
    const r1 = spreadState.readings[1];
    const fx = spreadState.effects;
    return {
      pastTitleSource:    (r0 && r0.art && r0.art.title) || '',
      futureTitleSource:  (r1 && r1.art && r1.art.title) || '',
      presentTitleSource: fx
        ? [
            EFFECT_LABEL[fx[0].warp]  || fx[0].warp  || '',
            EFFECT_LABEL[fx[1].color] || fx[1].color || '',
          ].join(' ')
        : '',
    };
  }

  function renderSymbolBook() {
    if (!el.bookGrid || !window.TarotFortune) return;
    const cfg = spreadTitleSources();
    // The canvas fortune (compose) picks the arcana meaning words for
    // each tense — pass them through so each painted-in book entry can
    // render "comes from X" against the same word.
    cfg.sourceWords = (spreadState.fortune && spreadState.fortune.sourceWords) || {};
    const book = window.TarotFortune.composeBook(cfg);
    el.bookGrid.innerHTML = book.map(entry => {
      const cls = entry.isStatic ? ' is-static' : ' is-painted';
      // Random ember-pulse phase offset (0..2.4s) so painted rows shimmer
      // out of sync with each other.
      const styleAttr = entry.isStatic
        ? ''
        : ' style="--glow-delay: ' + (Math.random() * 2.4).toFixed(2) + 's"';
      const tag = entry.tense
        ? '<span class="symbol-book-tag symbol-book-tag--' + entry.tense + '">' +
            escapeHtml(entry.tense) +
          '</span>'
        : '';
      const sourceLine = (!entry.isStatic && entry.source)
        ? '<div class="symbol-book-source">comes from <em>' +
            escapeHtml(entry.source) + '</em></div>'
        : '';
      const triggerLine = (!entry.isStatic && entry.trigger)
        ? '<div class="symbol-book-trigger">' +
            escapeHtml(entry.trigger) +
          '</div>'
        : '';
      return (
        '<div class="symbol-book-row' + cls + '"' + styleAttr + '>' +
          '<span class="symbol-book-num">' + escapeHtml(entry.numeral) + '.</span>' +
          '<span class="symbol-book-key">' +
            escapeHtml(entry.symbol) + tag +
          '</span>' +
          '<span class="symbol-book-text">' +
            '<span class="symbol-book-stmt">' + escapeHtml(entry.meaning) + '</span>' +
            sourceLine + triggerLine +
          '</span>' +
        '</div>'
      );
    }).join('');
    if (el.symbolBook) {
      el.symbolBook.hidden = false;
      requestAnimationFrame(() => el.symbolBook.classList.add('shown'));
    }
  }

  function buildFortune() {
    const r0 = spreadState.readings[0];
    const r1 = spreadState.readings[1];
    const fx = spreadState.effects;
    if (!r0 || !r1 || !fx || !window.TarotFortune) return null;
    const majors = [
      r0.major0, r0.major1,
      r1.major0, r1.major1,
      fx[0], fx[1],
    ].filter(Boolean);
    const sources = spreadTitleSources();
    const result = window.TarotFortune.compose({
      effect1: fx[0],
      effect2: fx[1],
      majors:  majors,
      titles:  [r0.art && r0.art.title, r1.art && r1.art.title],
      pastTitleSource:    sources.pastTitleSource,
      presentTitleSource: sources.presentTitleSource,
      futureTitleSource:  sources.futureTitleSource,
    });
    // Cache so renderSymbolBook can read sourceWords for the book's
    // "comes from X" attribution on each painted-in entry.
    spreadState.fortune = result;
    return result;
  }

  // Auto-shrink fontPx until `text` measures under `maxWidth` at the
  // given canvas font, then return the chosen size.
  function fitFontSize(ctx, text, fontTemplate, startPx, minPx, maxWidth) {
    let px = startPx;
    ctx.font = fontTemplate(px);
    while (px > minPx && ctx.measureText(text).width > maxWidth) {
      px -= 1;
      ctx.font = fontTemplate(px);
    }
    return px;
  }

  // Paint a single burned-text line. The crisp core fill adapts to
  // brightness of the bounding rect the line will occupy.
  function paintBurnedLine(ctx, line, x, y, size, fontPx) {
    const sw = Math.min(size, ctx.measureText(line).width + 24);
    const sh = Math.min(size - y, fontPx * 1.4);
    const fill = pickTextFill(sampleCanvasBrightness(
      ctx, x - sw / 2, y, sw, sh
    ));
    ctx.shadowColor = '#ff5522';
    ctx.shadowBlur  = 16;
    ctx.fillStyle   = 'rgba(255, 100, 30, 0.4)';
    ctx.fillText(line, x, y);
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#0a0403';
    ctx.fillText(line, x, y);
    ctx.shadowBlur  = 2;
    ctx.fillStyle   = fill;
    ctx.fillText(line, x, y);
  }

  async function overlayFortune(ctx, size) {
    const fortune = buildFortune();
    if (!fortune || !fortune.lines || !fortune.lines.length) return;

    const serif      = (px) => 'italic ' + px + 'px "IM Fell English", "Garamond", serif';
    const pixelFont  = (px) => px + 'px "Press Start 2P", "VT323", monospace';

    const baseFortunePx = Math.floor(size * 0.042);
    const baseLuckyPx   = Math.floor(size * 0.040);
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([
          document.fonts.load(serif(baseFortunePx)),
          document.fonts.load(pixelFont(baseLuckyPx)),
        ]);
      } catch (err) { /* fall back */ }
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const x          = size / 2;
    const maxWidth   = size * 0.86;
    const lineHeight = Math.floor(size * 0.055);

    // First three lines = past / present / future (italic serif).
    // Remaining lines = pixel-font tag lines (LUCKY NO., TIME OF THE).
    // Block is anchored to the BOTTOM of the canvas — fortune sits in
    // the lower third like cover-art copy.
    const fortuneLines  = fortune.lines.slice(0, 3);
    const tagLines      = fortune.lines.slice(3);
    const gap           = Math.floor(size * 0.020);
    const tagLineHeight = Math.floor(size * 0.052);
    const blockHeight =
      fortuneLines.length * lineHeight +
      (tagLines.length ? gap + tagLines.length * tagLineHeight : 0);
    const bottomMargin = Math.floor(size * 0.025);
    const startY = size - bottomMargin - blockHeight;

    fortuneLines.forEach((line, i) => {
      const px = fitFontSize(ctx, line, serif, baseFortunePx, Math.floor(size * 0.026), maxWidth);
      ctx.font = serif(px);
      paintBurnedLine(ctx, line, x, startY + i * lineHeight, size, px);
    });

    const tagStartY = startY + fortuneLines.length * lineHeight + gap;
    tagLines.forEach((line, i) => {
      const y  = tagStartY + i * tagLineHeight;
      const px = fitFontSize(ctx, line, pixelFont, baseLuckyPx, Math.floor(size * 0.022), maxWidth);
      ctx.font = pixelFont(px);
      paintBurnedLine(ctx, line, x, y, size, px);
    });
    ctx.restore();
  }

  // Each pulled major contributes one half: card 1 → its warp, card 2 →
  // its color. Two-pass chain: warp of m1 paints first, then color of m2
  // remixes that snapshot.
  function renderMashCredits() {
    if (!el.mashCreditsBody) return;
    const lines = [];
    const roman = ['I', 'II'];
    spreadState.readings.forEach((r, i) => {
      if (!r || !r.art) return;
      const a = r.art;
      const title = a.title || 'Untitled';
      const meta = [a.artist_display, a.date_display].filter(Boolean).join(' · ');
      const href = ARTIC_PAGE + a.id;
      lines.push(
        '<div class="mash-source">' +
          '<span class="mash-roman">' + roman[i] + '.</span>' +
          '<a class="mash-source-link" href="' + escapeHtml(href) +
            '" target="_blank" rel="noopener noreferrer">' +
            '<span class="mash-source-title">' + escapeHtml(title) + '</span>' +
            (meta ? '<span class="mash-source-meta">' + escapeHtml(meta) + '</span>' : '') +
          '</a>' +
        '</div>'
      );
    });

    const cardCells = [];
    function cell(role, card, value) {
      cardCells.push(
        '<div class="mash-card">' +
          '<span class="mash-card-role">' + escapeHtml(role) + '</span>' +
          '<span class="mash-card-name">' + escapeHtml(card.name) + '</span>' +
          '<span class="mash-card-value">' + escapeHtml(value) + '</span>' +
          '<span class="mash-card-mean">' + escapeHtml(card.meaning) + '</span>' +
        '</div>'
      );
    }
    spreadState.readings.forEach((r, i) => {
      if (!r) return;
      cell('Year',   r.major0, yearLabel(r.major0.year));
      cell('Medium', r.major1, r.picks.medium);
      cell('Term',   r.minor0, r.picks.search0);
      cell('Term',   r.minor1, r.picks.search1);
    });
    if (spreadState.effects) {
      const [m1, m2] = spreadState.effects;
      cell('Warp',  m1, EFFECT_LABEL[m1.warp]  || m1.warp);
      cell('Color', m2, EFFECT_LABEL[m2.color] || m2.color);
    }

    el.mashCreditsBody.innerHTML =
      '<div class="mash-sources">' + lines.join('') + '</div>' +
      '<div class="mash-spread">' + cardCells.join('') + '</div>';
    if (el.mashCredits) {
      el.mashCredits.hidden = false;
      requestAnimationFrame(() => el.mashCredits.classList.add('shown'));
    }
  }

  async function renderGlitch(majors) {
    const canvas = el.glitchCanvas;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    const imgA = el.frames[0].querySelector('.art-image');
    const imgB = el.frames[1].querySelector('.art-image');
    const [okA, okB] = await Promise.all([
      waitForImageLoad(imgA), waitForImageLoad(imgB)
    ]);
    if (!okA || !okB) {
      // drawReading should have re-rolled any broken image earlier, but
      // guard the canvas anyway — a sample from a 0×0 <img> throws and
      // the chain leaves the canvas blank.
      throw new Error('intermediary image failed to load');
    }

    // Pass 1 — major1's WARP, against a posterized + inked imgA.
    const inkedA = await posterizeAndInk(imgA, size);
    applyEffect(majors[0].warp, ctx, inkedA, imgB, size);

    // Pass 2 — major2's COLOR over snapshot of pass 1.
    const snap = await snapshotCanvas(canvas);
    applyEffect(majors[1].color, ctx, snap, imgB, size);

    // Several warps/colors drop one of the two source images entirely
    // (e.g. ripple, swirl, pixel sort, duotone, threshold, posterize all
    // ignore B; some color passes ignore A). Lay a high-alpha cross-fade
    // of the raw paintings on top so the effected canvas reads as a
    // glitch overlay rather than the primary content.
    blendBothSources(ctx, imgA, imgB, size);

    // Neon-blood splatter sits on top of the warp + color but below the
    // burned text so the quote and face still read.
    overlaySplatter(ctx, size);

    await overlayFortune(ctx, size);
    await overlayChildFace(ctx, size);

    const label = (fx) => EFFECT_LABEL[fx] || fx;
    el.glitchLabel.textContent =
      label(majors[0].warp) + ' → ' + label(majors[1].color);
    renderMashCredits();
    renderSymbolBook();
    sfx('mash');
    el.glitch.hidden = false;
    requestAnimationFrame(() => {
      el.glitch.classList.add('shown');
      // Center the canvas itself — not the whole section — so the
      // final image lands DEAD center of the viewport instead of being
      // averaged with the book + caption + reset below it.
      el.glitchCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ────────────────────────────────────────────────────────────────────
  //  MAIN
  // ────────────────────────────────────────────────────────────────────
  function pickTwoDistinct(arr) {
    const i = Math.floor(Math.random() * arr.length);
    let j = Math.floor(Math.random() * (arr.length - 1));
    if (j >= i) j++;
    return [arr[i], arr[j]];
  }

  function pickOneArt(artworks) {
    const withImages = artworks.filter(a => a.image_id);
    if (!withImages.length) return null;
    return withImages[Math.floor(Math.random() * withImages.length)];
  }

  const VALIDATE_MAX_TRIES = 200;
  async function findValidatedSpread() {
    for (let i = 0; i < VALIDATE_MAX_TRIES; i++) {
      if (i > 0 && i % 5 === 0) {
        setStatus('Still shuffling (this may take a minute)… (' + i + ')');
        setShuffleSub('(' + i + ' Communing with API just hold on...)');
      }
      const [major0, major1] = pickTwoDistinct(MAJORS);
      const [minor0, minor1] = pickTwoDistinct(MINORS);
      const medium  = pickOne(major1.mediums);
      const search0 = pickOne(minor0.searches);
      const search1 = pickOne(minor1.searches);
      const [y0, y1] = jitteredYearWindow(major0.year);
      const query = buildQuery([search0, search1], medium, y0, y1);
      try {
        const artworks = await searchArtworks(query);
        const art = pickOneArt(artworks);
        if (art) {
          return {
            major0, major1, minor0, minor1,
            picks: { medium, search0, search1, y0, y1 },
            art
          };
        }
      } catch (err) {
        // try another spread
      }
    }
    return null;
  }

  let drawing = false;
  let drawCount = 0;

  // How many "fresh validated spread" attempts to make if the chosen
  // artwork's image fails to load. Bounded so a flaky AIC IIIF doesn't
  // hang the page forever.
  const MAX_IMAGE_RETRIES = 3;

  async function drawReading() {
    setStatus('Shuffling the deck…');
    setMood('shuffling');
    el.decks.classList.add('shuffling');
    showShuffleOverlay();
    sfx('shuffle');
    const shuffleStart = Date.now();
    try {
      const drawIndex = drawCount;
      let result = null;
      for (let attempt = 0; attempt < MAX_IMAGE_RETRIES && !result; attempt++) {
        const candidate = await findValidatedSpread();
        if (!candidate) break;
        if (attempt > 0) {
          setStatus('Image refused; reshuffling…');
          setShuffleSub('image refused; reshuffling…');
        }
        const ok = await renderFrame(el.frames[drawIndex], candidate.art);
        if (ok) {
          result = candidate;
        }
        // If !ok, the loop runs again to validate + try another artwork.
      }
      el.decks.classList.remove('shuffling');
      hideShuffleOverlay();
      const coinsEarned = awardShuffleBonus(Date.now() - shuffleStart);
      const coinNote = coinsEarned > 0
        ? '  (+' + coinsEarned + ' coin' + (coinsEarned === 1 ? '' : 's') + ' for thy patience)'
        : '';
      if (!result) {
        setStatus('Hey its the author here, dont blame me for this, this runs on the Art Insiti... of Chicago API and its not letting you do Tarot not me. Better that the METs fucking API tho, right? Refresh itll work... unless Trump shut it down via budget cuts', true);
        return;
      }
      setStatus('');
      spreadState.readings[drawIndex] = result;
      await animateSpread(
        result.major0, result.major1, result.minor0, result.minor1,
        drawIndex, result.picks
      );
      drawCount = drawIndex + 1;
      if (drawCount === 1) {
        setStatus('One reading down. Click a deck for the second.' + coinNote);
        setMood('half-drawn');
      } else {
        setStatus('Two readings drawn. Click a deck for the effect →' + coinNote);
        setMood('ready to mash');
      }
      // Hang on the freshly-flipped cards for a beat so the player can
      // actually read them, THEN scroll so the new painting and the
      // cards that summoned it are both on screen together.
      await sleep(2200);
      scrollSpreadAndGallery();
    } catch (err) {
      el.decks.classList.remove('shuffling');
      hideShuffleOverlay();
      setStatus('The Art Institute is unreachable. Click a deck to try again.', true);
    }
  }

  async function drawFinalMajors() {
    setStatus('Pulling the effects…');
    setMood('reaching');
    const [major1, major2] = pickTwoDistinct(MAJORS);
    spreadState.effects = [major1, major2];
    try {
      await animateGlitchCard(major1, 0);
      await sleep(180);
      await animateGlitchCard(major2, 1);
      drawCount = 3;
      await sleep(500);
      setStatus('Mashing the readings…');
      setMood('mashing');
      await renderGlitch([major1, major2]);
      setStatus('Divination complete.');
      setMood('glitched');
    } catch (err) {
      setStatus('The glitch refused. Hit "draw again".', true);
      setMood('glitched');
      drawCount = 3;
    }
  }

  async function draw() {
    if (drawing) return;
    if (drawCount >= 3) return; // mash already drawn; reset via cta-reset
    drawing = true;
    el.decks.classList.add('drawing');
    updateClickGlow();
    try {
      if (drawCount < 2) {
        await drawReading();
      } else {
        await drawFinalMajors();
      }
    } finally {
      drawing = false;
      el.decks.classList.remove('drawing');
      updateClickGlow();
    }
  }

  function bindDeck(deck) {
    deck.addEventListener('click', () => { sfx('click'); draw(); });
    deck.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sfx('click');
        draw();
      }
    });
  }
  bindDeck(el.majorDeck);
  bindDeck(el.minorDeck);

  el.ctaReset.addEventListener('click', () => {
    if (drawing) return;
    sfx('click');
    resetReading();
    drawCount = 0;
    setMood('bored');
    setStatus('Click a deck.');
    updateClickGlow();
    el.decks.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Stop the Booke glowing the moment the player clicks to open it.
  if (el.symbolBook) {
    el.symbolBook.addEventListener('toggle', () => {
      if (el.symbolBook.open) sfx('book');
      updateClickGlow();
    });
  }

  setMood('bored');
  setStatus('Click a deck.');
  updateClickGlow();
})();
