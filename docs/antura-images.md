# Antura: every image it needs

*Compiled 2026-11-19 from `docs/antura-plan.md`, `docs/foraging-farming-ladder.md`, `docs/islets-plan.md`, `docs/talar-spec.md`, and the content on branch `ccr-bcfdecf4-g7j169`. Serph ore, ingots, and every smithed Serph item are left out (Nathan has made them), and so is the Taiar combat drop pass (shipped with its icons).*

Descriptions are drafts for the art and for the item rows when they are built. Most of Antura is designed, not built, so a name may still change; where a name is not settled yet, the entry says so. File names follow `getItemIcon` (spaces to underscores, apostrophes dropped).

- Item icons: `apps/client/public/images/items/<Name>.png`
- Creature portraits: `apps/client/public/images/bestiary/<Name>.png`, 256×256, transparent
- Place pictures: `apps/client/public/images/locations/<island folder>/<Place>.jpg`, 256×256. Antura's want a folder of their own (`Antura/`); the code reads `Taiar_Island/` only today (`MiniMap.tsx`, `docs/antura-plan.md` §14), which changes when Antura's places are built.

---

## 1. Built already, on the branch (29)

### Item icons (18)

| File | Item | Description |
|---|---|---|
| `Nettle_Cordage.png` | Nettle Cordage | Nettle stems retted, stripped, and twisted into a hard brown cord. It does not rot in salt water, which is the whole point of it. |
| `Locked_Sea_Chest.png` | Locked Sea Chest | A sailor's sea chest, salt-white and swollen shut, its lock furred green. Whatever is inside, the crew meant to keep it. |
| `Sea_Chest.png` | Sea Chest | A sea chest with its lock picked. The lid still sticks, but it will open. |
| `Tarred_Hood.png` | Tarred Hood | A hood of sailcloth, painted with tar until it is stiff as a bucket. Rain runs off it and so does spray. |
| `Rope-Workers_Gloves.png` | Rope-Worker's Gloves | Leather gloves gone hard at the palms from years of hauling wet line. They grip a rope the way a bare hand never does. |
| `Sea_Boots.png` | Sea Boots | Tall boots of greased hide that lace above the knee. They keep the bilge out, mostly. |
| `Sounding_Lead.png` | Sounding Lead | A lead weight on a marked line, hollow at the bottom and packed with tallow, to bring up the sea floor and tell you what lies under the keel. |
| `Trows_Thimble.png` | Trow's Thimble | A thimble of Ambren gone black with age, far too big for any hand you have seen. |
| `Sirens_Comb.png` | Siren's Comb | A comb cut from whalebone, the teeth worn smooth, with long pale hair still caught in it. |
| `Drowned_Captains_Seal.png` | Drowned Captain's Seal | An Ambren seal on a short chain. The ship's name was cut into it once; the sea has worn it off. |
| `Salt-Stained_Ledger.png` | Salt-Stained Ledger | A trader's account book, swollen with seawater. The ink has run, but the sums are still legible, and they do not add up. |
| `Tidbit.png` | Tidbit | Half a Tiddle, the back half. Quank gave it to you as if it were the most natural thing in the world. You did not ask what happened to the front. |
| `Carved_Lintel_Stone.png` | Carved Lintel Stone | A stone from over a doorway, cut with marks in rows. They are not letters anyone on the island can read, and they are too careful to be nothing. |
| `Weathered_Figurine.png` | Weathered Figurine | A small stone figure of someone standing with a hand raised to their eyes, looking out to sea. The face has worn away. |
| `Cracked_Clay_Lamp.png` | Cracked Clay Lamp | An oil lamp of red clay with soot still in the spout. Somebody kept a light burning in the ruin, once, every night. |
| `Ambren_Door_Key.png` | Ambren Door Key | A heavy key of Ambren, green with age. The ruin has no doors left for it to open. |
| `String_of_Sea-Glass_Beads.png` | String of Sea-Glass Beads | Beads of green and blue glass on a rotten cord. Glass like this was not made on Taiar. |
| `Fathom_Scale.png` | Fathom Scale | A scale wider than your hand, the colour of deep water and hard as horn. Whatever shed it was big enough to lift a boat without noticing. |

### Creature portraits (3): Taiar's islet guardians

| File | Description |
|---|---|
| `Trow.png` | Squat, grey, and lumpy as the rocks it sits among, with long arms and a short temper. It sits on a hoard of other people's things: oars, net floats, a sea chest. |
| `Siren.png` | She sits on the rocks with her hair over her shoulders and sings. The song is lovely. The rocks are covered in wrecked boats. |
| `Draugr.png` | A drowned sailor who never stopped standing his watch. Weed in his beard, salt on his coat, water running out of his sleeves, and his cargo still under his feet. |

