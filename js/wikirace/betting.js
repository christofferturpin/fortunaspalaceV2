/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE BETTING  —  cascading WIN/PLACE/SHOW payout resolution         │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Tunable multipliers (EV knobs):                                        │
  │     WIN_MULTIPLIER   = 6      target favorites edge  5-10%               │
  │     PLACE_MULTIPLIER = 3      target random edge    15-20%               │
  │     SHOW_MULTIPLIER  = 1.85                                              │
  │                                                                          │
  │   Cascade matrix (slot pick × actual finish):                            │
  │     WIN pick   ─► 1st:WIN  2nd:PLACE  3rd:SHOW  else:0                   │
  │     PLACE pick ─► 1st-2nd:PLACE       3rd:SHOW  else:0                   │
  │     SHOW pick  ─► 1st-2nd-3rd:SHOW              else:0                   │
  │                                                                          │
  │   findHorsePosition(horse, finishOrder) ──► int (-1 if absent)           │
  │       └─ matches on name1+name2                                          │
  │                                                                          │
  │   resolveBet(picks, finishOrder, betTier) ──► totalPayout:int            │
  │       └─ sums cascade payouts for {win,place,show} slots                 │
  │          (called by WikiraceSim.simulateRaces)                           │
  │                                                                          │
  │   resolveBetDetailed(picks, finishOrder, betTier) ──► detail             │
  │       │   detail.{win,place,show}: { horse, finishPos, tier, payout }    │
  │       │   detail.totalPayout                                             │
  │       └─ used by WikiraceGame UI + page.js test panel                    │
  │                                                                          │
  │   Exports (window.WikiraceBetting): { WIN_MULTIPLIER, PLACE_MULTIPLIER,  │
  │       SHOW_MULTIPLIER, resolveBet, resolveBetDetailed,                   │
  │       findHorsePosition }                                                │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  WIN_MULTIPLIER=6; PLACE_MULTIPLIER=3; SHOW_MULTIPLIER=1.85 (EV knobs; favorites edge 5-10%, random edge 15-20%)
  findHorsePosition(horse,order)→int|-1: !horse→-1; order.findIndex(h.name1==&&h.name2==)
  resolveBet(picks,order,betTier)→int: total=0; if picks.win: pos→ 0:WIN, 1:PLACE, 2:SHOW, else:0; if picks.place: pos∈{0,1}:PLACE, 2:SHOW; if picks.show: pos∈{0,1,2}:SHOW; ret round(total)
  resolveBetDetailed(picks,order,betTier)→{win,place,show,totalPayout}: ∀slot describe(slot,pickedHorse,kind): pos=find; cascade(per kind: win/place/show) sets {tier,payout}; detail[slot]={horse,finishPos,tier,payout}; totalPayout=Σ
  exports: global.WikiraceBetting={WIN_MULTIPLIER,PLACE_MULTIPLIER,SHOW_MULTIPLIER,resolveBet,resolveBetDetailed,findHorsePosition}
*/

(function (global) {
  // === TUNABLE MULTIPLIERS ===
  // The only knobs that matter for EV. Adjust these and re-run the simulator.
  // Targets:
  //   Favorites strategy:  5-10% house edge  (returnPerCoin 0.90-0.95)
  //   Random strategy:    15-20% house edge  (returnPerCoin 0.80-0.85)
  const WIN_MULTIPLIER   = 6;
  const PLACE_MULTIPLIER = 3;
  const SHOW_MULTIPLIER  = 1.85;

  function findHorsePosition(horse, finishOrder) {
    if (!horse) return -1;
    return finishOrder.findIndex(function (h) {
      return h.name1 === horse.name1 && h.name2 === horse.name2;
    });
  }

  // Cascading payout resolution.
  //
  //   Pick slot ↓ \ Horse finished →   1st             2nd             3rd             4th-9th
  //   WIN pick                          WIN payout      PLACE payout    SHOW payout     loss
  //   PLACE pick                        PLACE payout    PLACE payout    SHOW payout     loss
  //   SHOW pick                         SHOW payout     SHOW payout     SHOW payout     loss
  //
  // betTier is the per-slot wager (player wagers 3 × betTier total across the three slots).
  function resolveBet(picks, finishOrder, betTier) {
    let total = 0;

    if (picks.win) {
      const pos = findHorsePosition(picks.win, finishOrder);
      if      (pos === 0) total += betTier * WIN_MULTIPLIER;
      else if (pos === 1) total += betTier * PLACE_MULTIPLIER;
      else if (pos === 2) total += betTier * SHOW_MULTIPLIER;
    }

    if (picks.place) {
      const pos = findHorsePosition(picks.place, finishOrder);
      if      (pos === 0 || pos === 1) total += betTier * PLACE_MULTIPLIER;
      else if (pos === 2)               total += betTier * SHOW_MULTIPLIER;
    }

    if (picks.show) {
      const pos = findHorsePosition(picks.show, finishOrder);
      if (pos === 0 || pos === 1 || pos === 2) total += betTier * SHOW_MULTIPLIER;
    }

    return Math.round(total);
  }

  // Per-slot breakdown of how a bet resolved — useful for UI later (Level 5).
  function resolveBetDetailed(picks, finishOrder, betTier) {
    const detail = {};
    function describe(slot, pickedHorse, slotKind) {
      const pos = findHorsePosition(pickedHorse, finishOrder);
      let payout = 0;
      let tier = 'loss';
      if (slotKind === 'win') {
        if      (pos === 0) { tier = 'win';   payout = betTier * WIN_MULTIPLIER; }
        else if (pos === 1) { tier = 'place'; payout = betTier * PLACE_MULTIPLIER; }
        else if (pos === 2) { tier = 'show';  payout = betTier * SHOW_MULTIPLIER; }
      } else if (slotKind === 'place') {
        if      (pos === 0 || pos === 1) { tier = 'place'; payout = betTier * PLACE_MULTIPLIER; }
        else if (pos === 2)               { tier = 'show';  payout = betTier * SHOW_MULTIPLIER; }
      } else if (slotKind === 'show') {
        if (pos === 0 || pos === 1 || pos === 2) { tier = 'show'; payout = betTier * SHOW_MULTIPLIER; }
      }
      payout = Math.round(payout);
      detail[slot] = { horse: pickedHorse, finishPos: pos, tier: tier, payout: payout };
    }
    describe('win',   picks.win,   'win');
    describe('place', picks.place, 'place');
    describe('show',  picks.show,  'show');
    detail.totalPayout = detail.win.payout + detail.place.payout + detail.show.payout;
    return detail;
  }

  global.WikiraceBetting = {
    WIN_MULTIPLIER,
    PLACE_MULTIPLIER,
    SHOW_MULTIPLIER,
    resolveBet,
    resolveBetDetailed,
    findHorsePosition,
  };
})(window);
