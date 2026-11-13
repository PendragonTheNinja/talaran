import type { Knex } from 'knex';

// Re-baiting snares (Nathan, 2026-11-12). A catch eats the bait and the snare
// resets bare; the only way to bait it again was to dismantle it and set it
// again. Now a bare snare can be baited where it stands (baitTrap in
// services/trapping.ts), and with this on, collecting a catch puts another of
// the same bait on from the pouch, when the snare did not break.
//
//   player_settings.trap_rebait   re-bait after a catch; off by default

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_settings', 'trap_rebait'))) {
        await knex.schema.alterTable('player_settings', (t) => {
            t.boolean('trap_rebait').notNullable().defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'trap_rebait')) {
        await knex.schema.alterTable('player_settings', (t) => { t.dropColumn('trap_rebait'); });
    }
}
