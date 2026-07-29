import type { Knex } from 'knex'

// Players can turn off the item flight animation.
//
// Asked for by players. Defaults ON so nothing changes for anyone who has not
// expressed a preference, matching how show_travel_log was introduced.
//
// Note that prefers-reduced-motion is already honoured independently in
// lib/itemFly.ts. This is a game option, not an accessibility fallback; both
// paths disable the animation and neither overrides the other.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.boolean('show_item_animation').notNullable().defaultTo(true)  // default on
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.dropColumn('show_item_animation')
    })
}
