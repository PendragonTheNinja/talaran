import type { Knex } from 'knex';

/**
 * A session version on every player, carried in every token they are issued.
 *
 * Tokens last thirty days and were checked for a valid signature and nothing
 * else. Banning a player, or resetting a password after an account was taken
 * over, changed the database and left every existing token working: a banned
 * player with a saved token kept trading, chatting and playing, and whoever had
 * stolen an account stayed logged in after the owner reset the password
 * (audit H1). The ban route's force_logout emit was a courtesy that only a
 * cooperative client honoured.
 *
 * Now each token names the version it was issued at, and every request and
 * socket connection compares it with this column. Bumping the column ends every
 * session issued before it, at once: bans, password resets, password changes
 * and "log out of other devices" all do.
 *
 * Existing players start at 0, and a token issued before this shipped carries
 * no version and is read as 0, so nobody is logged out by the deploy itself.
 */
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'token_version'))) {
        await knex.schema.alterTable('players', (t) => {
            t.integer('token_version').unsigned().notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'token_version')) {
        await knex.schema.alterTable('players', (t) => t.dropColumn('token_version'));
    }
}
