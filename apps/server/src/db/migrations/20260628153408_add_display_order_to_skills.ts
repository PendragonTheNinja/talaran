import type { Knex } from 'knex'
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('skills', t => {
        t.integer('display_order').notNullable().defaultTo(0)
    })
}
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('skills', t => { t.dropColumn('display_order') })
}