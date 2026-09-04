# Cooking: Outline and Recipe List

Every ingredient verified live. Every dish level derived from the real source level of its main ingredient. Nothing exceeds Cooking 18, because the highest-level ingredient on Taiar is 17.

---

## 1. Ingredient source levels

This table is the spine of the whole design. A dish sits at or just above its highest ingredient.

| Level | Ingredients |
|---|---|
| 1 | Tiddle, Whiting, Rabbit Meat, Pheasant Meat, Chicken Meat, Venison, Egg, Carrot, Onion, Chamomile, Dandelion, Wild Thyme, Lavender, Wild Grain |
| 2 | Brook Dace, Black Bream, Turnip |
| 3 | Perch, Dawn Sprat |
| 4 | Burbot, Garfish, Chanterelle Mushroom, Garlic, Fiddlehead Ferns, Hazelnuts, Morel Mushroom, Witch's Butter |
| 5 | Chalkarp, John Dory, Grain (so Flour), Honey and Beeswax |
| 6 | Gurnard, Conger Eel |
| 7 | Pike, Duskfin, Peas, Watercress, Wild Mint, Meadowsweet |
| 8 | Frostgill, Wolffish |
| 9 | Stormer, Sabreling, Beef, Milk (so Butter and Cheese), Boar Meat |
| 10 | Strawberry, Blackberries, Rosehips, Elderberry, Stinging Nettle |
| 12 | Raspberry |
| 17 | Pork, Truffle, Sloth Meat |

Deer is Hunting 1, so **Venison is an early ingredient**. Cow is Husbandry 9, so **all dairy is mid-tier** and no dish using butter, milk or cheese can sit below 9. That single fact shapes the whole ladder.

**Garlic needs a crop row before this ships.** Garlic Cloves forage out of Forest Floor at 4 and are meant to plant into Garlic, but the crops table holds only Carrot, Onion, Turnip, Grain, Peas, Flax, Strawberry and Raspberry. The `Garlic` item exists with nothing producing it. A crop row at plant level 4 sits between Turnip at 2 and Grain at 5 and matches where the cloves forage. Eight recipes below depend on it.

---

## 2. Beekeeping

**Weave Skep** (Crafting) from Straw. A domed basket of coiled straw, which is what medieval keepers used.

**Wild hive**, a rare Woodcutting drop, and the only source of bees. Two outcomes:

- **Carrying a skep:** the colony transfers. Skep consumed, Skep of Bees produced.
- **No skep:** you rob the nest for a single Honeycomb, the same item the apiary produces, and the colony is lost. Flavour hints at returning with a skep.

No swarms, no elder stage, no slaughter. Every new hive comes from Woodcutting, so the drop rate is the real economic control on honey supply for the life of the game. It should be genuinely rare.

### Species row

| Field | Value |
|---|---|
| pen_type | `apiary` |
| husbandry_level | 5 |
| feed | none |
| product | Honeycomb, every 4 hours, 100% |
| xp_product | 260 |
| spring and summer | 100% |
| autumn | 67% |
| winter | 33% |

Production never reaches zero. Winter is lean, not dead, so no recipe becomes unmakeable for three months.

`pen_type` is a `string(12)` already carrying coop and paddock, so `apiary` is a value rather than a migration. Needed: `apiary_slots` on `player_properties`, and `feed_item_name` made nullable.

**Suggested capacity: 3 hives at property tier 1.** One hive gives roughly 6 combs a day, which covers personal cooking. Three supplies a small trade. Since bees never reproduce in-game, capacity is a soft cap on ambition rather than a real limit, and the Woodcutting drop is doing the actual gating.

### Press Honeycomb

> **Press Honeycomb** (Cooking, level 5) → Honey + Beeswax

**Honey is a plain stackable item, not a liquid.** Butter and Cheese are the precedent: both come from a liquid and are themselves ordinary items.

**On how honey should read:** crushed comb, strained, and stored in a small sealed crock. The item name stays `Honey` for consistency with Butter and Cheese, and the icon carries the fiction, a squat clay pot with a waxed cloth lid. The description should mention pressing and straining, so it is clear this is honey separated from wax rather than comb in a jar.

