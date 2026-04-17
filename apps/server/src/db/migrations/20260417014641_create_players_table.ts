import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('players', (table) => {
    table.increments('id').primary();
    table.string('username', 32).notNullable().unique();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('reset_token', 255).nullable();
    table.timestamp('reset_token_expires').nullable();
    table.boolean('is_banned').defaultTo(false);
    table.boolean('is_admin').defaultTo(false);
    table.timestamp('last_login').nullable();
    table.timestamps(true, true); // created_at and updated_at
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('players');
}