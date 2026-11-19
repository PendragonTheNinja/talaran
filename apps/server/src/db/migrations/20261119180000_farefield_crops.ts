import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The homestead, part one: Antura's six crops, the seed ground at Farefield,
// and the wild ground at Farvick Narrows (docs/foraging-farming-ladder.md §3,
// docs/antura-plan.md §7 and §8; the crops and finds locked by Nathan,
// 2026-11-15; levels, grow times, and yields proposed).
//
//   Crops        region 'Antura', so they take root only in Antura's soil.
//                xp_per_seed by the rule Taiar's were set by (20260722010100):
//                each field earns 0.12 of the band at the crop's level, at ten
//                seeds a field, floored (it gives Carrot 287, Turnip 319, Garlic
//                352 exactly); a perennial about 0.73 of that, as Taiar's two.
//                Grow times continue Taiar's rise (12 h at 1, 28 h at 12).
//   Barley       its own grain, harvested as Barley, milled 3 to 2 into Flour
//                (Wild Grain's 2 to 1, so a better rate); ale and feed later.
//   Seed ground  Farefield, Foraging 13, 65 s: the six seeds and cuttings, nothing
//                else. A find pays the band for the swing (48), as Taiar's do.
//   Wild ground  Farvick Narrows, Foraging 19, 70 s: Sea Salt and Samphire.

const REGION = 'Antura';

const ITEMS = [
    { name: 'Barley Seeds', subtype: 'seed', description: 'Pale, pointed grains with the husk still on, kept back from last year\'s sheaves to sow.' },
    { name: 'Barley', subtype: 'grain', description: 'Bearded ears of barley, heavy and bowed. Brewers want it, cooks want it, and so do the animals.' },
    { name: 'Cabbage Seeds', subtype: 'seed', description: 'Tiny round seeds, dark as peppercorns. Their grandparents grew wild on the sea cliffs.' },
    { name: 'Cabbage', subtype: 'produce', description: 'A tight green head of cabbage, the outer leaves nibbled. Whatever did the nibbling did not stay for the rest.' },
    { name: 'Leek Seeds', subtype: 'seed', description: 'Small black seeds, flat on one side, that look like nothing much.' },
    { name: 'Leek', subtype: 'produce', description: 'A long leek, white at the root and dark green at the top, with earth still in the folds.' },
    { name: 'Beet Seeds', subtype: 'seed', description: 'Knobbly brown seed clusters, each one several seeds stuck together, as if they could not bear to be apart.' },
    { name: 'Beet', subtype: 'produce', description: 'A round red beet with its leaves still on. It stains everything it touches, hands included.' },
    { name: 'Broad Bean Seeds', subtype: 'seed', description: 'Big flat dried beans, brown and wrinkled, saved for sowing.' },
    { name: 'Broad Beans', subtype: 'produce', description: 'A handful of fat green pods, each holding beans in a bed of white fur.' },
    { name: 'Gooseberry Cutting', subtype: 'seed', description: 'A thorny stick a hand long, cut from a gooseberry bush in winter. Push it in the ground and leave it alone.' },
    { name: 'Gooseberry', subtype: 'produce', description: 'A pale green berry, striped and a little hairy, sharp enough to make you wince.' },
    { name: 'Sea Salt', subtype: 'foodstuff', description: 'Grey flakes scraped from a rock pool the sun has dried. A pinch goes a long way.' },
    { name: 'Samphire', subtype: 'herb', description: 'Bright green fleshy stems from the salt marsh, crisp and salty, like the sea in a mouthful.' },
];