Beeswax needs Crafting or Carpentry consumers in the same patch. Candles, waterproofed cloth, bowstring wax, sealed jars. Without them it is a second Acorn Flour.

---

## 3. Where cooking happens

**Cookhouse at Phoenwick**, a workstation with tools.

| Tool | Used for |
|---|---|
| Hearth | The station itself. Roasting and baking. |
| Cauldron | Pottages, broths, stews, anything boiled |
| Skillet | Frying, omelettes, quick fish |
| Cooking knife | Prep for any composite dish |
| Meat cleaver | Jointing carcasses |
| Ladle | Serving from the cauldron |
| Flesh hook | Lifting meat from the cauldron |
| Mortar and pestle | Herbs and spices. Gates the infusions. |

**Campfire anywhere** handles the direct raw-to-cooked recipes only. No composites, no infusions. That keeps a fishing trip self-sufficient without making the cookhouse pointless.

---

## 4. Heal ladder and burning

Flat healing. Anchored to combat, where max HP is 100 at Constitution 1 and about 250 at Constitution 24, the top of alpha.

Direct-cooked singles sit low, roughly `8 + 2.5 x source level`. Composites heal two to three times their constituent parts, so one dish replaces a handful of fish and takes one slot.

**Burning** produces a burnt variant by dish family: Burnt Fish, Burnt Meat, Burnt Pastry, Burnt Pottage. Burning pays **half XP**.

### The burn model

Tune against **expected material loss per action**, not burn chance. A fish is one ingredient; a Game Pie is five, drawn from four skills. Equal burn rates make the pie five times the punishment for the same mistake.

Two fields on the recipe row, so a dish that feels bad can be tuned without touching a formula:

- `burn_base`, the chance at exactly the recipe's level
- `burn_stop`, the level where it bottoms out at 1%

Linear between the two. `burn_stop` is a level rather than a curve because it is **displayable**: the manual can show "burns until level 27" per recipe, which is the most useful thing a cook can know.

`burn_base` follows ingredient count at roughly `30% / sqrt(count)`:

| Ingredients | Example | burn_base |
|---|---|---|
| 1 | Cooked Perch | 30% |
| 2 | Flatbread | 21% |
| 3 | Root Pottage | 17% |
| 4 | Coney Stew | 15% |
| 5 | Game Pie | 13% |

A straight `30% / count` would leave five-ingredient pies nearly burn-free and lose the tension entirely. The square root drops fast enough to matter while keeping real risk on expensive dishes.

`burn_stop` sits at recipe level **+20** for direct cooking and **+12** for composites, which clear faster because they arrive later and cost more. **Infusions do not burn**, since steeping herbs in milk is not something you scorch.

At these numbers, cooking at your own level burns about one fish in three or one pie in seven, and both are effectively safe fifteen to twenty levels later.

**This matters for the XP maths.** Because burning pays half, expected XP per action is below the listed value. Recipe XP must be set so that *expected* output hits the band, not the clean-cook value, or Cooking silently underpays at every level. The correction is roughly `xp = band x timer / 3600 / (1 - burnRate/2)`.

Cooking should pay well per hour. It carries burn risk, and a composite needs several ingredients from several skills. Cooking only base ingredients stays viable and slower, which is the intended floor.

---

## 5. Direct cooking (26 recipes)

Level follows the ingredient's own source level.

