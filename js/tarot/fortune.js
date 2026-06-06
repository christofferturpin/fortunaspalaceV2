/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FORTUNE — past/present/future composer (drawn data only)                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   compose({effect1, effect2, majors, titles})                            │
  │       │                                                                  │
  │       ├─ PAST    = pickArcanaWord(effect1) + " of " + pickTitleWord(t1)  │
  │       ├─ PRESENT = pickArcanaWord(effect2) + " of " + pickTitleWord(t2)  │
  │       ├─ FUTURE  = pickArcanaWord(rndMajor) + " of " + pickTitleWord(    │
  │       │              titles[rnd])                                        │
  │       └─ LUCKY   = luckyNumber(titles)                                   │
  │                                                                          │
  │   - "Arcana word"  = substantive word (≥3 chars, no stopwords) from a    │
  │                      drawn major's meaning text; falls back to name.     │
  │   - "Title word"   = word from artwork title with length ≥ 4 chars.      │
  │   - Lucky number   = deterministic djb2-style hash of the two titles     │
  │                      mod 10000, zero-padded.                             │
  │   - All composed phrases are Title Cased.                                │
  │                                                                          │
  │   Output: { lines: [pastLine, presentLine, futureLine, luckyLine],       │
  │             lucky: '7384' }                                              │
  │                                                                          │
  │   Exports (window.TarotFortune): { compose, luckyNumber }                │
  │   External deps: none.                                                   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STOPWORDS={the,and,or,of,in,to,for,by,with,on,a,an,as,at,is,its,it};
  pickArcanaWord(card)→str: split card.meaning on /\W+/; filter
    len≥3 && ∉STOPWORDS; rnd | fallback stripNumeral(card.name).
  pickTitleWord(title,min=4)→str: title.replace(non-word→' ').split;
    filter len≥min && ∉STOPWORDS; rnd | ''.
  titleCase(s)→str: capitalize first letter of each token in s.
  luckyNumber(titles)→4-digit str: s=join+strip+lower; h=djb2; |h|%10000
    padStart 4.
  compose({effect1,effect2,majors,titles})→{lines,lucky}: 3 fortune
    lines (TitleCase "WORD of WORD") + lucky line.
  exports: global.TarotFortune={compose,luckyNumber}.
