# Combat build plan

*2026-10-10. Builds `docs/combat-spec.md` (v4) for the first release: Ambren only, Taiar only. One step at a time; Nathan tests in game between steps. Every step ships with its migrations run against real Postgres (up, up, down, up), server and client type-checks against baseline, and a `race:check` scenario for anything that moves items, gold or HP.*

---

## Before step 1 (done 2026-10-10)

Live `player_skills` for the combat skills: 83 rows each for Attack, Strength, Defense and Constitution, **0 XP in every row**. So Attack can be renamed Melee in place, and Strength's rows deleted with nothing lost.

---

## Step 1: the three skills, HP and combat level

- Migration: Attack becomes **Melee**, Strength is retired (its rows deleted, or folded into Melee if the query above found XP), Defense and Constitution stay; descriptions rewritten (player-facing text, no em dashes); `is_implemented` on.
- `players.current_hp` (persisted, so a refresh or restart never refills it), max HP from Constitution; the HP bar in the equipment panel reads it instead of the hard-coded 100/100.
- Combat level (`combatLevel` in `lib/combatMath.ts`) shown on the skills page and as a highscore board; Melee, Defense, Constitution get boards like every skill.
- `totalLevel` in `services/tally.ts` excludes `type = 'combat'`; feats keep counting them.

**Test:** skills page, HP bar, highscores, tally licence total unchanged for Pendragon.

## Step 2: Ambren gear and Smithing

- Item columns for combat stats: weapon form, damage type, aim, power; armour points. Rows for the 9 weapons and 12 armour pieces, stats from `combatMath` (`weaponAim`, `weaponPower`, `ARMOUR_LADDER`), names and descriptions in the house voice.
- The 21 Smithing recipes (spec §6, §7), shown through `RecipeList` like every bench craft.
- Equipment gates: weapons on Melee, armour on Defense (`SUBTYPE_SKILL` in `routes/equipment.ts`); dual and two-hand weapons empty and block the offhand.
- The equipment panel shows aim, defence, max hit and armour.

**Test:** smith a piece at each level band, equip and unequip, gates refuse correctly, stats read right.

**Built 2026-10-10.** The gate goes by what the item is (`gateSkill` in `routes/equipment.ts`): a weapon form means Melee, armour points mean Defense, anything else falls back to `SUBTYPE_SKILL`, so the leatherworker's boots stay ungated. Inside the locked equip transaction a dual or two-hand weapon puts the offhand item back in the pack, and anything equipped to the offhand puts such a weapon away; the response names what moved. `combatProfile` in `services/combat.ts` rides on every equipment response. With no weapon in hand the player fights bare-handed (spec §6, decided 2026-10-10), so the profile always has a weapon. Forged armour (`metal_armor`) and weapons sell to the smith. `race:check` C2 has two new scenarios, both shown failing against an unlocked read of the other hand.

## Step 3: creatures and fighting spots (data only)

- Tables: `creatures` (level, profile multipliers, stance per damage type, XP per kill), `fighting_spots` (location, `drawn` or `chosen`), `fighting_spot_creatures` (weight). Registered in `lib/contentTables.ts` so content snapshots carry them.
- The 13 Taiar creatures and 6 spots (spec §8). XP per kill written by a derive script on `combatMath`, the way `values:derive` writes values, never hand-set.
- Loot rows on `drop_table_entries`, keyed by creature and spot (`combat:Jumper@Grundagr`).
- The location payload carries its fighting spots (`routes/location.ts`), so the client can show them.

**Test:** each spot appears at its location with the right creatures; admin content browser shows the rows.

**Built 2026-10-10** (migration `20261010140000_taiar_creatures`). XP per kill: `pnpm combat:derive` (`scripts/deriveCreatureXp.ts` on `xpPerKillAt` in `combatSim.ts`) gives 26 at level 1 to 40 at level 12; the migration writes those numbers out. Spots: The Docks (Talador), The Stackyards (Novita), The Wrecking Rocks (Dawncrest, chosen), The Spoil Heaps (Origrund), The Old Workings (Grundagr), The Deep Wood (Eld Grove). Loot keys are `combat:<creature>` and `combat:<creature>@<spot>`. Seeded now, for items that already exist (rates as revised 2026-10-11, migration `20261011120000_combat_drop_rates`):

| Creature | Drop | Chance | Qty |
|---|---|---|---|
| Granary Rat | Grain | 1 in 10 | 1-2 |
| Granary Rat | Wild Grain | 1 in 20 | 1 |
| Wrecker | Linen Cloth | 1 in 40 | 1 |
| Wrecker | Locked Rusty Chest | 1 in 55 | 1 |
| Wrecker | Ambren Tinderbox | 1 in 80 | 1 |
| Wrecker | Amber | 1 in 150 | 1 |
| Jumper | Charc | 1 in 10 | 1-2 |
| Jumper at Origrund | Ambren Ore | 1 in 20 | 2-4 |
| Jumper at Grundagr | Burgh Ore | 1 in 20 | 2-4 |
| Knocker | Dense Burgh Ore | 1 in 100 | 1 |
| Agropelter | Poor Lanai Log | 1 in 5 | 1-3 |
| Agropelter | Feathers | 1 in 20 | 1-2 |

