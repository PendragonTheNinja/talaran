import type { Knex } from 'knex';

/**
 * How many times a plot has been harvested since it was last sown.
 *
 * Farming XP is paid per seed at harvest, and a seed is only consumed when it
 * is sown. An annual is re-sown every cycle, so every harvest is paid for. A
 * perennial is sown once and then fruits forever, so paying full per-seed XP on
 * every regrowth was paying, again and again, for a seed nobody replaced — which
 * is how tier 1 perennials carried a player to Farming 57.
 *
 * With this counter the harvest knows which case it is in: 0 means this is the
 * first harvest since sowing and pays in full; anything above it is regrowth
 * and pays the reduced rate. Sowing resets it.
 *
 * Existing rows default to 0, so a perennial already in the ground reads as a
 * first harvest exactly once after this ships. That is a one-time bonus of one
 * normal harvest per plot, not a problem worth a backfill that would need to
 * guess each plot's history.
 */
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('farm_plots', 'harvests_since_sow'))) {
        await knex.schema.alterTable('farm_plots', (t) => {
            t.integer('harvests_since_sow').unsigned().notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('farm_plots', 'harvests_since_sow')) {
        await knex.schema.alterTable('farm_plots', (t) => t.dropColumn('harvests_since_sow'));
    }
}
