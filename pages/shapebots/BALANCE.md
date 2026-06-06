# Shapebots — Balance Table

All numbers live here. The sim reads them from `js/shapebots/data.js`. Edit here when designing; sync into `data.js` when implementing.

Arena: 900 × 540 px. Each side spawns 5 bots ~80 px from their wall, evenly spaced vertically.

---

## Program shape

Every bot is built from four blocks:

```
Type  +  Default (attack/target/move)  +  Reaction (optional)  +  Special
```

- **Type** is the chassis — sets baseline HP/ATK/Speed.
- **Default** = `attack` + `target` + `move`. The bot runs this whenever no Reaction trigger is satisfied.
- **Reaction** = `trigger` + **one override**. The override is a single tile — either a Move or a Target. While the trigger is satisfied, that one dimension is swapped; the other dimension and the Attack stay as Default. Skipping the Reaction is fine.
- **Special** (one slot — passive *or* active effect):
  - **Passive**: an always-on stat modifier (HP, ATK, speed, range).
  - **Active effect**: pairs with a `trigger`. While the trigger is satisfied AND the effect is off cooldown, the effect fires once and the cooldown starts.

Target side is enforced by the attack: `Heal` → ally; `Melee / Bomb / Snipe` → enemy.

---

## Baseline stats (before type modifier and passive)

| Stat   | Value     |
|--------|-----------|
| HP     | 100       |
| ATK    | 10        |
| Speed  | 80 px/s   |
| Radius | 16 px     |

## Type modifiers (multiplicative)

| Type     | HP   | ATK  | Speed | Role                  |
|----------|------|------|-------|-----------------------|
| Heart `♥`   | 1.60 | 1.00 | 1.00  | Tank                  |
| Spade `♠`   | 1.00 | 1.50 | 1.00  | Bruiser               |
| Diamond `♦` | 1.00 | 1.00 | 1.50  | Skirmisher            |
| Club `♣`    | 1.20 | 1.20 | 1.20  | Generalist            |

## Attacks

Damage = `bot.ATK × coeff × dmgMult × (LoadedShot? 2 : 1)`. Range = `baseRange × rangeMult`.

| Attack  | Side  | Base range | Cooldown | Coeff | Glyph | Notes                                                                  |
|---------|-------|-----------:|---------:|------:|:-----:|------------------------------------------------------------------------|
| Melee   | enemy | 60 px      | 0.8 s    | 1.00  | `/`   | 90° arc. Knockback 120 px/s for 0.25 s.                                |
| Shotgun | enemy | 180 px     | 1.1 s    | 1.30  | `<`   | 65° cone, instant resolve. Damage falls off to 60 % at max range. Knockback 80 px/s for 0.20 s. |
| Beam    | enemy | 240 px     | 0.4 s    | 0.40  | `~`   | Instant line pierce. 7 px half-width. No knockback. Machine-gun cadence; rewards holding a line on a clump. |
| Whirl   | enemy | 80 px      | 1.0 s    | 0.90  | `@`   | 360° around self. Hits every enemy in radius. Knockback 60 px/s for 0.15 s. Needs a target *in range* to fire. |
| Bomb    | enemy | 280 px     | 1.6 s    | 1.20  | `*`   | Projectile 220 px/s. AoE radius 80 px. Center 100 % → edge 60 %. No FF.|
| Snipe   | enemy | 480 px     | 1.2 s    | 0.90  | `=`   | Projectile 600 px/s. Pierces all enemies on line. Homes 20 °/s.        |
| Heal    | ally  | 200 px     | 1.0 s    | —     | `+`   | Heals target for 12 HP.                                                |

## Target rules

Target tiles are side-explicit. The slot rejects any tile whose side doesn't match the attack's required side (Heal → ally, Melee/Bomb/Snipe → enemy). If you change the attack to a side-mismatched value, the Target gets cleared.

**Enemy targets:** Nearest enemy · Furthest enemy · Lowest-HP enemy · Highest-HP enemy · Most-damaged enemy.
**Ally targets (for Heal):** Lowest-HP ally · Nearest ally · Most-damaged ally.

`Most-damaged` falls back to lowest-HP within the same side if no one has been hit yet.

## Move rules

| Move                             | Behavior                                                               |
|----------------------------------|------------------------------------------------------------------------|
| Approach nearest enemy           | Walks toward nearest enemy. Stops just inside firing range.            |
| Approach furthest enemy          | Same but furthest.                                                     |
| Charge nearest enemy             | Approach at ×1.6 speed while out of firing range.                      |
| Strafe nearest enemy             | Orbit nearest enemy at ~200 px. Tangential motion + soft distance-keep.|
| Go to lowest-HP ally             | Pathing toward weakest ally.                                           |
| Go to ally being attacked        | Most-recently-damaged ally (last 2 s). Falls back to lowest-HP ally.   |
| Spread out from allies           | Move away from nearest ally if within 120 px. Anti-AoE clumping.       |
| Kite — short (100 px)            | Maintains 100 px from nearest enemy.                                   |
| Kite — medium (250 px)           | Maintains 250 px.                                                      |
| Kite — long (450 px)             | Maintains 450 px.                                                      |
| Hold position                    | Doesn't move at all.                                                   |

