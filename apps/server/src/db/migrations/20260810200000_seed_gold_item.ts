import type { Knex } from 'knex';

// A display-only item row for coins.
//
// Gold is not an item and lives on players.gold. But the result card and the
// loot log both key off item NAMES, so found coins need a row to be reportable
// through the same path as every other drop. Teaching two display systems about
// a second currency would be far more invasive than one inert row.
//
// value stays NULL, which is already the "no merchant will price this" signal
// used by quest items. Nobody can sell their gold to Corvin.

export async function up(knex: Knex): Promise<void> {
    const existing = await knex('items').where({ name: 'Gold' }).first();
    if (existing) return;

    await knex('items').insert({
        name: 'Gold',
        type: 'curio',
        subtype: 'currency',
        tier: 0,
        description: 'Coin of the realm. Found in stranger places than you would expect.',
        is_active: true,
        value: null,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Gold' }).delete();
}
