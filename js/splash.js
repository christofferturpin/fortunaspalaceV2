/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SPLASH  —  intro page: redaction effect, cinematic transition, ad cycle │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Three independent units in this file:                                  │
  │                                                                          │
  │   ┌─ IIFE #1: Redaction overlay ──────────────────────────────────────┐  │
  │   │   getOwnedCount() ──► reads localStorage['wendys_palace_giftshop']│  │
  │   │   coverage = MAX_COVERAGE * (1 - owned/TOTAL)  (eases off as you  │  │
  │   │                                                 buy giftshop)     │  │
  │   │   for each target (.headline h1, .subhead, .body p:not(.no-censor)│  │
  │   │     redactBlock(el, cov)                                          │  │
  │   │        ├─ wrapWords(el)  ──► wraps text nodes into .word/.gap     │  │
  │   │        ├─ random runs of 2-8 words ──► .redacted class            │  │
  │   │        └─ bridges gaps between redacted neighbors                 │  │
  │   │   if first word redacted ──► .no-dropcap on first para            │  │
  │   └────────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │   ┌─ Top-level: continueToGame(e) ─────────────────────────────────────┐ │
  │   │   guarded by cinematicStarted flag                                 │ │
  │   │   sets localStorage['wendys_palace_intro_seen'] = '1'              │ │
  │   │   if no #fade-cinematic ──► location.href = '../index.html'        │ │
  │   │   else staggered class adds on #fade-cinematic:                    │ │
  │   │     1100ms show-1 → 2700ms show-2 → 4300ms show-3                  │ │
  │   │     → 5900ms show-title → 9000ms navigate to index.html            │ │
  │   │   bound to #continue-btn, .ad-cta, .ad-cta a                       │ │
  │   └────────────────────────────────────────────────────────────────────┘ │
  │                                                                          │
  │   ┌─ IIFE #2: Ad tagline rotator (#ad-tagline) ─────────────────────────┐│
  │   │   pickRandom() ──► non-repeating index into Taglines.normal         ││
  │   │   corrupt(s)   ──► 45% chars swapped with glyphs '#@%&*?!~'         ││
  │   │   setInterval 1700ms ──► flash corrupt(prev) for 90ms, then         ││
  │   │                          replace with normal[pickRandom()]          ││
  │   └─────────────────────────────────────────────────────────────────────┘│
  │                                                                          │
  │   Exports: continueToGame  (top-level function name; not on window)      │
  │   External deps: window.Taglines.normal (fallback list if absent),       │
  │                  localStorage['wendys_palace_giftshop' /                 │
  │                              'wendys_palace_intro_seen']                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  IIFE#1 (redaction): GIFTSHOP_KEY='wendys_palace_giftshop'; TOTAL=12; MAX_COVERAGE=0.82
    getOwnedCount()→int: try JSON.parse(localStorage[KEY]); parsed.owned[].len; catch→0
    owned=min(TOTAL,getOwned); reveal=owned/TOTAL; coverage=MAX*(1-reveal); coverage≤0→ret (full reveal)
    wrapWords(el): TreeWalker SHOW_TEXT; ∀textNode split /(\s+)/→spans .word|.gap; replace node w/ frag
    redactBlock(el,cov): wrapWords; words=$$('.word'); target=⌊cov*len⌋; target≤0→ret; while coveredCount<target&&safety<800{start=rnd*len; runLen=2+rnd*7; mark covered[i] for i∈[start,start+runLen)}; ∀k∈covered→words[k].add('redacted'); bridge: ∀gap between redacted neighbors→add 'redacted'
    targets=[.headline h1, .subhead, ...$$('.body p:not(.no-censor))]; ∀t→redactBlock(t,coverage)
    paras.len && first word redacted → paras[0].add('no-dropcap')
  top-level: cinematicStarted=false
    continueToGame(e): e.preventDefault?; guard(started); started=T; try localStorage['wendys_palace_intro_seen']='1'; fade=#fade-cinematic; !fade→location.href='../index.html'+ret; body.add('cinematic-active'); scrollTo(0,0); fade.add('active'); setTimeout(show-1@1100,show-2@2700,show-3@4300,show-title@5900,nav→../index.html@9000)
    bind: #continue-btn click→continueToGame; .ad-cta&link click→same
  IIFE#2 (ad rotator #ad-tagline): guard(!el); taglines=Taglines.normal||fallback; lastIdx=-1
    pickRandom()→int: do i=rnd*len while i===lastIdx&&len>1; lastIdx=i; ret i
    corrupt(s)→str: ∀c→space?keep:rnd<0.45?glyph∈'#@%&*?!~':c
    setInterval 1700ms: el.text=corrupt(taglines[lastIdx||0]); setTimeout 90ms→el.text=taglines[pickRandom]
  exports: continueToGame (top-level fn, not on window); localStorage['wendys_palace_intro_seen'] set on continue
*/

(function () {
  var GIFTSHOP_KEY = 'wendys_palace_giftshop';
  var TOTAL_GIFTSHOP_ITEMS = 12;
  var MAX_COVERAGE = 0.82;

  function getOwnedCount() {
    try {
      var raw = localStorage.getItem(GIFTSHOP_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.owned)) return parsed.owned.length;
    } catch (e) {}
    return 0;
  }

  var owned = Math.min(TOTAL_GIFTSHOP_ITEMS, getOwnedCount());
  var reveal = owned / TOTAL_GIFTSHOP_ITEMS;
  var coverage = MAX_COVERAGE * (1 - reveal);
  if (coverage <= 0) return;

  function wrapWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      if (!text || !text.replace(/\s/g, '')) return;
      var frag = document.createDocumentFragment();
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        var span = document.createElement('span');
        if (/^\s+$/.test(part)) {
          span.className = 'gap';
          span.textContent = part;
        } else {
          span.className = 'word';
          span.textContent = part;
        }
        frag.appendChild(span);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function redactBlock(el, cov) {
    wrapWords(el);
    var words = Array.prototype.slice.call(el.querySelectorAll('.word'));
    if (!words.length) return;
    var target = Math.floor(cov * words.length);
    if (target <= 0) return;
    var covered = {};
    var coveredCount = 0;
    var safety = 0;
    while (coveredCount < target && safety++ < 800) {
      var start = Math.floor(Math.random() * words.length);
      var runLen = 2 + Math.floor(Math.random() * 7);
      for (var i = start; i < start + runLen && i < words.length; i++) {
        if (!covered[i]) {
          covered[i] = 1;
          coveredCount++;
          if (coveredCount >= target) break;
        }
      }
    }
    Object.keys(covered).forEach(function (k) {
      words[+k].classList.add('redacted');
    });
    var all = Array.prototype.slice.call(el.querySelectorAll('.word, .gap'));
    for (var j = 0; j < all.length; j++) {
      if (!all[j].classList.contains('gap')) continue;
      var prev = all[j - 1];
      var next = all[j + 1];
      if (prev && next &&
          prev.classList.contains('redacted') &&
          next.classList.contains('redacted')) {
        all[j].classList.add('redacted');
      }
    }
  }

  var targets = [];
  var h1 = document.querySelector('.headline h1');
  if (h1) targets.push(h1);
  var sub = document.querySelector('.subhead');
  if (sub) targets.push(sub);
  var paras = document.querySelectorAll('.body p:not(.no-censor)');
  for (var i = 0; i < paras.length; i++) targets.push(paras[i]);
  targets.forEach(function (t) { redactBlock(t, coverage); });

  if (paras.length) {
    var firstWord = paras[0].querySelector('.word');
    if (firstWord && firstWord.classList.contains('redacted')) {
      paras[0].classList.add('no-dropcap');
    }
  }
})();

var cinematicStarted = false;
function continueToGame(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (cinematicStarted) return;
  cinematicStarted = true;
  try { localStorage.setItem('wendys_palace_intro_seen', '1'); } catch (err) {}
  var fade = document.getElementById('fade-cinematic');
  if (!fade) { location.href = '../index.html'; return; }
  document.body.classList.add('cinematic-active');
  window.scrollTo(0, 0);
  fade.classList.add('active');
  setTimeout(function () { fade.classList.add('show-1'); }, 1100);
  setTimeout(function () { fade.classList.add('show-2'); }, 2700);
  setTimeout(function () { fade.classList.add('show-3'); }, 4300);
  setTimeout(function () { fade.classList.add('show-title'); }, 5900);
  setTimeout(function () { location.href = '../index.html'; }, 9000);
}
document.getElementById('continue-btn').addEventListener('click', continueToGame);
var adCta = document.querySelector('.ad-cta');
if (adCta) adCta.addEventListener('click', continueToGame);
var adLink = document.querySelector('.ad-cta a');
if (adLink) adLink.addEventListener('click', continueToGame);

(function () {
  var el = document.getElementById('ad-tagline');
  if (!el) return;
  var taglines = (window.Taglines && window.Taglines.normal) || ['Where every dream comes true'];
  var lastIdx = -1;
  function pickRandom() {
    var i;
    do {
      i = Math.floor(Math.random() * taglines.length);
    } while (i === lastIdx && taglines.length > 1);
    lastIdx = i;
    return i;
  }
  function corrupt(s) {
    var glyphs = '#@%&*?!~';
    return s.split('').map(function (c) {
      if (c === ' ') return c;
      return Math.random() < 0.45 ? glyphs[Math.floor(Math.random() * glyphs.length)] : c;
    }).join('');
  }
  setInterval(function () {
    el.textContent = corrupt(taglines[lastIdx >= 0 ? lastIdx : 0]);
    setTimeout(function () {
      el.textContent = taglines[pickRandom()];
    }, 90);
  }, 1700);
})();
