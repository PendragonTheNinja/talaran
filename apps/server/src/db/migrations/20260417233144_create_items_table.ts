import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('items', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('type', 50).notNullable(); // log, ore, fish, food, tool, armor, weapon, etc.
    table.string('subtype', 50).nullable(); // e.g. 'axe', 'pickaxe', 'sword'
    table.string('quality', 20).nullable(); // poor, fine, excellent (null for non-resource items)
    table.integer('tier').notNullable().defaultTo(1); // 1-9 metal/wood tier
    table.text('description').nullable();
    table.string('icon', 255).nullable();
    table.boolean('stackable').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('items');
}