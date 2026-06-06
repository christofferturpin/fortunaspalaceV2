/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS MAIN  —  phase state machine, run/bet logic, rAF loop         │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │      ├─ cache DOM refs (palette, tiles, runbar, library, canvas, ...)   │
  │      ├─ PG.buildPalette(elPalette)                                       │
  │      ├─ refreshRoster() ─► refreshStarterPicker, refreshStartButton      │
  │      ├─ refreshRunbar()                                                  │
  │      ├─ Wallet.onChange ─► refreshRunbar                                 │
  │      ├─ bind #sb-start ─► onStartClick                                   │
  │      ├─ bind #sb-abandon ─► onAbandon                                    │
  │      ├─ bind #sb-bet-input ─► refreshStartButton                         │
  │      ├─ bind library buttons (load/save/delete/export/import)            │
  │      └─ loadEnemyTeams() — fetch enemy-teams.json (silent fallback)      │
  │                                                                          │
  │   applyStarter(idx) ──► copy PLAYER_STARTERS[idx] into slots 0..1,       │
  │      clear 2..4, rebuild unlocked set, rebuild palette                   │
  │      └─ unlockedFromStarter(team) ──► Set of ids                         │
  │                                                                          │
  │   onStartClick ──► spend bet (Wallet) ──► startBattle()                  │
  │      └─ startBattle()                                                    │
  │            ├─ _drawEnemyTeam(size)  (Fisher–Yates shuffle bag per size)  │
  │            ├─ BT.createBattle(playerSpecs, enemySpecs)                   │
  │            ├─ phase='battle'  ─► requestAnimationFrame(loop)             │
  │            └─ show battle panel                                          │
  │                                                                          │
  │   loop(now) ──► (rAF chain, fixed-timestep 1/D.BATTLE.tickHz)            │
  │      ├─ while accumulator: BT.step(state.battle, fixed)                  │
  │      ├─ RN.render(ctx, state.battle)                                     │
  │      ├─ updateHud() ─► updateLog() ─► escapeHtml()                       │
  │      └─ if winner ─► onBattleEnd()                                       │
  │                                                                          │
  │   onBattleEnd ──►                                                        │
  │      ├─ winner=='player' ─► onRoundWon()                                 │
  │      │     ├─ final round ─► W.add(pot); finishRun(); Return button     │
  │      │     └─ else: render Pick-2 unlock panel (D.UNLOCKS[idx])          │
  │      │           ├─ Cash Out · pot ─► W.add(pot); finishRun()           │
  │      │           └─ Continue ─► picked → r.unlocked; currentRoundIdx++   │
  │      └─ winner=='enemy'  ─► onRoundLost() ─► finishRun()                 │
  │                                                                          │
  │   onAbandon ──► W.add(potMidRound(bet, roundsWon)); finishRun()          │
  │   finishRun ──► reset run, reset team to defaultTeam(), reshuffle bag    │
  │   backToProgramming ──► phase='programming', rebuild palette + roster    │
  │                                                                          │
  │   Math: multiplierFor(rw)=rw*0.5  ·  potBetween / potMidRound            │
  │   Helpers: kindOf, mapOf, labelOf, descOf, makeBtn, reasonString         │
  │                                                                          │
  │   Library UI: refreshLibrary / refreshLibraryButtons / onLibraryLoad     │
  │     / onLibrarySave / onLibraryDelete / onLibraryExport /                │
  │     onLibraryImportFile ─► TS.list/load/save/remove/export/import        │
  │                                                                          │
  │   Exports (window.ShapebotsLock): { isUnlocked(id) }                     │
  │   External deps: window.ShapebotsData, ShapebotsProgramming,             │
  │                  ShapebotsBattle, ShapebotsRender, ShapebotsTeamStore,   │
  │                  window.Wallet                                           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  D=ShapebotsData; PG=ShapebotsProgramming; BT=ShapebotsBattle; RN=ShapebotsRender; W=Wallet; TS=ShapebotsTeamStore
  PICKS_PER_ROUND=2
  multiplierFor(rw)=rw*0.5; potBetween(bet,rw)=floor(bet*mult); potMidRound(bet,rw)=floor(bet*mult*0.5)
  unlockedFromStarter(team)→Set: ∀bot∈team.slice(0,2)(guard type)→add type,default.{attack,target,move},trigger,special.{passive|effect}
  state={phase:'programming',team:PG.defaultTeam(),selectedBotIdx:0,battle:null,lastSimTime:0,simAccumulator:0,rafId:null,run:{active:F,bet:0,roundsWon:0,currentRoundIdx:0,unlocked:unlockedFromStarter(team)}}
  selectedStarterIdx=-1; _enemyBag={} (size→indices left in shuffle)
  window.ShapebotsLock={isUnlocked(id):state.run.unlocked.has(id)}
  DOM refs cached: elPalette,elBotTiles,elBotDetail,elStart,elProgrammingPanel,elBattlePanel,elCanvas,elHud,elTimer,elPAlive,elEAlive,elResolution,elResultText,elResultDetail,elResultActions,elAbandon,elRunbarPre,elRunbarActive,elBetInput,elCoins,elCoinsActive,elRbBet,elRbRound,elRbPot,elRbMult,elRbNextMult,elRbMatchup,elLog,elStarterPicker,elLibSelect,elLibLoad,elLibSave,elLibDelete,elLibExport,elLibImport,elLibFile
  init(): cache DOM; PG.buildPalette; refreshRoster; refreshRunbar; W.onChange→refreshRunbar; bind start→onStartClick, abandon→onAbandon, betInput→refreshStartButton, library buttons; elCanvas.w/h=ARENA.w/h; loadEnemyTeams; refreshLibrary
  loadEnemyTeams(): fetch '../../assets/json/enemy-teams.json'→∀sizeKey(skip _comment)→normalize entries to arrays of correct size→D.ENEMY_TEAMS_BY_SIZE[size]=teams; _enemyBag[size]=null; .catch→warn fallback
  refreshRoster(): round=ROUNDS[currentRoundIdx]||[0]; PG.buildBotTiles(team,sel,onSelect,round.playerSize); PG.buildBotDetail(team[sel],sel,refreshRoster); refreshStarterPicker; refreshStartButton
  refreshStarterPicker(): hidden if run.active; clear; header text varies on selectedStarterIdx; ∀preset∈PLAYER_STARTERS→btn{name+desc, click→applyStarter(i)}
  refreshLibrary(): clear elLibSelect; placeholder; ∀teams TS.list→option; preserve current selection; refreshLibraryButtons
  refreshLibraryButtons(): hasSelection=!!elLibSelect.value; load/delete/export.disabled=!has
  onLibraryLoad(): name=value; team=TS.load; fill state.team padded to 5; selectedBotIdx=0; refreshRoster
  onLibrarySave(): suggested=first||`Team ${n+1}`; prompt; trim; exists→confirm overwrite; TS.save(name,state.team); refresh
  onLibraryDelete(): confirm; TS.remove; refresh
  onLibraryExport(): TS.exportTeamToFile(name)
  onLibraryImportFile(e): file=files[0]; TS.importTeamFromFile→.then(name){refresh+select} .catch(alert) .finally(elLibFile.value='')
  applyStarter(idx): preset=PLAYER_STARTERS[idx]; selectedStarterIdx=idx; state.team[0/1]=deepCopy(preset.bots); slots 2..4=defaultBot; run.unlocked=unlockedFromStarter; buildPalette; selectedBotIdx=0; refreshRoster
  refreshStartButton(): if !run.active: round=ROUNDS[0]; starterPicked=idx>=0; teamOk=starterPicked&&teamReadyForRound(playerSize); bet=parseBet; walletOk=bet>0&&bet<=balance; disabled=!(teamOk&&walletOk); text='PICK A STARTER'|'TEAM INCOMPLETE'|'PLACE BET'|`START · BET ${bet}`
    else: round=ROUNDS[idx]; teamOk; text=`START ROUND ${idx+1}`|'TEAM INCOMPLETE'
  teamReadyForRound(playerSize)→bool: first N bots all botIsComplete
  parseBet()→int: parseInt(elBetInput.value)>0?v:0
  refreshRunbar(): elCoins/elCoinsActive=balance; !active→show pre; else show active fields(bet,round,pot,mult,nextMult,matchup); refreshStartButton
  onStartClick(): if !run.active{bet=parseBet; !W.spend(bet)→ret; run={active:T,bet,roundsWon:0,currentRoundIdx:0}}; refreshRunbar; startBattle
  _drawEnemyTeam(size)→specs[]: pool=ENEMY_TEAMS_BY_SIZE[size]; if bag empty→refill bag=indices; Fisher-Yates shuffle; idx=pop; ret pool[idx]
  startBattle(): round=ROUNDS[idx]; playerSpecs=team.slice(0,playerSize); enemyTeam=_drawEnemyTeam(enemySize); enemySpecs=map(entry→typeof string?ENEMY_BOTS[entry]:entry); state.battle=BT.createBattle; phase='battle'; lastSimTime=now; simAcc=0; show battle panel; cancel+request rAF(loop)
  loop(now): rafId=rAF(loop); guard(phase!=='battle'||!battle); dtMs=min(100,now-lastSimTime); simAccumulator+=dtMs/1000; fixed=1/tickHz; while acc>=fixed && !winner && steps<8→BT.step(fixed); acc-=fixed; clamp if acc>fixed*8→0; RN.render; updateHud; winner→onBattleEnd
  updateHud(): elTimer=(timeoutSec-t).toFixed(1)+'s'; pAlive/eAlive counts; updateLog
  updateLog(): last3 events→<div sb-log-line sb-log-${team}><span>t</span> text</div>; pad empties
  escapeHtml(s)→str: replace [&<>"'] with entities
  onBattleEnd(): phase='resolution'; abandon hidden; winner==='player'?onRoundWon:onRoundLost
  onRoundWon(): roundsWon=idx+1; reasonText; isFinal=rw>=ROUNDS.length; pot=potBetween; nextPot;
    resultText=isFinal?'RUN COMPLETE…':`ROUND N WON…`; detail builds pot text;
    isFinal→W.add(pot);finishRun; Return btn→close+backToProgramming;
    else build pick-2 UI: bucket=UNLOCKS[idx]; picked Set; ∀id→tile{label,desc,click toggle picked w/ max=2}; syncPickUI updates count+continueBtn.disabled; Cash Out→W.add+finish+back; Continue→add picks to r.unlocked, currentRoundIdx++, back
  kindOf(id)/mapOf(kind)/labelOf(id,kind)/descOf(id,kind): mirror programming.js lookups
  onRoundLost(): resultText=`ROUND N LOST…`; detail='bet gone'; finishRun; Programming btn→close+back
  onAbandon(): guard(phase!=='battle'); refund=potMidRound; W.add(refund); cancel rAF; phase='resolution'; resultText='ABANDONED'; detail with refund; finishRun; Programming btn
  finishRun(): run.active=F; bet=0; roundsWon=0; currentRoundIdx=0; team=defaultTeam; unlocked=unlockedFromStarter; selectedBotIdx=0; selectedStarterIdx=-1; ∀k∈_enemyBag→null
  makeBtn(label,klass,onClick)→<button.sb-btn ${klass}>: text,click
  reasonString(reason,winner)→str: annihilation/healStalemate/timeout/mutual variants
  closeResolution(): hide elResolution; clear elResultActions
  backToProgramming(): cancel rAF; phase='programming'; battle=null; hide battle/resolution; show programming; PG.buildPalette; refreshRoster; refreshRunbar
  exports: window.ShapebotsLock={isUnlocked}; on DOMContentLoaded(or already loaded)→init
*/

// Shapebots — phase state machine + main loop + run/bet logic.

(function () {
  'use strict';

  const D  = window.ShapebotsData;
  const PG = window.ShapebotsProgramming;
  const BT = window.ShapebotsBattle;
  const RN = window.ShapebotsRender;
  const W  = window.Wallet;
  const TS = window.ShapebotsTeamStore;

  // 7 rounds. Multiplier on bet for cashing out after roundsWon = N is N * 0.5.
  function multiplierFor(roundsWon) { return roundsWon * 0.5; }
  function potBetween(bet, roundsWon)    { return Math.floor(bet * multiplierFor(roundsWon)); }
  function potMidRound(bet, roundsWon)   { return Math.floor(bet * multiplierFor(roundsWon) * 0.5); }

  const PICKS_PER_ROUND = 2;

  // Starter unlocks are derived from whatever programs are in the player's
  // starter slots (bots 0 and 1) — pick "Twin Bruisers" and you do NOT have Heal
  // until you pick it from a round's unlock bucket. Slots 2–4 are filled with
  // unlock-earned programs in later rounds and DO NOT count toward starter unlocks.
  function unlockedFromStarter(team) {
    const ids = new Set();
    (team || []).slice(0, 2).forEach(bot => {
      if (!bot || !bot.type) return;
      ids.add(bot.type);
      if (bot.default) {
        if (bot.default.attack) ids.add(bot.default.attack);
        if (bot.default.target) ids.add(bot.default.target);
        if (bot.default.move)   ids.add(bot.default.move);
      }
      if (bot.trigger) ids.add(bot.trigger);
      if (bot.special) {
        if (bot.special.kind === 'passive' && bot.special.passive) ids.add(bot.special.passive);
        if (bot.special.kind === 'active'  && bot.special.effect)  ids.add(bot.special.effect);
      }
    });
    // Always grant the lowest-HP ally target so any starter team can use a Heal pick.
    ids.add('lowestHpAlly');
    // Always grant the per-slot follow-ally moves — these are core team-coordination tools.
    ids.add('followAllyA');
    ids.add('followAllyB');
    ids.add('followAllyC');
    ids.add('followAllyD');
    ids.add('followAllyE');
    return ids;
  }

  const _initialTeam = PG.defaultTeam();
  const state = {
    phase: 'programming',
    team: _initialTeam,
    selectedBotIdx: 0,
    battle: null,
    lastSimTime: 0,
    simAccumulator: 0,
    rafId: null,
    run: {
      active: false,
      bet: 0,
      roundsWon: 0,
      currentRoundIdx: 0,
      unlocked: unlockedFromStarter(_initialTeam),
    },
  };

  // Expose lock state for programming.js to consult.
  window.ShapebotsLock = {
    isUnlocked(id) { return state.run.unlocked.has(id); },
  };

  // DOM refs.
  let elPalette, elBotTiles, elBotDetail, elStart, elProgrammingPanel, elBattlePanel, elCanvas,
      elHud, elTimer, elPAlive, elEAlive, elResolution, elResultText, elResultDetail, elResultActions,
      elAbandon, elRunbarPre, elRunbarActive, elBetInput, elCoins, elCoinsActive,
      elRbBet, elRbRound, elRbPot, elRbMult, elRbNextMult, elRbMatchup, elLog,
      elStarterPicker,
      elLibSelect, elLibLoad, elLibSave, elLibDelete, elLibExport, elLibImport, elLibFile;
  let selectedStarterIdx = -1; // -1 = no starter picked yet

  function init() {
    elPalette          = document.getElementById('sb-palette');
    elBotTiles         = document.getElementById('sb-bot-tiles');
    elBotDetail        = document.getElementById('sb-bot-detail');
    elStart            = document.getElementById('sb-start');
    elProgrammingPanel = document.getElementById('sb-programming');
    elBattlePanel      = document.getElementById('sb-battle');
    elCanvas           = document.getElementById('sb-canvas');
    elHud              = document.getElementById('sb-hud');
    elTimer            = document.getElementById('sb-timer');
    elPAlive           = document.getElementById('sb-palive');
    elEAlive           = document.getElementById('sb-ealive');
    elResolution       = document.getElementById('sb-resolution');
    elResultText       = document.getElementById('sb-result-text');
    elResultDetail     = document.getElementById('sb-result-detail');
    elResultActions    = document.getElementById('sb-result-actions');
    elAbandon          = document.getElementById('sb-abandon');
    elRunbarPre        = document.getElementById('sb-runbar-pre');
    elRunbarActive     = document.getElementById('sb-runbar-active');
    elBetInput         = document.getElementById('sb-bet-input');
    elCoins            = document.getElementById('sb-runbar-coins');
    elCoinsActive      = document.getElementById('sb-runbar-coins-active');
    elRbBet            = document.getElementById('sb-rb-bet');
    elRbRound          = document.getElementById('sb-rb-round');
    elRbPot            = document.getElementById('sb-rb-pot');
    elRbMult           = document.getElementById('sb-rb-mult');
    elRbNextMult       = document.getElementById('sb-rb-nextmult');
    elRbMatchup        = document.getElementById('sb-rb-matchup');
    elLog              = document.getElementById('sb-log');
    elStarterPicker    = document.getElementById('sb-starter-picker');
    elLibSelect        = document.getElementById('sb-library-select');
    elLibLoad          = document.getElementById('sb-lib-load');
    elLibSave          = document.getElementById('sb-lib-save');
    elLibDelete        = document.getElementById('sb-lib-delete');
    elLibExport        = document.getElementById('sb-lib-export');
    elLibImport        = document.getElementById('sb-lib-import');
    elLibFile          = document.getElementById('sb-lib-file');

    PG.buildPalette(elPalette);
    refreshRoster();
    refreshRunbar();

    if (W) W.onChange(() => refreshRunbar());

    elStart.addEventListener('click', onStartClick);
    elAbandon.addEventListener('click', onAbandon);
    elBetInput.addEventListener('input', refreshStartButton);

    elLibSelect.addEventListener('change', refreshLibraryButtons);
    elLibLoad.addEventListener('click', onLibraryLoad);
    elLibSave.addEventListener('click', onLibrarySave);
    elLibDelete.addEventListener('click', onLibraryDelete);
    elLibExport.addEventListener('click', onLibraryExport);
    elLibImport.addEventListener('click', () => elLibFile.click());
    elLibFile.addEventListener('change', onLibraryImportFile);

    elCanvas.width = D.ARENA.w;
    elCanvas.height = D.ARENA.h;

    loadEnemyTeams();
    refreshLibrary();
  }

  // Attempts to fetch the smart enemy teams JSON and apply it over D.ENEMY_TEAMS_BY_SIZE.
  // JSON shape: { "1": [team1, team2, ...], "2": [...], ... } where each team is
  // an array of bot specs (same shape as a player bot).
  // If the fetch fails (file://, etc.) we silently keep the inline fallback teams.
  function loadEnemyTeams() {
    const url = '../../assets/json/enemy-teams.json';
    fetch(url)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
      .then(data => {
        Object.keys(data).forEach(sizeKey => {
          if (sizeKey.startsWith('_')) return;          // skip comment keys
          const size = parseInt(sizeKey, 10);
          if (!Number.isFinite(size)) return;
          const list = data[sizeKey];
          if (!Array.isArray(list) || list.length === 0) return;
          // Normalize: each list entry is either an array of specs, or { bots: [...] }.
          const teams = list.map(t => Array.isArray(t) ? t : (t && t.bots) || []).filter(t => t.length === size);
          if (teams.length) {
            D.ENEMY_TEAMS_BY_SIZE[size] = teams;
            _enemyBag[size] = null;          // reshuffle now that the pool changed
          }
        });
      })
      .catch(err => {
        // Likely file:// CORS — keep the fallback teams from data.js.
        console.warn('Could not load enemy-teams.json — using fallback teams.', err.message);
      });
  }

  // ----- UI refreshers -----
  function refreshRoster() {
    const round = D.ROUNDS[state.run.currentRoundIdx] || D.ROUNDS[0];
    PG.buildBotTiles(elBotTiles, state.team, state.selectedBotIdx, idx => {
      state.selectedBotIdx = idx;
      refreshRoster();
    }, round.playerSize);
    PG.buildBotDetail(elBotDetail, state.team[state.selectedBotIdx], state.selectedBotIdx, refreshRoster);
    refreshStarterPicker();
    refreshStartButton();
  }

  function refreshStarterPicker() {
    if (!elStarterPicker || !D.PLAYER_STARTERS) return;
    // Only show before the run starts — once committed, no reroll.
    if (state.run.active) { elStarterPicker.hidden = true; return; }
    elStarterPicker.hidden = false;
    elStarterPicker.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'sb-starter-header';
    header.textContent = selectedStarterIdx < 0 ? 'Pick a starter team ↓' : 'Starter team';
    elStarterPicker.appendChild(header);
    D.PLAYER_STARTERS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sb-starter-btn' + (i === selectedStarterIdx ? ' sb-starter-btn-on' : '');
      btn.title = preset.desc || '';
      const name = document.createElement('div');
      name.className = 'sb-starter-name';
      name.textContent = preset.name;
      const desc = document.createElement('div');
      desc.className = 'sb-starter-desc';
      desc.textContent = preset.desc || '';
      btn.appendChild(name);
      btn.appendChild(desc);
      btn.addEventListener('click', () => applyStarter(i));
      elStarterPicker.appendChild(btn);
    });
  }

  // ----- Team library -----
  function refreshLibrary() {
    if (!elLibSelect || !TS) return;
    const teams = TS.list();
    const current = elLibSelect.value;
    elLibSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = teams.length ? '— saved teams —' : '— no saved teams —';
    elLibSelect.appendChild(placeholder);
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      elLibSelect.appendChild(opt);
    });
    if (teams.some(t => t.name === current)) elLibSelect.value = current;
    refreshLibraryButtons();
  }

  function refreshLibraryButtons() {
    const hasSelection = !!(elLibSelect && elLibSelect.value);
    elLibLoad.disabled   = !hasSelection;
    elLibDelete.disabled = !hasSelection;
    elLibExport.disabled = !hasSelection;
  }

  function onLibraryLoad() {
    const name = elLibSelect.value;
    if (!name) return;
    const team = TS.load(name);
    if (!team || !Array.isArray(team.bots)) return;
    // Fill state.team — pad to 5 with empty bots.
    const fresh = PG.defaultTeam();
    team.bots.slice(0, 5).forEach((b, i) => { fresh[i] = b; });
    state.team = fresh;
    state.selectedBotIdx = 0;
    refreshRoster();
  }

  function onLibrarySave() {
    if (!TS) return;
    const suggested = (TS.list()[0] && TS.list()[0].name) || `Team ${TS.list().length + 1}`;
    const name = (window.prompt('Save current team as:', suggested) || '').trim();
    if (!name) return;
    if (TS.exists(name) && !window.confirm(`"${name}" already exists. Overwrite?`)) return;
    TS.save(name, state.team);
    refreshLibrary();
    elLibSelect.value = name;
    refreshLibraryButtons();
  }

  function onLibraryDelete() {
    const name = elLibSelect.value;
    if (!name) return;
    if (!window.confirm(`Delete saved team "${name}"?`)) return;
    TS.remove(name);
    refreshLibrary();
  }

  function onLibraryExport() {
    const name = elLibSelect.value;
    if (!name) return;
    TS.exportTeamToFile(name);
  }

  function onLibraryImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    TS.importTeamFromFile(file)
      .then(name => {
        refreshLibrary();
        elLibSelect.value = name;
        refreshLibraryButtons();
      })
      .catch(err => window.alert('Could not import team: ' + err.message))
      .finally(() => { elLibFile.value = ''; });
  }

  function applyStarter(idx) {
    const preset = D.PLAYER_STARTERS && D.PLAYER_STARTERS[idx];
    if (!preset) return;
    selectedStarterIdx = idx;
    // Deep-copy the preset bots so subsequent edits don't mutate the library.
    state.team[0] = JSON.parse(JSON.stringify(preset.bots[0]));
    state.team[1] = JSON.parse(JSON.stringify(preset.bots[1]));
    // Clear later slots — switching starter is a fresh slate, no leftover programs.
    for (let i = 2; i < state.team.length; i++) {
      state.team[i] = PG.defaultBot();
    }
    // Unlock set is derived from whichever starter you actually picked.
    state.run.unlocked = unlockedFromStarter(state.team);
    PG.buildPalette(elPalette);
    state.selectedBotIdx = 0;
    refreshRoster();
  }

  function refreshStartButton() {
    const r = state.run;
    if (!r.active) {
      const round = D.ROUNDS[0];
      const starterPicked = selectedStarterIdx >= 0;
      const teamOk = starterPicked && teamReadyForRound(round.playerSize);
      const bet = parseBet();
      const walletOk = W ? bet > 0 && bet <= W.getBalance() : bet > 0;
      elStart.disabled = !(teamOk && walletOk);
      if (!starterPicked) {
        elStart.textContent = 'PICK A STARTER';
      } else if (!teamOk) {
        elStart.textContent = 'TEAM INCOMPLETE';
      } else if (!walletOk) {
        elStart.textContent = 'PLACE BET';
      } else {
        elStart.textContent = `START · BET ${bet}`;
      }
    } else {
      const round = D.ROUNDS[r.currentRoundIdx];
      const teamOk = teamReadyForRound(round.playerSize);
      elStart.disabled = !teamOk;
      elStart.textContent = teamOk ? `START ROUND ${r.currentRoundIdx + 1}` : 'TEAM INCOMPLETE';
    }
  }

  function teamReadyForRound(playerSize) {
    // Need first `playerSize` bots in state.team to be complete.
    for (let i = 0; i < playerSize; i++) {
      if (!PG.botIsComplete(state.team[i])) return false;
    }
    return true;
  }

  function parseBet() {
    const v = parseInt(elBetInput.value, 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function refreshRunbar() {
    const r = state.run;
    if (W) {
      const balance = String(W.getBalance());
      elCoins.textContent = balance;
      elCoinsActive.textContent = balance;
    }
    if (!r.active) {
      elRunbarPre.hidden = false;
      elRunbarActive.hidden = true;
    } else {
      elRunbarPre.hidden = true;
      elRunbarActive.hidden = false;
      elRbBet.textContent      = String(r.bet);
      elRbRound.textContent    = String(r.currentRoundIdx + 1);
      elRbPot.textContent      = String(potBetween(r.bet, r.roundsWon));
      elRbMult.textContent     = '×' + multiplierFor(r.roundsWon).toFixed(1);
      elRbNextMult.textContent = '×' + multiplierFor(r.roundsWon + 1).toFixed(1);
      const round = D.ROUNDS[r.currentRoundIdx];
      elRbMatchup.textContent  = `${round.playerSize} v ${round.enemySize}`;
    }
    refreshStartButton();
  }

  // ----- run lifecycle -----
  function onStartClick() {
    const r = state.run;
    if (!r.active) {
      // Place bet, start run at R1.
      const bet = parseBet();
      if (!bet || !W || !W.spend(bet)) return;
      r.active = true;
      r.bet = bet;
      r.roundsWon = 0;
      r.currentRoundIdx = 0;
    }
    refreshRunbar();
    startBattle();
  }

  // Random-roll draw: sample `size` distinct archetypes from the global pool.
  // Every battle is a fresh roll — no fixed teams, no repeats within a team.
  // (Kept as `_enemyBag` placeholder for back-compat with finishRun's reset loop.)
  const _enemyBag = {};
  function _drawEnemyTeam(size) {
    const pool = (D.ENEMY_ARCHETYPES) || [];
    if (!pool.length) return [];
    // Build a shuffled list of indices via Fisher–Yates, then take the first `size`.
    const indices = pool.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }
    const n = Math.min(size, indices.length);
    return indices.slice(0, n).map(i => pool[i]);
  }

  function startBattle() {
    const round = D.ROUNDS[state.run.currentRoundIdx];
    if (!round) return;
    const playerSpecs = state.team.slice(0, round.playerSize);
    // Draw an enemy team of the right size from the shuffled bag (no repeats until exhausted).
    const team  = _drawEnemyTeam(round.enemySize);
    // Each enemy entry is either a string key (look up in ENEMY_BOTS) or a full inline spec.
    const enemySpecs = team.map(entry =>
      (typeof entry === 'string') ? D.ENEMY_BOTS[entry] : entry
    );
    state.battle = BT.createBattle(playerSpecs, enemySpecs);
    state.phase = 'battle';
    state.lastSimTime = performance.now();
    state.simAccumulator = 0;
    elProgrammingPanel.hidden = true;
    elBattlePanel.hidden = false;
    elResolution.hidden = true;
    elAbandon.hidden = false;
    if (window.Sound) window.Sound.start();
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    state.rafId = requestAnimationFrame(loop);
    if (state.phase !== 'battle' || !state.battle) return;
    const dtMs = Math.min(100, now - state.lastSimTime);
    state.lastSimTime = now;
    state.simAccumulator += dtMs / 1000;
    const fixed = 1 / D.BATTLE.tickHz;
    let steps = 0;
    while (state.simAccumulator >= fixed && !state.battle.winner && steps < 8) {
      BT.step(state.battle, fixed);
      state.simAccumulator -= fixed;
      steps++;
    }
    if (state.simAccumulator > fixed * 8) state.simAccumulator = 0;
    const ctx = elCanvas.getContext('2d');
    RN.render(ctx, state.battle);
    updateHud();
    if (state.battle.winner) onBattleEnd();
  }

  function updateHud() {
    const remaining = Math.max(0, D.BATTLE.timeoutSec - state.battle.t);
    elTimer.textContent = remaining.toFixed(1) + 's';
    const p = state.battle.bots.filter(b => b.alive && b.team === 'player').length;
    const e = state.battle.bots.filter(b => b.alive && b.team === 'enemy').length;
    elPAlive.textContent = String(p);
    elEAlive.textContent = String(e);
    updateLog();
  }

  function updateLog() {
    if (!elLog || !state.battle) return;
    const evs = state.battle.events || [];
    const last3 = evs.slice(-3);
    let html = '';
    for (const e of last3) {
      const cls = `sb-log-line sb-log-${e.team}`;
      html += `<div class="${cls}"><span class="sb-log-t">${e.t.toFixed(1)}s</span> ${escapeHtml(e.text)}</div>`;
    }
    if (last3.length < 3) {
      for (let i = last3.length; i < 3; i++) {
        html += '<div class="sb-log-line sb-log-empty">—</div>';
      }
    }
    elLog.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function onBattleEnd() {
    state.phase = 'resolution';
    elAbandon.hidden = true;
    const winnerIsPlayer = state.battle.winner === 'player';
    if (window.Sound) {
      if (winnerIsPlayer) window.Sound.roundWon();
      else                window.Sound.roundLost();
    }
    if (winnerIsPlayer) onRoundWon();
    else onRoundLost();
  }

  // ----- round resolution -----
  function onRoundWon() {
    const r = state.run;
    r.roundsWon = r.currentRoundIdx + 1;
    const reasonText = reasonString(state.battle.reason, state.battle.winner);
    const isFinal = r.roundsWon >= D.ROUNDS.length;
    const pot     = potBetween(r.bet, r.roundsWon);
    const nextPot = isFinal ? null : potBetween(r.bet, r.roundsWon + 1);

    elResultText.textContent = isFinal
      ? `RUN COMPLETE — bet ${r.bet} → ${pot}`
      : `ROUND ${r.currentRoundIdx + 1} WON${reasonText ? ' — ' + reasonText : ''}`;

    let detail = `Pot is now <strong>${pot}</strong> (×${multiplierFor(r.roundsWon).toFixed(1)} on your ${r.bet} bet).`;
    if (!isFinal) {
      const nextRound = D.ROUNDS[r.currentRoundIdx + 1];
      detail += `<br>Next round (${nextRound.playerSize} v ${nextRound.enemySize}) pays ×${multiplierFor(r.roundsWon + 1).toFixed(1)} = <strong>${nextPot}</strong> if you survive.`;
    } else {
      detail += '<br>That\'s the final round. You played the whole gauntlet.';
    }
    elResultDetail.innerHTML = detail;

    elResultActions.innerHTML = '';

    if (isFinal) {
      W.add(pot);
      if (window.Sound) window.Sound.cashOut();
      finishRun();
      elResultActions.appendChild(makeBtn('Return', 'sb-btn-primary', () => {
        closeResolution();
        backToProgramming();
      }));
      elResolution.hidden = false;
      return;
    }

    // Build the pick-N UI for the next round's unlocks.
    // The draft pool is the UNION of every unlock bucket — round progression no longer
    // gates which programs are reachable. Strip ids the player already has, Fisher–Yates
    // shuffle, then slice down to a small offer count.
    const OFFERS_PER_ROUND = 4;
    const fullPool = (D.UNLOCKS || []).reduce((acc, arr) => acc.concat(arr || []), []);
    const shuffled = fullPool.filter(id => !r.unlocked.has(id));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    const bucket = shuffled.slice(0, Math.min(OFFERS_PER_ROUND, shuffled.length));
    const maxPicks = Math.min(PICKS_PER_ROUND, bucket.length);

    const picked = new Set();
    const pickPanel = document.createElement('div');
    pickPanel.className = 'sb-pick-panel';
    const pickHead = document.createElement('div');
    pickHead.className = 'sb-pick-head';
    const pickCount = document.createElement('span');
    pickCount.className = 'sb-pick-count';
    if (maxPicks > 0) {
      pickHead.appendChild(document.createTextNode(`Pick ${maxPicks} unlock${maxPicks === 1 ? '' : 's'} · `));
      pickHead.appendChild(pickCount);
    } else {
      pickHead.appendChild(document.createTextNode('No new unlocks available — press Continue.'));
    }
    pickPanel.appendChild(pickHead);
    const pickList = document.createElement('div');
    pickList.className = 'sb-pick-list';
    pickPanel.appendChild(pickList);

    let continueBtn;
    function syncPickUI() {
      const remaining = maxPicks - picked.size;
      pickCount.textContent = remaining === 0
        ? `done — ${picked.size} picked`
        : `${remaining} left`;
      Array.from(pickList.children).forEach(tile => {
        const id = tile.dataset.id;
        const isPicked = picked.has(id);
        tile.classList.toggle('sb-pick-picked', isPicked);
        const atMax = picked.size >= maxPicks;
        tile.classList.toggle('sb-pick-disabled', !isPicked && atMax);
      });
      if (continueBtn) continueBtn.disabled = picked.size < maxPicks;
    }

    bucket.forEach(id => {
      const kind = kindOf(id);
      const label = labelOf(id, kind);
      const desc = descOf(id, kind);
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `sb-pick-tile sb-tile-${kind}`;
      tile.dataset.id = id;
      tile.title = desc ? `${label} — ${desc}` : label;
      const labelEl = document.createElement('div');
      labelEl.className = 'sb-pick-tile-label';
      labelEl.textContent = label;
      tile.appendChild(labelEl);
      if (desc) {
        const descEl = document.createElement('div');
        descEl.className = 'sb-pick-tile-desc';
        descEl.textContent = desc;
        tile.appendChild(descEl);
      }
      tile.addEventListener('click', () => {
        if (picked.has(id)) {
          picked.delete(id);
        } else {
          if (picked.size >= maxPicks) return;
          picked.add(id);
        }
        syncPickUI();
      });
      pickList.appendChild(tile);
    });

    elResultDetail.appendChild(pickPanel);

    elResultActions.appendChild(makeBtn(`Cash Out · ${pot}`, 'sb-btn-secondary', () => {
      W.add(pot);
      if (window.Sound) window.Sound.cashOut();
      finishRun();
      closeResolution();
      backToProgramming();
    }));
    continueBtn = makeBtn(`Continue · Round ${r.currentRoundIdx + 2}`, 'sb-btn-primary', () => {
      picked.forEach(id => r.unlocked.add(id));
      r.currentRoundIdx++;
      closeResolution();
      backToProgramming();
    });
    continueBtn.disabled = true;
    elResultActions.appendChild(continueBtn);

    syncPickUI();
    elResolution.hidden = false;
  }

  function kindOf(id) {
    if (D.TYPES   [id]) return 'type';
    if (D.ATTACKS [id]) return 'attack';
    if (D.TARGETS [id]) return 'target';
    if (D.MOVES   [id]) return 'move';
    if (D.TRIGGERS[id]) return 'trigger';
    if (D.PASSIVES[id]) return 'passive';
    if (D.EFFECTS [id]) return 'effect';
    return 'unknown';
  }
  function mapOf(kind) {
    return (
      kind === 'type'    ? D.TYPES    :
      kind === 'attack'  ? D.ATTACKS  :
      kind === 'target'  ? D.TARGETS  :
      kind === 'move'    ? D.MOVES    :
      kind === 'trigger' ? D.TRIGGERS :
      kind === 'passive' ? D.PASSIVES :
      kind === 'effect'  ? D.EFFECTS  : null
    );
  }
  function labelOf(id, kind) {
    const m = mapOf(kind);
    return (m && m[id] && m[id].label) || id;
  }
  function descOf(id, kind) {
    const m = mapOf(kind);
    return (m && m[id] && m[id].desc) || '';
  }

  function onRoundLost() {
    const r = state.run;
    const reasonText = reasonString(state.battle.reason, state.battle.winner);
    elResultText.textContent = `ROUND ${r.currentRoundIdx + 1} LOST${reasonText ? ' — ' + reasonText : ''}`;
    elResultDetail.innerHTML = `Your bet of <strong>${r.bet}</strong> is gone. Pot zeroed.`;
    elResultActions.innerHTML = '';
    finishRun();
    elResultActions.appendChild(makeBtn('Programming', 'sb-btn-primary', () => {
      closeResolution();
      backToProgramming();
    }));
    elResolution.hidden = false;
  }

  function onAbandon() {
    if (state.phase !== 'battle' || !state.battle) return;
    const r = state.run;
    const refund = potMidRound(r.bet, r.roundsWon);
    if (refund > 0) W.add(refund);
    if (window.Sound) window.Sound.abandon();
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    state.phase = 'resolution';
    elAbandon.hidden = true;
    elResultText.textContent = 'ABANDONED MID-ROUND';
    elResultDetail.innerHTML = `Banked <strong>${refund}</strong> (half of pot value before this round). Run over.`;
    elResultActions.innerHTML = '';
    finishRun();
    elResultActions.appendChild(makeBtn('Programming', 'sb-btn-primary', () => {
      closeResolution();
      backToProgramming();
    }));
    elResolution.hidden = false;
  }

  function finishRun() {
    state.run.active = false;
    state.run.bet = 0;
    state.run.roundsWon = 0;
    state.run.currentRoundIdx = 0;
    // Reset the team to empty and force the player to pick a starter again.
    state.team = PG.defaultTeam();
    state.run.unlocked = unlockedFromStarter(state.team);
    state.selectedBotIdx = 0;
    selectedStarterIdx = -1;
    // Fresh shuffle next run.
    for (const k in _enemyBag) _enemyBag[k] = null;
  }

  function makeBtn(label, klass, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sb-btn ' + (klass || '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function reasonString(reason, winner) {
    if (reason === 'annihilation') {
      return winner === 'player' ? 'all enemies down' : 'all your bots are down';
    }
    if (reason === 'healStalemate') {
      return winner === 'player' ? 'opposing healers gave up' : 'your healers gave up';
    }
    if (reason === 'timeout') return 'time ran out — judged on remaining HP';
    if (reason === 'mutual')  return 'mutual destruction';
    return '';
  }

  function closeResolution() {
    elResolution.hidden = true;
    elResultActions.innerHTML = '';
  }

  function backToProgramming() {
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    state.phase = 'programming';
    state.battle = null;
    elBattlePanel.hidden = true;
    elResolution.hidden = true;
    elProgrammingPanel.hidden = false;
    // Palette tile lock state changes between rounds — rebuild it.
    PG.buildPalette(elPalette);
    refreshRoster();
    refreshRunbar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
