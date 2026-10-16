import type { Knex } from 'knex';

// Forging and bench building counted nothing once they moved onto the recipe
// executor: services/recipes.ts kept counters for Cooking and Crafting only, so
// Struck While Hot (total_items_forged) and Raised and Pegged
// (total_items_built) sat at 0 for anyone forging or building at a bench
// (forum, 2026-09). The executor counts both now; this restores what was lost.
//
// The loot log has counted every completed action since 20260807181500, per
// player and per label, and a recipe logs under its own skill: "Smithing at
// Talador", "Carpentry at Phoenwick" (services/lootLog.ts buildSourceLabel).
// The old smithing and woodworking paths log under those labels too and DID
// count, so each counter becomes the larger of what it holds and the log's
// total, never the sum: nothing is counted twice, and a counter never goes
// down. Work from before the loot log existed is not recoverable.
//
// down() leaves the counters alone: a raised count cannot be told apart from
// one earned since, and a feat already earned is never taken back anyway.

const COUNTERS: Array<[column: string, skill: string]> = [
    ['total_items_forged', 'Smithing'],
    ['total_items_built', 'Carpentry'],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('loot_log_sources')) || !(await knex.schema.hasTable('player_stats'))) return;

    for (const [column, skill] of COUNTERS) {
        if (!(await knex.schema.hasColumn('player_stats', column))) {
            throw new Error(`recipe_counters_backfill: player_stats has no ${column}`);
        }
        await knex.raw(`
            UPDATE player_stats ps
            SET ?? = GREATEST(ps.??, logged.actions)
            FROM (
                SELECT player_id, SUM(actions)::bigint AS actions
                FROM loot_log_sources
                WHERE source = ? OR source LIKE ?
                GROUP BY player_id
            ) logged
            WHERE logged.player_id = ps.player_id`,
            [column, column, skill, `${skill} at %`]);
    }
}

export async function down(): Promise<void> {
    // Deliberately nothing (see above).
}
