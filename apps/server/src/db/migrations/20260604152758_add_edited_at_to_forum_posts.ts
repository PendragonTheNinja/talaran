import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('forum_posts', (table) => {
        table.timestamp('edited_at').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('forum_posts', (table) => {
        table.dropColumn('edited_at');
    });
}