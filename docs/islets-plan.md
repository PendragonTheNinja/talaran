# The islets: a first plan

*Mocked up for Nathan, 2026-11-15, to work from. Everything here is a proposal unless it says "settled". The settled rules it builds on are in `docs/sailing-spec.md` §6. Not built.*

## 1. What an islet has to do

- **Be worth the trip** (Nathan). A voyage out and back is 4 to 8 minutes that pays only Wayfaring. A player who wanted XP for a long timer would sail between the islands instead. So what waits on an islet must beat staying at home in some way.
- **Never become the way to train a skill** (Nathan). No islet find may take over the main action a skill scales on.
- **Never disappoint outright** (Nathan). Even a barren islet turns up something.
- No unique resource per skill (settled). The reward is a **boost**, not a new item for every trade.

The plan meets all four the same way: **an islet pays the normal XP for the work, and a much better chance of everything that work can turn up besides.** The travel costs working time, so XP for the hour is lower than at home. The extras are far richer. A player goes for the finds, not the levels, and cannot choose which islet or which find they get.

## 2. A landing

1. The player puts to sea from a port. The voyage decides which islet (settled: by chance, no near or far).
2. On landing, two things are true:
   - **The strandline.** Every landing, whatever else is there, has something washed up: one short search of the shore with a small sure find (§5). This is what makes a barren islet still worth the sail.
   - **The find.** One thing rolled for this landing from what that islet can hold (§4). It belongs to this player alone, as a vein belongs to its finder.
3. A find is a **fixed amount of work**, as a vein is a fixed count of ore. When it is worked out, or the player sails home, it is gone. There is no coming back to it.
4. The player sails home to the port they left. The ship's log tells the voyage (`docs/sailing-spec.md` §7).

The first landing on an islet **discovers** it: its place fills in on the island's islet map, the Chronicle may write it up as it does a road first walked, and finding every islet of an island is a feat.

## 3. Taiar's islets (mock: eight)

Each islet has a character, so its picture always matches what is found there. Rarer islets are reached less often and hold more.

| # | Islet | Reached | Can hold |
|---|---|---|---|
| 1 | A wooded islet | Often | A stand of trees, a wild patch, flowers, a nest of young |
| 2 | A rocky islet | Often | An exposed vein, a guarded cache, nothing |
| 3 | A sandbar | Often | A buried chest, a shoal, nothing |
| 4 | A reef | Often | A shoal, a wreck's leavings, nothing |
| 5 | A heath islet | Often | A wild patch, flowers, a game trail, young |
| 6 | A sea stack and its birds | Seldom | Nests by the dozen, young, a guarded cache |
| 7 | A drowned quarry | Seldom | A great vein, a guarded cache |
| 8 | The ruin | Rarely | An artefact, a great chest, a foal, Quank |

Mock odds of reaching each: the five common islets 16% each (80%), the two seldom ones 8% each (16%), the ruin 4%.

**The first player to reach an islet names it** (Nathan, 2026-11-15), and only after the full launch, so the alpha's testing names nothing. What that asks for:

- The name is data on the islet, with who gave it and when, shown on the islet map and told in the Chronicle. **The islet pictures must carry no painted names**, since the name does not exist until a player gives it.
- An unnamed islet needs words of its own until then ("an islet nobody has named").
- A name is refused, not cleaned, by the same rule as guild and shop names (`namesRefusal`), with a length limit, and no two islets alike.
- It is permanent. Staff can rename one that slips past the filter.
- Because which islet a voyage reaches is chance, the first sailors out do not all name the same one.
- Naming is switched off through the alpha (Nathan, 2026-11-15), so testers are never asked to name something the 1.0 reset will wipe.

Antura has its own eight on the same pattern, and its islets also carry Nathan's quest series.

## 4. The finds, and what each one boosts

"Normal XP" below always means the working skill's ordinary XP for each action, at the player's own level, with their own tools.

