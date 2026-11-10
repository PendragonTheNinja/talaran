import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Wording pass, part one (Nathan, 2026-11-10): the oldest text in the game,
// rewritten to sound like the rest of it. Places, skill blurbs, two quest
// descriptions and the flat item descriptions (logs, bark, ore, stone, the
// first tools). American spellings throughout. Facts are unchanged except
// where the old text was out of date:
//
//   - The Blacksmith's Bargain named "Gareth"; the smith is Geoffrey.
//   - Wild hides tan into buckskin, not leather (leather is cattle).
//   - Dense ore named metals that no longer exist ("Mallis", "Stren").
//   - The Rift and the Talar skill speak of "the light" (the lore rule).
//
// Rows are found by name; a name that is missing where content exists is a
// loud error. down() puts the earlier text back.

interface Reword { name: string; before: string; after: string }
interface Group { table: string; key: string; column: string; rows: Reword[] }

const GROUPS: Group[] = [
    {
        table: "locations", key: "name", column: "description",
        rows: [
            {
                name: "Talador",
                before: "The first port city of Taiar Island. A modest but welcoming settlement where new arrivals find their footing in the world of Talaran. Ships from distant lands dock here, bringing trade and travellers alike.",
                after: "Taiar's port, and the first ground most people stand on here. Ships tie up, cargo comes off, and somebody on the quay will tell you where to get a hot meal.",
            },
            {
                name: "Emberra",
                before: "A forge town built into the hillside, its chimneys never cold. The ring of hammers on anvils echoes day and night as smiths work the metals pulled from the mountains above.",
                after: "A forge town dug into the hillside, under mountains that keep it in ore. The chimneys are never cold, and you hear the hammers before you see the roofs.",
            },
            {
                name: "Grundagr",
                before: "A network of tunnels carved deep into the northern mountain range. The first miners of Taiar Island broke ground here, and the tradition continues.",
                after: "Tunnels cut deep into the northern range. The island's first miners broke ground here, and nobody has thought of a reason to stop.",
            },
            {
                name: "Origrund",
                before: "A younger mine carved into the southern face of the mountain spine. The ore here runs rich and deep.",
                after: "The younger mine, cut into the southern face of the mountain spine. The ore runs rich here, and deep.",
            },
            {
                name: "Eld Grove",
                before: "Ancient trees tower overhead in this northern woodland. The canopy is so thick it blocks the sky entirely. Only experienced woodcutters venture here.",
                after: "Old trees, enormous ones, with a canopy so thick the sky does not come through. The woodcutters who work here have been at it a long while.",
            },
            {
                name: "Novita",
                before: "Fertile fields spread across the northern plateau, sheltered from the mountain winds. Farmers have worked this land since the first settlers arrived on Taiar Island.",
                after: "Fields across the northern plateau, sheltered from the mountain wind. People have farmed here since the first settlers came ashore.",
            },
            {
                name: "Caliwen",
                before: "A quiet workshop district nestled between the forests and farmlands. Artisans here work leather, bone, and cloth into goods sought across the island.",
                after: "Workshops, mostly, set between the forest and the farmland. Leather, bone and cloth go in at one end of the street and come out as something worth carrying home.",
            },
            {
                name: "Verdale",
                before: "A working lumber town on the edge of the western forests. The smell of fresh-cut wood hangs permanently in the air.",
                after: "A lumber town on the edge of the western forest. Everything here smells of cut wood, the bread included.",
            },
            {
                name: "Phoenwick",
                before: "A lively crossroads town in the heart of the island. The smell of roasting meat and fresh bread draws travellers from every direction.",
                after: "A crossroads town in the middle of the island. Travelers come in by every road, mostly following the smell of roasting meat and new bread.",
            },
            {
                name: "Dawncrest",
                before: "A rocky coastal outcropping where the morning light hits the water first. Fishermen cast their lines here at dawn and rarely leave empty-handed.",
                after: "A rocky stretch of coast where the morning light reaches the water first. The fishermen are down on the rocks before it does, and they rarely go home with nothing.",
            },
            {
                name: "Luxmere",
                before: "A serene lake in the southwestern lowlands. The water is clear and deep, home to fish found nowhere else on the island.",
                after: "A lake in the southwestern lowlands, clear and very deep. There are fish in it found nowhere else on the island.",
            },
            {
                name: "Talar Rift",
                before: "A jagged fissure in the northeastern cliffs, humming with arcane energy. Those who study the Talar arts are drawn here as if by instinct.",
                after: "A jagged split in the northeastern cliffs. Light comes up out of it, and people who have seen it once tend to come back.",
            },
        ],
    },
    {
        table: "skills", key: "name", column: "description",
        rows: [
            {
                name: "Defense",
                before: "Take the blow on your armour and not on yourself. The more you turn aside, the heavier the armour you can carry.",
                after: "Take the blow on your armor and not on yourself. The more you turn aside, the heavier the armor you can carry.",
            },
            {
                name: "Talar",
                before: "The arcane art of magic. Enchant, conjure, and manipulate the world.",
                after: "Fill a cut stone with the light that rises at the Rift, take it into yourself, and spend it.",
            },
            {
                name: "Mining",
                before: "Extract ores and gems from the earth.",
                after: "Break stone from the outcrops, and follow the veins of ore that turn up beneath it.",
            },
            {
                name: "Fishing",
                before: "Catch fish from rivers, lakes, and the open sea.",
                after: "Take fish from the lake and the sea, with a rod or a net. The hour and the season decide what is biting.",
            },
            {
                name: "Woodcutting",
                before: "Fell trees and gather wood from forests.",
                after: "Fell trees for timber. A better hand brings down better logs.",
            },
            {
                name: "Foraging",
                before: "Gather herbs, plants, mushrooms, and wild resources.",
                after: "Search meadow, hedgerow and creekbank for herbs, mushrooms and whatever else is growing there.",
            },
            {
                name: "Farming",
                before: "Cultivate crops and tend to the land.",
                after: "Raise a farmstead, sow its fields, and come back when the crop is ready.",
            },
            {
                name: "Hunting",
                before: "Track, trap, and harvest wild creatures for resources.",
                after: "Track game with a bow, and leave snares working in the brush while you are elsewhere.",
            },
            {
                name: "Smithing",
                before: "Forge metals into weapons, armor, and tools.",
                after: "Smelt ore into metal, and forge the metal into tools, weapons and armor.",
            },
            {
                name: "Cooking",
                before: "Prepare food that restores health and grants benefits.",
                after: "Turn raw food into meals that mend a fighter, and provisions that help a day's work along.",
            },
            {
                name: "Crafting",
                before: "Tan hides and work leather, cordage, and fine goods from raw materials.",
                after: "Tan hides, work leather and cordage, and cut gemstones for setting.",
            },
            {
                name: "Carpentry",
                before: "Build structures, furniture, and wooden equipment.",
                after: "Saw logs into planks and build with them: tools, benches, fences and whole farmsteads.",
            },
            {
                name: "Husbandry",
                before: "Raise and care for animals. Unlocks mounts and animal products.",
                after: "Keep animals at your farmstead for eggs, milk, meat and hides, and raise horses to ride.",
            },
        ],
    },
    {
        table: "quests", key: "name", column: "description",
        rows: [
            {
                name: "The Blacksmith's Bargain",
                before: "Gareth, the blacksmith of Emberra, has offered to let you use his forge... for a price.",
                after: "Geoffrey, the blacksmith of Emberra, will let you use his forge. He has a price in mind.",
            },
            {
                name: "The Carpenter's Commission",
                before: "Geossica, the carpenter of Verdale, will share the workshop... once you prove you can handle a saw.",
                after: "Geossica, the carpenter of Verdale, will share her workshop once you have shown you can handle a saw.",
            },
        ],
    },
    {
        table: "animal_species", key: "name", column: "description",
        rows: [
            {
                name: "Palfrey",
                before: "A traveller's horse, worth three of a rouncey to anyone who rides far.",
                after: "A traveler's horse, worth three of a rouncey to anyone who rides far.",
            },
        ],
    },
    {
        table: "creatures", key: "name", column: "description",
        rows: [
            {
                name: "Knocker",
                before: "Small as a child and grey as the rock. Miners hear it tapping in the walls, and some swear it knocks where the ore runs rich.",
                after: "Small as a child and gray as the rock. Miners hear it tapping in the walls, and some swear it knocks where the ore runs rich.",
            },
        ],
    },
    {
        table: "items", key: "name", column: "description",
        rows: [
            {
                name: "Chipped Arrowhead",
                before: "A flint arrowhead, chipped from use or age. A relic of some forgotten hunt.",
                after: "A flint arrowhead with a chipped edge. Somebody missed, a very long time ago.",
            },
            {
                name: "Venison",
                before: "Raw venison from a felled deer. Best cooked before eating.",
                after: "A haunch off a deer, dark and lean. It wants a fire.",
            },
            {
                name: "Boar Meat",
                before: "Coarse, rich meat from a wild boar. Hearty fare once cooked.",
                after: "Coarse, dark and rich. A wild boar eats well, and tastes of it.",
            },
            {
                name: "Sloth Meat",
                before: "A great quantity of dense meat from a ground sloth. A feast in the making.",
                after: "More meat than one person ought to carry, off a ground sloth. Dense, and slow to cook.",
            },
            {
                name: "Rabbit Meat",
                before: "Lean rabbit meat. Best cooked before eating.",
                after: "Lean and pale, with hardly any fat on it. It dries out if you look away.",
            },
            {
                name: "Pheasant Meat",
                before: "A plump pheasant breast. Best cooked before eating.",
                after: "A plump breast off a pheasant. Hang it a few days, if you have the patience.",
            },
            {
                name: "Charc",
                before: "Produced from burning wood in a kiln. Used as fuel for smelting.",
                after: "Wood burned slow in a kiln until only the black heart is left. Every forge on the island runs on it.",
            },
            {
                name: "Koric",
                before: "Processed fuel. Required for smelting higher-tier metals.",
                after: "A harder, hotter fuel than Charc. The stubborn metals will not melt over anything less.",
            },
            {
                name: "Rough Quartz",
                before: "An uncut chunk of quartz, dug from the rock. A jeweler could cut and polish it.",
                after: "A cloudy lump of quartz, dug out of the rock. A wheel and a steady hand will find the stone inside it.",
            },
            {
                name: "Ambren Ingot",
                before: "An ingot of Ambren alloy. Used to forge tier 1 tools and equipment.",
                after: "A bar of Ambren, cast and cooled. Most of the island's tools begin as one of these.",
            },
            {
                name: "Poor Lanai Log",
                before: "A Lanai log of poor quality. Likely from a dead or damaged tree.",
                after: "Knotted, split, or half dead before the axe found it. It will still saw, and it will still burn.",
            },
            {
                name: "Fine Lanai Log",
                before: "A solid Lanai log of decent quality.",
                after: "A sound length of Lanai, straight enough for honest work.",
            },
            {
                name: "Excellent Lanai Log",
                before: "A pristine Lanai log. Sought after by carpenters and craftsmen.",
                after: "Lanai without a knot in it, straight in the grain from end to end. Carpenters notice these.",
            },
            {
                name: "Poor Hatch Log",
                before: "A Hatch log of poor quality.",
                after: "A twisted Hatch log, shaken through the middle. Sturdy wood all the same.",
            },
            {
                name: "Fine Hatch Log",
                before: "A solid Hatch log of decent quality.",
                after: "A sound Hatch log. Sturdy wood, and it saws square.",
            },
            {
                name: "Excellent Hatch Log",
                before: "A pristine Hatch log.",
                after: "A Hatch log without a flaw in it. Timber like this holds a roof up for a century.",
            },
            {
                name: "Poor Bearn Log",
                before: "A Bearn log of poor quality.",
                after: "A Bearn log gone soft at one end. Heavy even so.",
            },
            {
                name: "Fine Bearn Log",
                before: "A solid Bearn log of decent quality.",
                after: "A sound Bearn log, heavy and close in the grain.",
            },
            {
                name: "Excellent Bearn Log",
                before: "A pristine Bearn log.",
                after: "Bearn, straight in the grain, not a knot on it.",
            },
            {
                name: "Poor Mirrith Log",
                before: "A Mirrith log of poor quality.",
                after: "A pale Mirrith log with a stain running through it. Fine work will not want it.",
            },
            {
                name: "Fine Mirrith Log",
                before: "A solid Mirrith log of decent quality.",
                after: "A sound Mirrith log, pale under the bark.",
            },
            {
                name: "Excellent Mirrith Log",
                before: "A pristine Mirrith log.",
                after: "Mirrith, pale as cream and clear from end to end. Joiners keep logs like this for their best work.",
            },
            {
                name: "Poor Craxial Log",
                before: "A Craxial log of poor quality. Even poor Craxial wood is extraordinarily dense.",
                after: "A flawed Craxial log. Even a poor one is denser than most timber at its best.",
            },
            {
                name: "Fine Craxial Log",
                before: "A solid Craxial log. Remarkably heavy.",
                after: "A sound Craxial log. It takes two hands and a moment's thought to lift.",
            },
            {
                name: "Excellent Craxial Log",
                before: "A flawless Craxial log. Masters of Carpentry speak of these in reverent tones.",
                after: "Craxial without a flaw. Master carpenters lower their voices around these.",
            },
            {
                name: "Sawdust",
                before: "Fine wood powder left over from sawing. Burns well and has its uses.",
                after: "What the saw leaves behind. It burns, and it soaks up a spill.",
            },
            {
                name: "Lanai Bark",
                before: "Rough bark stripped from Lanai logs.",
                after: "Bark peeled off Lanai logs at the saw. Steeped, it makes the liquor a tanner soaks hides in.",
            },
            {
                name: "Hatch Bark",
                before: "Rough bark stripped from Hatch logs.",
                after: "Thick Hatch bark, off the log in long strips. It goes to the tanning barrel.",
            },
            {
                name: "Bearn Bark",
                before: "Rough bark stripped from Bearn logs.",
                after: "Dark Bearn bark, bitter enough to pucker the tongue. Tanners want it for exactly that.",
            },
            {
                name: "Mirrith Bark",
                before: "Rough bark stripped from Mirrith logs.",
                after: "Thin, pale Mirrith bark. A tanner steeps it for his liquor.",
            },
            {
                name: "Craxial Bark",
                before: "Rough bark stripped from Craxial logs.",
                after: "Craxial bark, nearly as hard as the wood under it. It goes to the tanning barrel all the same.",
            },
            {
                name: "Daisy",
                before: "A simple white daisy, common along the roadsides of Taiar Island.",
                after: "A white daisy off the roadside. Common as grass, and prettier.",
            },
            {
                name: "Tal's Hope",
                before: "A rare flower said to bloom where fortune lingers. Finding one is a small blessing.",
                after: "A rare flower, said to open only where luck has been. Finding one is a small blessing.",
            },
            {
                name: "Lavender",
                before: "Purple spikes heavy with scent. Prized for calm and for flavour.",
                after: "Purple spikes heavy with scent. Prized for calm and for flavor.",
            },
            {
                name: "Deerhide",
                before: "The hide of a deer. Tans into a small amount of leather.",
                after: "The hide of a deer, scraped and rolled. A soak in bark liquor makes buckskin of it.",
            },
            {
                name: "Boarhide",
                before: "Tough, bristled boar hide. Yields a sturdy leather.",
                after: "Tough, bristled, and heavy to carry. The tanner will make buckskin of it.",
            },
            {
                name: "Slothhide",
                before: "The heavy hide of a ground sloth. Difficult to work, but yields good leather.",
                after: "The hide of a ground sloth, heavy as a wet sail. Hard work at the rack, and a great deal of buckskin at the end of it.",
            },
            {
                name: "Flax",
                before: "Cut flax stalks. Rotted, beaten, and combed, they give up long linen fibres.",
                after: "Cut flax stalks. Rotted, beaten, and combed, they give up long linen fibers.",
            },
            {
                name: "Flax Seeds",
                before: "Flat brown flax seed. Grown for its long fibres, and its oil.",
                after: "Flat brown flax seed. Grown for its long fibers, and its oil.",
            },
            {
                name: "Freshwater Pearl",
                before: "Small, irregular, and the colour of a rain cloud with the sun behind it. Worth more than the fish that shared its bed.",
                after: "Small, irregular, and the color of a rain cloud with the sun behind it. Worth more than the fish that shared its bed.",
            },
            {
                name: "Lanai Tool Rod",
                before: "A smooth rod of Lanai wood. Used as a handle for tools.",
                after: "A smooth rod of Lanai, turned to fit the hand. Most tool handles start as one.",
            },
            {
                name: "Antler",
                before: "A branching deer antler. Prized by craftsmen and collectors alike.",
                after: "A branching antler off a deer. Carvers want them, and so do people with a bare wall.",
            },
            {
                name: "Boar Tusk",
                before: "A curved, ivory-white tusk from a wild boar.",
                after: "A curved white tusk off a wild boar, longer than a finger and sharp along the inside.",
            },
            {
                name: "Hedgewitch's Sprig",
                before: "A small bundle of herbs bound with red thread. Plainly tied by hand, though no one lives near this hedge...",
                after: "A small bundle of herbs bound with red thread. Somebody tied it by hand, though nobody lives near this hedge.",
            },
            {
                name: "Wrecker's Lantern",
                before: "A shuttered lantern with a red glass. Hung on the rocks at night, it looked like the harbour light.",
                after: "A shuttered lantern with a red glass. Hung on the rocks at night, it looked like the harbor light.",
            },
            {
                name: "Novice's Pony",
                before: "A gentle pony given to new arrivals in Talaran. A humble but reliable companion for your first journeys.",
                after: "An old pony, gentle and honest. She is no racer, but she is quicker between towns than your own two feet.",
            },
            {
                name: "Ambren Ore",
                before: "A component ore used in Ambren alloy.",
                after: "One half of the metal. Smelt it with Burgh ore and you have Ambren.",
            },
            {
                name: "Burgh Ore",
                before: "A component ore used in Ambren alloy.",
                after: "The other half of Ambren. Nothing much alone, and no forge can do without it.",
            },
            {
                name: "Dense Ambren Ore",
                before: "A dense Mallis ore. Smelts into extra bars.",
                after: "Ambren ore of unusual weight. It smelts into more metal than an ordinary piece.",
            },
            {
                name: "Dense Burgh Ore",
                before: "A dense Stren ore. Smelts into extra bars.",
                after: "Burgh ore of unusual weight. It smelts into more metal than an ordinary piece.",
            },
            {
                name: "Granite",
                before: "A chunk of rough granite. Useful in construction.",
                after: "A rough lump of granite, straight off the outcrop. Squared up, it goes into walls and field borders all over the island.",
            },
            {
                name: "Limestone",
                before: "A block of limestone. Widely used in building.",
                after: "Pale stone, soft enough to cut square with a saw. Builders like it for that.",
            },
            {
                name: "Marble",
                before: "A slab of marble. Prized for its beauty.",
                after: "White stone with gray veins running through it. It takes a polish no other rock will.",
            },
            {
                name: "Sandstone",
                before: "A piece of sandstone. Easy to shape.",
                after: "Gritty yellow stone that shapes easily and wears just as easily.",
            },
            {
                name: "Basalt",
                before: "Dense volcanic basalt. Incredibly durable.",
                after: "Black, fine-grained and very hard. It blunts a pick faster than anything else in the ground.",
            },
            {
                name: "Ambren Anvil",
                before: "A sturdy Ambren anvil. Required for smithing tier 1 items.",
                after: "A block of Ambren with a horn at one end. Set it down and you have the start of a forge.",
            },
            {
                name: "Ambren Hatchet",
                before: "A hatchet forged from Ambren. Suitable for cutting Lanai trees.",
                after: "A short-hafted hatchet with an Ambren head. Sharp enough for Lanai, and for learning on.",
            },
            {
                name: "Ambren Pickaxe",
                before: "A pickaxe forged from Ambren. Suitable for mining basic ores.",
                after: "An Ambren head on a Lanai haft. It will break granite, and the softer ores with it.",
            },
            {
                name: "Ambren Tongs",
                before: "Iron tongs for handling hot metal safely.",
                after: "Long Ambren tongs, for holding hot metal at a sensible distance.",
            },
            {
                name: "Ambren Plane",
                before: "A plane with an Ambren blade and a Lanai handle. Part of a Carpentry workstation.",
                after: "A plane with an Ambren blade and a Lanai body. Fitted to a carpenter's bench, it takes a board down a shaving at a time.",
            },
            {
                name: "Lanai Sawhorse",
                before: "A sturdy sawhorse of Lanai wood, the surface of a carpenter's workstation.",
                after: "A sturdy Lanai sawhorse. Set one down and you have a carpenter's bench.",
            },
            {
                name: "Lanai Staff",
                before: "A simple walking staff carved from Lanai wood. Eases the burden of long roads on foot.",
                after: "A plain walking staff of Lanai. A long road is a little shorter with one in your hand.",
            },
            {
                name: "Lanai Tanning Rack",
                before: "A frame of Lanai wood for stretching hides. The heart of a tanner's station.",
                after: "A Lanai frame for stretching and scraping hides. A tannery starts with one.",
            },
            {
                name: "Ambren Mace",
                before: "A flanged head on a short haft, made for things that wear their armour on the outside.",
                after: "A flanged head on a short haft, made for things that wear their armor on the outside.",
            },
            {
                name: "Beef and Root Stew",
                before: "Beef stewed until the roots have taken all the flavour they can.",
                after: "Beef stewed until the roots have taken all the flavor they can.",
            },
            {
                name: "Duskfin",
                before: "Its fins hold the last colour of the day. No net has ever taken one, and no sun has ever seen one.",
                after: "Its fins hold the last color of the day. No net has ever taken one, and no sun has ever seen one.",
            },
            {
                name: "Cut Garnet",
                before: "A garnet cut into faces, the colour of dark wine.",
                after: "A garnet cut into faces, the color of dark wine.",
            },
            {
                name: "Lit Garnet",
                before: "A cut garnet lit from within, the colour of an ember in the morning ash.",
                after: "A cut garnet lit from within, the color of an ember in the morning ash.",
            },
            {
                name: "Rough Garnet",
                before: "A dark red knot in the grey rock, no bigger than a pea. It looks like nothing much until it is cut.",
                after: "A dark red knot in the gray rock, no bigger than a pea. It looks like nothing much until it is cut.",
            },
            {
                name: "Writ of Sending",
                before: "A folded letter in a careful hand, sealed with grey wax pressed flat by a thumb. It tells how a thing set down in one place may be asked to be in another. Most of it is about asking politely.",
                after: "A folded letter in a careful hand, sealed with gray wax pressed flat by a thumb. It tells how a thing set down in one place may be asked to be in another. Most of it is about asking politely.",
            },
            {
                name: "Dawn Sprat",
                before: "A sliver of living silver. It shoals in the first grey hour and is gone by full light.",
                after: "A sliver of living silver. It shoals in the first gray hour and is gone by full light.",
            },
        ],
    },
];

async function write(knex: Knex, side: 'before' | 'after'): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const g of GROUPS) {
        for (const r of g.rows) {
            const changed = await knex(g.table).where({ [g.key]: r.name }).update({ [g.column]: r[side] });
            if (changed === 0) throw new Error(`Rewording: no row in ${g.table} with ${g.key} "${r.name}".`);
        }
    }
}

export async function up(knex: Knex): Promise<void> {
    await write(knex, 'after');
}

export async function down(knex: Knex): Promise<void> {
    await write(knex, 'before');
}
