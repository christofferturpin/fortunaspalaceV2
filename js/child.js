/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CHILD STATE  —  persistent stats, play decay, investments, mood face    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   (no DOMContentLoaded — runs at script load)                            │
  │                                                                          │
  │   IIFE bootstrap:                                                        │
  │     state = init()                                                       │
  │        ├─ readStorage()  ◄── localStorage 'wendys_palace_child'          │
  │        ├─ strip legacy s.bond / s.pleasure (no longer modeled)           │
  │        ├─ default + clamp [0..10] each of STATS                          │
  │        ├─ defaults: playCount=0, playBuffer=0, trustLevel=0,             │
  │        │            purchasedInvestments={}                              │
  │        └─ writeStorage(s)                                                │
  │                                                                          │
  │   Stat lifecycle:                                                        │
  │     get/set/add/applyEffects(effects) ──► clamp ──► writeStorage         │
  │                                            └─ notify() ──► listeners[]   │
  │     applyEffects also runs checkChildDeath() and resets playCount=0      │
  │       when effects.hunger>0 (feeding clears the hunger-tick clock)       │
  │     isChildDead() ──► any stat <= 0                                      │
  │     checkChildDeath() ──► location.replace('child-died.html')            │
  │                                                                          │
  │   Play decay (slot machine calls recordPlay() per spin):                 │
  │     recordPlay()                                                         │
  │       ├─ if playBuffer>0 ─► playBuffer-- (silent freebie, no decay)      │
  │       └─ else playCount++                                                │
  │           chance = min(0.9, (playCount-1)*0.1)                           │
  │           if rand<chance ─► playCount=0, hunger--,                       │
  │                              25% closeness--, 10% wellness--,            │
  │                              playBabyCry()                               │
  │           writeStorage + notify + checkChildDeath                        │
  │                                                                          │
  │   Lock (minigames): lockFor(ms,msg) / isLocked / lockRemainingMs /       │
  │                     lockMessage / clearLock                              │
  │                                                                          │
  │   Investments:                                                           │
  │     applyInvestment(action, resolvedCost) ──► bool                       │
  │       ├─ Wallet.spend(cost)                                              │
  │       ├─ playBuffer += action.bonusPlays                                 │
  │       ├─ oneTime ─► purchasedInvestments[id]=true                        │
  │       └─ trustGrowth ─► trustLevel++                                     │
  │     sellRefundFor(action) ──► int (75% of last paid)                     │
  │     sellInvestment(action) ──► bool (refund via Wallet.add; clamp        │
  │                                       playBuffer down by bonusPlays)     │
  │     hasPurchasedInvestment(id) / getTrustLevel / getPlayBuffer           │
  │                                                                          │
  │   describeFace(stats?) ──► { frames:[4], mood, tells:[] }                │
  │     branches on critical(≤1), low(≤3), edge(==4), avg buckets, minStat   │
  │     if state.sunglasses → frames=['(⌐■_■)']×4, mood='shaded' (overrides) │
  │                                                                          │
  │   Cosmetics (Lonnie's Sunglasses item):                                  │
  │     getSunglasses() / setSunglasses(bool) → persists state.sunglasses,   │
  │       writes + notifies; describeFace honors it for both child.html      │
  │       face and the floating widget rendered by header.js                 │
  │                                                                          │
  │   Cosmetics (Hospital Bracelet item — child.html LCD tint):              │
  │     getColor() / setColor({r,g,b}) → persists state.color {r,g,b}        │
  │       (defaults to original green {176,200,120}); writes + notifies;     │
  │       child/page.js paints .tamagotchi-screen background from it.        │
  │                                                                          │
  │   Cosmetics (decoration registry — every other giftshop item):           │
  │     COSMETICS={id:{prefix:[3],suffix:[3]}} registry; 3-frame arrays so   │
  │       each decoration animates alongside the 4-frame face (drifts).     │
  │     getCosmetic(id) / setCosmetic(id,on) → state.cosmetics[id]=bool;     │
  │       writes + notifies. listCosmetics()→ids on, registry order.         │
  │     describeFace() wraps every frame i with prefix[i%3]+face+suffix[i%3] │
  │       across all on-ids (after sunglasses override, so glasses stack).  │
  │                                                                          │
  │   Audio: playBabyCry() ──► new Audio(BABY_CRY_URL @0.6 vol)              │
  │     BABY_CRY_URL resolved relative to child.js script src so it works    │
  │     from both site root and /pages/ subpaths                             │
  │                                                                          │
  │   Exports (window.Child): { STATS, STAT_LABELS, MIN, MAX,                │
  │     PLAYS_PER_DECAY, getState, get, set, add, reset, applyEffects,       │
  │     isChildDead, lockFor, isLocked, lockRemainingMs, lockMessage,        │
  │     clearLock, recordPlay, getPlayBuffer, hasPurchasedInvestment,        │
  │     getTrustLevel, applyInvestment, sellRefundFor, sellInvestment,       │
  │     onChange, describeFace, getSunglasses, setSunglasses,                │
  │     getColor, setColor,                                                  │
  │     COSMETICS, getCosmetic, setCosmetic, listCosmetics }                 │
  │   External deps: Wallet, localStorage, Audio, location                   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_child'; STATS=['hunger','wellness','closeness']; STAT_LABELS={...}; DEFAULTS={all:5}; MIN=0, MAX=10, PLAYS_PER_DECAY=10
  BABY_CRY_URL: scan <script> tags for /js/child.js, prefix→'/assets/sounds/babycry.mp3' (falls back to 'assets/sounds/babycry.mp3')
  state: state=init(); listeners[]
  isChildDead()→bool: ∃k∈STATS state[k]<=0
  checkChildDeath(): if dead→location.replace('child-died.html')
  clamp(n)→[MIN,MAX]
  playBabyCry(): new Audio(URL)@0.6vol; play().catch ignore
  readStorage()→obj|null: JSON.parse(localStorage[KEY])
  writeStorage(s): localStorage[KEY]=JSON.stringify(s) (silent on fail)
  init()→state: s=readStorage||{}; strip legacy s.bond/s.pleasure; ∀STATS default+clamp; defaults playCount=0,playBuffer=0,trustLevel=0,purchasedInvestments={}; write; ret s
  notify(): ∀fn∈listeners→fn(state)
  exports: global.Child={
    STATS, STAT_LABELS, MIN, MAX, PLAYS_PER_DECAY,
    getState()→state | get(stat)→v | set(stat,v): guard ∈STATS; state[stat]=clamp(v); write; notify | add(stat,delta): same+= | reset(): state={...DEFAULTS,playCount:0}; write; notify
    applyEffects(effects): ∀stat∈effects ∈STATS→state[stat]+=delta clamp; effects.hunger>0→playCount=0; write; notify; checkDeath
    isChildDead
    lockFor(ms,msg): state.lockedUntil=now+ms; state.lockMessage=msg; write; notify
    isLocked()→bool: lockedUntil&&now<lockedUntil
    lockRemainingMs()→max(0,lockedUntil-now)
    lockMessage()→str
    clearLock(): nul lockedUntil; empty msg; write; notify
    recordPlay(): if playBuffer>0→buffer--; write; notify; ret. else playCount++; chance=min(0.9,(pc-1)*0.1); if rnd<chance→playCount=0, hunger--, rnd<.25→closeness--, rnd<.10→wellness--, playBabyCry; write; notify; checkDeath
    getPlayBuffer()→buffer|0
    hasPurchasedInvestment(id)→bool
    getTrustLevel()→trustLevel|0
    applyInvestment(action,resolvedCost)→bool: cost=resolvedCost??action.cost; guard(oneTime&&purchased→F); guard(!Wallet.spend(cost)→F); buffer+=bonusPlays; oneTime→mark purchased; trustGrowth→trustLevel++; write; notify; ret T
    sellRefundFor(action)→int: oneTime?(purchased?floor(action.cost*0.75):0):trustGrowth?(level>0?floor(1e6*10^(level-1)*0.75):0):0
    sellInvestment(action)→bool: oneTime→refund+del purchased; trustGrowth→refund+trustLevel--; else F; buffer=max(0,buffer-bonusPlays); write; Wallet.add(refund); notify; ret T
    onChange(fn): listeners.push
    getSunglasses()→bool: !!state.sunglasses
    setSunglasses(on): state.sunglasses=!!on; write; notify
    getColor()→{r,g,b}: state.color||{176,200,120}, ints
    setColor(rgb): clamp 0..255 each; state.color={r,g,b}; write; notify
    COSMETICS={id:{prefix:[3],suffix:[3]}} registry (snowglobe,broom,sticks,perfume,bottlecap,firstborn,rebecca,aggressive-opening,newspaper,pokerchip,deck); each prefix/suffix is 3-frame anim array
    getCosmetic(id)→bool: !!state.cosmetics?.[id]
    setCosmetic(id,on): guard id∈COSMETICS; state.cosmetics[id]=!!on (or delete if off); write; notify
    listCosmetics()→ids[]: keys of COSMETICS filtered to state.cosmetics[id]==T (registry order)
    describeFace(stats?)→{frames[4],mood,tells[]}: s.sunglasses→{frames=['(⌐■_■)']×4,mood='shaded',tells}; else branch on critical(≤1)/low(≤3)/edge(==4) counts, then avg buckets (<5.75 neutral, <6.75 okay, <7.75 pleased, <8.75 content, ≥9&&minStat≥8 ecstatic, <9.5 cheerful, else happy); tells from each stat≤3 ('hungry'/'sick'/'alone'); finally wrap each frame i: pre=Σprefixes[i%3], suf=Σsuffixes[i%3]; frames=frames.map((f,i)→pre+f+suf)
  }
  no DOMContentLoaded; runs at script load
*/

(function (global) {
  const STORAGE_KEY = 'wendys_palace_child';
  const STATS = ['hunger', 'wellness', 'closeness'];
  const STAT_LABELS = {
    hunger: 'Hunger',
    wellness: 'Wellness',
    closeness: 'Closeness',
  };
  const DEFAULTS = { hunger: 5, wellness: 5, closeness: 5 };
  const MIN = 0;
  const MAX = 10;
  // Number of "Til hungry" steps shown by the widget. Drop chance per play
  // = (playCount - 1) * growth, capped at 90 % — so the gauge hangs at 90 %
  // until the roll lands and resets to zero.
  const PLAYS_PER_DECAY = 10;

  // Stackable face decorations. Each owned giftshop item registers four
  // optional 3-frame arrays: above (line over the face), prefix/suffix
  // (concatenated around the eyes on the face's own line), and below (line
  // under the face). describeFace() cycles by face-frame index so the
  // decoration animates alongside the eyes; multiple cosmetics stack in
  // registry order on each line. Pure ASCII / sparse Unicode, no emoji.
  const COSMETICS = {
    'snowglobe': {
      above:  [' ❄  ·  ❄ ', '·  ❄ ❄  ·', ' ❄ ·  · ❄'],
      below:  ['— SNOW DAY —', '— SNOW DAY —', '— SNOW DAY —'],
    },
    'broom': {
      above:  ['≫ ❀ ≪', '> ❀ <', '≫ ❀ ≪'],
    },
    'sticks': {
      prefix: ['◖', '◖', '◖'],
      suffix: ['◗', '◗', '◗'],
    },
    'perfume': {
      above:  ['~  ~  ~', ' ~  ~  ~', '~  ~  ~ '],
      below:  [' ~  ~  ~', '~  ~  ~ ', ' ~  ~  ~'],
    },
    'bottlecap':          { prefix: ['✦ ', '✧ ', '· '], suffix: [' ✦', ' ✧', ' ·'] },
    'firstborn':          { prefix: ['❅ ', '· ', '❆ '], suffix: [' ❅', ' ·', ' ❆'] },
    'rebecca':            { prefix: ['[≡] ', '[≣] ', '[≡] '] },
    'aggressive-opening': { prefix: ['♟ ', '♙ ', '♟ '] },
    'newspaper':          { prefix: ['▤ ', '▥ ', '▤ '], suffix: [' ▤', ' ▥', ' ▤'] },
    'pokerchip':          { prefix: ['◉ ', '◎ ', '◉ '], suffix: [' ◉', ' ◎', ' ◉'] },
    'deck':               { prefix: ['✶ ', '✷ ', '✦ '], suffix: [' ✶', ' ✷', ' ✦'] },
  };

  // Housing ladder, lowest to highest. Selling must happen TOP-DOWN — you
  // can't downgrade out of the trailer while still owning the apartment.
  // The College Fund is the highest housing tier; the Trust is a separate
  // ratcheting investment and is not part of this rule.
  const HOUSING_LADDER_IDS = [
    'invest-motel',
    'invest-trailer',
    'invest-apartment',
    'invest-house',
    'invest-college',
  ];

  function highestOwnedHousingIndex() {
    const owned = state.purchasedInvestments || {};
    let best = -1;
    for (let i = 0; i < HOUSING_LADDER_IDS.length; i++) {
      if (owned[HOUSING_LADDER_IDS[i]]) best = i;
    }
    return best;
  }
  function isHousingSellBlocked(actionId) {
    const idx = HOUSING_LADDER_IDS.indexOf(actionId);
    if (idx < 0) return false; // not a housing tier
    return idx < highestOwnedHousingIndex();
  }

  function isChildDead() {
    for (const k of STATS) {
      if (state[k] <= 0) return true;
    }
    return false;
  }

  function checkChildDeath() {
    if (isChildDead()) {
      try { location.replace('child-died.html'); } catch (e) {}
    }
  }

  function clamp(n) {
    return Math.max(MIN, Math.min(MAX, n));
  }

  // Resolve assets/sounds/babycry.mp3 relative to wherever child.js lives,
  // so the audio loads whether the calling page is at the site root or
  // under /pages/. A page-relative string would 404 for /pages/ callers.
  const BABY_CRY_URL = (function () {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      const m = src.match(/^(.*)\/js\/child\.js(?:\?.*)?$/);
      if (m) return m[1] + '/assets/sounds/babycry.mp3';
    }
    return 'assets/sounds/babycry.mp3';
  })();

  function playBabyCry() {
    try {
      const audio = new Audio(BABY_CRY_URL);
      audio.volume = 0.6;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      // file missing or autoplay blocked — silent
    }
  }

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // private mode / quota: silently ignore
    }
  }

  function init() {
    const s = readStorage() || {};
    delete s.bond;
    delete s.pleasure;
    for (const k of STATS) {
      if (typeof s[k] !== 'number') s[k] = DEFAULTS[k];
      else s[k] = clamp(s[k]);
    }
    if (typeof s.playCount !== 'number') s.playCount = 0;
    if (typeof s.trustLevel !== 'number') s.trustLevel = 0;
    if (!s.purchasedInvestments || typeof s.purchasedInvestments !== 'object') {
      s.purchasedInvestments = {};
    }
    if (typeof s.sunglasses !== 'boolean') s.sunglasses = false;
    // Tamagotchi-screen tint. Default matches the original LCD green (#b0c878).
    // Set by the hospital-bracelet item (giftshop/bracelet.html) once owned.
    if (!s.color || typeof s.color !== 'object'
        || typeof s.color.r !== 'number'
        || typeof s.color.g !== 'number'
        || typeof s.color.b !== 'number') {
      s.color = { r: 176, g: 200, b: 120 };
    }
    if (!s.cosmetics || typeof s.cosmetics !== 'object') s.cosmetics = {};
    writeStorage(s);
    return s;
  }

  let state = init();
  const listeners = [];
  function notify() {
    for (const fn of listeners) fn(state);
  }

  // Hunger-tick chance grows with each play: chance = (playCount - 1) * rate,
  // capped at 0.9. The rate starts at BASE_GROWTH per play and each owned
  // housing upgrade / trust deposit halves it, down to GROWTH_FLOOR — never
  // zero, so hunger always eventually creeps no matter how rich you get.
  const BASE_GROWTH = 0.05;
  const GROWTH_FLOOR = 0.01;
  function getGrowthRate() {
    const purchased = state.purchasedInvestments
      ? Object.keys(state.purchasedInvestments).length
      : 0;
    const halvings = purchased + (state.trustLevel || 0);
    return Math.max(GROWTH_FLOOR, BASE_GROWTH * Math.pow(0.5, halvings));
  }

  global.Child = {
    STATS,
    STAT_LABELS,
    MIN,
    MAX,
    PLAYS_PER_DECAY,
    getState() { return state; },
    get(stat) { return state[stat]; },
    set(stat, value) {
      if (!STATS.includes(stat)) return;
      state[stat] = clamp(value);
      writeStorage(state);
      notify();
    },
    add(stat, delta) {
      if (!STATS.includes(stat)) return;
      state[stat] = clamp(state[stat] + delta);
      writeStorage(state);
      notify();
    },
    reset() {
      state = { ...DEFAULTS, playCount: 0 };
      writeStorage(state);
      notify();
    },
    applyEffects(effects) {
      for (const stat in effects) {
        if (!STATS.includes(stat)) continue;
        state[stat] = clamp(state[stat] + effects[stat]);
      }
      // Feeding (any positive hunger delta) resets the hunger-tick clock so
      // the next play starts back at the lowest drop chance.
      if (effects.hunger > 0) {
        state.playCount = 0;
      }
      writeStorage(state);
      notify();
      checkChildDeath();
    },
    isChildDead,
    lockFor(ms, message) {
      state.lockedUntil = Date.now() + ms;
      state.lockMessage = message || '';
      writeStorage(state);
      notify();
    },
    isLocked() {
      return !!(state.lockedUntil && Date.now() < state.lockedUntil);
    },
    lockRemainingMs() {
      if (!state.lockedUntil) return 0;
      return Math.max(0, state.lockedUntil - Date.now());
    },
    lockMessage() {
      return state.lockMessage || '';
    },
    clearLock() {
      state.lockedUntil = null;
      state.lockMessage = '';
      writeStorage(state);
      notify();
    },
    recordPlay() {
      state.playCount = (state.playCount || 0) + 1;
      const chance = Math.min(0.9, Math.max(0, (state.playCount - 1) * getGrowthRate()));
      if (Math.random() < chance) {
        state.playCount = 0;
        state.hunger = clamp(state.hunger - 1);
        if (Math.random() < 0.25) state.closeness = clamp(state.closeness - 1);
        if (Math.random() < 0.10) state.wellness = clamp(state.wellness - 1);
        playBabyCry();
      }
      writeStorage(state);
      notify();
      checkChildDeath();
    },
    getGrowthRate() { return getGrowthRate(); },
    hasPurchasedInvestment(id) {
      return !!(state.purchasedInvestments && state.purchasedInvestments[id]);
    },
    getTrustLevel() { return state.trustLevel || 0; },
    applyInvestment(action, resolvedCost) {
      // resolvedCost is passed in because trust cost is dynamic and the caller
      // already computed it; for fixed-cost actions, action.cost is used.
      const cost = typeof resolvedCost === 'number' ? resolvedCost : action.cost;
      if (action.oneTime && this.hasPurchasedInvestment(action.id)) return false;
      if (!Wallet.spend(cost)) return false;
      if (action.oneTime) {
        state.purchasedInvestments = state.purchasedInvestments || {};
        state.purchasedInvestments[action.id] = true;
      }
      if (action.trustGrowth) {
        state.trustLevel = (state.trustLevel || 0) + 1;
      }
      writeStorage(state);
      notify();
      return true;
    },
    sellRefundFor(action) {
      if (action.oneTime) {
        if (!this.hasPurchasedInvestment(action.id)) return 0;
        if (isHousingSellBlocked(action.id)) return 0;
        return Math.floor((action.cost || 0) * 0.75);
      }
      if (action.trustGrowth) {
        const level = state.trustLevel || 0;
        if (level <= 0) return 0;
        const lastCost = 1000000 * Math.pow(10, level - 1);
        return Math.floor(lastCost * 0.75);
      }
      return 0;
    },
    sellInvestment(action) {
      let refund = 0;
      if (action.oneTime) {
        if (!this.hasPurchasedInvestment(action.id)) return false;
        // Tear-down only from the top: refuse to sell a lower housing tier
        // while a higher one is still owned.
        if (isHousingSellBlocked(action.id)) return false;
        refund = Math.floor((action.cost || 0) * 0.75);
        delete state.purchasedInvestments[action.id];
      } else if (action.trustGrowth) {
        const level = state.trustLevel || 0;
        if (level <= 0) return false;
        const lastCost = 1000000 * Math.pow(10, level - 1);
        refund = Math.floor(lastCost * 0.75);
        state.trustLevel = level - 1;
      } else {
        return false;
      }
      writeStorage(state);
      Wallet.add(refund);
      notify();
      return true;
    },
    isHousingSellBlocked(actionId) { return isHousingSellBlocked(actionId); },
    onChange(fn) { listeners.push(fn); },
    getSunglasses() { return !!state.sunglasses; },
    setSunglasses(on) {
      state.sunglasses = !!on;
      writeStorage(state);
      notify();
    },
    getColor() {
      const c = state.color || { r: 176, g: 200, b: 120 };
      return { r: c.r | 0, g: c.g | 0, b: c.b | 0 };
    },
    setColor(rgb) {
      if (!rgb || typeof rgb !== 'object') return;
      const cl = (n) => Math.max(0, Math.min(255, n | 0));
      state.color = { r: cl(rgb.r), g: cl(rgb.g), b: cl(rgb.b) };
      writeStorage(state);
      notify();
    },
    COSMETICS,
    getCosmetic(id) {
      return !!(state.cosmetics && state.cosmetics[id]);
    },
    setCosmetic(id, on) {
      if (!Object.prototype.hasOwnProperty.call(COSMETICS, id)) return;
      if (!state.cosmetics || typeof state.cosmetics !== 'object') state.cosmetics = {};
      if (on) state.cosmetics[id] = true;
      else delete state.cosmetics[id];
      writeStorage(state);
      notify();
    },
    listCosmetics() {
      const on = state.cosmetics || {};
      return Object.keys(COSMETICS).filter((id) => !!on[id]);
    },
    describeFace(stats) {
      const s = stats || state;
      const hunger = +s.hunger || 0;
      const wellness = +s.wellness || 0;
      const closeness = +s.closeness || 0;
      const avg = (hunger + wellness + closeness) / 3;
      const minStat = Math.min(hunger, wellness, closeness);
      const all = [
        { stat: 'hunger', v: hunger },
        { stat: 'wellness', v: wellness },
        { stat: 'closeness', v: closeness },
      ];
      const critical = all.filter((x) => x.v <= 1);
      const low = all.filter((x) => x.v <= 3);
      const tells = [];
      if (hunger <= 3)    tells.push('hungry');
      if (wellness <= 3)  tells.push('sick');
      if (closeness <= 3) tells.push('alone');

      // Pull cosmetic ids from the same stats source as the face, so a caller
      // that passes a synthetic stats object can preview without the live state.
      const cosOn = (s.cosmetics && typeof s.cosmetics === 'object') ? s.cosmetics : {};
      const cosIds = Object.keys(COSMETICS).filter((id) => !!cosOn[id]);
      const pick = (arr, i) => Array.isArray(arr) ? (arr[i % arr.length] || '') : (arr || '');
      const wrap = (result) => {
        if (!cosIds.length) return result;
        result.frames = result.frames.map((f, i) => {
          const above = cosIds.map((id) => pick(COSMETICS[id].above, i)).filter(Boolean).join(' ');
          const below = cosIds.map((id) => pick(COSMETICS[id].below, i)).filter(Boolean).join(' ');
          const pre = cosIds.map((id) => pick(COSMETICS[id].prefix, i)).join('');
          const suf = cosIds.map((id) => pick(COSMETICS[id].suffix, i)).join('');
          const middle = pre + f + suf;
          const lines = [];
          if (above) lines.push(above);
          lines.push(middle);
          if (below) lines.push(below);
          return lines.join('\n');
        });
        return result;
      };

      if (s.sunglasses) {
        return wrap({ frames: ['(⌐■_■)', '(⌐■_■)', '(⌐■_■)', '(⌐■_■)'], mood: 'shaded', tells });
      }

      if (critical.length >= 2) {
        return wrap({ frames: ['(✗_✗)', '(x_x)', '(✗_✗)', '(x_x)'], mood: 'dying', tells });
      }
      if (critical.length === 1) {
        const c = critical[0].stat;
        if (c === 'hunger')    return wrap({ frames: ['(o_O)', '(O_o)', '(O_O)', '(O_o)'], mood: 'starving', tells });
        if (c === 'wellness')  return wrap({ frames: ['(@_@)', '(@~@)', '(@_@)', '(x~x)'], mood: 'sick', tells });
        if (c === 'closeness') return wrap({ frames: ['(T_T)', '(;_;)', '(T_T)', '(;~;)'], mood: 'crying', tells });
      }
      if (low.length >= 2) {
        return wrap({ frames: ['(>_<)', '(>~<)', '(>_<)', '(⊙_⊙)'], mood: 'distressed', tells });
      }
      if (low.length === 1) {
        const c = low[0].stat;
        if (c === 'hunger')    return wrap({ frames: ['(•_•)', '(o_o)', '(•_•)', '(o_O)'], mood: 'peckish', tells });
        if (c === 'wellness')  return wrap({ frames: ['(u_u)', '(•_•)', '(u_u)', '(•_•)'], mood: 'queasy', tells });
        if (c === 'closeness') return wrap({ frames: ['(·_·)', '(._.)', '(·_·)', '(._.)'], mood: 'wistful', tells });
      }

      // Past the danger zone — every stat is now at least 4. The climb from
      // "just barely fine" to ecstatic gets its own gradient instead of two
      // wide buckets (neutral / content) doing all the work.
      const edge = all.filter((x) => x.v === 4);

      // Multiple stats sitting right at the edge: low-grade unease everywhere.
      if (edge.length >= 2) {
        return wrap({ frames: ['(˘_˘)', '(˘~˘)', '(˘_˘)', '(-_-)'], mood: 'subdued', tells });
      }
      // One stat at 4: nothing in distress, but a small worry hangs there.
      if (edge.length === 1) {
        return wrap({ frames: ['(•_•)', '(o_•)', '(•_•)', '(•_o)'], mood: 'uneasy', tells });
      }

      // All stats ≥ 5 from here on.
      if (avg < 5.75) {
        return wrap({ frames: ['(o_o)', '(-_-)', '(o_o)', '(-_-)'], mood: 'neutral', tells });
      }
      if (avg < 6.75) {
        return wrap({ frames: ['(•‿•)', '(•_•)', '(•‿•)', '(•_•)'], mood: 'okay', tells });
      }
      if (avg < 7.75) {
        return wrap({ frames: ['(◠‿◠)', '(•‿•)', '(◠‿◠)', '(•‿•)'], mood: 'pleased', tells });
      }
      if (avg < 8.75) {
        return wrap({ frames: ['(^_^)', '(^˘^)', '(^_^)', '(^_^)'], mood: 'content', tells });
      }
      if (avg >= 9 && minStat >= 8) {
        return wrap({ frames: ['(★_★)', '(^o^)', '(★_★)', '(^o^)'], mood: 'ecstatic', tells });
      }
      if (avg < 9.5) {
        return wrap({ frames: ['(^‿^)', '(^_^)', '(^‿^)', '(^o^)'], mood: 'cheerful', tells });
      }
      return wrap({ frames: ['(^_^)', '(^o^)', '(^_^)', '(^v^)'], mood: 'happy', tells });
    },
  };
})(window);
