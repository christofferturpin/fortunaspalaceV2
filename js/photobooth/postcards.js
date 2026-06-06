/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  PHOTOBOOTH POSTCARDS  —  static text pools + remote quote loader        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE bootstrap ──► populate GREETINGS / BUSINESSES / MEMORIES / QUOTES │
  │                       │                                                  │
  │                       ├─ attach window.PhotoboothPostcards = {...}       │
  │                       └─ fetch('../assets/json/quotes.json')                  │
  │                            ├─ .then(r => r.ok ? r.json() : null)         │
  │                            ├─ .then(data) ──► push entries into QUOTES   │
  │                            └─ .catch(noop)                               │
  │                                                                          │
  │   Exports (window.PhotoboothPostcards):                                  │
  │       { GREETINGS:string[], BUSINESSES:string[],                         │
  │         MEMORIES:string[],  QUOTES:string[] (filled async) }             │
  │   External deps: fetch, ../assets/json/quotes.json                            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  GREETINGS=[18 postcard salutations]; BUSINESSES=[41 strip-mall names]; MEMORIES=[19 sin-fragments]; QUOTES=[] (filled async)
  IIFE(global): assign global.PhotoboothPostcards={GREETINGS,BUSINESSES,MEMORIES,QUOTES}
  fetch('../assets/json/quotes.json')→r.ok?r.json():null →∀i push data[i] into QUOTES (after clearing); .catch noop
  exports: window.PhotoboothPostcards={GREETINGS,BUSINESSES,MEMORIES,QUOTES}
*/

(function (global) {
  const GREETINGS = [
    "Thinking of what you did",
    "I know what you did",
    "Come back soon",
    "Having a wonderful time here",
    "Glad you're not here",
    "Sending my regards",
    "Nothing personal kid",
    "I'll never forgot",
    "I saw you",
    "She forgives you",
    "She does not forgive you",
    "Stay another night",
    "Tell no one",
    "Forgive me",
    "Be seeing you",
    "Hello again",
    "We kept your room",
    "It's been so long",
  ];

  const BUSINESSES = [
    "Laundromat",
    "Church",
    "Thrift Store",
    "Truck Stop",
    "Novelty Store",
    "Smoke Shop",
    "Pay Day Express",
    "K-Mart",
    "Combination KFC/Pizza Hut",
    "Car Wash",
    "Tanning Salon",
    "Bail Bonds",
    "Dollar General",
    "Liquor Barn",
    "Fireworks Outlet",
    "Mattress Outlet",
    "Pawn Shop",
    "Chiropractor",
    "Funeral Home",
    "Adult Video Store",
    "Title Loans",
    "Storage Units",
    "Tax Preparer",
    "Methadone Clinic",
    "Combination Taco Bell/Long John Silver's",
    "Combination McDonald's/Gas Station",
    "Notary Public",
    "Discount Tobacco",
    "Walgreens",
    "Cash 4 Gold",
    "Vape Lounge",
    "Wig Outlet",
    "Bingo Hall",
    "Crematory",
    "Daycare",
    "Cricket Wireless",
    "Putt-Putt",
    "Indoor Trampoline Park",
    "Dialysis Center",
    "Ammo Outlet",
    "Christian Bookstore",
  ];

  const MEMORIES = [
    "her name",
    "the smell of bleach",
    "the way he looked at you",
    "what you took",
    "what you said you'd do",
    "the bathtub",
    "his face",
    "the day she went under",
    "the gas station receipt",
    "the smoke",
    "your father's voice",
    "what you didn't say",
    "the sound of the lid",
    "the knife on the counter",
    "how it felt to hug them",
    "what was on the phone",
    "the matchbook",
    "the way the engine sounded",
    "every door you locked",
  ];

  const QUOTES = [];

  global.PhotoboothPostcards = { GREETINGS, BUSINESSES, MEMORIES, QUOTES };

  fetch('../assets/json/quotes.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!Array.isArray(data)) return;
      QUOTES.length = 0;
      for (var i = 0; i < data.length; i++) QUOTES.push(data[i]);
    })
    .catch(function () {});
})(window);
