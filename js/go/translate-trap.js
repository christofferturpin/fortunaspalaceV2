/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  GO TRANSLATE TRAP — detects browser auto-translate of the page and      │
  │                       swaps everything to Spanish synth-manual context   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Page is zh-CN. Chrome offers to translate to the browser's locale.     │
  │   Player clicks Translate. Chrome adds `translated-ltr` (or -rtl) to     │
  │   <html>. We detect via MutationObserver, then:                          │
  │     1. Add <meta name="google" content="notranslate"> to stop chain-     │
  │        translation of the Spanish back to English.                       │
  │     2. Set <html lang="es" translate="no">.                              │
  │     3. Swap every visible label / button to hand-picked Spanish. The     │
  │        rules-body gets a wholesale rewrite — but instead of Spanish      │
  │        GAME rules, it becomes the Spanish SYNTH-engine manual. Wrong     │
  │        target language, wrong document. The translator forgot both.      │
  │                                                                          │
  │   Conceptual: the language barrier doesn't vanish when you ask the       │
  │   browser to flatten it. It just becomes a different language about      │
  │   a different subject.                                                   │
  │                                                                          │
  │   Caveats: works for Chrome/Edge built-in translate. Other browsers      │
  │   stay in Chinese (no fallback button on this page).                     │
  │                                                                          │
  │   Exports: none (side-effect only).                                      │
  │   External deps: MutationObserver, document.documentElement.             │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  state: triggered=F
  SWAPS={sel:string→spanishText} hand-curated for visible labels (synth-themed)
  SPANISH_SYNTH_HTML: replacement rules-body content (Spanish synth manual)
  isTranslated()→bool: /translated-(ltr|rtl)/.test(html.className)
  applySwap(): guard triggered; triggered=T; inject notranslate meta; html.lang='es'; html[translate]='no'; title='Gonegaishimasu'; ∀(sel,txt)∈SWAPS: $(sel).text=txt + [translate=no]; rules body innerHTML = SPANISH_SYNTH_HTML
  startObserver(): isTranslated→applySwap; else new MutationObserver→on class/lang change check translated→disconnect+applySwap
  init: document.readyState==='loading'→DOMContentLoaded(startObserver); else startObserver()
