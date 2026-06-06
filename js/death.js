/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DEATH  —  end-screen for the dead state; bless/curse fork + forget link │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load                                                              │
  │      │                                                                   │
  │      ├─ read()  ──► state from localStorage['wendys_palace_death']       │
  │      ├─ if !state.dead ──► location.replace('../index.html')  (bail)     │
  │      │                                                                   │
  │      └─ branch on state.choice:                                          │
  │           ├─ 'bless'      ──► show(blessMsg)                             │
  │           ├─ 'curse'      ──► show(curseMsg)                             │
  │           └─ (undecided)  ──► bind  #dead-bless ─► set choice, write(),  │
  │                                                   show(blessMsg)         │
  │                              bind  #dead-curse ─► set choice, write(),  │
  │                                                   show(curseMsg)         │
  │                                                                          │
  │   show(msg) ──► hides #dead-prompt, injects <p class="dead-message">     │
  │                 with embedded FORGET.html anchor (forget-link)           │
  │                                                                          │
  │   Storage:  localStorage['wendys_palace_death'] = { dead, choice }       │
  │                                                                          │
  │   Exports: none (page-scoped IIFE)                                       │
  │   External deps: DOM (#dead-prompt, #dead-actions, #dead-bless,          │
  │                  #dead-curse), navigates to FORGET.html / index.html     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_death'; FORGET_LINK='<a href="FORGET.html" class="forget-link">forget</a>'
  read()→obj: try JSON.parse(localStorage[KEY]||'{}'); catch→{}
  write(s): try localStorage[KEY]=JSON.stringify(s); catch noop
  state=read; !state.dead→location.replace('../index.html')+ret
  promptEl=#dead-prompt; actionsEl=#dead-actions
  show(msg): promptEl.hide; actionsEl.html='<p class="dead-message">'+msg+'</p>'
  blessMsg/curseMsg: noble/tragic end text w/ embedded FORGET_LINK
  branch: state.choice==='bless'→show(blessMsg); ==='curse'→show(curseMsg); else bind #dead-bless/curse onclick→set choice, write, show(msg)
  exports: none (page IIFE)
*/

(function () {
  var STORAGE_KEY = 'wendys_palace_death';
  var FORGET_LINK = '<a href="FORGET.html" class="forget-link">forget</a>';

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function write(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    catch (e) {}
  }

  var state = read();
  if (!state.dead) {
    location.replace('../index.html');
    return;
  }

  var promptEl = document.getElementById('dead-prompt');
  var actionsEl = document.getElementById('dead-actions');

  function show(msg) {
    promptEl.style.display = 'none';
    actionsEl.innerHTML = '<p class="dead-message">' + msg + '</p>';
  }

  var blessMsg = 'A noble end to a tragic life.\n\nIf there was only a way to ' + FORGET_LINK + ' it all happened...';
  var curseMsg = 'A tragic end to a tragic life.\n\nIf there was only a way to ' + FORGET_LINK + ' all this happened...';

  if (state.choice === 'bless') {
    show(blessMsg);
  } else if (state.choice === 'curse') {
    show(curseMsg);
  } else {
    document.getElementById('dead-bless').onclick = function () {
      state.choice = 'bless';
      write(state);
      show(blessMsg);
    };
    document.getElementById('dead-curse').onclick = function () {
      state.choice = 'curse';
      write(state);
      show(curseMsg);
    };
  }
})();
