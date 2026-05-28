import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_messages', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('channel', 20).notNullable();
    table.string('region', 100).nullable();
    table.integer('guild_id').unsigned().nullable();
    table.text('message').notNullable();
    table.string('player_name', 100).notNullable();
    table.string('guild_tag', 20).nullable();
    table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('chat_messages');
}
