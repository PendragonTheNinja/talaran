import type { Knex } from 'knex';

// Two hooks from an Ambren Ingot, when the same ingot hammers out 30 nails and a
// hook is the smaller object of the two. It reads as an oversight the moment a
// player puts the two recipes side by side.
//
// Inert right now, since rods are unbreakable and nobody needs a second hook. It
// becomes a real cost the moment hook durability lands and hooks turn into a
// consumable, so it is better corrected before anyone builds an economy on it.
//
// Ten keeps hooks meaningfully dearer than nails (a third of the yield) without
// the absurdity.

export async function up(knex: Knex): Promise<void> {
    const updated = await knex('recipes')
        .where({ name: 'Forge Ambren Hooks' })
        .update({ output_qty: 10 });
    if (!updated) throw new Error('hook_yield_to_ten: no recipe named Forge Ambren Hooks');
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Forge Ambren Hooks' }).update({ output_qty: 2 });
}