| Input | Output | Level | Heal |
|---|---|---|---|
| Tiddle | Cooked Tiddle | 1 | 10 |
| Whiting | Cooked Whiting | 1 | 10 |
| Rabbit Meat | Roast Rabbit | 1 | 10 |
| Chicken Meat | Roast Chicken | 1 | 11 |
| Pheasant Meat | Roast Pheasant | 1 | 11 |
| Venison | Roast Venison | 1 | 12 |
| Brook Dace | Cooked Brook Dace | 2 | 13 |
| Black Bream | Cooked Black Bream | 2 | 13 |
| Perch | Cooked Perch | 3 | 15 |
| Dawn Sprat | Cooked Dawn Sprat | 3 | 15 |
| Burbot | Cooked Burbot | 4 | 18 |
| Garfish | Cooked Garfish | 4 | 18 |
| Chalkarp | Cooked Chalkarp | 5 | 20 |
| John Dory | Cooked John Dory | 5 | 20 |
| Gurnard | Cooked Gurnard | 6 | 23 |
| Conger Eel | Cooked Conger Eel | 6 | 23 |
| Pike | Cooked Pike | 7 | 25 |
| Duskfin | Cooked Duskfin | 7 | 25 |
| Frostgill | Cooked Frostgill | 8 | 28 |
| Wolffish | Cooked Wolffish | 8 | 28 |
| Stormer | Cooked Stormer | 9 | 30 |
| Sabreling | Cooked Sabreling | 9 | 30 |
| Beef | Roast Beef | 9 | 31 |
| Boar Meat | Roast Boar | 9 | 31 |
| Pork | Roast Pork | 17 | 46 |
| Sloth Meat | Roast Sloth | 17 | 46 |

The gap between 9 and 17 is real and reflects the content. Second-island fish and meat fill it.

---

## 6. Composite dishes

### Early, no dairy (levels 3 to 8)

| Dish | Ingredients | Level | Heal |
|---|---|---|---|
| Root Pottage | Carrot, Turnip, Onion | 3 | 26 |
| Coney Stew | Rabbit Meat, Carrot, Onion, Wild Thyme | 4 | 32 |
| Fern and Garlic Fry | Fiddlehead Ferns x2, Garlic | 5 | 34 |
| Mushroom Pottage | Chanterelle Mushroom x2, Onion, Wild Thyme | 6 | 38 |
| Venison and Root Stew | Venison, Turnip, Carrot, Garlic | 6 | 40 |
| Flatbread | Flour x2 | 6 | 28 |
| Oatcake | Flour, Wild Grain | 7 | 32 |
| Watercress Broth | Watercress x2, Onion, Wild Grain | 8 | 44 |

### Dairy and flour (levels 9 to 13)

| Dish | Ingredients | Level | Heal |
|---|---|---|---|
| Buttered Eggs | Egg x2, Butter | 9 | 46 |
| Fish Stew | Cooked fish x2, Carrot, Onion, Garlic | 10 | 52 |
| Cottage Loaf | Flour x3, Bucket of Milk | 10 | 54 |
| Beef and Root Stew | Beef, Turnip, Carrot, Garlic | 10 | 56 |
| Herb Bannock | Flour x2, Wild Thyme, Butter | 11 | 58 |
| Mussel Chowder | River Mussel x3, Bucket of Milk, Onion, Butter | 11 | 60 |
| Nettle Broth | Stinging Nettle x2, Onion, Wild Grain, Butter | 11 | 58 |
| Hazelnut Loaf | Flour x3, Hazelnuts x2, Butter | 12 | 62 |
| Onion Pasty | Flour x2, Onion x2, Butter | 12 | 64 |
| Morel Omelette | Egg x3, Morel Mushroom x2, Butter | 12 | 66 |
| Honey Cake | Flour x2, Honey, Egg, Butter | 12 | 66 |
| Poacher's Pie | Flour x2, Rabbit Meat, Pheasant Meat, Onion | 13 | 68 |
| Curd Tart | Flour x2, Cheese, Egg | 13 | 68 |
| Cheese and Onion Pasty | Flour x2, Cheese, Onion, Butter | 13 | 70 |

### Berries, honey and top tier (levels 12 to 18)

| Dish | Ingredients | Level | Heal |
|---|---|---|---|
| Rosehip Syrup | Rosehips x3, Honey | 12 | 60 |
| Bramble Conserve | Blackberries x3, Honey | 12 | 62 |
| Elderberry Cordial | Elderberry x3, Honey, Bucket of Milk | 13 | 70 |
| Strawberry Tart | Flour x2, Strawberry x3, Honey, Butter | 14 | 76 |
| Fish Pie | Flour x2, Cooked fish x2, Bucket of Milk, Butter | 14 | 78 |
| Raspberry Tart | Flour x2, Raspberry x3, Honey, Butter | 15 | 82 |
| Lavender Honey Cake | Flour x2, Honey x2, Lavender, Egg, Butter | 15 | 82 |
| Honey Glazed Boar | Boar Meat, Honey, Garlic, Butter | 15 | 84 |
| Cheese Twist | Flour x2, Cheese, Egg, Butter | 16 | 86 |
| Witch's Butter Confit | Witch's Butter x2, Honey, Butter | 16 | 84 |
| Truffled Eggs | Egg x2, Truffle, Butter | 18 | 94 |
| Garlic Roast Pork | Pork, Garlic x2, Butter | 18 | 96 |
| Truffle and Egg Pie | Flour x2, Truffle, Egg x2, Butter | 18 | 98 |
| Game Pie | Flour x3, Sloth Meat, Boar Meat, Onion, Butter | 18 | 100 |

