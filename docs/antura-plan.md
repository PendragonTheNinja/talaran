# Antura: the plan for island 2

*Written with Nathan, 2026-11-14 and 15, as the brief for building it. **Settled** means Nathan decided it. **Proposed** means a first layout from Claude for him to change: names, levels, and numbers in those parts are placeholders until he says otherwise. §13 lists what he still has to decide. Not built.*

Read with: `CLAUDE.md` §8 (the material ladder), `docs/foraging-farming-ladder.md`, `docs/sailing-spec.md`, `docs/islets-plan.md`.

---

## 0. Where this stands, and what to do next (2026-11-17)

Nathan and Claude designed Antura from 2026-11-14 to 17. **The design is finished, bar the items Nathan holds below. Nothing is built.** This section is the handoff for the next session.

**Read first:** this file, then `docs/sailing-spec.md`, `docs/islets-plan.md`, `docs/foraging-farming-ladder.md`, and CLAUDE.md §8 "The material ladder". Every decision of Nathan's is dated in those five places. Anything still marked "proposed" is Claude's and his to change.

**Done and settled:** the places and their names (§2), getting there (§3, sailing spec), Mining (§4), Smithing's 44 Serph recipes and smelting (§5), Carpentry, homestead and shop tiers, and building for hire (§6, §6a, §6b), Farming and Husbandry rules (§7), Foraging (§8), the fish (§9), combat (§10): the roster, its names, levels, and weaknesses (Nathan, 2026-11-17), every drop on both islands, the rare weapons, the Snallyscale and Crabshell sets made from plates, the ratskin set, both islands' rings and charms, and the Bearverine Mantle; Cooking's 24 recipes (§11).

**Waiting on Nathan alone:** the invented lake fish at Bidewater, level 22 (§9); the final map, roads, and place pictures; the islet maps; the ore names for tiers 4, 6, and 9.

**Its own conversation, later:** the 1.0 reset (§13). Nathan, 2026-11-17: done properly, so that no player loses what they are meant to keep and everyone loses what they are not; and whether Thieving and Exploration are cut.

**Already delivered:** `20261117100000_butchering_knife_xp` (the Ambren Butchering Knife pays 55 XP by the rule, not 35), verified against Postgres; run `pnpm values:derive -- --write` after it.

**Built before Antura, needing nothing from it:** Taiar's half of the drop pass (§10: the new drops, plates in place of whole Crabshell pieces, the ratskin set, the Knuckle Ring and the Jackalope Charm, the Wolf Fang in the cloak) can go to the alpha on its own, and answers the complaint that fighting pays too little. The ring and charm need the small code change in §10 (aim and power from slots other than the main hand) and a `combatSim.ts` run.

**Built on this branch, 2026-11-17, waiting for Nathan's test:** Taiar's half of the drop pass (`20261117120000_taiar_drop_pass`, `20261117130000_fighters_crafts`); guild halls at 1 to 3 pieces a turn; the Skiff on a slip at Talador (`20261117140000_boats`, step 1 of `docs/sailing-spec.md` §10).

**Before building anything:** export a fresh content snapshot from live if the committed one (2026-11-11) is stale by then, and read §14, which lists what the code assumes that a second island breaks. §15 is the build order; its first two steps (the Skiff, Taiar's islets) need nothing from Antura.

**Also on this branch, not merged to `main`:** the skill-icon hairline (`components/SkillsPanel.tsx`, `SkillsPanel.css`, `index.css`) and Stonehold's full-colour skill icons (`themes/stonehold.css`). Both were checked in a browser in Chromium only; look at the hairline on an iPhone before it deploys.

---

## 1. What Antura is

- **The second island, and tier 2 (levels 13 to 24).** Its theme is setting out, as Taiar's is new beginnings.
- **It hosts tier 2 only where Taiar lacks it** (settled). Woodcutting (Deep Lanai), Hunting, Husbandry, and Talar already have tier 2 on Taiar and get nothing new here.
- **Leaner than Taiar** (settled). Every skill opens 3 to 6 new things a tier. Nothing is added without a real use.
- **A higher-tier recipe may use older ingredients** as long as one ingredient is of its own tier (settled).
- **Actions run longer each tier, by an amount set for each skill** (settled, Nathan 2026-11-15), not one share for all. XP per action rises to follow the band. Hunting may get a timer system of its own later. What tier 1 and tier 2 look like:

| Action | Tier 1 | Tier 2 | State |
|---|---|---|---|
| Chopping | 45 s (Lanai Tree) | 60 s (Deep Lanai) | Live today |
| Granite | 20 s | 30 s | Settled |
| Ore | 28 s | 40 s | Proposed |
| A cast | 70 s | 80 s | Proposed |
| Foraging | 45 to 60 s across four habitats | 65 s and 70 s | Proposed |
| Bench work | 45 to 270 s by size | About a tenth longer | Proposed |
| Hunting | 65, 85, and 120 s | Nothing new | Its own system later |
- **No church, no rift, no tutorial quests** (settled). A quest or two, plus Nathan's own series on its islets. The Geo- names are Taiar's tutors only.

## 2. The places (settled names)

| Place | What it is | What is there (proposed unless marked) |
|---|---|---|
| Wendhaven | The port | Ferry dock and slip (settled), museum, tavern for the ale round, marketplace |
| Farefield | Farmland | The homestead site, the seed ground (settled), a low fighting spot |
| Mettlefell | The forge town | Public smithy and carpentry bench, cookhouse, the tool merchants |
| Underway | The mine | Granite and Serph (settled), old workings to fight in |
| Bidewater | The lake | Freshwater fishing |
| Farvick Narrows | The strait | Saltwater fishing, the tidal shore (settled), a fighting spot on the shoals |
| Yondereach | The high passes (settled) | The top fighting ground |
| Vergehorns | The twin headlands | A fighting ground |

- **The circularity rule must hold here** (CLAUDE.md §2): every Serph tool that can break needs a path that does not need that tool. So Mettlefell's public benches lend Serph tools, or a merchant sells them.
- One museum per island already works from `locations.region`. A guild already raises one hall per island where it chooses.
- **Player shops: one per island, in its port town** (Nathan, 2026-11-15). So Talador on Taiar, as today, and Wendhaven on Antura.

### Roads (proposed, from Claude's sketch on Nathan's map; his final map decides)

Slightly longer on average than Taiar's (settled). Taiar's 18 roads average 82 seconds. These eight average 95.

| Road | Seconds on foot at level 1 |
|---|---|
| Wendhaven to Farefield | 45 |
| Farefield to Mettlefell | 60 |
| Mettlefell to Underway | 30 |
| Farefield to Farvick Narrows | 55 |
| Farvick Narrows to Mettlefell | 100 |
| Mettlefell to Bidewater | 130 |
| Bidewater to Yondereach | 110 |
| Farvick Narrows to Vergehorns | 225 |

## 3. Getting there

All in `docs/sailing-spec.md`. In short: the ferry from Talador to Wendhaven (50 gold, about 8 minutes, no XP); the Skiff (tier 1, a little faster, free); the Cog (tier 2, fastest). Boats are built in pieces on a slip at Talador or Wendhaven. Each island has islets reached by chance (`docs/islets-plan.md`).

## 4. Mining

Settled:

- Antura's granite is at Underway, with **Serph veins**. Serph is found in granite, as Ambren is.
- **Its swing is slightly longer** than Taiar's, and **Serph veins come slightly rarer** than Ambren veins for the time spent.
- **Garnet is the common gem here, Quartz still drops, and Amethyst (the tier 3 gem) is rare**, about 1 in 1,000.
- No second mine.

**Antura's granite takes 30 seconds a swing** (Nathan, 2026-11-15), where Taiar's takes 20. Everything that rolls on a swing is reset for that, so each comes at about the pace it does on Taiar or a little slower. Proposed:

| | Taiar today | Antura |
|---|---|---|
| Granite swing | 20 s, 15 at its fastest | 30 s, 22 at its fastest |
| Vein chance a swing | 1 in 100 | 14 in 1,000 (about 1 in 71) |
| Veins an hour at base speed | 1.8 | 1.7, slightly rarer |
| Granite XP | 7 | 14 |
| Ore swing | 28 s | 40 s |
| Ore XP | 32 | 61 |

The fastest swing is 22 s, not the game's 20 s floor, so that a high-level miner also finds veins slightly slower here than on Taiar (2.3 an hour against 2.4). At 20 s they would find them faster.

Gems, as a rule for every later rock: the tier's own gem about once an hour of rock, the gem below at half that, the gem above at a fifth.

| | Own tier's gem | Tier below | Tier above |
|---|---|---|---|
| Taiar granite (20 s) | Quartz, 1 in 200 | none | Garnet, 1 in 800 today |
| Antura granite (30 s) | Garnet, 1 in 135 | Quartz, 1 in 270 | Amethyst, 1 in 670 |
| Antura Serph ore (40 s) | Garnet, 1 in 90 | Quartz, 1 in 180 | Amethyst, 1 in 450 |

- Nathan, 2026-11-15: these numbers are good.
- **The Writ of Kindling drops here too** (Nathan, 2026-11-15), at 1 in 1,000 a swing, which keeps the pace of Taiar's 1 in 1,500. Island 3 will use something different.
- **These timers are for a miner at the node's own level with the tier's own tool** (Nathan, 2026-11-15): Serph ore is 40 s at Mining 13 with a Serph pickaxe, and slower with an Ambren one. The code already works this way: levels count from the node's own level (`lib/actionTimers.ts`), and `calculateTimer` in `services/woodcutting.ts` slows a tool below the node's `required_tool_tier` and speeds one above it by a tenth a tier. So Antura's granite and Serph ore are rows with `required_tool_tier` 2.
- **Deep Lanai becomes tier 2 work** (Nathan, 2026-11-15): `required_tool_tier` 2, so its 60 s is the time with a Serph Hatchet and an Ambren one takes 84 s. It asks for a tier 1 hatchet today. This ships with the Serph Hatchet, not before, or everyone chopping there slows with no way to fix it. The Serph Hatchet is made on Antura, so a player who has not crossed buys or trades for one.
- **An action's fastest time rises with its base time, tier by tier** (Nathan, 2026-11-15), as it already does (Lanai 45 down to 20, Deep Lanai 60 down to 25, Antura's granite 30 down to 22). It must keep doing so, so that nobody is one day mining the last ore every 20 seconds. Every new node, habitat, and water sets its own fastest time above the last tier's.
- Gem drops are keyed by rock type today (`mining:rock:granite`), so Antura's granite needs its own key or Taiar gets these odds too (settled that it needs one).
- Mining opens only Serph this tier. Nathan accepted that when he declined a second mine.

