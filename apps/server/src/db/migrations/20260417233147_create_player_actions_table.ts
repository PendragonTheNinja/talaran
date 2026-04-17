import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_actions', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable().unique()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('action_type', 50).notNullable(); // woodcutting, mining, fishing, traveling, etc.
    table.integer('resource_node_id').unsigned().nullable()
      .references('id').inTable('resource_nodes').onDelete('SET NULL');
    table.integer('location_id').unsigned().nullable()
      .references('id').inTable('locations').onDelete('SET NULL');
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completes_at').notNullable();
    table.boolean('auto_restart').defaultTo(true);
    table.timestamp('last_bot_check').nullable();
    table.boolean('bot_check_pending').defaultTo(false);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_actions');
}