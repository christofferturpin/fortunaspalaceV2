/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  DOM bindings, rendering, scoreboard, sound triggers    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ cache els{} (scoreboard, hands, buttons)     │
  │                          ├─ bind #jg-bet-amount input/change ─► clamp +  │
  │                          │     updateActionState                         │
  │                          ├─ bind #jg-bet-max click  ─► set to balance    │
  │                          ├─ bind #jg-deal click  ─► placeBet            │
  │                          ├─ bind #jg-hit  click  ─► JG.Round.hit         │
  │                          ├─ bind #jg-double click ─► JG.Round.doubleUp   │
  │                          ├─ bind #jg-stand click  ─► JG.Round.stand      │
  │                          ├─ bind #jg-next  click  ─► JG.Round.nextRound  │
  │                          ├─ JG.Round.onChange(render)                    │
  │                          ├─ Wallet.onChange(render)                      │
  │                          └─ render()                                     │
  │                                                                          │
  │   render() (on every state/wallet change):                               │
  │     ├─ triggerStateSounds(state) ──► bet/cardDeal/cardFlick/win/loss/    │
  │     │     bust/push (tracks lastPhase, lastDealerHandLen)                │
  │     ├─ updateActionState(state)  ──► enable/disable Deal/Hit/Stand/Next, │
  │     │     show double w/ amount                                          │
  │     ├─ renderScoreboard(state)   ──► dealer/player scores, status,       │
  │     │     payout text + is-win/loss/push classes                         │
  │     ├─ applyOutcomeStyling(state) ─► is-winner/is-loser on sections      │
  │     └─ renderHand × 2:                                                   │
  │           ├─ no melds ─► sortByRank → renderCard html                    │
  │           └─ melds    ─► renderMeldGroup per meld + renderUnusedGroup    │
  │                          (sortMeldCards handles ace-high run ordering)   │
  │                                                                          │
  │   Helpers:                                                               │
  │     snd()                       ──► JG.Sound or undefined                │
  │     renderCard(card)            ──► html string (corners + center pip)   │
  │     sortByRank(cards)           ──► card[] (ascending rank)              │
  │     sortMeldCards(meld)         ──► card[] (set:suit, run:rank+ace-high) │
  │     meldTypeKey(meld)           ──► 'set'|'run'|'flush'|'flush-run'      │
  │     meldLabel(meld)             ──► 'Set • +N' style                     │
  │     renderMeldGroup(meld)       ──► html string                          │
  │     renderUnusedGroup(cards)    ──► html string                          │
  │     renderEval(evalEl, eval)    ──► bust banner OR bust-meter html       │
  │     scoreText(eval)             ──► '0' | 'BUST' | finalScore            │
  │                                                                          │
  │   Exports: none (binds via DOMContentLoaded; no window attach)           │
  │   External deps: JG.Round, JG.Hand.BUST_LIMIT, JG.Sound, Wallet, DOM     │
  │   Consumers: jackandgin.html                                             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: els={}, lastPhase='idle', lastDealerHandLen=0
  snd()→JG.Sound|undef
  init(): cache els (#jg-scoreboard,*-dealer/player-side/score,*-status,*-payout,#jg-bet-amount,#jg-bet-max,#jg-dealer/player[-hand|-eval],#jg-deal/hit/double/stand/next); readBet()→parseInt(betInput)||0; bind betInput input→updateActionState, change→clamp[1..bal]; betMaxBtn→set bal+click+update; dealBtn→idle?validate+click+placeBet; hitBtn→playing?cardFlick+hit; doubleBtn→canDoubleUp?bet+doubleUp; standBtn→stand snd+Round.stand; nextBtn→click+nextRound; Round.onChange(render); Wallet.onChange(render); render
  triggerStateSounds(state): !snd→just track; idle→playing: bet()+setTimeout(cardDeal(6),80); dealer→dealer && dealerHand grew: cardFlick; entering 'resolved': pBust→bust; playerWin→win@200ms; dealerWin→loss@200ms; push→push@200ms; track lastPhase/lastDealerHandLen
  renderCard(card)→html: split label rank/suit; build .jg-card data-color=color with TL corner, center .jg-card-pip, BR corner
  sortByRank(cards)→copy sorted by rank asc
  sortMeldCards(meld)→cards: set→by suit; run→ace-high if has A+K (treat A as 14), else by rank; default→by rank
  meldTypeKey(meld)→str: run&sameSuit?'flush-run':type
  meldLabel(meld)→str: 'Flush Run'|'Flush'|'Run'|'Set' + ' • +'+score
  renderMeldGroup(meld)→html: <div jg-meld-group jg-meld-{key}><label><cards renderCard></div>
  renderUnusedGroup(cards)→html: '' if empty; else <div jg-meld-unused>Unused + cards
  renderEval(el,eval): null→clear; isBust→banner 'BUST at N'; else compute pct=total/40*100, severity safe/caution(>=65)/danger(>=85), maxSafe=39-total, hint 'Any hit busts'|'Safe hits: ≤N'; html=bust-meter + optional hint
  renderHand(handEl,evalEl,hand,eval): empty→clear; no melds→sortByRank+renderCard each+renderEval; else ∀meld renderMeldGroup + deadwood?renderUnusedGroup(sortByRank) + renderEval
  scoreText(eval)→'0'|'BUST'|finalScore
  renderScoreboard(state): p,d=evals; idle→'—'/'—' else scoreText; status: idle/playing(bust→''|both 0→'Build melds'|behind/leading/tied)/dealer'…'; clear classes+payout; resolved→is-resolved + is-win/loss/push + winner/loser classes + payout text
  applyOutcomeStyling(state): clear winner/loser on dealer+player sections; resolved+playerWin→player winner/dealer loser; dealerWin→inverse
  updateActionState(state): bal=Wallet.bal; v=betInput; validAmt=v∈[1..bal]; betInput/betMaxBtn disabled !idle; dealBtn disabled (!idle||!validAmt); hitBtn/standBtn disabled !playing; nextBtn disabled !resolved; doubleBtn disabled !canDoubleUp (always visible — no layout shift), text=canDoubleUp?'Double (+bet)':'Double'
  render(): state=Round.getState; triggerStateSounds; updateActionState; renderScoreboard; applyOutcomeStyling; renderHand×2 (dealer,player)
  exports: none; on DOMContentLoaded→init
*/

(function (global) {
  let els = {};
  let lastPhase = 'idle';
  let lastDealerHandLen = 0;

  function snd() {
    return global.JG && global.JG.Sound;
  }

  function init() {
    els = {
      scoreboard: document.getElementById('jg-scoreboard'),
      scoreboardDealerSide: document.getElementById('jg-scoreboard-dealer-side'),
      scoreboardPlayerSide: document.getElementById('jg-scoreboard-player-side'),
      scoreboardDealerScore: document.getElementById('jg-scoreboard-dealer-score'),
      scoreboardPlayerScore: document.getElementById('jg-scoreboard-player-score'),
      scoreboardStatus: document.getElementById('jg-scoreboard-status'),
      scoreboardPayout: document.getElementById('jg-scoreboard-payout'),
      betInput: document.getElementById('jg-bet-amount'),
      betMaxBtn: document.getElementById('jg-bet-max'),
      dealerSection: document.getElementById('jg-dealer'),
      playerSection: document.getElementById('jg-player'),
      jackpotBanner: document.getElementById('jg-jackpot-banner'),
      jackpotAmount: document.getElementById('jg-jackpot-amount'),
      dealerHand: document.getElementById('jg-dealer-hand'),
      dealerEval: document.getElementById('jg-dealer-eval'),
      playerHand: document.getElementById('jg-player-hand'),
      playerEval: document.getElementById('jg-player-eval'),
      dealBtn: document.getElementById('jg-deal'),
      hitBtn: document.getElementById('jg-hit'),
      doubleBtn: document.getElementById('jg-double'),
      standBtn: document.getElementById('jg-stand'),
      nextBtn: document.getElementById('jg-next'),
    };

    function readBet() {
      const v = parseInt(els.betInput.value, 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }

    els.betInput.addEventListener('input', () => updateActionState(JG.Round.getState()));
    els.betInput.addEventListener('change', () => {
      const balance = Wallet.getBalance();
      let v = readBet();
      if (v < 1) v = 1;
      if (v > balance && balance > 0) v = balance;
      els.betInput.value = String(v);
      updateActionState(JG.Round.getState());
    });
    els.betMaxBtn.addEventListener('click', () => {
      const balance = Wallet.getBalance();
      if (balance < 1) return;
      els.betInput.value = String(balance);
      if (snd()) JG.Sound.click();
      updateActionState(JG.Round.getState());
    });

    els.dealBtn.addEventListener('click', () => {
      if (JG.Round.getState().phase !== 'idle') return;
      const amount = readBet();
      if (amount < 1 || amount > Wallet.getBalance()) return;
      if (snd()) JG.Sound.click();
      JG.Round.placeBet(amount);
    });
    els.hitBtn.addEventListener('click', () => {
      if (JG.Round.getState().phase !== 'playing') return;
      if (snd()) JG.Sound.cardFlick();
      JG.Round.hit();
    });
    els.doubleBtn.addEventListener('click', () => {
      if (!JG.Round.canDoubleUp()) return;
      if (snd()) JG.Sound.bet();
      JG.Round.doubleUp();
    });
    els.standBtn.addEventListener('click', () => {
      if (snd()) JG.Sound.stand();
      JG.Round.stand();
    });
    els.nextBtn.addEventListener('click', () => {
      if (snd()) JG.Sound.click();
      JG.Round.nextRound();
    });

    JG.Round.onChange(render);
    Wallet.onChange(render);
    render();
  }

  function triggerStateSounds(state) {
    if (!snd()) {
      lastPhase = state.phase;
      lastDealerHandLen = state.dealerHand.length;
      return;
    }
    if (lastPhase === 'idle' && state.phase === 'playing') {
      JG.Sound.bet();
      setTimeout(() => JG.Sound.cardDeal(6), 80);
    }
    const dealerLen = state.dealerHand.length;
    if (lastPhase === 'dealer' && state.phase === 'dealer' && dealerLen > lastDealerHandLen) {
      JG.Sound.cardFlick();
    }
    if (state.phase === 'resolved' && lastPhase !== 'resolved') {
      const p = state.playerEval;
      if (p && p.isBust) {
        JG.Sound.bust();
      } else if (state.outcome === 'playerWin') {
        setTimeout(() => JG.Sound.win(), 200);
      } else if (state.outcome === 'dealerWin') {
        setTimeout(() => JG.Sound.loss(), 200);
      } else if (state.outcome === 'push') {
        setTimeout(() => JG.Sound.push(), 200);
      }
    }
    lastPhase = state.phase;
    lastDealerHandLen = dealerLen;
  }

  function renderCard(card) {
    const suit = card.label.slice(-1);
    const rank = card.label.slice(0, -1);
    return '<span class="jg-card" data-color="' + card.color + '">'
      + '<span class="jg-card-corner jg-card-corner-tl">'
      +   '<span class="jg-card-rank">' + rank + '</span>'
      +   '<span class="jg-card-suit-small">' + suit + '</span>'
      + '</span>'
      + '<span class="jg-card-pip">' + suit + '</span>'
      + '<span class="jg-card-corner jg-card-corner-br">'
      +   '<span class="jg-card-rank">' + rank + '</span>'
      +   '<span class="jg-card-suit-small">' + suit + '</span>'
      + '</span>'
      + '</span>';
  }

  function sortByRank(cards) {
    return cards.slice().sort((a, b) => a.rank - b.rank);
  }

  function sortMeldCards(meld) {
    const cards = meld.cards.slice();
    if (meld.type === 'set') {
      return cards.sort((a, b) => a.suit.localeCompare(b.suit));
    }
    if (meld.type === 'run') {
      const hasAce = cards.some((c) => c.rank === 1);
      const hasKing = cards.some((c) => c.rank === 13);
      const aceHigh = hasAce && hasKing;
      return cards.sort((a, b) => {
        const ar = (aceHigh && a.rank === 1) ? 14 : a.rank;
        const br = (aceHigh && b.rank === 1) ? 14 : b.rank;
        return ar - br;
      });
    }
    return cards.sort((a, b) => a.rank - b.rank);
  }

  function meldTypeKey(meld) {
    if (meld.type === 'run' && meld.sameSuit) return 'flush-run';
    return meld.type;
  }

  function meldLabel(meld) {
    const tag = meld.type === 'run' && meld.sameSuit ? 'Flush Run'
      : meld.type === 'flush' ? 'Flush'
      : meld.type === 'run' ? 'Run'
      : meld.type === 'set' ? 'Set' : meld.type;
    return tag + ' • +' + meld.score;
  }

  function renderMeldGroup(meld) {
    const sorted = sortMeldCards(meld);
    return '<div class="jg-meld-group jg-meld-' + meldTypeKey(meld) + '">'
      + '<div class="jg-meld-label">' + meldLabel(meld) + '</div>'
      + '<div class="jg-meld-cards">' + sorted.map(renderCard).join('') + '</div>'
      + '</div>';
  }

  function renderUnusedGroup(cards) {
    if (!cards.length) return '';
    return '<div class="jg-meld-group jg-meld-unused">'
      + '<div class="jg-meld-label">Unused</div>'
      + '<div class="jg-meld-cards">' + cards.map(renderCard).join('') + '</div>'
      + '</div>';
  }

  function renderEval(evalEl, evalResult) {
    if (!evalResult) {
      evalEl.innerHTML = '';
      return;
    }
    if (evalResult.isBust) {
      evalEl.innerHTML = '<div class="jg-bust-banner">BUST at ' + evalResult.handTotal + '</div>';
      return;
    }
    const bustLimit = JG.Hand.BUST_LIMIT;
    const total = evalResult.handTotal;
    const pct = Math.min(100, (total / bustLimit) * 100);
    let severity = 'safe';
    if (pct >= 85) severity = 'danger';
    else if (pct >= 65) severity = 'caution';

    const maxSafe = bustLimit - 1 - total;
    let bustHint = '';
    if (maxSafe <= 0) bustHint = 'Any hit busts';
    else if (maxSafe < 10) bustHint = 'Safe hits: card value ≤ ' + maxSafe;

    evalEl.innerHTML =
      '<div class="jg-bust-meter jg-bust-' + severity + '">' +
        '<div class="jg-bust-meter-fill" style="width: ' + pct + '%;"></div>' +
        '<div class="jg-bust-meter-label">Hand ' + total + '/' + bustLimit + '</div>' +
      '</div>' +
      (bustHint ? '<div class="jg-eval-line jg-bust-hint">' + bustHint + '</div>' : '');
  }

  function renderHand(handEl, evalEl, hand, evalResult) {
    if (!hand.length) {
      handEl.innerHTML = '';
      evalEl.innerHTML = '';
      return;
    }
    if (!evalResult || evalResult.melds.length === 0) {
      handEl.innerHTML = sortByRank(hand).map(renderCard).join('');
      renderEval(evalEl, evalResult);
      return;
    }
    let html = '';
    for (const meld of evalResult.melds) {
      html += renderMeldGroup(meld);
    }
    if (evalResult.deadwood.length) {
      html += renderUnusedGroup(sortByRank(evalResult.deadwood));
    }
    handEl.innerHTML = html;
    renderEval(evalEl, evalResult);
  }

  function scoreText(evalResult) {
    if (!evalResult) return '0';
    if (evalResult.isBust) return 'BUST';
    return String(evalResult.finalScore);
  }

  function renderScoreboard(state) {
    const p = state.playerEval;
    const d = state.dealerEval;

    let dealerDisplay, playerDisplay;
    if (state.phase === 'idle') {
      dealerDisplay = '—';
      playerDisplay = '—';
    } else {
      dealerDisplay = scoreText(d);
      playerDisplay = scoreText(p);
    }
    els.scoreboardDealerScore.textContent = dealerDisplay;
    els.scoreboardPlayerScore.textContent = playerDisplay;

    let status = '';
    if (state.phase === 'idle') {
      status = 'Choose your wager and deal.';
    } else if (state.phase === 'playing') {
      const pScore = (p && !p.isBust) ? p.finalScore : 0;
      const dScore = (d && !d.isBust) ? d.finalScore : 0;
      if (p && p.isBust) {
        status = '';
      } else if (pScore === 0 && dScore === 0) {
        status = 'Build melds to score.';
      } else if (pScore < dScore) {
        status = 'Behind by ' + (dScore - pScore) + ' — Moloch will draw.';
      } else if (pScore > dScore) {
        status = 'Leading by ' + (pScore - dScore) + ' — Moloch will draw.';
      } else {
        status = 'Tied — Moloch will draw.';
      }
    } else if (state.phase === 'dealer') {
      status = 'Moloch\'s turn...';
    }
    els.scoreboardStatus.textContent = status;

    els.scoreboard.classList.remove('is-resolved', 'is-win', 'is-loss', 'is-push');
    els.scoreboardDealerSide.classList.remove('is-winner', 'is-loser');
    els.scoreboardPlayerSide.classList.remove('is-winner', 'is-loser');
    els.scoreboardPayout.textContent = '';

    if (state.phase === 'resolved') {
      els.scoreboard.classList.add('is-resolved');
      let payout;
      if (state.outcome === 'playerWin') {
        els.scoreboard.classList.add('is-win');
        els.scoreboardPlayerSide.classList.add('is-winner');
        els.scoreboardDealerSide.classList.add('is-loser');
        payout = 'You Win  +' + (state.bet * 3) + ' Tribute';
      } else if (state.outcome === 'dealerWin') {
        els.scoreboard.classList.add('is-loss');
        els.scoreboardDealerSide.classList.add('is-winner');
        els.scoreboardPlayerSide.classList.add('is-loser');
        payout = 'Moloch Wins  −' + state.bet + ' Tribute';
      } else {
        els.scoreboard.classList.add('is-push');
        payout = 'Push — wager returned';
      }
      els.scoreboardPayout.textContent = payout;
    }
  }

  function applyOutcomeStyling(state) {
    const ds = els.dealerSection;
    const ps = els.playerSection;
    if (!ds || !ps) return;
    ds.classList.remove('is-winner', 'is-loser');
    ps.classList.remove('is-winner', 'is-loser');
    if (state.phase !== 'resolved') return;
    if (state.outcome === 'playerWin') {
      ps.classList.add('is-winner');
      ds.classList.add('is-loser');
    } else if (state.outcome === 'dealerWin') {
      ds.classList.add('is-winner');
      ps.classList.add('is-loser');
    }
  }

  function updateActionState(state) {
    const balance = Wallet.getBalance();
    const v = parseInt(els.betInput.value, 10);
    const validAmount = Number.isFinite(v) && v >= 1 && v <= balance;
    const inIdle = state.phase === 'idle';

    els.betInput.disabled = !inIdle;
    els.betInput.max = String(Math.max(1, balance));
    els.betMaxBtn.disabled = !inIdle || balance < 1;

    els.dealBtn.disabled = !inIdle || !validAmount;
    els.hitBtn.disabled = state.phase !== 'playing';
    els.standBtn.disabled = state.phase !== 'playing';
    els.nextBtn.disabled = state.phase !== 'resolved';

    const canDouble = JG.Round.canDoubleUp();
    els.doubleBtn.disabled = !canDouble;
    els.doubleBtn.textContent = canDouble
      ? 'Double (+' + state.bet + ')'
      : 'Double';
  }

  function render() {
    const state = JG.Round.getState();
    triggerStateSounds(state);

    updateActionState(state);
    renderScoreboard(state);
    applyOutcomeStyling(state);
    renderJackpot(state);

    renderHand(els.dealerHand, els.dealerEval, state.dealerHand, state.dealerEval);
    renderHand(els.playerHand, els.playerEval, state.playerHand, state.playerEval);
  }

  function renderJackpot(state) {
    if (!els.jackpotAmount || !els.jackpotBanner) return;
    els.jackpotAmount.textContent = String(JG.Round.getJackpot());
    const justWon = state.phase === 'resolved' && state.jackpotWon > 0;
    els.jackpotBanner.classList.toggle('is-won', justWon);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
