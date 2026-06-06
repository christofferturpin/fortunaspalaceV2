/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SLOTTRACK SLOTS — two 3x3 slots wired to slot-car gameplay              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ for each config ∈ {LIVES, SABOTAGE}:         │
  │                          │     render(null,cfg)                          │
  │                          │     bind #<prefix>-spin click ──► spin(cfg)   │
  │                          └─ (no per-spin cost in this iteration)         │
  │                                                                          │
  │   spin(cfg):                                                             │
  │     grid = [rollSym(cfg.symbols) × 9]                                    │
  │     render(grid, cfg) + clear+highlight win cells                        │
  │     best = detectBestMatch(grid, cfg)  — highest-tier symbol across      │
  │       8 lines (3 rows + 3 cols + 2 diagonals)                            │
  │     best ? cfg.onMatch(best) : result.text='no line'                     │
  │                                                                          │
  │   Slot configs:                                                          │
  │     LIVES:    [red, yellow, green]    → STCar.addLives({1,2,3}[sym])     │
  │     SABOTAGE: [wrench, gear, wheel]   → STCar.setGhostDebuff(.20|.40|.60)│
  │                                                                          │
  │   Exports (window.STSlot): { init, spin, CONFIGS }                       │
  │   External deps: STCar (addLives, setGhostDebuff)                        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  LINES = 8 lines of 3 indices: rows[0,1,2],[3,4,5],[6,7,8] + cols[0,3,6],[1,4,7],[2,5,8] + diag[0,4,8],[2,4,6]
  LIVES_BY = {red:1, yellow:2, green:3}; DEBUFF_BY = {wrench:0.20, gear:0.40, wheel:0.60}
  CONFIGS:
    lives:    {prefix:'st-lives',    symbols:['red','yellow','green'],   glyphs:{r:'●',y:'●',g:'●'}, onMatch:sym→STCar.addLives(LIVES_BY[sym])}
    sabotage: {prefix:'st-sabotage', symbols:['wrench','gear','wheel'], glyphs:{wrench:'🔧',gear:'⚙',wheel:'🛞'}, onMatch:sym→STCar.setGhostDebuff(DEBUFF_BY[sym])}
  rollSym(syms)→str: syms[floor(rnd·len)]
  rollGrid(syms)→str[9]
  detectBestMatch(g,cfg)→sym|null: best=-1; ∀line∈LINES if g[a]==g[b]==g[c]: tier=symbols.indexOf(g[a]); track best
  render(g,cfg): ∀i → cell=#<prefix>-cell-i; g?cell.text=glyphs[g[i]],dataset.sym=g[i]:cell.text='·',rm dataset; clear .st-cell-win
  highlightMatches(g,cfg): ∀line if all-equal → add .st-cell-win to each cell
  spin(cfg): g=rollGrid; render(g,cfg); highlightMatches(g,cfg); best=detectBestMatch; #<prefix>-result.text=cfg.onMatch(best)
  init(): ∀cfg → render(null,cfg); #<prefix>-spin.click→spin(cfg)
  exports: global.STSlot={init,spin,CONFIGS}; on DOMContentLoaded→init
*/
(function (global) {
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],   // rows
    [0,3,6],[1,4,7],[2,5,8],   // columns
    [0,4,8],[2,4,6]            // diagonals
  ];

  const LIVES_BY  = { red: 1, yellow: 2, green: 3 };
  const DEBUFF_BY = { wrench: 0.20, gear: 0.40, wheel: 0.60 };

  const CONFIGS = {
    lives: {
      prefix: 'st-lives',
      symbols: ['red', 'yellow', 'green'],
      glyphs:  { red: '●', yellow: '●', green: '●' },
      onMatch: function (sym) {
        if (!sym) return 'no line';
        if (window.STCar && typeof window.STCar.addLives === 'function') {
          window.STCar.addLives(LIVES_BY[sym]);
        }
        return '+' + LIVES_BY[sym] + ' lives  (' + sym + ')';
      }
    },
    sabotage: {
      prefix: 'st-sabotage',
      symbols: ['wrench', 'gear', 'wheel'],
      glyphs:  { wrench: '🔧', gear: '⚙', wheel: '🛞' },
      onMatch: function (sym) {
        if (!sym) return 'no line';
        if (window.STCar && typeof window.STCar.setGhostDebuff === 'function') {
          window.STCar.setGhostDebuff(DEBUFF_BY[sym]);
        }
        return 'ghost  −' + Math.round(DEBUFF_BY[sym] * 100) + '%  (' + sym + ')';
      }
    }
  };

  function $(id) { return document.getElementById(id); }

  function rollSym(symbols) {
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  function rollGrid(symbols) {
    const g = new Array(9);
    for (let i = 0; i < 9; i++) g[i] = rollSym(symbols);
    return g;
  }

  function detectBestMatch(g, cfg) {
    let bestTier = -1;
    let bestSym = null;
    for (const line of LINES) {
      if (g[line[0]] === g[line[1]] && g[line[1]] === g[line[2]]) {
        const tier = cfg.symbols.indexOf(g[line[0]]);
        if (tier > bestTier) { bestTier = tier; bestSym = g[line[0]]; }
      }
    }
    return bestSym;
  }

  function clearHighlight(cfg) {
    for (let i = 0; i < 9; i++) {
      const cell = $(cfg.prefix + '-cell-' + i);
      if (cell) cell.classList.remove('st-cell-win');
    }
  }

  function highlightMatches(g, cfg) {
    for (const line of LINES) {
      if (g[line[0]] === g[line[1]] && g[line[1]] === g[line[2]]) {
        for (const i of line) {
          const cell = $(cfg.prefix + '-cell-' + i);
          if (cell) cell.classList.add('st-cell-win');
        }
      }
    }
  }

  function render(g, cfg) {
    clearHighlight(cfg);
    for (let i = 0; i < 9; i++) {
      const cell = $(cfg.prefix + '-cell-' + i);
      if (!cell) continue;
      if (g) {
        cell.textContent = cfg.glyphs[g[i]] || '?';
        cell.setAttribute('data-sym', g[i]);
      } else {
        cell.textContent = '·';
        cell.removeAttribute('data-sym');
      }
    }
  }

  function spin(cfg) {
    const g = rollGrid(cfg.symbols);
    render(g, cfg);
    highlightMatches(g, cfg);
    const best = detectBestMatch(g, cfg);
    const result = $(cfg.prefix + '-result');
    if (result) result.textContent = cfg.onMatch(best);
    return best;
  }

  function spinAll() {
    return {
      lives:    spin(CONFIGS.lives),
      sabotage: spin(CONFIGS.sabotage)
    };
  }

  function init() {
    for (const key of Object.keys(CONFIGS)) {
      render(null, CONFIGS[key]);
    }
  }

  global.STSlot = { init: init, spin: spin, spinAll: spinAll, CONFIGS: CONFIGS };
  document.addEventListener('DOMContentLoaded', init);
})(window);
