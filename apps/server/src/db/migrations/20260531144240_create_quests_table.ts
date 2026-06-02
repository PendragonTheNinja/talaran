import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('quests', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.text('description').notNullable();
        table.string('skill', 50).notNullable();
        table.string('npc_name', 100).notNullable();
        table.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('quests');
}