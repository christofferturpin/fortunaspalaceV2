/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  EXPENSES  —  passive hourly rent that drains the Wallet in the background│
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► init() ──► settleElapsed() ─► (if billed) showBanner()   │
  │                  │                                                       │
  │                  └─ setInterval(settleElapsed, 60s)  (idle polling)      │
  │                                                                          │
  │   settleElapsed()                                                        │
  │      │                                                                   │
  │      ├─ reads state.lastBilledAt from localStorage                       │
  │      ├─ hoursDue = floor(elapsed / HOUR_MS)                              │
  │      ├─ Wallet.getBalance() / Wallet.spend(min(billed, balance))         │
  │      └─► returns { billed, spent }                                       │
  │                                                                          │
  │   showBanner(billed, spent) ──► injects .expense-banner into <body>      │
  │                                  auto-dismisses after ~10s               │
  │                                                                          │
  │   Storage:  localStorage['wendys_palace_expenses'] = { lastBilledAt }    │
  │   Constants: HOUR_MS = 3600000, COST_PER_HOUR = 2                        │
  │                                                                          │
  │   Exports (window.Expenses):                                             │
  │     settle()           ──► { billed, spent }                             │
  │     getLastBilledAt()  ──► ms timestamp                                  │
  │     HOUR_MS, COST_PER_HOUR  (constants used by header.js for bill timer) │
  │                                                                          │
  │   External deps: window.Wallet (getBalance, spend)                       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_expenses'; HOUR_MS=3600000; COST_PER_HOUR=2
  state: state={lastBilledAt:num} from localStorage[STORAGE_KEY] || {now}
  readStorage()→obj|null: try JSON.parse(localStorage[KEY]); catch→null
  writeStorage(s): try localStorage[KEY]=JSON.stringify(s); catch noop
  settleElapsed()→{billed,spent}: guard(!Wallet); elapsed=now-lastBilledAt; elapsed<HOUR_MS→{0,0}; hoursDue=⌊elapsed/HOUR_MS⌋; billed=hoursDue*COST; spent=min(billed,Wallet.bal); spent>0→Wallet.spend(spent); lastBilledAt+=hoursDue*HOUR_MS; write; ret{billed,spent}
  showBanner(billed,spent): guard(!billed); build .expense-banner w/ title+body(spent coins, shortfall if spent<billed)+dismiss×; append body; dismiss click→fade+rm@600ms; auto fade@9s, rm@10s
  init(): r=settleElapsed; r.billed>0→showBanner (defer if loading); setInterval(settle,60s)
  exports: global.Expenses={settle,getLastBilledAt,HOUR_MS,COST_PER_HOUR}; init() called inline
*/

(function (global) {
  const STORAGE_KEY = 'wendys_palace_expenses';
  const HOUR_MS = 60 * 60 * 1000;
  const COST_PER_HOUR = 2;

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function writeStorage(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  let state = readStorage() || {};
  if (typeof state.lastBilledAt !== 'number') {
    state.lastBilledAt = Date.now();
    writeStorage(state);
  }

  function settleElapsed() {
    if (!global.Wallet) return { billed: 0, spent: 0 };
    const now = Date.now();
    const elapsed = now - state.lastBilledAt;
    if (elapsed < HOUR_MS) return { billed: 0, spent: 0 };
    const hoursDue = Math.floor(elapsed / HOUR_MS);
    const billed = hoursDue * COST_PER_HOUR;
    const balance = Wallet.getBalance();
    const spent = Math.min(billed, balance);
    if (spent > 0) Wallet.spend(spent);
    state.lastBilledAt += hoursDue * HOUR_MS;
    writeStorage(state);
    return { billed, spent };
  }

  function showBanner(billed, spent) {
    if (!billed) return;
    const banner = document.createElement('div');
    banner.className = 'expense-banner';
    let body = 'You spent <strong>' + spent + '</strong> coin' +
      (spent === 1 ? '' : 's') + ' on Living Expenses.';
    if (spent < billed) {
      body += ' <span class="expense-banner-shortfall">(' + (billed - spent) +
        ' unpaid — your pockets were empty.)</span>';
    }
    banner.innerHTML =
      '<div class="expense-banner-title">While you were gone</div>' +
      '<div class="expense-banner-body">' + body + '</div>' +
      '<button class="expense-banner-dismiss" aria-label="Dismiss">×</button>';
    document.body.appendChild(banner);
    banner.querySelector('.expense-banner-dismiss').addEventListener('click', () => {
      banner.classList.add('expense-banner-fading');
      setTimeout(() => banner.remove(), 600);
    });
    setTimeout(() => {
      if (banner.parentNode) banner.classList.add('expense-banner-fading');
    }, 9000);
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
    }, 10000);
  }

  function init() {
    const result = settleElapsed();
    if (result.billed > 0) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => showBanner(result.billed, result.spent));
      } else {
        showBanner(result.billed, result.spent);
      }
    }
    setInterval(settleElapsed, 60 * 1000);
  }

  init();

  global.Expenses = {
    settle: settleElapsed,
    getLastBilledAt() { return state.lastBilledAt; },
    HOUR_MS,
    COST_PER_HOUR,
  };
})(window);
