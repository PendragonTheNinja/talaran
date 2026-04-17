import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('locations', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('region', 100).nullable(); // e.g. "Starting Island", "Main Continent"
    table.string('type', 50).notNullable(); // town, dungeon, wilderness, coast, mountain, etc.
    table.text('description').nullable();
    table.integer('map_x').notNullable().defaultTo(0); // position on minimap
    table.integer('map_y').notNullable().defaultTo(0);
    table.boolean('is_safe').defaultTo(true); // safe zones = no PvP
    table.boolean('is_accessible').defaultTo(true); // can toggle off for unreleased areas
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('locations');
}