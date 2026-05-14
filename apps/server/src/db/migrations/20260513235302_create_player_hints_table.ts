import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_hints', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('hint_key', 100).notNullable();
    table.timestamps(true, true);
    table.unique(['player_id', 'hint_key']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_hints');
}