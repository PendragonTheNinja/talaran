import type { Knex } from 'knex'

// Lets a player hide the Tally Board link at locations where it would only offer
// to relocate the board they already have.
//
// Once a board is standing, the link's only purpose elsewhere on that island is
// moving it — and most players will never want to. Defaults to false so the link
// keeps showing for everyone who has not asked otherwise.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.boolean('hide_tally_when_built').notNullable().defaultTo(false)
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.dropColumn('hide_tally_when_built')
    })
}
