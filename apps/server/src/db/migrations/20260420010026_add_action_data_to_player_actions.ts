import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.integer('action_data').nullable(); // stores vein_id for mining_vein actions
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.dropColumn('action_data');
  });
}