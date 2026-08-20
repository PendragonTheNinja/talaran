import type { Knex } from 'knex';

// Conversion tracking for guest accounts.
//
// is_guest answers "is this a trial right now", which is what the game needs,
// but it is destroyed by the very event worth measuring: an upgrade clears the
// flag, and the account becomes indistinguishable from a normal registration.
// Counting upgrades afterwards would mean grepping logs and hoping nothing was
// rotated away.
//
// was_guest is set once at creation and never cleared, so both numbers stay
// answerable from the database forever:
//
//   guests started    SELECT COUNT(*) FROM players WHERE was_guest;
//   guests converted  SELECT COUNT(*) FROM players WHERE was_guest AND NOT is_guest;
//
// The ratio is the thing to watch. Plenty of guests and few conversions means
// the trial works and the prompt does not. Few guests either way means nobody
// is finding the button on the home page. Those call for opposite fixes, which
// is the whole reason for measuring rather than guessing.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.boolean('was_guest').notNullable().defaultTo(false);
    });

    // Any guest already on the table started as one. Real accounts predate the
    // feature entirely, so false is correct for them and no backfill is needed.
    const updated = await knex('players')
        .where({ is_guest: true })
        .update({ was_guest: true });

    // eslint-disable-next-line no-console
    console.log(`[was_guest] marked ${updated} existing guest account(s)`);

    // Partial index: the reporting queries only ever ask about the small
    // was_guest set, and real accounts should not pay for it.
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS players_was_guest_idx
        ON players (is_guest)
        WHERE was_guest = true
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS players_was_guest_idx');
    await knex.schema.alterTable('players', (table) => {
        table.dropColumn('was_guest');
    });
}
