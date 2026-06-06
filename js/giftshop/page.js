/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GIFTSHOP PAGE  —  buy / revisit items; ownership persisted in storage   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE bootstrap                                                         │
  │     ├─ for each .gs-item: bind .gs-buy click ──►                         │
  │     │     isOwned(id) ? location.href = href : buy(item)                 │
  │     ├─ refreshAll()                                                      │
  │     └─ Wallet.onChange(refreshAll)  (rerun on balance change)            │
  │                                                                          │
  │   Storage:                                                               │
  │     readState()         ──► { owned:string[], startingBonus:int }        │
  │     writeState(state)   ──► persists { owned, startingBonus } JSON       │
  │     isOwned(id)         ──► bool                                         │
  │     isLocked(item)      ──► bool: any earlier .gs-item sibling unowned   │
  │                              → enforces strict DOM-order purchase gate   │
  │     markOwned(id, cost) ──► push id, startingBonus=max(prev,cost), write │
  │     recomputeBonusFromDOM() ──► startingBonus = max data-cost over owned │
  │                                 items in current DOM; runs every load    │
  │                                                                          │
  │   buy(item)                                                              │
  │     ├─ isOwned ──► navigate href (revisit)                               │
  │     ├─ isLocked ──► showToast('Items unlock in order.'); return         │
  │     ├─ Wallet.spend(cost) ◄── showToast('Not enough coins.') on fail     │
  │     ├─ markOwned(id, cost); refreshItem(item)                            │
  │     └─ setTimeout 350ms ──► location.href = href                         │
  │                                                                          │
  │   UI helpers:                                                            │
  │     refreshItem(item)  ──► toggle BUY / SHORT / LOCKED / REVISIT label;  │
  │                            locked items dim+grayscale via inline style   │
  │     refreshAll()       ──► refreshItem on every .gs-item + maybeReveal-  │
  │                            Deck() to reveal item XIII when other 12 own  │
  │     maybeRevealDeck()  ──► toggles .is-revealed on .gs-item-deck once    │
  │                            every other gs-item id is in owned set       │
  │     showToast(msg)     ──► transient toast in #gs-toast                  │
  │                                                                          │
  │   Storage key: 'wendys_palace_giftshop'                                  │
  │     shape: { owned:string[], startingBonus:int }                         │
  │     startingBonus = max cost of owned items; read by Wallet.init/reset   │
  │     to seed coins on fresh runs (survives FORGET — not in forget KEYS)   │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet (getBalance / spend / onChange),          │
  │                   localStorage                                           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_giftshop'
  state: toast=#gs-toast, toastTimer=null
  readState()→{owned:str[],startingBonus:int}: try parse localStorage[KEY]; owned=Array(parsed.owned)?parsed.owned:[]; bonus=int(parsed.startingBonus)||0; ret {owned,bonus}
  writeState({owned,startingBonus}): try localStorage[KEY]=JSON{owned,startingBonus}
  isOwned(id)→bool: readState.owned.indexOf(id)!==-1
  isLocked(item)→bool: !isOwned(item.id) && ∃ earlier .gs-item sibling w/ !isOwned → T
  markOwned(id,cost): s=readState; !s.owned.includes(id)→push(id); c=int(cost)||0; c>s.startingBonus→s.startingBonus=c; writeState
  recomputeBonusFromDOM(): s=readState; bonus=0; ∀id∈owned scrape $('.gs-item[data-id=id]').dataset.cost→bonus=max(bonus,c); s.startingBonus=bonus; writeState (runs every load; self-heals legacy sum-bonus saves)
  showToast(msg): guard(!toast); toast.text=msg; hidden=F; rAF→add is-on; clear prev timer; 1500ms→rm is-on, +300ms hidden=T
  refreshItem(item): id,cost,btn; guard !btn; isOwned→is-owned, clear style, 'REVISIT'; else if isLocked→dim+grayscale inline, disabled,'LOCKED'; else clear style, bal<cost→'SHORT' disabled, else 'BUY'
  refreshAll(): $$('.gs-item').forEach(refreshItem); maybeRevealDeck
  maybeRevealDeck(): deck=$('.gs-item-deck'); guard(!deck); owned=Set(readState.owned); allPrior=∀.gs-item≠deck → owned.has(id); deck.toggle('is-revealed', allPrior)
  buy(item): id,cost,href; guard !id||!href; isOwned→nav href; isLocked→toast 'Items unlock in order'; !Wallet.spend(cost)→toast 'Not enough coins'; markOwned; refreshItem; setTimeout 350ms→nav href
  IIFE: recomputeBonusFromDOM; ∀.gs-item bind .gs-buy click→preventDefault; isOwned?location.href=href:buy(item); refreshAll; Wallet.onChange?(refreshAll)
  exports: none (IIFE-local); runs synchronously on script load
