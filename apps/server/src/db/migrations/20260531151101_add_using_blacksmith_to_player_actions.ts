import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.boolean('using_blacksmith').defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_actions', (table) => {
        table.dropColumn('using_blacksmith');
    });
}