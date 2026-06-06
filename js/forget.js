/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FORGET  —  confession-gated wipe of all game state; returns to splash   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► bind DOM:                                                │
  │      │                                                                   │
  │      ├─ #forget-yes click ──► validateRegret()                           │
  │      │     │   (text from #forget-regret textarea, trimmed)              │
  │      │     ├─ if empty ──► setWarning('...', 'error') + focus            │
  │      │     ├─ appendRegret(text) ──► push {timestamp,text} into          │
  │      │     │     localStorage['wendys_palace_regrets'][]                 │
  │      │     ├─ KEYS.forEach ──► localStorage.removeItem(k)  (wipe all)    │
  │      │     ├─ hide #forget-form, show "It is done." in #forget-message   │
  │      │     └─ setTimeout 3200ms ──► location.replace('splash.html')      │
  │      │                                                                   │
  │      └─ #forget-no  click ──► history.back() OR death.html               │
  │                                                                          │
  │   setWarning(text, cls) ──► toggles .forget-warning-error on warning el  │
  │                                                                          │
  │   Wiped keys: wendys_palace_intro_seen, _death, _child, _expenses,       │
  │               sinnerbox                                                  │
  │   Preserved:  wendys_palace_regrets (the confession ledger),             │
  │               wendys_palace_sinnerbox_jackpot, _pp_jackpot,              │
  │               _matchbox_jackpot (pots accrue across deaths)              │
  │                                                                          │
  │   Exports: none (page-scoped IIFE)                                       │
  │   External deps: DOM (#forget-form, #forget-actions, #forget-warning,    │
  │                  #forget-message, #forget-regret, #forget-yes/no)        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  KEYS=['wendys_palace_intro_seen','_death','_child','_expenses','sinnerbox'] (jackpots _sinnerbox_jackpot/_pp_jackpot/_matchbox_jackpot intentionally preserved — pots accrue across deaths)
  REGRETS_KEY='wendys_palace_regrets' (preserved across wipe; future dynamodb migration target, keep {timestamp,text} shape)
  appendRegret(text): try arr=JSON.parse(localStorage[REGRETS_KEY]||'[]'); !Array→[]; push{timestamp:now,text}; write; catch noop
  els: formEl,actionsEl,warningEl,messageEl,textareaEl,yesBtn,noBtn
  setWarning(text,cls): warningEl.text=text; toggle .forget-warning-error if cls==='error'
  yesBtn click: text=textareaEl.value.trim; !text→setWarning(err)+focus+ret; appendRegret(text); ∀k∈KEYS→localStorage.removeItem(k) (try/catch); formEl.hide; messageEl.text='It is done.\n\nYou will not remember this.'; setTimeout(location.replace('splash.html'),3200)
  noBtn click: history.len>1?history.back:location.replace('death.html')
  exports: none (page IIFE)
*/

(function () {
  // localStorage keys to wipe on confession. Jackpot pots
  // (wendys_palace_sinnerbox_jackpot, _pp_jackpot, _matchbox_jackpot) are
  // intentionally NOT wiped — they accrue across deaths so a new player
  // inherits the Palace's accumulated greed.
  var KEYS = [
    'wendys_palace_intro_seen',
    'wendys_palace_death',
    'wendys_palace_child',
    'wendys_palace_expenses',
    'sinnerbox'
  ];

  // Where regrets live until they get wired into dynamodb+lambda. Keep the
  // shape ({ timestamp, text }) so the migration is just a transport swap.
  var REGRETS_KEY = 'wendys_palace_regrets';

  function appendRegret(text) {
    try {
      var raw = localStorage.getItem(REGRETS_KEY) || '[]';
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
      arr.push({ timestamp: Date.now(), text: text });
      localStorage.setItem(REGRETS_KEY, JSON.stringify(arr));
    } catch (e) {
      // private mode / quota: fall through and still let them forget
    }
  }

  var formEl = document.getElementById('forget-form');
  var actionsEl = document.getElementById('forget-actions');
  var warningEl = document.getElementById('forget-warning');
  var messageEl = document.getElementById('forget-message');
  var textareaEl = document.getElementById('forget-regret');
  var yesBtn = document.getElementById('forget-yes');
  var noBtn = document.getElementById('forget-no');

  function setWarning(text, cls) {
    if (!warningEl) return;
    warningEl.textContent = text;
    warningEl.classList.toggle('forget-warning-error', cls === 'error');
  }

  yesBtn.addEventListener('click', function () {
    var text = (textareaEl.value || '').trim();
    if (!text) {
      setWarning('You have to name a regret before you can be free of it.', 'error');
      textareaEl.focus();
      return;
    }
    appendRegret(text);
    KEYS.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    if (formEl) formEl.style.display = 'none';
    messageEl.textContent = 'It is done.\n\nYou will not remember this.';
    setTimeout(function () { location.replace('splash.html'); }, 3200);
  });

  noBtn.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else location.replace('death.html');
  });
})();
