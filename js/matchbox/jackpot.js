/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX JACKPOT — El Premio Gordo: progressive pot grown by spins,    │
  │                     paid out on a 7+ match-3 blob clear.                 │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Contributions (slot.js): every spin adds ceil(balance × 0.01) to the   │
  │   pot. Doesn't deduct from the wallet — pot grows from the player's      │
  │   current wealth as a function. Richer player ⇒ faster-growing pot.      │
  │                                                                          │
  │   Trigger (matcher.js): any single blob of length ≥ 7 (TRIGGER_BLOB)     │
  │   clears the pot — player wins the full accumulated amount on top of    │
  │   the normal blob payout. Pot resets to 0. Persists across sessions     │
  │   via localStorage[wendys_palace_matchbox_jackpot].                      │
  │                                                                          │
  │   Display: scripts dump $amount into #jackpot-amount on every change.    │
  │                                                                          │
  │   Exports (window.MatchboxJackpot):                                      │
  │     { get(), add(n), claim()→won, onChange(fn), TRIGGER_BLOB }           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_matchbox_jackpot'; TRIGGER_BLOB=7
  state: amount=loadAmount(), listeners=[]
  loadAmount()→int: try parseInt(localStorage[KEY])||0; else 0
  persist(): try localStorage[KEY]=String(amount); silent fail
  notify(): ∀fn∈listeners→fn(amount); renderUI()
  renderUI(): #jackpot-amount.text='$'+amount.toLocaleString()
  get()→int: amount
  add(n): guard !finite||n<=0; amount+=floor(n); persist; notify
  claim()→won: won=amount; amount=0; persist; notify; ret won
  onChange(fn): listeners.push(fn) if fn==='function'
  init(): renderUI on DOMContentLoaded
  exports: global.MatchboxJackpot={get,add,claim,onChange,TRIGGER_BLOB}
*/
(function (global) {
  const STORAGE_KEY = 'wendys_palace_matchbox_jackpot';
  const TRIGGER_BLOB = 7;

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
    const el = document.getElementById('jackpot-amount');
    if (el) el.textContent = '$' + amount.toLocaleString();
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

  global.MatchboxJackpot = { get, add, claim, onChange, TRIGGER_BLOB };
  document.addEventListener('DOMContentLoaded', init);
})(window);
