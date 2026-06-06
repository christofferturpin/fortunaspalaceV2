/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN — ASCII Moloch jeer pop-up (dealer-win taunt)              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► waitForRound() ──► JG.Round.onChange(onState)     │
  │                                                                          │
  │   onState(state):                                                        │
  │     resolved+dealerWin && new outcome && rnd<PROB                        │
  │       └─ setTimeout(showJeer, ENTER_MS)                                  │
  │     track lastOutcome (so we only fire once per resolution)              │
  │                                                                          │
  │   showJeer():                                                            │
  │     ensureEl() — lazy-build #jg-moloch-jeer w/ .jg-moloch-art-wrap       │
  │       containing two stacked <pre>: .jg-moloch-art-base (gold) and       │
  │       .jg-moloch-art-red (cherry overlay = horns + sunglasses)           │
  │     pickQuote() ──► one of QUOTES[]                                      │
  │     clear pending timers; base/red textContent=ART_*; quote=pick         │
  │     hidden=F; rAF→cls.add('shown'); hideTimer→cls.remove('shown');       │
  │       fadeTimer→hidden=T                                                 │
  │                                                                          │
  │   Visual: gilded parchment speech-bubble, fixed bottom-right above the   │
  │   action bar. Two-layer Braille Moloch (gold base + red horns/shades) +  │
  │   a documented-record brag quote.                                        │
  │                                                                          │
  │   Exports: none (DOM side-effect + Round subscription)                   │
  │   External deps: JG.Round.onChange                                       │
  │   Consumers: pages/jackandgin.html, css/jackandgin/jackandgin.css        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  ART_BASE=24×30 Braille Moloch portrait (gold) — row 0 blank padding
  ART_RED =24×30 Braille overlay (cherry) — devil horns on row 0,
    cap-red hair on rows 1-4 (matches ART_BASE hair Braille so the
    bouffant overlays red), sunglasses bar on row 7 (stamped over the
    eye Braille); else U+2800
  QUOTES=[15 brag-as-confession lines from documented public record:
    Access Hollywood "let you do it"; 2002 NY Mag "younger side";
    Carroll $83M jury; 34-count NY felony conviction; Vietnam draft
    deferments; 1973 DOJ housing suit; Central Park Five ads;
    "haven't paid taxes"; school-fraud $25M settlement; foundation
    dissolved; NY civil-fraud $464M; "start kissing them"; Mar-a-Lago
    Epstein access; Epstein flight logs; Manafort/Stone/Bannon pardons]
  PROB=0.6; ENTER_MS=550; SHOWN_MS=5500; FADE_MS=500
  state: lastOutcome=null, jeerEl=null, artBaseEl=null, artRedEl=null, quoteEl=null, hideTimer=null, fadeTimer=null
  ensureEl()→HTMLEl: jeerEl||build div#jg-moloch-jeer hidden > div.jg-moloch-art-wrap > [<pre.jg-moloch-art-base>, <pre.jg-moloch-art-red aria-hidden>] + <div.jg-moloch-quote>; body.append
  pickQuote()→str: QUOTES[⌊rnd*len⌋]
  showJeer(): ensureEl; clearTimeout(hide+fade); base.text=ART_BASE; red.text=ART_RED; quote.text=pick; hidden=F; rAF→cls.add('shown'); hideTimer=setTimeout(SHOWN_MS,()=>cls.remove('shown'); fadeTimer=setTimeout(FADE_MS,()=>hidden=T))
  onState(s): justResolved=s.phase=='resolved'&&lastOutcome!='dealerWin'&&s.outcome=='dealerWin'; justResolved&&rnd<PROB→setTimeout(ENTER_MS,showJeer); lastOutcome=s.phase=='resolved'?s.outcome:null
  waitForRound(): JG.Round?onChange(onState):setTimeout(waitForRound,50)
  bind: readyState=='loading'?DOMContentLoaded→waitForRound:waitForRound()
  exports: none; DOM: #jg-moloch-jeer > .jg-moloch-art-wrap > .jg-moloch-art-{base,red} + .jg-moloch-quote
*/

