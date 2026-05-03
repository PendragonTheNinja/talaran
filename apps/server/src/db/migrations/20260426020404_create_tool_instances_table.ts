import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tool_instances', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('name', 100).notNullable(); // player-given name
    table.string('tool_type', 50).notNullable(); // pickaxe, hatchet, etc.
    table.integer('tier').notNullable().defaultTo(1);
    // Part IDs — null if that part is broken/missing
    table.integer('head_part_id').unsigned().nullable()
      .references('id').inTable('tool_parts').onDelete('SET NULL');
    table.integer('rod_part_id').unsigned().nullable()
      .references('id').inTable('tool_parts').onDelete('SET NULL');
    // Stats
    table.bigInteger('total_actions').defaultTo(0);
    table.boolean('is_equipped').defaultTo(false);
    table.boolean('is_broken').defaultTo(false); // true when both parts broken
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('tool_instances');
}