import type { Knex } from 'knex';

// Tanning content: the rack (a Carpentry-built workstation, sawhorse pattern)
// and the conversion of the three tan recipes from active bench work to
// passive 6-hour soaks. XP per hide is kiln-tier by design — tanning is
// material prep; Crafting levels on active bench work.

const ITEMS = [
    { name: 'Lanai Tanning Rack', type: 'tool', subtype: 'tanning_rack', tier: 1, quality: null, slot: null, level_required: 1, description: 'A frame of Lanai wood for stretching hides. The heart of a tanner\'s station.', stackable: false },
];

const RECIPES = [
    {
        skill: 'Carpentry', name: 'Build Tanning Rack', output_item_name: 'Lanai Tanning Rack', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 4 },
            { itemName: 'Ambren Ingot', qty: 2 },
        ]),
        required_level: 5, timer_seconds: 300, xp: 363, station: null, mode: 'active', is_active: true,
    },
];

// timer_seconds = soak duration (6h). xp = per hide. output_qty = buckskin per hide.
// Bark supplies the tannins; it's a Carpentry sawing byproduct that had no sink.
// Lanai Bark tans tier-1 hides; higher barks will tan the cattle leather tiers.
const TAN_UPDATES = [
    {
        name: 'Tan Deerhide', timer_seconds: 21600, xp: 25, output_qty: 1,
        station: 'Tanning Rack', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Deerhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 3 },
        ]),
    },
    {
        name: 'Tan Boarhide', timer_seconds: 21600, xp: 50, output_qty: 2,
        station: 'Tanning Rack', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Boarhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 5 },
        ]),
    },
    {
        name: 'Tan Slothhide', timer_seconds: 21600, xp: 90, output_qty: 3,
        station: 'Tanning Rack', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Slothhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 8 },
        ]),
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    for (const upd of TAN_UPDATES) {
        const { name, ...fields } = upd;
        const existing = await knex('recipes').where({ name }).first();
        if (!existing) throw new Error(`seed_tanning_content: recipe "${name}" not found`);
        await knex('recipes').where({ id: existing.id }).update(fields);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Tan Deerhide' }).update({ timer_seconds: 30, xp: 20, station: null, mode: 'active', inputs: JSON.stringify([{ itemName: 'Deerhide', qty: 1 }]) });
    await knex('recipes').where({ name: 'Tan Boarhide' }).update({ timer_seconds: 60, xp: 48, station: null, mode: 'active', inputs: JSON.stringify([{ itemName: 'Boarhide', qty: 1 }]) });
    await knex('recipes').where({ name: 'Tan Slothhide' }).update({ timer_seconds: 90, xp: 87, station: null, mode: 'active', inputs: JSON.stringify([{ itemName: 'Slothhide', qty: 1 }]) });
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
}