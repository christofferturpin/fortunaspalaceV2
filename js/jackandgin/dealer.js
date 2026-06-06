/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN  —  dealer AI: stand/draw decisions                        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   IIFE(window) ──► attach window.JG.Dealer                               │
  │                                                                          │
  │   Policy — the player has already locked in (stood). Tying refunds the   │
  │   bet, only strict-win pays. So the dealer must keep drawing whenever    │
  │   they aren't already ahead, even at bust risk — losing-by-bust is no    │
  │   worse than losing-by-score.                                            │
  │                                                                          │
  │     shouldStand(dealerEval, playerEval) ──► bool                         │
  │        │                                                                 │
  │        ├─ true  if dealerEval.isBust    (cannot keep drawing)            │
  │        ├─ true  if no playerEval AND meld already exists  (fallback)     │
  │        ├─ true  if dealerEval.finalScore > playerEval.finalScore         │
  │        └─ false otherwise                                                │
  │                                                                          │
  │   Full play (batch):                                                     │
  │     playDealer(initialHand, deck, playerEval) ──► {hand, evalResult}     │
  │        └─ loop: findBestPartition → if !shouldStand → draw               │
  │                                                                          │
  │   Single step (for animated draws, mutates deck):                        │
  │     dealerStep(currentHand, deck, playerEval) ──► {action:'draw'|'stand',│
  │                                                    hand, evalResult}     │
  │                                                                          │
  │   Exports (window.JG.Dealer): {shouldStand, playDealer, dealerStep}      │
  │   External deps: JG.Hand.findBestPartition, JG.Cards.draw                │
  │   Consumers: JG.Round.scheduleDealerStep                                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  shouldStand(dEval,pEval)→bool: dEval.isBust→T; !pEval→(dEval.melds.len>0); dEval.finalScore>pEval.finalScore→T; else F
  playDealer(initHand,deck,pEval)→{hand,evalResult}: hand=copy; eval=findBest; while(!shouldStand(eval,pEval) && deck.len): hand.push(draw); eval=findBest; ret{hand,evalResult}
  dealerStep(curHand,deck,pEval)→{action,hand,evalResult}: eval=findBest(curHand); shouldStand(eval,pEval)||deck.empty→{action:'stand',hand:copy,eval}; else newHand=copy.push(draw)→{action:'draw',hand:newHand,eval:findBest(newHand)}
  exports: global.JG.Dealer={shouldStand,playDealer,dealerStep}
*/

(function (global) {
  function shouldStand(dealerEval, playerEval) {
    if (dealerEval.isBust) return true;
    if (!playerEval) return dealerEval.melds.length > 0;
    return dealerEval.finalScore > playerEval.finalScore;
  }

  function playDealer(initialHand, deck, playerEval) {
    const hand = initialHand.slice();
    let evalResult = JG.Hand.findBestPartition(hand);
    while (!shouldStand(evalResult, playerEval)) {
      if (deck.length === 0) break;
      hand.push(JG.Cards.draw(deck));
      evalResult = JG.Hand.findBestPartition(hand);
    }
    return { hand, evalResult };
  }

  // Single-step dealer decision — used to animate draws one at a time.
  // Mutates the deck (pops a card) when action is 'draw'.
  function dealerStep(currentHand, deck, playerEval) {
    const evalNow = JG.Hand.findBestPartition(currentHand);
    if (shouldStand(evalNow, playerEval) || deck.length === 0) {
      return { action: 'stand', hand: currentHand.slice(), evalResult: evalNow };
    }
    const newHand = currentHand.slice();
    newHand.push(JG.Cards.draw(deck));
    return {
      action: 'draw',
      hand: newHand,
      evalResult: JG.Hand.findBestPartition(newHand),
    };
  }

  global.JG = global.JG || {};
  global.JG.Dealer = {
    shouldStand,
    playDealer,
    dealerStep,
  };
})(window);
