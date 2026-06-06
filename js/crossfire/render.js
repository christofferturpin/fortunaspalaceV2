/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CONCUSSION BOWL RENDER  —  field paint + helmet/brain + footballs       │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   drawFrame(ctx, world, player, ai) ──► paints one frame                 │
  │      │                                                                   │
  │      ├─ clear()                                                          │
  │      ├─ drawBoard()        ── side walls, top/bottom goal stripes,       │
  │      │                       midline                                     │
  │      ├─ drawAimPreview()   ── dashed line from player's gun, one         │
  │      │                       reflection off a side wall, ends at edge    │
  │      ├─ drawPuck(p)        ── big bone-white disc                        │
  │      ├─ drawMarble(m)      ── small steel circle, color by owner         │
  │      └─ drawGun(g,dir)     ── barrel rotated to aim                      │
  │                                                                          │
  │   Exports (window.CFRender): { drawFrame }                               │
  │   External deps: none                                                    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  palette: bg=#0a0608; wall=#3a1a1a; HOME endzone stripe gold #b8965c; VISITORS endzone stripe blood #7a3a3a
  puck = helmet (iron shell #5a2828→#1a0808) + brain bearing (pink #ffd0d8→#5a2a30) + face mask (#9a9088 bars)
  marble = small football (leather ellipse rx=m.r*1.5, ry=m.r*0.95) oriented along velocity, with stitch+laces; HOME = brown #6a3a1a, VISITORS = blood #5a1a1a
  drawBoard: back areas → walls → arcs → endzone stripes → 9 yard lines (10ths) → midfield "50" → hashmarks (2 columns at 36%/64%) → iron goal posts at each end → endzone labels "VISITORS"/"HOME"
  drawFrame(ctx,w,p,a): clear→board→aimPreview(p)→bursts→puck→marbles→gun(p)→gun(a)→lasers (Hail Marys)
  drawAimPreview: march ray; reflect once off arc side wall using ray-vs-circle (rayHitCircle); dashed line
  drawGun: translate;rotate(aim-PI/2);fillRect barrel;arc base
  drawLaser: animated zip→fade; muzzle flash; impact burst on hit
*/
(function () {
  // ── Tecmo Bowl palette ───────────────────────────────────────────
  var TB = {
    fieldLight: '#3b8c3b',
    fieldDark:  '#2c6c2c',
    line:       '#f8f8f8',
    yellow:     '#fcd040',
    red:        '#d02830',
    redDeep:    '#8a181c',
    blue:       '#2050d0',
    blueDeep:   '#102a78',
    brown:      '#8c4828',
    skin:       '#fcc890',
    gray:       '#c0c0c0',
    black:      '#181818'
  };

  function clear(ctx, W, H) {
    ctx.fillStyle = TB.fieldLight;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBoard(ctx, W, H, shift) {
    var P = window.CFPhysics;
    var SHIFT = shift || 0;
    var TOP = P.PLAY_TOP;
    var BOT = P.PLAY_BOTTOM;
    // Goal-line positions (collapse inward as SHIFT grows). End zones expand
    // to swallow the now-unplayable strip between the original back-area and
    // the shifted goal line.
    var TOP_GOAL = TOP + SHIFT;
    var BOT_GOAL = BOT - SHIFT;
    var INSET = P.WALL_INSET;
    var leftCX = P.LEFT_CX;
    var rightCX = P.rightCX(W);
    var arcR = P.ARC_R;
    var arcCY = P.ARC_CY;
    var playH = BOT - TOP;
    var yardSpacing = playH / 10;
    // ── ALTERNATING MOWING STRIPES every 10 yards ──
    for (var s = 0; s < 10; s++) {
      var y0 = TOP + yardSpacing * s;
      ctx.fillStyle = (s % 2 === 0) ? TB.fieldLight : TB.fieldDark;
      ctx.fillRect(0, y0, W, yardSpacing);
    }
    // ── END ZONES — solid team color, extended by SHIFT into the field as
    //    the red zone collapses. The expanded strip reads as "danger area."
    ctx.fillStyle = TB.red;
    ctx.fillRect(0, 0, W, TOP_GOAL);
    ctx.fillStyle = TB.blue;
    ctx.fillRect(0, BOT_GOAL, W, H - BOT_GOAL);
    // ── SIDELINE MASKS — black fill outside the arcs, top to bottom ──
    // Compute where each arc meets the canvas top/bottom.
    var leftXAtTop  = leftCX  - Math.sqrt(Math.max(0, arcR * arcR - (0 - arcCY) * (0 - arcCY)));
    var leftXAtBot  = leftCX  - Math.sqrt(Math.max(0, arcR * arcR - (H - arcCY) * (H - arcCY)));
    var rightXAtTop = rightCX + Math.sqrt(Math.max(0, arcR * arcR - (0 - arcCY) * (0 - arcCY)));
    var rightXAtBot = rightCX + Math.sqrt(Math.max(0, arcR * arcR - (H - arcCY) * (H - arcCY)));
    var leftTopAng = Math.atan2(0 - arcCY, leftXAtTop  - leftCX);
    var leftBotAng = Math.atan2(H - arcCY, leftXAtBot  - leftCX);
    var rightTopAng = Math.atan2(0 - arcCY, rightXAtTop - rightCX);
    var rightBotAng = Math.atan2(H - arcCY, rightXAtBot - rightCX);
    // Left side mask
    ctx.fillStyle = TB.black;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, H);
    ctx.lineTo(leftXAtBot, H);
    ctx.arc(leftCX, arcCY, arcR, leftBotAng, leftTopAng, true);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    // Right side mask
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W, H);
    ctx.lineTo(rightXAtBot, H);
    ctx.arc(rightCX, arcCY, arcR, rightBotAng, rightTopAng, false);
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fill();
    // ── ARC WALL STROKES (chunky black boundary) ──
    ctx.lineCap = 'butt';
    ctx.strokeStyle = TB.black;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(leftCX,  arcCY, arcR, leftTopAng,  leftBotAng,  true);  ctx.stroke();
    ctx.beginPath(); ctx.arc(rightCX, arcCY, arcR, rightTopAng, rightBotAng, false); ctx.stroke();
    // ── GOAL LINES — white until the field collapses, then a thicker red
    //    "danger line" so it reads as the red zone boundary. ──
    var inRedZone = SHIFT > 0.5;
    ctx.strokeStyle = inRedZone ? '#ff2030' : TB.line;
    ctx.lineWidth = inRedZone ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(INSET, TOP_GOAL + 1.5); ctx.lineTo(W - INSET, TOP_GOAL + 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(INSET, BOT_GOAL - 1.5); ctx.lineTo(W - INSET, BOT_GOAL - 1.5); ctx.stroke();
    // ── YARD LINES — thick white stripes every 10 yards ──
    ctx.strokeStyle = TB.line;
    ctx.lineWidth = 2;
    for (var i = 1; i < 10; i++) {
      var y = TOP + yardSpacing * i;
      ctx.beginPath();
      ctx.moveTo(INSET, y + 0.5);
      ctx.lineTo(W - INSET, y + 0.5);
      ctx.stroke();
    }
    // midfield (50-yard) line — thicker
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(INSET, (TOP + BOT) / 2 + 0.5);
    ctx.lineTo(W - INSET, (TOP + BOT) / 2 + 0.5);
    ctx.stroke();
    // ── YARD NUMBERS + ARROWS — fixed-column NES-style labels ──
    var yardLabels = [10, 20, 30, 40, 50, 40, 30, 20, 10];
    ctx.font = '900 18px "Courier New", "Arial Black", monospace';
    ctx.fillStyle = TB.line;
    var leftCol = 24, rightCol = W - 24;
    for (var yi = 0; yi < yardLabels.length; yi++) {
      var yy = TOP + yardSpacing * (yi + 1);
      var label = String(yardLabels[yi]);
      ctx.textAlign = 'left';
      ctx.fillText(label, leftCol, yy + 6);
      ctx.textAlign = 'right';
      ctx.fillText(label, rightCol, yy + 6);
      if (yardLabels[yi] !== 50) {
        var arrowDir = yi < 4 ? -1 : 1;
        var ax = leftCol + 26, ay = yy + 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay + arrowDir * -5);
        ctx.lineTo(ax + 7, ay);
        ctx.lineTo(ax, ay + arrowDir * 5);
        ctx.closePath(); ctx.fill();
        var ax2 = rightCol - 26;
        ctx.beginPath();
        ctx.moveTo(ax2, ay + arrowDir * -5);
        ctx.lineTo(ax2 - 7, ay);
        ctx.lineTo(ax2, ay + arrowDir * 5);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.textAlign = 'start';
    // ── HASHMARKS — chunky white ticks in two columns ──
    var hashL = W * 0.36, hashR = W * 0.64;
    ctx.strokeStyle = TB.line;
    ctx.lineWidth = 2;
    var tickEvery = yardSpacing / 5;
    for (var ty = TOP + tickEvery; ty < BOT - 1; ty += tickEvery) {
      ctx.beginPath();
      ctx.moveTo(hashL - 5, ty); ctx.lineTo(hashL + 5, ty);
      ctx.moveTo(hashR - 5, ty); ctx.lineTo(hashR + 5, ty);
      ctx.stroke();
    }
    // ── GOAL POSTS — bright yellow Tecmo uprights ──
    function drawGoalPost(cx, cy, up) {
      var dir = up ? -1 : 1;
      ctx.fillStyle = TB.yellow;
      // crossbar (chunky pixel)
      ctx.fillRect(cx - 30, cy - 2, 60, 4);
      // uprights pointing away from field
      ctx.fillRect(cx - 32, cy + dir * 18, 4, 18);
      ctx.fillRect(cx + 28, cy + dir * 18, 4, 18);
      // base stem into field
      ctx.fillRect(cx - 2, cy - dir * 8, 4, 8);
    }
    drawGoalPost(W / 2, TOP - 4, true);
    drawGoalPost(W / 2, BOT + 4, false);
    // ── BIG END ZONE LETTERING — chunky white block letters ──
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px "Courier New", "Arial Black", monospace';
    ctx.fillStyle = TB.line;
    ctx.fillText('VISITORS', W / 2, TOP / 2 + 2);
    ctx.fillText('HOME', W / 2, (BOT + H) / 2 - 2);
    ctx.fillRect(W * 0.18, TOP / 2 + 22, W * 0.64, 3);
    ctx.fillRect(W * 0.30, (BOT + H) / 2 + 18, W * 0.40, 3);
    // ── MIDFIELD LOGO — pixel-block "F" stamp ──
    var mx = W / 2, my = (TOP + BOT) / 2;
    ctx.strokeStyle = TB.line;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = TB.line;
    ctx.fillRect(mx - 12, my - 16, 6, 32);
    ctx.fillRect(mx - 12, my - 16, 24, 6);
    ctx.fillRect(mx - 12, my - 3,  16, 5);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Ray vs circle: smallest positive t where (origin + t*dir) hits the circle.
  // Returns Infinity if no forward hit.
  function rayHitCircle(ox, oy, dx, dy, cx, cy, r) {
    var px = ox - cx, py = oy - cy;
    var b = px * dx + py * dy;
    var c = px * px + py * py - r * r;
    var disc = b * b - c;
    if (disc < 0) return Infinity;
    var sq = Math.sqrt(disc);
    var t1 = -b - sq;
    var t2 = -b + sq;
    if (t1 > 1e-4) return t1;
    if (t2 > 1e-4) return t2;
    return Infinity;
  }

  // One-bounce trajectory preview that respects the arc side walls.
  function drawAimPreview(ctx, gunX, gunY, aim, W, H) {
    var P = window.CFPhysics;
    var leftCX = P.LEFT_CX, rightCX = P.rightCX(W);
    var arcR = P.ARC_R, arcCY = P.ARC_CY;
    var maxLen = 1200;
    var x = gunX, y = gunY;
    var dx = Math.cos(aim), dy = Math.sin(aim);
    var pts = [{ x: x, y: y }];
    var bounced = false;
    var traveled = 0;
    var safety = 4;
    while (traveled < maxLen && safety-- > 0) {
      var tLeft  = rayHitCircle(x, y, dx, dy, leftCX,  arcCY, arcR);
      var tRight = rayHitCircle(x, y, dx, dy, rightCX, arcCY, arcR);
      var tTop   = dy < 0 ? (0 - y) / dy : Infinity;
      var tBot   = dy > 0 ? (H - y) / dy : Infinity;
      var tWall = Math.min(tLeft, tRight);
      var tEnd  = Math.min(tTop, tBot);
      if (tEnd <= tWall || bounced) {
        var t = Math.min(tEnd, maxLen - traveled);
        pts.push({ x: x + dx * t, y: y + dy * t });
        break;
      }
      // bounce off arc — wall normal points FROM the hit point back TOWARD
      // the arc center (because the field is now inside the circle).
      x = x + dx * tWall;
      y = y + dy * tWall;
      pts.push({ x: x, y: y });
      var hitCX = (tWall === tLeft) ? leftCX : rightCX;
      var nx = (hitCX - x) / arcR;
      var ny = (arcCY - y) / arcR;
      var dDotN = dx * nx + dy * ny;
      dx = dx - 2 * dDotN * nx;
      dy = dy - 2 * dDotN * ny;
      bounced = true;
      traveled += tWall;
    }
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    for (var i = 1; i < pts.length; i++) {
      ctx.strokeStyle = i === 1
        ? 'rgba(252,208,64,0.85)'   // bright yellow first segment
        : 'rgba(252,208,64,0.4)';
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPuck(ctx, p) {
    // Tecmo-style helmet (top-down) with brain rattling inside.
    var h = p.half;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // helmet shell — flat yellow Tecmo color with black pixel outline
    ctx.fillStyle = TB.yellow;
    ctx.fillRect(-h, -h, h * 2, h * 2);
    ctx.fillStyle = TB.black;
    // pixel-style outline (4-px chunky border)
    ctx.fillRect(-h, -h, h * 2, 3);
    ctx.fillRect(-h, h - 3, h * 2, 3);
    ctx.fillRect(-h, -h, 3, h * 2);
    ctx.fillRect(h - 3, -h, 3, h * 2);
    // crown stripe (down the center, aim direction)
    ctx.fillStyle = TB.red;
    ctx.fillRect(-3, -h, 6, h * 2);
    // face mask — chunky gray bars at the FRONT (top of local frame)
    ctx.fillStyle = TB.gray;
    ctx.fillRect(-h + 4, -h + 6, h * 2 - 8, 2);
    ctx.fillRect(-h + 4, -h + 12, h * 2 - 8, 2);
    ctx.fillRect(-2, -h + 6, 4, 10);
    // brain chamber — black void
    ctx.fillStyle = TB.black;
    ctx.beginPath();
    ctx.arc(0, 4, h - 10, 0, Math.PI * 2);
    ctx.fill();
    // brain — flat pink Tecmo color with chunky black outline
    var b = p.bearing;
    ctx.fillStyle = TB.skin;
    ctx.beginPath();
    ctx.arc(b.lx, b.ly, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = TB.black;
    ctx.lineWidth = 2;
    ctx.stroke();
    // wrinkles (chunky pink-darker arcs)
    ctx.strokeStyle = '#c08868';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.lx - b.r * 0.55, b.ly);
    ctx.quadraticCurveTo(b.lx, b.ly - b.r * 0.55, b.lx + b.r * 0.55, b.ly);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.lx - b.r * 0.55, b.ly + 3);
    ctx.quadraticCurveTo(b.lx, b.ly + b.r * 0.45, b.lx + b.r * 0.55, b.ly + 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawMarble(ctx, m) {
    // Tecmo football — flat brown ellipse, chunky black outline, white laces.
    var ang = Math.atan2(m.vy, m.vx);
    var rx = m.r * 1.5;
    var ry = m.r * 0.95;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang);
    // body — flat color
    ctx.fillStyle = m.owner === 'ai' ? TB.redDeep : TB.brown;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // chunky outline
    ctx.strokeStyle = TB.black;
    ctx.lineWidth = 2;
    ctx.stroke();
    // white center stripe
    ctx.fillStyle = TB.line;
    ctx.fillRect(-rx * 0.4, -1, rx * 0.8, 2);
    // laces (chunky white pixel ticks)
    for (var i = -2; i <= 2; i++) {
      ctx.fillRect(i * 3 - 0.5, -2.5, 1.5, 5);
    }
    ctx.restore();
  }

  function drawBurst(ctx, b) {
    var p = b.age / b.ttl;
    var alpha = Math.max(0, 1 - p * 1.2);
    if (alpha <= 0) return;
    var r = 4 + b.maxR * p;
    var hot   = b.owner === 'ai' ? '255,200,200' : '255,250,230';
    var color = b.owner === 'ai' ? '255,90,90'   : '240,227,196';
    var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0,    'rgba(255,255,255,' + alpha + ')');
    g.addColorStop(0.45, 'rgba(' + hot   + ',' + (alpha * 0.55) + ')');
    g.addColorStop(1,    'rgba(' + color + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLaser(ctx, l) {
    var endX, endY, alpha, impacted;
    if (l.age < l.zip) {
      // Zip phase: the beam visibly extends from origin to target.
      var p = l.age / l.zip;
      endX = l.x1 + (l.x2 - l.x1) * p;
      endY = l.y1 + (l.y2 - l.y1) * p;
      alpha = 1;
      impacted = false;
    } else {
      endX = l.x2; endY = l.y2;
      var fadeP = (l.age - l.zip) / (l.ttl - l.zip);
      alpha = Math.max(0, 1 - fadeP);
      impacted = true;
    }
    if (alpha <= 0) return;
    var color = l.owner === 'ai' ? '255,90,90' : '240,227,196';
    var hotColor = l.owner === 'ai' ? '255,200,200' : '255,250,230';
    ctx.lineCap = 'round';
    // outer halo (wide, soft)
    ctx.strokeStyle = 'rgba(' + color + ',' + (alpha * 0.28) + ')';
    ctx.lineWidth = 26;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(endX, endY); ctx.stroke();
    // mid glow
    ctx.strokeStyle = 'rgba(' + color + ',' + (alpha * 0.55) + ')';
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(endX, endY); ctx.stroke();
    // inner bright
    ctx.strokeStyle = 'rgba(' + hotColor + ',' + (alpha * 0.9) + ')';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(endX, endY); ctx.stroke();
    // hot white core
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(endX, endY); ctx.stroke();
    // muzzle flash at origin (while zipping + a little after)
    if (l.age < l.zip * 1.8) {
      var muzzleA = Math.max(0, 1 - (l.age / (l.zip * 1.8)));
      var mg = ctx.createRadialGradient(l.x1, l.y1, 0, l.x1, l.y1, 22);
      mg.addColorStop(0, 'rgba(255,255,255,' + muzzleA + ')');
      mg.addColorStop(0.4, 'rgba(' + hotColor + ',' + (muzzleA * 0.6) + ')');
      mg.addColorStop(1, 'rgba(' + color + ',0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(l.x1, l.y1, 22, 0, Math.PI * 2); ctx.fill();
    }
    // impact burst on hit (after the zip lands)
    if (impacted && l.willHit) {
      var burstP = (l.age - l.zip) / (l.ttl - l.zip);
      var burstA = Math.max(0, 1 - burstP * 1.4);
      if (burstA > 0) {
        var br = 8 + burstP * 28;
        var bg = ctx.createRadialGradient(l.x2, l.y2, 0, l.x2, l.y2, br);
        bg.addColorStop(0, 'rgba(255,255,255,' + burstA + ')');
        bg.addColorStop(0.45, 'rgba(' + hotColor + ',' + (burstA * 0.6) + ')');
        bg.addColorStop(1, 'rgba(' + color + ',0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(l.x2, l.y2, br, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawGun(ctx, gx, gy, aim, color) {
    // Tecmo QB sprite — chunky pixel helmet + arm + football.
    // `color` selects team: TB.red for visitors, TB.blue for home.
    var team = (color === '#7a3a3a' || color === TB.red) ? 'visitors' : 'home';
    var helmColor = team === 'visitors' ? TB.red : TB.blue;
    var helmDeep  = team === 'visitors' ? TB.redDeep : TB.blueDeep;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(aim - Math.PI / 2);
    // helmet body — flat team color rectangle (squarish, NES-style)
    ctx.fillStyle = helmColor;
    ctx.fillRect(-13, -13, 26, 26);
    // chunky black outline
    ctx.fillStyle = TB.black;
    ctx.fillRect(-13, -13, 26, 3);
    ctx.fillRect(-13, 10, 26, 3);
    ctx.fillRect(-13, -13, 3, 26);
    ctx.fillRect(10, -13, 3, 26);
    // crown stripe (white pixel stripe down the middle = aim direction)
    ctx.fillStyle = TB.line;
    ctx.fillRect(-2, -10, 4, 20);
    // face mask — chunky gray bars at the FRONT (+y local)
    ctx.fillStyle = TB.gray;
    ctx.fillRect(-9, 3, 18, 2);
    ctx.fillRect(-9, 7, 18, 2);
    // ear hole (deep team color blob)
    ctx.fillStyle = helmDeep;
    ctx.fillRect(-11, -3, 4, 6);
    ctx.fillRect(7, -3, 4, 6);
    // throwing arm (skin tone block) extending out
    ctx.fillStyle = TB.skin;
    ctx.fillRect(-3, 13, 6, 10);
    ctx.fillStyle = TB.black;
    ctx.fillRect(-3, 13, 6, 1);
    ctx.fillRect(-3, 22, 6, 1);
    ctx.fillRect(-3, 13, 1, 10);
    ctx.fillRect(2, 13, 1, 10);
    // football at the end of the arm
    ctx.save();
    ctx.translate(0, 27);
    ctx.fillStyle = TB.brown;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = TB.black;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = TB.line;
    ctx.fillRect(-2.5, -0.5, 5, 1);
    ctx.restore();
    ctx.restore();
  }

  function drawFrame(ctx, world, player, ai) {
    var W = world.width, H = world.height;
    clear(ctx, W, H);
    drawBoard(ctx, W, H, world && world.goalShiftPx);
    drawAimPreview(ctx, player.gunX, player.gunY, player.aim, W, H);
    drawPuck(ctx, world.puck);
    for (var i = 0; i < world.marbles.length; i++) drawMarble(ctx, world.marbles[i]);
    drawGun(ctx, player.gunX, player.gunY, player.aim, TB.blue);
    drawGun(ctx, ai.gunX, ai.gunY, ai.aim, TB.red);
    if (world.bursts) {
      for (var bi = 0; bi < world.bursts.length; bi++) drawBurst(ctx, world.bursts[bi]);
    }
    if (world.lasers) {
      for (var j = 0; j < world.lasers.length; j++) drawLaser(ctx, world.lasers[j]);
    }
  }

  window.CFRender = { drawFrame: drawFrame };
})();
