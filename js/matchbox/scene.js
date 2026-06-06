/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MATCHBOX SCENE — single-source heavy mash of loteria-cards.jpg          │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   On DOMContentLoaded:                                                   │
  │     loadImage(loteria-cards.jpg) → original                              │
  │       drawImage(original) → canvas                                       │
  │       (1) ONE light-mash pass (random effect, gentle pool only)          │
  │       (2) Duotone tint to a random dusty/deep palette                    │
  │       (3) Posterize UNTOUCHED original on side canvas, composite back    │
  │            over tinted mash with random blend mode + 50-80% alpha so     │
  │            the loteria cards remain recognizable                         │
  │       canvas.toDataURL('image/jpeg', .82) → CSS --scene-mash             │
  │                                                                          │
  │   Every page load: random light-mash effect, random tint palette,        │
  │   random posterize level, random blend mode. Cards stay readable;        │
  │   color and texture rotate.                                              │
  │                                                                          │
  │   Effect functions copied from tarot/page.js — kept local so scene.js    │
  │   doesn't need the tarot script.                                         │
  │                                                                          │
  │   Exports: none (side-effect on .loteria-scene only)                     │
  │   External deps: Canvas 2D + Image.                                      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIZE=800; ASSETS={loteria:'../assets/images/loteria-cards.jpg'}; PASSES=4..6
  loadImage(src)→Promise<Image>: onload→resolve; onerror→reject(Error 'failed to load '+src)
  snapshotCanvas(canvas)→Promise<Image>: src=toDataURL('png')
  Effects (each ctx,a,b,size):
    sliceShuffle: rnd horizontal slices from a|b, 3-30px tall, src-y rnd
    waveWarp: sin offset rows of A, screen-blend B
    shear: linear-y shear rows of A, screen-blend B
    ripple: per-pixel sin(x), sin(y) displacement of A
    scanShift: rnd per-row ±10..40px offset of A, screen-blend B
    channelSwap: R from A, G from B (else A); ±2..8px chroma shift
    swirl: radial twist around rnd center, falloff with distance
    mirror: mirror half→other half, screen-blend B
    posterize: 2-6 levels per channel, screen-blend B
    hueRotate: ctx.filter='hue-rotate(Ndeg)' drawImage A, screen-blend B
    datamosh: drawImage(a) + 4-8 tear blocks + 10-20 H shred + 6-14 V shred + 0-3 stutter + 150-400 pixel noise
    gradient: linear gradient overlay (rnd palette, rnd ang, rnd blend mode)
    colorize: solid color fill overlay (rnd color, rnd blend mode)
  EFFECT_POOL=[13 effects]
  generateBackground():async→dataURL: load original; drawImage(original); current=original; LOOP 4-6: eff=rnd(POOL); b=rnd<.4?original:current; eff(ctx,current,b,SIZE); current=snapshot; END; ret toDataURL('jpeg',0.82)
  init():async: scene=$('.loteria-scene'); !scene→ret; try{url=await generate; --scene-mash=url; .scene-mashed} catch(e){console.error}
  exports: none; on DOMContentLoaded→init
