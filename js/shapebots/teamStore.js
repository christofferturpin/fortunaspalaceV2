/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  SHAPEBOTS TEAMSTORE  —  persistent saved-team CRUD + JSON import/export │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   STORAGE_KEY = 'wendys_palace_shapebots_teams'  (localStorage)          │
  │                                                                          │
  │   list()              ──► [{name,savedAt,bots}, ...]  (newest first)     │
  │      └─ read()       ──► {teams:[]}                                      │
  │   load(name)          ──► team{name,savedAt,bots} | null                 │
  │      └─ read() ─► deepClone()                                            │
  │   save(name, bots)    ──► bool   (upsert; stamps savedAt:Date.now())     │
  │      └─ read() ─► write(state)                                           │
  │   remove(name)        ──► bool   (false if name not present)             │
  │      └─ read() ─► write(state)                                           │
  │   exists(name)        ──► bool                                           │
  │                                                                          │
  │   exportTeamToFile(name) ──► triggers <a download>.json blob             │
  │      └─ load(name) ─► sanitizeFilename(s)                                │
  │   importTeamFromFile(file) ──► Promise<name>                             │
  │      └─ FileReader ─► JSON.parse ─► validates {name,bots[]} ─► save()    │
  │                                                                          │
  │   Helpers: read, write, deepClone, sanitizeFilename                      │
  │                                                                          │
  │   Exports (window.ShapebotsTeamStore): { list, load, save, remove,       │
  │                       exists, exportTeamToFile, importTeamFromFile }     │
  │   External deps: localStorage, Blob, URL, FileReader, document           │
  │   Consumers: main.js (library UI: load/save/delete/export/import)        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  STORAGE_KEY='wendys_palace_shapebots_teams'
  read()→{teams:[]}: try JSON.parse(localStorage[KEY]); valid→ret; catch||invalid→ret{teams:[]}
  write(state): try localStorage[KEY]=JSON.stringify(state); catch→silent
  list()→teams[]: read().teams.slice().sort((a,b)→b.savedAt-a.savedAt)  // newest first
  load(name)→team|null: t=read().teams.find(name); ret t?deepClone(t):null
  save(name,bots)→bool: guard(!name||!Array(bots))→F; state=read; i=findIndex(name); entry={name,savedAt:now,bots:clone}; upsert; write; ret T
  remove(name)→bool: state=read; before=len; filter≠name; unchanged→ret F; write; ret T
  exists(name)→bool: read().teams.some(n===name)
  exportTeamToFile(name): team=load; guard(!team); blob=JSON.stringify(team,null,2); url=createObjectURL; a.download=sanitize(name)+'.json'; click; setTimeout revoke+remove
  importTeamFromFile(file)→Promise<name>: FileReader→onload: parsed=JSON.parse; guard({name,bots[]})→reject; save(parsed); resolve(name); onerror→reject
  sanitizeFilename(s)→str: replace [^a-z0-9_-]→_; trim _; slice(64)||'team'
  deepClone(x)→x: JSON.parse(JSON.stringify(x))
  exports: global.ShapebotsTeamStore={list,load,save,remove,exists,exportTeamToFile,importTeamFromFile}
*/

// Shapebots — TeamStore.
// Persistent storage for player-built teams. Today: localStorage. Eventually:
// DynamoDB or similar. Keep all storage details behind this API so the rest of
// the game (main.js, programming.js) doesn't change when the backend swaps.

(function (global) {
  'use strict';

  const STORAGE_KEY = 'wendys_palace_shapebots_teams';

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.teams)) return parsed;
    } catch (e) { /* fall through */ }
    return { teams: [] };
  }

  function write(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* storage may be full / blocked; silently ignore */ }
  }

  function list() {
    return read().teams.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  function load(name) {
    const t = read().teams.find(x => x.name === name);
    return t ? deepClone(t) : null;
  }

  function save(name, bots) {
    if (!name || !Array.isArray(bots)) return false;
    const state = read();
    const i = state.teams.findIndex(t => t.name === name);
    const entry = { name, savedAt: Date.now(), bots: deepClone(bots) };
    if (i >= 0) state.teams[i] = entry;
    else state.teams.push(entry);
    write(state);
    return true;
  }

  function remove(name) {
    const state = read();
    const before = state.teams.length;
    state.teams = state.teams.filter(t => t.name !== name);
    if (state.teams.length === before) return false;
    write(state);
    return true;
  }

  function exists(name) {
    return read().teams.some(t => t.name === name);
  }

  // ----- file import / export -----

  function exportTeamToFile(name) {
    const team = load(name);
    if (!team) return;
    const blob = new Blob([JSON.stringify(team, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(team.name) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // Returns a Promise that resolves to the imported team's name (or rejects on error).
  function importTeamFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed.name || !Array.isArray(parsed.bots)) {
            return reject(new Error('File is missing { name, bots }'));
          }
          save(parsed.name, parsed.bots);
          resolve(parsed.name);
        } catch (e) {
          reject(new Error('Not valid JSON'));
        }
      };
      reader.readAsText(file);
    });
  }

  function sanitizeFilename(s) {
    return String(s).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'team';
  }

  function deepClone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  global.ShapebotsTeamStore = {
    list, load, save, remove, exists,
    exportTeamToFile, importTeamFromFile,
  };
})(window);
