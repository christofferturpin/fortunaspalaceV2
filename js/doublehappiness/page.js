/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DOUBLE HAPPINESS PAGE — two silent B&W YouTube embeds; pick more-viewed │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init() (async)                                    │
  │                          │                                               │
  │                          ├─ resolveData() ──► VIDEOS, ZODIAC, LADDER     │
  │                          ├─ bind() ──► #dh-pick-a / #dh-pick-b           │
  │                          │            #dh-cash / #dh-next                │
  │                          │            #dh-restart / #dh-max              │
  │                          │            #dh-wager / #dh-mute               │
  │                          ├─ paintZodiac() + paintFortune()               │
  │                          ├─ await runGate() // honor-system ad-block     │
  │                          │   // shows #dh-gate-overlay; resolves on the  │
  │                          │   // I-Promise button click. sessionStorage   │
  │                          │   // skips after first accept this session.   │
  │                          ├─ await Promise.race([Data.ready, 1.5s])       │
  │                          └─ startNewRun()                                │
  │                                                                          │
  │   Run flow:                                                              │
  │     startNewRun() ──► loadPair()                                         │
  │     loadPair() ──► pickPair() (distinct) → mount iframes via setSrc      │
  │                  ──► state='loading' → 600ms susan-spin → state='guess'  │
  │                                                                          │
  │     answer(side)                                                         │
  │        ├─ first call: Wallet.spend(wager); Child.recordPlay()            │
  │        ├─ evaluateGuess(side) ──► {correct, winnerSide, vA, vB}          │
  │        ├─ formatRevealText(j) ──► reveal string                          │
  │        ├─ correct ──► rung++; pot=potForRung; state='climb';             │
  │        │              DHSound.correct(rung)                              │
  │        └─ wrong   ──► strikes++; if strikes>=3:                          │
  │                          pot=0; rung=0; state='busted';                  │
  │                          DHSound.wrong()  // 三振 strikeout                │
  │                       else:                                              │
  │                          state='climb'; pot+rung untouched;              │
  │                          DHSound.wrong()  // 好 strike, can push/cash     │
  │                                                                          │
  │     cashOut() ──► Wallet.add(pot); DHSound.cashOut(); state='cashed'     │
  │     pushIt()  ──► DHSound.pushIt(); loadPair()                           │
  │                                                                          │
  │   Helpers: rungMultiplier(n), potForRung(n,wager), formatMult(m),        │
  │            formatViews(n), getWager(), setStatus(text, cls),             │
  │            buildEmbedUrl(video), renderPot, renderLadder, renderPair,    │
  │            renderReveal, renderStrikes({flash?}), setButtons,            │
  │            paintZodiac, paintFortune                                     │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet, window.Child, window.DHSound,            │
  │                  window.DoubleHappinessData                              │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  const D=window.DoubleHappinessData; VIDEOS=D.VIDEOS; ZODIAC=D.ZODIAC; {RUNGS,BASE,GROWTH}=D.LADDER; FORTUNES=D.FORTUNES
  STRIKE_LIMIT=3
  state: runState='loading'|'guess'|'climb'|'busted'|'cashed', runActive=F, runWager=0, rung=0, pot=0, strikes=0, currentPair=null, lastReveal=null
  rungMultiplier(n)→BASE*GROWTH^(n-1); potForRung(n,w)→n≤0?0:floor(mult*w); formatMult(m)→'×'+(m<10?.toFixed(2):.toFixed(1))
  formatViews(n)→n≥1e9?(n/1e9).toFixed(2)+'B':n≥1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':str(n)
  buildEmbedUrl(video)→str: video.id→youtube.com/embed/<id>?autoplay=1&mute=1&controls=0&...&iv_load_policy=3&loop=1&playlist=<id>&start=5; else 'about:blank'
  GATE_SESSION_KEY='wendys_palace_dh_promise'
  gateAlreadyAccepted()→bool: try sessionStorage.getItem===='1'; catch→F
  runGate()→Promise: #dh-gate-overlay; alreadyAccepted?remove+resolve; show overlay; #dh-gate-accept click→markGateAccepted+DHSound.doorChime+is-leaving 350ms→remove+resolve
  pickPair()→[A,B]: shuffle 2 distinct from VIDEOS
  renderPair(): #dh-iframe-a.src=buildEmbedUrl(A.id); ditto B; dish-title hidden until reveal
  renderReveal(): show both .dh-dish-meta w/ formatViews + crown on winner
  setStatus(text,cls): #dh-result.text=text; toggle is-on/is-win/is-loss/is-err
  showVerdict(kind∈{correct,wrong}): #dh-verdict='✓'|'✕'; strip+reflow+add show+is-correct|is-wrong (1s pop)
  getWager()→max(1,floor(#dh-wager.value||0)); writeback
  renderPot({grow?,bust?,cashed?}): #dh-pot-value.text=pot; #dh-rung-value.text=rung+'/12'; toggle classes
  renderLadder(): ∀rung 1..12 li/.dh-zod-rung: is-climbed (n≤rung), is-current (n==rung), is-next (n==rung+1 && state in guess/climb); mult+coins
  paintZodiac(): build ladder shell from ZODIAC; called once on init
  setButtons(): wager+max.disabled=runActive; pickA/pickB shown always, .disabled=state!=='guess'; cash/next/restart hidden default; climb→cash+next; busted/cashed→restart
  evaluateGuess(side)→{correct,winnerSide,vA,vB}: A=currentPair[0],B=currentPair[1]; winnerSide=A.views>B.views?'A':B.views>A.views?'B':null (rare tie→pick A); correct=(side===winnerSide)
  formatRevealText(j)→str: A.views vs B.views with crown on winnerSide
  loadPair():async-ish: runState='loading'; currentPair=pickPair; renderPair; .dh-susan add is-spin; setStatus 'Spinning the lazy susan…'; DHSound.doorChime; setTimeout 600→remove is-spin, state='guess', setStatus '', setButtons
  startNewRun(): runActive=F,runWager=0,rung=0,pot=0,strikes=0; renderPot+Ladder+Strikes; loadPair
  pushIt(): guard(state!=='climb'); DHSound.pushIt; loadPair
  answer(side): guard(state!=='guess'); DHSound.click; !runActive→spend(wager) (broke→err) + Child.recordPlay + lock runWager,runActive; j=evaluate; renderReveal; reveal=format; correct→rung+=1,pot=potForRung,state='climb',setStatus is-win,renderPot grow,DHSound.correct(rung); else→strikes+=1; strikes≥STRIKE_LIMIT: lost=pot+wager,pot=0,rung=0,runActive=F,state='busted',setStatus is-loss '三振',renderPot bust,renderStrikes flash,DHSound.wrong; else: state='climb',setStatus is-err '好 STRIKE',renderStrikes flash,DHSound.wrong
  renderStrikes({flash?}): ∀pip[i] set is-on (i<strikes), text 好|○, flash→add is-flash on last; wrap toggle is-warned (0<strikes<LIMIT) is-bust (≥LIMIT)
  cashOut(): guard(state!=='climb'); won=pot; Wallet.add(won); setStatus '+N coins',is-win; runActive=F,state='cashed'; renderPot cashed; DHSound.cashOut; paintFortune
  paintFortune(): set #dh-fortune.text=rnd(FORTUNES); on init + cash/bust + every 9000ms
  bind(): pickA→answer('A'); pickB→answer('B'); cash→cashOut; next→pushIt; restart→startNewRun; max→#dh-wager=Wallet.balance; wager input→!runActive&&renderLadder; mute→toggle DHSound.setMuted, icon swap
  init(): resolveData; if !VIDEOS→err panel; bind; paintZodiac; paintFortune; startNewRun; setInterval paintFortune 9000ms
  exports: none (IIFE-local); on DOMContentLoaded→init
*/

(function (global) {
  // Pull the data module. If it's missing the page just degrades to an error
  // panel — no point throwing on a fresh load.
  const Data = global.DoubleHappinessData;
  const VIDEOS = (Data && Data.VIDEOS) || [];
  const ZODIAC = (Data && Data.ZODIAC) || [];
  const LADDER = (Data && Data.LADDER) || { RUNGS: 12, BASE: 0.40, GROWTH: 1.60 };
  const FORTUNES = (Data && Data.FORTUNES) || ['Eat more, lose less.'];

  // ===== Ladder math =====
  // BASE 0.40 × GROWTH 1.60^(n-1). Breakeven at rung 3, max ≈ 70× at rung 12.
  // Cash out at any rung; three strikes wipes the pot.
  function rungMultiplier(n) {
    return LADDER.BASE * Math.pow(LADDER.GROWTH, n - 1);
  }
  function potForRung(n, wager) {
    if (n <= 0) return 0;
    return Math.floor(rungMultiplier(n) * wager);
  }
  function formatMult(m) {
    return '×' + (m < 10 ? m.toFixed(2) : m.toFixed(1));
  }

  // Compact view counts: 8_700_000_000 → "8.70B". Two-digit precision in the
  // billions range so close-call reveals don't all read as "5B vs 5B".
  function formatViews(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  // YouTube embed URL — uses youtube.com (the regular embed domain, NOT
  // youtube-nocookie). Reason: we run a one-time warm-up video on page
  // entry (see runWarmup()) so YouTube's session cookies get set on the
  // youtube.com origin. Once that's done, subsequent embeds on the same
  // origin in the same session have a meaningfully lower ad-load. If we
  // used youtube-nocookie here, the warmup cookies wouldn't transfer
  // (separate origin → separate cookie jar) and the whole strategy fails.
  // Every entry must have a real 11-char video ID. playlist=<id>+loop=1
  // loops the single video; iv_load_policy=3 kills in-video annotations.
  function buildEmbedUrl(video) {
    if (!video || !video.id) return 'about:blank';
    const params = [
      'autoplay=1',
      'mute=1',
      'controls=0',
      'disablekb=1',
      'modestbranding=1',
      'playsinline=1',
      'rel=0',
      'iv_load_policy=3',
      'loop=1',
      'playlist=' + encodeURIComponent(video.id),
      'start=5',
    ].join('&');
    return 'https://www.youtube.com/embed/' +
      encodeURIComponent(video.id) + '?' + params;
  }

  // ===== Run state =====
  // States mirror is-it-raining, plus a 2-strike forgiveness budget:
  //   'loading' — lazy susan is mid-spin; buttons disabled
  //   'guess'   — pair is live, waiting for DISH A or DISH B
  //   'climb'   — last guess right OR a non-fatal strike; cash out or push
  //   'busted'  — second strike landed; pot wiped; click NEW RUN
  //   'cashed'  — player cashed; click NEW RUN
  //
  // STRIKE_LIMIT=3: baseball rules. Strikes 1 and 2 are warnings (rung+pot
  // stay intact, player can cash out or push); strike 3 is the strikeout
  // and busts the run. Strikes persist across pairs until cash/bust/new-run.
  const STRIKE_LIMIT = 3;
  let runState = 'loading';
  let runActive = false;     // has the wager been spent on this run yet?
  let runWager = 0;
  let rung = 0;
  let pot = 0;
  let strikes = 0;           // 0..STRIKE_LIMIT; resets only on cash/bust/new-run
  let currentPair = null;    // [videoA, videoB]
  let lastReveal = null;     // {winnerSide, vA, vB} — for repaint after layout changes

  // ===== Helpers =====

  function pickPair() {
    if (VIDEOS.length < 2) return null;
    const a = Math.floor(Math.random() * VIDEOS.length);
    let b;
    do { b = Math.floor(Math.random() * VIDEOS.length); } while (b === a);
    return [VIDEOS[a], VIDEOS[b]];
  }

  function setStatus(text, cls) {
    const el = document.getElementById('dh-result');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-win', 'is-loss', 'is-err');
    if (cls) el.classList.add(cls);
    el.classList.toggle('is-on', !!text);
  }

  // Big ✓ / ✕ overlay that pops at the center of the screen on every guess
  // (one-shot animation, ~1s). Restart trick: strip + force reflow + reapply
  // so back-to-back rounds don't get stuck on a half-faded frame.
  function showVerdict(kind) {
    const el = document.getElementById('dh-verdict');
    if (!el) return;
    el.textContent = kind === 'correct' ? '✓' : '✕';
    el.classList.remove('show', 'is-correct', 'is-wrong');
    void el.offsetWidth;
    el.classList.add('show', kind === 'correct' ? 'is-correct' : 'is-wrong');
  }

  function getWager() {
    const w = document.getElementById('dh-wager');
    if (!w) return 1;
    const v = Math.max(1, Math.floor(Number(w.value) || 0));
    if (String(v) !== w.value) w.value = v;
    return v;
  }

  function renderPot(opts) {
    opts = opts || {};
    const wrap = document.querySelector('.dh-lcd-pot');
    const val = document.getElementById('dh-pot-value');
    const rungVal = document.getElementById('dh-rung-value');
    if (val) val.textContent = pot;
    if (rungVal) rungVal.textContent = rung + '/' + LADDER.RUNGS;
    if (!wrap) return;
    wrap.classList.remove('is-grow', 'is-bust', 'is-cashed');
    if (opts.bust)   wrap.classList.add('is-bust');
    if (opts.cashed) wrap.classList.add('is-cashed');
    if (opts.grow) requestAnimationFrame(() => wrap.classList.add('is-grow'));
  }

  // Strike LCD — two pip slots that each light up with 好 (the Chinese
  // baseball umpire's "good ball / strike" call) when a strike lands. The
  // second strike pips through and busts the run; the LCD wrap gets is-bust
  // for the visual coup-de-grâce. Caller passes { flash:true } to animate
  // the newly-landed pip.
  function renderStrikes(opts) {
    opts = opts || {};
    const wrap = document.querySelector('.dh-lcd-strikes');
    if (!wrap) return;
    const pips = wrap.querySelectorAll('.dh-strike-pip');
    pips.forEach((pip, idx) => {
      const on = idx < strikes;
      pip.classList.toggle('is-on', on);
      pip.textContent = on ? '好' : '○';
      if (opts.flash && idx === strikes - 1) {
        pip.classList.remove('is-flash');
        requestAnimationFrame(() => pip.classList.add('is-flash'));
      } else {
        pip.classList.remove('is-flash');
      }
    });
    wrap.classList.toggle('is-warned', strikes > 0 && strikes < STRIKE_LIMIT);
    wrap.classList.toggle('is-bust',   strikes >= STRIKE_LIMIT);
  }

  // Build the 12-slot zodiac ladder shell once at init. Each <li> gets a
  // stable index; renderLadder() flips state classes on the existing nodes.
  function paintZodiac() {
    const list = document.querySelector('.dh-zod-list');
    if (!list || !ZODIAC.length) return;
    list.innerHTML = '';
    for (let i = 0; i < ZODIAC.length; i++) {
      const z = ZODIAC[i];
      const li = document.createElement('li');
      li.className = 'dh-zod-rung';
      li.innerHTML =
        '<span class="dh-zod-glyph">' + z.glyph + '</span>' +
        '<span class="dh-zod-name">' + z.name + '</span>' +
        '<span class="dh-zod-mult"></span>' +
        '<span class="dh-zod-coins"></span>';
      list.appendChild(li);
    }
  }

  function renderLadder() {
    const list = document.querySelector('.dh-zod-list');
    if (!list) return;
    const wager = runActive ? runWager : getWager();
    const items = list.querySelectorAll('.dh-zod-rung');
    items.forEach((li, idx) => {
      const n = idx + 1;
      li.classList.toggle('is-climbed', n <= rung);
      li.classList.toggle('is-current', n === rung);
      li.classList.toggle(
        'is-next',
        n === rung + 1 && (runState === 'guess' || runState === 'climb')
      );
      const mult = rungMultiplier(n);
      const coins = potForRung(n, wager);
      const multEl = li.querySelector('.dh-zod-mult');
      const coinsEl = li.querySelector('.dh-zod-coins');
      if (multEl)  multEl.textContent  = formatMult(mult);
      if (coinsEl) coinsEl.textContent = coins;
    });
  }

  // Set both iframes' src to fresh embed URLs. Setting src always reloads the
  // iframe, even if the URL only differs in the playlist= bit; we don't need
  // to recreate the element.
  function renderPair() {
    const a = document.getElementById('dh-iframe-a');
    const b = document.getElementById('dh-iframe-b');
    if (!currentPair || !a || !b) return;
    a.src = buildEmbedUrl(currentPair[0]);
    b.src = buildEmbedUrl(currentPair[1]);
    // Reset reveal labels so the previous pair's view counts don't leak.
    const metaA = document.getElementById('dh-meta-a');
    const metaB = document.getElementById('dh-meta-b');
    if (metaA) { metaA.textContent = ''; metaA.classList.remove('is-on', 'is-winner'); }
    if (metaB) { metaB.textContent = ''; metaB.classList.remove('is-on', 'is-winner'); }
    // Clear the green/red verdict ring from the previous round.
    document.querySelectorAll('.dh-dish-frame').forEach((f) => {
      f.classList.remove('is-winner', 'is-loser');
    });
    // Video titles are visible from the start of each round so the player
    // knows what they're betting on. View counts (.dh-dish-meta) still stay
    // hidden until the answer resolves.
    const titleA = document.querySelector('.dh-dish[data-side="A"] .dh-dish-title');
    const titleB = document.querySelector('.dh-dish[data-side="B"] .dh-dish-title');
    if (titleA) titleA.textContent = 'A · ' + currentPair[0].title;
    if (titleB) titleB.textContent = 'B · ' + currentPair[1].title;
  }

  // Reveal both view counts, crown the winner, and tint the frames green/red.
  // Called after answer().
  function renderReveal(judgment) {
    if (!judgment || !currentPair) return;
    lastReveal = judgment;
    const metaA = document.getElementById('dh-meta-a');
    const metaB = document.getElementById('dh-meta-b');
    const titleA = document.querySelector('.dh-dish[data-side="A"] .dh-dish-title');
    const titleB = document.querySelector('.dh-dish[data-side="B"] .dh-dish-title');
    const frameA = document.querySelector('.dh-dish[data-side="A"] .dh-dish-frame');
    const frameB = document.querySelector('.dh-dish[data-side="B"] .dh-dish-frame');
    if (metaA) {
      metaA.textContent = formatViews(currentPair[0].views) + ' views';
      metaA.classList.add('is-on');
      metaA.classList.toggle('is-winner', judgment.winnerSide === 'A');
    }
    if (metaB) {
      metaB.textContent = formatViews(currentPair[1].views) + ' views';
      metaB.classList.add('is-on');
      metaB.classList.toggle('is-winner', judgment.winnerSide === 'B');
    }
    if (titleA) titleA.textContent = 'A · ' + currentPair[0].title;
    if (titleB) titleB.textContent = 'B · ' + currentPair[1].title;
    // Verdict tint — the winner glows green, the other glows red, regardless
    // of which side the player picked. The result is read at a glance.
    if (frameA) {
      frameA.classList.toggle('is-winner', judgment.winnerSide === 'A');
      frameA.classList.toggle('is-loser',  judgment.winnerSide !== 'A');
    }
    if (frameB) {
      frameB.classList.toggle('is-winner', judgment.winnerSide === 'B');
      frameB.classList.toggle('is-loser',  judgment.winnerSide !== 'B');
    }
  }

  function setButtons() {
    const pickA   = document.getElementById('dh-pick-a');
    const pickB   = document.getElementById('dh-pick-b');
    const cash    = document.getElementById('dh-cash');
    const next    = document.getElementById('dh-next');
    const restart = document.getElementById('dh-restart');
    const wager   = document.getElementById('dh-wager');
    const max     = document.getElementById('dh-max');

    if (wager) wager.disabled = runActive;
    if (max)   max.disabled   = runActive;

    const answerable = (runState === 'guess');
    if (pickA) pickA.disabled = !answerable;
    if (pickB) pickB.disabled = !answerable;

    if (cash)    cash.hidden = true;
    if (next)    next.hidden = true;
    if (restart) restart.hidden = true;

    if (runState === 'climb') {
      if (cash) { cash.hidden = false; cash.textContent = '囍 CASHOUT 囍 ' + pot; }
      if (next) { next.hidden = false; next.textContent = 'PUSH IT →'; }
    } else if (runState === 'busted' || runState === 'cashed') {
      if (restart) {
        restart.hidden = false;
        restart.textContent = 'NEW RUN →';
      }
    }
  }

  function evaluateGuess(side) {
    const A = currentPair[0];
    const B = currentPair[1];
    // Ties are essentially impossible with the curated counts (no duplicates),
    // but if they ever happen we credit side A so the game still resolves.
    let winnerSide;
    if (A.views > B.views)      winnerSide = 'A';
    else if (B.views > A.views) winnerSide = 'B';
    else                        winnerSide = 'A';
    return { correct: side === winnerSide, winnerSide };
  }

  function formatRevealText(judgment) {
    const A = currentPair[0];
    const B = currentPair[1];
    const aStr = formatViews(A.views);
    const bStr = formatViews(B.views);
    const crown = (s) => (judgment.winnerSide === s ? '👑 ' : '');
    return crown('A') + 'A: ' + aStr + '  ·  ' + crown('B') + 'B: ' + bStr;
  }

  // ===== Flow =====

  function loadPair() {
    runState = 'loading';
    currentPair = pickPair();
    if (!currentPair) {
      setStatus('No dishes on the menu — check data.js.', 'is-err');
      setButtons();
      return;
    }
    renderPair();
    setStatus('Spinning the lazy susan…', null);
    setButtons();
    const susan = document.querySelector('.dh-susan');
    if (susan) susan.classList.add('is-spin');
    if (global.DHSound) global.DHSound.doorChime();

    setTimeout(() => {
      if (susan) susan.classList.remove('is-spin');
      runState = 'guess';
      setStatus('Bet on the more popular video.', null);
      setButtons();
      renderLadder();
    }, 600);
  }

  function startNewRun() {
    runActive = false;
    runWager = 0;
    rung = 0;
    pot = 0;
    strikes = 0;
    renderPot();
    renderLadder();
    renderStrikes();
    loadPair();
  }

  function pushIt() {
    if (runState !== 'climb') return;
    if (global.DHSound) global.DHSound.pushIt();
    loadPair();
  }

  function answer(side) {
    if (runState !== 'guess') return;
    if (global.DHSound) global.DHSound.click();

    // Spend the wager on the first guess of the run, same as is-it-raining.
    if (!runActive) {
      const wager = getWager();
      if (!global.Wallet || !global.Wallet.spend(wager)) {
        if (global.DHSound) global.DHSound.broke();
        setStatus("You're broke. Lower the wager.", 'is-err');
        return;
      }
      if (global.Child && typeof global.Child.recordPlay === 'function') {
        global.Child.recordPlay();
      }
      runWager = wager;
      runActive = true;
    }

    const judgment = evaluateGuess(side);
    renderReveal(judgment);
    const reveal = formatRevealText(judgment);

    if (judgment.correct) {
      rung += 1;
      pot = potForRung(rung, runWager);
      runState = 'climb';
      setStatus(reveal + ' · pot ' + pot, 'is-win');
      showVerdict('correct');
      renderPot({ grow: true });
      renderLadder();
      setButtons();
      if (global.DHSound) global.DHSound.correct(rung);
    } else {
      strikes += 1;
      showVerdict('wrong');
      if (strikes >= STRIKE_LIMIT) {
        // Strikeout — full bust. 三振 (sānzhèn) = "swung-and-missed three
        // times", the Mandarin baseball term for striking out.
        const lost = pot + runWager;
        pot = 0;
        rung = 0;
        runActive = false;
        runState = 'busted';
        setStatus(reveal + ' · 三振 STRIKEOUT — −' + lost + ' coins', 'is-loss');
        renderPot({ bust: true });
        renderLadder();
        renderStrikes({ flash: true });
        setButtons();
        paintFortune();
        if (global.DHSound) global.DHSound.wrong();
      } else {
        // First strike — pot and rung survive. Player chooses CASH OUT (take
        // the current pot) or PUSH IT (spin the susan and try again with the
        // strike still on the board).
        runState = 'climb';
        setStatus(reveal + ' · 好 STRIKE — cash out or push it', 'is-err');
        renderStrikes({ flash: true });
        renderLadder();
        setButtons();
        if (global.DHSound) global.DHSound.wrong();
      }
    }
  }

  function cashOut() {
    if (runState !== 'climb') return;
    const won = pot;
    if (global.Wallet) global.Wallet.add(won);
    setStatus('Cashed out: +' + won + ' coins. The cook smiles, briefly.', 'is-win');
    runActive = false;
    runState = 'cashed';
    renderPot({ cashed: true });
    renderLadder();
    setButtons();
    paintFortune();
    if (global.DHSound) global.DHSound.cashOut();
  }

  // Rotating fortune-cookie slip in the corner tray. Cheap flavor; not
  // load-bearing. Repainted on init, after a bust or cash-out, and on a slow
  // 9-second interval so the player has something to glance at.
  function paintFortune() {
    const el = document.getElementById('dh-fortune');
    if (!el || !FORTUNES.length) return;
    let f;
    do { f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]; }
    while (f === el.textContent && FORTUNES.length > 1);
    el.textContent = f;
  }

  function bind() {
    const pickA   = document.getElementById('dh-pick-a');
    const pickB   = document.getElementById('dh-pick-b');
    const cash    = document.getElementById('dh-cash');
    const next    = document.getElementById('dh-next');
    const restart = document.getElementById('dh-restart');
    const wagerEl = document.getElementById('dh-wager');
    const max     = document.getElementById('dh-max');
    const muteBtn = document.getElementById('dh-mute');

    if (pickA) pickA.addEventListener('click', () => answer('A'));
    if (pickB) pickB.addEventListener('click', () => answer('B'));
    if (cash)  cash.addEventListener('click', cashOut);
    if (next)  next.addEventListener('click', pushIt);
    if (restart) restart.addEventListener('click', startNewRun);

    if (max) {
      max.addEventListener('click', () => {
        if (!wagerEl || !global.Wallet) return;
        wagerEl.value = Math.max(1, global.Wallet.getBalance());
        renderLadder();
      });
    }
    if (wagerEl) {
      wagerEl.addEventListener('input', () => {
        if (!runActive) renderLadder();
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        if (!global.DHSound) return;
        const wasMuted = global.DHSound.isMuted();
        global.DHSound.setMuted(!wasMuted);
        muteBtn.textContent = wasMuted ? '🔊' : '🔇';
        muteBtn.classList.toggle('is-muted', !wasMuted);
        if (wasMuted) global.DHSound.click();
      });
    }
  }

  // ===== Access gate (honor-system ad-blocker confirmation) =====
  //
  // YouTube embeds on third-party origins (S3, custom hosts) get pre-rolls
  // on every iframe load. Rather than dodge the ads or try to detect a
  // blocker, we ask the player to promise they have one installed. If
  // they lie, they just watch ads — their problem, not ours.
  //
  // Gated by sessionStorage so re-entries (back-button from the lobby) skip.
  const GATE_SESSION_KEY = 'wendys_palace_dh_promise';

  function gateAlreadyAccepted() {
    try { return sessionStorage.getItem(GATE_SESSION_KEY) === '1'; }
    catch (e) { return false; }
  }
  function markGateAccepted() {
    try { sessionStorage.setItem(GATE_SESSION_KEY, '1'); } catch (e) {}
  }

  // Show the gate overlay and wait for the player to click the promise
  // button. Resolves immediately if they've already accepted this session.
  function runGate() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('dh-gate-overlay');
      if (!overlay) { resolve(); return; }
      if (gateAlreadyAccepted()) { overlay.remove(); resolve(); return; }

      overlay.hidden = false;
      const btn = document.getElementById('dh-gate-accept');
      if (!btn) { resolve(); return; }

      const accept = () => {
        btn.removeEventListener('click', accept);
        markGateAccepted();
        if (global.DHSound) global.DHSound.doorChime();
        overlay.classList.add('is-leaving');
        setTimeout(() => {
          if (overlay.parentNode) overlay.remove();
          resolve();
        }, 350);
      };
      btn.addEventListener('click', accept);
    });
  }

  async function init() {
    if (!VIDEOS.length || VIDEOS.length < 2) {
      const result = document.getElementById('dh-result');
      if (result) {
        result.textContent = 'Menu is empty — add videos to js/doublehappiness/data.js.';
        result.classList.add('is-on', 'is-err');
      }
      return;
    }
    bind();
    paintZodiac();
    paintFortune();
    renderPot();
    renderLadder();
    setInterval(paintFortune, 9000);

    // Honor-system gate. Blocks until the player clicks the promise button,
    // or resolves immediately if they accepted earlier in this session.
    await runGate();

    // Give the async JSON pool a head start so the very first pair is drawn
    // from the full 1000-entry set when reachable. If the fetch hangs or
    // fails (file:// blocks local fetches), proceed after 1.5s with whatever
    // VIDEOS already has — the sync fallback is fine.
    if (Data && Data.ready && typeof Data.ready.then === 'function') {
      await Promise.race([
        Data.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    }

    startNewRun();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
