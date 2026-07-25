import type { Knex } from 'knex';

// First-discovery ledger.
//
//   player_item_firsts — the first time THIS player earned a given item. Drives the
//                        pickup flourish now, and is what a future Exploration skill
//                        would award experience against.
//   item_firsts        — the first time ANY player earned it, and who. Groundwork
//                        for the server-wide "firsts" feed in docs/IDEAS.md.
//
// Only earning counts. Trading, unequipping, picking an item off the ground, or
// withdrawing from your own store are moves, not discoveries, and do not write here.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_item_firsts'))) {
        await knex.schema.createTable('player_item_firsts', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.string('source', 40).nullable();      // skill or system that granted it
            t.timestamp('first_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'item_id']);
            t.index(['player_id']);
        });
    }

    if (!(await knex.schema.hasTable('item_firsts'))) {
        await knex.schema.createTable('item_firsts', (t) => {
            t.increments('id').primary();
            t.integer('item_id').unsigned().notNullable().unique()
                .references('id').inTable('items').onDelete('CASCADE');
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.string('source', 40).nullable();
            t.boolean('announced').notNullable().defaultTo(false);   // for the future feed
            t.timestamp('first_at').notNullable().defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('item_firsts');
    await knex.schema.dropTableIfExists('player_item_firsts');
}
