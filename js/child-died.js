/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CHILD-DIED  —  method-of-death picker, writes record, jumps to death    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE runs immediately on script load (no DOMContentLoaded wrapper —    │
  │   script is expected to load after .actions buttons exist).              │
  │                                                                          │
  │   Bind phase:                                                            │
  │     querySelectorAll('.actions button').forEach ──►                      │
  │       click ──► commit(btn.dataset.method)                               │
  │                                                                          │
  │   commit(method) ──► void (navigates away)                               │
  │     ├─ read   localStorage 'wendys_palace_death' (JSON, default {})      │
  │     ├─ mutate d.dead=true, d.method=method, d.choice=null                │
  │     ├─ write  localStorage 'wendys_palace_death'                         │
  │     └─ location.replace('death.html')                                    │
  │                                                                          │
  │   Exports: none (no global assignment)                                   │
  │   External deps: localStorage, location, DOM (.actions button[data-     │
  │                  method])                                                │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  commit(method): try{ d=JSON.parse(localStorage['wendys_palace_death']||'{}'); d.dead=T; d.method=method; d.choice=null; localStorage['wendys_palace_death']=JSON.stringify(d) }catch{}; location.replace('death.html')
  bind: $$('.actions button').∀btn→click→commit(btn.dataset.method)
  exports: none
  no DOMContentLoaded wrapper; runs at script load (script loads after buttons exist)
*/

(function () {
  function commit(method) {
    try {
      var d = JSON.parse(localStorage.getItem('wendys_palace_death') || '{}');
      d.dead = true;
      d.method = method;
      d.choice = null;
      localStorage.setItem('wendys_palace_death', JSON.stringify(d));
    } catch (e) {}
    location.replace('death.html');
  }
  document.querySelectorAll('.actions button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      commit(btn.dataset.method);
    });
  });
})();
