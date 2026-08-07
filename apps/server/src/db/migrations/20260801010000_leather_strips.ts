import type { Knex } from 'knex';

// Leather Strips get a second source.
//
// Strips were buckskin-only, which meant every leather good still reached back
// into Hunting for its lacing. Cattle leather should be able to supply its own,
// and it should supply more of it: a whole tanned hide cuts down into far more
// lacing than a light buckskin does.
//
//   Cut Buckskin Strips   1 Buckskin -> 2 strips   (was 3)
//   Cut Leather Strips    1 Leather  -> 4 strips   (new)
//
// Dropping buckskin from 3 to 2 is what makes the two meaningfully different.
// At 3 and 4 they were nearly the same recipe, and the wild source would stay
// the obvious pick since buckskin is cheaper to come by than a slaughtered cow.
//
// XP follows the active band for the level (docs/xp-rebalance.md 3):
// xp = band(level) x seconds / 3600.

const RECIPE = {
    skill: 'Crafting', for_skill: 'Crafting', name: 'Cut Leather Strips',
    output_item_name: 'Leather Strips', output_qty: 4,
    inputs: JSON.stringify([{ itemName: 'Leather', qty: 1 }]),
    required_level: 9, timer_seconds: 20, xp: 15, station: null, mode: 'active', is_active: true,
    flavor_text: 'You run the knife down the hide in one long turn, and the coil drops away.',
};

export async function up(knex: Knex): Promise<void> {
    const existing = await knex('recipes').where({ name: RECIPE.name }).first();
    if (existing) await knex('recipes').where({ id: existing.id }).update(RECIPE);
    else await knex('recipes').insert(RECIPE);

    const buckskin = await knex('recipes').where({ name: 'Cut Buckskin Strips' }).first();
    if (!buckskin) throw new Error('leather_strips: Cut Buckskin Strips not found');
    await knex('recipes').where({ id: buckskin.id }).update({ output_qty: 2 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
    await knex('recipes').where({ name: 'Cut Buckskin Strips' }).update({ output_qty: 3 });
}
