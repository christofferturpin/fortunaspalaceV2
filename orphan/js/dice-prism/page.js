/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  DICE PRISM — triangular d4 on side-9 triangle grid; light along verts   │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          ├─ buildGrid(L=9) ──► vertices + cells          │
  │                          ├─ sizeCanvas()                                 │
  │                          ├─ bind canvas click  ──► onCellClick           │
  │                          ├─ bind sidebar btns (emit color/dir, face,     │
  │                          │   rot, drop, clear, tray)                     │
  │                          └─ render()                                     │
  │                                                                          │
  │   Grid coords:                                                           │
  │     vertex (vr, vc): vr∈[0,L], vc∈[0,vr] — 55 verts for L=9              │
  │     cell  (cr, cc):  cr∈[0,L-1], cc∈[0,2*cr] — 81 cells; even cc=△,      │
  │       odd cc=▽. △(cr,2k) verts={(cr,k),(cr+1,k),(cr+1,k+1)};             │
  │       ▽(cr,2k+1) verts={(cr,k),(cr,k+1),(cr+1,k+1)}.                     │
  │     6 vertex dirs: 0=E,1=SE,2=SW,3=W,4=NW,5=NE                           │
  │                                                                          │
  │   Beam model — light along vertices:                                     │
  │     step: at V going dir d → V' = V + DIR[d]                             │
  │     at V', enumerate cells T containing edge (V,V') (≤2 cells)           │
  │     each die-bearing T refracts; outputs from V' within T:               │
  │       cont = d           (straight on, no interaction)                   │
  │       refr = dir(V' → U) (U = T's vertex not on edge VV')                │
  │       refl = (d+3)%6     (reverse, back toward V)                        │
  │                                                                          │
  │   Prism rules (face F, beam color C, die rotation R∈{0=cont,1=refr,2=    │
  │   refl}):                                                                │
  │     F=W, C=W → split into 3 beams: cont→R, refr→G, refl→B                │
  │     F=W, C∈{R,G,B} → pass straight (cont), unchanged                     │
  │     F∈{R,G,B}, C=W → emit 1 beam in dir R, tinted to F                   │
  │     F=C (matching) → emit 1 beam in dir R, color C                       │
  │     F∈{R,G,B}, C≠F, C≠W → absorbed                                       │
  │                                                                          │
  │   Exports (window.DicePrism): { init, state }                            │
  │   External deps: none (standalone scratch page)                          │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  L=9; TRI_S=42; TRI_H=TRI_S*√3/2; SQRT3=√3
  DIRS=[[0,1],[1,1],[1,0],[0,-1],[-1,-1],[-1,0]]  // (Δvr,Δvc) per dir 0..5
  FACES=['W','R','G','B']; COLORS={W:#f6f1d8,R:#d6444c,G:#3da06b,B:#4a78c8}
  ROT_LABELS=['cont','refr','refl']  // die.rot picks output for colored faces
  state: vertices=Set("vr,vc"), cells=Map("cr,cc"→{cr,cc}), dice=Map("cr,cc"→
    {face,rot}), tray=[4 dice], held=null,
    emit={vr:4,vc:0,color:'W',dir:0}, hover=null
  vertexPx(vr,vc)→{x,y}: x=(vc-vr/2)*TRI_S+cx; y=vr*TRI_H+cy_top
  cellVerts(cr,cc)→[[vr,vc]*3]: cc even k=cc/2→△; odd k=(cc-1)/2→▽
  cellCenter(cr,cc)→{x,y}: avg of 3 vertex pixel coords
  buildGrid(L): ∀(vr,vc) add to vertices; ∀(cr,cc) add to cells
  inVertex(vr,vc)→bool; inCell(cr,cc)→bool
  cellsAtVertex(vr,vc)→[(cr,cc)]: 6 candidate cells filtered by bounds
  cellContainsVertex(cr,cc,vr,vc)→bool: check cellVerts membership
  cellsContainingEdge(V,V')→[(cr,cc)]: cellsAtVertex(V')∩cellsAtVertex(V)
  dirFromTo(vr,vc,vr2,vc2)→0..5|-1: match (Δvr,Δvc) against DIRS
  pointInTriangle(px,py,[v0,v1,v2])→bool: barycentric signs
  hitTestCell(px,py)→{cr,cc}|null: ∀cell pointInTriangle(px,py,cellPxVerts)
  traceBeams()→segs[]:
    queue=[{vr:emit.vr,vc:emit.vc,dir:emit.dir,color:emit.color,depth:0}]
    out=[]; safety=800
    while queue&&safety--:
      b=queue.shift; b.depth>80→skip
      nvr=b.vr+DIRS[b.dir][0]; nvc=b.vc+DIRS[b.dir][1]
      out.push({from:[b.vr,b.vc],to:[nvr,nvc],color:b.color,exit:!inVertex})
      !inVertex(nvr,nvc)→continue
      cellsContainingEdge(b.vr,b.vc,nvr,nvc).find(c=>dice.has)→T
      !T: queue.push(continue-straight); continue
      d=dice.get(T)
      U=cellVerts(T) - {V,V'}  // third vertex
      contDir=b.dir; refrDir=dirFromTo(nvr,nvc,U); reflDir=(b.dir+3)%6
      apply prism rules → push 0..3 new beams from (nvr,nvc) in those dirs
    return out
  Prism dispatch:
    F='W'&&C='W' → 3 beams: {dir:contDir,color:'R'},{refrDir,'G'},{reflDir,'B'}
    F='W'&&C≠'W' → {dir:contDir,color:C}
    F≠'W'&&C='W' → {dir:[contDir,refrDir,reflDir][d.rot],color:F}
    F≠'W'&&C=F   → {dir:[contDir,refrDir,reflDir][d.rot],color:C}
    F≠'W'&&C≠F&&C≠'W' → absorbed
  drawTriangleCell(cr,cc,fill,stroke): path 3 verts; fill+stroke
  render(): clear; ∀cell draw outline; emitter halo+arrow at emit vertex;
    traceBeams → draw line segs (V→V' pixel-to-pixel) colored;
    ∀die draw filled triangle face+rotation glyph; hover ring; sidebar update
  onCellClick(evt): px=evt.client-rect; hit=hitTestCell(px); !hit→ret;
    held && !dice.has(hit) → dice.set(hit,held); held=null
    !held && dice.has(hit) → held=dice.get(hit); dice.delete(hit)
    render
  onCellHover: similar; state.hover={cr,cc}
  cycleEmitColor/Dir; cycleHeldFace; rotateHeld (rot=(rot+1)%3); pickupTray;
    dropHeld→tray; clearBoard
  init(): buildGrid; bind; render
  exports: global.DicePrism={init,state}; on DOMContentLoaded→init
*/
(function (global) {
  const L = 9;
  const TRI_S = 42;
  const SQRT3 = Math.sqrt(3);
  const TRI_H = TRI_S * SQRT3 / 2;

  const DIRS = [
    [0, +1],   // 0 E
    [+1, +1],  // 1 SE
    [+1,  0],  // 2 SW
    [0, -1],   // 3 W
    [-1, -1],  // 4 NW
    [-1,  0],  // 5 NE
  ];
  const DIR_LABELS = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
  const FACES  = ['W', 'R', 'G', 'B'];
  const ROT_LABELS = ['cont', 'refr', 'refl'];
  const COLORS = {
    W: '#f6f1d8',
    R: '#d6444c',
    G: '#3da06b',
    B: '#4a78c8',
  };
  const COLOR_DIM = {
    W: 'rgba(246,241,216,0.18)',
    R: 'rgba(214,68,76,0.22)',
    G: 'rgba(61,160,107,0.22)',
    B: 'rgba(74,120,200,0.22)',
  };

  const state = {
    cells: new Map(),     // "cr,cc" → {cr,cc}
    vertices: new Set(),  // "vr,vc"
    dice: new Map(),      // "cr,cc" → {face,rot}
    held: null,           // {face,rot} | null
    tray: [
      { face: 'W', rot: 0 },
      { face: 'R', rot: 0 },
      { face: 'G', rot: 0 },
      { face: 'B', rot: 0 },
    ],
    emit: { vr: 4, vc: 0, color: 'W', dir: 0 },
    hover: null,          // {cr,cc}
    canvas: null,
    ctx: null,
    originX: 0,
    originY: 0,
  };

  const vkey = (vr, vc) => `${vr},${vc}`;
  const ckey = (cr, cc) => `${cr},${cc}`;

  function buildGrid() {
    for (let vr = 0; vr <= L; vr++) {
      for (let vc = 0; vc <= vr; vc++) state.vertices.add(vkey(vr, vc));
    }
    for (let cr = 0; cr < L; cr++) {
      for (let cc = 0; cc <= 2 * cr; cc++) state.cells.set(ckey(cr, cc), { cr, cc });
    }
  }

  function inVertex(vr, vc) { return state.vertices.has(vkey(vr, vc)); }
  function inCell(cr, cc)   { return state.cells.has(ckey(cr, cc)); }

  function cellVerts(cr, cc) {
    if (cc % 2 === 0) {
      const k = cc / 2;
      return [[cr, k], [cr + 1, k], [cr + 1, k + 1]];     // △ upward
    }
    const k = (cc - 1) / 2;
    return [[cr, k], [cr, k + 1], [cr + 1, k + 1]];        // ▽ downward
  }

  function cellsAtVertex(vr, vc) {
    const out = [];
    const candidates = [
      [vr - 1, 2 * vc],       // △ above (bottom-left of)
      [vr - 1, 2 * vc - 2],   // △ above (bottom-right of)
      [vr - 1, 2 * vc - 1],   // ▽ above (bottom apex of)
      [vr,     2 * vc],       // △ below (apex of)
      [vr,     2 * vc - 1],   // ▽ below (top-right of)
      [vr,     2 * vc + 1],   // ▽ below (top-left of)
    ];
    for (const [cr, cc] of candidates) if (inCell(cr, cc)) out.push([cr, cc]);
    return out;
  }

  function cellContainsVertex(cr, cc, vr, vc) {
    const verts = cellVerts(cr, cc);
    for (const [a, b] of verts) if (a === vr && b === vc) return true;
    return false;
  }

  function cellsContainingEdge(vr, vc, vr2, vc2) {
    return cellsAtVertex(vr2, vc2).filter(([cr, cc]) =>
      cellContainsVertex(cr, cc, vr, vc)
    );
  }

  function dirFromTo(vr, vc, vr2, vc2) {
    const dr = vr2 - vr, dc = vc2 - vc;
    for (let i = 0; i < 6; i++) {
      if (DIRS[i][0] === dr && DIRS[i][1] === dc) return i;
    }
    return -1;
  }

  function vertexPx(vr, vc) {
    return {
      x: (vc - vr / 2) * TRI_S + state.originX,
      y: vr * TRI_H + state.originY,
    };
  }

  function cellCenterPx(cr, cc) {
    const vs = cellVerts(cr, cc);
    let x = 0, y = 0;
    for (const [vr, vc] of vs) { const p = vertexPx(vr, vc); x += p.x; y += p.y; }
    return { x: x / 3, y: y / 3 };
  }

  function pointInTriangle(px, py, a, b, c) {
    const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (d === 0) return false;
    const u = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / d;
    const v = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / d;
    const w = 1 - u - v;
    return u >= 0 && v >= 0 && w >= 0;
  }

  function hitTestCell(px, py) {
    for (const { cr, cc } of state.cells.values()) {
      const vs = cellVerts(cr, cc).map(([vr, vc]) => vertexPx(vr, vc));
      if (pointInTriangle(px, py, vs[0], vs[1], vs[2])) return { cr, cc };
    }
    return null;
  }

  function sizeCanvas() {
    const c = state.canvas;
    const wrap = c.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // center the grid: grid spans width L*TRI_S, height L*TRI_H
    state.originX = (w - 0) / 2;     // top vertex at horizontal center
    state.originY = (h - L * TRI_H) / 2;
  }

  function traceBeams() {
    const out = [];
    const queue = [{
      vr: state.emit.vr, vc: state.emit.vc,
      dir: state.emit.dir, color: state.emit.color, depth: 0,
    }];
    let safety = 1000;
    while (queue.length && safety-- > 0) {
      const b = queue.shift();
      if (b.depth > 80) continue;
      const [dvr, dvc] = DIRS[b.dir];
      const nvr = b.vr + dvr, nvc = b.vc + dvc;
      const exits = !inVertex(nvr, nvc);
      out.push({ from: [b.vr, b.vc], to: [nvr, nvc], color: b.color, exit: exits });
      if (exits) continue;

      // any die on a cell adjacent to this edge?
      const adj = cellsContainingEdge(b.vr, b.vc, nvr, nvc);
      let T = null, die = null;
      for (const [cr, cc] of adj) {
        const d = state.dice.get(ckey(cr, cc));
        if (d) { T = { cr, cc }; die = d; break; }
      }
      if (!T) {
        queue.push({ vr: nvr, vc: nvc, dir: b.dir, color: b.color, depth: b.depth + 1 });
        continue;
      }

      // U = T's vertex not on edge (b.vr,b.vc)-(nvr,nvc)
      const verts = cellVerts(T.cr, T.cc);
      let U = null;
      for (const [a, c] of verts) {
        if ((a === b.vr && c === b.vc) || (a === nvr && c === nvc)) continue;
        U = [a, c]; break;
      }
      const contDir = b.dir;
      const refrDir = U ? dirFromTo(nvr, nvc, U[0], U[1]) : -1;
      const reflDir = (b.dir + 3) % 6;

      const push = (dir, color) => {
        if (dir < 0) return;
        queue.push({ vr: nvr, vc: nvc, dir, color, depth: b.depth + 1 });
      };

      const F = die.face, C = b.color;
      if (F === 'W' && C === 'W') {
        push(contDir, 'R');
        push(refrDir, 'G');
        push(reflDir, 'B');
      } else if (F === 'W') {
        push(contDir, C);
      } else if (C === 'W') {
        const choices = [contDir, refrDir, reflDir];
        push(choices[die.rot] ?? contDir, F);
      } else if (F === C) {
        const choices = [contDir, refrDir, reflDir];
        push(choices[die.rot] ?? contDir, C);
      }
      // else: absorbed
    }
    return out;
  }

  function drawTriangleFromVerts(vs, fill, stroke, lw) {
    const ctx = state.ctx;
    ctx.beginPath();
    ctx.moveTo(vs[0].x, vs[0].y);
    ctx.lineTo(vs[1].x, vs[1].y);
    ctx.lineTo(vs[2].x, vs[2].y);
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  function dirArrow(cx, cy, dir, length, color) {
    // canvas-space pixel direction for grid dir d
    const [dvr, dvc] = DIRS[dir];
    // pixel delta for moving one vertex in this dir
    const dx = (dvc - dvr / 2) * TRI_S;
    const dy = dvr * TRI_H;
    const norm = Math.hypot(dx, dy);
    const ux = dx / norm, uy = dy / norm;
    const tx = cx + ux * length, ty = cy + uy * length;
    const ctx = state.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    // arrowhead
    const ang = Math.atan2(uy, ux);
    const ah = 6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + ah * Math.cos(ang + Math.PI - 0.5), ty + ah * Math.sin(ang + Math.PI - 0.5));
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + ah * Math.cos(ang + Math.PI + 0.5), ty + ah * Math.sin(ang + Math.PI + 0.5));
    ctx.stroke();
  }

  function render() {
    const ctx = state.ctx;
    ctx.fillStyle = '#0c0a0f';
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    // cells (background outlines)
    for (const { cr, cc } of state.cells.values()) {
      const vs = cellVerts(cr, cc).map(([vr, vc]) => vertexPx(vr, vc));
      drawTriangleFromVerts(vs, '#15121a', '#2a2330', 1);
    }

    // hover ring (cell)
    if (state.hover) {
      const { cr, cc } = state.hover;
      const vs = cellVerts(cr, cc).map(([vr, vc]) => vertexPx(vr, vc));
      drawTriangleFromVerts(vs, null, state.held ? '#f6f1d8' : '#888', 2);
    }

    // beams (drawn before dice so dice sit on top, but after grid)
    const beams = traceBeams();
    for (const seg of beams) {
      const a = vertexPx(seg.from[0], seg.from[1]);
      const b = seg.exit
        ? extrapolatePx(seg.from, seg.to)
        : vertexPx(seg.to[0], seg.to[1]);
      ctx.strokeStyle = COLORS[seg.color];
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // dice
    for (const [k, d] of state.dice.entries()) {
      const [cr, cc] = k.split(',').map(Number);
      const vs = cellVerts(cr, cc).map(([vr, vc]) => vertexPx(vr, vc));
      // shrink toward center for a cleaner look
      const cx = (vs[0].x + vs[1].x + vs[2].x) / 3;
      const cy = (vs[0].y + vs[1].y + vs[2].y) / 3;
      const shrunk = vs.map(v => ({
        x: cx + (v.x - cx) * 0.78,
        y: cy + (v.y - cy) * 0.78,
      }));
      drawTriangleFromVerts(shrunk, COLORS[d.face], '#0c0a0f', 2);
      // rotation glyph at center
      ctx.fillStyle = d.face === 'W' ? '#3a3030' : '#0c0a0f';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${d.face}·${ROT_LABELS[d.rot]}`, cx, cy);
    }

    // emitter (rendered last so it's visible)
    {
      const v = vertexPx(state.emit.vr, state.emit.vc);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_DIM[state.emit.color];
      ctx.fill();
      ctx.strokeStyle = COLORS[state.emit.color];
      ctx.lineWidth = 2;
      ctx.stroke();
      dirArrow(v.x, v.y, state.emit.dir, 22, COLORS[state.emit.color]);
      // label
      ctx.fillStyle = '#d8cba6';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('EMIT', v.x - 12, v.y);
    }

    renderSidebar();
  }

  // extend last segment a bit past the grid for visual exit
  function extrapolatePx(from, to) {
    const a = vertexPx(from[0], from[1]);
    const dx = (to[1] - from[1] - (to[0] - from[0]) / 2) * TRI_S;
    const dy = (to[0] - from[0]) * TRI_H;
    return { x: a.x + dx * 1.0, y: a.y + dy * 1.0 };
  }

  function renderSidebar() {
    const heldEl = document.getElementById('dp-held');
    if (heldEl) {
      if (state.held) {
        heldEl.textContent = `face ${state.held.face} · rot ${ROT_LABELS[state.held.rot]}`;
        heldEl.style.color = COLORS[state.held.face];
      } else {
        heldEl.textContent = 'empty — pick a tray die or a placed die';
        heldEl.style.color = '#888';
      }
    }
    const ec = document.getElementById('dp-emit-color');
    if (ec) {
      ec.textContent = `EMIT: ${state.emit.color}`;
      ec.style.color = COLORS[state.emit.color];
    }
    const ed = document.getElementById('dp-emit-dir');
    if (ed) ed.textContent = `DIR: ${state.emit.dir} (${DIR_LABELS[state.emit.dir]})`;

    const trayEl = document.getElementById('dp-tray');
    if (trayEl) {
      trayEl.innerHTML = '';
      state.tray.forEach((d, i) => {
        const btn = document.createElement('button');
        btn.className = 'dp-tray-die';
        btn.style.background = COLORS[d.face];
        btn.textContent = d.face;
        btn.addEventListener('click', () => {
          if (state.held) return;
          state.held = { face: d.face, rot: d.rot };
          state.tray.splice(i, 1);
          render();
        });
        trayEl.appendChild(btn);
      });
    }
  }

  function onCellClick(evt) {
    const rect = state.canvas.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;
    const hit = hitTestCell(px, py);
    if (!hit) return;
    const k = ckey(hit.cr, hit.cc);
    if (state.held) {
      if (state.dice.has(k)) return;
      state.dice.set(k, { face: state.held.face, rot: state.held.rot });
      state.held = null;
    } else {
      if (state.dice.has(k)) {
        state.held = state.dice.get(k);
        state.dice.delete(k);
      }
    }
    render();
  }

  function onCellMove(evt) {
    const rect = state.canvas.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;
    const hit = hitTestCell(px, py);
    if (!hit) {
      if (state.hover) { state.hover = null; render(); }
      return;
    }
    if (!state.hover || state.hover.cr !== hit.cr || state.hover.cc !== hit.cc) {
      state.hover = hit;
      render();
    }
  }

  function init() {
    state.canvas = document.getElementById('dp-canvas');
    state.ctx = state.canvas.getContext('2d');
    buildGrid();
    sizeCanvas();
    window.addEventListener('resize', () => { sizeCanvas(); render(); });
    state.canvas.addEventListener('click', onCellClick);
    state.canvas.addEventListener('mousemove', onCellMove);
    state.canvas.addEventListener('mouseleave', () => { state.hover = null; render(); });

    document.getElementById('dp-btn-emit-color').addEventListener('click', () => {
      const i = FACES.indexOf(state.emit.color);
      state.emit.color = FACES[(i + 1) % FACES.length];
      render();
    });
    document.getElementById('dp-btn-emit-dir').addEventListener('click', () => {
      state.emit.dir = (state.emit.dir + 1) % 6;
      render();
    });
    document.getElementById('dp-btn-face').addEventListener('click', () => {
      if (!state.held) return;
      const i = FACES.indexOf(state.held.face);
      state.held.face = FACES[(i + 1) % FACES.length];
      render();
    });
    document.getElementById('dp-btn-rot').addEventListener('click', () => {
      if (!state.held) return;
      state.held.rot = (state.held.rot + 1) % 3;
      render();
    });
    document.getElementById('dp-btn-drop').addEventListener('click', () => {
      if (!state.held) return;
      state.tray.push(state.held);
      state.held = null;
      render();
    });
    document.getElementById('dp-btn-clear').addEventListener('click', () => {
      for (const d of state.dice.values()) state.tray.push({ face: d.face, rot: 0 });
      state.dice.clear();
      if (state.held) { state.tray.push(state.held); state.held = null; }
      render();
    });

    render();
  }

  global.DicePrism = { init, state };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
