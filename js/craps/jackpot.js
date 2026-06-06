/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRAPS JACKPOT — persistent pot fed by losses, claimed on triple 1s or   │
  │                  triple 6s (regardless of the round's bet outcome).      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Contributions (page.js): every top-miss adds ceil(balance × 0.01),     │
  │   minimum 1 coin. Independent of wager — the more wealth on hand, the    │
  │   bigger the feed. Doesn't deduct from the wallet (pot grows AS a        │
  │   function of wealth, not OUT OF it).                                    │
  │                                                                          │
  │   Trigger (page.js): dice [1,1,1] or [6,6,6] drains the pot to wallet.   │
  │   Fires even if the player's top bet missed — it's a parallel payout     │
  │   layered on top of the normal roll resolution. Pot resets to 0 on       │
  │   claim. Persists across sessions / deaths via                           │
  │   localStorage[wendys_palace_craps_jackpot].                             │
  │                                                                          │
  │   Display: scripts dump amount into #cp-jackpot-amount on every change.  │
  │                                                                          │
  │   Exports (window.CrapsJackpot):                                         │
  │     { get(), add(n), claim()→won, onChange(fn), TRIGGER_FACES }          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_craps_jackpot'; TRIGGER_FACES=[1,6]
  state: amount=loadAmount(), listeners=[]
  loadAmount()→int: try parseInt(localStorage[KEY])||0; finite&&≥0?v:0
  persist(): try localStorage[KEY]=String(amount); silent fail
  notify(): ∀fn∈listeners→fn(amount); renderUI()
  renderUI(): #cp-jackpot-amount.text=amount.toLocaleString()
  get()→int: amount
  add(n): guard !finite||n<=0; amount+=floor(n); persist; notify
  claim()→won: won=amount; amount=0; persist; notify; ret won
  onChange(fn): listeners.push(fn) if typeof==='function'
  init(): renderUI on DOMContentLoaded
  exports: global.CrapsJackpot={get,add,claim,onChange,TRIGGER_FACES}
*/
(function (global) {
  const STORAGE_KEY = 'wendys_palace_craps_jackpot';
  const TRIGGER_FACES = [1, 6];

  let amount = loadAmount();
  const listeners = [];

  function loadAmount() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (e) { return 0; }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, String(amount)); }
    catch (e) { /* quota / unavailable — silent */ }
  }

  function renderUI() {
    const el = document.getElementById('cp-jackpot-amount');
    if (el) el.textContent = amount.toLocaleString();
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(amount); } catch (e) { /* listener errors don't propagate */ }
    });
    renderUI();
  }

  function get() { return amount; }

  function add(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    amount += Math.floor(n);
    persist();
    notify();
  }

  function claim() {
    const won = amount;
    amount = 0;
    persist();
    notify();
    return won;
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function init() { renderUI(); }

  global.CrapsJackpot = { get, add, claim, onChange, TRIGGER_FACES };
  document.addEventListener('DOMContentLoaded', init);
})(window);