*/
(function (global) {
  'use strict';

  const STOPWORDS = new Set([
    'the','and','or','of','in','to','for','by','with','on',
    'a','an','as','at','is','its','it','from','into','onto'
  ]);

  function stripNumeral(name) {
    return String(name || '').replace(/^[^-]+-\s*/, '').trim() || String(name || '');
  }

  function rnd(arr) {
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  }

  function wordsFrom(text, minLen) {
    return String(text || '')
      .replace(/[^a-zA-Z'\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= minLen && !STOPWORDS.has(w.toLowerCase()));
  }

  // Pick a substantive word from the card's meaning, optionally
  // skipping any words already used elsewhere in the fortune so the
  // three past/present/future lines never collide.
  function pickArcanaWord(card, excludeSet) {
    if (!card) return '';
    const exclude = excludeSet || new Set();
    const ws = wordsFrom(card.meaning, 3);
    const avail = ws.filter(w => !exclude.has(w.toLowerCase()));
    const pool = avail.length ? avail : ws;  // fall back if all excluded
    const raw = pool.length
      ? rnd(pool)
      : stripNumeral(card.name).replace(/^The\s+/i, '');
    return raw;
  }

  // Recast an arcana word so its ending reads as a "full" abstract
  // noun — pluralize concrete nouns (Manifestation → Manifestations,
  // Authority → Authorities) and nominalize adjectives with -ness
  // (Sudden → Suddenness, New → Newness). Mass nouns and already-
  // plural / -ness / -tion words are returned unchanged.
  const ADJECTIVES = new Set([
    'new', 'hidden', 'inner', 'inward', 'material', 'sudden',
    'fair', 'old', 'young', 'true', 'false', 'good', 'bad',
    'deep', 'high', 'low', 'soft', 'hard'
  ]);
  const MASS_NOUNS = new Set([
    'knowledge', 'courage', 'abundance', 'willpower', 'wisdom',
    'patience', 'strength', 'balance', 'hope', 'joy', 'truth',
    'love', 'fear', 'doubt', 'pride', 'awareness', 'silence',
    'darkness', 'lightness', 'grief', 'shame', 'faith'
  ]);

  function activize(word) {
    if (!word) return word;
    const lower = word.toLowerCase();

    // Already plural (-s ending) or already an abstract -ness: leave.
    if (/(?:ness|s)$/i.test(word)) return word;
    // Mass nouns shouldn't pluralize — they read as awkward.
    if (MASS_NOUNS.has(lower)) return word;
    // Adjectives → nominalize with -ness (singular abstract noun).
    if (ADJECTIVES.has(lower) ||
        (/(?:ful|less|ous|ive|ic)$/i.test(word) && lower.length > 4)) {
      return word + 'ness';
    }
    // Everything else pluralizes with standard English rules.
    if (/[bcdfghjklmnpqrstvwxz]y$/i.test(word)) {
      return word.slice(0, -1) + 'ies';
    }
    if (/(?:x|z|ch|sh)$/i.test(word)) return word + 'es';
    return word + 's';
  }

  // First word in `text` that isn't a stopword. Deterministic so both
  // the canvas fortune and the symbol book pick the same word from the
  // same source string. minLen guards against 1- and 2-char ekes ("of",
  // "in") — we still want real words even if not in the stopword set.
  //
  // Two fallback rungs so we (almost) never return empty:
  //   1. First non-stopword of length ≥ minLen
  //   2. First word of length ≥ minLen (even stopwords)
  //   3. First word of any length
  function firstNonStopword(text, minLen) {
    const m = minLen || 2;
    const words = String(text || '')
      .replace(/[^a-zA-Z'\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const w of words) {
      if (w.length >= m && !STOPWORDS.has(w.toLowerCase())) return w;
    }
    for (const w of words) {
      if (w.length >= m) return w;
    }
    return words[0] || '';
  }

  // Returns the three title words that show up on the canvas fortune
  // (past / present / future) given the per-tense source strings. Used
  // by compose() and composeBook() so the words match across both.
  function pickPPFTitleWords(sources) {
    sources = sources || {};
    return {
      past:    firstNonStopword(sources.pastTitleSource    || sources.pastSource    || '', 2),
      present: firstNonStopword(sources.presentTitleSource || sources.presentSource || '', 2),
      future:  firstNonStopword(sources.futureTitleSource  || sources.futureSource  || '', 2),
    };
  }

  function titleCase(s) {
    return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Join two pieces with " of ", but skip the connector if either side is
  // empty so we don't produce dangling text.
  function joinOf(a, b) {
    if (a && b) return a + ' of ' + b;
    return a || b || '';
  }

  // One creature per hour of the day — divinatory hour name. Drawn from
  // a mix of nocturnal / folkloric / occult bestiary so the canvas
  // surfaces a "time of the X" that rotates as the day progresses.
  const HOUR_CREATURES = [
    'MOTH',     // 00
    'OWL',      // 01
    'BAT',      // 02
    'WOLF',     // 03
    'SPIDER',   // 04
    'ROOSTER',  // 05
    'DOVE',     // 06
    'DEER',     // 07
    'BEE',      // 08
    'CAT',      // 09
    'HARE',     // 10
    'CROW',     // 11
    'LION',     // 12
    'SERPENT',  // 13
    'FOX',      // 14
    'SWAN',     // 15
    'HOUND',    // 16
    'STAG',     // 17
    'HORSE',    // 18
    'RAVEN',    // 19
    'BEAR',     // 20
    'JACKAL',   // 21
    'SCORPION', // 22
    'NIGHTHAWK',// 23
  ];
  function timeOfTheCreature(now) {
    const d = now || new Date();
    return HOUR_CREATURES[d.getHours() % 24] || 'OWL';
  }

  function luckyNumber(titles) {
    const s = (Array.isArray(titles) ? titles.join('') : String(titles || ''))
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return String(Math.abs(h) % 10000).padStart(4, '0');
  }

  function compose(input) {
    if (!input || typeof input !== 'object') {
      return { lines: [], lucky: '0000' };
    }
    const titles  = input.titles  || ['', ''];
    const effect1 = input.effect1 || null;
    const effect2 = input.effect2 || null;
    const majors  = (input.majors && input.majors.length) ? input.majors : [];

    // Track raw arcana words across the three picks so the same meaning
    // word never lands twice.
    const usedArcana = new Set();
    const pastRaw    = pickArcanaWord(effect1, usedArcana);
    if (pastRaw) usedArcana.add(pastRaw.toLowerCase());
    const presentRaw = pickArcanaWord(effect2, usedArcana);
    if (presentRaw) usedArcana.add(presentRaw.toLowerCase());
    const futureCard = rnd(majors) || effect1 || effect2;
    const futureRaw  = pickArcanaWord(futureCard, usedArcana);

    // Deterministic first-non-stopword picks per tense, so the canvas
    // fortune and the symbol book end up surfacing the same three
    // title words from the same three sources.
    const titleWords = pickPPFTitleWords(input);

    const past    = joinOf(activize(pastRaw),    titleWords.past);
    const present = joinOf(activize(presentRaw), titleWords.present);
    const future  = joinOf(activize(futureRaw),  titleWords.future);

    const lucky    = luckyNumber(titles);
    const creature = timeOfTheCreature();

    return {
      lines: [
        'PAST  ·  '    + titleCase(past),
        'PRESENT  ·  ' + titleCase(present),
        'FUTURE  ·  '  + titleCase(future),
        'LUCKY NO.  '  + lucky,
        'TIME OF THE  ·  ' + creature,
      ],
      lucky: lucky,
      creature: creature,
      // Raw arcana words picked for each tense — passed to composeBook
      // so the book can attribute each painted-in entry ("comes from X")
      // back to the meaning word it was generated alongside.
      sourceWords: {
        past:    pastRaw    || '',
        present: presentRaw || '',
        future:  futureRaw  || '',
      },
    };
  }

  // Stage-psychic cold-reading triggers. First-person hedged claims
  // ("I'm sensing…", "I'm getting…"), partial letter guesses, vague
  // sensory hits, conditional offerings — phrasings the player's
  // brain will round to "yes, that fits me".
  const INTERPRETIVE_TRIGGERS = [
    // Reading-mode instructions
    'interpret literally',
    'interpret metaphorically',
    'interpret as a warning',
    'interpret as encouragement',
    'this may or may not be right',
    'this may apply later than you think',
    'this is the echo, not the sound',
    "the card is answering a question you haven't asked yet",

    // First-person figure cold reads
    "I'm seeing a maternal figure",
    "I'm seeing a paternal figure",
    "I'm seeing a younger one in your care",
    "I'm seeing an elder whose voice you still hear",
    "I'm seeing a sibling — by blood or by choice",
    "I'm seeing someone you'll recognize before they recognize you",
    "I'm seeing a room you can still walk through with your eyes closed",
    "I'm seeing someone you knew by their last name",
    "I'm seeing someone who taught you something they didn't know they were teaching",
    "I'm seeing someone whose handwriting you'd still recognize",
    "I'm sensing someone who once thought of you every day",

    // Letter / name guesses (the bread and butter)
    "I'm sensing the letter M — does that mean anything to you?",
    "I'm sensing the letter J, or possibly G",
    "I'm sensing the letter S — or perhaps Z",
    "I'm sensing the letter R, possibly T",
    "I'm getting the letter B — or perhaps V",
    "I'm getting the letter L on the tongue",
    "I'm getting a vowel — A, or possibly O",
    "I'm picking up a name with two syllables",
    "I'm picking up a name with a hard consonant in it",
    "I'm picking up a name that ends in a vowel",
    "I'm picking up a name you used to write differently",
    "I'm picking up a nickname only one person used",

    // Number / date cold reads
    "I'm getting the number seven",
    "I'm getting a number that shows up more than it should — on receipts, on clocks",
    "I'm getting a number with a three in it",
    "I'm picking up a date that falls on a weekday this year",
    "I'm picking up a month that ends in -ber",
    "I'm sensing a Tuesday — or a Thursday",
    "I'm sensing an evening, not a morning",
    "I'm sensing an anniversary you almost forgot",

    // Sensory hits
    "I'm getting something gold",
    "I'm getting something silver",
    "I'm sensing a blue that's almost gray",
    "I'm sensing a red that's closer to rust",
    "I'm sensing a keepsake — a ring, a coin, a chain",
    "I'm getting the smell of something burning",
    "I'm getting the weight of something in a pocket",
    "I'm getting the feeling of a door closing behind you in another room",

    // General cold reads (the wide net)
    "I'm seeing a body of water — small, not the sea",
    "I'm seeing a doorway you have not yet walked through",
    "I'm seeing something you put away and meant to come back to",
    "I'm sensing unfinished business",
    "I'm sensing a conversation that ended before it was finished",
    "I'm sensing something kept in a drawer",
    "I'm picking up a song stuck in someone's head",
    "I'm picking up a phone call that hasn't yet been made",
    "I'm picking up something you almost said out loud yesterday",
    "I'm getting a number you have written down recently",
    "I'm getting the feeling of looking for something while holding it",
    "I'm getting the feeling of waiting for an envelope",
  ];

  // ────────────────────────────────────────────────────────────────────
  //  Booke of Symbols (cold-read edition)
  //
  //  Static dictionary of 40 sigil → reading pairs. composeBook(titles)
  //  pulls ≤6 ≥4-letter words from the player's artwork titles and
  //  silently overwrites that many random slots with painting-derived
  //  entries — each painting word gets a randomly-attached reading
  //  from MYSTICAL_PHRASES. The substitution is the trick:
  //
  //    • "always there" entries (the genuine static sigils) glow with
  //      the amber halo (isStatic=true)
  //    • painting-word entries (isStatic=false) do NOT glow
  //
  //  A careful reader notices a few entries that don't smoulder; those
  //  are the ones the cards pretended were always in the book.
  // ────────────────────────────────────────────────────────────────────

  // 1..40 → roman numerals.
  function toRoman(num) {
    const pairs = [[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let n = num, out = '';
    for (const [v, s] of pairs) {
      while (n >= v) { out += s; n -= v; }
    }
    return out;
  }

  // 40 "always there" sigil keys. Their attached reading is shuffled
  // each draw from the BARNUM pool below — so the same Moon will give
  // a different cold-read the next time the book opens.
  const SYMBOL_KEYS = [
    'Moon','Sun','Star','Owl','Raven','Crow','Snake','Key','Rose','Dagger',
    'Hand','Eye','Mirror','Crown','Fire','Water','Tree','Mountain','Road','Door',
    'Wheel','Anchor','Mask','Candle','Scythe','Fish','Butterfly','Cup','Sword','Coin',
    'Wand','Tower','Lion','Wolf','Fox','Deer','Dove','Spider','Bee','Dog',
  ];

  // Barnum / Forer-style cold-read statements. The first 13 are
  // Forer's original 1948 set verbatim; the rest are in the same
  // register — broad enough to apply to anyone, specific enough that
  // the reader thinks the book wrote them personally.
  const BARNUM = [
    // Forer 1948 (canonical)
    'You have a great need for other people to like and admire you.',
    'You have a tendency to be critical of yourself.',
    'You have a great deal of unused capacity which you have not turned to your advantage.',
    'While you have some personality weaknesses, you are generally able to compensate for them.',
    'Your sexual adjustment has presented problems for you.',
    'Disciplined and self-controlled outside, you tend to be worrisome and insecure inside.',
    'At times you have serious doubts as to whether you have made the right decision or done the right thing.',
    'You prefer a certain amount of change and variety and become dissatisfied when hemmed in by restrictions and limitations.',
    'You pride yourself as an independent thinker and do not accept others’ statements without satisfactory proof.',
    'You have found it unwise to be too frank in revealing yourself to others.',
    'At times you are extroverted, affable, sociable, while at other times you are introverted, wary, reserved.',
    'Some of your aspirations tend to be pretty unrealistic.',
    'Security is one of your major goals in life.',

    // Plays-to-anyone supplements
    'You have a tendency to worry about things you cannot control.',
    'You have a great deal of patience with others and very little with yourself.',
    'You are more sensitive than most people realize.',
    'You have a deep need to feel that your work is meaningful.',
    'You have struggled with the feeling that you are not living up to your potential.',
    'You appear confident to others while privately questioning yourself.',
    'You have a habit of analyzing situations from several angles before deciding.',
    'You have known the loneliness of being misunderstood by the people closest to you.',
    'You have a strong sense of fairness, even when it costs you.',
    'You have outgrown some of the people you used to be close to.',
    'You sometimes feel as though you are observing your own life rather than living it.',
    'You have a private side that even your closest friends do not fully know.',
    'You are drawn to people who seem to need you, even when this is not good for you.',
    'Your generosity has occasionally been mistaken for weakness.',
    'You have made peace with at least one regret you used to carry heavily.',
    'You have a way of remembering kindnesses years after others have forgotten them.',
    'You think about death more often than you let on, though not in a morbid way.',
    'You have known what it is to outgrow a belief you once held dear.',
    'You are capable of more affection than you usually show.',
    'You have practiced patience with someone who never thanked you for it.',
    'You have a recurring desire for solitude that you do not always honor.',
    'You are quietly proud of one thing you have done that no one knows about.',
    'You have a tendency to play the peacemaker when you would rather not.',
    'You sometimes wonder whether the people in your life see the same version of you.',
    'You have considered, at least once, leaving everything behind and starting over.',
    'You are more attached to your routines than you let on.',
    'You have a fear of being seen too clearly, and it has shaped some of your friendships.',
    'You sometimes feel ahead of your time and sometimes far behind it.',
    'You have learned to mistrust easy answers in favor of complicated ones.',
    'You believe in something larger than yourself, even when you cannot name it.',
    'You have a creative streak you have not fully indulged.',
    'You have grown more guarded about which sides of yourself you reveal.',
    'You have known what it is to put others before yourself for too long.',
    'You hold yourself to a standard you would not impose on anyone else.',
    'You have, in private, defended yourself against criticisms no one actually made.',
    'You have learned that the people who hurt you were often hurting themselves.',
    'You sometimes feel as though life has been preparing you for something you have not yet faced.',
    'You have known the feeling of being needed and resented for it in the same hour.',
    'You give better than you take, and you know this about yourself.',
    'You have lost faith in at least one institution that once oriented you.',
    // — second batch —
    'You have a habit of putting other people’s needs ahead of your own.',
    'You sometimes feel that you are not appreciated for what you do.',
    'You have a deep affection for a kind of music or art that surprises people who do not know you well.',
    'You are careful with money in some areas and impulsive in others.',
    'You have at least one childhood ambition you have quietly abandoned.',
    'You find it difficult to fully relax when someone is watching.',
    'You sometimes lie awake thinking about something you said years ago.',
    'You have a strong reaction to phoniness in other people.',
    'You are more comfortable in small groups than in large ones — most of the time.',
    'You sometimes feel as if you are still waiting for your real life to begin.',
    'You have known one love you have not fully recovered from.',
    'You have a quiet need to feel competent at one specific thing.',
    'You find it easier to forgive others than to forgive yourself.',
    'You have a small ritual that comforts you that no one else knows about.',
    'You have, at one time or another, mistrusted your own memory of an event.',
    'You have learned to recognize the difference between being alone and being lonely.',
    'You have a deeper interest in fate, signs, or the unseen than you usually let on.',
    'You sometimes feel as though others can see something in your face you cannot name.',
    'You have, on occasion, helped someone in ways they will never know about.',
    'You have outgrown at least one piece of advice that used to guide you.',
    'You commit to too many things at once and quietly resent it.',
    'You sometimes feel that an animal has noticed something about you that the people around you missed.',
    'You have considered the possibility that you are living the wrong version of your life.',
    'You have a moment of the day that belongs only to you.',
    'You keep small objects longer than is rational.',
    'You suspect, in private, that you understand a particular feeling better than most people who claim to.',
    'You sometimes feel that the right words come to you too late.',
    'You have a soft spot for someone whose life took a turn yours did not.',
    'You feel a vague guilt about something you cannot quite name.',
    'You have, at least once, taken pride in being underestimated.',
    'You have a tendency to remember slights longer than compliments, and you know this about yourself.',
    'You have a recurring thought you have never quite said out loud.',
    'You feel older than your age when you are tired, and younger than your age when you are alone.',
    'You have a small superstition that you publicly mock and privately observe.',
    'You sometimes wonder if you are the only one who notices certain things.',
  ];

  // Past-tense variants for the past-tagged painted entries.
  const PAST_BARNUM = [
    'You had a great need, even then, for other people to like and admire you.',
    'You were critical of yourself for as long as you can remember.',
    'You carried a great deal of unused capacity that you never turned to your advantage.',
    'Though you had personality weaknesses, you always found ways to compensate.',
    'Your sexual adjustment presented problems for you back then.',
    'Disciplined and self-controlled outside, you were worrisome and insecure inside.',
    'You had serious doubts as to whether you had made the right decision or done the right thing.',
    'You preferred a certain amount of change and variety, and grew dissatisfied when hemmed in.',
    'You prided yourself as an independent thinker, even when no one else noticed.',
    'You found it unwise to be too frank in revealing yourself to others.',
    'At times you were extroverted and sociable; at others, wary and reserved.',
    'Some of your aspirations were always pretty unrealistic.',
    'Security was already one of your major goals in life.',
    'You worried, even then, about things you could not control.',
    'You had a great deal of patience with others and very little with yourself.',
    'You were already more sensitive than most people realized.',
    'You appeared confident to others while privately questioning yourself.',
    'You had outgrown some of the people you used to be close to.',
    'You knew the loneliness of being misunderstood by the people closest to you.',
    'You had a private side that even your closest friends did not fully know.',
    'You held yourself to a standard you would not have imposed on anyone else.',
    'You had practiced patience with someone who never thanked you for it.',
    'You had made peace with at least one regret you used to carry heavily.',
    'You had outlasted at least one thing you thought you would not survive.',
    // — second batch —
    'You took pride in something you would never have admitted to wanting.',
    'You spent a season caring deeply about something you no longer care about.',
    'You had a phase where you tried to be someone you were not.',
    'You held a grudge longer than was useful to you.',
    'You once said something that hurt a person worse than you intended.',
    'You had a friend in childhood whose name you can still call without thinking.',
    'You spent more than you should have on a thing that mattered for one week.',
    'You believed for a while that you had to be more than you were.',
    'You learned, at some cost, that not every kindness is repaid.',
    'You once put down a book you were not finished with and never picked it up again.',
    'You spent a stretch of months too busy to notice yourself disappearing.',
    'You took on responsibility that was not yours to carry.',
    'You held a secret for someone who later betrayed you.',
    'You had a stretch of luck you never quite trusted.',
    'You once made a decision you have not fully accepted as final.',
    'You loved someone who did not understand what you were giving them.',
    'You had a teacher, a relative, or a stranger who said something to you that you still think about.',
    'You spent a period mistrusting your own judgment.',
    'You had a year you would not relive even for the chance to fix it.',
    'You learned a language, an instrument, or a craft far enough to know you had stopped.',
    'You wore a name or nickname that did not quite fit, and you kept it anyway.',
    'You forgave someone before they had asked for it.',
    'You broke a promise to yourself before you broke one to anyone else.',
    'You once defended a belief you no longer hold, and you remember every word.',
  ];

  // Future-tense variants for the future-tagged painted entries.
  const FUTURE_BARNUM = [
    'You will go on needing other people to like and admire you, more than you let on.',
    'You will keep finding new reasons to be critical of yourself.',
    'You will fail to turn a great deal of unused capacity to your advantage.',
    'You will compensate for your weaknesses, as you have always done.',
    'Your sexual adjustment will continue to present problems for you.',
    'You will remain disciplined outside and worrisome inside.',
    'You will doubt, in some quiet moment, whether you have done the right thing.',
    'You will grow dissatisfied when hemmed in, and seek a small change.',
    'You will pride yourself on thinking independently, even when no one is watching.',
    'You will find it unwise to be too frank in revealing yourself to others.',
    'You will move between extroversion and reserve, depending on the room.',
    'You will keep one aspiration that is pretty unrealistic — and act on it anyway.',
    'You will choose security over excitement at least once before the month is done.',
    'You will worry about something you cannot control before the week is out.',
    'You will give better advice than you are willing to take.',
    'You will be more sensitive than the people around you realize.',
    'You will appear confident, while privately turning a question over and over.',
    'You will outgrow another person you are still close to.',
    'You will feel the loneliness of being misunderstood at least once this season.',
    'You will keep a private side hidden, even from those who think they know you best.',
    'You will hold yourself to a standard you would not impose on anyone else.',
    'You will recognize a kindness too late to thank the giver.',
    'You will make peace with one regret you have been carrying heavily.',
    'You will survive something you do not yet know is coming.',
    // — second batch —
    'You will be asked to forgive something you have not yet decided how to feel about.',
    'You will, before the year ends, make a small change you have been postponing.',
    'You will surprise yourself with how calmly you handle something you have been dreading.',
    'You will hear a piece of news that requires you to revise an old story.',
    'You will say goodbye to a habit older than the friend you got it from.',
    'You will find a small object you thought you had lost; it will not matter as much as you imagined.',
    'You will be misread by someone whose opinion you have always valued.',
    'You will catch yourself laughing at something you would once have found shocking.',
    'You will be invited somewhere you do not want to go, and you will go.',
    'You will decide a thing about yourself, in some quiet moment, that you have been postponing for years.',
    'You will discover that someone has been kinder to you than you noticed.',
    'You will outgrow a fear that has shaped your past decade.',
    'You will look in a mirror and see something new in your own face.',
    'You will have a conversation that ends a worry you have been carrying.',
    'You will be told a truth you already knew but had been waiting to hear.',
    'You will, in passing, do a stranger a small good that returns to you years later.',
    'You will be tempted to interpret an accident as a sign. You may be right.',
    'You will spend at least one afternoon doing something useless and feel returned to yourself.',
    'You will be unable to explain, even to yourself, why a particular moment moved you.',
    'You will find that the worst version of something you feared does not come to pass.',
    'You will be given an opportunity you almost refuse out of habit.',
    'You will recognize, late one evening, the source of a feeling you have been carrying all week.',
    'You will accept an old apology that no one has thought to offer.',
    'You will choose, in a small way, to be the person you have been pretending to be.',
  ];

  // Tidy a painting word into a "symbol" key: strip non-letters,
  // capitalize the first character.
  function asSymbol(word) {
    const w = String(word || '').replace(/[^a-zA-Z]/g, '');
    if (w.length < 4) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  // Pull up to `n` distinct ≥4-char non-stopword words from a string,
  // shuffled. Used to source the painted-in book entries from whatever
  // chunk of the reading page corresponds to a given tense.
  function uniqueWordsFromText(text, n) {
    const pool = [];
    String(text || '').replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).forEach(w => {
      if (w.length >= 4 && !STOPWORDS.has(w.toLowerCase())) pool.push(w);
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const seen = new Set();
    const out  = [];
    for (const w of pool) {
      const k = w.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(w);
      if (out.length >= n) break;
    }
    return out;
  }

  // Pick `n` distinct indices in [0, len).
  function pickIndices(len, n) {
    const idxs = [];
    for (let i = 0; i < len; i++) idxs.push(i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t;
    }
    return idxs.slice(0, n);
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // composeBook(input) where input is the same source shape the canvas
  // fortune uses:
  //   { pastTitleSource | pastSource:       string,   // first painting
  //     presentTitleSource | presentSource: string,   // effect terms
  //     futureTitleSource | futureSource:   string }  // second painting
  // Each tense contributes ONE painted-in entry — the same three words
  // that appear in the canvas fortune (first non-stopword from each
  // source). Those three painted entries glow with their tense chip;
  // the rest of the 40-row book holds static symbols + general Barnum.
  function composeBook(input) {
    const cfg = (input && typeof input === 'object' && !Array.isArray(input))
      ? input : {};

    const titleWords  = pickPPFTitleWords(cfg);
    const sourceWords = cfg.sourceWords || {};
    // Always emit three painted-in entries — one per tense. If a tense's
    // title source couldn't yield a usable word, fall back to its
    // arcana source word so the past/present/future trio is intact
    // every draw.
    const TENSE_FALLBACK = { past: 'Past', present: 'Present', future: 'Future' };
    function entryFor(tense, titleWord, sourceWord) {
      const word = titleWord || sourceWord || TENSE_FALLBACK[tense];
      return { word: word, tense: tense, source: sourceWord || '' };
    }
    const tagged = [
      entryFor('past',    titleWords.past,    sourceWords.past),
      entryFor('present', titleWords.present, sourceWords.present),
      entryFor('future',  titleWords.future,  sourceWords.future),
    ];

    // Pool selector — each painted-in entry pulls from the pool that
    // matches its tense, so a "past" chip always reads in past tense,
    // "present" in present, "future" in future.
    function poolFor(tense) {
      if (tense === 'past')   return PAST_BARNUM;
      if (tense === 'future') return FUTURE_BARNUM;
      return BARNUM;
    }

    // Static symbol keys — timeless background of the book.
    const keys = SYMBOL_KEYS.map(sym => ({
      symbol: sym, isStatic: true, tense: null, fixedMeaning: null,
      source: '', trigger: '',
    }));

    // Slot the 3 (or fewer) tagged painted-in entries at random
    // positions. Each gets:
    //   • a tense-matching Barnum statement
    //   • a "comes from" source word (the arcana meaning word the
    //     fortune line was built around, so the book can show provenance)
    //   • a Stanley-Fish-style interpretive trigger ("interpret
    //     literally", "spiritual static", etc.) to colour the reading
    const slots = pickIndices(keys.length, tagged.length);
    tagged.forEach((entry, i) => {
      const sym = asSymbol(entry.word);
      if (!sym) return;
      const pool    = poolFor(entry.tense);
      const trigger = INTERPRETIVE_TRIGGERS[
        Math.floor(Math.random() * INTERPRETIVE_TRIGGERS.length)
      ];
      keys[slots[i]] = {
        symbol:       sym,
        isStatic:     false,
        tense:        entry.tense,
        fixedMeaning: pool[Math.floor(Math.random() * pool.length)],
        source:       titleCase(entry.source),
        trigger:      trigger,
      };
    });

    // Shuffle the general Barnum pool fresh each draw and pair one
    // statement with each remaining (static) key.
    const generalPool = BARNUM.slice();
    shuffleInPlace(generalPool);

    return keys.map((k, i) => ({
      numeral:  toRoman(i + 1),
      symbol:   k.symbol,
      meaning:  k.fixedMeaning || generalPool[i % generalPool.length],
      isStatic: k.isStatic,
      tense:    k.tense,
      source:   k.source,
      trigger:  k.trigger,
    }));
  }

  global.TarotFortune = {
    compose: compose,
    composeBook: composeBook,
    luckyNumber: luckyNumber,
    timeOfTheCreature: timeOfTheCreature,
  };
})(typeof window !== 'undefined' ? window : this);