### Place pictures (8): Taiar's islets, in `Taiar_Island/`

| File | Description |
|---|---|
| `The_Wooded_Islet.jpg` | A hump of black rock with a wood on its back, the trees leaning all one way from the wind. The landing is a shelf of shingle no wider than the Skiff. |
| `The_Rocky_Islet.jpg` | Grey stone heaved up out of the sea in slabs, split and tilted, with thrift in the cracks. The gulls own it. |
| `The_Sandbar.jpg` | A long tongue of pale sand that comes and goes with the tide. At low water it is half a mile long; at high water it is barely there. |
| `The_Reef.jpg` | A ring of rock just under the surface, with a lagoon inside it as still as a pond. Fish crowd the gaps in the ring. |
| `The_Heath_Islet.jpg` | Low and round, covered in heather and gorse, with a pond in the middle that the birds drink from. Rabbits have dug it hollow. |
| `The_Sea_Stack.jpg` | A pillar of rock standing alone out of deep water, every ledge white with birds. Getting ashore means climbing. |
| `The_Drowned_Quarry.jpg` | Somebody cut stone here once, and the sea came in after them. Square-sided pools, a crane rotted down to its pegs, and steps that go down into the water. |
| `The_Ruin.jpg` | Walls of dressed stone with nothing above them, a doorway facing the sea, and a stair going nowhere. No one on Taiar will say who built it. |

---

## 2. Antura, designed and named (87)

### Farming: seeds and crops (12)

| File | Item | Description |
|---|---|---|
| `Barley_Seeds.png` | Barley Seeds | Pale, pointed grains with the husk still on, kept back from last year's sheaves to sow. |
| `Barley.png` | Barley | Bearded ears of barley, heavy and bowed. Brewers want it, cooks want it, and so do the animals. |
| `Cabbage_Seeds.png` | Cabbage Seeds | Tiny round seeds, dark as peppercorns. Their grandparents grew wild on the sea cliffs. |
| `Cabbage.png` | Cabbage | A tight green head of cabbage, the outer leaves nibbled. Whatever did the nibbling did not stay for the rest. |
| `Leek_Seeds.png` | Leek Seeds | Small black seeds, flat on one side, that look like nothing much. |
| `Leek.png` | Leek | A long leek, white at the root and dark green at the top, with earth still in the folds. |
| `Beet_Seeds.png` | Beet Seeds | Knobbly brown seed clusters, each one several seeds stuck together, as if they could not bear to be apart. |
| `Beet.png` | Beet | A round red beet with its leaves still on. It stains everything it touches, hands included. |
| `Broad_Bean_Seeds.png` | Broad Bean Seeds | Big flat dried beans, brown and wrinkled, saved for sowing. |
| `Broad_Beans.png` | Broad Beans | A handful of fat green pods, each holding beans in a bed of white fur. |
| `Gooseberry_Cutting.png` | Gooseberry Cutting | A thorny stick a hand long, cut from a gooseberry bush in winter. Push it in the ground and leave it alone. |
| `Gooseberry.png` | Gooseberry | A pale green berry, striped and a little hairy, sharp enough to make you wince. |

### Foraging (2)

| File | Item | Description |
|---|---|---|
| `Sea_Salt.png` | Sea Salt | Grey flakes scraped from a rock pool the sun has dried. A pinch goes a long way. |
| `Samphire.png` | Samphire | Bright green fleshy stems from the salt marsh, crisp and salty, like the sea in a mouthful. |

### Fishing: raw fish (7) and the rod (1)

| File | Item | Description |
|---|---|---|
| `Tench.png` | Tench | A thick olive-green lake fish, slimy as a wet stone, with small red eyes. It lives in the mud and likes it there. |
| `Rudd.png` | Rudd | A golden lake fish with bright red fins. It feeds near the top and spooks at a shadow. |
| `Zander.png` | Zander | A long grey hunter of the lake with glassy eyes and a row of teeth. It sees well in murky water, which is how it catches everything else. |
| `Mackerel.png` | Mackerel | A sleek fish with tiger stripes of green and blue down its back. Oily, quick, and best eaten the day it is caught. |
| `Pollock.png` | Pollock | A bronze-green fish of the strait, long-jawed, with a dark line down each side. |
| `Sea_Bass.png` | Sea Bass | A silver fish with a spiny back fin, strong enough to bend a rod double. The fishermen of the strait boast about these. |
| `Turbot.png` | Turbot | A broad flat fish, round as a shield, both eyes on one side and freckled to match the sand. |
| `Serph_Fishing_Rod.png` | Serph Fishing Rod | A Lanai rod with a hook of Serph and a line of doubled linen. It holds what an Ambren hook would lose. |

