# Talaran Talar — Design Spec (draft)

*Draft v1, 2026-10-24, from the brainstorm with Nathan. Companion to `docs/xp-rebalance.md`, `docs/economy-spec.md`, `docs/WORLD-EVENTS-AND-MUSEUMS.md`, CLAUDE.md. Numbers marked **knob** are first guesses from `talar_sim` (§12) and wait on a sim pass and Nathan's veto; everything else was decided in the brainstorm.*

---

## 1. Identity

Talar is the magic of Talaran. It is a **utility** skill (already seeded, `display_order` 21), **not a combat skill** (Nathan, 2026-10-24; parked as a maybe for much later). It touches the other skills through **spells** and **enchanted jewelry**, and its effects are a different kind of thing from food buffs: food speeds you up or raises odds; Talar moves you, protects your things, tells you what is hidden, and is shared with other players.

**The loop:**

```
Mining / combat ──► Rough gem ──► Crafting: cut (Cut / Polished / Flawless)
                                        │
                        Talar: fill at a rift (passive, long, XP)
                                        │
                                 Charged gem (tradeable)
                           ┌────────────┴────────────┐
                 absorb into your reservoir     Crafting: set into jewelry
                           │                         │
                 cast spells (quick, XP)     worn; draws on your reservoir
```

Two ways to earn XP, both worthwhile: **filling** is the long passive training; **casting** is quick and pays well (§7).

### Lore (player-facing text never names Tal or Aran)

The magic seeps up from below and gathers where the land is broken open: craters, crevices, ravines. Rifts are where it is strongest. Nobody in the world knows where it comes from. Several religions each get a piece right.

**Laranism** is the faith at the Talar Rift. Laranists hold that the world was made in two halves (they say earth and sky) and joined, and the Rift is the seam. The light that seeps out is what was left between them. They are right that the world was made, that there were two, and that something lies at the seam; they are wrong about what. The faith's name keeps a fragment of a word none of them understand.

**Georome** (Jerome → Georome; kept by Nathan, 2026-10-27, despite the likeness to Georemy the fishing tutor) is the Laranist priest and the Talar tutor. He keeps a **church at the Talar Rift**: a building opened from the location's action menu, on the museum's pattern (`/api/museum/here`, `LocationPanel.tsx`), with Georome in the location's NPC list as usual. **The church is a lore building** first (Laranist writing), built so more can be added later; **spells are learned at churches** (Nathan, 2026-10-27), so step 4 adds that to it.

**Georome's quest** (Nathan, 2026-10-27): he gives a Cut Quartz; fill it at the Rift and absorb the Lit Quartz into yourself. Pays Talar XP and a second Lit Quartz, so the reservoir has something in it when spells arrive. A later step can add casting Wearsight.

---

## 2. Gems

### The ladder (real gems, by tier only)

| Tier | Gem | Metal of the tier |
|---|---|---|
| T1 | Quartz | Ambren |
| T2 | Garnet | Serph |
| T3 | Amethyst | Azulyss |
| T4 | Topaz | … |
| T5 | Aquamarine | |
| T6 | Emerald | |
| T7 | Sapphire | |
| T8 | Ruby | |
| T9 | Diamond | |

Gems differ by tier only, never by kind of effect. Higher gems come from higher mining spots on later islands, each island with its own drop rates. **Taiar hosts Quartz and Garnet.** Amber and Freshwater Pearl stay fishing salvage for finery, off the ladder.

### Sources on Taiar

| Source | Rough Quartz | Rough Garnet |
|---|---|---|
| Granite (Grundagr, Origrund) | **1 in 200** swings (was 1 in 50) | **1 in 800** swings |
| Knocker | 1 in 40 kills | 1 in 300 kills |
| Jumper | 1 in 150 kills | |
| Sidehill Gouger | 1 in 200 kills | |
| Hodag | | 1 in 250 kills |

At 15 to 20 s a swing, 1 in 200 is about **one quartz per hour** of granite, and 1 in 800 about one garnet per four hours. A Knocker hunter finds about half a quartz an hour (Knockers are 30% of the Old Workings draws); creatures are a supplement, never the main source. **knob** for the creature rates.