| Find | Worked with | The fixed amount | The boost |
|---|---|---|---|
| A stand of trees | Woodcutting | 40 chops | Better odds of Fine and Excellent logs (more planks a log); Bird Nests and Wild Hives several times likelier |
| An exposed vein | Mining | 25 to 40 ore (a mainland vein is 8 to 20; Nathan: leave this one as it is) | Dense ore likelier; gems several times likelier |
| A shoal | Fishing | 40 casts | Bites as if on the best bait, with none used; heavier fish, so records fall here; salvage likelier |
| A wild patch | Foraging | 40 searches | Notable finds several times likelier; the island's seeds |
| A game trail | Hunting | 15 hunts | Surer shots; trophies likelier |
| A buried chest | Nobody's skill | One dig | Coins, rough gems, a curio, sometimes a tool |
| A guarded cache | Combat | One fight | The creature's own drops, and the cache behind it |
| A nest of young | None | Take them | One or two young of tier 1 or 2 |
| Flowers | None | Pick them | Pen flowers, as the road gives now and then |
| An artefact | None | Take it | One piece for the museum; a set per island |
| Quank | None | Talk | Rare. Something odd, and never the same twice |
| Nothing | | | The strandline only |

"Several times likelier" is a dial per find, set in data. A starting point is three to five times. The amounts were raised a little across the board on 2026-11-15 (Nathan), the vein excepted.

### Why this cannot take over a skill

- A stand of 40 chops is about 30 minutes of work behind about 6 minutes of sailing. Over that time the islet pays about five sixths of the Woodcutting XP that staying at the tree would. It is always the slower way to level.
- The player cannot pick the stand. Four landings in five are something else.
- The amounts are fixed, so a find cannot be farmed.

### Mock odds of each find

By islet kind, as the first numbers to argue with:

| | Work (stand, vein, shoal, patch, trail) | Chest | Guarded cache | Young | Flowers | Artefact | Quank | Nothing |
|---|---|---|---|---|---|---|---|---|
| Common islets | 45% | 12% | 10% | 8% | 10% | 0 | 1% | 14% |
| Seldom islets | 45% | 10% | 20% | 15% | 0 | 3% | 2% | 5% |
| The ruin | 0 | 30% | 20% | 15% | 0 | 25% | 10% | 0 |

Which kind of work an islet rolls follows its character (a wooded islet never shows a vein).

## 5. The strandline

Every landing, one short search of the shore, with a sure find from a small table of things that already have a use:

- a handful of coins (the player is doing something, so coins are allowed: CLAUDE.md §5 item 14);
- a few seeds of the island's crops;
- bait;
- now and then something better: a Bird Nest, a locked chest of the kind Fishing salvages, a message in a bottle (`docs/sailing-spec.md` §8).

It is small on purpose. It is the floor under a barren landing, not a reason to sail.

## 6. Settled with Nathan, 2026-11-15

- **Falling in a fight on an islet:** what the player drops is carried to the port they sailed from and waits there as a death pile does now. They could never choose to sail back to the islet.
- **A better boat or a higher Wayfaring level changes the speed of the voyage only**, never what is found.
- **Players on the same islet see each other**, and each has their own find, rolled for them alone, so two may find different things on one islet.
- **The amounts and the boost are checked in a sim** against each skill's hour at home before they are fixed.

Still open:

- **How much a find adapts to the player.** Proposed: a stand, vein, shoal, patch, or trail is the best of its kind on that island that the player has the level for.
- **How many islets.** Eight is a guess to get the shape right; the islet maps decide.

## 6c. Settled for building step 2 (Nathan, 2026-11-17)

1. **Build with the eight mock islets** and the existing picture fallback; Nathan swaps in the islet maps and pictures later.
2. **A work find matches the player:** a stand, vein, shoal, patch, or trail is the best of its kind on that island that the player has the level for.
3. **Every boost starts at 3 times**, one dial per find, in data, checked in the sim.
4. **Voyage times:** the Skiff about 3 minutes out at Wayfaring 1, falling toward 2 at high levels, Wayfaring XP near a horse's rate, simmed against walking and riding before the numbers are fixed.
5. **The strandline:** coins, crop seeds, bait, and now and then a Bird Nest or a locked chest. No message in a bottle for now.
6. **Flavour text, a great deal of it, drafted by Claude for Nathan's edit:** arrivals, finds, last actions, coming home empty, and real stories in the ship's log.
7. **A player who leaves the game on an islet is sent home**, with everything they carry, as the death pile is carried to port; the find is lost, nothing else is. No one is ever stranded.

