/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  LETTERS  —  trigger-gated narrative paper overlay (welfare visit, etc.) │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load ──► (DOMContentLoaded or immediate) ──► init()               │
  │                                                                          │
  │   init()                                                                 │
  │     │                                                                    │
  │     └─ loadLetters() ──► fetch('../assets/json/letters.json')            │
  │            │                  .catch(() => INLINE)                       │
  │            ▼                                                             │
  │         data.letters[] ──► findEligibleLetter(letters)                   │
  │            │                  │                                          │
  │            │                  ├─ readSeen() ──► id[] from localStorage   │
  │            │                  └─ triggerMet(letter)                      │
  │            │                       ├─ 'lifetimeEarned' :                 │
  │            │                       │    Wallet.getLifetimeEarned() ≥ min │
  │            │                       └─ 'bossBeaten' :                     │
  │            │                            wendys_palace_bosses_beaten      │
  │            │                            includes boss name               │
  │            │                                                             │
  │            └─ if eligible ──► setTimeout 800ms ──►                       │
  │                  document.body.appendChild(buildOverlay(letter))         │
  │                                                                          │
  │   buildOverlay(letter) ──► <div.letter-overlay.is-open>                  │
  │      contains .letter-preface, "Read it." button                         │
  │      click ──► showLetter(overlay, stage, letter)                        │
  │                  │                                                       │
  │                  ├─ renders .letter-paper with letter.body               │
  │                  ├─ markSeen(letter.id) ──► append id to localStorage    │
  │                  └─ "Set it down." closeBtn ──►                          │
  │                       remove overlay after 320ms,                        │
  │                       then dispatchOnClose(letter.onClose)               │
  │                                                                          │
  │   dispatchOnClose(spec):                                                 │
  │     spec.type === 'bossfight' → location.assign(spec.page)               │
  │     spec.type === 'navigate'  → location.assign(spec.page)               │
  │     undefined → no-op                                                    │
  │                                                                          │
  │   Storage:  localStorage['wendys_palace_letters_seen'] = id[]            │
  │   Inline fallback: INLINE.letters[] (note_001_welfare_visit, ...)        │
  │                                                                          │
  │   Imperative API:                                                        │
  │     window.Letters.dispatch(id) ──► Promise<bool>                        │
  │       finds letter by id (skips trigger check) and shows the overlay.    │
  │       Used by the boss-fight page on win to summon note_002.             │
  │                                                                          │
  │   Exports: window.Letters = { dispatch }                                 │
  │   External deps: window.Wallet.getLifetimeEarned (for trigger gating),   │
  │                  fetch() of ../assets/json/letters.json (http only)      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SEEN_KEY='wendys_palace_letters_seen'; JSON_PATH='../assets/json/letters.json'
  INLINE={letters:[note_001_welfare_visit{trigger:lifetimeEarned≥500,onClose:bossfight chavez},note_002_chavez_dismissed{trigger:bossBeaten chavez,onClose:navigate index.html}]} (file:// fallback)
  readSeen()→id[]: try JSON.parse(localStorage[SEEN_KEY])||[]; Array?ret:[]; catch→[]
  markSeen(id): seen=readSeen; seen.includes(id)→ret; seen.push(id); try write; catch noop
  triggerMet(letter)→bool: t=letter.trigger||{}; 'lifetimeEarned'→Wallet.getLifetimeEarned?.()≥t.min||0; 'bossBeaten'→localStorage[wendys_palace_bosses_beaten].includes(t.boss); else F
  findEligibleLetter(letters)→letter|null: seen=readSeen; ∀letter{guard(!id||seen.includes(id)); triggerMet→ret letter}; ret null
  showLetter(overlay,stage,letter): stage.html=''; build .letter-paper>.letter-paper-body(text=letter.body); append; closeBtn '.letter-action.letter-close' text='Set it down.'; markSeen(id); close click→overlay.rm('is-open')+setTimeout(overlay.rm,320)+dispatchOnClose(letter.onClose)
  dispatchOnClose(spec): spec?.type∈{'bossfight','navigate'} && spec.page→location.assign(spec.page); else noop
  buildOverlay(letter)→el: overlay=.letter-overlay.is-open[role=dialog,aria-modal]; stage=.letter-stage; preface=.letter-preface(letter.preface); openBtn '.letter-action' text='Read it.'; open click→showLetter(overlay,stage,letter); ret overlay
  loadLetters()→Promise: fetch(JSON_PATH)→r.ok?json:reject; catch→INLINE
  init(): loadLetters.then(data=>{letters=data.letters||[]; eligible=findEligibleLetter; !eligible→ret; setTimeout(body.append(buildOverlay(eligible)),800)})
  dispatch(id)→Promise<bool>: loadLetters.then(letters→find by id→body.append(buildOverlay) ret T; not found→F)
  bootstrap: readyState==='loading'?addEventListener('DOMContentLoaded',init):init()
  exports: global.Letters={dispatch}
*/

(function (global) {
  const SEEN_KEY = 'wendys_palace_letters_seen';
  const JSON_PATH = '../assets/json/letters.json';

  // Mirror of assets/json/letters.json. The runtime can't fetch over file://,
  // so this inline copy is the fallback used when the page is opened directly
  // from disk. Edit the JSON for clarity; keep this array in sync, or serve
  // the site over http and the fetch path becomes the source of truth.
  const INLINE = {
    letters: [
      {
        // First beat — just the letter. No boss fight. Drops at 500.
        id: 'note_001_welfare_visit',
        trigger: { type: 'lifetimeEarned', min: 500 },
        preface: 'There is a paper next to the Your Child.',
        body:
          'NOTICE OF WELFARE VISIT\n' +
          'Case file pending. Reference number to follow.\n\n' +
          'The minor identified as "Your Child" was observed unattended for the duration of the visit (approx. 18 minutes). Hunger reading: noted. Wellness reading: noted. No legal guardian present.\n\n' +
          'The premises were entered under authority of §4 (welfare). All entries are documented.\n\n' +
          'I waited.\n\n' +
          'The child watched me the whole time. They did not cry. I do not know what to do with that.\n\n' +
          'I know where you have been. I know what kind of money it is.\n\n' +
          'A follow-up will be scheduled.\n' +
          'Do not remove this notice.'
      },
      {
        // The boss-fight trigger. Threshold starts at 1000 lifetime and
        // walks the ladder via thresholdKey: 1k → 5k → 10k → 50k → 100k.
        // The welfare letter at 500 is the foreshadowing for this first
        // fight — no extra pre_fight_1 needed.
        id: 'note_002_chavez_invitation',
        trigger: { type: 'lifetimeEarned', min: 1000 },
        thresholdKey: 'wendys_palace_chavez_threshold',
        preface: 'A man stands by your door. He has been there a while.',
        body:
          'FOLLOW-UP NOTICE\n' +
          'Reference: prior case file.\n\n' +
          'Agent assigned: see signature below.\n\n' +
          'Please be advised the matter remains open. Per departmental procedure, the agent may request a private meeting in lieu of further home visits. The meeting shall consist of a single session and shall conclude when one party is no longer present.\n\n' +
          'Card play is permitted at the agent\'s discretion.\n\n' +
          'Decline and the file is escalated.\n\n' +
          '— (signature illegible)',
        // Closing the letter queues the chavez fight and routes to the
        // child page; child.html's load handler then fires BossIntro
        // into bossfight-chavez.html.
        onClose: { type: 'queueBoss', boss: 'chavez', page: 'child.html' }
      },
      {
        // Boss 2 invitation — Malechstone (the concerned neighbour).
        id: 'note_pre_fight_2',
        trigger: { type: 'lifetimeEarned', min: 3000 },
        preface: 'There is a black sedan parked across the street.',
        body:
          'It has been there since Tuesday.\n\n' +
          'The plates are obscured by what looks like deliberate damage. He has not gotten out.\n\n' +
          'When you wave he does not wave back. The engine has been running the whole time.',
        onClose: { type: 'queueBoss', boss: 'malechstone', page: 'child.html' }
      },
      {
        // Boss 3 invitation — Zashiki-Warashi (welfare officer in the rafters).
        id: 'note_pre_fight_3',
        trigger: { type: 'lifetimeEarned', min: 7500 },
        preface: 'A deck of cards on the porch.',
        body:
          'Sealed. But the wrapper is torn at the corner and the deck has already been cut.\n\n' +
          'Whoever shuffled it knew what they were doing.\n\n' +
          'You put it in the drawer with the others. There are others now.',
        onClose: { type: 'queueBoss', boss: 'zashiki-warashi', page: 'child.html' }
      },
      {
        // Boss 4 invitation — Nahual (shapeshifter).
        id: 'note_pre_fight_4',
        trigger: { type: 'lifetimeEarned', min: 30000 },
        preface: 'The phone rang at 3:14.',
        body:
          'When you picked up there was breathing.\n\n' +
          'He waited. Then he hung up.\n\n' +
          'The number was unlisted. The carrier has no record of the call. The child asked who it was. You said nobody.',
        onClose: { type: 'queueBoss', boss: 'nahual', page: 'child.html' }
      },
      {
        // Halfway-foreshadow for fight 5 — between 50000 and 100000.
        id: 'note_pre_fight_5',
        trigger: { type: 'lifetimeEarned', min: 75000 },
        preface: 'A chair pulled up to the kitchen table.',
        body:
          'You did not put it there.\n\n' +
          'The chair is still warm. Someone sat in it long enough for the wood to take their body heat.\n\n' +
          'The deck of cards is on the table in front of it. Shuffled. Cut. Waiting.'
      }
    ]
  };

  function dispatchOnClose(spec) {
    if (!spec) return;
    // queueBoss — sets wendys_palace_pending_boss = slug, then routes
    // to the child page. child.html's load handler consumes the key and
    // fires BossIntro.run() into the matching bossfight page. Lets the
    // letter close on any page (index, child, etc.) without needing
    // BossIntro itself loaded at the close-site.
    if (spec.type === 'queueBoss' && spec.boss) {
      try { localStorage.setItem('wendys_palace_pending_boss', spec.boss); } catch {}
      const page = spec.page || 'child.html';
      location.assign(page);
      return;
    }
    if (!spec.page) return;
    if (spec.type === 'bossfight' || spec.type === 'navigate') {
      // Same-folder navigation — letters are shown over pages/index.html, so
      // 'bossfight-chavez.html' resolves relative to /pages/.
      location.assign(spec.page);
    }
  }

  function readSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function markSeen(id) {
    const seen = readSeen();
    if (seen.includes(id)) return;
    seen.push(id);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // storage unavailable — letter will reappear next visit; acceptable
    }
  }

  function triggerMet(letter) {
    const t = letter.trigger || {};
    if (t.type === 'lifetimeEarned') {
      const earned = (global.Wallet && typeof global.Wallet.getLifetimeEarned === 'function')
        ? global.Wallet.getLifetimeEarned()
        : 0;
      let min = t.min || 0;
      // Letters that escalate (e.g. boss-fight notes) can declare a
      // thresholdKey — if localStorage[thresholdKey] is set, that value
      // overrides t.min. Lets gameplay bump the next-trigger floor
      // without mutating the static letter definition.
      if (letter.thresholdKey) {
        try {
          const dyn = parseInt(localStorage.getItem(letter.thresholdKey) || '0', 10);
          if (isFinite(dyn) && dyn > 0) min = dyn;
        } catch {}
      }
      return earned >= min;
    }
    if (t.type === 'bossBeaten') {
      let beaten = [];
      try { beaten = JSON.parse(localStorage.getItem('wendys_palace_bosses_beaten') || '[]'); } catch {}
      if (!Array.isArray(beaten)) beaten = [];
      return beaten.includes(t.boss);
    }
    return false;
  }

  function findEligibleLetter(letters) {
    const seen = readSeen();
    for (const letter of letters) {
      if (!letter || !letter.id) continue;
      if (seen.includes(letter.id)) continue;
      if (triggerMet(letter)) return letter;
    }
    return null;
  }

  function showLetter(overlay, stage, letter) {
    stage.innerHTML = '';

    const paper = document.createElement('div');
    paper.className = 'letter-paper';
    const body = document.createElement('div');
    body.className = 'letter-paper-body';
    body.textContent = letter.body || '';
    paper.appendChild(body);
    stage.appendChild(paper);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'letter-action letter-close';
    closeBtn.textContent = 'Set it down.';
    stage.appendChild(closeBtn);

    markSeen(letter.id);

    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('is-open');
      setTimeout(function () { overlay.remove(); }, 320);
      dispatchOnClose(letter.onClose);
    });
  }

  function buildOverlay(letter) {
    const overlay = document.createElement('div');
    overlay.className = 'letter-overlay is-open';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const stage = document.createElement('div');
    stage.className = 'letter-stage';
    overlay.appendChild(stage);

    const preface = document.createElement('div');
    preface.className = 'letter-preface';
    preface.textContent = letter.preface || '';
    stage.appendChild(preface);

    const openBtn = document.createElement('button');
    openBtn.className = 'letter-action';
    openBtn.textContent = 'Read it.';
    stage.appendChild(openBtn);

    openBtn.addEventListener('click', function () {
      showLetter(overlay, stage, letter);
    });

    return overlay;
  }

  function loadLetters() {
    return fetch(JSON_PATH)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .catch(function () { return INLINE; });
  }

  function init() {
    loadLetters().then(function (data) {
      const letters = (data && Array.isArray(data.letters)) ? data.letters : [];
      const eligible = findEligibleLetter(letters);
      if (!eligible) return;
      // Let the room settle before the player notices the paper.
      setTimeout(function () {
        document.body.appendChild(buildOverlay(eligible));
      }, 800);
    });
  }

  function dispatch(id) {
    return loadLetters().then(function (data) {
      const letters = (data && Array.isArray(data.letters)) ? data.letters : [];
      const letter = letters.find(function (l) { return l && l.id === id; });
      if (!letter) return false;
      document.body.appendChild(buildOverlay(letter));
      return true;
    });
  }

  global.Letters = { dispatch: dispatch };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
