import type { Knex } from 'knex';

// A rack stretches hides; it doesn't soak them. The bark liquor needs a vessel.
// The tannery now requires rack + barrel, mirroring smithing's anvil/hammer/tongs.
// Also corrects the rack's XP: it was tuned for Carpentry 5 (363) and stayed hot
// when the level dropped to 1. 330 is the finished-goods band at level 1.

const ITEMS = [
    { name: 'Lanai Tanning Barrel', type: 'tool', subtype: 'tanning_barrel', tier: 1, quality: null, slot: null, level_required: 1, description: 'A stout Lanai barrel, hooped and sealed. Bark liquor goes in dark and comes out darker.', stackable: false },
];

const RECIPES = [
    {
        skill: 'Carpentry', for_skill: 'Crafting', name: 'Build Tanning Barrel',
        output_item_name: 'Lanai Tanning Barrel', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 6 },
            { itemName: 'Ambren Ingot', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 300, xp: 330, station: 'carpentry', mode: 'active', is_active: true,
        flavor_text: 'You are raising staves for a tanning barrel.',
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

    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({ xp: 330 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({ xp: 363 });
}