(function () {
  // 24-line Braille-pattern portrait of the dealer (Moloch wearing the face
  // of his most recent incarnation). Bouffant hair + scowling face. The top
  // row is blank padding so the red overlay can stamp devil horns over it
  // without pushing the gold layer out of alignment.
  const ART_BASE = [
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⣠⣔⣾⣿⣿⣿⣻⢟⣿⣿⣿⣿⡿⣗⣦⣤⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⢠⣾⣿⣿⣾⣿⣿⢿⣿⣿⣞⢿⣿⣿⣿⣿⣿⣿⣶⣎⡑⢄⠀⠀⠀⠀⠀⠀',
    '⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⢿⣽⡻⣟⣼⣷⣫⢿⡽⣯⣷⣻⣷⣿⠀⠀⠀⠀⠀⠀',
    '⠀⣼⣿⣿⣿⣿⣿⣿⢻⡝⠯⠼⢱⡙⢾⣷⣿⣾⣻⣽⣾⣷⣿⣍⡁⠀⠀⠀⠀⠀',
    '⣸⣿⣿⣿⢿⠻⢏⠌⠡⠐⠈⠁⢂⠘⠤⢛⠻⣿⣿⢿⠿⢿⣿⡇⠀⠀⠀⠀⠀⠀',
    '⣿⣿⣿⣏⣤⠷⡈⠄⠀⠀⠄⡀⠠⠘⣰⠈⡐⢄⠢⢍⠎⢼⣏⢧⠀⠀⠀⠀⠀⠀',
    '⣿⣿⣿⡿⢊⢅⠒⠤⣞⣾⣶⣶⣶⣵⠃⣲⣴⣷⣾⡾⠖⣸⡯⢸⡀⠀⠀⠀⠀⠀',
    '⣾⢹⣿⢣⢉⣪⣽⠷⣟⣛⣛⣻⢿⡿⠀⢿⢿⣿⣟⣿⣶⣾⡷⣽⡇⠀⠀⠀⠀⠀',
    '⢻⣼⢫⣷⡞⣋⡔⠋⠉⠉⠭⣀⣆⡟⠀⠞⣷⠊⡉⠀⡘⣿⣿⡿⠃⠀⠀⠀⠀⠀',
    '⢸⣏⠼⣿⣵⢫⡑⢤⣀⣦⣷⣿⣙⣁⠀⡘⣿⣷⣆⡡⢄⣹⡿⠁⠀⠀⠀⠀⠀⠀',
    '⣼⣿⣿⢿⣾⡡⣏⣷⣿⣏⣣⡌⢛⠿⡿⢿⢫⣙⣿⡿⢯⡾⠃⠀⠀⠀⠀⠀⠀⠀',
    '⢿⡇⢹⢾⣿⡷⢇⡆⡈⠈⢿⢿⣶⠷⠾⠏⡿⡏⡉⢹⣾⡇⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⣵⡟⢯⣿⣿⣏⠖⡡⢈⠌⠳⠮⢭⠭⠽⣋⠱⢠⢗⡾⠁⠀⠀⠀⠀⠀⠀⠀⠀',
    '⣾⣿⡇⠈⢻⣿⣿⣧⣱⢂⡘⠠⡉⠌⢘⡐⠄⣽⢋⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⣿⣿⡇⠀⠀⠙⢿⣿⣾⣻⣶⣧⣵⣪⣴⣼⣾⣽⣏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⣿⣿⣿⡀⠀⠀⠀⠈⠻⢿⡿⢿⡿⣿⢿⡿⠋⢹⣿⣷⣦⣄⣀⠀⠀⠀⠀⠀⠀⠀',
    '⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠙⠯⣾⡟⠋⠀⠀⢸⣿⣿⣿⣿⣿⣿⣶⣦⣤⣀⡀⠀',
    '⣿⣿⣿⣿⣦⠀⠀⠀⠀⢀⣴⣈⡁⠉⢰⡄⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷',
    '⣿⣿⣿⣿⣿⡆⠀⡀⠔⠙⠓⢬⣇⣰⠟⠓⡄⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿',
    '⣿⣿⣿⣿⣿⣿⡌⠀⠀⠀⠀⡘⠰⡇⡄⠀⠘⠤⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿',
    '⣿⣿⣿⣿⣿⣿⣿⡀⠀⠀⢸⠁⢀⠇⡃⠀⠀⢸⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿',
    '⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⢸⠀⠀⠀⠹⡀⠀⠀⠌⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿',
    '⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⢸⠀⠀⠀⠀⣳⡀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿',
  ].join('\n');

  // Red overlay. Same 24×30 dimensions. Row 0 = devil horns flanking the
  // head. Rows 1-4 = cap-red hair (copies the hair Braille from ART_BASE
  // so the bouffant overlays as cherry-red, reading as a red cap). Row 7
  // = sunglasses bar stamped over the eye Braille. All else U+2800 blank.
  const ART_RED = [
    '⠀⠀⠀⠀⠀⠘⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⣠⣔⣾⣿⣿⣿⣻⢟⣿⣿⣿⣿⡿⣗⣦⣤⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⢠⣾⣿⣿⣾⣿⣿⢿⣿⣿⣞⢿⣿⣿⣿⣿⣿⣿⣶⣎⡑⢄⠀⠀⠀⠀⠀⠀',
    '⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⢿⣽⡻⣟⣼⣷⣫⢿⡽⣯⣷⣻⣷⣿⠀⠀⠀⠀⠀⠀',
    '⠀⣼⣿⣿⣿⣿⣿⣿⢻⡝⠯⠼⢱⡙⢾⣷⣿⣾⣻⣽⣾⣷⣿⣍⡁⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⣶⣶⣶⣶⣶⣶⠶⣶⣶⣶⣶⣶⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  ].join('\n');

  // Brag-as-confession, twisted card-table register. Each line still
  // references a documented public-record fact (court findings, recorded
  // statements, published interviews, government documents) — recontextualized
  // into the language of the table. The slant comes from the gap between
  // the gilded gambling-brag voice and what is actually being named.
  const QUOTES = [
    "When you're a star they let you split aces. They let you do ANYTHING. I just walk up to the table.",
    'Me and Jeff liked the same kind of hands. Soft. On the younger side. I said that. In print.',
    'Federal jury hit me for eighty-three million. The biggest pot they ever paid out. I am appealing.',
    'Thirty-four felonies. Card counters get thrown out. I doubled down.',
    'Bone spurs. Five times I folded out of the war. The smart play. The very smart play.',
    'Justice Department came after my room. Said I dealt only certain players in. We settled. The room stayed how I liked it.',
    'I called for the death penalty on five kids. Turned out they were holding nothing. I have NEVER apologized for that read.',
    "Haven't paid the house a dime in years. YEARS. That's what makes me smart.",
    'My school. Twenty-five million to settle. They called the lessons fraud. I called them buy-ins.',
    'They shut down my charity. Said I treated it like a chip stack.',
    'Four hundred sixty-four million in civil fraud. I inflated my hand. Everybody does. The smart ones.',
    "I just start raising. I don't even look at the cards. They come to me. Locker-room poker.",
    'Jeff played at my club. Many times. Mar-a-Lago. He had a key to the card room. Terrific guy.',
    'His plane. My name in the logs. We played the long flights. Many times. The longest flights.',
    "I pardoned my players. Manafort. Stone. Bannon. They threw hands for me. That's what the pardons are for.",
    "Even I think Steve Miller is a little Nazi-ish, he reminds me of my dad."
  ];

  const PROB     = 0.6;
  const ENTER_MS = 550;
  const SHOWN_MS = 5500;
  const FADE_MS  = 500;

  let lastOutcome = null;
  let jeerEl     = null;
  let artBaseEl  = null;
  let artRedEl   = null;
  let quoteEl    = null;
  let hideTimer  = null;
  let fadeTimer  = null;

  function ensureEl() {
    if (jeerEl) return jeerEl;
    jeerEl = document.createElement('div');
    jeerEl.id = 'jg-moloch-jeer';
    jeerEl.hidden = true;
    jeerEl.setAttribute('aria-hidden', 'true');
    const wrap = document.createElement('div');
    wrap.className = 'jg-moloch-art-wrap';
    artBaseEl = document.createElement('pre');
    artBaseEl.className = 'jg-moloch-art jg-moloch-art-base';
    artRedEl = document.createElement('pre');
    artRedEl.className = 'jg-moloch-art jg-moloch-art-red';
    artRedEl.setAttribute('aria-hidden', 'true');
    wrap.appendChild(artBaseEl);
    wrap.appendChild(artRedEl);
    quoteEl = document.createElement('div');
    quoteEl.className = 'jg-moloch-quote';
    jeerEl.appendChild(wrap);
    jeerEl.appendChild(quoteEl);
    document.body.appendChild(jeerEl);
    return jeerEl;
  }

  function pickQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  function showJeer() {
    ensureEl();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    artBaseEl.textContent = ART_BASE;
    artRedEl.textContent  = ART_RED;
    quoteEl.textContent = pickQuote();
    jeerEl.hidden = false;
    jeerEl.classList.remove('shown');
    // Force a reflow so the transition triggers from the hidden state.
    void jeerEl.offsetWidth;
    requestAnimationFrame(() => jeerEl.classList.add('shown'));
    hideTimer = setTimeout(() => {
      jeerEl.classList.remove('shown');
      fadeTimer = setTimeout(() => { jeerEl.hidden = true; }, FADE_MS);
    }, SHOWN_MS);
  }

  function onState(state) {
    const justResolved =
      state.phase === 'resolved'
      && state.outcome === 'dealerWin'
      && lastOutcome !== 'dealerWin';
    if (justResolved && Math.random() < PROB) {
      setTimeout(showJeer, ENTER_MS);
    }
    lastOutcome = state.phase === 'resolved' ? state.outcome : null;
  }

  function waitForRound() {
    if (window.JG && window.JG.Round && typeof window.JG.Round.onChange === 'function') {
      window.JG.Round.onChange(onState);
    } else {
      setTimeout(waitForRound, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForRound);
  } else {
    waitForRound();
  }
})();
