import type { Knex } from 'knex';

// First Furrow ("Till ten fields") counts total_plots_tilled, which only rises
// when bare ground is tilled. A harvested field goes back to tilled rather than
// bare, so it is never tilled again: a player who had their fields before the
// stat existed, and has reached the plot cap since, could never earn it
// (forum, 2026-10). Made retroactive (Nathan, 2026-10-30): every field a player
// has that is not bare has been tilled, so the count is at least that many.
// The feat itself is awarded on the player's next completed action
// (evaluateFeats in the tick). Only raises a count, so it re-runs safely.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('farm_plots')) || !(await knex.schema.hasColumn('player_stats', 'total_plots_tilled'))) return;
    await knex.raw(`
        INSERT INTO player_stats (player_id, total_plots_tilled)
        SELECT pp.player_id, count(*)
        FROM farm_plots fp
        JOIN player_properties pp ON pp.id = fp.property_id
        WHERE fp.state <> 'empty'
        GROUP BY pp.player_id
        ON CONFLICT (player_id) DO UPDATE
        SET total_plots_tilled = GREATEST(player_stats.total_plots_tilled, EXCLUDED.total_plots_tilled)
    `);
}

// Nothing to undo: the counts it raised were owed.
export async function down(): Promise<void> {}
