/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  VALLEY-NET BBS  —  in-cabinet CRT terminal with command-driven threads  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded / readyState ──► init()                               │
  │                                       │                                  │
  │                                       ├─ inject BBS DOM into #op-slot-   │
  │                                       │   right (dormant state markup)   │
  │                                       ├─ bind slotEl click ──► connect() │
  │                                       │   or refocus input               │
  │                                       └─ bind inputEl keydown(Enter) ──► │
  │                                           processCommand(value)          │
  │                                                                          │
  │   connect() ──► staggered setTimeout boot sequence ──► append(line)      │
  │                  ──► showList()                                          │
  │                                                                          │
  │   processCommand(raw)                                                    │
  │     ├─ 'q'/'quit'/'exit' ──► disconnect()                                │
  │     ├─ 'h'/'help'/'?'    ──► showHelp()                                  │
  │     ├─ 'l'/'list'/'ls'   ──► showList()                                  │
  │     └─ 1..N              ──► showThread(idx)                             │
  │                                                                          │
  │   Output helpers: append(line), appendRaw(text), clear(), scrollBottom() │
  │   Lifecycle: cancelBootTimers() clears pending boot setTimeouts          │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: DOM only (#op-slot-right); no window globals consumed   │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  THREADS=[3 topics; each {title, posts:[{author,date,re?,body}]}] (scanner/tick/paper)
  RULE='═'×39
  state: outEl, inputEl, slotEl, bbsEl; active=F, booting=F, view='dormant'|'list'|'thread', bootTimers=[]
  append(line): outEl.text+=line+'\n'; scrollBottom
  appendRaw(text): outEl.text+=text; scrollBottom
  clear(): outEl.text=''
  scrollBottom(): outEl.scrollTop=outEl.scrollHeight
  connect(): guard(active||booting); booting=T; bbsEl.dataset.state='active'; clear; boot=[[d,line]×9 dial→connect→banner]; cancelBootTimers; ∀line setTimeout(append,acc); final timer→booting=F,active=T,showList,inputEl.focus
  disconnect(): cancelBootTimers; append('NO CARRIER'); active=F,booting=F; setTimeout 1400→state='dormant',clear,view='dormant'
  cancelBootTimers(): ∀t clearTimeout; bootTimers=[]
  showList(): view='list'; append RULE+'TOPICS'+RULE; ∀t,i append `[i+1] title` + `  author · N posts · last date`; append nav hint
  showThread(idx): t=THREADS[idx]; !t→'?? no such topic'; view='thread'; append RULE+`[idx+1] title`+RULE; ∀p re='RE: '|'RE: RE: '|''; append '> '+re+author+' · '+date+'\n\n'+body; append nav
  showHelp(): list of commands (1-N read, L list, H/? help, Q quit)
  processCommand(raw): cmd=raw.trim; append 'valley-net> '+cmd; guard(!cmd); c=cmd.lower; q/quit/exit/logoff/bye→disconnect; h/help/?→showHelp; l/list/ls→showList; parseInt 1..N→showThread(n-1); else '?? unknown'
  init(): slotEl=#op-slot-right; inject .op-bbs (dormant overlay + active pre+input); cache bbsEl/outEl/inputEl; slotEl click→(active||booting? input.focus : connect); inputEl keydown stopProp + Enter→processCommand(value), value=''
  exports: none (IIFE-local); on DOMContentLoaded||readyState→init
*/

// ============================================================================
// VALLEY-NET BBS — Rhea County local BBS terminal that lives inside the
// right-hand "LUCKY 7" cabinet's CRT in the Baby Highway arcade. Click the
// dead screen to dial in; type commands at the prompt to read threads.
// ============================================================================
(function () {
  // ---- Thread data -----------------------------------------------------
  // Posts are listed oldest-first per topic (the order they appeared on the
  // board). `re` indicates a reply depth so the rendered header can prefix
  // RE: / RE: RE: like a real 90s/00s message board.
  const THREADS = [
    {
      title: 'anybody else hear that on the scaner',
      posts: [
        {
          author: 'Bandida_Manco', date: '04/19/04 — 22:14',
          body: "SOMETHING GOIN ON OUT TOWARD DAYTON OFF 30. HEARD THE CALL GO OUT ABOUT 6:15. DIDNT SOUND RIGHT. THEY HAD THE SUPERVISER ON SCENE WHICH THEY DONT USUALY DO FOR A DOMESTIC. ANYBODY GOT BETTER EARS THAN ME"
        },
        {
          author: 'SCANNERMAN', date: '04/19/04 — 22:47', re: 1,
          body: "i had it. they called the coroner about ten minutes after the deputy got there so it. said it was a domestic?"
        },
        {
          author: 'Bandida_Manco', date: '04/20/04 — 06:02', re: 2,
          body: "I KNOW THE FAMILY. OR I KNOW OF EM. WENT TO SCHOOL WITH HIS SISTER SAMMY A LONG TIME AGO. SHES A GOOD ONE. THEY GOT A LITTLE GIRL, I DONT KNOW HOW OLD, SEVEN OR EIGHT MAYBE. LORD. THATS ALL IM GONNA SAY ABOUT IT"
        },
      ],
    },
    {
      title: 'huge dang tick -- draino question',
      posts: [
        {
          author: 'BIG_RON_4WD', date: '04/20/04 — 09:33',
          body: "pulled one off my beagle yesterday size of a grape i swear to god. head still in there. my uncle says put a drop of draino on the spot and it'll bring the head up. anybody actually done this or is he pulling my leg. i don't want to put draino on my dog if it's gonna take the hair off but he swears by it. dog is fine other than the bite is redish blue. uncle is 78"
        },
      ],
    },
    {
      title: 'paper finally ran something',
      posts: [
        {
          author: 'TVAMAN', date: '04/22/04 — 19:08',
          body: "herald-news got it on page 3 today. didn't name him but everybody knows. killed his wife with a hamer. volunteer fire guy says it was a lot. i'm not gonna repeat the number. it ain't right to put a number on a person"
        },
        {
          author: 'SCANNERMAN', date: '04/22/04 — 20:41', re: 1,
          body: "my wife works at the elementary, she said the little girl ain't at school. CPS got her. maybe she'll go with the aunt up in spring city? knew her in highschool"
        },
        {
          author: 'Bandida_Manco', date: '04/23/04 — 05:55', re: 2,
          body: "I AINT GONNA POST ON THIS AGAIN AFTER THIS. I KNEW MARGRET A LITTLE, YEARS BACK, BEFORE SHE GOT HOWEVER SHE GOT. SHE WAS A SWEET GIRL. WHATEVER WAS WRONG WITH HER WAS WRONG WITH HER, IT WASNT HER FAULT, AND I DONT WANT TO HEAR NOBODY TALKING ABOUT HER LIKE SHE BROUGHT IT ON HERSELF. I KNOW CLAUDE! SHES GONE AND THERES A LITTLE GIRL BY HERSELF AND THATS THE WHOLE STORY FAR AS IM CONCERNED. LOG OFF AND GO HUG YOUR KIDS"
        },
      ],
    },
  ];

  // ---- State -----------------------------------------------------------
  let outEl, inputEl, slotEl, bbsEl;
  let active = false;
  let booting = false;
  let view = 'dormant';            // 'dormant' | 'list' | 'thread'
  let bootTimers = [];

  // ---- Output helpers --------------------------------------------------
  function append(line) {
    outEl.textContent += (line == null ? '' : line) + '\n';
    scrollBottom();
  }
  function appendRaw(text) { outEl.textContent += text; scrollBottom(); }
  function clear() { outEl.textContent = ''; }
  function scrollBottom() { outEl.scrollTop = outEl.scrollHeight; }

  // ---- Connect / disconnect -------------------------------------------
  function connect() {
    if (active || booting) return;
    booting = true;
    bbsEl.dataset.state = 'active';
    clear();
    // Modem dial-up boot sequence — staggered so it feels like the line is
    // actually negotiating instead of teleporting.
    const boot = [
      [250, 'ATDT 555-0144'],
      [600, 'RINGING...'],
      [800, 'CONNECT 14400/V42BIS'],
      [200, ''],
      [120, 'valley-net bbs — rhea county local'],
      [120, "running off a 386 in roy's back room since '94"],
      [120, ''],
      [80,  'logged in as GUEST. type H for help.'],
      [120, ''],
    ];
    cancelBootTimers();
    let acc = 0;
    boot.forEach(([d, line]) => {
      acc += d;
      bootTimers.push(setTimeout(() => append(line), acc));
    });
    bootTimers.push(setTimeout(() => {
      booting = false;
      active = true;
      showList();
      inputEl.focus();
    }, acc + 250));
  }

  function disconnect() {
    cancelBootTimers();
    append('');
    append('NO CARRIER');
    active = false;
    booting = false;
    setTimeout(() => {
      bbsEl.dataset.state = 'dormant';
      clear();
      view = 'dormant';
    }, 1400);
  }

  function cancelBootTimers() {
    bootTimers.forEach((t) => clearTimeout(t));
    bootTimers = [];
  }

  // ---- Views ----------------------------------------------------------
  const RULE = '═══════════════════════════════════════';

  function showList() {
    view = 'list';
    append('');
    append(RULE);
    append('TOPICS');
    append(RULE);
    append('');
    THREADS.forEach((t, i) => {
      const lastDate = t.posts[t.posts.length - 1].date.split(' — ')[0];
      const n = t.posts.length;
      append('[' + (i + 1) + '] ' + t.title);
      append('    ' + t.posts[0].author + ' · ' + n + ' post' +
             (n === 1 ? '' : 's') + ' · last ' + lastDate);
    });
    append('');
    append('---');
    append('1-' + THREADS.length + ' read · L list · H help · Q quit');
  }

  function showThread(idx) {
    const t = THREADS[idx];
    if (!t) { append('?? no such topic'); return; }
    view = 'thread';
    append('');
    append(RULE);
    append('[' + (idx + 1) + '] ' + t.title);
    append(RULE);
    t.posts.forEach((p) => {
      const re = p.re === 2 ? 'RE: RE: ' : p.re === 1 ? 'RE: ' : '';
      append('');
      append('> ' + re + p.author + ' · ' + p.date);
      append('');
      append(p.body);
    });
    append('');
    append('---');
    append('L list · Q quit');
  }

  function showHelp() {
    append('');
    append('commands:');
    append('  1-' + THREADS.length + '       read topic');
    append('  L         topic list');
    append('  H / ?     this help');
    append('  Q         disconnect');
  }

  // ---- Command parser -------------------------------------------------
  function processCommand(raw) {
    const cmd = raw.trim();
    // Echo input to the transcript so the conversation reads naturally.
    append('valley-net> ' + cmd);
    if (!cmd) return;
    const c = cmd.toLowerCase();
    if (c === 'q' || c === 'quit' || c === 'exit' || c === 'logoff' || c === 'bye') {
      disconnect();
      return;
    }
    if (c === 'h' || c === 'help' || c === '?') {
      showHelp(); return;
    }
    if (c === 'l' || c === 'list' || c === 'ls') {
      showList(); return;
    }
    const num = parseInt(c, 10);
    if (!isNaN(num) && num >= 1 && num <= THREADS.length) {
      showThread(num - 1);
      return;
    }
    append('?? unknown command. type H for help.');
  }

  // ---- Init -----------------------------------------------------------
  function init() {
    slotEl = document.getElementById('op-slot-right');
    if (!slotEl) return;

    // Build the BBS DOM inside the slot. Start in 'dormant' state — the
    // screen shows a faint "DIAL TO CONNECT" until the user clicks.
    slotEl.innerHTML =
      '<div class="op-bbs" id="op-bbs" data-state="dormant">' +
        '<div class="op-bbs-dormant" id="op-bbs-dormant">' +
          '<div class="op-bbs-dormant-line">VALLEY-NET</div>' +
          '<div class="op-bbs-dormant-sub">click to dial</div>' +
          '<div class="op-bbs-dormant-cur"><span>▌</span></div>' +
        '</div>' +
        '<div class="op-bbs-active">' +
          '<pre class="op-bbs-out" id="op-bbs-out"></pre>' +
          '<div class="op-bbs-input-row">' +
            '<span class="op-bbs-prompt">valley-net&gt;&nbsp;</span>' +
            '<input class="op-bbs-input" id="op-bbs-input" type="text" ' +
              'autocomplete="off" autocorrect="off" autocapitalize="off" ' +
              'spellcheck="false" maxlength="32" />' +
            '<span class="op-bbs-cursor">▌</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    bbsEl   = document.getElementById('op-bbs');
    outEl   = document.getElementById('op-bbs-out');
    inputEl = document.getElementById('op-bbs-input');

    // Click anywhere inside the slot = dial in / focus the prompt.
    slotEl.addEventListener('click', () => {
      if (!active && !booting) connect();
      else inputEl.focus();
    });

    inputEl.addEventListener('keydown', (e) => {
      // Don't let arrow keys / WASD bubble up to the game's global keydown
      // handler — when the BBS has focus, the player isn't crawling.
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = inputEl.value;
        inputEl.value = '';
        if (active) processCommand(cmd);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
