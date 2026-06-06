/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT · TOAST — per-event pop-ups for every Hold'em boss page       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   boot() ──► observe(#bf-log-scroll, childList)                          │
  │                 └─ on added .bf-log-entry ──► spawnToast(entry)          │
  │                                                  ├─ mirror classes       │
  │                                                  ├─ mirror innerHTML     │
  │                                                  └─ auto-remove(dur)     │
  │                                                                          │
  │   Non-invasive: piggybacks on the play log that the shared page.js       │
  │   already populates via logHand / logAction / logStreet / logResult,     │
  │   so the toast feature works on every boss page without modifying        │
  │   holdem.js / ai.js / page.js.  Drop this script tag into a boss         │
  │   page and toasts start firing.                                          │
  │                                                                          │
  │   Exports (window.BFToast): { boot } (idempotent)                        │
  │   External deps: DOM #bf-log-scroll (provided by every boss page),       │
  │                  CSS .bf-toast / .bf-toast-stack (in holdem.css)         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  guard window.__bfToastBooted→ret
  boot(): scroll=#bf-log-scroll; guard !scroll; guard $('.bf-toast-stack');
          stack=div.bf-toast-stack; body.append(stack);
          MO observe(scroll,{childList:T}) ∀ added node →
            node∈Element && hasClass('bf-log-entry') → spawnToast(node)
  spawnToast(src)→: t=div.bf-toast; ∀ c∈['is-hand','is-street','is-action',
            'is-player','is-opp','is-result','is-loss','is-split']
              src.has(c)→t.add(c);
            t.html=src.html;
            dur = src.has('is-result')?3200 : src.has('is-hand')?2400
                : src.has('is-street')?2400 : 2000;
            t.style[--bf-toast-dur]=dur+'ms'; stack.append(t);
            setTimeout(t.remove, dur)
  on DOMContentLoaded → boot();  immediate boot if readyState !== 'loading'
  exports: window.BFToast={boot}
*/
(function (global) {
  if (global.__bfToastBooted) return;
  global.__bfToastBooted = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    var scroll = document.getElementById('bf-log-scroll');
    if (!scroll) return;
    if (document.querySelector('.bf-toast-stack')) return;

    var stack = document.createElement('div');
    stack.className = 'bf-toast-stack';
    stack.setAttribute('aria-hidden', 'true');
    document.body.appendChild(stack);

    var CARRY = ['is-hand', 'is-street', 'is-action', 'is-player', 'is-opp',
                 'is-result', 'is-loss', 'is-split'];

    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (!node.classList || !node.classList.contains('bf-log-entry')) return;
          spawnToast(node, stack, CARRY);
        });
      });
    }).observe(scroll, { childList: true });
  }

  function spawnToast(src, stack, CARRY) {
    // Only mirror hand-end RESULT log entries as toasts. Action / street /
    // hand-header lines now live only in the log on the right; they used
    // to pop center-screen and were drowning out the actual table state.
    if (!src.classList.contains('is-result')) return;
    var t = document.createElement('div');
    t.className = 'bf-toast';
    CARRY.forEach(function (c) {
      if (src.classList.contains(c)) t.classList.add(c);
    });
    t.innerHTML = src.innerHTML;
    var dur = 6400;
    t.style.setProperty('--bf-toast-dur', dur + 'ms');
    stack.appendChild(t);

    // Click-to-dismiss — adds a fade class, then removes after the
    // CSS transition completes. Auto-removal still fires at dur; the
    // remove() call is idempotent (no-op if already detached).
    var killTimer = setTimeout(function () { t.remove(); }, dur);
    t.addEventListener('click', function () {
      clearTimeout(killTimer);
      t.classList.add('is-dismissing');
      setTimeout(function () { t.remove(); }, 240);
    });
  }

  global.BFToast = { boot: boot };
})(window);
