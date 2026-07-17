# Talaran Trapping — Spec

*Spec v1.1 — 2026-07-14. Hunting's passive mode. Companion to docs/xp-rebalance.md.*

## 1. Pillars

Passive like the kiln, but diverging on the three axes where the kiln is flat:

1. **The reveal.** Kiln output is known at load. A sprung trap shows only *"something's caught"* — species and drops are revealed at collection. The check is the moment.
2. **Lateness costs.** Once a trap catches, a scavenger clock starts. Tended lines keep everything; neglected lines lose the meat but never the hide, feathers, or notables. Partial loss, never total.
3. **Inputs are strategy.** Bait shifts the catch weighting (schema ships now; bait items arrive with the skills that produce them — Foraging/Farming). Launch is unbaited.

Deliberate rhymes with the kiln: location-bound, works while you travel, slots scale with level.

**Trapping is not the main road to Hunting levels.** Target: a fully tended trapline earns ~**30% of the active band** at its level (new "Passive ×0.30" policy row for xp-rebalance §3). It's side income, the reveal game, and the feather supply for fletching. The strike loop stays king.

## 2. The trap: Snare (launch = one trap type)

Cordage loop on a bent sapling — the medieval small-game answer. Craftable, placeable, breakable.

| Property | Value | Notes |
|---|---|---|
| Unlock | Hunting **5** | Active hunting owns 1/9/17; trapping is the early parallel lane |
| Slots | 1 @ 5 · 2 @ 12 · 3 @ 25 · 4 @ 37 — **global cap**, not per-location | +1 per gathering-tier boundary crossed; capped at 4 (tending-workload ceiling). Past 37, trapline growth comes from better species at future locations, not more traps |
| Roll interval | every **30 min** while set | `next_roll_at` on the trap row |
| Catch chance / roll | **55%** | ⇒ expected ~45–55 min per catch |
| Capacity | 1 catch, then state `sprung` | |
| Break chance | **25% per catch** | ≈ 4 catches per snare; steady crafting demand |
| Scavenger | safe **4 h**, then **15%/h** | Removes `perishable` drops only; notables immune |

Future trap types are **rows, not rewrites** — the designed second type is a live-capture **box trap** (higher level) feeding Husbandry with live animals, per the Hunting→Husbandry dependency.

## 3. Catch pool — Eld Grove (`trap_targets`)

| Species | Weight | XP/catch* | Drops |
|---|---|---|---|
| Rabbit | 64 | 100 | Rabbit Meat 1–2 (100%, perishable) · Rabbit Fur 1 (70%) · **Rabbit's Foot** (5%, notable) |
| Pheasant | 35.5 | 160 | Pheasant Meat 1 (100%, perishable) · **Feathers 4–8 (100%)** · **Prized Plume** (5%, notable) |
| Squonk | **0.5** | 750 | **Squonk Tears 1 (100%, notable)** — it dissolves when caught; the tears *are* the trophy |

*Starting values — validated at build with a sim so a tended line lands 25–35% of band at L5/15/25/40 before the migration ships. Trophy rate is 5% per catch (vs 0.33% per kill) because catches are ~50× rarer events than kill attempts; per-hour trophy income comes out comparable.

## 4. Fletching + the generic recipes table

This patch introduces the **`recipes` table** — the future home for carpentry/smithing constants, with trapping as first tenant:

`recipes(id, skill, name, output_item_name, output_qty, inputs JSON [{itemName, qty}], required_level, timer_seconds, xp, station NULL, is_active)`

Launch tenants (no station — camp crafts). **Arrows belong to Smithing**: the arrowhead is the forged part, the arrowsmith is a real medieval trade, Smithing is implemented today, and this hands Smithing its first consumable product plus a hunter↔smith market. **Snares belong to Crafting**: cordage and leatherwork are its planned identity; the recipe ships with `skill = 'Crafting'` now, its XP banking quietly against the hidden skill until Crafting launches. **Trap placement stays gated by Hunting 5** regardless of who tied the snare — snares are tradeable, and trapping remains hunting content. Recipes are rows: reassigning a recipe's skill later is a one-word data change.

