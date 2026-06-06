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
  │                                                                          │
  │   QUICK_FEEDS[] = static catalog mirroring js/child/actions.js food      │
  │     gas-station(+1H, 50¢) / resturant(+3H, 125¢)                         │
  │   renderQuickFeedHtml(bal) ─► two .child-status-feed-btn buttons,        │
  │     disabled when bal<cost; embedded inline in the widget                │
  │   bindQuickFeedClicks(el) ─► per-button click: stopPropagation+          │
  │     preventDefault (so the wrapping <a> doesn't navigate), then          │
  │     Wallet.spend(cost) + Child.applyEffects({hunger:+amt})               │
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
  QUICK_FEEDS=[{id:'gas-station',label:'Gas Station',cost:50,hunger:1},{id:'resturant',label:'Resturant',cost:125,hunger:3}]
  initChildWidget(): el=#child-status||create <a id=child-status class=child-status href title> append body; renderChildWidget(el); Child.onChange→render(el); setInterval(updateWidgetFace(el),420ms); setInterval(updateBillTimer,1s)
  renderChildWidget(el): stats=Child.getState; html=title+face-frame+list; ∀stat∈Child.STATS{value=stats[stat]; pct=value/MAX*100; sev=≤3 low|≤6 mid|else high; build .child-stat row w/name+gauge+value}; N=Child.PLAYS_PER_DECAY||10; playCount=clamp(stats.playCount,0,N); justRolled=last>0&&pc===0; justPlayed=last≥0&&pc≠last; justBumped=played&&!rolled; dangerPct=min(90,pc*10); headline=rolled?'Hunger ticked!':'Hunger tick risk'; buffer=Child.getPlayBuffer?.(); append feed div+bufferTag; lastPlayCount=pc; justPlayed→setTimeout(render,FLASH+50); html+=renderQuickFeedHtml(bal); Wallet→append coins; Expenses→append bill row; el.html=html; bindQuickFeedClicks(el); updateWidgetFace+updateWidgetBalance+updateBillTimer
  renderQuickFeedHtml(bal)→str: ∀f∈QUICK_FEEDS: afford=bal>=f.cost; build .child-status-feed-btn[data-feed-id=f.id, disabled if !afford] w/ label+'+Nh'+cost; wrap in .child-status-feed-actions
  bindQuickFeedClicks(el): ∀btn∈el.$$('.child-status-feed-btn')→click(e): e.preventDefault+stopPropagation; f=QUICK_FEEDS.find(id); guard(!Wallet.spend(f.cost)); Child.applyEffects({hunger:f.hunger})
  updateWidgetBalance(): slot=#child-status-coins-value; slot&&Wallet→slot.text=Wallet.bal
  updateBillTimer(): slot=#child-status-bill-timer; guard(!slot||!Expenses); next=Expenses.lastBilledAt+HOUR_MS; rem=max(0,next-now); mm:ss padded; toggle .child-status-bill-soon if 0<rem≤10s
  updateWidgetFace(el): slot=.child-status-face; {frames,mood}=Child.describeFace(state); mood≠current→faceFrame=0,currentMood=mood; face=frames[faceFrame%len]; faceFrame++; slot.cls='child-status-face tama-face face-'+mood; slot.text=face
  exports: none (page IIFE); creates window-level globals via DOM
*/

(function () {
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

  // Mirrors the food rows in js/child/actions.js. Quick-feed buttons live in
  // the widget so the player can stay on the game page during a tense run —
  // the catalog is duplicated because game pages don't load JG_CHILD.
  const QUICK_FEEDS = [
    { id: 'gas-station', label: 'Gas Station', cost: 50, hunger: 1 },
    { id: 'resturant',   label: 'Resturant',   cost: 125, hunger: 3 },
  ];

  if (window.Child) {
    initChildWidget();
  }

  function childWidgetHref() {
    const path = location.pathname;
    const m = path.match(/\/pages\//);
    if (!m) return 'pages/child.html';
    const after = path.slice(m.index + 7);
    const depth = after.split('/').length - 1;
    return depth === 0 ? 'child.html' : '../'.repeat(depth) + 'child.html';
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

    html += renderQuickFeedHtml(window.Wallet ? Wallet.getBalance() : 0);

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
    el.innerHTML = html;
    bindQuickFeedClicks(el);
    updateWidgetFace(el);
    updateWidgetBalance();
    updateBillTimer();
  }

  function renderQuickFeedHtml(balance) {
    let html = '<div class="child-status-feed-actions">';
    for (const f of QUICK_FEEDS) {
      const afford = balance >= f.cost;
      html +=
        '<button type="button" class="child-status-feed-btn"' +
          ' data-feed-id="' + f.id + '"' + (afford ? '' : ' disabled') + '>' +
          '<span class="child-status-feed-btn-name">' + f.label + '</span>' +
          '<span class="child-status-feed-btn-effect">+' + f.hunger + 'H</span>' +
          '<span class="child-status-feed-btn-cost">' + f.cost + '¢</span>' +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function bindQuickFeedClicks(el) {
    el.querySelectorAll('.child-status-feed-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // Widget is wrapped in an <a> — stop the click from navigating.
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        const id = btn.dataset.feedId;
        const f = QUICK_FEEDS.find((x) => x.id === id);
        if (!f || !window.Wallet || !window.Child) return;
        if (!Wallet.spend(f.cost)) return;
        Child.applyEffects({ hunger: f.hunger });
      });
    });
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
