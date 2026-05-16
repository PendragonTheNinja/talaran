import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('forum_threads', (table) => {
    table.increments('id').primary();
    table.integer('category_id').unsigned().notNullable()
      .references('id').inTable('forum_categories').onDelete('CASCADE');
    table.integer('author_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('title', 200).notNullable();
    table.boolean('is_pinned').defaultTo(false);
    table.boolean('is_locked').defaultTo(false);
    table.boolean('is_deleted').defaultTo(false);
    table.timestamp('locked_at').nullable();
    table.string('locked_reason', 200).nullable();
    table.integer('reply_count').defaultTo(0);
    table.integer('view_count').defaultTo(0);
    table.timestamp('last_post_at').nullable();
    table.integer('last_post_by').unsigned().nullable()
      .references('id').inTable('players').onDelete('SET NULL');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('forum_threads');
}