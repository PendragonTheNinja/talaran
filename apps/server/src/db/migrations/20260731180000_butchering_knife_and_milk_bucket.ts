import type { Knex } from 'knex';

// Two corrections to the Husbandry patch.
//
// 1. A BUTCHERING KNIFE. Slaughter was reusing the Ambren Foraging Knife, which
//    worked but read badly — a slim blade for cutting stems is not the tool you
//    take to a cow, and the two jobs genuinely want different steel. Its own
//    subtype means the two never compete for meaning, even though both live in
//    the mainhand.
//
// 2. MILK NEEDS SOMETHING TO GO IN. The Lanai Bucket becomes the container:
//    every bucket you carry holds ten units of milk (see MILK_PER_BUCKET in
//    services/husbandry.ts). Buckets are not consumed and never partially fill —
//    carrying them simply raises the ceiling on how much milk you can be holding.
//    Deposit milk at the farmstead and the buckets free up again.
//
//    `stackable` is display-only in this codebase (routes/inventory.ts selects it
//    for the client; nothing branches row creation on it), so flipping it is
//    cosmetic — inventory has always been one row per item with a quantity.

const KNIFE = {
    name: 'Ambren Butchering Knife',
    type: 'tool', subtype: 'butcher_knife', tier: 1, quality: null,
    slot: 'mainhand', level_required: 1,
    description: 'A broad, heavy blade with a curved belly. Made for one job, and unpleasant at every other.',
    stackable: false,
};

const KNIFE_RECIPE = {
    skill: 'Smithing', for_skill: 'Husbandry', name: 'Forge Ambren Butchering Knife',
    output_item_name: KNIFE.name, output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 2 }, { itemName: 'Lanai Planks', qty: 1 }]),
    required_level: 1, timer_seconds: 50, xp: 35, station: null, mode: 'active', is_active: true,
    flavor_text: 'You beat out a wide blade and put a long curve on the edge.',
};

export async function up(knex: Knex): Promise<void> {
    const existing = await knex('items').where({ name: KNIFE.name }).first();
    if (existing) await knex('items').where({ id: existing.id }).update(KNIFE);
    else await knex('items').insert(KNIFE);

    const existingRecipe = await knex('recipes').where({ name: KNIFE_RECIPE.name }).first();
    if (existingRecipe) await knex('recipes').where({ id: existingRecipe.id }).update(KNIFE_RECIPE);
    else await knex('recipes').insert(KNIFE_RECIPE);

    const bucket = await knex('items').where({ name: 'Lanai Bucket' }).first();
    if (!bucket) throw new Error('husbandry_knife_and_bucket: Lanai Bucket not found');
    await knex('items').where({ id: bucket.id }).update({
        stackable: true,
        description: 'A stout wooden bucket, staved and bound. Carries water for the forge or the field, and holds ten of milk besides.',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: KNIFE_RECIPE.name }).delete();
    await knex('items').where({ name: 'Lanai Bucket' }).update({
        stackable: false,
        description: 'A stout wooden bucket, staved and bound. Carries water for the forge or the field.',
    });
    // The knife itself is left in place — players may be holding one.
}
