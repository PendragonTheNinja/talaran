import type { Knex } from 'knex'
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('skills', t => {
        t.boolean('is_implemented').notNullable().defaultTo(false)
    })
}
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('skills', t => { t.dropColumn('is_implemented') })
}