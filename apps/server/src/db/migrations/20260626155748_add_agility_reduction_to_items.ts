import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('items', t => {
        t.float('agility_reduction').notNullable().defaultTo(0) // % of base travel time, on-foot only
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('items', t => {
        t.dropColumn('agility_reduction')
    })
}