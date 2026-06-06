/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SLOTTRACK TRACK — race-track-style closed loop, smooth cubic curves     │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ bind #st-regen ──► generate()                │
  │                          └─ generate() ──► writes d=… on #st-track-path  │
  │                                                                          │
  │   generate()                                                             │
  │     │                                                                    │
  │     ├─ pickCount() in [MIN_CURVES..MAX_CURVES]   (# corners = curves)    │
  │     ├─ buildPoints(n) ─► n waypoints, multi-freq sin radius + per-point  │
  │     │     noise (two harmonic lobes give ins-and-outs; jitter adds bits) │
  │     ├─ buildPath(pts) ─► Catmull-Rom → cubic Béziers, closed with Z      │
  │     │     (C1 continuity at every waypoint → smooth race-track corners)  │
  │     └─ renderFinishLine() ─► perpendicular bar at s=0 (start/finish)     │
  │                                                                          │
  │   Exports (window.STTrack): { init, generate, onGenerate, MIN_CURVES }   │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  W=1300,H=500,PAD=40; CX=W/2,CY=H/2; SAFE=1.8; RX=(W/2-PAD)/SAFE, RY=(H/2-PAD)/SAFE
  MIN_CURVES=8, MAX_CURVES=14; ANG_JIT=0.35, NOISE_JIT=0.08, TENSION=1.0; FIT_MARGIN=0.94
  pickCount()→int: MIN_CURVES + floor(rnd*(MAX_CURVES-MIN_CURVES+1))
  buildPoints(n)→{x,y}[n]: pick freq1∈{2,3}, freq2∈{3,4,5}, amp1∈[0.20,0.35], amp2∈[0.08,0.18], phase1/2=rnd·2π; step=2π/n; ∀i: a=i·step+(rnd-0.5)·ANG_JIT·step; r=1 + amp1·sin(a·freq1+phase1) + amp2·sin(a·freq2+phase2) + (rnd-0.5)·2·NOISE_JIT; {x:CX+cos(a)·RX·r, y:CY+sin(a)·RY·r}
  p(i,pts)→pt: pts[((i%n)+n)%n]    // wrap-around indexer for closed ring
  buildPath(pts)→str: d=`M x0 y0`; ∀i∈0..n-1: p0=p(i-1); p1=p(i); p2=p(i+1); p3=p(i+2); c1=p1+(p2-p0)/6*T; c2=p2-(p3-p1)/6*T; d+=` C c1 c2 p2`; d+=' Z'
  listeners=[]; onGenerate(fn): listeners.push(fn)
  fitToBounds(pts): maxDX=max|p.x-CX|; maxDY=max|p.y-CY|; s=min(halfW·FIT_MARGIN/maxDX, halfH·FIT_MARGIN/maxDY, 1); if s<1 → uniform scale all pts toward (CX,CY)
  renderFinishLine(): p0=path.getPointAtLength(0); p1=path.getPointAtLength(2); perp=⊥(p1-p0); set #st-finish-bg / #st-finish-fg line endpoints to p0 ± perp·L (L=22)
  generate(): n=pickCount; pts=buildPoints(n); fitToBounds(pts); d=buildPath(pts); #st-track-path.setAttr('d',d); renderFinishLine(); #st-track-info.text=`${n} corners (closed loop)`; ∀fn∈listeners → fn()
  init(): #st-regen.click→generate; generate()
  exports: global.STTrack={init,generate,onGenerate,MIN_CURVES}; on DOMContentLoaded→init
*/
(function (global) {
  const W = 1300;
  const H = 500;
  const PAD = 40;
  const CX = W / 2;
  const CY = H / 2;
  const SAFE = 1.8;
  const RX = (W / 2 - PAD) / SAFE;
  const RY = (H / 2 - PAD) / SAFE;
  const MIN_CURVES = 8;
  const MAX_CURVES = 14;
  const ANG_JIT = 0.35;
  const NOISE_JIT = 0.08;
  const TENSION = 1.0;
  const FIT_MARGIN = 0.94;

  const listeners = [];

  function $(id) { return document.getElementById(id); }

  function onGenerate(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function pickCount() {
    return MIN_CURVES + Math.floor(Math.random() * (MAX_CURVES - MIN_CURVES + 1));
  }

  function buildPoints(n) {
    const pts = new Array(n);
    const step = (Math.PI * 2) / n;
    const freq1 = 2 + Math.floor(Math.random() * 2);   // 2 or 3
    const freq2 = 3 + Math.floor(Math.random() * 3);   // 3, 4 or 5
    const amp1 = 0.20 + Math.random() * 0.15;
    const amp2 = 0.08 + Math.random() * 0.10;
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = i * step + (Math.random() - 0.5) * ANG_JIT * step;
      const r = 1
        + amp1 * Math.sin(a * freq1 + phase1)
        + amp2 * Math.sin(a * freq2 + phase2)
        + (Math.random() - 0.5) * 2 * NOISE_JIT;
      pts[i] = { x: CX + Math.cos(a) * RX * r, y: CY + Math.sin(a) * RY * r };
    }
    return pts;
  }

  function buildPath(pts) {
    const n = pts.length;
    const wrap = (i) => pts[((i % n) + n) % n];
    let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (let i = 0; i < n; i++) {
      const p0 = wrap(i - 1);
      const p1 = wrap(i);
      const p2 = wrap(i + 1);
      const p3 = wrap(i + 2);
      const c1x = p1.x + (p2.x - p0.x) / 6 * TENSION;
      const c1y = p1.y + (p2.y - p0.y) / 6 * TENSION;
      const c2x = p2.x - (p3.x - p1.x) / 6 * TENSION;
      const c2y = p2.y - (p3.y - p1.y) / 6 * TENSION;
      d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
           ' '  + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
           ' '  + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    d += ' Z';
    return d;
  }

  function fitToBounds(pts) {
    const halfW = W / 2 - PAD;
    const halfH = H / 2 - PAD;
    let maxDX = 0, maxDY = 0;
    for (const p of pts) {
      const dx = Math.abs(p.x - CX);
      const dy = Math.abs(p.y - CY);
      if (dx > maxDX) maxDX = dx;
      if (dy > maxDY) maxDY = dy;
    }
    const sx = (halfW * FIT_MARGIN) / Math.max(maxDX, 1);
    const sy = (halfH * FIT_MARGIN) / Math.max(maxDY, 1);
    const s = Math.min(sx, sy, 1);
    if (s < 1) {
      for (const p of pts) {
        p.x = CX + (p.x - CX) * s;
        p.y = CY + (p.y - CY) * s;
      }
    }
  }

  function renderFinishLine() {
    const path = $('st-track-path');
    if (!path) return;
    const len = path.getTotalLength();
    if (!(len > 0)) return;
    const p0 = path.getPointAtLength(0);
    const p1 = path.getPointAtLength(Math.min(2, len));
    const tx = p1.x - p0.x;
    const ty = p1.y - p0.y;
    const m  = Math.hypot(tx, ty) || 1;
    // Perpendicular to tangent, both directions
    const nx = -ty / m;
    const ny =  tx / m;
    const L = 30; // half-length of finish line (so total bar ~60 px)
    const x1 = (p0.x + nx * L).toFixed(1);
    const y1 = (p0.y + ny * L).toFixed(1);
    const x2 = (p0.x - nx * L).toFixed(1);
    const y2 = (p0.y - ny * L).toFixed(1);
    const bg = $('st-finish-bg');
    const fg = $('st-finish-fg');
    if (bg) {
      bg.setAttribute('x1', x1); bg.setAttribute('y1', y1);
      bg.setAttribute('x2', x2); bg.setAttribute('y2', y2);
    }
    if (fg) {
      fg.setAttribute('x1', x1); fg.setAttribute('y1', y1);
      fg.setAttribute('x2', x2); fg.setAttribute('y2', y2);
    }
  }

  function generate() {
    const n = pickCount();
    const pts = buildPoints(n);
    fitToBounds(pts);
    const d = buildPath(pts);
    const path = $('st-track-path');
    if (path) path.setAttribute('d', d);
    renderFinishLine();
    const info = $('st-track-info');
    if (info) info.textContent = n + ' corners (closed loop)';
    for (const fn of listeners) {
      try { fn(); } catch (e) {}
    }
  }

  function init() {
    const btn = $('st-regen');
    if (btn) btn.addEventListener('click', generate);
    generate();
  }

  global.STTrack = { init: init, generate: generate, onGenerate: onGenerate, MIN_CURVES: MIN_CURVES };
  document.addEventListener('DOMContentLoaded', init);
})(window);