Granary Rats were checked against their sources (2026-10-11): a drawn Novita fight meets ~40 to 57 rats an hour at combat 9 to 30, so the revised rates give ~6 to 9 Grain an hour (under a Farming 12 player's Wild Grain plots over a day) and ~2 to 3 Wild Grain (10 to 15% of the Sunlit Meadow's 14 to 25). Item pages never list combat drops (decided 2026-10-12): they are the Bestiary's to show. `combatSim.ts` still carries its own copy of the roster (`TAIAR`); step 10 points it at the rows.

## Step 4: the fight loop (server)

- A `combat` action in `player_actions`, following the new-action checklist (CLAUDE.md §5) in full.
- Swings settled on read (`lib/combatMath.ts`), never on a timer; the tick settles fights and pushes the swings.
- Endpoints: start (409 on an existing action, 23505 caught), **eat** (settles first, then heals; refused if the killing blow came first), **flee**.
- Per kill: XP through `awardXp` (`killXp` split), loot through the drop roller, gold-find (combat in `GOLD_FIND_ACTIONS`, a little more often; people carry extra coins), 10-second engage delay, the next creature drawn or kept.
- Disconnect flees by default; `combat_continue_offline` setting. Bot checks between kills only.
- `race:check` scenarios: double eat, eat against the killing blow, flee mid-settle.

**Test:** via step 5's panel.

**Built 2026-10-12** (migration `20261012120000_combat_fights`, `services/combatFights.ts`, `lib/combatFight.ts`, `routes/combat.ts`).
- Fight state is a `combat_fights` row hanging off the action (`ON DELETE CASCADE`). Every path locks action, fight, player in that order and settles to now first: the tick, `/api/combat/eat`, `/flee`, `/state`, and travel, Stop and vein start (`endFightIfAny`).
- **Stalls:** a fight whose next swing is more than 15s overdue was not being run (a restart); the gap is skipped, not played.
- **Bot checks** freeze a fight at a kill; the answer restarts its clock with a fresh 10s approach.
- **Food** is anything with `heal_amount` and no buff (Nathan, 2026-10-12); eating works in or out of a fight and is refused at full health.
- **Coins:** priced from each kill's Melee XP, x1.5 (`goldFinds.ts` `PAYOUT_SCALE`), so ~1.5% of xp/hr.
- **Death (interim, option a):** full HP, wake in Talador, nothing lost; step 6 adds the pile.
- **Disconnect:** flees, settled to `last_seen`, unless `combat_continue_offline` (`POST /api/settings/combat-offline`).
- **Pushes:** `combat_update` (swings, kills, HP, the fight), `hp_changed` after an eat, `action_failed` (info) when a fight ends; each kill also goes through the tick's one completion path (`emitCompletion`: result card, loot log, coins, feats, firsts).
- Left for step 5 (CLAUDE.md §5 checklist): the client restore case in `GameView.tsx`, socket listeners and their cleanup.

## Step 5: the fight panel

- One panel: both HP bars, the fight log, your food as icons along the top (tap to eat), Flee, and a creature picker at chosen spots. Damage-type hint once the Bestiary has unlocked it (step 9).
- Restore on refresh (`GameView.tsx`), `action_presentation` rows, result card with a `message`.

**Test:** fight Dock Rats at Talador from level 1; eat, flee, refresh mid-fight, disconnect mid-fight.

**Built 2026-10-12.** Each spot is a location button that opens `FightMenu` (the spot's line, your health, how many meals you carry that mend; a picker at a chosen spot). While fighting, `GameView` draws `FightView` in place of the timer: food tiles along the top (a tap eats one), both health bars, the approach countdown, the last swings, and Flee (`action_presentation`'s cancel label). A kill gets the result card (all three skills' XP and the drops). Refresh restores the fight from `/api/combat/state`; `combat_update` and `hp_changed` are listened for and cleaned up; the equipment panel's HP follows the fight through a window event (`lib/combat.ts` `announceHp`). Travel, Stop and a vein end a fight quietly ('replaced'), so no stop notice clears the next action on screen. Creature pictures are read from `/images/bestiary/<Name>.png`, as hunting's are.

## Step 6: death

- At 0 HP: everything carried and worn (mount included, trophy and gold kept) drops where you fell, as one ground pile private to you for 15 minutes (a per-drop private window on `ground_items`, not a second system), public after, swept after a week.
- Respawn at Talador with full HP.
- `race:check`: dying while a pickup is in flight conserves every item.

**Test:** die on purpose, walk back, pick up the pile; check a second account cannot see it until 15 minutes pass.

**Built 2026-10-12.** `dropEverythingWithin` in `services/groundItems.ts`, inside the fight's locked settle: the equipment row then the pack (the equip route's lock order), one ground stack per item at the spot's location, `visible_to_all_at` 15 minutes out (`DEATH_PILE_PRIVATE_MINUTES`), swept after a week like any drop. Kept: gold, the trophy, open liquid containers. The death notice stays on the result card and names where the pile lies; `inventory_changed` and a new `equipment_changed` push refresh the pack and the doll. Pickup moved into a transaction with the atomic upsert: the old read-then-increment lost a stack when a death emptied the pack between the two (`race:check` "die while picking up from the ground", shown failing against the old pickup: 8 planks became 4 to 7).

