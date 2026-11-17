# Antura: the plan for island 2

*Written with Nathan, 2026-11-14 and 15, as the brief for building it. **Settled** means Nathan decided it. **Proposed** means a first layout from Claude for him to change: names, levels, and numbers in those parts are placeholders until he says otherwise. §13 lists what he still has to decide. Not built.*

Read with: `CLAUDE.md` §8 (the material ladder), `docs/foraging-farming-ladder.md`, `docs/sailing-spec.md`, `docs/islets-plan.md`.

---

## 0. Where this stands, and what to do next (2026-11-16)

Nathan and Claude designed Antura over three days and stopped part-way through reviewing Carpentry and Smithing. **Nothing here is built.** This section is the handoff for the next session.

**Read first:** this file, then `docs/sailing-spec.md`, `docs/islets-plan.md`, `docs/foraging-farming-ladder.md`, and CLAUDE.md §8 "The material ladder". Every decision of Nathan's is dated in those five places. Anything marked "proposed" is Claude's and still his to change.

**Done and settled:** the places and their names (§2), getting there (§3, sailing spec), Mining (§4), Farming and Husbandry rules (§7), Foraging (§8), the fish (§9), Cooking's 24 recipes (§11), the creature roster and the Snallyscale set (§10).

**In progress, pick up here:** the Carpentry and Smithing review (§6a). Nathan ruled on its four findings on 2026-11-16; carpenters build for other players (§6b, its design proposed); homesteads and shops stay single actions (2026-11-17).

**Still to do with Nathan, in rough order:**

1. What a tier 2 homestead gives (§6), and Nathan's verdict on the hiring design in §6b; then the Carpentry and Smithing numbers.
2. One pass over every creature's drops on both islands (§10): Taiar's are thin, Antura's are first ideas. No meat, no Bones.
3. The tier 2 cloak: its name, pelt counts, and levels (§10).
4. Creature levels, weaknesses, and names are placeholders until he confirms them; so is the invented lake fish (§9).
5. What survives the 1.0 reset, and whether Thieving and Exploration are cut (§13).

**Waiting on Nathan alone:** the final map, roads, and place pictures; the islet maps; the ore names for tiers 4, 6, and 9.

