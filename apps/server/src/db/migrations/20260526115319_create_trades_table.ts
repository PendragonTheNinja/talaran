import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('trades', (table) => {
        table.increments('id').primary();
        table.integer('player1_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('player2_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        table.enum('status', ['pending', 'active', 'completed', 'cancelled']).defaultTo('pending');
        table.boolean('player1_accepted').defaultTo(false);
        table.boolean('player2_accepted').defaultTo(false);
        table.timestamps(true, true);
    });

    await knex.schema.createTable('trade_offers', (table) => {
        table.increments('id').primary();
        table.integer('trade_id').unsigned().notNullable()
            .references('id').inTable('trades').onDelete('CASCADE');
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('item_id').unsigned().notNullable()
            .references('id').inTable('items').onDelete('CASCADE');
        table.integer('quantity').notNullable().defaultTo(1);
        table.timestamps(true, true);
    });

    await knex.schema.createTable('trade_gold', (table) => {
        table.increments('id').primary();
        table.integer('trade_id').unsigned().notNullable()
            .references('id').inTable('trades').onDelete('CASCADE');
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('gold_amount').notNullable().defaultTo(0);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('trade_gold');
    await knex.schema.dropTable('trade_offers');
    await knex.schema.dropTable('trades');
}