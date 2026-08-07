import type { Knex } from 'knex';

// The saw becomes an offhand tool.
//
// The distinction is where the work happens. Setting up a Carpentry workstation
// is moving your gear to the place you already work — the saw is a component
// there, taken from your pack and built into the bench (services/carpentry.ts
// consumes it, and that is unchanged). Raising a farmstead, fencing a field, or
// putting up a coop is work done OUT IN THE FIELD, and there the saw has to be
// in your hand like the mallet.
//
// Previously field builds only checked that a saw existed somewhere in the pack,
// which let a player raise a farmstead with the saw buried under four hundred
// planks. Now: mallet mainhand, saw offhand, both required.

export async function up(knex: Knex): Promise<void> {
    const saw = await knex('items').where({ name: 'Ambren Saw' }).first();
    if (!saw) throw new Error('equip_saw_offhand: Ambren Saw not found');

    await knex('items').where({ id: saw.id }).update({ slot: 'offhand' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Ambren Saw' }).update({ slot: null });
}
