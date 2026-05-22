import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('warnings', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('issued_by').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.string('reason', 500).notNullable();
        table.string('type', 20).notNullable().defaultTo('formal'); // chat, formal
        table.integer('strike_number').notNullable().defaultTo(1);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('warnings');
}