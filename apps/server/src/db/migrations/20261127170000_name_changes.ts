import type { Knex } from 'knex';

// Name changes (docs/taler-perks-ideas.md; Nathan, 2026-11-27): every player
// may change their name once for free, and again with a name change bought in
// the store, at most once in NAME_CHANGE_COOLDOWN_DAYS (services/nameChange.ts).
//
//   player_name_changes          every change, old and new name, how it was
//                                paid for, and whether staff put it back. The
//                                profile reads it for "formerly", staff for
//                                the history.
//   players.name_change_tokens   name changes bought and not yet used.
//
// What was said and done under the old name (chat lines, ledgers, letters)
// keeps the old name: it is the record of what was.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_name_changes'))) {
        await knex.schema.createTable('player_name_changes', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('old_name', 64).notNullable();
            t.string('new_name', 64).notNullable();
            t.string('paid_with', 10).notNullable();
            t.timestamp('changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('reverted_at', { useTz: true }).nullable();
            t.integer('reverted_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.index(['player_id', 'changed_at']);
        });
        await knex.raw(`ALTER TABLE player_name_changes ADD CONSTRAINT player_name_changes_paid_with CHECK (paid_with IN ('free', 'token'))`);
    }
    if (!(await knex.schema.hasColumn('players', 'name_change_tokens'))) {
        await knex.schema.alterTable('players', (t) => { t.integer('name_change_tokens').notNullable().defaultTo(0); });
        await knex.raw('ALTER TABLE players ADD CONSTRAINT players_name_change_tokens_nonnegative CHECK (name_change_tokens >= 0)');
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'name_change_tokens')) {
        await knex.raw('ALTER TABLE players DROP CONSTRAINT IF EXISTS players_name_change_tokens_nonnegative');
        await knex.schema.alterTable('players', (t) => { t.dropColumn('name_change_tokens'); });
    }
    await knex.schema.dropTableIfExists('player_name_changes');
}
