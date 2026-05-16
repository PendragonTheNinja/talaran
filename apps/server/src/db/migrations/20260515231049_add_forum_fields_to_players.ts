import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.string('avatar_url', 500).nullable();
    table.string('forum_signature', 300).nullable();
    table.integer('forum_post_count').defaultTo(0);
    table.boolean('is_mod').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.dropColumn('avatar_url');
    table.dropColumn('forum_signature');
    table.dropColumn('forum_post_count');
    table.dropColumn('is_mod');
  });
}