**The 1-in-50 stockpile already on live stays** (alpha; players know things change, Nathan, 2026-10-24). It is a head start on launch day.

### Cutting (Crafting)

One Crafting action per rough gem, at a lapidary station (a `workstations` type, `recipes.station = 'lapidary'`, never a display name). The cut rolls a grade: **Cut, Polished or Flawless**. The chance of the better grades rises with Crafting level above the gem's unlock level. **knob:** at the unlock level 85 / 13 / 2; three tiers above, 45 / 40 / 15. Pays Crafting at the intermediate policy.

Because cutting is a roll with three outputs, it is not a plain `recipes` row (one output). It sits beside sawing and smelting as a bespoke action paying out through the drop system (`drops: [...]`), or `recipes` grows a weighted-output column. Decide at build time by reading `resolveSaw`.

Items: `Rough X`, `Cut X`, `Polished X`, `Flawless X`, and a charged form of each grade with its own name (Nathan, 2026-10-25): **Lit X** (a filled Cut gem), **Bright X** (Polished), **Radiant X** (Flawless). So `Lit Quartz`, `Bright Garnet`, `Radiant Quartz`.

---

## 3. Filling at a rift

- **Where:** a rift location only (Talar Rift on Taiar). A location action, like a node.
- **What:** one repeating timed action (§5 of CLAUDE.md applies in full: initial `last_timer_seconds`, restore case, 409s, bot-check fields, `action_presentation` row). Each **cycle** (knob: 60 s) pours Talar into the gem being filled and pays a slice of XP. When the gem is full it becomes the charged item and the action carries on with the next gem of the same kind, until none are left or the player stops.
- **The open gem:** a part-filled gem has LEFT the inventory, exactly as an open liquid container has (`services/liquids.ts`): one row per player holding the gem's item and its units so far. Stopping keeps it; starting again resumes it. Never nowhere, never counted twice.
- **Pacing:** fill time per gem matches roughly the mining time behind it, so one hour of mining feeds about one hour of filling.

| Gem | Holds (Talar) | Fill time | Notes |
|---|---|---|---|
| Cut Quartz | 100 | 30 min | 200 Talar/h; T1 band, ~1,110 XP per gem at Talar 1 |
| Polished Quartz | 150 | 43 min | fills 5% faster; ~1,590 XP |
| Flawless Quartz | 300 | 81 min | fills 12% faster; ~3,000 XP |
| Cut Garnet | 200 | 40 min | 300 Talar/h; Talar 13; T2 band |
| Polished Garnet | 300 | 58 min | 5% faster |
| Flawless Garnet | 600 | 107 min | 12% faster |

**Fill rates doubled** (Nathan, 2026-10-27): gems are the only way to win Talar back, and an hour a quartz was too long. The first draft had 100 and 150 Talar an hour (60 and 80 minutes a Cut gem). XP is still paid by the minute at the gem's band, so a gem pays half the XP it did; filling still trains at the full band rate while it runs. Built: `items.talar_per_hour`, `services/talar.ts` (`pourPerCycle`, one 60 s cycle).

**Grades hold 1 : 1.5 : 3** (Nathan, 2026-10-24, with the 5% / 12% fill-speed edge). The clean ratio is what lets jewelry take any grade (§8): three Cut, two Polished or one Flawless carry the same Talar. Flawless is the jackpot: three gems' worth from one stone, about 12% more XP an hour while it fills. Expected Talar per rough quartz: ~110 at the unlock level (85 / 13 / 2), ~150 three tiers above (45 / 40 / 15), so a better cutter gets half again as much from the same stone. A higher gem pours faster (300 Talar/h for garnet) so its fills stay inside a session.

XP band: the gem's unlock level, gathering policy ×1.0 (`xp = target × timer / 3600`). Filling a quartz at Talar 20 pays the T1 band, as a lower node does.

**Rift surges** are world events (`world_event_types` row, kind skill, skill Talar, place Talar Rift). The bonus lands in `awardXp` with no new code. Announcement lines describe the Rift stirring, breathing, brightening; no god is named.

---

## 4. The reservoir

Every player has an internal reservoir of Talar.

