/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  QUOTES  —  inline mirror of assets/json/quotes.json (literary epigraph pool) │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► assign one string array to window.Quotes                 │
  │                                                                          │
  │      QUOTES[]  ──► ~37 lines from Woolf, Brontë sisters, Austen,         │
  │                    Shelley (Frankenstein), Wuthering Heights,            │
  │                    The Yellow Wallpaper, Hill House — all about          │
  │                    confinement, refusal, loneliness, haunting.           │
  │                                                                          │
  │   No functions, no DOM, no storage — pure data module loaded over        │
  │   file:// where fetch() of assets/json/quotes.json would fail.                │
  │                                                                          │
  │   Exports (window.Quotes): string[]   (assigned directly, not wrapped)   │
  │                                                                          │
  │   External deps: none                                                    │
  │   Consumers: any module that renders a rotating epigraph / overlay quote │
  │              (e.g. splash-screen flavor text, loading transitions).      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  data-only: QUOTES=string[~37] (literary epigraphs: Woolf/Brontë/Austen/Shelley/Wuthering Heights/Yellow Wallpaper/Hill House — confinement, refusal, haunting)
  exports: global.Quotes=QUOTES (raw array, not wrapped)
*/

(function (global) {
  // Mirror of assets/json/quotes.json — keep in sync. Runtime can't fetch the JSON
  // over file://, so this file is the source of truth at run.
  const QUOTES = [
    'I am rooted, but I flow.',
    'For most of history, Anonymous was a woman.',
    'She was alone. She was alone. Alone.',
    'Lock up your libraries if you like.',
    "Nothing thicker than a knife's blade.",
    'Death is the enemy.',
    'I have lost friends.',
    'How much better is silence.',
    'The eyes of others our prisons.',
    'Single women have a dreadful propensity for being poor.',
    'Selfishness must always be forgiven.',
    'I cannot speak well enough to be unintelligible.',
    'It is a truth universally acknowledged.',
    'I am no bird; and no net ensnares me.',
    'Reader, I married him.',
    'Conventionality is not morality.',
    'I am not an angel.',
    'Do you think I am an automaton?',
    'I would always rather be happy than dignified.',
    'I cannot live without my soul.',
    "He's more myself than I am.",
    'Whatever our souls are made of.',
    'You have killed me — and thriven on it.',
    'I have not broken your heart.',
    'Beware; for I am fearless.',
    'I shall be with you on your wedding-night.',
    'I am malicious because I am miserable.',
    'If I cannot inspire love, I will cause fear.',
    'There is something at work in my soul.',
    'Live, and be happy, and make others so.',
    'I was the slave, not the master.',
    'I expected this reception. All men hate the wretched.',
    "I've got out at last.",
    'There are things in that paper that nobody knows but me.',
    'It is so discouraging not to have any advice.',
    'No live organism can continue for long to exist sanely.',
    'Whatever walked there, walked alone.',
  ];

  global.Quotes = QUOTES;
})(window);
