/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/CHAVEZ — page controller: UI glue, action buttons, animation  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► DOMContentLoaded ──► init()                           │
  │                                                                          │
  │   init():                                                                │
  │     ├─ buildState() ──► read persist or createMatch({100,50})            │
  │     │     persisted.complete & !won → location.replace('child-died.html')│
  │     │     persisted.complete & won  → frozen state + dispatchWinLetter   │
  │     ├─ bindRefs() / bindActions() / bindPresets()                        │
  │     ├─ BFHoldem.startHand(state)                                         │
  │     └─ render() ──► if toAct=='chavez' scheduleChavez()                  │
  │                                                                          │
  │   render() repaints everything (cheap; rebuilds card DOM each tick):     │
  │     - stack numbers, pot, blinds, hand #, button chip                    │
  │     - player hole face-up, chavez hole face-down (unless showdown)       │
  │     - community board                                                    │
  │     - bet pucks beside each seat                                         │
  │     - hand-strength readout (player only, from flop onwards)             │
  │     - turn-status banner ("Your turn" / "Chavez is considering…")        │
  │     - 3 action buttons: Fold | passive(check|call) | aggro(bet|raise)    │
  │     - sizing presets + slider (min/half/pot/all-in)                      │
  │     - Chavez kaomoji face cycle (520 ms tick) — mood from stack depth    │
  │       in big blinds:                                                     │
  │         broken (0) / desperate (≤3 BB) / short (≤8) / even (≤15)         │
  │         / comfortable (≤30) / dominant (>30)                             │
  │       Tell line reads the mood unless he's deliberating (then            │
  │       "considering…"). Frames cycle independent of render ticks.         │
  │                                                                          │
  │   Action buttons (mutex by legal action):                                │
  │     #bf-act-fold      → fold                                             │
  │     #bf-act-passive   → "Check" if toCall==0, "Call N" if toCall>0       │
  │     #bf-act-aggro     → "Bet N" if no bet, "Raise to N" if facing one    │
  │                          where N comes from the slider value             │
  │                                                                          │
  │   Sizing presets:                                                        │
  │     Min     → slider.value = minBet / minRaiseTo                         │
  │     ½ Pot   → slider.value = max(min, oppBet + ½·pot)  (capped to max)   │
  │     Pot     → slider.value = max(min, oppBet + pot)                      │
  │     All-in  → slider.value = max                                         │
  │                                                                          │
  │   Chavez turn: scheduleChavez(delay) sets is-thinking + status text,     │
  │     after delay calls BFAI.decide → BFHoldem.act → render → continue.    │
  │                                                                          │
  │   handEndFlow():                                                         │
  │     ├─ reveal Chavez hole on showdown (render handles via showChavezHole)│
  │     ├─ summary line into log                                             │
  │     ├─ persistMatch()                                                    │
  │     ├─ state.complete & !won → location.replace('child-died.html')       │
  │     ├─ state.complete &  won → markBeaten + dispatchWinLetter()          │
  │     └─ else 2.4s pause → nextHand → startHand → render                   │
  │                                                                          │
  │   dispatchWinLetter():                                                   │
  │     calls window.Letters.dispatch('note_002_chavez_dismissed').          │
  │     The letter's onClose ({type:'navigate',page:'index.html'}) sends     │
  │     them back to the lobby. If dispatch fails for any reason, fall back  │
  │     to a direct lobby navigation.                                        │
  │                                                                          │
  │   Storage:                                                               │
  │     R/W localStorage['wendys_palace_boss_chavez'] =                      │
  │       { active, complete, won, snapshot:{playerChips, chavezChips,       │
  │                                            handNumber, buttonOnPlayer} } │
  │     W (on win) localStorage['wendys_palace_bosses_beaten']               │
  │                                                                          │
  │   Exports: none (IIFE scoped)                                            │
  │   External deps: window.BFHoldem, window.BFAI, window.Letters            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  KEY='wendys_palace_boss_chavez'; BEATEN_KEY='wendys_palace_bosses_beaten'
  START={playerChips:100, chavezChips:50}
  readPersist/writePersist/markBeaten as before
  buildState()→state|null: p=readPersist; p.complete&!won→redirect child-died ret null; p.complete&won→createMatch(snapshot, chavez=0), s.complete=T,s.won=T ret s; p&&snapshot→createMatch(snapshot)+restore handNo/button; else createMatch(START)+persist
  cardEl(card,faceDown)→el; renderCards(container,cards,faceDown)
  showChavezHole()→state.handResult?.type==='showdown'
  CHAVEZ_MOODS[6]: broken/desperate/short/even/comfortable/dominant w/ frames[4]+tell, bbMax thresholds 0/3/8/15/30/∞
  chavezMood()→mood: depth=chavezChips/bb; first mood with depth≤bbMax
  updateChavezFace(): m=chavezMood; mood-id change→reset frame+seat.dataset.mood=m.id; face.text=frames[frame%4]; frame++; tell.text=is-thinking?'considering…':m.tell
  startFaceCycle/stopFaceCycle: setInterval(updateChavezFace,520)
  handStrengthText(): board.length<3→''; else BFHoldem.handName(evalBest(playerHole+board))
  turnStatusText(): complete?'—':state.handResult?'— hand settling —':toAct==='player'?'Your turn':'Chavez is considering…'
  render(): handNo/blinds/stacks/pot; renderCards player(F)/chavez(showChavezHole?F:T)/community(F); bet pucks; hand-strength; turn-status; passive btn label (Check/Call N); aggro btn label (Bet N/Raise to N from slider); slider bounds = la.canRaise?[minRaiseTo,maxRaiseTo]:la.canBet?[minBet,maxBet]:[0,0]; hide/show fold/passive/aggro per legal; sizing visible iff canBet||canRaise
  presetValue(name,la)→int: 'min'→minRaiseTo||minBet; 'half'→clamp(oppBet+ceil(pot/2),lo,hi); 'pot'→clamp(oppBet+pot,lo,hi); 'all'→maxRaiseTo||maxBet
  setSlider(v): clamp; update display + aggro label
  doAction(who,action,amount): BFHoldem.act; log; render; terminal→handEndFlow; chavez→scheduleChavez(700+rnd*700)
  scheduleChavez(delay): is-thinking on seat+status; setTimeout→BFAI.decide→doAction('chavez',...)
  handEndFlow(): render; summary log; persistMatch; complete&!won→child-died; complete&won→markBeaten+dispatchWinLetter; else setTimeout 2400→nextHand+persistMatch+startHand+render+'— Hand N —' log+chavez first?scheduleChavez
  dispatchWinLetter(): Letters.dispatch('note_002_chavez_dismissed').then(shown→!shown→lobby).catch(→lobby)
  bindRefs / bindActions (fold/passive/aggro click + slider input) / bindPresets (preset[data-preset] click → setSlider(presetValue))
  init(): state=buildState; !state→ret; bindRefs+bindActions+bindPresets; state.complete&won→render(frozen)+dispatchWinLetter ret; BFHoldem.startHand; render; log '— Hand N —'; toAct==='chavez'→scheduleChavez(1100)
