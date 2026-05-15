import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.integer('guild_id').unsigned().nullable()
      .references('id').inTable('guilds').onDelete('SET NULL');
    table.string('guild_tag', 5).nullable();
    table.string('guild_role', 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (table) => {
    table.dropColumn('guild_id');
    table.dropColumn('guild_tag');
    table.dropColumn('guild_role');
  });
}