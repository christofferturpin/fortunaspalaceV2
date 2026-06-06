/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CHILD PAGE  —  tamagotchi UI: stats, actions, investments, lock screen  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ applyChildColor()  (paint screen from RGB)   │
  │                          ├─ render()                                     │
  │                          ├─ startFaceAnim()  ── setInterval 420ms        │
  │                          │     └─► updateTamagotchi()  (cycle frames[])  │
  │                          ├─ setupShadesToggle()  (if sunglasses owned)   │
  │                          ├─ Wallet.onChange(render)                      │
  │                          ├─ Child.onChange(render)                       │
  │                          └─ Child.onChange(applyChildColor)              │
  │                                                                          │
  │   applyChildColor() ──► .tamagotchi-screen.style.background =            │
  │     rgb(Child.getColor()); flips .tama-content text color (dark vs       │
  │     light) by luminance so the face stays legible on any tint            │
  │                                                                          │
  │   render() ──► updateTamagotchi() + branch:                              │
  │     if Child.isLocked() ─► renderLock()                                  │
  │     else               ─► stopTimer() + renderActions()                  │
  │                                                                          │
  │   renderActions() ─► #child-main.innerHTML =                             │
  │     renderStatsBlock()       (stat-row × Child.STATS, sev low/mid/high)  │
  │   + renderDebugBlock()       (+/-/Set buttons, coin shortcuts)           │
  │   + renderBufferBlock()      (playBuffer count, empty string if 0)       │
  │   + renderActionGrid()       (button per JG_CHILD.ACTIONS)               │
  │   + renderInvestmentsBlock() (buy/sell per JG_CHILD.INVESTMENTS)         │
  │     then bindActionClicks() + bindDebugClicks() + bindInvestmentClicks() │
  │                                                                          │
  │   Action click ─► bindActionClicks() handler                             │
  │     ├─ Wallet.spend(cost) if cost>0                                      │
  │     ├─ action.route ─► location.href = route (minigames)                 │
  │     └─ else Child.applyEffects(effects)                                  │
  │           if action.lockMs ─► Child.lockFor(lockMs, lockMessage)         │
  │                                                                          │
  │   Investment click ─► bindInvestmentClicks() handler                     │
  │     mode==='sell' ─► Child.sellInvestment(inv)                           │
  │     else          ─► Child.applyInvestment(inv, resolvedCost)            │
  │   resolveInvestment(inv, state) ──► { label, cost, purchased }           │
  │       evaluates inv.labelFor(state) / inv.costFor(state) when dynamic    │
  │                                                                          │
  │   Debug click ─► bindDebugClicks()                                       │
  │     data-debug-stat / -delta ─► Child.add(stat, delta)                   │
  │     data-debug-action: all-max/all-mid/all-low/clear-lock/set-coins      │
  │     data-debug-coins ─► Wallet.set(v)                                    │
  │                                                                          │
  │   renderLock() ─► stats+debug blocks + lock-screen w/ countdown          │
  │     timerInterval (1s) ──► updateLockTimer(); auto-clears when expired   │
  │   stopTimer() clears the interval                                        │
  │                                                                          │
  │   fmtCoins(n) ──► en-US grouped string                                   │
  │   Module state: timerInterval, faceInterval, faceFrame, currentMood      │
  │                                                                          │
  │   Exports: none (no global assignment; runs on load)                     │
  │   External deps: Child, Wallet, global.JG_CHILD.{ACTIONS,INVESTMENTS},   │
  │                  DOM (#child-main, .tama-content, #lock-timer,           │
  │                       #debug-coin-input)                                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: timerInterval=null, faceInterval=null, faceFrame=0, currentMood=null
  ACTIONS=global.JG_CHILD.ACTIONS; INVESTMENTS=global.JG_CHILD.INVESTMENTS||[]
  STAT_LABELS={hunger,wellness,closeness}
  fmtCoins(n)→str: n.toLocaleString('en-US')
  resolveInvestment(inv,state)→{label,cost,purchased}: label=inv.labelFor?(state):inv.label; cost=inv.costFor?(state):inv.cost; purchased=oneTime&&Child.hasPurchasedInvestment(id)
  init(): applyChildColor; render; startFaceAnim; setupShadesToggle; Wallet.onChange(render); Child.onChange(render); Child.onChange(applyChildColor)
  applyChildColor(): el=.tamagotchi-screen, txt=.tama-content; guard(!el||!txt); c=Child.getColor; el.style.bg=rgb(c); lum=(0.2126r+0.7152g+0.0722b)/255; dark=lum>=0.45; txt.color=dark?'#1a2810':'#f0f4d8'; txt.textShadow=dark? subtle : strong
  ownsSunglasses()→bool: localStorage['wendys_palace_giftshop'].owned ∋ 'lonniesunglasses'
  setupShadesToggle(): btn=#shades-toggle; guard(!btn||!owns); btn.hidden=F; refresh()=btn.toggle('on',Child.getSunglasses)+aria-pressed; click→Child.setSunglasses(!getSunglasses); Child.onChange(refresh); refresh()
  startFaceAnim(): clear+setInterval(updateTamagotchi,420)
  render(): updateTamagotchi; Child.isLocked()?renderLock():(stopTimer+renderActions)
  updateTamagotchi(): el=.tama-content; {frames,mood,tells}=Child.describeFace(state); if mood!=currentMood→faceFrame=0,currentMood=mood; face=frames[faceFrame%len]; faceFrame++; el.html=face div+tells div
  renderActions(): #child-main.html=stats+debug+buffer+actionGrid+investments; bind all click handlers
  renderBufferBlock()→str: buf=Child.getPlayBuffer; buf<=0→''; else section w/ "Hunger held off for N play(s)"
  buyButtonHtml(inv,cost,afford)→str: button.investment-buy data-mode=buy [disabled?]
  sellButtonHtml(inv,refund)→str: button.investment-sell data-mode=sell
  renderInvestmentsBlock()→str: ∀inv∈INVESTMENTS: r=resolveInvestment; afford=bal>=cost; if trustGrowth→buy+(level>0?sell:); else oneTime→purchased?sell:buy; card w/ label+tier(×N)+desc+actions
  bindInvestmentClicks(): ∀.investment-action click→find inv by id; mode=='sell'?Child.sellInvestment(inv):Child.applyInvestment(inv,r.cost)
  renderStatsBlock()→str: ∀stat∈Child.STATS: pct=v/MAX*100; sev=v<=3?low:v<=6?mid:high; stat-row w/ bar+value
  renderActionGrid()→str: ∀a∈ACTIONS: afford=bal>=cost; klass+lock+unaffordable; action-card w/ name+desc+cost
  renderDebugBlock()→str: per-stat -/+ buttons w/ data-debug-stat/-delta; bulk all-max/all-mid/all-low/clear-lock; coin input+set; coin presets 0/1k/10k/100k/1M/1B
  bindDebugClicks(): [data-debug-stat]→Child.add(stat,delta); [data-debug-action]: all-max→Child.set(s,10)∀STATS, all-mid→5, all-low→1, clear-lock→Child.clearLock, set-coins→Wallet.set(input); [data-debug-coins]→Wallet.set(v)
  bindActionClicks(): ∀.action-card click→find a by id; cost>0?Wallet.spend(cost):skip; a.route→location.href=route; else Child.applyEffects+if lockMs→Child.lockFor(ms,msg)
  renderLock(): #child-main.html=stats+debug+lock-screen(msg+timer+note); bindDebugClicks; updateLockTimer; if !timerInterval→setInterval(updateLockTimer+if !isLocked→stopTimer+Child.clearLock, 1000)
  updateLockTimer(): ms=Child.lockRemainingMs; mm:ss pad2; #lock-timer.text
  stopTimer(): clearInterval+null
  exports: none (no global)
  on DOMContentLoaded→init
*/

(function (global) {
  let timerInterval = null;
  let faceInterval = null;
  let faceFrame = 0;
  let currentMood = null;
  const ACTIONS = global.JG_CHILD.ACTIONS;
  const INVESTMENTS = global.JG_CHILD.INVESTMENTS || [];

  function fmtCoins(n) {
    return n.toLocaleString('en-US');
  }

  function resolveInvestment(inv, state) {
    const label = typeof inv.labelFor === 'function' ? inv.labelFor(state) : inv.label;
    const cost = typeof inv.costFor === 'function' ? inv.costFor(state) : inv.cost;
    const purchased = inv.oneTime && Child.hasPurchasedInvestment(inv.id);
    return { label: label, cost: cost, purchased: purchased };
  }
  const STAT_LABELS = {
    hunger: 'Hunger',
    wellness: 'Wellness',
    closeness: 'Closeness',
  };

  function init() {
    applyChildColor();
    render();
    startFaceAnim();
    setupShadesToggle();
    Wallet.onChange(render);
    Child.onChange(render);
    Child.onChange(applyChildColor);
  }

  function applyChildColor() {
    const screen = document.querySelector('.tamagotchi-screen');
    const content = document.querySelector('.tama-content');
    if (!screen || !content) return;
    const c = Child.getColor();
    screen.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
    const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const dark = lum >= 0.45;
    content.style.color = dark ? '#1a2810' : '#f0f4d8';
    content.style.textShadow = dark
      ? '0 1px 0 rgba(0, 0, 0, 0.15)'
      : '0 1px 0 rgba(0, 0, 0, 0.55)';
  }

  function ownsSunglasses() {
    try {
      const gs = JSON.parse(localStorage.getItem('wendys_palace_giftshop') || '{}');
      return Array.isArray(gs.owned) && gs.owned.indexOf('lonniesunglasses') !== -1;
    } catch { return false; }
  }

  function setupShadesToggle() {
    const btn = document.getElementById('shades-toggle');
    if (!btn) return;
    if (!ownsSunglasses()) return;
    btn.hidden = false;
    function refreshShades() {
      const on = Child.getSunglasses();
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    btn.addEventListener('click', () => {
      Child.setSunglasses(!Child.getSunglasses());
    });
    Child.onChange(refreshShades);
    refreshShades();
  }

  function startFaceAnim() {
    if (faceInterval) clearInterval(faceInterval);
    faceInterval = setInterval(updateTamagotchi, 420);
  }

  function render() {
    updateTamagotchi();
    if (Child.isLocked()) {
      renderLock();
    } else {
      stopTimer();
      renderActions();
    }
  }

  function updateTamagotchi() {
    const el = document.querySelector('.tama-content');
    if (!el) return;
    const stats = Child.getState();
    const { frames, mood, tells } = Child.describeFace(stats);
    if (mood !== currentMood) {
      faceFrame = 0;
      currentMood = mood;
    }
    const face = frames[faceFrame % frames.length];
    faceFrame++;
    el.innerHTML =
      '<div class="tama-face face-' + mood + '">' + face + '</div>' +
      (tells.length ? '<div class="tama-tells">' + tells.join(' · ') + '</div>' : '');
  }

  function renderActions() {
    const root = document.getElementById('child-main');
    root.innerHTML =
      renderStatsBlock() +
      renderDebugBlock() +
      renderActionGrid() +
      renderInvestmentsBlock();
    bindActionClicks();
    bindDebugClicks();
    bindInvestmentClicks();
  }

  function buyButtonHtml(inv, cost, afford) {
    return '<button type="button" class="investment-action investment-buy"' +
      ' data-investment-id="' + inv.id + '"' +
      ' data-mode="buy"' + (afford ? '' : ' disabled') + '>' +
      'Buy · ' + fmtCoins(cost) + ' coins' +
      '</button>';
  }

  function sellButtonHtml(inv, refund, blocked) {
    const label = blocked
      ? 'Sell · sell higher tier first'
      : 'Sell · +' + fmtCoins(refund) + ' coins';
    return '<button type="button" class="investment-action investment-sell"' +
      ' data-investment-id="' + inv.id + '"' +
      ' data-mode="sell"' + (blocked ? ' disabled' : '') + '>' +
      label +
      '</button>';
  }

  function renderInvestmentsBlock() {
    const stats = Child.getState();
    const balance = Wallet.getBalance();
    let html = '<section class="investments-block">' +
      '<h2 class="investments-title">Long-Term Investments</h2>' +
      '<p class="investments-sub">Each one buys 6 plays that slip past the hunger cycle. Sell back any time for 75%.</p>' +
      '<div class="investments-grid">';
    for (const inv of INVESTMENTS) {
      const r = resolveInvestment(inv, stats);
      const afford = balance >= r.cost;
      const buttons = [];

      if (inv.trustGrowth) {
        buttons.push(buyButtonHtml(inv, r.cost, afford));
        if ((stats.trustLevel || 0) > 0) {
          buttons.push(sellButtonHtml(inv, Child.sellRefundFor(inv), false));
        }
      } else if (inv.oneTime) {
        if (r.purchased) {
          const blocked = Child.isHousingSellBlocked && Child.isHousingSellBlocked(inv.id);
          buttons.push(sellButtonHtml(inv, Child.sellRefundFor(inv), blocked));
        } else {
          buttons.push(buyButtonHtml(inv, r.cost, afford));
        }
      }

      const klass = 'investment-card' +
        (r.purchased ? ' investment-purchased' : '');
      const labelText = inv.trustGrowth && (stats.trustLevel || 0) > 0
        ? r.label + ' <span class="investment-tier">(×' + (stats.trustLevel + 1) + ')</span>'
        : r.label;
      html +=
        '<div class="' + klass + '" data-investment-id="' + inv.id + '">' +
          '<div class="investment-name">' + labelText + '</div>' +
          '<div class="investment-desc">' + inv.desc + '</div>' +
          '<div class="investment-actions">' + buttons.join('') + '</div>' +
        '</div>';
    }
    html += '</div></section>';
    return html;
  }

  function bindInvestmentClicks() {
    document.querySelectorAll('.investment-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.investmentId;
        const mode = btn.dataset.mode;
        const inv = INVESTMENTS.find((x) => x.id === id);
        if (!inv) return;
        if (mode === 'sell') {
          Child.sellInvestment(inv);
        } else {
          const r = resolveInvestment(inv, Child.getState());
          Child.applyInvestment(inv, r.cost);
        }
      });
    });
  }

  function renderStatsBlock() {
    const stats = Child.getState();
    let html = '<section class="child-stats-block"><h2 class="child-stats-title">Your Child</h2><div class="child-stats-grid">';
    for (const stat of Child.STATS) {
      const v = stats[stat];
      const pct = (v / Child.MAX) * 100;
      const sev = v <= 3 ? 'low' : v <= 6 ? 'mid' : 'high';
      html +=
        '<div class="stat-row stat-' + sev + '">' +
          '<div class="stat-label">' + STAT_LABELS[stat] + '</div>' +
          '<div class="stat-bar"><div class="stat-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="stat-value">' + v + ' / ' + Child.MAX + '</div>' +
        '</div>';
    }
    html += '</div></section>';
    return html;
  }

  function renderActionGrid() {
    const balance = Wallet.getBalance();
    let html = '<section class="action-grid">';
    for (const a of ACTIONS) {
      const afford = balance >= a.cost;
      const disabledAttr = afford ? '' : 'disabled';
      const klass = 'action-card' + (a.lockMs ? ' action-locking' : '') + (afford ? '' : ' action-unaffordable');
      html +=
        '<button class="' + klass + '" data-action-id="' + a.id + '" ' + disabledAttr + '>' +
          '<div class="action-name">' + a.label + '</div>' +
          '<div class="action-desc">' + a.desc + '</div>' +
          '<div class="action-cost">' + (a.cost > 0 ? a.cost + ' coins' : 'free') + '</div>' +
        '</button>';
    }
    html += '</section>';
    return html;
  }

  function renderDebugBlock() {
    const stats = Child.getState();
    let html = '<section class="child-debug-block">' +
      '<div class="child-debug-title">Debug · Stats</div>' +
      '<div class="child-debug-grid">';
    for (const stat of Child.STATS) {
      html +=
        '<div class="debug-row">' +
          '<span class="debug-label">' + STAT_LABELS[stat] + '</span>' +
          '<button class="debug-btn" data-debug-stat="' + stat + '" data-debug-delta="-1" aria-label="decrement">−</button>' +
          '<span class="debug-val">' + stats[stat] + '</span>' +
          '<button class="debug-btn" data-debug-stat="' + stat + '" data-debug-delta="1" aria-label="increment">+</button>' +
        '</div>';
    }
    html += '</div><div class="child-debug-actions">' +
      '<button class="debug-btn debug-btn-wide" data-debug-action="all-max">All 10</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-action="all-mid">All 5</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-action="all-low">All 1</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-action="clear-lock">Clear Lock</button>' +
    '</div>';
    const balance = Wallet.getBalance();
    html += '<div class="child-debug-coins">' +
      '<span class="debug-label">Coins</span>' +
      '<input type="number" class="debug-coin-input" id="debug-coin-input" min="0" step="1" value="' + balance + '" inputmode="numeric">' +
      '<button class="debug-btn" data-debug-action="set-coins">Set</button>' +
    '</div>' +
    '<div class="child-debug-actions">' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="0">0</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="1000">1k</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="10000">10k</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="100000">100k</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="1000000">1M</button>' +
      '<button class="debug-btn debug-btn-wide" data-debug-coins="1000000000">1B</button>' +
    '</div></section>';
    return html;
  }

  function bindDebugClicks() {
    document.querySelectorAll('[data-debug-stat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stat = btn.dataset.debugStat;
        const delta = parseInt(btn.dataset.debugDelta, 10);
        Child.add(stat, delta);
      });
    });
    document.querySelectorAll('[data-debug-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.debugAction;
        if (action === 'all-max') {
          for (const s of Child.STATS) Child.set(s, 10);
        } else if (action === 'all-mid') {
          for (const s of Child.STATS) Child.set(s, 5);
        } else if (action === 'all-low') {
          for (const s of Child.STATS) Child.set(s, 1);
        } else if (action === 'clear-lock') {
          Child.clearLock();
        } else if (action === 'set-coins') {
          const inp = document.getElementById('debug-coin-input');
          const v = parseInt(inp ? inp.value : '0', 10);
          Wallet.set(Number.isFinite(v) && v >= 0 ? v : 0);
        }
      });
    });
    document.querySelectorAll('[data-debug-coins]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = parseInt(btn.dataset.debugCoins, 10);
        if (Number.isFinite(v) && v >= 0) Wallet.set(v);
      });
    });
  }

  function bindActionClicks() {
    document.querySelectorAll('.action-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.actionId;
        const action = ACTIONS.find((a) => a.id === id);
        if (!action) return;
        if (action.cost > 0 && !Wallet.spend(action.cost)) return;
        if (action.route) {
          location.href = action.route;
          return;
        }
        Child.applyEffects(action.effects);
        if (action.lockMs) {
          Child.lockFor(action.lockMs, action.lockMessage);
        }
      });
    });
  }

  function renderLock() {
    const root = document.getElementById('child-main');
    root.innerHTML =
      renderStatsBlock() +
      renderDebugBlock() +
      '<section class="lock-screen">' +
        '<h2 class="lock-title">' + Child.lockMessage() + '</h2>' +
        '<div class="lock-timer" id="lock-timer">--:--</div>' +
        '<p class="lock-note">Games are locked until this finishes.</p>' +
      '</section>';
    bindDebugClicks();
    updateLockTimer();
    if (!timerInterval) {
      timerInterval = setInterval(() => {
        updateLockTimer();
        if (!Child.isLocked()) {
          stopTimer();
          Child.clearLock();
        }
      }, 1000);
    }
  }

  function updateLockTimer() {
    const el = document.getElementById('lock-timer');
    if (!el) return;
    const ms = Child.lockRemainingMs();
    const mm = Math.floor(ms / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    el.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
