import type { Knex } from 'knex';

// Foraging should not hand out wild versions of things you can cultivate — you
// find the SEED or PROPAGULE and grow the food yourself. So:
//   • Wild Strawberry  → dropped from Sunlit Meadow (Strawberry Runner already
//                        seeds the cultivated crop from Bramble Thicket)
//   • Raspberries      → dropped from Bramble Thicket (Raspberry Cane seeds it)
//   • Wild Garlic      → replaced by Garlic Cloves, and Garlic becomes a crop
// The affected tables are re-tuned so each habitat's weighted-average XP returns
// to the gathering band (removing rows shifts the mean).
//
// Removed items are left in the items table — players may be holding them.

const HABITATS = [
    {
        name: 'Sunlit Meadow',
        drop_table: [
            { itemName: 'Chamomile', weight: 120, min: 1, max: 3, xp: 23 },
            { itemName: 'Dandelion', weight: 120, min: 1, max: 3, xp: 23 },
            { itemName: 'Wild Thyme', weight: 45, min: 1, max: 2, xp: 35 },
            { itemName: 'Lavender', weight: 40, min: 1, max: 2, xp: 39 },
            { itemName: 'Carrot Seeds', weight: 50, min: 1, max: 2, xp: 24 },
            { itemName: 'Onion Seeds', weight: 50, min: 1, max: 2, xp: 24 },
            { itemName: 'Turnip Seeds', weight: 40, min: 1, max: 2, xp: 25 },
            { itemName: 'Wild Grain', weight: 45, min: 1, max: 3, xp: 26 },
            { itemName: 'Faelight Bloom', weight: 2, min: 1, max: 1, xp: 450, notable: true },
        ],
    },
    {
        name: 'Forest Floor',
        drop_table: [
            { itemName: 'Chanterelle Mushroom', weight: 110, min: 1, max: 2, xp: 23 },
            { itemName: 'Garlic Cloves', weight: 110, min: 1, max: 3, xp: 22 },
            { itemName: 'Acorns', weight: 100, min: 2, max: 4, xp: 20 },
            { itemName: 'Fiddlehead Ferns', weight: 90, min: 1, max: 3, xp: 24 },
            { itemName: 'Hazelnuts', weight: 50, min: 1, max: 3, xp: 31 },
            { itemName: 'Morel Mushroom', weight: 35, min: 1, max: 1, xp: 42 },
            { itemName: 'Oak Gall', weight: 20, min: 1, max: 2, xp: 90, notable: true },
            { itemName: 'Witch\'s Butter', weight: 5, min: 1, max: 1, xp: 350, notable: true },
            { itemName: 'Ghost Pipe', weight: 3, min: 1, max: 1, xp: 500, notable: true },
        ],
    },
    {
        name: 'Bramble Thicket',
        drop_table: [
            { itemName: 'Blackberries', weight: 110, min: 1, max: 3, xp: 33 },
            { itemName: 'Rosehips', weight: 90, min: 1, max: 2, xp: 34 },
            { itemName: 'Strawberry Runner', weight: 45, min: 1, max: 1, xp: 33 },
            { itemName: 'Raspberry Cane', weight: 40, min: 1, max: 1, xp: 34 },
            { itemName: 'Stinging Nettle', weight: 80, min: 1, max: 3, xp: 36, requiresGloves: true },
            { itemName: 'Bramble Vine', weight: 70, min: 1, max: 2, xp: 34, requiresGloves: true },
            { itemName: 'Sloe Berries', weight: 40, min: 1, max: 2, xp: 51, requiresGloves: true },
            { itemName: 'Elderberry', weight: 35, min: 1, max: 2, xp: 90, requiresGloves: true, notable: true },
            { itemName: 'Blackthorn Sprig', weight: 5, min: 1, max: 1, xp: 450, requiresGloves: true, notable: true },
            { itemName: 'Hedgewitch\'s Sprig', weight: 2, min: 1, max: 1, xp: 650, requiresGloves: true, notable: true },
        ],
    },
];

const ITEMS = [
    { name: 'Garlic Cloves', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'A head of garlic broken into cloves. Each one, set in the ground, becomes a head of its own.', stackable: true },
    { name: 'Garlic', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'Fat cultivated garlic, cured and plaited. Sharper by far than the wild kind.', stackable: true },
];

const GARLIC = {
    name: 'Garlic', seed_item_name: 'Garlic Cloves', produce_item_name: 'Garlic',
    plant_level: 3, grow_seconds: 14 * 3600, yield_per_seed: 3, xp_per_seed: 352,
    crop_type: 'vegetable', is_perennial: false, regrow_seconds: null,
    soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null,
};

export async function up(knex: Knex): Promise<void> {
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    const existingCrop = await knex('crops').where({ name: GARLIC.name }).first();
    if (existingCrop) await knex('crops').where({ id: existingCrop.id }).update(GARLIC);
    else await knex('crops').insert(GARLIC);

    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (!lanaivale) throw new Error('foraging_drop_cultivables: Lanaivale not found');

    for (const h of HABITATS) {
        await knex('foraging_habitats')
            .where({ location_id: lanaivale.id, name: h.name })
            .update({ drop_table: JSON.stringify(h.drop_table) });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('crops').where({ name: GARLIC.name }).delete();
    // Drop tables and items are left as-is; the prior state was a pre-farming cut.
}
