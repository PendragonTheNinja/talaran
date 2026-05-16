import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('forum_posts', (table) => {
    table.increments('id').primary();
    table.integer('thread_id').unsigned().notNullable()
      .references('id').inTable('forum_threads').onDelete('CASCADE');
    table.integer('author_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.text('content').notNullable();
    table.boolean('is_deleted').defaultTo(false);
    table.boolean('is_first_post').defaultTo(false); // the opening post of a thread
    table.integer('upvotes').defaultTo(0);
    table.integer('downvotes').defaultTo(0);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('forum_posts');
}