import type { Knex } from 'knex';

// More than one tally board.
//
// The original design was one board per player, relocated by rebuilding
// elsewhere, enforced by a unique constraint on player_id. That made sense when
// passive work sat on one island; with fields, pens, vats and kilns spread
// across several, a single board means the report is unreadable exactly where
// you happen not to be standing.
//
// A player may now keep one board per ten Carpentry levels, plus the first:
// level 5 (the build requirement) allows 1, level 10 allows 2, level 20 allows
// 3, and so on. Boards are still one per location — a second board in the same
// town would report the same thing twice.
//
// Building at capacity still relocates the nearest-to-hand board rather than
// failing, so the old behaviour survives for anyone who never levels past 9.

export async function up(knex: Knex): Promise<void> {
    // Knex names this constraint tally_boards_player_id_unique by convention;
    // drop by column so it works whatever the name ended up as.
    await knex.schema.alterTable('tally_boards', (t) => {
        t.dropUnique(['player_id']);
    });

    await knex.schema.alterTable('tally_boards', (t) => {
        // One board per town, still. Two in the same place would say the same thing.
        t.unique(['player_id', 'location_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    // Collapse back to one board each, keeping the oldest, or the unique
    // constraint cannot be restored.
    // Typed explicitly: adding .count() to a select makes knex infer the row as
    // the aggregate shape alone, so row.player_id stops existing.
    const dupes = await knex('tally_boards')
        .select<{ player_id: number }[]>('player_id')
        .groupBy('player_id')
        .havingRaw('count(*) > 1');

    for (const row of dupes) {
        const keep = await knex('tally_boards')
            .where({ player_id: row.player_id })
            .orderBy('id', 'asc')
            .first();
        if (keep) {
            await knex('tally_boards')
                .where({ player_id: row.player_id })
                .whereNot({ id: keep.id })
                .delete();
        }
    }

    await knex.schema.alterTable('tally_boards', (t) => {
        t.dropUnique(['player_id', 'location_id']);
    });
    await knex.schema.alterTable('tally_boards', (t) => {
        t.unique(['player_id']);
    });
}
