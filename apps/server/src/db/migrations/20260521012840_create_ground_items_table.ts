import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('ground_items', (table) => {
        table.increments('id').primary();
        table.integer('item_id').unsigned().notNullable()
            .references('id').inTable('items').onDelete('CASCADE');
        table.integer('quantity').notNullable().defaultTo(1);
        table.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        table.integer('dropped_by_player_id').unsigned().nullable()
            .references('id').inTable('players').onDelete('SET NULL');
        table.timestamp('dropped_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('visible_to_all_at').notNullable();
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('ground_items');
}