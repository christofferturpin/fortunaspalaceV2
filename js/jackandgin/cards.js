/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  card primitives: deck, shuffle, draw                   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.JG.Cards                                │
  │                                                                          │
  │   Constants:                                                             │
  │     SUITS[4], SUIT_NAMES, SUIT_GLYPHS, SUIT_COLORS, RANKS[1..13]         │
  │                                                                          │
  │   Helpers:                                                               │
  │     rankLabel(rank)  ──► 'A' | 'J' | 'Q' | 'K' | numeric string         │
  │     cardValue(rank)  ──► A=1, J/Q/K=10, else rank                       │
  │                                                                          │
  │   Builders:                                                              │
  │     makeCard(rank, suit) ──► {rank, suit, value, label, color}           │
  │     newDeck()           ──► card[52]  (uses makeCard)                    │
  │     shuffle(deck)       ──► deck (Fisher–Yates, in place)                │
  │     freshDeck()         ──► shuffle(newDeck())                           │
  │     draw(deck)          ──► card (deck.pop, mutates)                     │
  │                                                                          │
  │   Exports (window.JG.Cards): {SUITS, SUIT_NAMES, SUIT_GLYPHS,            │
  │     SUIT_COLORS, RANKS, rankLabel, cardValue, makeCard, newDeck,         │
  │     shuffle, freshDeck, draw}                                            │
  │   External deps: none (pure)                                             │
  │   Consumers: JG.Hand, JG.Dealer, JG.Round                                │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SUITS=['S','H','D','C']; SUIT_NAMES,SUIT_GLYPHS(♠♥♦♣),SUIT_COLORS(black/red); RANKS=[1..13]; RANK_LABELS={1:'A',11:'J',12:'Q',13:'K'}
  rankLabel(r)→str: RANK_LABELS[r]||String(r)
  cardValue(r)→int: r==1→1; r>=11→10; else r
  makeCard(r,s)→{rank,suit,value,label:rankLabel+glyph,color}
  newDeck()→card[52]: ∀suit∀rank push makeCard(r,s)
  shuffle(deck)→deck: Fisher-Yates in-place (i=len-1..1, swap with rnd j≤i)
  freshDeck()→shuffle(newDeck)
  draw(deck)→card: deck.pop (mutates)
  exports: global.JG.Cards={SUITS,SUIT_NAMES,SUIT_GLYPHS,SUIT_COLORS,RANKS,rankLabel,cardValue,makeCard,newDeck,shuffle,freshDeck,draw}
*/

(function (global) {
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_COLORS = { S: 'black', H: 'red', D: 'red', C: 'black' };
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function rankLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
  }

  function cardValue(rank) {
    if (rank === 1) return 1;
    if (rank >= 11) return 10;
    return rank;
  }

  function makeCard(rank, suit) {
    return {
      rank,
      suit,
      value: cardValue(rank),
      label: rankLabel(rank) + SUIT_GLYPHS[suit],
      color: SUIT_COLORS[suit],
    };
  }

  function newDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push(makeCard(rank, suit));
      }
    }
    return deck;
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  }

  function freshDeck() {
    return shuffle(newDeck());
  }

  function draw(deck) {
    return deck.pop();
  }

  global.JG = global.JG || {};
  global.JG.Cards = {
    SUITS,
    SUIT_NAMES,
    SUIT_GLYPHS,
    SUIT_COLORS,
    RANKS,
    rankLabel,
    cardValue,
    makeCard,
    newDeck,
    shuffle,
    freshDeck,
    draw,
  };
})(window);
