import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.integer('last_timer_seconds').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.dropColumn('last_timer_seconds');
    });
}