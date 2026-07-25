import type { Knex } from 'knex';

// The Lanai Bucket has always existed as an item with no way to obtain it. That
// went unnoticed while nothing used it — but tending a field now requires one, so
// without a recipe the only bucket in the world is Georgic's quest reward, and a
// player who skipped the quest (or traded it away) could never tend at all.
//
// It's a wooden bucket, so Carpentry makes it, at Verdale with the rest of the
// woodwork. Its description also gets widened: it was written purely as a smith's
// quenching bucket, and it now carries water to the fields as well.

const RECIPE = {
    skill: 'Carpentry',
    for_skill: 'Farming',
    name: 'Raise a Bucket',
    output_item_name: 'Lanai Bucket',
    output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 2 }]),
    required_level: 1,
    timer_seconds: 20,
    xp: 12,
    station: 'carpentry',
    mode: 'active',
    flavor_text: 'You set the staves in a ring and bind them tight.',
    is_active: true,
};

export async function up(knex: Knex): Promise<void> {
    const existing = await knex('recipes').where({ name: RECIPE.name }).first();
    if (existing) await knex('recipes').where({ id: existing.id }).update(RECIPE);
    else await knex('recipes').insert(RECIPE);

    await knex('items').where({ name: 'Lanai Bucket' }).update({
        description: 'A stout wooden bucket, staved and bound. Carries water for the forge or the field.',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
}
