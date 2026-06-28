import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.boolean('show_travel_log').notNullable().defaultTo(true)  // default on
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.dropColumn('show_travel_log')
    })
}