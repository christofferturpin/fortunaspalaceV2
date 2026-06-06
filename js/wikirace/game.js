/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  WIKIRACE GAME  —  bet/race/resolve UI controller (horse-racing page)    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ cache els {field, slots, wager, buttons…}    │
  │                          ├─ bind  #hr-slot-{win,place,show} ─► assignToSlot │
  │                          ├─ bind  #hr-wager input/change/max ─► onWager* │
  │                          ├─ bind  #hr-place-bet ─► placeBet              │
  │                          ├─ bind  #hr-clear     ─► clearPicks            │
  │                          ├─ Wallet.onChange     ─► render                │
  │                          ├─ ensureLiveData()  (await warmCache if cold)  │
  │                          └─ newRace()                                    │
  │                                                                          │
  │   state.phase: 'betting' → 'racing' → 'resolved' → newRace               │
  │                                                                          │
  │   newRace()                                                              │
  │     ├─ WikiraceRealHorses.canGenerateRealRace() ?                        │
  │     │      generateRealRace() : WikiraceRace.generateRace()              │
  │     ├─ pickEmojis(N) ──► per-horse emoji                                 │
  │     └─ reset picks/wager → render()                                      │
  │                                                                          │
  │   click horse ─► selectHorse(horse)                                      │
  │     ├─ already assigned ─► clear that slot                               │
  │     ├─ slot empty ─► fill firstEmptySlot()                               │
  │     └─ slots full ─► mark selectedHorse (waiting on slot click)          │
  │                                                                          │
  │   click slot  ─► assignToSlot(slot)                                      │
  │     ├─ with selectedHorse ─► swap into slot                              │
  │     └─ slot filled ─► clear slot                                         │
  │                                                                          │
  │   click "place bet" ─► placeBet()                                        │
  │     ├─ Wallet.spend(wager*3)                                             │
  │     ├─ Child.recordPlay() if present                                     │
  │     ├─ Sound.sowSeed()                                                   │
  │     ├─ finishOrder = WikiraceRace.runRace(field)                         │
  │     ├─ payoutDetail = WikiraceBetting.resolveBetDetailed(...)            │
  │     └─ phase='racing' → startRaceAnimation()                             │
  │                                                                          │
  │   startRaceAnimation()                                                   │
  │     ├─ deathTimes by rank (30% min → 100% over 10s)                      │
  │     ├─ Sound.raceStart() ─► rAF frame loop ─► bar widths %               │
  │     │      on death: arkTink (1st/2nd/3rd) or horseDie (loser)           │
  │     └─ Sound.raceFinish() ─► setTimeout(onRaceComplete, 900ms)           │
  │                                                                          │
  │   onRaceComplete()                                                       │
  │     ├─ Wallet.add(totalPayout)                                           │
  │     ├─ Sound.winChime() / loss() based on profit sign                    │
  │     └─ phase='resolved' → renderResult()                                 │
  │                                                                          │
  │   Render pipeline (phase-gated):                                         │
  │     render → renderField, renderSlots, renderWager,                      │
  │              renderPlaceBetState, renderClearBtn, renderModeNote         │
  │     racing → renderRacePanel                                             │
  │     resolved → renderResult (statsLine, escapeHtml helpers)              │
  │                                                                          │
  │   Helpers: horseId, sameHorse, findSlotOf, firstEmptySlot,               │
  │     allSlotsFilled, sampleArticles, showLoading/hideLoading/update,      │
  │     readWagerInput, maxWager, snd                                        │
  │                                                                          │
  │   Exports (window.WikiraceGame): { init }                                │
  │   External deps: Wallet, Child (optional), WikiraceSound,                │
  │     WikiraceRace, WikiraceBetting, WikiraceRealHorses, WikiraceAPI,      │
  │     WikiraceArticles, document, requestAnimationFrame                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SLOTS=['win','place','show']; SLOT_LABELS={win:'WIN',place:'PLACE',show:'SHOW'}; RACE_DURATION_MS=10000; RACE_HOLD_MS=900; WARM_SAMPLE_SIZE=200
  ANIMAL_EMOJIS=[57 emojis]; pickEmojis(n)→[]: pool=slice; ∀i<n splice rnd idx
  snd()→global.WikiraceSound
  state: {field:[], selectedHorse:null, picks:{win,place,show:null}, wager:0, phase:'betting'|'racing'|'resolved', finishOrder:null, payoutDetail:null, isRealData:F}
  els: {} (cached); raceFrameHandle=null
  init():async: cache els (fieldSection,betSection,racePanel,resultPanel,field,slots×3,wagerInput,wagerMaxBtn,totalWager,placeBetBtn,clearBtn,modeNote,loading*); bind slot clicks→assignToSlot; wager input/change/max; placeBet; clear; Wallet.onChange→render; await ensureLiveData; newRace
  sampleArticles(pool,n)→[]: Fisher-Yates partial shuffle first k=min(n,len)
  ensureLiveData():async: !API||!Articles→ret; need=18; status=API.cacheStatus; fresh>=need→ret; sample=sampleArticles(Articles,200); showLoading; await API.warmCache(sample, onProg=updateLoading); hideLoading
  showLoading/hideLoading: toggle .hr-hidden on els.loading
  updateLoading(done,total,failed): bar.width=done/total*100%; status.text=`${done}/${total}${failed?' (${failed} unavailable)':''}`
  newRace(): cancelAnimationFrame(raceFrameHandle); real=RealHorses.canGenerate?generateRealRace():null; state.field=real||Race.generateRace; isRealData=!!real; assign emojis; reset picks/selected/phase/finishOrder/payoutDetail; clamp wager∈[1,floor(bal/3)]; wagerInput.value=wager; render
  horseId(h)→str: name1+'|'+name2
  sameHorse(a,b)→T/F: a&&b&&horseId equal
  findSlotOf(horse)→slot|null: scan SLOTS for matching pick
  firstEmptySlot()→slot|null: first SLOTS[i] with picks==null
  selectHorse(horse): guard(phase!='betting'); already in slot→clear that slot+sound; same as selected→deselect; empty slot exists→fill+slotAssign sound; else→state.selectedHorse=horse+horseSelect sound; render
  assignToSlot(slot): guard(phase!='betting'); selectedHorse: if in other slot→clear it; picks[slot]=selectedHorse; selectedHorse=null; slotAssign sound; render; else if picks[slot] filled→clear+clearPick sound+render
  clearPicks(): guard(phase!='betting'); picks={null×3}; selectedHorse=null; clearPick sound; render
  readWagerInput()→int: parseInt(wagerInput.value)||0
  maxWager()→int: max(0,floor(bal/3))
  onWagerInput: wager=read; renderWager+renderPlaceBetState
  onWagerChange: clamp v∈[1,max]; set state.wager+input; render
  onWagerMax: max<1→ret; wager=max; input=max; coinClink; render
  placeBet(): guard(phase!='betting'&&allFilled); re-read+clamp wager; totalWager=wager*3; if >bal→ret; Wallet.spend(totalWager); Child.recordPlay?; sowSeed sound; finishOrder=Race.runRace(field); payoutDetail=Betting.resolveBetDetailed(picks,finishOrder,wager); phase='racing'; render; startRaceAnimation
  allSlotsFilled()→T/F: every slot picks!=null
  startRaceAnimation(): order=finishOrder; minRatio=0.30; ∀h∈order: deathTimes[hid]=(N>1?1-(i/(N-1))*(1-minRatio):1)*DURATION (1st full 10s, last ~3s); renderRacePanel; raceStart sound; startTime=perf.now; dead={}; winnerHid/placeHid/showHid; frame(now): elapsed=now-start; ∀h∈field: tBar=min(elapsed,death); pct=tBar/DURATION*100; bar.width=pct%; if elapsed>=death && !dead[idx]: dead[idx]=T; classify hid==winner/place/show→add row class hr-race-arrived/place/show+arkTink, else hr-race-dead+horseDie; elapsed<DURATION→rAF(frame); else raceFrameHandle=null; raceFinish sound; setTimeout(onRaceComplete,HOLD)
  onRaceComplete(): detail=payoutDetail; totalWager=wager*3; if detail.totalPayout>0→Wallet.add; profit=paid-wager; profit>0→winChime delayed, profit<0→loss delayed; phase='resolved'; render
  renderRacePanel(): build hr-noah-banner+title+list of rows w/ slot tag+rider emoji+bar track per horse; els.racePanel.innerHTML=html
  render(): phase→toggle section displays; betting: renderField+Slots+Wager+PlaceBetState+ClearBtn; racing: just show racePanel; resolved: show resultPanel+renderResult; always renderModeNote
  renderField(): clear; ∀horse: build button.hr-horse w/ classes (slot/selected); disabled if phase!='betting'; innerHTML=emoji+num+info+badge; bind click→selectHorse
  renderSlots(): ∀slot: btn.classes toggle empty/eligible; disabled unless eligible||filled; display=horse?emoji+name:eligible?'tap to assign':'click horse to fill'; innerHTML=label+pick
  renderWager(): input.max=max(1,maxWager); disable inputs unless betting&&max>=1; totalWager.text=(wager*3).toLocaleString
  renderPlaceBetState(): ok=betting&&allFilled&&wager>=1&&total<=bal; placeBetBtn.disabled=!ok
  renderClearBtn(): anyAssigned=any pick||selectedHorse; clearBtn.disabled=!betting||!anyAssigned
  renderModeNote(): isRealData→'Real Wikipedia...' real class; else cacheStatus message+mock class
  renderResult(): order/detail/totalWager/profit; build noah-banner+title+ordered list (pos,emoji,name×name,slot tag,statsLine for real); bets breakdown per slot (tier class, finishLabel, payout); totals(wager/paid/profit colored); actions(run again+leave); bind run-again→newRace
  n(x)→str: x==null?'?':x.toLocaleString
  statsLine(h,opts)→str: !h||pv null→''; m1=pv1*30,m2=pv2*30,total=m1+m2; compact:'X last 30d'; withNames:'name1: m1 + name2: m2 = total over 30 days'; default:'m1 + m2 = total over 30 days'
  escapeHtml(s)→str: replace &<>" → entities
  exports: global.WikiraceGame={init}; on DOMContentLoaded→init
