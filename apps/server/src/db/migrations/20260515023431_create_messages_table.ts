import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('messages', (table) => {
    table.increments('id').primary();
    table.integer('sender_id').unsigned().nullable()
      .references('id').inTable('players').onDelete('SET NULL');
    table.integer('recipient_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('sender_name', 100).notNullable(); // store name separately for system messages
    table.string('subject', 200).notNullable().defaultTo('(No Subject)');
    table.text('body').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_system').defaultTo(false);
    table.integer('reply_to_id').unsigned().nullable()
      .references('id').inTable('messages').onDelete('SET NULL');
    table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('messages');
}