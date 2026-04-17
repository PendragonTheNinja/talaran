import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('skills', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique();
    table.string('type', 50).notNullable(); // combat, gathering, crafting, utility
    table.text('description').nullable();
    table.string('icon', 255).nullable(); // path to skill icon image
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('skills');
}