- **Absorb** a charged gem to pour it in: instant, anywhere, the gem is used up. A gem that would overflow is refused (no partial pours) until there is room.
- **Capacity grows with Talar level.** **knob:** `300 + 25 × level` (325 at 1, 625 at 13, 800 at 20, 850 at 22), always enough for your highest spell and the biggest gem you can fill (a Flawless Quartz at 1, a Flawless Garnet at 13).
- **Never leaks.** No decay, nothing lost while away.
- **Kept on death**, like gold: it is inside you. This is what lets Tether (§6) be cast after dying.
- Stored as a whole number of hundredths, so jewelry's fractional draw (§8) is exact.
- Shown as a bar beside health in the equipment panel.
- Every write goes through one service (`services/talar.ts`): transaction, locked row, relative update (`UPDATE … SET talar = talar - $n WHERE … AND talar >= $n`), CHECK `>= 0`. A cast that cannot pay is refused before anything happens.

---

## 5. Spells: the common rules

- A spell is a **row** (name, level, cost rule, cooldown, XP minutes, tier); what it does is code. Nouns are rows, verbs are code.
- **Every spell has its own cooldown**, per player, stored as `ready_at` per (player, spell). Locked on cast, so two parallel casts pay once.
- Paid from the reservoir inside the same transaction as the effect; failure after payment throws.
- Casting is instant unless the spell says otherwise, so it does not take the player's one action slot.
- Level gates are listed in `services/unlocks.ts` so the level-up popup names new spells.

---

## 6. The spells (T1 and T2 on Taiar)

| Spell | Talar | Cost | Cooldown | XP per cast (§7) |
|---|---|---|---|---|
| **Wearsight** | 1 | 5 | 1 h | 6 min of band (~220) |
| **Daily Step** | 5 | 0.1 per base second skipped (4 to 38 on Taiar) | once a day | 30 min (~1,210) |
| **Larder Ward** | 8 | 0.5 per head-hour covered | 12 h | 30 min (~1,300) |
| **Tether** | 10 | 25 | once per death | 2 min (~90) |
| **Sending** | 15 | 20 | 10 min | 2 min (~100) |
| **Kindle** | 20 | 300 | 24 h | 30 min (~1,730) + others' use |
| **Portal** | 22 | 20 + 0.25 per base second skipped (29 to 115 on Taiar) | 2 h | 12 min (~725) + riders |

**knob** for every number. Levels are first guesses; Portal must sit inside T2 because Taiar has only quartz and garnet to train on. **Augury** (foresee the next world event) is a later-tier spell.

### Wearsight
Reads the wear on everything you have **equipped**, in words, never numbers: *sound*, *worn*, *near its end*, *living on borrowed time* (past its guaranteed uses, rolling to break). Wear stays silent everywhere else (Nathan, 2026-10-12); this is the one paid exception. Reads `player_item_wear` against the item's durability (`services/durability.ts`).

### Daily Step
One-way teleport, alone, to **any location you have visited on this island** (`player_exploration` rows of `discovery_type 'location'`, plus Talador, where everyone starts). Once a day, resetting at server midnight like the daily allowances. Settles and cancels whatever you were doing first, exactly as starting travel does (`routes/travel.ts`). Pays no Wayfaring XP and finds nothing on the road.

### Larder Ward
Cast on your farmstead; covers every pen there for up to N hours (**knob:** 12 at T1).

How pens work today: feeding lasts 12 h, mucking is due every 24 h, and an animal's clocks run only until whichever runs out first (`penRunningUntil` in `services/husbandry.ts`). The ward stretches that:

- When a trough runs dry inside the ward, it is **topped up from the farmstead's storage** with the species' normal feed, and the muck deadline is held off. Feed is still bought and eaten; Talar pays for the convenience, never the food. No feed in storage, no top-up.
- It **never makes a clock run faster.** It only removes downtime, so a warded pen earns exactly what a fed pen earns and XP parity with Farming is untouched. "Neglect costs time" becomes "neglect costs time or Talar."
- Lazy, like everything in Husbandry: a `warded_until` on the pen, folded into the pause-aware math on read; top-ups are settled on read (as growing up is paid on read) inside the read's transaction, with storage locked. No tick sweep.
- Hives never stop and crops run on wall-clock time, so the ward is for pens only.
- Cost example: a full coop (6 head) for 12 h is 36 Talar; a full paddock (3) is 18.

