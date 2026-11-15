# Foraging and Farming: the ladder from tier 2 to tier 9

*Drafted with Nathan, 2026-11-15. **Tier 2 is locked.** Tiers 3 to 9 are placeholders to react to: the real lists wait on what kind of land each later island is. Levels are proposals throughout.*

Why this exists: Taiar's foraging grew to 32 finds in ten levels, most of them used once. Every later tier is deliberately leaner, and this is the plan that keeps it so.

---

## 1. What Taiar's lists are used for (live content, 2026-11-10)

**Foraging, 32 finds in levels 1 to 10:**

- 9 are seeds, one per crop. All earn their place.
- 17 are cooking ingredients. 9 of those appear in exactly one recipe (Chamomile, Dandelion, Fiddlehead Ferns, Morel Mushroom, Witch's Butter, Meadowsweet, Rosehips, Stinging Nettle, Elderberry). Only Wild Thyme, Hazelnuts, Wild Mint, and Wild Grain appear in three or more.
- Reeds go into one recipe (the Foraging Basket). Frogspawn is bait.
- 5 rare finds have no use at all: Faelight Bloom, Ghost Pipe, Wisp Cap, Blackthorn Sprig, Hedgewitch's Sprig.

**Farming, 9 crops:** Onion (12 recipes), Garlic (8), and Carrot (5) carry Cooking. Wild Grain carries everything else: flour is in 17 recipes and every animal eats grain. Turnip (3), Strawberry (1), and Raspberry (1) are thin. **Peas are in no recipe**; they exist to restore soil and can be eaten raw.

---

## 2. The rules

### Recipes (locked, Nathan 2026-11-15; also in CLAUDE.md §2 Recipes)

A higher-tier recipe may use older forage, crops, meat, or anything else, as long as **at least one ingredient is of the recipe's own tier**. Old ingredients stay in demand, and a new tier needs only a few new ones.

### Foraging

Foraging does three jobs. A tier gets only what those jobs need.

1. **Seeds** for that tier's crops. This is the main reason to forage.
2. **Wild staples** that cannot be farmed: two a tier by default. Each must go into at least three recipes of its tier, or it does not ship.
3. **Rare finds:** at most one a tier, and none for now. The five unused Taiar rares get a use first, which also sends high-level players back to the first island.

**Two habitats a tier** (Nathan: two to three at most per level gate, and they may sit at different places): a **seed ground** and a **wild ground**. A habitat is a row at any location; it need not be woodland.

More than the default is allowed where there is a good reason for the variety (Nathan). The reason is written beside the item.

### Farming

Each tier has four jobs, and each job has a use that never runs out:

| Job | Why it always has a use |
|---|---|
| Grain | Flour or ale, and feed for animals |
| Vegetable | The base of that tier's dishes |
| Working crop | A legume to restore soil, or a fibre for cloth and rope |
| Perennial | A fruit for sweets, drinks, and buff dishes |

Four crops a tier by default, one per job. More than one per job is fine with a good reason (Nathan); tier 2 has six.

- **One Flour** (Nathan). No barley flour, rye flour, or wheat flour. Each tier's grain stays **its own item** (so it can be brewed, cooked as itself, fed to animals, and counted as a dish's new-tier ingredient) and can also be milled into ordinary Flour at a better rate than Wild Grain. Today 2 Grain makes 1 Flour; Barley might be 3 for 2.
- **Old World crops by default**; New World crops (maize, squash, peppers) are allowed where a tier wants them. It is not our world's history (Nathan).

### What animals eat (locked in principle, not built)

Any real creature may eat whatever it really would (Nathan). This also changes tier 1 and 2 husbandry.

| Animal | Would eat |
|---|---|
| Chicken | Grain, barley, peas, cabbage |
| Cow | Grain, barley, turnip, beet |
| Pig | Grain, barley, turnip, beet, peas, beans, cabbage, hazelnuts |
| Horses | Grain, barley, carrot, beans |

- Every valid feed counts the same. Only the amount differs, by how filling it is.
- Feeding by hand, **the player picks** the feed.
- **Larder Ward draws from the farmstead's storage**, valid feeds in a fixed order, cheapest first (Nathan, 2026-11-15), so a ward never lapses while usable feed is there.
- The code change: a species has exactly one feed today (`animal_species.feed_item_name` and `feed_qty`), read in about eight places in `services/husbandry.ts`. It needs a feed table (species, item, amount) and the choice at the trough.

