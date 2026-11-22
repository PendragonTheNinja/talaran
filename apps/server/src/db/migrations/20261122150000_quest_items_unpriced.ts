import type { Knex } from 'knex';

// Quest items (type 'quest': Hrolf's Purse and the Friddicks' errand goods)
// went in with value 0, which the merchants' wall check rightly calls a
// problem (validateWalls in services/marketplace.ts) and which let a
// merchant buy them for nothing. They are unpriced instead, as every
// unsellable item is: a merchant answers "That cannot be sold."

export async function up(knex: Knex): Promise<void> {
    await knex('items').where({ type: 'quest' }).update({ value: null });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').where({ type: 'quest' }).update({ value: 0 });
}