### Tether
Cast **after** dying, from wherever you respawned. Your death pile stays private for **+15 minutes** beyond `DEATH_PILE_PRIVATE_MINUTES`, **once per death**: it does not stack, so a player casts it once between deaths. Works because the reservoir is not dropped. XP is kept tiny so dying is never a way to farm it.

### Sending
Moves **one stack** between your pack and **your own** property storage, from anywhere on the island. Own storage only, so it never bypasses a trade. One slot = one unique stack, as storage already works; a full storage refuses rather than destroys. Locked, relative, all-or-nothing, and a `race:check` scenario (pack + storage total unchanged under parallel casts).

### Kindle
Lights a small XP event where you stand, shared by everyone there: a player-made rift surge on the world-events machinery (`applyEventBonus` inside `awardXp`).

Limits:
- **Small pool:** ~80 actions over ~45 minutes (a scheduled event is 300 to 500).
- **Per-player share cap:** nobody draws more than a quarter of the pool. Alone you get 20 boosted actions; it takes four people to empty it.
- **Gathering skills only**, chosen from what can be done at that spot (processing gets stockpiled and drained, per the world-events doc).
- **One per place,** never on top of a live event for the same skill there.
- **The caster earns extra Talar XP for every boosted action by someone else** (**knob:** half a minute of band each, so up to ~30 minutes if others use their full share). The reward is for gathering people, not for the caster's own actions.

Needs one new thing in the events core: a per-player cap on a pool. A `race:check` scenario covers it.

### Portal
Opens a portal **from where you stand to anywhere you have visited on this island**. Portals are per island; they never cross the sea (Sailing's job).

- **Open for a while, for anyone:** **knob:** 5 minutes at the unlock level, +1 minute per 4 levels above it. Any player at the origin sees it in the location panel and can step through. Stepping through is instant, and settles and cancels their current action the way travel does.
- **Cost scales with the road time skipped** (shortest path in base seconds).
- **The caster earns a little extra XP per other rider** (**knob:** 2 minutes of band each, up to five).
- A `portals` table: caster, island, from, to, opened, closes. Expired rows are ignored on read and swept later; no `setTimeout`.

**Taiar is small.** Since the road shortening (`20261016120000`) the longest walk on the island is 380 base seconds (Dawncrest to the Rift), the median 178. A portal here saves minutes, so it is priced cheap and its pull on Taiar is convenience and company. Later islands get longer roads, so the same formula makes portals both dearer and far more valuable there.

---

## 7. Casting XP

Nathan's rule: every cast pays a worthwhile amount, scaled by its cooldown and tier.

```
cast xp = band(spell level) × W / 60,   W = clamp(cooldown minutes / 10, 2, 30) minutes
```

The band carries the tier; W carries the cooldown, from 2 minutes of band (spammable spells) to 30 (daily ones). Spells with no time cooldown (Tether) take the floor. Kindle and Portal add their per-other-player bonus.

**Budget check (`talar_sim`):** a player casting every spell at its cooldown pace through an 8-hour day spends ~770 Talar (about eight Cut Quartz) and earns ~9,500 XP from casting, on top of ~8,900 from filling those eight gems at Talar 1 (four hours at the Rift since the fill rates doubled). So a self-sufficient Talar player earns about **1.5× a normal skill's hour**, the same allowance combat has (`docs/combat-spec.md` §2), and it is gated by gem supply: those eight quartz are a miner's whole day. A player who buys charged gems and only casts trains at about half that rate: a real second route, never the main one. **Jewelry drain pays no XP**: it is passive.

---

## 8. Jewelry

*Plan of record, drafted 2026-10-28 from the first sketch; decided points carry Nathan's date. Open points are marked **open**.*

### 8.1 What it is
Rings (`finger_item_id`) and amulets (`neck_item_id`), both slots already on `player_equipment` and unused until now. Made in **Crafting at the lapidary** from metal and **charged** gems. **Always enchanted:** a piece draws on its wearer's reservoir for each action it actually helps with, never per lucky proc, so the cost is predictable; with the reservoir empty it does nothing and says so. One ring and one amulet at a time, so a player picks two of the six. **No XP pieces** (Nathan). **No durability:** jewelry lasts, which is why it costs three gems' worth.

### 8.2 Tiers follow the metal ladder
A jewelry tier pairs **that tier's metal with that tier's gem**, the way weapons pair a metal tier with its band (Nathan, 2026-10-28: "jewelry tiers with each metal tier"). The metal is the setting, the gem carries the enchantment.

| Tier | Metal | Gem | Make (Crafting) | Wear (Talar) | Strength |
|---|---|---|---|---|---|
| T1 | Ambren Ingot (Ambren and Burgh ore smelted together) | Quartz | 8 (Nathan, 2026-10-28) | 1 | base |
| T2 | Serph (tier 2 ore; nothing smelts it yet, not mined on Taiar) | Garnet | 20 (Nathan, 2026-10-28) | 13 | 1.5× |
| T3+ | the tier's metal | the tier's gem | later islands | rung | +0.5× a tier (**knob**) |

**Open: T2 on Taiar.** Garnet is on Taiar, Serph is not. Either (a) garnet jewelry waits for Serph smelting and the next island, so garnets on Taiar are for filling only, or (b) garnet pieces ship now on 4 Ambren Ingots and a migration moves them onto Serph when it arrives.

### 8.3 The pieces

| Piece | Slot | Helps (a "helped action") | T1 | T2 |
|---|---|---|---|---|
| **Keeper's Band** | ring | each use of a worn weapon or armour piece that would count toward its wear | 3% chance the use does not count | 4.5% |
| **Prospector's Ring** | ring | each vein the wearer finds | the vein runs 5% larger | 7.5% |
| **Seedsaver's Ring** | ring | each plot harvested | 3% chance a harvest also returns a seed | 4.5% |
| **Hearty Amulet** | amulet | each food eaten in a fight | the food mends 5% more | 7.5% |
| **Wayfinder's Amulet** | amulet | each road segment walked (a minute of base road, the find roll's unit) | +10% chance of a road find | +15% |
| **Baitkeeper's Amulet** | amulet | each bait spent, trapping or fishing | 5% chance the bait is not used | 7.5% |