### Salt (locked, Nathan 2026-11-15)

Salt helps the cook, not the dish. It is **optional**: a pinch added when cooking starts uses one salt and gives that batch **a small chance of doubling the dish**. The dish is the same item either way, so stacks never split. Salt as a named ingredient is kept for a few preserved foods (salt fish, cured meat). Putting salt in most recipes was rejected: it would make Foraging a toll on all Cooking, the shape of the feather shortage. The chance itself is still to be set, and checked against how much salt an hour of foraging brings in.

---

## 3. Tier 2 (locked)

Island 2. Farming and Foraging 13 to 24.

### Crops

| Crop | Level | Job | Why |
|---|---|---|---|
| Barley | 13 | Grain | Ale, pot barley, and better feed; mills to Flour at a better rate |
| Cabbage | 15 | Vegetable | Dishes; chickens and pigs eat it |
| Leek | 17 | Vegetable | Dishes |
| Beet | 19 | Root | Dishes, and fodder for cattle and pigs (the reason for a second vegetable) |
| Broad bean | 21 | Legume | Restores soil; pottage; feed for pigs and horses |
| Gooseberry | 23 | Perennial | Tarts, and the sauce for oily sea fish, which ties it to the new saltwater catch |

Cabbage and beet descend from real shore plants (wild cabbage, sea beet), which is why a coastal island is where their seeds are found.

### Foraging

| Habitat | Place | Level | Finds |
|---|---|---|---|
| Seed ground | Farefield, the field margins | 13 | The six seeds and cuttings above, nothing else |
| Wild ground | Farvick Narrows, the tidal shore | 19 | Sea salt, samphire |

- **Sea salt:** scraped from dried rock pools. See Salt, above.
- **Samphire:** the green to cook with the new fish.
- **Rejected: wrack (seaweed).** Its case was dressing fields, and farming already has manure from mucking out.
- **Only if ale is made from the barley:** a bittering herb such as bog myrtle, which is what ale used before hops.
- **Possible later:** a habitat that opens only at low tide on the game clock, as some fish bite only at certain hours. It needs a time window on habitats; everything else here is rows.

### Still to decide for tier 2

- A pease pottage, so Peas have a recipe. Under the recipe rule it can be a tier 2 dish (old peas, new salt).
- Whether ale is in.
- The dishes each staple feeds: each needs three.

---

## 4. Tiers 3 to 9 (placeholders)

### Crops

| Tier | Levels | Grain | Vegetable | Working crop | Perennial |
|---|---|---|---|---|---|
| T3 | 25 to 36 | Rye | Parsnip | Hemp (rope, sailcloth) | Apple |
| T4 | 37 to 49 | Wheat | Kale | Lentil (legume) | Hops |
| T5 | 50 to 61 | Millet | Squash | Chickpea (legume) | Grape |
| T6 | 62 to 74 | Rice | Aubergine | Cotton (fine cloth) | Olive |
| T7 | 75 to 86 | Maize | Pepper (the fruit) | Sesame | Citrus |
| T8 | 87 to 99 | Sorghum | Okra | Sugarcane | Date |
| T9 | 100 | One legendary crop | | | |

- Beet was first drafted at T3 and moved to T2; Parsnip takes its place and Kale takes Parsnip's.
- Hemp at T3 gives the larger vessels the rope and canvas `docs/sailing-spec.md` says they will need.
- Each tier's grain is among the feeds of that tier's animals (buffalo at 25, aurochs at 50).

### Wild staples

The staples climb the real spice trade: the further you sail, the more precious the plant.

| Tier | Levels | Staples |
|---|---|---|
| T3 | 25 to 36 | Juniper, a woodland mushroom |
| T4 | 37 to 49 | Bay, chestnuts |
| T5 | 50 to 61 | Saffron, capers |
| T6 | 62 to 74 | Pepper, ginger |
| T7 | 75 to 86 | Cinnamon, vanilla |
| T8 | 87 to 99 | Cloves, cardamom |
| T9 | 100 | One find, legendary |

About three non-seed finds a tier, so roughly 24 for levels 13 to 100, against Taiar's 23 for levels 1 to 10.
