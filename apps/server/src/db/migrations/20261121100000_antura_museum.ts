import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';
import { exhibitFor } from '../../lib/museumPlacement';

// Antura's museum, in Wendhaven (docs/antura-plan.md §2: one museum per island).
//
//   items.island   the island whose museum an item belongs in; null is Taiar's.
//                  While Taiar's was the only museum, the startup fill
//                  (fillMissingCases) gave every priced item a case there, so
//                  Antura's Serph arms, fish, crops, and spoils sat in Taiar's
//                  cases. They are marked Antura's here, and their cases move
//                  across, donations and all. A new item's island is set by
//                  the migration that adds it.
//   Exhibits       Taiar's thirteen, by the same kinds, in Antura's words; its
//                  Spoils of the Fight names Antura's four trophies.

const ISLAND = 'Antura';

const ANTURA_ITEMS = [
    'Rough Amethyst', 'Serph Ore', 'Serph Ingot', 'Serph Pickaxe', 'Serph Hatchet', 'Serph Nails', 'Serph Hook', 'Serph Arrow',
    'Serph Hoe', 'Serph Ladle', 'Serph Foraging Knife', 'Serph Butchering Knife', 'Serph Gem Chisel', "Serph Jeweller's Pliers",
    'Serph Anvil', 'Serph Cauldron', 'Serph Cooking Knife', 'Serph Flesh Hook', 'Serph Hammer', 'Serph Meat Cleaver', 'Serph Plane',
    'Serph Saw', 'Serph Tinderbox', 'Serph Tongs', 'Serph Skillet', 'Serph Scythe', 'Serph Fishing Rod',
    'Serph Bracers', 'Serph Gauntlets', 'Serph Sabatons', 'Serph Boots', 'Serph Coif', 'Serph Helm', 'Serph Buckler', 'Serph Kite Shield',
    'Serph Chausses', 'Serph Greaves', 'Serph Hauberk', 'Serph Cuirass',
    'Serph Atgeir', 'Serph Maul', 'Serph Mace', 'Serph Scimitar', 'Serph Spear', 'Serph Daggers', 'Serph Hand Axes', 'Serph War Hammers', 'Serph Greatsword',
    'Barley Seeds', 'Barley', 'Cabbage Seeds', 'Cabbage', 'Leek Seeds', 'Leek', 'Beet Seeds', 'Beet', 'Broad Bean Seeds', 'Broad Beans',
    'Gooseberry Cutting', 'Gooseberry', 'Sea Salt', 'Samphire',
    'Tench', 'Rudd', 'Zander', 'Glassback', 'Mackerel', 'Pollock', 'Sea Bass', 'Turbot',
    'Cooked Tench', 'Cooked Rudd', 'Cooked Zander', 'Cooked Glassback', 'Cooked Mackerel', 'Cooked Pollock', 'Cooked Sea Bass', 'Cooked Turbot',
    'Barley Pottage', 'Buttered Samphire', 'Salt Fish', 'Buttered Worts', 'Bean and Barley Stew', 'Pickled Beet', 'Mackerel in Gooseberry Sauce',
    'Leek and Cheese Tart', 'Samphire and Fish Broth', 'Gooseberry Fool', 'Beans and Pork', 'Salt Beef and Cabbage', 'Shore Pie',
    "Crafter's Pottage", "Cook's Supper", 'Ale',
    'Wolverine Pelt', 'Cave Bear Pelt', 'Snallyscale', "Kelpie's Bridle", "Snallygaster's Eye", 'Cave Bear Skull', "Bolter's Heartstone",
    'Snallyscale Gauntlets', 'Snallyscale Sabatons', 'Snallyscale Helm', 'Snallyscale Shield', 'Snallyscale Greaves', 'Snallyscale Cuirass',
    'Bearverine Mantle', 'Heartstone Ring', "Kelpie's Bridle Charm", 'Eagle Talons', "Reaver's Dane Axe", 'Dripstone Cudgel',
];

const MUSEUM = { key: 'antura', name: 'Antura Museum', island: ISLAND, place: 'Wendhaven', display_order: 1 };

