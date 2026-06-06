/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CRITICAL HIT SMOKE — canvas particle smoke, mouse-reactive              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init(): grab #dm-smoke-canvas, size to viewport,  │
  │     start RAF loop, bind mousemove + resize                              │
  │                                                                          │
  │   tick(): per-frame                                                      │
  │     ├─ clear canvas                                                      │
  │     ├─ ~70% chance spawn a particle at the ashtray (bottom-right corner) │
  │     ├─ for each particle:                                                │
  │     │    age++; remove past maxLife                                      │
  │     │    vy -= 0.012 (smoke rises)                                       │
  │     │    vx += noise (curl)                                              │
  │     │    if dist(particle, mouse) < REPULSE_R:                           │
  │     │       push particle away (vector force ∝ 1/d)                      │
  │     │    damp vx, vy                                                     │
  │     │    move x, y                                                       │
  │     │    draw radial-gradient soft white at (x, y) with grow size +      │
  │     │       opacity falloff                                              │
  │     └─ RAF                                                               │
  │                                                                          │
  │   mousemove ──► record mouseX/Y; every Nth event spawn a wisp at cursor  │
  │                                                                          │
  │   Exports: window.CritSmoke = { init, particles }                        │
  │   External deps: none (vanilla canvas2d)                                 │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CAP=200 (particle cap); REPULSE_R=110; REPULSE_K=0.55
  state: canvas, ctx, particles=[], mouseX=mouseY=-9999, throttle=0
  Particle: {x,y,vx,vy,life,maxLife,size,seed}
  sourceXY()→[x,y]: bottom-right corner of viewport (ashtray loc), w/ jitter
  spawnSource(): if len<CAP push particle at sourceXY, vy=-0.6+rnd, size 10+rnd*10
  spawnAt(x,y): if len<CAP push particle at x,y with weaker upward push
  tick():
    ctx.clearRect; (~0.7 prob) spawnSource
    ∀p reverse: life++; if life>maxLife→splice; else
      vy-=0.012; vx+=rnd noise*0.05; damp 0.985
      mouse repulse: if d2<REPULSE_R² push (dx,dy)/d * (R-d)/R * REPULSE_K
      x+=vx; y+=vy
      t=life/maxLife; alpha=(1-t)*0.32 * fade-in;
      size=base*(1+t*1.6); radial gradient white→transparent
      ctx.fillStyle=grad; arc; fill
    RAF(tick)
  resize(): canvas.width/height = innerWidth/Height
  mousemove: mouseX/Y=client; throttle++; %3===0 → spawnAt(mouseX,mouseY)
  init(): canvas=#dm-smoke-canvas; ctx=2d; resize; addEventListener resize, mousemove; RAF(tick)
  exports: global.CritSmoke={init, particles}; DOMContentLoaded→init
*/
(function (global) {
  'use strict';

  const CAP = 1200;
  const REPULSE_R = 130;
  const REPULSE_R2 = REPULSE_R * REPULSE_R;
  const REPULSE_K = 0.65;
  const SOURCE_PER_FRAME = 6;  // particles emitted from the ashtray each frame

  let canvas = null;
  let ctx = null;
  let particles = [];
  let mouseX = -9999;
  let mouseY = -9999;

  function sourceXY() {
    // Smoulder source — bottom-right corner of viewport, where the CSS
    // ashtray sits. Jitter so the column isn't a perfect line.
    const w = window.innerWidth;
    const h = window.innerHeight;
    return [
      w - 90 + (Math.random() - 0.5) * 16,
      h - 70 + (Math.random() - 0.5) * 8,
    ];
  }

  function spawnSource() {
    if (particles.length >= CAP) return;
    const [x, y] = sourceXY();
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.65 - Math.random() * 0.7,
      life: 0,
      maxLife: 260 + Math.random() * 140,
      size: 16 + Math.random() * 16,
      seed: Math.random(),
    });
  }

  function spawnAt(x, y) {
    if (particles.length >= CAP) return;
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.45 - Math.random() * 0.45,
      life: 0,
      maxLife: 200 + Math.random() * 100,
      size: 14 + Math.random() * 14,
      seed: Math.random(),
    });
  }

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Steady billow from the ashtray — multiple particles per frame
    for (let s = 0; s < SOURCE_PER_FRAME; s++) spawnSource();
    // Extra wisps released along the cursor path each frame (matches the
    // ambient density to the trail, so a still mouse still has heavy smoke)
    if (mouseX > 0 && Math.random() < 0.75) {
      spawnAt(mouseX, mouseY);
      if (Math.random() < 0.5) spawnAt(mouseX + (Math.random() - 0.5) * 18, mouseY + (Math.random() - 0.5) * 10);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += 1;
      if (p.life > p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // Smoke wants to rise. Add a per-particle curl via sine of seed+life.
      p.vy -= 0.012;
      p.vx += Math.sin((p.life + p.seed * 100) * 0.05) * 0.04;
      p.vx += (Math.random() - 0.5) * 0.04;
      p.vx *= 0.985;
      p.vy *= 0.985;

      // Mouse repulsion — a hand parting the smoke. Force is normalized by
      // distance and falls off linearly inside REPULSE_R.
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const d2 = dx * dx + dy * dy;
      if (d2 < REPULSE_R2 && d2 > 1) {
        const d = Math.sqrt(d2);
        const force = ((REPULSE_R - d) / REPULSE_R) * REPULSE_K;
        p.vx += (dx / d) * force;
        p.vy += (dy / d) * force;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Lifecycle: fade in for first 10%, then linearly fade out.
      const t = p.life / p.maxLife;
      const fadeIn = t < 0.1 ? t / 0.1 : 1;
      const alpha = (1 - t) * 0.45 * fadeIn;
      const size = p.size * (1 + t * 2.0);

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grad.addColorStop(0, 'rgba(255, 250, 245, ' + alpha + ')');
      grad.addColorStop(0.5, 'rgba(220, 215, 210, ' + (alpha * 0.65) + ')');
      grad.addColorStop(1, 'rgba(180, 175, 170, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function init() {
    canvas = document.getElementById('dm-smoke-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      // 2 wisps per event — denser, more cinematic trail
      spawnAt(mouseX, mouseY);
      spawnAt(mouseX + (Math.random() - 0.5) * 12, mouseY + (Math.random() - 0.5) * 12);
    }, { passive: true });
    // Touch support — the dragged finger leaves a smoke trail too.
    window.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches[0]) return;
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
      spawnAt(mouseX, mouseY);
      spawnAt(mouseX + (Math.random() - 0.5) * 12, mouseY + (Math.random() - 0.5) * 12);
    }, { passive: true });

    requestAnimationFrame(tick);
  }

  global.CritSmoke = { init, particles };
  document.addEventListener('DOMContentLoaded', init);
})(window);