---

## 7. Buff dishes

One active at a time, small benefits, low heal. Each takes a finished dish as an input, which gives mid-tier recipes a second life and makes buffs genuinely expensive.

| Dish | Ingredients | Level | Buff |
|---|---|---|---|
| Ploughman's Lunch | Cottage Loaf, Cheese, Onion | 12 | Farming |
| Woodsman's Bannock | Herb Bannock, Butter, Hazelnuts | 13 | Woodcutting |
| Miner's Pasty | Onion Pasty, Cheese, Wild Thyme | 14 | Mining |
| Fisherman's Stew | Fish Stew, Watercress, Butter | 14 | Fishing |
| Wayfarer's Cake | Honey Cake, Hazelnuts, Wild Mint | 15 | Agility |
| Drover's Pottage | Cottage Loaf, Cheese, Garlic | 15 | Husbandry |
| Hedgerow Basket | Blackberries, Hazelnuts, Chanterelle Mushroom, Honey | 16 | Foraging |
| Poacher's Supper | Poacher's Pie, Wild Mint | 16 | Hunting |
| Smith's Supper | Roast Beef, Cottage Loaf, Garlic | 17 | Smithing |
| Wright's Loaf | Hazelnut Loaf, Cheese, Butter | 17 | Carpentry |

### Herbal infusions

Cheap, short, weak. The entry point to buffs and the only real use for the medicinal herbs. Gated on the mortar and pestle.

| Drink | Ingredients | Level | Effect |
|---|---|---|---|
| Chamomile Tisane | Chamomile x2 | 2 | Small out-of-combat regen |
| Mint Tisane | Wild Mint x2 | 8 | Small travel bonus |
| Meadowsweet Draught | Meadowsweet x2, Bucket of Milk | 10 | Small all-skill timer reduction |
| Dandelion Cordial | Dandelion x3, Honey | 11 | Small Foraging bonus |
| Lavender Tisane | Lavender x2, Honey | 12 | Small Constitution bonus |

---

## 8. Press Cheese and Churn Butter

Both currently pay Husbandry. **I would not move them.** Changing the skill retroactively rewrites what existing players earned, and dairying at a byre is fairly Husbandry work.

Instead follow the cut bait precedent and have them pay a **small secondary Cooking XP** alongside the Husbandry XP. Non-breaking, gives Cooking an early trickle before the cookhouse matters, and reinforces that dairy is where the two skills meet.

---

## 9. Counts

| Class | Recipes |
|---|---|
| Direct cooking | 26 |
| Composites, early | 8 |
| Composites, dairy and flour | 14 |
| Composites, top tier | 14 |
| Buff dishes | 10 |
| Infusions | 5 |
| Press Honeycomb | 1 |
| **Total** | **78** |

All within Cooking 1 to 18. Second-island ingredients extend the ladder rather than squeezing into these recipes.

---

## 10. Open questions

1. **Butchery as its own step?** If a cleaver and butcher knife are both tools, raw carcasses jointing into cuts would justify them. That is a bigger idea than Cooking and could be its own thing.
2. **Does burn chance scale off recipe level or ingredient rarity?** Burning a Truffle and Egg Pie should sting more than burning a Tiddle.
3. **Beeswax consumers** need to ship alongside bees, or it is a second Acorn Flour.
4. **The 9 to 17 ingredient gap** leaves a thin stretch of direct-cook recipes in the mid teens. Composites cover it, but a mid-tier meat or fish would help.
5. **Garlic crop row** has to land before or with this patch, or six recipes have no garlic.
