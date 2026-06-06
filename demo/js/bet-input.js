/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BET-INPUT — palace-wide bet/wager/stake input enhancement               │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ for each known id: enhance(#id)              │
  │                          └─ for each $$('[data-bet-input]'): enhance     │
  │                                                                          │
  │   enhance(input) ──► wraps input in .bet-enh-wrap, injects               │
  │                       .bet-enh-steps with two small triangular           │
  │                       up/down buttons, binds:                            │
  │                          • pointerdown→pointermove vertical drag         │
  │                            (1 unit per DRAG_PX). value clamps to         │
  │                            input.min/max, dispatches input + change.     │
  │                          • step button click → ±1                        │
  │                          • step button press-and-hold → repeat ±1        │
  │                            (300ms initial delay, 90ms cadence)           │
  │                          • wheel-while-focused → ±1 per notch            │
  │                                                                          │
  │   Exports (window.BetInput): { enhance, init, KNOWN_IDS }                │
  │   External deps: none (no Wallet/Sound — purely a control widget)        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  KNOWN_IDS=['bet-amount','jg-bet-amount','cp-wager','pool-bet','dm-wager',
             'op-wager','cf-bet-amount','hr-wager','ir-wager','dh-wager',
             'bb-wager','raid-wager-input','wager','sb-bet-input']
  DRAG_PX=5, HOLD_DELAY=300, HOLD_RATE=90, WHEEL_UNIT=1
  state per input: _betEnhanced=T marker; dragActive, dragStartY, dragStartVal
  clamp(input,v)→v: min=parseInt(input.min)||-Inf; max=parseInt(input.max)||Inf;
                    return Math.max(min,Math.min(max,v))
  fire(input): input.dispatchEvent(new Event('input',{bubbles:T}));
               input.dispatchEvent(new Event('change',{bubbles:T}))
  setVal(input,v): nv=clamp(input,Math.round(v)); guard(nv===+input.value)→;
                   input.value=String(nv); fire(input)
  enhance(input): guard(input._betEnhanced||input.type!=='number')→;
                  input._betEnhanced=T;
                  wrap=div.bet-enh-wrap; input.parentNode.insertBefore(wrap,input);
                  wrap.appendChild(input); input.classList.add('bet-enh-input');
                  steps=div.bet-enh-steps with btn.bet-enh-step-up,btn.bet-enh-step-down
                    (each contains span.bet-enh-step-arrow);
                  wrap.appendChild(steps);
                  pointerdown on input:start=val,startY=e.clientY,dragActive=T;
                    capture pointer; pointermove:Δy=startY-e.clientY;
                    n=Math.trunc(Δy/DRAG_PX); setVal(input,start+n);
                    pointerup/cancel:release;dragActive=F;
                  stepUp.click/stepDown.click:setVal(input,+input.value±1);
                  stepUp/stepDown pointerdown:repeater (setTimeout HOLD_DELAY→
                    setInterval HOLD_RATE) — cancel on pointerup/leave;
                  input.wheel:e.preventDefault();setVal(input,+input.value-sign(e.deltaY))
  init(): ∀id∈KNOWN_IDS: el=#id; el&&el.type==='number'→enhance(el);
          ∀$$('[data-bet-input]'):enhance
  exports: global.BetInput={enhance,init,KNOWN_IDS}; on DOMContentLoaded→init
*/
(function (global) {
  'use strict';

  var KNOWN_IDS = [
    'bet-amount', 'jg-bet-amount', 'cp-wager', 'pool-bet', 'dm-wager',
    'op-wager', 'cf-bet-amount', 'hr-wager', 'ir-wager', 'dh-wager',
    'bb-wager', 'raid-wager-input', 'wager', 'sb-bet-input'
  ];

  var DRAG_PX = 5;
  var HOLD_DELAY = 300;
  var HOLD_RATE = 90;

  function clamp(input, v) {
    var min = parseFloat(input.min);
    var max = parseFloat(input.max);
    if (isNaN(min)) min = -Infinity;
    if (isNaN(max)) max = Infinity;
    if (v < min) v = min;
    if (v > max) v = max;
    return v;
  }

  function fire(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setVal(input, v) {
    if (!isFinite(v)) return;
    var nv = clamp(input, Math.round(v));
    if (String(nv) === input.value) return;
    input.value = String(nv);
    fire(input);
  }

  function currentVal(input) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) v = parseFloat(input.min) || 0;
    return v;
  }

  function makeArrow() {
    var s = document.createElement('span');
    s.className = 'bet-enh-step-arrow';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  function makeStep(dir) {
    var b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'bet-enh-step bet-enh-step-' + dir;
    b.setAttribute('aria-label', dir === 'up' ? 'Increase wager' : 'Decrease wager');
    b.appendChild(makeArrow());
    return b;
  }

  function bindStepHold(btn, input, delta) {
    var holdTimer = null;
    var repeatTimer = null;

    function step() { setVal(input, currentVal(input) + delta); }

    function start(e) {
      if (e.button !== undefined && e.button !== 0) return;
      step();
      btn.classList.add('is-held');
      holdTimer = setTimeout(function () {
        repeatTimer = setInterval(step, HOLD_RATE);
      }, HOLD_DELAY);
    }

    function stop() {
      btn.classList.remove('is-held');
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
    }

    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      start(e);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('blur', stop);
  }

  function bindDrag(input, wrap) {
    var dragActive = false;
    var startY = 0;
    var startVal = 0;
    var pointerId = null;
    var moved = false;

    input.addEventListener('pointerdown', function (e) {
      if (input.disabled || input.readOnly) return;
      if (e.button !== undefined && e.button !== 0) return;
      dragActive = true;
      moved = false;
      startY = e.clientY;
      startVal = currentVal(input);
      pointerId = e.pointerId;
      try { input.setPointerCapture(pointerId); } catch (err) {}
      wrap.classList.add('is-dragging');
    });

    input.addEventListener('pointermove', function (e) {
      if (!dragActive) return;
      var dy = startY - e.clientY;
      if (Math.abs(dy) >= DRAG_PX) moved = true;
      var units = Math.trunc(dy / DRAG_PX);
      setVal(input, startVal + units);
    });

    function release(e) {
      if (!dragActive) return;
      dragActive = false;
      try { if (pointerId !== null) input.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
      wrap.classList.remove('is-dragging');
      /* if the pointer actually moved, suppress the focus/text-cursor so the
         drag feels like a control, not a text edit */
      if (moved) {
        try { input.blur(); } catch (err) {}
      }
    }

    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
  }

  function bindWheel(input) {
    input.addEventListener('wheel', function (e) {
      if (document.activeElement !== input) return;
      e.preventDefault();
      var dir = e.deltaY < 0 ? 1 : -1;
      setVal(input, currentVal(input) + dir);
    }, { passive: false });
  }

  function enhance(input) {
    if (!input || input._betEnhanced) return;
    if (input.tagName !== 'INPUT' || input.type !== 'number') return;
    input._betEnhanced = true;

    var parent = input.parentNode;
    if (!parent) return;

    var wrap = document.createElement('span');
    wrap.className = 'bet-enh-wrap';

    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add('bet-enh-input');

    var steps = document.createElement('span');
    steps.className = 'bet-enh-steps';
    var upBtn = makeStep('up');
    var dnBtn = makeStep('down');
    steps.appendChild(upBtn);
    steps.appendChild(dnBtn);
    wrap.appendChild(steps);

    bindDrag(input, wrap);
    bindStepHold(upBtn, input, +1);
    bindStepHold(dnBtn, input, -1);
    bindWheel(input);
  }

  function init() {
    for (var i = 0; i < KNOWN_IDS.length; i++) {
      var el = document.getElementById(KNOWN_IDS[i]);
      if (el && el.tagName === 'INPUT' && el.type === 'number') enhance(el);
    }
    var marked = document.querySelectorAll('[data-bet-input]');
    for (var j = 0; j < marked.length; j++) enhance(marked[j]);
  }

  global.BetInput = { enhance: enhance, init: init, KNOWN_IDS: KNOWN_IDS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
