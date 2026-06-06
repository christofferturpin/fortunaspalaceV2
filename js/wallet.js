/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WALLET  —  coin balance store + lifetime-earned ledger (foundational)   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► init() ──► readStorage() ──► state{coins,lifetimeEarned} │
  │                              │                                           │
  │                              ├─ migrates legacy state (adds lifetime=0)  │
  │                              └─ fresh state: coins=startingBalance()     │
  │                                  (BASE_COINS + giftshop.startingBonus)   │
  │                                                                          │
  │   Storage:  localStorage['sinnerbox']  = { coins, lifetimeEarned }       │
  │             localStorage['wendys_palace_giftshop'].startingBonus (R)     │
  │                                                                          │
  │   Public API (window.Wallet):                                            │
  │     getBalance()             ──► int  (current coins)                    │
  │     spend(amount:int)        ──► bool (false if insufficient; else true) │
  │                                       writes + notify()                  │
  │     add(amount:int)          ──► void (coins+=, lifetime+=, notify)      │
  │     getLifetimeEarned()      ──► int  (total ever credited)              │
  │     set(amount:int)          ──► void (force-set; writes + notify)       │
  │     reset()                  ──► void (coins=startingBalance; debug-     │
  │                                       reset button; lifetime untouched)  │
  │     onChange(fn)             ──► void (registers fn(newBalance))         │
  │                                                                          │
  │   notify() ──► every listener(state.coins)                               │
  │                                                                          │
  │   Exports: window.Wallet                                                 │
  │   External deps: none (pure localStorage; foundation for other modules)  │
  │   Consumers: header.js, expenses.js, slot.js, letters.js, splash.js,     │
  │              plinko.js, child.js, giftshop.js, etc.                      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='sinnerbox'; GIFTSHOP_KEY='wendys_palace_giftshop'; BASE_COINS=100
  readGiftshopBonus()→int: try parse localStorage[GIFTSHOP_KEY].startingBonus; ret int||0
  startingBalance()→int: BASE_COINS+readGiftshopBonus
  readStorage()→obj|null: try JSON.parse(localStorage[KEY]); catch→null
  writeStorage(s): try localStorage[KEY]=JSON.stringify(s); catch noop
  init()→state: s=readStorage; !s→s={coins:startingBalance(),lifetimeEarned:0}+write; else typeof s.lifetimeEarned≠'number'→s.lifetimeEarned=0+write (migration); ret s
  state=init; listeners=[]
  notify(): ∀fn∈listeners→fn(state.coins)
  exports: global.Wallet={
    getBalance()→state.coins,
    spend(amount)→bool: amount>coins→F; coins-=amount; write; notify; T,
    add(amount): coins+=amount; lifetimeEarned=(lifetimeEarned||0)+amount; write; notify,
    getLifetimeEarned()→state.lifetimeEarned||0,
    set(amount): coins=amount; write; notify (no lifetime bump — force-set),
    reset(): coins=startingBalance(); write; notify (debug-reset; honors giftshop bonus),
    onChange(fn): listeners.push(fn)
  }
*/

(function (global) {
  const STORAGE_KEY = 'sinnerbox';
  const GIFTSHOP_KEY = 'wendys_palace_giftshop';
  const BASE_COINS = 100;

  function readGiftshopBonus() {
    try {
      const raw = localStorage.getItem(GIFTSHOP_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return parseInt(parsed && parsed.startingBonus, 10) || 0;
    } catch {
      return 0;
    }
  }

  function startingBalance() {
    return BASE_COINS + readGiftshopBonus();
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage may be unavailable (private mode, quota); silently ignore
    }
  }

  function init() {
    let state = readStorage();
    if (!state) {
      state = { coins: startingBalance(), lifetimeEarned: 0 };
      writeStorage(state);
    } else if (typeof state.lifetimeEarned !== 'number') {
      state.lifetimeEarned = 0;
      writeStorage(state);
    }
    return state;
  }

  let state = init();

  const listeners = [];
  function notify() {
    for (const fn of listeners) fn(state.coins);
  }

  global.Wallet = {
    getBalance() {
      return state.coins;
    },
    spend(amount) {
      if (amount > state.coins) return false;
      state.coins -= amount;
      writeStorage(state);
      notify();
      return true;
    },
    add(amount) {
      state.coins += amount;
      state.lifetimeEarned = (state.lifetimeEarned || 0) + amount;
      writeStorage(state);
      notify();
    },
    getLifetimeEarned() {
      return state.lifetimeEarned || 0;
    },
    set(amount) {
      state.coins = amount;
      writeStorage(state);
      notify();
    },
    reset() {
      state.coins = startingBalance();
      writeStorage(state);
      notify();
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})(window);
