/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS PROGRAMMING  —  drag/drop card UI for bot programs            │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   buildPalette(container) ──► fills left palette with tile sections      │
  │      └─ PALETTE_SECTIONS (CHASSIS, ATTACK, TARGET, MOVE, TRIGGER,        │
  │         SPECIAL) ─► paletteEntries(kind) ─► makeTile(kind, opt)          │
  │            └─ isUnlocked(id) consults window.ShapebotsLock               │
  │                                                                          │
  │   buildTeamCards(container, team, onChange)                              │
  │      └─ team.forEach ─► buildBotCard(bot, idx, onChange)                 │
  │                                                                          │
  │   buildBotTiles(container, team, selectedIdx, onSelect, activeCount)     │
  │      ──► header tile row (one per slot, inactive past activeCount)       │
  │                                                                          │
  │   buildBotDetail(container, bot, idx, onChange)                          │
  │      └─ buildBotCard(...)                                                │
  │                                                                          │
  │   buildBotCard(bot, idx, onChange) ──► <div.sb-bot-card>                 │
  │      ├─ name input + renderPreview(bot) (calls ShapebotsBot.previewStats)│
  │      ├─ row1: makeSlot[type] · makeSlot[attack] · makeSlot[target]       │
  │      │     (attack swap clears mismatched target side)                   │
  │      ├─ row2: makeSlot[move] · makeSlot[trigger]                         │
  │      ├─ row3: makeSlot[passive|effect]  (special)                        │
  │      └─ soft warnings (melee+kite, heal+wrong target)                    │
  │                                                                          │
  │   makeSlot(opts) ──► <div.sb-slot>                                       │
  │      ├─ drag/drop: accepts kinds, calls opts.onDrop({kind,id})           │
  │      └─ click ─► showSlotMenu(slot, opts)                                │
  │            └─ buildMenuGroups(opts) ─► closeOpenMenu / onOutsideClick    │
  │                                                                          │
  │   Validation: botIsComplete(bot), teamIsComplete(team), specialComplete  │
  │   Lookups:    kindOfId(id), labelFor, descFor, tooltipFor, mapFor        │
  │   Factories: defaultBot(), defaultTeam() (5 blank bots)                  │
  │                                                                          │
  │   Exports (window.ShapebotsProgramming): { defaultTeam, defaultBot,      │
  │      teamIsComplete, botIsComplete, buildPalette, buildTeamCards,        │
  │      buildBotTiles, buildBotDetail }                                     │
  │   External deps: window.ShapebotsData (all maps), window.ShapebotsBot    │
  │                  (previewStats), window.ShapebotsLock (isUnlocked)       │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  D=global.ShapebotsData; openMenu=null (module-state for slot dropdown)
  PALETTE_SECTIONS=[{id:'type',title:'CHASSIS',pull:['type']},{attack},{target,groupBy:'side',groupLabels:{enemy,ally}},{move},{trigger},{special,pull:['passive','effect']}]
  paletteEntries(kind)→[{id,label,kind}]: m=mapFor(kind); ret Object.keys(m).map(k→{id:k,label:m[k].label,kind})
  defaultBot()→{name:null,type:null,default:{attack,target,move:null},reaction:{trigger,override:null},special:null}
  defaultTeam()→[5 defaultBot()]
  isUnlocked(id)→bool: !id→T; consult window.ShapebotsLock.isUnlocked
  specialComplete(bot)→bool: s=bot.special; !s→F; passive→has passive&&unlocked; active→effect&&unlocked&&(!trigger||unlocked)
  botIsComplete(bot)→bool: type+default.attack/target/move all set&&unlocked; specialComplete
  teamIsComplete(team)→bool: every botIsComplete
  mapFor(kind)→TYPES|ATTACKS|TARGETS|MOVES|TRIGGERS|PASSIVES|EFFECTS|null
  labelFor(kind,id)/descFor/tooltipFor: lookup via mapFor; tooltip="label — desc"
  kindOfId(id)→str: probe MOVES,TARGETS,TRIGGERS,PASSIVES,EFFECTS,ATTACKS,TYPES in order
  makeTile(kind,opt)→<div.sb-tile-${kind}>: locked→'???' class sb-tile-locked; tooltip; draggable=!locked; dragstart sets dataTransfer JSON{kind,id} effectAllowed='copy'; dragend clear class
  buildPalette(container): clear; ∀sec∈SECTIONS{section+header+list; if groupBy==='side'→split TARGETS into enemy/ally groups with dividers; else ∀kind∈sec.pull{if multiple→divider for kind; entries→makeTile}}
  makeSlot(opts)→<div.sb-slot>: themeKind||accepts[0] class; if filled→sb-slot-filled+kind+lock class, set text+title; else placeholder; bind dragover/leave/drop(parse JSON, validate accepts+unlocked, call opts.onDrop); click→showSlotMenu
  closeOpenMenu(): rm doc mousedown listener; openMenu.remove; null
  onOutsideClick(e): if openMenu&&!contains(target)→closeOpenMenu
  buildMenuGroups(opts)→groups[]: ∀kind∈opts.accepts→entries=paletteEntries.filter(menuFilter); target→split enemy/ally; passive/effect→labeled groups; else single null-label
  showSlotMenu(slot,opts): closeOpenMenu; menu=<div.sb-slot-menu>; if filled→'— clear —' item→opts.onClear; groups→items{locked→'??? — locked' no click; else click→opts.onDrop+closeOpenMenu}; position fixed at slot rect, flip up if past viewport bottom; defer add outsideClick listener
  blockRow(label)→<div.sb-block-row> with label
  buildBotCard(bot,idx,onChange)→<div.sb-bot-card>:
    head: name input(maxLen 18, blur+Enter→commit→bot.name=v||null+onChange) + stats=renderPreview(bot)
    row1(type/attack/target): chassis slot→{onDrop:set bot.type}; attack slot→{onDrop:set bot.default.attack; if target side mismatch→clear target}; target slot→{menuFilter side match; onDrop validate side}
    row2(move/trigger): move slot; trigger slot→placeholder text varies if specialIsActive
    row3(special): accepts:['passive','effect'], themeKind:'special'; getValue=passive|effect; onDrop→bot.special={kind,passive|effect}
    soft warnings: melee+kite→hint; heal+wrong target→hint
  renderPreview(bot)→<div.sb-preview-wrap>: stats=Bot.previewStats; !stats→'pick a chassis'; else 'HP X · ATK Y · SPD Z[· RNG R]'
  buildTeamCards(container,team,onChange): clear; ∀bot,i→append buildBotCard
  TILE_TYPE_GLYPH={heart:♥,spade:♠,diamond:♦,club:♣}; TILE_WEAPON_GLYPH={melee:/,shotgun:<,beam:~,whirl:@,bomb:*,snipe:=,heal:+}
  buildBotTiles(container,team,selectedIdx,onSelect,activeCount): clear; active=activeCount||len; ∀bot,i→button.sb-bot-tile; i===sel→selected class; deployed=i<active; !deployed→inactive+tooltip; else complete?ok:incomplete; children=num(name||'Bot N')+glyph(type)+wep(weapon); click→onSelect(i)
  buildBotDetail(container,bot,idx,onChange): clear; append buildBotCard
  exports: global.ShapebotsProgramming={defaultTeam,defaultBot,teamIsComplete,botIsComplete,buildPalette,buildTeamCards,buildBotTiles,buildBotDetail}
