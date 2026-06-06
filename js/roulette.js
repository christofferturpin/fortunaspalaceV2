/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ROULETTE  —  Russian-roulette pull-the-trigger gambling minigame        │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ grabs #rr-trigger/result/counter/cylinder/   │
  │                          │  revolver/flash/blackout DOM refs             │
  │                          ├─ #rr-trigger click ──► pull()                 │
  │                          └─ #rr-revolver click ──► pull()  (gun = btn)   │
  │                                                                          │
  │   pull():                                                                │
  │     ├─ guards via pulling flag                                           │
  │     ├─ Child.recordPlay()                                                │
  │     ├─ disables trigger; adds .is-shake class                            │
  │     └─ spinCylinder(callback)                                            │
  │           │                                                              │
  │           └─► rAF step() ──► rotate cylinder w/ ease(t)=1-(1-t)^4.2     │
  │                ├─ ratchetClick() per 60° segment (throttled 28ms)        │
  │                └─ on done ──► lockInClick(); callback()                  │
  │                                                                          │
  │   callback ──► remove shake ──► setTimeout ──► decideFate()              │
  │                                                                          │
  │   decideFate() ──► random < DEATH_CHANCE(1/6) ? doDie() : doSurvive()    │
  │                                                                          │
  │   doSurvive():                                                           │
  │     ├─ emptyPinClick()                                                   │
  │     ├─ survived++; Wallet.add(REWARD=100)                                │
  │     ├─ updates result + counter text                                     │
  │     └─ refreshGate() after 550ms (re-evaluates last-resort cap)          │
  │                                                                          │
  │   Last-resort gate:                                                      │
  │     refreshGate() ──► if Wallet.getBalance() >= 100 then trigger         │
  │                       disabled, label 'Spend down first', revolver       │
  │                       cursor not-allowed; else re-enable. Called from    │
  │                       init(), Wallet.onChange, and after doSurvive.      │
  │                       Mirrors the lobby card-blackout in index.html.     │
  │                                                                          │
  │   doDie():                                                               │
  │     ├─ markDead() ──► localStorage 'wendys_palace_death'                 │
  │     │                  = {dead:true, choice:null}                        │
  │     ├─ fireFlash() ──► rAF expanding muzzle flash radius+opacity         │
  │     ├─ gunshot()   ──► sub-bass thump + 3 noise layers                   │
  │     ├─ revolver .is-firing; result 'BANG.'                               │
  │     ├─ blackout .is-burst → .is-on                                       │
  │     └─ setTimeout(DEATH_REDIRECT_MS) ──► location.replace('death.html')  │
  │                                                                          │
  │   Audio primitives:                                                      │
  │     ensureCtx()                ──► lazy AudioContext + masterGain        │
  │     tone(freq,dur,opts)        ──► oscillator w/ exp gain decay          │
  │     noise(dur,opts)            ──► buffer src + biquad filter            │
  │     ratchetClick()             ──► tone + noise (throttled)              │
  │     lockInClick()              ──► 2 tones + noise (cylinder locks)      │
  │     emptyPinClick()            ──► 2 tones + noise (dry-fire)            │
  │     gunshot()                  ──► osc thump + 3 noise layers            │
  │                                                                          │
  │   Exports: none (IIFE on global=window, side-effect only)                │
  │   External deps: window.Child (recordPlay),                              │
  │                  window.Wallet (add),                                    │
  │                  localStorage 'wendys_palace_death',                     │
  │                  Web Audio API, location.replace('death.html')           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST: REWARD=100, DEATH_CHANCE=1/6, DEATH_STORAGE_KEY='wendys_palace_death', SPIN_DURATION_MS=2400, POST_SPIN_PAUSE_MS=320, DEATH_REDIRECT_MS=1150, MAX_BALANCE=100
  state: survived=0, pulling=F, cylinderAngle=0, audioCtx=null, masterGain=null, els={}
  init(): grab #rr-trigger/result/counter/cylinder/revolver/flash/blackout; guard !trigger; bind trigger.click→pull; bind revolver.click→pull; revolver.style.cursor='pointer'; refreshGate; Wallet.onChange→refreshGate
  isBlocked()→bool: Wallet.getBalance>=MAX_BALANCE
  refreshGate(): isBlocked?trigger.disabled=T,label='Spend down first',revolver.cursor='not-allowed',result='Last resort only…' : !pulling?trigger.disabled=F,label='Pull the Trigger',revolver.cursor='pointer'
  pull(): guard pulling=T; isBlocked→refreshGate+ret; Child.recordPlay; trigger.disabled=T; result.text=''+class reset; revolver.add('is-shake'); spinCylinder(cb): remove shake+setTimeout(POST_SPIN_PAUSE_MS)→decideFate
  decideFate(): rnd<DEATH_CHANCE?doDie:doSurvive
  doSurvive(): emptyPinClick; survived++; Wallet.add(REWARD); result='click. +100 coins.'+survive class; counter=`Survived: ${n}`; setTimeout 550→pulling=F, refreshGate
  doDie(): markDead; fireFlash; gunshot; revolver.add('is-firing'); result='BANG.'+death class; setTimeout 70→blackout.add('is-burst')+setTimeout 90→swap to 'is-on'; setTimeout DEATH_REDIRECT_MS→location.replace('death.html')
  spinCylinder(onComplete): startAngle=cur; fullTurns=3.5+rnd·1.5; totalRot=360·turns+floor(rnd·6)·60; ease(t)=1-(1-t)^4.2; rAF step(now): t=min(1,(now-start)/dur); angle=start+totalRot·ease(t); cylinder.transform='rotate(angle)'; seg=floor(angle/60); seg !=lastSeg→ratchetClick; t<1→rAF else lockInClick+onComplete
  fireFlash(): rAF step: t=elapsed/380; r=400·t; opacity=t<.35?t/.35:max(0,1-(t-.35)/.65); flash.setAttr(r,opacity); t≥1→r=0,opacity=0
  ensureCtx()→ctx|null: lazy AudioContext; resume if suspended; masterGain=.5→destination
  tone(freq,dur,opts): osc(type=opts.type||square, freq)→g→master; g: 0→vol(attack), expRamp(.001,dur); start/stop
  noise(dur,opts): buf rand[-1,1]·len; src→biquad(filterType/Freq/Q)→g→master; g: 0→vol(.004), expRamp(.001,dur)
  ratchetClick(): rate-limit 28ms via lastRatchetMs; tone(780±260,.045,sq,.09) + noise(.035,highpass,3200,Q.6,.05)
  lockInClick(): tone(190,.09,sq,.18) + tone(72,.13,sine,.14) + noise(.08,bandpass,580,Q1.6,.10)
  emptyPinClick(): tone(112,.07,sq,.20) + tone(58,.10,sine,.13) + noise(.06,bandpass,340,Q1,.09)
  gunshot(): sub-bass osc sine 200→38 over .28s, gain 0→.55→.001 over .55s + 3 noise layers: crack(.16,bandpass 2400,Q.7,.5), rumble(.55,lowpass 600,Q.5,.4), tail(.32,bandpass 1100,Q.4,.22)
  markDead(): try localStorage[DEATH_STORAGE_KEY]=JSON{dead:T,choice:null}
  exports: none (IIFE on window); on DOMContentLoaded→init
