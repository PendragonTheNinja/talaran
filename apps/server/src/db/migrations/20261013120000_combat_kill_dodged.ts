import type { Knex } from 'knex';

// Combat: what the creature's missed blows would have done this kill
// (combat_fights.kill_dodged), beside kill_absorbed and kill_landed. Early on
// it earns Defense a share of the kill's defensive XP, fading by Defense 13
// (dodgedWeight in lib/combatMath.ts; Nathan, 2026-10-13).

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('combat_fights', 'kill_dodged'))) {
        await knex.schema.alterTable('combat_fights', t => {
            t.integer('kill_dodged').notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('combat_fights', 'kill_dodged')) {
        await knex.schema.alterTable('combat_fights', t => { t.dropColumn('kill_dodged'); });
    }
}