const H = 3600;
const CROPS = [
    { name: 'Barley', seed_item_name: 'Barley Seeds', produce_item_name: 'Barley', plant_level: 13, grow_seconds: 22 * H, yield_per_seed: 5, xp_per_seed: 702, crop_type: 'grain', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', seed_return_chance: 0.6 },
    { name: 'Cabbage', seed_item_name: 'Cabbage Seeds', produce_item_name: 'Cabbage', plant_level: 15, grow_seconds: 24 * H, yield_per_seed: 3, xp_per_seed: 803, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', seed_return_chance: 0.2 },
    { name: 'Leek', seed_item_name: 'Leek Seeds', produce_item_name: 'Leek', plant_level: 17, grow_seconds: 26 * H, yield_per_seed: 3, xp_per_seed: 912, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', seed_return_chance: 0.2 },
    { name: 'Beet', seed_item_name: 'Beet Seeds', produce_item_name: 'Beet', plant_level: 19, grow_seconds: 27 * H, yield_per_seed: 3, xp_per_seed: 993, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', seed_return_chance: 0.2 },
    { name: 'Broad Bean', seed_item_name: 'Broad Bean Seeds', produce_item_name: 'Broad Beans', plant_level: 21, grow_seconds: 29 * H, yield_per_seed: 4, xp_per_seed: 1119, crop_type: 'legume', is_perennial: false, regrow_seconds: null, soil_effect: 'restore', seed_return_chance: 0.4 },
    { name: 'Gooseberry', seed_item_name: 'Gooseberry Cutting', produce_item_name: 'Gooseberry', plant_level: 23, grow_seconds: 40 * H, yield_per_seed: 4, xp_per_seed: 1182, crop_type: 'fruit', is_perennial: true, regrow_seconds: 29 * H, soil_effect: 'neutral', seed_return_chance: 0 },
];

const MILL = {
    name: 'Mill Barley', skill: 'Farming', output_item_name: 'Flour', output_qty: 2,
    inputs: JSON.stringify([{ itemName: 'Barley', qty: 3 }]),
    required_level: 13, timer_seconds: 50, xp: 40, station: null, required_tools: null, for_skill: 'Cooking', mode: 'active',
    flavor_text: 'You pour the barley between the stones and turn until it runs out pale and fine.',
};

const HABITATS = [
    {
        place: 'Farefield', name: 'Seed Ground', required_level: 13, base_timer: 65, min_timer: 36, display_order: 1,
        description: 'The ragged margins of the fields, where everything the farmers ever sowed has gone to seed and come back wild.',
        scene_text: 'You work along the field margins, shaking seed heads into your palm.',
        drop_table: [
            { itemName: 'Barley Seeds', min: 1, max: 3, weight: 60, xp: 48 },
            { itemName: 'Cabbage Seeds', min: 1, max: 2, weight: 50, xp: 49 },
            { itemName: 'Leek Seeds', min: 1, max: 2, weight: 45, xp: 50 },
            { itemName: 'Beet Seeds', min: 1, max: 2, weight: 40, xp: 51 },
            { itemName: 'Broad Bean Seeds', min: 1, max: 2, weight: 35, xp: 52 },
            { itemName: 'Gooseberry Cutting', min: 1, max: 1, weight: 20, xp: 53 },
        ],
    },
    {
        place: 'Farvick Narrows', name: 'Tidal Shore', required_level: 19, base_timer: 70, min_timer: 39, display_order: 1,
        description: 'Rock pools and salt marsh left by the ebb, crusted white where the sun has dried them.',
        scene_text: 'You pick your way along the tideline, scraping and cutting as you go.',
        drop_table: [
            { itemName: 'Samphire', min: 1, max: 3, weight: 60, xp: 60 },
            { itemName: 'Sea Salt', min: 1, max: 2, weight: 40, xp: 60 },
        ],
    },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const it of ITEMS) {
        const row = { name: it.name, type: 'material', subtype: it.subtype, tier: 2, level_required: 1, description: it.description, is_active: true };
        const had = await knex('items').where({ name: it.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
    }
    if (!(await knex('items').where({ name: 'Flour' }).first('id'))) throw new Error('farefield_crops: item "Flour" not found');

    for (const c of CROPS) {
        const row = { ...c, region: REGION, grows_anywhere: null, is_active: true };
        const had = await knex('crops').where({ name: c.name }).first('id');
        if (had) await knex('crops').where({ id: had.id }).update(row);
        else await knex('crops').insert(row);
    }

    const hadMill = await knex('recipes').where({ name: MILL.name }).first('id');
    if (hadMill) await knex('recipes').where({ id: hadMill.id }).update({ ...MILL, is_active: true });
    else await knex('recipes').insert({ ...MILL, is_active: true });

    for (const h of HABITATS) {
        const place = await knex('locations').where({ name: h.place }).first('id');
        if (!place) throw new Error(`farefield_crops: no location named ${h.place} (run 20261119130000 first)`);
        for (const d of h.drop_table) {
            if (!(await knex('items').where({ name: d.itemName }).first('id'))) throw new Error(`farefield_crops: item "${d.itemName}" not found`);
        }
        const row = {
            location_id: place.id, name: h.name, description: h.description, required_level: h.required_level,
            base_timer: h.base_timer, min_timer: h.min_timer, drop_table: JSON.stringify(h.drop_table),
            display_order: h.display_order, scene_text: h.scene_text, is_active: true,
        };
        const had = await knex('foraging_habitats').where({ name: h.name, location_id: place.id }).first('id');
        if (had) await knex('foraging_habitats').where({ id: had.id }).update(row);
        else await knex('foraging_habitats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const h of HABITATS) {
        const place = await knex('locations').where({ name: h.place }).first('id');
        if (place) await knex('foraging_habitats').where({ name: h.name, location_id: place.id }).delete();
    }
    await knex('recipes').where({ name: MILL.name }).delete();
    // A crop sown in a field stays readable: switch the rows off rather than delete them.
    await knex('crops').whereIn('name', CROPS.map(c => c.name)).update({ is_active: false });
    // Items stay, as players may hold them.
}