// Taiar's exhibits by name, with Antura's words; the kinds (match) are Taiar's,
// copied, except where given here.
const WORDS: Record<string, string> = {
    'Timber': 'The wood worked on Antura, in the log and in the plank.',
    'Stone and Ore': 'What comes up out of Underway, and what the forges of Mettlefell make of it.',
    'Fish of the Coast': 'From Bidewater and the fast cold water of the Narrows.',
    'Hedgerow and Herb': 'Picked by hand from the field margins and the tideline.',
    'Field and Fold': 'Sown, raised, and brought in at Farefield.',
    'Hide, Bone and Feather': 'What a hunt or a fight leaves behind, and what the tanner makes of it.',
    'The Larder': 'The kitchen\'s work, from salt fish to Shore Pie, burnt pans included.',
    'Tools of the Trades': 'The tools every trade on Antura is worked with, most of them in Serph.',
    'Arms and Armour': 'What is worn against the weather and carried against the wild.',
    'Spoils of the Fight': 'Taken from the creatures of Antura, and had nowhere else.',
    'Rings and Amulets': 'Stones from the island, set in its own metal.',
    'From the Islets': 'What the sea gave back: keepsakes off the islets around Antura.',
    'Curiosities': 'Keepsakes, oddments, and the things nobody could put anywhere else.',
};
const SPOILS_MATCH = [
    { type: 'weapon', subtype: 'rare_weapon' },
    { type: 'armor', subtype: 'shell_armor' },
    { name: "Kelpie's Bridle" },
    { name: "Snallygaster's Eye" },
    { name: 'Cave Bear Skull' },
    { name: "Bolter's Heartstone" },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'island'))) {
        await knex.schema.alterTable('items', (t) => { t.string('island', 100).nullable(); });
    }
    if (!(await hasContent(knex))) return;

    const taiar = await knex('museums').where({ key: 'taiar' }).first();
    if (!taiar) throw new Error('antura_museum: the Taiar museum is missing');
    const place = await knex('locations').where({ name: MUSEUM.place }).first('id');
    if (!place) throw new Error('antura_museum: no location named Wendhaven');

    for (const name of ANTURA_ITEMS) {
        const n = await knex('items').where({ name }).update({ island: ISLAND });
        if (n !== 1) throw new Error(`antura_museum: item "${name}" not found`);
    }

    let museum = await knex('museums').where({ key: MUSEUM.key }).first();
    const row = { key: MUSEUM.key, name: MUSEUM.name, island: MUSEUM.island, location_id: place.id, display_order: MUSEUM.display_order };
    if (museum) await knex('museums').where({ id: museum.id }).update(row);
    else museum = (await knex('museums').insert(row).returning('*'))[0];

    const taiarExhibits = await knex('museum_exhibits').where({ museum_id: taiar.id }).orderBy('display_order');
    for (const ex of taiarExhibits) {
        const ours = {
            museum_id: museum.id, name: ex.name, description: WORDS[ex.name] ?? ex.description, display_order: ex.display_order,
            match: JSON.stringify(ex.name === 'Spoils of the Fight' ? SPOILS_MATCH : (typeof ex.match === 'string' ? JSON.parse(ex.match) : ex.match)),
            is_catch_all: ex.is_catch_all,
        };
        const had = await knex('museum_exhibits').where({ museum_id: museum.id, name: ex.name }).first('id');
        if (had) await knex('museum_exhibits').where({ id: had.id }).update(ours);
        else await knex('museum_exhibits').insert(ours);
    }

    // Antura's items placed in Taiar's museum move to Antura's, at the end of
    // the exhibit their kind belongs to; their donations go with the case row.
    const exhibits = await knex('museum_exhibits').where({ museum_id: museum.id });
    const strays = await knex('museum_cases as c')
        .join('museum_exhibits as e', 'e.id', 'c.exhibit_id')
        .join('items as i', 'i.id', 'c.item_id')
        .where('e.museum_id', taiar.id).where('i.island', ISLAND)
        .orderBy('c.display_order').select('c.id', 'i.name', 'i.type', 'i.subtype');
    for (const c of strays) {
        const to = exhibitFor(c, exhibits);
        if (to === null) continue;
        const [{ max }] = await knex('museum_cases').where({ exhibit_id: to }).max('display_order as max');
        await knex('museum_cases').where({ id: c.id }).update({ exhibit_id: to, display_order: Number(max ?? -1) + 1 });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const museum = await knex('museums').where({ key: MUSEUM.key }).first();
        const taiar = await knex('museums').where({ key: 'taiar' }).first();
        if (museum && taiar) {
            // Cases go back to Taiar's exhibit of the same name, so no donation is lost.
            const ours = await knex('museum_exhibits').where({ museum_id: museum.id });
            for (const ex of ours) {
                const home = await knex('museum_exhibits').where({ museum_id: taiar.id, name: ex.name }).first('id');
                if (home) await knex('museum_cases').where({ exhibit_id: ex.id }).update({ exhibit_id: home.id });
            }
            await knex('museum_exhibits').where({ museum_id: museum.id }).delete();
            await knex('museums').where({ id: museum.id }).delete();
        }
    }
    if (await knex.schema.hasColumn('items', 'island')) {
        await knex.schema.alterTable('items', (t) => { t.dropColumn('island'); });
    }
}