**Open:**

- **Sailing on from an islet to the next** (Nathan asked whether a player must go home after every landing). Proposed: a voyage may make up to **three landings** before it must make port ("the Skiff carries water for three landings"); sailing on costs one leg (about 3 minutes) where going home and back costs two. Unlimited sailing on would make skipping an unwanted find cheaper; going home every time is the silly case Nathan named. Each landing still rolls one find, and leaving a find unfinished loses it.
- **The guarded cache** (step 3) needs islet creatures of its own, found nowhere on the mainland. Nathan, 2026-11-17: the first could be a **siren**, on Taiar's islets or Antura's. Proposed, from island folklore (Orkney's and the sea's):

  | Island | Creature | Level | Guards on | Character | Weak to |
  |---|---|---|---|---|---|
  | Taiar | Siren | 10 | The sea stack and the reef | Sings from the rocks; a fight that starts with the fighter half drawn in | Pierce |
  | Taiar | Trow | 9 | The rocky islet and the drowned quarry | A squat island troll that hoards; hard to hurt | Crush |
  | Taiar | Draugr | 12 | The ruin | A drowned sailor still guarding his cargo | Slash |
  | Antura | Finman | 19 | Its sea stacks and reefs | A sea sorcerer of the old stories | Slash |
  | Antura | Nuckelavee | 24 | Its ruin | The sea-horse demon; the hardest fight on any islet | Pierce |

  A guardian is one fight per find; it drops its own few things, and behind it is the cache.

## 6d. The guardians and the sailor's set (Nathan, 2026-11-17)

Settled:

- **Up to three landings a voyage**, then the boat must make port.
- **A guardian guards what a drowned crew left**, and its only reward is a **locked sea chest** that goes into the pack as an item. Inside, among other things, may be one piece of the sailor's set.
- **Geoffrey opens locked chests for a fee**, as a service with no XP, before or after his quest. The same service opens the Locked Rusty Chests that Fishing and the Wrecker give. If Thieving is ever built, picking them yourself comes with it.
- **The sailor's set fills every slot but the mount:** head, neck, back, chest, main hand, off hand, legs, hands, feet, finger, and trophy, eleven pieces, period-plausible (no spyglass; the Lodestone, Sunstone, and Sounding Lead are its instruments). Names still to settle.
- **Each worn piece takes 1% off a sea journey**, and the whole set adds a bonus of its own (proposed 5%, about 16% in all). The boat stays the main factor.
- **Pieces are spread over the first three islands**, 4, 4, and 3, so the whole set, and its bonus, is finished only on the third island's islets.
- **Everything used for its work wears, and so does this.** Each sea journey wears ONE random worn sailing piece, as combat wears a few random armour pieces a kill (`ARMOUR_PIECES_WORN_PER_KILL`), so eleven pieces never mean eleven rolls a journey. Silent until a break, as all wear is. Never needed to sail, so the circularity rule holds.
- **A cache gives a piece never found until an island's pieces have all been found**; after that it may give any of that island's pieces, so a broken one comes back through guardians or trade. What has been found is a permanent record; the pieces themselves are ordinary items, traded, dropped on death, and worn like any other (the Sunstone sits in the trophy slot, so it is kept on death).

Numbers (simulated 2026-11-17; proposed):

- **Guardians:** about 12% of landings, by the odds in §4 (10% on common islets, 20% on the seldom ones and the ruin).
- **A sea chest holds a new piece 1 in 3 times** (30%). For a player sailing only for pieces, about 12 landings an hour (three-landing voyages of about 15 minutes), an island's four pieces take about 9 hours on average, half of players by 8.5 and nine in ten by 15.5; the whole set about 25 hours across three islands. A player working their finds (about 1.5 landings an hour) gathers them over many weeks without trying.
- **Bad-luck count:** a piece for certain after six sea chests in a row without one, as the rare weapons have theirs (`bad_luck_kills`). It trims the long tail.
- **Wear, by tier as all durability scales:** Taiar's pieces 600 sure wears then 0.25% a wear (about 1,000 on average); Antura's 750 then 0.21%; the third island's 940 then 0.18%. At 32 sea journeys a day, a full set's pieces last most of a year; a player sailing 8 hours a day on four pieces goes through one about a month.

