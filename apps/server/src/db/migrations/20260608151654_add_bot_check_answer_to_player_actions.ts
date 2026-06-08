import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.integer('bot_check_answer').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.dropColumn('bot_check_answer');
    });
}