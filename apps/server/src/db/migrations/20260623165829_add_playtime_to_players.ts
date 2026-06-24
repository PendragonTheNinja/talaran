import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.bigInteger('total_seconds_played').notNullable().defaultTo(0);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.dropColumn('total_seconds_played');
    });
}