*/

(function (global) {
  const KEY = 'wendys_palace_boss_chavez';
  const BEATEN_KEY = 'wendys_palace_bosses_beaten';
  const FIGHTS_KEY = 'wendys_palace_chavez_fights_completed';

  // Each successive fight gives Chavez +25 more chips. First fight is
  // 100 vs 25, second is 100 vs 50, third is 100 vs 75, etc.
  function startingStacks() {
    let n = 0;
    try { n = parseInt(localStorage.getItem(FIGHTS_KEY) || '0', 10); } catch {}
    if (!isFinite(n) || n < 0) n = 0;
    return { playerChips: 100, chavezChips: 25 + 25 * n };
  }

  let state = null;
  let refs = {};
  let chavezTimer = null;
  let faceTimer = null;
  let faceFrame = 0;
  let currentMood = null;
  // Tracks whether chavez's hole cards were face-down last render, so we
  // can fire the card-flip sound exactly once on the showdown reveal.
  let prevChavezHidden = true;

  // Chavez kaomoji portrait — mood driven by stack depth in big blinds.
  // Style: institutional cubicle face, two vertical bars suggest a suit collar.
  const CHAVEZ_MOODS = [
    { id: 'broken',     bbMax: 0,    tell: '—',                          frames: ['▌ ✗_✗ ▐', '▌ x_x ▐', '▌ ✗_✗ ▐', '▌ x_x ▐'] },
    { id: 'desperate',  bbMax: 3,    tell: 'sweating',                   frames: ['▌ ⊙_⊙; ▐', '▌ ⊙~⊙ ▐', '▌ ⊙_⊙; ▐', '▌ Ô~Ô ▐'] },
    { id: 'short',      bbMax: 8,    tell: 'watching the door',          frames: ['▌ ò_ó ▐', '▌ •_• ▐', '▌ ò_ó ▐', '▌ ò~ó ▐'] },
    { id: 'even',       bbMax: 15,   tell: 'writing on the pad',         frames: ['▌ ô_ô ▐', '▌ —_— ▐', '▌ ô_ô ▐', '▌ —.— ▐'] },
    { id: 'comfortable',bbMax: 30,   tell: 'patient',                    frames: ['▌ —_— ▐', '▌ -_- ▐', '▌ —_— ▐', '▌ ¬_¬ ▐'] },
    { id: 'dominant',   bbMax: 9999, tell: 'amused',                     frames: ['▌ ¬‿¬ ▐', '▌ ¬_¬ ▐', '▌ ¬‿¬ ▐', '▌ ‿‿‿ ▐'] },
  ];

  function chavezMood() {
    if (state.chavezChips <= 0) return CHAVEZ_MOODS[0];
    const bb = global.BFHoldem.blindsFor(state.handNumber).bb;
    const depth = state.chavezChips / bb;
    for (const m of CHAVEZ_MOODS) {
      if (depth <= m.bbMax) return m;
    }
    return CHAVEZ_MOODS[CHAVEZ_MOODS.length - 1];
  }

  function updateChavezFace() {
    if (!refs.chavezFace) return;
    const m = chavezMood();
    if (!currentMood || currentMood.id !== m.id) {
      faceFrame = 0;
      currentMood = m;
      if (refs.chavezPortrait) refs.chavezPortrait.dataset.mood = m.id;
      if (refs.portraitMood) refs.portraitMood.textContent = m.id;
    }
    refs.chavezFace.textContent = m.frames[faceFrame % m.frames.length];
    faceFrame++;
    if (refs.chavezTell) {
      const isThinking = refs.chavezPortrait && refs.chavezPortrait.classList.contains('is-thinking');
      refs.chavezTell.textContent = isThinking ? 'considering…' : m.tell;
    }
  }

  function startFaceCycle() {
    stopFaceCycle();
    faceTimer = setInterval(updateChavezFace, 520);
    updateChavezFace();
  }

  function stopFaceCycle() {
    if (faceTimer) { clearInterval(faceTimer); faceTimer = null; }
  }

  function $(id) { return document.getElementById(id); }

  function readPersist() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function writePersist(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
  }
  function markBeaten(id) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(BEATEN_KEY) || '[]'); } catch {}
    if (!Array.isArray(list)) list = [];
    if (!list.includes(id)) list.push(id);
    try { localStorage.setItem(BEATEN_KEY, JSON.stringify(list)); } catch {}
  }

  function persistMatch() {
    writePersist({
      active: !state.complete,
      complete: !!state.complete,
      won: !!state.won,
      snapshot: {
        playerChips: state.playerChips,
        chavezChips: state.chavezChips,
        handNumber: state.handNumber,
        buttonOnPlayer: state.buttonOnPlayer,
      },
    });
  }

  function buildState() {
    const p = readPersist();
    if (p && p.complete) {
      // Frozen replay state — same for win and loss. Splash is rendered
      // in init() based on p.won.
      const initial = startingStacks();
      const snap = p.snapshot || { playerChips: initial.playerChips, chavezChips: 0,
                                   handNumber: 1, buttonOnPlayer: true };
      const s = global.BFHoldem.createMatch({
        playerChips: p.won ? snap.playerChips : 0,
        chavezChips: p.won ? 0 : snap.chavezChips,
      });
      s.handNumber = snap.handNumber || 1;
      s.buttonOnPlayer = snap.buttonOnPlayer !== false;
      s.complete = true;
      s.won = !!p.won;
      return s;
    }
    if (p && p.snapshot) {
      const s = global.BFHoldem.createMatch({
        playerChips: p.snapshot.playerChips,
        chavezChips: p.snapshot.chavezChips,
      });
      s.handNumber = p.snapshot.handNumber || 1;
      s.buttonOnPlayer = p.snapshot.buttonOnPlayer !== false;
      return s;
    }
    const s = global.BFHoldem.createMatch(startingStacks());
    writePersist({
      active: true, complete: false, won: false,
      snapshot: {
        playerChips: s.playerChips, chavezChips: s.chavezChips,
        handNumber: s.handNumber, buttonOnPlayer: s.buttonOnPlayer,
      },
    });
    return s;
  }

  // ───────────────────────── Rendering ─────────────────────────

  function cardEl(card, faceDown) {
    const el = document.createElement('div');
    el.className = 'bf-card';
    if (faceDown) {
      el.classList.add('bf-card-back');
      // Eye-on-wheel back: a single eye motif with a halo ring.
      el.innerHTML = '<div class="bf-card-eye"></div>';
      return el;
    }
    el.style.color = card.color;
    el.classList.add('bf-suit-' + card.suit);
    el.innerHTML =
      '<span class="bf-card-rank">' + global.BFHoldem.rankLabel(card.rank) + '</span>' +
      '<span class="bf-card-suit">' + global.BFHoldem.GLYPHS[card.suit] + '</span>';
    return el;
  }

  function renderCards(container, cards, allFaceDown) {
    if (!container) return;
    // Skip rebuild if the visible cards haven't changed — otherwise the
    // bf-card-in entrance animation re-fires on every state tick and the
    // cards visually "flash" on every action.
    const key = cards.map(function (c) { return c.rank + c.suit; }).join(',')
              + '|' + (allFaceDown ? 'd' : 'u');
    if (container.dataset.cardsKey === key) return;
    container.dataset.cardsKey = key;
    container.innerHTML = '';
    for (const c of cards) container.appendChild(cardEl(c, allFaceDown));
  }

  // Mark only the cards that actually contribute to the player's hand —
  // no kickers, no highlights for plain high-card.
  //   cat 1 high card    → nothing
  //   cat 2 pair         → the 2 paired cards
  //   cat 3 two pair     → both pairs (4 cards)
  //   cat 4 trips        → the 3 trip cards
  //   cat 5 straight     → all 5
  //   cat 6 flush        → all 5
  //   cat 7 full house   → all 5
  //   cat 8 quads        → the 4 quad cards
  //   cat 9 straight fl. → all 5
  function contributingCards(best) {
    if (!best || !best.cards) return [];
    const cat = best.cat, tb = best.tb;
    if (cat === 1) return [];                             // high card — no hand
    if (cat === 5 || cat === 6 || cat === 7 || cat === 9) return best.cards;
    const ranksThatMatter = new Set();
    if (cat === 2 || cat === 4 || cat === 8) ranksThatMatter.add(tb[0]);
    else if (cat === 3) { ranksThatMatter.add(tb[0]); ranksThatMatter.add(tb[1]); }
    return best.cards.filter(function (c) { return ranksThatMatter.has(c.rank); });
  }

  function markBestCards() {
    function clearAll() {
      const all = document.querySelectorAll('.bf-card.is-best');
      for (let i = 0; i < all.length; i++) all[i].classList.remove('is-best');
    }
    if (!state.board || state.board.length < 3) { clearAll(); return; }
    if (!state.playerHole || state.playerHole.length < 2) { clearAll(); return; }

    const best = global.BFHoldem.evalBest(state.playerHole.concat(state.board));
    const winning = contributingCards(best);
    if (winning.length === 0) { clearAll(); return; }

    function isWinning(card) {
      return winning.some(function (b) {
        return b.rank === card.rank && b.suit === card.suit;
      });
    }
    const playerEls = refs.playerCards.querySelectorAll('.bf-card');
    for (let i = 0; i < playerEls.length; i++) {
      playerEls[i].classList.toggle('is-best', isWinning(state.playerHole[i]));
    }
    const boardEls = refs.community.querySelectorAll('.bf-card');
    for (let i = 0; i < boardEls.length; i++) {
      boardEls[i].classList.toggle('is-best', isWinning(state.board[i]));
    }
  }

  function showChavezHole() {
    if (state.handResult && state.handResult.type === 'showdown') return true;
    // Anyone all-in → betting is closed (engine runs it out), so flip the
    // boss's hole cards so the player can sweat the runout for real.
    if (state.chavezAllIn || state.playerAllIn) return true;
    return false;
  }

  function handStrengthText() {
    if (!state.board || state.board.length < 3) return '';
    if (!state.playerHole || state.playerHole.length < 2) return '';
    const e = global.BFHoldem.evalBest(state.playerHole.concat(state.board));
    return 'Your hand · ' + global.BFHoldem.handName(e);
  }

  function turnStatusText() {
    if (state.complete) {
      return state.won ? '— the wheel has stopped —' : '— the wheel has stopped —';
    }
    if (state.handResult) return '— hand settling —';
    if (state.toAct === 'player') return 'Your turn';
    return 'Chavez is considering…';
  }

  function setText(el, t) {
    if (el && el.textContent !== t) el.textContent = t;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function presetValue(name, la) {
    const pot = state.pot;
    if (la.canRaise) {
      const lo = la.minRaiseTo, hi = la.maxRaiseTo;
      const oppBet = la.who === 'player' ? state.chavezBet : state.playerBet;
      if (name === 'min')  return lo;
      if (name === 'half') return clamp(oppBet + Math.ceil(pot / 2), lo, hi);
      if (name === 'pot')  return clamp(oppBet + pot, lo, hi);
      if (name === 'all')  return hi;
    } else if (la.canBet) {
      const lo = la.minBet, hi = la.maxBet;
      if (name === 'min')  return lo;
      if (name === 'half') return clamp(Math.ceil(pot / 2), lo, hi);
      if (name === 'pot')  return clamp(pot, lo, hi);
      if (name === 'all')  return hi;
    }
    return 0;
  }

  function setSliderValue(v, selectedPreset) {
    refs.raise.value = String(v);
    refs.raiseValue.textContent = String(v);
    updateAggroLabel();
    // Highlight the matching preset chip (or clear if user dragged slider)
    document.querySelectorAll('.bf-preset').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.preset === selectedPreset);
    });
  }

  function updateAggroLabel() {
    const la = global.BFHoldem.legalActions(state);
    const v = parseInt(refs.raise.value || '0', 10);
    if (la.canRaise) refs.btnAggro.textContent = 'Raise to ' + v;
    else if (la.canBet) refs.btnAggro.textContent = 'Bet ' + v;
    else refs.btnAggro.textContent = 'Bet';
  }

  const STREET_LABELS = {
    preflop:  'PRE-FLOP',
    flop:     'FLOP',
    turn:     'TURN',
    river:    'RIVER',
    showdown: 'SHOWDOWN',
    idle:     '—',
  };

  function render() {
    setText(refs.handNo, String(state.handNumber));
    const bl = global.BFHoldem.blindsFor(state.handNumber);
    setText(refs.blinds, bl.sb + '/' + bl.bb);
    setText(refs.playerStack, String(state.playerChips));
    setText(refs.chavezStack, String(state.chavezChips));
    setText(refs.pot, String(state.pot));
    setText(refs.street, STREET_LABELS[state.street] || '—');

    // Pot brightness scales with pot size. Caps at 1 around 80 chips,
    // which is most of the time when betting gets meaningful.
    if (refs.pot && refs.pot.parentElement) {
      const intensity = Math.min(1, state.pot / 80);
      refs.pot.parentElement.style.setProperty('--pot-intensity', intensity.toFixed(3));
    }

    // Big stakes bar — just chips, no jargon
    setText(refs.stakesPlayer, String(state.playerChips));
    setText(refs.stakesPot,    String(state.pot));
    setText(refs.stakesChavez, String(state.chavezChips));
    // "TO CALL" chip beside the pot — only when facing a live bet,
    // otherwise blank (no "—" placeholder cluttering the bar).
    if (state.toAct === 'player' && !state.handResult && !state.complete) {
      const la0 = global.BFHoldem.legalActions(state);
      if (la0.toCall > 0) {
        setText(refs.stakesCall, 'call ' + la0.toCall);
        if (refs.stakesCall) refs.stakesCall.classList.add('is-call');
      } else {
        setText(refs.stakesCall, '');
        if (refs.stakesCall) refs.stakesCall.classList.remove('is-call');
      }
    } else {
      setText(refs.stakesCall, '');
      if (refs.stakesCall) refs.stakesCall.classList.remove('is-call');
    }

    // Pot odds line — only when facing a bet
    if (state.toAct === 'player' && !state.handResult && !state.complete) {
      const la = global.BFHoldem.legalActions(state);
      if (la.toCall > 0) {
        const oddsPct = Math.round(100 * la.toCall / (state.pot + la.toCall));
        setText(refs.potOdds, oddsPct + '% to call');
      } else {
        setText(refs.potOdds, '');
      }
    } else {
      setText(refs.potOdds, '');
    }

    setText(refs.playerBet, state.playerBet > 0 ? state.playerBet + '' : '');
    setText(refs.chavezBet, state.chavezBet > 0 ? state.chavezBet + '' : '');

    renderCards(refs.playerCards, state.playerHole, false);
    const chavezFaceDown = !showChavezHole();
    renderCards(refs.chavezCards, state.chavezHole, chavezFaceDown);
    // Card-flip sound on the showdown reveal (transition face-down → up).
    if (prevChavezHidden && !chavezFaceDown && global.BFAudio) {
      global.BFAudio.cardFlip();
    }
    prevChavezHidden = chavezFaceDown;
    renderCards(refs.community, state.board, false);
    markBestCards();

    refs.playerSeat.classList.toggle('has-button', state.buttonOnPlayer && !state.complete);
    refs.chavezSeat.classList.toggle('has-button', !state.buttonOnPlayer && !state.complete);

    refs.playerSeat.classList.toggle('is-acting', !state.complete && !state.handResult && state.toAct === 'player');
    refs.chavezSeat.classList.toggle('is-acting', !state.complete && !state.handResult && state.toAct === 'chavez');

    setText(refs.handStrength, handStrengthText());
    setText(refs.turnStatus, turnStatusText());

    // Portrait live values
    const bb = global.BFHoldem.blindsFor(state.handNumber).bb;
    const depth = state.chavezChips > 0 ? Math.floor(state.chavezChips / bb) : 0;
    setText(refs.portraitStack, String(state.chavezChips));
    setText(refs.portraitWager, state.chavezBet > 0 ? String(state.chavezBet) : '—');
    setText(refs.portraitDepth, depth + ' BB');

    // Mood may have shifted with the new stack — refresh face immediately.
    updateChavezFace();

    renderActions();
    chavezWatchdog();
  }

  function renderActions() {
    const la = global.BFHoldem.legalActions(state);
    const isPlayer = state.toAct === 'player' && !state.handResult && !state.complete;
    refs.actions.classList.toggle('is-locked', !isPlayer);

    // Fold visible only when there's something to fold to
    refs.btnFold.style.display = (isPlayer && la.canFold) ? '' : 'none';

    // Passive button: Check vs Call (with pot odds % on Call)
    if (isPlayer && (la.canCheck || la.canCall)) {
      refs.btnPassive.style.display = '';
      if (la.canCall) {
        const oddsPct = Math.round(100 * la.toCall / (state.pot + la.toCall));
        refs.btnPassive.textContent = 'Call ' + la.callAmount + ' · ' + oddsPct + '%';
        refs.btnPassive.dataset.kind = 'call';
      } else {
        refs.btnPassive.textContent = 'Check';
        refs.btnPassive.dataset.kind = 'check';
      }
    } else {
      refs.btnPassive.style.display = 'none';
    }

    // Aggressive button: Bet vs Raise
    let canAggro = isPlayer && (la.canBet || la.canRaise);
    refs.btnAggro.style.display = canAggro ? '' : 'none';

    // Sizing widget
    let minSize = 0, maxSize = 0;
    if (la.canRaise) { minSize = la.minRaiseTo; maxSize = la.maxRaiseTo; }
    else if (la.canBet) { minSize = la.minBet; maxSize = la.maxBet; }
    refs.raise.min = String(minSize);
    refs.raise.max = String(maxSize);
    let cur = parseInt(refs.raise.value || '0', 10);
    if (!isFinite(cur) || cur < minSize) cur = minSize;
    if (cur > maxSize) cur = maxSize;
    refs.raise.value = String(cur);
    setText(refs.raiseValue, String(cur));
    refs.sizing.classList.toggle('is-active', canAggro);

    // All-in special: if min===max (only one size possible), hide the sizing widget
    if (canAggro && minSize === maxSize) {
      refs.sizing.classList.remove('is-active');
    }

    updateAggroLabel();
  }

  function logLine(text, klass) {
    const el = document.createElement('div');
    el.className = 'bf-log-line' + (klass ? ' ' + klass : '');
    el.textContent = text;
    refs.log.insertBefore(el, refs.log.firstChild);
    while (refs.log.children.length > 8) refs.log.removeChild(refs.log.lastChild);
  }

  // Animate a small chip puck flying from the source seat to the pot.
  // The chip is a position:fixed div that transitions transform+opacity.
  // Target: the stakes-bar POT cell (the canonical pot display).
  function flyChip(who) {
    const sourceEl = who === 'player' ? refs.playerSeat : refs.chavezSeat;
    const potEl = refs.stakesMid || (refs.pot && refs.pot.parentElement);
    if (!sourceEl || !potEl) return;
    const from = sourceEl.getBoundingClientRect();
    const to = potEl.getBoundingClientRect();
    const startX = from.left + from.width  / 2;
    const startY = from.top  + from.height / 2;
    const endX   = to.left   + to.width    / 2;
    const endY   = to.top    + to.height   / 2;
    const chip = document.createElement('div');
    chip.className = 'bf-fly-chip' + (who === 'player' ? '' : ' is-chavez');
    chip.style.left = (startX - 13) + 'px';
    chip.style.top  = (startY - 13) + 'px';
    document.body.appendChild(chip);
    // Force layout, then trigger transition to target.
    chip.getBoundingClientRect();
    requestAnimationFrame(function () {
      chip.classList.add('is-flying');
      const dx = endX - startX;
      const dy = endY - startY;
      chip.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.55)';
    });
    // Fade out at the destination and remove.
    setTimeout(function () {
      chip.classList.remove('is-flying');
      chip.classList.add('is-arrived');
    }, 580);
    setTimeout(function () { if (chip.parentNode) chip.remove(); }, 900);
  }

  // Big "what just happened" banner above the player controls. Toast
  // style — fades after 3.2s. Pass `sticky: true` to keep it lit.
  let announceTimer = null;
  function announce(text, klass, sticky) {
    if (!refs.announce) return;
    refs.announce.className = 'bf-announce is-open' + (klass ? ' ' + klass : '');
    refs.announce.textContent = text;
    clearTimeout(announceTimer);
    if (sticky) return;
    announceTimer = setTimeout(function () {
      refs.announce.classList.remove('is-open');
      // Once the toast fades, if it's the player's turn, drop in a
      // sticky "YOU'RE UP" prompt so the player always knows whose turn
      // it is when the room goes quiet.
      if (state.toAct === 'player' && !state.handResult && !state.complete) {
        announce("YOU'RE UP", 'is-prompt', true);
      }
    }, 3200);
  }

  function actionLabel(who, action, amount) {
    const name = who === 'player' ? 'You' : 'Chavez';
    if (action === 'fold')  return name + (who === 'player' ? ' fold.' : ' folds.');
    if (action === 'check') return name + (who === 'player' ? ' check.' : ' checks.');
    if (action === 'call')  return name + (who === 'player' ? ' call.' : ' calls.');
    if (action === 'bet')   return name + (who === 'player' ? ' bet ' : ' bets ') + amount + '.';
    if (action === 'raise') return name + (who === 'player' ? ' raise to ' : ' raises to ') + amount + '.';
    return name + ' ' + action;
  }

  const STREET_ANNOUNCE = {
    flop:  'FLOP DEALT',
    turn:  'TURN DEALT',
    river: 'RIVER DEALT',
  };

  function doAction(who, action, amount) {
    const prevStreet = state.street;
    const res = global.BFHoldem.act(state, who, action, amount);
    if (res.error) {
      // Chavez occasionally chose an illegal action (stale legalActions
      // read, all-in edge case). Fall back to a safe legal action so the
      // hand never hangs on "considering…".
      if (who === 'chavez') {
        const la = global.BFHoldem.legalActions(state);
        if (la.canCheck) return doAction('chavez', 'check');
        if (la.canCall)  return doAction('chavez', 'call');
        if (la.canFold)  return doAction('chavez', 'fold');
      }
      return false;
    }
    const label = actionLabel(who, action, amount);
    logLine(label, who === 'player' ? 'is-player' : 'is-chavez');
    announce(label, who === 'player' ? 'is-player' : 'is-chavez');
    // Fly a chip puck from the seat to the pot for any chip-moving action
    if (action === 'bet' || action === 'call' || action === 'raise') {
      flyChip(who);
    }

    // Audio cue for the action — BFAudio module is loaded on this page;
    // guarded so the page still works if the script fails to load.
    if (global.BFAudio) {
      if (action === 'fold')       global.BFAudio.fold();
      else if (action === 'check') global.BFAudio.check();
      else if (action === 'call')  global.BFAudio.chipStack(amount || 2);
      else if (action === 'bet')   global.BFAudio.chipStack(amount || 2);
      else if (action === 'raise') global.BFAudio.chipStack(amount || 4);
    }

    // Feed the AI's range tracker. Best-effort; tracker doesn't have to
    // be present for the game to play.
    if (global.BFAI && global.BFAI.observe) {
      try { global.BFAI.observe(state, who, action, amount, prevStreet); }
      catch (e) {}
    }
    // Persistent Chavez last-move line under his name
    if (who === 'chavez' && refs.chavezLast) {
      let move;
      if (action === 'fold')       move = 'folded';
      else if (action === 'check') move = 'checked';
      else if (action === 'call')  move = 'called';
      else if (action === 'bet')   move = 'bet ' + amount;
      else if (action === 'raise') move = 'raised to ' + amount;
      else                          move = action;
      refs.chavezLast.textContent = 'last move · ' + move;
    }
    // If the act advanced the street, announce that too (after a beat)
    if (state.street !== prevStreet && STREET_ANNOUNCE[state.street]) {
      const newStreet = state.street;
      if (global.BFAudio) {
        global.BFAudio.streetDeal(newStreet === 'flop' ? 3 : 1);
      }
      setTimeout(function () {
        if (state.street === newStreet && !state.handResult) {
          announce(STREET_ANNOUNCE[newStreet], 'is-deal');
        }
      }, 700);
    }

    // Showdown anticipation tone fires once when the hand resolves to a
    // showdown (card-flip sound fires from render() on first face-up paint).
    if (state.handResult && state.handResult.type === 'showdown' && global.BFAudio) {
      global.BFAudio.showdown();
    }
    render();
    afterAction();
    return true;
  }

  function afterAction() {
    if (state.handResult || state.complete) {
      handEndFlow();
      return;
    }
    if (state.toAct === 'chavez') {
      scheduleChavez(350 + Math.random() * 450);
    }
  }

  // Watchdog — if Chavez is still to act after a render and no chavezTimer
  // is pending, kick him off. Catches any edge case where the schedule
  // didn't fire (browser tab backgrounded, errored callback, etc.).
  function chavezWatchdog() {
    if (state.complete || state.handResult) return;
    if (state.toAct !== 'chavez') return;
    if (chavezTimer) return;
    scheduleChavez(400);
  }

  function scheduleChavez(delay) {
    clearTimeout(chavezTimer);
    refs.chavezSeat.classList.add('is-thinking');
    if (refs.chavezPortrait) refs.chavezPortrait.classList.add('is-thinking');
    setText(refs.turnStatus, 'Chavez is considering…');
    chavezTimer = setTimeout(function () {
      chavezTimer = null;
      refs.chavezSeat.classList.remove('is-thinking');
      if (refs.chavezPortrait) refs.chavezPortrait.classList.remove('is-thinking');
      if (state.complete || state.handResult || state.toAct !== 'chavez') return;
      const decision = global.BFAI.decide(state);
      doAction('chavez', decision.action, decision.amount);
    }, delay);
  }

  function handEndFlow() {
    render();

    let summary = '';
    if (state.handResult && state.handResult.type === 'fold') {
      summary = state.handResult.winner === 'player'
        ? 'Chavez folds. Pot to you.'
        : 'You fold. Chavez takes the pot.';
    } else if (state.handResult && state.handResult.type === 'showdown') {
      const me = state.handResult.playerEval;
      const them = state.handResult.chavezEval;
      const mine = global.BFHoldem.handName(me);
      const theirs = global.BFHoldem.handName(them);
      if (state.handResult.winner === 'player') {
        summary = 'Showdown — you win with ' + mine + ' over ' + theirs + '.';
      } else if (state.handResult.winner === 'chavez') {
        summary = 'Showdown — Chavez wins with ' + theirs + ' over ' + mine + '.';
      } else {
        summary = 'Showdown — split pot (' + mine + ').';
      }
    }
    if (summary) {
      logLine(summary, 'is-summary');
      announce(summary, 'is-deal');
    }

    persistMatch();

    if (state.complete) {
      if (state.won) markBeaten('chavez');
      if (global.BFAudio) (state.won ? global.BFAudio.win : global.BFAudio.loss)();
      // Long enough for showdown reveal + win/loss sting to land before
      // the splash overlays the table. The splash now sits as a top
      // banner with no backdrop dimming so the player can still see the
      // last hand laid out underneath.
      setTimeout(function () { showEndSplash(state.won); }, 3500);
      return;
    }

    setTimeout(function () {
      if (state.complete) return;
      global.BFHoldem.nextHand(state);
      persistMatch();
      global.BFHoldem.startHand(state);
      if (refs.chavezLast) refs.chavezLast.textContent = 'last move · —';
      render();
      logLine('— Hand ' + state.handNumber + ' —', 'is-summary');
      announce('HAND ' + state.handNumber, 'is-deal');
      if (global.BFAudio) global.BFAudio.cardDeal(4);
      if (state.toAct === 'chavez') scheduleChavez(500);
    }, 1500);
  }

  // Reset the chavez storage so the next fight can fire, bump the
  // letter's lifetime-earned threshold to the next rung on the ladder,
  // and increment fights-completed (which controls Chavez's starting
  // stack on the next fight).
  //
  // Trigger ladder (from note_002_chavez_invitation):
  //   1000 → 5000 → 10000 → 50000 → 100000   (final — 5 fights total)
  // After the 5th fight, the invitation letter stays in the seen list
  // and the threshold isn't bumped further, so Chavez never returns.
  //
  // Bosses-beaten stays (drives the lobby eye icon).
  const THRESHOLD_KEY = 'wendys_palace_chavez_threshold';
  const LADDER = [1000, 5000, 10000, 50000, 100000];
  const MAX_FIGHTS = LADDER.length;
  function nextThreshold(current) {
    for (const t of LADDER) { if (t > current) return t; }
    return current; // already at the end — no more rungs
  }
  function resetForReplay() {
    try { localStorage.removeItem(KEY); } catch {}

    // Increment fights-completed first so we know whether we just
    // finished the last one.
    let fightsDone = 0;
    try { fightsDone = parseInt(localStorage.getItem(FIGHTS_KEY) || '0', 10); } catch {}
    if (!isFinite(fightsDone) || fightsDone < 0) fightsDone = 0;
    fightsDone += 1;
    try { localStorage.setItem(FIGHTS_KEY, String(fightsDone)); } catch {}

    // If we just finished the final fight, lock the invitation forever:
    // leave note_002 in the seen list and don't bump the threshold.
    if (fightsDone >= MAX_FIGHTS) return;

    // Otherwise allow note_002 to re-trigger.
    try {
      const raw = localStorage.getItem('wendys_palace_letters_seen');
      if (raw) {
        const seen = JSON.parse(raw);
        if (Array.isArray(seen)) {
          const filtered = seen.filter(function (id) { return id !== 'note_002_chavez_invitation'; });
          localStorage.setItem('wendys_palace_letters_seen', JSON.stringify(filtered));
        }
      }
    } catch {}
    // Walk the threshold ladder
    try {
      const cur = parseInt(localStorage.getItem(THRESHOLD_KEY) || '1000', 10);
      const next = nextThreshold(isFinite(cur) ? cur : 1000);
      localStorage.setItem(THRESHOLD_KEY, String(next));
    } catch {}
  }

  // Bump child's current stats by +1 (clamped to 10). Reward for beating
  // Chavez. Writes directly to wendys_palace_child so we don't have to
  // load child.js on this page.
  const STATS = ['hunger', 'wellness', 'closeness'];
  function bumpChildStats(delta) {
    try {
      const raw = localStorage.getItem('wendys_palace_child');
      if (!raw) return;
      const c = JSON.parse(raw);
      for (const s of STATS) {
        if (typeof c[s] === 'number') c[s] = Math.min(10, Math.max(0, c[s] + delta));
      }
      localStorage.setItem('wendys_palace_child', JSON.stringify(c));
    } catch {}
  }

  // Placeholder end-of-match splash. On Back to the game: reset the
  // chavez storage so the fight can re-trigger, bump child stats on win,
  // then route to the lobby. Inline-styles override chavez.css's full-
  // screen blurred overlay so the table — including the showdown reveal
  // — remains visible underneath while the player decides to leave.
  function showEndSplash(won) {
    const root = document.createElement('div');
    root.className = 'bf-end-splash';
    // Non-obstructive layout — pin to the top of the viewport, drop the
    // backdrop dimming + blur entirely. Pointer-events: none on the
    // wrapper so clicks on the visible table beneath it still work; the
    // splash card re-enables pointer events on itself.
    root.style.position = 'fixed';
    root.style.inset = 'auto 0 auto 0';
    root.style.top = '12px';
    root.style.background = 'transparent';
    root.style.backdropFilter = 'none';
    root.style.alignItems = 'flex-start';
    root.style.justifyContent = 'center';
    root.style.pointerEvents = 'none';

    const rewardBlock = won
      ? '<p class="bf-end-reward">+1 hunger · +1 wellness · +1 closeness</p>'
      : '';
    root.innerHTML =
      '<div class="bf-end-card" style="pointer-events:auto; max-width:520px;">' +
        '<h2 class="bf-end-title">' + (won ? 'YOU BEAT CHAVEZ' : 'CHAVEZ BEAT YOU') + '</h2>' +
        '<p class="bf-end-body">' +
          (won
            ? 'The follow-up will not be scheduled. (placeholder splash)'
            : 'He stacks the last chip. (placeholder splash)') +
        '</p>' +
        rewardBlock +
        '<div class="bf-end-stats">' +
          '<div>YOU<br><strong>' + state.playerChips + ' chips</strong></div>' +
          '<div>CHAVEZ<br><strong>' + state.chavezChips + ' chips</strong></div>' +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">' +
          '<button class="bf-end-button bf-end-review" type="button">Review hand</button>' +
          '<button class="bf-end-button" type="button">Back to the game</button>' +
        '</div>' +
      '</div>';

    const card = root.querySelector('.bf-end-card');
    const reviewBtn = root.querySelector('.bf-end-review');
    const backBtn = root.querySelectorAll('.bf-end-button')[1];
    // "Review hand" hides the splash so the player can study the cards.
    // Previous version listened for any pointerdown to restore — which
    // fired on the very first table interaction, snapping the splash
    // straight back. Replaced with a persistent floating "Resume" pill
    // that stays up until the player taps it.
    card.style.transition = 'opacity 220ms ease, transform 280ms ease';
    function setHidden(h) {
      card.style.opacity = h ? '0' : '1';
      card.style.transform = h ? 'translateY(-30px)' : 'translateY(0)';
      card.style.pointerEvents = h ? 'none' : 'auto';
    }
    let resumePill = null;
    reviewBtn.addEventListener('click', function () {
      setHidden(true);
      if (resumePill) return;
      resumePill = document.createElement('button');
      resumePill.type = 'button';
      resumePill.textContent = '▲ Resume';
      resumePill.style.cssText = [
        'position:fixed',
        'top:14px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:10001',
        'padding:6px 18px',
        'font-family:var(--font-ui,monospace)',
        'font-size:13px',
        'letter-spacing:0.12em',
        'text-transform:uppercase',
        'color:var(--bf-accent,#d4af37)',
        'background:rgba(0,0,0,0.85)',
        'border:1px solid var(--bf-accent,#d4af37)',
        'border-radius:999px',
        'cursor:pointer',
        'box-shadow:0 4px 14px rgba(0,0,0,0.55)',
      ].join(';');
      resumePill.addEventListener('click', function (e) {
        e.stopPropagation();
        setHidden(false);
        if (resumePill && resumePill.parentNode) resumePill.parentNode.removeChild(resumePill);
        resumePill = null;
      });
      document.body.appendChild(resumePill);
    });
    backBtn.addEventListener('click', function () {
      if (resumePill && resumePill.parentNode) {
        resumePill.parentNode.removeChild(resumePill);
        resumePill = null;
      }
      if (won) {
        bumpChildStats(1);
        resetForReplay();
        location.replace('index.html');
      } else {
        // Loss is terminal — the player can review the hand, but the
        // consequence still lands. The chavez record stays complete+!won
        // so a refresh re-routes here, and the child-died head-guard on
        // other pages catches anyone navigating sideways.
        location.replace('child-died.html');
      }
    });
    document.body.appendChild(root);
    requestAnimationFrame(function () { root.classList.add('is-open'); });
  }

  // ───────────────────────── DOM binding ─────────────────────────

  function bindRefs() {
    refs = {
      handNo: $('bf-hand'),
      blinds: $('bf-blinds'),
      playerStack: $('bf-player-stack'),
      chavezStack: $('bf-chavez-stack'),
      pot: $('bf-pot'),
      playerCards: $('bf-player-cards'),
      chavezCards: $('bf-chavez-cards'),
      community: $('bf-community'),
      playerBet: $('bf-player-bet'),
      chavezBet: $('bf-chavez-bet'),
      playerSeat: $('bf-player-seat'),
      chavezSeat: $('bf-chavez-seat'),
      handStrength: $('bf-hand-strength'),
      turnStatus: $('bf-turn-status'),
      street: $('bf-street'),
      potOdds: $('bf-pot-odds'),
      announce: $('bf-announce'),
      stakesPlayer:  $('bf-stakes-player'),
      stakesPot:     $('bf-stakes-pot'),
      stakesChavez:  $('bf-stakes-chavez'),
      stakesCall:    $('bf-stakes-call'),
      stakesMid:     $('bf-stakes-mid'),
      chavezFace: $('bf-chavez-face'),
      chavezTell: $('bf-chavez-tell'),
      chavezPortrait: $('bf-chavez-portrait'),
      portraitStack: $('bf-portrait-stack'),
      portraitWager: $('bf-portrait-wager'),
      portraitDepth: $('bf-portrait-depth'),
      portraitMood: $('bf-portrait-mood'),
      chavezLast: $('bf-chavez-last'),
      eyes: $('bf-eyes'),
      log: $('bf-log'),
      actions: $('bf-actions'),
      btnFold: $('bf-act-fold'),
      btnPassive: $('bf-act-passive'),
      btnAggro: $('bf-act-aggro'),
      sizing: $('bf-sizing'),
      raise: $('bf-raise-amount'),
      raiseValue: $('bf-raise-value'),
    };
  }

  function bindActions() {
    refs.btnFold.addEventListener('click', function () { doAction('player', 'fold'); });
    refs.btnPassive.addEventListener('click', function () {
      const kind = refs.btnPassive.dataset.kind;
      if (kind === 'call') doAction('player', 'call');
      else doAction('player', 'check');
    });
    refs.btnAggro.addEventListener('click', function () {
      const la = global.BFHoldem.legalActions(state);
      const amt = parseInt(refs.raise.value || '0', 10);
      if (la.canRaise) doAction('player', 'raise', amt);
      else if (la.canBet) doAction('player', 'bet', amt);
    });
    refs.raise.addEventListener('input', function () {
      setText(refs.raiseValue, refs.raise.value);
      updateAggroLabel();
      // Manual drag — clear preset selection
      document.querySelectorAll('.bf-preset.is-selected').forEach(function (b) {
        b.classList.remove('is-selected');
      });
    });
  }

  function bindPresets() {
    const presets = document.querySelectorAll('.bf-preset');
    presets.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const la = global.BFHoldem.legalActions(state);
        const v = presetValue(btn.dataset.preset, la);
        setSliderValue(v, btn.dataset.preset);
      });
    });
  }

  // Keyboard shortcuts. Only fire when the player is on the action.
  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (state.complete || state.handResult || state.toAct !== 'player') return;
      // Ignore key events while typing in inputs/sliders
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const la = global.BFHoldem.legalActions(state);
      const k = e.key.toLowerCase();

      if (k === 'f' && la.canFold)  { e.preventDefault(); doAction('player', 'fold'); return; }
      if (k === 'c') {
        if (la.canCall)              { e.preventDefault(); doAction('player', 'call'); return; }
        if (la.canCheck)             { e.preventDefault(); doAction('player', 'check'); return; }
      }
      if (k === 'b' || k === 'r' || k === ' ' || k === 'enter') {
        const amt = parseInt(refs.raise.value || '0', 10);
        if (la.canRaise)            { e.preventDefault(); doAction('player', 'raise', amt); return; }
        if (la.canBet)              { e.preventDefault(); doAction('player', 'bet', amt); return; }
      }
      // Slider nudge
      if (k === 'arrowup'   || k === '+' || k === '=') {
        e.preventDefault();
        setSliderValue(Math.min(+refs.raise.max, +refs.raise.value + 1), null);
      }
      if (k === 'arrowdown' || k === '-') {
        e.preventDefault();
        setSliderValue(Math.max(+refs.raise.min, +refs.raise.value - 1), null);
      }
    });
  }

  // Slather the page with ophanim — plain rotating SVGs, no FX classes
  // (stripped for performance). Random size, position, rotation period.
  function spawnWheels(host) {
    if (!host) return;
    // Two wheels (was 4) — still suggests Ezekiel's vision, half the
    // continuous rotation work on the compositor.
    const count = 2;
    for (let i = 0; i < count; i++) {
      const w = document.createElement('div');
      w.className = 'bf-ophanim';
      if (Math.random() < 0.5) w.classList.add('bf-wheel-rev');
      const r = Math.random();
      let size;
      if (r < 0.5) size = 180 + Math.random() * 140;       // 180–320
      else         size = 320 + Math.random() * 200;       // 320–520
      w.style.width  = size + 'px';
      w.style.height = size + 'px';
      w.style.top  = (-12 + Math.random() * 104) + 'vh';
      w.style.left = (-12 + Math.random() * 104) + 'vw';
      w.style.setProperty('--spin', (40 + Math.random() * 110) + 's');
      w.style.opacity = (0.25 + Math.random() * 0.35).toFixed(2);
      host.appendChild(w);
    }
  }

  // GIF eye spawner — eyes1.gif through eyes4.gif scattered across the
  // viewport. Each at a random size, random rotation, random GIF variant.
  // Count reduced from 14 → 4 to cut memory (each GIF holds decoded frames
  // in RAM continuously; 14 instances was ~2 MB sustained).
  function spawnGifEyes(host) {
    if (!host) return;
    const COUNT = 4;
    for (let i = 0; i < COUNT; i++) {
      const img = document.createElement('img');
      const n = 1 + Math.floor(Math.random() * 4);
      img.className = 'bf-gif-eye';
      img.src = '../assets/images/eyes' + n + '.gif';
      img.alt = '';
      const w = 60 + Math.random() * 140;                  // 60–200 px
      img.style.width  = w + 'px';
      img.style.height = 'auto';
      img.style.top  = (-3 + Math.random() * 102) + 'vh';
      img.style.left = (-3 + Math.random() * 102) + 'vw';
      img.style.transform = 'rotate(' + ((Math.random() - 0.5) * 60) + 'deg)';
      img.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
      host.appendChild(img);
    }
  }

  // Watchers — large, sparse, unsettling GIFs at fixed positions around
  // the viewport edges. Mixes eyesurgery.gif and iceagent.gif so Chavez's
  // image still appears on the page, just not inside his widget.
  function spawnWatchers(host) {
    if (!host) return;
    // Trimmed from 6 → 2 watchers (each ~120–280 px animated GIF). Reads
    // the same — pair of large eyes in opposite corners — without holding
    // six animated GIF frame-buffers in memory simultaneously.
    const positions = [
      { top:  '6vh',  left:  '4vw',  src: 'eyesurgery.gif' },
      { top: '78vh',  left: '66vw',  src: 'eyesurgery.gif' },
    ];
    for (const p of positions) {
      const img = document.createElement('img');
      img.className = 'bf-watcher';
      img.src = '../assets/images/' + p.src;
      img.alt = '';
      const w = 160 + Math.random() * 120;                 // 160–280 px
      img.style.width  = w + 'px';
      img.style.height = 'auto';
      img.style.top  = p.top;
      img.style.left = p.left;
      img.style.transform = 'rotate(' + ((Math.random() - 0.5) * 24) + 'deg)';
      host.appendChild(img);
    }
  }

  // Slather the viewport with eyes. Hundreds of them. Mixed sizes from
  // tiny pinprick (6px) to large dramatic watchers (200px). A handful are
  // "burning" (gold iris, red pupil); a few are "watcher" (heavy halo).
  // Plus a pass of tight clusters (3–6 eyes packed together) to feel like
  // wing-eyes from the seraphim.
  // Plain absolutely-positioned eye, no rotation wrapper (stripped for
  // memory). Just blinks.
  function makeEye(opts) {
    const e = document.createElement('div');
    e.className = 'bf-eye';
    if (opts.fire)    e.classList.add('bf-eye-fire');
    if (opts.watcher) e.classList.add('bf-eye-watcher');
    const h = opts.w * (0.40 + Math.random() * 0.25);
    e.style.width  = opts.w + 'px';
    e.style.height = h + 'px';
    e.style.top    = opts.top  + (opts.unit || 'vh');
    e.style.left   = opts.left + (opts.unit || 'vw');
    // No static rotation — the blink animation uses transform: scaleY()
    // and would fight an inline transform. Eyes sit horizontal; variety
    // comes from random size + clusters + dim.
    e.style.animationDelay = (-Math.random() * 8) + 's';
    if (opts.dim) e.style.opacity = (0.32 + Math.random() * 0.4).toFixed(2);
    return e;
  }

  function spawnEyes(host) {
    if (!host) return;

    // 1) Scattered field — trimmed for memory. Each eye is a div with a
    //    blink animation; CSS keyframes on 20+ elements is real heap.
    const SCATTER = 8;
    for (let i = 0; i < SCATTER; i++) {
      const r = Math.random();
      let w;
      if (r < 0.03)      w = 90 + Math.random() * 110;  //  3% — huge watcher (90–200)
      else if (r < 0.10) w = 42 + Math.random() * 34;   //  7% — large (42–76)
      else if (r < 0.30) w = 22 + Math.random() * 18;   // 20% — medium (22–40)
      else if (r < 0.70) w = 11 + Math.random() * 10;   // 40% — small (11–21)
      else               w =  6 + Math.random() *  5;   // 30% — pinprick (6–11)

      const fire = Math.random() < 0.06;
      const watcher = w > 80;
      host.appendChild(makeEye({
        w: w,
        top:  (-5 + Math.random() * 110),
        left: (-5 + Math.random() * 110),
        fire: fire,
        watcher: watcher,
        dim: Math.random() < 0.4,
      }));
    }

    // 2) Clusters — one wing grouping (was 3) to keep some seraph density.
    const CLUSTERS = 1;
    for (let c = 0; c < CLUSTERS; c++) {
      const cx = Math.random() * 100;            // cluster center vw
      const cy = Math.random() * 100;            // cluster center vh
      const size = 3 + Math.floor(Math.random() * 4);
      const baseW = 10 + Math.random() * 18;
      for (let k = 0; k < size; k++) {
        const jitterX = (Math.random() - 0.5) * 4.5;
        const jitterY = (Math.random() - 0.5) * 3.5;
        const wj = baseW * (0.75 + Math.random() * 0.5);
        host.appendChild(makeEye({
          w: wj,
          top:  cy + jitterY,
          left: cx + jitterX,
          fire: Math.random() < 0.12,
          dim: false,
        }));
      }
    }
  }

  function init() {
    if (!global.BFHoldem || !global.BFAI) {
      console.error('Bossfight: missing BFHoldem/BFAI');
      return;
    }
    state = buildState();
    if (!state) return;
    bindRefs();
    bindActions();
    bindPresets();
    bindKeyboard();
    spawnWheels(document.getElementById('bf-wheels'));
    spawnEyes(refs.eyes);
    const gifHost = document.getElementById('bf-gifs');
    spawnGifEyes(gifHost);
    spawnWatchers(gifHost);

    // Mount audio controls early so they're present on the frozen replay
    // splash too. The card-deal sound is only fired on the live-match path
    // below; this branch just exposes the mute button.
    if (global.BFAudio) {
      global.BFAudio.armOnFirstGesture(document);
      global.BFAudio.mountMuteButton();
    }

    if (state.complete) {
      // Frozen frame — show the end splash (no letter dispatch, no redirect).
      render();
      startFaceCycle();
      showEndSplash(state.won);
      return;
    }

    global.BFHoldem.startHand(state);
    render();
    startFaceCycle();
    logLine('— Hand ' + state.handNumber + ' —', 'is-summary');
    if (global.BFAudio) global.BFAudio.cardDeal(4);
    if (state.toAct === 'chavez') scheduleChavez(600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
