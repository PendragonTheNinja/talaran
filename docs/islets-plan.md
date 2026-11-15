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

Mock odds of reaching each: the five common islets 16% each (80%), the two seldom ones 8% each (16%), the ruin 4%. Names are Nathan's to give.

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

## 6a. Quank

He leaves Talador's square at the end of his tutorial ("Do not come looking. There will be nothing to look at."), so finding him on an islet is finding where he went. Proposed, so that he stays a mystery and never becomes a shop:

- **He is found once on each island's islets and never there again** (Nathan, 2026-11-15). After a player meets him among Taiar's islets he is gone from Taiar's rolls for that player; Antura's islets hold their own meeting. So each island's Quank is one written scene, not a line from a pool, and each time he is doing something that explains nothing. Since it can happen only once, a long run of bad luck should not hide him for ever: proposed, the same kind of quiet count the rare weapons have.
- **He tells one true thing.** A rumour of the kind the tavern already keeps (`services/chronicleRumours.ts`): something real that nobody has done yet. It never tells what the Bestiary or the museum keeps back.
- **The sighting is counted.** A feat for each island's Quank, and a line for the Chronicle. Players will compare how many islands they have found him on.
- **No power from him.** No buff, no loot. He gave the pony once.
- He insists he has not left the square.

## 6b. Words

Nathan wants a great deal of flavour text here (2026-11-15). All of it is content rows, several ways of saying each thing so a sailor does not read the same line twice in an evening: each islet's arrival, each find's discovery and its last action, the strandline's finds, the watches of the ship's log, every Quank line, and the line for coming home with nothing. Written from inside the world, under CLAUDE.md §10.

## 7. What it would take to build

Rows, mostly: islets as places in the island's region with no roads; a table of what each islet can hold and how often; a table of each find's amount and boost. New code: the voyage that picks an islet, the landing that rolls and remembers a player's find, and the boost applied where each skill already rolls its extras (`rollSecondaryDrops` and the skills' own find rolls). No skill's own rules change.