## Step 7: durability

- Per player, per item name: a use counter and a tier table (guaranteed uses, break chance after), per-item overrides, editable from the admin panel. Built generic, so tools can join later.
- Weapon wears every kill; two random worn armour pieces wear per kill. A break: a line in the log, the kill completes, the fight does not restart until a replacement is equipped.

**Test:** with the counters lowered from admin, watch a weapon and a piece break.

**Built 2026-10-12** (migration `20261012130000_durability`, `services/durability.ts`). `durability_tiers` (9 rows, admin content browser, Combat group) with `items.durability_uses` / `durability_break_pct` overrides; `player_item_wear` counts uses since the last break per player per item (Progress group, editable to bring a test to the edge). Per kill: the weapon, and two of the worn armour pieces at random (`armourSlotsWorn`); past the guarantee each rolls to break; a break clears the slot, counts `player_stats.total_gear_broken`, resets the count, and ends the fight after the kill is paid. The settle now locks the equipment row (after action, fight, player), and locks the player row FOR NO KEY UPDATE rather than FOR UPDATE: FOR UPDATE blocked the KEY SHARE lock a pack insert takes for its foreign key, so an equip or a pickup deadlocked against a settle (also latent in step 6's death). `race:check` "equip a replacement as the old blade breaks" fails both ways: with FOR UPDATE (a 500 from the deadlock) and without the equipment lock (the break destroys the newly equipped spare).

## Step 8: the special drops

- Hodag Horn, Wrecker's Cutlass, Gouger's Legbone (next-tier strength, high durability); the Crabshell set; the trophies; Jumper ore and Charc; Knocker veins and Dense Burgh Ore; the Wrecker's chest, Amber and Tinderbox. Museum placement is automatic for new items.

**Test:** with chances raised in a scratch database, every drop lands and every item works (equips, smelts, opens).

**Built 2026-10-12** (migration `20261012140000_combat_special_drops`, approved by Nathan the same day). Hodag Horn (1 in 2,000), Wrecker's Cutlass and Gouger's Legbone (1 in 1,500): next tier's power and aim for their form, gated at the creature's level, 1,500 uses then 0.2%. The Crabshell set (1 in 100 a piece; 11/11/15 from the Shore Crab, 19/19/24 from Ol' Shellback; Defense 7 to 12; 600 uses then 0.4%). Trophies at 1 in 750: Jackalope Antler, Wolf Fang, Wrecker's Lantern, Knocker's Hammer, Agropelter Knuckle (shaped like Hunting's). Coins and veins are creature rows: `coin_chance_one_in` / `coin_min` / `coin_max` (Wreckers 1 in 4 for 3 to 12, Jumpers 1 in 4 for 5 to 15, ledger reason `combat_coins`) and `vein_*` (Knockers 1 in 150, a Burgh vein of 50 to 100 where they fall, through `openVein` in `services/mining.ts`, the same path as a Granite find). Rare weapons and Crabshell go to the pawnbroker only. `values:derive` prices combat's own items (rare weapons, Crabshell, trophies) from the creature's XP per kill and the chance, and only where nothing else prices them; a Jumper's Charc never sets Charc's price. The Worn Collar was cut until its quest exists (`docs/IDEAS.md`).

## Step 9: the Bestiary

- Kills per creature per player; unlock steps 1 / 10 / 50 / 250 / 1,000 (spec §8); a little Exploration XP on a first kill.
- Its own panel, opened from the fight panel, a Manual page and the mobile drawer.

**Test:** kill counts climb, entries unlock at each step.

## Step 10: words and release

- Manual pages: Melee, Defense, Constitution, Combat, Bestiary (`{{data:…}}` queries for every number).
- `combatSim.ts` re-run against the seeded rows; CLAUDE.md gains the combat rules; fresh-order migration dry run; patch notes.

---

## Decided while planning

- A Jumper drops ore directly, a few Ambren or Burgh Ore within a range (decided 2026-10-10); no sack item.
