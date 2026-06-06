/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE MOCK HORSES  —  fallback horse roster (Level 1 / no-network)   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE on load ──► defines MOCK_HORSES[30]                               │
  │                          │                                               │
  │                          └─ each: { name1, name2, mockSpeed }            │
  │                              mockSpeed spans ~3 orders of magnitude      │
  │                              (142000 down to 105)                        │
  │                                                                          │
  │   Consumers:                                                             │
  │     WikiraceRace.generateRace()  ──► picks 9 unique from this pool       │
  │     WikiraceSim.* (mock mode)                                            │
  │     WikiraceGame.newRace()       (fallback when no real data ready)      │
  │                                                                          │
  │   Exports (window.WikiraceHorses): Array<{name1,name2,mockSpeed}>        │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  data: MOCK_HORSES=Array<{name1,name2,mockSpeed}>[30]; mockSpeed range 142000..105 (~3 orders); exports global.WikiraceHorses=MOCK_HORSES
*/

(function (global) {
  // 30 mock horses — speeds span ~3 orders of magnitude.
  // Speeds will be replaced with real Wikipedia pageview data in Level 2.
  const MOCK_HORSES = [
    { name1: 'EINSTEIN',   name2: 'PIZZA',        mockSpeed: 142000 },
    { name1: 'CAT',        name2: 'NAPOLEON',     mockSpeed: 121000 },
    { name1: 'TESLA',      name2: 'CLEOPATRA',    mockSpeed: 118000 },
    { name1: 'DRACULA',    name2: 'MOZART',       mockSpeed: 64000  },
    { name1: 'SUSHI',      name2: 'ICELAND',      mockSpeed: 47000  },
    { name1: 'PYRAMID',    name2: 'EIFFEL TOWER', mockSpeed: 41000  },
    { name1: 'WHALE',      name2: 'TEA',          mockSpeed: 27500  },
    { name1: 'CHESS',      name2: 'JUPITER',      mockSpeed: 24000  },
    { name1: 'RAINBOW',    name2: 'VOLCANO',      mockSpeed: 21000  },
    { name1: 'OCEAN',      name2: 'GUITAR',       mockSpeed: 18500  },
    { name1: 'BANANA',     name2: 'LIBRARY',      mockSpeed: 14200  },
    { name1: 'COMET',      name2: 'BIRD',         mockSpeed: 11800  },
    { name1: 'GLACIER',    name2: 'BREAD',        mockSpeed: 9400   },
    { name1: 'CASTLE',     name2: 'CARROT',       mockSpeed: 7600   },
    { name1: 'DESERT',     name2: 'CLOCK',        mockSpeed: 6100   },
    { name1: 'PENCIL',     name2: 'COMPASS',      mockSpeed: 4900   },
    { name1: 'HAMMER',     name2: 'ANTARCTICA',   mockSpeed: 4400   },
    { name1: 'OYSTER',     name2: 'WIND',         mockSpeed: 3700   },
    { name1: 'THUNDER',    name2: 'LANTERN',      mockSpeed: 2800   },
    { name1: 'CABBAGE',    name2: 'ACID',         mockSpeed: 2200   },
    { name1: 'HARP',       name2: 'GLOVE',        mockSpeed: 1700   },
    { name1: 'TUBA',       name2: 'STAIRS',       mockSpeed: 1300   },
    { name1: 'SCISSORS',   name2: 'BUTTON',       mockSpeed: 950    },
    { name1: 'PEBBLE',     name2: 'WHISTLE',      mockSpeed: 720    },
    { name1: 'NEEDLE',     name2: 'BOAT',         mockSpeed: 540    },
    { name1: 'DUST',       name2: 'YARN',         mockSpeed: 410    },
    { name1: 'CORK',       name2: 'NAIL',         mockSpeed: 290    },
    { name1: 'CHALK',      name2: 'SOAP',         mockSpeed: 210    },
    { name1: 'CLAY',       name2: 'WOOL',         mockSpeed: 145    },
    { name1: 'TWIG',       name2: 'STRAW',        mockSpeed: 105    },
  ];

  global.WikiraceHorses = MOCK_HORSES;
})(window);
