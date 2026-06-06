/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  PHOTOBOOTH PAGE  —  webcam → VHS-grade postcard composer                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ inject booth markup into #photobooth-main    │
  │                          ├─ bind #booth-allow ─► requestCamera()         │
  │                          ├─ bind #booth-tell  ─► requestClipboard()      │
  │                          └─ bind #booth-snap  ─► takeSnapshot()          │
  │                                                                          │
  │   requestCamera() ──► getUserMedia ──► startPreview()                    │
  │       startPreview() ──► rAF loop ──► renderFrame()                      │
  │           renderFrame(): chroma shift + scanlines + tear + vignette      │
  │                                                                          │
  │   requestClipboard() ──► navigator.clipboard.readText                    │
  │                          ──► clipboardText (≤CLIP_MAX chars)             │
  │                                                                          │
  │   takeSnapshot() (async)                                                 │
  │     ├─ Wallet.spend(COST=5)         ◄── aborts if false                  │
  │     ├─ Child.recordPlay()                                                │
  │     ├─ pickRandom(GREETINGS / BUSINESSES / MEMORIES)                     │
  │     ├─ document.fonts.load × 3                                           │
  │     ├─ composePostcard({greeting, business, clipText}) ──► Blob          │
  │     │     ├─ drawGhostQuotes(c) ──► drawGhostLayer ×2                    │
  │     │     ├─ drawChildStamp(c)                                           │
  │     │     ├─ fitFontSize(c, text, maxW, maxS, minS, family) ──► int     │
  │     │     ├─ drawVhsText(c, text, x, y, opts)                            │
  │     │     ├─ drawVhsWrappedText(c, text, x, y, opts)                     │
  │     │     └─ applyVhsTear(c)                                             │
  │     └─ URL.createObjectURL ──► open new window with composed PNG         │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet, window.Child, window.PhotoboothPostcards,│
  │                   navigator.mediaDevices, navigator.clipboard,           │
  │                   document.fonts                                         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  W=96; H=72; SHIFT=2; CLIP_MAX=120; COST=5; OUT_W=1280; OUT_H=960
  VHS_YELLOW='#f3d04e'; QUOTE_INKS=[5 rgba prefixes]
  state: stream=null, videoEl, canvasEl, ctx, offCanvas, offCtx, allowBtn, tellBtn, snapBtn, drawing=F, clipboardText=''
  init(): #photobooth-main→inject booth.html (video+canvas+3 btns); cache els; bind allow→requestCamera, tell→requestClipboard, snap→takeSnapshot
  requestCamera()async: btn.disabled=T; guard(!isSecureContext||!mediaDevices)→'Needs HTTPS'; getUserMedia({video:{facingMode:'user'}})→videoEl.srcObject=stream; await play; allowBtn.hidden=T; tellBtn.hidden=F; startPreview; catch by err.name: NotAllowedError→'Camera blocked', NotFoundError→'No camera', else→'Camera unavailable'
  startPreview(): guard(drawing); drawing=T; offCanvas=W×H; loop()→if readyState≥2 renderFrame; rAF
  renderFrame(): offCtx.filter='grayscale contrast'; mirror+drawImage; chroma-shift via per-px R from rx, G/B from bx (SHIFT=2); putImageData; scanlines every 2y; tearY=now/50%H; radial vignette
  requestClipboard()async: tellBtn.disabled=T; try readText (skip on mobile/iOS where unsupported); if empty→prompt('Tell the Palace…')||''; clipboardText=text.trim.slice(0,CLIP_MAX); tellBtn.hidden=T; snapBtn.hidden=F
  takeSnapshot()async: guard(!stream); Wallet.spend(COST)?ok:btn'Can't afford'1500ms ret; Child.recordPlay; win=open(blank); pools=PhotoboothPostcards||fallback; greeting,business,clipText=pickRandom||clipboardText; await fonts.load×3; blob=await composePostcard; imgUrl=URL.createObjectURL; wrapHtml=img-only; win.location=wrapUrl
  composePostcard(fields)→Promise<Blob>: canvas OUT_W×OUT_H; drawImage(canvasEl scaled); drawGhostQuotes; drawChildStamp; greeting=fitFontSize→drawVhsText@(W/2,70); fromText→drawVhsText; 'DO YOU REMEMBER:' label; drawVhsWrappedText(clipText,maxLines:2); applyVhsTear; toBlob('image/png')
  fitFontSize(c,text,maxW,maxS,minS,family)→int: size=maxS; while measureText>maxW && size>minS size-=2; ret size
  drawVhsText(c,text,x,y,opts): save; set font/align/baseline/letterSpacing/blur; translate; skew+scaleY; offset shadow; chroma R-/B+(lighter); smearCount yellow trails; main fillText w/ shadow; restore
  drawVhsWrappedText(c,text,x,y,opts): split words; pack lines≤maxWidth; truncate to maxLines w/ '...'; ∀ln drawVhsText@(x,cy); cy+=lineHeight
  drawGhostQuotes(c): guard(QUOTES.empty); drawGhostLayer×2 (small dense, large sparse)
  drawGhostLayer(c,quotes,count,sMin,sMax,oMin,oMax,bMin,bMax): for count: random text/size/angle/x/y/opacity/blur/ink; italic EB-Garamond fillText
  drawChildStamp(c): guard(!Child.getState); face=describeFace.frames[0]; stats=`H:${h} W:${w} C:${c} P:${p}`; phosphor green 3-pass glow text@970,480
  applyVhsTear(c): tearCount=5+rnd(4); ∀ strip stripY/stripH/stripShift; getImageData→fillRect black→putImageData(shifted)
  pickRandom(arr)→item: arr[floor(rnd*len)]
  exports: none (IIFE-local); on DOMContentLoaded→init