The slots pair so a fighter can wear both combat pieces (Keeper's Band and Hearty Amulet). T1 sits at food's T1 scale (1% timer, 2 to 3% double, +10 to 15% rare); T2 is 1.5×, the meals' precedent.

Item names carry the gem: *Quartz Keeper's Band*, *Garnet Keeper's Band*. Twelve items per two tiers.

### 8.4 Recipes
- **Any grade goes in** (Nathan, 2026-10-28): each piece has three recipes with the same output, taking **3 Lit, 2 Bright or 1 Radiant** gems of the tier, plus the metal. All three hold the same Talar (300 at T1), so no grade is wasted and none is required; a better cutter needs fewer stones.
- Metal: **2 Ambren Ingots** a T1 piece (**knob**).
- At the lapidary (`station: 'lapidary'`), through `RecipeList` like cutting. **Open: a jeweller's tool.** The lapidary has two slots (Lap Wheel, Gem Chisel). Jewelry can use the bench as it stands, or add a third slot for **Jeweller's Pliers** (Smithing, Ambren), so setting stones asks for its own tool.
- Rings at Crafting 8, amulets at 10 (T1), so the six open over a few levels rather than all at once (**knob**). T2 at 20 and 22.
- Timer: 120 s a piece. XP by the law for finished goods: `1.8 × 1.10 × band(level) × 120 / 3600`, about 155 at Crafting 8. The gems are the gate, not the clock (three charged gems are an hour and a half at the Rift), so the XP is not raised for them, as husbandry is not for its animals.
- Thirty-six recipe rows for T1 and T2 (three per piece). `for_skill: 'Talar'`, so they list under a Jewelry tab beside cutting.

### 8.5 The draw
- **1 Talar per 20 helped actions** (5 hundredths each; **knob**), about a tenth of a quartz an hour for an active wearer.
- Charged at the moment the piece is consulted for a helped action, through `spendTalarWithin` (`services/talar.ts`), inside the action's own transaction where there is one. **The effect applies only if the draw succeeded:** an empty reservoir means no draw and no bonus, never a debt.
- One place decides it: `lib/jewelry.ts` (pure: which piece helps which action, at what strength) and `services/jewelry.ts` (reads what is worn, draws, answers yes or no). Each system calls one function (`jewelryHelps(trx, playerId, 'bait')` and similar) at its one decision point; no system reads `finger_item_id` itself.
- **Jewelry drain pays no XP** (§7): it is passive.
- Silent like wear (Nathan, 2026-10-12)? A piece that saves bait says so on the result card ("Your Baitkeeper's Amulet kept the bait"), because the player paid Talar for it and should see what it bought. The reservoir bar shows the draw.

### 8.6 Where each hook goes
| Piece | Decision point |
|---|---|
| Keeper's Band | `services/durability.ts`, where a use is counted (combat today; tools when tools wear) |
| Prospector's Ring | `openVein` in `services/mining.ts`, the vein's size |
| Seedsaver's Ring | the four farming harvest resolvers (`services/farming.ts`) |
| Hearty Amulet | `eatFood` (combat), the heal amount |
| Wayfinder's Amulet | `rollTravelEvents` in `services/travelEvents.ts`, per segment, walkers only |
| Baitkeeper's Amulet | bait spend in `services/trapping.ts` and `services/fishing.ts` |

### 8.7 Gates, pages, museum
- **Wear gate** through `gateSkill` in `services/equipGates.ts`: Talar, at the tier's rung (the skill that owns the sub-system gates it). Listed in `services/unlocks.ts` like all wearable gear.
- Item pages say what a piece helps and what it draws, from the rows; the Manual's Talar page gets a Jewelry table.
- Museum: a Jewelry case on the Taiar museum's list (`museum_exhibits` match `{ type: 'jewelry' }`).
- New item type `jewelry`, subtype `ring` or `amulet`. `values:derive` prices them from the recipe XP; the gems inside are worth far more, so the pawnbroker and NPC walls need checking after (`validateWalls`).

### 8.8 Build
In two halves (Nathan, 2026-10-28):
1. Items, recipes, wear gate, the draw (`lib/jewelry.ts`, `services/jewelry.ts`), the three rings, museum case, a `race:check` scenario for the draw.
2. The three amulets.

## 9. Creature drops (ships with or before Talar)

**Seeds**, matched to the creature's level against the crop's planting level:

| Creature (level) | Drop | 1 in |
|---|---|---|
| Dock Rat (1) | Onion Seeds | 25 |
| Granary Rat (2) | Carrot Seeds | 20 |
| Jackalope (3) | Turnip Seeds | 20 |
| Feral Dog (4) | Garlic Cloves | 25 |
| Sidehill Gouger (6) | Wild Grain | 25 |
| Jumper (8) | Pea Seeds | 30 |
| Grey Wolf (8) | Flax Seeds | 30 |
| Agropelter (10) | Strawberry Runner | 100 |
| Hodag (12) | Raspberry Cane | 100 |

Granary Rats keep their Grain and Wild Grain (Nathan). Perennials are rarer because they give for years.

**Gems:** §2.

**Wolf Pelt:** Grey Wolf, 1 in 15. **Wolfskin Cloak:** 20 pelts, Crafting, back slot (unused today), about +5 armour, Defense 8. Pelts trade.

One migration, upsert by creature key and item name, loud throw on a missing row, `hasContent` guard (as `20261013130000_dock_rat_drops`). The Bestiary shows the new drops by kills as it does every drop; nothing else tells them.

---

## 10. Economy

- **Value is derived.** Rough gems are priced from the granite swing and creature kill that yield them (`values:derive -- --write`); cut and charged gems from the Crafting and Talar actions. Run `validateWalls()` and `unmappedItems()` after. Gems and jewelry need a merchant domain (the chain that produces them, `services/marketplace.ts`).
- **Supply:** one quartz per mining hour against one per filling hour, plus jewelry demand. With ~30 players the gem market will feel tight. That is intended ("semi-rare and precious"), but watch it after launch.
- **Talar is never sold by NPCs.** Charged gems trade between players; that is where fillers and casters meet.

---

## 11. Where it lives (read first, per CLAUDE.md §6)

| Part | Mirror |
|---|---|
| Fill action | `services/farming.ts` start/resolve split; §5 checklist; `action_presentation` row |
| Open gem | `services/liquids.ts` |
| Reservoir and casts | `services/gold.ts` (locked, relative, throw on failure) |
| Cutting | `resolveSaw` in `services/carpentry.ts` (multiple yields) |
| Lapidary station | `services/workstations.ts` |
| Larder Ward | `accrue` / `penRunningUntil` in `services/husbandry.ts` |
| Kindle, surges | `services/worldEvents.ts` |
| Portal, Daily Step | `routes/travel.ts` (settle and cancel first) |
| Tether | `services/groundItems.ts` |
| Wearsight | `services/durability.ts` |
| Sending | `services/property.ts`, storage routes; `race:check` |
| Church | museum (`/api/museum/here`, `LocationPanel.tsx`) |
| Georome | `getDialogueStage` in `routes/npcs.ts`; quest via `backfillQuestObjectives` |
| Gates | `services/unlocks.ts`, `services/equipGates.ts` |
| Rift is visible | `routes/location.ts` payload carries the rift field |
| Manual | `routes/manual.ts` `training-path` needs a Talar branch (gems are not `resource_nodes`) |

New tables (first draft): `player_talar` (reservoir), `player_talar_open_gem`, `spells`, `player_spell_cooldowns`, `portals`; `player_pens.warded_until`. New authored-content tables register in `lib/contentTables.ts`.

---

## 12. The sim

`talar_sim` (scratch, to become `apps/server/src/scripts/talarSim.ts`) holds the band, the gem table, the spell table and the casting-XP rule, and reports: XP per gem, a casting day's Talar and XP, reservoir capacity by level, portal and Daily Step costs on Taiar's real road graph. Still to add: gem supply against demand at realistic player counts, jewelry drain per hour per skill, Larder Ward cost against the Husbandry XP it recovers.

---

## 13. Open

1. ~~Jewelry input~~ decided 2026-10-28: 3 Lit, 2 Bright or 1 Radiant (§8.4). Open: T2 metal on Taiar (§8.2), a jeweller's tool (§8.4).
2. ~~Georome's quest~~ decided 2026-10-27 (§1).
3. All **knobs** above, after the sim pass.

## 14. Build order (one step at a time, Nathan testing between)

1. Creature drops migration (§9) and the quartz/garnet rates (§2). The live 1-in-50 stockpile stays as it is (alpha; Nathan, 2026-10-24).
2. Gem items and cutting (Crafting, lapidary station).
3. Reservoir, filling at the Rift, Talar `is_implemented`, Georome, the church.
4. Spells, T1 first (Wearsight, Daily Step, Larder Ward, Tether), then T2 (Sending, Kindle, Portal).
   **Built (T1, 2026-10-27):** `spells` + `player_spells`, `services/spells.ts` (one transaction per cast: the player's spell row locked, cost from the reservoir, effect, cooldown, §7 XP), learned at a church, cast from the spellbook on the Talar bar. Daily Step finds the shortest road in base seconds over `location_connections` and offers every visited place on the island with its price. Tether tells a death pile from a drop by its 15-minute private window and refuses a pile it already held. Larder Ward is cast at the farmstead for 4, 8 or 12 hours, priced on the head in the pens at the cast; `player_pens.warded_from`/`warded_until`, top-ups settled on read under the pen lock (`settleWardsWithin` in `services/husbandry.ts`), and farmstead deposits and withdrawals settle first. A top-up pays no feeding XP. `race:check` covers casting and the ward.
   **Built (T2, 2026-10-28):** spells are learned by a vigil at a church (`spell_vigil`, Nathan, 2026-10-27): a charged gem (Lit Quartz for T1, Lit Garnet for T2) and, from T2, a found writ, given up when it ends. Writs are curios: Sending from the road (1 in 500 a road minute, walkers), Kindle from mining (1 in 1,500 swings), Portal from Hodags (1 in 120) and Agropelters (1 in 200). Sending reuses the storage chest's locked moves. Kindle adds `world_events.per_player_cap`/`kindled_by` and `world_event_shares`, taken in one statement because most awards carry no transaction. Portal adds `portals` and `portal_riders`; a doorway shows in the location panel for everyone at its near end.
5. Jewelry.
6. Rift surge row, Manual page, patch notes.
