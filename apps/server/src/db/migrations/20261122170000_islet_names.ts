import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Islet names (Nathan, 2026-11-22; services/isletNames.ts).
//
// The first player to land on an unnamed islet may put a name to the Harbor
// Council. The right is theirs only while they stand there: once they sail off
// or are brought home without putting one forward, it passes to the next
// player to land, for as long as it takes. A name put forward waits for staff;
// while it waits nobody else may put one. Staff choose it (the islet is named)
// or turn it down (the islet is open again).
//
// The names are alpha names: 1.0 clears them and gives the final ones, which
// is why they sit beside locations.name instead of replacing it (migrations
// and code find islets by their standing names).
//
// islet_names: one row an islet once anyone has landed: who holds the right
// now, and the chosen name. islet_name_proposals: every name put forward, kept
// with what staff decided; at most one waits per islet (the partial unique
// index is the gate).

const LINES: string[] = [
    'Nobody has put a name to this place yet. If you have one, the Harbor Council will hear it, so long as you put it forward before you leave.',
    'There is no name for this islet on any chart. Put one to the Harbor Council before you push off, and it may be yours.',
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('islet_names'))) {
        await knex.schema.createTable('islet_names', (t) => {
            t.integer('location_id').primary().references('id').inTable('locations').onDelete('CASCADE');
            t.integer('holder_player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('held_since', { useTz: true }).nullable();
            t.string('name', 40).nullable();
            t.integer('named_by_player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('named_at', { useTz: true }).nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!(await knex.schema.hasTable('islet_name_proposals'))) {
        await knex.schema.createTable('islet_name_proposals', (t) => {
            t.increments('id').primary();
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('name', 40).notNullable();
            t.string('note', 300).nullable();
            t.string('status', 10).notNullable().defaultTo('pending');
            t.integer('decided_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('decided_at', { useTz: true }).nullable();
            t.string('reason', 300).nullable();
            t.timestamp('seen_at', { useTz: true }).nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['player_id']);
        });
        await knex.raw(`ALTER TABLE islet_name_proposals ADD CONSTRAINT islet_name_proposals_status_check CHECK (status IN ('pending', 'approved', 'rejected'))`);
        await knex.raw(`CREATE UNIQUE INDEX islet_name_proposals_one_pending ON islet_name_proposals (location_id) WHERE status = 'pending'`);
    }

    if (!(await hasContent(knex))) return;
    // What the shore says to the one who may name it, for every island with islets.
    const islands = (await knex('locations').whereNotNull('islet_kind').distinct('region').pluck('region')) as string[];
    if (!islands.length) throw new Error('islet_names: no islets found');
    for (const island of islands) {
        for (const text of LINES) {
            const had = await knex('voyage_lines').where({ island, moment: 'unnamed', text }).whereNull('location_id').first('id');
            if (!had) await knex('voyage_lines').insert({ island, moment: 'unnamed', location_id: null, text, is_active: true });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('voyage_lines')) await knex('voyage_lines').where({ moment: 'unnamed' }).delete();
    await knex.schema.dropTableIfExists('islet_name_proposals');
    await knex.schema.dropTableIfExists('islet_names');
}
