/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BOSSFIGHT INTRO — two-phase fullscreen takeover before boss navigation │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   BossIntro.run(nextPage) ──► phase1 ──► fadeBlack ──► phase2 ──► nav   │
  │        ├─ phase1: red glowing staggered text over a pixelated backdrop  │
  │        │          ("Your head... starts... to... pound!").              │
  │        │          backdrop-filter pixelates only the background;        │
  │        │          overlay text stays crisp.                             │
  │        ├─ fadeBlack: overlay bg fades to opaque #000, phase-1 text      │
  │        │            fades out.                                          │
  │        └─ phase2: black & white sequenced reveal —                      │
  │                     "You" (blamp), "vs" (blamp), "<ENEMY>" (ding),      │
  │                   then navigate to nextPage.                            │
  │                                                                          │
  │   Exports (window): { BossIntro: { run } }                               │
  │   External deps: Web Audio (lazy AudioContext for blamp / ding SFX)     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  P1_PHRASES=["Your head","...","starts","...","to","...","pound!"]
  P1_MS=[420,260,420,260,300,260,520]; SETTLE=520
  FADE_MS=520
  P2=[{txt:"You",sfx:blamp,d:520},{txt:"vs",sfx:blamp,d:520},{txt:NAME,sfx:ding,d:980}]
  NAME_MAP={chavez:"CHAVEZ",malechstone:"MALECHSTONE",
            "zashiki-warashi":"ZASHIKI-WARASHI",nahual:"NAHUAL",fortuna:"FORTUNA"}

  run(nextPage):
    guard(running)→ret; running=T
    slug=parseSlug(nextPage); enemy=NAME_MAP[slug]||"BOSS"
    injectStyles; overlay=buildOverlay(); body.append(overlay)
    pixelateBackdrop(overlay)        // backdrop-filter on overlay
    revealPhase1(overlay)            // recursive staggered
    after p1 → fadeBlack(overlay)
    after fade → swapToPhase2(overlay, enemy)
    after p2 → location.href=nextPage

  blamp(): low sine 110→35Hz drop + noise click ~150ms
  ding():  pair of sines (1320,880Hz) with long expDecay ~900ms
