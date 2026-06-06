/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  RAID / BUILDING GENERATOR — randomized school floor plan                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   Building.generate(w, h) ──► state                                      │
  │                  │                                                       │
  │                  ├─ pick layoutType ∈ {H, V, T}                          │
  │                  │     H : single horizontal corridor row                │
  │                  │     V : single vertical corridor column               │
  │                  │     T : both, intersecting at one junction cell       │
  │                  ├─ build all cells (halls along spine, rooms elsewhere) │
  │                  ├─ buildAdjacencies (hall↔hall, hall↔room always;       │
  │                  │   room↔room interior doors added only as needed to    │
  │                  │   keep every room reachable from the corridor)        │
  │                  ├─ buildRoomAdj (real-room-only, via shared hall cell   │
  │                  │   or grid-adjacent hall cells, or direct interior)    │
  │                  └─ pickExits: spine ends + perimeter rooms              │
  │                                                                          │
  │   Building.draw(ctx, state) ──► paints floor plan                        │
  │                  ├─ exits, floors, walls (per cell w/ door gaps),        │
  │                  │   doorway floor-bridges, exit slot punch-throughs,    │
  │                  │   labels                                              │
  │                                                                          │
  │   Exports (window.Building): { generate, draw, randInRoom, realRooms,    │
  │     isRoom }                                                             │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  GRID_COLS=4; GRID_ROWS=4; CELL_W=220; CELL_H=170; OX=40; OY=40
  ROOM_INSET=22; HALL_THICK=50; DOORWAY_W=34; WALL_W=2
  layoutType: 'H'|'V'|'T' (rolled per generate); spineRow/Col: -1 or 0..GRID-1
  cell (hall): {id,kind:'hall',gx,gy,rect,centroid,onRow:bool,onCol:bool}
  cell (room): {id,kind:'room',gx,gy,rect,centroid} (sim assigns r.name)
  exit: {id,roomId,dir,rect,anchor}
  generate(w,h):
    roll layoutType; assign spineRow/Col;
    ∀grid cell → hall (if on spine) w/ shape-appropriate rect, else room w/ inset rect;
    buildAdjacencies; ensureRoomConnectivity; buildRoomAdj; pickExits
  hallRect(gx,gy,onRow,onCol):
    onRow && onCol → full cell (junction)
    onRow only → full-width strip at vertical center
    onCol only → full-height strip at horizontal center
  buildAdjacencies(cells,cellByPos):
    ∀grid-adj pair (E or S direction) add edge if hall present on either side
  ensureRoomConnectivity(cells,adj,cellByPos):
    BFS reached from halls; ∀unreached room → BFS shortest path to reached cell, add interior door edges along
  buildRoomAdj(cells,adj):
    A roomAdj B iff (A and B share a hall) OR (their hall cells grid-adj) OR direct interior door
  pickExits(cells,bounds,spineRow,spineCol):
    spine-end hall cells get exits W/E (horizontal spine) and/or N/S (vertical spine);
    plus 1-3 perimeter rooms from any side; ensures ≥3
  randInRoom(r,pad=18)→{x,y}: rnd inside rect
  draw(ctx,b):
    bg → exits → hall floors (per cell) → room floors → walls (per cell w/ door gaps) →
    interior door punches (paint floor color in gap between rooms) →
    hall-doorway punches (paint hall color between room and hall) →
    exit slot punches → labels + arrows
  drawCellWalls(c,b,cellMap): ∀side {if hall↔hall in adj skip; else stroke wall w/ door gap centered if adj or exit on side}
  exports: global.Building={generate,draw,randInRoom,realRooms,isRoom}
