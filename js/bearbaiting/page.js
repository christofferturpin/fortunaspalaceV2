/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  BEAR BAITING PAGE  —  inspect, bet, watch pit combat resolve            │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ ctx from #bb-canvas; create pixelBuf+pctx    │
  │                          ├─ bind() ──► #bb-bet-bear ──► placeBet('bear') │
  │                          │             #bb-bet-dogs ──► placeBet('dogs') │
  │                          │             #bb-next ──► nextBait()→newRound  │
  │                          │             #bb-wager-max ──► fill max wager  │
  │                          ├─ newRound()                                   │
  │                          └─ rAF ──► loop(ts)                             │
  │                                                                          │
  │   newRound()                                                             │
  │     ├─ bear = rollBear() ──► stats + scarPos/mangePatches + form         │
  │     ├─ dogs = [rollDog(i)…] ──► breed/size/condition/aggression          │
  │     ├─ layoutPit() — pens + arc attack positions                         │
  │     ├─ computeOdds() ──► naiveBearPower / naiveDogPower → odds.{bear,dogs}│
  │     ├─ renderFieldGuide(): describeBearCues, describeDog                 │
  │     ├─ renderFormSheet(): makeBearForm / makeDogForm records             │
  │     └─ setPrompt('Inspect. Stake. Side.'); setButtons()                  │
  │                                                                          │
  │   placeBet(side)                                                         │
  │     ├─ Wallet.spend(wager)  ◄── aborts if false                          │
  │     ├─ payoutMult = computeOdds()[side]; state='fighting'                │
  │     └─ kicks combat loop                                                 │
  │                                                                          │
  │   loop(ts) ──► updateCombat(dt) (when state==='fighting')                │
  │                ──► updateDamage(dt) ──► render()                         │
  │     updateCombat: dog penned→charging→fighting; trades hits with bear;   │
  │                   bear swipes nearest in-reach dog;                      │
  │                   endFight('bear'|'dogs') when one side wiped            │
  │     endFight(winner) ──► Wallet.add(winnings) if betSide matches         │
  │                                                                          │
  │   render(): drawPit / drawDog / drawBear into pixelBuf via pctx,         │
  │             blit upscaled (PIX_SCALE=4) to display ctx, then drawDamage  │
  │                                                                          │
  │   Helpers: pick(arr), pickWeighted(items, weights), rand(min,max),       │
  │            snap(v), pxRect(x,y,w,h,color), spawnDamage(x,y,amount),      │
  │            getWager(), setPrompt(text, cls), setButtons(),               │
  │            drawLamp(x,y), drawPen(x,y,closed)                            │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet (spend / add / getBalance)                │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  BEAR_NAMES=[15 1800s pit names]; DOG_NAMES=[20]; BREEDS={pit,mastiff,terrier:{key,name,baseHp,baseAtk,baseRate}}
  BEAR_BASE_BY_SIZE={s,m,l:{hp,atk}}; SIZE_MULT={s,m,l:{hp,atk}}; PIX_SCALE=4
  state: state='idle'|'inspecting'|'fighting'|'result', round=0, bear=null, dogs=[], wager=0, betSide=null, payoutMult=0, combatTime=0, lastFrame=0, damageNums=[], canvas, ctx, promptEl, mainCtx, pixelBuf, pctx
  snap(v)→int: round(v/PIX_SCALE)*PIX_SCALE
  pxRect(x,y,w,h,color): fillStyle=color; fillRect snapped(x,y,w,h)
  pick(arr)→item: arr[floor(rnd*len)]
  pickWeighted(items,weights)→item: r=rnd*Σw; subtract until ≤0; ret items[i]
  rand(min,max)→num: min+rnd*(max-min)
  rollBear()→bear: size=pickWeighted(s/m/l,[.25,.45,.30]); scarCount=0..6; eyeBlind=rnd<.18; mange=rnd<.4?1..3:0; posture='upright'|'hunched' (.6); chained=rnd<.35; hpMax=max(20,base.hp-2*scars-8*mange); atk=max(5,base.atk+scars-mange); atkRate=upright?1.8:2.6; hitChance=blind?.45:.85; reach=chained?72:110; scarPos[],mangePatches[] stable; name=pick; power=hpMax+atk*3; form=makeBearForm(power); ret {…stats, x:280,y:240, facing:'right', swipeUntil:0, nextSwipeAt:0, flashUntil:0, dead:F, scarPos, mangePatches}
  rollDog(slot)→dog: breedKey=weighted([.4,.25,.35]); breed=BREEDS[k]; size; condition=gaunt/lean/fed; aggression=cowering/calm/lunging; scarCount=0..3; condMult, aggrRate; hpMax/atk/atkRate; dodge=cowering?.22:lunging?.05:.10; form=makeDogForm; ret {slot, name, breedKey, breed, size, condition, aggression, scarCount, hpMax, hp, atk, atkRate, dodge, form, x/y/penX/penY/targetX/targetY, facing:'left', state:'penned', nextBiteAt:0, bobPhase:rnd*2π, flashUntil:0, dead:F}
  layoutPit(): bear at baseX/Y; pens=[5 right-side coords]; angles=[-1.1,-.45,0,.45,1.1]; ∀dog penX/Y=pens[i]; targetX/Y=bear+cos/sin(a)*[65/42]+28
  naiveBearPower(b)→num: base.hp+base.atk*3 (no eye/mange/posture/condition)
  naiveDogPower(d)→num: hp+atk*(3/baseRate) (no aggression)
  computeOdds()→{bear,dogs}: bp,dp,total; pBear/pDogs; vig=.07; ret max(1.10,(1/p)*(1-vig)) each
  makeBearForm(power)→{bouts,wins,losses,lastThree,lastDur}: bouts=3..13; winRate=clamp(power/220+noise); roll wins; lastDur=max(2,22-power/12+noise)
  makeDogForm(power)→{bouts,wins,losses,lastThree}: bouts=1..6; winRate=clamp(power/90+noise)
  updateCombat(dt): combatTime+=dt; ∀dog: penned→after startAt(slot*.12) state='charging'; charging→lerp pen→target over .9s; t≥1→'fighting'+nextBiteAt; fighting→jitter; bite→bear.hp-=atk,spawnDamage,nextBiteAt; bear: now≥nextSwipeAt→pick closest in reach; hit roll vs hitChance & dodge→target.hp-=atk,flash; nextSwipeAt+=atkRate; bear.hp≤0→endFight('dogs'); allDogsDead→endFight('bear')
  endFight(winner): guard(state!=='fighting'); state='result'; resultEl=#bb-result; winner===betSide→winnings=floor(wager*payoutMult),Wallet.add,setPrompt '+coins',resultEl=`+N` is-win; else setPrompt 'Stake lost' is-loss, resultEl=`−N`; setButtons
  spawnDamage(x,y,amount): damageNums.push({x,y,amount,t:0})
  updateDamage(dt): ∀dn t+=dt; t>1.1→splice
  drawPit(): wall planks (alternating browns); horizontal beam; gas lamps@140/380/620,60; sawdust floor gradient; speckle (cached); 3 blood stains ellipses; 3 right-side pens (closed if inspecting)
  drawLamp(x,y): vertical bracket, stepped diamond glow halo, bulb 3×3 + 1px white core
  drawPen(x,y,closed): top rail + 4 vertical bars + bottom rail; closed→2 gate planks
  drawBear(): guard(!bear); flash/swiping/dead flags; sizeMult by size; BW/BH/HW/HH sprite-pixels; palette; cx/cy=snap(bear); postureDrop on hunched; shadow; chain (if chained!dead) zigzag from neck→post w/ sag; body outline+fill+highlight; mange patches; scars; 4 legs; head+ears; snout+nose; eyes (milky 2×2 if blind); mouth+teeth+swipe paw+claws on swiping; X eyes on dead; HP bar chunky pixel above
  drawDog(d): flash/dead flags; per-breed body dims; coat palette; facing by state/x vs bear; lungeTilt -PX if lunging; shadow; body outline/fill/topband; ribs (3 stripes) if gaunt; scars; 4 legs; head+ears (pointy terrier|flat); snout+nose; eye on facing-side; teeth if lunging; HP bar if !dead else X
  drawDamage(): font VT323 bold 14px; ∀dn alpha=1-t/1.1; yOff=-28*t; fillText '-N' shadow + red
  render(): pctx reset+clear+scale 1/PIX_SCALE; alias ctx=pctx; drawPit; drawDogs sorted by y behind bear; drawBear; drawDogs in front; restore ctx; drawImage upscale pixelBuf→canvas; drawDamage at full res
  loop(ts): dt=min(.06,(ts-lastFrame)/1000); fighting→updateCombat; updateDamage; render; rAF
  describeBearCues(b)→rows[]: Size/Scars/Eye/Coat/Stance/Tether
  describeDog(d)→str: `name · sz breed, cond, N scars, aggression`
  renderFieldGuide(): #bb-fg-bear-name=bear.name; cues rows; ∀dog li=describeDog
  renderFormSheet(): bear name+record+lastDur; ∀dog li name+W-L+lastThree
  getWager()→int: max(1,floor(#bb-wager.value||0)); writeback
  setPrompt(text,cls): promptEl.text=text; toggle classes
  setButtons(): inspecting=state==='inspecting'; bet buttons+wager+max disabled=!inspecting; bb-next.hidden=state!=='result'
  newRound(): round++; state='inspecting'; combatTime=0,damageNums=[]; bear=rollBear; numDogs=3..5; ∀i rollDog(i); layoutPit; wager=0,betSide=null,payoutMult=0; odds=computeOdds→#bb-odds-bear/dogs.text=×N.NN; #bb-round=round; clear #bb-result; renderFieldGuide; renderFormSheet; setPrompt 'Inspect. Stake. Side.'; setButtons
  placeBet(side): guard(state!=='inspecting'); w=getWager; Wallet.spend?else err; wager=w,betSide,payoutMult=odds[side]; combatTime=0; bear.nextSwipeAt=1.2 (stare-down); state='fighting'; setPrompt `Stake N on side · pays ×M`; setButtons; blur active
  nextBait(): newRound
  bind(): bet-bear→placeBet('bear'); bet-dogs→placeBet('dogs'); next→nextBait; wager-max→#bb-wager=Wallet.balance
  init(): canvas=#bb-canvas; ctx=2d; mainCtx=ctx; pixelBuf=canvas/PIX_SCALE; pctx=2d smoothing F; promptEl=#bb-prompt; bind; newRound; rAF(loop)
  exports: none (IIFE-local); on DOMContentLoaded→init
*/

(function (global) {
  // ============================================================================
  // BEAR BAITING — pre-fight inspection, bookie odds, real-time pit combat.
  //
  // The "skill" hook: the bear and each dog have hidden combat stats derived
  // from a handful of *visible cues* on the canvas. The bookie's odds are
  // computed naively — using only the obvious cues (bear size; dog count and
  // breed). Subtler cues (milky eye, mange, body condition, posture) are
  // ignored by the bookie. A player who reads the pit AND the form sheet
  // beats a player who only reads the chalkboard.
  // ============================================================================

  // ----- Bear roster: 1800s pit-fighter names. -----
  const BEAR_NAMES = [
    'OLD JIM', 'TIBERIUS', 'GRINNER', 'BROTHER HOG', 'CORDWAINER',
    'BLACK PATCH', 'ONE-EAR', 'STINK', 'THE DOCTOR', 'PRINCESS',
    'REVEREND', 'GOLIATH', 'PIG IRON', 'NOAH', 'MAYOR DUFF',
  ];
  const DOG_NAMES = [
    'Sausage', 'Buck', 'Chief', 'Pip', 'Rabbit', 'Snip', 'Madge',
    'Stoneface', 'Bug', 'Razor', 'Dolly', 'Glue', 'Mick', 'Tooth',
    'Hatchet', 'Crook', 'Cotton', 'Goose', 'Penny', 'Halfway',
  ];

  // ----- Breed profiles. baseHp / baseAtk / baseRate (seconds between bites). -----
  // Pits: aggressive, balanced. Mastiffs: tanky, slow. Terriers: small, fast.
  const BREEDS = {
    pit:     { key: 'pit',     name: 'Pit',     baseHp: 28, baseAtk: 7, baseRate: 1.2 },
    mastiff: { key: 'mastiff', name: 'Mastiff', baseHp: 42, baseAtk: 6, baseRate: 1.6 },
    terrier: { key: 'terrier', name: 'Terrier', baseHp: 18, baseAtk: 5, baseRate: 0.9 },
  };

  // ----- Visible-cue → stat lookups for the bear. -----
  const BEAR_BASE_BY_SIZE = {
    s: { hp:  70, atk: 18 },
    m: { hp: 110, atk: 24 },
    l: { hp: 160, atk: 32 },
  };
  const SIZE_MULT = {
    s: { hp: 0.75, atk: 0.85 },
    m: { hp: 1.0,  atk: 1.0  },
    l: { hp: 1.3,  atk: 1.15 },
  };

  // ============================================================================
  // STATE
  // ============================================================================
  let state = 'idle';        // 'inspecting' | 'fighting' | 'result'
  let round = 0;
  let bear = null;
  let dogs = [];
  let wager = 0;
  let betSide = null;        // 'bear' | 'dogs'
  let payoutMult = 0;

  let combatTime = 0;        // seconds — only ticks during 'fighting'
  let lastFrame = 0;
  let damageNums = [];

  let canvas, ctx;
  let promptEl;

  // ===== Pixel-art renderer =====
  // The pit/creatures all draw into a low-res offscreen buffer; the buffer
  // is then blitted upscaled to the display canvas with image smoothing off,
  // giving every shape chunky pixel edges. Damage numbers draw on top at
  // full resolution so the text stays readable.
  const PIX_SCALE = 4;
  let mainCtx;     // the actual display canvas's 2d ctx
  let pixelBuf;    // offscreen low-res canvas (180×100 for the 720×400 stage)
  let pctx;        // pixelBuf's 2d ctx — what `ctx` is aliased to during scene draws

  // Snap a display-space value to the buffer's pixel grid so blocks line up
  // crisply after the 4× upscale. All pixel-art primitives go through this.
  function snap(v) { return Math.round(v / PIX_SCALE) * PIX_SCALE; }

  // pxRect — fillRect that snaps both position and size to the pixel grid.
  // After the 4× upscale every block lands on a clean buffer pixel.
  function pxRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
  }

  // ============================================================================
  // RNG helpers
  // ============================================================================
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickWeighted(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  function rand(min, max) { return min + Math.random() * (max - min); }

  // ============================================================================
  // FACTORIES — roll a bear / dog with cues, derive hidden stats from cues.
  // ============================================================================

  function rollBear() {
    const size       = pickWeighted(['s', 'm', 'l'], [0.25, 0.45, 0.30]);
    const scarCount  = Math.floor(Math.random() * 7);        // 0..6
    const eyeBlind   = Math.random() < 0.18;
    // Mange present 40% of the time, then 1-3 patches.
    const mange      = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0;
    const posture    = Math.random() < 0.6 ? 'upright' : 'hunched';
    const chained    = Math.random() < 0.35;

    const base = BEAR_BASE_BY_SIZE[size];
    // Veterans (more scars) hit a touch harder but are slightly worn down.
    // Mange knocks both HP and ATK — the bear is sick.
    const hpMax     = Math.max(20, Math.round(base.hp  - 2 * scarCount - 8 * mange));
    const atk       = Math.max(5,  Math.round(base.atk + scarCount - mange));
    // Hunched bears swipe slower.
    const atkRate   = posture === 'upright' ? 1.8 : 2.6;
    // Milky eye → much worse aim.
    const hitChance = eyeBlind ? 0.45 : 0.85;
    // Chain limits the bear's reach — dogs on the far side are safe.
    const reach     = chained ? 72 : 110;

    // Stable scar / mange positions so the bear LOOKS the same every frame.
    const scarPos = [];
    for (let i = 0; i < scarCount; i++) {
      scarPos.push({
        x: rand(-0.85, 0.7),
        y: rand(-0.4, 0.45),
        len: rand(5, 9),
      });
    }
    const mangePatches = [];
    for (let i = 0; i < mange; i++) {
      mangePatches.push({
        x: rand(-0.6, 0.5),
        y: rand(-0.3, 0.4),
        r: rand(0.5, 1.1),
        a: Math.random() * Math.PI,
      });
    }

    const name = pick(BEAR_NAMES);
    // Form sheet — wins correlate with raw power but with significant noise.
    const power = hpMax + atk * 3;
    const form = makeBearForm(power);

    return {
      name, size, scarCount, eyeBlind, mange, posture, chained,
      hpMax, hp: hpMax, atk, atkRate, hitChance, reach,
      form,
      // render
      x: 280, y: 240, baseX: 280, baseY: 240,
      facing: 'right',
      swipeUntil: 0,
      nextSwipeAt: 0,
      flashUntil: 0,
      dead: false,
      scarPos, mangePatches,
    };
  }

  function rollDog(slot) {
    const breedKey = pickWeighted(['pit', 'mastiff', 'terrier'], [0.4, 0.25, 0.35]);
    const breed    = BREEDS[breedKey];
    const size     = pickWeighted(['s', 'm', 'l'], [0.30, 0.50, 0.20]);
    const sm       = SIZE_MULT[size];
    const condition= pickWeighted(['gaunt', 'lean', 'fed'], [0.28, 0.50, 0.22]);
    const aggression = pickWeighted(['cowering', 'calm', 'lunging'], [0.18, 0.40, 0.42]);
    const scarCount  = Math.floor(Math.random() * 4);

    const condMult = condition === 'gaunt' ? 0.65 : condition === 'fed' ? 1.15 : 1.0;
    const aggrRate = aggression === 'cowering' ? 1.5 : aggression === 'lunging' ? 0.75 : 1.0;

    const hpMax   = Math.max(8,  Math.floor(breed.baseHp  * sm.hp  * condMult));
    const atk     = Math.max(2,  Math.floor(breed.baseAtk * sm.atk + scarCount * 0.5));
    const atkRate = breed.baseRate * aggrRate;
    const dodge   = aggression === 'cowering' ? 0.22
                  : aggression === 'lunging'  ? 0.05 : 0.10;

    const name = pick(DOG_NAMES);
    const power = hpMax + atk * 3;
    const form  = makeDogForm(power);

    return {
      slot,
      name, breedKey, breed, size, condition, aggression, scarCount,
      hpMax, hp: hpMax, atk, atkRate, dodge,
      form,
      // render
      x: 0, y: 0, penX: 0, penY: 0, targetX: 0, targetY: 0,
      facing: 'left',
      state: 'penned',          // 'penned' → 'charging' → 'fighting' → 'dead'
      nextBiteAt: 0,
      bobPhase: Math.random() * Math.PI * 2,
      flashUntil: 0,
      dead: false,
    };
  }

  // Pen positions on the right side of the pit; attack positions in an arc
  // around the bear. The bear faces right; dogs enter from the right pens.
  function layoutPit() {
    bear.x = bear.baseX;
    bear.y = bear.baseY;
    const pens = [
      { x: 620, y: 170 },
      { x: 620, y: 230 },
      { x: 620, y: 290 },
      { x: 670, y: 200 },
      { x: 670, y: 260 },
    ];
    // Attack positions arc around the bear on its right side.
    const angles = [-1.1, -0.45, 0.0, 0.45, 1.1];
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i];
      const pen = pens[i] || pens[pens.length - 1];
      d.penX = pen.x;  d.penY = pen.y;
      d.x = pen.x;     d.y = pen.y;
      const a = angles[i] || rand(-1.0, 1.0);
      d.targetX = bear.x + Math.cos(a) * 65 + 28;
      d.targetY = bear.y + Math.sin(a) * 42;
    }
  }

  // ============================================================================
  // BOOKIE ODDS — naive: only sees the obvious. Misses eye, mange, condition,
  // posture, etc. Player who reads ALL the cues finds edges.
  // ============================================================================
  function naiveBearPower(b) {
    const base = BEAR_BASE_BY_SIZE[b.size];
    return base.hp + base.atk * 3;
  }
  function naiveDogPower(d) {
    const sm = SIZE_MULT[d.size];
    const hp  = d.breed.baseHp  * sm.hp;
    const atk = d.breed.baseAtk * sm.atk;
    // Bookie weights atk by attack rate but only the BREED rate (no aggression).
    return hp + atk * (3 / d.breed.baseRate);
  }
  function computeOdds() {
    const bp = naiveBearPower(bear);
    const dp = dogs.reduce((s, d) => s + naiveDogPower(d), 0);
    const total = bp + dp;
    const pBear = bp / total;
    const pDogs = dp / total;
    const vig = 0.07;                            // house cut
    return {
      bear: Math.max(1.10, (1 / pBear) * (1 - vig)),
      dogs: Math.max(1.10, (1 / pDogs) * (1 - vig)),
    };
  }

  // ============================================================================
  // FORM SHEETS — wins correlate with power but with noise. A high-power
  // bear can still have a losing record if it's been thrown against packs.
  // ============================================================================
  function makeBearForm(power) {
    const bouts = 3 + Math.floor(Math.random() * 11);
    const winRate = Math.max(0.10, Math.min(0.92, power / 220 + (Math.random() - 0.5) * 0.25));
    let wins = 0;
    const last = [];
    for (let i = 0; i < bouts; i++) {
      const win = Math.random() < winRate;
      if (win) wins++;
      if (i < 3) last.unshift(win ? 'W' : 'L');
    }
    const lastDur = Math.max(2, Math.round(22 - power / 12 + (Math.random() - 0.5) * 8));
    return { bouts, wins, losses: bouts - wins, lastThree: last.join(''), lastDur };
  }
  function makeDogForm(power) {
    const bouts = 1 + Math.floor(Math.random() * 6);
    const winRate = Math.max(0.05, Math.min(0.85, power / 90 + (Math.random() - 0.5) * 0.3));
    let wins = 0;
    const last = [];
    for (let i = 0; i < bouts; i++) {
      const win = Math.random() < winRate;
      if (win) wins++;
      if (i < 3) last.unshift(win ? 'W' : 'L');
    }
    return { bouts, wins, losses: bouts - wins, lastThree: last.join('') };
  }

  // ============================================================================
  // COMBAT TICK — dogs charge from pens, then trade hits with the bear.
  // ============================================================================
  function updateCombat(dt) {
    combatTime += dt;
    const now = combatTime;

    for (const d of dogs) {
      if (d.dead) continue;

      if (d.state === 'penned') {
        // Stagger charges so they don't all arrive at the same instant.
        const startAt = d.slot * 0.12;
        if (now > startAt) d.state = 'charging';
      }
      if (d.state === 'charging') {
        // Lerp from pen to attack position over ~0.9s.
        const startAt = d.slot * 0.12;
        const t = Math.min(1, (now - startAt) / 0.9);
        d.x = d.penX + (d.targetX - d.penX) * t;
        d.y = d.penY + (d.targetY - d.penY) * t;
        if (t >= 1) {
          d.state = 'fighting';
          d.nextBiteAt = now + d.atkRate * 0.4 + Math.random() * 0.4;
        }
        continue;
      }

      // Fighting: jitter slightly to feel alive.
      d.x = d.targetX + Math.sin(now * 3 + d.bobPhase) * 3;
      d.y = d.targetY + Math.cos(now * 4 + d.bobPhase) * 2;

      if (now >= d.nextBiteAt) {
        bear.hp -= d.atk;
        bear.flashUntil = now + 0.15;
        spawnDamage(bear.x, bear.y - 36, d.atk);
        d.nextBiteAt = now + d.atkRate + (Math.random() - 0.5) * 0.3;
        if (bear.hp <= 0) { bear.hp = 0; bear.dead = true; break; }
      }
    }

    // Bear swipe cooldown.
    if (!bear.dead && now >= bear.nextSwipeAt) {
      // Bear picks the closest live dog within reach.
      let target = null;
      let best = Infinity;
      for (const d of dogs) {
        if (d.dead || d.state !== 'fighting') continue;
        const dx = d.x - bear.x;
        const dy = d.y - bear.y;
        const dist = Math.hypot(dx, dy);
        if (dist > bear.reach) continue;
        if (dist < best) { best = dist; target = d; }
      }
      if (target) {
        bear.swipeUntil = now + 0.32;
        // Roll hit chance, then dodge.
        if (Math.random() < bear.hitChance && Math.random() > target.dodge) {
          target.hp -= bear.atk;
          target.flashUntil = now + 0.18;
          spawnDamage(target.x, target.y - 22, bear.atk);
          if (target.hp <= 0) {
            target.hp = 0;
            target.dead = true;
          }
        }
        bear.nextSwipeAt = now + bear.atkRate + (Math.random() - 0.5) * 0.4;
      } else {
        // No dog in reach — bear paces, swings sooner.
        bear.nextSwipeAt = now + 0.5;
      }
    }

    if (bear.hp <= 0) {
      bear.hp = 0; bear.dead = true;
      endFight('dogs');
    } else if (dogs.every(d => d.dead)) {
      endFight('bear');
    }
  }

  function endFight(winner) {
    if (state !== 'fighting') return;
    state = 'result';
    const resultEl = document.getElementById('bb-result');
    if (winner === betSide) {
      const winnings = Math.floor(wager * payoutMult);
      Wallet.add(winnings);
      setPrompt(`${winner === 'bear' ? bear.name : 'The pack'} took it. +${winnings} coins.`, 'is-win');
      if (resultEl) {
        resultEl.textContent = `+${winnings}`;
        resultEl.className = 'bb-pit-result is-win';
      }
    } else {
      setPrompt(`${winner === 'bear' ? bear.name : 'The pack'} took it. Stake lost.`, 'is-loss');
      if (resultEl) {
        resultEl.textContent = `−${wager}`;
        resultEl.className = 'bb-pit-result is-loss';
      }
    }
    setButtons();
  }

  // ============================================================================
  // DAMAGE NUMBERS
  // ============================================================================
  function spawnDamage(x, y, amount) {
    damageNums.push({ x, y, amount, t: 0 });
  }
  function updateDamage(dt) {
    for (let i = damageNums.length - 1; i >= 0; i--) {
      damageNums[i].t += dt;
      if (damageNums[i].t > 1.1) damageNums.splice(i, 1);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  function drawPit() {
    const W = canvas.width;
    const H = canvas.height;

    // Wall + planks (back of the pit)
    for (let x = 0; x < W; x += 22) {
      ctx.fillStyle = ((x / 22) | 0) % 2 === 0 ? '#2a160c' : '#3a1e10';
      ctx.fillRect(x, 0, 22, 110);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(x + 21, 0, 1, 110);
    }
    // Horizontal beam
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(0, 100, W, 6);
    ctx.fillStyle = 'rgba(255, 220, 160, 0.06)';
    ctx.fillRect(0, 100, W, 1);

    // Gas lamps along the top beam
    drawLamp(140, 60);
    drawLamp(380, 60);
    drawLamp(620, 60);

    // Sawdust floor
    const grd = ctx.createLinearGradient(0, 110, 0, H);
    grd.addColorStop(0, '#a07840');
    grd.addColorStop(1, '#6a4a20');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 110, W, H - 110);

    // Sawdust speckle — chunkier and fewer for the low-res pixel buffer.
    // Each speckle ends up as a 4×4 block on the display canvas.
    if (!drawPit._spex) {
      const sp = [];
      for (let i = 0; i < 70; i++) {
        sp.push({
          x: Math.floor(Math.random() * W / 4) * 4,
          y: 116 + Math.floor(Math.random() * (H - 120) / 4) * 4,
          k: Math.random(),
        });
      }
      drawPit._spex = sp;
    }
    for (const s of drawPit._spex) {
      ctx.fillStyle = s.k < 0.4 ? 'rgba(60, 30, 10, 0.55)' :
                      s.k < 0.7 ? 'rgba(120, 80, 30, 0.4)' :
                                  'rgba(200, 160, 90, 0.28)';
      ctx.fillRect(s.x, s.y, 4, 4);
    }

    // Old blood stains
    ctx.fillStyle = 'rgba(70, 8, 6, 0.55)';
    ctx.beginPath(); ctx.ellipse(200, 320, 44, 12, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(450, 280, 28, 9, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(320, 360, 18, 6,  0.1, 0, Math.PI * 2); ctx.fill();

    // Pens on the right (visible during inspection AND fighting — they're
    // physical, the dogs just leave them).
    drawPen(610, 150, state === 'inspecting');
    drawPen(610, 210, state === 'inspecting');
    drawPen(610, 270, state === 'inspecting');
  }

  // Gas lamp — a pixel cross of warm light hanging off a short bracket. The
  // "glow" is staggered transparent blocks instead of a smooth radial.
  function drawLamp(x, y) {
    const PX = PIX_SCALE;
    const cx = snap(x);
    const cy = snap(y);
    // Bracket arm going up to the wall beam
    pxRect(cx, cy - 10 * PX, PX, 10 * PX, '#1a0e08');
    // Glow halo — stepped diamond of warm light
    pxRect(cx - 4 * PX, cy,         9 * PX, PX,     'rgba(255, 200, 100, 0.18)');
    pxRect(cx - 3 * PX, cy - PX,    7 * PX, PX,     'rgba(255, 200, 100, 0.25)');
    pxRect(cx - 3 * PX, cy + PX,    7 * PX, PX,     'rgba(255, 200, 100, 0.25)');
    pxRect(cx - 2 * PX, cy - 2 * PX, 5 * PX, PX,    'rgba(255, 220, 130, 0.35)');
    pxRect(cx - 2 * PX, cy + 2 * PX, 5 * PX, PX,    'rgba(255, 220, 130, 0.30)');
    // Tight bulb
    pxRect(cx - PX, cy - PX, 3 * PX, 3 * PX, '#ffd870');
    pxRect(cx,      cy,      PX,     PX,     '#fff8d8');
  }

  // Pen — chunky pixel bars. Vertical posts + top rail + (optional) gate.
  function drawPen(x, y, closed) {
    const PX = PIX_SCALE;
    const cx = snap(x);
    const cy = snap(y);
    // Top rail
    pxRect(cx, cy, 7 * PX, PX, '#3a1c0e');
    // 4 vertical bars
    for (let i = 0; i < 4; i++) {
      pxRect(cx + i * 2 * PX, cy, PX, 10 * PX, '#3a1c0e');
    }
    // Bottom rail
    pxRect(cx, cy + 10 * PX, 7 * PX, PX, '#3a1c0e');
    // Closed gate (only during inspection)
    if (closed) {
      pxRect(cx - PX, cy + 2 * PX, 9 * PX, PX, '#5a2c14');
      pxRect(cx - PX, cy + 8 * PX, 9 * PX, PX, '#5a2c14');
    }
  }

  // Pixel-art bear, composed from boxes on the buffer grid. PIX = one
  // buffer pixel in display space; everything is sized in multiples of PIX
  // so blocks land cleanly on the pixel grid after the 4× upscale.
  //
  // Layout: bear faces RIGHT. Body sits left-of-center; head sits on the
  // body's right shoulder; snout pokes out further right; nose at the tip.
  // Cue overlays (scars, mange, milky eye, chain) drop into the same
  // coordinate space.
  function drawBear() {
    if (!bear) return;
    const now = combatTime;
    const flash = now < bear.flashUntil;
    const swiping = now < bear.swipeUntil;
    const dead = bear.dead;
    const PX = PIX_SCALE;

    // Sprite-block dimensions (in PIX units). Size cue scales these up/down
    // in whole sprite-pixels so the silhouette stays crisp.
    const sizeMult = bear.size === 's' ? 0.75 : bear.size === 'l' ? 1.25 : 1.0;
    const BW = Math.round(22 * sizeMult);   // body width in sprite-pixels
    const BH = Math.round(9  * sizeMult);   // body height
    const HW = Math.round(8  * sizeMult);   // head width
    const HH = Math.round(7  * sizeMult);   // head height

    // Palette
    const cBody  = dead ? '#1a0e08' : (flash ? '#a04020' : '#2a1810');
    const cHi    = dead ? '#1a0e08' : (flash ? '#c05030' : '#3a2418');
    const cDark  = '#0a0405';
    const cSnout = dead ? '#3a2814' : '#6a4828';
    const cNose  = '#1a0a04';
    const cEye   = '#000000';
    const cMilky = '#e8dcc0';
    const cMange = '#7a5e3a';
    const cScar  = '#5a2814';
    const cChain = '#5a4438';

    // Snap the bear's logical position to the pixel grid so jitter doesn't
    // make him shimmer between frames.
    const cx = snap(bear.x);
    const cy = snap(bear.y);

    // Body box. Posture cue: hunched shifts everything 1 sprite-pixel down
    // so the head sits lower over the front legs.
    const postureDrop = bear.posture === 'hunched' ? PX : 0;
    const bx = cx - (BW / 2) * PX;
    const by = cy - (BH / 2) * PX + postureDrop;

    // Shadow under body
    pxRect(bx + PX, by + BH * PX + PX, (BW - 2) * PX, PX, 'rgba(0,0,0,0.55)');

    // Chain — drawn BEFORE the body so it appears to feed under the bear
    // and run to an iron post at left of the pit.
    if (bear.chained && !dead) {
      const postX = bx - 16 * PX;
      const postY = by + (BH + 2) * PX;
      // Slack chain: zig-zag of single pixels from neck to post.
      const startX = bx + 3 * PX;
      const startY = by + 2 * PX;
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lx = snap(startX + (postX - startX) * t);
        const sag = Math.sin(t * Math.PI) * 4 * PX; // gravity sag
        const ly = snap(startY + (postY - startY) * t + sag);
        pxRect(lx, ly, PX, PX, cChain);
      }
      // Iron post stuck in the sawdust
      pxRect(postX - PX, postY - 6 * PX, 2 * PX, 8 * PX, cDark);
      pxRect(postX,      postY - 6 * PX, PX,     7 * PX, '#1a0a04');
    }

    // --- BODY ---
    // 1-pixel dark outline ring, then filled body, then top highlight band.
    pxRect(bx - PX, by,      (BW + 2) * PX, BH * PX, cDark);   // L/R outline
    pxRect(bx,      by - PX, BW * PX,      (BH + 2) * PX, cDark); // T/B outline
    pxRect(bx, by, BW * PX, BH * PX, cBody);
    pxRect(bx + PX, by, (BW - 2) * PX, 2 * PX, cHi);

    // Mange patches — lighter splotches on the back/flank. Each patch is a
    // 2×1 block of cMange placed deterministically from generation.
    for (const mp of bear.mangePatches) {
      const mxv = bx + Math.floor(((mp.x + 1) / 2) * (BW - 2)) * PX + PX;
      const myv = by + Math.floor(((mp.y + 1) / 2) * (BH - 1)) * PX;
      pxRect(mxv, myv, 2 * PX, PX, cMange);
    }

    // Scars — dark red dashes on the body.
    for (const sp of bear.scarPos) {
      const sxv = bx + Math.floor(((sp.x + 1) / 2) * (BW - 2)) * PX + PX;
      const syv = by + Math.floor(((sp.y + 1) / 2) * (BH - 1)) * PX + PX;
      pxRect(sxv, syv, Math.max(2, Math.round(sp.len / 3)) * PX, PX, cScar);
    }

    // --- LEGS --- 4 short rectangles under the body.
    const legH = 4 * PX;
    const legY = by + BH * PX;
    const legSpacing = Math.floor((BW - 6) / 3);
    for (let i = 0; i < 4; i++) {
      const lx = bx + 2 * PX + i * legSpacing * PX;
      pxRect(lx,        legY,                 2 * PX, legH,      cDark);
      pxRect(lx + PX,   legY,                 PX,     legH - PX, cBody);
    }

    // --- HEAD --- sits on the front-right shoulder of the body.
    const hx = bx + (BW - 3) * PX;
    const hy = by - (HH - 2) * PX;
    pxRect(hx - PX, hy,      (HW + 2) * PX, HH * PX,      cDark);
    pxRect(hx,      hy - PX, HW * PX,      (HH + 2) * PX, cDark);
    pxRect(hx, hy, HW * PX, HH * PX, cBody);
    pxRect(hx + PX, hy, (HW - 2) * PX, 2 * PX, cHi);

    // Ears — two 2×2 bumps poking above the head.
    pxRect(hx + PX,         hy - 2 * PX, 2 * PX, 2 * PX, cBody);
    pxRect(hx + PX,         hy - 2 * PX, 2 * PX, PX,     cHi);
    pxRect(hx + (HW - 3) * PX, hy - 2 * PX, 2 * PX, 2 * PX, cBody);
    pxRect(hx + (HW - 3) * PX, hy - 2 * PX, 2 * PX, PX,     cHi);

    // --- SNOUT --- extends right from the head.
    const sx = hx + HW * PX;
    const sy = hy + 3 * PX;
    pxRect(sx - PX, sy - PX, 4 * PX, 4 * PX, cDark);      // outline
    pxRect(sx,      sy,      3 * PX, 3 * PX, cSnout);     // fill
    // Nose tip
    pxRect(sx + 2 * PX, sy,         PX, PX, cNose);
    pxRect(sx + 2 * PX, sy + PX,    PX, PX, cNose);

    // --- EYES ---
    // Back eye (always present, single pixel).
    pxRect(hx + 2 * PX, hy + 2 * PX, PX, PX, cEye);
    // Front eye — milky 2×2 white block if blind; otherwise dark 1×1 pixel.
    if (bear.eyeBlind) {
      pxRect(hx + (HW - 3) * PX, hy + 2 * PX, 2 * PX, 2 * PX, cMilky);
      pxRect(hx + (HW - 3) * PX, hy + 2 * PX, 2 * PX, PX,     cDark);
    } else {
      pxRect(hx + (HW - 3) * PX, hy + 2 * PX, PX, PX, cEye);
    }

    // --- MOUTH / TEETH when swiping ---
    if (swiping && !dead) {
      pxRect(sx,           sy + 2 * PX, 3 * PX, PX, '#1a0606');
      pxRect(sx,           sy + PX,     3 * PX, PX, '#fff8e0');
    }

    // --- SWIPE PAW (extra paw lunging out to the right) ---
    if (swiping && !dead) {
      const pawX = sx + 2 * PX;
      const pawY = sy + 4 * PX;
      pxRect(pawX - PX, pawY - PX, 4 * PX, 4 * PX, cDark);
      pxRect(pawX,      pawY,      3 * PX, 3 * PX, cBody);
      // 3 claws
      pxRect(pawX + 3 * PX, pawY,         PX, PX, '#fff8e0');
      pxRect(pawX + 3 * PX, pawY + PX,    PX, PX, '#fff8e0');
      pxRect(pawX + 3 * PX, pawY + 2 * PX, PX, PX, '#fff8e0');
    }

    // --- DEAD: an X over the head (cue: he's done) ---
    if (dead) {
      // Replace the head's eyes with two X pixels.
      pxRect(hx + 2 * PX,        hy + 2 * PX, PX, PX, cDark);
      pxRect(hx + (HW - 3) * PX, hy + 2 * PX, 2 * PX, 2 * PX, cDark);
    }

    // --- HP bar above the bear (chunky pixel bar, no text) ---
    const barW = (BW - 2) * PX;
    const barH = 2 * PX;
    const hpX  = bx + PX;
    const hpY  = by - 5 * PX;
    pxRect(hpX - PX, hpY - PX, barW + 2 * PX, barH + 2 * PX, cDark);
    pxRect(hpX, hpY, barW, barH, '#2a1a14');
    const hpFrac = Math.max(0, bear.hp / bear.hpMax);
    const hpColor = hpFrac < 0.3 ? '#ff5a4a' : hpFrac < 0.6 ? '#ffae5a' : '#a4d870';
    pxRect(hpX, hpY, Math.floor(barW * hpFrac / PX) * PX, barH, hpColor);
  }

  // Pixel-art dog. Same block-composition approach as the bear, but the
  // proportions and palette change per breed:
  //   pit     — stocky body, big square head, short legs
  //   mastiff — broad body, blocky head with jowls, tall
  //   terrier — small body, narrow head with pointy ears, longer legs
  function drawDog(d) {
    const now = combatTime;
    const flash = now < d.flashUntil;
    const dead = d.dead;
    const breed = d.breedKey;
    const PX = PIX_SCALE;

    // Per-breed sprite dimensions (in PIX units). Size mult: integer-ish
    // scale so sprite-pixels stay crisp.
    const sizeMult = d.size === 's' ? 0.75 : d.size === 'l' ? 1.20 : 1.0;
    let bw, bh, hw, hh;
    if (breed === 'mastiff') {
      bw = Math.round(11 * sizeMult); bh = Math.round(6 * sizeMult);
      hw = Math.round(5  * sizeMult); hh = Math.round(5 * sizeMult);
    } else if (breed === 'pit') {
      bw = Math.round(9  * sizeMult); bh = Math.round(5 * sizeMult);
      hw = Math.round(4  * sizeMult); hh = Math.round(4 * sizeMult);
    } else {
      bw = Math.round(7  * sizeMult); bh = Math.round(3 * sizeMult);
      hw = Math.round(3  * sizeMult); hh = Math.round(3 * sizeMult);
    }

    // Coat palette by breed
    const cBase = breed === 'mastiff' ? '#7a4a28'
                : breed === 'pit'     ? '#5a3018'
                                      : '#3a2418';
    const cHi   = breed === 'mastiff' ? '#9a6438'
                : breed === 'pit'     ? '#7a4020'
                                      : '#5a3a24';
    const cDark = '#0a0405';
    const cCoat = dead ? '#1a0e08' : (flash ? '#d04020' : cBase);
    const cTop  = dead ? '#1a0e08' : (flash ? '#e05828' : cHi);
    const cEye  = '#000';

    // Facing: dog points at bear when out fighting; faces away (pen rear)
    // while still penned. -1 = facing left, +1 = facing right.
    const facing = (d.state === 'penned') ? -1 : (d.x > bear.x ? -1 : 1);

    // Snap position to grid; tip body slightly forward on lunging dogs so
    // the cue reads at a glance.
    const lungeTilt = (d.aggression === 'lunging' && !dead) ? PX : 0;
    const cx = snap(d.x);
    const cy = snap(d.y) - lungeTilt;

    // Body
    const bx = cx - (bw / 2) * PX;
    const by = cy - (bh / 2) * PX;
    // Shadow
    pxRect(bx, by + bh * PX + PX, bw * PX, PX, 'rgba(0,0,0,0.45)');
    // Outline + fill + highlight band
    pxRect(bx - PX, by,      (bw + 2) * PX, bh * PX,      cDark);
    pxRect(bx,      by - PX, bw * PX,      (bh + 2) * PX, cDark);
    pxRect(bx, by, bw * PX, bh * PX, cCoat);
    pxRect(bx + PX, by, (bw - 2) * PX, PX, cTop);

    // Ribs (gaunt) — three vertical pale stripes on the body.
    if (d.condition === 'gaunt' && !dead) {
      const ribColor = 'rgba(232, 208, 168, 0.35)';
      for (let i = 0; i < 3; i++) {
        pxRect(bx + (2 + i * 2) * PX, by + PX, PX, (bh - 1) * PX, ribColor);
      }
    }

    // Scars — small dark blocks scattered on the back.
    for (let i = 0; i < d.scarCount; i++) {
      const sxOff = (i % 2 === 0 ? 2 : bw - 3) * PX;
      const syOff = (1 + (i % 2)) * PX;
      pxRect(bx + sxOff, by + syOff, PX, PX, '#1a0a06');
    }

    // Legs — 4 short rects under the body.
    const legH = (breed === 'terrier' ? 4 : 3) * PX;
    const legY = by + bh * PX;
    const slots = 4;
    const legSpacing = Math.floor((bw - 2) / (slots - 1));
    for (let i = 0; i < slots; i++) {
      const lx = bx + (1 + i * legSpacing) * PX;
      pxRect(lx, legY, PX, legH, cDark);
    }

    // Head — sits on the front shoulder, facing direction
    // For facing=+1 (right), head is at right end of body; for -1 head is at left.
    const headXOffset = facing > 0 ? (bw - 1) : -(hw - 1);
    const hx = bx + headXOffset * PX;
    const hy = by - (hh - 2) * PX;
    pxRect(hx - PX, hy,      (hw + 2) * PX, hh * PX,      cDark);
    pxRect(hx,      hy - PX, hw * PX,      (hh + 2) * PX, cDark);
    pxRect(hx, hy, hw * PX, hh * PX, cCoat);

    // Ears
    if (breed === 'terrier') {
      // Pointy ear: a 1px triangle (just a 1×1 + 1×1 offset stack).
      const earX = hx + (facing > 0 ? PX : (hw - 2) * PX);
      pxRect(earX, hy - 2 * PX, PX, 2 * PX, cCoat);
      pxRect(earX, hy - 3 * PX, PX, PX, cCoat);
    } else {
      // Flat folded ear: small 2×1 block hanging just above the head.
      const earX = hx + (facing > 0 ? 0 : (hw - 2) * PX);
      pxRect(earX, hy - PX, 2 * PX, PX, cCoat);
    }

    // Snout — a small block off the front of the head.
    const snX = hx + (facing > 0 ? hw * PX : -2 * PX);
    const snY = hy + (hh - 2) * PX;
    pxRect(snX, snY, 2 * PX, 2 * PX, cDark);
    pxRect(snX, snY, 2 * PX, PX, cCoat);

    // Nose
    pxRect(snX + (facing > 0 ? PX : 0), snY, PX, PX, cEye);

    // Eye — single pixel on the head, facing-side.
    const eyeX = hx + (facing > 0 ? (hw - 2) : 1) * PX;
    pxRect(eyeX, hy + Math.max(1, Math.floor(hh / 2)) * PX, PX, PX, cEye);

    // Teeth (only lunging, and alive). A thin white band under the snout.
    if (d.aggression === 'lunging' && !dead) {
      pxRect(snX, snY + PX, 2 * PX, PX, '#fff8e0');
    }

    // Cowering: drop the head 1px to read as head-down.
    // (Already handled visually because the head sits low; the cue is
    // mostly the LACK of lunging tilt and the dodge stat.)

    // HP bar above the dog (chunky, no text).
    if (!dead) {
      const barW = bw * PX;
      const barH = PX + PX; // 2 px tall in buffer
      const hpX  = bx;
      const hpY  = by - 3 * PX;
      pxRect(hpX - PX, hpY - PX, barW + 2 * PX, barH + 2 * PX, cDark);
      pxRect(hpX, hpY, barW, barH, '#2a1a14');
      const frac = Math.max(0, d.hp / d.hpMax);
      const hpColor = frac < 0.35 ? '#ff5a4a' : '#a4d870';
      pxRect(hpX, hpY, Math.floor(barW * frac / PX) * PX, barH, hpColor);
    } else {
      // Dead: a small X on the head.
      pxRect(eyeX, hy + 1 * PX, PX, PX, cDark);
      pxRect(eyeX + PX, hy + 2 * PX, PX, PX, cDark);
    }
  }

  function drawDamage() {
    ctx.font = 'bold 14px "VT323", monospace';
    ctx.textAlign = 'center';
    for (const dn of damageNums) {
      const a = Math.max(0, 1 - dn.t / 1.1);
      const yOff = -28 * (dn.t / 1.1);
      ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`;
      ctx.fillText('-' + dn.amount, dn.x + 1, dn.y + yOff + 1);
      ctx.fillStyle = `rgba(255, 80, 60, ${a})`;
      ctx.fillText('-' + dn.amount, dn.x, dn.y + yOff);
    }
  }

  function render() {
    // ---- Pixel-buffer pass ----
    // Clear at native buffer scale, then set the matrix so all draws in
    // main-canvas coords get scaled down 4× into the buffer.
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pixelBuf.width, pixelBuf.height);
    pctx.setTransform(1 / PIX_SCALE, 0, 0, 1 / PIX_SCALE, 0, 0);
    pctx.imageSmoothingEnabled = false;

    // Alias `ctx` so the existing draw functions write into the buffer.
    const savedCtx = ctx;
    ctx = pctx;

    drawPit();
    // Dogs drawn behind bear when their y is above bear.y, in front below.
    const drawList = dogs.slice().sort((a, b) => a.y - b.y);
    for (const d of drawList) if (d.y <= bear.y) drawDog(d);
    drawBear();
    for (const d of drawList) if (d.y > bear.y) drawDog(d);

    ctx = savedCtx;

    // ---- Upscale-blit to the display canvas ----
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(pixelBuf, 0, 0, pixelBuf.width, pixelBuf.height,
                            0, 0, canvas.width,   canvas.height);

    // ---- Full-res overlay: damage numbers (text needs to stay legible) ----
    ctx.imageSmoothingEnabled = true;
    drawDamage();
  }

  function loop(ts) {
    const dt = lastFrame ? Math.min(0.06, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    if (state === 'fighting') updateCombat(dt);
    updateDamage(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ============================================================================
  // FIELD GUIDE + FORM SHEET RENDERING
  // ============================================================================
  function describeBearCues(b) {
    return [
      { k: 'Size',    v: { s: 'small', m: 'mid-sized', l: 'huge' }[b.size] },
      { k: 'Scars',   v: b.scarCount === 0 ? 'unmarked coat' : b.scarCount + ' visible scars' },
      { k: 'Eye',     v: b.eyeBlind ? 'one milky-white eye' : 'both eyes clear' },
      { k: 'Coat',    v: b.mange === 0 ? 'clean coat' : b.mange + ' patches of mange' },
      { k: 'Stance',  v: b.posture === 'upright' ? 'upright on its haunches' : 'hunched, head low' },
      { k: 'Tether',  v: b.chained ? 'iron-collared, chained to a post' : 'loose in the pit' },
    ];
  }
  function describeDog(d) {
    const sz = d.size === 's' ? 'runt' : d.size === 'l' ? 'big' : 'mid';
    const cond = d.condition === 'gaunt' ? 'ribs showing'
               : d.condition === 'fed'   ? 'well-fed'
                                         : 'lean';
    return `${d.name} · ${sz} ${d.breed.name.toLowerCase()}` +
           `, ${cond}` +
           (d.scarCount > 0 ? `, ${d.scarCount} scar${d.scarCount > 1 ? 's' : ''}` : '') +
           `, ${d.aggression}`;
  }

  function renderFieldGuide() {
    document.getElementById('bb-fg-bear-name').textContent = bear.name;
    const cuesEl = document.getElementById('bb-fg-bear-cues');
    cuesEl.innerHTML = '';
    for (const cue of describeBearCues(bear)) {
      const row = document.createElement('div');
      row.className = 'bb-fg-cue';
      const k = document.createElement('span');
      k.className = 'bb-fg-cue-k';
      k.textContent = cue.k;
      const v = document.createElement('span');
      v.className = 'bb-fg-cue-v';
      v.textContent = cue.v;
      row.appendChild(k);
      row.appendChild(v);
      cuesEl.appendChild(row);
    }
    const dogsEl = document.getElementById('bb-fg-dogs');
    dogsEl.innerHTML = '';
    for (const d of dogs) {
      const li = document.createElement('li');
      li.textContent = describeDog(d);
      dogsEl.appendChild(li);
    }
  }

  function renderFormSheet() {
    const bf = bear.form;
    const bearEl = document.getElementById('bb-fs-bear');
    bearEl.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'bb-fs-name';
    name.textContent = bear.name;
    const rec = document.createElement('div');
    rec.className = 'bb-fs-record';
    rec.textContent = `${bf.wins}W · ${bf.losses}L  ·  last 3: ${bf.lastThree || '—'}`;
    const extra = document.createElement('div');
    extra.className = 'bb-fs-extra';
    extra.textContent = `Last bout ${bf.lastDur} min.`;
    bearEl.appendChild(name);
    bearEl.appendChild(rec);
    bearEl.appendChild(extra);

    const dogsEl = document.getElementById('bb-fs-dogs');
    dogsEl.innerHTML = '';
    for (const d of dogs) {
      const li = document.createElement('li');
      const nm = document.createElement('span');
      nm.className = 'bb-fs-dog-name';
      nm.textContent = d.name;
      const r = document.createElement('span');
      r.className = 'bb-fs-dog-record';
      r.textContent = `${d.form.wins}-${d.form.losses}  ${d.form.lastThree || '—'}`;
      li.appendChild(nm);
      li.appendChild(r);
      dogsEl.appendChild(li);
    }
  }

  // ============================================================================
  // UI plumbing
  // ============================================================================
  function getWager() {
    const el = document.getElementById('bb-wager');
    const v = Math.max(1, Math.floor(Number(el.value) || 0));
    if (String(v) !== el.value) el.value = v;
    return v;
  }

  function setPrompt(text, cls) {
    if (!promptEl) return;
    promptEl.textContent = text || '';
    promptEl.classList.remove('is-win', 'is-loss', 'is-err', 'is-info');
    if (cls) promptEl.classList.add(cls);
  }

  function setButtons() {
    const bBear  = document.getElementById('bb-bet-bear');
    const bDogs  = document.getElementById('bb-bet-dogs');
    const bNext  = document.getElementById('bb-next');
    const wEl    = document.getElementById('bb-wager');
    const wMax   = document.getElementById('bb-wager-max');

    const inspecting = state === 'inspecting';
    bBear.disabled = !inspecting;
    bDogs.disabled = !inspecting;
    wEl.disabled   = !inspecting;
    wMax.disabled  = !inspecting;

    bNext.hidden = state !== 'result';
  }

  function newRound() {
    round++;
    state = 'inspecting';
    combatTime = 0;
    damageNums = [];

    bear = rollBear();
    const numDogs = 3 + Math.floor(Math.random() * 3);
    dogs = [];
    for (let i = 0; i < numDogs; i++) dogs.push(rollDog(i));
    layoutPit();

    wager = 0;
    betSide = null;
    payoutMult = 0;

    const odds = computeOdds();
    document.getElementById('bb-odds-bear').textContent = '×' + odds.bear.toFixed(2);
    document.getElementById('bb-odds-dogs').textContent = '×' + odds.dogs.toFixed(2);

    document.getElementById('bb-round').textContent = round;
    const resultEl = document.getElementById('bb-result');
    if (resultEl) { resultEl.textContent = ''; resultEl.className = 'bb-pit-result'; }

    renderFieldGuide();
    renderFormSheet();
    setPrompt('Inspect. Stake. Side.', 'is-info');
    setButtons();
  }

  function placeBet(side) {
    if (state !== 'inspecting') return;
    const w = getWager();
    if (!Wallet.spend(w)) {
      setPrompt("You can't cover the stake.", 'is-err');
      return;
    }
    wager = w;
    betSide = side;
    const odds = computeOdds();
    payoutMult = odds[side];
    combatTime = 0;
    bear.nextSwipeAt = 1.2;        // brief moment of mutual stare-down
    state = 'fighting';
    setPrompt(`Stake ${w} on ${side === 'bear' ? 'the bear' : 'the pack'} · pays ×${payoutMult.toFixed(2)}`, 'is-info');
    setButtons();
    // Pull focus off the wager input so future Enter keys don't fire it.
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  function nextBait() {
    newRound();
  }

  function bind() {
    document.getElementById('bb-bet-bear').addEventListener('click', () => placeBet('bear'));
    document.getElementById('bb-bet-dogs').addEventListener('click', () => placeBet('dogs'));
    document.getElementById('bb-next').addEventListener('click', nextBait);
    document.getElementById('bb-wager-max').addEventListener('click', () => {
      document.getElementById('bb-wager').value = Math.max(1, Wallet.getBalance());
    });
  }

  function init() {
    canvas = document.getElementById('bb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    mainCtx = ctx;
    // Low-res offscreen buffer (1/PIX_SCALE the size of the display canvas).
    // Drawing happens here in main-canvas coords via a scale matrix; then
    // we blit to the display with smoothing off so every shape gets chunky
    // pixel edges.
    pixelBuf = document.createElement('canvas');
    pixelBuf.width  = Math.ceil(canvas.width  / PIX_SCALE);
    pixelBuf.height = Math.ceil(canvas.height / PIX_SCALE);
    pctx = pixelBuf.getContext('2d');
    pctx.imageSmoothingEnabled = false;

    promptEl = document.getElementById('bb-prompt');
    bind();
    newRound();
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
