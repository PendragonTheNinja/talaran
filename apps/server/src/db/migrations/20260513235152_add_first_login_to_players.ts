import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.boolean('first_login').defaultTo(true);
    table.boolean('has_seen_welcome').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.dropColumn('first_login');
    table.dropColumn('has_seen_welcome');
  });
}