*/

(function (global) {
  const REWARD = 100;
  const DEATH_CHANCE = 1 / 6;
  const DEATH_STORAGE_KEY = 'wendys_palace_death';
  const SPIN_DURATION_MS = 2400;
  const POST_SPIN_PAUSE_MS = 320;
  const DEATH_REDIRECT_MS = 1150;
  /* Last-resort gate: roulette is a desperation game. The trigger is only
     enabled when the current balance is BELOW MAX_BALANCE (i.e. you have
     less than 100 coins). Matches the lobby blackout in index.html, which
     hides the card when balance >= 100, and the route guard. */
  const MAX_BALANCE = 100;

  let survived = 0;
  let pulling = false;
  let cylinderAngle = 0;
  let audioCtx = null;
  let masterGain = null;
  const els = {};

  function init() {
    els.trigger  = document.getElementById('rr-trigger');
    els.result   = document.getElementById('rr-result');
    els.counter  = document.getElementById('rr-counter');
    els.cylinder = document.getElementById('rr-cylinder');
    els.revolver = document.getElementById('rr-revolver');
    els.flash    = document.getElementById('rr-flash');
    els.blackout = document.getElementById('rr-blackout');
    if (!els.trigger) return;
    els.trigger.addEventListener('click', pull);
    if (els.revolver) {
      els.revolver.style.cursor = 'pointer';
      els.revolver.addEventListener('click', pull);
    }
    refreshGate();
    if (global.Wallet && typeof global.Wallet.onChange === 'function') {
      global.Wallet.onChange(refreshGate);
    }
  }

  function isBlocked() {
    var bal = (global.Wallet && global.Wallet.getBalance()) || 0;
    return bal >= MAX_BALANCE;
  }

  function refreshGate() {
    if (!els.trigger) return;
    if (isBlocked()) {
      els.trigger.disabled = true;
      els.trigger.textContent = 'Spend down first';
      if (els.revolver) els.revolver.style.cursor = 'not-allowed';
      if (els.result && !els.result.textContent) {
        els.result.textContent = 'Last resort only — you have ' + MAX_BALANCE + ' or more coins.';
        els.result.className = 'rr-result';
      }
    } else if (!pulling) {
      els.trigger.disabled = false;
      els.trigger.textContent = 'Pull the Trigger';
      if (els.revolver) els.revolver.style.cursor = 'pointer';
    }
  }

  function pull() {
    if (pulling) return;
    if (isBlocked()) { refreshGate(); return; }
    pulling = true;
    if (global.Child) global.Child.recordPlay();
    els.trigger.disabled = true;
    els.result.textContent = '';
    els.result.className = 'rr-result';
    els.revolver.classList.add('is-shake');
    spinCylinder(function () {
      els.revolver.classList.remove('is-shake');
      setTimeout(decideFate, POST_SPIN_PAUSE_MS);
    });
  }

  function decideFate() {
    if (Math.random() < DEATH_CHANCE) doDie();
    else doSurvive();
  }

  function doSurvive() {
    emptyPinClick();
    survived += 1;
    Wallet.add(REWARD);
    els.result.textContent = 'click. +' + REWARD + ' coins.';
    els.result.className = 'rr-result survive';
    els.counter.textContent = 'Survived: ' + survived;
    setTimeout(function () {
      pulling = false;
      refreshGate();
    }, 550);
  }

  function doDie() {
    markDead();
    fireFlash();
    gunshot();
    els.revolver.classList.add('is-firing');
    els.result.textContent = 'BANG.';
    els.result.className = 'rr-result death';
    setTimeout(function () {
      els.blackout.classList.add('is-burst');
      setTimeout(function () {
        els.blackout.classList.remove('is-burst');
        els.blackout.classList.add('is-on');
      }, 90);
    }, 70);
    setTimeout(function () {
      location.replace('death.html');
    }, DEATH_REDIRECT_MS);
  }

  function spinCylinder(onComplete) {
    const startAngle = cylinderAngle;
    const fullTurns = 3.5 + Math.random() * 1.5;
    const totalRotation = 360 * fullTurns + Math.floor(Math.random() * 6) * 60;
    const startTime = performance.now();
    const duration = SPIN_DURATION_MS;
    let lastSegment = Math.floor(startAngle / 60);

    function ease(t) {
      return 1 - Math.pow(1 - t, 4.2);
    }

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const angle = startAngle + totalRotation * ease(t);
      els.cylinder.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ')');
      cylinderAngle = angle;

      const seg = Math.floor(angle / 60);
      if (seg !== lastSegment) {
        lastSegment = seg;
        ratchetClick();
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        lockInClick();
        onComplete();
      }
    }
    requestAnimationFrame(step);
  }

  function fireFlash() {
    const flash = els.flash;
    if (!flash) return;
    const startTime = performance.now();
    const duration = 380;
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const r = 400 * t;
      const opacity = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.65);
      flash.setAttribute('r', r.toFixed(1));
      flash.setAttribute('opacity', opacity.toFixed(3));
      if (t < 1) requestAnimationFrame(step);
      else {
        flash.setAttribute('r', '0');
        flash.setAttribute('opacity', '0');
      }
    }
    requestAnimationFrame(step);
  }

  /* ===================== AUDIO ===================== */

  function ensureCtx() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  }

  function tone(freq, duration, opts) {
    opts = opts || {};
    const c = ensureCtx(); if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.value = freq;
    osc.connect(g); g.connect(masterGain);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.16 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + (opts.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function noise(duration, opts) {
    opts = opts || {};
    const c = ensureCtx(); if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.value = opts.filterFreq || 1500;
    filter.Q.value = opts.Q || 4;
    const g = c.createGain();
    src.connect(filter); filter.connect(g); g.connect(masterGain);
    const now = c.currentTime;
    const vol = opts.volume == null ? 0.18 : opts.volume;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  let lastRatchetMs = 0;
  function ratchetClick() {
    const now = performance.now();
    if (now - lastRatchetMs < 28) return;
    lastRatchetMs = now;
    tone(780 + Math.random() * 260, 0.045, { type: 'square', volume: 0.09, attack: 0.0006 });
    noise(0.035, { filterType: 'highpass', filterFreq: 3200, Q: 0.6, volume: 0.05 });
  }

  function lockInClick() {
    tone(190, 0.09, { type: 'square', volume: 0.18, attack: 0.001 });
    tone(72,  0.13, { type: 'sine',   volume: 0.14, attack: 0.001 });
    noise(0.08, { filterType: 'bandpass', filterFreq: 580, Q: 1.6, volume: 0.10 });
  }

  function emptyPinClick() {
    tone(112, 0.07, { type: 'square', volume: 0.20, attack: 0.0008 });
    tone(58,  0.10, { type: 'sine',   volume: 0.13 });
    noise(0.06, { filterType: 'bandpass', filterFreq: 340, Q: 1.0, volume: 0.09 });
  }

  function gunshot() {
    const c = ensureCtx(); if (!c) return;
    const now = c.currentTime;

    // sub-bass thump
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'sine';
    osc.connect(og); og.connect(masterGain);
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
    og.gain.setValueAtTime(0, now);
    og.gain.linearRampToValueAtTime(0.55, now + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.start(now);
    osc.stop(now + 0.6);

    // crack (high)
    noise(0.16, { filterType: 'bandpass', filterFreq: 2400, Q: 0.7, volume: 0.5 });
    // body rumble (low)
    noise(0.55, { filterType: 'lowpass',  filterFreq: 600,  Q: 0.5, volume: 0.4 });
    // tail tail (mid)
    noise(0.32, { filterType: 'bandpass', filterFreq: 1100, Q: 0.4, volume: 0.22 });
  }

  function markDead() {
    try {
      localStorage.setItem(DEATH_STORAGE_KEY, JSON.stringify({ dead: true, choice: null }));
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