*/
(function (global) {
  const SIZE = 800;
  const ASSETS = {
    loteria: '../assets/images/loteria-cards.jpg',
  };

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('failed to load ' + src));
      img.src = src;
    });
  }

  function snapshotCanvas(canvas) {
    return new Promise((resolve, reject) => {
      const snap = new Image();
      snap.onload = () => resolve(snap);
      snap.onerror = reject;
      snap.src = canvas.toDataURL('image/png');
    });
  }

  // ─── Effects: each takes (ctx, a, b, size). For two-image effects, a is
  //     the base and b screen-blends (or contributes torn fragments). For
  //     single-source effects, b is ignored; we pass it anyway so the
  //     dispatch loop stays uniform.

  function effectSliceShuffle(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const sources = [a, b];
    let y = 0;
    while (y < size) {
      const sliceH = 3 + Math.floor(Math.random() * 28);
      const h = Math.min(sliceH, size - y);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth || size;
      const srcH = src.naturalHeight || size;
      const sh = (h / size) * srcH;
      const maxSY = Math.max(0, srcH - sh);
      const sy = Math.floor(Math.random() * maxSY);
      ctx.drawImage(src, 0, sy, srcW, sh, 0, y, size, h);
      y += h;
    }
  }

  function effectWaveWarp(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const amplitude = 8 + Math.random() * 28;
    const frequency = 0.03 + Math.random() * 0.05;
    const rowH = 2;
    const srcW = a.naturalWidth || size;
    const srcH = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = Math.sin(y * frequency) * amplitude;
      const sy = (y / size) * srcH;
      const sh = (rowH / size) * srcH;
      ctx.drawImage(a, 0, sy, srcW, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectShear(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const shear = (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1);
    const rowH = 2;
    const srcW = a.naturalWidth || size;
    const srcH = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = (y / size - 0.5) * shear * size;
      const sy = (y / size) * srcH;
      const sh = (rowH / size) * srcH;
      ctx.drawImage(a, 0, sy, srcW, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectRipple(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const src = ctx.getImageData(0, 0, size, size);
    const out = ctx.createImageData(size, size);
    const amp = 4 + Math.random() * 16;
    const freqX = 0.04 + Math.random() * 0.06;
    const freqY = 0.04 + Math.random() * 0.06;
    for (let y = 0; y < size; y++) {
      const yShift = Math.sin(y * freqX) * amp;
      for (let x = 0; x < size; x++) {
        const xShift = Math.sin(x * freqY) * amp;
        let sx = (x + yShift) | 0;
        let sy = (y + xShift) | 0;
        if (sx < 0) sx = 0; else if (sx >= size) sx = size - 1;
        if (sy < 0) sy = 0; else if (sy >= size) sy = size - 1;
        const srcIdx = (sy * size + sx) * 4;
        const dstIdx = (y * size + x) * 4;
        out.data[dstIdx]     = src.data[srcIdx];
        out.data[dstIdx + 1] = src.data[srcIdx + 1];
        out.data[dstIdx + 2] = src.data[srcIdx + 2];
        out.data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function effectScanShift(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const rowH = 1 + Math.floor(Math.random() * 2);
    const maxShift = 10 + Math.floor(Math.random() * 30);
    const srcW = a.naturalWidth || size;
    const srcH = a.naturalHeight || size;
    for (let y = 0; y < size; y += rowH) {
      const offset = (Math.random() - 0.5) * 2 * maxShift;
      const sy = (y / size) * srcH;
      const sh = (rowH / size) * srcH;
      ctx.drawImage(a, 0, sy, srcW, sh, offset, y, size, rowH);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectChannelSwap(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const dataA = ctx.getImageData(0, 0, size, size).data;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(b, 0, 0, size, size);
    const dataB = ctx.getImageData(0, 0, size, size).data;
    const out = ctx.createImageData(size, size);
    const op = out.data;
    for (let i = 0; i < op.length; i += 4) {
      op[i]     = dataA[i];
      op[i + 1] = dataB[i + 1];
      op[i + 2] = dataA[i + 2];
      op[i + 3] = 255;
    }
    const magnitude = 2 + Math.floor(Math.random() * 7);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const shift = magnitude * dir;
    const channel = Math.random() < 0.4 ? 1 : 0;
    for (let y = 0; y < size; y++) {
      const rowOff = y * size * 4;
      if (shift > 0) {
        for (let x = size - 1; x >= shift; x--) {
          op[rowOff + x * 4 + channel] = op[rowOff + (x - shift) * 4 + channel];
        }
      } else {
        const abs = -shift;
        for (let x = 0; x < size - abs; x++) {
          op[rowOff + x * 4 + channel] = op[rowOff + (x + abs) * 4 + channel];
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function effectSwirl(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const src = ctx.getImageData(0, 0, size, size);
    const out = ctx.createImageData(size, size);
    const cx = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const cy = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const maxR = size * 0.6;
    const twist = (1.5 + Math.random() * 2.5) * (Math.random() < 0.5 ? 1 : -1);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const f = Math.max(0, 1 - r / maxR);
        const a2 = Math.atan2(dy, dx) + twist * f;
        let sx = (cx + Math.cos(a2) * r) | 0;
        let sy = (cy + Math.sin(a2) * r) | 0;
        if (sx < 0) sx = 0; else if (sx >= size) sx = size - 1;
        if (sy < 0) sy = 0; else if (sy >= size) sy = size - 1;
        const si = (sy * size + sx) * 4;
        const di = (y  * size + x)  * 4;
        out.data[di]     = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function effectMirror(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
    const mode = Math.floor(Math.random() * 4);
    const half = size / 2;
    ctx.save();
    if (mode === 0) {
      ctx.translate(size, 0); ctx.scale(-1, 1);
      ctx.drawImage(tmp, 0, 0, half, size, 0, 0, half, size);
    } else if (mode === 1) {
      ctx.translate(size, 0); ctx.scale(-1, 1);
      ctx.drawImage(tmp, half, 0, half, size, half, 0, half, size);
    } else if (mode === 2) {
      ctx.translate(0, size); ctx.scale(1, -1);
      ctx.drawImage(tmp, 0, 0, size, half, 0, 0, size, half);
    } else {
      ctx.translate(0, size); ctx.scale(1, -1);
      ctx.drawImage(tmp, 0, half, size, half, 0, half, size, half);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectPosterize(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const levels = 2 + Math.floor(Math.random() * 5);
    const step = 255 / (levels - 1);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i]     = Math.round(Math.round(data.data[i]     / step) * step);
      data.data[i + 1] = Math.round(Math.round(data.data[i + 1] / step) * step);
      data.data[i + 2] = Math.round(Math.round(data.data[i + 2] / step) * step);
    }
    ctx.putImageData(data, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectHueRotate(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    const hueDeg = Math.floor(Math.random() * 360);
    const sat = (1.2 + Math.random() * 0.8).toFixed(2);
    ctx.filter = 'hue-rotate(' + hueDeg + 'deg) saturate(' + sat + ')';
    ctx.drawImage(a, 0, 0, size, size);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(b, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectDatamosh(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a, 0, 0, size, size);
    const sources = [a, b];
    const blocks = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < blocks; i++) {
      const w = (0.18 + Math.random() * 0.45) * size;
      const h = (0.10 + Math.random() * 0.40) * size;
      const x = Math.random() * (size - w);
      const y = Math.random() * (size - h);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearXMag = (0.20 + Math.random() * 0.30) * size;
      const tearYMag = (0.10 + Math.random() * 0.15) * size;
      const tearX = (Math.random() - 0.5) * 2 * tearXMag;
      const tearY = (Math.random() - 0.5) * 2 * tearYMag;
      let sx = (x + tearX) / size * srcW;
      let sy = (y + tearY) / size * srcH;
      const sw = w / size * srcW;
      const sh = h / size * srcH;
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx + sw > srcW) sx = srcW - sw;
      if (sy + sh > srcH) sy = srcH - sh;
      ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
    }
    const hBands = 10 + Math.floor(Math.random() * 11);
    for (let i = 0; i < hBands; i++) {
      const bandH = 2 + Math.floor(Math.random() * 9);
      const y = Math.random() * (size - bandH);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearY = (Math.random() - 0.5) * size * 0.6;
      let sy = (y + tearY) / size * srcH;
      const sh = bandH / size * srcH;
      if (sy < 0) sy = 0;
      if (sy + sh > srcH) sy = srcH - sh;
      ctx.drawImage(src, 0, sy, srcW, sh, 0, y, size, bandH);
    }
    const vBands = 6 + Math.floor(Math.random() * 9);
    for (let i = 0; i < vBands; i++) {
      const bandW = 2 + Math.floor(Math.random() * 9);
      const x = Math.random() * (size - bandW);
      const src = sources[Math.floor(Math.random() * sources.length)];
      const srcW = src.naturalWidth  || size;
      const srcH = src.naturalHeight || size;
      const tearX = (Math.random() - 0.5) * size * 0.5;
      let sx = (x + tearX) / size * srcW;
      const sw = bandW / size * srcW;
      if (sx < 0) sx = 0;
      if (sx + sw > srcW) sx = srcW - sw;
      ctx.drawImage(src, sx, 0, sw, srcH, x, 0, bandW, size);
    }
    const stutters = Math.floor(Math.random() * 4);
    for (let i = 0; i < stutters; i++) {
      const w = (0.20 + Math.random() * 0.35) * size;
      const h = (0.15 + Math.random() * 0.30) * size;
      const x = Math.random() * (size - w);
      const y = Math.random() * (size - h);
      const dx = (Math.random() - 0.5) * 30;
      const dy = (Math.random() - 0.5) * 20;
      const cap = ctx.getImageData(x, y, w, h);
      ctx.putImageData(cap, x + dx, y + dy);
    }
    const noiseCount = 150 + Math.floor(Math.random() * 251);
    for (let i = 0; i < noiseCount; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      const sz = 1 + Math.floor(Math.random() * 3);
      ctx.fillStyle = Math.random() < 0.55 ? '#ff66cc' : '#9bdc82';
      ctx.fillRect(x, y, sz, sz);
    }
  }

  function effectGradient(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    const palettes = [
      ['#ff66cc', '#9bdc82'],
      ['#aa66ff', '#ff66cc'],
      ['#ffaa44', '#aa66ff'],
      ['#66ccff', '#ff66cc'],
      ['#ff5577', '#9bdc82'],
      ['#ff99dd', '#3a0a4a'],
    ];
    const [c1, c2] = palettes[Math.floor(Math.random() * palettes.length)];
    const ang = Math.random() * Math.PI * 2;
    const half = size / 2;
    const grad = ctx.createLinearGradient(
      half + Math.cos(ang) * half, half + Math.sin(ang) * half,
      half - Math.cos(ang) * half, half - Math.sin(ang) * half
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    const ops = ['overlay', 'soft-light', 'color', 'hue', 'multiply', 'hard-light'];
    ctx.globalCompositeOperation = ops[Math.floor(Math.random() * ops.length)];
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function effectColorize(ctx, a, b, size) {
    ctx.globalCompositeOperation = 'source-over';
    const colors = ['#ff66cc', '#9bdc82', '#ffaa44', '#aa66ff', '#66ccff', '#ff5577'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const ops = ['multiply', 'screen', 'overlay', 'color-burn', 'soft-light', 'hard-light'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Pool of effects gentle enough to leave cards recognizable after one
  // pass. Destructive effects (ripple, swirl, datamosh) are deliberately
  // excluded — we only want texture and distortion, not abstraction.
  const LIGHT_MASH = [
    effectSliceShuffle,
    effectWaveWarp,
    effectShear,
    effectMirror,
    effectScanShift,
    effectHueRotate,
    effectChannelSwap,
  ];

  // Tint palettes for stage 2. Each entry duotones the canvas from lo
  // (deep shadow) to hi (highlight). Mix of dusty yellow/sepia warm
  // palettes and saturated-but-deep cool palettes.
  const TINT_PALETTES = [
    { lo: { r: 14, g: 10, b:  4 }, hi: { r: 200, g: 162, b:  68 } }, // dusty yellow
    { lo: { r:  8, g:  6, b:  2 }, hi: { r: 160, g: 128, b:  56 } }, // dim sepia
    { lo: { r: 18, g: 12, b:  6 }, hi: { r: 220, g: 180, b:  90 } }, // bright dust
    { lo: { r:  6, g: 10, b: 30 }, hi: { r:  72, g: 116, b: 196 } }, // deep navy
    { lo: { r: 24, g:  6, b: 10 }, hi: { r: 200, g:  72, b:  80 } }, // deep red
    { lo: { r: 14, g:  6, b: 24 }, hi: { r: 120, g:  64, b: 180 } }, // deep purple
    { lo: { r:  4, g: 16, b: 14 }, hi: { r:  80, g: 168, b: 120 } }, // deep teal
  ];

  async function generateBackground() {
    const original = await loadImage(ASSETS.loteria);

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(original, 0, 0, SIZE, SIZE);

    // (1) Single light mash pass — distorts the lotería sheet without
    //     destroying the card grid recognizability.
    const eff = LIGHT_MASH[Math.floor(Math.random() * LIGHT_MASH.length)];
    eff(ctx, original, original, SIZE);

    // (2) Duotone tint — crush brightness into one of the dusty/deep
    //     palettes. Everything becomes single-hue with a flat shadow.
    const { lo, hi } = TINT_PALETTES[Math.floor(Math.random() * TINT_PALETTES.length)];
    const tint = ctx.getImageData(0, 0, SIZE, SIZE);
    const dr = hi.r - lo.r, dg = hi.g - lo.g, db = hi.b - lo.b;
    for (let i = 0; i < tint.data.length; i += 4) {
      const bright = (tint.data[i] + tint.data[i + 1] + tint.data[i + 2]) / (3 * 255);
      tint.data[i]     = lo.r + dr * bright;
      tint.data[i + 1] = lo.g + dg * bright;
      tint.data[i + 2] = lo.b + db * bright;
    }
    ctx.putImageData(tint, 0, 0);

    // (3) Posterize the UNTOUCHED original on a side canvas, then composite
    //     it over the tinted mash with a random blend mode + alpha. The
    //     posterized loteria-grid bleeds back through, restoring the cards
    //     as recognizable shapes on top of the colored chaos.
    const overlay = document.createElement('canvas');
    overlay.width = SIZE;
    overlay.height = SIZE;
    const octx = overlay.getContext('2d');
    octx.drawImage(original, 0, 0, SIZE, SIZE);
    const overlayData = octx.getImageData(0, 0, SIZE, SIZE);
    const levels = 2 + Math.floor(Math.random() * 4); // 2-5 brightness levels
    const step = 255 / (levels - 1);
    for (let i = 0; i < overlayData.data.length; i += 4) {
      overlayData.data[i]     = Math.round(Math.round(overlayData.data[i]     / step) * step);
      overlayData.data[i + 1] = Math.round(Math.round(overlayData.data[i + 1] / step) * step);
      overlayData.data[i + 2] = Math.round(Math.round(overlayData.data[i + 2] / step) * step);
    }
    octx.putImageData(overlayData, 0, 0);

    const blendModes = ['overlay', 'screen', 'soft-light', 'hard-light', 'multiply'];
    ctx.globalCompositeOperation = blendModes[Math.floor(Math.random() * blendModes.length)];
    ctx.globalAlpha = 0.5 + Math.random() * 0.3; // 50-80% opacity
    ctx.drawImage(overlay, 0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    return canvas.toDataURL('image/jpeg', 0.82);
  }

  // Sample three brightness percentiles from the final canvas: a dark
  // shadow, a midtone, and a highlight. Cabinet panels then color
  // themselves from these so the play space picks up the mash palette
  // each load (dusty yellow mash → dusty yellow cabinet, etc.).
  function sampleCanvasPalette(ctx, size) {
    const data = ctx.getImageData(0, 0, size, size).data;
    const samples = [];
    // every 4th pixel keeps the work cheap (~40k samples on 800×800)
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      samples.push([r, g, b, r + g + b]);
    }
    samples.sort((a, b) => a[3] - b[3]);
    const n = samples.length;
    const pick = (frac) => samples[Math.min(n - 1, Math.floor(n * frac))];
    return {
      dark:  pick(0.20),
      mid:   pick(0.50),
      light: pick(0.82),
    };
  }

  function rgbStr(arr) {
    return 'rgb(' + arr[0] + ', ' + arr[1] + ', ' + arr[2] + ')';
  }

  async function init() {
    const scene = document.querySelector('.loteria-scene');
    if (!scene) return;
    try {
      const dataUrl = await generateBackground();
      // Body, not scene — the mash takes the full viewport like a
      // magazine ad and the cabinet sits centered on top of it.
      document.body.style.setProperty('--scene-mash', `url("${dataUrl}")`);

      // Sample palette from the most-recent canvas. generateBackground
      // already left the final composite on its private canvas; re-load
      // the same data into a fresh canvas to sample.
      const sampler = document.createElement('canvas');
      sampler.width = SIZE;
      sampler.height = SIZE;
      const sctx = sampler.getContext('2d');
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = dataUrl;
      });
      sctx.drawImage(img, 0, 0, SIZE, SIZE);
      const palette = sampleCanvasPalette(sctx, SIZE);
      document.body.style.setProperty('--scene-color-light', rgbStr(palette.light));
      document.body.style.setProperty('--scene-color-mid',   rgbStr(palette.mid));
      document.body.style.setProperty('--scene-color-dark',  rgbStr(palette.dark));

      document.body.classList.add('scene-mashed');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('matchbox scene mash failed:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