*/

// Shapebots — programming UI.
// Card-per-bot. Default: attack/target/move. Reaction: trigger + one override (move or target).
// Special: one slot (passive or active effect); if active, a "when…" trigger slot appears.

(function (global) {
  'use strict';

  const D = global.ShapebotsData;

  // Palette display order. "special" combines passive + effect tiles in one section.
  const PALETTE_SECTIONS = [
    { id: 'type',    title: 'CHASSIS',           pull: ['type'] },
    { id: 'attack',  title: 'ATTACK',            pull: ['attack'] },
    { id: 'target',  title: 'TARGET',            pull: ['target'], groupBy: 'side',
      groupLabels: { enemy: 'enemy targets', ally: 'ally targets (for Heal)' } },
    { id: 'move',    title: 'MOVE',              pull: ['move'] },
    { id: 'trigger', title: 'TRIGGER (when…)',   pull: ['trigger'] },
    { id: 'special', title: 'SPECIAL',           pull: ['passive', 'effect'] },
  ];

  function paletteEntries(kind) {
    const m =
      kind === 'type'    ? D.TYPES    :
      kind === 'attack'  ? D.ATTACKS  :
      kind === 'target'  ? D.TARGETS  :
      kind === 'move'    ? D.MOVES    :
      kind === 'trigger' ? D.TRIGGERS :
      kind === 'passive' ? D.PASSIVES :
      kind === 'effect'  ? D.EFFECTS  : null;
    if (!m) return [];
    return Object.keys(m).map(k => ({ id: k, label: m[k].label, kind }));
  }

  function defaultBot() {
    return {
      name: null,
      type: null,
      default:  { attack: null, target: null, move: null },
      reaction: { trigger: null, override: null },
      special:  null,
    };
  }

  // Test-time auto-fill: returns a complete, valid 5-bot team.
  // Flip to `Array.from({ length: 5 }, defaultBot)` to go back to blank slots.
  // No default team — the player must explicitly click a starter from the
  // PLAYER_STARTERS picker to populate bots 1 and 2 and decide their
  // starting unlock set.
  function defaultTeam() {
    return [defaultBot(), defaultBot(), defaultBot(), defaultBot(), defaultBot()];
  }

  function isUnlocked(id) {
    if (!id) return true;
    return !window.ShapebotsLock || window.ShapebotsLock.isUnlocked(id);
  }
  function specialComplete(bot) {
    const s = bot.special;
    if (!s) return false;
    if (s.kind === 'passive') return !!s.passive && isUnlocked(s.passive);
    if (s.kind === 'active')  return !!s.effect && isUnlocked(s.effect) && (!bot.trigger || isUnlocked(bot.trigger));
    return false;
  }
  function botIsComplete(bot) {
    if (!bot.type || !isUnlocked(bot.type)) return false;
    if (!bot.default.attack || !isUnlocked(bot.default.attack)) return false;
    if (!bot.default.target || !isUnlocked(bot.default.target)) return false;
    if (!bot.default.move   || !isUnlocked(bot.default.move))   return false;
    if (!specialComplete(bot)) return false;
    return true;
  }
  function teamIsComplete(team) { return team.every(botIsComplete); }

  function mapFor(kind) {
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
  function labelFor(kind, id) {
    if (!id) return null;
    const m = mapFor(kind);
    return (m && m[id] && m[id].label) || id;
  }
  function descFor(kind, id) {
    if (!id) return null;
    const m = mapFor(kind);
    return (m && m[id] && m[id].desc) || null;
  }
  function tooltipFor(kind, id) {
    const label = labelFor(kind, id);
    const desc  = descFor(kind, id);
    return desc ? `${label} — ${desc}` : (label || '');
  }

  function kindOfId(id) {
    if (!id) return null;
    if (D.MOVES   [id]) return 'move';
    if (D.TARGETS [id]) return 'target';
    if (D.TRIGGERS[id]) return 'trigger';
    if (D.PASSIVES[id]) return 'passive';
    if (D.EFFECTS [id]) return 'effect';
    if (D.ATTACKS [id]) return 'attack';
    if (D.TYPES   [id]) return 'type';
    return null;
  }

  function makeTile(kind, opt) {
    const tile = document.createElement('div');
    tile.className = `sb-tile sb-tile-${kind}`;
    const locked = !isUnlocked(opt.id);
    if (locked) tile.classList.add('sb-tile-locked');
    tile.textContent = locked ? '???' : opt.label;
    tile.title = locked ? 'Locked — unlock by advancing through rounds' : tooltipFor(kind, opt.id);
    tile.draggable = !locked;
    tile.dataset.kind = kind;
    tile.dataset.id = opt.id;
    if (!locked) {
      tile.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ kind, id: opt.id }));
        e.dataTransfer.effectAllowed = 'copy';
        tile.classList.add('sb-dragging');
      });
      tile.addEventListener('dragend', () => tile.classList.remove('sb-dragging'));
    }
    return tile;
  }

  function buildPalette(container) {
    container.innerHTML = '';
    PALETTE_SECTIONS.forEach(sec => {
      const section = document.createElement('div');
      section.className = 'sb-pal-section';
      section.dataset.section = sec.id;
      const header = document.createElement('div');
      header.className = 'sb-pal-header';
      header.textContent = sec.title;
      section.appendChild(header);
      const list = document.createElement('div');
      list.className = 'sb-pal-list';

      if (sec.groupBy === 'side') {
        // Targets: split into enemy + ally subgroups.
        const kind = sec.pull[0]; // 'target'
        const all = paletteEntries(kind);
        const grouped = { enemy: [], ally: [] };
        all.forEach(opt => {
          const side = D.TARGETS[opt.id].side;
          (grouped[side] || (grouped[side] = [])).push(opt);
        });
        ['enemy', 'ally'].forEach(side => {
          if (!grouped[side] || !grouped[side].length) return;
          const div = document.createElement('div');
          div.className = 'sb-pal-divider';
          div.textContent = sec.groupLabels[side];
          list.appendChild(div);
          grouped[side].forEach(opt => list.appendChild(makeTile(kind, opt)));
        });
      } else {
        sec.pull.forEach((kind, kindIdx) => {
          if (sec.pull.length > 1) {
            const div = document.createElement('div');
            div.className = 'sb-pal-divider';
            div.textContent = kind === 'effect' ? 'active effects (need a trigger)' : 'passives (always on)';
            list.appendChild(div);
          }
          paletteEntries(kind).forEach(opt => list.appendChild(makeTile(kind, opt)));
        });
      }
      section.appendChild(list);
      container.appendChild(section);
    });
  }

  // Generic slot. `accepts` is an array of tile kinds the slot will take.
  // `getValue` returns the current id; `getKind` the kind of that id (for label color).
  // `onDrop(data)` is called with the validated drop payload.
  // `onClear()` is called on click when slot is filled.
  function makeSlot(opts) {
    const slot = document.createElement('div');
    const classKind = opts.themeKind || opts.accepts[0];
    slot.className = `sb-slot sb-slot-${classKind}`;
    const id = opts.getValue();
    if (id) {
      const tileKind = opts.getKind ? opts.getKind() : opts.accepts[0];
      slot.classList.add('sb-slot-filled', `sb-slot-${tileKind}`);
      if (!isUnlocked(id)) slot.classList.add('sb-slot-locked');
      slot.textContent = isUnlocked(id) ? labelFor(tileKind, id) : `${labelFor(tileKind, id)} (locked)`;
      slot.title = tooltipFor(tileKind, id);
    } else {
      slot.textContent = opts.placeholder || opts.accepts.join(' / ');
      slot.title = '';
    }
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('sb-slot-hover'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('sb-slot-hover'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('sb-slot-hover');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!data || !opts.accepts.includes(data.kind)) return;
      if (!isUnlocked(data.id)) return;
      opts.onDrop(data);
    });
    slot.addEventListener('click', e => {
      e.stopPropagation();
      showSlotMenu(slot, opts);
    });
    return slot;
  }

  // ---- slot dropdown menu ----
  let openMenu = null;
  function closeOpenMenu() {
    if (openMenu) {
      document.removeEventListener('mousedown', onOutsideClick, true);
      openMenu.remove();
      openMenu = null;
    }
  }
  function onOutsideClick(e) {
    if (openMenu && !openMenu.contains(e.target)) closeOpenMenu();
  }

  function buildMenuGroups(opts) {
    const groups = [];
    opts.accepts.forEach(kind => {
      const entries = paletteEntries(kind).filter(e => !opts.menuFilter || opts.menuFilter(e, kind));
      if (kind === 'target') {
        const enemy = entries.filter(e => D.TARGETS[e.id].side === 'enemy');
        const ally  = entries.filter(e => D.TARGETS[e.id].side === 'ally');
        if (enemy.length) groups.push({ label: 'enemy targets', items: enemy.map(e => ({ ...e, kind })) });
        if (ally.length)  groups.push({ label: 'ally targets',  items: ally .map(e => ({ ...e, kind })) });
      } else if (kind === 'passive') {
        groups.push({ label: 'passives (always on)', items: entries.map(e => ({ ...e, kind })) });
      } else if (kind === 'effect') {
        groups.push({ label: 'active effects (need a trigger)', items: entries.map(e => ({ ...e, kind })) });
      } else {
        groups.push({ label: null, items: entries.map(e => ({ ...e, kind })) });
      }
    });
    return groups;
  }

  function showSlotMenu(slot, opts) {
    closeOpenMenu();
    const menu = document.createElement('div');
    menu.className = 'sb-slot-menu';

    if (opts.getValue()) {
      const clear = document.createElement('div');
      clear.className = 'sb-menu-item sb-menu-clear';
      clear.textContent = '— clear —';
      clear.addEventListener('click', () => { opts.onClear(); closeOpenMenu(); });
      menu.appendChild(clear);
    }

    const groups = buildMenuGroups(opts);
    const currentId = opts.getValue();
    groups.forEach(g => {
      if (g.label) {
        const h = document.createElement('div');
        h.className = 'sb-menu-group';
        h.textContent = g.label;
        menu.appendChild(h);
      }
      g.items.forEach(item => {
        const div = document.createElement('div');
        div.className = `sb-menu-item sb-menu-item-${item.kind}`;
        const locked = !isUnlocked(item.id);
        if (locked) div.classList.add('sb-menu-item-locked');
        if (currentId === item.id) div.classList.add('sb-menu-item-current');
        div.textContent = locked ? '??? — locked' : item.label;
        if (!locked) div.title = tooltipFor(item.kind, item.id);
        if (!locked) {
          div.addEventListener('click', () => { opts.onDrop({ kind: item.kind, id: item.id }); closeOpenMenu(); });
        }
        menu.appendChild(div);
      });
    });

    const rect = slot.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.minWidth = rect.width + 'px';
    document.body.appendChild(menu);

    const mRect = menu.getBoundingClientRect();
    if (mRect.bottom > window.innerHeight - 8) {
      menu.style.top = Math.max(8, rect.top - mRect.height - 4) + 'px';
    }

    openMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
  }

  function blockRow(label) {
    const row = document.createElement('div');
    row.className = 'sb-block-row';
    const lbl = document.createElement('div');
    lbl.className = 'sb-block-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }

  function buildBotCard(bot, idx, onChange) {
    const card = document.createElement('div');
    card.className = 'sb-bot-card';

    // ---- header: name input + stats ----
    const head = document.createElement('div');
    head.className = 'sb-bot-head';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sb-bot-name-input';
    nameInput.placeholder = `Bot ${idx + 1}`;
    nameInput.value = bot.name || '';
    nameInput.maxLength = 18;
    const commitName = () => {
      const v = nameInput.value.trim();
      const newName = v || null;
      if (newName !== bot.name) {
        bot.name = newName;
        onChange();
      }
    };
    nameInput.addEventListener('blur', commitName);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
    head.appendChild(nameInput);
    const stats = document.createElement('div');
    stats.className = 'sb-bot-stats';
    stats.appendChild(renderPreview(bot));
    head.appendChild(stats);
    card.appendChild(head);

    // ---- row 1: chassis · attack · target ----
    const row1 = document.createElement('div');
    row1.className = 'sb-row sb-row-3';
    row1.appendChild(makeSlot({
      accepts: ['type'], placeholder: 'chassis',
      getValue: () => bot.type, getKind: () => 'type',
      onDrop: d => { bot.type = d.id; onChange(); },
      onClear: () => { bot.type = null; onChange(); },
    }));
    row1.appendChild(makeSlot({
      accepts: ['attack'], placeholder: 'attack',
      getValue: () => bot.default.attack, getKind: () => 'attack',
      onDrop: d => {
        bot.default.attack = d.id;
        const newSide = D.ATTACKS[d.id].targetSide;
        if (bot.default.target && D.TARGETS[bot.default.target].side !== newSide) bot.default.target = null;
        onChange();
      },
      onClear: () => { bot.default.attack = null; onChange(); },
    }));
    row1.appendChild(makeSlot({
      accepts: ['target'], placeholder: 'target',
      getValue: () => bot.default.target, getKind: () => 'target',
      menuFilter: entry => !bot.default.attack ||
        D.TARGETS[entry.id].side === D.ATTACKS[bot.default.attack].targetSide,
      onDrop: d => {
        if (bot.default.attack && D.TARGETS[d.id].side !== D.ATTACKS[bot.default.attack].targetSide) return;
        bot.default.target = d.id; onChange();
      },
      onClear: () => { bot.default.target = null; onChange(); },
    }));
    card.appendChild(row1);

    // ---- row 2: move · trigger (when…) ----
    const row2 = document.createElement('div');
    row2.className = 'sb-row sb-row-2';
    row2.appendChild(makeSlot({
      accepts: ['move'], placeholder: 'move',
      getValue: () => bot.default.move, getKind: () => 'move',
      onDrop:  d => { bot.default.move = d.id; onChange(); },
      onClear: () => { bot.default.move = null; onChange(); },
    }));
    const specialIsActive = bot.special && bot.special.kind === 'active';
    const triggerSlot = makeSlot({
      accepts: ['trigger'],
      placeholder: specialIsActive ? 'when… always (default — drop to override)' : 'when… (only used for active Special)',
      getValue: () => bot.trigger, getKind: () => 'trigger',
      onDrop:  d => { bot.trigger = d.id; onChange(); },
      onClear: () => { bot.trigger = null; onChange(); },
    });
    row2.appendChild(triggerSlot);
    card.appendChild(row2);

    // ---- row 3: special ----
    const row3 = document.createElement('div');
    row3.className = 'sb-row sb-row-1';
    row3.appendChild(makeSlot({
      accepts: ['passive', 'effect'],
      placeholder: 'special — passive or active effect',
      themeKind: 'special',
      getValue: () => {
        if (!bot.special) return null;
        return bot.special.kind === 'passive' ? bot.special.passive : bot.special.effect;
      },
      getKind: () => {
        if (!bot.special) return null;
        return bot.special.kind === 'passive' ? 'passive' : 'effect';
      },
      onDrop: d => {
        if (d.kind === 'passive') bot.special = { kind: 'passive', passive: d.id };
        else                       bot.special = { kind: 'active',  effect: d.id };
        onChange();
      },
      onClear: () => { bot.special = null; onChange(); },
    }));
    card.appendChild(row3);

    // ---- soft warnings ----
    const warns = [];
    const blockers = [];
    if (bot.default.move && D.MOVES[bot.default.move] && D.MOVES[bot.default.move].isKite && bot.default.attack === 'melee') {
      warns.push('Heads up: Melee + Kite means the bot never closes to its 60 px range.');
    }
    if (bot.default.attack === 'heal' && bot.default.target && bot.default.target !== 'lowestHpAlly' && bot.default.target !== 'mostDamagedAlly') {
      warns.push('Tip: Heal usually pairs with "Lowest-HP ally" or "Most-damaged ally".');
    }
    if (blockers.length) {
      const b = document.createElement('div');
      b.className = 'sb-blocker';
      b.textContent = blockers.join('  ·  ');
      card.appendChild(b);
    }
    if (warns.length) {
      const w = document.createElement('div');
      w.className = 'sb-hint';
      w.textContent = warns.join('  ·  ');
      card.appendChild(w);
    }

    return card;
  }

  function renderPreview(bot) {
    const wrap = document.createElement('div');
    wrap.className = 'sb-preview-wrap';
    const stats = global.ShapebotsBot.previewStats(bot);
    if (!stats) { wrap.textContent = 'pick a chassis to see stats'; return wrap; }
    const parts = [`HP ${stats.hp}`, `ATK ${stats.atk}`, `SPD ${stats.speed}`];
    if (stats.range != null) parts.push(`RNG ${stats.range}`);
    wrap.textContent = parts.join(' · ');
    return wrap;
  }

  function buildTeamCards(container, team, onChange) {
    container.innerHTML = '';
    team.forEach((bot, i) => container.appendChild(buildBotCard(bot, i, onChange)));
  }

  // Tile / glyph maps (mirror render.js so we can show them on left tiles).
  const TILE_TYPE_GLYPH   = { heart: '♥', spade: '♠', diamond: '♦', club: '♣' };
  const TILE_WEAPON_GLYPH = { melee: '/', shotgun: '<', beam: '~', whirl: '@', bomb: '*', snipe: '=', heal: '+' };

  function buildBotTiles(container, team, selectedIdx, onSelect, activeCount) {
    container.innerHTML = '';
    const active = (typeof activeCount === 'number') ? activeCount : team.length;
    team.forEach((bot, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'sb-bot-tile';
      if (i === selectedIdx) tile.classList.add('sb-bot-tile-selected');
      const complete = botIsComplete(bot);
      const deployed = i < active;
      if (!deployed) {
        tile.classList.add('sb-bot-tile-inactive');
        tile.title = `Bot ${i + 1} fights starting in round ${i + 1 === 3 ? '3 (3v3)' : i + 1 === 4 ? '4 (4v4)' : '5 (5v5)'}.`;
      } else {
        tile.classList.add(complete ? 'sb-bot-tile-ok' : 'sb-bot-tile-incomplete');
      }

      const num = document.createElement('div');
      num.className = 'sb-bot-tile-num';
      num.textContent = bot.name || `Bot ${i + 1}`;

      const glyph = document.createElement('div');
      glyph.className = 'sb-bot-tile-glyph';
      glyph.textContent = bot.type ? TILE_TYPE_GLYPH[bot.type] : '·';

      const wep = document.createElement('div');
      wep.className = 'sb-bot-tile-wep';
      const w = bot.default && bot.default.attack;
      wep.textContent = w ? TILE_WEAPON_GLYPH[w] : '';

      tile.appendChild(num);
      tile.appendChild(glyph);
      tile.appendChild(wep);

      tile.addEventListener('click', () => onSelect(i));
      container.appendChild(tile);
    });
  }

  function buildBotDetail(container, bot, idx, onChange) {
    container.innerHTML = '';
    container.appendChild(buildBotCard(bot, idx, onChange));
  }

  global.ShapebotsProgramming = {
    defaultTeam, defaultBot, teamIsComplete, botIsComplete, buildPalette, buildTeamCards, buildBotTiles, buildBotDetail,
  };
})(window);
