/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  JACK AND GIN — glitch decals (posterized photo overlays)                │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │     │                                                                    │
  │     └─ ∀{key,src}∈SOURCES:                                               │
  │         loadImage(src) ──► img                                           │
  │           └─ processForPalace(img, SIZE) ──► dataURL                     │
  │                ├─ posterize per channel to POST_STEPS=4                  │
  │                ├─ Laplacian edge stamp (|Δ|>50 darkens by INK=160)       │
  │                └─ duotone ramp into PALETTE                              │
  │                   (gloss-black → cherry → plastic-gold → marble)         │
  │         body.style.setProperty('--jg-decal-'+key, url(data:…))           │
  │       body.classList.add('jg-decals-ready')                              │
  │                                                                          │
  │   CSS hooks (consumed by css/jackandgin/jackandgin.css):                 │
  │     --jg-decal-murders   80s murders.jpg, palettized                     │
  │     --jg-decal-moloch1    moloch1.webp,    palettized                      │
  │     --jg-decal-moloch2    moloch2.jpg,     palettized                      │
  │     body.jg-decals-ready triggers fade-in transitions                    │
  │                                                                          │
  │   Algorithm — fork of js/tarot/page.js posterizeAndInk, dialed harder    │
  │   (4 levels per channel instead of 8, ink 160 instead of 90, then        │
  │   duotone-ramped into the gilded plastic-luxury palette).                │
  │                                                                          │
  │   Exports: none (side-effects only — sets body CSS vars + class)         │
  │   External deps: ../assets/images/{80s murders.jpg, moloch1.webp,        │
  │     moloch2.jpg}                                                         │
  │   Consumers: pages/jackandgin.html, css/jackandgin/jackandgin.css        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  SIZE=320; POST_STEPS=4; EDGE_THRESH=50; EDGE_INK=160
  PALETTE=[[10,8,8],[107,15,26],[212,175,55],[245,232,200]]  // K→cherry→gold→ivory
  SOURCES=[{murders:'../assets/images/80s murders.jpg'},{moloch1:'../assets/images/moloch1.webp'},{moloch2:'../assets/images/moloch2.jpg'}]
  loadImage(src)→Promise<Image>: new Image()+onload/onerror+src
  sample(L)→[r,g,b]: t=L/255*(PALETTE.len-1); lerp(PALETTE[⌊t⌋],PALETTE[⌊t⌋+1],frac)
  processForPalace(img,size)→dataURL: drawImage; getImageData; ∀px out=round(c/step)*step,step=255/(POST_STEPS-1); gray=Σch/3; ∀(x,y) lap=Laplacian; |lap|>EDGE_THRESH→out-=EDGE_INK; ∀px out=sample(mean(out)); putImageData; toDataURL
  init():async: ∀src loadImage→processForPalace→body.style.setProperty('--jg-decal-'+key,url(data:…)); body.classList.add('jg-decals-ready'); catch→console.warn
  bind: readyState=='loading'?DOMContentLoaded→init:init()
  exports: none; CSS-vars only: --jg-decal-{murders,moloch1,moloch2}, body.jg-decals-ready
*/

(function () {
  const SIZE = 320;
  const POST_STEPS = 4;
  const EDGE_THRESH = 50;
  const EDGE_INK = 160;

  // Gloss-black → maraschino → plastic-gold → marble. Same tokens the CSS
  // uses, hard-coded here so the script stays standalone.
  const PALETTE = [
    [10,  8,  8],
    [107, 15, 26],
    [212, 175, 55],
    [245, 232, 200],
  ];

  const SOURCES = [
    { key: 'murders', src: '../assets/images/80s murders.jpg' },
    { key: 'moloch1',  src: '../assets/images/moloch1.webp'    },
    { key: 'moloch2',  src: '../assets/images/moloch2.jpg'     },
  ];

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('failed to load ' + src));
      img.src = src;
    });
  }

  function sample(L) {
    const t = (L / 255) * (PALETTE.length - 1);
    const i = Math.min(PALETTE.length - 2, Math.max(0, Math.floor(t)));
    const f = t - i;
    const a = PALETTE[i];
    const b = PALETTE[i + 1];
    return [
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ];
  }

  function processForPalace(img, size) {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);

    const id = ctx.getImageData(0, 0, size, size);
    const src = id.data;
    const out = new Uint8ClampedArray(src);

    // 1) Hard posterize per channel.
    const step = 255 / (POST_STEPS - 1);
    for (let i = 0; i < src.length; i += 4) {
      out[i]     = Math.round(src[i]     / step) * step;
      out[i + 1] = Math.round(src[i + 1] / step) * step;
      out[i + 2] = Math.round(src[i + 2] / step) * step;
    }

    // 2) Laplacian edge ink — punches harder than the tarot version so the
    // pressed-on stamp reads even at low opacity.
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, g = 0; i < src.length; i += 4, g++) {
      gray[g] = (src[i] + src[i + 1] + src[i + 2]) / 3;
    }
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const g = y * size + x;
        const lap = 8 * gray[g]
          - gray[g - size - 1] - gray[g - size] - gray[g - size + 1]
          - gray[g - 1]                          - gray[g + 1]
          - gray[g + size - 1] - gray[g + size] - gray[g + size + 1];
        if (Math.abs(lap) > EDGE_THRESH) {
          const j = g * 4;
          out[j]     = Math.max(0, out[j]     - EDGE_INK);
          out[j + 1] = Math.max(0, out[j + 1] - EDGE_INK);
          out[j + 2] = Math.max(0, out[j + 2] - EDGE_INK);
        }
      }
    }

    // 3) Duotone-ramp into the palace palette. Posterized luminance picks
    // a point along [gloss-black, maraschino, gold, marble].
    for (let i = 0; i < out.length; i += 4) {
      const L = (out[i] + out[i + 1] + out[i + 2]) / 3;
      const c = sample(L);
      out[i]     = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
    }

    ctx.putImageData(new ImageData(out, size, size), 0, 0);
    return off.toDataURL('image/png');
  }

  async function init() {
    try {
      for (const { key, src } of SOURCES) {
        const img = await loadImage(src);
        const url = processForPalace(img, SIZE);
        document.body.style.setProperty('--jg-decal-' + key, "url('" + url + "')");
      }
      document.body.classList.add('jg-decals-ready');
    } catch (e) {
      console.warn('[jackandgin] decal processing failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
