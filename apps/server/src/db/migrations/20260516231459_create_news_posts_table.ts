import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('news_posts', (table) => {
    table.increments('id').primary();
    table.integer('author_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('title', 200).notNullable();
    table.text('body').notNullable();
    table.integer('forum_thread_id').unsigned().nullable()
      .references('id').inTable('forum_threads').onDelete('SET NULL');
    table.timestamp('published_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('news_posts');
}