Still open: what the sea chest holds besides a piece (proposed: the island's goods, as the buried chest), what a Locked Rusty Chest holds, Geoffrey's fees, and the set's names.

## 6e. The chests (Nathan, 2026-11-17)

**Built 2026-11-17** (migration `20261117170000_chests_and_sailors_set`): `chest_locks` and Geoffrey's "Can you open a locked chest for me?" at every stage but the quest's accept (`services/chests.ts`: every chest the purse covers, cheapest first, one transaction; race:check `chest`); the Rusty Chest and Sea Chest as containers paying Fishing; their contents below as `open:` rows; Taiar's four pieces (Tarred Hood, Rope-Worker's Gloves, Sea Boots, Sounding Lead), each 1% off a sea leg, the 5% set bonus only with all eleven slots filled; one random worn piece worn each sea journey (600 then 0.25%), a break announced on arrival; the Sea Chest's piece (`services/sailorSet.ts`: never one already found first, certain at the sixth chest); the buried chest find (12 on the common islets, 10 on the seldom, 30 at the ruin); the keepsakes and the From the Islets exhibit; the Knocker's Hammer reworded. Not yet: the guardians, so nothing gives a Locked Sea Chest until step 3.

**Settled:**
- **Geoffrey unlocks a locked chest for a fee and hands back its unlocked twin**: a Locked Rusty Chest becomes a Rusty Chest (the item Fishing's salvage already gives), a Locked Sea Chest a Sea Chest. No XP for the unlocking, before or after his quest. **The player opens it themselves**, a 10-second action that pays Fishing, the same way Bird Nests and River Mussels open (`container_types`, contents as `open:<chest>` rows, migration `20261113100000_containers`). If Thieving is ever built, it would pick the lock in his place.
- **Fees: 25 gold for a rusty chest, 100 for a sea chest** (200 proposed for Antura's).
- **No Tarnished Coin, Chipped Arrowhead, Ambren Tinderbox, Freshwater Pearl, Writ of the Open Door, or Magpie's Ring in any chest**: each belongs where it already comes from (the road, the mussel, the Agropelter and Hodag, the bird's nest), and a tinderbox is no prize.
- **Worked goods are in both chests, and commoner in the Sea Chest than the rusty one.**
- **There is no iron in this world.** The Trow's keepsake is of Ambren. (The Knocker's Hammer, live today, is described as "old black iron": Nathan's to reword.)
- **The buried chest find digs up a Locked Rusty Chest** with a few coins, so there is one rusty chest everywhere.

**Rusty Chest** (a drowned trader's strongbox; several rows can come up at once; proposed):

| Inside | Chance | How many |
|---|---|---|
| Coins | always | 15 to 60 |
| Ambren Nails | 1 in 4 | 10 to 30 |
| Amber | 1 in 5 | 1 to 2 |
| Linen Thread | 1 in 8 | 1 to 3 |
| Ambren Ingot | 1 in 8 | 1 to 2 |
| Lanai Planks | 1 in 8 | 2 to 5 |
| Granite Block | 1 in 8 | 2 to 5 |
| Cooked Whiting | 1 in 10 | 1 to 2 |
| Rough Quartz | 1 in 25 | 1 |
| Fish Pie | 1 in 30 | 1 |
| **Salt-Stained Ledger** (new, its own super rare: a trader's account book, the ink run but the sums still legible; for the museum) | 1 in 1,000 | 1 |

**Sea Chest** (a drowned crew's own chest, from a Taiar guardian only; proposed):

| Inside | Chance | How many |
|---|---|---|
| A piece of the sailor's set | 1 in 3 (never one already found until all of Taiar's four are; certain after six chests without one) | 1 |
| Coins | always | 60 to 200 |
| Ambren Ingot | 1 in 3 | 2 to 5 |
| Lanai Planks | 1 in 3 | 5 to 15 |
| Linen Cloth | 1 in 3 | 1 to 2 |
| Granite Block | 1 in 4 | 5 to 15 |
| Charc | 1 in 4 | 5 to 10 |
| Cooked Conger Eel | 1 in 4 | 2 to 4 |
| Rough Quartz | 1 in 5 | 1 |
| Fish Pie | 1 in 10 | 1 to 2 |
| A Locked Rusty Chest, packed inside | 1 in 10 | 1 |
| Rough Garnet | 1 in 30 | 1 |
| The guardian's keepsake | 1 in 20 | 1 |

**Keepsakes**, one per guardian, from its own chest only, for a "From the Islets" exhibit the ruin's artefacts would join: the **Siren's Comb** (whalebone, with hair still in it), the **Trow's Thimble** (Ambren gone black with age, far too big for any hand), and the **Drowned Captain's Seal** (brass, the ship's name worn off).

**Antura's** pair (proposed names: Locked Serph-Bound Chest and Serph-Bound Chest, 200 gold) follows the same shape with Serph Ingots, Garnet common, Quartz lower, Amethyst rare, and Antura's four set pieces; its numbers wait for Antura's build.

## 6f. The guardians (settled 2026-11-17: the profiles and weights as below)

**Built 2026-11-17** (migration `20261117180000_islet_guardians`): the Trow, Siren, and Draugr as creature rows; a `guardian` kind of fighting spot on each of their islets, shown and opened only for a player whose landing found that cache, ending after one kill (`services/combatFights.ts`); the Locked Sea Chest always, and the guardian's own keepsake 1 in 20, dropped by the guardian itself since every Taiar chest is the same Sea Chest; **the Siren's song** (`creatures.hesitate_pct` 15, `lib/combatFight.ts` settle): a strike sometimes never comes, and the fight log says "The Siren's song stays your hand, and the moment passes." (measured: 15% of strikes, a fight of about 89 s and 47% of health); **falling on an islet** puts the pile at the port the voyage left and ends the voyage. Tested through the fight service: a win paid the chest and spent the cache; a death left the pile in Talador.

Each guards a drowned crew's chest (§6d), so each is a small boss: one fight, much longer than a normal kill, and its only drop is a **Locked Sea Chest**, always. Profiles below are multipliers on the level's baseline creature (`lib/combatMath.ts` `enemyStats`), as every creature row's are; XP per kill is scaled to the fight's length (`creatures.xp_multiplier`), so XP an hour stays on the band and the chest is the reward.

| Guardian | Level | Guards | Accuracy | Defence | Power | HP | Swing | Weak to | Resists | XP multiplier |
|---|---|---|---|---|---|---|---|---|---|---|
| Trow | 9 | the rocky islet, the drowned quarry | 0.9 | 1.25 | 0.9 | 3.0 | 3.6 s | crush | slash | 3 |
| Siren | 10 | the sea stack, the reef | 1.25 | 0.9 | 1.0 | 2.5 | 2.4 s | pierce | crush | 2 |
| Draugr | 12 | the ruin | 1.0 | 1.05 | 1.2 | 3.5 | 3.6 s | slash | pierce | 3 |

Simulated against a one-hand fighter (`combatSim.ts` kits, 3,000 fights each), with its weakness and with the wrong weapon:

| Guardian | Fighter at its level | 3 levels below | 5 above |
|---|---|---|---|
| Trow | 133 s, 33% of health (wrong weapon 166 s, 42%) | 50% (63%) | 17% (22%) |
| Siren | 92 s, 49% (115 s, 61%) | 72% (90%) | 29% (36%) |
| Draugr | 148 s, 54% (185 s, 68%) | 82% (101%: death without food) | 37% (47%) |

For scale, a Hodag at the same level is 49 s and 17%. So a guardian is about three Hodags in one, the Trow the gentlest door in and the Draugr a real fight below its level; the right weapon matters, and food is wanted for the Siren and the Draugr. Health never comes back on its own, which also limits how many guardians one voyage can take on.

**How a fight would work (proposed):**
- A **guarded cache** is an islet find like the rest (10 on the common islets, 20 on the seldom ones and the ruin, by §4), naming its guardian by the islet. The islet shows a fight against that guardian alone, for this player alone.
- **One fight.** The kill pays its XP and the Locked Sea Chest, and the fight ends there with nothing more to come; fleeing, or sailing off, loses the find, as leaving any find does.
- **Falling on an islet** (settled): the dropped things are carried to the port the voyage left, and wait there as a death pile does, private to the player for the usual time; the voyage is over.
- Drops and weaknesses are the Bestiary's to tell, as for every creature.

Still Nathan's: the three profiles; whether the Siren's song should do something of its own (a slower first swing from the fighter, say) or stay plain numbers; and the cache weights.

## 6g. Young, flowers, the ruin's artefacts, and Quank (built 2026-11-17; proposed numbers)

Migration `20261117190000_islet_finds_rest`, `services/isletFinds.ts`. Weights from §4: the common islets young 8, flowers 10, Quank 1; the seldom ones young 15, artefacts 3, Quank 2; the ruin young 15, artefacts 25, Quank 10 (only where the islet's character fits: no flowers on bare rock, no young on the drowned quarry).

- **Young** (`islet_find_items`, by weight): a Chick or two 35, a Calf 30, a Piglet 20, a Rouncey Foal 10, a Palfrey Foal 5. Foals stay the rare ones, as on the hunt.
- **Flowers**: two to five Daisies 35, two to four sprigs of Lavender 30, two or three Taiaria 25. Tal's Hope is left out on purpose: its name breaks the lore rule and is down for the 1.0 reset.
- **The ruin's artefacts**, Taiar's set of five for the From the Islets exhibit: the Carved Lintel Stone, the Weathered Figurine, the Cracked Clay Lamp, the Ambren Door Key, and the String of Sea-Glass Beads. One never found first, then any (`player_artefacts_found`).
- **Quank**, once on Taiar's islets and never again there (`player_quank_met`): his scene in four lines, in which he gives the player a **Tidbit**, half a Tiddle (the back half), a keepsake for the From the Islets exhibit, and is gone. **No rumour** (Nathan, 2026-11-17: telling true things is Wenna's, and it takes the player out of the moment). No power. Not yet: his feat, a Chronicle line (a new deed kind needs ten verses), and the quiet count for bad luck.

## 6a. Quank

He leaves Talador's square at the end of his tutorial ("Do not come looking. There will be nothing to look at."), so finding him on an islet is finding where he went. Proposed, so that he stays a mystery and never becomes a shop:

- **He is found once on each island's islets and never there again** (Nathan, 2026-11-15). After a player meets him among Taiar's islets he is gone from Taiar's rolls for that player; Antura's islets hold their own meeting. So each island's Quank is one written scene, not a line from a pool, and each time he is doing something that explains nothing. Since it can happen only once, a long run of bad luck should not hide him for ever: proposed, the same kind of quiet count the rare weapons have.
- **He leaves a tidbit** (Nathan, 2026-11-17): half a Tiddle, in place of the true thing first proposed, which is Wenna's to tell.
- **The sighting is counted.** A feat for each island's Quank, and a line for the Chronicle. Players will compare how many islands they have found him on.
- **No power from him.** No buff, no loot. He gave the pony once.
- He insists he has not left the square.

## 6b. Words

Nathan wants a great deal of flavour text here (2026-11-15). All of it is content rows, several ways of saying each thing so a sailor does not read the same line twice in an evening: each islet's arrival, each find's discovery and its last action, the strandline's finds, the watches of the ship's log, every Quank line, and the line for coming home with nothing. Written from inside the world, under CLAUDE.md §10.

## 7. What it would take to build

Rows, mostly: islets as places in the island's region with no roads; a table of what each islet can hold and how often; a table of each find's amount and boost. New code: the voyage that picks an islet, the landing that rolls and remembers a player's find, and the boost applied where each skill already rolls its extras (`rollSecondaryDrops` and the skills' own find rolls). No skill's own rules change.