*/
(function (global) {
  const GRID_COLS = 4;
  const GRID_ROWS = 4;
  const CELL_W = 220;
  const CELL_H = 170;
  const OX = 40;
  const OY = 40;
  const ROOM_INSET = 22;
  const HALL_THICK = 50;
  const DOORWAY_W = 34;
  const WALL_W = 2;

  const COLOR = {
    floor:    '#1a1012',
    wall:     '#4a3a2c',
    hall:     '#1f1316',
    exit:     '#2a0a0c',
    exitTrim: '#8a1020',
    label:    '#8a7a60',
    arrow:    '#b8001f'
  };

  const DIRS = [
    { name: 'N', dx:  0, dy: -1 },
    { name: 'E', dx:  1, dy:  0 },
    { name: 'S', dx:  0, dy:  1 },
    { name: 'W', dx: -1, dy:  0 }
  ];

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function cellKey(gx, gy) { return gx + ',' + gy; }

  function rollLayout() {
    const r = Math.random();
    if (r < 0.40) return 'H';
    if (r < 0.80) return 'V';
    return 'T';
  }

  function generate(w, h) {
    const bounds = { w, h };
    const layoutType = rollLayout();
    let spineRow = -1, spineCol = -1;
    if (layoutType === 'H' || layoutType === 'T') {
      spineRow = 1 + rnd(GRID_ROWS - 2);
    }
    if (layoutType === 'V' || layoutType === 'T') {
      spineCol = 1 + rnd(GRID_COLS - 2);
    }

    const cells = [];
    const cellByPos = new Map();
    let id = 0;
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cx = OX + gx * CELL_W;
        const cy = OY + gy * CELL_H;
        const onRow = (spineRow >= 0 && gy === spineRow);
        const onCol = (spineCol >= 0 && gx === spineCol);
        let cell;
        if (onRow || onCol) {
          cell = {
            id: id++, kind: 'hall', gx, gy,
            rect: hallRect(cx, cy, onRow, onCol),
            centroid: { x: cx + CELL_W / 2, y: cy + CELL_H / 2 },
            onRow, onCol
          };
        } else {
          cell = {
            id: id++, kind: 'room', gx, gy,
            rect: {
              x: cx + ROOM_INSET, y: cy + ROOM_INSET,
              w: CELL_W - 2 * ROOM_INSET, h: CELL_H - 2 * ROOM_INSET
            },
            centroid: { x: cx + CELL_W / 2, y: cy + CELL_H / 2 }
          };
        }
        cells.push(cell);
        cellByPos.set(cellKey(gx, gy), cell);
      }
    }

    const adj = buildAdjacencies(cells, cellByPos);
    ensureRoomConnectivity(cells, adj, cellByPos);
    const roomAdj = buildRoomAdj(cells, adj);
    const exits = pickExits(cells, bounds, spineRow, spineCol);

    return { rooms: cells, exits, adj, roomAdj, layoutType, spineRow, spineCol, bounds };
  }

  function hallRect(cx, cy, onRow, onCol) {
    if (onRow && onCol) {
      return { x: cx, y: cy, w: CELL_W, h: CELL_H };
    }
    if (onRow) {
      return { x: cx, y: cy + (CELL_H - HALL_THICK) / 2, w: CELL_W, h: HALL_THICK };
    }
    return { x: cx + (CELL_W - HALL_THICK) / 2, y: cy, w: HALL_THICK, h: CELL_H };
  }

  function buildAdjacencies(cells, cellByPos) {
    const adj = new Map();
    for (const c of cells) adj.set(c.id, new Set());
    function add(a, b) {
      adj.get(a.id).add(b.id);
      adj.get(b.id).add(a.id);
    }
    for (const c of cells) {
      for (const d of DIRS) {
        if (d.name !== 'E' && d.name !== 'S') continue;
        const nb = cellByPos.get(cellKey(c.gx + d.dx, c.gy + d.dy));
        if (!nb) continue;
        if (c.kind === 'hall' || nb.kind === 'hall') {
          add(c, nb);
        }
      }
    }
    return adj;
  }

  function ensureRoomConnectivity(cells, adj, cellByPos) {
    // Find all cells reachable from any hall
    const reached = new Set();
    const seedQ = [];
    for (const c of cells) {
      if (c.kind === 'hall') { reached.add(c.id); seedQ.push(c.id); }
    }
    let head = 0;
    while (head < seedQ.length) {
      const cur = seedQ[head++];
      for (const n of adj.get(cur)) {
        if (!reached.has(n)) { reached.add(n); seedQ.push(n); }
      }
    }

    // For each unreached room, BFS over grid cells to find nearest reached cell.
    // Add interior-door edges along the path.
    const unreached = cells.filter(c => c.kind === 'room' && !reached.has(c.id));
    for (const r of unreached) {
      if (reached.has(r.id)) continue;
      const visited = new Set([r.id]);
      const parent = new Map();
      const queue = [r];
      let h2 = 0;
      let target = null;
      while (h2 < queue.length) {
        const cur = queue[h2++];
        if (cur.id !== r.id && reached.has(cur.id)) { target = cur; break; }
        for (const d of DIRS) {
          const nb = cellByPos.get(cellKey(cur.gx + d.dx, cur.gy + d.dy));
          if (!nb || visited.has(nb.id)) continue;
          visited.add(nb.id);
          parent.set(nb.id, cur.id);
          queue.push(nb);
        }
      }
      if (target) {
        let cur = target.id;
        while (parent.has(cur)) {
          const prev = parent.get(cur);
          adj.get(cur).add(prev);
          adj.get(prev).add(cur);
          reached.add(cur);
          reached.add(prev);
          cur = prev;
        }
      }
    }
  }

  function buildRoomAdj(cells, adj) {
    const realRooms = cells.filter(c => c.kind === 'room');
    const roomAdj = new Map();
    for (const r of realRooms) roomAdj.set(r.id, new Set());

    const roomToHalls = new Map();
    for (const r of realRooms) {
      const halls = [];
      for (const n of adj.get(r.id)) {
        const nb = cells.find(c => c.id === n);
        if (nb && nb.kind === 'hall') halls.push(nb);
      }
      roomToHalls.set(r.id, halls);
    }

    for (let i = 0; i < realRooms.length; i++) {
      for (let j = i + 1; j < realRooms.length; j++) {
        const A = realRooms[i];
        const B = realRooms[j];
        let neighborly = false;
        if (adj.get(A.id).has(B.id)) neighborly = true;
        if (!neighborly) {
          const hallsA = roomToHalls.get(A.id);
          const hallsB = roomToHalls.get(B.id);
          outer:
          for (const hA of hallsA) {
            for (const hB of hallsB) {
              if (hA.id === hB.id) { neighborly = true; break outer; }
              const dx = Math.abs(hA.gx - hB.gx);
              const dy = Math.abs(hA.gy - hB.gy);
              if (dx + dy === 1) { neighborly = true; break outer; }
            }
          }
        }
        if (neighborly) {
          roomAdj.get(A.id).add(B.id);
          roomAdj.get(B.id).add(A.id);
        }
      }
    }
    return roomAdj;
  }

  function pickExits(cells, bounds, spineRow, spineCol) {
    const exits = [];
    let id = 0;
    // Horizontal spine ends
    if (spineRow >= 0) {
      const halls = cells.filter(c => c.kind === 'hall' && c.gy === spineRow)
        .sort((a, b) => a.gx - b.gx);
      if (halls.length) {
        const west = halls[0];
        if (west.gx === 0) exits.push(buildExit(id++, west, 'W', bounds));
        const east = halls[halls.length - 1];
        if (east.gx === GRID_COLS - 1 && east.id !== west.id) {
          exits.push(buildExit(id++, east, 'E', bounds));
        }
      }
    }
    // Vertical spine ends
    if (spineCol >= 0) {
      const halls = cells.filter(c => c.kind === 'hall' && c.gx === spineCol)
        .sort((a, b) => a.gy - b.gy);
      if (halls.length) {
        const north = halls[0];
        if (north.gy === 0) exits.push(buildExit(id++, north, 'N', bounds));
        const south = halls[halls.length - 1];
        if (south.gy === GRID_ROWS - 1 && south.id !== north.id) {
          exits.push(buildExit(id++, south, 'S', bounds));
        }
      }
    }
    // Perimeter rooms (any side)
    const candidates = [];
    for (const c of cells) {
      if (c.kind !== 'room') continue;
      if (c.gy === 0) candidates.push({ cell: c, dir: 'N' });
      if (c.gy === GRID_ROWS - 1) candidates.push({ cell: c, dir: 'S' });
      if (c.gx === 0) candidates.push({ cell: c, dir: 'W' });
      if (c.gx === GRID_COLS - 1) candidates.push({ cell: c, dir: 'E' });
    }
    shuffle(candidates);
    for (const cand of candidates) {
      if (exits.length >= 5) break;
      if (exits.some(e => e.roomId === cand.cell.id)) continue;
      exits.push(buildExit(id++, cand.cell, cand.dir, bounds));
      if (exits.length >= 3 && Math.random() < 0.40) break;
    }
    let i = 0;
    while (exits.length < 3 && i < candidates.length) {
      const cand = candidates[i++];
      if (exits.some(e => e.roomId === cand.cell.id)) continue;
      exits.push(buildExit(id++, cand.cell, cand.dir, bounds));
    }
    return exits;
  }

  function buildExit(id, cell, dir, bounds) {
    let rect, anchor;
    const cx = cell.centroid.x;
    const cy = cell.centroid.y;
    if (dir === 'N') {
      rect = { x: cx - HALL_THICK / 2, y: 0, w: HALL_THICK, h: cell.rect.y };
      anchor = { x: cx, y: 4 };
    } else if (dir === 'S') {
      const ytop = cell.rect.y + cell.rect.h;
      rect = { x: cx - HALL_THICK / 2, y: ytop, w: HALL_THICK, h: bounds.h - ytop };
      anchor = { x: cx, y: bounds.h - 4 };
    } else if (dir === 'W') {
      rect = { x: 0, y: cy - HALL_THICK / 2, w: cell.rect.x, h: HALL_THICK };
      anchor = { x: 4, y: cy };
    } else {
      const xleft = cell.rect.x + cell.rect.w;
      rect = { x: xleft, y: cy - HALL_THICK / 2, w: bounds.w - xleft, h: HALL_THICK };
      anchor = { x: bounds.w - 4, y: cy };
    }
    return { id, roomId: cell.id, dir, rect, anchor };
  }

  function randInRoom(r, pad) {
    if (pad == null) pad = 18;
    const px = Math.max(2, Math.min(pad, r.rect.w / 2 - 2));
    const py = Math.max(2, Math.min(pad, r.rect.h / 2 - 2));
    return {
      x: r.rect.x + px + Math.random() * Math.max(1, r.rect.w - 2 * px),
      y: r.rect.y + py + Math.random() * Math.max(1, r.rect.h - 2 * py)
    };
  }
  function realRoomsOf(b) { return b.rooms.filter(r => r.kind === 'room'); }
  function isRoom(b, id) {
    const r = b.rooms.find(rm => rm.id === id);
    return r ? r.kind === 'room' : false;
  }

  // --- drawing ----------------------------------------------------------

  function draw(ctx, b) {
    ctx.save();
    ctx.fillStyle = '#050203';
    ctx.fillRect(0, 0, b.bounds.w, b.bounds.h);

    // 1. Exit corridors (under building).
    for (const e of b.exits) {
      ctx.fillStyle = COLOR.exit;
      ctx.fillRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
      ctx.strokeStyle = COLOR.exitTrim;
      ctx.lineWidth = 1;
      ctx.strokeRect(e.rect.x + 0.5, e.rect.y + 0.5, e.rect.w - 1, e.rect.h - 1);
    }

    // 2. Hall floors.
    for (const c of b.rooms) {
      if (c.kind !== 'hall') continue;
      ctx.fillStyle = COLOR.hall;
      ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    }

    // 3. Room floors.
    for (const c of b.rooms) {
      if (c.kind !== 'room') continue;
      ctx.fillStyle = COLOR.floor;
      ctx.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    }

    // 4. Walls (per cell, with door gaps).
    const cellMap = new Map();
    for (const c of b.rooms) cellMap.set(cellKey(c.gx, c.gy), c);
    ctx.strokeStyle = COLOR.wall;
    ctx.lineWidth = WALL_W;
    for (const c of b.rooms) drawCellWalls(ctx, c, b, cellMap);

    // 5. Doorway floor bridges between room and hall (paint hall floor color
    //    in the gap between a room's rect and the corridor's rect, doorway-wide).
    for (const r of b.rooms) {
      if (r.kind !== 'room') continue;
      for (const n of b.adj.get(r.id)) {
        const nb = b.rooms.find(c => c.id === n);
        if (!nb || nb.kind !== 'hall') continue;
        punchHallDoor(ctx, r, nb);
      }
    }

    // 6. Interior door bridges between rooms (paint floor color in their gap).
    const seen = new Set();
    for (const r of b.rooms) {
      if (r.kind !== 'room') continue;
      for (const n of b.adj.get(r.id)) {
        if (n < r.id) continue;
        const nb = b.rooms.find(c => c.id === n);
        if (!nb || nb.kind !== 'room') continue;
        const key = r.id + ',' + nb.id;
        if (seen.has(key)) continue;
        seen.add(key);
        punchInteriorDoor(ctx, r, nb);
      }
    }

    // 7. Exit slot punch-throughs.
    for (const e of b.exits) {
      const cell = b.rooms.find(c => c.id === e.roomId);
      if (!cell) continue;
      punchExitSlot(ctx, cell, e);
    }

    // 8. Exit arrows + labels.
    ctx.font = 'bold 14px "Special Elite", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < b.exits.length; i++) {
      const e = b.exits[i];
      const g = e.dir === 'N' ? '▲' : e.dir === 'S' ? '▼' : e.dir === 'W' ? '◀' : '▶';
      ctx.fillStyle = COLOR.arrow;
      ctx.fillText(g, e.anchor.x, e.anchor.y);
      let lx = e.anchor.x, ly = e.anchor.y;
      if (e.dir === 'N') ly += 14;
      else if (e.dir === 'S') ly -= 14;
      else if (e.dir === 'W') lx += 14;
      else lx -= 14;
      ctx.fillStyle = COLOR.label;
      ctx.font = '11px "Special Elite", monospace';
      ctx.fillText('E' + (i + 1), lx, ly);
      ctx.font = 'bold 14px "Special Elite", monospace';
    }

    // 9. Real room labels.
    ctx.fillStyle = COLOR.label;
    ctx.font = '10.5px "Special Elite", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const r of b.rooms) {
      if (r.kind !== 'room') continue;
      const lbl = r.name ? r.name : ('R' + r.id);
      ctx.fillText(lbl, r.rect.x + 6, r.rect.y + 5);
    }

    ctx.restore();
  }

  function drawCellWalls(ctx, c, b, cellMap) {
    for (const d of DIRS) {
      const nb = cellMap.get(cellKey(c.gx + d.dx, c.gy + d.dy));
      const isAdj = nb && b.adj.get(c.id).has(nb.id);
      // continuous corridor — both halls and adjacent → no wall
      if (c.kind === 'hall' && nb && nb.kind === 'hall' && isAdj) continue;

      // wall segment endpoints
      const rect = c.rect;
      let x1, y1, x2, y2, isHoriz;
      if (d.name === 'N') {
        x1 = rect.x; y1 = rect.y; x2 = rect.x + rect.w; y2 = rect.y; isHoriz = true;
      } else if (d.name === 'S') {
        x1 = rect.x; y1 = rect.y + rect.h; x2 = rect.x + rect.w; y2 = rect.y + rect.h; isHoriz = true;
      } else if (d.name === 'W') {
        x1 = rect.x; y1 = rect.y; x2 = rect.x; y2 = rect.y + rect.h; isHoriz = false;
      } else {
        x1 = rect.x + rect.w; y1 = rect.y; x2 = rect.x + rect.w; y2 = rect.y + rect.h; isHoriz = false;
      }

      let doorAt = null;
      let doorWidth = 0;
      const exit = b.exits.find(e => e.roomId === c.id && e.dir === d.name);
      if (exit) {
        doorWidth = HALL_THICK;
        doorAt = isHoriz ? c.centroid.x : c.centroid.y;
      } else if (nb && isAdj) {
        doorWidth = DOORWAY_W;
        doorAt = isHoriz ? c.centroid.x : c.centroid.y;
      }
      strokeSide(ctx, x1, y1, x2, y2, doorAt, doorWidth, isHoriz);
    }
  }

  function strokeSide(ctx, x1, y1, x2, y2, doorAt, doorWidth, isHoriz) {
    if (doorAt == null || doorWidth <= 0) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return;
    }
    const half = doorWidth / 2;
    if (isHoriz) {
      const xStart = Math.min(x1, x2);
      const xEnd = Math.max(x1, x2);
      const dStart = doorAt - half;
      const dEnd = doorAt + half;
      if (dStart > xStart) {
        ctx.beginPath();
        ctx.moveTo(xStart, y1); ctx.lineTo(Math.min(dStart, xEnd), y1); ctx.stroke();
      }
      if (xEnd > dEnd) {
        ctx.beginPath();
        ctx.moveTo(Math.max(dEnd, xStart), y1); ctx.lineTo(xEnd, y1); ctx.stroke();
      }
    } else {
      const yStart = Math.min(y1, y2);
      const yEnd = Math.max(y1, y2);
      const dStart = doorAt - half;
      const dEnd = doorAt + half;
      if (dStart > yStart) {
        ctx.beginPath();
        ctx.moveTo(x1, yStart); ctx.lineTo(x1, Math.min(dStart, yEnd)); ctx.stroke();
      }
      if (yEnd > dEnd) {
        ctx.beginPath();
        ctx.moveTo(x1, Math.max(dEnd, yStart)); ctx.lineTo(x1, yEnd); ctx.stroke();
      }
    }
  }

  function punchHallDoor(ctx, room, hall) {
    ctx.fillStyle = COLOR.hall;
    // Vertical adjacency (room above/below hall)
    if (room.gx === hall.gx && Math.abs(room.gy - hall.gy) === 1) {
      const cx = room.centroid.x;
      const x = cx - DOORWAY_W / 2;
      let y, h;
      if (room.gy < hall.gy) {
        const yTop = room.rect.y + room.rect.h - 1;
        const yBot = hall.rect.y + 1;
        y = yTop; h = yBot - yTop;
      } else {
        const yTop = hall.rect.y + hall.rect.h - 1;
        const yBot = room.rect.y + 1;
        y = yTop; h = yBot - yTop;
      }
      if (h > 0) ctx.fillRect(x, y, DOORWAY_W, h);
      return;
    }
    // Horizontal adjacency (room left/right of hall)
    if (room.gy === hall.gy && Math.abs(room.gx - hall.gx) === 1) {
      const cy = room.centroid.y;
      const y = cy - DOORWAY_W / 2;
      let x, w;
      if (room.gx < hall.gx) {
        const xL = room.rect.x + room.rect.w - 1;
        const xR = hall.rect.x + 1;
        x = xL; w = xR - xL;
      } else {
        const xL = hall.rect.x + hall.rect.w - 1;
        const xR = room.rect.x + 1;
        x = xL; w = xR - xL;
      }
      if (w > 0) ctx.fillRect(x, y, w, DOORWAY_W);
    }
  }

  function punchInteriorDoor(ctx, a, b) {
    ctx.fillStyle = COLOR.floor;
    if (a.gx === b.gx && Math.abs(a.gy - b.gy) === 1) {
      const upper = a.gy < b.gy ? a : b;
      const lower = a.gy < b.gy ? b : a;
      const cx = upper.centroid.x;
      const yTop = upper.rect.y + upper.rect.h - 1;
      const yBot = lower.rect.y + 1;
      if (yBot > yTop) ctx.fillRect(cx - DOORWAY_W / 2, yTop, DOORWAY_W, yBot - yTop);
    } else if (a.gy === b.gy && Math.abs(a.gx - b.gx) === 1) {
      const left = a.gx < b.gx ? a : b;
      const right = a.gx < b.gx ? b : a;
      const cy = left.centroid.y;
      const xL = left.rect.x + left.rect.w - 1;
      const xR = right.rect.x + 1;
      if (xR > xL) ctx.fillRect(xL, cy - DOORWAY_W / 2, xR - xL, DOORWAY_W);
    }
  }

  function punchExitSlot(ctx, cell, exit) {
    ctx.fillStyle = COLOR.exit;
    if (exit.dir === 'N') {
      ctx.fillRect(exit.rect.x, cell.rect.y - 2, exit.rect.w, 4);
    } else if (exit.dir === 'S') {
      ctx.fillRect(exit.rect.x, cell.rect.y + cell.rect.h - 2, exit.rect.w, 4);
    } else if (exit.dir === 'W') {
      ctx.fillRect(cell.rect.x - 2, exit.rect.y, 4, exit.rect.h);
    } else {
      ctx.fillRect(cell.rect.x + cell.rect.w - 2, exit.rect.y, 4, exit.rect.h);
    }
  }

  global.Building = {
    generate, draw, randInRoom,
    realRooms: realRoomsOf, isRoom
  };
})(typeof window !== 'undefined' ? window : globalThis);
