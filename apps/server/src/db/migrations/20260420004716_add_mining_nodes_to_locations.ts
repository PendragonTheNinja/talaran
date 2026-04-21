import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Mining nodes use the existing resource_nodes table
  // but we need to add vein_discovery_chance column
  await knex.schema.alterTable('resource_nodes', (table) => {
    table.integer('vein_discovery_chance').nullable(); // out of 1000 (e.g. 5 = 0.5%)
    table.integer('min_vein_quantity').nullable();
    table.integer('max_vein_quantity').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('resource_nodes', (table) => {
    table.dropColumn('vein_discovery_chance');
    table.dropColumn('min_vein_quantity');
    table.dropColumn('max_vein_quantity');
  });
}