*/

(function () {
  const STORAGE_KEY = 'wendys_palace_giftshop';

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed) {
        const owned = Array.isArray(parsed.owned) ? parsed.owned : [];
        const startingBonus = parseInt(parsed.startingBonus, 10) || 0;
        return { owned, startingBonus };
      }
    } catch {}
    return { owned: [], startingBonus: 0 };
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        owned: state.owned,
        startingBonus: state.startingBonus,
      }));
    } catch {}
  }

  function isOwned(id) {
    return readState().owned.indexOf(id) !== -1;
  }

  // Locked = any earlier .gs-item sibling is still unowned. Items must be
  // purchased in DOM order; only the next-up item is buyable.
  function isLocked(item) {
    if (isOwned(item.dataset.id)) return false;
    for (let prev = item.previousElementSibling; prev; prev = prev.previousElementSibling) {
      if (!prev.classList || !prev.classList.contains('gs-item')) continue;
      if (!isOwned(prev.dataset.id)) return true;
    }
    return false;
  }

  function markOwned(id, cost) {
    const state = readState();
    if (state.owned.indexOf(id) === -1) state.owned.push(id);
    const c = parseInt(cost, 10) || 0;
    if (c > state.startingBonus) state.startingBonus = c;
    writeState(state);
  }

  // Bonus = max data-cost across currently-owned items. Recompute from DOM
  // every load so legacy summed-bonus saves self-heal on next visit.
  function recomputeBonusFromDOM() {
    const state = readState();
    let bonus = 0;
    for (const id of state.owned) {
      const node = document.querySelector('.gs-item[data-id="' + id + '"]');
      if (!node) continue;
      const c = parseInt(node.dataset.cost, 10) || 0;
      if (c > bonus) bonus = c;
    }
    state.startingBonus = bonus;
    writeState(state);
  }

  const toast = document.getElementById('gs-toast');
  let toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-on'));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-on');
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 1500);
  }

  function refreshItem(item) {
    const id = item.dataset.id;
    const cost = parseInt(item.dataset.cost, 10) || 0;
    const btn = item.querySelector('.gs-buy');
    if (!btn) return;
    if (isOwned(id)) {
      item.classList.add('is-owned');
      item.style.opacity = '';
      item.style.filter = '';
      btn.disabled = false;
      btn.textContent = 'REVISIT';
      btn.classList.add('gs-buy-revisit');
      return;
    }
    btn.classList.remove('gs-buy-revisit');
    item.classList.remove('is-owned');
    if (isLocked(item)) {
      item.style.opacity = '0.45';
      item.style.filter = 'grayscale(0.85) brightness(0.85)';
      btn.disabled = true;
      btn.textContent = 'LOCKED';
      return;
    }
    item.style.opacity = '';
    item.style.filter = '';
    const balance = (window.Wallet && Wallet.getBalance()) || 0;
    if (balance < cost) {
      btn.disabled = true;
      btn.textContent = 'SHORT';
    } else {
      btn.disabled = false;
      btn.textContent = 'BUY';
    }
  }

  function refreshAll() {
    document.querySelectorAll('.gs-item').forEach(refreshItem);
    maybeRevealDeck();
  }

  // The XIII deck card stays hidden until every other shelf item is owned.
  // Reveal toggles a class; CSS handles the blacklight pulse + full-row span.
  function maybeRevealDeck() {
    const deck = document.querySelector('.gs-item-deck');
    if (!deck) return;
    const owned = new Set(readState().owned);
    let allPriorOwned = true;
    document.querySelectorAll('.gs-item').forEach((item) => {
      if (item === deck) return;
      if (!owned.has(item.dataset.id)) allPriorOwned = false;
    });
    deck.classList.toggle('is-revealed', allPriorOwned);
  }

  function buy(item) {
    const id = item.dataset.id;
    const cost = parseInt(item.dataset.cost, 10) || 0;
    const href = item.dataset.href;
    if (!id || !href) return;
    if (isOwned(id)) {
      window.location.href = href;
      return;
    }
    if (isLocked(item)) {
      showToast('Items unlock in order.');
      return;
    }
    if (!window.Wallet || !Wallet.spend(cost)) {
      showToast('Not enough coins.');
      return;
    }
    markOwned(id, cost);
    refreshItem(item);
    setTimeout(() => { window.location.href = href; }, 350);
  }

  recomputeBonusFromDOM();

  document.querySelectorAll('.gs-item').forEach((item) => {
    const btn = item.querySelector('.gs-buy');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isOwned(item.dataset.id)) {
          window.location.href = item.dataset.href;
        } else {
          buy(item);
        }
      });
    }
  });

  refreshAll();
  if (window.Wallet && Wallet.onChange) {
    Wallet.onChange(refreshAll);
  }
})();