The invented lake fish at Bidewater (level 22) is still to name (`docs/antura-plan.md` §13), so it and its cooked form are in section 3.

### Cooking: cooked fish (7)

| File | Item | Description |
|---|---|---|
| `Cooked_Tench.png` | Cooked Tench | Tench baked until the skin crisps. It tastes faintly of the lake, which some people like. |
| `Cooked_Rudd.png` | Cooked Rudd | Rudd fried whole, the red fins gone dark and crunchy. Mind the bones. |
| `Cooked_Zander.png` | Cooked Zander | White zander flesh in thick flakes, firm and clean-tasting. |
| `Cooked_Mackerel.png` | Cooked Mackerel | Mackerel grilled until the skin blisters, rich and oily. |
| `Cooked_Pollock.png` | Cooked Pollock | Pollock baked in big white flakes. Plain, filling, and nobody's favourite. |
| `Cooked_Sea_Bass.png` | Cooked Sea Bass | Sea bass with crisp silver skin and sweet white flesh underneath. |
| `Cooked_Turbot.png` | Cooked Turbot | A whole turbot, baked, the flesh thick and pearly. A feast, if you can carry it. |

### Cooking: dishes (13), provisions (2), and ale (1)

| File | Item | Description |
|---|---|---|
| `Barley_Pottage.png` | Barley Pottage | Barley simmered soft with leek and onion until it thickens. The meal that keeps the farms of Farefield going. |
| `Buttered_Samphire.png` | Buttered Samphire | Samphire turned in hot butter until it shines. Salty, green, and gone in a moment. |
| `Salt_Fish.png` | Salt Fish | Fish split, packed in sea salt, and dried hard as a plank. It keeps for months and tastes of exactly that. |
| `Buttered_Worts.png` | Buttered Worts | Cabbage and leek stewed down in butter, green and soft. An old dish, and a plain one. |
| `Bean_and_Barley_Stew.png` | Bean and Barley Stew | Broad beans and barley in a thick brown stew with garlic and onion. Heavy enough to stand a spoon in. |
| `Pickled_Beet.png` | Pickled Beet | Slices of beet in a sharp brine sweetened with honey, deep red and glistening in the jar. |
| `Mackerel_in_Gooseberry_Sauce.png` | Mackerel in Gooseberry Sauce | Grilled mackerel under a sharp green sauce of stewed gooseberries. The sourness cuts the oil. |
| `Leek_and_Cheese_Tart.png` | Leek and Cheese Tart | A pastry case full of soft leeks and melted cheese, set with an egg and browned on top. |
| `Samphire_and_Fish_Broth.png` | Samphire and Fish Broth | A clear broth with flakes of cooked fish, leek, and samphire floating green in it. |
| `Gooseberry_Fool.png` | Gooseberry Fool | Crushed gooseberries folded into honeyed milk, pale green and sharp-sweet. Never cooked, so it can never burn. |
| `Beans_and_Pork.png` | Beans and Pork | Salt pork stewed with broad beans and onion until the beans fall apart. |
| `Salt_Beef_and_Cabbage.png` | Salt Beef and Cabbage | Boiled salt beef with cabbage and beet, the whole pot stained red. |
| `Shore_Pie.png` | Shore Pie | A deep pie of fish and samphire under a butter crust. The fishwives of Wendhaven claim it, and so does everyone else. |
| `Crafters_Pottage.png` | Crafter's Pottage | A bowl of barley pottage with cheese crumbled in and wild thyme on top. Steady fare for steady hands. |
| `Cooks_Supper.png` | Cook's Supper | Buttered worts, a cottage loaf to wipe the bowl, and a pinch of salt on the side. The supper a cook makes for themselves at the end of the day. |
| `Ale.png` | Ale | A brown ale, cloudy and sweet with meadowsweet, poured from the cask with a head on it. |

### Combat: drops and trophies (8)

