/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CHILD ACTIONS  —  static catalog of actions + investments               │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded — pure data module, runs at script load)          │
  │                                                                          │
  │   ACTIONS[]  — buttons in the child page action grid:                    │
  │     { id, label, desc, cost, effects?:{stat:delta}, route?, lockMs? }    │
  │     Food: trash-food / cheap-food / expensive-food                       │
  │     Med:  cheap-medicine / expensive-medicine                            │
  │     Sitter: shitty-babysitter / expensive-babysitter / nanny             │
  │     Routed minigames (route set, no effects):                            │
  │           spend-time   ─► minigame-closeness.html                        │
  │                                                                          │
  │   INVESTMENTS[]  — long-term hunger-rate reducers (each halves growth):  │
  │     oneTime housing ladder: motel, trailer, apartment, house, college    │
  │       { id, label, desc, cost, oneTime:true }                            │
  │     trustGrowth (repeatable, ×10 cost each level):                       │
  │       invest-trust:                                                      │
  │         labelFor(state) ─► "Put a Million in the Trust" | "Add to..."    │
  │         costFor(state)  ─► 1_000_000 * 10^trustLevel                     │
  │         { trustGrowth:true }                                             │
  │                                                                          │
  │   Constants: HALF_HOUR_MS (declared, unused in current actions)          │
  │                                                                          │
  │   Exports (window.JG_CHILD): { ACTIONS, INVESTMENTS }                    │
  │     (Assigns onto existing JG_CHILD object if present, else creates it.) │
  │   External deps: none (pure data; consumed by js/child/page.js)          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: HALF_HOUR_MS=30*60*1000 (declared, currently unused)
  ACTIONS=[
    {id:'spend-time', cost:0, route:'minigame-closeness.html'}
    {id:'trash-food', cost:0, effects:{hunger:+1,wellness:-1}}
    {id:'cheap-food', cost:50, effects:{hunger:+1}}
    {id:'expensive-food', cost:125, effects:{hunger:+3}}
    {id:'cheap-medicine', cost:100, effects:{wellness:+1}}
    {id:'expensive-medicine', cost:225, effects:{wellness:+3}}
    {id:'shitty-babysitter', cost:300, effects:{closeness:+1,wellness:-1}}
    {id:'expensive-babysitter', cost:250, effects:{closeness:+1}}
    {id:'nanny', cost:1000, effects:{closeness:+3}}
  ]
  INVESTMENTS=[ each owned halves Child.getGrowthRate() per play, floor 0.01
    oneTime housing ladder (oneTime:true):
      {invest-motel:500, invest-trailer:1000, invest-apartment:2000, invest-house:10000, invest-college:100000}
    {id:'invest-trust', trustGrowth:true,
      labelFor(state)→trustLevel==0?'Put a Million in the Trust':'Add to the Trust',
      costFor(state)→1_000_000*10^(state.trustLevel||0)}
  ]
  exports: global.JG_CHILD=global.JG_CHILD||{}; global.JG_CHILD.ACTIONS=ACTIONS; global.JG_CHILD.INVESTMENTS=INVESTMENTS
  no DOMContentLoaded; pure data module
*/

(function (global) {
  const HALF_HOUR_MS = 30 * 60 * 1000;

  const ACTIONS = [
    {
      id: 'spend-time',
      label: 'Spend Time with Child',
      desc: 'Risk / reward · Closeness',
      cost: 0,
      route: 'minigame-closeness.html',
    },
    {
      id: 'trash-food',
      label: 'Animal Formula',
      desc: '+1 Hunger, −1 Wellness',
      cost: 0,
      effects: { hunger: +1, wellness: -1 },
    },
    {
      id: 'cheap-food',
      label: "Cow's Milk",
      desc: '+1 Hunger',
      cost: 50,
      effects: { hunger: +1 },
    },
    {
      id: 'expensive-food',
      label: 'Expensive Formula',
      desc: '+3 Hunger',
      cost: 125,
      effects: { hunger: +3 },
    },
    {
      id: 'cheap-medicine',
      label: 'Cheap Medicine',
      desc: '+1 Wellness',
      cost: 100,
      effects: { wellness: +1 },
    },
    {
      id: 'expensive-medicine',
      label: 'Telehealth',
      desc: '+3 Wellness',
      cost: 225,
      effects: { wellness: +3 },
    },
    {
      id: 'shitty-babysitter',
      label: 'Shitty Babysitter',
      desc: '+1 Closeness, −1 Wellness',
      cost: 300,
      effects: { closeness: +1, wellness: -1 },
    },
    {
      id: 'expensive-babysitter',
      label: 'Expensive Babysitter',
      desc: '+1 Closeness',
      cost: 250,
      effects: { closeness: +1 },
    },
    {
      id: 'nanny',
      label: 'Nanny',
      desc: '+3 Closeness',
      cost: 1000,
      effects: { closeness: +3 },
    },
  ];

  // Long-term investments. Each owned housing upgrade and each trust deposit
  // halves the per-play hunger-decay chance. Halving never reaches zero — the
  // Trust drains money forever for diminishing safety.
  const INVESTMENTS = [
    {
      id: 'invest-motel',
      label: 'Pay-by-the-Week Motel',
      desc: 'Cuts the hunger risk in half.',
      cost: 500,
      oneTime: true,
    },
    {
      id: 'invest-trailer',
      label: 'Trailer',
      desc: 'Cuts it in half again.',
      cost: 1000,
      oneTime: true,
    },
    {
      id: 'invest-apartment',
      label: 'A Real Apartment',
      desc: 'Cuts it in half again.',
      cost: 2000,
      oneTime: true,
    },
    {
      id: 'invest-house',
      label: 'A House',
      desc: 'Cuts it in half again.',
      cost: 10000,
      oneTime: true,
    },
    {
      id: 'invest-college',
      label: 'College Fund',
      desc: 'Cuts it in half again.',
      cost: 100000,
      oneTime: true,
    },
    {
      id: 'invest-trust',
      // The trust never resolves — each deposit halves the risk again and
      // ratchets the next ask. costFor(state) and labelFor(state) are
      // evaluated by the renderer.
      labelFor: function (state) {
        return (state.trustLevel || 0) === 0
          ? 'Put a Million in the Trust'
          : 'Add to the Trust';
      },
      desc: 'Cuts it in half again. Every time. Cost grows ×10.',
      costFor: function (state) {
        return 1000000 * Math.pow(10, state.trustLevel || 0);
      },
      trustGrowth: true,
    },
  ];

  global.JG_CHILD = global.JG_CHILD || {};
  global.JG_CHILD.ACTIONS = ACTIONS;
  global.JG_CHILD.INVESTMENTS = INVESTMENTS;
})(window);