*/

(function () {
  const W = 96;
  const H = 72;
  const SHIFT = 2;
  const CLIP_MAX = 120;
  const COST = 5;

  const OUT_W = 1280;
  const OUT_H = 960;

  const VHS_YELLOW = '#f3d04e';
  const QUOTE_INKS = [
    'rgba(243, 208, 78,',
    'rgba(216, 200, 176,',
    'rgba(232, 217, 145,',
    'rgba(212, 180, 100,',
    'rgba(200, 180, 110,',
  ];

  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let offCanvas = null;
  let offCtx = null;
  let allowBtn = null;
  let tellBtn = null;
  let snapBtn = null;
  let drawing = false;
  let clipboardText = '';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const main = document.getElementById('photobooth-main');
    if (!main) return;

    main.innerHTML = `
      <div class="booth">
        <div class="lens">
          <div class="lens-frame">
            <video id="booth-video" autoplay playsinline muted></video>
            <canvas id="booth-canvas" width="${W}" height="${H}"></canvas>
            <div class="lens-glare"></div>
          </div>
        </div>
        <div class="booth-controls">
          <button class="booth-btn" id="booth-allow">Sit.</button>
          <button class="booth-btn" id="booth-tell" hidden>Tell.</button>
          <button class="booth-btn" id="booth-snap" hidden>Smile.</button>
        </div>
      </div>
    `;

    videoEl = document.getElementById('booth-video');
    canvasEl = document.getElementById('booth-canvas');
    ctx = canvasEl.getContext('2d');
    allowBtn = document.getElementById('booth-allow');
    tellBtn = document.getElementById('booth-tell');
    snapBtn = document.getElementById('booth-snap');

    allowBtn.addEventListener('click', requestCamera);
    tellBtn.addEventListener('click', requestClipboard);
    snapBtn.addEventListener('click', takeSnapshot);
  }

  async function requestCamera() {
    allowBtn.disabled = true;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('insecure');
        e.name = 'InsecureContextError';
        throw e;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      allowBtn.hidden = true;
      tellBtn.hidden = false;
      startPreview();
    } catch (err) {
      allowBtn.disabled = false;
      const name = err && err.name;
      if (name === 'InsecureContextError') allowBtn.textContent = 'Needs HTTPS';
      else if (name === 'NotAllowedError') allowBtn.textContent = 'Camera blocked';
      else if (name === 'NotFoundError') allowBtn.textContent = 'No camera';
      else allowBtn.textContent = 'Camera unavailable';
    }
  }

  function startPreview() {
    if (drawing) return;
    drawing = true;
    offCanvas = document.createElement('canvas');
    offCanvas.width = W;
    offCanvas.height = H;
    offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    function loop() {
      if (videoEl.readyState >= 2) renderFrame();
      requestAnimationFrame(loop);
    }
    loop();
  }

  function renderFrame() {
    offCtx.filter = 'grayscale(1) contrast(1.2)';
    offCtx.save();
    offCtx.scale(-1, 1);
    offCtx.drawImage(videoEl, -W, 0, W, H);
    offCtx.restore();

    const src = offCtx.getImageData(0, 0, W, H).data;
    const out = ctx.createImageData(W, H);
    const od = out.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const rx = Math.max(0, Math.min(W - 1, x + SHIFT));
        const bx = Math.max(0, Math.min(W - 1, x - SHIFT));
        od[i]     = src[(y * W + rx) * 4];
        od[i + 1] = src[(y * W + bx) * 4];
        od[i + 2] = src[(y * W + bx) * 4];
        od[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < H; y += 2) {
      ctx.fillRect(0, y, W, 1);
    }

    const tearY = Math.floor((Date.now() / 50) % H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, tearY, W, 1);

    const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  async function takeSnapshot() {
    if (!stream) return;

    if (window.Wallet && !window.Wallet.spend(COST)) {
      const original = snapBtn.textContent;
      snapBtn.textContent = "Can't afford.";
      snapBtn.disabled = true;
      setTimeout(function () {
        snapBtn.textContent = original;
        snapBtn.disabled = false;
      }, 1500);
      return;
    }

    if (window.Child) window.Child.recordPlay();

    const win = window.open('about:blank', '_blank');

    const pools = window.PhotoboothPostcards || {
      GREETINGS: ['Greetings'],
      BUSINESSES: ['Laundromat'],
      MEMORIES: ['nothing'],
      QUOTES: [],
    };
    const greeting = pickRandom(pools.GREETINGS);
    const business = pickRandom(pools.BUSINESSES);
    const clipText = clipboardText || pickRandom(pools.MEMORIES);

    await Promise.all([
      document.fonts.load('100px "Press Start 2P"'),
      document.fonts.load('100px "VT323"'),
      document.fonts.load('italic 100px "EB Garamond"'),
    ]);

    const blob = await composePostcard({ greeting, business, clipText });
    const imgUrl = URL.createObjectURL(blob);

    const wrapHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Snapshot</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}body{display:grid;place-items:center}img{max-width:100vw;max-height:100vh;display:block}</style>
</head><body><img src="${imgUrl}"></body></html>`;
    const wrapBlob = new Blob([wrapHtml], { type: 'text/html' });
    const wrapUrl = URL.createObjectURL(wrapBlob);

    if (win && !win.closed) {
      win.location = wrapUrl;
    } else {
      window.open(wrapUrl, '_blank');
    }
  }

  function composePostcard(fields) {
    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    const c = out.getContext('2d');

    c.imageSmoothingEnabled = false;
    c.drawImage(canvasEl, 0, 0, OUT_W, OUT_H);
    c.imageSmoothingEnabled = true;

    drawGhostQuotes(c);

    drawChildStamp(c);

    const padX = 50;
    const maxLineW = OUT_W - padX * 2;

    const greeting = fields.greeting.toUpperCase();
    const greetingSize = fitFontSize(c, greeting, maxLineW, 84, 36, '"Press Start 2P", monospace');
    drawVhsText(c, greeting, OUT_W / 2, 70, {
      font: `${greetingSize}px "Press Start 2P", monospace`,
      fill: VHS_YELLOW,
      offset: 6,
      blur: 1.0,
      chromaOffset: 6,
      smearCount: 4,
      skewX: -0.04 + (Math.random() - 0.5) * 0.06,
      scaleY: 0.95 + Math.random() * 0.1,
    });

    const fromText = `From Lovely Fortuna's Palace Motel & Casino & ${fields.business}`;
    const fromSize = fitFontSize(c, fromText, maxLineW, 38, 18, '"VT323", monospace');
    drawVhsText(c, fromText, OUT_W / 2, 70 + greetingSize + 30, {
      font: `${fromSize}px "VT323", monospace`,
      fill: '#d8c8b0',
      offset: 4,
      blur: 0.5,
    });

    drawVhsText(c, 'DO YOU REMEMBER:', OUT_W / 2, OUT_H - 230, {
      font: '32px "VT323", monospace',
      fill: '#b8a098',
      offset: 3,
      blur: 0.5,
      letterSpacing: 8,
      chromaOffset: 2,
      smearCount: 1,
    });

    drawVhsWrappedText(c, fields.clipText, OUT_W / 2, OUT_H - 180, {
      font: '60px "Press Start 2P", monospace',
      fill: VHS_YELLOW,
      offset: 6,
      maxWidth: maxLineW,
      lineHeight: 78,
      maxLines: 2,
      blur: 0.9,
      chromaOffset: 6,
      smearCount: 4,
      skewX: -0.03 + (Math.random() - 0.5) * 0.05,
      scaleY: 0.96 + Math.random() * 0.08,
    });

    applyVhsTear(c);

    return new Promise(resolve => out.toBlob(resolve, 'image/png'));
  }

  function fitFontSize(c, text, maxWidth, maxSize, minSize, family) {
    let size = maxSize;
    c.font = `${size}px ${family}`;
    while (c.measureText(text).width > maxWidth && size > minSize) {
      size -= 2;
      c.font = `${size}px ${family}`;
    }
    return size;
  }

  function drawVhsText(c, text, x, y, opts) {
    c.save();
    c.font = opts.font;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    if (opts.letterSpacing != null) c.letterSpacing = opts.letterSpacing + 'px';
    if (opts.blur != null) c.filter = `blur(${opts.blur}px)`;

    const skewX = opts.skewX || 0;
    const scaleY = opts.scaleY != null ? opts.scaleY : 1;
    const chroma = opts.chromaOffset || 0;
    const smearCount = opts.smearCount || 0;
    const offset = opts.offset || 0;

    c.translate(x, y);
    c.transform(1, 0, skewX, scaleY, 0, 0);

    if (offset) {
      c.fillStyle = 'rgba(0, 0, 0, 0.95)';
      c.fillText(text, offset, offset);
    }

    if (chroma > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255, 30, 70, 0.55)';
      c.fillText(text, -chroma, 0);
      c.fillStyle = 'rgba(40, 200, 230, 0.55)';
      c.fillText(text, chroma, 0);
      c.restore();
    }

    for (let i = 0; i < smearCount; i++) {
      const dx = (i + 1) * 4;
      const a = 0.30 - i * 0.07;
      if (a <= 0) break;
      c.fillStyle = `rgba(243, 208, 78, ${a})`;
      c.fillText(text, dx, 0);
    }

    c.shadowColor = 'rgba(0, 0, 0, 0.85)';
    c.shadowBlur = 14;
    c.fillStyle = opts.fill;
    c.fillText(text, 0, 0);

    c.restore();
  }

  function drawVhsWrappedText(c, text, x, y, opts) {
    c.save();
    c.font = opts.font;
    if (opts.letterSpacing != null) c.letterSpacing = opts.letterSpacing + 'px';

    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > opts.maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const visible = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
    if (opts.maxLines && lines.length > opts.maxLines) {
      const last = visible[visible.length - 1];
      visible[visible.length - 1] = last.replace(/\s+\S*$/, '') + '...';
    }
    c.restore();

    let cy = y;
    for (const ln of visible) {
      drawVhsText(c, ln, x, cy, opts);
      cy += opts.lineHeight;
    }
  }

  function drawGhostQuotes(c) {
    const pools = window.PhotoboothPostcards;
    if (!pools || !pools.QUOTES || !pools.QUOTES.length) return;
    const quotes = pools.QUOTES;

    drawGhostLayer(c, quotes, 28, 12, 26, 0.05, 0.13, 2.2, 3.6);
    drawGhostLayer(c, quotes, 14, 26, 50, 0.10, 0.22, 1.4, 2.6);
  }

  function drawGhostLayer(c, quotes, count, sizeMin, sizeMax, oMin, oMax, bMin, bMax) {
    for (let i = 0; i < count; i++) {
      const text = quotes[Math.floor(Math.random() * quotes.length)];
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      const angle = (Math.random() - 0.5) * 0.6;
      const x = -150 + Math.random() * (OUT_W + 300);
      const y = 30 + Math.random() * (OUT_H - 60);
      const opacity = oMin + Math.random() * (oMax - oMin);
      const blur = bMin + Math.random() * (bMax - bMin);
      const ink = QUOTE_INKS[Math.floor(Math.random() * QUOTE_INKS.length)];

      c.save();
      c.translate(x, y);
      c.rotate(angle);
      c.filter = `blur(${blur}px)`;
      c.font = `italic ${size}px "EB Garamond", "Times New Roman", serif`;
      c.fillStyle = `${ink} ${opacity})`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, 0);
      c.restore();
    }
  }

  function drawChildStamp(c) {
    if (!window.Child || typeof window.Child.getState !== 'function') return;
    const state = window.Child.getState();
    if (!state) return;
    const face = window.Child.describeFace(state).frames[0];
    const stats = `H:${state.hunger} W:${state.wellness} C:${state.closeness}`;

    const cx = 970;
    const cy = 480;
    const phosphor = '#c2dca2';
    const glow = '#9bdc82';

    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = phosphor;
    c.shadowColor = glow;

    c.font = '200px "VT323", "Courier New", monospace';
    c.shadowBlur = 60;
    c.fillText(face, cx, cy);
    c.shadowBlur = 28;
    c.fillText(face, cx, cy);
    c.shadowBlur = 10;
    c.fillText(face, cx, cy);

    c.font = '50px "VT323", "Courier New", monospace';
    c.shadowBlur = 20;
    c.fillText(stats, cx, cy + 140);
    c.shadowBlur = 8;
    c.fillText(stats, cx, cy + 140);

    c.restore();
  }

  function applyVhsTear(c) {
    const tearCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < tearCount; i++) {
      const stripY = Math.floor(Math.random() * (OUT_H - 30));
      const stripH = 2 + Math.floor(Math.random() * 14);
      const stripShift = Math.floor((Math.random() - 0.5) * 80);

      const stripData = c.getImageData(0, stripY, OUT_W, stripH);
      c.fillStyle = '#000';
      c.fillRect(0, stripY, OUT_W, stripH);
      c.putImageData(stripData, stripShift, stripY);
    }
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function requestClipboard() {
    tellBtn.disabled = true;
    let text = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (e) {
      text = '';
    }
    if (!text) {
      const typed = window.prompt('Tell the Palace something to remember:');
      if (typed) text = typed;
    }
    clipboardText = (text || '').trim().slice(0, CLIP_MAX);
    tellBtn.hidden = true;
    snapBtn.hidden = false;
  }
})();
