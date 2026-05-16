import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('forum_polls', (table) => {
    table.increments('id').primary();
    table.integer('thread_id').unsigned().notNullable()
      .references('id').inTable('forum_threads').onDelete('CASCADE');
    table.string('question', 300).notNullable();
    table.boolean('is_closed').defaultTo(false);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('forum_poll_options', (table) => {
    table.increments('id').primary();
    table.integer('poll_id').unsigned().notNullable()
      .references('id').inTable('forum_polls').onDelete('CASCADE');
    table.string('option_text', 200).notNullable();
    table.integer('vote_count').defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('forum_poll_votes', (table) => {
    table.increments('id').primary();
    table.integer('poll_id').unsigned().notNullable()
      .references('id').inTable('forum_polls').onDelete('CASCADE');
    table.integer('option_id').unsigned().notNullable()
      .references('id').inTable('forum_poll_options').onDelete('CASCADE');
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.timestamps(true, true);
    table.unique(['poll_id', 'player_id']); // one vote per poll per player
  });

  await knex.schema.createTable('forum_post_votes', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable()
      .references('id').inTable('forum_posts').onDelete('CASCADE');
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('vote').notNullable(); // 1 or -1
    table.timestamps(true, true);
    table.unique(['post_id', 'player_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('forum_post_votes');
  await knex.schema.dropTable('forum_poll_votes');
  await knex.schema.dropTable('forum_poll_options');
  await knex.schema.dropTable('forum_polls');
}