*/
(function (global) {
  let triggered = false;

  // Selector → Spanish replacement text. Each entry's textContent is
  // wholesale replaced and translate="no" is set so Chrome leaves it alone.
  // The mapping shifts the page's subject matter from "Go opponent" to
  // "synth voice" — a contextual reskin, not just a literal translation.
  const SWAPS = {
    '.header-nav a':                '← Vestíbulo',
    '.coins-label':                 'Monedas',
    '#debug-reset':                 'reiniciar',
    '.go-rules summary':            'El sintetizador — cómo suena',
    // Status row labels — recontextualized as audio-engine readouts.
    '.go-status-row .go-status-cell:nth-child(1) .go-status-label':
      'Próxima voz',
    '.go-status-row .go-status-cell:nth-child(2) .go-status-label':
      'Notas tocadas (rojas/azules)',
    '.go-status-row .go-status-cell:nth-child(3) .go-status-label':
      'Deshacer restantes',
    '.go-status-row .go-status-cell:nth-child(4) .go-status-label':
      'Recuento estimado (rojas/azules)',
    // Setup panel
    '.go-setup .go-section-title':  'El mezclador',
    '.go-setup .go-label:first-of-type':
      'Voz — gira la perilla',
    '.go-knob-marks > .go-knob-mark:nth-child(1) .go-knob-mark-name':
      'Doncella',
    '.go-knob-marks > .go-knob-mark:nth-child(2) .go-knob-mark-name':
      'Consorte',
    '.go-knob-marks > .go-knob-mark:nth-child(3) .go-knob-mark-name':
      'Favorita',
    '.go-knob-marks > .go-knob-mark:nth-child(4) .go-knob-mark-name':
      'Emperatriz',
    'label[for="go-wager"]':        'Volumen',
    '#go-wager-max':                'MÁX',
    '#go-begin':                    'Onegaishimasu',     // ritual phrase stays
    // Actions panel
    '.go-actions .go-section-title': 'La caja',
    '#go-show-control':             'VER LA SEÑAL',
    '#go-pass':                     'PAUSA',
    '#go-takeback':                 'DESHACER',
    '#go-resign':                   'DETENER',
  };

  // Full replacement for the rules body — Spanish synth-engine manual,
  // shaped to match the same HTML structure (paragraphs, list, pay line)
  // so the existing CSS picks it up unchanged.
  const SPANISH_SYNTH_HTML =
    '<p>El tablero es un <strong>secuenciador de pasos</strong>. La cabeza lectora recorre las columnas de izquierda a derecha — una columna por paso.</p>' +
    '<ul>' +
    '<li>En cada paso suena un <strong>hi-hat</strong> con reverberación.</li>' +
    '<li>En las columnas <strong>0, 3 y 6</strong> (los tres tiempos fuertes del compás <strong>9/8</strong>, agrupación 3+3+3) suena un <strong>bombo</strong> grave.</li>' +
    '<li>Una voz <strong>pad</strong> ambiental por cada tapa activa en la columna sonante. Sólo las últimas <strong>10 tapas colocadas</strong> que sigan en el tablero suenan — las jugadas más antiguas se desvanecen.</li>' +
    '</ul>' +
    '<p>Las notas: <strong>columna</strong> → nota (escala pentatónica de <em>La menor</em>; cualquier combinación suena consonante). <strong>Fila</strong> → octava (arriba agudo, abajo grave).</p>' +
    '<p>El tempo empieza pausado (~80 BPM) y se acelera conforme avanza la partida.</p>' +
    '<p>La voz cambia según su rango:</p>' +
    '<ul>' +
    '<li><strong>Doncella</strong> — seno puro, suave y dócil.</li>' +
    '<li><strong>Consorte</strong> — triángulo, claro.</li>' +
    '<li><strong>Favorita</strong> — cuadrada filtrada, brillante y regia.</li>' +
    '<li><strong>Emperatriz</strong> — diente de sierra filtrada, rica e imperial.</li>' +
    '</ul>' +
    '<p class="go-rules-pay">Tu voz (tapas rojas) siempre es un par de senos cálidos.</p>';

  function isTranslated() {
    return /translated-(ltr|rtl)/.test(document.documentElement.className);
  }

  function applySwap() {
    if (triggered) return;
    triggered = true;

    // Stop Chrome from re-translating the Spanish back into the user's
    // browser locale (it would happily wreck our hand-crafted Spanish).
    if (!document.querySelector('meta[name="google"][content="notranslate"]')) {
      const meta = document.createElement('meta');
      meta.name = 'google';
      meta.content = 'notranslate';
      document.head.appendChild(meta);
    }
    document.documentElement.lang = 'es';
    document.documentElement.setAttribute('translate', 'no');
    document.title = 'Gonegaishimasu — sintetizador 9/8';

    // Static-label swaps.
    Object.keys(SWAPS).forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.textContent = SWAPS[sel];
        el.setAttribute('translate', 'no');
      }
    });

    // Status val for "Próxima voz" cell needs an initial em-dash that the
    // dynamic game code overwrites later; leave the #go-tomove span alone.

    // Rules body — wholesale rewrite to the Spanish synth manual.
    const rulesBody = document.getElementById('go-rules-body');
    if (rulesBody) {
      rulesBody.innerHTML = SPANISH_SYNTH_HTML;
      rulesBody.setAttribute('translate', 'no');
    }

    // Pay summary needs its prefix labels translated but the dynamic
    // .go-pay-cost / .go-pay-win spans preserved with current values.
    const pay = document.getElementById('go-pay-summary');
    if (pay) {
      const costEl = pay.querySelector('.go-pay-cost');
      const winEl  = pay.querySelector('.go-pay-win');
      const cost = costEl ? costEl.textContent : '';
      const win  = winEl  ? winEl.textContent  : '';
      pay.innerHTML =
        'Coste <span class="go-pay-cost">' + cost + '</span>' +
        ' · Premio <span class="go-pay-win">' + win + '</span>';
      pay.setAttribute('translate', 'no');
    }

    // Initial status line — only swap if it still holds the opening prompt.
    const st = document.getElementById('go-status');
    if (st && /选择对手/.test(st.textContent)) {
      st.textContent = 'Elige un timbre. Marca el volumen. Reproducir.';
      st.setAttribute('translate', 'no');
    }

    // Dame readout text — the "(单官 N)" wrapper becomes "(dame N)" Spanish-style.
    const estDame = document.querySelector('.go-est-dame');
    if (estDame) {
      const d = document.getElementById('go-est-d');
      const n = d ? d.textContent : '0';
      estDame.innerHTML = '(libres <span id="go-est-d">' + n + '</span>)';
      estDame.setAttribute('translate', 'no');
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
