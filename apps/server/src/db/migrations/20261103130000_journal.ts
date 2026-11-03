import type { Knex } from 'knex';

// The Journal (Nathan, 2026-11-03): a player's own notes, kept on their
// account so they follow them between devices. services/journal.ts holds the
// limits (50 notes, 80-character titles, 2,000-character bodies) and the rules.
// A note's body is plain text; lines starting "- [ ]" or "- [x]" are a
// checklist, and item names are linked when it is read.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_journal_notes'))) {
        await knex.schema.createTable('player_journal_notes', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('title', 80).notNullable();
            t.text('body').notNullable().defaultTo('');
            t.string('color', 12).nullable();
            t.boolean('pinned').notNullable().defaultTo(false);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['player_id', 'updated_at']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_journal_notes');
}
