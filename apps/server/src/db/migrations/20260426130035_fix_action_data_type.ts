import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.string('action_data_new', 100).nullable();
  });

  await knex.raw('UPDATE player_actions SET action_data_new = action_data::text');

  await knex.schema.alterTable('player_actions', (table) => {
    table.dropColumn('action_data');
  });

  await knex.schema.alterTable('player_actions', (table) => {
    table.renameColumn('action_data_new', 'action_data');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.integer('action_data_new').nullable();
  });

  await knex.schema.alterTable('player_actions', (table) => {
    table.dropColumn('action_data');
  });

  await knex.schema.alterTable('player_actions', (table) => {
    table.renameColumn('action_data_new', 'action_data');
  });
}