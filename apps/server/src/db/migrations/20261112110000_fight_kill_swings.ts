import type { Knex } from 'knex';

// Which weapons swung in the kill in progress (audit 2026-11-09, B4; Nathan,
// 2026-11-12). A kill used to wear whatever was in hand at the moment it
// landed, so a weapon taken off just before the last blow was never worn, and
// a player switching weapons to suit a creature's weakness had the wrong one
// charged. Now each settle adds its swings to the weapon that made them, and
// the kill wears the one that swung most (services/combatFights.ts).
//
// A map of item id to swings, reset at every kill. Schema only, so it runs the
// same on a fresh database.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('combat_fights', 'kill_swings'))) {
        await knex.schema.alterTable('combat_fights', (t) => {
            t.jsonb('kill_swings').notNullable().defaultTo('{}');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('combat_fights', 'kill_swings')) {
        await knex.schema.alterTable('combat_fights', (t) => {
            t.dropColumn('kill_swings');
        });
    }
}
