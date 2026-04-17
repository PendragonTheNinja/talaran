import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.integer('current_location_id').unsigned().nullable()
      .references('id').inTable('locations').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.dropColumn('current_location_id');
  });
}