# Shapebots — Saved Teams

This folder holds player-built teams exported as JSON.

## How saving works

Browsers cannot write to disk directly, so the game keeps its working library in
`localStorage` (key `wendys_palace_shapebots_teams`). The "Save to file" button
in the team library exports the selected team to a `.json` file the player can
drop in this folder. "Load from file" reads any `.json` from this folder back
into the library.

When the team library moves to a cloud store (DynamoDB), the API surface in
`js/shapebots/teamStore.js` is the only file that changes — the rest of the
game just calls `TeamStore.list() / save() / load() / delete()`.

## File schema

```json
{
  "name": "My Team",
  "savedAt": 1715000000000,
  "bots": [
    { "name": "Bruiser", "type": "spade", "default": { "attack": "melee", "target": "nearestEnemy", "move": "approachNearestEnemy" }, "trigger": null, "special": { "kind": "passive", "passive": "reinforced" } },
    ...
  ]
}
```

Each `bots[i]` follows the same spec shape as a player bot in-game:
`{ name, type, default:{attack,target,move}, trigger, special }`.
Empty / unfilled bot slots are stored as `defaultBot()` shape (all `null`s) and
ignored when the team is loaded for fewer-than-5 rounds.

Filename suggestion: `<team-name>.json`. The library does not enforce filenames
— `Load from file` will accept any valid JSON in the schema above.
