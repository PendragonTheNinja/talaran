import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.integer('action_limit').nullable(); // null = infinite
    table.integer('actions_completed').defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_actions', (table) => {
    table.dropColumn('action_limit');
    table.dropColumn('actions_completed');
  });
}