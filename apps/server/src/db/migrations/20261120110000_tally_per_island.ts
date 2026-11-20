import type { Knex } from 'knex';

// Tally boards are per island (Nathan, 2026-11-19): the licence cap, the boards,
// and what a board shows all belong to the island it stands on, and a board is
// built from that island's nails (services/tally.ts, TALLY_COST_BY_TIER).
//
//   player_tally_licences   licences held for each island; no row is one board.
//                           Everyone's existing licences become Taiar's, where
//                           every board raised so far stands.
//   tally_boards.materials  what went into a board, so taking it down returns
//                           exactly that; null for boards raised before this
//                           (Taiar's planks and Ambren nails).

const TAIAR = 'Taiar Island';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_tally_licences'))) {
        await knex.schema.createTable('player_tally_licences', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('island', 100).notNullable();
            t.integer('licences').notNullable().defaultTo(1);
            t.primary(['player_id', 'island']);
        });
        await knex.raw('ALTER TABLE player_tally_licences ADD CONSTRAINT player_tally_licences_min CHECK (licences >= 1)');
    }
    if (!(await knex.schema.hasColumn('tally_boards', 'materials'))) {
        await knex.schema.alterTable('tally_boards', (t) => { t.jsonb('materials').nullable(); });
    }
    if (await knex.schema.hasColumn('players', 'tally_licences')) {
        await knex.raw(
            `INSERT INTO player_tally_licences (player_id, island, licences)
             SELECT id, ?, tally_licences FROM players WHERE tally_licences > 1
             ON CONFLICT (player_id, island) DO NOTHING`, [TAIAR]);
    }
}

export async function down(knex: Knex): Promise<void> {
    // Taiar's licences go back on the player row, which the old code reads.
    if (await knex.schema.hasTable('player_tally_licences') && await knex.schema.hasColumn('players', 'tally_licences')) {
        await knex.raw(
            `UPDATE players p SET tally_licences = l.licences
             FROM player_tally_licences l WHERE l.player_id = p.id AND l.island = ?`, [TAIAR]);
    }
    if (await knex.schema.hasColumn('tally_boards', 'materials')) {
        await knex.schema.alterTable('tally_boards', (t) => { t.dropColumn('materials'); });
    }
    await knex.schema.dropTableIfExists('player_tally_licences');
}
