/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT/PAGE — tight shared UI controller for all 5 boss fights      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► DOMContentLoaded ──► init()                           │
  │                                                                          │
  │   Reads window.BossConfig before init:                                   │
  │     { slug, name, epithet?,                                              │
  │       startingStacks?:{playerChips,oppChips},  default {100,50}          │
  │       aiStyle?:{bluffFreq,tightness,aggression,loose,mixedness} }        │
  │                                                                          │
  │   Tight layout:                                                          │
  │     header  · h1(boss name + epithet) · back link                        │
  │     status  · Hand / Blinds / Street / Pot                               │
  │     opp seat   (top): name · stack · face-down hole cards · current bet  │
  │     community (mid): up to 5 cards, "PRE-FLOP" label when empty          │
  │     player seat (bot): face-up hole cards · stack · current bet          │
  │     play log  : scrollable history (#bf-log / #bf-log-scroll)            │
  │     actions  (fixed): Fold | Check/Call N | Bet/Raise N + slider+presets │
  │                                                                          │
  │   Animations (CSS classes added transiently by render() / doAction()):   │
  │     - card .is-dealing — new card slides in (hole on hand-start, board   │
  │       cards on flop/turn/river — only the NEW cards animate)             │
  │     - card .is-revealing — opp hole flip when all-in or showdown         │
  │     - seat .is-flashing — brief border pulse on actor                    │
  │     - seat .is-winner / .is-loser — applied at hand resolution           │
  │     - bet  .is-popping  — bet puck appears                               │
  │     - pot  .is-bumping  — pot value changed                              │
  │     - stack .is-ticking-up/-down — chip count moved                      │
  │     - .bf-street-announce — transient "FLOP/TURN/RIVER" banner           │
  │                                                                          │
  │   Play log:                                                              │
  │     - entries: hand header, action, street (with board cards), result   │
  │     - auto-scrolls to bottom on append                                  │
  │     - Clear button wipes scroll (does not affect state)                 │
  │                                                                          │
  │   Persistence: wendys_palace_boss_<slug> = {active, complete, won,       │
  │     snapshot:{playerChips, chavezChips, handNumber, buttonOnPlayer}}     │
  │   wendys_palace_bosses_beaten — shared string[] of slugs                 │
  │                                                                          │
  │   Reveal rule: opp hole flips face-up when either player all-in or       │
  │     at showdown.                                                         │
  │                                                                          │
  │   DOM ids consumed (in page HTML):                                       │
  │     #bf-hand, #bf-blinds, #bf-street, #bf-pot,                           │
  │     #bf-opp-name, #bf-opp-stack, #bf-opp-cards, #bf-opp-bet, #bf-opp-seat│
  │     #bf-player-stack, #bf-player-cards, #bf-player-bet, #bf-player-seat  │
  │     #bf-community, #bf-actions,                                          │
  │     #bf-act-fold, #bf-act-passive, #bf-act-aggro,                        │
  │     #bf-sizing, #bf-raise, #bf-raise-value, .bf-preset,                  │
  │     #bf-log, #bf-log-scroll, #bf-log-clear                               │
  │                                                                          │
  │   Exports: none (IIFE)                                                   │
  │   External deps: window.BFHoldem, window.BFAI, window.BossConfig         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  cfg=BossConfig||{slug:'unknown',name:'OPPONENT'}; START=cfg.startingStacks||{100,50}
  state=null; refs={}; oppTimer=null
  prevPot/PlayerStack/OppStack/PlayerBet/OppBet/Street/OppHidden — change-detect for FX
  prevCommunityLen/PlayerHoleKey/OppHoleKey — track card-set identity per host
  flash(el, cls, ms): remove→reflow→add→setTimeout remove (replays animation)
  renderCards(host, cards, faceDown, animateNewFromIdx?): rebuild on key change;
    mark .is-dealing on indices ≥ animateNewFromIdx; ≥0 = animate new
  showOppHole: handResult==='showdown' || any all-in
  render(): paint status; renderCards w/ deal-anim diff; opp-hole flip detect→is-revealing;
    detect pot/stack/bet/street deltas→animate; markBestCards; seat is-acting
  doAction(who, act, amt): BFHoldem.act; observe; LOG action; flash actor seat; render; afterAction
  afterAction: handResult|complete→handEndFlow; either all-in→runout; opp→scheduleOpp
  runoutToShowdown: auto-step check/call with delays; logs each step
  handEndFlow: LOG result; flag winner/loser seats; persist; complete→splash; else nextHand
  logHand(handNo, sb, bb); logAction(who, act, amt); logStreet(street, board); logResult(state); logClear
  scrollLogBottom: refs.logScroll.scrollTop = scrollHeight
  init: bind refs (incl log); buildState; bind actions/presets/keys/logClear; complete?splash:startHand+logFirst; opp→scheduleOpp
*/

(function (global) {
  const cfg = global.BossConfig || { slug: 'unknown', name: 'OPPONENT' };
  const KEY = 'wendys_palace_boss_' + cfg.slug;
  const BEATEN_KEY = 'wendys_palace_bosses_beaten';
  const START = cfg.startingStacks || { playerChips: 100, oppChips: 50 };

  let state = null;
  let refs = {};
  let oppTimer = null;
  let avatarTimer = null;
  let avatarFrameIdx = 0;
  let avatarCurrentMood = null;

  // Previous-render snapshots — used for change-detection-driven animations.
  let prevPot           = null;
  let prevPlayerStack   = null;
  let prevOppStack      = null;
  let prevPlayerBet     = 0;
  let prevOppBet        = 0;
  let prevStreet        = 'idle';
  let prevOppHidden     = true;
  let prevHandResult    = null;

  // Stacks at the moment the current hand was dealt — used by the
  // hand-concluded recap to compute who won how much (the pot has already
  // been transferred to the winner's chips by the time we render the recap).
  let handStartPlayerChips = null;
  let handStartOppChips    = null;

  function $(id) { return document.getElementById(id); }

  function flash(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflow so the animation replays
    el.classList.add(cls);
    setTimeout(function () { if (el) el.classList.remove(cls); }, ms || 720);
  }

  // ───── Chip visuals ─────
  // Convert a chip value into a greedy denomination breakdown so each unit
  // is a discrete visible token. Cap the total array so a huge stack doesn't
  // spawn 200 chips into the DOM — overflow is rendered as "+N" by callers.

  const CHIP_DENOMS = [
    { v: 500, cls: 'bf-chip-g'  },  // gold
    { v: 100, cls: 'bf-chip-bk' },  // black
    { v: 25,  cls: 'bf-chip-bl' },  // blue
    { v: 5,   cls: 'bf-chip-r'  },  // red
    { v: 1,   cls: 'bf-chip-w'  },  // white
  ];
  function chipBreakdown(value) {
    let v = Math.max(0, value | 0);
    const chips = [];
    for (const d of CHIP_DENOMS) {
      while (v >= d.v && chips.length < 40) {
        chips.push(d.cls);
        v -= d.v;
      }
      if (chips.length >= 40) break;
    }
    return chips;
  }
  function renderChipPile(pileEl, value, maxVisible) {
    if (!pileEl) return;
    const chips = chipBreakdown(value);
    const cap = maxVisible || 10;
    const visible = chips.slice(0, cap);
    const overflow = chips.length - visible.length;
    let html = '';
    for (const cls of visible) html += '<span class="bf-chip ' + cls + '"></span>';
    if (overflow > 0) html += '<span class="bf-chip-overflow">+' + overflow + '</span>';
    pileEl.innerHTML = html;
  }
  function ensurePileChild(host, position) {
    if (!host) return null;
    let pile = host.querySelector(':scope > .bf-chip-pile');
    if (!pile) {
      pile = document.createElement('span');
      pile.className = 'bf-chip-pile';
      if (position === 'append') host.appendChild(pile);
      else host.insertBefore(pile, host.firstChild);
    }
    return pile;
  }
  function renderBet(host, value) {
    if (!host) return;
    if (value > 0) {
      const chips = chipBreakdown(value);
      const cap = 6;
      const visible = chips.slice(0, cap);
      let pileHTML = '';
      for (const cls of visible) pileHTML += '<span class="bf-chip ' + cls + '"></span>';
      host.innerHTML =
        '<span class="bf-chip-pile">' + pileHTML + '</span>' +
        '<span class="bf-bet-label">bet ' + value + '</span>';
    } else {
      if (host.innerHTML !== '') host.innerHTML = '';
    }
  }

  // ───── Fly-chip animation ─────
  // Spawns 3-5 chips at the seat's center, animates them to the pot center
  // with stagger + slight scatter. Each chip self-removes after the
  // transition. Color is sampled from the bet's denomination breakdown so
  // a big shove flings gold, a min-bet flings whites.

  function flyChipsToPot(sourceEl, deltaValue) {
    if (!sourceEl || !refs.potCell || deltaValue <= 0) return;
    const breakdown = chipBreakdown(deltaValue);
    const flyCount = Math.min(5, Math.max(2, Math.ceil(breakdown.length / 6)));
    const colors = [];
    for (let i = 0; i < flyCount; i++) {
      colors.push(breakdown[Math.min(i * 2, breakdown.length - 1)] || 'bf-chip-w');
    }
    const srcRect = sourceEl.getBoundingClientRect();
    const dstRect = refs.potCell.getBoundingClientRect();
    for (let i = 0; i < colors.length; i++) {
      const cls = colors[i];
      const chip = document.createElement('div');
      chip.className = 'bf-fly-chip ' + cls;
      const startX = srcRect.left + srcRect.width / 2 - 8 + (Math.random() - 0.5) * 24;
      const startY = srcRect.top  + srcRect.height / 2 - 8 + (Math.random() - 0.5) * 8;
      chip.style.left = startX + 'px';
      chip.style.top  = startY + 'px';
      document.body.appendChild(chip);
      // Force layout so the transition triggers when we update transform
      chip.getBoundingClientRect();
      const dx = (dstRect.left + dstRect.width / 2) - (startX + 8) + (Math.random() - 0.5) * 22;
      const dy = (dstRect.top  + dstRect.height / 2) - (startY + 8);
      chip.style.setProperty('--tx', dx + 'px');
      chip.style.setProperty('--ty', dy + 'px');
      setTimeout(function () { chip.classList.add('is-flying', 'is-arriving'); }, 20 + i * 60);
      setTimeout(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 920 + i * 60);
    }
    // Bump the pot when chips "land"
    setTimeout(function () { flash(refs.potCell, 'is-bumping', 420); }, 580);
  }

  // ───── Boss avatar (kaomoji) ─────
  // Mood derived from chip ratio against boss's own starting stack so each
  // boss has the same expressiveness curve regardless of starting bankroll.
  // BossConfig.kaomoji = { faces: {moodId:[f1,f2,f3,f4]}, tells: {moodId:'…'},
  //   cap?: 'ASCII\nString' } — cap is prepended to every face.

  function avatarMood() {
    if (!state) return 'even';
    if (state.chavezChips <= 0) return 'broken';
    const startOpp = (cfg.startingStacks && cfg.startingStacks.oppChips) || 50;
    const r = state.chavezChips / Math.max(1, startOpp);
    if (r < 0.20) return 'desperate';
    if (r < 0.50) return 'pressured';
    if (r > 2.50) return 'dominant';
    if (r > 1.50) return 'ahead';
    return 'even';
  }

  function paintAvatarFrame() {
    if (!refs.bossAvatar || !cfg.kaomoji || !cfg.kaomoji.faces) return;
    const mood = avatarMood();
    if (mood !== avatarCurrentMood) {
      avatarCurrentMood = mood;
      avatarFrameIdx = 0;
      refs.bossAvatar.dataset.mood = mood;
    }
    const frames = cfg.kaomoji.faces[mood] || cfg.kaomoji.faces.even || ['(•_•)'];
    const face = frames[avatarFrameIdx % frames.length];
    const cap = cfg.kaomoji.cap || '';
    refs.bossAvatar.textContent = cap ? (cap + '\n' + face) : face;
    avatarFrameIdx++;
    if (refs.bossTell) {
      const tell = (cfg.kaomoji.tells && cfg.kaomoji.tells[mood]) || '';
      // While the boss is "thinking" (oppTimer active) override the tell
      const thinking = !!oppTimer;
      refs.bossTell.textContent = thinking ? 'thinking…' : tell;
    }
  }

  function startAvatarCycle() {
    if (avatarTimer || !cfg.kaomoji || !cfg.kaomoji.faces) return;
    paintAvatarFrame();
    avatarTimer = setInterval(paintAvatarFrame, 520);
  }

  // ───── Hand-concluded recap overlay ─────
  // Replaces the silent 1.9s gap between hands. Shows who won what and the
  // current stacks. Auto-dismisses after RECAP_MS or on click. The dismiss
  // callback is what kicks the next hand off, so we can't double-fire.

  function showHandRecap(onDismiss) {
    if (!state.handResult) { onDismiss(); return; }
    const r = state.handResult;
    const startP = handStartPlayerChips != null ? handStartPlayerChips : state.playerChips;
    const startO = handStartOppChips    != null ? handStartOppChips    : state.chavezChips;
    const deltaP = state.playerChips - startP;
    const deltaO = state.chavezChips - startO;
    const won = Math.max(Math.abs(deltaP), Math.abs(deltaO));

    let mainLine;
    if (r.type === 'fold') {
      if (r.winner === 'player') {
        mainLine = 'You take <span class="bf-recap-amt">' + won + '</span> — ' + cfg.name + ' folded.';
      } else {
        mainLine = cfg.name + ' takes <span class="bf-recap-amt">' + won + '</span> — you folded.';
      }
    } else if (r.type === 'showdown') {
      const me   = global.BFHoldem.handName(r.playerEval);
      const them = global.BFHoldem.handName(r.chavezEval);
      if (r.winner === 'player') {
        mainLine = 'You win <span class="bf-recap-amt">' + won + '</span> at showdown — ' + me + ' over ' + them + '.';
      } else if (r.winner === 'chavez') {
        mainLine = cfg.name + ' wins <span class="bf-recap-amt">' + won + '</span> at showdown — ' + them + ' over ' + me + '.';
      } else {
        mainLine = 'Split pot — ' + me + '.';
      }
    } else {
      mainLine = 'Hand over.';
    }

    function deltaCell(d) {
      if (d > 0) return '<span class="bf-recap-stack-delta is-up">+' + d + '</span>';
      if (d < 0) return '<span class="bf-recap-stack-delta is-down">' + d + '</span>';
      return '<span class="bf-recap-stack-delta is-even">—</span>';
    }

    const root = document.createElement('div');
    root.className = 'bf-recap';
    root.innerHTML =
      '<div class="bf-recap-card">' +
        '<h2 class="bf-recap-title">Hand Concluded</h2>' +
        '<p class="bf-recap-line">' + mainLine + '</p>' +
        '<div class="bf-recap-stacks">' +
          '<div class="bf-recap-stack">' +
            '<span class="bf-recap-stack-name">You</span>' +
            '<span class="bf-recap-stack-value">' + state.playerChips + '</span>' +
            deltaCell(deltaP) +
          '</div>' +
          '<span class="bf-recap-sep">·</span>' +
          '<div class="bf-recap-stack">' +
            '<span class="bf-recap-stack-name">' + cfg.name + '</span>' +
            '<span class="bf-recap-stack-value">' + state.chavezChips + '</span>' +
            deltaCell(deltaO) +
          '</div>' +
        '</div>' +
        '<div class="bf-recap-hint">click or wait</div>' +
      '</div>';

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      root.classList.add('is-out');
      setTimeout(function () {
        if (root.parentNode) root.parentNode.removeChild(root);
        try { onDismiss(); } catch {}
      }, 280);
    }
    root.addEventListener('click', dismiss);
    document.body.appendChild(root);
    // No auto-dismiss — player clicks the recap to advance to the next hand.
  }

  // ───── Persistence ─────

  function readPersist() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch { return null; }
  }
  function writePersist(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
  }
  function clearPersist() {
    try { localStorage.removeItem(KEY); } catch {}
  }
  function markBeaten(slug) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(BEATEN_KEY) || '[]'); } catch {}
    if (!Array.isArray(list)) list = [];
    if (list.indexOf(slug) < 0) list.push(slug);
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
    persistInitial(s);
    return s;
  }
  function persistInitial(s) {
    writePersist({
      active: true, complete: false, won: false,
      snapshot: {
        playerChips: s.playerChips, chavezChips: s.chavezChips,
        handNumber: s.handNumber, buttonOnPlayer: s.buttonOnPlayer,
      },
    });
  }

  // ───── Cards ─────

  function cardEl(card, faceDown) {
    const el = document.createElement('div');
    el.className = 'bf-card';
    if (faceDown) {
      el.classList.add('bf-card-back');
      el.innerHTML = '<span class="bf-card-rank">·</span><span class="bf-card-suit">·</span>';
      return el;
    }
    el.classList.add('bf-suit-' + card.suit);
    el.innerHTML =
      '<span class="bf-card-rank">' + global.BFHoldem.rankLabel(card.rank) + '</span>' +
      '<span class="bf-card-suit">' + global.BFHoldem.GLYPHS[card.suit] + '</span>';
    return el;
  }

  // renderCards rebuilds the host's children whenever the card-set or faceDown
  // state changes. Tracks prev length per host (in dataset) and animates only
  // the cards at index ≥ prevLen (the new ones) — so a flop animates 3 cards,
  // the turn animates only the 4th, and the river only the 5th.
  function renderCards(host, cards, faceDown) {
    if (!host) return;
    const key = cards.map(c => c.rank + c.suit).join(',') + '|' + (faceDown ? 'd' : 'u');
    if (host.dataset.cardsKey === key) return;
    const prevLen = parseInt(host.dataset.prevLen || '0', 10);
    // If face-down → face-up transition for same card-set, treat as "no new" deal-in.
    // Otherwise, new cards animate from prevLen onward.
    const sameSet = host.dataset.cardsKeyBare === cards.map(c => c.rank + c.suit).join(',');
    host.dataset.cardsKey = key;
    host.dataset.cardsKeyBare = cards.map(c => c.rank + c.suit).join(',');
    host.dataset.prevLen = String(cards.length);
    host.innerHTML = '';
    for (let i = 0; i < cards.length; i++) {
      const el = cardEl(cards[i], faceDown);
      // Animate as new if: (a) this is a brand-new card past the old length,
      // or (b) the whole set just changed (new hole cards on hand-start).
      if (!sameSet) {
        if (cards.length > prevLen) {
          // Set grew — only the new tail animates. Stagger so a 3-card flop
          // lands one-at-a-time during all-in runout instead of as a block.
          if (i >= prevLen) {
            el.classList.add('is-dealing');
            const ord = i - prevLen;
            if (ord > 0) el.style.animationDelay = (ord * 360) + 'ms';
          }
        } else {
          // Set is the same size but rank/suit changed → new hand deal-in,
          // all cards animate.
          el.classList.add('is-dealing');
        }
      }
      host.appendChild(el);
    }
  }

  function showOppHole() {
    if (state.handResult && state.handResult.type === 'showdown') return true;
    if (state.chavezAllIn || state.playerAllIn) return true;
    return false;
  }
  function contributingCards(best) {
    if (!best || !best.cards) return [];
    const cat = best.cat, tb = best.tb;
    if (cat === 1) return [];
    if (cat === 5 || cat === 6 || cat === 7 || cat === 9) return best.cards;
    const ranks = new Set();
    if (cat === 2 || cat === 4 || cat === 8) ranks.add(tb[0]);
    else if (cat === 3) { ranks.add(tb[0]); ranks.add(tb[1]); }
    return best.cards.filter(c => ranks.has(c.rank));
  }
  function markBestCards() {
    if (!refs.playerCards || !refs.community) return;
    document.querySelectorAll('.bf-card.is-best').forEach(el => el.classList.remove('is-best'));
    if (!state.board || state.board.length < 3) return;
    if (!state.playerHole || state.playerHole.length < 2) return;
    const best = global.BFHoldem.evalBest(state.playerHole.concat(state.board));
    const winning = contributingCards(best);
    if (!winning.length) return;
    function is(card) { return winning.some(b => b.rank === card.rank && b.suit === card.suit); }
    refs.playerCards.querySelectorAll('.bf-card').forEach((el, i) => {
      if (state.playerHole[i] && is(state.playerHole[i])) el.classList.add('is-best');
    });
    refs.community.querySelectorAll('.bf-card').forEach((el, i) => {
      if (state.board[i] && is(state.board[i])) el.classList.add('is-best');
    });
  }

  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

  const STREET_LABELS = {
    preflop: 'PRE-FLOP', flop: 'FLOP', turn: 'TURN',
    river: 'RIVER', showdown: 'SHOWDOWN', idle: '—',
  };

  function spawnStreetAnnounce(label) {
    const host = refs.community && refs.community.parentNode;
    if (!host) return;
    // Clear any previous announce so we don't stack
    host.querySelectorAll('.bf-street-announce').forEach(n => n.remove());
    const el = document.createElement('div');
    el.className = 'bf-street-announce';
    el.textContent = label;
    host.appendChild(el);
    setTimeout(function () { if (el && el.parentNode) el.remove(); }, 1700);
  }

  function render() {
    setText(refs.hand, '#' + state.handNumber);
    const bl = global.BFHoldem.blindsFor(state.handNumber);
    setText(refs.blinds, bl.sb + '/' + bl.bb);
    setText(refs.street, STREET_LABELS[state.street] || '—');

    // ── Pot delta → bump animation + repaint pot chip pile
    if (prevPot !== null && prevPot !== state.pot) {
      flash(refs.potCell, 'is-bumping', 420);
    }
    setText(refs.pot, String(state.pot));
    renderChipPile(refs.potPile, state.pot, 12);
    prevPot = state.pot;

    // ── Stack tick animations + chip-pile repaint
    if (prevPlayerStack !== null && prevPlayerStack !== state.playerChips) {
      const dir = state.playerChips > prevPlayerStack ? 'is-ticking-up' : 'is-ticking-down';
      flash(refs.playerStackBox, dir, 620);
    }
    if (prevOppStack !== null && prevOppStack !== state.chavezChips) {
      const dir = state.chavezChips > prevOppStack ? 'is-ticking-up' : 'is-ticking-down';
      flash(refs.oppStackBox, dir, 620);
    }
    setText(refs.playerStack, String(state.playerChips));
    setText(refs.oppStack, String(state.chavezChips));
    renderChipPile(refs.playerStackPile, state.playerChips, 10);
    renderChipPile(refs.oppStackPile,    state.chavezChips, 10);

    // ── Bet increase → fly chips from seat to pot
    if (state.playerBet > prevPlayerBet) {
      flyChipsToPot(refs.playerSeat, state.playerBet - prevPlayerBet);
    }
    if (state.chavezBet > prevOppBet) {
      flyChipsToPot(refs.oppSeat, state.chavezBet - prevOppBet);
    }
    // Bet puck pop when first appearing
    if (state.playerBet > 0 && prevPlayerBet === 0) flash(refs.playerBet, 'is-popping', 320);
    if (state.chavezBet > 0 && prevOppBet === 0)    flash(refs.oppBet,    'is-popping', 320);

    renderBet(refs.oppBet, state.chavezBet);
    renderBet(refs.playerBet, state.playerBet);
    prevPlayerStack = state.playerChips;
    prevOppStack    = state.chavezChips;
    prevPlayerBet   = state.playerBet;
    prevOppBet      = state.chavezBet;

    // ── Cards
    renderCards(refs.playerCards, state.playerHole || [], false);
    const oppFaceDown = !showOppHole();
    renderCards(refs.oppCards, state.chavezHole || [], oppFaceDown);
    // Opp hole flip (face-down → face-up) — apply reveal animation to each card
    if (prevOppHidden && !oppFaceDown) {
      const cards = refs.oppCards.querySelectorAll('.bf-card');
      cards.forEach(c => flash(c, 'is-revealing', 480));
    }
    prevOppHidden = oppFaceDown;

    // ── Community — empty placeholder vs board
    if (refs.community) {
      const board = state.board || [];
      if (board.length === 0) {
        if (refs.community.dataset.cardsKey !== 'empty') {
          refs.community.dataset.cardsKey = 'empty';
          refs.community.dataset.cardsKeyBare = '';
          refs.community.dataset.prevLen = '0';
          refs.community.innerHTML = '<span class="bf-community-empty">— pre-flop —</span>';
        }
      } else {
        // Force renderCards to repaint after the empty placeholder
        if (refs.community.dataset.cardsKey === 'empty') {
          refs.community.dataset.cardsKey = '';
          refs.community.dataset.cardsKeyBare = '';
          refs.community.dataset.prevLen = '0';
        }
        renderCards(refs.community, board, false);
      }
    }
    markBestCards();

    // ── Street change → announce banner + log entry
    if (state.street !== prevStreet) {
      if (state.street === 'flop' || state.street === 'turn' || state.street === 'river') {
        spawnStreetAnnounce(STREET_LABELS[state.street]);
        logStreet(state.street, state.board || []);
      }
      prevStreet = state.street;
    }

    // ── Seat is-acting (current actor highlight)
    refs.oppSeat.classList.toggle('is-acting',
      !state.complete && !state.handResult && state.toAct === 'chavez');
    refs.playerSeat.classList.toggle('is-acting',
      !state.complete && !state.handResult && state.toAct === 'player');

    renderHandStrength();
    renderActions();
  }

  // ───── Player hand-strength display ─────
  // Shows the player's current best 5-card hand label and a color-coded
  // strength tier. Sits between the player seat and the action bar.
  // Updates every render. Hidden when the hand isn't dealt or the match
  // is complete.
  const STRENGTH_TIERS = {
    1: { label: 'High Card',      tier: 'nothing' },
    2: { label: 'Pair',           tier: 'weak'    },
    3: { label: 'Two Pair',       tier: 'medium'  },
    4: { label: 'Three of a Kind',tier: 'medium'  },
    5: { label: 'Straight',       tier: 'strong'  },
    6: { label: 'Flush',          tier: 'strong'  },
    7: { label: 'Full House',     tier: 'monster' },
    8: { label: 'Four of a Kind', tier: 'monster' },
    9: { label: 'Straight Flush', tier: 'monster' },
  };
  function ensureHandStrengthEl() {
    let el = document.getElementById('bf-hand-strength');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'bf-hand-strength';
    el.className = 'bf-hand-strength';
    el.innerHTML =
      '<span class="bf-hs-label">YOUR HAND</span>' +
      '<span class="bf-hs-name">—</span>' +
      '<span class="bf-hs-tier">—</span>';
    // Live inside the action bar as the first item — sits next to the
    // fold/check/bet buttons so the readout is in the same band as the
    // controls the player is about to use.
    const actions = $('bf-actions');
    if (actions) {
      actions.insertBefore(el, actions.firstChild);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }
  function renderHandStrength() {
    if (!state || !state.playerHole || state.playerHole.length < 2) return;
    const el = ensureHandStrengthEl();
    const board = state.board || [];
    const cards = state.playerHole.concat(board);
    const best = global.BFHoldem.evalBest(cards);
    if (!best) return;
    const info = STRENGTH_TIERS[best.cat] || STRENGTH_TIERS[1];
    const nameEl = el.querySelector('.bf-hs-name');
    const tierEl = el.querySelector('.bf-hs-tier');
    nameEl.textContent = global.BFHoldem.handName(best);
    tierEl.textContent = info.tier.toUpperCase();
    el.classList.remove('is-nothing', 'is-weak', 'is-medium', 'is-strong', 'is-monster');
    el.classList.add('is-' + info.tier);
  }

  function renderActions() {
    const la = global.BFHoldem.legalActions(state);
    // Lock the action bar entirely once either side is all-in — the runout
    // is driven by click-to-advance and the player has nothing meaningful
    // to do. Without this gate, the Check button enables between street
    // ticks and a stray click re-enters runoutToShowdown.
    const allInLocked = state.playerAllIn || state.chavezAllIn;
    const isPlayer = state.toAct === 'player' && !state.handResult && !state.complete && !allInLocked;

    // Always-visible buttons. Disabled state is purely visual; the click
    // handlers also guard, so a stuck-enabled button can't misfire.

    // Fold
    refs.btnFold.disabled = !(isPlayer && la.canFold);

    // Passive (Check / Call) — label tracks legal action; disabled when
    // neither is legal (e.g. waiting for opp).
    if (isPlayer && la.canCall) {
      refs.btnPassive.textContent = 'Call ' + la.callAmount;
      refs.btnPassive.dataset.kind = 'call';
      refs.btnPassive.disabled = false;
    } else if (isPlayer && la.canCheck) {
      refs.btnPassive.textContent = 'Check';
      refs.btnPassive.dataset.kind = 'check';
      refs.btnPassive.disabled = false;
    } else {
      // Show whichever label would be relevant — Call if facing a bet at
      // all, else Check — but dimmed.
      const facing = la.toCall > 0;
      refs.btnPassive.textContent = facing
        ? 'Call ' + (la.callAmount || 0)
        : 'Check';
      refs.btnPassive.dataset.kind = facing ? 'call' : 'check';
      refs.btnPassive.disabled = true;
    }

    // Aggro (Bet / Raise) — disabled when can't bet or raise.
    const canAggro = isPlayer && (la.canBet || la.canRaise);
    refs.btnAggro.disabled = !canAggro;

    // Sizing slider + presets — always visible, dimmed when no bet/raise option.
    let minSize = 0, maxSize = 0;
    if (la.canRaise)      { minSize = la.minRaiseTo; maxSize = la.maxRaiseTo; }
    else if (la.canBet)   { minSize = la.minBet;     maxSize = la.maxBet;     }
    refs.raise.min = String(minSize);
    refs.raise.max = String(maxSize);
    let cur = parseInt(refs.raise.value || '0', 10);
    if (!isFinite(cur) || cur < minSize) cur = minSize;
    if (cur > maxSize) cur = maxSize;
    refs.raise.value = String(cur);
    setText(refs.raiseValue, String(cur));

    const sizingActive = canAggro && minSize !== maxSize;
    refs.sizing.classList.toggle('is-disabled', !sizingActive);
    refs.raise.disabled = !sizingActive;
    document.querySelectorAll('.bf-preset').forEach(function (b) {
      b.disabled = !sizingActive;
    });

    updateAggroLabel();
  }

  function updateAggroLabel() {
    const la = global.BFHoldem.legalActions(state);
    const v = parseInt(refs.raise.value || '0', 10);
    if (la.canRaise) refs.btnAggro.textContent = 'Raise to ' + v;
    else if (la.canBet) refs.btnAggro.textContent = 'Bet ' + v;
    else refs.btnAggro.textContent = 'Bet';
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

  function setSliderValue(v, preset) {
    refs.raise.value = String(v);
    setText(refs.raiseValue, String(v));
    updateAggroLabel();
    document.querySelectorAll('.bf-preset').forEach(b => {
      b.classList.toggle('is-selected', b.dataset.preset === preset);
    });
  }

  // ───── Play log ─────

  function logAppend(html, klass) {
    if (!refs.logScroll) return;
    const el = document.createElement('div');
    el.className = 'bf-log-entry' + (klass ? ' ' + klass : '');
    el.innerHTML = html;
    refs.logScroll.appendChild(el);
    scrollLogBottom();
  }
  function scrollLogBottom() {
    if (!refs.logScroll) return;
    // Schedule on next frame so just-appended children are measured
    requestAnimationFrame(function () {
      refs.logScroll.scrollTop = refs.logScroll.scrollHeight;
    });
  }
  function logClear() {
    if (refs.logScroll) refs.logScroll.innerHTML = '';
  }
  function logHand(handNo) {
    const bl = global.BFHoldem.blindsFor(handNo);
    logAppend(
      'Hand #' + handNo +
        ' <span style="opacity:.6">· blinds ' + bl.sb + '/' + bl.bb + '</span>',
      'is-hand');
  }
  function logAction(who, action, amount) {
    const name = who === 'player' ? 'You' : cfg.name;
    let verb;
    if (action === 'fold')       verb = who === 'player' ? 'fold' : 'folds';
    else if (action === 'check') verb = who === 'player' ? 'check' : 'checks';
    else if (action === 'call')  verb = who === 'player' ? 'call'  : 'calls';
    else if (action === 'bet')   verb = (who === 'player' ? 'bet '   : 'bets ')   + '<span class="bf-log-amt">' + amount + '</span>';
    else if (action === 'raise') verb = (who === 'player' ? 'raise to ' : 'raises to ') + '<span class="bf-log-amt">' + amount + '</span>';
    else                          verb = action;
    logAppend(name + ' ' + verb,
      'is-action ' + (who === 'player' ? 'is-player' : 'is-opp'));
  }
  function logStreet(street, board) {
    const label = STREET_LABELS[street] || street.toUpperCase();
    logAppend(label + ' <span class="bf-log-board">' + boardHTML(board) + '</span>',
      'is-street');
  }
  function boardHTML(board) {
    if (!board || !board.length) return '';
    return board.map(function (c) {
      const isRed = (c.suit === 'H' || c.suit === 'D');
      const label = global.BFHoldem.rankLabel(c.rank) + global.BFHoldem.GLYPHS[c.suit];
      return isRed
        ? '<span class="bf-log-suit-red">' + label + '</span>'
        : label;
    }).join(' ');
  }
  function logResult() {
    if (!state.handResult) return;
    const r = state.handResult;
    if (r.type === 'fold') {
      if (r.winner === 'player') {
        logAppend('You take the pot — ' + cfg.name + ' folded.', 'is-result');
      } else {
        logAppend(cfg.name + ' takes the pot — you folded.', 'is-result is-loss');
      }
    } else if (r.type === 'showdown') {
      const me   = global.BFHoldem.handName(r.playerEval);
      const them = global.BFHoldem.handName(r.chavezEval);
      if (r.winner === 'player') {
        logAppend('You win at showdown — ' + me + ' over ' + them + '.', 'is-result');
      } else if (r.winner === 'chavez') {
        logAppend(cfg.name + ' wins at showdown — ' + them + ' over ' + me + '.',
          'is-result is-loss');
      } else {
        logAppend('Split pot — ' + me + '.', 'is-result is-split');
      }
    }
  }

  // ───── Action loop ─────

  function doAction(who, action, amount) {
    const prevStreetLocal = state.street;
    const res = global.BFHoldem.act(state, who, action, amount);
    if (res.error) {
      // Salvage AI mis-calls by playing the safest legal option
      if (who === 'chavez') {
        const la = global.BFHoldem.legalActions(state);
        if (la.canCheck) return doAction('chavez', 'check');
        if (la.canCall)  return doAction('chavez', 'call');
        if (la.canFold)  return doAction('chavez', 'fold');
      }
      return false;
    }
    if (global.BFAI && global.BFAI.observe) {
      try { global.BFAI.observe(state, who, action, amount, prevStreetLocal); } catch {}
    }
    // Log the action
    logAction(who, action, amount);
    // Flash the actor's seat — engine has flipped toAct to opponent already
    if (who === 'player') flash(refs.playerSeat, 'is-flashing', 700);
    else                  flash(refs.oppSeat,    'is-flashing', 700);
    render();
    afterAction();
    return true;
  }

  let inRunout = false;
  function afterAction() {
    if (state.handResult || state.complete) { handEndFlow(); return; }
    // Either side all-in → run out automatically (one street per tick).
    // Guard against re-entry: doAction can fire again from a stray click
    // while the runout is mid-flight, which would spawn a second
    // waitForAdvance loop racing the first.
    if (state.playerChips <= 0 || state.chavezChips <= 0) {
      if (!inRunout) runoutToShowdown();
      return;
    }
    if (state.toAct === 'chavez') scheduleOpp(1500 + Math.random() * 900);
  }

  function runoutToShowdown() {
    inRunout = true;
    showEquityBadge();
    function step() {
      if (state.handResult || state.complete) { inRunout = false; hideEquityBadge(); hideAdvancePrompt(); handEndFlow(); return; }
      const la = global.BFHoldem.legalActions(state);
      if (!la) { inRunout = false; hideEquityBadge(); hideAdvancePrompt(); handEndFlow(); return; }
      const action = la.canCheck ? 'check' : (la.canCall ? 'call' : 'fold');
      const who = state.toAct;
      const res = global.BFHoldem.act(state, who, action, 0);
      if (res && res.error) { inRunout = false; hideEquityBadge(); hideAdvancePrompt(); handEndFlow(); return; }
      render();
      // Recompute equity once the new card(s) have landed visually.
      const dealDelay = state.street === 'flop' ? 1200 : 500;
      setTimeout(showEquityBadge, dealDelay);
      // Wait for the player to click before revealing the next street.
      // Pacing is the player's; the badge update above just needs enough
      // headroom that the % is correct by the time they click.
      waitForAdvance(step);
    }
    // Brief beat before the first prompt so the all-in seat flash lands
    setTimeout(function () { waitForAdvance(step); }, 600);
  }

  // ───── Click-to-advance (runout pacing) ─────
  // Shows a tap-target overlay; resolves on click or Space/Enter. Used
  // between each card during all-in runout so the player drives the reveal
  // instead of a timer.
  function waitForAdvance(cb) {
    showAdvancePrompt();
    function clear() {
      hideAdvancePrompt();
      document.removeEventListener('click',   onClick, true);
      document.removeEventListener('keydown', onKey,   true);
    }
    function onClick(e) {
      // Narrow exclusion: only the actual action buttons (which are disabled
      // during runout anyway) — clicking dead space in the action-bar
      // wrapper should still advance, so the player isn't confused by a
      // strip of the screen that "doesn't work".
      if (e.target && e.target.closest && e.target.closest('button, input, a')) return;
      e.preventDefault();
      e.stopPropagation();
      clear();
      cb();
    }
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        clear();
        cb();
      }
    }
    document.addEventListener('click',   onClick, true);
    document.addEventListener('keydown', onKey,   true);
  }
  function showAdvancePrompt() {
    let p = document.getElementById('bf-advance');
    if (!p) {
      p = document.createElement('div');
      p.id = 'bf-advance';
      p.className = 'bf-advance';
      p.innerHTML = '<span class="bf-advance-text">CLICK TO REVEAL</span>';
      document.body.appendChild(p);
    }
  }
  function hideAdvancePrompt() {
    const p = document.getElementById('bf-advance');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  // ───── Equity badge (shown during all-in runout) ─────
  function showEquityBadge() {
    if (!global.BFHoldem.equity) return;
    const eq = global.BFHoldem.equity(state, 500);
    if (eq == null) return;
    let badge = document.getElementById('bf-equity');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'bf-equity';
      badge.className = 'bf-equity';
      badge.innerHTML =
        '<span class="bf-equity-label">YOU WIN</span>' +
        '<span class="bf-equity-val">—</span>';
      document.body.appendChild(badge);
    }
    const val = badge.querySelector('.bf-equity-val');
    const pct = eq * 100;
    val.textContent = pct.toFixed(1) + '%';
    badge.classList.remove('is-fav', 'is-dog', 'is-coin');
    if (pct >= 65)      badge.classList.add('is-fav');
    else if (pct <= 35) badge.classList.add('is-dog');
    else                badge.classList.add('is-coin');
  }
  function hideEquityBadge() {
    const badge = document.getElementById('bf-equity');
    if (!badge || !badge.parentNode) return;
    badge.classList.add('is-out');
    setTimeout(function () {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    }, 280);
  }

  function scheduleOpp(delay) {
    clearTimeout(oppTimer);
    oppTimer = setTimeout(function () {
      oppTimer = null;
      if (state.complete || state.handResult || state.toAct !== 'chavez') return;
      const decision = global.BFAI.decide(state);
      doAction('chavez', decision.action, decision.amount);
    }, delay);
  }

  function applyWinnerSeatFX() {
    if (!state.handResult) return;
    const r = state.handResult;
    if (r.winner === 'player') {
      flash(refs.playerSeat, 'is-winner', 2900);
      flash(refs.oppSeat,    'is-loser',   900);
    } else if (r.winner === 'chavez') {
      flash(refs.oppSeat,    'is-winner', 2900);
      flash(refs.playerSeat, 'is-loser',   900);
    }
  }

  function handEndFlow() {
    render();
    if (prevHandResult !== state.handResult) {
      logResult();
      applyWinnerSeatFX();
      prevHandResult = state.handResult;
    }
    persistMatch();
    if (state.complete) {
      if (state.won) markBeaten(cfg.slug);
      // One more click before the win/lose splash — keeps everything in
      // the runout consistent with the click-only pacing rule and lets the
      // player sit with the final board for as long as they want.
      setTimeout(function () {
        waitForAdvance(function () { showEndSplash(state.won); });
      }, 600);
      return;
    }
    // Recap overlay — clear delineation between hands. Replaces the old
    // silent 1.9s timer; the recap's dismiss callback kicks the next hand.
    function startNextHand() {
      if (state.complete) return;
      global.BFHoldem.nextHand(state);
      persistMatch();
      global.BFHoldem.startHand(state);
      // Capture starting stacks for the next recap's delta math
      handStartPlayerChips = state.playerChips;
      handStartOppChips    = state.chavezChips;
      // Reset prev tracking so the next hand's deal-in / pot fires fresh
      prevPot = null;
      prevPlayerStack = null;
      prevOppStack = null;
      prevPlayerBet = 0;
      prevOppBet = 0;
      prevStreet = state.street;
      prevOppHidden = true;
      prevHandResult = null;
      if (refs.playerCards) refs.playerCards.dataset.prevLen = '0';
      if (refs.oppCards)    refs.oppCards.dataset.prevLen    = '0';
      if (refs.community)   refs.community.dataset.prevLen   = '0';
      logHand(state.handNumber);
      render();
      if (state.toAct === 'chavez') scheduleOpp(1700);
    }
    // Give showdown FX a beat to land, then the recap pops (click-only).
    setTimeout(function () { showHandRecap(startNextHand); }, 900);
  }

  function showEndSplash(won) {
    const root = document.createElement('div');
    root.className = 'bf-end';
    root.innerHTML =
      '<div class="bf-end-card">' +
        '<h2 class="bf-end-title">' +
          (won ? 'YOU BEAT ' + cfg.name.toUpperCase() : cfg.name.toUpperCase() + ' BEAT YOU') +
        '</h2>' +
        '<p class="bf-end-body">' +
          'The hand is still on the table. Look it over before you leave.' +
        '</p>' +
        '<div class="bf-end-stats">' +
          '<div>YOU<strong>' + state.playerChips + '</strong></div>' +
          '<div>' + cfg.name.toUpperCase() + '<strong>' + state.chavezChips + '</strong></div>' +
        '</div>' +
        '<div class="bf-end-buttons">' +
          '<button type="button" class="bf-end-review">Review hand</button>' +
          '<button type="button" class="bf-end-back">Back</button>' +
        '</div>' +
      '</div>';
    const card = root.querySelector('.bf-end-card');
    const reviewBtn = root.querySelector('.bf-end-review');
    const backBtn = root.querySelector('.bf-end-back');
    let resumePill = null;
    function setHidden(h) {
      card.style.opacity = h ? '0' : '1';
      card.style.transform = h ? 'translateY(-30px)' : 'translateY(0)';
      card.style.pointerEvents = h ? 'none' : 'auto';
    }
    reviewBtn.addEventListener('click', function () {
      setHidden(true);
      if (resumePill) return;
      resumePill = document.createElement('button');
      resumePill.type = 'button';
      resumePill.className = 'bf-resume-pill';
      resumePill.textContent = '▲ Resume';
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
        clearPersist();
        location.href = 'debug-bosses.html';
      } else {
        location.href = 'debug-bosses.html';
      }
    });
    document.body.appendChild(root);
  }

  // ───── DOM binding ─────

  function bindRefs() {
    refs = {
      hand:            $('bf-hand'),
      blinds:          $('bf-blinds'),
      street:          $('bf-street'),
      pot:             $('bf-pot'),
      potCell:         $('bf-pot-display'),
      oppName:         $('bf-opp-name'),
      oppStack:        $('bf-opp-stack'),
      oppStackBox:     $('bf-opp-stack') && $('bf-opp-stack').closest('.bf-seat-stack'),
      oppCards:        $('bf-opp-cards'),
      oppBet:          $('bf-opp-bet'),
      oppSeat:         $('bf-opp-seat'),
      playerStack:     $('bf-player-stack'),
      playerStackBox:  $('bf-player-stack') && $('bf-player-stack').closest('.bf-seat-stack'),
      playerCards:     $('bf-player-cards'),
      playerBet:       $('bf-player-bet'),
      playerSeat:      $('bf-player-seat'),
      community:       $('bf-community'),
      actions:         $('bf-actions'),
      btnFold:         $('bf-act-fold'),
      btnPassive:      $('bf-act-passive'),
      btnAggro:        $('bf-act-aggro'),
      sizing:          $('bf-sizing'),
      raise:           $('bf-raise'),
      raiseValue:      $('bf-raise-value'),
      logScroll:       $('bf-log-scroll'),
      logClear:        $('bf-log-clear'),
      bossAvatar:      $('bf-boss-avatar'),
      bossTell:        $('bf-boss-tell'),
      bossAvatarWrap:  $('bf-boss-avatar-wrap'),
      bossAvatarTitle: $('bf-boss-avatar-title'),
    };
    if (refs.oppName) refs.oppName.textContent = cfg.name;
    if (refs.bossAvatarTitle) refs.bossAvatarTitle.textContent = cfg.name;
    // Hide avatar wrap if this boss has no kaomoji configured.
    if (refs.bossAvatarWrap) {
      refs.bossAvatarWrap.hidden = !(cfg.kaomoji && cfg.kaomoji.faces);
    }
    // Mount points for the chip piles — inserted once, repainted each render
    refs.playerStackPile = refs.playerStackBox ? ensurePileChild(refs.playerStackBox, 'prepend') : null;
    refs.oppStackPile    = refs.oppStackBox    ? ensurePileChild(refs.oppStackBox, 'prepend')    : null;
    refs.potPile         = refs.potCell        ? ensurePileChild(refs.potCell, 'append')         : null;
  }

  function bindActions() {
    refs.btnFold.addEventListener('click', () => doAction('player', 'fold'));
    refs.btnPassive.addEventListener('click', () => {
      const kind = refs.btnPassive.dataset.kind;
      if (kind === 'call') doAction('player', 'call');
      else doAction('player', 'check');
    });
    refs.btnAggro.addEventListener('click', () => {
      const la = global.BFHoldem.legalActions(state);
      const amt = parseInt(refs.raise.value || '0', 10);
      if (la.canRaise) doAction('player', 'raise', amt);
      else if (la.canBet) doAction('player', 'bet', amt);
    });
    refs.raise.addEventListener('input', () => {
      setText(refs.raiseValue, refs.raise.value);
      updateAggroLabel();
      document.querySelectorAll('.bf-preset.is-selected').forEach(b => b.classList.remove('is-selected'));
    });
    if (refs.logClear) refs.logClear.addEventListener('click', logClear);
  }

  function bindPresets() {
    document.querySelectorAll('.bf-preset').forEach(btn => {
      btn.addEventListener('click', () => {
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
      if (k === 'f' && la.canFold) { e.preventDefault(); doAction('player', 'fold'); return; }
      if (k === 'c') {
        if (la.canCall)  { e.preventDefault(); doAction('player', 'call'); return; }
        if (la.canCheck) { e.preventDefault(); doAction('player', 'check'); return; }
      }
      if (k === 'b' || k === 'r' || k === ' ' || k === 'enter') {
        const amt = parseInt(refs.raise.value || '0', 10);
        if (la.canRaise) { e.preventDefault(); doAction('player', 'raise', amt); return; }
        if (la.canBet)   { e.preventDefault(); doAction('player', 'bet', amt); return; }
      }
    });
  }

  function init() {
    bindRefs();
    state = buildState();
    bindActions();
    bindPresets();
    bindKeyboard();
    startAvatarCycle();
    if (state.complete) {
      render();
      showEndSplash(state.won);
      return;
    }
    global.BFHoldem.startHand(state);
    handStartPlayerChips = state.playerChips;
    handStartOppChips    = state.chavezChips;
    logHand(state.handNumber);
    render();
    if (state.toAct === 'chavez') scheduleOpp(1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
