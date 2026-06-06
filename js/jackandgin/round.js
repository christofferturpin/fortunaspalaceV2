/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  round state machine: bet → play → dealer → resolve     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.JG.Round                                │
  │                                                                          │
  │   state: {phase:'idle'|'playing'|'dealer'|'resolved', bet, deck,         │
  │           playerHand, dealerHand, playerEval, dealerEval, outcome,       │
  │           doubledUp, message}                                            │
  │   listeners[]: notify() ──► fn(state) for each onChange subscriber       │
  │                                                                          │
  │   Phase transitions:                                                     │
  │                                                                          │
  │     idle ──placeBet(amount)──► playing                                   │
  │              ├─ Wallet.spend(amount); Child.recordPlay()                 │
  │              └─ dealInitial()  (fresh deck, 3 cards each)                │
  │                                                                          │
  │     playing ──hit()──► playing (or resolved if bust)                     │
  │                 └─ draws card, re-evaluates partition                    │
  │     playing ──doubleUp()──► playing                                      │
  │                 └─ Wallet.spend(bet); bet *= 2  (gated by canDoubleUp)   │
  │     playing ──stand()──► dealer                                          │
  │                 └─ scheduleDealerStep() (setTimeout 600ms loop)          │
  │                                                                          │
  │     dealer  ──scheduleDealerStep()──► dealer | resolved                  │
  │                 └─ JG.Dealer.dealerStep → 'draw' recurses, 'stand' calls │
  │                    resolve()                                             │
  │                                                                          │
  │     resolved (resolve internal):                                         │
  │                 ├─ both bust    ─► push, Wallet.add(bet)                 │
  │                 ├─ player bust  ─► dealerWin                             │
  │                 ├─ no melds     ─► push, Wallet.add(bet)                 │
  │                 ├─ dealer bust  ─► playerWin, Wallet.add(bet*3)          │
  │                 ├─ p > d        ─► playerWin, Wallet.add(bet*3)          │
  │                 ├─ p < d        ─► dealerWin                             │
  │                 └─ tie          ─► push, Wallet.add(bet)                 │
  │                                                                          │
  │     resolved ──nextRound()──► idle (clears state)                        │
  │                                                                          │
  │   Queries:                                                               │
  │     getState()        ──► state (live ref)                               │
  │     canDoubleUp()     ──► bool (phase=playing & !doubledUp & 3 cards &   │
  │                                 balance ≥ bet)                           │
  │     onChange(fn)      ──► subscribes fn to notify()                      │
  │                                                                          │
  │   Exports (window.JG.Round): {getState, placeBet, hit, stand, doubleUp,  │
  │     canDoubleUp, nextRound, onChange}                                    │
  │   External deps: JG.Cards, JG.Hand, JG.Dealer, Wallet, window.Child      │
  │   Consumers: JG.UI                                                       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  DEALER_STEP_MS=600
  state: {phase:'idle',bet:0,deck:[],playerHand:[],dealerHand:[],playerEval:null,dealerEval:null,outcome:null,doubledUp:F,message:'Choose…'}
  listeners[]; notify(): ∀fn∈listeners try fn(state) catch→console.error (isolate throws so one bad listener can't kill subsequent ones, eg moloch-jeer)
  dealInitial(): deck=freshDeck; playerHand=[]; dealerHand=[]; deal 3 each via Cards.draw; eval both via Hand.findBestPartition
  placeBet(amt)→bool: guard(phase!='idle'); !Wallet.spend(amt)→F; Child.recordPlay?; bet=amt; doubledUp=F; dealInitial; phase='playing'; msg='Hit or stand. Total N'; notify; ret T
  canDoubleUp()→bool: phase=='playing' && !doubledUp && playerHand.len==3 && Wallet.bal>=bet
  doubleUp()→bool: guard phase/doubled/handLen!=3; !Wallet.spend(bet)→F; bet*=2; doubledUp=T; msg='Wager doubled to N'; notify
  hit(): guard(phase!='playing'); playerHand.push(draw); eval=findBest; isBust→phase='resolved',outcome='dealerWin',msg='You bust…'; else msg='Hit or stand…'; notify
  stand(): guard(phase!='playing'); phase='dealer'; msg='Dealer\'s turn…'; notify; scheduleDealerStep
  scheduleDealerStep(): setTimeout(600ms,()=>{guard(phase!='dealer'); step=Dealer.dealerStep(dealerHand,deck,playerEval); dealerHand=step.hand; dealerEval=step.eval; step.action=='draw'?notify+recurse:resolve+notify})
  resolve(): phase='resolved'; p=playerEval,d=dealerEval; both bust→push+Wallet.add(bet); pBust→dealerWin; both 0 melds→push+add(bet); dBust→playerWin+add(bet*2); p.final>d.final→playerWin+add(bet*2); p<d→dealerWin; eq→push+add(bet)
  nextRound(): guard(phase!='resolved'); reset state to idle defaults; notify
  exports: global.JG.Round={getState,placeBet,hit,stand,doubleUp,canDoubleUp,nextRound,onChange:listeners.push}
*/

(function (global) {
  // ─── Jackpot — persistent across visits via localStorage ─────────
  // Every dealer-win (player bust OR dealer outscores player) feeds 1% of
  // the player's current Tribute into the pot, with a 1-coin minimum so
  // small balances still tick. NB: both loss paths must call feedJackpot —
  // the bust-on-hit case in hit() resolves inline and doesn't go through
  // resolve(), so the call is duplicated there. Player claims the pot by
  // winning a round with a meld finalScore ≥ JACKPOT_QUALIFIER. Key is
  // wendys_palace_pp_jackpot per project localStorage naming convention.
  const JACKPOT_KEY = 'wendys_palace_pp_jackpot';
  const JACKPOT_QUALIFIER = 40;
  const JACKPOT_FEED_PCT = 0.01;

  function readJackpot() {
    try {
      const v = parseInt(localStorage.getItem(JACKPOT_KEY) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function writeJackpot(v) {
    try {
      localStorage.setItem(JACKPOT_KEY, String(Math.max(0, Math.floor(v))));
    } catch (e) { /* localStorage full or blocked; ignore */ }
  }
  function feedJackpot() {
    // 1% of current Tribute, ceiled with a 1-coin floor — Math.floor here
    // would zero out any balance under 100. Note: reads balance AFTER the
    // bet was spent, which is fine since ceil + min-1 keeps even an all-in
    // loss feeding the pot.
    const balance = Wallet.getBalance();
    const add = Math.max(1, Math.ceil(balance * JACKPOT_FEED_PCT));
    writeJackpot(readJackpot() + add);
  }
  function tryClaimJackpot() {
    if (!state.playerEval || state.playerEval.finalScore < JACKPOT_QUALIFIER) return;
    const pot = readJackpot();
    if (pot <= 0) return;
    Wallet.add(pot);
    writeJackpot(0);
    state.jackpotWon = pot;
  }

  const state = {
    phase: 'idle',
    bet: 0,
    deck: [],
    playerHand: [],
    dealerHand: [],
    playerEval: null,
    dealerEval: null,
    outcome: null,
    doubledUp: false,
    jackpotWon: 0,
    message: 'Choose your wager and deal.',
  };

  const listeners = [];
  function notify() {
    // Isolate listener exceptions so one throwing subscriber (e.g. a render
    // path that hits a null DOM ref) doesn't kill every later listener and
    // silently break things like the moloch jeer popup.
    for (const fn of listeners) {
      try { fn(state); }
      catch (e) { try { console.error('[JG.Round listener]', e); } catch (_) {} }
    }
  }

  function dealInitial() {
    state.deck = JG.Cards.freshDeck();
    state.playerHand = [];
    state.dealerHand = [];
    for (let i = 0; i < 3; i++) state.playerHand.push(JG.Cards.draw(state.deck));
    for (let i = 0; i < 3; i++) state.dealerHand.push(JG.Cards.draw(state.deck));
    state.playerEval = JG.Hand.findBestPartition(state.playerHand);
    state.dealerEval = JG.Hand.findBestPartition(state.dealerHand);
  }

  function placeBet(amount) {
    if (state.phase !== 'idle') return false;
    if (!Wallet.spend(amount)) return false;
    if (window.Child) window.Child.recordPlay();
    state.bet = amount;
    state.doubledUp = false;
    dealInitial();
    state.phase = 'playing';
    state.message = 'Hit or stand. Total ' + state.playerEval.handTotal + '.';
    notify();
    return true;
  }

  function canDoubleUp() {
    return state.phase === 'playing'
      && !state.doubledUp
      && state.playerHand.length === 3
      && Wallet.getBalance() >= state.bet;
  }

  function doubleUp() {
    if (state.phase !== 'playing') return false;
    if (state.doubledUp) return false;
    if (state.playerHand.length !== 3) return false;
    if (!Wallet.spend(state.bet)) return false;
    state.bet *= 2;
    state.doubledUp = true;
    state.message = 'Wager doubled to ' + state.bet + '. Hit or stand.';
    notify();
    return true;
  }

  function hit() {
    if (state.phase !== 'playing') return;
    state.playerHand.push(JG.Cards.draw(state.deck));
    state.playerEval = JG.Hand.findBestPartition(state.playerHand);
    if (state.playerEval.isBust) {
      state.phase = 'resolved';
      state.outcome = 'dealerWin';
      state.message = 'You bust at ' + state.playerEval.handTotal + '. Moloch wins.';
      feedJackpot();
    } else {
      state.message = 'Hit or stand. Total ' + state.playerEval.handTotal + '.';
    }
    notify();
  }

  const DEALER_STEP_MS = 600;

  function stand() {
    if (state.phase !== 'playing') return;
    state.phase = 'dealer';
    state.message = 'Moloch\'s turn...';
    notify();
    scheduleDealerStep();
  }

  function scheduleDealerStep() {
    setTimeout(function () {
      if (state.phase !== 'dealer') return;
      const step = JG.Dealer.dealerStep(state.dealerHand, state.deck, state.playerEval);
      state.dealerHand = step.hand;
      state.dealerEval = step.evalResult;
      if (step.action === 'draw') {
        notify();
        scheduleDealerStep();
      } else {
        resolve();
        notify();
      }
    }, DEALER_STEP_MS);
  }

  function resolve() {
    state.phase = 'resolved';
    state.jackpotWon = 0;
    const p = state.playerEval;
    const d = state.dealerEval;
    if (p.isBust && d.isBust) {
      state.outcome = 'push';
      state.message = 'Both bust at ' + p.handTotal + ' / ' + d.handTotal + '. Push, bet returned.';
      Wallet.add(state.bet);
    } else if (p.isBust) {
      state.outcome = 'dealerWin';
      state.message = 'You bust at ' + p.handTotal + '. Moloch wins.';
      feedJackpot();
    } else if (p.melds.length === 0 && d.melds.length === 0) {
      state.outcome = 'push';
      state.message = 'No melds on either side. Push, bet returned.';
      Wallet.add(state.bet);
    } else if (d.isBust) {
      state.outcome = 'playerWin';
      state.message = 'Moloch busts at ' + d.handTotal + '. You win. +' + (state.bet * 3) + ' Tribute.';
      Wallet.add(state.bet * 3);
      tryClaimJackpot();
    } else if (p.finalScore > d.finalScore) {
      state.outcome = 'playerWin';
      state.message = 'You win, ' + p.finalScore + ' vs ' + d.finalScore + '. +' + (state.bet * 3) + ' Tribute.';
      Wallet.add(state.bet * 3);
      tryClaimJackpot();
    } else if (p.finalScore < d.finalScore) {
      state.outcome = 'dealerWin';
      state.message = 'Moloch wins, ' + d.finalScore + ' vs ' + p.finalScore + '.';
      feedJackpot();
    } else {
      state.outcome = 'push';
      state.message = 'Push at ' + p.finalScore + '. Bet returned.';
      Wallet.add(state.bet);
    }
    if (state.jackpotWon > 0) {
      state.message += ' JACKPOT +' + state.jackpotWon + '!';
    }
  }

  function nextRound() {
    if (state.phase !== 'resolved') return;
    state.phase = 'idle';
    state.bet = 0;
    state.deck = [];
    state.playerHand = [];
    state.dealerHand = [];
    state.playerEval = null;
    state.dealerEval = null;
    state.outcome = null;
    state.doubledUp = false;
    state.jackpotWon = 0;
    state.message = 'Choose your wager and deal.';
    notify();
  }

  global.JG = global.JG || {};
  global.JG.Round = {
    getState() { return state; },
    getJackpot: readJackpot,
    JACKPOT_QUALIFIER,
    placeBet,
    hit,
    stand,
    doubleUp,
    canDoubleUp,
    nextRound,
    onChange(fn) { listeners.push(fn); },
  };
})(window);