Kite moves use a ±12 px deadzone; the bot keeps firing while in attack range.

## Triggers (shared by Reaction and Active Special)

| Trigger              | True when…                                                       |
|----------------------|------------------------------------------------------------------|
| Always               | …always. Reaction is then a permanent override; active specials fire on cooldown. |
| My HP < 60 %         | `self.hp / self.maxHp < 0.60`                                    |
| My HP < 30 %         | `< 0.30`                                                         |
| Any ally HP < 40 %   | Any alive same-team bot below 40 %.                              |
| I was hit (last 2 s) | I took damage in the last 2 s.                                   |
| My target died (2 s) | The target I was attacking died within the last 2 s.             |
| Enemy in melee range | Any enemy is within 80 px.                                       |
| Ally died (3 s)      | An ally on my team died within the last 3 s.                     |
| Half my team is down | Live count ≤ floor(original count / 2).                          |
| Outnumbered          | My team's live count < the other team's.                          |
| First 5 seconds      | `battle.t < 5.0`. Opening-burst window.                          |
| No target in range   | I have no target, or it's outside my attack range.               |
| Surrounded           | 3 or more enemies within 200 px.                                 |

## Passive specials

| Passive     | Effect                                                                         |
|-------------|--------------------------------------------------------------------------------|
| Sharpened   | +30 % damage                                                                   |
| Extended    | +50 % range / AoE                                                              |
| Reinforced  | +30 % HP                                                                       |
| Quickened   | +30 % speed                                                                    |
| Vampiric    | Heal for 25 % of damage you deal to enemies.                                   |
| Thorns      | When struck, reflect 25 % of the damage back to the attacker (single bounce).  |
| Berserk     | Damage scales up to +50 % as HP drops. (At full HP: ×1.0; at 0 HP: ×1.5.)      |
| Regenerate  | +2 HP / s passive heal.                                                        |

## Active special effects (each fires on its own trigger, has its own cooldown)

| Effect       | Target           | Effect                                                       | Cooldown |
|--------------|------------------|--------------------------------------------------------------|---------:|
| Aegis        | self             | 50-HP shield on self                                         | 12 s     |
| Bulwark      | nearest ally     | 40-HP shield on ally                                         | 8 s      |
| Pulse Heal   | lowest-HP ally   | +30 HP heal                                                  | 8 s      |
| Adrenaline   | self             | +60 % speed for 2 s                                          | 6 s      |
| Loaded Shot  | self             | Next attack deals ×2 damage                                  | 8 s      |
| Detonate     | self (AoE)       | 80 px AoE around self, ATK × 1.5. No FF.                     | 10 s     |
| Teleport     | lowest-HP ally   | Instantly blink to lowest-HP ally (random ~24 px offset).    | 14 s     |
| Rally        | all allies (AoE) | +30 % damage to every living ally for 5 s. Stacks with passives. | 18 s |
| Lockdown     | nearest enemy    | Roots nearest enemy in place for 1.5 s. Must be ≤ 200 px away. They can still attack. | 10 s |

Active triggers re-fire on cooldown for as long as their trigger is still satisfied. Pairing `Pulse Heal` with `Always` makes a constant-pulse medic; pairing with `Any ally HP < 40 %` makes a reactive medic.

## Friendly fire

OFF. All damage filters skip same-team bots.

## Win conditions

1. **Annihilation.** One team at 0 alive bots.
2. **Heal-only stalemate.** After 10 s, every 1 s: if one team has no non-Heal attackers and the other does, the latter wins.
3. **Timeout (60 s).** Tiebreak = Σ `hp / maxHp` on each team. Player wins ties.

## Enemy team (MVP)

| # | Name    | Chassis     | Default                              | Trigger          | Special                       |
|---|---------|-------------|--------------------------------------|------------------|-------------------------------|
| 1 | Tank    | Heart `♥`   | Melee · Nearest · Approach nearest   | —                | Passive: Reinforced           |
| 2 | Bruiser | Spade `♠`   | Melee · Lowest-HP · Approach nearest | Ally died (3 s)  | Active: Loaded Shot           |
| 3 | Sniper  | Diamond `♦` | Snipe · Nearest · Kite — long        | —                | Passive: Sharpened            |
| 4 | Bomber  | Diamond `♦` | Bomb · Highest-HP · Kite — medium    | —                | Passive: Extended             |
| 5 | Medic   | Club `♣`    | Heal · Lowest-HP · Go to lowest-HP   | My HP < 30 %     | Active: Aegis                 |

Covers every attack type, both Special kinds (3 passives, 2 actives), and a healer.
