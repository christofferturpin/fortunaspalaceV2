/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX TRANSLATE TRAP — detects browser auto-translate of the page   │
  │                            and swaps everything to Chinese in response  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Page is es-MX. Chrome offers to translate to the browser's locale.    │
  │   Player clicks Translate. Chrome adds `translated-ltr` (or -rtl) to    │
  │   <html>. We detect via MutationObserver, then:                          │
  │     1. Add <meta name="google" content="notranslate"> to stop chain-    │
  │        translation of the Chinese back to English.                      │
  │     2. Set <html lang="zh-CN" translate="no">.                           │
  │     3. Swap every visible label / button / poster to hand-picked        │
  │        Chinese (Simplified). The rules body gets a wholesale rewrite.   │
  │     4. Add `.translated-zh` class to <body> so CSS can swap the         │
  │        pseudo-element stamps (STRIKE ANYWHERE etc.).                    │
  │                                                                          │
  │   Conceptual: the language barrier doesn't vanish when you ask the     │
  │   browser to flatten it. It just becomes a different language.         │
  │                                                                          │
  │   Caveats: works for Chrome/Edge built-in translate (~80% desktop).    │
  │   Firefox + Safari use different translate mechanisms; could add       │
  │   detection for those later.                                            │
  │                                                                          │
  │   Exports: none (side-effect only).                                     │
  │   External deps: MutationObserver, document.documentElement.            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: triggered=F
  SWAPS={sel:string→chineseText} hand-curated for visible labels
  isTranslated()→bool: /translated-(ltr|rtl)/.test(html.className)
  applySwap(): guard triggered; triggered=T; inject notranslate meta; html.lang='zh-CN'; html[translate]='no'; title='彩票盒'; body.classList.add('translated-zh'); ∀(sel,txt)∈SWAPS: $(sel).text=txt + [translate=no]; rebuild .loteria-header h1 with skull spans + 彩票盒; rebuild .match-hud first-span preserving #moves-count; rebuild .scene-poster-notice ps; rebuild .mb-rules-body with full Chinese rules
  startObserver(): isTranslated→applySwap; else new MutationObserver→on class change check translated→disconnect+applySwap
  init: document.readyState==='loading'→DOMContentLoaded(startObserver); else startObserver()
*/
(function (global) {
  let triggered = false;

  const SWAPS = {
    '.header-nav a':                        '← 大厅',
    '.header-tagline':                      '— 所有人类都是非法的 —',
    '.coins-label':                         '硬币',
    '#debug-reset':                         '重置',
    '.jackpot-label':                       '头奖',
    '.bet-label':                           '下注',
    '#bet-max':                             '最大',
    '#spin-btn':                            '旋转',
    '.mb-rules summary':                    '说明 — 如何玩',
    '.scene-poster-notice .poster-header':  '官方通知',
    '.scene-poster-peel .poster-headline':  '欢迎',
    '.scene-poster-peel .poster-strike':    '没有轮到您',
  };

  function isTranslated() {
    return /translated-(ltr|rtl)/.test(document.documentElement.className);
  }

  function applySwap() {
    if (triggered) return;
    triggered = true;

    // Block re-translation of the Chinese back into English
    if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
      const meta = document.createElement('meta');
      meta.name = 'google';
      meta.content = 'notranslate';
      document.head.appendChild(meta);
    }
    document.documentElement.lang = 'zh-CN';
    document.documentElement.setAttribute('translate', 'no');
    document.title = '彩票盒';
    document.body.classList.add('translated-zh');

    // Single-text-node swaps
    Object.keys(SWAPS).forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.textContent = SWAPS[sel];
        el.setAttribute('translate', 'no');
      }
    });

    // Header H1 — rebuild with skull spans flanking the new Chinese title
    const h1 = document.querySelector('.loteria-header h1');
    if (h1) {
      h1.innerHTML =
        '<span class="header-skull header-skull-left">☠</span>' +
        ' 彩票盒 ' +
        '<span class="header-skull header-skull-right">☠</span>';
      h1.setAttribute('translate', 'no');
    }

    // Match HUD — preserve the #moves-count span inside the label
    const movesLabel = document.querySelector('.match-hud > span:first-child');
    if (movesLabel) {
      const mc = document.getElementById('moves-count');
      const count = mc ? mc.textContent : '0';
      movesLabel.innerHTML = '步数：<span id="moves-count">' + count + '</span>';
      movesLabel.setAttribute('translate', 'no');
    }

    // Notice poster body (Formulario I-589 lines)
    const noticePs = document.querySelectorAll('.scene-poster-notice p');
    if (noticePs[0]) {
      noticePs[0].innerHTML =
        '<strong>表格 I-589</strong><br>等待时间：<strong>4 年</strong>';
    }
    if (noticePs[1]) {
      noticePs[1].textContent = '与此同时，请记得对官员微笑。';
    }

    // Rules body — full Chinese rewrite
    const rulesBody = document.querySelector('.mb-rules-body');
    if (rulesBody) {
      rulesBody.innerHTML = [
        '<p>两台机器困在同一个盒子里。上面，老虎机。下面，棋盘。两者相互喂养：上面付步数，下面付硬币。</p>',
        '<h4>老虎机</h4>',
        '<p>下注（最低 $10，以十为单位递增）然后旋转。九个符号出现在三乘三的网格上：</p>',
        '<ul class="mb-rules-list">',
        '<li><strong>·</strong> 灰烬 — 什么也不做。</li>',
        '<li><strong>☼</strong> 太阳 — 常见符号。</li>',
        '<li><strong>✠</strong> 十字 — 稀有；提高你的赌注。</li>',
        '</ul>',
        '<p>如果三个或更多符号（太阳和十字混合）<strong>水平或垂直接触</strong> — 对角线不算 — 你赢得 <em>步数</em> 用于下面。大小为 <em>n</em> 的团给你 <em>n−2</em> 步。每个十字都会提高你的赌注，最高 ×1.5。</p>',
        '<h4>棋盘</h4>',
        '<p>有步数后，交换六乘六棋盘上的相邻方块。一次有效交换必须形成至少三个或更多相同颜色的方块组，<strong>水平或垂直</strong>接触。方块被烧毁，上面的方块掉下来，最后填补空缺。</p>',
        '<ul class="mb-rules-list">',
        '<li><strong>3</strong> 组 — 烧毁，不付钱。</li>',
        '<li><strong>4</strong> 组 — 付 ½ 倍赌注。</li>',
        '<li><strong>5</strong> 组 — 付 1× 赌注。</li>',
        '<li><strong>6</strong> 组 — 付 1.5×。</li>',
        '<li><strong>n</strong> 组 — 付 (n−3) ÷ 2 × 赌注。</li>',
        '</ul>',
        '<p><strong>连锁</strong> — 当方块自己掉落并形成新组时 — 每级支付较少：1, 0.6, 0.36, 0.216… 无效交换免费撤销。</p>',
        '<h4>百搭 ✪</h4>',
        '<p>如果一次交换同时形成<strong>两个或更多组</strong>，会在你移动的位置出现百搭符号。百搭可作为任何颜色用于将来的组合 — 但百搭本身不计入支付。它只是桥梁。</p>',
        '<h4>节奏</h4>',
        '<p>当你有步数时，棋盘发光，老虎机休眠。步数用完后，光线回到上面，你可以再次下注。</p>',
      ].join('');
    }
  }

  function startObserver() {
    if (isTranslated()) {
      applySwap();
      return;
    }
    const obs = new MutationObserver(() => {
      if (isTranslated()) {
        obs.disconnect();
        applySwap();
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'lang'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})(window);
