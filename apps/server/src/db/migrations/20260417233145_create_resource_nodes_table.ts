import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('resource_nodes', (table) => {
    table.increments('id').primary();
    table.integer('location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.string('skill', 50).notNullable(); // woodcutting, mining, fishing, etc.
    table.string('name', 100).notNullable(); // e.g. "Lanai Tree"
    table.integer('required_level').notNullable().defaultTo(1);
    table.integer('base_timer').notNullable(); // base seconds per action
    table.integer('min_timer').notNullable(); // minimum timer after skill bonuses
    table.integer('required_tool_tier').notNullable().defaultTo(1);
    // Quality distribution at base level (out of 100, must sum to 100)
    table.integer('poor_chance').notNullable().defaultTo(60);
    table.integer('fine_chance').notNullable().defaultTo(35);
    table.integer('excellent_chance').notNullable().defaultTo(5);
    // XP awarded per action
    table.integer('xp_reward').notNullable().defaultTo(10);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('resource_nodes');
}