| Recipe | Skill | Output | Inputs | Lvl | Timer | XP |
|---|---|---|---|---|---|---|
| Fletch Arrows | Smithing | Ambren Arrow ×5 | 1 Lanai Planks · 1 Ambren Ingot · 2 Feathers | 1 | 30s | 20 |
| Tie Snare | Crafting | Snare ×1 | 2 Lanai Planks · 2 Tanner's Scraps | 1 | 60s | 66 |

Fletching XP sits on Smithing's **intermediates policy** (0.6× crafting band ⇒ ~2,376 xp/hr → 20 xp/30s). Snare XP uses the finished-goods policy (66 xp/60s ≈ 3,960/hr) and lies dormant until Crafting launches. The arrow economy closes: active hunting loses ~0.35 arrows/attempt (~19/hr at Deer) → ~2 min of fletching per hour of hunting, fed by trapping's own feathers. Three skills meet in one consumable (shaft/carpentry · head/smithing · fletching/trapping).

Item names verified against the items seed except **Ambren Ingot** (verify at build) and **Tanner's Scraps** — if it doesn't exist yet (suspected prod-era placeholder), this patch's item migration creates it; trapping is the consumer it was waiting for.

## 5. Data model

- `trap_types` — name, item_name (inventory item consumed on placement), required_level, roll_interval_s, catch_chance, break_chance, scavenger_safe_hours, scavenger_hourly_chance, is_active.
- `trap_targets` — location_id, trap_type_id (NULL = any), name, weight, xp, drop_table JSON (with `notable`/`perishable` flags), is_active.
- `player_traps` — player_id, trap_type_id, location_id, bait_item_id (NULL, future), state `set|sprung`, caught_target_id (NULL until sprung; **never sent to client until collect**), caught_at, next_roll_at, placed_at.
- `recipes` — as §4. New items: Snare, Feathers, Prized Plume, Rabbit's Foot, Squonk Tears, Rabbit Meat, Rabbit Fur, Pheasant Meat (+ Tanner's Scraps if absent).

All content = rows (nouns are rows, verbs are code). New species, traps, baits, and recipes ship as data migrations.

## 6. Server flow

- **Tick sweep** (piggybacks gameTick): traps `state='set' AND next_roll_at <= now` → roll catch; on success pick weighted species, set `sprung`/`caught_at`; else advance `next_roll_at`. Traps `sprung` past safe window → hourly scavenger roll strips perishable entries (flag on the row so it rolls once per hour, not per tick).
- **Routes** `/api/trapping/`: `GET traps` (mine, this location — sprung shows no species), `POST place` (consumes Snare item, respects slot count), `POST collect` (reveal: roll drop table, award XP + items, roll break chance → trap re-set or destroyed, socket-emit result with notable flags), `POST dismantle` (returns the Snare item if state=set).
- **Crafting executor** `POST /api/crafting/craft { recipeId }` — generic: validates level + inputs, runs as a timed `player_actions` row (`action_type: 'crafting'`, restart-capable), consumes inputs, awards output + XP. Registered in the client restore switch **from day one** (we just learned that lesson).
- Traps are independent of `player_actions` — they run while you do anything else. Placing/collecting are instant interactions, not timed actions.

## 7. Client surface

Eld Grove sidebar gains **"Trapline"** → modal: your traps here (set = quiet, sprung = "Something's caught!" + collect button), place button (shows Snares in inventory + slots used/max), dismantle. Collect result reuses the existing drop/sparkle presentation. Locked state below Hunting 5 mirrors the animal-list lock treatment.

## 8. Build order (one step at a time, headless first)

1. Migrations: tables (§5). 2. Data migration: items + Snare trap_type + Eld Grove targets + recipes. 3. `services/trapping.ts` (roll/collect/scavenger logic) + XP sim validation of §3 values. 4. Crafting executor service + route. 5. Trapping routes. 6. Tick sweep integration. 7. Client Trapline modal. 8. Client crafting hooks (fletch/snare UI — location TBD with you at that step).

## 9. Knobs (flagged for veto before build)

Unlock @ Hunting 5 · slot thresholds 5/12/25/37 (tier grid, global cap) · snare XP banks to hidden Crafting until launch (vs zeroing it) · 30-min rolls @ 55% · scavenger 4h + 15%/h, meat-only · snare break 25% · Squonk weight 0.5% (≈1-in-200 catches) · trophy 5% per catch · baits = schema now, items later · fletching recipe costs/rates · XP/catch values pending build-time sim.
