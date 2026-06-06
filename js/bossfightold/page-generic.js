/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/PAGE-GENERIC — boss-agnostic poker controller for stub bosses │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► DOMContentLoaded ──► init()                           │
  │                                                                          │
  │   Reads window.BossConfig before init:                                   │
  │     { slug, name, startingStacks?:{playerChips,oppChips}, tells? }       │
  │       slug              — string, e.g. 'malechstone'                     │
  │       name              — display string, e.g. 'AGENT MALECHSTONE'       │
  │       startingStacks    — {playerChips, oppChips}; default {100, 50}     │
  │       tells             — { idle, thinking, busted } strings; optional   │
  │                                                                          │
  │   Persistence: wendys_palace_boss_<slug> = same shape as Chavez:         │
  │     { active, complete, won, snapshot:{ playerChips, chavezChips,        │
  │       handNumber, buttonOnPlayer } }   (engine still names the prop      │
  │     chavezChips — it's the canonical opponent stack.)                    │
  │   wendys_palace_bosses_beaten — shared string[] across all bosses.       │
  │                                                                          │
  │   Behavior (slim placeholder — not Chavez's full flow):                  │
  │     - poker mechanics via BFHoldem + BFAI (unchanged)                    │
  │     - action UI (fold / passive / aggro + sizing presets + slider)       │
  │     - keyboard shortcuts (F / C / B-R-Space-Enter / arrow nudge)         │
  │     - end-of-match splash + Back-to-lobby button                         │
  │   Dropped (vs. Chavez page.js):                                          │
  │     - letter dispatch + threshold ladder + fights-completed counter      │
  │     - child-stat reward bump (placeholder — wire later per boss)         │
  │     - kaomoji mood cycle + portrait widget (boss CSS owns its own art)   │
  │     - eye/wheel/GIF atmosphere spawners (boss CSS-only atmosphere)       │
  │                                                                          │
  │   DOM ids consumed (same shape as bossfight-chavez.html):                │
  │     #bf-hand, #bf-blinds, #bf-street,                                    │
  │     #bf-stakes-player, #bf-stakes-pot, #bf-stakes-chavez, #bf-stakes-mid,│
  │     #bf-stakes-call,                                                     │
  │     #bf-player-cards, #bf-chavez-cards, #bf-community,                   │
  │     #bf-player-bet, #bf-chavez-bet, #bf-player-seat, #bf-chavez-seat,    │
  │     #bf-hand-strength, #bf-turn-status, #bf-announce, #bf-log,           │
  │     #bf-actions, #bf-act-fold, #bf-act-passive, #bf-act-aggro,           │
  │     #bf-sizing, #bf-raise-amount, #bf-raise-value, .bf-preset            │
  │     (Optional) #bf-chavez-last, #bf-boss-tell                            │
  │                                                                          │
  │   Exports: none (IIFE scoped)                                            │
  │   External deps: window.BFHoldem, window.BFAI, window.BossConfig         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  cfg=global.BossConfig||{slug:'unknown',name:'OPPONENT'}
  KEY='wendys_palace_boss_'+cfg.slug; BEATEN_KEY='wendys_palace_bosses_beaten'
  START=cfg.startingStacks||{playerChips:100,oppChips:50}
  TELLS={idle:'waiting',thinking:'considering…',busted:'broken'}∪cfg.tells
  state=null; refs={}; oppTimer=null
  readPersist/writePersist/markBeaten via JSON.parse/stringify
  buildState()→state: p=readPersist; p.complete→frozen createMatch(snap, opp=0 if won)+s.complete/won; p.snapshot→restore createMatch+handNo/button; else createMatch(START)+persist
  cardEl(card,faceDown)→el: faceDown→.bf-card-back+.bf-card-eye; else .bf-suit-X + rank/glyph
  renderCards(host,cards,faceDown): skip if dataset.cardsKey matches; else rebuild
  contributingCards(best)→cards: cat 1→[]; 5/6/7/9→all; 2/4/8→tb[0]; 3→tb[0,1]
  markBestCards(): clear .is-best; evalBest(playerHole+board); apply .is-best to matching player+board cards
  handStrengthText()→str: board≥3? 'Your hand · '+handName(evalBest)
  turnStatusText()→str: complete→'— the wheel has stopped —'; handResult→'— hand settling —'; toAct==='player'→'Your turn'; else cfg.name+' is '+TELLS.thinking
  presetValue(name,la)→int: same as Chavez (min/half/pot/all clamped)
  render(): handNo/blinds/stacks/pot/street/stakes-bar; renderCards player(F)/opp(showOppHole?F:T)/community(F); markBestCards; bet pucks; hand-strength; turn-status; tell text; action mutex; sizing slider bounds
  showOppHole()→handResult?.type==='showdown'
  doAction(who,action,amt): act; logLine; announce; flyChip if chips moved; render; terminal→handEndFlow; opp→scheduleOpp
  scheduleOpp(delay): is-thinking class; setTimeout→BFAI.decide→doAction('chavez',…)
  handEndFlow(): render; summary log+announce; persist; complete→showEndSplash; else 2400→nextHand+startHand+render+'— Hand N —'
  showEndSplash(won): overlay w/ name + chips + "Back to the game" → wipe persist + lobby
  bindRefs/bindActions/bindPresets/bindKeyboard
  init(): cfg check; state=buildState; bindRefs+bindActions+bindPresets+bindKeyboard; header name; complete?render+showEndSplash:startHand+render+log; toAct==='chavez'→scheduleOpp(1100)
*/

(function (global) {
  const cfg = global.BossConfig || { slug: 'unknown', name: 'OPPONENT' };
  const KEY = 'wendys_palace_boss_' + cfg.slug;
  const BEATEN_KEY = 'wendys_palace_bosses_beaten';
  const START = cfg.startingStacks || { playerChips: 100, oppChips: 50 };
  const TELLS = Object.assign({
    idle:     'waiting',
    thinking: 'considering…',
    busted:   'broken',
  }, cfg.tells || {});

  let state = null;
  let refs = {};
  let oppTimer = null;

  // Avatar frame-cycling. Mood derived from chip ratio (5 buckets:
  // lost/losing/average/winning/won). Frames live in BossConfig.avatarFrames
  // keyed by mood, each value an array. Index resets on mood change so a
  // transition reads cleanly. Bosses without avatarFrames (e.g. Fortuna,
  // which paints a live webcam) bypass this entirely.
  let avatarMood = 'average';
  let avatarFrameIdx = 0;
  let avatarTimer = null;

  // Tracked between renders for FX hooks (stack tick, strength flash,
  // showdown reveal). Initial nulls so the first render doesn't flash.
  let prevPlayerStack = null;
  let prevOppStack    = null;
  let prevStrength    = null;
  let prevOppHidden   = true;   // was the opponent showing face-down last render?

  // Brief class-flash helper — adds `cls`, removes it after `ms`. Used for
  // .is-bumping, .is-ticking, .is-flashing, .is-pressing. Always self-clears
  // even if the element is later removed (no observable side-effect).
  function flash(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    // Force reflow so re-adding actually replays the animation.
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el && el.classList.remove(cls); }, ms || 380);
  }

  function audio() { return global.BFAudio || null; }

  // Mood = how the BOSS is doing vs their own starting stack. Each boss
  // starts with a different amount (Chavez 50, Fortuna 150 etc.) so a
  // shared-pot ratio would have Chavez panicking from hand 1 just because
  // the player has more chips. Tracking own-ratio means each boss is
  // "chill" while at or near their own starting amount.
  function bossAvatarMood() {
    if (!state) return 'average';
    if (state.playerChips <= 0) return 'won';     // player busted → boss won
    if (state.chavezChips <= 0) return 'lost';    // boss busted → boss lost
    const start = (cfg.startingStacks && cfg.startingStacks.oppChips) || state.chavezChips || 1;
    const r = state.chavezChips / start;
    if (r < 0.40) return 'losing';      // down to 40% of starting bank — panic
    if (r > 1.60) return 'winning';     // taken at least 60% more than they started
    return 'average';                   // anywhere in between — chill
  }

  function paintAvatarFrame() {
    if (!refs.bossAvatar || !cfg.avatarFrames) return;
    const frames = cfg.avatarFrames[avatarMood];
    if (!frames || !frames.length) return;
    refs.bossAvatar.textContent = frames[avatarFrameIdx % frames.length];
    avatarFrameIdx++;
  }

  function refreshAvatarMood() {
    const next = bossAvatarMood();
    if (next !== avatarMood) {
      avatarMood = next;
      avatarFrameIdx = 0;
      paintAvatarFrame();
    }
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
  function clearPersist() {
    try { localStorage.removeItem(KEY); } catch {}
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
      const snap = p.snapshot || { playerChips: START.playerChips, chavezChips: 0,
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
    const s = global.BFHoldem.createMatch({
      playerChips: START.playerChips,
      chavezChips: START.oppChips,
    });
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
    const key = cards.map(function (c) { return c.rank + c.suit; }).join(',')
              + '|' + (allFaceDown ? 'd' : 'u');
    if (container.dataset.cardsKey === key) return;
    container.dataset.cardsKey = key;
    container.innerHTML = '';
    for (const c of cards) container.appendChild(cardEl(c, allFaceDown));
  }

  function contributingCards(best) {
    if (!best || !best.cards) return [];
    const cat = best.cat, tb = best.tb;
    if (cat === 1) return [];
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
      return winning.some(function (b) { return b.rank === card.rank && b.suit === card.suit; });
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

  function showOppHole() {
    if (state.handResult && state.handResult.type === 'showdown') return true;
    // Once anyone is all-in the betting is closed (holdem.js runs it out),
    // so flip the opp's hole cards immediately — the player should sweat
    // a real read on a real shove, not a black-card guess.
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
    if (state.complete) return '— the wheel has stopped —';
    if (state.handResult) return '— hand settling —';
    if (state.toAct === 'player') return 'Your turn';
    return cfg.name + ' is ' + TELLS.thinking;
  }

  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
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
    preflop:  'PRE-FLOP', flop: 'FLOP', turn: 'TURN',
    river: 'RIVER', showdown: 'SHOWDOWN', idle: '—',
  };

  function render() {
    setText(refs.handNo, String(state.handNumber));
    const bl = global.BFHoldem.blindsFor(state.handNumber);
    setText(refs.blinds, bl.sb + '/' + bl.bb);
    setText(refs.street, STREET_LABELS[state.street] || '—');

    // Stack-tick FX — flash .is-ticking when the value changes vs. last render.
    if (prevPlayerStack !== null && prevPlayerStack !== state.playerChips) {
      flash(refs.stakesPlayer, 'is-ticking', 470);
    }
    if (prevOppStack !== null && prevOppStack !== state.chavezChips) {
      flash(refs.stakesOpp, 'is-ticking', 470);
    }
    prevPlayerStack = state.playerChips;
    prevOppStack    = state.chavezChips;

    setText(refs.stakesPlayer, String(state.playerChips));
    setText(refs.stakesPot,    String(state.pot));
    setText(refs.stakesOpp,    String(state.chavezChips));

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

    setText(refs.playerBet, state.playerBet > 0 ? state.playerBet + '' : '');
    setText(refs.oppBet, state.chavezBet > 0 ? state.chavezBet + '' : '');

    renderCards(refs.playerCards, state.playerHole, false);
    const oppFaceDown = !showOppHole();
    renderCards(refs.oppCards, state.chavezHole, oppFaceDown);
    // Showdown reveal — if opp cards transitioned from face-down to face-up,
    // play the flip animation on the new cards + a flip sound.
    if (prevOppHidden && !oppFaceDown) {
      const cards = refs.oppCards ? refs.oppCards.querySelectorAll('.bf-card') : [];
      for (let i = 0; i < cards.length; i++) {
        flash(cards[i], 'is-revealing', 560);
      }
      const a = audio(); if (a) a.cardFlip();
    }
    prevOppHidden = oppFaceDown;
    renderCards(refs.community, state.board, false);
    markBestCards();

    refs.playerSeat.classList.toggle('has-button', state.buttonOnPlayer && !state.complete);
    refs.oppSeat.classList.toggle('has-button', !state.buttonOnPlayer && !state.complete);
    refs.playerSeat.classList.toggle('is-acting', !state.complete && !state.handResult && state.toAct === 'player');
    refs.oppSeat.classList.toggle('is-acting', !state.complete && !state.handResult && state.toAct === 'chavez');

    const strength = handStrengthText();
    if (strength && strength !== prevStrength) {
      flash(refs.handStrength, 'is-flashing', 560);
    }
    prevStrength = strength;
    setText(refs.handStrength, strength);
    setText(refs.turnStatus, turnStatusText());

    if (refs.bossTell) {
      let tell;
      if (state.chavezChips <= 0) tell = TELLS.busted;
      else if (refs.oppSeat.classList.contains('is-thinking')) tell = TELLS.thinking;
      else tell = TELLS.idle;
      setText(refs.bossTell, tell);
    }

    // Boss avatar — chip-ratio scale + busted toggle + mood refresh.
    if (refs.bossAvatar) {
      refs.bossAvatar.classList.toggle('is-busted', state.chavezChips <= 0);
      // Avatar size tracks the PLAYER's distress vs. their OWN starting
      // stack (not the shared pot). Player at starting = scale 1.0;
      // player down → boss looms larger; player up → boss recedes.
      // Range 0.85 → 1.15. Different bosses can have wildly different
      // starting stacks (Chavez 50, Fortuna 150) so a total-pot ratio
      // would give a wrong reading.
      const playerStart = (cfg.startingStacks && cfg.startingStacks.playerChips) || 100;
      const playerRatio = state.playerChips / Math.max(1, playerStart);
      const s = 1 + (1 - playerRatio) * 0.15;
      const clamped = Math.max(0.85, Math.min(1.15, s));
      refs.bossAvatar.style.setProperty('--avatar-scale', clamped.toFixed(3));
      // Mood transition: pick the right frame set, reset frame index.
      if (cfg.avatarFrames) refreshAvatarMood();
    }

    renderActions();
    oppWatchdog();
  }

  function renderActions() {
    const la = global.BFHoldem.legalActions(state);
    const isPlayer = state.toAct === 'player' && !state.handResult && !state.complete;
    refs.actions.classList.toggle('is-locked', !isPlayer);
    refs.btnFold.style.display = (isPlayer && la.canFold) ? '' : 'none';

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

    const canAggro = isPlayer && (la.canBet || la.canRaise);
    refs.btnAggro.style.display = canAggro ? '' : 'none';

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
    if (canAggro && minSize === maxSize) refs.sizing.classList.remove('is-active');

    updateAggroLabel();
  }

  function logLine(text, klass) {
    if (!refs.log) return;
    const el = document.createElement('div');
    el.className = 'bf-log-line' + (klass ? ' ' + klass : '');
    el.textContent = text;
    refs.log.insertBefore(el, refs.log.firstChild);
    while (refs.log.children.length > 8) refs.log.removeChild(refs.log.lastChild);
  }

  function flyChip(who) {
    const sourceEl = who === 'player' ? refs.playerSeat : refs.oppSeat;
    const potEl = refs.stakesMid;
    if (!sourceEl || !potEl) return;
    const from = sourceEl.getBoundingClientRect();
    const to = potEl.getBoundingClientRect();
    const startX = from.left + from.width  / 2;
    const startY = from.top  + from.height / 2;
    const endX   = to.left   + to.width    / 2;
    const endY   = to.top    + to.height   / 2;
    const chip = document.createElement('div');
    chip.className = 'bf-fly-chip' + (who === 'player' ? '' : ' is-opp');
    chip.style.left = (startX - 13) + 'px';
    chip.style.top  = (startY - 13) + 'px';
    document.body.appendChild(chip);
    chip.getBoundingClientRect();
    requestAnimationFrame(function () {
      chip.classList.add('is-flying');
      const dx = endX - startX, dy = endY - startY;
      chip.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.55)';
    });
    setTimeout(function () {
      chip.classList.remove('is-flying');
      chip.classList.add('is-arrived');
      // Bump the pot value when the chip lands.
      flash(refs.stakesPot, 'is-bumping', 400);
    }, 580);
    setTimeout(function () { if (chip.parentNode) chip.remove(); }, 900);
  }

  let announceTimer = null;
  function announce(text, klass, sticky) {
    if (!refs.announce) return;
    refs.announce.className = 'bf-announce is-open' + (klass ? ' ' + klass : '');
    refs.announce.textContent = text;
    clearTimeout(announceTimer);
    if (sticky) return;
    announceTimer = setTimeout(function () {
      refs.announce.classList.remove('is-open');
      if (state.toAct === 'player' && !state.handResult && !state.complete) {
        announce("YOU'RE UP", 'is-prompt', true);
      }
    }, 3200);
  }

  function actionLabel(who, action, amount) {
    const name = who === 'player' ? 'You' : cfg.name;
    if (action === 'fold')  return name + (who === 'player' ? ' fold.' : ' folds.');
    if (action === 'check') return name + (who === 'player' ? ' check.' : ' checks.');
    if (action === 'call')  return name + (who === 'player' ? ' call.' : ' calls.');
    if (action === 'bet')   return name + (who === 'player' ? ' bet ' : ' bets ') + amount + '.';
    if (action === 'raise') return name + (who === 'player' ? ' raise to ' : ' raises to ') + amount + '.';
    return name + ' ' + action;
  }

  const STREET_ANNOUNCE = { flop: 'FLOP DEALT', turn: 'TURN DEALT', river: 'RIVER DEALT' };

  function doAction(who, action, amount) {
    const prevStreet = state.street;
    const res = global.BFHoldem.act(state, who, action, amount);
    if (res.error) {
      if (who === 'chavez') {
        const la = global.BFHoldem.legalActions(state);
        if (la.canCheck) return doAction('chavez', 'check');
        if (la.canCall)  return doAction('chavez', 'call');
        if (la.canFold)  return doAction('chavez', 'fold');
      }
      return false;
    }
    const label = actionLabel(who, action, amount);
    logLine(label, who === 'player' ? 'is-player' : 'is-opp');
    announce(label, who === 'player' ? 'is-player' : 'is-opp');
    if (action === 'bet' || action === 'call' || action === 'raise') flyChip(who);

    // Tell the AI what just happened so it can update its villain-range
    // tracker. Always pass prevStreet because the call/check that closes
    // a street has already advanced state.street by this point.
    if (global.BFAI && global.BFAI.observe) {
      try { global.BFAI.observe(state, who, action, amount, prevStreet); }
      catch (e) { /* range tracker is best-effort */ }
    }

    // Audio cue for the action itself.
    const a = audio();
    if (a) {
      if (action === 'fold')       a.fold();
      else if (action === 'check') a.check();
      else if (action === 'call')  a.chipStack(amount || 2);
      else if (action === 'bet')   a.chipStack(amount || 2);
      else if (action === 'raise') a.chipStack(amount || 4);
    }

    if (who === 'chavez' && refs.oppLast) {
      let move;
      if (action === 'fold')       move = 'folded';
      else if (action === 'check') move = 'checked';
      else if (action === 'call')  move = 'called';
      else if (action === 'bet')   move = 'bet ' + amount;
      else if (action === 'raise') move = 'raised to ' + amount;
      else                          move = action;
      refs.oppLast.textContent = 'last move · ' + move;
    }

    if (state.street !== prevStreet && STREET_ANNOUNCE[state.street]) {
      const newStreet = state.street;
      // Street-deal sound — flop deals 3 cards, turn/river each deal 1.
      const cardCount = newStreet === 'flop' ? 3 : 1;
      const a2 = audio(); if (a2) a2.streetDeal(cardCount);
      setTimeout(function () {
        if (state.street === newStreet && !state.handResult) {
          announce(STREET_ANNOUNCE[newStreet], 'is-deal');
        }
      }, 700);
    }

    // Showdown anticipation sound — fires once when handResult appears as
    // a showdown (vs. a fold). The cardFlip sound fires separately in
    // render() when the opp hole transitions face-down → face-up.
    if (state.handResult && state.handResult.type === 'showdown') {
      const a3 = audio(); if (a3) a3.showdown();
    }
    render();
    afterAction();
    return true;
  }

  function afterAction() {
    if (state.handResult || state.complete) { handEndFlow(); return; }
    // All-in showdown mode: when either side has 0 chips behind, no
    // more betting decisions are possible — run out the remaining
    // streets automatically (one street per tick so the cards still
    // visibly land), then resolve. Saves the user from a string of
    // forced "check" prompts when the hand is already decided.
    if (state.playerChips <= 0 || state.chavezChips <= 0) {
      runoutToShowdown();
      return;
    }
    // Opponent think delay — slowed back from 350–800 ms to 700–1300 ms
    // so the player has time to read the announce banner, watch the chip
    // animate, and absorb the state change before the AI moves.
    if (state.toAct === 'chavez') scheduleOpp(700 + Math.random() * 600);
  }

  function runoutToShowdown() {
    const STEP_MS = 750;
    function step() {
      if (state.handResult || state.complete) { handEndFlow(); return; }
      const la = global.BFHoldem.legalActions(state);
      if (!la) { handEndFlow(); return; }
      const prevStreet = state.street;
      const who = state.toAct;
      // Nothing to bet/raise — auto-check, or call any tiny outstanding
      // bet (shouldn't happen if both are all-in but defensive).
      const action = la.canCheck ? 'check' : (la.canCall ? 'call' : 'fold');
      const res = global.BFHoldem.act(state, who, action, 0);
      if (res && res.error) { handEndFlow(); return; }
      if (state.street !== prevStreet && STREET_ANNOUNCE[state.street]) {
        const a = audio();
        if (a) a.streetDeal(state.street === 'flop' ? 3 : 1);
        announce(STREET_ANNOUNCE[state.street], 'is-deal');
      }
      render();
      setTimeout(step, STEP_MS);
    }
    // Tell the player what's happening before the first step lands.
    announce('ALL-IN — running it out', 'is-deal', true);
    setTimeout(step, 800);
  }

  function oppWatchdog() {
    if (state.complete || state.handResult) return;
    if (state.toAct !== 'chavez') return;
    if (oppTimer) return;
    scheduleOpp(400);
  }

  function scheduleOpp(delay) {
    clearTimeout(oppTimer);
    refs.oppSeat.classList.add('is-thinking');
    if (refs.bossAvatar) refs.bossAvatar.classList.add('is-thinking');
    setText(refs.turnStatus, cfg.name + ' is ' + TELLS.thinking);
    if (refs.bossTell) setText(refs.bossTell, TELLS.thinking);
    oppTimer = setTimeout(function () {
      oppTimer = null;
      refs.oppSeat.classList.remove('is-thinking');
      if (refs.bossAvatar) refs.bossAvatar.classList.remove('is-thinking');
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
        ? cfg.name + ' folds. Pot to you.'
        : 'You fold. ' + cfg.name + ' takes the pot.';
    } else if (state.handResult && state.handResult.type === 'showdown') {
      const me   = global.BFHoldem.handName(state.handResult.playerEval);
      const them = global.BFHoldem.handName(state.handResult.chavezEval);
      if (state.handResult.winner === 'player') {
        summary = 'Showdown — you win with ' + me + ' over ' + them + '.';
      } else if (state.handResult.winner === 'chavez') {
        summary = 'Showdown — ' + cfg.name + ' wins with ' + them + ' over ' + me + '.';
      } else {
        summary = 'Showdown — split pot (' + me + ').';
      }
    }
    if (summary) { logLine(summary, 'is-summary'); announce(summary, 'is-deal'); }

    persistMatch();

    if (state.complete) {
      if (state.won) markBeaten(cfg.slug);
      const a = audio();
      if (a) (state.won ? a.win : a.loss)();
      // Long enough for showdown reveal + win/loss sting to land before
      // the splash overlays the table. Player can still see the cards
      // because showEndSplash overrides .bf-end-splash to be a top
      // banner with no backdrop dimming.
      setTimeout(function () { showEndSplash(state.won); }, 3500);
      return;
    }

    setTimeout(function () {
      if (state.complete) return;
      global.BFHoldem.nextHand(state);
      persistMatch();
      global.BFHoldem.startHand(state);
      if (refs.oppLast) refs.oppLast.textContent = 'last move · —';
      render();
      logLine('— Hand ' + state.handNumber + ' —', 'is-summary');
      announce('HAND ' + state.handNumber, 'is-deal');
      // New hand → deal 2 hole cards each (4 audible flicks total).
      const a = audio(); if (a) a.cardDeal(4);
      if (state.toAct === 'chavez') scheduleOpp(900);
    }, 2400);
  }

  function showEndSplash(won) {
    const root = document.createElement('div');
    root.className = 'bf-end-splash';
    // Non-obstructive layout: pin to the top of the viewport, no dimming
    // backdrop. The table — including the revealed showdown — stays
    // visible underneath so the player can study the hand they just
    // won/lost. Inline overrides win against poker-base.css (and against
    // chavez.css when Chavez calls into a shared splash path later).
    root.style.position = 'fixed';
    root.style.inset = 'auto 0 auto 0';
    root.style.top = '12px';
    root.style.background = 'transparent';
    root.style.backdropFilter = 'none';
    root.style.alignItems = 'flex-start';
    root.style.justifyContent = 'center';
    root.style.pointerEvents = 'none'; // splash card re-enables it on itself
    root.innerHTML =
      '<div class="bf-end-card" style="pointer-events:auto; max-width:520px;">' +
        '<h2 class="bf-end-title">' +
          (won ? 'YOU BEAT ' + cfg.name : cfg.name + ' BEAT YOU') +
        '</h2>' +
        '<p class="bf-end-body">' +
          'The hand is still on the table. Take a look before you leave.' +
        '</p>' +
        '<div class="bf-end-stats">' +
          '<div>YOU<br><strong>' + state.playerChips + ' chips</strong></div>' +
          '<div>' + cfg.name + '<br><strong>' + state.chavezChips + ' chips</strong></div>' +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">' +
          '<button class="bf-end-button bf-end-review" type="button">Review hand</button>' +
          '<button class="bf-end-button" type="button">Back to the game</button>' +
        '</div>' +
      '</div>';

    // "Review hand" hides the splash so the player can study the cards.
    // Previous version used a single-tap document listener — fired on
    // any pointerdown, so the card snapped back the moment the player
    // tried to interact with the table. Replaced with a persistent
    // floating "Resume" pill that stays up until the player taps it.
    const card = root.querySelector('.bf-end-card');
    const reviewBtn = root.querySelector('.bf-end-review');
    const backBtn = root.querySelectorAll('.bf-end-button')[1];
    let resumePill = null;
    function setHidden(h) {
      card.style.opacity = h ? '0' : '1';
      card.style.transform = h ? 'translateY(-30px)' : 'translateY(0)';
      card.style.pointerEvents = h ? 'none' : 'auto';
    }
    card.style.transition = 'opacity 220ms ease, transform 280ms ease';
    reviewBtn.addEventListener('click', function () {
      setHidden(true);
      // Floating pill — fixed top-center, gold border, clearly clickable.
      // Stays up indefinitely; tap to restore the splash.
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
      // Remove the resume pill if it's still floating.
      if (resumePill && resumePill.parentNode) {
        resumePill.parentNode.removeChild(resumePill);
        resumePill = null;
      }
      if (won) {
        clearPersist();
        location.replace('index.html');
      } else {
        // Loss is terminal — see page.js for the rationale. We don't
        // clear the persist record on loss; the complete+!won state stays
        // so child-died.html guards land if anything else tries to fire.
        location.replace('child-died.html');
      }
    });
    document.body.appendChild(root);
    requestAnimationFrame(function () { root.classList.add('is-open'); });
  }

  // ───────────────────────── DOM binding ─────────────────────────

  function bindRefs() {
    refs = {
      handNo:        $('bf-hand'),
      blinds:        $('bf-blinds'),
      street:        $('bf-street'),
      stakesPlayer:  $('bf-stakes-player'),
      stakesPot:     $('bf-stakes-pot'),
      stakesOpp:     $('bf-stakes-chavez'),
      stakesCall:    $('bf-stakes-call'),
      stakesMid:     $('bf-stakes-mid'),
      playerCards:   $('bf-player-cards'),
      oppCards:      $('bf-chavez-cards'),
      community:     $('bf-community'),
      playerBet:     $('bf-player-bet'),
      oppBet:        $('bf-chavez-bet'),
      playerSeat:    $('bf-player-seat'),
      oppSeat:       $('bf-chavez-seat'),
      handStrength:  $('bf-hand-strength'),
      turnStatus:    $('bf-turn-status'),
      announce:      $('bf-announce'),
      log:           $('bf-log'),
      actions:       $('bf-actions'),
      btnFold:       $('bf-act-fold'),
      btnPassive:    $('bf-act-passive'),
      btnAggro:      $('bf-act-aggro'),
      sizing:        $('bf-sizing'),
      raise:         $('bf-raise-amount'),
      raiseValue:    $('bf-raise-value'),
      oppLast:       $('bf-chavez-last'),
      bossTell:      $('bf-boss-tell'),
      bossAvatar:    $('bf-boss-avatar'),
    };
    // Initial avatar paint:
    //  · If BossConfig.avatarFrames present → render first frame of the
    //    'average' mood. The mood-aware interval (started in init) will
    //    cycle frames + flip mood as chip ratio shifts.
    //  · Else if BossConfig.avatar present → static text (legacy).
    //  · Else (Fortuna) → leave element empty for the page's inline
    //    webcam-setup script to populate.
    if (refs.bossAvatar) {
      if (cfg.avatarFrames && cfg.avatarFrames.average) {
        refs.bossAvatar.textContent = cfg.avatarFrames.average[0];
      } else if (cfg.avatar) {
        refs.bossAvatar.textContent = cfg.avatar;
      }
    }
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
      document.querySelectorAll('.bf-preset.is-selected').forEach(function (b) {
        b.classList.remove('is-selected');
      });
    });
  }

  function bindPresets() {
    document.querySelectorAll('.bf-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const la = global.BFHoldem.legalActions(state);
        const v = presetValue(btn.dataset.preset, la);
        setSliderValue(v, btn.dataset.preset);
      });
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (state.complete || state.handResult || state.toAct !== 'player') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const la = global.BFHoldem.legalActions(state);
      const k = e.key.toLowerCase();
      if (k === 'f' && la.canFold) {
        e.preventDefault(); flash(refs.btnFold, 'is-pressing', 140);
        doAction('player', 'fold'); return;
      }
      if (k === 'c') {
        if (la.canCall)  { e.preventDefault(); flash(refs.btnPassive, 'is-pressing', 140); doAction('player', 'call'); return; }
        if (la.canCheck) { e.preventDefault(); flash(refs.btnPassive, 'is-pressing', 140); doAction('player', 'check'); return; }
      }
      if (k === 'b' || k === 'r' || k === ' ' || k === 'enter') {
        const amt = parseInt(refs.raise.value || '0', 10);
        if (la.canRaise) { e.preventDefault(); flash(refs.btnAggro, 'is-pressing', 140); doAction('player', 'raise', amt); return; }
        if (la.canBet)   { e.preventDefault(); flash(refs.btnAggro, 'is-pressing', 140); doAction('player', 'bet', amt); return; }
      }
      if (k === 'arrowup' || k === '+' || k === '=') {
        e.preventDefault();
        setSliderValue(Math.min(+refs.raise.max, +refs.raise.value + 1), null);
      }
      if (k === 'arrowdown' || k === '-') {
        e.preventDefault();
        setSliderValue(Math.max(+refs.raise.min, +refs.raise.value - 1), null);
      }
    });
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

    // Audio: arm first gesture (AudioContext can't start without one), then
    // mount the floating mute button. Both are no-ops if BFAudio missing.
    const a = audio();
    if (a) {
      a.armOnFirstGesture(document);
      a.mountMuteButton();
    }

    // Start the avatar frame cycle if this boss provides mood frames.
    // 520 ms matches the original Chavez kaomoji cadence. The mood used
    // each tick is whatever bossAvatarMood() returned on the most recent
    // refreshAvatarMood() (called from render()).
    if (cfg.avatarFrames && refs.bossAvatar) {
      avatarMood = bossAvatarMood();
      avatarFrameIdx = 0;
      paintAvatarFrame();
      avatarTimer = setInterval(paintAvatarFrame, 520);
    }

    if (state.complete) {
      render();
      showEndSplash(state.won);
      return;
    }

    global.BFHoldem.startHand(state);
    render();
    logLine('— Hand ' + state.handNumber + ' —', 'is-summary');
    // Initial deal — 4 cards' worth of flicks (2 each).
    if (a) a.cardDeal(4);
    if (state.toAct === 'chavez') scheduleOpp(1100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
