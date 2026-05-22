import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.integer('strike_count').defaultTo(0);
        table.boolean('is_chat_muted').defaultTo(false);
        table.timestamp('chat_muted_until').nullable();
        table.boolean('is_forum_banned').defaultTo(false);
        table.timestamp('forum_banned_until').nullable();
        table.timestamp('banned_until').nullable();
        table.string('ban_reason', 500).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.dropColumn('strike_count');
        table.dropColumn('is_chat_muted');
        table.dropColumn('chat_muted_until');
        table.dropColumn('is_forum_banned');
        table.dropColumn('forum_banned_until');
        table.dropColumn('banned_until');
        table.dropColumn('ban_reason');
    });
}