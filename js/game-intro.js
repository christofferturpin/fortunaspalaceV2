/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GAME-INTRO — first-visit "how to play" splash overlay (all games)       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ detectGame() ──► key from URL path           │
  │                          ├─ guard: INTROS[key] missing → no-op           │
  │                          ├─ guard: localStorage seen → no-op             │
  │                          └─ show(intro, key) ──► mount overlay           │
  │                                                                          │
  │   Dismiss path: click .game-intro-cta OR ESC/Enter/Space                 │
  │     ──► localStorage.setItem(wendys_palace_<key>_intro_seen, 1)          │
  │     ──► overlay.is-dismissing → remove after fade                        │
  │                                                                          │
  │   Detection: pathname matched against INTROS keys. Shapebots lives at    │
  │     pages/shapebots/index.html so the '/shapebots/' path segment wins   │
  │     over the 'index' basename. Lobby (pages/index.html) has no INTROS    │
  │     entry by design — players land there from splash and the splash      │
  │     already covers the Palace.                                           │
  │                                                                          │
  │   Exports: none (auto-runs on DOMContentLoaded)                          │
  │   External deps: css/game-intro.css for visuals                          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  INTROS={<key>:{title,subtitle?,body:[html…],cta?}, …}
  detectGame()→key|null: '/shapebots/'→'shapebots';
    else basename(pathname).replace(/\.html?$/,'').toLowerCase()
  storageKey(key)→'wendys_palace_'+key+'_intro_seen'
  alreadySeen(key)→bool: try localStorage[storageKey]==='1'
  mark(key): try localStorage[storageKey]='1'
  show(intro,key): build .game-intro-overlay→modal; CTA click/ESC/Enter/Space
    →mark+dismiss; body content rendered as HTML (trust authored INTROS)
  init(): key=detect; guard !INTROS[key]; guard alreadySeen; show
  on DOMContentLoaded→init (or run immediately if already loaded)
*/

