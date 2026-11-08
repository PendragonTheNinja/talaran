import type { Knex } from 'knex';

// The language filter's warnings, kept (Nathan, 2026-11-08): every time a
// player's public words were changed for swearing (services/wordFilter.ts
// cleanPublicText), one row, so staff can see who keeps at it although the
// filter softens it. Slurs stay in filter_flags, the review queue; these are
// a history, never reviewed one by one. Shown in the admin player view and,
// for players warned often this week, beside Language Flags.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('filter_warnings'))) {
        await knex.schema.createTable('filter_warnings', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            // Where it was typed: 'chat:world', 'forum:post', 'shop:description', ...
            t.string('place', 40).notNullable();
            // What they typed, before it was changed.
            t.text('text').notNullable();
            t.string('matched', 200).notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['player_id', 'created_at']);
            t.index(['created_at']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('filter_warnings');
}