**Before building anything:** export a fresh content snapshot from live (the committed one predates the scythe and the merchant seed fails on it), and read §14, which lists what the code assumes that a second island breaks. §15 is the build order; its first two steps (the Skiff, Taiar's islets) need nothing from Antura.

**Also on this branch (`ccr-85dfc5b0-gyhmxo`), not merged to `main`:** the skill-icon hairline (`components/SkillsPanel.tsx`, `SkillsPanel.css`, `index.css`) and Stonehold's full-colour skill icons (`themes/stonehold.css`). Both were checked in a browser in Chromium only; look at the hairline on an iPhone before it deploys.

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

Proposed:

- **Each Ambren recipe at level L becomes a Serph recipe at L plus 12**, with the same number of ingots and the same wooden and leather parts. That is 44 recipes across Smithing 13 to 24: the tools at 13, one-hand weapons at 13, dual weapons at 16, two-hand weapons at 20, and one armour piece a level from 13 to 24, matching `docs/combat-spec.md` (Serph weapons at Melee 13, armour at Defense 13 to 24).
- **Timers about a tenth longer than Ambren's**, XP from the band: a Serph Pickaxe about 148 XP in 100 s, where the Ambren one is 100 XP in 90 s.
- **Smelting:** 1 Serph Ore and 2 Charc make 1 Serph Ingot, about 44 XP in 50 s. A dense ore makes 3 for twice the fuel, time, and XP, by the rule already written in `services/smithing.ts`.
- Serph Nails 30 to an ingot and Serph Hooks 10, as Ambren's.

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
- Proposed costs. Tier 1 is today's: the farmstead 500 Lanai Planks, 500 Granite Blocks, 1,000 Ambren Nails in 600 s; the shop 350, 350, and 700 in 480 s. The upgrade to tier 2 uses Serph Nails, and building tier 2 outright costs the tier 1 build and the upgrade together, all in Serph Nails, which is a little dearer than the two steps because Serph Nails are worth more than Ambren:

  | | Tier 1 | Upgrade to tier 2 | Tier 2 outright |
  |---|---|---|---|
  | Homestead | 500 / 500 / 1,000 Ambren, 600 s | 600 / 600 / 1,200 Serph, 600 s | 1,100 / 1,100 / 2,200 Serph, 1,200 s |
  | Shop | 350 / 350 / 700 Ambren, 480 s | 450 / 450 / 900 Serph, 480 s | 800 / 800 / 1,600 Serph, 960 s |

  Planks, blocks, and nails in that order. A tier 2 shop has 100 storage, 16 selling, and 8 buying slots, where tier 1 has 75, 12, and 6 (`SHOP_TIERS` in `services/shops.ts` holds tier 1 today and was built to take more).
- **Open: what a tier 2 homestead gives.** Fields are capped by Farming level and pens by Husbandry level, and CLAUDE.md §2 says never to gate one skill's capacity behind another's level, so a Carpentry-built tier cannot add fields or pens. What is the building's own is its storage (50 slots today, `player_properties.storage_slots`). Still Nathan's to decide.

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
   **Guild halls roll 1 to 3** (Nathan, 2026-11-16), weighted the same way: 1 plus two flips at the same 25% to 75%, so 1.5 an action on average at the hall's level and 2.5 at 24 over. Today's halls place one an action.
2. **Carpentry has nothing repeatable at tier 2's band.** Sawing pays a flat 23 XP a saw whatever the sawyer's level (`SAW_XP` in `services/carpentry.ts`), Deep Lanai drops the same Lanai logs as the level 1 tree, and every bench recipe is level 8 or below. From 13 to 24 the only Carpentry XP at the band is the builds, which are one-off, and now quicker (finding 1). Put to Nathan on 2026-11-16:
   - **Deep Lanai logs as their own item: no** (Nathan).
   - **A cask for brewing ale: not yet** (Nathan). Brewing is not designed past "a cask, on its own clock" (§11), and he does not like a cask used up every brew. If a cask is a reusable fixture, a middle way is that it wears like any bench tool (`services/toolWear.ts`), lasting many hours of brewing. That waits for brewing's own design.
   - **Carpenters build for other players** (Nathan, 2026-11-16): shops, homesteads, and boats. A player need not raise their own; they can hire a carpenter and pay them. The builds are one-off for each owner, not for the trade, so boats and halls built for others become repeatable Carpentry work; homesteads and shops stay quick single actions (2026-11-17) and add little XP. The design is §6b.
   - **Still thin, and open:** with about 30 players, each wanting one Skiff and one Cog, boats for hire are a modest supply of work. Whether builds, hire, and sawing are enough from 13 to 24 is best judged once the numbers in §5 and §6 are settled.
3. **Bench tools already follow the tier rule; nothing to build.** `tierMultiplier` in `services/workstations.ts`: work at the tool's own tier is on band, each tier above the tool is 35% slower and more than two is refused, each tier below is 12% faster. So a Serph recipe at an Ambren-tooled bench is 35% slower, and Serph bench tools speed tier 1 recipes by 12%.
4. **26 of the 44 Serph recipes open at Smithing 13**, as 26 open at Smithing 1 on Taiar. The tools have to, since each is a door into another skill (the argument Nathan made for Carpentry). The other 18 spread across 14 to 24. Nathan, 2026-11-16: that is fine.

## 6b. Building for hire (Nathan, 2026-11-16; the design below is proposed)

Settled: a carpenter can build a shop, a homestead, or a boat for another player, who pays them.

Proposed, for Nathan to change:

- **One build site, for everything built in pieces: boats and guild halls.** The guild hall's build is made general (as `docs/sailing-spec.md` §5 already asks): a site has an owner, a place, a kind (boat or hall), and the materials still wanted. Guild halls move onto it. Every build action places a roll of materials (§6a) and pays the hand that placed them.
- **The owner founds the site** where the building will stand (a slip for a boat), and is the owner of what is raised on it from the first piece.
- **Anyone may bring materials to a site**: the owner, the carpenter, a friend. A build action takes from the builder's own pack, as the hall's does; or the owner can lay materials at the site for the hired hand to use. Materials laid at the site and not yet built in can be taken back by the owner; once built in, they are the building.
- **Who may build:** the owner, and anyone the owner names. Naming a carpenter is the hire.
- **Pay is per piece, from escrow.** The owner sets a rate (gold for each material placed) and lays gold at the site; each action pays the hand who placed the pieces at once, from that gold, inside the action's transaction. No lump on completion, so neither side can be cheated by the other walking away: the carpenter is paid for what is placed, and the owner pays for nothing unbuilt. A site with no gold left stops paying, and the hired hand is told before the next action.
- **XP goes to whoever places the pieces**, at the building's tier band, as §6a.
- **The builder needs the Carpentry level for that building** (the Skiff 10, the Cog 19) and a mallet and saw (`services/construction.ts`). The owner needs neither.
- **Finding work:** no index of sites across the world, as there is no index of shop prices (CLAUDE.md §2); players find each other in trade chat. A notice at the place itself (the slip) of sites there that want a hand would fit, and is Nathan's call.
- Moving items and gold between two players: race:check scenarios for laying materials, taking them back, laying gold, and five build actions at once against one site's gold; and for a hired homestead or shop, the fee paid twice by two finishes at once.

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

- **Rare weapons:** dual pierce, two-hand slash, and one-hand crush, each from a creature it is not the weakness of, about 1 in 1,500 to 2,000, with the bad-luck count the Taiar three have. Proposed: the dual pierce from the Sea Eagle (its talons), the two-hand slash from the Reaver (his blade, as the Wrecker drops a cutlass), the one-hand crush from the Cave Bear.
- **The Snallyscale armour set is crafted, not dropped** (Nathan, 2026-11-15). The Snallygaster drops **Snallyscales**, and Crafting turns them into the pieces. The item is a Snallyscale, never a plain "scale", so other creatures' scales can be their own items later (Nathan, 2026-11-16). Not shell again: Taiar's set is Crabshell. It sits between late Serph and early Azulyss, as Crabshell sits between Ambren and Serph, and lasts far longer than smithed armour. Snallyscales can be traded, so a fighter can sell them to a crafter. Proposed, to argue with:

| Piece | Crafting level | Worn from Defense | Snallyscales |
|---|---|---|---|
| Snallyscale Gauntlets | 14 | 19 | 15 |
| Snallyscale Sabatons | 15 | 20 | 15 |
| Snallyscale Helm | 16 | 21 | 20 |
| Snallyscale Shield | 18 | 22 | 30 |
| Snallyscale Greaves | 19 | 23 | 30 |
| Snallyscale Cuirass | 21 | 24 | 40 |

  **Snallyscales are all a piece takes** (proposed 2026-11-16). An earlier draft added leather and Linen Thread "as the Wolfskin Cloak does", which was wrong: the cloak is twenty Wolf Pelts and nothing else. With a Snallyscale about one kill in four, the 150 are about 600 kills. Crabshell asks about 550 kills of each crab. Six recipes take Crafting past its tier's three to six, which Nathan allows where the reason is good; this is also what gives Crafting something at nearly every level from 13 to 22.
- Gems from creatures follow §4's pattern.
- **Drops are thin on Taiar** (a player's complaint, and the data agrees). On the live tables most creatures' commonest drop is 1 in 10 to 1 in 25. The two crabs drop nothing but armour pieces at 1 in 300 each, so 99 kills in 100 give XP alone; the Feral Dog's only drop is 1 in 25; only three of thirteen creatures ever drop coins. A hunt, by contrast, always gives meat and a hide. Proposed for Antura: every creature has one drop with a real use that comes often, about one kill in three to five. The same fix on Taiar is rows only.
- **Taiar's drops are to be looked at again** (Nathan, 2026-11-15). A caution for whoever does it: simply raising today's odds floods other trades, because most common drops are seeds, grain, logs, and ore. A level 1 fighter kills about 85 creatures an hour, so grain at 1 in 4 would be 21 an hour from rats. The frequent drop should be something of the creature's own. No meat: that is Hunting's (Nathan, 2026-11-15). **Not Bones** (Nathan, 2026-11-16): Bones stay Hunting's, mostly, and are not the answer for creatures fought. First ideas: something from the two crabs that is not food, such as claws for fishing bait, since they drop nothing but armour; Wolf Pelts at 1 in 5, where they are 1 in 12.
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
3. **Fish and creature names**, and the creatures' levels and weaknesses (§9, §10).
4. **Whether to poll players before building tier 2 combat.**
5. **The dish list** (§11), to cut and change.
6. **The numbers marked proposed in §4 to §6.**
7. **The net:** no tier 2 for now is proposed (§9).
8. **What survives the 1.0 reset**, and whether Thieving and Exploration are cut. Not Antura's questions, but the reset is when the free fixes in §14 land.

## 14. What the code assumes today that Antura breaks

For whoever builds it. Each of these is one island's worth of assumption.

- **The farmstead is at Novita:** `FARMSTEAD_TOWN` in `services/farming.ts`, with the Novita row looked up throughout; husbandry follows it.
- **The XP share counts within one farmstead:** `holdingRank` in `lib/holdingShare.ts` filters by `property_id`. It must count across all of a player's homesteads, fields highest-tier island first, before a second homestead ships.
- **The field ceiling is one number:** `PLOT_MAX` 20. Past Taiar it is 10.
- **Shops are raised in Talador only:** `SHOP_TOWN` in `services/shops.ts`; `SHOP_TIERS` holds tier 1 only.
- **The map folder is Taiar's:** `MiniMap.tsx` builds `/images/locations/Taiar_Island/<place>.jpg`, and the exit hotspots are hard-coded in `lib/locationExits`. Both must come from the place's region.
- **Road finds are Taiar's, in code:** every entry in `services/travelEvents.ts` is keyed `'Taiar Island'`, and `gameTick.ts` falls back to that region.
- **"Taiar Island" is written into the client** in several headings (`RightPanel.tsx`, the Manual, News, and Highscores pages).
- **Gem drops are keyed by rock type**, not place (§4).
- **Smelting and sawing are tables in code:** `SMELT_RECIPES` needs Serph; `WOOD_TYPES` has the wrong levels for every wood after Lanai (CLAUDE.md §8).
- **An animal has one feed:** `animal_species.feed_item_name`, read in about eight places in `services/husbandry.ts`.
- **`services/unlocks.ts`** needs a branch for boats, or level-ups say nothing about them.
- **The committed content snapshot is stale:** the merchant seed fails on a fresh database because `Ambren Scythe` is missing. Export from live before building on it.

Free to fix at the 1.0 reset, and costly after: the item tiers of Hatch, Bearn, Mirrith, Craxial, Limestone, Sandstone, Marble, Basalt, and Koric; the placeholder ores `Ore 3` to `Ore 7`; the name `Tal's Hope`, which breaks the lore rule; Taiar granite's 15 s floor.

## 15. A build order

Each step ends with Nathan testing. Steps 1 and 2 need nothing from Antura and can go to the alpha first.

1. **The Skiff:** boats, the slip at Talador, building in pieces, Nettle Cordage.
2. **Taiar's islets:** exploring, landings, finds.
3. **Antura's shell:** the places, roads, map, museum, merchants, public benches; the ferry.
4. **The main chain:** Underway's granite and Serph, smelting, the Serph tools.
5. **The homestead:** the cross-island XP share first, then Farefield, the six crops, the seed ground, the feed table.
6. **The water:** the fish, the Serph rod, the tidal shore.
7. **Cooking:** cooked fish, the dishes, the salt pinch, ale and the round.
8. **Combat:** Serph arms, the creatures, the rare drops. After the poll, if there is one.
9. **Carpentry's builds:** the tier 2 shop and guild hall work.
10. **The Cog and Antura's islets,** and garnet jewelry.
