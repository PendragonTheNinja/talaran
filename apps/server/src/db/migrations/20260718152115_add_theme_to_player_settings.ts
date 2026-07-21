import type { Knex } from 'knex';

// Phase A of Support Us (docs/support-spec.md): per-player theme preference.
// Free themes only for now ('tavern' default, 'scriptorium'); premium theme
// ownership arrives with the store in Phase C via player_unlocks.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.string('theme', 40).notNullable().defaultTo('tavern');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (t) => {
        t.dropColumn('theme');
    });
}