*/
(function () {
  'use strict';
  if (window.BossIntro) return;

  // ── Phase 1 (red head-pound text) ────────────────────────────────────
  var P1_PHRASES = ['Your head', '...', 'starts', '...', 'to', '...', 'pound!'];
  var P1_MS      = [420, 260, 420, 260, 300, 260, 520];
  var P1_SETTLE  = 520;

  // ── Fade to black ────────────────────────────────────────────────────
  var FADE_MS    = 560;

  // ── Phase 2 (B&W "You vs ENEMY") ─────────────────────────────────────
  var P2_HOLD_YOU   = 520;
  var P2_HOLD_VS    = 520;
  var P2_HOLD_NAME  = 1100;
  var P2_END_PAD    = 380;

  // ── Phase 3 (Texas Hold 'Em stakes card) ─────────────────────────────
  var P3_FADE_IN    = 360;    // crossfade from phase 2 → phase 3
  var P3_HOLD       = 1800;   // dwell time on the stakes line
  var P3_END_PAD    = 320;

  // ── Slug → display name on the VS card ───────────────────────────────
  // Boss 1 (chavez slug) displays his FIRST name "Gabriel" per design.
  // CSS uppercases the .is-name line on render; phase 3 keeps title case.
  var NAME_MAP = {
    'chavez':            'Agent Gabriel',
    'malechstone':       'Agent Malechstone',
    'zashiki-warashi':   'Agent Zashiki-Warashi',
    'nahual':            'Agent Nahual',
    'fortuna':           'Fortuna'
  };
  // Slug → starting chips, mirrored from each boss page's BossConfig.
  var STAKES_MAP = {
    'chavez':            { you: 100, opp:  50 },
    'malechstone':       { you: 100, opp:  75 },
    'zashiki-warashi':   { you: 100, opp: 100 },
    'nahual':            { you: 100, opp: 125 },
    'fortuna':           { you: 100, opp: 150 }
  };

  function parseSlug(nextPage) {
    if (!nextPage) return '';
    var m = nextPage.match(/bossfight-([a-z0-9-]+)\.html/i);
    return m ? m[1].toLowerCase() : '';
  }

  var running = false;
  var audioCtx = null;

  function ensureCtx() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audioCtx = new AC(); } catch (e) { return null; }
    return audioCtx;
  }

  // Blamp — low impactful thud (sine drop + noise click).
  function blamp() {
    var ctx = ensureCtx(); if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.08);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.25);

    // Noise click on top.
    var bufLen = Math.floor(ctx.sampleRate * 0.05);
    var buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(lp).connect(ng).connect(ctx.destination);
    src.start(t);
  }

  // Shuffle — quick burst of 4 high-passed noise taps in succession,
  // suggesting cards being shuffled. Used on the Texas Hold 'Em card.
  function shuffle() {
    var ctx = ensureCtx(); if (!ctx) return;
    var t0 = ctx.currentTime;
    var taps = 5;
    for (var k = 0; k < taps; k++) {
      var t = t0 + k * 0.055 + (Math.random() * 0.02);
      var bufLen = Math.floor(ctx.sampleRate * 0.06);
      var buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.7;
      var g = ctx.createGain();
      var v = 0.45 - k * 0.05;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(hp).connect(bp).connect(g).connect(ctx.destination);
      src.start(t);
    }
  }

  // Ding — bright bell, stacked sines with long exponential decay.
  function ding() {
    var ctx = ensureCtx(); if (!ctx) return;
    var t = ctx.currentTime;
    function partial(freq, gain, dur) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(gain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    partial(1320, 0.42, 0.90);  // upper bell
    partial( 880, 0.28, 1.10);  // fundamental
    partial(2640, 0.15, 0.55);  // sparkle
  }

  function injectStyles() {
    if (document.getElementById('bf-intro-styles')) return;
    var style = document.createElement('style');
    style.id = 'bf-intro-styles';
    style.textContent = [
      '@keyframes bf-intro-pulse {',
      '  0%   { opacity: 0;   transform: scale(0.92); }',
      '  60%  { opacity: 1;   transform: scale(1.04); }',
      '  100% { opacity: 1;   transform: scale(1.00); }',
      '}',
      '@keyframes bf-intro-pound {',
      '  0%   { transform: translate(0,0)         scale(1.00); }',
      '  20%  { transform: translate(-6px, 3px)   scale(1.10); }',
      '  40%  { transform: translate(5px,-4px)    scale(1.05); }',
      '  60%  { transform: translate(-4px,-3px)   scale(1.12); }',
      '  80%  { transform: translate(3px, 4px)    scale(1.07); }',
      '  100% { transform: translate(0,0)         scale(1.05); }',
      '}',
      '@keyframes bf-intro-vs-pop {',
      '  0%   { opacity: 0; transform: scale(0.40) translateY(20px); filter: blur(8px); }',
      '  55%  { opacity: 1; transform: scale(1.20) translateY(0);    filter: blur(0); }',
      '  100% { opacity: 1; transform: scale(1.00) translateY(0);    filter: blur(0); }',
      '}',
      '@keyframes bf-intro-name-slam {',
      '  0%   { opacity: 0; transform: scale(2.20); filter: blur(14px); letter-spacing: 0.6em; }',
      '  40%  { opacity: 1; transform: scale(0.96); filter: blur(0);    letter-spacing: 0.06em; }',
      '  70%  { transform: scale(1.04); }',
      '  100% { opacity: 1; transform: scale(1.00); letter-spacing: 0.06em; }',
      '}',
      '.bf-intro-root {',
      '  position: fixed; inset: 0; z-index: 99999;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(0, 0, 0, 0.78);',
      '  backdrop-filter: blur(11px) saturate(2.2) contrast(1.4) brightness(0.55);',
      '  -webkit-backdrop-filter: blur(11px) saturate(2.2) contrast(1.4) brightness(0.55);',
      '  pointer-events: none;',
      '  font-family: "Cinzel", "Times New Roman", serif;',
      '  text-align: center;',
      '  padding: 5vw;',
      '  transition: background-color ' + FADE_MS + 'ms ease,',
      '              backdrop-filter ' + FADE_MS + 'ms ease;',
      '}',
      '.bf-intro-root.is-black {',
      '  background: #000;',
      '  backdrop-filter: none;',
      '  -webkit-backdrop-filter: none;',
      '}',
      /* ── Phase 1 ───────────────────────────────────────────── */
      '.bf-intro-p1 {',
      '  font-size: clamp(38px, 8vw, 96px);',
      '  font-weight: 700;',
      '  line-height: 1.15;',
      '  letter-spacing: 0.04em;',
      '  color: #ff1a26;',
      '  text-shadow:',
      '    0 0 4px  rgba(255, 26, 38, 0.95),',
      '    0 0 16px rgba(255, 26, 38, 0.75),',
      '    0 0 48px rgba(220, 12, 22, 0.60),',
      '    0 0 96px rgba(160, 0, 0, 0.45);',
      '  max-width: 92vw;',
      '  transition: opacity ' + FADE_MS + 'ms ease;',
      '}',
      '.bf-intro-p1.is-fading { opacity: 0; }',
      '.bf-intro-phrase {',
      '  display: inline-block;',
      '  margin: 0 0.25em;',
      '  opacity: 0;',
      '  transform: scale(0.92);',
      '  will-change: opacity, transform;',
      '}',
      '.bf-intro-phrase.is-on   { animation: bf-intro-pulse 260ms cubic-bezier(0.2, 0, 0.3, 1) forwards; }',
      '.bf-intro-phrase.is-pound {',
      '  font-size: 1.25em;',
      '  animation: bf-intro-pulse 260ms cubic-bezier(0.2, 0, 0.3, 1) forwards,',
      '             bf-intro-pound 520ms ease-in-out 260ms forwards;',
      '  text-shadow:',
      '    0 0 6px  rgba(255, 40, 50, 1.00),',
      '    0 0 24px rgba(255, 26, 38, 0.95),',
      '    0 0 72px rgba(220, 12, 22, 0.80),',
      '    0 0 140px rgba(180, 0, 0, 0.55);',
      '}',
      /* ── Phase 2 (B&W VS card) ────────────────────────────── */
      '.bf-intro-p2 {',
      '  display: none;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 0.4em;',
      '  font-family: "Cinzel", "Impact", "Arial Black", sans-serif;',
      '  font-weight: 900;',
      '  color: #ffffff;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.06em;',
      '  text-shadow: none;',
      '}',
      '.bf-intro-p2.is-shown { display: flex; }',
      '.bf-intro-line {',
      '  opacity: 0;',
      '  will-change: opacity, transform, filter;',
      '}',
      '.bf-intro-line.is-you {',
      '  font-size: clamp(54px, 11vw, 130px);',
      '  letter-spacing: 0.18em;',
      '}',
      '.bf-intro-line.is-vs {',
      '  font-size: clamp(28px, 5vw, 64px);',
      '  letter-spacing: 0.35em;',
      '  text-transform: lowercase;',
      '  color: #cccccc;',
      '}',
      '.bf-intro-line.is-name {',
      '  font-size: clamp(60px, 12.5vw, 160px);',
      '  letter-spacing: 0.06em;',
      '  color: #ffffff;',
      '  text-shadow:',
      '    0 0 0 #fff,',
      '    0 4px 0 rgba(255,255,255,0.10),',
      '    0 0 36px rgba(255,255,255,0.20);',
      '}',
      '.bf-intro-line.is-you.is-on,',
      '.bf-intro-line.is-vs.is-on {',
      '  animation: bf-intro-vs-pop 420ms cubic-bezier(0.2, 1.4, 0.4, 1) forwards;',
      '}',
      '.bf-intro-line.is-name.is-on {',
      '  animation: bf-intro-name-slam 620ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards;',
      '}',
      /* ── Phase 3 (Texas Hold \'Em stakes card) ──────────────── */
      '@keyframes bf-intro-p3-in {',
      '  0%   { opacity: 0; transform: translateY(14px); }',
      '  100% { opacity: 1; transform: translateY(0); }',
      '}',
      '.bf-intro-p3 {',
      '  display: none;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 0.3em;',
      '  font-family: "Cinzel", "Times New Roman", serif;',
      '  color: #ffffff;',
      '  text-align: center;',
      '}',
      '.bf-intro-p3.is-shown {',
      '  display: flex;',
      '  animation: bf-intro-p3-in ' + P3_FADE_IN + 'ms ease forwards;',
      '}',
      '.bf-intro-p3-title {',
      '  font-size: clamp(46px, 9vw, 110px);',
      '  font-weight: 900;',
      '  letter-spacing: 0.10em;',
      '  text-transform: uppercase;',
      '  color: #ffffff;',
      '  text-shadow: 0 0 18px rgba(255,255,255,0.25);',
      '}',
      '.bf-intro-p3-label {',
      '  font-size: clamp(20px, 3.4vw, 38px);',
      '  font-weight: 500;',
      '  letter-spacing: 0.30em;',
      '  text-transform: uppercase;',
      '  color: #aaaaaa;',
      '  margin-top: 0.4em;',
      '}',
      '.bf-intro-p3-stakes {',
      '  font-size: clamp(28px, 5.2vw, 64px);',
      '  font-weight: 700;',
      '  letter-spacing: 0.04em;',
      '  color: #ffffff;',
      '}',
      '.bf-intro-p3-stakes .bf-intro-amt {',
      '  display: inline-block;',
      '  min-width: 1.6em;',
      '  padding: 0 0.25em;',
      '  color: #ffd166;',  /* chip-gold tint so the numbers pop */
      '}',
      '.bf-intro-p3-stakes .bf-intro-sep {',
      '  display: inline-block;',
      '  margin: 0 0.35em;',
      '  color: #888888;',
      '  font-weight: 400;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildOverlay(enemy) {
    var root = document.createElement('div');
    root.className = 'bf-intro-root';

    // Phase 1 container — red staggered phrases.
    var p1 = document.createElement('div');
    p1.className = 'bf-intro-p1';
    for (var i = 0; i < P1_PHRASES.length; i++) {
      var p = document.createElement('span');
      p.className = 'bf-intro-phrase';
      if (i === P1_PHRASES.length - 1) p.dataset.last = '1';
      p.textContent = P1_PHRASES[i];
      p1.appendChild(p);
    }
    root.appendChild(p1);

    // Phase 2 container — stacked B&W "You / vs / NAME" lines.
    var p2 = document.createElement('div');
    p2.className = 'bf-intro-p2';
    var you = document.createElement('div');
    you.className  = 'bf-intro-line is-you';
    you.textContent = 'You';
    var vs = document.createElement('div');
    vs.className  = 'bf-intro-line is-vs';
    vs.textContent = 'vs';
    var name = document.createElement('div');
    name.className  = 'bf-intro-line is-name';
    name.textContent = enemy;
    p2.appendChild(you);
    p2.appendChild(vs);
    p2.appendChild(name);
    root.appendChild(p2);

    // Phase 3 container — Texas Hold 'Em + stakes line.
    var p3 = document.createElement('div');
    p3.className = 'bf-intro-p3';
    var title = document.createElement('div');
    title.className  = 'bf-intro-p3-title';
    title.textContent = "Texas Hold ’Em";
    var label = document.createElement('div');
    label.className  = 'bf-intro-p3-label';
    label.textContent = 'Stakes';
    var stakes = document.createElement('div');
    stakes.className = 'bf-intro-p3-stakes';
    stakes.dataset.role = 'stakes';   // filled per call in showPhase3()
    p3.appendChild(title);
    p3.appendChild(label);
    p3.appendChild(stakes);
    root.appendChild(p3);

    return root;
  }

  function revealPhase1(root) {
    var phrases = root.querySelectorAll('.bf-intro-phrase');
    var i = 0;
    function step() {
      if (i >= phrases.length) return;
      var ph = phrases[i];
      if (ph.dataset.last) ph.classList.add('is-pound');
      else                 ph.classList.add('is-on');
      var d = P1_MS[i] || 320;
      i++;
      setTimeout(step, d);
    }
    step();
    return P1_MS.reduce(function (a, b) { return a + b; }, 0);
  }

  function fadeToBlack(root) {
    root.classList.add('is-black');
    var p1 = root.querySelector('.bf-intro-p1');
    if (p1) p1.classList.add('is-fading');
  }

  function showPhase2(root) {
    var p2 = root.querySelector('.bf-intro-p2');
    if (p2) p2.classList.add('is-shown');
    // Hide p1 entirely so it stops reserving layout space.
    var p1 = root.querySelector('.bf-intro-p1');
    if (p1) p1.style.display = 'none';
  }

  function revealPhase2(root) {
    var you  = root.querySelector('.bf-intro-line.is-you');
    var vs   = root.querySelector('.bf-intro-line.is-vs');
    var name = root.querySelector('.bf-intro-line.is-name');

    blamp();
    if (you) you.classList.add('is-on');

    setTimeout(function () {
      blamp();
      if (vs) vs.classList.add('is-on');
    }, P2_HOLD_YOU);

    setTimeout(function () {
      ding();
      if (name) name.classList.add('is-on');
    }, P2_HOLD_YOU + P2_HOLD_VS);

    return P2_HOLD_YOU + P2_HOLD_VS + P2_HOLD_NAME + P2_END_PAD;
  }

  function showPhase3(root, enemy, stakes) {
    // Hide phase 2, populate + show phase 3, fire the shuffle SFX.
    var p2 = root.querySelector('.bf-intro-p2');
    if (p2) p2.style.display = 'none';

    var stakesEl = root.querySelector('[data-role="stakes"]');
    if (stakesEl) {
      stakesEl.innerHTML = '';
      var youSpan = document.createElement('span');
      youSpan.textContent = 'You';
      var youAmt = document.createElement('span');
      youAmt.className = 'bf-intro-amt';
      youAmt.textContent = stakes.you;
      var sep = document.createElement('span');
      sep.className = 'bf-intro-sep';
      sep.textContent = 'v.';
      var enemySpan = document.createElement('span');
      enemySpan.textContent = enemy;
      var oppAmt = document.createElement('span');
      oppAmt.className = 'bf-intro-amt';
      oppAmt.textContent = stakes.opp;
      stakesEl.appendChild(youSpan);
      stakesEl.appendChild(youAmt);
      stakesEl.appendChild(sep);
      stakesEl.appendChild(enemySpan);
      stakesEl.appendChild(oppAmt);
    }

    var p3 = root.querySelector('.bf-intro-p3');
    if (p3) p3.classList.add('is-shown');
    shuffle();
  }

  function run(nextPage) {
    if (running) return;
    if (!nextPage) return;
    running = true;

    var slug   = parseSlug(nextPage);
    var enemy  = NAME_MAP[slug]   || 'BOSS';
    var stakes = STAKES_MAP[slug] || { you: 100, opp: 100 };

    injectStyles();
    var overlay = buildOverlay(enemy);
    document.body.appendChild(overlay);
    overlay.getBoundingClientRect();    // layout flush

    var p1Ms = revealPhase1(overlay) + P1_SETTLE;
    var t = 0;

    t = p1Ms;
    setTimeout(function () { fadeToBlack(overlay); }, t);

    t = p1Ms + FADE_MS;
    setTimeout(function () { showPhase2(overlay); }, t);

    t = p1Ms + FADE_MS + 40;
    setTimeout(function () { revealPhase2(overlay); }, t);

    // Phase 3 — Texas Hold 'Em stakes card, after phase 2 finishes.
    t = p1Ms + FADE_MS + 40
      + P2_HOLD_YOU + P2_HOLD_VS + P2_HOLD_NAME + P2_END_PAD;
    setTimeout(function () { showPhase3(overlay, enemy, stakes); }, t);

    // Final navigation — after phase 3 dwell.
    var totalMs = t + P3_FADE_IN + P3_HOLD + P3_END_PAD;
    setTimeout(function () {
      try { location.href = nextPage; } catch (e) { running = false; }
    }, totalMs);
  }

  window.BossIntro = { run: run };
})();