| File | Item | Description |
|---|---|---|
| `Wolverine_Pelt.png` | Wolverine Pelt | A coarse dark-brown pelt with a pale band along each side. Frost will not stick to it. |
| `Cave_Bear_Pelt.png` | Cave Bear Pelt | A huge shaggy pelt, brown going grey at the tips, heavy enough to bow your back. It smells of the den. |
| `Snallyscale.png` | Snallyscale | A scale off a snallygaster, dull green-black and hard as horn, with a ridge down the middle. They are shed, not plucked, and a good thing too. |
| `Kelpies_Bridle.png` | Kelpie's Bridle | A bridle of rotten leather and green weed, dripping still. Whoever held it was ridden into the sea. |
| `Snallygasters_Eye.png` | Snallygaster's Eye | The great single eye of a snallygaster, dried hard and yellow as old amber. It still seems to follow you round the room. |
| `Cave_Bear_Skull.png` | Cave Bear Skull | A bear's skull the size of a bucket, the teeth worn down to stumps. It lay in the den for longer than anyone has lived on Antura. |
| `Bolters_Heartstone.png` | Bolter's Heartstone | A smooth, heavy stone, warm in the hand, found at the heart of a slide-rock bolter. It is the only part of the beast that was not trying to flatten you. |
| `Rough_Amethyst.png` | Rough Amethyst | A lump of rock with a purple crystal breaking through it. Cut, it will be something. |

### Combat: rare weapons (3)

| File | Item | Description |
|---|---|---|
| `Eagle_Talons.png` | Eagle Talons | A pair of sea eagle's talons, each bound to a grip of wrapped leather, hooked and black and sharp as the day they were torn loose. |
| `Reavers_Dane_Axe.png` | Reaver's Dane Axe | A long-hafted axe with a broad, thin crescent of a blade, nicked along the edge. Sea raiders carried these ashore, and swung them two-handed. |
| `Dripstone_Cudgel.png` | Dripstone Cudgel | A club of cave stone from a bear's den, grown slowly from the drip of water over a thousand winters, and broken off at the right length. |

### Combat: the Snallyscale set (6), the mantle (1), and Antura's ring and charm (2)

| File | Item | Description |
|---|---|---|
| `Snallyscale_Gauntlets.png` | Snallyscale Gauntlets | Gauntlets of small snallyscales lapped over the back of the hand like roof tiles. |
| `Snallyscale_Sabatons.png` | Snallyscale Sabatons | Foot guards of overlapping snallyscales, curved to the toe, laced over the boot. |
| `Snallyscale_Helm.png` | Snallyscale Helm | A close helm of snallyscales built up in rings, the largest across the brow, dark and dull. |
| `Snallyscale_Shield.png` | Snallyscale Shield | A round shield faced with the broadest snallyscales, the ridges set to turn a blow aside. |
| `Snallyscale_Greaves.png` | Snallyscale Greaves | Leg guards of snallyscales shaped to the shin and knee, strapped behind. |
| `Snallyscale_Cuirass.png` | Snallyscale Cuirass | A breastplate of snallyscales, hundreds of them, the heaviest over the heart. It creaks like an old ship when you breathe. |
| `Bearverine_Mantle.png` | Bearverine Mantle | A heavy cloak of cave bear fur with a collar and edging of wolverine, thick enough to sleep out on the high passes. |
| `Heartstone_Ring.png` | Heartstone Ring | A thick band of Serph with a bolter's heartstone set in it, bound round with wolverine hide. A blow from that hand lands like a falling rock. |
| `Kelpies_Bridle_Charm.png` | Kelpie's Bridle Charm | A rough garnet strung on a twist of the kelpie's bridle, hung with a tuft of feathers. Hold it and your aim runs true as a horse to its stable. |

### Talar: garnet jewelry (6)

The quartz pieces are live; these are their garnet twins (`docs/talar-spec.md` §8), made from a Radiant Garnet and two Serph Ingots.

| File | Item | Description |
|---|---|---|
| `Garnet_Keepers_Band.png` | Garnet Keeper's Band | A plain band of Serph with a deep red garnet sunk flush in it. |
| `Garnet_Prospectors_Ring.png` | Garnet Prospector's Ring | A Serph ring with a red garnet set high, like a lamp on a pole. |
| `Garnet_Seedsavers_Ring.png` | Garnet Seedsaver's Ring | A Serph ring engraved with a sheaf of grain round a small red garnet. |
| `Garnet_Hearty_Amulet.png` | Garnet Hearty Amulet | A heavy Serph pendant with a garnet the colour of a beating heart. |
| `Garnet_Wayfinders_Amulet.png` | Garnet Wayfinder's Amulet | A Serph pendant shaped like a compass rose, a garnet at its centre for north. |
| `Garnet_Baitkeepers_Amulet.png` | Garnet Baitkeeper's Amulet | A Serph pendant cast as a coiled fish, with a garnet for its eye. |

