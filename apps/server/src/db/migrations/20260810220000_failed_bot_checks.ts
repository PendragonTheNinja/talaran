import type { Knex } from 'knex';

// A tally of failed bot checks, purely so it can be looked at.
//
// It gates nothing and costs nothing. Nobody is punished for it and nothing
// reads it except the stats panel, where it sits as a small monument to
// everyone who has confidently typed the wrong number at a sum a child could
// do. Including, eventually, all of us.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'failed_bot_checks'))) {
        await knex.schema.alterTable('players', (t) => {
            t.integer('failed_bot_checks').notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'failed_bot_checks')) {
        await knex.schema.alterTable('players', (t) => t.dropColumn('failed_bot_checks'));
    }
}