## 5. Smithing

Settled:

- **Every Ambren tool gets a Serph tool**, and Serph weapons and armour follow the Ambren set.
- **Serph tools reuse Lanai rods and planks.** Wood changes at tier 3.
- **Serph smelts alone, on Charc**, and Charc is carried over from Taiar.

Proposed (drafted 2026-11-17 from the live Ambren rows, `content-snapshots/recipes.json` of 2026-11-11 and the scythe's migration):

- **Each Ambren recipe at level L becomes a Serph recipe at L plus 12**, with the same number of ingots and the same wooden and leather parts. That is 44 recipes across Smithing 13 to 24, matching `docs/combat-spec.md` (Serph weapons at Melee 13, armour one piece a Defense level from 13 to 24). What a piece is worn or used from is its Ambren twin's plus 12.
- **Timers a tenth longer than Ambren's**, rounded to 5 s (nails and hooks to the second).
- **XP from the band:** a finished good pays 1.1 x 1.8 x 2,000 an hour, raised by the curve to its level (`docs/xp-rebalance.md`), for its timer; nails, hooks, and arrows are intermediates at 0.6 of that. This is how the Ambren rows were set, and it reproduces them to within 1 XP, with one exception: the Ambren Butchering Knife pays 35 where the rule gives 55. The Serph one is set by the rule (80).

| Smithing | Recipe | Makes | From | Ambren today | Serph timer | Serph XP |
|---|---|---|---|---|---|---|
| 13 | Fletch Serph Arrows | 5 Serph Arrow | 5 Lanai Arrow Shafts, 1 Serph Ingot, 2 Feathers | 30 s, 20 | 35 s | 31 |
| 13 | Forge Serph Bracers | Serph Bracers | 1 Serph Ingot, 1 Leather Strips | 45 s, 50 | 50 s | 73 |
| 13 | Forge Serph Hooks | 10 Serph Hook | 1 Serph Ingot | 20 s, 13 | 22 s | 19 |
| 13 | Hammer Serph Nails | 30 Serph Nails | 1 Serph Ingot | 20 s, 13 | 22 s | 19 |
| 13 | Forge Serph Butchering Knife | Serph Butchering Knife | 2 Serph Ingot, 1 Lanai Planks | 50 s, 35 | 55 s | 80 |
| 13 | Forge Serph Foraging Knife | Serph Foraging Knife | 1 Serph Ingot, 1 Lanai Planks | 45 s, 50 | 50 s | 73 |
| 13 | Forge Serph Gem Chisel | Serph Gem Chisel | 1 Serph Ingot, 1 Lanai Planks | 45 s, 50 | 50 s | 73 |
| 13 | Forge Serph Hoe | Serph Hoe | 1 Serph Ingot, 1 Lanai Planks | 45 s, 50 | 50 s | 73 |
| 13 | Forge Serph Jeweller's Pliers | Serph Jeweller's Pliers | 1 Serph Ingot | 45 s, 50 | 50 s | 73 |
| 13 | Serph Anvil | Serph Anvil | 5 Serph Ingot | 225 s, 250 | 250 s | 366 |
| 13 | Serph Cauldron | Serph Cauldron | 6 Serph Ingot | 240 s, 264 | 265 s | 388 |
| 13 | Serph Cooking Knife | Serph Cooking Knife | 1 Serph Ingot, 1 Lanai Tool Rod | 90 s, 99 | 100 s | 146 |
| 13 | Serph Flesh Hook | Serph Flesh Hook | 2 Serph Ingot | 80 s, 88 | 90 s | 132 |
| 13 | Serph Hammer | Serph Hammer | 2 Serph Ingot, 1 Lanai Tool Rod | 90 s, 100 | 100 s | 146 |
| 13 | Serph Hatchet | Serph Hatchet | 2 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 90 s, 100 | 100 s | 146 |
| 13 | Serph Ladle | Serph Ladle | 2 Serph Ingot | 80 s, 88 | 90 s | 132 |
| 13 | Serph Meat Cleaver | Serph Meat Cleaver | 2 Serph Ingot, 1 Lanai Tool Rod | 110 s, 121 | 120 s | 176 |
| 13 | Serph Pickaxe | Serph Pickaxe | 2 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 90 s, 100 | 100 s | 146 |
| 13 | Serph Plane | Serph Plane | 2 Serph Ingot, 2 Lanai Planks | 90 s, 100 | 100 s | 146 |
| 13 | Serph Saw | Serph Saw | 2 Serph Ingot, 1 Lanai Planks | 90 s, 100 | 100 s | 146 |
| 13 | Serph Skillet | Serph Skillet | 3 Serph Ingot | 120 s, 132 | 130 s | 190 |
| 13 | Serph Tinderbox | Serph Tinderbox | 1 Serph Ingot, 1 Lanai Planks | 45 s, 50 | 50 s | 73 |
| 13 | Serph Tongs | Serph Tongs | 1 Serph Ingot | 45 s, 50 | 50 s | 73 |
| 13 | Forge Serph Mace | Serph Mace | 2 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 90 s, 99 | 100 s | 146 |
| 13 | Forge Serph Scimitar | Serph Scimitar | 2 Serph Ingot, 1 Leather Strips | 90 s, 99 | 100 s | 146 |
| 13 | Forge Serph Spear | Serph Spear | 1 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 45 s, 50 | 50 s | 73 |
| 14 | Forge Serph Boots | Serph Boots | 1 Serph Ingot, 1 Leather Strips | 45 s, 51 | 50 s | 75 |
| 15 | Forge Serph Scythe | Serph Scythe | 2 Serph Ingot, 1 Lanai Planks | 60 s, 69 | 65 s | 100 |
| 15 | Forge Serph Coif | Serph Coif | 2 Serph Ingot, 1 Leather Strips | 90 s, 104 | 100 s | 153 |
| 16 | Forge Serph Buckler | Serph Buckler | 2 Serph Ingot, 1 Leather Strips | 90 s, 106 | 100 s | 157 |
| 16 | Forge Serph Daggers | Serph Daggers | 2 Serph Ingot, 1 Leather Strips | 90 s, 106 | 100 s | 157 |
| 16 | Forge Serph Hand Axes | Serph Hand Axes | 2 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 90 s, 106 | 100 s | 157 |
| 16 | Forge Serph War Hammers | Serph War Hammers | 3 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 135 s, 159 | 150 s | 236 |
| 17 | Forge Serph Chausses | Serph Chausses | 3 Serph Ingot, 1 Leather Strips | 135 s, 163 | 150 s | 241 |
| 18 | Forge Serph Hauberk | Serph Hauberk | 4 Serph Ingot, 1 Leather | 180 s, 223 | 200 s | 330 |
| 19 | Forge Serph Gauntlets | Serph Gauntlets | 2 Serph Ingot, 1 Leather Strips | 90 s, 114 | 100 s | 169 |
| 20 | Forge Serph Sabatons | Serph Sabatons | 2 Serph Ingot, 1 Leather Strips | 90 s, 117 | 100 s | 173 |
| 20 | Forge Serph Atgeir | Serph Atgeir | 2 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 90 s, 117 | 100 s | 173 |
| 20 | Forge Serph Greatsword | Serph Greatsword | 4 Serph Ingot, 1 Leather Strips | 180 s, 234 | 200 s | 346 |
| 20 | Forge Serph Maul | Serph Maul | 4 Serph Ingot, 1 Lanai Tool Rod, 1 Leather Strips | 180 s, 234 | 200 s | 346 |
| 21 | Forge Serph Helm | Serph Helm | 3 Serph Ingot, 1 Leather Strips | 135 s, 180 | 150 s | 265 |
| 22 | Forge Serph Kite Shield | Serph Kite Shield | 5 Serph Ingot, 1 Leather | 225 s, 307 | 250 s | 453 |
| 23 | Forge Serph Greaves | Serph Greaves | 4 Serph Ingot, 1 Leather Strips | 180 s, 251 | 200 s | 371 |
| 24 | Forge Serph Cuirass | Serph Cuirass | 6 Serph Ingot, 1 Leather | 270 s, 386 | 300 s | 571 |

Ingots, for scale: a full Serph armour set is 35, as Ambren's; the 26 recipes at level 13 take 48 between them, one of each.

**Smelting** (`SMELT_RECIPES` in `services/smithing.ts`, which needs the rows):

| | Makes | From | Timer | XP |
|---|---|---|---|---|
| Ambren today | 2 Ambren Ingot | 1 Ambren Ore, 1 Burgh Ore, 2 Charc | 45 s | 30 |
| Serph | 1 Serph Ingot | 1 Serph Ore, 2 Charc | 50 s | 44 |
| Dense Serph | 3 Serph Ingot | 1 Dense Serph Ore, 4 Charc | 100 s | 88 |

Serph smelts alone (settled), so one ore makes one ingot. Dense follows the rule written in `services/smithing.ts`: two smelts' fuel, time, and XP, plus one ingot. **Two Charc a Serph ingot, twice Ambren's one** (Nathan, 2026-11-17): the tier's cost of a hotter metal. All Charc comes from Taiar until Hatch (CLAUDE.md §8).

**Settled (Nathan, 2026-11-17):** the table's numbers; **Serph Arrows are in**; the Ambren Butchering Knife's XP is corrected to the rule, 35 to 55 (migration `20261117100000_butchering_knife_xp`). The Serph Scythe is at 15 by the rule (Ambren's is 3).

**Serph Arrows need a use**, since a hunt today shoots only `HUNT_AMMO`, the Ambren Arrow (`services/hunting.ts`). Settled (Nathan, 2026-11-17): **a hunt shoots the best arrow carried, and an arrow below the animal's tier lowers the chance of a catch, never lengthens the hunt.** An animal of tier 2 (today only the Ground Sloth, Hunting 17) wants a Serph arrow. Settled numbers (Nathan, 2026-11-17): **10 points off the catch chance for each tier the arrow is below the animal**, and 3 points on for each tier above, as a better bow gives (`BOW_TIER_CATCH_BONUS`). On the Sloth with Ambren arrows that is 45% in place of 55% at its own level: about 18% fewer catches, and 8% less XP an hour, since a miss still pays its share. A constant beside the others in `calculateCatchChance`. Ships with the arrows, never before them.
- **The player is told, in the world's words** (Nathan, 2026-11-17). Text is content, so each animal gets a line on its row (proposed column `huntable_animals.weak_arrow_text`), shown on a miss when the arrow was below the animal's tier, and a short warning in the hunting panel before the hunt starts. Settled for the Ground Sloth (Nathan, 2026-11-17):
  - On a miss: *"The arrow skips off the sloth's matted hide. That old beast wants a harder point than Ambren."*
  - In the panel: *"Your Ambren arrows will barely mark a hide like that."*

## 6. Carpentry

Settled: the existing recipes stay where they are, because nearly every one is a door into another skill. Carpentry's ladder comes from buildings and boats.

| Carpentry level | Opens | State |
|---|---|---|
| 10 | Skiff | Settled, level provisional |
| 13 | Tier 2 homestead and tier 2 shop, built outright or upgraded from tier 1 | Settled (Nathan, 2026-11-17) |
| 15 | Serph Fishing Rod | Agreed spread |
| 19 | Cog | Settled, level provisional |
| 22 | Tier 2 guild hall work | Agreed spread |

- The tier 2 guild hall is already a row: 3,000 Lanai Planks, 3,000 Granite Blocks, 5,000 Serph Nails.
- Benches are built anew in each town (settled); on Antura they are Lanai benches with Serph tools.
- **Homesteads and shops have tiers, not islands** (Nathan, 2026-11-17). A tier 1 homestead can be built on any island, Antura's included, from Carpentry 1, and upgraded later. **A tier 2 homestead can be built outright for more materials. Tier 2 needs Carpentry 13**, whether built outright or upgraded, and the same holds for shops. "Any island" is read as each island's homestead ground (Novita, Farefield) and port town (Talador, Wendhaven), one of each per island per player.
- **Slots grow on a slight curve by tier** (Nathan, 2026-11-17): every tier gives more slots for the materials spent than the one before, counting everything spent on that building since tier 1.
- **A homestead's tiers are for storage** (Nathan, 2026-11-17). Tier 2 crops and animals do not need a tier 2 homestead: Farming and Husbandry are gated by their own levels (CLAUDE.md §2), Antura's homestead is tier 1 by design and must grow Antura's crops, and every tier adds new items to keep, one slot each, so storage is what a farmer runs short of as they climb.
- Settled (Nathan, 2026-11-17): **each upgrade costs the same number of materials, in its own tier's** (planks, blocks, and nails of that tier), **and adds 1.2 times the slots the last upgrade added, except a shop's selling slots, which multiply by 1.5 a tier, rounded up** (Nathan, 2026-11-17). Building a tier outright costs the tier 1 build and every upgrade to it together, all in that tier's nails. An upgrade takes 0.3 s a material, as the farmstead's 600 s for 2,000 does; building outright takes the tier 1 build's time and the upgrades' together.

  | Tier | Homestead storage | Homestead materials | Shop storage / selling / buying | Shop materials |
  |---|---|---|---|---|
  | 1 | 50 | 2,000 (500 / 500 / 1,000 Ambren), 600 s | 75 / 12 / 6 | 1,400 (350 / 350 / 700 Ambren), 480 s |
  | 2 | 80 | upgrade 1,000 (250 / 250 / 500 Serph), 300 s | 100 / 18 / 8 | upgrade 400 (100 / 100 / 200 Serph), 120 s |
  | 3 | 116 | upgrade 1,000 | 130 / 27 / 11 | upgrade 400 |
  | 4 | 159 | upgrade 1,000 | 166 / 41 / 14 | upgrade 400 |
  | 5 | 211 | upgrade 1,000 | 209 / 61 / 18 | upgrade 400 |

  Slots for every 1,000 materials spent, homestead storage: 25, 27, 29, 32, 35. Shop storage: 54, 56, 59, 64, 70. Shop selling: 8.6, 10, 12, 16, 20. The rise is 6 to 10% a tier, and steeper for selling slots. **Tier 2 outright:** a homestead 750 / 750 / 1,500 Serph in 900 s; a shop 450 / 450 / 900 Serph in 600 s. Rows above tier 2 are the curve's shape only, and the tier 1 numbers are live today and unchanged. Buying gains round up, so they never stall.
- Capacity already lives on the property row (`storage_slots`) and in `SHOP_TIERS` (`services/shops.ts`), so a tier is a number change; the upgrade action and the tier 2 rows are new.
- **Built for homesteads, 2026-11-20:** `HOMESTEAD_TIERS` in `services/farming.ts`. With no farmstead on an island, the panel offers tier 1 and tier 2 outright (`POST /api/farming/establish` with `tier`); a tier 1 farmstead offers the upgrade on its Storage tab (`farm_upgrade`, `POST /api/farming/upgrade`), whose resolve flips the tier conditionally, so it is paid once. Both pay Carpentry for their time at the builder's level, as the tier 1 build does. **The tier 2 shop, built 2026-11-20:** `SHOP_TIERS` in `services/shops.ts`, offered outright in the build panel (`POST /api/shops/build` with `tier`) and as an upgrade on the Manage tab (`shop_upgrade`, `POST /api/shops/mine/upgrade`), the tier flip paying once; shops are one per island (`shopPropertyFor`). **Not yet:** hiring a carpenter for a homestead or shop.

## 6a. The Carpentry and Smithing review (started 2026-11-16, not finished)

Checked against the code, and put to Nathan on 2026-11-16.

1. **Building in pieces was far too slow** (Nathan, 2026-11-16: "I never meant for it to be that slow"). A guild hall build step places ONE item per 20-second action (`services/guildHall.ts`), which would have made the Skiff's 780 materials about 4.3 hours and the Cog's 1,880 about 10.4.
   **Settled: a boat's build action places 1 to 5 of the materials wanted, and a higher Carpentry level rolls the higher counts more often** (Nathan, 2026-11-16). Proposed roll: 1 plus four coin flips, each landing at a chance that runs from 25% at the boat's own Carpentry level to 75% at 24 levels over it. The count is cut to what the piece still wants and what the pack holds.

   | Levels over the boat's | Average placed | 1 / 2 / 3 / 4 / 5 | Skiff (780) | Cog (1,880) |
   |---|---|---|---|---|
   | 0 | 2 | 32 / 42 / 21 / 5 / 0% | 2.2 h | 5.2 h |
   | 12 | 3 | 6 / 25 / 38 / 25 / 6% | 1.4 h | 3.5 h |
   | 24 or more | 4 | 0 / 5 / 21 / 42 / 32% | 1.1 h | 2.6 h |

   **XP stays per action**, 20 seconds at the boat's tier's band, as the hall's: so Carpentry XP an hour is on band whatever is rolled, and a skilled carpenter finishes the same boat sooner for less XP in all, as with any quicker work. Paying per item instead would put a skilled builder well over band. The roll takes the place of a falling timer: build actions keep their flat 20 s.
   **Guild halls roll 1 to 3** (Nathan, 2026-11-16), weighted the same way: 1 plus two flips at the same 25% to 75%, so 1.5 an action on average at the hall's level and 2.5 at 24 over. Built 2026-11-17: `lib/buildRoll.ts` (shared with the boats to come), the hall's resolve in `services/guildHall.ts`, and race:check `hall`.
2. **Carpentry has nothing repeatable at tier 2's band.** Sawing pays a flat 23 XP a saw whatever the sawyer's level (`SAW_XP` in `services/carpentry.ts`), Deep Lanai drops the same Lanai logs as the level 1 tree, and every bench recipe is level 8 or below. From 13 to 24 the only Carpentry XP at the band is the builds, which are one-off, and now quicker (finding 1). Put to Nathan on 2026-11-16:
   - **Deep Lanai logs as their own item: no** (Nathan).
   - **A cask for brewing ale: not yet** (Nathan). Brewing is not designed past "a cask, on its own clock" (§11), and he does not like a cask used up every brew. If a cask is a reusable fixture, a middle way is that it wears like any bench tool (`services/toolWear.ts`), lasting many hours of brewing. That waits for brewing's own design.
   - **Carpenters build for other players** (Nathan, 2026-11-16): shops, homesteads, and boats. A player need not raise their own; they can hire a carpenter and pay them. The builds are one-off for each owner, not for the trade, so boats and halls built for others become repeatable Carpentry work; homesteads and shops stay quick single actions (2026-11-17) and add little XP. The design is §6b.
   - **Still thin, and open:** with about 30 players, each wanting one Skiff and one Cog, boats for hire are a modest supply of work. Whether builds, hire, and sawing are enough from 13 to 24 is best judged once the numbers in §5 and §6 are settled.
3. **Bench tools already follow the tier rule; nothing to build.** `tierMultiplier` in `services/workstations.ts`: work at the tool's own tier is on band, each tier above the tool is 35% slower and more than two is refused, each tier below is 12% faster. So a Serph recipe at an Ambren-tooled bench is 35% slower, and Serph bench tools speed tier 1 recipes by 12%.
4. **26 of the 44 Serph recipes open at Smithing 13**, as 26 open at Smithing 1 on Taiar. The tools have to, since each is a door into another skill (the argument Nathan made for Carpentry). The other 18 spread across 14 to 24. Nathan, 2026-11-16: that is fine.

## 6b. Building for hire (Nathan, 2026-11-16; the design below accepted 2026-11-17)

Settled: a carpenter can build a shop, a homestead, or a boat for another player, who pays them.

Proposed by Claude, and accepted by Nathan with the tier curve (2026-11-17, "the rest is fine"):

- **One build site, for everything built in pieces: boats and guild halls.** The guild hall's build is made general (as `docs/sailing-spec.md` §5 already asks): a site has an owner, a place, a kind (boat or hall), and the materials still wanted. Guild halls move onto it. Every build action places a roll of materials (§6a) and pays the hand that placed them.
- **The owner founds the site** where the building will stand (a slip for a boat), and is the owner of what is raised on it from the first piece.
- **Anyone may bring materials to a site**: the owner, the carpenter, a friend. A build action takes from the builder's own pack, as the hall's does; or the owner can lay materials at the site for the hired hand to use. Materials laid at the site and not yet built in can be taken back by the owner; once built in, they are the building.
- **Who may build:** the owner, and anyone the owner names. Naming a carpenter is the hire.
- **Pay is per piece, from escrow.** The owner sets a rate (gold for each material placed) and lays gold at the site; each action pays the hand who placed the pieces at once, from that gold, inside the action's transaction. No lump on completion, so neither side can be cheated by the other walking away: the carpenter is paid for what is placed, and the owner pays for nothing unbuilt. A site with no gold left stops paying, and the hired hand is told before the next action.
- **XP goes to whoever places the pieces**, at the building's tier band, as §6a.
- **The builder needs the Carpentry level for that building** (the Skiff 10, the Cog 19) and a mallet and saw (`services/construction.ts`). The owner needs neither.
- **Finding work:** no index of sites across the world, as there is no index of shop prices (CLAUDE.md §2); players find each other in trade chat. A notice at the place itself (the slip) of sites there that want a hand would fit, and is Nathan's call.
- Moving items and gold between two players: race:check scenarios for laying materials, taking them back, laying gold, and five build actions at once against one site's gold; and for a hired homestead or shop, the fee paid twice by two finishes at once.

**Built for boats, 2026-11-18** (migration `20261118100000_boat_hire`, `services/boats.ts`, the slip panel's Hands and pay): the hull on the slip is the site. Laying a keel needs no Carpentry; whoever builds needs it, with a mallet and saw. The owner names hands (`vessel_build_hands`), sets gold a piece (`pay_rate`, at most 10,000), lays gold in the purse (`fund_gold`) and materials at the slip (`vessel_build_stock`), and may take back either while it is unbuilt, standing at the slip. A turn uses what is laid there before the builder's own, places no more pieces than the purse pays for, and pays the hand at once; a hand is told and stopped when the purse cannot pay for another piece. The finished boat is the owner's, and what is left in the purse and at the slip goes back to them. A turn by a hand locks both players in id order, then the build. race:check `hire`: five scenarios (lay and take gold, lay and take materials, five hands at once against one purse), each shown to fail on broken code. **Not yet:** guild halls moved onto the same site (they keep their own build until then), and hiring for a homestead or shop (below).

**Homesteads and shops stay single actions** (Nathan, 2026-11-17): they should be within easy reach, so they keep Taiar's shape (the farmstead 600 s, the shop 480 s, both from Carpentry 1), and Antura's follow it at their own costs. They are not raised in pieces and do not use the build site. Hiring a carpenter for one is proposed as:

- **The owner names the carpenter at the place** and lays the fee there. The carpenter brings the materials, or uses any the owner has laid there.
- **The carpenter runs the same single action**, and when it finishes, one transaction creates the property for the owner, takes the materials, and pays the fee to the carpenter. It is one action, so there is nothing to pay piece by piece, and nothing is paid if it does not finish.
- **It pays the carpenter the build's XP**, as it would have paid the owner.
- **What the hire is for:** a player who has no mallet and saw, no materials, or not yet Carpentry 13 for a tier 2 homestead or shop (§6) can pay to have it done. The tier 2 gate is where hiring matters most.

Rough ingot counts, for scale, to check in a sim: a full Serph armour set is 35 ingots, the homestead's nails 40, the Cog's 40, a tier 2 guild hall's 167. A level 13 miner on Antura's granite finds about 17 Serph ore an hour by the §4 numbers, and one ore makes one ingot.

Not yet asked: whether there are Serph Arrows, and whether the Ground Sloth should want them as Deep Lanai now wants a Serph Hatchet; the Serph Scythe (Ambren's is Smithing 3, so 15); whether the "tier 2 shop" is simply the Wendhaven shop or an upgrade to the Talador one.

## 7. Farming and Husbandry

Crops and feeds are in `docs/foraging-farming-ladder.md`. Settled:

- **Six crops:** Barley 13, Cabbage 15, Leek 17, Beet 19, Broad bean 21, Gooseberry 23 (levels proposed).
- **A homestead on Antura**, at Farefield, holding at most 10 fields and 12 pens.
- **The XP share by place counts across every field and pen a player owns on every island**, fields highest-tier island first, so Taiar's are always the lowest places.
- **One Flour.** Barley is its own item and mills to Flour at a better rate.
- **Animals may eat whatever they really would**; the player picks by hand, and Larder Ward draws from storage cheapest first.
- Husbandry gets no new animal. Young are carried over from Taiar, or found on islets.

After Antura (Nathan, 2026-11-15): look again at every Farming and Husbandry action's timer. They are the same across the board today, which wants more thought.

## 8. Foraging

Settled, two habitats:

| Habitat | Place | Level | Finds |
|---|---|---|---|
| Seed ground | Farefield | 13 | The six seeds and cuttings, nothing else |
| Wild ground | Farvick Narrows, the tidal shore | 19 | Sea salt, samphire |

Nettle gains a second use as Nettle Cordage (boats), and Meadowsweet as ale's herb. Both are Taiar forage.

## 9. Fishing (proposed)

Nathan: three or four fish for each water across 13 to 24. A base cast of 80 s where Taiar's is 70 (proposed), and XP from the band (about 65 at level 13 rising to about 80 at 22).

| Water | 13 | 16 | 19 | 22 |
|---|---|---|---|---|
| Bidewater (fresh) | Tench | Rudd | Zander | One invented fish |
| Farvick Narrows (salt) | Mackerel | Pollock | Sea Bass | Turbot |

- How the list was chosen: real fish of northern lakes and coasts that Taiar does not already have, ordered from common to prized, with Mackerel placed for the gooseberry dish and one slot left for an invented fish, as about a third of Taiar's are. Rudd took Grayling's place (Nathan, 2026-11-15): Grayling is a river fish, and Bidewater is a lake. Held back for later islands: salmon, trout, cod, herring, sturgeon.
- Each fish gets a bait, a time of day, or a season, as Taiar's do. Taiar mixes real fish with invented ones (Tiddle, Chalkarp, Duskfin); the names here are Nathan's to change.
- **Mackerel is wanted** for the gooseberry dish (§11).
- **Serph Fishing Rod:** Lanai Tool Rod, Serph Hook, and two Linen Thread, at Carpentry 15 (`docs/fishing-spec.md` already plans it).
- **Salvage:** reuse what exists (the locked chest, amber, mussels) in the new waters. Nothing new without a use.
- **Built 2026-11-20** (migration `20261120140000_antura_fishing`): the eight fish (the invented one named Glassback by Claude, for Nathan to change), salvage reused in both waters (`fish_species` is unique on name and water now), the Serph Fishing Rod, and `WATER_TIERS` in `services/fishing.ts`: a water's tier is its island's, a cast is 80 s at Fishing 13 on Antura, a rod a tier below the water casts 40% slower (as any tool below its work), one above 5% faster, and a net hauls up to three levels over the water's rung.
- **The net works on Antura, for the lower fish of each water only** (Nathan, 2026-11-15). Today it hauls fish of level 4 and under (`NET_MAX_SPECIES_LEVEL` in `services/fishing.ts`), which on Antura is nothing. Proposed rule: a net hauls fish up to three levels above the water's tier rung. That is exactly today's rule on Taiar (1 plus 3), and on Antura it means the level 13 and 16 fish: Tench and Rudd, Mackerel and Pollock. The net is linen and planks with no metal in it, so there is one net for every water and no Serph net.

## 10. Combat (proposed)

From `docs/combat-spec.md`: Serph weapons at Melee 13, Serph armour one piece a Defense level from 13 to 24, creatures of level 13 to 24, several fighting spots, and each island wants a mix of quick, slow, and costly creatures.

Nathan, 2026-11-14: keep three rare weapons an island and a dropped armour set, at least through island 3. The forms rotate, so Antura's are the three Taiar did not use.

**Where they fight** (Nathan, 2026-11-15): one creature at Mettlefell; two at Farvick Narrows, chosen; two at Yondereach, drawn; two or three at Vergehorns, chosen. A **chosen** spot lets the player pick the creature, for spots where each is farmed for something. A **drawn** spot hands out its creatures at random, which is what makes leaving a fight there risky (`docs/combat-spec.md`, Fighting spots). Farefield, Bidewater, and Underway have no fighting.

**Not all cryptids** (Nathan, 2026-11-15): real and ancient creatures beside them. Taiar is already that mix: five real animals (two rats, a dog, a crab, a wolf), two people (Wrecker, Jumper), and five cryptids, with the ancient Ground Sloth to hunt.

A second roster, eight creatures, every name and level still a placeholder:

| Place | Creature | Kind | Level | Its character | Weak to |
|---|---|---|---|---|---|
| Mettlefell | Wolverine | Real | 13 | Quick and fierce; the island's first fight | Slash |
| Farvick Narrows | Kelpie | Cryptid | 15 | The water horse of the strait; quick, and hard to leave | Pierce |
| Farvick Narrows | Shellycoat | Cryptid | 17 | A river spirit in a coat of shells; hard to hurt | Crush |
| Vergehorns | Sea Eagle | Real | 19 | Light and hard to hit | Slash |
| Vergehorns | Reaver | A person | 20 | A sea raider in mail; hard to hurt, slow; carries coin | Crush |
| Vergehorns | Snallygaster | Cryptid | 21 | Winged and scaled, the lord of the headlands; sheds the Snallyscales the armour is made from | Pierce |
| Yondereach | Cave Bear | Ancient | 22 | Huge and slow; costly in food | Slash |
| Yondereach | Slide-rock Bolter | Cryptid | 24 | Huge blows; the island's top fight | Crush |

- That is two real animals, one person, one ancient creature, and four cryptids. Slash and crush are each the weakness of three, pierce of two.
- **The Bull Seal is out** (Nathan, 2026-11-15): like the elk, a seal is something people hunt. Proposed in its place: the Kelpie, which with the Shellycoat makes the Narrows haunted water. Other candidates: a skua (a real pirate-bird, and a nod to Quank's gulls), or a giant sea scorpion (ancient).
- **The Great Elk is out** (Nathan, 2026-11-15): a deer is game, and belongs to Hunting. The Reaver takes its place, so Antura has a person as Taiar has its Wrecker and Jumper. An ancient alternative for that slot: a giant sea scorpion.
- Yondereach is drawn, so a fighter there meets the Bolter now and then whether they want to or not.
- Out of the first roster: Hoop Snake, Billdad, Wampus Cat, Cutty Soams, Hidebehind.
- **No meat from creatures fought** (Nathan, 2026-11-15): meat is Hunting's. Each creature still wants a common drop of its own (see the note on thin drops below). **The rest of each creature's drops are decided together with Taiar's, in one pass over both islands** (Nathan, 2026-11-16). First ideas until then: pelts from the Wolverine and the Cave Bear, which **together make the tier 2 cloak** (Nathan, 2026-11-16), as twenty Wolf Pelts make Taiar's; Feathers from the Sea Eagle, now that feathers may come from other creatures (Nathan, 2026-11-15); coin from the Reaver and from the Kelpie, which drowns travellers; River Mussels from the Shellycoat's coat; Snallyscales from the Snallygaster; garnets from the Bolter.

- **The tier 2 cloak: the Bearverine Mantle** (Nathan, 2026-11-17, who named it and asked for it slightly cheaper than first drafted). The Wolfskin Cloak is Crafting 8, worn from Defense 8 (the wolf's level), 5 armour, 20 Wolf Pelts and 1 Wolf Fang, about 330 kills. Its twin, in the same places on the tier 2 ladder:

  | | Wolfskin Cloak (tier 1) | Bearverine Mantle (tier 2) |
  |---|---|---|
  | Crafting, and worn from Defense | 8 | 20 |
  | Armour | 5 | 7 (late Serph armour is about 1.47 times late Ambren's, `docs/combat-spec.md`) |
  | Made from | 20 Wolf Pelts, 1 Wolf Fang | 20 Wolverine Pelts, 18 Cave Bear Pelts |
  | Kills, on average | about 330 | about 230, but of slower, costlier creatures, the bear above all |
  | Timer and XP | 180 s, 234 | 200 s, by the band |

  It has no trophy in it, unlike the wolf's cloak, which keeps it the cheaper of the two in kills.
- **Rare weapons:** dual pierce, two-hand slash, and one-hand crush, each from a creature it is not the weakness of, about 1 in 1,500 to 2,000, with the bad-luck count the Taiar three have. Proposed: the dual pierce from the Sea Eagle (its talons), the two-hand slash from the Reaver (his blade, as the Wrecker drops a cutlass), the one-hand crush from the Cave Bear.
- **The Snallyscale armour set is crafted, not dropped** (Nathan, 2026-11-15). The Snallygaster drops **Snallyscales**, and Crafting turns them into the pieces. The item is a Snallyscale, never a plain "scale", so other creatures' scales can be their own items later (Nathan, 2026-11-16). Not shell again: Taiar's set is Crabshell. It sits between late Serph and early Azulyss, as Crabshell sits between Ambren and Serph, and lasts far longer than smithed armour. Snallyscales can be traded, so a fighter can sell them to a crafter. Proposed, to argue with:

| Piece | Crafting level | Worn from Defense | Snallyscales |
|---|---|---|---|
| Snallyscale Gauntlets | 14 | 19 | 23 |
| Snallyscale Sabatons | 15 | 20 | 23 |
| Snallyscale Helm | 16 | 21 | 30 |
| Snallyscale Shield | 18 | 22 | 45 |
| Snallyscale Greaves | 19 | 23 | 45 |
| Snallyscale Cuirass | 21 | 24 | 60 |

  **Snallyscales are all a piece takes** (proposed 2026-11-16). An earlier draft added leather and Linen Thread "as the Wolfskin Cloak does", which was wrong: the cloak is twenty Wolf Pelts and nothing else. Raised from 150 to 226 (Nathan, 2026-11-17) so the set costs about the hours Crabshell's plates do (see the drop pass below): with a Snallyscale one kill in four, about 900 kills. Six recipes take Crafting past its tier's three to six, which Nathan allows where the reason is good; this is also what gives Crafting something at nearly every level from 13 to 22.
- Gems from creatures follow §4's pattern.
- **Drops are thin on Taiar** (a player's complaint, and the data agrees). On the live tables most creatures' commonest drop is 1 in 10 to 1 in 25. The two crabs drop nothing but armour pieces at 1 in 300 each, so 99 kills in 100 give XP alone; the Feral Dog's only drop is 1 in 25; only three of thirteen creatures ever drop coins. A hunt, by contrast, always gives meat and a hide. Proposed for Antura: every creature has one drop with a real use that comes often, about one kill in three to five. The same fix on Taiar is rows only.
- **Taiar's drops are to be looked at again** (Nathan, 2026-11-15). A caution for whoever does it: simply raising today's odds floods other trades, because most common drops are seeds, grain, logs, and ore. A level 1 fighter kills about 85 creatures an hour, so grain at 1 in 4 would be 21 an hour from rats. The frequent drop should be something of the creature's own. No meat: that is Hunting's (Nathan, 2026-11-15). **Not Bones** (Nathan, 2026-11-16): Bones stay Hunting's, mostly, and are not the answer for creatures fought. First ideas: something from the two crabs that is not food, such as claws for fishing bait, since they drop nothing but armour; Wolf Pelts at 1 in 5, where they are 1 in 12.
### The drop pass (second draft, 2026-11-17)

Read from the live rows (`content-snapshots/drop_table_entries.json` and `creatures.json` of 2026-11-11; no later migration touches a combat drop). A fighter makes about 80 kills an hour on Taiar and about 65 on Antura.

**Nathan, 2026-11-17, on the first draft:**
- **Combat should be more rewarding than it is.** Bump today's drops where it makes sense; a creature may have several seed drops if it fits.
- **No pelts into Leather Strips:** Buckskin already supplies strips, and more would take from Hunting.
- **No Crab Claw:** bait is not short.
- **The Dock Rat's Bones go**, as other drops replace them.
- **Grey Wolf Pelts 1 in 8** (from 1 in 12).
- **Granite from the Knocker**, and a rarer Granite Block just for fun.
- **River Mussels are uncommon,** not frequent: they are already a fishing find.
- **Ratskin and Jackalope Pelt have uses of their own:** a ratskin armour set, cheap, for new players with no Defense yet, giving a tiny bit of armour and breaking a good bit quicker (a player asked; "might be kind of funny"); and per island a crafted **ring that gives power and an amulet that gives aim**, as the Wolfskin Cloak gives armour, made with the pelts of creatures and perhaps one of the unused trophies.

**Nathan, 2026-11-17, on the second draft:** the seed, Jumper, Wrecker, and Agropelter changes are settled. Crabshell is crafted from plates and **the whole pieces no longer drop**; the plates must take about as long as the drops do now. **Every island's armour set is made this way** ("homogenize this idea"). The ring uses the Agropelter Knuckle, not the Wolf Fang; the Wolf Fang goes into the Wolfskin Cloak. The Jackalope Charm and the ratskin set stand.

**Taiar** (changes in bold; everything else stays; settled except where marked):

| Creature | Frequent drop | Other changes |
|---|---|---|
| Dock Rat | **Ratskin 1 in 4** | Bones removed. Onion Seeds 1 in 10 and Linen Cloth 1 in 200 stay |
| Granary Rat | **Ratskin 1 in 4** | Grain 1 in 10 stays; **Carrot Seeds 1 in 20 to 1 in 12** |
| Jackalope | **Jackalope Pelt 1 in 4** | **Turnip Seeds 1 in 20 to 1 in 12**; Jackalope Antler (the charm's) **1 in 750 to 1 in 300** |
| Feral Dog | **Garlic 1 in 25 to 1 in 8; Onion Seeds 1 in 15 added** (it digs in gardens) | |
| Shore Crab | **Crabshell Plate 1 in 4** | **Its three pieces no longer drop** |
| Wrecker | Coin 1 in 4 (stays) | **Locked Rusty Chest 1 in 55 to 1 in 30** |
| Sidehill Gouger | **Wild Grain 1 in 25 to 1 in 8, 1 to 2; Pea Seeds 1 in 20 added** | |
| Jumper | Coin 1 in 4 (stays) | **Charc 1 in 10 to 1 in 6** (Serph wants two a bar); **ore at its two mines 1 in 20 to 1 in 10** |
| Grey Wolf | **Wolf Pelt 1 in 8** | Wolf Fang (now the cloak's) **1 in 750 to 1 in 300** |
| Ol' Shellback | **Shellback Plate 1 in 4** | **Its three pieces no longer drop** |
| Knocker | **Granite 1 to 2, 1 in 4** (settled) | **Granite Block 1 in 40** (settled, for fun); Rough Quartz 1 in 40 stays |
| Agropelter | Poor Lanai Log 1 in 5 (stays) | **Feathers 1 in 20 to 1 in 10**; Agropelter Knuckle (now the ring's) **1 in 750 to 1 in 300** |
| Hodag | **Raspberry Cane 1 in 100 to 1 in 12; Strawberry Runner 1 in 15 added** | |

- **Crabshell from plates** (settled, 2026-11-17). Two plates, one a creature, so each piece costs kills of the creature that drops it today: Crabshell Plates from the Shore Crab for its three pieces, Shellback Plates from Ol' Shellback for its three. Today each piece is 1 in 300, but a kill rolls all three at once, so a creature's three pieces take about 550 kills on average (300 x (1 + 1/2 + 1/3)), with long unlucky tails. At 1 in 4, 135 plates is 540 kills, split by size as the Snallyscale set is. The luck goes; the time stays.

  | Piece | Worn from Defense | Crafting | Plates |
  |---|---|---|---|
  | Crabshell Gauntlets | 7 | 2 | 40 Crabshell |
  | Crabshell Sabatons | 8 | 3 | 40 Crabshell |
  | Crabshell Helm | 9 | 4 | 55 Crabshell |
  | Crabshell Shield | 10 | 5 | 40 Shellback |
  | Crabshell Greaves | 11 | 6 | 40 Shellback |
  | Crabshell Cuirass | 12 | 7 | 55 Shellback |

  Their armour and long life (600 sure uses, then 0.4%) are unchanged; pieces already owned are untouched.
- **The same rule for Antura** (settled, 2026-11-17): a set's plates cost at least the kills Crabshell's do. Crabshell is about 1,080 kills (about 20 hours at the 55 an hour `docs/combat-spec.md` gives for the crabs); the first Snallyscale draft (150 scales, 600 kills) was fewer than the tier below. Raised by half, to 226 scales (about 900 kills of a slower, level 21 creature): 23 / 23 / 30 / 45 / 45 / 60 for gauntlets, sabatons, helm, shield, greaves, cuirass.
- **Three trophies get a use** and come at 1 in 300, the rate CLAUDE.md §8 gives hunting trophies (combat's are 1 in 750 today): the Agropelter Knuckle (the ring), the Jackalope Antler (the charm), and the Wolf Fang (the cloak). The Wrecker's Lantern and Knocker's Hammer stay keepsakes.
- **The Wolfskin Cloak becomes 20 Wolf Pelts and 1 Wolf Fang** (settled). At 1 in 8 and 1 in 300, a cloak is about 330 kills on average, the fang being the longer wait, against about 240 today for 20 pelts at 1 in 12. Cloaks already worn are untouched.
- **Supply, checked:** seeds and grain at these rates are a handful an hour each (5 to 10), below a field's harvest. Charc from Jumpers is about 20 an hour; Feathers from the Agropelter about 12 and from Antura's Sea Eagle about 24 at 1 in 4, against a coop of 12 chickens giving about 40 an hour of wall-clock time for no attention. Granite is a sixth of a miner's.

**The ratskin set** (settled, 2026-11-17): five pieces worn from Defense 1, Ratskin alone (as the Snallyscale set is Snallyscales alone), made by Crafting at levels 1 to 4. A new player's rats pay for it in about an hour and a half.

| Piece | Crafting | Ratskins | Armour | Ambren beside it |
|---|---|---|---|---|
| Ratskin Gloves | 1 | 4 | 2 | Bracers 6 |
| Ratskin Boots | 1 | 4 | 2 | Boots 6 |
| Ratskin Cap | 2 | 6 | 3 | Coif 8 |
| Ratskin Leggings | 3 | 8 | 3 | Chausses 10 |
| Ratskin Jerkin | 4 | 10 | 4 | Hauberk 14 |

It wears out fast: 60 sure uses, then 3% a kill, where tier 1 metal is 200 and 1% (`items.durability_uses` and `durability_break_pct`, as Crabshell overrides).

**Taiar's ring and amulet** (settled, 2026-11-17; the stats still want a sim): made at the lapidary by Crafting, worn in the finger and neck slots, so a fighter chooses between them and a Talar ring or amulet (loadouts make the swap one tap).

| Piece | Crafting | From | Gives |
|---|---|---|---|
| Knuckle Ring | 8 | 1 Agropelter Knuckle, 1 Ambren Ingot, 10 Ratskin | 3 power (a one-hand Ambren weapon is 37 to 44) |
| Jackalope Charm | 10 | 1 Jackalope Antler, 10 Jackalope Pelt | 12 aim (a weapon is 90 to 110) |

Simulated 2026-11-17 (`combatSim.ts` kits, combat 8 to 12, every form): +3 power is about 4% more kills an hour, and +12 aim about 4% too (+6 was only 2%, so the charm was raised to 12); both together about 8 to 9%. The cloak's 5 armour is about 5% less damage taken. **Code, not rows:** a fight reads aim and power from the main-hand weapon alone today (`fightingNumbers` in `services/combat.ts`); armour is already summed over everything worn. Aim and power from other slots is a small change there, and `combatSim.ts` must be run with it. Antura gets its own pair from its own creatures, with the roster.

**Antura, every drop** (frequent drops settled 2026-11-17; the rest proposed the same day; the roster is still a placeholder). About 50 kills an hour at these levels (fights lengthen with level, `docs/combat-spec.md`).

| Creature | Where | Frequent drop | Other drops | Rare |
|---|---|---|---|---|
| Wolverine | Mettlefell | Wolverine Pelt 1 in 6 | Charc 1 to 2, 1 in 8 (it raids the charcoal burners' stores) | |
| Kelpie | Farvick Narrows | Coin 1 in 4 | Linen Cloth 1 in 60 (a drowned traveller's) | **Kelpie's Bridle** 1 in 600 (the charm's) |
| Shellycoat | Farvick Narrows | Mackerel 1 in 8, Pollock 1 in 10, Sea Bass 1 in 12 | River Mussel 1 in 15; Amber 1 in 100 | Freshwater Pearl 1 in 200 |
| Sea Eagle | Vergehorns | Feathers 1 to 2, 1 in 4 | | **Rare weapon, dual pierce** (its talons) 1 in 1,250 |
| Reaver | Vergehorns | Coin 1 in 4, about twice the Wrecker's | Barley 1 to 3, 1 in 10; Broad Beans 1 in 15 (a raider's sacks); Locked Rusty Chest 1 in 30; Rough Garnet 1 in 250 | **Rare weapon, two-hand slash** (his blade) 1 in 1,250 |
| Snallygaster | Vergehorns | Snallyscale 1 in 4 | | Snallygaster's Eye 1 in 750 (a keepsake: it is drawn with one great eye) |
| Cave Bear | Yondereach | Cave Bear Pelt 1 in 6 | | **Rare weapon, one-hand crush** 1 in 1,000; Cave Bear Skull 1 in 750 (a keepsake) |
| Slide-rock Bolter | Yondereach | Granite 2 to 3, 1 in 4 | Granite Block 1 in 40; **a Serph vein** 1 in 150, 15 to 30 ore (as the Knocker's Burgh vein, `openVein`); Rough Garnet 1 in 60, Rough Quartz 1 in 120, Rough Amethyst 1 in 300 | **Bolter's Heartstone** 1 in 250 (the ring's) |

- **Each item has its reason.** Charc on Antura breaks no rule: Charc stays Taiar's as a *gathered* fuel until Hatch, and a drop is a little help to the Serph smelter, as the Jumper's is on Taiar. The Reaver carries tier 2 seeds because no Antura creature lives on its farmland (Farefield has no fighting); the seed ground stays their main source. The Bolter's gems follow the §4 rule (own gem, half that of the one below, a fifth of the one above) and stay under a miner: about 0.8 garnets an hour against 0.9 on Antura's granite.
- **A rare's chance is set per kill at its spot, not per kill of the creature** (Nathan, 2026-11-17: the Hodag Horn at 1 in 1,500 was a real problem, because the Hodag is only 15 of every 100 creatures at the Deep Wood; it is 1 in 300 now). On Taiar the three rare weapons land at about 1 in 1,250 to 2,000 kills at their spot: the Wrecker's Cutlass 1 in 1,250 at a chosen spot; the Gouger's Legbone 1 in 1,000 for a creature that is 60 in 100 of its spot (1 in 1,670 there); the Hodag Horn 1 in 300 at 15 in 100 (1 in 2,000). Antura keeps the same rates, since its creatures are harder and come slower (Nathan):
  - The Sea Eagle's and the Reaver's weapons at 1 in 1,250, the Cutlass's rate, as Vergehorns is chosen.
  - The Cave Bear's at 1 in 1,000, the Legbone's, as Yondereach draws the bear 70 times in 100 and the Bolter 30 (settled, Nathan 2026-11-17).
  - Trophies the same way. Taiar's three used trophies come at 1 in 600 to 860 kills of their spot (1 in 300 per creature, at 35 to 50 in 100). So the Bolter's Heartstone is 1 in 250 per Bolter (about 1 in 830 at Yondereach) and the Kelpie's Bridle 1 in 600, as the Narrows is chosen.
  - All with the bad-luck trail the Taiar three have (`20261112180000_bad_luck_trail`, at twice the odds).
  - **Names** (Nathan, 2026-11-17): **Eagle Talons** (dual pierce) and the **Reaver's Dane Axe** (two-hand slash). The Cave Bear's one-hand crush is the **Dripstone Cudgel**, a club of cave stone from the bear's den, since the Gouger's Legbone is already a bone.
- **The creature that drops an island's armour material drops nothing for its ring, charm, or cloak** (Nathan, 2026-11-17). The crabs drop plates only on Taiar, and on Antura the Snallygaster gives Snallyscales and a keepsake eye. So the ring's trophy moves to the Bolter's Heartstone.
- **Antura's ring and amulet**, as Taiar's pair (Crafting at the lapidary, finger and neck slots, a trophy and the island's creatures):

  | Piece | Crafting | From | Gives |
  |---|---|---|---|
  | Heartstone Ring | 18 | 1 Bolter's Heartstone, 1 Serph Ingot, 10 Wolverine Pelt | about 4 power |
  | Kelpie's Bridle Charm | 20 | 1 Kelpie's Bridle, 1 Rough Garnet, 20 Feathers | about 16 aim (to sim) |

  A third more than Taiar's, as tier 2 weapons are about a third stronger. Names are placeholders.
- **New items:** Wolverine Pelt, Cave Bear Pelt, Snallyscale, Kelpie's Bridle, Snallygaster's Eye, Cave Bear Skull, Bolter's Heartstone, Rough Amethyst (no row yet; Antura's granite needs it too), the three rare weapons, the mantle, the ring, and the charm.

- **The Shellycoat's fish.** Nathan asked whether it could drop two or three tier 2 fish, at 1 in 4, 5, and 6. At those rates it gives about 40 fish an hour, where a fisher on Antura lands about 45 a cast hour (80 s casts), so fighting would out-fish Fishing; and a fish is food, where a creature's common drop is meant not to be (CLAUDE.md §2). **Settled (Nathan, 2026-11-17): the Narrows' three lower fish, Mackerel 1 in 8, Pollock 1 in 10, and Sea Bass 1 in 12**, about 20 an hour, under half a fisher; a raw fish still has to be cooked before it is eaten. 
New items: Ratskin, Jackalope Pelt, Crabshell Plate, Shellback Plate, the five ratskin pieces, the Knuckle Ring and the Jackalope Charm on Taiar; Wolverine Pelt, Cave Bear Pelt, Snallyscale on Antura.

- **Before building this, ask the players why few fight.** On 2026-11-10 five players had reached Melee 2. A Crier poll first (Claude's recommendation; Nathan has not ruled).

## 11. Cooking (a first full list, 2026-11-15, for Nathan to cut and change)

Cooking already has 27 recipes at 13 to 18, including the tier 2 provisions, so the new dishes sit at 19 to 24. Each new fish gets a plain cooked version at its own level, as on Taiar.

Settled:

- **Salt is an optional pinch** when cooking starts: one salt for a small chance of doubling the dish. A few preserved foods name it as an ingredient.
- **Ale** is brewed from Barley and Meadowsweet in a cask on its own clock, Cooking's first slow work. At a tavern a player can stand a round, and everyone there gets its buff. Never a combat buff.
- No pease pottage.
- Each wild staple must go into at least three recipes.
- A recipe may use older ingredients as long as one is tier 2.

How Taiar's cooking is shaped, which this follows: a plain cooked fish or roast takes 30 s and heals about 10 plus 2.5 a level (10 at level 1, 30 at 9, 46 at 17); a made dish heals about five and a half times its level (56 at 10, 84 at 15, 100 at 18) and takes 45 s at level 3 rising to 110 s at 18.

### Cooked fish

| Level | Fish | Heals |
|---|---|---|
| 13 | Cooked Tench, Cooked Mackerel | 38 |
| 16 | Cooked Rudd, Cooked Pollock | 45 |
| 19 | Cooked Zander, Cooked Sea Bass | 52 |
| 22 | The invented lake fish, Cooked Turbot | 58 |

The fish names are placeholders (§9).

### Dishes

| Level | Dish | Made from | Tools | Heals |
|---|---|---|---|---|
| 19 | Barley Pottage | 2 Barley, 1 Leek, 1 Onion | Cauldron, ladle | 102 |
| 19 | Buttered Samphire | 3 Samphire, 1 Butter | Skillet | 100 |
| 20 | Salt Fish | 2 of any raw fish, 2 Sea Salt | Cooking knife | 104 |
| 20 | Buttered Worts | 1 Cabbage, 1 Leek, 1 Butter | Cauldron | 106 |
| 21 | Bean and Barley Stew | 2 Broad Beans, 1 Barley, 1 Garlic, 1 Onion | Cauldron, ladle | 112 |
| 21 | Pickled Beet | 2 Beet, 1 Sea Salt, 1 Honey | Cauldron, cooking knife | 110 |
| 22 | Mackerel in Gooseberry Sauce | 1 Cooked Mackerel, 2 Gooseberry, 1 Butter | Skillet | 118 |
| 22 | Leek and Cheese Tart | 2 Flour, 2 Leek, 1 Cheese, 1 Egg | Hearth, cooking knife | 118 |
| 23 | Samphire and Fish Broth | 2 Samphire, 2 of any cooked fish, 1 Leek | Cauldron, ladle | 124 |
| 23 | Gooseberry Fool | 3 Gooseberry, 1 Milk, 1 Honey | Mortar and pestle | 122 |
| 23 | Beans and Pork | 1 Pork, 2 Broad Beans, 1 Onion | Cauldron, meat cleaver | 126 |
| 24 | Salt Beef and Cabbage | 1 Beef, 1 Sea Salt, 1 Cabbage, 1 Beet | Cauldron, meat cleaver | 130 |
| 24 | Shore Pie | 2 Flour, 2 Samphire, 2 of any cooked fish, 1 Butter | Hearth, ladle | 132 |

- Timers about 90 to 130 s, a little longer than Taiar's top dishes; XP from the band at build.
- Salt Fish and Gooseberry Fool cannot burn: one is cured, the other is not cooked.
- Buttered Worts is a real medieval dish of greens and leeks in butter.

### Ale

| Level | Brew | Made from | How |
|---|---|---|---|
| 20 | Ale | 3 Barley, 1 Meadowsweet | In a cask, on its own clock |

**Its buff: every skill 1% faster for 6 hours, rounded up** (Nathan, 2026-11-15). It is a longer Meadowsweet Draught (1% for 2 hours), kept below the tier 2 provisions, which give one skill 1.5% for 5 hours, so ale never replaces them. The rounding is already how speed buffs work: `timerCut` in `services/buffs.ts` rounds the cut up to a whole second and never takes less than one.

### How often each new ingredient is used

| Ingredient | Recipes |
|---|---|
| Leek | 4 |
| Barley | 3 (with ale) |
| Sea salt | 3, and the pinch |
| Samphire | 3 |
| Cabbage, Beet, Broad bean, Gooseberry | 2 each, and Cabbage, Beet, and beans are also feed |

That is 13 dishes, 2 provisions, ale, and 8 cooked fish: 24 recipes, against Taiar's 78.

**None of the thirteen is a provision.** All are plain food: they heal, and can be eaten in a fight. Ale is the only new item with a buff. Tier 2's provisions already exist at Cooking 13 to 17 (Farming, Woodcutting, Mining, Fishing, Husbandry, Smithing, Carpentry, travel, Foraging's finds, Hunting's double). The skills with none were Cooking and Crafting, and combat by rule. **Two are added** (Nathan, 2026-11-15), in the existing pattern of a finished dish plus one or two things:

| Level | Provision | Made from | Helps |
|---|---|---|---|
| 20 | Crafter's Pottage | 1 Barley Pottage, 1 Cheese, 1 Wild Thyme | Crafting, 1.5% for 5 hours |
| 21 | Cook's Supper | 1 Buttered Worts, 1 Cottage Loaf, 1 Sea Salt | Cooking, 1.5% for 5 hours |

## 12. Crafting, Talar, and the rest

- **Crafting:** garnet jewelry, already specced in `docs/talar-spec.md` and waiting on Serph (rings at Crafting 20, amulets at 22). Nettle Cordage, proposed at 2 nettles a cord. With Refine Garnet at 13 and Tan Slothhide at 17 already there, that is four things in the tier.
- **Talar:** nothing new. Garnets are far commoner here (§4), which feeds tier 2 filling and vigils back on Taiar.
- **Woodcutting, Hunting, Husbandry:** nothing new.
- **Wayfaring:** the roads (§2), the boats, and the islets.

## 13. What Nathan still has to decide

1. **The map:** final positions, roads, and the picture for each place. Islet pictures carry no painted names.
2. **The invented lake fish** at Bidewater, level 22 (§9). The other fish and every creature's name, level, and weakness are settled (2026-11-17).
3. **Whether to poll players before building tier 2 combat** (§10).
4. **What survives the 1.0 reset**, and whether Thieving and Exploration are cut: a conversation of its own (Nathan, 2026-11-17). Not Antura's question, but the reset is when the free fixes in §14 land.

## 14. What the code assumes today that Antura breaks

For whoever builds it. Each of these is one island's worth of assumption.

- ~~**The farmstead is at Novita.**~~ **Done 2026-11-19:** each island's homestead place is `islands.homestead_place`, resolved from where the player stands (`services/islands.ts`); farming and husbandry find their homestead through it.
- ~~**The XP share counts within one farmstead.**~~ **Done 2026-11-19:** `fieldRanks` counts every field a player owns, highest-tier island (`islands.tier`) first; pens rank across every homestead. Still to do when a second homestead ships: the farm screen saying when a new island's fields push older ones down.
- ~~**The field ceiling is one number.**~~ **Done 2026-11-19:** `islands.plot_max`, 20 on Taiar and 10 by default.
- **Shops are raised in Talador only:** partly done 2026-11-19: a shop is raised in the player's island's port (`islands.shop_town`), and the location payload marks homestead ground and shop ports (`homesteadHere`, `shopsHere`). Still one shop a player wherever it stands (`shopFor`, 22 call sites); one an island waits for build step 9, and `SHOP_TIERS` holds tier 1 only.
- **The map folder is Taiar's:** done 2026-11-19 for the picture, which comes from the place's region folder. The exit hotspots in `lib/locationExits` are keyed by place name, so Antura's places add their own entries with the art.
- **Road finds are Taiar's, in code:** every entry in `services/travelEvents.ts` is keyed `'Taiar Island'`, and `gameTick.ts` falls back to that region.
- ~~**"Taiar Island" is written into the client.**~~ **Done 2026-11-19:** the map heading shows the place's island; the public pages say Talaran.
- ~~**Gem drops are keyed by rock type.**~~ **Done 2026-11-19:** a node may name its own table (`resource_nodes.drop_source_key`, e.g. `mining:rock:granite@antura`).
- **Smelting and sawing are tables in code:** `SMELT_RECIPES` needs Serph; `WOOD_TYPES` has the wrong levels for every wood after Lanai (CLAUDE.md §8).
- **An animal has one feed:** `animal_species.feed_item_name`, read in about eight places in `services/husbandry.ts`.
- ~~**`services/unlocks.ts` needs a branch for boats.**~~ Done with the Skiff.
- **The committed content snapshot is stale:** the merchant seed fails on a fresh database because `Ambren Scythe` is missing. Export from live before building on it.

Free to fix at the 1.0 reset, and costly after: the item tiers of Hatch, Bearn, Mirrith, Craxial, Limestone, Sandstone, Marble, Basalt, and Koric; the placeholder ores `Ore 3` to `Ore 7`; the name `Tal's Hope`, which breaks the lore rule; Taiar granite's 15 s floor.

## 15. A build order

Each step ends with Nathan testing. Steps 1 and 2 need nothing from Antura and can go to the alpha first.

1. **The Skiff:** boats, the slip at Talador, building in pieces, Nettle Cordage.
2. **Taiar's islets:** exploring, landings, finds.
3. **Antura's shell:** the places, roads, map, museum, merchants, public benches; the ferry. **Started 2026-11-19:** the eight places on Claude's proposed roads (Nathan: use them until the final map), the `Antura` island row (tier 2, Farefield, Wendhaven, 10 fields), the ferry and boat crossings, and minimap buttons for any road a place's picture has no exit for (Antura has no art yet). Still to come: the museum, merchants, public benches, and the tavern.
4. **The main chain:** Underway's granite and Serph, smelting, the Serph tools. **Built 2026-11-19** (migrations `20261119140000_underway_mining`, `20261119150000_serph_smithing`, `20261119160000_serph_arrows_and_deep_lanai`): Underway Granite and the Serph Ore Node with §4's numbers and Antura's own gem tables; Serph smelting (`SMELT_RECIPES`); the 44 Serph recipes and their items, weapons and armour from `lib/combatMath.ts` at tier 2 (the Serph Atgeir is 81 power, one above the hand-set Hodag Horn's 80); a hunt shoots the best arrow carried (`bestArrow`), 10 points off the catch a tier below the animal and 3 on a tier above, with the Ground Sloth's lines; Deep Lanai at tool tier 2. Measured: the Sloth 44% with Ambren arrows and 55% with Serph; Deep Lanai 84 s with an Ambren hatchet and 60 s with Serph. Mettlefell's public benches and tool merchants wait for step 3's second half: `PUBLIC_STATIONS` holds one place per bench type today.
5. **The homestead:** the cross-island XP share first, then Farefield, the six crops, the seed ground, the feed table. **Built 2026-11-19** (migrations `20261119180000_farefield_crops`, `20261119190000_animal_feeds`; the XP share and island rows with step 3): the six crops in Antura's soil only (`crops.region`; a homestead offers only its soil's crops), xp_per_seed by Taiar's own rule, grow times 22 to 40 h (proposed); Barley harvested as itself and milled 3 to 2 into Flour; the Seed Ground (Farefield, Foraging 13, 65 s) and the Tidal Shore (Farvick Narrows, 19, 70 s, Sea Salt and Samphire); `animal_feeds` with the ladder's list (grain, barley, peas, and beans at a species' amount, roots, greens, and nuts at twice), picked by hand in the Animals tab, cheapest held for Feed All and Larder Ward.
6. **The water:** the fish, the Serph rod, the tidal shore.
7. **Cooking:** cooked fish, the dishes, the salt pinch, ale and the round.
8. **Combat:** Serph arms, the creatures, the rare drops. After the poll, if there is one.
9. **Carpentry's builds:** the tier 2 shop and guild hall work.
10. **The Cog and Antura's islets,** and garnet jewelry.