### Creature portraits (8), in `bestiary/`

| File | Description |
|---|---|
| `Wolverine.png` | A low, heavy, brown animal with a pale stripe down each flank and claws like hooks. Quick, fierce, and afraid of nothing its own size or any other. |
| `Kelpie.png` | A black horse standing in the shallows, water running off its mane, weed in its tail. It looks gentle. It wants you to climb on. |
| `Shellycoat.png` | A thin grey river spirit hung all over with shells that clatter when it moves, so you hear it before you see it. |
| `Sea_Eagle.png` | A huge eagle with a white tail and a hooked yellow beak, wings wide as a door, stooping out of the sky. |
| `Reaver.png` | A sea raider in a mail shirt and a rusted helm, a Dane axe on his shoulder and a sack of somebody else's harvest at his belt. |
| `Snallygaster.png` | A winged, scaled beast of the headlands, part bird and part dragon, with one great eye in the middle of its brow and a beak full of teeth. |
| `Cave_Bear.png` | An enormous bear of the high caves, bigger than any bear alive elsewhere, slow, shaggy, and impossible to stop once it gets going. |
| `Slide-rock_Bolter.png` | A creature of the mountain slopes the size of a barn, with a little head and a huge mouth and a tail that hooks over the ridge to hold it, until it lets go and comes down the slide. |

### Place pictures (8), in `Antura/`

| File | Description |
|---|---|
| `Wendhaven.jpg` | The port: a harbour wall, a ferry dock and a slip, a tavern with a lantern over the door, and a museum on the hill above the quays. |
| `Farefield.jpg` | Farmland on a broad gentle slope, hedged fields running down to the coast, and the seed ground along their margins. |
| `Mettlefell.jpg` | The forge town, smoke going up from a dozen chimneys, the ring of hammers, and the public smithy in the square. |
| `Underway.jpg` | The mine: a dark mouth in the hillside, spoil heaps, a winding frame, and old workings running off into the rock. |
| `Bidewater.jpg` | A wide, still lake among hills, reeds at the edges, the water dark and deep in the middle. |
| `Farvick_Narrows.jpg` | A narrow strait between two shores, fast water, shoals, and a tidal shore of rock pools and salt marsh. |
| `Yondereach.jpg` | The high passes: a road climbing through bare stone and scree under cold sky, caves in the cliffs above. |
| `Vergehorns.jpg` | Twin headlands standing out into the sea like horns, sheer cliffs, and wind that never stops. |

Antura's map image as well, beside `maps/Taiar_Island.jpg`, once Nathan's map is final.

---

## 3. Antura, designed but not yet named (waiting on Nathan)

These need art too, but each still wants a name, and some a design, before it can be drawn.

| What | How many | What is known |
|---|---|---|
| The invented lake fish at Bidewater, and its cooked form | 2 icons | Level 22, freshwater, Antura's one invented fish (§9). |
| Antura's islets | 8 place pictures | Eight on Taiar's pattern (§3 of `docs/islets-plan.md`); names wait on the islet maps. |
| Antura's islet guardians | 2 portraits | Proposed: the **Finman** (a sea sorcerer of the old stories, level 19, on the sea stacks and reefs) and the **Nuckelavee** (the sea-horse demon, level 24, on the ruin). Not settled. |
| Antura's guardian keepsakes | 1 per guardian | One each, as Taiar's three have. |
| Antura's chest pair | 2 icons | Proposed: **Locked Serph-Bound Chest** and **Serph-Bound Chest**. |
| Antura's four sailor's set pieces | 4 icons | Four of the seven slots Taiar's set leaves (neck, back, chest, off hand, legs, finger, trophy). The Lodestone and the Sunstone (trophy slot) are named instruments of the set; which island has them is not settled. |
| Antura's ruin artefacts | about 5 icons | One set per island, as Taiar's five. |
| Antura's Quank keepsake | 1 icon, perhaps | Antura's Quank scene wants the Tidbit back; whether he gives anything in return is the future quest's to decide. |

---

## 4. No art needed

Granite, Granite Block, Charc, Feathers, Linen Cloth, Amber, River Mussel, Freshwater Pearl, Rough Garnet, Rough Quartz, Butter, Cheese, Flour, Honey, Egg, Pork, Beef, Cottage Loaf, Wild Thyme, Meadowsweet, Locked Rusty Chest, and Rusty Chest are all live with icons already; Antura reuses them. Milk is a liquid and never shows in a pack, so it has no icon by design. The Skiff and the Cog are rows, not items, and draw no icon.
