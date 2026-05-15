import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('guild_applications', (table) => {
    table.increments('id').primary();
    table.integer('guild_id').unsigned().notNullable()
      .references('id').inTable('guilds').onDelete('CASCADE');
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.text('message').nullable();
    table.string('status', 20).notNullable().defaultTo('pending'); // pending, accepted, rejected
    table.timestamps(true, true);
    table.unique(['guild_id', 'player_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('guild_applications');
}