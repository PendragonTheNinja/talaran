import type { Knex } from 'knex';

// player_stats had no fishing counter, and services/fishing.ts increments
// total_fish_caught on every rod catch and every netted fish.
//
// Split out from 20260807143012 rather than folded into it: that migration has
// already been handed over, and CLAUDE.md §3 treats a delivered migration as
// applied. Editing it would do nothing on a database that has already run it,
// because knex tracks by filename and not by contents.
//
// bigInteger to match every other counter in the table.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_stats', 'total_fish_caught'))) {
        await knex.schema.alterTable('player_stats', (t) => {
            t.bigInteger('total_fish_caught').defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_stats', 'total_fish_caught')) {
        await knex.schema.alterTable('player_stats', (t) => {
            t.dropColumn('total_fish_caught');
        });
    }
}
