import type { Knex } from 'knex';

// Correction. The mallet was added as an Ambren tool alongside the smithed hammer
// and saw, but a mallet is timber through and through, so it follows the all-timber
// carpentry convention: Lanai Mallet, joined at the sawhorse, not forged.
//
// Written to work whether or not 20260723070000 has already run: it renames the
// Ambren item if it exists and creates the Lanai one if it does not.

const MALLET = {
    name: 'Lanai Mallet',
    type: 'tool',
    subtype: 'mallet',
    tier: 1,
    quality: null,
    slot: null,
    level_required: 1,
    description: 'A heavy mallet of solid Lanai wood. Drives a chisel without splitting the haft, and sets a beam without marring it.',
    stackable: false,
};

const RECIPE = {
    skill: 'Carpentry',
    for_skill: 'Carpentry',
    name: 'Lanai Mallet',
    output_item_name: 'Lanai Mallet',
    output_qty: 1,
    inputs: JSON.stringify([
        { itemName: 'Lanai Planks', qty: 2 },
        { itemName: 'Lanai Tool Rod', qty: 1 },
    ]),
    required_level: 1,
    timer_seconds: 90,
    xp: 99,
    station: 'carpentry',
    mode: 'active',
    flavor_text: 'You shape the mallet head and drive the haft home.',
    is_active: true,
};

export async function up(knex: Knex): Promise<void> {
    const old = await knex('items').where({ name: 'Ambren Mallet' }).first();
    if (old) {
        // Keep the row so any existing copies stay in players' hands.
        await knex('items').where({ id: old.id }).update(MALLET);
    } else {
        const existing = await knex('items').where({ name: MALLET.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(MALLET);
        else await knex('items').insert(MALLET);
    }

    const existingRecipe = await knex('recipes').where({ name: RECIPE.name }).first();
    if (existingRecipe) await knex('recipes').where({ id: existingRecipe.id }).update(RECIPE);
    else await knex('recipes').insert(RECIPE);
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
}
