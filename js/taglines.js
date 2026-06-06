/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  TAGLINES  —  inline mirror of taglines JSON (normal + disturbing pools) │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► assign two frozen-in-place string arrays to              │
  │                 window.Taglines:                                         │
  │                                                                          │
  │      NORMAL[]     ──► ~70 brochure-voice slogans                         │
  │                       ("Where every dream comes true", etc.)             │
  │      DISTURBING[] ──► ~60 subtext-leaking lines used by glitch cycles    │
  │                       ("she is here   she is here   she is here", etc.)  │
  │                                                                          │
  │   No functions, no DOM, no storage — pure data module loaded over        │
  │   file:// where fetch() of assets/json/taglines_*.json would fail.       │
  │                                                                          │
  │   Exports (window.Taglines):                                             │
  │     { normal: NORMAL, disturbing: DISTURBING }                           │
  │                                                                          │
  │   External deps: none                                                    │
  │   Consumers: splash.js (#ad-tagline rotator), and any other module that  │
  │              cycles palace marketing text or glitch overlays.            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  data-only: NORMAL=string[~70] (brochure slogans); DISTURBING=string[~60] (subtext-leak/glitch lines)
  exports: global.Taglines={normal:NORMAL, disturbing:DISTURBING}
*/

(function (global) {
  // Mirror of assets/json/taglines_*.json — keep in sync. The runtime can't
  // fetch the JSON over file://, so this file is the source of truth at run.
  const NORMAL = [
    'Where every dream comes true',
    'Where dreams come to die',
    'A family-friendly atmosphere',
    'Strictly 21 and over',
    'Open 24 hours, 7 days a week',
    'Closed on Sundays for our Lord',
    'Guaranteed payouts every spin',
    'House edge strictly enforced',
    'Free drinks all night long',
    'No alcohol served on premises',
    'Five thousand slot machines',
    'Members only · By invitation',
    'Walk-ins always welcome',
    'Brand-new for 2024',
    'Established 1873 — three generations of trust',
    'Your Child thrives here',
    'You will not leave',
    'A safe haven for the weary mother',
    'No exits',
    'Bring the children',
    'No children permitted on the floor',
    'A timeless escape',
    'The clocks run a little slow',
    'The buffet is always open',
    'We pour with a heavy hand',
    'All drinks served in moderation',
    'Cash is king at every table',
    'We accept every form of payment',
    'High-limit rooms by appointment',
    'Our guests rarely report hunger',
    'The air is always sweet',
    'Voted best in the county',
    'There is no second place',
    'A neighborhood landmark',
    'The neighborhood grew up around us',
    'The music never stops',
    'We watch Your Child very closely',
    'Welcome back, valued guest',
    "We've been waiting",
    'Loyalty has its rewards',
    'We never forget a face',
    'Friendly staff, always smiling',
    'Our dealers know your name',
    'Lose yourself for an hour',
    'Lose yourself entirely',
    'Satisfaction guaranteed',
    'Few leave dissatisfied',
    'Every guest is logged at the door',
    'Our rooms are kept exactly as you left them',
    'The chairs are made for long stays',
    'Drinks are stronger than they appear',
    'Mirrors in every direction',
    'Always full, never crowded',
    'Last call is only a suggestion',
    'Dawn arrives late, if at all',
    'Fortuna smiles on her favorites',
    "You've been here before, haven't you?",
    "Fortuna's Palace welcomes you",
    'Named for the goddess of fortune',
    'A Branson tradition',
    'Just off the 76',
    'Country music nightly in the main room',
    'The Margaret Suite — by appointment',
    'The Claude Lounge — open till dawn',
    'Saturday blessings at six',
    'A nursery wing for our youngest guests',
    'Hydrotherapy suites on the third floor',
    'The Mayer family welcomes you',
    'Tennessee hospitality, Ozark charm',
  ];

  const DISTURBING = [
    'she is here   she is here   she is here',
    'the chairs remember everyone who sat in them',
    "every coin you spend is a tooth you've already lost",
    'the carpet is alive',
    "don't forget what he did to you",
    'the lights stay on because nothing here sleeps',
    'we recognized you when you came in',
    'the baby is fine the baby is fine the baby is fine',
    'you have been here longer than you remember',
    'the exit signs are decorative',
    'Fortuna sees you   Fortuna sees you   Fortuna',
    "do not look at the dealer's hands",
    'the cards are lonely, hold them',
    'you came on your own. nobody made you.',
    'smile for the camera. smile. smile.',
    'Your Child will be quieter soon',
    "this isn't the first time you came here",
    'we kept your room exactly the way you left it',
    'the carpet was always this color',
    'run away',
    'each chip is a piece of you',
    'count your teeth   count your teeth   count',
    'Your Child stopped crying. Your Child knows.',
    'the baby has been quiet for hours',
    'mother. mother. mother.',
    'one more spin   one more spin   one',
    'you signed in three days ago',
    "you've been winning since 1998",
    'the doors only open inward',
    'we towed your car',
    'your keys are at the bar where you left them',
    "the dealer's hands are not his hands",
    'pray to Fortuna   she is hungry',
    'sleep is not allowed',
    "you've walked past that painting twice",
    'the man at table six knows your real name',
    'put it back   put it all back   put',
    'your seat at the bar is still warm',
    "you're in the painting now",
    'do not eat the buffet',
    'the cocktails are stirred with bone',
    'this place is named for you',
    'Margaret booked your room',
    'the bathtub is full. it is for you.',
    'fly. fly like kimmy-chan.',
    'your headaches always knew the answer',
    'claude is asking for you',
    'claude served fifteen of twenty',
    'ray drove all night',
    'ray is in the parking lot',
    'father michael hears confessions at four',
    'the priest knows who the father is',
    'the baby slept through the night',
    'the baby was sleeping   the baby was sleeping   the baby',
    'the hammer is at the lost-and-found',
    'the cliff was not very high',
    'you were pushed   you were pushed   you',
    'the song is almost the song',
    'the way out is not on the floor',
    'you smell smoke',
    'the broom in the closet still works',
  ];

  global.Taglines = { normal: NORMAL, disturbing: DISTURBING };
})(window);
