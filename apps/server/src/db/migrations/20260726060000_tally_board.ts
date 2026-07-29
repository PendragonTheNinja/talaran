import type { Knex } from 'knex';

// The Tally Board: a Carpentry build that reports all of your passive work.
//
// Players asked for a way to track fields, tanning vats, and kilns without
// walking the whole island. The design rule is that **your holdings report
// themselves; the wilderness does not.** Fields, vats, and kilns sit where
// someone could plausibly keep a tally. Traps are scattered through a forest with
// nobody watching, and trapping's scavenger penalty is a deliberate mechanic that
// a tracker would delete. So traps are excluded, and the board says so.
//
// The board is read WHILE STANDING AT IT. That keeps it a place in the world
// rather than a menu, and leaves remote reading as a later upgrade (a hired
// steward, paid a wage — a gold sink the economy currently lacks).
//
// One board per player. Building another moves it and costs the materials again,
// so where you keep it is a decision rather than a checklist.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('tally_boards', (t) => {
        t.increments('id').primary();

        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');

        t.timestamps(true, true);

        // One per player: building elsewhere relocates it.
        t.unique(['player_id']);
        t.index(['location_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('tally_boards');
}
