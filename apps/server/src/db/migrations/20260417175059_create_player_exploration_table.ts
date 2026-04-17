import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_exploration', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('discovery_type', 50).notNullable(); // location, item_drop, resource
    table.string('discovery_key', 255).notNullable(); // unique identifier for what was discovered
    table.integer('xp_awarded').notNullable().defaultTo(0);
    table.timestamp('discovered_at').defaultTo(knex.fn.now());
    table.unique(['player_id', 'discovery_type', 'discovery_key']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_exploration');
}