*/

(function (global) {
  const SLOTS = ['win', 'place', 'show'];
  const SLOT_LABELS = { win: 'WIN', place: 'PLACE', show: 'SHOW' };
  const RACE_DURATION_MS = 10000;
  const RACE_HOLD_MS = 900;       // pause on the final state before showing results

  // 57 animal emojis. Each race assigns 9 unique ones to the field so players
  // can keep track of horses by emoji instead of just article-pair names.
  const ANIMAL_EMOJIS = [
    '🐎','🦓','🐂','🐃','🦬','🐄','🐖','🐗','🐑','🐏',
    '🐐','🐪','🦙','🦒','🦌','🐘','🦏','🦛','🐕','🐺',
    '🦊','🦝','🐈','🦁','🐅','🐆','🐻','🐨','🐼','🦘',
    '🦡','🦦','🦥','🐔','🐓','🦃','🐧','🦅','🦆','🦢',
    '🦉','🦩','🦚','🦜','🐢','🦎','🐉','🐳','🐬','🦭',
    '🦈','🐙','🦞','🦀','🦔','🐰','🦇',
  ];

  function pickEmojis(n) {
    const pool = ANIMAL_EMOJIS.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  function snd() { return global.WikiraceSound; }

  let state = {
    field: [],
    selectedHorse: null,
    picks: { win: null, place: null, show: null },
    wager: 0,
    phase: 'betting',              // 'betting' | 'racing' | 'resolved'
    finishOrder: null,
    payoutDetail: null,
    isRealData: false,
  };

  let els = {};
  let raceFrameHandle = null;

  async function init() {
    els = {
      fieldSection: document.querySelector('#hr-field').closest('.hr-section'),
      betSection:   document.querySelector('#hr-place-bet').closest('.hr-section'),
      racePanel:    document.getElementById('hr-race-panel'),
      resultPanel:  document.getElementById('hr-result'),
      field:        document.getElementById('hr-field'),
      slots: {
        win:        document.getElementById('hr-slot-win'),
        place:      document.getElementById('hr-slot-place'),
        show:       document.getElementById('hr-slot-show'),
      },
      wagerInput:   document.getElementById('hr-wager'),
      wagerMaxBtn:  document.getElementById('hr-wager-max'),
      totalWager:   document.getElementById('hr-total-wager'),
      placeBetBtn:  document.getElementById('hr-place-bet'),
      clearBtn:     document.getElementById('hr-clear'),
      modeNote:     document.getElementById('hr-mode-note'),
      loading:      document.getElementById('hr-loading'),
      loadingBar:   document.getElementById('hr-loading-bar'),
      loadingStatus:document.getElementById('hr-loading-status'),
    };

    SLOTS.forEach(function (slot) {
      els.slots[slot].addEventListener('click', function () { assignToSlot(slot); });
    });
    els.wagerInput.addEventListener('input', onWagerInput);
    els.wagerInput.addEventListener('change', onWagerChange);
    els.wagerMaxBtn.addEventListener('click', onWagerMax);
    els.placeBetBtn.addEventListener('click', placeBet);
    els.clearBtn.addEventListener('click', clearPicks);

    Wallet.onChange(render);

    await ensureLiveData();

    newRace();
  }

  // Random sample size from the full article pool — keeps warmup fast and
  // shuffles the day's roster so different articles appear across 24h cycles.
  const WARM_SAMPLE_SIZE = 200;

  function sampleArticles(pool, n) {
    const arr = pool.slice();
    const len = arr.length;
    const k = Math.min(n, len);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(Math.random() * (len - i));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, k);
  }

  // If the cache doesn't have enough verified articles for a race, kick off
  // warmCache and show a loading overlay until it's ready (or the sample fails
  // and we fall back to mock).
  async function ensureLiveData() {
    if (!global.WikiraceAPI || !global.WikiraceArticles) return;
    const need = 18;
    const status0 = WikiraceAPI.cacheStatus(WikiraceArticles);
    if (status0.fresh >= need) return;

    const sample = sampleArticles(WikiraceArticles, WARM_SAMPLE_SIZE);

    showLoading();
    updateLoading(0, sample.length, 0);
    try {
      await WikiraceAPI.warmCache(sample, function (p) {
        updateLoading(p.done, p.total, p.failed);
      });
    } catch (e) {
      console.warn('[wikirace] warmup error', e);
    }
    hideLoading();
  }

  function showLoading() {
    if (els.loading) els.loading.classList.remove('hr-hidden');
  }
  function hideLoading() {
    if (els.loading) els.loading.classList.add('hr-hidden');
  }
  function updateLoading(done, total, failed) {
    if (els.loadingBar) {
      const pct = total ? (done / total) * 100 : 0;
      els.loadingBar.style.width = pct.toFixed(1) + '%';
    }
    if (els.loadingStatus) {
      els.loadingStatus.textContent =
        done + ' / ' + total + (failed ? '   (' + failed + ' unavailable)' : '');
    }
  }

  function newRace() {
    if (raceFrameHandle) {
      cancelAnimationFrame(raceFrameHandle);
      raceFrameHandle = null;
    }
    let real = null;
    if (global.WikiraceRealHorses && WikiraceRealHorses.canGenerateRealRace()) {
      real = WikiraceRealHorses.generateRealRace();
    }
    state.field = real || WikiraceRace.generateRace();
    state.isRealData = !!real;
    // Assign each horse a unique animal emoji for the duration of this race.
    const emojis = pickEmojis(state.field.length);
    state.field.forEach(function (h, i) { h.emoji = emojis[i]; });
    state.selectedHorse = null;
    state.picks = { win: null, place: null, show: null };
    state.phase = 'betting';
    state.finishOrder = null;
    state.payoutDetail = null;
    const balance = Wallet.getBalance();
    const maxWager = Math.max(1, Math.floor(balance / 3));
    if (!state.wager || state.wager > maxWager) state.wager = Math.min(state.wager || 1, maxWager);
    if (state.wager < 1) state.wager = 1;
    els.wagerInput.value = String(state.wager);
    render();
  }

  function horseId(h) { return h.name1 + '|' + h.name2; }
  function sameHorse(a, b) { return a && b && horseId(a) === horseId(b); }

  function findSlotOf(horse) {
    for (let i = 0; i < SLOTS.length; i++) {
      if (sameHorse(state.picks[SLOTS[i]], horse)) return SLOTS[i];
    }
    return null;
  }

  function firstEmptySlot() {
    for (let i = 0; i < SLOTS.length; i++) {
      if (state.picks[SLOTS[i]] === null) return SLOTS[i];
    }
    return null;
  }

  // Click logic:
  //  - Click an unassigned horse with an empty slot → fills WIN/PLACE/SHOW in order.
  //  - Click an unassigned horse with all slots full → selects it (waiting for slot click to swap).
  //  - Click an already-assigned horse → removes it from its slot (free that slot).
  //  - Click the same selected horse again → deselects.
  function selectHorse(horse) {
    if (state.phase !== 'betting') return;
    const currentSlot = findSlotOf(horse);
    if (currentSlot) {
      state.picks[currentSlot] = null;
      state.selectedHorse = null;
      if (snd()) snd().horseSelect();
      render();
      return;
    }
    if (sameHorse(state.selectedHorse, horse)) {
      state.selectedHorse = null;
      if (snd()) snd().horseSelect();
      render();
      return;
    }
    const empty = firstEmptySlot();
    if (empty) {
      state.picks[empty] = horse;
      state.selectedHorse = null;
      if (snd()) snd().slotAssign();
    } else {
      state.selectedHorse = horse;
      if (snd()) snd().horseSelect();
    }
    render();
  }

  // Slot button click:
  //  - With a selected horse → assign it here (replacing any current occupant).
  //  - Without a selection but slot is filled → clear the slot.
  //  - Otherwise no-op.
  function assignToSlot(slot) {
    if (state.phase !== 'betting') return;
    if (state.selectedHorse) {
      const currentSlot = findSlotOf(state.selectedHorse);
      if (currentSlot && currentSlot !== slot) state.picks[currentSlot] = null;
      state.picks[slot] = state.selectedHorse;
      state.selectedHorse = null;
      if (snd()) snd().slotAssign();
      render();
      return;
    }
    if (state.picks[slot]) {
      state.picks[slot] = null;
      if (snd()) snd().clearPick();
      render();
    }
  }

  function clearPicks() {
    if (state.phase !== 'betting') return;
    state.picks = { win: null, place: null, show: null };
    state.selectedHorse = null;
    if (snd()) snd().clearPick();
    render();
  }

  function readWagerInput() {
    const v = parseInt(els.wagerInput.value, 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  function maxWager() {
    return Math.max(0, Math.floor(Wallet.getBalance() / 3));
  }
  function onWagerInput() {
    state.wager = readWagerInput();
    renderWager();
    renderPlaceBetState();
  }
  function onWagerChange() {
    const max = maxWager();
    let v = readWagerInput();
    if (v < 1) v = 1;
    if (v > max && max > 0) v = max;
    state.wager = v;
    els.wagerInput.value = String(v);
    renderWager();
    renderPlaceBetState();
  }
  function onWagerMax() {
    const max = maxWager();
    if (max < 1) return;
    state.wager = max;
    els.wagerInput.value = String(max);
    if (snd()) snd().coinClink();
    renderWager();
    renderPlaceBetState();
  }

  function placeBet() {
    if (state.phase !== 'betting') return;
    if (!allSlotsFilled()) return;
    // Re-read the input as the source of truth and clamp before locking it in.
    // Prevents a stale state.wager (e.g. from a half-typed input) from being used.
    const balance = Wallet.getBalance();
    const max = Math.max(1, Math.floor(balance / 3));
    let wager = readWagerInput();
    if (wager < 1) wager = 1;
    if (wager > max) wager = max;
    state.wager = wager;
    els.wagerInput.value = String(wager);
    const totalWager = wager * 3;
    if (totalWager > balance) return;

    Wallet.spend(totalWager);
    if (window.Child) Child.recordPlay();
    if (snd()) snd().sowSeed();

    state.finishOrder = WikiraceRace.runRace(state.field);
    state.payoutDetail = WikiraceBetting.resolveBetDetailed(state.picks, state.finishOrder, wager);
    state.phase = 'racing';
    render();
    startRaceAnimation();
  }

  function allSlotsFilled() {
    return SLOTS.every(function (s) { return state.picks[s] !== null; });
  }

  // ===== Race animation =====

  function startRaceAnimation() {
    const order = state.finishOrder;
    const N = order.length;
    // Death time is mapped from finish rank (not raw pageview ratio) so that
    // the visual stays evenly spread regardless of pageview spread. With raw
    // pageviews driving the outcome, ratios can easily be 10× or 100× — that
    // would make all bottom-half horses die in the first second, leaving the
    // top horse running alone. Rank-based: 1st runs the full 10s, 9th runs ~3s.
    const minRatio = 0.30;
    const deathTimes = {};
    order.forEach(function (h, i) {
      const t = N > 1 ? 1 - (i / (N - 1)) * (1 - minRatio) : 1;
      deathTimes[horseId(h)] = t * RACE_DURATION_MS;
    });
    renderRacePanel();
    if (snd()) snd().raceStart();
    const startTime = performance.now();
    const dead = {};
    const winnerHid = horseId(order[0]);
    const placeHid = order[1] ? horseId(order[1]) : null;
    const showHid  = order[2] ? horseId(order[2]) : null;

    function frame(now) {
      const elapsed = now - startTime;
      state.field.forEach(function (h, idx) {
        const death = deathTimes[horseId(h)];
        const tBar = Math.min(elapsed, death);
        const pct = (tBar / RACE_DURATION_MS) * 100;
        const bar = document.getElementById('hr-bar-' + idx);
        const row = document.getElementById('hr-row-' + idx);
        if (bar) bar.style.width = pct.toFixed(2) + '%';
        if (row && elapsed >= death && !dead[idx]) {
          dead[idx] = true;
          const hid = horseId(h);
          if (hid === winnerHid) {
            // Reached the ark — TINK!
            row.classList.add('hr-race-arrived');
            if (snd()) snd().arkTink();
          } else if (hid === placeHid) {
            // 2nd place — silver medal.
            row.classList.add('hr-race-place');
            if (snd()) snd().arkTink();
          } else if (hid === showHid) {
            // 3rd place — bronze medal.
            row.classList.add('hr-race-show');
            if (snd()) snd().arkTink();
          } else {
            // Did not make it — washed away by the flood.
            row.classList.add('hr-race-dead');
            if (snd()) snd().horseDie();
          }
        }
      });
      if (elapsed < RACE_DURATION_MS) {
        raceFrameHandle = requestAnimationFrame(frame);
      } else {
        raceFrameHandle = null;
        if (snd()) snd().raceFinish();
        setTimeout(onRaceComplete, RACE_HOLD_MS);
      }
    }

    raceFrameHandle = requestAnimationFrame(frame);
  }

  function onRaceComplete() {
    const detail = state.payoutDetail;
    const totalWager = state.wager * 3;
    if (detail && detail.totalPayout > 0) {
      Wallet.add(detail.totalPayout);
    }
    if (snd()) {
      const profit = (detail ? detail.totalPayout : 0) - totalWager;
      if (profit > 0) setTimeout(snd().winChime, 250);
      else if (profit < 0) setTimeout(snd().loss, 250);
    }
    state.phase = 'resolved';
    render();
  }

  function renderRacePanel() {
    let html =
      '<div class="hr-noah-banner">' +
        '<span class="hr-noah-figure" aria-hidden="true">👴🏼</span>' +
        '<span class="hr-noah-call">Hurry, little ones! Noah is closing the door!</span>' +
        '<span class="hr-noah-ark" aria-hidden="true">🚢</span>' +
      '</div>' +
      '<h2 class="hr-race-title">Race to the Ark</h2>';
    html += '<div class="hr-race-list">';
    state.field.forEach(function (h, idx) {
      const slot = findSlotOf(h);
      const slotTag = slot
        ? '<span class="hr-race-pick-tag hr-tag-' + slot + '">' + SLOT_LABELS[slot] + '</span> '
        : '';
      const rider = h.emoji ? '<span class="hr-race-rider">' + h.emoji + '</span>' : '';
      html +=
        '<div id="hr-row-' + idx + '" class="hr-race-row" data-pick="' + (slot || '') + '">' +
          '<div class="hr-race-row-label">' +
            '<span class="hr-race-name">' + slotTag + escapeHtml(h.name1) + ' × ' + escapeHtml(h.name2) + '</span>' +
          '</div>' +
          '<div class="hr-race-bar-track">' +
            '<div id="hr-bar-' + idx + '" class="hr-race-bar">' + rider + '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    els.racePanel.innerHTML = html;
  }

  // ===== Render =====

  function render() {
    if (state.phase === 'betting') {
      els.fieldSection.style.display = '';
      els.betSection.style.display = '';
      els.racePanel.style.display = 'none';
      els.resultPanel.style.display = 'none';
      renderField();
      renderSlots();
      renderWager();
      renderPlaceBetState();
      renderClearBtn();
    } else if (state.phase === 'racing') {
      els.fieldSection.style.display = 'none';
      els.betSection.style.display = 'none';
      els.racePanel.style.display = '';
      els.resultPanel.style.display = 'none';
    } else if (state.phase === 'resolved') {
      els.fieldSection.style.display = 'none';
      els.betSection.style.display = 'none';
      els.racePanel.style.display = 'none';
      els.resultPanel.style.display = '';
      renderResult();
    }
    renderModeNote();
  }

  function renderField() {
    els.field.innerHTML = '';
    state.field.forEach(function (horse, idx) {
      const slot = findSlotOf(horse);
      const selected = sameHorse(state.selectedHorse, horse);
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'hr-horse' +
        (slot ? ' hr-horse-assigned hr-horse-' + slot : '') +
        (selected ? ' hr-horse-selected' : '');
      div.disabled = state.phase !== 'betting';
      const emoji = '<span class="hr-horse-emoji">' + (horse.emoji || '') + '</span>';
      const num = '<span class="hr-horse-num">' + (idx + 1) + '</span>';
      const info =
        '<div class="hr-horse-info">' +
          '<span class="hr-horse-name">' + escapeHtml(horse.name1) + ' × ' + escapeHtml(horse.name2) + '</span>' +
        '</div>';
      const badge = slot ? '<span class="hr-horse-badge">' + SLOT_LABELS[slot] + '</span>' : '';
      div.innerHTML = emoji + num + info + badge;
      div.addEventListener('click', function () { selectHorse(horse); });
      els.field.appendChild(div);
    });
  }

  function renderSlots() {
    SLOTS.forEach(function (slot) {
      const btn = els.slots[slot];
      const horse = state.picks[slot];
      const slotLabel = SLOT_LABELS[slot];
      const empty = !horse;
      const eligible = !!state.selectedHorse && state.phase === 'betting';
      const filled = !empty;
      btn.classList.toggle('hr-slot-empty', empty);
      btn.classList.toggle('hr-slot-eligible', eligible);
      // Enabled if: a horse is selected (assign), or this slot is filled (click to clear).
      btn.disabled = state.phase !== 'betting' || (!eligible && !filled);
      let display;
      if (horse) {
        display = (horse.emoji ? horse.emoji + ' ' : '') + escapeHtml(horse.name1) + ' × ' + escapeHtml(horse.name2);
      } else if (eligible) {
        display = 'tap to assign selected horse';
      } else {
        display = 'click a horse to fill';
      }
      btn.innerHTML =
        '<span class="hr-slot-label">' + slotLabel + '</span>' +
        '<span class="hr-slot-pick">' + display + '</span>';
    });
  }

  function renderWager() {
    const max = maxWager();
    els.wagerInput.max = String(Math.max(1, max));
    els.wagerInput.disabled = state.phase !== 'betting';
    els.wagerMaxBtn.disabled = state.phase !== 'betting' || max < 1;
    const total = state.wager * 3;
    els.totalWager.textContent = total.toLocaleString();
  }

  function renderPlaceBetState() {
    const total = state.wager * 3;
    const ok = state.phase === 'betting' &&
               allSlotsFilled() &&
               state.wager >= 1 &&
               total <= Wallet.getBalance();
    els.placeBetBtn.disabled = !ok;
  }

  function renderClearBtn() {
    const anyAssigned = SLOTS.some(function (s) { return state.picks[s] !== null; }) || state.selectedHorse;
    els.clearBtn.disabled = state.phase !== 'betting' || !anyAssigned;
  }

  function renderModeNote() {
    if (!els.modeNote) return;
    if (state.isRealData) {
      els.modeNote.textContent = 'Real Wikipedia pageview data — past 30 days.';
      els.modeNote.classList.remove('hr-mode-mock');
      els.modeNote.classList.add('hr-mode-real');
    } else {
      const status = WikiraceAPI.cacheStatus(WikiraceArticles || []);
      els.modeNote.textContent = 'Mock data — only ' + status.fresh + ' verified Wikipedia articles cached (need 18+).';
      els.modeNote.classList.remove('hr-mode-real');
      els.modeNote.classList.add('hr-mode-mock');
    }
  }

  function renderResult() {
    const order = state.finishOrder;
    const detail = state.payoutDetail;
    const totalWager = state.wager * 3;
    const profit = detail.totalPayout - totalWager;

    const winnerName = (state.finishOrder[0] && state.finishOrder[0].name1) || '';
    let html =
      '<div class="hr-result-noah">' +
        '<span class="hr-noah-figure-big" aria-hidden="true">👴🏼</span>' +
        '<div class="hr-noah-speech">' +
          '<div class="hr-noah-quote">"Welcome aboard, little ones. Two by two."</div>' +
          '<div class="hr-noah-rainbow" aria-hidden="true">🌈</div>' +
        '</div>' +
      '</div>' +
      '<h2 class="hr-result-title">All Aboard the Ark</h2>';
    html += '<ol class="hr-result-order">';
    order.forEach(function (h, i) {
      const slot = findSlotOf(h);
      const tag = slot ? ' <span class="hr-result-tag hr-tag-' + slot + '">' + SLOT_LABELS[slot] + '</span>' : '';
      const pageviews = state.isRealData
        ? '<span class="hr-result-views">' + statsLine(h, { withNames: true }) + '</span>'
        : '';
      const emoji = h.emoji ? '<span class="hr-result-emoji">' + h.emoji + '</span> ' : '';
      html += '<li><span class="hr-result-pos">' + (i + 1) + '</span> ' + emoji +
              escapeHtml(h.name1) + ' × ' + escapeHtml(h.name2) + tag + pageviews + '</li>';
    });
    html += '</ol>';

    html += '<div class="hr-result-bets">';
    SLOTS.forEach(function (slot) {
      const d = detail[slot];
      const finishLabel = d.finishPos === -1 ? '—' : ('finish ' + (d.finishPos + 1));
      const tierClass = 'hr-tier-' + d.tier;
      html += '<div class="hr-result-bet ' + tierClass + '">' +
                '<span class="hr-result-bet-slot">' + SLOT_LABELS[slot] + '</span>' +
                '<span class="hr-result-bet-horse">' + escapeHtml(d.horse.name1) + ' × ' + escapeHtml(d.horse.name2) + '</span>' +
                '<span class="hr-result-bet-finish">' + finishLabel + '</span>' +
                '<span class="hr-result-bet-paid">' + (d.payout > 0 ? '+' + d.payout : '—') + '</span>' +
              '</div>';
    });
    html += '</div>';

    html += '<div class="hr-result-totals">';
    html += '<div>Total wager: <strong>' + totalWager + '</strong></div>';
    html += '<div>Total paid: <strong>' + detail.totalPayout + '</strong></div>';
    html += '<div class="hr-result-profit ' + (profit >= 0 ? 'hr-profit-up' : 'hr-profit-down') + '">' +
              (profit >= 0 ? '+' + profit : profit) + ' coins</div>';
    html += '</div>';

    html += '<div class="hr-result-actions">' +
              '<button id="hr-race-again" type="button">Run Again</button>' +
              '<a class="hr-leave" href="../index.html">Leave the Sanctuary</a>' +
            '</div>';

    els.resultPanel.innerHTML = html;
    els.resultPanel.classList.add('hr-result-visible');
    document.getElementById('hr-race-again').addEventListener('click', newRace);
  }

  function n(x) {
    return (x == null ? '?' : x.toLocaleString());
  }

  // 30-day pageview breakdown for a horse.
  //   compact:   "6,195,000 last 30d"
  //   withNames: "Pizza: 1,926,000 + Albert Einstein: 4,269,000 = 6,195,000 over 30 days"
  //   default:   "1,926,000 + 4,269,000 = 6,195,000 over 30 days"
  function statsLine(h, opts) {
    if (!h || h.pageviews1 == null || h.pageviews2 == null) return '';
    const m1 = h.pageviews1 * 30;
    const m2 = h.pageviews2 * 30;
    const total = m1 + m2;
    if (opts && opts.compact) {
      return n(total) + ' last 30d';
    }
    if (opts && opts.withNames) {
      return h.name1 + ': ' + n(m1) + ' + ' +
             h.name2 + ': ' + n(m2) + ' = ' +
             n(total) + ' over 30 days';
    }
    return n(m1) + ' + ' + n(m2) + ' = ' + n(total) + ' over 30 days';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.WikiraceGame = { init: init };
  document.addEventListener('DOMContentLoaded', init);
})(window);
