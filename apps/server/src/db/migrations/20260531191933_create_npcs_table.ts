import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('npcs', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.string('title', 150).nullable();
        table.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        table.string('submenu', 50).nullable(); // forge, fishing, carpentry etc — which submenu to appear in
        table.string('avatar', 10).nullable(); // emoji for now
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('npcs');
}