(function () {
  'use strict';

  // ---- per-game intro content ----
  // body strings are HTML; keep <strong>/<em>/<kbd> for emphasis. Two-to-four
  // short paragraphs each; lead with the action then the controls then the
  // payout/end-condition. Tone neutral per project conventions — describe
  // mechanics, do not editorialize on the project's emotional register.
  const INTROS = {
    sinnerbox: {
      title: 'Sinnerbox',
      subtitle: 'Slot machine feeds a plinko cabinet.',
      body: [
        'Type a wager and hit <strong>INVOKE</strong> to spin the reels. Every paying combination yields a ball; a missed spin gives you one consolation ball.',
        'Drop balls into the plinko board below by <strong></strong>. Each ball lands in a multiplier zone and pays out against your wager.',
        '5% of every wager feeds the persistent jackpot pool. Hit the JACKPOT zone to claim it.'
      ],
      cta: 'Invoke'
    },

    matchbox: {
      title: 'Caja de Lotería',
      subtitle: 'Slot machine spends moves into a match-3 grid.',
      body: [
        'Set a wager ($10 minimum, rounds up) and <strong>SPIN</strong>. Blue pips on the reels grant moves on the match-3 grid; yellow pips boost your active wager.',
        'Swap adjacent tiles on the color match grid to form 3-or-more in a row. Matches clear and tiles cascade. Each valid swap costs one move and pays out.',
        'Invalid swaps revert for free. Do not try to translate'
      ],
      cta: 'Spin'
    },

    hollerworks: {
      title: 'Providence &amp; North Tulane',
      subtitle: 'A 1950s Oak Ridge traffic-cam game.',
      body: [
        'Set a wager and click <strong>BEGIN COMMUTE</strong>. The 20×20 LCD reels roll — matching color-arrow triplets light up as paying lines.',
        'The cabinet cuts to the traffic camera. Each matched vehicle enters the intersection: cars, trucks, the occasional cow car. Watch the chaos play out.',
        'When the dust settles a <em>RUSH HOUR ENDS</em> card shows your winnings. Click <strong>BACK HOME</strong> to wager again.'
      ],
      cta: 'Begin Commute'
    },

    jackandgin: {
      title: 'Patriot Poker',
      subtitle: 'Blackjack-on-the-surface, rummy underneath.',
      body: [
        'Set a wager and click <strong>Deal</strong>. You and Moloch each get three cards. <strong>Hit</strong> to draw another, <strong>Stand</strong> to lock in. On your first three cards only, <strong>Double</strong> matches your wager.',
        'Only cards inside a meld score: <em>sets</em> (same rank), <em>runs</em> (consecutive), <em>flushes</em> (same suit), <em>flush-runs</em> (both). Four-card melds pay ×1.5, five+ pay ×2, same-suit runs add ×1.5.',
        'Bust at 40. Win pays 2×; push (tie / both bust / no melds) refunds; loss forfeits. Hit a 40+ meld score on a win to claim the jackpot.'
      ],
      cta: 'Deal'
    },

    foresttrick: {
      title: 'Forest Trick',
      subtitle: 'Three-player trick-taking with fox, fish, &amp owl.',
      body: [
        'You play against Winter and Summer. Each has their own 38-card deck (ranks 1–6 in three suits × two copies + bee and child wilds).',
        'You lead the first trick. Followers must beat the table if they can; if not, they play anything legal. Hand ladder: <em>single &lt; pair &lt; two pair &lt; trips &lt; straight &lt; flush &lt; full house &lt; four-of-a-kind &lt; straight flush</em>.',
        'The trick winner collects every card played and leads the next. Wilds substitute for the best legal hand. Game ends when any player empties hand AND deck — they earn a <strong>+10 first-out bonus</strong>. Final score = collected + tricks won + 1 per wild collected + bonus.'
      ],
      cta: 'Begin'
    },

    foresthoard: {
      title: 'Shareware Poker',
      subtitle: 'Ten dealt, scored as LEFT 5 + RIGHT 5.',
      body: [
        'Place a bet and click <strong>Deal</strong>. Ten cards drop into a LEFT row and a RIGHT row of five each. <strong>All cards start kept</strong> — click any card to mark it DISCARD (red ✕). Click <strong>Draw</strong> to refill discarded slots.',
        'After the draw you get one cross-side swap: drag any card onto another to exchange their slots. Same-side reorders are free.',
        'Click <strong>Score</strong>. Each side is evaluated as a standard 5-card poker hand. <em>Both sides must pay (Two Pair or better)</em>. Payout = (left + right − 1) × bet.'
      ],
      cta: 'Deal'
    },

    criticalhit: {
      title: 'Critical Hit',
      subtitle: 'Dice merging on the back-room tray.',
      body: [
        'Set a wager and <strong>DEAL</strong>. Ten d4s tumble onto the rolling tray. <strong>Drag</strong> matching dice together to merge them up the ladder: d4 → d6 → d8 → d10 → d12 → d20.',
        '<strong>ROLL</strong> re-rolls every die — two free rerolls per round. Merges auto-roll for free.',
        'When you cash out, score = sum of die values (d4=0, d6=3, d8=7, d10=15, d12=31, d20=63). Tiers: 22–29 pays ×1, 30–41 ×2, 42–62 ×3, 63+ ×6 (CRITICAL HIT). Below 22 busts.'
      ],
      cta: 'Deal'
    },

    dicechart: {
      title: 'Dice Chart',
      subtitle: 'Fill the ledger 3 to 18 from 3d6 + a red modifier.',
      body: [
        'Press <strong>ROLL</strong> to throw three white d6s and one red modifier die. The red die has six faces: two <em>+</em>, two <em>−</em>, one <em>+N</em>, one <em>−N</em>. Each roll lights up the chart cells the dice can reach.',
        'You MUST ink one of the glowing cells — clicking it records the expression and scores its payout. Click any die to HOLD its value into the next throw; held dice persist until you toggle them off.',
        'If no unfilled cell is reachable, the run STRANDS. <strong>CASH OUT</strong> at any point ends with the current score (max 368). <strong>NEW GAME</strong> wipes the slate.'
      ],
      cta: 'Roll'
    },

    pool: {
      title: 'Witches Pool',
      subtitle: 'Aim, cast, bend the carom.',
      body: [
        'Aim with the <strong>mouse</strong>, set power on the <em>PWR</em> dial, fire with <kbd>Space</kbd> or <strong>CAST</strong>. On first contact, time pauses and a curve handle appears.',
        '<strong>Drag</strong> the handle to bend the orbital trajectory. Hold <kbd>⇧ Shift</kbd> while dragging for hair-fine precision. Release to commit.',
        'Strike each colored orb against its matching wall to score (red→north, blue→east, green→south, yellow→west). Chain combos to escalate the multiplier — break-even at combo 5.',
        'The rite ends if the cue stops or a colored orb strikes the central sigil.'
      ],
      cta: 'Cast'
    },

    crossfire: {
      title: 'Concussion Bowl',
      subtitle: 'Top-down football blaster.',
      body: [
        'Pick a difficulty bracket — <em>Pee-Wee / JV / Varsity / The League</em> — set a wager, then <strong>KICK OFF</strong>.',
        'Aim with <kbd>←</kbd>/<kbd>→</kbd> or the mouse. <kbd>Space</kbd> or left-click throws a football. <strong>Right-click</strong> fires a HAIL MARY (2 per game) — a straight laser from under the helmet.',
        'Drive the helmet across the opponent\'s back line to score. Each side starts with 3 footballs and regenerates to a cap of 6 (+1 per second). First to <strong>3 TDs</strong> takes the Bowl.'
      ],
      cta: 'Kick Off'
    },

    opossumer: {
      title: 'Baby Highway',
      subtitle: 'Frogger ladder — crawl, clear, push your luck.',
      body: [
        'Set a wager and <strong>START RUN</strong>. Crawl the baby across traffic with the <kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>←</kbd>/<kbd>→</kbd> arrow keys (or <kbd>WASD</kbd>).',
        'Each cleared level grows the pot — ×0.5 at level 1, climbing to ×5 at level 10. After each clear, pick <strong>CASH OUT</strong> or <strong>PUSH IT</strong> for a longer, faster level.',
        'A car hit kills the run — wager and pot, gone.'
      ],
      cta: 'Start Run'
    },

    roulette: {
      title: 'Russian Roulette',
      subtitle: 'One chamber in six.',
      body: [
        'Press the trigger. The cylinder spins. The hammer falls. Survive and you bank <strong>+100 coins</strong>.',
        'There is no wager and no escape ladder. The cost is the chance of permadeath.',
        'Locked above 100 coins — this is for the broke.'
      ],
      cta: 'Pull'
    },

    tarot: {
      title: 'Tarotheque',
      subtitle: 'Three draws, two majors, one mash.',
      body: [
        'Click  the decks. The first two readings fill the spread and the artwork frames.',
        'Deck 3 pulls two distinct major arcana side by side. Generates a glitch art image and tarot reading to interpret',      ],
      cta: 'Begin Reading'
    },

    horserace: {
      title: 'Noah\'s Derby',
      subtitle: 'Nine horses. Each carrying two Wikipedia articles.',
      body: [
        'Each animal pair carries two Wikipedia articles on their back. The pair with the most combined pageviews over the last 30 days wins. Pageview totals are <em>hidden</em> until after the race.',
        'Click three animals to fill the <strong>WIN</strong> / <strong>PLACE</strong> / <strong>SHOW</strong> slots. Set a per-pick tithe (total wager = tithe × 3) and click <strong>TITHE</strong>.',
        'Payouts cascade: <em>WIN pays 6× / 3× / 1.85×</em> across the three slots; <em>PLACE pays 3× / 1.85×</em>; <em>SHOW pays 1.85×</em>. The first load warms a 24-hour pageview cache.'
      ],
      cta: 'Tithe'
    },

    isitraining: {
      title: 'Is It Raining?',
      subtitle: 'Channel 13 Weather — push-your-luck ladder.',
      body: [
        'Set a wager. Chip Chipman asks if it\'s raining (or cloudy, or above a certain temperature) in a random American city. Click <strong>YES</strong> or <strong>NO</strong>. The page hits a real weather API to grade you.',
        'First right pays 0.15× the wager into the POT; each subsequent right multiplies the pot by 1.75× along a 10-rung ladder. After each right, <strong>CASH OUT</strong> or <strong>PUSH IT</strong> into a new city.',
        '<strong>One free strike per run</strong> — the first wrong keeps your pot and rung (you can cash or push); a second wrong wipes everything.'
      ],
      cta: 'Tune In'
    },

    doublehappiness: {
      title: 'Double Happiness',
      subtitle: 'Pick the more-watched of two videos.',
      body: [
        'Set a wager. The lazy susan presents two muted, black-and-white YouTube videos. Pick the one with <strong>more views</strong>.',
        'First right pays 0.15× wager into the pot; each subsequent right multiplies by 1.75× along a 12-rung zodiac ladder (Rat → Ox → … → Pig).',
        'After each right, <strong>CASH OUT</strong> or <strong>PUSH IT</strong>. One wrong wipes the pot.'
      ],
      cta: 'Spin Susan'
    },

    craps: {
      title: 'Stroke of Luck',
      subtitle: 'Three dice. Three picks. Then putt-putt.',
      body: [
        'Pick one bet from each of the three rows — <em>top</em> (ball count from the sum), <em>middle</em> (value multiplier from color or run), <em>bottom</em> (flat bonus on doubles). Set a wager and <strong>ROLL</strong>.',
        'Each die has two red faces in fixed slots: die 1 on 1/2, die 2 on 3/4, die 3 on 5/6.',
        'Miss the top bet → instant loss. Hit the top bet → the putt-putt overlay opens with N balls. Sink each one with aim + power to bank the value multiplier. Bottom bonus pays on top.',
        'Triple-1s or triple-6s claim the jackpot.'
      ],
      cta: 'Roll'
    },

    photobooth: {
      title: 'Photobooth',
      subtitle: 'Step inside.',
      body: [
        'Click <strong>ALLOW</strong> to grant the camera, then <strong>TELL</strong> to read your clipboard as the postcard\'s "do you remember" line.',
        'Click <strong>SNAP</strong> — costs 5 coins. The booth composes a VHS-degraded postcard (chroma shift, scanlines, tear) with a random greeting + business + your clipped memory, and stamps your child\'s stats on it in phosphor.',
        'The finished postcard opens in a new window. Save it, share it, or close it.'
      ],
      cta: 'Step In'
    },

    bearbaiting: {
      title: 'Bear Baiting',
      subtitle: 'Read the animals. Beat the bookie.',
      body: [
        'Each bait rolls a fresh bear (scars, mange, blindness, chain, posture) and 3–5 dogs (breed, condition, aggression). The <strong>Field Guide</strong> lists what you can read off them. The <strong>Form Sheet</strong> lists prior bout records.',
        'The bookie posts odds from a naive power calc that ignores the cues. A sharp reader can find edges.',
        'Set a stake and back <strong>BEAR</strong> or <strong>DOGS</strong>. The pit fight plays out in real time. Winner pays stake × bookie odds.'
      ],
      cta: 'Read the Pit'
    },

    go: {
      title: 'Gonegaishimasu',
      subtitle: '9×9 bottle-cap Go on a pizza box.',
      body: [
        'Set a stake and <strong>BEGIN</strong>. You play <strong>RED caps</strong>; the house plays BLUE. Red moves first; blue gets 6.5 komi.',
        'Pick your opponent rank — <em>Roadie / Opener / Drummer / Headliner</em>. Three re-flips per game (each undoes your last cap and the opponent\'s reply). <strong>Pass</strong> or <strong>Resign</strong> at any time.',
        'Two passes end the game. Caps counted, komi added to blue. Toggle <strong>READ THE BOARD</strong> to see territory + influence tints on empty intersections.'
      ],
      cta: 'Onegaishimasu'
    },

    pacman: {
      title: 'Changelings',
      subtitle: 'Pac-Man through a wood-paneled house.',
      body: [
        'Walk a randomly generated wood-paneled maze with the arrow keys, collecting bone-colored <em>consistencies</em> (dots) that prove this is still her house.',
        'Six faerie antagonists chase you — <strong>Smiler, Caller, Watcher, Helper, Mimic, Mama</strong> — each with its own targeting. Phosphor pellets at the corners let you see them briefly for what they are.',
        'Set a wager and pick a difficulty (number of d6 + per-ghost modifiers set the multiplier 0.5× → ~4.5× and your speed ~0.92× → ~1.6×). Click any room to wake up there. Clear the board to bank the pot — or one of them reaches you.'
      ],
      cta: 'Wake Up'
    },

    bonepile: {
      title: 'LOTTAUTO™',
      subtitle: 'Feed coins. Receive stupidity.',
      body: [
        'Set a wager and <strong>BUY TICKET</strong>. Each ticket\'s shape rolls fresh — 4×2, 2×4, 3×3, or 4×4 — squares or circles. Exactly one cell hides a <strong>BUST</strong>; the rest are dice (1–6).',
        'Drag to scratch. Once you start a cell you\'re <strong>committed</strong> — finish it. Each same-face reveal pays as pair-equivalents of <em>bet × face/4</em>: 2 = 1 pair · 3 = 2 pairs · 4 = 4 pairs · 5 = 6 · 6 = 9 · 7 = 13. Combo for big hauls.',
        '<strong>CASH OUT</strong> any time. Hit BUST and the ticket zeroes — <em>unless</em> your bone-dust meter is full, in which case <strong>RUB IT BACK</strong> spends the floor pile to undo the bust and resume play.'
      ],
      cta: 'Scratch'
    },

    shapebots: {
      title: 'GLADIATR.EXE',
      subtitle: 'Program a legion. Run the gauntlet.',
      body: [
        'Build a team of card-shape bots (<em>heart / spade / diamond / club</em> chassis × attack / target / move / trigger / special slots). Drag pieces from the palette into slots. Save and load teams from the Library.',
        'Bet denarii and <strong>START BATTLE</strong>. An enemy team is drawn for the round and battle runs on the canvas at a fixed tick. Watch the HUD; <strong>ABANDON</strong> at any time for a 50% mid-round payout.',
        'Win a round → choose <strong>Cash Out</strong> or <strong>Continue</strong> with an unlock from the Pick-2 panel. Payouts scale per round: 0.5× at R1, 1× at R2, climbing to 3.5× at R7. Lose and the run ends.'
      ],
      cta: 'Program'
    }
  };

  // ---- detection ----
  function detectGame() {
    // Explicit override wins if a page sets it.
    const body = document.body;
    if (body) {
      const explicit = body.getAttribute('data-game');
      if (explicit && INTROS[explicit]) return explicit;
    }
    const path = (location && location.pathname) || '';
    // Shapebots is the only nested game (pages/shapebots/index.html). Match
    // its directory before falling through to basename so it doesn't collide
    // with pages/index.html (the lobby, which has no INTROS entry).
    if (/\/shapebots\//i.test(path)) return 'shapebots';
    const m = path.match(/\/([^\/]+)\.html?$/i);
    if (!m) return null;
    const key = m[1].toLowerCase();
    return INTROS[key] ? key : null;
  }

  function storageKey(key) { return 'wendys_palace_' + key + '_intro_seen'; }

  function alreadySeen(key) {
    try { return localStorage.getItem(storageKey(key)) === '1'; }
    catch (e) { return false; }
  }
  function mark(key) {
    try { localStorage.setItem(storageKey(key), '1'); } catch (e) {}
  }

  // ---- overlay ----
  function show(intro, key) {
    const overlay = document.createElement('div');
    overlay.className = 'game-intro-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'game-intro-title');

    const modal = document.createElement('div');
    modal.className = 'game-intro-modal';

    const title = document.createElement('h2');
    title.className = 'game-intro-title';
    title.id = 'game-intro-title';
    title.innerHTML = intro.title;
    modal.appendChild(title);

    if (intro.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'game-intro-subtitle';
      sub.innerHTML = intro.subtitle;
      modal.appendChild(sub);
    }

    const body = document.createElement('div');
    body.className = 'game-intro-body';
    body.innerHTML = (intro.body || []).map(p => '<p>' + p + '</p>').join('');
    modal.appendChild(body);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'game-intro-cta';
    cta.textContent = intro.cta || 'Begin';
    modal.appendChild(cta);

    const foot = document.createElement('div');
    foot.className = 'game-intro-footnote';
    foot.textContent = 'Shown once — never again.';
    modal.appendChild(foot);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function dismiss() {
      mark(key);
      overlay.classList.add('is-dismissing');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 280);
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      }
    }
    cta.addEventListener('click', dismiss);
    // Capture phase so the keydown never reaches the game's own handlers
    // (e.g. crossfire's Space-fires-football). Removed in dismiss().
    document.addEventListener('keydown', onKey, true);
    // Focus the CTA so screen readers announce the dialog action.
    try { cta.focus(); } catch (e) {}
  }

  function init() {
    const key = detectGame();
    if (!key) return;
    if (alreadySeen(key)) return;
    show(INTROS[key], key);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
