/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HEADER  —  top-bar balance display + floating Your-Child status widget  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE load                                                              │
  │      │                                                                   │
  │      ├─ refreshBalance() ──► #balance.textContent = Wallet.getBalance()  │
  │      ├─ Wallet.onChange(refreshBalance)                                  │
  │      ├─ Wallet.onChange(updateWidgetBalance)                             │
  │      ├─ bind #debug-reset click ──► Wallet.reset() (honors gift bonus)   │
  │      │                                                                   │
  │      └─ if window.Child ──► initChildWidget()                            │
  │              │                                                           │
  │              ├─ creates/finds <a id="child-status"> floating widget      │
  │              ├─ renderChildWidget(el) ──► builds .child-status HTML      │
  │              │      uses Child.STATS, Child.STAT_LABELS, Child.MAX,      │
  │              │           Child.PLAYS_PER_DECAY, Child.getPlayBuffer      │
  │              ├─ Child.onChange(()=>renderChildWidget(el))                │
  │              ├─ setInterval(updateWidgetFace, 420ms)                     │
  │              │      ──► Child.describeFace() ──► tama-face frame cycle   │
  │              └─ setInterval(updateBillTimer, 1s)                         │
  │                     ──► Expenses.getLastBilledAt() + HOUR_MS countdown   │
  │                                                                          │
  │   childWidgetHref()      ──► path-aware url to child.html                │
  │   updateWidgetBalance()  ──► writes Wallet.getBalance() to widget coins  │
  │   updateBillTimer()      ──► mm:ss into #child-status-bill-timer         │
  │                              + .child-status-bill-soon when <=10s        │
  │   updateWidgetFace(el)   ──► reads Child.describeFace, cycles frames     │
  │   applyWidgetColor(el)   ──► paints .child-status-face-frame from        │
  │     Child.getColor(); flips text color + tints the phosphor glow         │
  │                                                                          │
  │   Exports: none (page-scoped IIFE)                                       │
  │   External deps: window.Wallet (required), window.Child (optional),     │
  │                  window.Expenses (optional, for bill timer)             │
  │   DOM: #balance, #debug-reset, #child-status (created if missing)        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  els: balanceEl=#balance, resetBtn=#debug-reset
  state: faceFrame=0, currentMood=null, lastPlayCount=-1; FEED_FLASH_MS=900
  refreshBalance(): balanceEl.text=Wallet.bal
  on load: refreshBalance; Wallet.onChange(refreshBalance); Wallet.onChange(updateWidgetBalance); resetBtn click→Wallet.reset; window.Child→initChildWidget
  childWidgetHref()→str: path-aware relative URL to child.html (root or ../*depth)
  initChildWidget(): el=#child-status||create <a id=child-status class=child-status href title> append body; renderChildWidget(el); Child.onChange→render(el); setInterval(updateWidgetFace(el),420ms); setInterval(updateBillTimer,1s)
  renderChildWidget(el): stats=Child.getState; html=title+face-frame+list; ∀stat∈Child.STATS{value=stats[stat]; pct=value/MAX*100; sev=≤3 low|≤6 mid|else high; build .child-stat row w/name+gauge+value}; N=Child.PLAYS_PER_DECAY||10; playCount=clamp(stats.playCount,0,N); justRolled=last>0&&pc===0; justPlayed=last≥0&&pc≠last; justBumped=played&&!rolled; dangerPct=min(90,pc*10); headline=rolled?'Hunger ticked!':'Hunger tick risk'; append feed div; lastPlayCount=pc; justPlayed→setTimeout(render,FLASH+50); Wallet→append coins; Expenses→append bill row; el.html=html; applyWidgetColor+updateWidgetFace+updateWidgetBalance+updateBillTimer
  applyWidgetColor(el): guard(!Child.getColor); frame=.child-status-face-frame, face=.child-status-face; c=Child.getColor; frame.bg=rgb(c); lum=(.2126r+.7152g+.0722b)/255; dark=lum≥0.45; face.color=dark?'#1a2810':'#f0f4d8'; textShadow tinted-glow when light, subtle dark stamp when dark
  updateWidgetBalance(): slot=#child-status-coins-value; slot&&Wallet→slot.text=Wallet.bal
  updateBillTimer(): slot=#child-status-bill-timer; guard(!slot||!Expenses); next=Expenses.lastBilledAt+HOUR_MS; rem=max(0,next-now); mm:ss padded; toggle .child-status-bill-soon if 0<rem≤10s
  updateWidgetFace(el): slot=.child-status-face; {frames,mood}=Child.describeFace(state); mood≠current→faceFrame=0,currentMood=mood; face=frames[faceFrame%len]; faceFrame++; slot.cls='child-status-face tama-face face-'+mood; slot.text=face
  exports: none (page IIFE); creates window-level globals via DOM
*/

(function () {
  // Inject the always-visible "← Lobby" pill into the top-left corner.
  // Skipped on the lobby itself and on terminal/intro flow pages.
  (function injectLobbyPill() {
    if (document.querySelector('.lobby-pill')) return;
    const file = (location.pathname.split('/').pop() || '').toLowerCase();
    const SKIP = new Set([
      'index.html', '', 'splash.html', 'trigger-warning.html',
      'death.html', 'child-died.html', 'forget.html'
    ]);
    if (SKIP.has(file)) return;
    const m = location.pathname.match(/\/pages\//);
    let href = 'index.html';
    if (m) {
      const after = location.pathname.slice(m.index + 7);
      const depth = after.split('/').length - 1;
      href = depth === 0 ? 'index.html' : '../'.repeat(depth) + 'index.html';
    }
    const pill = document.createElement('a');
    pill.className = 'lobby-pill';
    pill.href = href;
    pill.textContent = '← Lobby';
    pill.title = "Back to Fortuna's Palace";
    document.body.appendChild(pill);
  })();

  // ── Page version tag — console only ─────────────────────────────
  // Each page sets `window.PAGE_VERSION = "..."` in its head before
  // this file loads. We just log it. Easy to grep in devtools, no
  // chrome cluttering the page itself.
  (function logVersionTag() {
    var ver = (typeof window.PAGE_VERSION === 'string' && window.PAGE_VERSION)
            || 'dev';
    try {
      console.log('%c[page version] ' + ver,
                  'color:#c9a14a;background:#1a1208;padding:2px 6px;border-radius:3px;font-family:monospace');
    } catch (e) {}
  })();

  const balanceEl = document.getElementById('balance');
  const resetBtn = document.getElementById('debug-reset');

  function refreshBalance() {
    if (balanceEl) balanceEl.textContent = Wallet.getBalance();
  }

  refreshBalance();
  Wallet.onChange(refreshBalance);
  Wallet.onChange(updateWidgetBalance);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => Wallet.reset());
  }

  let faceFrame = 0;
  let currentMood = null;
  let lastPlayCount = -1;
  const FEED_FLASH_MS = 900;

  // Boss-kill badge templates — small SVGs rendered inline at the
  // bottom of the Your-Child widget for each boss in
  // wendys_palace_bosses_beaten. Order is the canonical 1→5 progression.
  // Declared BEFORE initChildWidget() so renderChildWidget can read them
  // on first paint without hitting a temporal-dead-zone ReferenceError.
  const BOSS_BADGE_ORDER = ['chavez', 'malechstone', 'zashiki-warashi', 'nahual', 'fortuna'];
  const BOSS_BADGE_TITLE = {
    'chavez':          'Beat Agent Gabriel',
    'malechstone':     'Beat Agent Malechstone',
    'zashiki-warashi': 'Beat Agent Zashiki-Warashi',
    'nahual':          'Beat Agent Nahual',
    'fortuna':         'Beat Fortuna',
  };
  const BOSS_BADGE_SVG = {
    // Chavez badge = Eye of Chavez (the look that used to sit on the
    // lobby until it moved into the widget). HTML markup, not SVG —
    // a wrapper .badge-eye + nested pupil dot, with its own animation
    // and gold/phosphor halo defined in base.css.
    'chavez':
      '<div class="badge-eye"><div class="badge-eye-pupil"></div></div>',
    // Malechstone badge — the ASCII missile from his page (the `═══►`
    // glyph the boss fires from his mouth). Phosphor-yellow text, no
    // plate (CSS strips the wrapper when .badge-missile is the child).
    'malechstone':
      '<span class="badge-missile">═══►</span>',
    // Zashiki badge — one of the little black soot puff balls with the
    // two white pinprick eyes. Simple SVG; uses the standard plate.
    'zashiki-warashi':
      '<svg viewBox="0 0 32 32" aria-hidden="true">' +
        '<circle cx="16" cy="16" r="11" fill="#080808"/>' +
        '<circle cx="12.5" cy="14" r="1.6" fill="#ffffff"/>' +
        '<circle cx="19.5" cy="14" r="1.6" fill="#ffffff"/>' +
      '</svg>',
    // Nahual badge — jaguar emoji forced into pure pink via a CSS
    // filter chain (brightness/sepia/saturate/hue-rotate stack that
    // maps any source color into magenta/pink territory).
    'nahual':
      '<span class="badge-jaguar">🐆</span>',
    // Fortuna badge — a burn-cigarette hole through the page itself.
    // Charred outer ring + dark void center; the plate is stripped so
    // the hole reads as a perforation in the widget surface.
    'fortuna':
      '<span class="badge-burn"><span class="badge-burn-core"></span></span>',
  };

  function childWidgetHref() {
    const path = location.pathname;
    const m = path.match(/\/pages\//);
    if (!m) return 'pages/child.html';
    const after = path.slice(m.index + 7);
    const depth = after.split('/').length - 1;
    return depth === 0 ? 'child.html' : '../'.repeat(depth) + 'child.html';
  }

  if (window.Child) {
    initChildWidget();
  }

  function initChildWidget() {
    let el = document.getElementById('child-status');
    if (!el) {
      el = document.createElement('a');
      el.id = 'child-status';
      el.className = 'child-status';
      el.href = childWidgetHref();
      el.title = 'Take care of the child';
      document.body.appendChild(el);
    }
    renderChildWidget(el);
    Child.onChange(() => renderChildWidget(el));
    setInterval(() => updateWidgetFace(el), 420);
    setInterval(updateBillTimer, 1000);
  }

  function renderChildWidget(el) {
    const stats = Child.getState();
    let html = '<div class="child-status-title">Your Child</div>';
    html +=
      '<div class="child-status-face-frame">' +
        '<div class="child-status-face"></div>' +
      '</div>';
    html += '<div class="child-status-list">';
    for (const stat of Child.STATS) {
      const value = stats[stat];
      const pct = (value / Child.MAX) * 100;
      const sev = value <= 3 ? 'low' : value <= 6 ? 'mid' : 'high';
      html += '<div class="child-stat child-stat-' + sev + '">' +
        '<span class="child-stat-name">' + Child.STAT_LABELS[stat] + '</span>' +
        '<div class="child-stat-gauge">' +
          '<div class="child-stat-fill" style="width: ' + pct + '%"></div>' +
        '</div>' +
        '<span class="child-stat-value">' + value + '</span>' +
      '</div>';
    }
    html += '</div>';

    const playCount = Math.max(0, stats.playCount || 0);
    const justRolled = lastPlayCount > 0 && playCount === 0;
    const justPlayed = lastPlayCount >= 0 && playCount !== lastPlayCount;
    const justBumped = justPlayed && !justRolled;
    const growth = (typeof Child.getGrowthRate === 'function') ? Child.getGrowthRate() : 0.05;
    const rawPct = Math.min(90, Math.max(0, playCount * growth * 100));
    const dangerPct = (Math.round(rawPct * 10) / 10).toString();
    const headline = justRolled ? 'Hunger ticked!' : 'Hunger tick risk';
    const flashClass = justRolled ? ' is-flashing' : '';
    const bumpClass = justBumped ? ' is-bumped' : '';
    html +=
      '<div class="child-status-feed' + flashClass + '">' +
        '<div class="child-status-feed-label">' + headline +
          '<span class="child-status-feed-pct' + bumpClass + '">' + dangerPct + '%</span>' +
        '</div>' +
      '</div>';
    lastPlayCount = playCount;
    if (justPlayed) setTimeout(function () { renderChildWidget(el); }, FEED_FLASH_MS + 50);

    if (window.Wallet) {
      html +=
        '<div class="child-status-coins">' +
          '<span class="child-status-coins-label">Coins</span>' +
          '<span class="child-status-coins-value" id="child-status-coins-value">' +
            Wallet.getBalance() +
          '</span>' +
        '</div>';
    }
    if (window.Expenses) {
      const cost = Expenses.COST_PER_HOUR;
      html +=
        '<div class="child-status-bill">' +
          '<span class="child-status-bill-label">Next bill (' + cost + ' coin' + (cost === 1 ? '' : 's') + ')</span>' +
          '<span class="child-status-bill-timer" id="child-status-bill-timer">--:--</span>' +
        '</div>';
    }

    // Boss-kill badges — one per beaten boss, lit only when earned.
    // Read straight from localStorage so this works on every page
    // without depending on the bossfight engine being loaded.
    var beaten = [];
    try {
      var raw = localStorage.getItem('wendys_palace_bosses_beaten');
      beaten = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(beaten)) beaten = [];
    } catch (e) { beaten = []; }
    if (beaten.length > 0) {
      html += '<div class="child-status-badges" aria-label="Bosses beaten">';
      BOSS_BADGE_ORDER.forEach(function (slug) {
        if (beaten.indexOf(slug) < 0) return;
        html += '<div class="child-status-badge" title="' + BOSS_BADGE_TITLE[slug] + '">' +
          BOSS_BADGE_SVG[slug] +
        '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
    applyWidgetColor(el);
    updateWidgetFace(el);
    updateWidgetBalance();
    updateBillTimer();
  }

  function applyWidgetColor(el) {
    if (!window.Child || typeof Child.getColor !== 'function') return;
    const frame = el.querySelector('.child-status-face-frame');
    const face = el.querySelector('.child-status-face');
    if (!frame || !face) return;
    const c = Child.getColor();
    frame.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
    const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const dark = lum >= 0.45;
    face.style.color = dark ? '#1a2810' : '#f0f4d8';
    face.style.textShadow = dark
      ? '0 1px 0 rgba(0, 0, 0, 0.18)'
      : '0 0 6px rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.6), 0 1px 0 rgba(0, 0, 0, 0.55)';
  }

  function updateWidgetBalance() {
    const slot = document.getElementById('child-status-coins-value');
    if (slot && window.Wallet) slot.textContent = Wallet.getBalance();
  }

  function updateBillTimer() {
    const slot = document.getElementById('child-status-bill-timer');
    if (!slot || !window.Expenses) return;
    const now = Date.now();
    const next = Expenses.getLastBilledAt() + Expenses.HOUR_MS;
    let remaining = Math.max(0, next - now);
    const totalSec = Math.floor(remaining / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    slot.textContent =
      String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    slot.classList.toggle('child-status-bill-soon', remaining > 0 && remaining <= 10000);
  }

  function updateWidgetFace(el) {
    const slot = el.querySelector('.child-status-face');
    if (!slot) return;
    const { frames, mood } = Child.describeFace(Child.getState());
    if (mood !== currentMood) {
      faceFrame = 0;
      currentMood = mood;
    }
    const face = frames[faceFrame % frames.length];
    faceFrame++;
    slot.className = 'child-status-face tama-face face-' + mood;
    slot.textContent = face;
  }
})();
